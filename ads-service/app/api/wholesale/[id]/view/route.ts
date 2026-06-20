import { NextResponse } from 'next/server';
import { getWholesaleCollection } from '../../../../../lib/collections';

export const runtime = 'nodejs';

// POST /api/wholesale/:id/view — track view
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const col = await getWholesaleCollection();
    const { ObjectId } = await import('mongodb');
    await col.updateOne({ _id: new ObjectId(params.id) }, { $inc: { views: 1 } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
