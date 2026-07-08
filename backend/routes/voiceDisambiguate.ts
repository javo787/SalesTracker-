import express, { Response } from 'express';
import { authMiddleware, AuthRequest, requireShop } from '../middleware/authMiddleware';
import { fetchGeminiWithRotation, GEMINI_MODELS, parseGeminiJSON } from '../utils/gemini';

const router = express.Router();

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    matched_candidate_id: { type: "string", nullable: true },
    confidence: { type: "string", enum: ["high", "low", "none"] }
  },
  required: ["matched_candidate_id", "confidence"]
};

const SYSTEM_PROMPT = `You are matching a spoken product mention to a short list of catalog candidates.
Given the original speech transcript and a list of candidate products (with id, name, color, size, price),
pick the single candidate id that best matches what was said, using any color/size/price hints in the transcript.
If none of the candidates clearly match, return null for matched_candidate_id.
Return ONLY a pure JSON object according to the schema.`;

router.post('/', authMiddleware, requireShop, async (req: AuthRequest, res: Response) => {
  const { transcript, candidates } = req.body;

  if (!transcript || !Array.isArray(candidates) || candidates.length === 0 || candidates.length > 8) {
    return res.status(400).json({ error: 'invalid_request' });
  }

  try {
    const candidatesText = candidates
      .map((c: any) => `id=${c.id}, name="${c.name}", color=${c.color || '-'}, size=${c.size || '-'}, price=${c.price ?? '-'}`)
      .join('\n');

    const geminiResponse = await fetchGeminiWithRotation(GEMINI_MODELS.LEVEL_1_FALLBACK, {
      contents: [{
        parts: [{
          text: `${SYSTEM_PROMPT}\n\nTRANSCRIPT: "${transcript}"\n\nCANDIDATES:\n${candidatesText}`
        }]
      }],
      generationConfig: {
        response_mime_type: "application/json",
        response_schema: RESPONSE_SCHEMA
      }
    }, {});

    if (!geminiResponse.ok) {
      console.error('[voice-disambiguate] Gemini failure', {
        status: geminiResponse.status,
        data: geminiResponse.data,
      });
      return res.status(502).json({ error: 'gemini_unavailable' });
    }

    const result = parseGeminiJSON(geminiResponse.data, false);
    if (!result) {
      console.error('[voice-disambiguate] parse_failed, raw response:', JSON.stringify(geminiResponse.data));
      return res.status(502).json({ error: 'parse_failed' });
    }

    return res.json(result);
  } catch (error: any) {
    console.error('[voice-disambiguate] error:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
