import axios from 'axios';
import { notifyAdmin } from '../services/telegramBot';

const ALERT_COOLDOWN_MS = 10 * 60 * 1000; // 10 минут
const lastAlertAt: Record<string, number> = {};

function alertOnce(key: string, text: string) {
  const now = Date.now();
  if (now - (lastAlertAt[key] || 0) < ALERT_COOLDOWN_MS) return;
  lastAlertAt[key] = now;
  notifyAdmin(text);
}

const GEMINI_API_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
].filter(Boolean) as string[];

export const GEMINI_MODELS = {
  // gemini-2.5-flash — стабильная GA-модель с полноценным пулом мощностей у Google.
  // gemini-3-flash-preview остаётся в preview-статусе с урезанной квотой compute,
  // из-за чего именно она чаще всего отдаёт 503 "model is overloaded" при пиковой нагрузке.
  // Поэтому ставим её в fallback: если 2.5 недоступна (пул независимый от preview-пула),
  // есть шанс, что 3-preview в этот момент свободна, и наоборот.
  LEVEL_1: 'gemini-2.5-flash',
  LEVEL_1_FALLBACK: 'gemini-3-flash-preview',
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

  for (let i = 0; i < GEMINI_API_KEYS.length; i++) {
    const key = GEMINI_API_KEYS[i];
    const index = i + 1;
    // DEBUGLOG: не логируем сам ключ, только позицию в ротации — безопасность.
    const keyLabel = `key#${index}/${GEMINI_API_KEYS.length}`;
    const startedAt = Date.now();

    try {
      // Ключ передаём заголовком x-goog-api-key (актуальный способ по докам Google,
      // https://ai.google.dev/gemini-api/docs/generate-content/api-key, обновлено 24.06.2026),
      // а не query-параметром ?key=. Это важно для новых Auth-ключей (формат AQ.Ab8...) —
      // Standard-ключи (AIzaSy...) поддерживают оба способа для обратной совместимости,
      // но именно на этом различии, судя по всему, спотыкались GEMINI_API_KEY_1/2/3.
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        validateStatus: () => true,
        signal: options.signal,
        timeout: options.timeout || 15000,
      });
      const latencyMs = Date.now() - startedAt;

      if (response.status === 401 || response.status === 403) {
        console.warn(`[Gemini Rotation] Key #${index} failed with ${response.status}, trying next...`, {
          model,
          errorBody: response.data,
        });
        alertOnce(
          `key-auth-fail-${index}`,
          `⚠️ <b>Gemini ключ #${index} не работает</b>\nМодель: ${model}\nСтатус: ${response.status}\n${response.data?.error?.message || ''}`
        );
        continue;
      }

      if (response.status === 429) {
        console.warn(`[Gemini Rotation] Key #${index} rate-limited (429), trying next...`);
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        console.error(`[Gemini Rotation] Non-2xx response`, {
          model,
          status: response.status,
          data: response.data,
        });
      }

      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        data: response.data,
      };
    } catch (err: any) {
      lastError = err;
      const latencyMs = Date.now() - startedAt;
      const isAbort = err.name === 'AbortError' || err.name === 'CanceledError';
      // DEBUGLOG
      console.error(
        `[Gemini Rotation] ${keyLabel} model=${model} threw ${isAbort ? 'ABORT/TIMEOUT' : err.name} (${latencyMs}ms): ${err.message}`
      );
      continue;
    }
  }

  console.error('[Gemini Rotation] All keys exhausted', {
    model,
    keysCount: GEMINI_API_KEYS.length,
    lastErrorMessage: lastError?.message,
    lastErrorCode: lastError?.code,
  });
  alertOnce(
    'all-keys-exhausted',
    `🔴 <b>Все ключи Gemini не работают!</b>\nМодель: ${model}\nКлючей сконфигурировано: ${GEMINI_API_KEYS.length}\nПоследняя ошибка: ${lastError?.message || 'н/д'}`
  );
  return {
    ok: false,
    status: 503,
    data: { error: 'all_keys_exhausted', detail: lastError?.message },
  };
}

export function parseGeminiJSON(resData: any, normalize = true) {
  try {
    const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleanText = rawText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleanText);
    if (parsed) {
      return normalize ? normalizeVoiceSaleResult(parsed) : parsed;
    }
  } catch (e) {
    console.error('[Gemini] parseGeminiJSON error', e);
  }
  return null;
}
