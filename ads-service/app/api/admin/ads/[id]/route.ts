import { NextResponse } from 'next/server';
import clientPromise from '../../../../../lib/mongodb';
import { ObjectId } from 'mongodb';
import { checkAuth } from '../../../../../lib/auth';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!checkAuth()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const id = params.id;
    const body = await request.json();
    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB_NAME || 'savdo');

    // Remove _id from body if it exists
    delete body._id;

    await db.collection('direct_ads').updateOne(
      { _id: new ObjectId(id) },
      { $set: body }
    );

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to update ad' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!checkAuth()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const id = params.id;
    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB_NAME || 'savdo');

    await db.collection('direct_ads').deleteOne({ _id: new ObjectId(id) });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to delete ad' }, { status: 500 });
  }
}
