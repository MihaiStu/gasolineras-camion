/**
 * Manual setup script: npx ts-node src/scripts/setup.ts
 *
 * Fetches all MINETUR stations and selects the best 3 per route.
 * Run this once, or when you want to reset the station selection.
 */

import { setupStations } from '../lib/priceUpdater';

async function main() {
  console.log('=== GasoilRutas Setup ===');
  console.log('Fetching stations from MINETUR API...');
  console.log('This may take 30-60 seconds.\n');

  try {
    await setupStations();
    console.log('\n=== Setup Complete ===');
    console.log('Run "npm run dev" to start the app.');
    process.exit(0);
  } catch (err) {
    console.error('\n=== Setup Failed ===');
    console.error(err);
    process.exit(1);
  }
}

main();
