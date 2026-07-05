import express, { Response } from 'express';
import multer from 'multer';
import { authMiddleware, AuthRequest, requireShop } from '../middleware/authMiddleware';
import { fetchGeminiWithRotation, GEMINI_MODELS, parseGeminiJSON } from '../utils/gemini';
import { transcribeAudio } from '../utils/transcribe';
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
    truncated: { type: "boolean" }
  },
  required: ["items", "language_detected", "truncated"]
};

const SYSTEM_PROMPT = `Act as a professional retail assistant for merchants in Central Asia (Tajikistan/Uzbekistan).
Your task is to accurately extract sales data from voice transcripts or audio.

The seller may dictate MULTIPLE sales in one phrase - split them into separate items in the 'items' array.
If only one item is mentioned, return an array with one element.
Do not combine different products into one item and do not invent products that were not in the speech.

For 'needs_confirmation': set to true if you are unsure about any numeric field (noise, ambiguous pronunciation, language mixing).
If there are clearly more than 8 items in the speech, include only the first 8 and set 'truncated' to true.

Handle multilingual input (Russian, Tajik, Uzbek). Possible accents, noise, or mixing of languages.

Return ONLY a pure JSON object according to the schema.`;

router.post('/', authMiddleware, requireShop, upload.single('file'), async (req: AuthRequest, res: Response) => {
  const shopId = req.shopId;
  const userId = req.userId;

  if (!req.file) {
    return res.status(400).json({ error: 'missing_file' });
  }

  // Global timeout for the entire pipeline
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const base64Audio = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype || 'audio/m4a';

    // LEVEL 1: Gemini Audio
    console.log(`[voice-sale] Level 1: Gemini Audio (${GEMINI_MODELS.LEVEL_1})`, { shopId, userId });
    let geminiResponse = await fetchGeminiWithRotation(GEMINI_MODELS.LEVEL_1, {
      contents: [{
        parts: [
          { text: SYSTEM_PROMPT },
          { inline_data: { mime_type: mimeType, data: base64Audio } }
        ]
      }],
      generationConfig: {
        response_mime_type: "application/json",
        response_schema: RESPONSE_SCHEMA
      }
    });

    if (!geminiResponse.ok && geminiResponse.status === 503) {
       console.warn(`[voice-sale] level 1 primary exhausted → level 1 fallback (${GEMINI_MODELS.LEVEL_1_FALLBACK})`);
       geminiResponse = await fetchGeminiWithRotation(GEMINI_MODELS.LEVEL_1_FALLBACK, {
         contents: [{
           parts: [
             { text: SYSTEM_PROMPT },
             { inline_data: { mime_type: mimeType, data: base64Audio } }
           ]
         }],
         generationConfig: {
           response_mime_type: "application/json",
           response_schema: RESPONSE_SCHEMA
         }
       });
    }

    if (geminiResponse.ok) {
      const result = parseGeminiJSON(geminiResponse.data);
      if (result) {
        clearTimeout(timeoutId);
        return res.json({ ...result, source: 'gemini_audio' });
      }
    }

    // LEVEL 2: Whisper -> Gemini Text
    console.warn('[voice-sale] Level 1 failed → Level 2: Whisper + Gemini Text', { shopId });
    let transcript = '';
    try {
      const whisperResult = await transcribeAudio(req.file.buffer, req.file.originalname, req.file.mimetype);
      transcript = whisperResult.text;
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
          { text: SYSTEM_PROMPT + `\n\nTRANSCRIPT: "${transcript}"` }
        ]
      }],
      generationConfig: {
        response_mime_type: "application/json",
        response_schema: RESPONSE_SCHEMA
      }
    });

    if (geminiResponse.ok) {
      const result = parseGeminiJSON(geminiResponse.data);
      if (result) {
        clearTimeout(timeoutId);
        return res.json({ ...result, transcript, source: 'whisper_gemini' });
      }
    }

    // LEVEL 3: Whisper -> Groq Llama
    console.warn('[voice-sale] Level 2 failed → Level 3: Whisper + Groq Llama', { shopId });
    const groqApiKey = process.env.GROQ_API_KEY;
    if (groqApiKey) {
      try {
        const groqResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: transcript }
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        }, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqApiKey}`,
          },
          timeout: 10000
        });

        if (groqResponse.status === 200) {
          const content = groqResponse.data.choices?.[0]?.message?.content;
          const result = JSON.parse(content);
          if (result && Array.isArray(result.items)) {
            clearTimeout(timeoutId);
            return res.json({ ...result, transcript, source: 'whisper_groq' });
          }
        }
      } catch (e) {
        console.error('[voice-sale] Groq Llama failed', e);
      }
    }

    // LEVEL 4: Transcript Only
    console.warn('[voice-sale] Level 3 failed → Level 4: Transcript Only', { shopId });
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
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'pipeline_timeout' });
    }
    console.error('[voice-sale] Unexpected error:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
