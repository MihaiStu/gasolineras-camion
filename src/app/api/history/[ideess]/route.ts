import { NextRequest, NextResponse } from 'next/server';
import { getPriceHistory } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { ideess: string } }
) {
  try {
    const { ideess } = params;
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') ?? '30', 10);

    if (!ideess) {
      return NextResponse.json(
        { success: false, error: 'Missing station ID' },
        { status: 400 }
      );
    }

    const history = getPriceHistory(ideess, Math.min(days, 90));

    return NextResponse.json({
      success: true,
      ideess,
      history,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[API /history] Error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
