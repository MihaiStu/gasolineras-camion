import { NextResponse } from 'next/server';
import { setupStations } from '@/lib/priceUpdater';
import { ensureInitialized } from '@/lib/server-init';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    await ensureInitialized();
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';
    console.log(`[API /setup] Manual setup triggered (force=${force})`);
    await setupStations(undefined, force);

    return NextResponse.json({
      success: true,
      message: 'Estaciones configuradas correctamente',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[API /setup] Error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
