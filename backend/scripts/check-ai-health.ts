/**
 * Диагностика всех AI-провайдеров, задействованных в голосовом пайплайне
 * (backend/routes/voiceSale.ts).
 *
 * Запуск локально:
 *   cd backend && npm run check:ai
 *
 * Запуск на Render (вкладка Shell у сервиса):
 *   cd backend && npx ts-node scripts/check-ai-health.ts
 * (переменные окружения на Render уже подставлены — .env не нужен)
 *
 * Ничего не пишет в базу и не трогает продакшн-данные, только шлёт
 * минимальные тестовые запросы к каждому провайдеру и печатает отчёт.
 */
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

type Result = {
  provider: string;
  ok: boolean;
  status: number | string;
  latencyMs: number;
  detail?: string;
};

const results: Result[] = [];

function fmt(r: Result) {
  const icon = r.ok ? '✅' : '❌';
  const status = String(r.status).padEnd(6);
  const latency = `${r.latencyMs}ms`.padEnd(8);
  const detail = r.detail ? ` — ${r.detail}` : '';
  return `${icon} ${r.provider.padEnd(38)} status=${status} ${latency}${detail}`;
}

async function checkGeminiKey(keyLabel: string, key: string, model: string) {
  const started = Date.now();
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const res = await axios.post(
      url,
      {
        contents: [{ parts: [{ text: 'Reply with the single word: OK' }] }],
        generationConfig: { maxOutputTokens: 5 },
      },
      { validateStatus: () => true, timeout: 15000 }
    );
    const latencyMs = Date.now() - started;
    const ok = res.status >= 200 && res.status < 300;
    results.push({
      provider: `Gemini ${model} (${keyLabel})`,
      ok,
      status: res.status,
      latencyMs,
      detail: ok ? undefined : res.data?.error?.message || JSON.stringify(res.data).slice(0, 120),
    });
  } catch (e: any) {
    results.push({
      provider: `Gemini ${model} (${keyLabel})`,
      ok: false,
      status: 'ERR',
      latencyMs: Date.now() - started,
      detail: e.message,
    });
  }
}

async function checkGroqModels() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    results.push({ provider: 'Groq (key check)', ok: false, status: 'NO_KEY', latencyMs: 0, detail: 'GROQ_API_KEY не задан' });
    return;
  }
  // Проверка валидности ключа + доступности моделей (whisper-large-v3-turbo, llama-3.3-70b-versatile)
  const started = Date.now();
  try {
    const res = await axios.get('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      validateStatus: () => true,
      timeout: 10000,
    });
    const latencyMs = Date.now() - started;
    const ok = res.status === 200;
    const models: string[] = ok ? (res.data?.data || []).map((m: any) => m.id) : [];
    results.push({
      provider: 'Groq (ключ + список моделей)',
      ok,
      status: res.status,
      latencyMs,
      detail: ok
        ? `whisper-large-v3-turbo=${models.includes('whisper-large-v3-turbo')} llama-3.3-70b-versatile=${models.includes('llama-3.3-70b-versatile')}`
        : JSON.stringify(res.data).slice(0, 120),
    });
  } catch (e: any) {
    results.push({ provider: 'Groq (ключ + список моделей)', ok: false, status: 'ERR', latencyMs: Date.now() - started, detail: e.message });
  }

  // Реальный текстовый вызов Llama (JSON mode) — эмулирует Level 3b пайплайна
  const started2 = Date.now();
  try {
    const res = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'Reply with pure JSON: {"status":"ok"}' }],
        response_format: { type: 'json_object' },
      },
      { headers: { Authorization: `Bearer ${apiKey}` }, validateStatus: () => true, timeout: 10000 }
    );
    const ok = res.status === 200;
    results.push({
      provider: 'Groq llama-3.3-70b-versatile (chat)',
      ok,
      status: res.status,
      latencyMs: Date.now() - started2,
      detail: ok ? undefined : JSON.stringify(res.data).slice(0, 120),
    });
  } catch (e: any) {
    results.push({ provider: 'Groq llama-3.3-70b-versatile (chat)', ok: false, status: 'ERR', latencyMs: Date.now() - started2, detail: e.message });
  }

  console.log('   ℹ️  Whisper (STT) не тестируется реальным аудио в этом скрипте —');
  console.log('      если "список моделей" ok и whisper-large-v3-turbo=true, ключ рабочий;');
  console.log('      для полной проверки распознавания отправьте голосовую заметку в приложении.');
}

async function checkCerebras() {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) {
    results.push({ provider: 'Cerebras', ok: false, status: 'NO_KEY', latencyMs: 0, detail: 'CEREBRAS_API_KEY не задан (опционально)' });
    return;
  }
  const started = Date.now();
  try {
    const res = await axios.post(
      'https://api.cerebras.ai/v1/chat/completions',
      {
        model: 'llama-3.3-70b',
        messages: [{ role: 'user', content: 'Reply with pure JSON: {"status":"ok"}' }],
        response_format: { type: 'json_object' },
      },
      { headers: { Authorization: `Bearer ${apiKey}` }, validateStatus: () => true, timeout: 10000 }
    );
    const ok = res.status === 200;
    results.push({
      provider: 'Cerebras llama-3.3-70b (chat)',
      ok,
      status: res.status,
      latencyMs: Date.now() - started,
      detail: ok ? undefined : JSON.stringify(res.data).slice(0, 120),
    });
  } catch (e: any) {
    results.push({ provider: 'Cerebras llama-3.3-70b (chat)', ok: false, status: 'ERR', latencyMs: Date.now() - started, detail: e.message });
  }
}

async function main() {
  console.log('🔍 Проверка AI-провайдеров голосового пайплайна SalesTracker...\n');

  const geminiKeys: [string, string][] = [
    ['GEMINI_API_KEY', process.env.GEMINI_API_KEY || ''],
    ['GEMINI_API_KEY_1', process.env.GEMINI_API_KEY_1 || ''],
    ['GEMINI_API_KEY_2', process.env.GEMINI_API_KEY_2 || ''],
    ['GEMINI_API_KEY_3', process.env.GEMINI_API_KEY_3 || ''],
  ].filter(([, v]) => v) as [string, string][];

  if (geminiKeys.length === 0) {
    results.push({ provider: 'Gemini', ok: false, status: 'NO_KEY', latencyMs: 0, detail: 'Ни один GEMINI_API_KEY* не задан' });
  } else {
    for (const [label, key] of geminiKeys) {
      await checkGeminiKey(label, key, 'gemini-2.5-flash');
      await checkGeminiKey(label, key, 'gemini-3-flash-preview');
    }
  }

  await checkGroqModels();
  await checkCerebras();

  console.log('─'.repeat(90));
  results.forEach((r) => console.log(fmt(r)));
  console.log('─'.repeat(90));

  const failed = results.filter((r) => !r.ok && r.status !== 'NO_KEY');
  const missing = results.filter((r) => r.status === 'NO_KEY');
  console.log(`\nИтого: ${results.length - failed.length - missing.length}/${results.length} OK, ${failed.length} ошибок, ${missing.length} не настроено.\n`);

  if (failed.length > 0) {
    console.log('⚠️  Есть провайдеры с ошибками — пайплайн голосовых продаж переключится на следующий уровень fallback автоматически,');
    console.log('   но стоит проверить причину (истёкший ключ, квота, 503 у Google).');
  }
}

main().catch((e) => {
  console.error('Diagnostic script crashed:', e);
  process.exit(1);
});
