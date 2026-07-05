import axios from 'axios';

const GEMINI_API_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
].filter(Boolean) as string[];

export const GEMINI_MODELS = {
  LEVEL_1: 'gemini-3-flash-preview',
  LEVEL_1_FALLBACK: 'gemini-flash-latest',
};

/**
 * Normalizes raw output from AI models into a consistent VoiceSaleResult format.
 */
export function normalizeVoiceSaleResult(raw: any) {
  const items = Array.isArray(raw?.items) ? raw.items : [];

  const normalizedItems = items.map((it: any) => {
    let needs_confirmation = it?.needs_confirmation === true;

    // Coerce values and track if defaults had to be used
    const product_name = typeof it?.product_name === 'string' ? it.product_name : '';

    let sell_price = Number(it?.sell_price);
    if (isNaN(sell_price)) {
      sell_price = 0;
      needs_confirmation = true;
    }

    let buy_price = Number(it?.buy_price);
    if (isNaN(buy_price)) {
      buy_price = 0;
    }

    let quantity = Number(it?.quantity);
    if (isNaN(quantity)) {
      quantity = 0;
      needs_confirmation = true;
    }

    return {
      product_name,
      sell_price,
      buy_price,
      quantity,
      needs_confirmation,
    };
  }).filter((it: any) => {
    // Keep items that have some content or are flagged for confirmation
    return it.product_name.trim().length > 0 || it.sell_price > 0 || it.quantity > 0 || it.needs_confirmation;
  });

  const language_detected = ['ru', 'tg', 'uz'].includes(raw?.language_detected)
    ? raw.language_detected
    : 'unknown';

  return {
    items: normalizedItems,
    language_detected,
    truncated: raw?.truncated === true,
    transcript: raw?.transcript,
  };
}

/**
 * Executes a Gemini request with round-robin key rotation and model fallback.
 */
export async function fetchGeminiWithRotation(model: string, payload: any, options: { signal?: AbortSignal, timeout?: number } = {}) {
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
        signal: options.signal,
        timeout: options.timeout || 15000,
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
    if (parsed) {
      return normalizeVoiceSaleResult(parsed);
    }
  } catch (e) {
    console.error('[Gemini] parseGeminiJSON error', e);
  }
  return null;
}
