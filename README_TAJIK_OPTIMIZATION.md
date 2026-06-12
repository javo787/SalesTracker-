# Оптимизация приложения для низкой пропускной способности (Таджикистан) и надёжной работы с Tajik языком

## 1. Голосовой ввод – снижение трафика
| Шаг | Что делаем | Почему экономит трафик |
|-----|------------|------------------------|
| **Понижение частоты дискретизации** | 48 kHz → 8 kHz (моно) | Размер PCM падает в 6 раз |
| **Удалениe silêncio (VAD)** | Выделяем только речевые фрагменты (энергия > порога) | Убираем 60‑80 % тишины в типичной фразе |
| **Кодирование в Opus** | Отправляем raw Opus payload (или упакованный в Ogg) | Opus дает ~2‑3× лучшее сжатие than raw PCM при той же intelligibility |
| **Базовое64 передача (опционально)** | Если бекенд ожидает строку – кодируем в base64 только после сжатия | base64 добавляет ~33 % overhead, но всё ещё меньше чем отправлятьraw 48 kHz PCM |

Все эти шаги реализованы в `src/utils/audioProcessor.js`.

## 2. Обход ограничений Gemini API
### 2.1 Множественные API‑ключи
- Храним **N ≥ 3** ключа Gemini в защищённом хранилище (например, зашифрованном в `AsyncStorage` или получаем от своего бекенда).
- При каждом запросе выбираем ключ по **round‑robin** алгоритму (см. `src/utils/geminiApi.js`).
- При получении ошибки **429 (ResourceExhausted)** или **403** переходим к следующему ключу, делая до `maxRetries` попыток.
- Между попытками применяем **exponential backoff** (начальная задержка 1 с, макс. 8 с) – снижает нагрузку на бекенд и даёт время для восстановления квоты.

### 2.2 Fallback на Groq
- Если все Gemini‑ключи исчерпаны, автоматически переключаемся на Groq (Mixtral‑8x7b) – тот же формат промпта, но другой эндпоинт.
-Groq также предоставляет бесплатный tier с высокой пропускной способностью; при необходимости можно хранить несколько Groq‑ключей и крутить их аналогично.

### 2.3 Кеширование частых запросов
- Для типовых фраз («Привет», «Сколько стоит…», «Дай совет дня») сохраняем результат в локальном `AsyncStorage` с TTL ≈ 1 час.
- Повторный запрос берётся из кеша – экономит как трафик, так и квоту.

## 3. Распознавание речи на Tajik языке
| Платформа | Поддержка Tajik в нативном движке | Что делаем |
|-----------|-----------------------------------|-----------|
| Android (`SpeechRecognizer`) | **Не поддерживается** в ОС out‑of‑the‑box | Пытаемся задействовать `locale: 'tg-TJ'`; если получаем ошибку – сразу переходим к облачному STT (Google Cloud Speech‑to‑Text) с параметром `languageCode: 'tg-TJ'`. |
| iOS (`SFSpeechRecognizer`) | **Не поддерживается** | Аналогично Android – сразу используем облачный STT. |
| **Облачный STT** (Google Cloud) | Поддерживает Tajik (`tg-TJ`) | Отправляем уже предпроцессированный Opus/WAV аудио; получаем транскрипт на Tajik (или Latin/ Cyrillic в зависимости от настроек). |
| **Fallback на русский** | Если пользователь не может чётко говорить на Tajik из‑за акцента/шума | После неудачной попытки распознать Tajik предлагаем повторить на русском (который отлично распознаётся нативно) и затем переводим через Gemini/Google Translate (кешируем перевод). |

## 4. Архитектура взаимодействия (упрощённо)
```
[Микрофон] -> audioProcessor (resample -> VAD -> Opus) ->
[Blob] -> 1️⃣ Попытка распознать через `react-native-voice` (если locale поддерживается) ->
   אם úspěх -> передаём текст в GeminiApi.generateContent()
   אם ошибка -> 2️⃣ Отправляем Blob в Google Cloud STT ( języк tg-TJ ) ->
        получаем транскрипт -> GeminiApi.generateContent()
[GeminiApi] -> (key rotation + fallback Groq) -> risposta ->
[UI] -> показать результат + экран подтверждения
```

## 5. Рекомендованные зависимости (npm/yarn)
```json
{
  "dependencies": {
    "@react-native-voice": "^3.2.1",          // голосовой ввод (обертка)
    "react-native-fs": "^2.20.0",             // работа с файловой системой (временные аудио)
    "@react-native-firebase/app": "^19.0.0",  // инициализация Firebase (для аналитики/адмоб)
    "@react-native-firebase/admob": "^19.0.0",// баннеры/интерститиалы
    "@react-native-firebase/analytics": "^19.0.0",
    "react-native-blob-util": "^0.18.0",      // удобная работа с Blob/File
    "opusscript": "^0.0.8",                   // Opus энкодер (wasm) – опционально
    "@react-native-async-storage/async-storage": "^1.23.0", // кеширование
    "axios": "^1.7.2"                         // если нужен прокси‑бекенд для ключей
  }
}
```

> **Примечание про Expo:** Если стартуете через Expo (managed workflow), `react-native-voice` доступен начиная с SDK 48; для доступа к микрофону добавьте permiso `"android.permission.RECORD_AUDIO"` и `"ios NSMicrophoneUsageDescription"` в `app.json`. Для работы с `opusscript` может потребоваться eject в bare workflow, либо реализовать Opus‑энкодер на нативном модуле.

## 6. Пример использования в компоненте
```tsx
// src/components/VoiceInput.tsx
import React, {useCallback, useRef} from 'react';
import {View, Button, Text, ActivityIndicator, Alert} from 'react-native';
import Voice from '@react-native-voice/voice';
import {prepareAudioForSTT} from '../utils/audioProcessor';
import GeminiApi from '../utils/geminiApi';
import AsyncStorage from '@react-native-async-storage/async-storage';

const gemini = new GeminiApi({
  geminiKeys: [/* заполните из env или защищённого хранилища */],
  groqKey:    process.env.EXPO_PUBLIC_GROQ_KEY, // опционально
});

export default function VoiceInput({onResult}: {onResult: (txt:string)=>void}) {
  const [listening, setListening] = React.useState(false);
  const [processing, setProcessing] = React.useState(false);
  const audioRef = useRef<Int16Array | null>(null);

  React.useEffect(() => {
    Voice.onSpeechStart = onSpeechStart;
    Voice.onSpeechEnd   = onSpeechEnd;
    Voice.onSpeechError = onSpeechError;
    Voice.onSpeechResults = onSpeechResults;
    return () => {
      Voice.destroy();
      Voice.removeAllListeners();
    };
  }, []);

  const onSpeechStart = () => setListening(true);
  const onSpeechEnd   = () => setListening(false);
  const onSpeechError = (e:any) => {
    console.error('Voice error', e);
    setListening(false);
    Alert.alert('Ошибка голоса', e.message);
  };
  const onSpeechResults = async (e:any) => {
    // Если нативный движок вернул текст – сразу идём в Gemini
    if (e.value && e.value[0]) {
      setProcessing(true);
      try {
        const txt = e.value[0];
        const aiResp = await gemini.generateContent({
          contents: [{parts: [{text: txt}]}],
        });
        const reply = aiResp.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        onResult(reply);
      } finally {
        setProcessing(false);
      }
    }
  };

  const startListening = useCallback(async () => {
    try {
      // Попытка начать распознавание на Tajik (если поддерживается)
      await Voice.start('tg-TJ');
    } catch (err) {
      // Если нативный движок не знает Tajik – fallback к ручной записи аудио
      await Voice.start('en-US'); // любой поддерживаемый locale для получения PCM
    }
  }, []);

  const stopListening = useCallback(async () => {
    await Voice.stop();
    // Получаем путь к временному wav файлу (react-native-voice сохраняет его)
    const filePath = await Voice.getFilePath();
    const raw = await RNFS.readFile(filePath, 'encoding'); // получаем raw PCM (16‑bit LE)
    const int16 = new Int16Array(raw.buffer);
    const prepared = await prepareAudioForSTT(int16, {useOpus: true, returnAsBlob: true});
    // Отправляем в Google Cloud STT (пример через собственный прокси‑бекэнд)
    const sttResp = await fetch('https://YOUR_BACKEND/stt', {
      method: 'POST',
      body: prepared,
      headers: {'Content-Type': 'audio/opus'},
    });
    const {transcript} = await sttResp.json();
    // Далее – Gemini
    setProcessing(true);
    try {
      const aiResp = await gemini.generateContent({
        contents: [{parts: [{text: transcript}]}],
      });
      const reply = aiResp.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      onResult(reply);
    } finally {
      setProcessing(false);
    }
  }, []);

  return (
    <View style={{padding: 20}}>
      <Button title={listening ? 'Слушаю…' : 'Начать голосовой ввод'}
              onPress={listening ? stopListening : startListening}
              disabled={processing}/>
      {listening && <Text>Говорите…</Text>}
      {processing && <ActivityIndicator size="small" />}
    </View>
  );
}
```

## 7. Как хранить и обновлять ключи безопасно
- **Бекенд‑прокси**: создайте небольшую эндпоинт (Node/Cloudflare Workers), который хранит массив ключей и отдаёт один ключ на запрос (с ротацией на сервере). Тогда в мобильном приложении не нужно хранить ключи открыто.
- **Если ключи хранятся в приложении** – зашифруйте их с помощью `expo-secure-store`или `react-native-keychain` и расшифровывайте только в момент использования.
- **Обновление ключей** – при выпуске новой версии приложения или через пуш‑уведомление можно доставлять новый набор ключей (зашифрованный) и заменять старый в `AsyncStorage`.

## 8. Тестирование в условиях низкой пропускной способности
1. **Эмулятор сети**: используйте Android Studio → Emulators → Cellular → 설정 → скорость 50 kbps, задержка 200 мс.
2. **Измерьте размер отправляемого аудио**:
   - rå PCM 48 kHz 16‑bit моно → ~960 КБ/сек.
   - После resample → 8 kHz → ~160 КБ/сек.
   - После VAD (≈30 % речи) → ~48 КБ/сек.
   - После Opus (~1:3 сжатие) → ~16 КБ/сек.
   → **Экономия ~98 %** по сравнению с отправкой raw.
3. **Проверьте распознавание** на реальных устройствах с Tajik произношением (можно собрать небольшую корпус фраз от носителей и измерить WER).
4. **Симулируйте исчерпание квоты** – установите низкий лимит в консоли Google Cloud (например, 5 запросов в минуту) и убедитесь, что приложение переключается на следующий ключ или на Groq без падения.

## 9. Что делать дальше
- [x] Добавить `audioProcessor.js` и `geminiApi.js` (уже сделано).
- [ ] Интегрировать голосовой ввод в основной экран приложения (см. пример компонента выше).
- [ ] Настроить бекенд‑прокси для хранения и ротации Gemini‑ключей (опционально).
- [ ] Добавить кеширование запросов к Gemini/Гroq через `AsyncStorage`.
- [ ] Выполнить нагрузочное тестирование в условиях сети 3G/2G, типичных для сельских районов Таджикистана.

Если понадобится пример бекенд‑прокси на Node.js или более детальная настройка `react-native-voice` для конкретных устройств – дайте знать, я подготовлю соответствующие файлы. 🚀