import { NextResponse } from 'next/server';
import { getClassifiedsCollection } from '../../../../../lib/collections';
import { checkAuth } from '../../../../../lib/auth';
import { deleteImage } from '../../../../../lib/cloudinary';

export const runtime = 'nodejs';

// PATCH /api/admin/classifieds/:id
// Body: { moderationStatus: 'approved'|'rejected', moderationNote?: string }
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const col = await getClassifiedsCollection();
  await col.updateOne(
    { _id: params.id as any },
    { $set: { moderationStatus: body.moderationStatus, moderationNote: body.moderationNote || '', updatedAt: new Date() } }
  );
  return NextResponse.json({ success: true });
}

// DELETE /api/admin/classifieds/:id — hard delete with Cloudinary cleanup
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  if (!checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const col = await getClassifiedsCollection();
  const item = await col.findOne({ _id: params.id as any });
  if (item?.imagePublicIds?.length) {
    await Promise.allSettled(item.imagePublicIds.map((id: string) => deleteImage(id)));
  }
  await col.deleteOne({ _id: params.id as any });
  return NextResponse.json({ success: true });
}
