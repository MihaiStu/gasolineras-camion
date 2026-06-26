-- =============================================================================
-- 10_station_geocoding.sql — Metadatos de geolocalización de estaciones.
--
-- Las estaciones deben estar BIEN georreferenciadas (en el surtidor real, no en
-- el centro del pueblo). station.lat/lng ya existen; esto añade la trazabilidad
-- de DÓNDE salió cada coordenada y su precisión, para poder revisar/corregir:
--
--   geo_fuente — 'nominatim' (geocodificado por nombre OSM), 'minetur', 'manual'
--                (corrección a mano, NO se sobrescribe), 'seed' (localidad, malo).
--   geo_tipo   — pista de precisión: tipo OSM ('fuel','services'...) o 'localidad'.
--   geo_at     — cuándo se geolocalizó.
--
-- El geocodificador (scripts/geocode-stations.mjs) respeta geo_fuente='manual'.
-- Idempotente.
-- =============================================================================

SET search_path TO gasoil, public;

ALTER TABLE gasoil.station ADD COLUMN IF NOT EXISTS geo_fuente text;
ALTER TABLE gasoil.station ADD COLUMN IF NOT EXISTS geo_tipo   text;
ALTER TABLE gasoil.station ADD COLUMN IF NOT EXISTS geo_at     timestamptz;

COMMENT ON COLUMN gasoil.station.geo_fuente IS 'Origen de lat/lng: nominatim | minetur | manual | seed. manual no se sobrescribe.';
COMMENT ON COLUMN gasoil.station.geo_tipo   IS 'Precisión: tipo OSM (fuel/services/...) o "localidad" si solo se geocodificó el municipio.';

-- Las coordenadas que venían del seed eran a nivel de localidad: márcalas como tales
-- para que el geocodificador las reemplace por la posición real del surtidor.
UPDATE gasoil.station
SET geo_fuente = 'seed'
WHERE geo_fuente IS NULL AND lat IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_station_geo_fuente ON gasoil.station (geo_fuente);
