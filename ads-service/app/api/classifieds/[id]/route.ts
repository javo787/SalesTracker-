import { NextResponse } from 'next/server';
import { getClassifiedsCollection } from '../../../../lib/collections';
import { deleteImage } from '../../../../lib/cloudinary';
import jwt from 'jsonwebtoken';

export const runtime = 'nodejs';

// GET /api/classifieds/:id — detail view, increments views
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const col = await getClassifiedsCollection();
    const item = await col.findOneAndUpdate(
      { _id: params.id as any, isActive: true },
      { $inc: { views: 1 } },
      { returnDocument: 'after' }
    );
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    // Remove internal fields from response
    const { imagePublicIds, ...safe } = item as any;
    return NextResponse.json(safe);
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// DELETE /api/classifieds/:id — soft delete, cleanup Cloudinary
// Header: Authorization: Bearer <token>
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      console.error('JWT_SECRET is not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    let userId: string | null = null;

    try {
      const decoded = jwt.verify(token, jwtSecret) as any;
      userId = decoded.userId;
    } catch (err) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const col = await getClassifiedsCollection();

    const item = await col.findOne({ _id: params.id as any });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Authorization: only owner can delete.
    // If userId does not match, return 403. This also covers guest posts (null userId),
    // which cannot be deleted via this endpoint by anyone else (or at all if userId is null).
    if (item.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Delete images from Cloudinary
    if (item.imagePublicIds?.length) {
      await Promise.allSettled(item.imagePublicIds.map((id: string) => deleteImage(id)));
    }

    await col.updateOne({ _id: params.id as any }, { $set: { isActive: false, updatedAt: new Date() } });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
