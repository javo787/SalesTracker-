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
      .sort({ tier: -1, priority: -1, createdAt: -1 })
      .limit(50)
      .toArray();

    // Increment views for all returned ads (fire and forget)
    if (items.length > 0) {
      const ids = items.map(item => item._id);
      col.updateMany({ _id: { $in: ids } }, { $inc: { views: 1 } }).catch(console.error);
    }

    return NextResponse.json(items);
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
