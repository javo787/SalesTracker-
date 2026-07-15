# Голосовой AI-пайплайн: провайдеры, диагностика, бесплатные лимиты

Этот документ описывает архитектуру `backend/routes/voiceSale.ts` после ревизии
(июль 2026): почему были частые 503 от Gemini 3, что изменилось и как проверять
работоспособность каждого API.

## 1. Почему Gemini 3 Flash Preview часто отдаёт 503

`gemini-3-flash-preview` — модель в статусе **preview**. У preview-моделей Google
выделяет ограниченный, отдельный от GA-моделей пул вычислительных мощностей.
Когда глобальный спрос на preview-модель подскакивает (а гугл параллельно катит
новые relase), она начинает массово отдавать `503 UNAVAILABLE / "model is
overloaded"` — это происходит у всех пользователей одновременно, независимо от
платного тарифа, и retry с backoff тут почти не помогает: нужно ждать либо
переключаться на другую модель.

`gemini-2.5-flash` — GA-модель (general availability), у неё отдельный, более
крупный и стабильный пул мощностей. 503 там тоже иногда бывают, но кратно реже.

### Что изменено в коде
`backend/utils/gemini.ts` → `GEMINI_MODELS`:

```
LEVEL_1          = 'gemini-2.5-flash'          // было gemini-3-flash-preview
LEVEL_1_FALLBACK = 'gemini-3-flash-preview'    // было gemini-flash-latest (алиас, потенциально "плавающий")
```

Логика ротации в `fetchGeminiWithRotation()` не менялась — она уже была
правильной: перебор ключей, а при не-2xx статусе (кроме 401/403/429, где просто
пробуем следующий ключ) переход на fallback-модель.

Одна тонкость: `gemini-flash-latest`, который был fallback раньше — это
**алиас**, который Google может в любой момент перенаправить на новую
preview-модель без предупреждения. Явное имя `gemini-3-flash-preview` предсказуемее.

## 2. Новый уровень fallback — Cerebras

Раньше при отказе Gemini (оба варианта) пайплайн шёл: Whisper → Groq Llama.
Один альтернативный текстовый провайдер — тоже точка отказа. Добавлен
**Cerebras** (`backend/utils/cerebras.ts`) как ещё один бесплатный,
независимый от Google/Groq провайдер (свой датацентр, своя инфраструктура) —
`llama-3.3-70b`, OpenAI-совместимый API, ~1M токенов/день без карты.

Итоговая цепочка `voice-sale`:

| Уровень | Что делает | Провайдер |
|---|---|---|
| 1 | Аудио → JSON напрямую | Gemini 2.5 Flash → fallback Gemini 3 Flash Preview |
| 2 | Whisper → транскрипт → JSON | Groq Whisper → Gemini 2.5 Flash → fallback Gemini 3 Flash Preview |
| 3a | Транскрипт → JSON | Cerebras Llama 3.3 70B *(новое, опционально — работает только если задан `CEREBRAS_API_KEY`)* |
| 3b | Транскрипт → JSON | Groq Llama 3.3 70B |
| 4 | Транскрипт без разбора | — (пользователь редактирует вручную) |

`CEREBRAS_API_KEY` не обязателен — если не задан, уровень 3a просто
пропускается и пайплайн ведёт себя как раньше. Получить бесплатный ключ:
https://cloud.cerebras.ai/ (без карты).

## 3. Как проверить работоспособность каждого API

```bash
cd backend
npm run check:ai
```

Скрипт `backend/scripts/check-ai-health.ts`:
- проверяет каждый заданный `GEMINI_API_KEY*` на моделях `gemini-2.5-flash` и
  `gemini-3-flash-preview` реальным мини-запросом;
- проверяет `GROQ_API_KEY` (список моделей + реальный chat-запрос к
  `llama-3.3-70b-versatile`);
- проверяет `CEREBRAS_API_KEY`, если задан.

Whisper (распознавание речи) скрипт напрямую не гоняет — для этого нужен
реальный аудио-файл, а прогонять его в диагностике избыточно. Если Groq-ключ
валиден (пункт "список моделей" зелёный) и в списке есть
`whisper-large-v3-turbo`, значит STT тоже будет работать — Whisper и Llama
живут на одном ключе/аккаунте Groq.

Запускать можно:
- локально, с `.env` в `backend/` — читает его через `dotenv`;
- на Render, во вкладке **Shell** сервиса: `cd backend && npx ts-node scripts/check-ai-health.ts` (переменные там уже подставлены из настроек сервиса).

Пример вывода:
```
✅ Gemini gemini-2.5-flash (GEMINI_API_KEY)        status=200    412ms
❌ Gemini gemini-3-flash-preview (GEMINI_API_KEY)  status=503    390ms  — model overloaded
✅ Groq (ключ + список моделей)                    status=200    180ms  whisper-large-v3-turbo=true llama-3.3-70b-versatile=true
✅ Groq llama-3.3-70b-versatile (chat)              status=200    240ms
✅ Cerebras llama-3.3-70b (chat)                    status=200    95ms
```

## 4. Бесплатные лимиты (ориентировочно, июль 2026)

Лимиты бесплатных тарифов провайдеры меняют часто (за последний год Google уже
дважды урезал квоты Gemini), поэтому цифры ниже — ориентир, а не гарантия.
Перед принятием решений сверяйтесь с официальными страницами:

| Провайдер | Что бесплатно | Официальная страница лимитов |
|---|---|---|
| Google Gemini API | Flash-модели, лимит запросов/день зависит от проекта в AI Studio | https://ai.google.dev/gemini-api/docs/rate-limits |
| Groq | Whisper Large v3 Turbo (STT) + Llama 3.3 70B, десятки запросов/мин | https://console.groq.com/docs/rate-limits |
| Cerebras | Llama 3.3 70B и др., ~1M токенов/день, без карты | https://inference-docs.cerebras.ai/support/pricing |

**Важная деталь по Gemini**: лимиты считаются **на уровне Google Cloud проекта**,
а не на уровне ключа. Несколько ключей `GEMINI_API_KEY_1/2/3`, созданных в
**одном** проекте, делят один и тот же лимит — ротация в коде тогда защищает
только от протухшего/забаненного ключа, а не увеличивает суммарную квоту. Чтобы
реально расширить бесплатный лимит, каждый дополнительный ключ должен быть из
**отдельного** Google-аккаунта/проекта.

## 5. Мониторинг

`backend/utils/gemini.ts` уже шлёт алерты в Telegram админу (`notifyAdmin`,
см. `ADMIN_TELEGRAM_ID` в `.env`) при: отказе ключа (401/403) и при полном
исчерпании всех ключей Gemini. Cerebras и Groq пока не покрыты алертами —
если это будет полезно (например, частые падения Cerebras), можно добавить
аналогичный `alertOnce()` вызов в `cerebras.ts` и в Groq-ветку `voiceSale.ts`
по той же схеме — дайте знать, сделаю.
