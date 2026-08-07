import express, { Response } from 'express';
import multer from 'multer';
import { authMiddleware, AuthRequest, requireShop } from '../middleware/authMiddleware';
import { fetchGeminiWithRotation, GEMINI_MODELS, parseGeminiJSON } from '../utils/gemini';
import { alertOnce } from '../services/telegramBot';
import { buildInvoiceCatalogHint } from '../utils/catalogHint';

const router = express.Router();

// Memory storage for multer - limited to 8MB.
// Клиент обязан сжимать фото (expo-image-manipulator) перед отправкой - реальное
// фото после сжатия обычно 300-800KB. 8MB - запас на случай, если сжатие на
// клиенте почему-то не сработало, не расчётный размер.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const INVOICE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      maxItems: 40,
      items: {
        type: "object",
        properties: {
          product_name: { type: "string" },
          variant: { type: "string" },
          quantity: { type: "number" },
          unit_price: { type: "number" },
          line_total: { type: "number" },
          category_guess: { type: "string" },
          needs_confirmation: { type: "boolean" }
        },
        required: ["product_name", "quantity", "unit_price", "needs_confirmation"]
      }
    },
    grand_total: { type: "number" },
    supplier_hint: { type: "string" },
    language_detected: { type: "string", enum: ["ru", "tg", "uz", "mixed", "unknown"] },
    truncated: { type: "boolean" }
  },
  required: ["items", "language_detected", "truncated"]
};

const INVOICE_SCAN_SYSTEM_PROMPT = `Act as a professional inventory clerk for small shop owners in Central Asia (Tajikistan/Uzbekistan) reading a photographed supplier invoice (накладная) to record incoming stock.

The photo is usually HANDWRITTEN and mixes Russian, Tajik, and Uzbek, with product/brand names often written in Latin script (e.g. "Danne jeke", "Daniel Rabetti", "Osman"). Read the handwriting carefully - it can be messy, and the same brand name often repeats several times with different variants (e.g. white vs black) on separate lines; do not merge or skip these.

Each line normally follows the pattern "product name - variant/color - quantity x unit_price = line_total". Extract these as SEPARATE fields - do not calculate them yourself, report exactly what is written:
- product_name: the brand/product name as written.
- variant: color, size, or type description if it is a distinct part of the line (e.g. "сафед"/white, "сиёҳ"/black, "остин дароз"/long sleeve). Omit this field entirely if there is no separate variant written.
- quantity: the number of units.
- unit_price: the price per unit. This is the wholesale/purchase price the shop is paying, never a retail price.
- line_total: the total for that line EXACTLY as written on the paper, even if it looks inconsistent with quantity x unit_price - never compute or correct it yourself.
- category_guess: a short product category, ONLY if visually obvious from the photo itself (e.g. clothing, footwear); omit this field if you are not confident.

If the document shows one final total number (usually at the bottom, sometimes circled or underlined), return it as grand_total, exactly as written. If there is a supplier name, shop name, or heading written at the top of the page, return it as supplier_hint. Omit either field if not present.

Set needs_confirmation to true for any item where a digit or word is ambiguous, smudged, or you are genuinely unsure of the reading.
If there are clearly more than 40 line items, include only the first 40 and set truncated to true.

Do not invent items that are not visible in the photo, and do not skip a line just because it looks similar to another one.

Return ONLY a pure JSON object according to the schema.`;

/**
 * Backend never trusts the model's own arithmetic. We recompute quantity x unit_price
 * ourselves and compare it against the line_total the model read off the paper, and
 * separately foot all line totals against grand_total. Mismatches force needs_confirmation
 * and get a distinct flag, so the review screen can show the exact discrepancy instead of
 * a generic "please check" warning.
 */
// Построчная сверка должна быть строгой: quantity и unit_price читаются
// независимо от line_total, так что даже небольшое расхождение (несколько
// единиц на сумму в сотни) обычно значит, что одна из трёх цифр прочитана
// неверно - в реальных накладных построчная арифметика сходится всегда.
const LINE_ABS_TOLERANCE = 1;
const LINE_REL_TOLERANCE = 0.005;

// Сверка по всему документу мягче: её задача - поймать пропущенную строку
// или что-то по-крупному, а не точный повтор построчной проверки (та уже
// подсвечивает конкретную позицию точнее, чем документ в целом).
const DOC_ABS_TOLERANCE = 2;
const DOC_REL_TOLERANCE = 0.01;

function isMismatch(computed: number, stated: number, absTolerance: number, relTolerance: number): boolean {
  const tolerance = Math.max(absTolerance, Math.abs(stated) * relTolerance);
  return Math.abs(computed - stated) > tolerance;
}

/**
 * Normalizes raw Gemini output into a consistent InvoiceScanResult shape.
 * Deliberately NOT reusing normalizeVoiceSaleResult from utils/gemini - that
 * normalizer rebuilds objects around sell_price/buy_price and would silently
 * drop variant/line_total/category_guess.
 */
export function normalizeInvoiceScanResult(raw: any) {
  const rawItems = Array.isArray(raw?.items) ? raw.items : [];

  const items = rawItems.map((it: any) => {
    let needs_confirmation = it?.needs_confirmation === true;

    const product_name = typeof it?.product_name === 'string' ? it.product_name.trim() : '';
    const variant = typeof it?.variant === 'string' && it.variant.trim() ? it.variant.trim() : null;
    const category_guess = typeof it?.category_guess === 'string' && it.category_guess.trim() ? it.category_guess.trim() : null;

    let quantity = Number(it?.quantity);
    if (isNaN(quantity) || quantity <= 0) {
      quantity = 0;
      needs_confirmation = true;
    }

    let unit_price = Number(it?.unit_price);
    if (isNaN(unit_price) || unit_price < 0) {
      unit_price = 0;
      needs_confirmation = true;
    }

    const rawLineTotal = Number(it?.line_total);
    const line_total = isNaN(rawLineTotal) ? null : rawLineTotal;

    let line_total_mismatch = false;
    if (line_total !== null && quantity > 0 && unit_price > 0) {
      line_total_mismatch = isMismatch(quantity * unit_price, line_total, LINE_ABS_TOLERANCE, LINE_REL_TOLERANCE);
      if (line_total_mismatch) needs_confirmation = true;
    }

    return {
      product_name,
      variant,
      quantity,
      unit_price,
      line_total,
      line_total_mismatch,
      category_guess,
      needs_confirmation,
    };
  }).filter((it: any) => it.product_name.length > 0 || it.quantity > 0 || it.needs_confirmation);

  const language_detected = ['ru', 'tg', 'uz', 'mixed'].includes(raw?.language_detected)
    ? raw.language_detected
    : 'unknown';

  const rawGrandTotal = Number(raw?.grand_total);
  const grand_total = isNaN(rawGrandTotal) ? null : rawGrandTotal;

  const supplier_hint = typeof raw?.supplier_hint === 'string' && raw.supplier_hint.trim()
    ? raw.supplier_hint.trim()
    : null;

  const computed_total = items.reduce((sum: number, it: any) => {
    const effective = it.line_total !== null ? it.line_total : it.quantity * it.unit_price;
    return sum + effective;
  }, 0);

  const grand_total_mismatch = grand_total !== null && isMismatch(computed_total, grand_total, DOC_ABS_TOLERANCE, DOC_REL_TOLERANCE);

  return {
    items,
    grand_total,
    supplier_hint,
    language_detected,
    truncated: raw?.truncated === true,
    computed_total,
    grand_total_mismatch,
  };
}

router.post('/', authMiddleware, requireShop, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'file_too_large', maxSizeMb: 8 });
      }
      return res.status(400).json({ error: 'upload_error', detail: err.message });
    }
    next();
  });
}, async (req: AuthRequest, res: Response) => {
  const shopId = req.shopId;
  const userId = req.userId;

  if (!req.file) {
    return res.status(400).json({ error: 'missing_file' });
  }

  // Единственный уровень - vision-запрос к Gemini. У аудио-пайплайна (voiceSale.ts)
  // есть текстовые уровни ниже (Whisper -> Cerebras/Groq) как резерв, но это
  // текстовые модели - для фото они не применимы. Настоящего второго
  // vision-провайдера пока нет (см. план: Groq qwen3.6-27b - кандидат на будущее,
  // требует отдельной проверки актуальности перед подключением).
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  const pipelineStart = Date.now();
  const logStep = (step: string, extra: Record<string, any> = {}) => {
    console.log(`[invoice-scan] ${step}`, { shopId, elapsedMs: Date.now() - pipelineStart, ...extra });
  };
  logStep('pipeline_start', { userId });

  try {
    const base64Image = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';

    // Тот же приём, что и в voiceSale.ts: подмешиваем названия уже известных
    // товаров магазина, чтобы повторяющиеся бренды (обычная ситуация для
    // одного и того же поставщика) распознавались с ТЕМ ЖЕ написанием, что
    // уже в каталоге, а не немного другой транслитерацией каждый раз - это
    // напрямую улучшает точность последующего matchProductByName на клиенте.
    const catalogHint = await buildInvoiceCatalogHint(shopId);
    if (catalogHint) logStep('catalog_hint_ready', { hintChars: catalogHint.length });

    const requestPayload = {
      contents: [{
        parts: [
          { text: INVOICE_SCAN_SYSTEM_PROMPT + catalogHint },
          { inline_data: { mime_type: mimeType, data: base64Image } }
        ]
      }],
      generationConfig: {
        response_mime_type: "application/json",
        response_schema: INVOICE_RESPONSE_SCHEMA,
        thinkingConfig: { thinkingLevel: "low" }
      }
    };

    logStep('level1_start', { model: GEMINI_MODELS.LEVEL_1 });
    let geminiResponse = await fetchGeminiWithRotation(GEMINI_MODELS.LEVEL_1, requestPayload, { signal: controller.signal });
    logStep('level1_response', { ok: geminiResponse.ok, status: geminiResponse.status });

    let result = geminiResponse.ok ? parseGeminiJSON(geminiResponse.data, false) : null;

    if (!result) {
      logStep('level1_fallback_triggered', { primaryStatus: geminiResponse.status });
      geminiResponse = await fetchGeminiWithRotation(GEMINI_MODELS.LEVEL_1_FALLBACK, requestPayload, { signal: controller.signal });
      logStep('level1_fallback_response', { ok: geminiResponse.ok, status: geminiResponse.status });
      result = geminiResponse.ok ? parseGeminiJSON(geminiResponse.data, false) : null;
    }

    clearTimeout(timeoutId);

    if (result) {
      const normalized = normalizeInvoiceScanResult(result);
      logStep('level1_success', {
        itemsCount: normalized.items.length,
        needsConfirmationCount: normalized.items.filter((i: any) => i.needs_confirmation).length,
        grandTotalMismatch: normalized.grand_total_mismatch,
      });
      return res.json({ ...normalized, source: 'gemini_vision' });
    }

    // Оба вызова Gemini либо упали, либо вернули непарсящийся JSON. Отдаём
    // пустой результат с честным source вместо HTTP-ошибки, чтобы клиент
    // показал сохранённое фото и предложил добавить позиции вручную -
    // тот же принцип graceful degradation, что и transcript_only в voiceSale.ts.
    logStep('level1_failed_no_fallback');
    alertOnce(
      'invoice-scan-unparseable',
      `⚠️ <b>Скан накладной: Gemini не вернул валидный JSON</b>\nМагазин: ${shopId}`
    );
    return res.json({
      items: [],
      grand_total: null,
      supplier_hint: null,
      language_detected: 'unknown',
      truncated: false,
      computed_total: 0,
      grand_total_mismatch: false,
      source: 'scan_failed',
    });

  } catch (error: any) {
    clearTimeout(timeoutId);
    logStep('pipeline_error', { errorName: error.name, errorMessage: error.message });
    if (error.name === 'AbortError') {
      alertOnce(
        'invoice-scan-timeout',
        `⏱️ <b>Скан накладной: таймаут пайплайна (25с)</b>\nМагазин: ${shopId}`
      );
      return res.status(504).json({ error: 'pipeline_timeout' });
    }
    console.error('[invoice-scan] Unexpected error:', error);
    alertOnce(
      'invoice-scan-internal-error',
      `🔴 <b>Скан накладной: непойманная ошибка</b>\nМагазин: ${shopId}\n${error?.name || 'Error'}: ${error?.message || 'н/д'}`
    );
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
