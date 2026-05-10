import { ParsedStation } from './minetur';
import { RouteDefinition, RouteWaypoint, distanceKm } from './routes';

const DEFAULT_TARGET_BRANDS = ['GALP', 'GALP ENERGIA', 'SHELL', 'ANDAMUR'];

const TRUCK_FRIENDLY_HINTS = [
  'A-', 'AP-', 'N-', 'E-', 'M-', 'R-',
  'AUTOVIA', 'AUTOPISTA', 'AREA DE SERVICIO', 'ESTACION DE SERVICIO',
  'POLIGONO', 'PK', 'KM', 'KILOMETRO',
];

const URBAN_ONLY_HINTS = [
  'CALLE', 'AVENIDA', 'PASEO', 'PLAZA', 'RONDA',
  'CASCO', 'CENTRO',
];

function isTargetBrand(brand: string, targetBrands: string[]): boolean {
  return targetBrands.some((b) =>
    brand.toUpperCase().includes(b)
  );
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').toUpperCase();
}

function isLikelyTruckAccessible(station: ParsedStation): boolean {
  const text = normalizeText(`${station.address} ${station.locality} ${station.name}`);

  const hasTruckHint = TRUCK_FRIENDLY_HINTS.some((hint) => text.includes(hint));
  const hasUrbanOnlyHint = URBAN_ONLY_HINTS.some((hint) => text.includes(hint));

  // Priorizamos áreas de carretera/polígono para camión.
  // Si no hay pistas de carretera pero sí de casco urbano, descartamos.
  if (!hasTruckHint && hasUrbanOnlyHint) return false;
  return hasTruckHint;
}

function findBestCandidate(
  stations: ParsedStation[],
  waypoint: RouteWaypoint,
  usedIds: Set<string>
): ParsedStation | null {
  // Priorizamos precio (más barata) y después cercanía.
  const candidates = stations
    .filter(
      (s) =>
        !usedIds.has(s.ideess) &&
        s.gasoleo_a !== null &&
        s.gasoleo_a > 0 &&
        distanceKm(s.lat, s.lon, waypoint.lat, waypoint.lon) <= waypoint.radiusKm
    )
    .sort((a, b) => {
      const priceDiff = (a.gasoleo_a ?? Number.POSITIVE_INFINITY) - (b.gasoleo_a ?? Number.POSITIVE_INFINITY);
      if (Math.abs(priceDiff) > 0.0001) return priceDiff;

      const da = distanceKm(a.lat, a.lon, waypoint.lat, waypoint.lon);
      const db = distanceKm(b.lat, b.lon, waypoint.lat, waypoint.lon);
      return da - db;
    });

  return candidates[0] ?? null;
}

export function selectStationsForRoute(
  allStations: ParsedStation[],
  route: RouteDefinition
): Array<{ station: ParsedStation; position: number }> {
  const targetBrands = route.preferredBrands?.length
    ? route.preferredBrands
    : DEFAULT_TARGET_BRANDS;

  // Solo marcas objetivo con precio de Gasóleo A.
  const preferredBrandStations = allStations.filter(
    (s) => isTargetBrand(s.brand, targetBrands) && s.gasoleo_a !== null && s.gasoleo_a > 0
  );

  const truckFriendlyStations = preferredBrandStations.filter(isLikelyTruckAccessible);
  const preferredStations = truckFriendlyStations.length > 0
    ? truckFriendlyStations
    : preferredBrandStations;

  const result: Array<{ station: ParsedStation; position: number }> = [];
  const usedIds = new Set<string>();

  route.waypoints.forEach((waypoint, index) => {
    const position = index + 1;

    // 1º intento: radio base (6 km por defecto)
    let station = findBestCandidate(preferredStations, waypoint, usedIds);

    // 2º intento: radio x2 (máx. 12 km)
    if (!station) {
      const expanded: RouteWaypoint = { ...waypoint, radiusKm: waypoint.radiusKm * 2 };
      station = findBestCandidate(preferredStations, expanded, usedIds);
    }

    // 3º intento: radio x4 — último recurso para zonas rurales/escasas
    // (Calatayud A-2, Fuente de Cantos A-66, Vinaròs A-7, etc.)
    if (!station) {
      const expanded: RouteWaypoint = { ...waypoint, radiusKm: waypoint.radiusKm * 4 };
      station = findBestCandidate(preferredStations, expanded, usedIds);
    }

    if (station) {
      usedIds.add(station.ideess);
      result.push({ station, position });
    }
  });

  return result;
}
