import { NextResponse } from 'next/server';
import { getWholesaleCollection } from '../../../../../lib/collections';
import { checkAuth } from '../../../../../lib/auth';
import { ObjectId } from 'mongodb';

export const runtime = 'nodejs';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  delete body._id;
  if (body.paidUntil) body.paidUntil = new Date(body.paidUntil);
  const col = await getWholesaleCollection();
  await col.updateOne({ _id: new ObjectId(params.id) }, { $set: { ...body, updatedAt: new Date() } });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  if (!checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const col = await getWholesaleCollection();
  await col.deleteOne({ _id: new ObjectId(params.id) });
  return NextResponse.json({ success: true });
}
