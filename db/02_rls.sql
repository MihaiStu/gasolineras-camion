-- =============================================================================
-- 02_rls.sql — Row Level Security (aislamiento multi-tenant)
-- Postgres 15 / Supabase. Ejecutar DESPUÉS de 01_schema.sql.
--
-- Decisión de aislamiento (documentada):
--   El tenant_id del usuario autenticado se obtiene del JWT de Supabase mediante
--   (auth.jwt() ->> 'tenant_id')::uuid. Esto requiere que el tenant_id se inyecte
--   como custom claim en el token (vía Auth Hook / custom_access_token_hook de
--   Supabase, configurado fuera de este SQL). Es el patrón recomendado porque
--   evita un JOIN contra gasoil.profile en CADA política (mejor rendimiento y sin
--   recursión de RLS sobre profile).
--
--   Para profile usamos comparación directa por id (auth.uid()) además del
--   tenant, porque consultar el propio tenant_id desde dentro de la política de
--   profile crearía recursión. Se define una función helper SECURITY DEFINER
--   gasoil.current_tenant_id() que lee el claim, con fallback a profile por si el
--   claim no estuviera presente todavía.
--
-- Reglas de negocio:
--   - tenant_station, truck, refuel, profile  -> privadas por tenant.
--   - station, price                          -> lectura pública (catálogo
--                                                compartido), escritura solo service_role.
--   - tenant                                  -> el usuario solo ve/edita su propio tenant.
-- =============================================================================

SET search_path TO gasoil, public;

-- -----------------------------------------------------------------------------
-- Helper: tenant_id del usuario actual.
-- Prioriza el claim del JWT; si no está, lo resuelve desde profile.
-- SECURITY DEFINER + search_path fijo para evitar recursión de RLS y escalada.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gasoil.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = gasoil, public
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id', '')::uuid,
    (SELECT p.tenant_id FROM gasoil.profile p WHERE p.id = auth.uid())
  );
$$;
COMMENT ON FUNCTION gasoil.current_tenant_id() IS 'Devuelve el tenant_id del usuario autenticado: primero del claim JWT, si no, desde profile. Usada por las políticas RLS.';

-- =============================================================================
-- Habilitar RLS en todas las tablas
-- =============================================================================
ALTER TABLE gasoil.tenant         ENABLE ROW LEVEL SECURITY;
ALTER TABLE gasoil.profile        ENABLE ROW LEVEL SECURITY;
ALTER TABLE gasoil.truck          ENABLE ROW LEVEL SECURITY;
ALTER TABLE gasoil.station        ENABLE ROW LEVEL SECURITY;
ALTER TABLE gasoil.tenant_station ENABLE ROW LEVEL SECURITY;
ALTER TABLE gasoil.price          ENABLE ROW LEVEL SECURITY;
ALTER TABLE gasoil.refuel         ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- profile — cada usuario ve/edita SU fila; lectura de compañeros del mismo tenant.
-- =============================================================================
DROP POLICY IF EXISTS profile_select ON gasoil.profile;
CREATE POLICY profile_select ON gasoil.profile
  FOR SELECT TO authenticated
  USING (tenant_id = gasoil.current_tenant_id());
COMMENT ON POLICY profile_select ON gasoil.profile IS 'Un usuario ve los perfiles de su mismo tenant (p.ej. el gestor ve a sus conductores).';

DROP POLICY IF EXISTS profile_update ON gasoil.profile;
CREATE POLICY profile_update ON gasoil.profile
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
COMMENT ON POLICY profile_update ON gasoil.profile IS 'Cada usuario solo puede modificar su propio perfil.';

-- INSERT de profile lo hace normalmente un trigger/onboarding con service_role;
-- no se abre a authenticated para no permitir auto-asignarse un tenant ajeno.

-- =============================================================================
-- tenant — el usuario solo ve/edita su propio tenant.
-- =============================================================================
DROP POLICY IF EXISTS tenant_select ON gasoil.tenant;
CREATE POLICY tenant_select ON gasoil.tenant
  FOR SELECT TO authenticated
  USING (id = gasoil.current_tenant_id());
COMMENT ON POLICY tenant_select ON gasoil.tenant IS 'El usuario solo ve la cuenta (tenant) a la que pertenece.';

DROP POLICY IF EXISTS tenant_update ON gasoil.tenant;
CREATE POLICY tenant_update ON gasoil.tenant
  FOR UPDATE TO authenticated
  USING (id = gasoil.current_tenant_id())
  WITH CHECK (id = gasoil.current_tenant_id());
COMMENT ON POLICY tenant_update ON gasoil.tenant IS 'El usuario (gestor) puede actualizar datos de su propio tenant. El alta de tenants la hace service_role.';

-- =============================================================================
-- truck — privada por tenant (CRUD completo dentro del tenant).
-- =============================================================================
DROP POLICY IF EXISTS truck_all ON gasoil.truck;
CREATE POLICY truck_all ON gasoil.truck
  FOR ALL TO authenticated
  USING (tenant_id = gasoil.current_tenant_id())
  WITH CHECK (tenant_id = gasoil.current_tenant_id());
COMMENT ON POLICY truck_all ON gasoil.truck IS 'Los camiones son privados del tenant: solo sus usuarios pueden leer/crear/editar/borrar.';

-- =============================================================================
-- tenant_station — privada por tenant.
-- =============================================================================
DROP POLICY IF EXISTS tenant_station_all ON gasoil.tenant_station;
CREATE POLICY tenant_station_all ON gasoil.tenant_station
  FOR ALL TO authenticated
  USING (tenant_id = gasoil.current_tenant_id())
  WITH CHECK (tenant_id = gasoil.current_tenant_id());
COMMENT ON POLICY tenant_station_all ON gasoil.tenant_station IS 'Overrides por tenant (pactadas, descuentos, notas) privados de cada cuenta.';

-- =============================================================================
-- refuel — privada por tenant.
-- =============================================================================
DROP POLICY IF EXISTS refuel_all ON gasoil.refuel;
CREATE POLICY refuel_all ON gasoil.refuel
  FOR ALL TO authenticated
  USING (tenant_id = gasoil.current_tenant_id())
  WITH CHECK (tenant_id = gasoil.current_tenant_id());
COMMENT ON POLICY refuel_all ON gasoil.refuel IS 'Repostajes (y por tanto el ahorro) privados del tenant. Nadie ve los datos de otra cuenta.';

-- =============================================================================
-- station — catálogo compartido: lectura pública, escritura solo service_role.
-- =============================================================================
DROP POLICY IF EXISTS station_read_public ON gasoil.station;
CREATE POLICY station_read_public ON gasoil.station
  FOR SELECT TO anon, authenticated
  USING (true);
COMMENT ON POLICY station_read_public ON gasoil.station IS 'Catálogo de estaciones legible por todos (anon y authenticated). Necesario para la calculadora pública y el mapa.';

-- La escritura de station NO tiene política para anon/authenticated => denegada.
-- service_role hace BYPASS de RLS, por lo que el job de ingesta puede escribir.

-- =============================================================================
-- price — cache compartida: lectura pública, escritura solo service_role.
-- =============================================================================
DROP POLICY IF EXISTS price_read_public ON gasoil.price;
CREATE POLICY price_read_public ON gasoil.price
  FOR SELECT TO anon, authenticated
  USING (true);
COMMENT ON POLICY price_read_public ON gasoil.price IS 'Precios legibles por todos. La escritura/refresco diario lo hace el job con service_role (bypass RLS).';

-- price: sin política de escritura para anon/authenticated => solo service_role escribe.

-- =============================================================================
-- Permisos de schema/objeto (Supabase usa roles anon, authenticated, service_role)
-- RLS filtra filas, pero hay que conceder USAGE/privilegios de tabla primero.
-- =============================================================================
GRANT USAGE ON SCHEMA gasoil TO anon, authenticated, service_role;

-- Lectura pública del catálogo
GRANT SELECT ON gasoil.station, gasoil.price TO anon, authenticated;

-- Tablas privadas: privilegios a authenticated (RLS hace el filtrado fino)
GRANT SELECT, INSERT, UPDATE, DELETE
  ON gasoil.truck, gasoil.tenant_station, gasoil.refuel TO authenticated;
GRANT SELECT, UPDATE ON gasoil.tenant TO authenticated;
GRANT SELECT, UPDATE ON gasoil.profile TO authenticated;

-- service_role tiene todos los privilegios y bypassa RLS (ingesta/onboarding/jobs)
GRANT ALL ON ALL TABLES IN SCHEMA gasoil TO service_role;
