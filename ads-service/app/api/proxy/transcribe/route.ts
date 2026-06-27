import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  try {
    const incomingForm = await request.formData();

    // CRITICAL: Must reconstruct a new FormData object.
    // Passing the parsed FormData directly breaks the multipart boundary
    // when Node fetch tries to re-serialize it, causing Groq to reject with 401.
    const groqForm = new FormData();
    incomingForm.forEach((value, key) => {
      groqForm.append(key, value);
    });

    const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        // DO NOT set Content-Type manually — fetch must auto-set it with the correct boundary
      },
      body: groqForm,
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error('[transcribe proxy] Groq error:', groqResponse.status, errText);
      return NextResponse.json(
        { error: `Groq returned ${groqResponse.status}`, detail: errText },
        { status: groqResponse.status }
      );
    }

    const data = await groqResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[transcribe proxy] Unexpected error:', error);
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 });
  }
}
