import { NextResponse } from 'next/server';
import { getWholesaleCollection } from '../../../../../lib/collections';

export const runtime = 'nodejs';

// POST /api/wholesale/:id/action — track call or telegram click
// Body: { type: 'call' | 'telegram' }
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { type } = await request.json();
    if (!['call', 'telegram'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }
    const col = await getWholesaleCollection();
    const { ObjectId } = await import('mongodb');
    const field = type === 'call' ? 'calls' : 'telegramClicks';
    await col.updateOne({ _id: new ObjectId(params.id) }, { $inc: { [field]: 1 } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
