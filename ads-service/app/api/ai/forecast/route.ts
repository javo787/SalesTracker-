import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

interface SalesDay {
  day: number;
  label: string;
  totalRevenue: number;
  totalProfit: number;
  salesCount: number;
}

interface TopProduct {
  name: string;
  revenue: number;
  profit: number;
  margin: number;
  salesCount: number;
}

interface WeeklyTotal {
  weekLabel: string;
  revenue: number;
  profit: number;
}

interface ForecastRequest {
  language: 'ru' | 'tj' | 'uz';
  currency: string;
  periodDays: number;
  averageDailyRevenue: number;
  salesByDayOfWeek: SalesDay[];
  topProducts: TopProduct[];
  weeklyTotals: WeeklyTotal[];
}

export async function POST(req: NextRequest) {
  try {
    const body: ForecastRequest = await req.json();

    const {
      language,
      currency,
      periodDays,
      averageDailyRevenue,
      salesByDayOfWeek,
      topProducts,
      weeklyTotals,
    } = body;

    // Validation
    if (!language || !currency || periodDays === undefined || averageDailyRevenue === undefined || !salesByDayOfWeek || !topProducts || !weeklyTotals) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }

    if (!GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY is not set');
      return NextResponse.json({ error: 'config_error' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
    }

    const slicedTopProducts = topProducts.slice(0, 5);
    const slicedWeeklyTotals = weeklyTotals.slice(-4); // last 4 weeks

    // Prompts
    let systemInstruction = '';
    let userMessage = '';

    if (language === 'tj') {
      systemInstruction = `Ту маслаҳатдиҳандаи молиявӣ барои тоҷири бозор дар Осиёи Марказӣ ҳастӣ. Танҳо бо забони тоҷикӣ ҷавоб деҳ. Мушаххас ва амалӣ бош. Markdown, ситорачаҳо ё формат истифода набар. Бо матни оддӣ бинавис. Ҳадди аксар 200 калима.`;
      userMessage = `Инҳо маълумоти фурӯш барои ${periodDays} рӯзи охир мебошанд.
Миёнаи даромад дар як рӯз: ${averageDailyRevenue} ${currency}.

Фурӯш аз рӯи рӯзҳои ҳафта:
${salesByDayOfWeek.map(d => `${d.label}: даромад ${d.totalRevenue}, фоида ${d.totalProfit}`).join('\n')}

Топ молҳо:
${slicedTopProducts.map(p => `${p.name}: маржа ${p.margin}%, ${p.salesCount} бор фурӯхта шуд`).join('\n')}

Динамикаи ҳафтаина:
${slicedWeeklyTotals.map(w => `${w.weekLabel}: даромад ${w.revenue}, фоида ${w.profit}`).join('\n')}

Ба ман 3 маслиҳати мушаххас барои ҳафтаи оянда бидеҳ:
1. Чӣ қадар ва кадом молро харидорӣ кунам
2. Ба кадом рӯзи ҳафта диққати бештар диҳам
3. Кадом молро бознигарӣ кунам (нарх ё миқдор)`;
    } else if (language === 'uz') {
      systemInstruction = `Siz Markaziy Osiyo bozorida savdogar uchun moliyaviy maslahatchisiz. FAQAT o'zbek tilida javob bering. Aniq va amaliy bo'ling. Markdown, yulduzcha yoki formatlashdan foydalanmang. Oddiy matn bilan yozing. Maksimal 200 so'z.`;
      userMessage = `Mana oxirgi ${periodDays} kunlik savdo ma'lumotlari.
Kunlik o'rtacha tushum: ${averageDailyRevenue} ${currency}.

Hafta kunlari bo'yicha savdo:
${salesByDayOfWeek.map(d => `${d.label}: tushum ${d.totalRevenue}, foyda ${d.totalProfit}`).join('\n')}

Top mahsulotlar:
${slicedTopProducts.map(p => `${p.name}: marja ${p.margin}%, ${p.salesCount} marta sotildi`).join('\n')}

Haftalik dinamika:
${slicedWeeklyTotals.map(w => `${w.weekLabel}: tushum ${w.revenue}, foyda ${w.profit}`).join('\n')}

Keyingi hafta uchun 3 ta aniq maslahat bering:
1. Nima va qancha miqdorda sotib olish kerak
2. Haftaning qaysi kuniga e'tibor qaratish lozim
3. Qaysi mahsulotni qayta ko'rib chiqish kerak (narxi yoki miqdori)`;
    } else {
      // Default to Russian
      systemInstruction = `Ты финансовый советник для торговца на базаре в Центральной Азии. Отвечай ТОЛЬКО на русском языке. Будь конкретным и практичным. Не используй markdown, звёздочки, решётки или форматирование. Пиши простым текстом абзацами. Максимум 200 слов.`;
      userMessage = `Вот данные продаж за последние ${periodDays} дней.
Средняя выручка в день: ${averageDailyRevenue} ${currency}.

Продажи по дням недели:
${salesByDayOfWeek.map(d => `${d.label}: выручка ${d.totalRevenue}, прибыль ${d.totalProfit}`).join('\n')}

Топ товаров:
${slicedTopProducts.map(p => `${p.name}: маржа ${p.margin}%, продано ${p.salesCount} раз`).join('\n')}

Динамика по неделям:
${slicedWeeklyTotals.map(w => `${w.weekLabel}: выручка ${w.revenue}, прибыль ${w.profit}`).join('\n')}

Дай мне 3 конкретных совета для следующей недели:
1. Что закупить и в каком количестве
2. На какой день недели делать упор
3. Какой товар пересмотреть (цену или количество)`;
    }

    const geminiRequestBody = {
      contents: [{ parts: [{ text: userMessage }] }],
      system_instruction: { parts: [{ text: systemInstruction }] },
      generationConfig: {
        maxOutputTokens: 400,
        temperature: 0.7,
      },
    };

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiRequestBody),
    });

    if (response.status === 429) {
      return NextResponse.json(
        { error: 'rate_limit', message: 'Попробуйте через несколько минут' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (!response.ok) {
      console.error(`Gemini API error: ${response.status} ${await response.text()}`);
      return NextResponse.json({ error: 'gemini_error' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }

    const data = await response.json();
    const forecast = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!forecast) {
      return NextResponse.json({ error: 'gemini_error' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }

    return NextResponse.json(
      { forecast, generatedAt: new Date().toISOString() },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );

  } catch (error) {
    console.error('Forecast API error:', error);
    return NextResponse.json({ error: 'network_error' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
