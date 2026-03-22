export interface RouteWaypoint {
  lat: number;
  lon: number;
  radiusKm: number;
  label: string;
}

export interface RouteDefinition {
  id: string;
  name: string;
  shortName: string;
  color: string;
  colorClass: string;
  borderClass: string;
  bgClass: string;
  waypoints: RouteWaypoint[];
  preferredBrands?: string[];
}

// Radio base 6 km: estaciones accesibles desde la autovía sin desvío grande.
// Expansión máxima x2 (12 km) en stationSelector — sin x4.
// Todas las rutas usan autovías GRATUITAS. Sin AP de peaje.
//
// Fuente de waypoints: datos reales Galp Fleet del usuario (Pinto, Madrid sur).
//
// MAD↔ALC: A-3 + A-31 (ambas gratuitas)
// MAD→HUE: A-5 (Navalcarnero→Oropesa) + A-66 Ruta de la Plata + A-49
//           *** VÍA A-5+A-66, NO por A-4 ***
// ALC→MAD: A-31 + A-4 (regreso via Ontigola/Valdemoro directo a Pinto en A-4)
// MAD↔BCN: A-2 totalmente gratuita
// BCN↔VLC: AP-7 liberada de peaje en 2020 (sur de Tarragona) + A-7
// ALI↔MOL: A-7 libre (Alicante→Murcia) + A-30 (Molina de Segura)

export const ROUTES: RouteDefinition[] = [

  // ── BASE ────────────────────────────────────────────────────────────────────
  {
    id: 'pinto-base',
    name: 'Base — Pinto (Galp locales)',
    shortName: 'BASE PINTO',
    color: '#22C55E',
    colorClass: 'text-green-400',
    borderClass: 'border-green-500',
    bgClass: 'bg-green-900/20',
    waypoints: [
      // Zona norte de Pinto — Mosaico Marítimo / A-4
      { lat: 40.258, lon: -3.703, radiusKm: 4, label: 'Pinto Norte (Mosaico Marítimo)' },
      // Zona centro-sur de Pinto
      { lat: 40.238, lon: -3.703, radiusKm: 4, label: 'Pinto Centro' },
    ],
  },

  // ── MADRID → ALICANTE  (A-3 + A-31 gratuitas) ───────────────────────────
  // Galp reales: Castillo Garcimuñoz (143 km) · La Roda (185 km) · Villena/SAX (315 km)
  {
    id: 'mad-ali',
    name: 'Madrid → Alicante',
    shortName: 'MAD → ALC',
    color: '#3B82F6',
    colorClass: 'text-blue-400',
    borderClass: 'border-blue-500',
    bgClass: 'bg-blue-900/20',
    waypoints: [
      // A-3 PK ~143 — Castillo de Garcimuñoz (Cuenca). Galp confirmada ~143 km de Pinto.
      { lat: 39.730, lon: -2.220, radiusKm: 8, label: 'Castillo de Garcimuñoz A-3' },
      // A-31 — La Roda (Albacete). Galp dir. Madrid y dir. Albacete ~185-200 km.
      { lat: 39.209, lon: -2.152, radiusKm: 6, label: 'La Roda A-31' },
      // A-31 — Villena (Alicante). Galp ~315 km; SAX a 320 km muy cerca.
      { lat: 38.637, lon: -0.864, radiusKm: 6, label: 'Villena A-31' },
    ],
  },

  // ── ALICANTE → MADRID  (A-31 + A-4 — regresa por A-4 directa a Pinto) ──
  // Galp reales: Villena (44 km) · La Roda (162-176 km) · Ontigola A-4 (321 km)
  // Pinto está sobre la A-4 — el regreso natural es A-31→Ocaña→A-4→Pinto.
  {
    id: 'ali-mad',
    name: 'Alicante → Madrid',
    shortName: 'ALC → MAD',
    color: '#8B5CF6',
    colorClass: 'text-purple-400',
    borderClass: 'border-purple-500',
    bgClass: 'bg-purple-900/20',
    waypoints: [
      // A-31 — Villena/SAX ~39-44 km desde Alicante.
      { lat: 38.637, lon: -0.864, radiusKm: 6, label: 'Villena A-31' },
      // A-31 — La Roda (Albacete) ~162-176 km.
      { lat: 39.209, lon: -2.152, radiusKm: 6, label: 'La Roda A-31' },
      // A-4 — Ontigola/Ocaña (Toledo) ~321 km. Galp dir. Madrid y dir. Córdoba.
      // Desde aquí A-4 sur directo a Pinto (~35 km).
      { lat: 39.950, lon: -3.565, radiusKm: 6, label: 'Ontigola A-4' },
    ],
  },

  // ── MADRID → BARCELONA  (A-2, totalmente gratuita) ───────────────────────
  {
    id: 'mad-bcn',
    name: 'Madrid → Barcelona',
    shortName: 'MAD → BCN',
    color: '#F59E0B',
    colorClass: 'text-amber-400',
    borderClass: 'border-amber-500',
    bgClass: 'bg-amber-900/20',
    waypoints: [
      // A-2 PK ~57 — bypass Guadalajara. Totalmente gratuita.
      { lat: 40.637, lon: -3.138, radiusKm: 6, label: 'Guadalajara A-2' },
      // A-2 PK ~310 — Zaragoza. Ciudad principal en A-2, múltiples estaciones.
      { lat: 41.650, lon: -0.887, radiusKm: 8, label: 'Zaragoza A-2' },
      // A-2 PK ~460 — Lleida. Gratuita.
      { lat: 41.621, lon: 0.614, radiusKm: 6, label: 'Lleida A-2' },
    ],
  },

  // ── BARCELONA → MADRID  (A-2, totalmente gratuita) ───────────────────────
  {
    id: 'bcn-mad',
    name: 'Barcelona → Madrid',
    shortName: 'BCN → MAD',
    color: '#10B981',
    colorClass: 'text-emerald-400',
    borderClass: 'border-emerald-500',
    bgClass: 'bg-emerald-900/20',
    waypoints: [
      { lat: 41.621, lon: 0.614, radiusKm: 6, label: 'Lleida A-2' },
      { lat: 41.650, lon: -0.887, radiusKm: 8, label: 'Zaragoza A-2' },
      { lat: 40.637, lon: -3.138, radiusKm: 6, label: 'Guadalajara A-2' },
    ],
  },

  // ── BARCELONA → VALENCIA  (AP-7 libre desde 2020 + A-7) ─────────────────
  // El tramo Barcelona-El Vendrell (AP-7) sigue con peaje — primer waypoint
  // al sur de Tarragona, ya en zona LIBRE desde 2020.
  {
    id: 'bcn-val',
    name: 'Barcelona → Valencia',
    shortName: 'BCN → VLC',
    color: '#EF4444',
    colorClass: 'text-red-400',
    borderClass: 'border-red-500',
    bgClass: 'bg-red-900/20',
    waypoints: [
      // AP-7 libre PK ~230 — Cambrils/Salou (Tarragona). Sin peaje desde 2020.
      { lat: 41.065, lon: 1.062, radiusKm: 6, label: 'Cambrils-Salou AP-7 (libre)' },
      // A-7/AP-7 libre — Vinaròs (norte Castellón). Sin peaje.
      { lat: 40.471, lon: 0.476, radiusKm: 6, label: 'Vinaròs A-7' },
      // A-7 — Sagunto-Puçol (Valencia). Gratuita.
      { lat: 39.688, lon: -0.232, radiusKm: 6, label: 'Sagunto A-7' },
    ],
  },

  // ── VALENCIA → BARCELONA  (A-7 + AP-7 libre) ─────────────────────────────
  {
    id: 'val-bcn',
    name: 'Valencia → Barcelona',
    shortName: 'VLC → BCN',
    color: '#F97316',
    colorClass: 'text-orange-400',
    borderClass: 'border-orange-500',
    bgClass: 'bg-orange-900/20',
    waypoints: [
      { lat: 39.688, lon: -0.232, radiusKm: 6, label: 'Sagunto A-7' },
      { lat: 40.471, lon: 0.476, radiusKm: 6, label: 'Vinaròs A-7' },
      { lat: 41.065, lon: 1.062, radiusKm: 6, label: 'Cambrils-Salou AP-7 (libre)' },
    ],
  },

  // ── MADRID → HUELVA  (A-5 + A-66 Ruta de la Plata + A-49) ──────────────
  // *** RUTA REAL DEL USUARIO: VÍA A-5 (Navalcarnero, Oropesa), NO por A-4 ***
  // Galp reales: Oropesa (137 km) · Fuente de Cantos (328 km) · Bollullos (400 km)
  {
    id: 'mad-hue',
    name: 'Madrid → Huelva',
    shortName: 'MAD → HUE',
    color: '#06B6D4',
    colorClass: 'text-cyan-400',
    borderClass: 'border-cyan-500',
    bgClass: 'bg-cyan-900/20',
    waypoints: [
      // A-5 PK ~137 — Oropesa (Toledo/Cáceres). Galp confirmada ~137 km de Pinto.
      // A-5 gratuita (Madrid → Badajoz/Mérida).
      { lat: 39.921, lon: -5.188, radiusKm: 6, label: 'Oropesa A-5' },
      // A-66 (Ruta de la Plata) — Fuente de Cantos (Badajoz). ~328 km de Pinto.
      // Gratuita. Se llega desde A-5 tomando salida hacia sur por Extremadura.
      { lat: 38.077, lon: -6.299, radiusKm: 8, label: 'Fuente de Cantos A-66' },
      // A-49 — Bollullos de la Mitación dir. Umbrete (Sevilla). ~400 km.
      // Gratuita. Tramo final hacia Huelva.
      { lat: 37.352, lon: -6.181, radiusKm: 6, label: 'Bollullos-Umbrete A-49' },
    ],
  },

  // ── HUELVA → MADRID  (A-49 + A-66 + A-5) ────────────────────────────────
  // Galp reales: Bollullos (71 km de Huelva) · Fuente de Cantos (121 km) · Oropesa (333 km)
  {
    id: 'hue-mad',
    name: 'Huelva → Madrid',
    shortName: 'HUE → MAD',
    color: '#A855F7',
    colorClass: 'text-purple-400',
    borderClass: 'border-purple-500',
    bgClass: 'bg-purple-900/20',
    waypoints: [
      // A-49 — Bollullos dir. Umbrete (Sevilla). ~71 km de Huelva. Gratuita.
      { lat: 37.352, lon: -6.181, radiusKm: 6, label: 'Bollullos-Umbrete A-49' },
      // A-66 — Fuente de Cantos (Badajoz). ~121 km de Huelva. Gratuita.
      { lat: 38.077, lon: -6.299, radiusKm: 8, label: 'Fuente de Cantos A-66' },
      // A-5 — Oropesa (Toledo/Cáceres). ~333 km de Huelva. Gratuita.
      { lat: 39.921, lon: -5.188, radiusKm: 6, label: 'Oropesa A-5' },
    ],
  },

  // ── ALICANTE → MOLINA DE SEGURA  (AP-7/A-7 libre + N-301/A-30) ──────────
  // Galp reales (datos Fleet): Elche A-7 dir. Murcia (~11 km) · Granja de Rocamora (~40 km)
  // AP-7 Alicante-Murcia liberada de peaje (2020). A-30/N-301 Murcia-Molina gratuita.
  {
    id: 'ali-mol',
    name: 'Alicante → Molina de Segura',
    shortName: 'ALC → MOL',
    color: '#F43F5E',
    colorClass: 'text-rose-400',
    borderClass: 'border-rose-500',
    bgClass: 'bg-rose-900/20',
    waypoints: [
      // A-7/AP-7 sur de Elche — dirección Murcia. ~11 km de Alicante.
      { lat: 38.210, lon: -0.700, radiusKm: 8, label: 'Elche A-7 dir. Murcia' },
      // A-7 — Granja de Rocamora / Orihuela (Alicante). ~40 km.
      { lat: 38.130, lon: -0.955, radiusKm: 6, label: 'Granja de Rocamora A-7' },
      // N-301/A-30 — Murcia / Molina de Segura. Destino final ~80 km.
      { lat: 38.058, lon: -1.214, radiusKm: 8, label: 'Molina de Segura A-30' },
    ],
  },

  // ── MOLINA DE SEGURA → ALICANTE  (A-30 + A-7/AP-7 libre) ─────────────────
  {
    id: 'mol-ali',
    name: 'Molina de Segura → Alicante',
    shortName: 'MOL → ALC',
    color: '#14B8A6',
    colorClass: 'text-teal-400',
    borderClass: 'border-teal-500',
    bgClass: 'bg-teal-900/20',
    waypoints: [
      // N-301/A-30 — Murcia / Molina de Segura. Inicio de ruta.
      { lat: 38.058, lon: -1.214, radiusKm: 8, label: 'Molina de Segura A-30' },
      // A-7 — Granja de Rocamora / Orihuela. ~40 km desde Molina.
      { lat: 38.130, lon: -0.955, radiusKm: 6, label: 'Granja de Rocamora A-7' },
      // A-7/AP-7 sur de Elche — dirección Alicante. ~70 km desde Molina.
      { lat: 38.210, lon: -0.700, radiusKm: 8, label: 'Elche A-7 dir. Alicante' },
    ],
  },
];

export function getRouteById(id: string): RouteDefinition | undefined {
  return ROUTES.find((r) => r.id === id);
}

// Haversine distance in km
export function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
