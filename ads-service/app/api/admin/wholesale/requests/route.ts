import { NextResponse } from 'next/server';
import { getWholesaleRequestsCollection } from '../../../../../lib/collections';
import { checkAuth } from '../../../../../lib/auth';
import { ObjectId } from 'mongodb';

export const runtime = 'nodejs';

export async function GET() {
  if (!checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const col = await getWholesaleRequestsCollection();
  const items = await col.find({}).sort({ createdAt: -1 }).toArray();
  return NextResponse.json(items);
}

export async function DELETE(request: Request) {
  if (!checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const col = await getWholesaleRequestsCollection();
  await col.deleteOne({ _id: new ObjectId(id) });
  return NextResponse.json({ success: true });
}
