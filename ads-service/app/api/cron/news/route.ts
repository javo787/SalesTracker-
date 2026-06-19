import { NextResponse } from 'next/server';
import { getNewsCollection } from '../../../../lib/collections';

export const runtime = 'nodejs';
// Vercel: max 60 seconds for cron
export const maxDuration = 60;

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

async function fetchNewsFromTavily(): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error('TAVILY_API_KEY not set');

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: 'Таджикистан Узбекистан торговля базар цены импорт налоги валюта сомони 2026',
      search_depth: 'basic',
      max_results: 8,
      include_domains: ['asia-plus.tj', 'avesta.tj', 'news.tj', 'kun.uz', 'gazeta.uz', 'daryo.uz'],
    }),
  });

  if (!response.ok) throw new Error(`Tavily error: ${response.status}`);
  const data = await response.json();
  return data.results || [];
}

async function fetchNewsFromDuckDuckGo(): Promise<TavilyResult[]> {
  // DuckDuckGo Instant Answer — free, no key required
  // Note: returns limited results but works as fallback
  const query = encodeURIComponent('торговля базар Таджикистан цены 2026');
  const response = await fetch(
    `https://api.duckduckgo.com/?q=${query}&format=json&t=savdoapp`,
    { headers: { 'User-Agent': 'SavdoApp/1.0' } }
  );
  if (!response.ok) return [];
  const data = await response.json();
  const results: TavilyResult[] = [];
  if (data.RelatedTopics) {
    for (const topic of data.RelatedTopics.slice(0, 5)) {
      if (topic.FirstURL && topic.Text) {
        results.push({ title: topic.Text, url: topic.FirstURL, content: topic.Text, score: 0.5 });
      }
    }
  }
  return results;
}

async function processWithGroq(rawArticles: TavilyResult[]): Promise<any[]> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error('GROQ_API_KEY not set');

  // Build compact context to minimize tokens
  const context = rawArticles
    .slice(0, 6)
    .map((a, i) => `[${i + 1}] ${a.title}\nURL: ${a.url}\nСниппет: ${a.content?.slice(0, 200)}`)
    .join('\n---\n');

  const prompt = `Ты помощник для базарных торговцев Центральной Азии.
Из этих новостей выбери 3-4 наиболее ПОЛЕЗНЫХ для базарного торговца (цены, налоги, валюта, импорт/экспорт, погода влияющая на товары).
Для каждой верни JSON объект.

Новости:
${context}

Верни ТОЛЬКО JSON массив (без markdown, без комментариев):
[
  {
    "title_ru": "заголовок на русском",
    "title_tg": "заголовок на таджикском",
    "title_uz": "заголовок на узбекском",
    "summary_ru": "2 предложения для торговца на русском",
    "summary_tg": "2 предложения на таджикском",
    "summary_uz": "2 предложения на узбекском",
    "url": "оригинальная ссылка",
    "source": "название источника",
    "category": "prices|currency|taxes|import_export|weather|general",
    "relevanceScore": 8
  }
]`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1500,
    }),
  });

  if (!response.ok) throw new Error(`Groq error: ${response.status}`);
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '[]';

  // Safe parse — strip markdown fences if present
  const cleaned = text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

// GET /api/cron/news — called by Vercel Cron at 03:00 UTC daily
export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const col = await getNewsCollection();

    // Idempotent: skip if already generated today
    const existing = await col.findOne({ date: todayStr });
    if (existing) {
      return NextResponse.json({ message: 'Already generated for today', date: todayStr });
    }

    // 1. Fetch raw news
    let rawArticles: TavilyResult[] = [];
    try {
      rawArticles = await fetchNewsFromTavily();
    } catch (tavilyErr) {
      console.warn('Tavily failed, trying DuckDuckGo:', tavilyErr);
      rawArticles = await fetchNewsFromDuckDuckGo();
    }

    if (rawArticles.length === 0) {
      return NextResponse.json({ error: 'No articles fetched from any source' }, { status: 503 });
    }

    // 2. Process with Groq AI
    const articles = await processWithGroq(rawArticles);

    // 3. Save to MongoDB
    await col.insertOne({
      date: todayStr,
      articles,
      generatedAt: new Date(),
      model: 'llama-3.3-70b-versatile',
      rawCount: rawArticles.length,
    });

    return NextResponse.json({ success: true, date: todayStr, articlesCount: articles.length });
  } catch (e: any) {
    console.error('Cron news error:', e);
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
  }
}
