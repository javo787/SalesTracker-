import { NextResponse } from 'next/server';
import clientPromise from '../../../../../lib/mongodb';
import { ObjectId } from 'mongodb';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB_NAME || 'savdo');

    await db.collection('direct_ads').updateOne(
      { _id: new ObjectId(id) },
      { $inc: { clicks: 1 } }
    );

    // Also record in a separate collection for history
    await db.collection('ad_clicks').insertOne({
      adId: new ObjectId(id),
      timestamp: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to record click' }, { status: 500 });
  }
}
