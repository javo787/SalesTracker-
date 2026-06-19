import { NextResponse } from 'next/server';
import clientPromise from '../../../../lib/mongodb';
import { checkAuth } from '../../../../lib/auth';

export async function GET() {
  if (!checkAuth()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB_NAME || 'savdo');
    const ads = await db.collection('direct_ads').find({}).sort({ priority: -1 }).toArray();
    return NextResponse.json(ads);
  } catch (e) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!checkAuth()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB_NAME || 'savdo');

    const newAd = {
      ...body,
      clicks: 0,
      createdAt: new Date(),
    };

    const result = await db.collection('direct_ads').insertOne(newAd);
    return NextResponse.json({ ...newAd, _id: result.insertedId });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to create ad' }, { status: 500 });
  }
}
