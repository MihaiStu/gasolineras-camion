-- =============================================================================
-- 04_station_address_columns.sql — Desnormaliza dirección en columnas propias.
--
-- El seed inicial (03) guardó la dirección aplanada en station.direccion
-- ("VIA · LOCALIDAD (PROVINCIA)") y la comunidad en tenant_station.nota.
-- El front necesita via/localidad/provincia/zona por separado (filtros, zonas).
-- Esta migración añade esas columnas y las rellena parseando los datos existentes.
-- Idempotente: ADD COLUMN IF NOT EXISTS + UPDATE.
-- =============================================================================

SET search_path TO gasoil, public;

ALTER TABLE gasoil.station ADD COLUMN IF NOT EXISTS via       text;
ALTER TABLE gasoil.station ADD COLUMN IF NOT EXISTS localidad text;
ALTER TABLE gasoil.station ADD COLUMN IF NOT EXISTS provincia text;
ALTER TABLE gasoil.station ADD COLUMN IF NOT EXISTS zona      text;  -- comunidad autónoma

-- via = parte antes del ' · '
UPDATE gasoil.station
SET via = NULLIF(trim(split_part(direccion, ' · ', 1)), '')
WHERE direccion IS NOT NULL AND via IS NULL;

-- localidad = parte tras ' · ' quitando el "(provincia)" final
UPDATE gasoil.station
SET localidad = NULLIF(trim(regexp_replace(split_part(direccion, ' · ', 2), '\s*\([^)]*\)\s*$', '')), '')
WHERE direccion IS NOT NULL AND localidad IS NULL;

-- provincia = lo de dentro del paréntesis
UPDATE gasoil.station
SET provincia = (regexp_match(split_part(direccion, ' · ', 2), '\(([^)]+)\)'))[1]
WHERE direccion IS NOT NULL AND provincia IS NULL;

-- zona = comunidad autónoma, guardada en tenant_station.nota ("Red pactada · vía ... · CCAA")
UPDATE gasoil.station s
SET zona = NULLIF(trim(split_part(ts.nota, ' · ', -1)), '')
FROM gasoil.tenant_station ts
WHERE ts.station_id = s.id
  AND ts.nota IS NOT NULL
  AND s.zona IS NULL;

CREATE INDEX IF NOT EXISTS idx_station_provincia ON gasoil.station (provincia);
CREATE INDEX IF NOT EXISTS idx_station_zona      ON gasoil.station (zona);
