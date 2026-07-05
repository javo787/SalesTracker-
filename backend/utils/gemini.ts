import axios from 'axios';

const GEMINI_API_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
].filter(Boolean) as string[];

export const GEMINI_MODELS = {
  LEVEL_1: 'gemini-3-flash',
  LEVEL_1_FALLBACK: 'gemini-3.1-flash-lite',
};

/**
 * Executes a Gemini request with round-robin key rotation and model fallback.
 */
export async function fetchGeminiWithRotation(model: string, payload: any) {
  if (GEMINI_API_KEYS.length === 0) {
    throw new Error('config_error: No Gemini API keys found');
  }

  let lastError: any;

  for (const key of GEMINI_API_KEYS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        validateStatus: () => true,
      });

      if (response.status === 429 || response.status === 403) {
        console.warn(`[Gemini Rotation] Key failed with ${response.status}, trying next...`);
        continue;
      }

      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        data: response.data,
      };
    } catch (err: any) {
      lastError = err;
      continue;
    }
  }

  return {
    ok: false,
    status: 503,
    data: { error: 'all_keys_exhausted', detail: lastError?.message },
  };
}

export function parseGeminiJSON(resData: any) {
  try {
    const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleanText = rawText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleanText);
    if (parsed && Array.isArray(parsed.items)) {
      parsed.items = parsed.items.filter((it: any) => it && it.product_name);
      return parsed;
    }
  } catch (e) {
    console.error('[Gemini] parseGeminiJSON error', e);
  }
  return null;
}
