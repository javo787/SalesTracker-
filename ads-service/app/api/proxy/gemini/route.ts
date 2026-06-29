import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const GEMINI_API_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
].filter(Boolean) as string[];

const GROQ_API_KEY = process.env.GROQ_API_KEY;

export async function POST(req: NextRequest) {
  if (GEMINI_API_KEYS.length === 0 && !GROQ_API_KEY) {
    return NextResponse.json({ error: 'config_error' }, { status: 500 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { contents } = body;
  if (!contents || !Array.isArray(contents)) {
    return NextResponse.json({ error: 'missing_contents' }, { status: 400 });
  }

  // Try each Gemini key in round-robin
  for (const key of GEMINI_API_KEYS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents }),
      });

      if (response.status === 429 || response.status === 403) continue;

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data);
      }
    } catch {
      continue;
    }
  }

  // Fallback to Groq
  if (GROQ_API_KEY) {
    try {
      const text = contents
        .flatMap((c: any) => c.parts?.map((p: any) => p.text) ?? [])
        .join('\n');

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: text }],
          temperature: 0.2,
          max_tokens: 512,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Return in Gemini-compatible shape so the client parser works unchanged
        const content = data.choices?.[0]?.message?.content ?? '';
        return NextResponse.json({
          candidates: [{ content: { parts: [{ text: content }] } }],
        });
      }
    } catch {
      // fall through
    }
  }

  return NextResponse.json({ error: 'all_keys_exhausted' }, { status: 503 });
}
