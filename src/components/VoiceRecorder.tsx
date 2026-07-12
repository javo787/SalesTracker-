import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  AppStateStatus,
  Modal,
} from 'react-native';
import {
  useAudioRecorder,
  AudioModule,
  setAudioModeAsync,
  RecordingPresets,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { useAppContext } from '../context/AppContext';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { VoiceSaleResult } from '../types/voiceSale';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface VoiceRecorderProps {
  onResult: (result: VoiceSaleResult) => void;
  onClose?: () => void;
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const MAX_DURATION_MS = 60_000;
const WARNING_MS = 55_000;
const MIN_DURATION_MS = 700;

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
        language: 'ru',
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
// Используем any чтобы избежать конфликтов типов между минорными версиями SDK 56.
// m4a/aac + 22050 Hz моно + 64kbps — оптимально для:
//   - слабого интернета Таджикистана (маленький файл)
//   - качества распознавания Whisper (достаточная частота для речи)
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
  const { resolvedTheme, currency, language } = useAppContext(); const isDark = resolvedTheme === "dark";
  const recorder = useAudioRecorder(recordingOptions);

  // UI state
  const [voiceLang, setVoiceLang] = useState(language);
  const [showInfo, setShowInfo] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  // Refs — не вызывают ре-рендер, безопасны в async callbacks
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const durationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Флаг: пользователь отпустил кнопку пока ещё шла фаза prepareToRecord */
  const stopRequestedRef = useRef(false);
  /** Метка времени старта записи для проверки MIN_DURATION_MS */
  const startTimeRef = useRef<number | null>(null);
  /** Флаг: компонент размонтирован — не обновляем state */
  const unmountedRef = useRef(false);

  const isRecording = safeIsRecording(recorder);

  // ── Timers ──────────────────────────────────
  const clearTimers = useCallback(() => {
    if (durationTimerRef.current) clearTimeout(durationTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    durationTimerRef.current = null;
    warningTimerRef.current = null;
  }, []);

  // ── Pulse animation ─────────────────────────
  const startPulse = useCallback(() => {
    pulseAnim.stopAnimation();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 500, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  // ── Transcription ────────────────────────────
  const transcribeAudio = useCallback(
    async (uri: string) => {
      if (unmountedRef.current) return;
      setIsProcessing(true);
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
          setIsProcessing(false);
        }
        abortRef.current = null;
      }
    },
    [onResult, voiceLang]
  );

  // ── Stop recording (core logic) ──────────────
  const stopRecordingInternal = useCallback(async () => {
    // Сначала чистим таймеры и анимацию — до любого async вызова
    clearTimers();
    stopPulse();
    if (!unmountedRef.current) setShowWarning(false);

    // Вычисляем длительность ДО вызова stop()
    const durationMs = startTimeRef.current
      ? Date.now() - startTimeRef.current
      : MIN_DURATION_MS + 1;
    startTimeRef.current = null;

    const uri = await safeStopRecorder(recorder);

    if (!uri) return; // объект был released или не записывал

    if (durationMs < MIN_DURATION_MS) {
      // Слишком короткое нажатие
      FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      Alert.alert('🎙️ Удержите кнопку', 'Нажмите и удерживайте пока говорите, затем отпустите.');
      return;
    }

    await transcribeAudio(uri);
  }, [recorder, clearTimers, stopPulse, transcribeAudio]);

  // ── Start recording ──────────────────────────
  const startRecording = async () => {
    if (isProcessing || isStarting) return;

    if (!unmountedRef.current) setIsStarting(true);
    stopRequestedRef.current = false;

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
        if (!unmountedRef.current) setIsStarting(false);
        return;
      }

      // Настраиваем аудио сессию
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

      // Подготовка и запуск
      await recorder.prepareToRecordAsync();
      await recorder.record();

      startTimeRef.current = Date.now();
      if (!unmountedRef.current) setIsStarting(false);

      // Пользователь успел отпустить кнопку пока мы инициализировались
      if (stopRequestedRef.current) {
        stopRequestedRef.current = false;
        stopRecordingInternal();
        return;
      }

      startPulse();

      // Авто-стоп по максимальной длительности
      durationTimerRef.current = setTimeout(() => {
        if (safeIsRecording(recorder)) {
          stopRecordingInternal();
          Alert.alert('Инфо', 'Достигнут лимит записи (60 сек).');
        }
      }, MAX_DURATION_MS);

      // Предупреждение за 5 сек до лимита
      warningTimerRef.current = setTimeout(() => {
        if (!unmountedRef.current && safeIsRecording(recorder)) {
          setShowWarning(true);
        }
      }, WARNING_MS);
    } catch (err) {
      console.error('[VoiceRecorder] startRecording error:', err);
      if (!unmountedRef.current) {
        setIsStarting(false);
        Alert.alert('Ошибка', 'Не удалось начать запись. Попробуйте ещё раз.');
      }
    }
  };

  // ── Handle button release ────────────────────
  const handleStop = useCallback(() => {
    if (isStarting) {
      // Ещё инициализируемся — запоминаем намерение остановиться
      stopRequestedRef.current = true;
      return;
    }
    if (!isProcessing) {
      stopRecordingInternal();
    }
  }, [isStarting, isProcessing, stopRecordingInternal]);

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

  // ── AppState & cleanup ───────────────────────
  useEffect(() => {
    unmountedRef.current = false;

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active' && safeIsRecording(recorder)) {
        stopRecordingInternal();
      }
    });

    return () => {
      unmountedRef.current = true;
      sub.remove();
      clearTimers();

      // Безопасная остановка при размонтировании
      // НЕ используем recorder.isRecording напрямую — может бросить
      safeStopRecorder(recorder).catch(() => {});

      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
    // recorder не добавляем в deps — его идентичность стабильна в рамках маунта
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Hint text ────────────────────────────────
  const [hintText, setHintText] = useState('🎙️ Зажмите и говорите');

  useEffect(() => {
    if (showWarning) {
      setHintText('⏱️ Запись остановится через 5 сек');
    } else if (isRecording) {
      setHintText('🔴 Отпустите, чтобы завершить');
    } else if (isProcessing) {
      setHintText(t('addSale.stepRecognizing'));
      const timer = setTimeout(() => {
         setHintText(t('addSale.stepAnalyzing'));
      }, 3000);
      return () => clearTimeout(timer);
    } else if (isStarting) {
      setHintText('⏳ Подготовка...');
    } else {
      setHintText('🎙️ Зажмите и говорите');
    }
  }, [showWarning, isRecording, isProcessing, isStarting, t]);

  // ── Render ───────────────────────────────────
  return (
    <View style={styles.linearContainer}>
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

      <View style={styles.micWrapper}>
        <TouchableOpacity
          onPressIn={startRecording}
          onPressOut={handleStop}
          disabled={isProcessing}
          activeOpacity={0.75}
        >
          <Animated.View
            style={[
              styles.linearButton,
              isRecording && styles.buttonRecording,
              (isProcessing || isStarting) && styles.buttonBusy,
              { transform: [{ scale: pulseAnim }] },
            ]}
          >
            {isProcessing || isStarting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons
                name={isRecording ? 'stop' : 'mic'}
                size={24}
                color="#fff"
              />
            )}
          </Animated.View>
        </TouchableOpacity>

        {isRecording || isProcessing || isStarting ? (
           <Text style={[styles.linearHint, isDark ? styles.hintDark : styles.hintLight]} numberOfLines={1}>
             {hintText}
           </Text>
        ) : null}
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
  linearContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
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
  micWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  linearButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1D9E75',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  buttonRecording: {
    backgroundColor: '#E53935',
  },
  buttonBusy: {
    backgroundColor: '#aaaaaa',
    opacity: 0.85,
  },
  linearHint: {
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
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
  textLight: {
    color: '#333',
  },
  textDark: {
    color: '#eee',
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
  hintLight: {
    color: '#555',
  },
  hintDark: {
    color: '#ccc',
  },
});
