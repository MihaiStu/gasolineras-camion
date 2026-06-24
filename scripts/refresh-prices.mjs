#!/usr/bin/env node
/**
 * refresh-prices.mjs — Job diario de refresco de precios.
 *
 * Descarga los precios oficiales de MINETUR y actualiza la tabla `gasoil.price`
 * (cache diaria, SIN histórico: se pisa cada día). Pensado para correr por cron
 * en el servidor, una vez al día.
 *
 * Solo actualiza precios de estaciones que YA existen en gasoil.station con un
 * `ideess` (código MINETUR). La red pactada sin ideess no se toca aquí.
 *
 * Variables de entorno requeridas (NO hardcodear claves):
 *   SUPABASE_URL          ej. http://192.168.1.33:8100
 *   SUPABASE_SERVICE_KEY  service_role key (escribe saltando RLS)
 *   MINETUR_URL           (opcional) override del endpoint
 *
 * Uso:  SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/refresh-prices.mjs
 */

const MINETUR_URL =
  process.env.MINETUR_URL ||
  'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_KEY en el entorno.');
  process.exit(1);
}

// Productos MINETUR que nos interesan → nombre normalizado en gasoil.price.producto
const PRODUCTOS = {
  'Precio Gasoleo A': 'gasoleo_a',
  'Precio Gasoleo Premium': 'gasoleo_premium',
  'Precio Gasolina 95 E5': 'gasolina_95',
};

const toNum = (s) => {
  if (!s) return null;
  const n = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

async function fetchMinetur() {
  const res = await fetch(MINETUR_URL, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`MINETUR respondió ${res.status}`);
  const data = await res.json();
  return data.ListaEESSPrecio || [];
}

/** Trae el mapa ideess -> station.id de las estaciones que tenemos con ideess. */
async function getStationMap() {
  const map = new Map();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const url = `${SUPABASE_URL}/rest/v1/station?select=id,ideess&ideess=not.is.null`;
    const res = await fetch(url, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Accept-Profile': 'gasoil',
        Range: `${from}-${from + pageSize - 1}`,
      },
    });
    if (!res.ok) throw new Error(`Error leyendo station: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    for (const r of rows) if (r.ideess) map.set(String(r.ideess), r.id);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return map;
}

/** Upsert masivo en gasoil.price (PK station_id+producto → pisa el valor). */
async function upsertPrices(rows) {
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/price`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Profile': 'gasoil',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) throw new Error(`Error upsert price: ${res.status} ${await res.text()}`);
  }
}

async function main() {
  const t0 = Date.now();
  const [lista, stationMap] = await Promise.all([fetchMinetur(), getStationMap()]);
  console.log(`MINETUR: ${lista.length} estaciones | tenemos ${stationMap.size} con ideess`);

  const ahora = new Date().toISOString();
  const out = [];
  for (const e of lista) {
    const sid = stationMap.get(String(e.IDEESS));
    if (!sid) continue; // estación que no tenemos en catálogo
    for (const [campo, producto] of Object.entries(PRODUCTOS)) {
      const precio = toNum(e[campo]);
      if (precio == null) continue;
      out.push({ station_id: sid, producto, precio, actualizado_at: ahora });
    }
  }

  if (out.length === 0) {
    console.log('Nada que actualizar (¿catálogo sin ideess todavía?).');
    return;
  }

  await upsertPrices(out);
  console.log(`OK: ${out.length} precios actualizados en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error('FALLO refresco de precios:', err.message);
  process.exit(1);
});
