import { NextResponse } from 'next/server';
import { getWholesaleCollection } from '../../../../lib/collections';

export const runtime = 'nodejs';

// GET /api/wholesale/:id — detail + increment clicks
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const col = await getWholesaleCollection();
    const { ObjectId } = await import('mongodb');
    const item = await col.findOneAndUpdate(
      { _id: new ObjectId(params.id) },
      { $inc: { views: 1, clicks: 1 } },
      { returnDocument: 'after' }
    );
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(item);
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
