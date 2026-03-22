import { fetchAllStations } from './minetur';
import {
  getAllTrackedStationIds,
  upsertPriceHistory,
  getRouteStationCount,
  upsertStation,
  upsertRouteStation,
  clearRouteStations,
} from './db';
import { ROUTES } from './routes';
import { selectStationsForRoute } from './stationSelector';

export async function updatePrices(): Promise<{
  updated: number;
  errors: number;
  message: string;
}> {
  console.log('[PriceUpdater] Starting price update...');

  try {
    const allStations = await fetchAllStations();
    console.log(`[PriceUpdater] Fetched ${allStations.length} stations from MINETUR`);

    const trackedIds = getAllTrackedStationIds();

    if (trackedIds.length === 0) {
      console.log('[PriceUpdater] No stations tracked yet. Running setup...');
      await setupStations(allStations);
      return await updatePricesFromFetched(allStations);
    }

    return await updatePricesFromFetched(allStations);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[PriceUpdater] Error:', msg);
    return { updated: 0, errors: 1, message: `Error: ${msg}` };
  }
}

async function updatePricesFromFetched(
  allStations: Awaited<ReturnType<typeof fetchAllStations>>
): Promise<{ updated: number; errors: number; message: string }> {
  const trackedIds = getAllTrackedStationIds();
  const stationMap = new Map(allStations.map((s) => [s.ideess, s]));
  const today = new Date().toISOString().split('T')[0];

  let updated = 0;
  let errors = 0;

  for (const ideess of trackedIds) {
    const station = stationMap.get(ideess);
    if (!station) {
      console.warn(`[PriceUpdater] Station ${ideess} not found in MINETUR response`);
      errors++;
      continue;
    }

    try {
      upsertPriceHistory({
        station_ideess: ideess,
        date: today,
        gasoleo_a: station.gasoleo_a,
        gasoleo_b: station.gasoleo_b,
        gasolina_95: station.gasolina_95,
        adblue: station.adblue,
      });
      updated++;
    } catch (err) {
      console.error(`[PriceUpdater] Error saving price for ${ideess}:`, err);
      errors++;
    }
  }

  const message = `Updated ${updated} stations, ${errors} errors`;
  console.log(`[PriceUpdater] ${message}`);
  return { updated, errors, message };
}

export async function setupStations(
  allStations?: Awaited<ReturnType<typeof fetchAllStations>>,
  force = false
): Promise<void> {
  console.log(`[Setup] Setting up stations... (force=${force})`);

  if (force) {
    console.log('[Setup] Force mode: clearing all route_stations for re-selection');
    clearRouteStations();
  }

  const stations = allStations ?? (await fetchAllStations());
  console.log(`[Setup] Working with ${stations.length} stations`);

  for (const route of ROUTES) {
    const existingCount = getRouteStationCount(route.id);
    if (existingCount >= route.waypoints.length) {
      console.log(`[Setup] Route ${route.id} already has ${existingCount} stations, skipping`);
      continue;
    }

    console.log(`[Setup] Selecting stations for route: ${route.name}`);
    const selected = selectStationsForRoute(stations, route);

    if (selected.length === 0) {
      console.warn(`[Setup] No stations found for route ${route.id}`);
      continue;
    }

    for (const { station, position } of selected) {
      upsertStation({
        ideess: station.ideess,
        name: station.name,
        brand: station.brand,
        locality: station.locality,
        province: station.province,
        lat: station.lat,
        lon: station.lon,
        address: station.address,
      });

      upsertRouteStation({
        route_id: route.id,
        station_ideess: station.ideess,
        position,
      });

      console.log(
        `[Setup] Route ${route.id} pos ${position}: ${station.brand} in ${station.locality} (${station.ideess})`
      );
    }
  }

  console.log('[Setup] Station setup complete');

  // Immediately update prices after setup
  const today = new Date().toISOString().split('T')[0];
  const trackedIds = getAllTrackedStationIds();
  const stationMap = new Map(stations.map((s) => [s.ideess, s]));

  for (const ideess of trackedIds) {
    const s = stationMap.get(ideess);
    if (s) {
      upsertPriceHistory({
        station_ideess: ideess,
        date: today,
        gasoleo_a: s.gasoleo_a,
        gasoleo_b: s.gasoleo_b,
        gasolina_95: s.gasolina_95,
        adblue: s.adblue,
      });
    }
  }
  console.log('[Setup] Initial prices saved');
}
