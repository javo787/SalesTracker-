import { NextResponse } from 'next/server';
import { getClassifiedsCollection } from '../../../../../lib/collections';

export const runtime = 'nodejs';

// POST /api/classifieds/:id/contact — increment contactViews counter
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const col = await getClassifiedsCollection();
    await col.updateOne({ _id: params.id as any }, { $inc: { contactViews: 1 } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
