import { NextResponse } from 'next/server';
import { getClassifiedsCollection } from '../../../../lib/collections';
import { deleteImage } from '../../../../lib/cloudinary';

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
// Body: { userId } — must match owner
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const col = await getClassifiedsCollection();

    const item = await col.findOne({ _id: params.id as any });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (item.userId && item.userId !== body.userId) {
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
