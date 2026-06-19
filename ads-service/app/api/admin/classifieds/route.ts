import { NextResponse } from 'next/server';
import { getClassifiedsCollection } from '../../../../lib/collections';
import { checkAuth } from '../../../../lib/auth';
import { headers } from 'next/headers';

export const runtime = 'nodejs';

// GET /api/admin/classifieds?status=pending — list for moderation
export async function GET(request: Request) {
  if (!checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'pending';
  const col = await getClassifiedsCollection();
  const items = await col
    .find({ moderationStatus: status, isActive: true })
    .sort({ createdAt: 1 })
    .toArray();
  return NextResponse.json(items);
}
