import axios from 'axios';
import FormData from 'form-data';

/**
 * Transcribes audio using Groq Whisper.
 */
export async function transcribeAudio(
  buffer: Buffer,
  originalname: string,
  mimetype: string,
  options: { signal?: AbortSignal, timeout?: number, language?: string, prompt?: string } = {}
) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY_MISSING');
  }

  const form = new FormData();
  form.append('file', buffer, {
    filename: originalname || 'audio.m4a',
    contentType: mimetype || 'audio/m4a',
  });
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'json');
  if (options.language) form.append('language', options.language);
  if (options.prompt) form.append('prompt', options.prompt);

  const response = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${apiKey}`,
    },
    signal: options.signal,
    timeout: options.timeout || 15000,
  });

  return response.data;
}
