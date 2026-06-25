-- =============================================================================
-- 06_savings_demo.sql — Vista DEMO pública del contador de ahorro.
--
-- Para la página de reporting de MUESTRA (public/cuenta-demo.html) que aún no
-- tiene login. Expone SOLO los datos del tenant demo AdmiLogistic, legible por
-- `anon`. Así el front demo lee con la anon key SIN necesitar service key (que
-- NUNCA debe ir en el cliente porque salta toda la RLS).
--
-- A diferencia de 05 (security_invoker, privadas), esta corre como SECURITY
-- DEFINER (por defecto, owner = postgres) y bypassa RLS, pero está acotada por
-- WHERE tenant_id = <demo> a un único tenant de muestra. No filtra datos reales.
--
-- Cuando exista auth real, el reporting consumirá las vistas privadas de 05 y
-- esta vista demo puede borrarse: DROP VIEW gasoil.savings_demo;
-- Idempotente.
-- =============================================================================

SET search_path TO gasoil, public;

CREATE OR REPLACE VIEW gasoil.savings_demo AS
SELECT
  k.matricula,
  date_trunc('month', r.ts)::date          AS mes,
  count(*)                                  AS repostajes,
  sum(r.litros)                             AS litros,
  sum(r.ahorro_eur)                         AS ahorro_eur,
  round(avg(r.precio_pagado), 3)            AS precio_pagado_medio,
  round(avg(r.precio_referencia), 3)        AS precio_referencia_medio
FROM gasoil.refuel r
JOIN gasoil.truck k ON k.id = r.truck_id
WHERE r.tenant_id = '00000000-0000-0000-0000-000000000001'   -- AdmiLogistic (demo)
  AND r.ts >= date_trunc('month', now())
GROUP BY k.matricula, date_trunc('month', r.ts);

COMMENT ON VIEW gasoil.savings_demo IS
  'DEMO pública: ahorro del mes en curso por camión, SOLO del tenant demo AdmiLogistic. Legible por anon para la página de reporting de muestra. Borrar cuando haya auth real.';

GRANT SELECT ON gasoil.savings_demo TO anon, authenticated;
