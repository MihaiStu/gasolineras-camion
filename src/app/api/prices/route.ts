import { NextResponse } from 'next/server';
import { ROUTES } from '@/lib/routes';
import { getStationsForRoute, getLastUpdateTime } from '@/lib/db';
import { ensureInitialized } from '@/lib/server-init';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await ensureInitialized();

    const routeData = ROUTES.map((route) => {
      const stations = getStationsForRoute(route.id);
      return {
        route: {
          id: route.id,
          name: route.name,
          shortName: route.shortName,
          color: route.color,
          colorClass: route.colorClass,
          borderClass: route.borderClass,
          bgClass: route.bgClass,
        },
        stations,
      };
    });

    const lastUpdated = getLastUpdateTime();

    return NextResponse.json({
      success: true,
      lastUpdated,
      routes: routeData,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[API /prices] Error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
