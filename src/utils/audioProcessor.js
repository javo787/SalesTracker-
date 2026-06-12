/**
 * Утилиты для подготовки аудио перед отправкой в сервис распознавания речи.
 * Оптимизированы для низкой пропускной способности (Таджикистан):
 *   - понижение частоты дискретизации до 8 kHz (моно)
 *   - удаление silêncio (Voice Activity Detection – простой порог энергии)
 *   - кодирование в Opus (через веб‑Audio API, если доступно) иначе в WAV 16‑bit PCM
 *   - опциональное базовое64‑кодування для передачи через fetch (если бекенд ожидает base64)
 *
 * Предполагается, что мы получаем raw PCM‑данные от микрофона (например, через
 * react-native-voice или expo-av) в формате 16‑bit little‑endian, 48 kHz моно.
 * Если ваш источник даёт другой формат – адаптируйте функции `resample` и
 * `encodeWav`.
 */

const SAMPLE_RATE_IN = 48000; // частота, которую даёт микрофон по умолчанию
const SAMPLE_RATE_OUT = 8000; // целевая частота для распознавания (достаточно для речи)
const FRAME_SIZE = 256;       // размер фрейма для VAD (примерно 5 мс при 8 kHz)
const ENERGY_THRESHOLD = 0.015; // порог энергии – подбирается empirically

/**
 * Простейшая ресэмплинг‑функция (линейная интерполяция).
 * Для продакшена лучше использовать библиотеку типа `kissfft` или Web Audio API,
 * но здесь демонстрируем принцип без внешних зависимостей.
 */
function resample(int16Array, inRate, outRate) {
  if (inRate === outRate) return int16Array.slice();
  const ratio = inRate / outRate;
  const outLength = Math.round(int16Array.length / ratio);
  const result = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const idxLow = Math.floor(pos);
    const idxHigh = Math.ceil(pos);
    const f = pos - idxLow;
    const sampleLow = int16Array[idxLow] ?? 0;
    const sampleHigh = int16Array[idxHigh] ?? 0;
    result[i] = Math.round(sampleLow * (1 - f) + sampleHigh * f);
  }
  return result;
}

/**
 * Простейшее Voice Activity Detection (VAD) по энергии сигнала.
 * Возвращает новые Int16Array, содержащие только речевые фрагменты.
 * Если речь не обнаружена – возвращает пустой массив (можно wtedy решить
 * не отправлять запрос).
 */
function detectSpeech(int16Array, sampleRate) {
  const energyPerSample = [];
  const frameSize = Math.max(FRAME_SIZE, Math.floor(sampleRate * 0.01)); // ~10 мс
  let sum = 0;
  // считаем энергию в скользящем окне
  for (let i = 0; i < int16Array.length; i++) {
    const sample = int16Array[i] / 32768; // нормализуем [-1,1]
    sum += sample * sample;
    if (i >= frameSize) {
      const outSample = int16Array[i - frameSize] / 32768;
      sum -= outSample * outSample;
    }
    if (i >= frameSize - 1) {
      const avg = sum / frameSize;
      energyPerSample.push(avg);
    }
  }
  // теперь определяем границы речевых сегментов
  const speechFrames = [];
  let inSpeech = false;
  let startIdx = 0;
  for (let i = 0; i < energyPerSample.length; i++) {
    if (energyPerSample[i] > ENERGY_THRESHOLD) {
      if (!inSpeech) {
        inSpeech = true;
        startIdx = i * (frameSize / 2); // приблизительный сдвиг в сэмплах
      }
    } else {
      if (inSpeech) {
        inSpeech = false;
        const endIdx = i * (frameSize / 2);
        speechFrames.push({ start: startIdx, end: endIdx });
      }
    }
  }
  if (inSpeech) {
    speechFrames.push({ start: startIdx, end: int16Array.length });
  }
  // собираем речевые фрагменты в один массив
  if (speechFrames.length === 0) return new Int16Array(0);
  let totalLen = 0;
  for (const seg of speechFrames) totalLen += seg.end - seg.start;
  const result = new Int16Array(totalLen);
  let offset = 0;
  for (const seg of speechFrames) {
    result.set(int16Array.subarray(seg.start, seg.end), offset);
    offset += seg.end - seg.start;
  }
  return result;
}

/**
 * Кодирование в WAV 16‑bit little‑endian (заголовок + данные).
 * Возвращает ArrayBuffer, готовый к отправке как blob.
 */
function encodeWav(int16Array, sampleRate) {
  const buffer = new ArrayBuffer(44 + int16Array.length * 2);
  const view = new DataView(buffer);
  /* RIFF header */
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + int16Array.length * 2, true); // размер файла-8
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // подChunk размер для PCM
  view.setUint16(20, 1, true); // audio format = 1 (PCM)
  view.setUint16(22, 1, true); // число каналов (моно)
  view.setUint32(24, sampleRate, true); // sample rate
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, 'data');
  view.setUint32(40, int16Array.length * 2, true);// данные размер
  // PCM данные
  for (let i = 0; i < int16Array.length; i++) {
    view.setInt16(44 + i * 2, int16Array[i], true);
  }
  return buffer;
}

/**
 * Кратковременное кодирование в Opus (если доступно).
 * В React Native нет встроенного Opus энкодера, но можно воспользоваться
 * библиотекой `opusscript` через WebAssembly или вызвать нативный модуль.
 * Здесь-заглушка: если библиотека доступна – используем её,
 * иначе fallback на WAV.
 */
let opusEncoder = null;
async function getOpusEncoder() {
  if (opusEncoder) return opusEncoder;
  try {
    // Динамический импорт – работает только если пакет установлен
    const Opus = await import('opusscript');
    opusEncoder = new Opus.Encoder(SAMPLE_RATE_OUT, 1, 'audio');
    return opusEncoder;
  } catch (_) {
    return null; // fallback
  }
}
async function encodeOpus(int16Array, sampleRate) {
  const enc = await getOpusEncoder();
  if (!enc) return encodeWav(int16Array, sampleRate); // fallback
  // opusscript ожидает float32 в диапазоне [-1,1]
  const float32 = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32[i] = int16Array[i] / 32768;
  }
  const opusBytes = enc.encode(float32, FRAME_SIZE); // возвращает Uint8Array
  // Pack into Ogg Opus? Для простоты мы просто отправляем raw opus payload
  // и указываем Content-Type: audio/opus
  return opusBytes.buffer;
}

/**
 * Основная функция, которую вы будете вызывать после получения raw PCM от микрофона.
 * @param {Int16Array} rawPCM – 16‑bit литтл‑эндиан, частота SAMPLE_RATE_IN
 * @param {Object} options   – { useOpus?: boolean, returnAsBlob?: boolean }
 * @returns {Promise<Blob|ArrayBuffer|string>} – готовые данные для передачи в STT сервис.
 */
export async function prepareAudioForSTT(rawPCM, { useOpus = true, returnAsBlob = false } = {}) {
  // 1. Ресэмплинг до низкой частоты
  const resampled = resample(rawPCM, SAMPLE_RATE_IN, SAMPLE_RATE_OUT);
  // 2. VAD – оставляем только речь
  const speech = detectSpeech(resampled, SAMPLE_RATE_OUT);
  if (speech.length === 0) {
    // речь не обнаружена – можно вернуть пустой blob или возбудить ошибку
    return returnAsBlob ? new Blob([], { type: 'audio/wav' }) : new ArrayBuffer(0);
  }
  // 3. Кодирование
  let audioBuffer;
  if (useOpus) {
    audioBuffer = await encodeOpus(speech, SAMPLE_RATE_OUT);
  } else {
    audioBuffer = encodeWav(speech, SAMPLE_RATE_OUT);
  }
  if (returnAsBlob) {
    const mime = useOpus ? 'audio/opus' : 'audio/wav';
    return new Blob([audioBuffer], { type: mime });
  }
  return audioBuffer;
}

/**
 * Вспомогательная функция для записи строки в DataView.
 */
function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}