import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  Modal,
  LayoutChangeEvent,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  runOnJS,
  interpolateColor,
} from 'react-native-reanimated';
import {
  useAudioRecorder,
  AudioModule,
  setAudioModeAsync,
  RecordingPresets,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import { useAppContext } from '../context/AppContext';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { VoiceSaleResult } from '../types/voiceSale';
import { Colors, Radius, Spacing, FontSize, Shadow } from '../constants/theme';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface VoiceRecorderProps {
  onResult: (result: VoiceSaleResult) => void;
  onClose?: () => void;
}

type RecState = 'idle' | 'recording' | 'locked' | 'sending' | 'processing';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const MAX_DURATION_MS = 60_000;
const WARNING_MS = 55_000;
const MIN_DURATION_MS = 700;

/** Порог свайпа вправо для отмены (px) */
const CANCEL_THRESHOLD = 80;
/** Порог свайпа вверх для блокировки (px, отрицательное значение = вверх) */
const LOCK_THRESHOLD = -60;

/**
 * LANGUAGE STRATEGY
 *
 * Проблема: Whisper large-v3 плохо справляется с tg/uz когда язык задан явно,
 * потому что модель имеет мало обучающих данных для этих языков.
 *
 * Решение (проверено на практике):
 *
 * 1. ru  → явно указываем 'ru', модель отлично обучена
 * 2. tg  → НЕ указываем язык (language: undefined) — Whisper сам
 *           определяет язык через lid и транскрибирует точнее.
 *           Добавляем prompt на таджикском чтобы "подтолкнуть" модель
 *           в нужном направлении без жёсткой блокировки языка.
 * 3. uz  → аналогично tg: без явного языка + prompt на узбекском.
 *
 * Дополнительно используем whisper-large-v3-turbo вместо whisper-large-v3
 * — он быстрее и показывает лучшее качество на low-resource языках
 * благодаря другой стратегии дистилляции.
 *
 * Prompt помогает двумя способами:
 * a) задаёт контекст предметной области (торговля)
 * b) показывает модели ожидаемый script (кириллица для tg/uz)
 */
type GroqLangConfig = {
  /** undefined = auto-detect, лучше для tg/uz */
  language: string | undefined;
  /** подсказка для модели на нативном языке */
  prompt: string;
  /** модель: turbo быстрее и лучше на редких языках */
  model: string;
};

function getLangConfig(appLang: string): GroqLangConfig {
  switch (appLang) {
    case 'tg':
      return {
        language: undefined, // auto-detect — ключевое решение для таджикского
        prompt:
          'нарх, фурӯш, сомонӣ, килограмм, дона, миқдор, кило, фоида, харид, анбор, мол, ' +
          'помидор, пиёз, картошка, орд, шакар, равған, гӯшт, мурғ, биринҷ, нон',
        model: 'whisper-large-v3-turbo',
      };
    case 'uz':
      return {
        language: undefined, // auto-detect — ключевое решение для узбекского
        prompt:
          'narx, sotuv, som, kilogram, dona, miqdor, kilo, foyda, xarid, ombor, mahsulot, ' +
          'помидор, пиёз, картошка, un, shakar, moy, go\'sht, tovuq, guruch, non, ' +
          'нарх, сом, дона, миқдор',
        model: 'whisper-large-v3-turbo',
      };
    case 'ru':
    default:
      return {
        language: undefined, // auto-detect for Russian as well
        prompt:
          'нарх, продажа, сомони, килограмм, штука, количество, кило, прибыль, ' +
          'закупка, склад, товар, помидор, лук, картошка, мука, сахар, масло',
        model: 'whisper-large-v3-turbo',
      };
  }
}

// ─────────────────────────────────────────────
// Recording options (SDK 56 compatible)
// ─────────────────────────────────────────────
const recordingOptions: any = {
  ...RecordingPresets.HIGH_QUALITY,
  android: {
    extension: '.m4a',
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
    sampleRate: 22_050,
    numberOfChannels: 1,
    bitRate: 64_000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: 'mpeg4aac',
    audioQuality: 'medium',
    sampleRate: 22_050,
    numberOfChannels: 1,
    bitRate: 64_000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Проверяем, является ли ошибка "released object" (Android-специфика) */
function isReleasedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('shared object') ||
    msg.includes('already released') ||
    msg.includes('java.lang.Integer') ||
    msg.includes('cannot be cast')
  );
}

/** Безопасно читаем recorder.isRecording — может бросить если объект released */
function safeIsRecording(recorder: ReturnType<typeof useAudioRecorder>): boolean {
  try {
    return recorder.isRecording;
  } catch {
    return false;
  }
}

/** Безопасно останавливаем запись */
async function safeStopRecorder(
  recorder: ReturnType<typeof useAudioRecorder>
): Promise<string | null> {
  try {
    if (!safeIsRecording(recorder)) return null;
    await recorder.stop();
    return recorder.uri ?? null;
  } catch (err) {
    if (!isReleasedError(err)) {
      console.warn('[VoiceRecorder] stop error:', err);
    }
    return null;
  }
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export default function VoiceRecorder({ onResult, onClose }: VoiceRecorderProps) {
  const { t } = useTranslation();
  const { resolvedTheme, language } = useAppContext();
  const isDark = resolvedTheme === 'dark';
  const recorder = useAudioRecorder(recordingOptions);

  // ── UI state ──────────────────────────────────
  const [recState, setRecState] = useState<RecState>('idle');
  const [voiceLang, setVoiceLang] = useState(language);
  const [showInfo, setShowInfo] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [warningSecondsLeft, setWarningSecondsLeft] = useState(5);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [timerText, setTimerText] = useState('00:00');
  const [hintText, setHintText] = useState('');

  // ── Refs — не вызывают ре-рендер, безопасны в async callbacks ──
  const durationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const secondsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Флаг: recorder.record() ещё не резолвнулся — идёт асинхронная инициализация.
   *  Пока true, release/cancel/lock нельзя обрабатывать напрямую (recorder не готов). */
  const isStartingRef = useRef(false);
  /** Действие, которое пользователь запросил (send/discard/lock), пока recorder
   *  ещё инициализировался — применяется сразу как только recorder.record() резолвится.
   *  Раньше был stopRequestedRef, который проверялся, но нигде не устанавливался в true —
   *  из-за этого release/lock во время инициализации молча терялся, а запись
   *  продолжала идти в фоне без какой-либо возможности её остановить. */
  const pendingActionRef = useRef<null | 'send' | 'discard' | 'lock'>(null);
  /** Метка времени старта записи для проверки MIN_DURATION_MS */
  const startTimeRef = useRef<number | null>(null);
  /** Флаг: компонент размонтирован — не обновляем state */
  const unmountedRef = useRef(false);
  /** Измеренная ширина контейнера — куда раскрывается капсула записи */
  const containerWidthRef = useRef(0);
  /** Зеркало recState в ref — чтобы startRecording/composedGesture могли быть
   *  стабильными по ссылке (useCallback/useMemo) и не пересоздаваться на каждый
   *  ре-рендер (в т.ч. каждые 500мс от таймера). recState остаётся источником
   *  истины для рендера, recStateRef — только для чтения внутри колбэков. */
  const recStateRef = useRef<RecState>('idle');

  // ── Reanimated shared values (UI thread) ──────
  const widthVal = useSharedValue(48);
  const slideProgress = useSharedValue(0);
  const lockProgress = useSharedValue(0);
  /** Гарантирует, что release-действие (send/discard/lock) обработается РОВНО один раз
   *  за жест, даже если и onEnd, и onFinalize успеют сработать. */
  const hasHandledReleaseValue = useSharedValue(false);
  const hasTriggeredCancelHaptic = useSharedValue(false);
  const hasTriggeredLockHaptic = useSharedValue(false);
  const wave1 = useSharedValue(0.2);
  const wave2 = useSharedValue(0.2);
  const wave3 = useSharedValue(0.2);
  const wave4 = useSharedValue(0.2);
  const wave5 = useSharedValue(0.2);
  const sendIconOpacity = useSharedValue(0);
  const sendIconScale = useSharedValue(0.6);
  const sendIconTranslateX = useSharedValue(0);
  const sendIconTranslateY = useSharedValue(0);
  const sendIconRotate = useSharedValue(0);

  // ── Layout measurement ────────────────────────
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    containerWidthRef.current = e.nativeEvent.layout.width;
  }, []);

  // ── Timers ──────────────────────────────────
  const clearTimers = useCallback(() => {
    if (durationTimerRef.current) clearTimeout(durationTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (secondsTimerRef.current) clearInterval(secondsTimerRef.current);
    durationTimerRef.current = null;
    warningTimerRef.current = null;
    secondsTimerRef.current = null;
  }, []);

  // ── Animations ────────────────────────────────
  const stopAnimations = useCallback(() => {
    wave1.value = 0.2;
    wave2.value = 0.2;
    wave3.value = 0.2;
    wave4.value = 0.2;
    wave5.value = 0.2;
    slideProgress.value = 0;
    lockProgress.value = 0;
  }, [wave1, wave2, wave3, wave4, wave5, slideProgress, lockProgress]);

  const startWaveformAnimations = useCallback(() => {
    wave1.value = withRepeat(withSequence(withTiming(1, { duration: 400 }), withTiming(0.2, { duration: 400 })), -1, true);
    wave2.value = withRepeat(withSequence(withTiming(1, { duration: 300 }), withTiming(0.2, { duration: 350 })), -1, true);
    wave3.value = withRepeat(withSequence(withTiming(1, { duration: 500 }), withTiming(0.2, { duration: 450 })), -1, true);
    wave4.value = withRepeat(withSequence(withTiming(1, { duration: 350 }), withTiming(0.2, { duration: 300 })), -1, true);
    wave5.value = withRepeat(withSequence(withTiming(1, { duration: 450 }), withTiming(0.2, { duration: 400 })), -1, true);
  }, [wave1, wave2, wave3, wave4, wave5]);

  // ── Haptics ───────────────────────────────────
  const triggerHaptic = useCallback(async (type: 'impactLight' | 'impactMedium' | 'warning' | 'success') => {
    try {
      if (type === 'impactLight') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else if (type === 'impactMedium') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else if (type === 'warning') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else if (type === 'success') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (_) {}
  }, []);

  // ── Transcription ────────────────────────────
  const transcribeAudio = useCallback(
    async (uri: string) => {
      if (unmountedRef.current) return;
      if (!unmountedRef.current) setRecState('processing');
      abortRef.current = new AbortController();

      try {
        const apiUrl = process.env.EXPO_PUBLIC_API_URL;
        if (!apiUrl) {
          throw new Error('API URL не настроен. Обратитесь к администратору приложения.');
        }
        const transcribeUrl = `${apiUrl}/voice-sale`;

        const ext = uri.split('.').pop()?.toLowerCase() ?? 'm4a';
        const mimeMap: Record<string, string> = {
          m4a: 'audio/m4a',
          mp4: 'audio/mp4',
          '3gp': 'audio/3gpp',
          aac: 'audio/aac',
          wav: 'audio/wav',
        };
        const mimeType = mimeMap[ext] ?? 'audio/m4a';

        const { language: groqLang, prompt, model } = getLangConfig(voiceLang);

        // Параметры запроса — language опциональный!
        const parameters: Record<string, string> = {
          model,
          prompt,
          response_format: 'json',
        };
        // Для tg/uz НЕ добавляем language — пусть Whisper auto-detect
        if (groqLang) {
          parameters.language = groqLang;
        }

        // FileSystem.uploadAsync — единственный надёжный способ отправить
        // бинарный файл в React Native / Hermes без Blob API
        const uploadHeaders: Record<string, string> = {};
        const token = await SecureStore.getItemAsync('auth_token');
        if (token) {
          uploadHeaders['Authorization'] = `Bearer ${token}`;
        }

        const result = await FileSystem.uploadAsync(transcribeUrl, uri, {
          fieldName: 'file',
          httpMethod: 'POST',
          mimeType,
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          headers: uploadHeaders,
          parameters,
        });

        // Удаляем временный файл сразу после загрузки
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});

        if (unmountedRef.current) return;

        let body: any;
        try {
          body = JSON.parse(result.body);
        } catch {
          body = { message: result.body };
        }

        if (result.status === 401) {
          await SecureStore.deleteItemAsync('auth_token');
          throw new Error('Сессия истекла. Пожалуйста, войдите снова.');
        }

        if (result.status === 429) {
          const retryAfter = body?.retryAfterSeconds ? ` через ${body.retryAfterSeconds} сек.` : ' через минуту.';
          throw new Error(`Слишком много попыток. Попробуйте${retryAfter}`);
        }

        if (result.status !== 200 && result.status !== 201) {
          const detail = body?.error?.message ?? body?.message ?? 'Ошибка API';
          throw new Error(`[${result.status}] ${detail}`);
        }

        onResult(body as VoiceSaleResult);
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        if (unmountedRef.current) return;
        console.warn('[VoiceRecorder] transcribe error:', err);
        Alert.alert('Ошибка распознавания', err?.message ?? 'Не удалось распознать речь');
      } finally {
        if (!unmountedRef.current) {
          setRecState('idle');
          widthVal.value = withTiming(48, { duration: 200 });
        }
        abortRef.current = null;
      }
    },
    [onResult, voiceLang, widthVal]
  );

  // ── Stop recording (core logic) ──────────────
  // discard=true  → свайп-отмена или сброс: файл удаляется, ничего не отправляется
  // discard=false → обычное отпускание ИЛИ кнопка "отправить" в locked-режиме: всегда отправляем
  const stopRecordingInternal = useCallback(
    async (discard: boolean) => {
      clearTimers();
      stopAnimations();
      if (!unmountedRef.current) setShowWarning(false);

      // Вычисляем длительность ДО вызова stop()
      const durationMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
      startTimeRef.current = null;

      const uri = await safeStopRecorder(recorder);
      console.log('[VR-DEBUG] stopRecordingInternal', Date.now(), 'discard=', discard, 'durationMs=', durationMs, 'uri=', uri ? 'ok' : 'null');

      if (discard) {
        if (uri) FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        if (!unmountedRef.current) {
          setRecState('idle');
          widthVal.value = withTiming(48, { duration: 200 });
        }
        triggerHaptic('warning');
        return;
      }

      if (!uri) {
        // объект был released или не записывал
        if (!unmountedRef.current) {
          setRecState('idle');
          widthVal.value = withTiming(48, { duration: 200 });
        }
        return;
      }

      if (durationMs < MIN_DURATION_MS) {
        // Слишком короткое нажатие
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        Alert.alert('🎙️ Удержите кнопку', 'Нажмите и удерживайте пока говорите, затем отпустите.');
        if (!unmountedRef.current) {
          setRecState('idle');
          widthVal.value = withTiming(48, { duration: 200 });
        }
        return;
      }

      // Анимация mic → paper-plane перед отправкой (Telegram-style):
      // фаза 1 — появление (pop), фаза 2 — «улёт» по диагонали с поворотом.
      // Всё на UI-потоке через Reanimated (withTiming/withSequence/withDelay) —
      // не JS-таймеры, поэтому не нагружает JS-поток и не тормозит UI.
      if (!unmountedRef.current) setRecState('sending');
      triggerHaptic('impactLight');
      sendIconOpacity.value = 0;
      sendIconScale.value = 0.6;
      sendIconTranslateX.value = 0;
      sendIconTranslateY.value = 0;
      sendIconRotate.value = 0;

      sendIconOpacity.value = withSequence(
        withTiming(1, { duration: 120 }), // pop-in
        withTiming(1, { duration: 100 }), // задержка перед улётом
        withTiming(0, { duration: 180 }) // fade во время улёта
      );
      sendIconScale.value = withSequence(
        withTiming(1.15, { duration: 130 }),
        withTiming(1, { duration: 100 }),
        withTiming(0.82, { duration: 180 })
      );
      sendIconTranslateX.value = withDelay(230, withTiming(16, { duration: 180 }));
      sendIconTranslateY.value = withDelay(230, withTiming(-14, { duration: 180 }));
      sendIconRotate.value = withDelay(230, withTiming(18, { duration: 180 }));

      await new Promise((resolve) => setTimeout(resolve, 410));
      if (unmountedRef.current) return;

      await transcribeAudio(uri);
    },
    [
      recorder,
      clearTimers,
      stopAnimations,
      transcribeAudio,
      widthVal,
      triggerHaptic,
      sendIconOpacity,
      sendIconScale,
      sendIconTranslateX,
      sendIconTranslateY,
      sendIconRotate,
    ]
  );

  // ── Start recording ──────────────────────────
  const startRecording = useCallback(async () => {
    if (recStateRef.current !== 'idle') return;

    setShowOnboarding(false);
    setRecState('recording');
    widthVal.value = withTiming(containerWidthRef.current || 280, { duration: 250 });

    isStartingRef.current = true;
    pendingActionRef.current = null;
    slideProgress.value = 0;
    lockProgress.value = 0;

    try {
      // Cleanup зависшей сессии (защита от двойного нажатия)
      if (safeIsRecording(recorder)) {
        await safeStopRecorder(recorder);
        await new Promise((r) => setTimeout(r, 120));
      }

      // Проверяем разрешение
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Нет доступа к микрофону', 'Разрешите доступ в настройках телефона.');
        isStartingRef.current = false;
        pendingActionRef.current = null;
        if (!unmountedRef.current) setRecState('idle');
        widthVal.value = withTiming(48, { duration: 200 });
        return;
      }

      // Настраиваем аудио сессию
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

      // Подготовка и запуск
      await recorder.prepareToRecordAsync();
      await recorder.record();

      startTimeRef.current = Date.now();
      isStartingRef.current = false;

      // Пользователь успел отпустить/свайпнуть кнопку, пока recorder ещё готовился —
      // применяем отложенное действие ПРЯМО СЕЙЧАС, вместо того чтобы дать
      // записи повиснуть в фоне без возможности её остановить.
      const pending = pendingActionRef.current;
      pendingActionRef.current = null;

      if (pending === 'send' || pending === 'discard') {
        stopRecordingInternal(pending === 'discard');
        return;
      }

      startWaveformAnimations();
      triggerHaptic('impactMedium');

      if (pending === 'lock' && !unmountedRef.current) {
        setRecState('locked');
      }

      setTimerText('00:00');
      setWarningSecondsLeft(Math.ceil((MAX_DURATION_MS - WARNING_MS) / 1000));
      const start = Date.now();
      secondsTimerRef.current = setInterval(() => {
        const elapsedMs = Date.now() - start;
        const elapsedSecs = Math.floor(elapsedMs / 1000);
        const mins = Math.floor(elapsedSecs / 60).toString().padStart(2, '0');
        const secs = (elapsedSecs % 60).toString().padStart(2, '0');
        if (!unmountedRef.current) setTimerText(`${mins}:${secs}`);

        // Настоящий обратный отсчёт вместо статичного "5 сек" на весь
        // последний пятисекундный интервал перед лимитом записи.
        const remainingMs = MAX_DURATION_MS - elapsedMs;
        if (remainingMs <= MAX_DURATION_MS - WARNING_MS && !unmountedRef.current) {
          setWarningSecondsLeft(Math.max(0, Math.ceil(remainingMs / 1000)));
        }
      }, 500);

      // Авто-стоп по максимальной длительности
      durationTimerRef.current = setTimeout(() => {
        if (safeIsRecording(recorder)) {
          stopRecordingInternal(false);
          Alert.alert('Инфо', 'Достигнут лимит записи (60 сек).');
        }
      }, MAX_DURATION_MS);

      // Предупреждение за 5 сек до лимита
      warningTimerRef.current = setTimeout(() => {
        if (!unmountedRef.current) setShowWarning(true);
      }, WARNING_MS);
    } catch (err) {
      console.error('[VoiceRecorder] startRecording error:', err);
      isStartingRef.current = false;
      pendingActionRef.current = null;
      if (!unmountedRef.current) setRecState('idle');
      widthVal.value = withTiming(48, { duration: 200 });
      Alert.alert('Ошибка', 'Не удалось начать запись. Попробуйте ещё раз.');
    }
  }, [
    recorder,
    stopRecordingInternal,
    widthVal,
    triggerHaptic,
    startWaveformAnimations,
    slideProgress,
    lockProgress,
  ]);

  // ── Gesture (press, slide-to-cancel, slide-up-to-lock, release-to-send) ──
  //
  // ПОЧЕМУ LongPress, А НЕ ОДИН Pan (как было раньше):
  // Pan-жест активируется (переходит в ACTIVE) только после смещения пальца
  // минимум на minDistance (~10px), и onEnd вызывается ТОЛЬКО для перехода
  // из ACTIVE — то есть только если было движение. Основной сценарий этой
  // кнопки — держать палец НЕПОДВИЖНО и говорить. При таком нажатии Pan мог
  // вообще не дойти до ACTIVE, и тогда onEnd не срабатывал ни разу: запись
  // стартовала (onBegin) и продолжала идти в фоне без отправки, пока не
  // срабатывал 60-секундный автостоп. Это и есть баг "при отпускании
  // продолжает записывать".
  //
  // LongPress активируется по ВРЕМЕНИ удержания (minDuration), а не по
  // расстоянию, поэтому надёжно ловит и onEnd, и (гарантированно, при любом
  // исходе — успех/обрыв/отмена системой) onFinalize даже без единого пикселя
  // движения. Pan работает ПАРАЛЛЕЛЬНО через Gesture.Simultaneous — он больше
  // не решает, когда стартовать/стопать запись, а только поставляет
  // translationX/Y для свайп-отмены и свайп-блокировки.
  const handleRelease = useCallback(
    (action: 'send' | 'discard' | 'lock') => {
      console.log('[VR-DEBUG] handleRelease', Date.now(), 'action=', action, 'isStarting=', isStartingRef.current);
      if (isStartingRef.current) {
        // recorder.record() ещё не резолвнулся — applyем действие, как только будет готов.
        // Раньше в этой ситуации действие просто терялось (см. startRecording).
        pendingActionRef.current = action;
        return;
      }
      if (action === 'lock') {
        if (!unmountedRef.current) setRecState('locked');
        return;
      }
      stopRecordingInternal(action === 'discard');
    },
    [stopRecordingInternal]
  );

  const longPressGesture = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(0) // активируется сразу на касание — как раньше onBegin
        .maxDistance(100_000) // не даём жесту «провалиться» из-за свайпа отмены/блокировки
        .shouldCancelWhenOutside(false)
        .onStart(() => {
          // См. аналогичный фикс/комментарий в VoiceCapsule.tsx: сбрасываем
          // hasTriggeredCancelHaptic/hasTriggeredLockHaptic здесь же, синхронно
          // на UI-потоке, а не внутри startRecording (JS-поток, через runOnJS) —
          // иначе panGesture, стартующий одновременно, мог прочитать стухшие
          // значения от предыдущей записи.
          hasHandledReleaseValue.value = false;
          hasTriggeredCancelHaptic.value = false;
          hasTriggeredLockHaptic.value = false;
          console.log('[VR-DEBUG] onStart', Date.now());
          runOnJS(startRecording)();
        })
        .onFinalize(() => {
          // onFinalize — ЕДИНСТВЕННЫЙ колбэк, который гарантированно вызывается
          // при любом завершении жеста (успешное отпускание, обрыв, системная
          // отмена). Именно поэтому решение send/discard/lock принимается здесь,
          // а не в onEnd — так исключается сценарий, где запись зависает без
          // единого способа её остановить.
          if (hasHandledReleaseValue.value) return;
          hasHandledReleaseValue.value = true;

          // Липкая отмена/блокировка: если порог был пройден хоть раз — считается,
          // даже если палец вернули обратно перед отпусканием.
          const shouldCancel = slideProgress.value >= CANCEL_THRESHOLD || hasTriggeredCancelHaptic.value;
          const shouldLock = lockProgress.value <= LOCK_THRESHOLD || hasTriggeredLockHaptic.value;
          console.log(
            '[VR-DEBUG] onFinalize',
            Date.now(),
            'slideProgress=',
            slideProgress.value,
            'lockProgress=',
            lockProgress.value,
            'shouldCancel=',
            shouldCancel,
            'shouldLock=',
            shouldLock
          );

          if (shouldCancel) {
            runOnJS(handleRelease)('discard');
          } else if (shouldLock) {
            runOnJS(handleRelease)('lock');
          } else {
            runOnJS(handleRelease)('send');
          }
        }),
    [startRecording, handleRelease, hasHandledReleaseValue, slideProgress, lockProgress, hasTriggeredCancelHaptic, hasTriggeredLockHaptic]
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(1)
        .shouldCancelWhenOutside(false)
        .onUpdate((event) => {
          slideProgress.value = event.translationX;
          lockProgress.value = event.translationY;

          // X-порог (свайп вправо = отмена)
          if (event.translationX >= CANCEL_THRESHOLD && !hasTriggeredCancelHaptic.value) {
            hasTriggeredCancelHaptic.value = true;
            runOnJS(triggerHaptic)('warning');
          }

          // Y-порог (свайп вверх = блокировка)
          if (event.translationY <= LOCK_THRESHOLD && !hasTriggeredLockHaptic.value) {
            hasTriggeredLockHaptic.value = true;
            runOnJS(triggerHaptic)('impactLight');
          }
        }),
    [slideProgress, lockProgress, hasTriggeredCancelHaptic, hasTriggeredLockHaptic, triggerHaptic]
  );

  // LongPress и Pan трекают ОДНО и то же касание одновременно — Pan никогда
  // не "проваливается"/не отменяет LongPress, даже если сам не активировался.
  //
  // ПОЧЕМУ useMemo (фикс после регрессии): composedGesture передаётся в
  // <GestureDetector gesture={...}>. Если этот объект пересоздаётся на КАЖДЫЙ
  // рендер (а компонент ре-рендерится каждые 500мс из-за setTimerText, пока
  // идёт запись), RNGH вызывает RNGestureHandlerModule.updateGestureHandler()
  // на нативной стороне ПРЯМО ПОСЕРЕДИНЕ активного касания — библиотека сама
  // отмечает это в исходниках (GestureDetector/index.tsx: "Gesture config
  // should be wrapped with useMemo to prevent unnecessary re-renders").
  // Это и было причиной, почему отпускание/лок/отправка отваливались
  // непредсказуемо уже ПОСЛЕ фикса с shouldCancelWhenOutside: сам жест ни разу
  // не был мемоизирован, поэтому каждый тик таймера мог сбить трекинг
  // активного касания. useMemo здесь — не оптимизация, а обязательное условие
  // стабильности, как и явно рекомендует сама библиотека.
  const composedGesture = useMemo(() => Gesture.Simultaneous(longPressGesture, panGesture), [longPressGesture, panGesture]);

  // ── Locked-state action buttons ───────────────
  // К моменту, когда рендерятся эти кнопки, recState уже 'locked', а значит
  // isStartingRef.current гарантированно false (см. handleRelease/startRecording) —
  // recorder точно готов, вызывать stopRecordingInternal напрямую безопасно.
  const handleLockTrash = () => stopRecordingInternal(true);
  const handleLockSend = () => stopRecordingInternal(false);

  useEffect(() => {
    recStateRef.current = recState;
  }, [recState]);

  // ── Language Persistence ─────────────────────
  const lastSystemLangRef = useRef(language);

  useEffect(() => {
    const loadVoiceLang = async () => {
      const saved = await AsyncStorage.getItem('voice_language');
      if (saved && (saved === 'ru' || saved === 'tg' || saved === 'uz')) {
        setVoiceLang(saved);
      } else {
        setVoiceLang(language);
      }
    };
    loadVoiceLang();
  }, []);

  useEffect(() => {
    // Only override voice language when system language *changes* explicitly
    if (language !== lastSystemLangRef.current) {
      setVoiceLang(language);
      AsyncStorage.setItem('voice_language', language);
      lastSystemLangRef.current = language;
    }
  }, [language]);

  const changeVoiceLang = async (lang: string) => {
    setVoiceLang(lang);
    await AsyncStorage.setItem('voice_language', lang);
  };

  // ── First-time onboarding hint ─────────────────
  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const checkOnboarding = async () => {
      try {
        const seen = await AsyncStorage.getItem('voice_recorder_onboarding_seen');
        if (!seen && !unmountedRef.current) {
          setShowOnboarding(true);
          await AsyncStorage.setItem('voice_recorder_onboarding_seen', '1');
          hideTimer = setTimeout(() => {
            if (!unmountedRef.current) setShowOnboarding(false);
          }, 4500);
        }
      } catch (_) {}
    };
    checkOnboarding();
    return () => {
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  // ── AppState & cleanup ───────────────────────
  useEffect(() => {
    unmountedRef.current = false;

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active' && safeIsRecording(recorder)) {
        stopRecordingInternal(false);
      }
    });

    return () => {
      unmountedRef.current = true;
      sub.remove();
      clearTimers();

      // Безопасная остановка при размонтировании
      safeStopRecorder(recorder).catch(() => {});

      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [recorder, clearTimers, stopRecordingInternal]);

  // ── Processing hint text (Распознаём → Разбираем) ─────
  useEffect(() => {
    if (recState === 'processing') {
      setHintText(t('addSale.stepRecognizing'));
      const timer = setTimeout(() => {
        if (!unmountedRef.current) setHintText(t('addSale.stepAnalyzing'));
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [recState, t]);

  // ── Reanimated styles ─────────────────────────
  const capsuleAnimatedStyle = useAnimatedStyle(() => ({
    width: widthVal.value,
  }));

  const slideHintStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.max(0, slideProgress.value / CANCEL_THRESHOLD));
    const translateX = Math.max(0, slideProgress.value * 0.4);
    const scale = 1 + progress * 0.2;
    return {
      opacity: 1,
      transform: [{ translateX }, { scale }],
    };
  });

  const slideHintTextStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.max(0, slideProgress.value / CANCEL_THRESHOLD));
    const color = interpolateColor(progress, [0, 1], ['rgba(255,255,255,0.8)', '#FFD9D6']);
    return { color };
  });

  const lockIconStyle = useAnimatedStyle(() => {
    if (recState !== 'recording') {
      return { opacity: 0 };
    }
    const progress = Math.min(1, Math.max(0, -lockProgress.value / Math.abs(LOCK_THRESHOLD)));
    const opacity = progress;
    const scale = 0.8 + progress * 0.4;
    const translateY = -40 + Math.max(LOCK_THRESHOLD / 3, lockProgress.value * 0.3);
    return {
      opacity,
      transform: [{ translateY }, { scale }],
    };
  });

  const waveStyle1 = useAnimatedStyle(() => ({ height: 5 + wave1.value * 18 }));
  const waveStyle2 = useAnimatedStyle(() => ({ height: 5 + wave2.value * 18 }));
  const waveStyle3 = useAnimatedStyle(() => ({ height: 5 + wave3.value * 18 }));
  const waveStyle4 = useAnimatedStyle(() => ({ height: 5 + wave4.value * 18 }));
  const waveStyle5 = useAnimatedStyle(() => ({ height: 5 + wave5.value * 18 }));

  const sendIconStyle = useAnimatedStyle(() => ({
    opacity: sendIconOpacity.value,
    transform: [
      { translateX: sendIconTranslateX.value },
      { translateY: sendIconTranslateY.value },
      { scale: sendIconScale.value },
      { rotate: `${sendIconRotate.value}deg` },
    ],
  }));

  const activeBg = recState === 'recording' ? '#FF3B30' : Colors.primary;

  // ── Render ───────────────────────────────────
  return (
    <View style={styles.outerContainer} onLayout={handleLayout}>
      {/* Иконка блокировки, всплывающая при свайпе вверх */}
      <Animated.View style={[styles.lockContainer, lockIconStyle]} pointerEvents="none">
        <Ionicons name="lock-closed" size={18} color="#FF3B30" />
        <Ionicons name="chevron-up" size={12} color="#FF3B30" />
      </Animated.View>

      {/* Подсказка для первого использования */}
      {recState === 'idle' && showOnboarding ? (
        <View style={styles.onboardingTooltip} pointerEvents="none">
          <View style={styles.onboardingRow}>
            <Ionicons name="arrow-forward" size={12} color="#fff" />
            <Text style={styles.onboardingText}>Смахните — отмена</Text>
          </View>
          <View style={styles.onboardingRow}>
            <Ionicons name="arrow-up" size={12} color="#fff" />
            <Text style={styles.onboardingText}>Вверх — блокировка</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.row}>
        {recState === 'idle' ? (
          <View style={[styles.linearLangSwitcher, isDark ? styles.langSwitcherDark : styles.langSwitcherLight]}>
            {['ru', 'tg', 'uz'].map((l) => (
              <TouchableOpacity
                key={l}
                onPress={() => changeVoiceLang(l)}
                style={[
                  styles.linearLangBtn,
                  voiceLang === l && styles.langBtnActive
                ]}
              >
                <Text style={[
                  styles.linearLangBtnText,
                  voiceLang === l && styles.langBtnTextActive,
                  isDark && voiceLang !== l && { color: '#aaa' }
                ]}>
                  {l.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.infoBtn}
              onPress={() => setShowInfo(true)}
            >
              <Ionicons name="information-circle-outline" size={18} color={isDark ? '#aaa' : '#888'} />
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.capsuleArea}>
          {recState === 'idle' ? (
            <GestureDetector gesture={composedGesture}>
              <Animated.View style={[styles.capsule, styles.idleCapsule, capsuleAnimatedStyle]}>
                <Ionicons name="mic" size={22} color="#fff" />
                <View style={[styles.langBadge, isDark ? styles.langBadgeDark : styles.langBadgeLight]}>
                  <Text style={[styles.langBadgeText, isDark ? styles.textDark : styles.textLight]}>
                    {voiceLang.toUpperCase()}
                  </Text>
                </View>
              </Animated.View>
            </GestureDetector>
          ) : recState === 'recording' ? (
            <GestureDetector gesture={composedGesture}>
              <Animated.View style={[styles.capsule, styles.recordingCapsule, capsuleAnimatedStyle, { backgroundColor: activeBg }]}>
                <View style={styles.recordingRow}>
                  <Ionicons name="mic" size={18} color="#fff" />
                  <Text style={styles.timerText}>{timerText}</Text>

                  {showWarning ? (
                    <Text style={styles.warningTextCapsule} numberOfLines={1}>⏱️ {warningSecondsLeft} сек</Text>
                  ) : (
                    <View style={styles.waveformContainer}>
                      <Animated.View style={[styles.waveBar, waveStyle1]} />
                      <Animated.View style={[styles.waveBar, waveStyle2]} />
                      <Animated.View style={[styles.waveBar, waveStyle3]} />
                      <Animated.View style={[styles.waveBar, waveStyle4]} />
                      <Animated.View style={[styles.waveBar, waveStyle5]} />
                    </View>
                  )}

                  {/* Слайд для отмены */}
                  <Animated.View style={[styles.slideHintRow, slideHintStyle]}>
                    <Animated.Text style={[styles.slideHintText, slideHintTextStyle]}>Отмена</Animated.Text>
                    <Ionicons name="chevron-forward-outline" size={14} color="rgba(255,255,255,0.7)" />
                  </Animated.View>
                </View>
              </Animated.View>
            </GestureDetector>
          ) : recState === 'locked' ? (
            <Animated.View style={[styles.capsule, styles.recordingCapsule, capsuleAnimatedStyle, { backgroundColor: Colors.primary }]}>
              <View style={styles.recordingRow}>
                <TouchableOpacity style={styles.lockActionButton} onPress={handleLockTrash}>
                  <Ionicons name="trash-outline" size={20} color="#fff" />
                </TouchableOpacity>

                <View style={styles.lockedCenter}>
                  <Text style={styles.timerText}>{timerText}</Text>
                  <View style={styles.waveformContainer}>
                    <Animated.View style={[styles.waveBar, waveStyle1]} />
                    <Animated.View style={[styles.waveBar, waveStyle2]} />
                    <Animated.View style={[styles.waveBar, waveStyle3]} />
                    <Animated.View style={[styles.waveBar, waveStyle4]} />
                    <Animated.View style={[styles.waveBar, waveStyle5]} />
                  </View>
                </View>

                <TouchableOpacity style={styles.lockActionButton} onPress={handleLockSend}>
                  <Ionicons name="send" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
            </Animated.View>
          ) : recState === 'sending' ? (
            <Animated.View style={[styles.capsule, styles.idleCapsule, capsuleAnimatedStyle]}>
              <Animated.View style={sendIconStyle}>
                <Ionicons name="send" size={22} color="#fff" />
              </Animated.View>
            </Animated.View>
          ) : (
            <Animated.View style={[styles.capsule, styles.processingCapsule, capsuleAnimatedStyle]}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.processingText} numberOfLines={1}>{hintText}</Text>
            </Animated.View>
          )}
        </View>
      </View>

      {/* Info Modal */}
      <Modal
        visible={showInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInfo(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowInfo(false)}
        >
          <View style={[styles.modalContent, isDark ? styles.modalContentDark : styles.modalContentLight]}>
            <View style={styles.modalHeader}>
              <Ionicons name="bulb-outline" size={24} color="#1D9E75" />
              <Text style={[styles.modalTitle, isDark ? styles.textDark : styles.textLight]}>
                {t('addSale.voiceTitle')}
              </Text>
            </View>
            <Text style={[styles.modalText, isDark ? styles.textDark : styles.textLight]}>
              {t('addSale.voiceLangInfo')}
            </Text>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setShowInfo(false)}
            >
              <Text style={styles.closeBtnText}>{t('common.continue')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  outerContainer: {
    width: '100%',
    height: 48,
    justifyContent: 'center',
    position: 'relative',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  linearLangSwitcher: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 2,
    borderWidth: 1,
  },
  langSwitcherLight: {
    backgroundColor: '#eee',
    borderColor: '#ddd',
  },
  langSwitcherDark: {
    backgroundColor: '#2C2C2C',
    borderColor: '#444',
  },
  linearLangBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  infoBtn: {
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  langBtnActive: {
    backgroundColor: '#1D9E75',
  },
  linearLangBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
  },
  langBtnTextActive: {
    color: '#fff',
  },
  capsuleArea: {
    flex: 1,
  },
  capsule: {
    height: 48,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    ...Shadow.md,
  },
  idleCapsule: {
    backgroundColor: '#1D9E75',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingCapsule: {
    paddingHorizontal: Spacing.md,
    justifyContent: 'space-between',
  },
  processingCapsule: {
    backgroundColor: '#aaaaaa',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: Spacing.md,
  },
  processingText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '600',
    flexShrink: 1,
  },
  langBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: '#1D9E75',
    elevation: 1,
  },
  langBadgeLight: {
    backgroundColor: '#fff',
  },
  langBadgeDark: {
    backgroundColor: '#1C1C1E',
  },
  langBadgeText: {
    fontSize: 8,
    fontWeight: 'bold',
  },
  textLight: {
    color: '#333',
  },
  textDark: {
    color: '#eee',
  },
  lockContainer: {
    position: 'absolute',
    top: -8,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    zIndex: 999,
  },
  recordingRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  timerText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: 'bold',
    marginLeft: Spacing.sm,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: 24,
    marginHorizontal: Spacing.sm,
  },
  waveBar: {
    width: 3,
    backgroundColor: '#fff',
    borderRadius: 1.5,
  },
  slideHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  slideHintText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  lockActionButton: {
    padding: Spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockedCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningTextCapsule: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: FontSize.sm,
    flex: 1,
    textAlign: 'center',
  },
  onboardingTooltip: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    marginBottom: Spacing.xs,
    backgroundColor: 'rgba(28,28,30,0.92)',
    borderRadius: Radius.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    gap: 4,
    zIndex: 1000,
    ...Shadow.md,
  },
  onboardingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  onboardingText: {
    color: '#fff',
    fontSize: FontSize.sm - 2,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '90%',
    borderRadius: 20,
    padding: 20,
    elevation: 5,
  },
  modalContentLight: {
    backgroundColor: '#fff',
  },
  modalContentDark: {
    backgroundColor: '#1E1E1E',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalText: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  closeBtn: {
    backgroundColor: '#1D9E75',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
