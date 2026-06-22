import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const GEMINI_API_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
].filter(Boolean) as string[];

const GROQ_API_KEY = process.env.GROQ_API_KEY;

interface SummaryRequest {
  language: 'ru' | 'tj' | 'uz';
  currency: string;
  periodLabel: string;
  totalRevenue: number;
  totalProfit: number;
  totalExpenses: number;
  netProfit: number;
  averageMargin: number;
  totalTransactions: number;
  topProducts: {
    name: string;
    revenue: number;
    profit: number;
    margin: number;
    salesCount: number;
  }[];
  salesByDayOfWeek: {
    label: string;
    totalRevenue: number;
  }[];
  bestDay: string;
  worstDay: string;
  revenueGrowthPercent: number | null;
}

async function callAIWithFallback(
  prompt: string,
  systemInstruction: string
): Promise<{ text: string; provider: string }> {
  const providers = ([
    { key: process.env.GEMINI_API_KEY, name: 'gemini' },
    { key: process.env.GEMINI_API_KEY_1, name: 'gemini_1' },
    { key: process.env.GEMINI_API_KEY_2, name: 'gemini_2' },
    { key: process.env.GEMINI_API_KEY_3, name: 'gemini_3' },
  ].filter(p => !!p.key) as { key: string; name: string }[]);

  // 1. Try Gemini keys
  for (const provider of providers) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${provider.key}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 300, temperature: 0.5 }
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return { text, provider: provider.name };
        }
      } else {
        console.warn(`Gemini key ${provider.name} failed with status ${response.status}`);
      }
    } catch (err) {
      console.warn(`Gemini key ${provider.name} failed`, err);
    }
  }

  // 2. Try Groq
  if (GROQ_API_KEY) {
    try {
      const url = 'https://api.groq.com/openai/v1/chat/completions';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt }
          ],
          max_tokens: 300,
          temperature: 0.5
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) {
          return { text, provider: 'groq' };
        }
      }
    } catch (err) {
      console.error('Groq fallback failed', err);
    }
  }

  throw new Error('all_providers_failed');
}

export async function POST(req: NextRequest) {
  try {
    const body: SummaryRequest = await req.json();

    // Validation
    const required = [
      'language', 'currency', 'periodLabel', 'totalRevenue', 'totalProfit',
      'totalExpenses', 'netProfit', 'averageMargin', 'totalTransactions',
      'topProducts', 'salesByDayOfWeek', 'bestDay', 'worstDay'
    ];

    for (const field of required) {
      if ((body as any)[field] === undefined) {
        return NextResponse.json({ error: 'invalid_request' }, {
          status: 400,
          headers: { 'Cache-Control': 'no-store' }
        });
      }
    }

    const topProducts = body.topProducts.slice(0, 5);

    // System instruction per language
    const systemInstructions = {
      ru: "Ты финансовый аналитик. Пиши краткое резюме отчёта для торговца на базаре в Центральной Азии. Только plain text, без markdown, без звёздочек, без списков. Максимум 150 слов. Будь конкретным.",
      tj: "Ту таҳлилгари молиявӣ ҳастӣ. Хулосаи кӯтоҳи ҳисобот барои тоҷири бозор дар Осиёи Марказӣ бинавис. Танҳо матни оддӣ, бе markdown. Ҳадди аксар 150 калима. Мушаххас бош.",
      uz: "Siz moliyaviy analitikasiz. Markaziy Osiyo bozori savdogari uchun qisqa hisobot xulosasini yozing. Faqat oddiy matn, markdown yo'q. Maksimal 150 so'z. Aniq bo'ling."
    };

    const systemInstruction = systemInstructions[body.language] || systemInstructions.ru;

    // User prompt per language
    let prompt = '';
    if (body.language === 'tj') {
      prompt = `Давра: ${body.periodLabel}
Даромад: ${body.totalRevenue} ${body.currency}
Фоида: ${body.totalProfit} ${body.currency}
Хароҷот: ${body.totalExpenses} ${body.currency}
Фоидаи холис: ${body.netProfit} ${body.currency}
Маржаи миёна: ${body.averageMargin}%
Транзаксияҳо: ${body.totalTransactions}
${body.revenueGrowthPercent !== null ? 'Афзоиши даромад нисбат ба давраи гузашта: ' + body.revenueGrowthPercent + '%' : ''}
Рӯзи беҳтарин: ${body.bestDay}, бадтарин: ${body.worstDay}
Молҳои беҳтарин: ${topProducts.map(p => `${p.name} маржа ${p.margin}%`).join(', ')}

Хулосаи кӯтоҳи ин давра ва як маслиҳати асосиро бинавис.`;
    } else if (body.language === 'uz') {
      prompt = `Davr: ${body.periodLabel}
Tushum: ${body.totalRevenue} ${body.currency}
Foyda: ${body.totalProfit} ${body.currency}
Xarajatlar: ${body.totalExpenses} ${body.currency}
Sof foyda: ${body.netProfit} ${body.currency}
O'rtacha marja: ${body.averageMargin}%
Tranzaksiyalar: ${body.totalTransactions}
${body.revenueGrowthPercent !== null ? 'O\'tgan davrga nisbatan tushum o\'sishi: ' + body.revenueGrowthPercent + '%' : ''}
Eng yaxshi kun: ${body.bestDay}, eng yomoni: ${body.worstDay}
Top mahsulotlar: ${topProducts.map(p => `${p.name} marja ${p.margin}%`).join(', ')}

Ushbu davr uchun qisqa xulosa va bitta asosiy maslahat yozing.`;
    } else {
      prompt = `Период: ${body.periodLabel}
Выручка: ${body.totalRevenue} ${body.currency}
Прибыль: ${body.totalProfit} ${body.currency}
Расходы: ${body.totalExpenses} ${body.currency}
Чистая прибыль: ${body.netProfit} ${body.currency}
Средняя маржа: ${body.averageMargin}%
Транзакций: ${body.totalTransactions}
${body.revenueGrowthPercent !== null ? 'Рост выручки vs прошлый период: ' + body.revenueGrowthPercent + '%' : ''}
Лучший день: ${body.bestDay}, худший: ${body.worstDay}
Топ товары: ${topProducts.map(p => `${p.name} маржа ${p.margin}%`).join(', ')}

Напиши краткое резюме этого периода и один главный совет.`;
    }

    const { text, provider } = await callAIWithFallback(prompt, systemInstruction);

    return NextResponse.json({
      summary: text,
      provider,
      generatedAt: new Date().toISOString()
    }, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' }
    });

  } catch (error: any) {
    console.error('Summary API error:', error);
    if (error.message === 'all_providers_failed') {
      return NextResponse.json({ error: 'all_providers_failed' }, {
        status: 503,
        headers: { 'Cache-Control': 'no-store' }
      });
    }
    return NextResponse.json({ error: 'server_error' }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store' }
    });
  }
}
