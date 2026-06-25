-- =============================================================================
-- 07_auth_signup.sql — Alta self-serve: cada registro crea EMPRESA + GESTOR.
--
-- Cuando alguien se registra (Supabase Auth inserta en auth.users), este trigger
-- crea automáticamente:
--   1. un tenant (la empresa/flota) con el nombre indicado en el registro, y
--   2. un profile (rol 'gestor') ligado a ese tenant y al auth.users.id.
--
-- Así el alta no necesita intervención humana (Fase 3 del diseño). El que se
-- registra es el gestor de su propia cuenta nueva; luego podrá invitar conductores
-- al mismo tenant (flujo aparte, futuro).
--
-- Datos del registro: se pasan en options.data del signup (raw_user_meta_data):
--   company_name -> tenant.nombre   (fallback: parte local del email)
--   tipo         -> tenant.tipo     ('autonomo' | 'flota' | 'whitelabel'; default autonomo)
--   nombre       -> profile.nombre  (nombre de la persona)
--
-- SECURITY DEFINER: corre como owner (postgres) para poder escribir en gasoil.*
-- saltando la RLS (en el momento del alta el usuario aún no tiene sesión/tenant).
-- Idempotente: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
-- =============================================================================

CREATE OR REPLACE FUNCTION gasoil.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = gasoil, public
AS $$
DECLARE
  v_tenant_id uuid;
  v_company   text;
  v_tipo      text;
BEGIN
  -- Evita duplicar si el perfil ya existe (re-ejecución / usuarios ya migrados).
  IF EXISTS (SELECT 1 FROM gasoil.profile WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_company := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'company_name'), ''),
    split_part(NEW.email, '@', 1)
  );
  v_tipo := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'tipo', ''), 'autonomo');
  IF v_tipo NOT IN ('autonomo', 'flota', 'whitelabel') THEN
    v_tipo := 'autonomo';
  END IF;

  INSERT INTO gasoil.tenant (nombre, tipo, plan)
  VALUES (v_company, v_tipo, 'free')
  RETURNING id INTO v_tenant_id;

  INSERT INTO gasoil.profile (id, tenant_id, rol, nombre, email)
  VALUES (
    NEW.id,
    v_tenant_id,
    'gestor',
    NULLIF(trim(NEW.raw_user_meta_data ->> 'nombre'), ''),
    NEW.email
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION gasoil.handle_new_user() IS
  'Trigger de alta: por cada auth.users nuevo crea su tenant (empresa) y su profile (gestor). Self-serve, sin intervención humana.';

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION gasoil.handle_new_user();
