import { NextResponse } from 'next/server';
import { getWholesaleRequestsCollection } from '../../../../lib/collections';

export const runtime = 'nodejs';

// POST /api/wholesale/request — public form submission
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { companyName, contactPhone, contactTelegram, description, categories, cities } = body;

    if (!companyName || !contactPhone) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Basic validation
    const validCategories = ['clothing', 'shoes', 'accessories', 'food', 'electronics', 'other'];
    if (categories && Array.isArray(categories)) {
      if (!categories.every(cat => validCategories.includes(cat))) {
        return NextResponse.json({ error: 'Invalid categories' }, { status: 400 });
      }
    }

    const col = await getWholesaleRequestsCollection();

    // Basic rate limit: check if a pending request from this phone exists in the last 24h
    const existing = await col.findOne({
      contactPhone,
      createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    if (existing) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const result = await col.insertOne({
      companyName,
      contactPhone,
      contactTelegram,
      description,
      categories: Array.isArray(categories) ? categories : [],
      cities: Array.isArray(cities) ? cities : [],
      status: 'pending',
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true, id: result.insertedId }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
