-- =============================================================================
-- 01_schema.sql — Esquema base del SaaS de repostaje de camiones (Fase 1)
-- Postgres 15 / Supabase. Todo vive en el schema dedicado `gasoil` (NO public).
--
-- Modelo de datos según sección 4 de docs/DISENO-SAAS.md:
--   tenant, profile, truck, station, tenant_station, price, refuel
--
-- Convenciones:
--   - PKs uuid con gen_random_uuid() (extensión pgcrypto, presente en Supabase).
--   - Fechas timestamptz, por defecto now().
--   - Precios numeric(6,3) (ej. 1.629). Litros/consumos numeric.
--   - profile.id referencia auth.users(id) de Supabase Auth.
-- Idempotente: CREATE ... IF NOT EXISTS en todo lo posible.
-- =============================================================================

-- Schema dedicado
CREATE SCHEMA IF NOT EXISTS gasoil;

-- gen_random_uuid() / md5 (pgcrypto ya viene en Supabase, garantizamos su carga)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

SET search_path TO gasoil, public;

-- -----------------------------------------------------------------------------
-- tenant — Cuenta cliente. Una flota, un autónomo o un white-label.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gasoil.tenant (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre             text NOT NULL,
  tipo               text NOT NULL DEFAULT 'autonomo'
                       CHECK (tipo IN ('autonomo', 'flota', 'whitelabel')),
  plan               text NOT NULL DEFAULT 'free'
                       CHECK (plan IN ('free', 'pro', 'flota')),
  stripe_customer_id text,
  branding_json      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- logo/colores/dominio (Fase 5)
  created_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE  gasoil.tenant IS 'Cuenta cliente: flota, autónomo o white-label. Raíz del aislamiento multi-tenant.';
COMMENT ON COLUMN gasoil.tenant.tipo IS 'autonomo | flota | whitelabel';
COMMENT ON COLUMN gasoil.tenant.plan IS 'free | pro | flota (gating de Stripe, Fase 3)';
COMMENT ON COLUMN gasoil.tenant.branding_json IS 'Branding por tenant para white-label (Fase 5).';

-- -----------------------------------------------------------------------------
-- profile — Usuario de la app. 1:1 con auth.users de Supabase, pertenece a un tenant.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gasoil.profile (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES gasoil.tenant(id) ON DELETE CASCADE,
  rol        text NOT NULL DEFAULT 'conductor'
               CHECK (rol IN ('gestor', 'conductor')),
  nombre     text,
  email      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE  gasoil.profile IS 'Perfil de usuario. id = auth.users.id. Vincula cada usuario a su tenant y rol.';
COMMENT ON COLUMN gasoil.profile.rol IS 'gestor (panel/admin) | conductor (vista operativa).';

CREATE INDEX IF NOT EXISTS idx_profile_tenant ON gasoil.profile(tenant_id);

-- -----------------------------------------------------------------------------
-- truck — Camión del tenant (consumo, depósito, tarjetas/descuentos del cliente).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gasoil.truck (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES gasoil.tenant(id) ON DELETE CASCADE,
  matricula            text NOT NULL,
  consumo_l_100km      numeric(6,2),     -- p.ej. 32.50 l/100km
  capacidad_deposito_l numeric(7,1),     -- p.ej. 900.0 litros
  tarjetas_json        jsonb NOT NULL DEFAULT '[]'::jsonb,  -- tarjetas y descuentos del cliente
  created_at           timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE  gasoil.truck IS 'Camión de un tenant. tarjetas_json guarda tarjetas de flota y descuentos negociados.';
COMMENT ON COLUMN gasoil.truck.tarjetas_json IS 'Array JSON de tarjetas/descuentos del cliente (e.g. [{"tarjeta":"Solred","dto_eur_l":0.08}]).';

CREATE INDEX IF NOT EXISTS idx_truck_tenant ON gasoil.truck(tenant_id);

-- -----------------------------------------------------------------------------
-- station — Catálogo GLOBAL de estaciones (compartido entre todos los tenants).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gasoil.station (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ideess              text,             -- código EESS de MINETUR (NULL para red pactada sin código)
  nombre              text NOT NULL,
  marca               text,             -- ANDAMUR, GALP, REPSOL... (NULL si no derivable)
  lat                 numeric(9,6),     -- pendiente de geocodificar con precisión de surtidor
  lng                 numeric(9,6),
  direccion           text,
  truck_ok            boolean NOT NULL DEFAULT false,  -- apta para camión
  gasoleo_profesional boolean NOT NULL DEFAULT false,
  acceso_40t          boolean NOT NULL DEFAULT false,
  autovia             boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE  gasoil.station IS 'Catálogo global de estaciones (lectura pública). Compartido entre tenants; los overrides por tenant van en tenant_station.';
COMMENT ON COLUMN gasoil.station.ideess IS 'Código EESS de MINETUR; NULL para estaciones de red pactada sin código asignado.';
COMMENT ON COLUMN gasoil.station.lat IS 'Latitud. En el seed inicial tiene precisión de localidad; geocodificar después.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_station_ideess ON gasoil.station(ideess) WHERE ideess IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_station_latlng ON gasoil.station(lat, lng);
CREATE INDEX IF NOT EXISTS idx_station_marca  ON gasoil.station(marca);

-- -----------------------------------------------------------------------------
-- tenant_station — Override por tenant sobre una estación (pactada, descuento, nota).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gasoil.tenant_station (
  tenant_id       uuid NOT NULL REFERENCES gasoil.tenant(id) ON DELETE CASCADE,
  station_id      uuid NOT NULL REFERENCES gasoil.station(id) ON DELETE CASCADE,
  es_pactada      boolean NOT NULL DEFAULT false,
  descuento_eur_l numeric(6,3),     -- descuento negociado por este tenant en esta estación
  nota            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, station_id)
);
COMMENT ON TABLE  gasoil.tenant_station IS 'Relación tenant↔estación: marca red pactada, descuento y notas privadas del cliente.';
COMMENT ON COLUMN gasoil.tenant_station.descuento_eur_l IS 'Descuento €/l negociado por el tenant para esta estación.';

CREATE INDEX IF NOT EXISTS idx_tenant_station_station ON gasoil.tenant_station(station_id);

-- -----------------------------------------------------------------------------
-- price — CACHE DIARIA de precios de MINETUR. SIN histórico: se pisa cada día.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gasoil.price (
  station_id    uuid NOT NULL REFERENCES gasoil.station(id) ON DELETE CASCADE,
  producto      text NOT NULL DEFAULT 'gasoleo_a',  -- gasoleo_a | gasoleo_premium | ...
  precio        numeric(6,3) NOT NULL,
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (station_id, producto)
);
COMMENT ON TABLE  gasoil.price IS 'Cache de precios (NO histórico). El job diario la refresca y la PISA. PK (station_id, producto) garantiza una fila por estación/producto.';
COMMENT ON COLUMN gasoil.price.actualizado_at IS 'Marca de la última actualización (refresco diario).';

CREATE INDEX IF NOT EXISTS idx_price_station_producto ON gasoil.price(station_id, producto);

-- -----------------------------------------------------------------------------
-- refuel — Repostajes registrados. Base del contador de ahorro (sección 5).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gasoil.refuel (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES gasoil.tenant(id) ON DELETE CASCADE,
  truck_id          uuid REFERENCES gasoil.truck(id) ON DELETE SET NULL,
  station_id        uuid REFERENCES gasoil.station(id) ON DELETE SET NULL,
  litros            numeric(8,2) NOT NULL,
  precio_pagado     numeric(6,3) NOT NULL,
  precio_referencia numeric(6,3) NOT NULL,
  -- ahorro = (precio_referencia - precio_pagado) * litros  (columna generada)
  ahorro_eur        numeric(10,2) GENERATED ALWAYS AS
                      (round((precio_referencia - precio_pagado) * litros, 2)) STORED,
  ts                timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE  gasoil.refuel IS 'Repostaje registrado por un tenant. ahorro_eur se calcula automáticamente (precio_ref - precio_pagado) * litros.';
COMMENT ON COLUMN gasoil.refuel.precio_referencia IS 'Precio medio de mercado de referencia (MINETUR) en el momento del repostaje.';

CREATE INDEX IF NOT EXISTS idx_refuel_tenant     ON gasoil.refuel(tenant_id);
CREATE INDEX IF NOT EXISTS idx_refuel_truck       ON gasoil.refuel(truck_id);
CREATE INDEX IF NOT EXISTS idx_refuel_tenant_ts   ON gasoil.refuel(tenant_id, ts);
