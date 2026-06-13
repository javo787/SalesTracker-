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
 */

const SAMPLE_RATE_IN = 48000; // частота, которую даёт микрофон по умолчанию
const SAMPLE_RATE_OUT = 8000; // целевая частота для распознавания (достаточно для речи)
const FRAME_SIZE = 256;       // размер фрейма для VAD (примерно 5 мс при 8 kHz)
const ENERGY_THRESHOLD = 0.015; // порог энергии – подбирается empirically

/**
 * Простейшая ресэмплинг‑функция (линейная интерполяция).
 */
function resample(int16Array: Int16Array, inRate: number, outRate: number): Int16Array {
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
 */
function detectSpeech(int16Array: Int16Array, sampleRate: number): Int16Array {
  const energyPerSample: number[] = [];
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
  const speechFrames: { start: number; end: number }[] = [];
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
 */
function encodeWav(int16Array: Int16Array, sampleRate: number): ArrayBuffer {
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
 */
let opusEncoder: any = null;
async function getOpusEncoder() {
  if (opusEncoder) return opusEncoder;
  try {
    // @ts-ignore
    const OpusScript = (await import('opusscript')).default;
    // @ts-ignore
    opusEncoder = new OpusScript(SAMPLE_RATE_OUT, 1, OpusScript.Application.AUDIO);
    return opusEncoder;
  } catch (_) {
    return null; // fallback
  }
}
async function encodeOpus(int16Array: Int16Array, sampleRate: number): Promise<ArrayBuffer> {
  const enc = await getOpusEncoder();
  if (!enc) return encodeWav(int16Array, sampleRate); // fallback
  // opusscript ожидает float32 в диапазоне [-1,1]
  const float32 = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32[i] = int16Array[i] / 32768;
  }
  const opusBytes = enc.encode(float32, FRAME_SIZE); // возвращает Uint8Array
  return opusBytes.buffer;
}

/**
 * Основная функция, которую вы будете вызывать после получения raw PCM от микрофона.
 */
export async function prepareAudioForSTT(
  rawPCM: Int16Array,
  { useOpus = true, returnAsBlob = false }: { useOpus?: boolean; returnAsBlob?: boolean } = {}
): Promise<Blob | ArrayBuffer> {
  // 1. Ресэмплинг до низкой частоты
  const resampled = resample(rawPCM, SAMPLE_RATE_IN, SAMPLE_RATE_OUT);
  // 2. VAD – оставляем только речь
  const speech = detectSpeech(resampled, SAMPLE_RATE_OUT);
  if (speech.length === 0) {
    return returnAsBlob ? new Blob([], { type: 'audio/wav' }) : new ArrayBuffer(0);
  }
  // 3. Кодирование
  let audioBuffer: ArrayBuffer;
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
function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
