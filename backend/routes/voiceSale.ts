import express, { Response } from 'express';
import multer from 'multer';
import { authMiddleware, AuthRequest, requireShop } from '../middleware/authMiddleware';
import { fetchGeminiWithRotation, GEMINI_MODELS, parseGeminiJSON, normalizeVoiceSaleResult } from '../utils/gemini';
import { transcribeAudio } from '../utils/transcribe';
import { fetchCerebrasChat } from '../utils/cerebras';
import axios from 'axios';

const router = express.Router();

// Memory storage for multer - limited to 8MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          product_name: { type: "string" },
          sell_price: { type: "number" },
          buy_price: { type: "number" },
          quantity: { type: "number" },
          needs_confirmation: { type: "boolean" }
        },
        required: ["product_name", "sell_price", "buy_price", "quantity", "needs_confirmation"]
      }
    },
    language_detected: { type: "string", enum: ["ru", "tg", "uz", "unknown"] },
    truncated: { type: "boolean" },
    transcript: { type: "string" }
  },
  required: ["items", "language_detected", "truncated", "transcript"]
};

const SYSTEM_PROMPT = `Act as a professional retail assistant for merchants in Central Asia (Tajikistan/Uzbekistan).
Your task is to accurately extract sales data from voice transcripts or audio.

The seller may dictate MULTIPLE sales in one phrase - split them into separate items in the 'items' array.
If only one item is mentioned, return an array with one element.
Do not combine different products into one item and do not invent products that were not in the speech.

For 'needs_confirmation': set to true if you are unsure about any numeric field (noise, ambiguous pronunciation, language mixing).
If there are clearly more than 8 items in the speech, include only the first 8 and set 'truncated' to true.

Handle multilingual input (Russian, Tajik, Uzbek). Possible accents, noise, or mixing of languages.

If buy_price is not mentioned, set it to 0. If quantity is not mentioned, set it to 1.
Do not guess or invent numeric values that were not stated or clearly implied.

Also return the field 'transcript' with your best plain-text transcription of what was said, in the original language(s) spoken, even if some words are unclear.

Return ONLY a pure JSON object according to the schema.`;

/**
 * If Gemini returned an empty product_name (often happens with poor
 * whisper transcription of Tajik/Uzbek words), we use the raw transcript
 * as a draft name and explicitly ask the user to verify it.
 */
function applyEmptyNameFallback(result: any, transcript?: string) {
  if (!transcript?.trim() || !Array.isArray(result?.items)) return result;

  result.items = result.items.map((item: any) => {
    if (!item.product_name?.trim()) {
      return { ...item, product_name: transcript.trim(), needs_confirmation: true };
    }
    return item;
  });
  return result;
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
  const { language, prompt } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: 'missing_file' });
  }

  // Global timeout for the entire pipeline
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  const pipelineStart = Date.now();
  const logStep = (step: string, extra: Record<string, any> = {}) => {
    console.log(`[voice-sale] ${step}`, { shopId, elapsedMs: Date.now() - pipelineStart, ...extra });
  };
  logStep('pipeline_start');

  try {
    const base64Audio = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype || 'audio/m4a';

    const promptWithHint = language
      ? SYSTEM_PROMPT + `\n\nDetected app language hint: ${language}. Prioritize this language when transcribing/parsing unless audio clearly indicates otherwise.`
      : SYSTEM_PROMPT;

    // LEVEL 1: Gemini Audio
    console.log(`[voice-sale] Level 1: Gemini Audio (${GEMINI_MODELS.LEVEL_1})`, { shopId, userId });
    let geminiResponse = await fetchGeminiWithRotation(GEMINI_MODELS.LEVEL_1, {
      contents: [{
        parts: [
          { text: promptWithHint },
          { inline_data: { mime_type: mimeType, data: base64Audio } }
        ]
      }],
      generationConfig: {
        response_mime_type: "application/json",
        response_schema: RESPONSE_SCHEMA,
        thinkingConfig: { thinkingLevel: "low" }
      }
    }, { signal: controller.signal });

    logStep('level1_primary_response', { ok: geminiResponse.ok, status: geminiResponse.status });

    if (!geminiResponse.ok) {
       logStep('level1_fallback_triggered', { primaryStatus: geminiResponse.status });
       geminiResponse = await fetchGeminiWithRotation(GEMINI_MODELS.LEVEL_1_FALLBACK, {
         contents: [{
           parts: [
             { text: promptWithHint },
             { inline_data: { mime_type: mimeType, data: base64Audio } }
           ]
         }],
         generationConfig: {
           response_mime_type: "application/json",
           response_schema: RESPONSE_SCHEMA,
           thinkingConfig: { thinkingLevel: "low" }
         }
       }, { signal: controller.signal });
       logStep('level1_fallback_response', { ok: geminiResponse.ok, status: geminiResponse.status });
    }

    if (geminiResponse.ok) {
      const result = parseGeminiJSON(geminiResponse.data);
      if (result) {
        logStep('level1_success', {
          itemsCount: result.items?.length,
          hasEmptySellPrice: result.items?.some((i: any) => !i.sell_price)
        });
        applyEmptyNameFallback(result, result.transcript);
        clearTimeout(timeoutId);
        return res.json({
          ...result,
          source: 'gemini_audio',
          transcript: result.transcript || ''
        });
      }
    }

    logStep('level1_failed_no_result');

    // LEVEL 2: Whisper -> Gemini Text
    logStep('level2_start');
    let transcript = '';
    try {
      const whisperResult = await transcribeAudio(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        { signal: controller.signal, language, prompt }
      );
      transcript = whisperResult.text;
      logStep('whisper_success', { transcriptLength: transcript.length, transcriptPreview: transcript.slice(0, 80) });
    } catch (e) {
      console.error('[voice-sale] Whisper failed', e);
      clearTimeout(timeoutId);
      return res.status(503).json({ error: 'all_providers_down' });
    }

    if (!transcript) {
       clearTimeout(timeoutId);
       return res.status(400).json({ error: 'no_speech_detected' });
    }

    geminiResponse = await fetchGeminiWithRotation(GEMINI_MODELS.LEVEL_1, {
      contents: [{
        parts: [
          { text: promptWithHint + `\n\nTRANSCRIPT: "${transcript}"` }
        ]
      }],
      generationConfig: {
        response_mime_type: "application/json",
        response_schema: RESPONSE_SCHEMA,
        thinkingConfig: { thinkingLevel: "low" }
      }
    }, { signal: controller.signal });

    logStep('level2_primary_response', { ok: geminiResponse.ok, status: geminiResponse.status });

    if (!geminiResponse.ok) {
       logStep('level2_fallback_triggered', { primaryStatus: geminiResponse.status });
       geminiResponse = await fetchGeminiWithRotation(GEMINI_MODELS.LEVEL_1_FALLBACK, {
         contents: [{
           parts: [
             { text: promptWithHint + `\n\nTRANSCRIPT: "${transcript}"` }
           ]
         }],
         generationConfig: {
           response_mime_type: "application/json",
           response_schema: RESPONSE_SCHEMA,
           thinkingConfig: { thinkingLevel: "low" }
         }
       }, { signal: controller.signal });
       logStep('level2_fallback_response', { ok: geminiResponse.ok, status: geminiResponse.status });
    }

    if (geminiResponse.ok) {
      const result = parseGeminiJSON(geminiResponse.data);
      if (result) {
        logStep('level2_success', {
          itemsCount: result.items?.length,
          hasEmptySellPrice: result.items?.some((i: any) => !i.sell_price)
        });
        applyEmptyNameFallback(result, transcript);
        clearTimeout(timeoutId);
        return res.json({ ...result, transcript, source: 'whisper_gemini' });
      }
    }

    // LEVEL 3a: Whisper -> Cerebras Llama (независимая от Google/Groq инфраструктура)
    logStep('level3a_start');
    if (process.env.CEREBRAS_API_KEY) {
      try {
        const cerebrasResponse = await fetchCerebrasChat(
          promptWithHint,
          `TRANSCRIPT: "${transcript}"`,
          { signal: controller.signal, timeout: 10000 }
        );
        logStep('level3a_response', { ok: cerebrasResponse.ok, status: cerebrasResponse.status });

        if (cerebrasResponse.ok) {
          const content = cerebrasResponse.data?.choices?.[0]?.message?.content;
          const parsed = content ? JSON.parse(content) : null;
          if (parsed) {
            const normalized = normalizeVoiceSaleResult(parsed);
            logStep('level3a_success', {
              itemsCount: normalized.items?.length,
              hasEmptySellPrice: normalized.items?.some((i: any) => !i.sell_price)
            });
            applyEmptyNameFallback(normalized, transcript);
            clearTimeout(timeoutId);
            return res.json({ ...normalized, transcript, source: 'whisper_cerebras' });
          }
        }
      } catch (e) {
        console.error('[voice-sale] Cerebras failed', e);
      }
    }

    // LEVEL 3b: Whisper -> Groq Llama
    logStep('level3b_start');
    const groqApiKey = process.env.GROQ_API_KEY;
    if (groqApiKey) {
      try {
        const groqResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: promptWithHint },
            { role: 'user', content: transcript }
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        }, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqApiKey}`,
          },
          signal: controller.signal,
          timeout: 10000
        });

        if (groqResponse.status === 200) {
          const content = groqResponse.data.choices?.[0]?.message?.content;
          const result = JSON.parse(content);
          if (result) {
            const normalized = normalizeVoiceSaleResult(result);
            logStep('level3b_success', {
              itemsCount: normalized.items?.length,
              hasEmptySellPrice: normalized.items?.some((i: any) => !i.sell_price)
            });
            applyEmptyNameFallback(normalized, transcript);
            clearTimeout(timeoutId);
            return res.json({ ...normalized, transcript, source: 'whisper_groq' });
          }
        }
      } catch (e) {
        console.error('[voice-sale] Groq Llama failed', e);
      }
    }

    // LEVEL 4: Transcript Only
    logStep('level4_transcript_only', { transcriptLength: transcript.length });
    clearTimeout(timeoutId);
    return res.json({
      items: [{
        product_name: '',
        sell_price: 0,
        buy_price: 0,
        quantity: 0,
        needs_confirmation: true
      }],
      language_detected: 'unknown',
      truncated: false,
      transcript,
      source: 'transcript_only'
    });

  } catch (error: any) {
    clearTimeout(timeoutId);
    logStep('pipeline_error', { errorName: error.name, errorMessage: error.message });
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'pipeline_timeout' });
    }
    console.error('[voice-sale] Unexpected error:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
