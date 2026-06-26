-- =============================================================================
-- 11_mejor_tarjeta.sql — Motor "mejor tarjeta por estación" (capa inteligente).
--
-- Para cada estación calcula el PRECIO NETO con cada tarjeta del tenant y elige
-- la más barata. Es lo que demuestra la diferencia real: en un sitio puedes
-- repostar con 3 tarjetas pero una sale más rentable.
--
-- Neto por mecánica:
--   pct_surtidor   : precio_surtidor * (1 - valor)      (aplica según aplica_marcas)
--   descuento_fijo : precio_surtidor - valor            (aplica según aplica_marcas)
--   precio_lista   : precio del listado por estación     (tarjeta_precio.station_id)
--   precio_zona    : precio del listado por zona/semana  (tarjeta_precio.zona)
-- precio_surtidor = gasoil.price (gasoleo_a, oficial MINETUR).
--
-- security_invoker: respeta la RLS de tarjeta/tarjeta_precio -> cada tenant solo
-- ve el cálculo con SUS tarjetas. station/price son públicas.
-- Idempotente. Aplicar tras 01-10.
-- =============================================================================

SET search_path TO gasoil, public;

-- Neto de CADA tarjeta aplicable en CADA estación
CREATE OR REPLACE VIEW gasoil.precio_tarjeta_estacion
WITH (security_invoker = true) AS
WITH surtidor AS (
  SELECT station_id, precio FROM gasoil.price WHERE producto = 'gasoleo_a'
)
-- % sobre surtidor
SELECT t.tenant_id, s.id AS station_id, t.id AS tarjeta_id, t.nombre, t.tipo,
       round((su.precio * (1 - t.valor))::numeric, 3) AS neto
FROM gasoil.tarjeta t
JOIN gasoil.station s ON (t.aplica_marcas IS NULL OR cardinality(t.aplica_marcas) = 0 OR s.marca = ANY (t.aplica_marcas))
JOIN surtidor su ON su.station_id = s.id
WHERE t.tipo = 'pct_surtidor' AND t.activa
UNION ALL
-- descuento fijo €/L
SELECT t.tenant_id, s.id, t.id, t.nombre, t.tipo,
       round((su.precio - t.valor)::numeric, 3)
FROM gasoil.tarjeta t
JOIN gasoil.station s ON (t.aplica_marcas IS NULL OR cardinality(t.aplica_marcas) = 0 OR s.marca = ANY (t.aplica_marcas))
JOIN surtidor su ON su.station_id = s.id
WHERE t.tipo = 'descuento_fijo' AND t.activa
UNION ALL
-- precio de listado por estación (Andamur)
SELECT t.tenant_id, tp.station_id, t.id, t.nombre, t.tipo, tp.precio
FROM gasoil.tarjeta t
JOIN gasoil.tarjeta_precio tp ON tp.tarjeta_id = t.id AND tp.station_id IS NOT NULL
WHERE t.tipo = 'precio_lista' AND t.activa
UNION ALL
-- precio por zona/semana (Radius)
SELECT t.tenant_id, s.id, t.id, t.nombre, t.tipo, tp.precio
FROM gasoil.tarjeta t
JOIN gasoil.tarjeta_precio tp ON tp.tarjeta_id = t.id AND tp.zona IS NOT NULL
   AND (tp.semana IS NULL OR tp.semana = date_trunc('week', now())::date)
JOIN gasoil.station s ON s.zona = tp.zona
WHERE t.tipo = 'precio_zona' AND t.activa;

COMMENT ON VIEW gasoil.precio_tarjeta_estacion IS 'Neto de cada tarjeta del tenant en cada estación. Base del comparador. security_invoker (RLS por tenant).';

-- La MEJOR tarjeta por estación (la de menor neto)
CREATE OR REPLACE VIEW gasoil.mejor_tarjeta_estacion
WITH (security_invoker = true) AS
SELECT DISTINCT ON (station_id)
  tenant_id, station_id, tarjeta_id,
  nombre AS mejor_tarjeta, tipo AS mejor_tipo, neto AS mejor_neto
FROM gasoil.precio_tarjeta_estacion
WHERE neto IS NOT NULL
ORDER BY station_id, neto ASC;

COMMENT ON VIEW gasoil.mejor_tarjeta_estacion IS 'Tarjeta más barata por estación para el tenant. Lo consume el mapa.';

GRANT SELECT ON gasoil.precio_tarjeta_estacion TO authenticated;
GRANT SELECT ON gasoil.mejor_tarjeta_estacion  TO authenticated;
