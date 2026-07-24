import { NextResponse } from 'next/server';
import { checkAuth } from '../../../../lib/auth';
import { sendPushToTopic } from '../../../../lib/firebaseAdmin';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!checkAuth()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const {
      url,
      imageUrl,
      languages // expect an object like { ru?: { title, body }, tg?: { title, body }, uz?: { title, body } }
    } = await request.json();

    if (!languages || typeof languages !== 'object') {
      return NextResponse.json({ error: 'languages object is required' }, { status: 400 });
    }

    const validLangs = ['ru', 'tg', 'uz'];
    let sentCount = 0;

    for (const lang of validLangs) {
      const payload = languages[lang];
      if (payload && payload.title?.trim() && payload.body?.trim()) {
        const topic = `app_announcements_${lang}`;
        await sendPushToTopic(
          topic,
          payload.title.trim(),
          payload.body.trim(),
          url ? { url } : undefined,
          imageUrl ? imageUrl.trim() : undefined
        );
        sentCount++;
      }
    }

    if (sentCount === 0) {
      return NextResponse.json({ error: 'At least one language title and body must be provided' }, { status: 400 });
    }

    return NextResponse.json({ success: true, sentCount });
  } catch (e) {
    console.error('Failed to send push notification:', e);
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}
