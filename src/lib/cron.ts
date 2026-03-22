import cron from 'node-cron';
import { updatePrices } from './priceUpdater';

let cronStarted = false;

export function startCronJob(): void {
  if (cronStarted) {
    console.log('[Cron] Cron job already running, skipping');
    return;
  }

  // Run every day at 8:00 AM Madrid time (CET/CEST)
  cron.schedule(
    '0 8 * * *',
    async () => {
      console.log('[Cron] Daily price update triggered at', new Date().toISOString());
      try {
        const result = await updatePrices();
        console.log('[Cron] Daily update complete:', result.message);
      } catch (error) {
        console.error('[Cron] Daily update failed:', error);
      }
    },
    {
      timezone: 'Europe/Madrid',
    }
  );

  cronStarted = true;
  console.log('[Cron] Daily price update scheduled for 08:00 Europe/Madrid');
}
