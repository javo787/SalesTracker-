import { NextResponse } from 'next/server';
import { checkAuth } from '../../../../lib/auth';
import { sendPushToTopic } from '../../../../lib/firebaseAdmin';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!checkAuth()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { title, body, url } = await request.json();
    if (!title?.trim() || !body?.trim()) {
      return NextResponse.json({ error: 'title and body are required' }, { status: 400 });
    }

    await sendPushToTopic('app_announcements', title.trim(), body.trim(), url ? { url } : undefined);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Failed to send push notification:', e);
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}
