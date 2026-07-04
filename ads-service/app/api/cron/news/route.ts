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
      query: 'Таджикистан Узбекистан Китай таможня пошлины импорт курс юаня сомони сум стройматериалы текстиль одежда 2026',
      search_depth: 'basic',
      max_results: 12,
      include_domains: ['asia-plus.tj', 'avesta.tj', 'news.tj', 'kun.uz', 'gazeta.uz', 'daryo.uz', 'sputnik-tj.com', 'khovar.tj'],
    }),
  });

  if (!response.ok) throw new Error(`Tavily error: ${response.status}`);
  const data = await response.json();
  return data.results || [];
}

interface RecentArticle {
  url: string;
  title_ru: string;
}

async function getRecentlyPublished(daysBack: number = 3): Promise<RecentArticle[]> {
  const col = await getNewsCollection();
  const docs = await col.find({}).sort({ generatedAt: -1 }).limit(daysBack).toArray();
  return docs.flatMap((d: any) =>
    (d.articles || []).map((a: any) => ({ url: a.url, title_ru: a.title_ru }))
  );
}

async function fetchNewsFromDuckDuckGo(): Promise<TavilyResult[]> {
  // DuckDuckGo Instant Answer — free, no key required
  // Note: returns limited results but works as fallback
  const query = encodeURIComponent('торговля базар Таджикистан цены 2026');
  const response = await fetch(
    `https://api.duckduckgo.com/?q=${query}&format=json&t=torgo`,
    { headers: { 'User-Agent': 'Torgo/1.0' } }
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

async function processWithGroq(
  rawArticles: TavilyResult[],
  recentArticles: RecentArticle[]
): Promise<{ articles: any[], model: string }> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error('GROQ_API_KEY not set');

  // Build compact context to minimize tokens
  const context = rawArticles
    .slice(0, 6)
    .map((a, i) => `[${i + 1}] ${a.title}\nURL: ${a.url}\nСниппет: ${a.content?.slice(0, 200)}`)
    .join('\n---\n');

  const avoidBlock = recentArticles.length > 0
    ? `\n\nЭТИ ТЕМЫ УЖЕ БЫЛИ ОПУБЛИКОВАНЫ ЗА ПОСЛЕДНИЕ ${recentArticles.length > 0 ? '3' : '0'} ДНЯ — НЕ ВЫБИРАЙ ИХ ПОВТОРНО, даже если новость пришла из другого источника и про то же событие (например "курс юаня снова растёт" — если уже было "курс юаня растёт", это дубль):\n${recentArticles.map(a => `- ${a.title_ru}`).join('\n')}`
    : '';

  const prompt = `Ты помощник для двух конкретных групп базарных торговцев Таджикистана:
1. Продавцы рынка "Атуш Сомон" — торгуют одеждой, текстилем, обувью. Завозят товар в основном из Китая.
2. Продавцы рынка "Баракат" — торгуют стройматериалами (цемент, арматура, плитка, краска). Завозят товар из Китая и Узбекистана.

Из новостей ниже выбери 3-4 САМЫЕ ПОЛЕЗНЫЕ для них. Приоритет (от высокого к низкому):
1. Изменения таможенных пошлин/правил на импорт из Китая или Узбекистана
2. Курс юаня (CNY), узбекского сума (UZS), доллара — особенно резкие изменения
3. Закрытие/задержки на границе с Узбекистаном или на маршрутах из Китая (логистика, перевозка)
4. Цены на стройматериалы (цемент, металл, стройсырьё) на внутреннем или китайском рынке
5. Новости о текстильном/швейном производстве в Китае, которые влияют на цены одежды
6. Цены на топливо/бензин — влияют на стоимость перевозки товара

ИГНОРИРУЙ общие политические новости, новости не связанные с торговлей/импортом/ценами.${avoidBlock}

Новости:
${context}

Верни ТОЛЬКО JSON массив (без markdown, без комментариев):
[
  {
    "title_ru": "заголовок на русском",
    "title_tg": "заголовок на таджикском",
    "title_uz": "заголовок на узбекском",
    "summary_ru": "ДВА предложения на русском: 1) что произошло, 2) конкретный совет повелительным наклонением (закупайте сейчас / повысьте цену / отложите закуп / следите за курсом)",
    "summary_tg": "ДВА предложения на таджикском по той же структуре: факт + совет",
    "summary_uz": "ДВА предложения на узбекском по той же структуре: факт + совет",
    "url": "оригинальная ссылка",
    "source": "название источника",
    "category": "customs|currency|logistics|construction_materials|textile|fuel|general",
    "relevanceScore": 8
  }
]`;

  const models = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
  let lastError: any = null;

  for (const model of models) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 1500,
        }),
      });

      if (!response.ok) throw new Error(`Groq error [${model}]: ${response.status}`);
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '[]';

      // Safe parse — strip markdown fences if present
      const cleaned = text.replace(/```json|```/g, '').trim();
      return { articles: JSON.parse(cleaned), model };
    } catch (err) {
      console.warn(`Groq model ${model} failed, trying next...`, err);
      lastError = err;
    }
  }

  throw lastError || new Error('All Groq models failed');
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

    // Дедупликация: убираем статьи, ссылки на которые уже публиковались за последние 3 дня
    const recentArticles = await getRecentlyPublished(3);
    const recentUrls = new Set(recentArticles.map(a => a.url));
    rawArticles = rawArticles.filter(a => !recentUrls.has(a.url));

    if (rawArticles.length === 0) {
      return NextResponse.json({ error: 'No new articles after deduplication' }, { status: 503 });
    }

    // 2. Process with Groq AI
    const { articles, model } = await processWithGroq(rawArticles, recentArticles);

    // 3. Save to MongoDB with upsert to prevent race condition duplicates
    const doc = {
      date: todayStr,
      articles,
      generatedAt: new Date(),
      model,
      rawCount: rawArticles.length,
    };

    await col.updateOne(
      { date: todayStr },
      { $setOnInsert: doc },
      { upsert: true }
    );

    return NextResponse.json({ success: true, date: todayStr, articlesCount: articles.length });
  } catch (e: any) {
    console.error('Cron news error:', e);
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
  }
}
