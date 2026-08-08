import axios from 'axios';

// qwen/qwen3.6-27b - на момент написания единственная vision-модель у Groq,
// явно НЕ фигурирующая в их списке выводимых из эксплуатации (в отличие от
// meta-llama/llama-4-scout-17b-16e-instruct и llama-4-maverick, которые по
// части источников уже помечены к депрекации). Сверить актуальность перед
// тем, как полагаться на это долгосрочно: console.groq.com/docs/models и
// console.groq.com/docs/deprecations - у Groq линейка моделей меняется
// часто (тот же llama-3.3-70b-versatile в Level 3b voiceSale.ts тоже
// в похожей ситуации, отдельный вопрос, не этот файл).
export const GROQ_VISION_MODEL = 'qwen/qwen3.6-27b';

export interface GroqVisionResponse {
  ok: boolean;
  status: number;
  content: string | null;
}

/**
 * Groq vision - независимый от Google провайдер, второй uровень фолбэка
 * для /invoice-scan, когда оба вызова Gemini (2.5-flash + 3-flash-preview)
 * не вернули парсящийся JSON. OpenAI-совместимый chat/completions API -
 * структура запроса/ответа принципиально другая, чем у Gemini (не
 * inline_data/parts, а messages с content-массивом; response_format
 * {type: "json_object"} даёт валидный JSON, но НЕ гарантирует конкретную
 * схему полей, в отличие от Gemini response_schema - вызывающий код должен
 * компенсировать это явным описанием ожидаемой формы в самом промпте).
 *
 * Не бросает исключение при обычных сбоях (нет ключа, не-200, сетевая
 * ошибка) - возвращает { ok: false }, чтобы pipeline мог просто перейти
 * к следующему шагу. Прерывание по внешнему AbortSignal - исключение,
 * пробрасывается наверх, чтобы pipeline мог отличить настоящий таймаут
 * от "провайдер недоступен".
 */
export async function fetchGroqVision(
  systemPrompt: string,
  base64Image: string,
  mimeType: string,
  signal?: AbortSignal
): Promise<GroqVisionResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 0, content: null };
  }

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: GROQ_VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: systemPrompt },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      },
      {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        signal,
        timeout: 15000,
        validateStatus: () => true,
      }
    );

    if (response.status !== 200) {
      return { ok: false, status: response.status, content: null };
    }

    const content = response.data?.choices?.[0]?.message?.content ?? null;
    return { ok: true, status: 200, content };
  } catch (e: any) {
    if (e.name === 'CanceledError' || e.name === 'AbortError') throw e;
    return { ok: false, status: 0, content: null };
  }
}
