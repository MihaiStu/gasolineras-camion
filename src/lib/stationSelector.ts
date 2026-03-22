import { ParsedStation } from './minetur';
import { RouteDefinition, RouteWaypoint, distanceKm } from './routes';

const GALP_BRANDS = ['GALP', 'GALP ENERGIA'];

function isGalpBrand(brand: string): boolean {
  return GALP_BRANDS.some((b) =>
    brand.toUpperCase().includes(b)
  );
}

function findClosestGalp(
  stations: ParsedStation[],
  waypoint: RouteWaypoint,
  usedIds: Set<string>
): ParsedStation | null {
  // Todas las Galp con precio de Gasóleo A en el radio del waypoint
  // (no se filtra por AdBlue: muchas Galp Fleet tienen AdBlue pero no lo reportan en MINETUR)
  const candidates = stations
    .filter(
      (s) =>
        !usedIds.has(s.ideess) &&
        s.gasoleo_a !== null &&
        s.gasoleo_a > 0 &&
        distanceKm(s.lat, s.lon, waypoint.lat, waypoint.lon) <= waypoint.radiusKm
    )
    .sort((a, b) => {
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
  // Solo estaciones Galp con precio de Gasóleo A.
  // No filtramos por AdBlue: las Galp Fleet sirven a camiones con AdBlue
  // pero no siempre lo reportan en MINETUR.
  const galpStations = allStations.filter(
    (s) => isGalpBrand(s.brand) && s.gasoleo_a !== null && s.gasoleo_a > 0
  );

  const result: Array<{ station: ParsedStation; position: number }> = [];
  const usedIds = new Set<string>();

  route.waypoints.forEach((waypoint, index) => {
    const position = index + 1;

    // 1º intento: radio base (6 km por defecto)
    let station = findClosestGalp(galpStations, waypoint, usedIds);

    // 2º intento: radio x2 (máx. 12 km)
    if (!station) {
      const expanded: RouteWaypoint = { ...waypoint, radiusKm: waypoint.radiusKm * 2 };
      station = findClosestGalp(galpStations, expanded, usedIds);
    }

    // 3º intento: radio x4 — último recurso para zonas rurales/escasas
    // (Calatayud A-2, Fuente de Cantos A-66, Vinaròs A-7, etc.)
    if (!station) {
      const expanded: RouteWaypoint = { ...waypoint, radiusKm: waypoint.radiusKm * 4 };
      station = findClosestGalp(galpStations, expanded, usedIds);
    }

    if (station) {
      usedIds.add(station.ideess);
      result.push({ station, position });
    }
  });

  return result;
}
