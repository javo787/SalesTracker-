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

// Тир 1: региональные источники на таджикском/узбекском/русском — наивысший приоритет.
const REGIONAL_DOMAINS = ['asia-plus.tj', 'avesta.tj', 'news.tj', 'kun.uz', 'gazeta.uz', 'daryo.uz', 'sputnik-tj.com', 'khovar.tj'];
// Тир 3: англоязычные источники — последний резерв, используется, только если
// региональных материалов недостаточно (см. fetchNewsTiered).
const ENGLISH_FALLBACK_DOMAINS = ['reuters.com', 'bloomberg.com', 'tradingeconomics.com'];
const MIN_ARTICLES_TARGET = 4;

async function tavilySearch(query: string, domains: string[] | undefined, maxResults: number): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error('TAVILY_API_KEY not set');

  const body: Record<string, unknown> = {
    api_key: apiKey,
    query,
    search_depth: 'basic',
    max_results: maxResults,
  };
  if (domains?.length) body.include_domains = domains;

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`Tavily error: ${response.status}`);
  const data = await response.json();
  return data.results || [];
}

// Приоритет источников: тадж./узб./рус. региональные сайты → более широкий
// поиск на русском без ограничения по доменам → англоязычные источники
// (только если первых двух тиров не хватило). Раньше при сбое Tavily мы
// падали сразу на DuckDuckGo Instant Answer, который отдаёт нерелевантные
// англоязычные "мгновенные ответы" — отсюда и жалоба "источники только на
// английском". Теперь английский — осознанный последний резерв, а не
// случайный побочный эффект слабого фолбэка.
async function fetchNewsTiered(): Promise<{ results: TavilyResult[]; tier: string }> {
  const regionalQuery = 'Таджикистан Узбекистан Китай таможня пошлины импорт курс юаня сомони сум стройматериалы текстиль одежда 2026';

  let regional: TavilyResult[] = [];
  try {
    regional = await tavilySearch(regionalQuery, REGIONAL_DOMAINS, 12);
  } catch (err) {
    console.warn('Tavily regional search failed:', err);
  }
  if (regional.length >= MIN_ARTICLES_TARGET) {
    return { results: regional, tier: 'regional' };
  }

  let broad: TavilyResult[] = [];
  try {
    broad = await tavilySearch(regionalQuery, undefined, 12);
  } catch (err) {
    console.warn('Tavily broad search failed:', err);
  }
  const combined = [...regional, ...broad.filter(r => !regional.some(a => a.url === r.url))];
  if (combined.length > 0) {
    // Есть хоть что-то региональное/русскоязычное — используем его,
    // до английского не опускаемся, даже если статей меньше MIN_ARTICLES_TARGET.
    return { results: combined, tier: regional.length ? 'regional+broad' : 'broad' };
  }

  // Регионалка и широкий русский поиск дали 0 результатов — только тогда
  // подключаем англоязычные источники как последний резерв.
  try {
    const englishQuery = 'Tajikistan Uzbekistan China customs duties yuan exchange rate construction materials textile 2026';
    const english = await tavilySearch(englishQuery, ENGLISH_FALLBACK_DOMAINS, 12);
    return { results: english, tier: english.length ? 'english_fallback' : 'none' };
  } catch (err) {
    console.warn('Tavily English fallback failed:', err);
    return { results: [], tier: 'none' };
  }
}

interface RecentArticle {
  url: string;
  title_ru: string;
}

// Окно дедупликации совпадает с окном показа ленты клиенту (7 дней, см.
// /api/news), чтобы одна и та же тема не всплывала повторно, пока статья
// ещё видна пользователю.
const DEDUP_WINDOW_DAYS = 7;

async function getRecentlyPublished(daysBack: number = DEDUP_WINDOW_DAYS): Promise<RecentArticle[]> {
  const col = await getNewsCollection();
  const docs = await col.find({}).sort({ generatedAt: -1 }).limit(daysBack).toArray();
  return docs.flatMap((d: any) =>
    (d.articles || []).map((a: any) => ({ url: a.url, title_ru: a.title_ru }))
  );
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
    ? `\n\nЭТИ ТЕМЫ УЖЕ БЫЛИ ОПУБЛИКОВАНЫ ЗА ПОСЛЕДНИЕ ${DEDUP_WINDOW_DAYS} ДНЕЙ — НЕ ВЫБИРАЙ ИХ ПОВТОРНО, даже если новость пришла из другого источника и про то же событие (например "курс юаня снова растёт" — если уже было "курс юаня растёт", это дубль):\n${recentArticles.map(a => `- ${a.title_ru}`).join('\n')}`
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
    "title_en": "заголовок на английском",
    "summary_ru": "ДВА предложения на русском: 1) что произошло, 2) конкретный совет повелительным наклонением (закупайте сейчас / повысьте цену / отложите закуп / следите за курсом)",
    "summary_tg": "ДВА предложения на таджикском по той же структуре: факт + совет",
    "summary_uz": "ДВА предложения на узбекском по той же структуре: факт + совет",
    "summary_en": "ДВА предложения на английском по той же структуре: факт + совет",
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

    // 1. Fetch raw news — приоритет: региональные (тг/уз/ру) источники →
    // широкий русскоязычный поиск → английские источники как последний резерв
    const { results: tieredResults, tier } = await fetchNewsTiered();
    let rawArticles: TavilyResult[] = tieredResults;

    if (rawArticles.length === 0) {
      return NextResponse.json({ error: 'No articles fetched from any source' }, { status: 503 });
    }

    // Дедупликация: убираем статьи, ссылки на которые уже публиковались за последнюю неделю
    const recentArticles = await getRecentlyPublished();
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
      sourceTier: tier, // для отладки: 'regional' | 'regional+broad' | 'broad' | 'english_fallback' | 'none'
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
