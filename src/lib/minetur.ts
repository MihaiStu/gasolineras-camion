const BASE_URL =
  process.env.MINETUR_API_BASE ||
  'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes';

export interface MineturStation {
  IDEESS: string;
  'Rótulo': string;
  'C.P.': string;
  'Dirección': string;
  Localidad: string;
  Municipio: string;
  Provincia: string;
  Latitud: string;
  'Longitud (WGS84)': string;
  'Precio Gasoleo A': string;
  'Precio Gasoleo B': string;
  'Precio Gasolina 95 E5': string;
  Horario: string;
  [key: string]: string; // permite acceder a claves con caracteres especiales
}

export interface MineturResponse {
  Fecha: string;
  ListaEESSPrecio: MineturStation[];
  ResultadoConsulta: string;
}

export interface ParsedStation {
  ideess: string;
  name: string;
  brand: string;
  locality: string;
  province: string;
  lat: number;
  lon: number;
  address: string;
  gasoleo_a: number | null;
  gasoleo_b: number | null;
  gasolina_95: number | null;
  adblue: number | null;
}

function parseSpanishFloat(value: string): number | null {
  if (!value || value.trim() === '') return null;
  const normalized = value.replace(',', '.');
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? null : parsed;
}

// Provincias necesarias para las rutas Madrid↔Alicante, Madrid↔Barcelona,
// Barcelona↔Valencia y Madrid↔Huelva. Solo descargamos estas en vez de las ~10k nacionales.
const ROUTE_PROVINCE_IDS = [
  '28', // Madrid        (base Pinto + inicio rutas)
  '16', // Cuenca        (MAD-ALI: A-3, Castillo de Garcimuñoz)
  '02', // Albacete      (MAD-ALI: A-31, La Roda)
  '03', // Alicante      (MAD-ALI: A-31 Villena/SAX; ALI-MOL: Elche, Granja de Rocamora)
  '19', // Guadalajara   (MAD-BCN: A-2)
  '50', // Zaragoza      (MAD-BCN: A-2 Calatayud)
  '25', // Lleida        (MAD-BCN: A-2)
  '08', // Barcelona     (MAD-BCN / BCN-VLC)
  '43', // Tarragona     (BCN-VLC: AP-7 libre desde 2020)
  '12', // Castellón     (BCN-VLC: A-7 Vinaròs)
  '46', // Valencia      (BCN-VLC: A-7 Sagunto)
  '45', // Toledo        (ALC-MAD: A-4 Ontigola; MAD-HUE: A-5 Oropesa/Calera)
  '10', // Cáceres       (MAD-HUE: A-5 Peraleda de la Mata)
  '06', // Badajoz       (MAD-HUE: A-66 Fuente de Cantos)
  '41', // Sevilla       (MAD-HUE: A-49 Bollullos/Umbrete)
  '21', // Huelva        (MAD-HUE: A-49)
  '30', // Murcia        (ALI-MOL: Molina de Segura, A-30)
];

function getBrand(s: MineturStation): string {
  // La API puede devolver 'Rótulo' con distintas codificaciones según el entorno
  return (
    s['Rótulo'] ||
    s['R\u00f3tulo'] ||
    // fallback: buscar cualquier clave que contenga 'tulo'
    Object.entries(s).find(([k]) => k.toLowerCase().includes('tulo'))?.[1] ||
    ''
  );
}

function parseStation(s: MineturStation): ParsedStation {
  const lat = parseSpanishFloat(s.Latitud) ?? 0;
  const lon = parseSpanishFloat(s['Longitud (WGS84)']) ?? 0;
  const brand = getBrand(s);
  return {
    ideess: s.IDEESS,
    name: brand || 'Desconocida',
    brand: brand || 'Desconocida',
    locality: s.Localidad || s.Municipio || '',
    province: s.Provincia || '',
    lat,
    lon,
    address: s['Dirección'] || s['Direcci\u00f3n'] || '',
    // La API usa 'Gasoleo' sin acento en las claves de precio
    gasoleo_a: parseSpanishFloat(s['Precio Gasoleo A']),
    gasoleo_b: parseSpanishFloat(s['Precio Gasoleo B']),
    gasolina_95: parseSpanishFloat(s['Precio Gasolina 95 E5']),
    adblue: parseSpanishFloat(s['Precio Adblue']),
  };
}

async function fetchJSON(url: string): Promise<MineturResponse | null> {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, next: { revalidate: 0 } });
  if (!response.ok) return null;
  const buffer = await response.arrayBuffer();
  // Intentar UTF-8 primero; si falla, usar ISO-8859-1
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder('iso-8859-1').decode(buffer);
  }
  try {
    return JSON.parse(text) as MineturResponse;
  } catch {
    return null;
  }
}

async function fetchByProvince(idProvincia: string): Promise<ParsedStation[]> {
  const url = `${BASE_URL}/EstacionesTerrestres/FiltroProvincia/${idProvincia}`;
  const data = await fetchJSON(url);
  if (!data || data.ResultadoConsulta !== 'OK') return [];
  return data.ListaEESSPrecio.map(parseStation).filter((s) => s.lat !== 0 && s.lon !== 0);
}

export async function fetchAllStations(): Promise<ParsedStation[]> {
  // Descarga en paralelo solo las provincias de las rutas (mucho más rápido que las ~10k nacionales)
  const results = await Promise.all(ROUTE_PROVINCE_IDS.map(fetchByProvince));
  const all = results.flat();
  // Eliminar duplicados por ideess
  const seen = new Set<string>();
  return all.filter((s) => {
    if (seen.has(s.ideess)) return false;
    seen.add(s.ideess);
    return true;
  });
}

export async function fetchStationById(ideess: string): Promise<ParsedStation | null> {
  const all = await fetchAllStations();
  return all.find((s) => s.ideess === ideess) ?? null;
}
