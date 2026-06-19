import { NextResponse } from 'next/server';
import { checkAuth } from '../../../../../lib/auth';

export const runtime = 'nodejs';

// POST /api/admin/news/refresh — proxy to cron route with secret
export async function POST() {
  if (!checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }

  try {
    // Determine base URL from request or env
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/cron/news`, {
      headers: {
        'Authorization': `Bearer ${cronSecret}`
      }
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to refresh news' }, { status: 500 });
  }
}
