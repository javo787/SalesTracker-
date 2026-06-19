import { NextResponse } from 'next/server';
import clientPromise from '../../../lib/mongodb';

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB_NAME || 'savdo');

    const ads = await db.collection('direct_ads')
      .find({ active: true })
      .sort({ priority: -1 })
      .toArray();

    return NextResponse.json(ads);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to fetch ads' }, { status: 500 });
  }
}
