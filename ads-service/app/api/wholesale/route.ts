import { NextResponse } from 'next/server';
import { getWholesaleCollection, ensureIndexes } from '../../../lib/collections';

export const runtime = 'nodejs';

// GET /api/wholesale?category= — active paid wholesale ads
export async function GET(request: Request) {
  try {
    await ensureIndexes();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    const col = await getWholesaleCollection();
    const now = new Date();

    const filter: any = {
      isActive: true,
      isPaid: true,
      paidUntil: { $gt: now },
    };
    if (category) filter.categories = category;

    const items = await col
      .find(filter)
      .sort({ priority: -1, createdAt: -1 })
      .limit(50)
      .toArray();

    return NextResponse.json(items);
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
