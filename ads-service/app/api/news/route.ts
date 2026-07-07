import { NextResponse } from 'next/server';
import { getNewsCollection, ensureIndexes } from '../../../lib/collections';

export const runtime = 'nodejs';

// Сколько дней ленты показываем клиенту. Раньше отдавался только документ
// последнего дня, поэтому новости "вчера" исчезали из ленты, как только
// cron генерировал сегодняшний документ — хотя в базе (TTL 14 дней) они
// никуда не девались. Теперь явное окно показа = 7 дней.
const FEED_WINDOW_DAYS = 7;

// GET /api/news — returns articles generated over the last FEED_WINDOW_DAYS days
export async function GET() {
  try {
    await ensureIndexes();
    const col = await getNewsCollection();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - FEED_WINDOW_DAYS);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const docs = await col
      .find({ date: { $gte: cutoffStr } })
      .sort({ date: -1 })
      .toArray();

    if (!docs.length) {
      return NextResponse.json({ articles: [], generatedAt: null, message: 'No news yet' });
    }

    // Склеиваем статьи всех дней окна в один список, проставляя каждой дату
    // её дня, и убираем дубли по url (на случай, если одна и та же ссылка
    // проскочила дедупликацию в cron и попала в два соседних дня).
    const seenUrls = new Set<string>();
    const articles: any[] = [];
    for (const doc of docs) {
      for (const article of doc.articles || []) {
        if (seenUrls.has(article.url)) continue;
        seenUrls.add(article.url);
        articles.push({ ...article, date: doc.date });
      }
    }

    return NextResponse.json({
      date: docs[0].date,
      generatedAt: docs[0].generatedAt,
      articles,
    });
  } catch (e) {
    console.error('[GET /api/news] Error:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
