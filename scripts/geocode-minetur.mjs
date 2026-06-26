#!/usr/bin/env node
/**
 * geocode-minetur.mjs — Georreferencia el catálogo con la base OFICIAL de MINETUR.
 *
 * La API del Geoportal de Gasolineras (geoportalgasolineras.es / MINETUR) lista
 * TODAS las estaciones de España con coordenadas exactas del surtidor, dirección,
 * IDEESS y precio de Gasóleo A. Esto es mucho mejor que geocodificar por nombre.
 *
 * Para cada estación del catálogo busca su match oficial (misma provincia +
 * similitud de nombre/vía/localidad) y le asigna:
 *   lat/lng exactas, ideess (enlaza MINETUR -> refresco diario de precios),
 *   geo_fuente='minetur', geo_tipo='oficial'. Conservador: si no hay match con
 *   confianza suficiente, NO toca la estación (queda pendiente para manual).
 *   NO sobrescribe geo_fuente='manual'.
 *
 * Requiere:  SUPABASE_URL, SUPABASE_SERVICE_KEY
 * Uso:       node scripts/geocode-minetur.mjs [--dry] [--min N]
 *            --dry  no escribe, solo informa.  --min  umbral de score (def. 3).
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_KEY.'); process.exit(1); }
const MINETUR = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const minI = args.indexOf('--min');
const MIN_SCORE = minI >= 0 ? parseInt(args[minI + 1], 10) : 3;

const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
            'Content-Profile': 'gasoil', 'Accept-Profile': 'gasoil' };
const api = (path, opts = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } });

const STOP = new Set(['de','del','la','el','los','las','y','area','oil','fuel','es','eess','estacion',
  'servicio','carburantes','energy','energia','dir','km','ctra','carretera','calle','avenida','autovia',
  's','l','sl','sa','food','and','i','ii','iii','md','mi','norte','sur','este','oeste']);
const norm = s => (s || '').toString().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')   // sin acentos
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = s => new Set(norm(s).split(' ').filter(t => t.length >= 3 && !STOP.has(t)));
const numFromComma = v => v == null ? null : Number(String(v).replace(',', '.'));

function overlap(a, b) { let n = 0; for (const t of a) if (b.has(t)) n++; return n; }

async function main() {
  console.log('Descargando base oficial MINETUR…');
  const res = await fetch(MINETUR, { headers: { 'User-Agent': 'repostaje-camion/1.0' } });
  const raw = await res.json();
  const eess = (raw.ListaEESSPrecio || []).map(e => ({
    rotulo: e['Rótulo'], dir: e['Dirección'], localidad: e['Localidad'], municipio: e['Municipio'],
    provincia: norm(e['Provincia']), ideess: e['IDEESS'],
    lat: numFromComma(e['Latitud']), lng: numFromComma(e['Longitud (WGS84)']),
    precio: numFromComma(e['Precio Gasoleo A']),
    toks: tokens(`${e['Rótulo']} ${e['Dirección']} ${e['Localidad']} ${e['Municipio']}`),
  })).filter(e => e.lat && e.lng);
  console.log(`MINETUR: ${eess.length} estaciones con coords.`);

  // índice por provincia
  const porProv = new Map();
  for (const e of eess) { if (!porProv.has(e.provincia)) porProv.set(e.provincia, []); porProv.get(e.provincia).push(e); }

  // mis estaciones (todas menos las fijadas a mano)
  const mine = await (await api('station?select=id,nombre,via,localidad,provincia,ideess,geo_fuente&geo_fuente=neq.manual')).json();
  console.log(`Catálogo a cruzar: ${mine.length} estaciones.`);

  let match = 0, sinMatch = 0, precios = 0, fallos = 0;
  const priceRows = [];
  const ideessUsado = new Set();   // ideess tiene índice único: no repetir (estaciones I/II)
  for (const s of mine) if (s.ideess) ideessUsado.add(String(s.ideess));   // precarga los ya asignados en BD
  for (const s of mine) {
    const cands = porProv.get(norm(s.provincia)) || [];
    const myToks = tokens(`${s.nombre} ${s.via} ${s.localidad}`);
    // marca/identidad = primer token significativo del nombre
    const brand = norm(s.nombre).split(' ').find(t => t.length >= 3 && !STOP.has(t));
    let best = null, bestScore = 0;
    for (const c of cands) {
      const sc = overlap(myToks, c.toks);
      if (sc > bestScore) { bestScore = sc; best = c; }
    }
    // aceptar: score>=3, o score 2 SOLO si coincide la marca (evita match por solo localidad)
    const brandShared = best && brand && best.toks.has(brand);
    const aceptar = best && (bestScore >= 3 || (bestScore >= MIN_SCORE && brandShared));
    if (aceptar) {
      match++;
      if (dry) {
        console.log(`  ✓ ${s.nombre} (${s.localidad}) -> ${best.rotulo} [${best.lat},${best.lng}] score ${bestScore}`);
      } else {
        // ideess es único: si ya se usó (estaciones I/II = mismo surtidor), pon coords sin ideess
        const body = { lat: best.lat, lng: best.lng, geo_fuente: 'minetur', geo_tipo: 'oficial', geo_at: new Date().toISOString() };
        if (best.ideess && !ideessUsado.has(best.ideess)) { body.ideess = best.ideess; ideessUsado.add(best.ideess); }
        const r = await api(`station?id=eq.${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body) });
        if (!r.ok) { fallos++; console.log(`  ✗ ${s.nombre} — PATCH ${r.status}: ${(await r.text()).slice(0,80)}`); }
        else if (best.precio) priceRows.push({ station_id: s.id, producto: 'gasoleo_a', precio: best.precio, actualizado_at: new Date().toISOString() });
      }
    } else {
      sinMatch++;
    }
  }

  // precio de surtidor oficial -> tabla price (upsert)
  if (!dry && priceRows.length) {
    const up = await api('price?on_conflict=station_id,producto', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(priceRows) });
    precios = up.ok ? priceRows.length : 0;
    if (!up.ok) console.error('Upsert price falló:', await up.text());
  }

  console.log(`\nHecho. Match oficial=${match}, sin match=${sinMatch}, fallos PATCH=${fallos}, precios surtidor cargados=${precios}. (umbral score=${MIN_SCORE}${dry ? ', DRY' : ''})`);
}

main().catch(e => { console.error(e); process.exit(1); });
