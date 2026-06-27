// =============================================================================
// Edge Function: admin — operaciones de catálogo (service_role) para el panel.
//
// El catálogo de estaciones es GLOBAL y solo lo toca la plataforma. Esta función
// corre server-side con SERVICE_ROLE_KEY (que NUNCA va al navegador) y exige que
// el llamante sea admin (JWT válido + email en allowlist).
//
// Acciones (POST JSON {action, ...}):
//   import_list — {tenant_id, tarjeta_nombre, tsv}: importa un listado de precios
//                 (formato TSV de Andamur/Radius), upsert de estaciones + recarga
//                 de tarjeta_precio. Idempotente. Lo usa public/admin.html.
//
// Desplegada en volumes/functions/admin/ de la instancia gasoil.
// =============================================================================
import * as jose from 'https://deno.land/x/jose@v4.14.4/index.ts';
import { crypto } from 'https://deno.land/std@0.208.0/crypto/mod.ts';

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPA = Deno.env.get('SUPABASE_URL')!;          // http://kong:8000
const JWT_SECRET = Deno.env.get('JWT_SECRET')!;
const ADMINS = ['gestor@admilogistic.demo', 'studenteanu@gmail.com'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const api = (path: string, opts: RequestInit = {}) =>
  fetch(`${SUPA}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Profile': 'gasoil', 'Accept-Profile': 'gasoil', ...(opts.headers || {}) },
  });

async function md5uuid(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('MD5', new TextEncoder().encode(s));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
const marcaDe = (n: string) => (n || '').trim().split(/\s+/)[0]?.toUpperCase() || null;

async function getAdmin(req: Request) {
  const token = (req.headers.get('authorization') || '').split(' ')[1];
  if (!token) return null;
  try {
    const { payload } = await jose.jwtVerify(token, new TextEncoder().encode(JWT_SECRET));
    return ADMINS.includes(payload.email as string) ? payload : null;
  } catch { return null; }
}

// Parsea el TSV (cabecera de sección con 2ª col 'VIA'; filas de 5 columnas)
async function parseTSV(text: string) {
  const out: Record<string, unknown>[] = [];
  let zona: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const c = raw.split('\t').map((x) => x.trim());
    if (c.length < 5) continue;
    if (c[1] === 'VIA') { zona = c[0]; continue; }
    const [nombre, via, localidad, provincia, precioRaw] = c;
    const precio = parseFloat(precioRaw.replace(',', '.'));
    if (!nombre || !localidad || !provincia || isNaN(precio)) continue;
    out.push({ nombre, via, localidad, provincia, precio, zona, id: await md5uuid(`${nombre}|${localidad}|${provincia}`) });
  }
  const byId = new Map<string, Record<string, unknown>>();
  for (const r of out) byId.set(r.id as string, r);
  return [...byId.values()];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const who = await getAdmin(req);
  if (!who) return json({ error: 'No autorizado (admin requerido)' }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  if (body.action === 'import_list') {
    const tenant_id = body.tenant_id as string;
    const nombre = (body.tarjeta_nombre as string) || 'Andamur';
    const tsv = body.tsv as string;
    if (!tenant_id || !tsv) return json({ error: 'Faltan tenant_id o tsv' }, 400);

    const items = await parseTSV(tsv);
    if (!items.length) return json({ error: 'El listado no tiene filas válidas' }, 400);

    // tarjeta (buscar o crear, tipo precio_lista)
    let tarjetaId: string;
    const found = await (await api(`tarjeta?tenant_id=eq.${tenant_id}&nombre=eq.${encodeURIComponent(nombre)}&select=id`)).json();
    if (found.length) tarjetaId = found[0].id;
    else {
      const cr = await api('tarjeta', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ tenant_id, nombre, tipo: 'precio_lista' }) });
      if (!cr.ok) return json({ error: 'No se pudo crear la tarjeta: ' + (await cr.text()) }, 500);
      tarjetaId = (await cr.json())[0].id;
    }

    // upsert estaciones
    const stations = items.map((r) => ({ id: r.id, nombre: r.nombre, marca: marcaDe(r.nombre as string),
      via: r.via || null, localidad: r.localidad, provincia: r.provincia, zona: r.zona || null }));
    const us = await api('station?on_conflict=id', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(stations) });
    if (!us.ok) return json({ error: 'Upsert estaciones falló: ' + (await us.text()) }, 500);

    // reemplazar precios de la tarjeta
    await api(`tarjeta_precio?tarjeta_id=eq.${tarjetaId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    const precios = items.map((r) => ({ tarjeta_id: tarjetaId, tenant_id, producto: 'gasoleo_a', station_id: r.id, precio: r.precio }));
    const ins = await api('tarjeta_precio', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(precios) });
    if (!ins.ok) return json({ error: 'Inserción de precios falló: ' + (await ins.text()) }, 500);

    return json({ ok: true, tarjeta: nombre, estaciones: stations.length, precios: precios.length });
  }

  return json({ error: 'Acción desconocida' }, 400);
});
