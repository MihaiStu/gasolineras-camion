#!/usr/bin/env node
/**
 * geocode-stations.mjs — Georreferencia las estaciones por NOMBRE (OSM/Nominatim).
 *
 * Geocodificar por nombre de estación ("ANDAMUR Guarromán") suele devolver el POI
 * real del surtidor (no el centro del pueblo). Guarda lat/lng + geo_fuente +
 * geo_tipo (pista de precisión: 'fuel'/'services' = bueno; 'localidad' = dudoso).
 *
 * - Respeta el límite de Nominatim (1 req/seg) y manda User-Agent con contacto.
 * - NO toca estaciones con geo_fuente='manual' (correcciones del usuario).
 * - Por defecto procesa las que faltan o vienen del 'seed' (localidad). Con
 *   --force re-geocodifica también las ya hechas por nominatim.
 *
 * Requiere:  SUPABASE_URL, SUPABASE_SERVICE_KEY
 * Uso:       node scripts/geocode-stations.mjs [--force] [--limit N]
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_KEY.'); process.exit(1); }

const args = process.argv.slice(2);
const force = args.includes('--force');
const limitI = args.indexOf('--limit');
const limit = limitI >= 0 ? parseInt(args[limitI + 1], 10) : null;
const UA = 'repostaje-camion-geocoder/1.0 (studenteanu@gmail.com)';

const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
            'Content-Profile': 'gasoil', 'Accept-Profile': 'gasoil' };
const api = (path, opts = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } });

const sleep = ms => new Promise(r => setTimeout(r, ms));
// tipos OSM que consideramos "buena" precisión (POI real)
const BUENOS = new Set(['fuel', 'services', 'fuel_station']);

async function nominatim(params) {
  const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams(
    { format: 'json', limit: '1', countrycodes: 'es', addressdetails: '0', ...params }).toString();
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('Nominatim ' + r.status);
  const d = await r.json();
  return d[0] || null;
}

// limpia sufijos que despistan a OSM ("II", "MD", "Dir. Madrid", "- Algo")
function limpiaNombre(n) {
  return (n || '')
    .replace(/\b(MD|MI)\b/g, '')
    .replace(/\bDir\.?.*$/i, '')
    .replace(/\s+I{1,3}\b/g, '')
    .replace(/\s*-\s*.*$/, '')
    .replace(/\s+/g, ' ').trim();
}

async function geocodeOne(st) {
  const intentos = [
    `${st.nombre}, ${st.localidad || ''}, ${st.provincia || ''}`,
    `${limpiaNombre(st.nombre)}, ${st.localidad || ''}, ${st.provincia || ''}`,
  ];
  let mejor = null;
  for (const q of intentos) {
    const hit = await nominatim({ q });
    if (hit && BUENOS.has(hit.type)) { mejor = { hit, tipo: hit.type }; break; }   // POI fiable
    if (hit && !mejor) mejor = { hit, tipo: hit.type };                            // guarda el débil por si acaso
    await sleep(1100);
  }
  if (!mejor) return null;
  return { lat: Number(mejor.hit.lat), lng: Number(mejor.hit.lon), tipo: mejor.tipo,
           fiable: BUENOS.has(mejor.tipo) };
}

async function main() {
  // estaciones a procesar: faltan coords, vienen del seed, o --force (todo menos manual)
  const filter = force ? 'geo_fuente=neq.manual' : 'or=(geo_fuente.is.null,geo_fuente.eq.seed)';
  const sel = await api(`station?select=id,nombre,via,localidad,provincia&${filter}` + (limit ? `&limit=${limit}` : ''));
  const list = await sel.json();
  console.log(`A geocodificar: ${list.length} estaciones.`);

  let ok = 0, buenos = 0, dudosos = 0, fallos = 0;
  for (const st of list) {
    try {
      const g = await geocodeOne(st);
      if (!g) {
        // ni POI ni nada: marcar pendiente, sin tocar coords
        await api(`station?id=eq.${st.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ geo_fuente: 'pendiente', geo_tipo: null, geo_at: new Date().toISOString() }) });
        dudosos++; console.log(`  ✗ ${st.nombre} (${st.localidad}) — sin POI, PENDIENTE`);
      } else if (g.fiable) {
        // POI fiable: escribir coords reales
        const patch = await api(`station?id=eq.${st.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ lat: g.lat, lng: g.lng, geo_fuente: 'nominatim', geo_tipo: g.tipo, geo_at: new Date().toISOString() }) });
        if (!patch.ok) { fallos++; console.log(`  ✗ ${st.nombre} — PATCH ${patch.status}`); }
        else { ok++; buenos++; console.log(`  ✓ ${st.nombre} -> ${g.lat.toFixed(5)},${g.lng.toFixed(5)} [${g.tipo}]`); }
      } else {
        // hubo resultado pero NO es POI de surtidor: NO escribir coords del pueblo, marcar pendiente
        await api(`station?id=eq.${st.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ geo_fuente: 'pendiente', geo_tipo: g.tipo, geo_at: new Date().toISOString() }) });
        dudosos++; console.log(`  ? ${st.nombre} — solo "${g.tipo}", PENDIENTE (no se usa el centro del pueblo)`);
      }
    } catch (e) {
      fallos++; console.log(`  ✗ ${st.nombre} — ${e.message}`);
    }
    await sleep(1100); // límite Nominatim
  }
  console.log(`\nHecho. OK=${ok} (precisos=${buenos}, dudosos=${dudosos}), fallos=${fallos}.`);
  console.log('Los "dudosos/?" conviene revisarlos a mano (geo_tipo no es fuel/services).');
}

main().catch(e => { console.error(e); process.exit(1); });
