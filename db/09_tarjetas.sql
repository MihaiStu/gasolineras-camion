-- =============================================================================
-- 09_tarjetas.sql — Tarjetas de descuento del tenant + sus precios.
--
-- El corazón de la "capa inteligente": cada tenant mete SUS tarjetas, cada una
-- con su mecánica, y el sistema calcula el precio neto real con cada una en cada
-- estación (motor de cálculo: fase siguiente).
--
-- Mecánicas soportadas (tarjeta.tipo):
--   pct_surtidor   — % sobre el precio de surtidor (ej. Galp 16% -> valor=0.16).
--   descuento_fijo — X €/L de descuento sobre surtidor (valor=0.10).
--   precio_lista   — precio fijo por estación (Andamur). Precios en tarjeta_precio.
--   precio_zona    — precio por zona y semana (Radius). Precios en tarjeta_precio.
--
-- Ámbito (dónde aplica): tarjeta.aplica_marcas (array de marcas). NULL/{} = todas.
--   Galp solo en Galp -> {'GALP'}; multimarca -> {'REPSOL','CAMPSA'}; general -> NULL.
--
-- tarjeta_precio guarda los listados (precio_lista / precio_zona). Se rellenará
-- por importación CSV/Excel (fase siguiente). Filas por estación (station_id) o
-- por zona (zona) + semana opcional.
--
-- RLS: privadas por tenant. Idempotente.
-- Aplicar después de 01-08.
-- =============================================================================

SET search_path TO gasoil, public;

-- -----------------------------------------------------------------------------
-- tarjeta — una tarjeta de descuento del tenant.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gasoil.tarjeta (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES gasoil.tenant(id) ON DELETE CASCADE,
  nombre        text NOT NULL,                      -- "Galp Frota", "Andamur", "Radius"
  tipo          text NOT NULL
                  CHECK (tipo IN ('pct_surtidor','descuento_fijo','precio_lista','precio_zona')),
  valor         numeric(7,4),                       -- pct (0.16) o €/L (0.10). NULL en lista/zona.
  aplica_marcas text[],                             -- marcas donde aplica. NULL/{} = todas.
  activa        boolean NOT NULL DEFAULT true,
  nota          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- pct/fijo necesitan valor; lista/zona no.
  CONSTRAINT tarjeta_valor_chk CHECK (
    (tipo IN ('pct_surtidor','descuento_fijo') AND valor IS NOT NULL)
    OR tipo IN ('precio_lista','precio_zona')
  )
);
COMMENT ON TABLE  gasoil.tarjeta IS 'Tarjeta de descuento del tenant. tipo define la mecánica; aplica_marcas el ámbito.';
COMMENT ON COLUMN gasoil.tarjeta.valor IS 'pct_surtidor: fracción (0.16=16%). descuento_fijo: €/L. NULL para listados.';
COMMENT ON COLUMN gasoil.tarjeta.aplica_marcas IS 'Marcas (station.marca) donde aplica. NULL o {} = cualquier estación.';

CREATE INDEX IF NOT EXISTS idx_tarjeta_tenant ON gasoil.tarjeta(tenant_id);

-- -----------------------------------------------------------------------------
-- tarjeta_precio — precios de listado (precio_lista por estación / precio_zona).
-- Se carga por importación. tenant_id desnormalizado para RLS simple.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gasoil.tarjeta_precio (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarjeta_id  uuid NOT NULL REFERENCES gasoil.tarjeta(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES gasoil.tenant(id) ON DELETE CASCADE,
  producto    text NOT NULL DEFAULT 'gasoleo_a',
  station_id  uuid REFERENCES gasoil.station(id) ON DELETE CASCADE,  -- precio_lista
  zona        text,                                                  -- precio_zona
  precio      numeric(6,3) NOT NULL,
  semana      date,                                                  -- lunes de la semana; NULL = siempre
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tarjeta_precio_ambito_chk CHECK (station_id IS NOT NULL OR zona IS NOT NULL)
);
COMMENT ON TABLE gasoil.tarjeta_precio IS 'Precios de listado de una tarjeta (precio_lista por estación / precio_zona por zona+semana). Carga por import.';

CREATE INDEX IF NOT EXISTS idx_tarjeta_precio_tarjeta ON gasoil.tarjeta_precio(tarjeta_id);
CREATE INDEX IF NOT EXISTS idx_tarjeta_precio_tenant  ON gasoil.tarjeta_precio(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tarjeta_precio_station ON gasoil.tarjeta_precio(station_id);
CREATE INDEX IF NOT EXISTS idx_tarjeta_precio_zona    ON gasoil.tarjeta_precio(zona, semana);

-- -----------------------------------------------------------------------------
-- RLS: privadas por tenant.
-- -----------------------------------------------------------------------------
ALTER TABLE gasoil.tarjeta        ENABLE ROW LEVEL SECURITY;
ALTER TABLE gasoil.tarjeta_precio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tarjeta_all ON gasoil.tarjeta;
CREATE POLICY tarjeta_all ON gasoil.tarjeta
  FOR ALL TO authenticated
  USING (tenant_id = gasoil.current_tenant_id())
  WITH CHECK (tenant_id = gasoil.current_tenant_id());

DROP POLICY IF EXISTS tarjeta_precio_all ON gasoil.tarjeta_precio;
CREATE POLICY tarjeta_precio_all ON gasoil.tarjeta_precio
  FOR ALL TO authenticated
  USING (tenant_id = gasoil.current_tenant_id())
  WITH CHECK (tenant_id = gasoil.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON gasoil.tarjeta, gasoil.tarjeta_precio TO authenticated;
GRANT ALL ON gasoil.tarjeta, gasoil.tarjeta_precio TO service_role;
