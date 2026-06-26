#!/usr/bin/env node
/**
 * import-andamur.mjs — Importa el listado de precios de Andamur (precio_lista).
 *
 * Andamur envía un TSV con secciones por región (cabecera con 2ª col = "VIA") y
 * filas: NOMBRE \t VIA \t LOCALIDAD \t PROVINCIA \t PRECIO(€/l, coma decimal).
 *
 * Qué hace:
 *   1. Parsea el fichero (ignora cabeceras de sección; usa su nombre como zona).
 *   2. Upsert de cada estación en gasoil.station (id determinista
 *      md5('nombre|localidad|provincia')::uuid, igual que el seed -> idempotente).
 *   3. Reemplaza gasoil.tarjeta_precio de la tarjeta indicada con los precios.
 *
 * Requiere (NO hardcodear claves):
 *   SUPABASE_URL          ej. http://192.168.1.33:8100
 *   SUPABASE_SERVICE_KEY  service_role (escribe station y bypassa RLS)
 *
 * Uso:
 *   node scripts/import-andamur.mjs <fichero.txt> --tenant <uuid> [--tarjeta <uuid>] [--nombre "Andamur"]
 *   (si no se pasa --tarjeta, busca/crea una tarjeta precio_lista con ese nombre en el tenant)
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_KEY en el entorno.');
  process.exit(1);
}

// ---- args ----
const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const getOpt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const tenantId = getOpt('--tenant');
let tarjetaId = getOpt('--tarjeta');
const nombre = getOpt('--nombre') || 'Andamur';
if (!file || !tenantId) {
  console.error('Uso: node scripts/import-andamur.mjs <fichero> --tenant <uuid> [--tarjeta <uuid>] [--nombre "Andamur"]');
  process.exit(1);
}

const H = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Content-Profile': 'gasoil',
  'Accept-Profile': 'gasoil',
};
const api = (path, opts = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } });

// md5('nombre|localidad|provincia')::uuid  (igual que el seed 03)
function stationId(nombre, localidad, provincia) {
  const hex = createHash('md5').update(`${nombre}|${localidad}|${provincia}`).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}
const marcaDe = n => (n || '').trim().split(/\s+/)[0]?.toUpperCase() || null;

// ---- parse ----
function parse(text) {
  const rows = [];
  let zona = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const c = raw.split('\t').map(s => s.trim());
    if (c.length < 5) continue;
    if (c[1] === 'VIA') { zona = c[0]; continue; }   // cabecera de sección
    const [nombre, via, localidad, provincia, precioRaw] = c;
    const precio = parseFloat(precioRaw.replace(',', '.'));
    if (!nombre || !localidad || !provincia || isNaN(precio)) continue;
    rows.push({ nombre, via, localidad, provincia, precio, zona,
                id: stationId(nombre, localidad, provincia) });
  }
  // dedupe por id, gana la última aparición (las secciones CCAA van después de las "ZONA *")
  const byId = new Map();
  for (const r of rows) byId.set(r.id, r);
  return [...byId.values()];
}

async function main() {
  const items = parse(readFileSync(file, 'utf8'));
  console.log(`Parseadas ${items.length} estaciones únicas.`);

  // 1. resolver tarjeta
  if (!tarjetaId) {
    const r = await api(`tarjeta?tenant_id=eq.${tenantId}&nombre=eq.${encodeURIComponent(nombre)}&select=id`);
    const found = await r.json();
    if (found.length) {
      tarjetaId = found[0].id;
    } else {
      const cr = await api('tarjeta', { method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ tenant_id: tenantId, nombre, tipo: 'precio_lista' }) });
      if (!cr.ok) { console.error('No se pudo crear la tarjeta:', await cr.text()); process.exit(1); }
      tarjetaId = (await cr.json())[0].id;
      console.log(`Tarjeta "${nombre}" creada (${tarjetaId}).`);
    }
  }

  // 2. upsert estaciones (merge-duplicates por id)
  const stations = items.map(r => ({
    id: r.id, nombre: r.nombre, marca: marcaDe(r.nombre),
    via: r.via || null, localidad: r.localidad, provincia: r.provincia, zona: r.zona || null,
  }));
  const us = await api('station?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(stations),
  });
  if (!us.ok) { console.error('Upsert station falló:', await us.text()); process.exit(1); }
  console.log(`Estaciones upsertadas: ${stations.length}.`);

  // 3. reemplazar precios de la tarjeta
  const del = await api(`tarjeta_precio?tarjeta_id=eq.${tarjetaId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  if (!del.ok) { console.error('Borrado de precios previos falló:', await del.text()); process.exit(1); }

  const precios = items.map(r => ({
    tarjeta_id: tarjetaId, tenant_id: tenantId, producto: 'gasoleo_a',
    station_id: r.id, precio: r.precio,
  }));
  const ins = await api('tarjeta_precio', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(precios) });
  if (!ins.ok) { console.error('Inserción de precios falló:', await ins.text()); process.exit(1); }
  console.log(`Precios cargados en tarjeta_precio: ${precios.length}.`);
  console.log('OK.');
}

main().catch(e => { console.error(e); process.exit(1); });
