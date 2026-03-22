/**
 * Lazy server initialization singleton.
 * Called on first API request to set up cron jobs and initial data.
 * This runs in the Node.js API route context, which is always server-side.
 */

let initialized = false;
let initializing = false;

export async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  if (initializing) {
    // Wait for ongoing initialization
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (initialized || !initializing) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
    return;
  }

  initializing = true;

  try {
    // Start cron job
    const { startCronJob } = await import('./cron');
    startCronJob();

    // Check and run initial setup in background
    const { getAllTrackedStationIds } = await import('./db');
    const ids = getAllTrackedStationIds();

    if (ids.length === 0) {
      console.log('[Init] No stations — scheduling background setup...');
      // Don't await — let it run in background so API isn't blocked
      import('./priceUpdater').then(({ setupStations }) =>
        setupStations().catch((err) =>
          console.error('[Init] Background setup error:', err)
        )
      );
    }

    initialized = true;
    console.log('[Init] Server initialized');
  } catch (err) {
    console.error('[Init] Initialization error:', err);
    initializing = false;
    throw err;
  } finally {
    initializing = false;
  }
}
