import axios from 'axios';

/**
 * Cerebras Cloud — бесплатный OpenAI-совместимый инференс (llama-3.3-70b и др.),
 * ~1M токенов/день без карты, отдельная инфраструктура от Google (Gemini) и Groq.
 * Используется как независимый fallback-уровень для JSON-экстракции из транскрипта,
 * чтобы не зависеть только от двух провайдеров (Gemini + Groq) в текстовом этапе.
 * Docs: https://inference-docs.cerebras.ai/
 */

export const CEREBRAS_MODEL = 'llama-3.3-70b';

export async function fetchCerebrasChat(
  systemPrompt: string,
  userContent: string,
  options: { signal?: AbortSignal; timeout?: number } = {}
) {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 0, data: { error: 'config_error: CEREBRAS_API_KEY missing' } };
  }

  try {
    const response = await axios.post(
      'https://api.cerebras.ai/v1/chat/completions',
      {
        model: CEREBRAS_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        validateStatus: () => true,
        signal: options.signal,
        timeout: options.timeout || 10000,
      }
    );

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      data: response.data,
    };
  } catch (err: any) {
    const isAbort = err.name === 'AbortError' || err.name === 'CanceledError';
    console.error(`[Cerebras] request threw ${isAbort ? 'ABORT/TIMEOUT' : err.name}: ${err.message}`);
    return { ok: false, status: 0, data: { error: err.message } };
  }
}
