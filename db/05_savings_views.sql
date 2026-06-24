-- =============================================================================
-- 05_savings_views.sql — Vistas del CONTADOR DE AHORRO (la función estrella).
--
-- Agregan gasoil.refuel para responder "cuánto te has ahorrado":
--   - monthly_savings        : ahorro por tenant + camión + mes (detalle/reporting).
--   - savings_current_month  : rollup del MES EN CURSO por tenant ("este mes: 387 €").
--
-- SEGURIDAD (crítico multi-tenant):
--   En Postgres las vistas se ejecutan por defecto como SECURITY DEFINER (con los
--   permisos del propietario), lo que SALTARÍA la RLS de refuel y dejaría a un
--   tenant ver el ahorro de otro. Se crean con `security_invoker = true` (PG15+)
--   para que la consulta corra con los permisos del usuario que llama y la política
--   refuel_all (tenant_id = current_tenant_id()) filtre correctamente.
--
-- Idempotente: CREATE OR REPLACE VIEW + grants repetibles.
-- Aplicar después de 01-04 (ver db/README.md).
-- =============================================================================

SET search_path TO gasoil, public;

-- -----------------------------------------------------------------------------
-- monthly_savings — una fila por (tenant, camión, mes). Base del reporting.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gasoil.monthly_savings
WITH (security_invoker = true) AS
SELECT
  r.tenant_id,
  r.truck_id,
  date_trunc('month', r.ts)::date          AS mes,
  count(*)                                  AS repostajes,
  sum(r.litros)                             AS litros,
  sum(r.ahorro_eur)                         AS ahorro_eur,
  round(avg(r.precio_pagado), 3)            AS precio_pagado_medio,
  round(avg(r.precio_referencia), 3)        AS precio_referencia_medio
FROM gasoil.refuel r
GROUP BY r.tenant_id, r.truck_id, date_trunc('month', r.ts);

COMMENT ON VIEW gasoil.monthly_savings IS
  'Ahorro agregado por tenant + camión + mes. security_invoker: respeta la RLS de refuel (aislamiento por tenant).';

-- -----------------------------------------------------------------------------
-- savings_current_month — rollup del mes en curso por tenant.
-- El número que se enseña en la cuenta: "este mes te has ahorrado X € en N camiones".
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gasoil.savings_current_month
WITH (security_invoker = true) AS
SELECT
  r.tenant_id,
  count(*)                       AS repostajes,
  count(DISTINCT r.truck_id)     AS camiones,
  sum(r.litros)                  AS litros,
  sum(r.ahorro_eur)              AS ahorro_eur
FROM gasoil.refuel r
WHERE r.ts >= date_trunc('month', now())
GROUP BY r.tenant_id;

COMMENT ON VIEW gasoil.savings_current_month IS
  'Ahorro del mes en curso por tenant. Es el argumento de renovación que se muestra en la cuenta.';

-- -----------------------------------------------------------------------------
-- Permisos: solo authenticated. anon NO ve ahorro (es dato privado de cuenta).
-- La RLS de refuel (vía security_invoker) hace el filtrado fino por tenant.
-- -----------------------------------------------------------------------------
GRANT SELECT ON gasoil.monthly_savings       TO authenticated;
GRANT SELECT ON gasoil.savings_current_month TO authenticated;
