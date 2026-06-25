-- =============================================================================
-- 08_auth_token_hook.sql — Custom Access Token Hook: tenant_id en el JWT.
--
-- Inyecta el claim `tenant_id` en el access token de cada usuario al emitirlo.
-- Así `gasoil.current_tenant_id()` lo lee directo del JWT (vía rápida) en vez de
-- hacer un JOIN a `profile` en cada consulta (fallback). Misma seguridad, menos
-- trabajo por query.
--
-- Requiere activar en GoTrue (docker-compose del servidor):
--   GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED: "true"
--   GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_URI: "pg-functions://postgres/gasoil/custom_access_token_hook"
--
-- Idempotente.
-- =============================================================================

-- SECURITY DEFINER: GoTrue invoca el hook como supabase_auth_admin, que NO puede
-- leer gasoil.profile (tiene RLS y no es rol authenticated). Corriendo como owner
-- (postgres) el SELECT bypassa RLS y encuentra el tenant. Sin esto el hook corre
-- pero no añade el claim (0 filas por RLS).
CREATE OR REPLACE FUNCTION gasoil.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = gasoil, public
AS $$
DECLARE
  v_tenant uuid;
  v_claims jsonb;
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM gasoil.profile
  WHERE id = (event ->> 'user_id')::uuid;

  v_claims := event -> 'claims';
  IF v_tenant IS NOT NULL THEN
    v_claims := jsonb_set(v_claims, '{tenant_id}', to_jsonb(v_tenant::text));
  END IF;

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;

COMMENT ON FUNCTION gasoil.custom_access_token_hook(jsonb) IS
  'Auth Hook de Supabase: añade el claim tenant_id al JWT. Lo invoca GoTrue como supabase_auth_admin al emitir el token.';

-- GoTrue ejecuta el hook como el rol supabase_auth_admin.
GRANT USAGE ON SCHEMA gasoil TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION gasoil.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT SELECT ON gasoil.profile TO supabase_auth_admin;

-- Que nadie más pueda invocar el hook directamente.
REVOKE EXECUTE ON FUNCTION gasoil.custom_access_token_hook(jsonb) FROM authenticated, anon, public;
