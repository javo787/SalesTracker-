/**
 * Gemini API wrapper with key rotation and fallback to Groq.
 * Designed for low‑bandwidth environments (Tajikistan) and to avoid
 * hitting per‑key rate limits by rotating multiple API keys.
 *
 * Usage:
 *   const gemini = new GeminiApi({ keys, groqKey, modelName });
 *   const result = await gemini.generateContent(prompt);
 */

class GeminiApi {
  /**
   * @param {Object} config
   * @param {string[]} config.geminiKeys   – массив ключей Gemini (минимум 2)
   * @param {string}   config.groqKey      – ключ Groq (fallback)
   * @param {string}   [config.modelName]  – имя модели Gemini (по умолчанию 'gemini-1.5-flash')
   * @param {number}   [config.maxRetries] – сколько раз пробовать следующий ключ при ошибке quota
   */
  constructor({ geminiKeys, groqKey, modelName = 'gemini-1.5-flash', maxRetries = 3 }) {
    if (!Array.isArray(geminiKeys) || geminiKeys.length === 0) {
      throw new Error('GeminiApi requires at least one Gemini API key');
    }
    this.geminiKeys = geminiKeys;
    this.groqKey = groqKey;
    this.modelName = modelName;
    this.maxRetries = maxRetries;
    this._keyIndex = 0; // текущий указатель для ротации
  }

  /** Возвращает следующий ключ по round‑robin алгоритму */
  _nextGeminiKey() {
    const key = this.geminiKeys[this._keyIndex];
    this._keyIndex = (this._keyIndex + 1) % this.geminiKeys.length;
    return key;
  }

  /** Пытается выполнить запрос к Gemini с текущим ключом, при quota‑ошибке переходит к следующему */
  async _callGemini(payload) {
    let attempts = 0;
    while (attempts < this.maxRetries) {
      const key = this._nextGeminiKey();
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errData = await response.json();
          // 429 = ResourceExhausted (quota); 403 = доступ запрещён (возможно плохой ключ)
          if (response.status === 429 || response.status === 403) {
            // помечаем ключ как исчерпанный на время и пробуем следующий
            attempts++;
            continue;
          }
          // другие ошибки бросаем сразу
          throw new Error(`Gemini error ${response.status}: ${JSON.stringify(errData)}`);
        }

        const data = await response.json();
        return data;
      } catch (err) {
        // сетевые ошибки тоже пробуем следующий ключ (может быть DNS/таймаут)
        attempts++;
        if (attempts >= this.maxRetries) throw err;
        // небольшая экспоненциальная задержка перед следующей попыткой
        await new Promise(res => setTimeout(res, Math.min(1000 * 2 ** attempts, 8000)));
      }
    }
    throw new Error('Все Gemini ключи исчерпаны или недоступны');
  }

  /** Fallback к Groq (если настроен) */
  async _callGroq(payload) {
    if (!this.groqKey) throw new Error('Groq key not configured');
    // Groq API имеет схожий формат: POST https://api.groq.com/openai/v1/chat/completions
    // Предполагаем, что payload уже содержит messages в OpenAI формате.
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.groqKey}`,
      },
      body: JSON.stringify({
        model: 'mixtral-8x7b-32768', // можно выбрать любую доступную модель
        ...payload,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Groq error ${response.status}: ${JSON.stringify(err)}`);
    }
    return response.json();
  }

  /**
   * Основной метод – генерирует контент через Gemini, при полном исчерпании
   * переключается на Groq.
   *
   * @param {Object} geminiPayload – то, что обычно отправляем в Gemini:
   *                               { contents:[{parts:[{text: "..."}]}] }
   * @returns {Promise<Object>}    – ответ API (распарсенный JSON)
   */
  async generateContent(geminiPayload) {
    try {
      return await this._callGemini(geminiPayload);
    } catch (geminiErr) {
      console.warn('Gemini failed, falling back to Groq:', geminiErr.message);
      // Преобразуем geminiPayload в формат OpenAI/chat для Groq
      const groqPayload = {
        messages: geminiPayload.contents.map(c => ({
          role: 'user',
          content: c.parts.map(p => p.text).join('\n'),
        })),
        temperature: 0.2,
        max_tokens: 512,
      };
      return await this._callGroq(groqPayload);
    }
  }
}

export default GeminiApi;