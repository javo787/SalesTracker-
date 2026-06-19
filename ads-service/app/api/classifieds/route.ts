import { NextResponse } from 'next/server';
import { getClassifiedsCollection, ensureIndexes } from '../../../lib/collections';
import { uploadImage } from '../../../lib/cloudinary';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'nodejs';

// GET /api/classifieds?city=&category=&page=1&limit=20
export async function GET(request: Request) {
  try {
    await ensureIndexes();
    const { searchParams } = new URL(request.url);
    const city = searchParams.get('city');
    const category = searchParams.get('category');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(20, parseInt(searchParams.get('limit') || '20'));
    const skip = (page - 1) * limit;

    const col = await getClassifiedsCollection();

    const filter: any = {
      isActive: true,
      moderationStatus: 'approved',
      expiresAt: { $gt: new Date() },
    };
    if (city) filter.city = city;
    if (category) filter.category = category;

    const [items, total] = await Promise.all([
      col
        .find(filter)
        .sort({ isPinned: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .project({ _id: 1, title: 1, description: 1, category: 1, city: 1, market: 1,
                    images: 1, price: 1, currency: 1, views: 1, expiresAt: 1,
                    createdAt: 1, userPhone: 1 })
        .toArray(),
      col.countDocuments(filter),
    ]);

    return NextResponse.json({ items, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (e) {
    console.error('GET /api/classifieds error:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST /api/classifieds — create new classified
// Body: { title, description, category, city, market, price, currency,
//         userPhone, userId, images: string[] (base64 URIs, max 3) }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, description, category, city, market, price, currency,
            userPhone, userId, images = [] } = body;

    // Basic validation
    if (!title?.trim() || !description?.trim() || !category || !city) {
      return NextResponse.json({ error: 'Missing required fields: title, description, category, city' }, { status: 400 });
    }
    if (title.length > 100) {
      return NextResponse.json({ error: 'Title max 100 chars' }, { status: 400 });
    }
    if (description.length > 1000) {
      return NextResponse.json({ error: 'Description max 1000 chars' }, { status: 400 });
    }

    const col = await getClassifiedsCollection();

    // Spam protection: max 3 active ads per userId
    if (userId) {
      const activeCount = await col.countDocuments({ userId, isActive: true, moderationStatus: { $ne: 'rejected' } });
      if (activeCount >= 3) {
        return NextResponse.json({ error: 'Maximum 3 active classifieds allowed' }, { status: 429 });
      }
    }

    // Upload images to Cloudinary (max 3)
    const imageUrls: string[] = [];
    const imagePublicIds: string[] = [];
    const imagesToProcess = images.slice(0, 3);

    for (const base64 of imagesToProcess) {
      if (!base64 || !base64.startsWith('data:image')) continue;
      try {
        const { url, publicId } = await uploadImage(base64, 'savdo/classifieds', 800);
        imageUrls.push(url);
        imagePublicIds.push(publicId);
      } catch (imgErr) {
        console.error('Image upload failed:', imgErr);
        // Continue without this image — don't fail the whole request
      }
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days

    const doc = {
      _id: uuidv4(),
      userId: userId || null,
      userName: body.userName || '',
      userPhone: userPhone || '',
      title: title.trim(),
      description: description.trim(),
      category,
      city,
      market: market || '',
      images: imageUrls,
      imagePublicIds,           // keep for deletion
      price: price ? Number(price) : null,
      currency: currency || 'TJS',
      isActive: true,
      isPinned: false,
      views: 0,
      contactViews: 0,
      expiresAt,
      createdAt: now,
      updatedAt: now,
      moderationStatus: 'pending', // requires admin approval
      moderationNote: '',
    };

    await col.insertOne(doc as any);

    return NextResponse.json({ success: true, id: doc._id, message: 'Classified submitted for moderation' }, { status: 201 });
  } catch (e) {
    console.error('POST /api/classifieds error:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
