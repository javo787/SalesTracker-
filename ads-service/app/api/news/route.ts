import { NextResponse } from 'next/server';
import { getNewsCollection, ensureIndexes } from '../../../lib/collections';

export const runtime = 'nodejs';

// GET /api/news — returns latest news feed document
export async function GET() {
  try {
    await ensureIndexes();
    const col = await getNewsCollection();
    const latest = await col.findOne({}, { sort: { generatedAt: -1 } });
    if (!latest) {
      return NextResponse.json({ articles: [], generatedAt: null, message: 'No news yet' });
    }
    return NextResponse.json(latest);
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
