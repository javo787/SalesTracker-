import { NextResponse } from 'next/server';
import { getWholesaleCollection } from '../../../../lib/collections';
import { checkAuth } from '../../../../lib/auth';
import { uploadImage } from '../../../../lib/cloudinary';

export const runtime = 'nodejs';

export async function GET() {
  if (!checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const col = await getWholesaleCollection();
  const items = await col.find({}).sort({ createdAt: -1 }).toArray();
  return NextResponse.json(items);
}

// POST /api/admin/wholesale — create wholesale advertiser
// Body: { companyName, contactPhone, contactTelegram, description,
//         categories[], cities[], minOrderAmount, currency, priceRange,
//         priority, paidUntil, images: string[] (base64, max 5) }
export async function POST(request: Request) {
  if (!checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const { images = [], companyName, categories, cities, ...rest } = body;

  // Validation
  if (!companyName?.trim()) {
    return NextResponse.json({ error: 'companyName is required' }, { status: 400 });
  }
  if (!Array.isArray(categories) || categories.length === 0) {
    return NextResponse.json({ error: 'categories must be a non-empty array' }, { status: 400 });
  }
  if (!Array.isArray(cities) || cities.length === 0) {
    return NextResponse.json({ error: 'cities must be a non-empty array' }, { status: 400 });
  }

  const imageUrls: string[] = [];
  const imagePublicIds: string[] = [];
  for (const base64 of images.slice(0, 5)) {
    if (!base64?.startsWith('data:image')) continue;
    try {
      const { url, publicId } = await uploadImage(base64, 'savdo/wholesale', 1000);
      imageUrls.push(url);
      imagePublicIds.push(publicId);
    } catch (e) {
      console.error('Wholesale image upload error:', e);
    }
  }

  const doc = {
    ...rest,
    companyName: companyName.trim(),
    categories,
    cities,
    images: imageUrls,
    imagePublicIds,
    isActive: true,
    isPaid: true,
    tier: rest.tier || 'basic',
    views: 0,
    clicks: 0,
    calls: 0,
    telegramClicks: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    paidUntil: rest.paidUntil ? new Date(rest.paidUntil) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };

  const col = await getWholesaleCollection();
  const result = await col.insertOne(doc);
  return NextResponse.json({ success: true, id: result.insertedId }, { status: 201 });
}
