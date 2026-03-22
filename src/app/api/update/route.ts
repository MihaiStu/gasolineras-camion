import { NextResponse } from 'next/server';
import { updatePrices, setupStations } from '@/lib/priceUpdater';
import { getAllTrackedStationIds } from '@/lib/db';
import { ensureInitialized } from '@/lib/server-init';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await ensureInitialized();

    const trackedIds = getAllTrackedStationIds();

    if (trackedIds.length === 0) {
      console.log('[API /update] No stations found, running setup first...');
      await setupStations();
    }

    const result = await updatePrices();

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[API /update] Error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
