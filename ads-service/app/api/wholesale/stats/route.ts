import { NextResponse } from 'next/server';
import { getWholesaleCollection } from '../../../../lib/collections';

export const runtime = 'nodejs';

// GET /api/wholesale/stats?token=... — get ad stats by secure token
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

    const col = await getWholesaleCollection();
    const item = await col.findOne({ dashboardToken: token });

    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Return only necessary stats to avoid leaking other data
    return NextResponse.json({
      companyName: item.companyName,
      views: item.views || 0,
      clicks: item.clicks || 0,
      calls: item.calls || 0,
      telegramClicks: item.telegramClicks || 0,
      isActive: item.isActive,
      paidUntil: item.paidUntil,
    });
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
