import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  try {
    const formData = await request.formData();

    const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    const data = await groqResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Transcription proxy error:', error);
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 });
  }
}
