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
} from 'react-native';
import {
  useAudioRecorder,
  AudioModule,
  setAudioModeAsync,
  RecordingPresets,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { useAppContext } from '../context/AppContext';
import { Ionicons } from '@expo/vector-icons';

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
}

const MAX_DURATION_MS = 60000;
const WARNING_THRESHOLD_MS = 55000;
const MIN_RECORDING_MS = 700; // меньше этого — не отправляем на Groq
const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

// Языкозависимый промпт — важно для качества Whisper
const getWhisperPrompt = (lang: string): string => {
  if (lang === 'tg') {
    return 'нарх, фурӯш, сомонӣ, килограмм, дона, миқдор, кило, фоида, харид, анбор, мол';
  }
  if (lang === 'uz') {
    return 'narx, sotuv, som, kilogram, dona, miqdor, kilo, foyda, xarid, нарх, сом, дона';
  }
  return 'нарх, фурӯш, сомони, кило, дона, сабад, миқдор, доставка, скидка, килограмм, штук';
};

// Expo-audio SDK 56: строки 'mpeg4'/'aac', НЕ числа из старого expo-av
// sampleRate 22050 + моно + 64kbps — оптимально для слабого интернета Таджикистана
// Используем any чтобы избежать конфликтов типов между минорными версиями SDK 56
const recordingOptions: any = {
  ...RecordingPresets.HIGH_QUALITY,
  android: {
    extension: '.m4a',
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
    sampleRate: 22050,
    numberOfChannels: 1,
    bitRate: 64000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: 'mpeg4aac',
    audioQuality: 'medium',
    sampleRate: 22050,
    numberOfChannels: 1,
    bitRate: 64000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
};

export default function VoiceRecorder({ onTranscript }: VoiceRecorderProps) {
  const { theme, language } = useAppContext();
  const recorder = useAudioRecorder(recordingOptions);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const durationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Если пользователь отпустил кнопку пока recorder ещё инициализировался
  const stopRequestedDuringStartRef = useRef(false);
  // Засекаем время старта для проверки минимальной длительности
  const recordingStartTimeRef = useRef<number | null>(null);

  const isDark = theme === 'dark';
  const isRecording = recorder.isRecording;

  const clearTimers = useCallback(() => {
    if (durationTimerRef.current) clearTimeout(durationTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    durationTimerRef.current = null;
    warningTimerRef.current = null;
  }, []);

  const startPulse = useCallback(() => {
    pulseAnim.stopAnimation();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  const transcribeAudio = useCallback(async (audioUri: string) => {
    setIsProcessing(true);
    abortControllerRef.current = new AbortController();

    try {
      const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
      if (!apiKey) throw new Error('GROQ API ключ не настроен');

      let groqLang = 'ru';
      if (language === 'tg') groqLang = 'tg';
      else if (language === 'uz') groqLang = 'uz';

      // Определяем mimeType динамически из URI — защита от будущих изменений конфига
      const extension = audioUri.split('.').pop()?.toLowerCase() ?? 'm4a';
      const mimeTypeMap: Record<string, string> = {
        'm4a': 'audio/m4a',
        'mp4': 'audio/mp4',
        '3gp': 'audio/3gpp',
        'aac': 'audio/aac',
        'wav': 'audio/wav',
      };
      const resolvedMimeType = mimeTypeMap[extension] ?? 'audio/m4a';

      // FileSystem.uploadAsync (legacy) — единственный надёжный способ
      // отправить бинарный файл без Blob API в React Native / Hermes
      const uploadResult = await FileSystem.uploadAsync(GROQ_API_URL, audioUri, {
        fieldName: 'file',
        httpMethod: 'POST',
        mimeType: resolvedMimeType,
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        parameters: {
          'model': 'whisper-large-v3',
          'prompt': getWhisperPrompt(language),
          'response_format': 'json',
          'language': groqLang,
        },
      });

      if (uploadResult.status === 429) {
        throw new Error('Превышен лимит запросов Groq API');
      }

      let responseBody: any;
      try {
        responseBody = JSON.parse(uploadResult.body);
      } catch {
        responseBody = { message: uploadResult.body };
      }

      if (uploadResult.status !== 200 && uploadResult.status !== 201) {
        const errMsg = responseBody?.error?.message || responseBody?.message || 'Ошибка API при распознавании';
        throw new Error(`API Error (${uploadResult.status}): ${errMsg}`);
      }

      if (responseBody.text) {
        onTranscript(responseBody.text);
      } else {
        throw new Error('Распознанный текст отсутствует в ответе API');
      }

      // Удаляем локальный файл после успешной транскрипции
      await FileSystem.deleteAsync(audioUri, { idempotent: true });
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      console.error('Transcription error:', error);
      Alert.alert('Ошибка', error?.message || 'Не удалось распознать речь');
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  }, [language, onTranscript]);

  const stopRecordingInternal = useCallback(async () => {
    // Чистим таймеры ДО async вызова — иначе при краше они остаются активными
    clearTimers();
    stopPulse();
    setShowWarning(false);

    if (!recorder.isRecording) return;

    try {
      // Проверяем минимальную длительность ДО stop()
      const durationMs = recordingStartTimeRef.current
        ? Date.now() - recordingStartTimeRef.current
        : MIN_RECORDING_MS + 1;
      recordingStartTimeRef.current = null;

      await recorder.stop();
      const uri = recorder.uri;

      if (durationMs < MIN_RECORDING_MS) {
        // Слишком короткое нажатие — не отправляем на Groq, показываем подсказку
        Alert.alert('🎙️ Удержите микрофон', 'Нажмите и удерживайте кнопку пока говорите');
        if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        return;
      }

      if (uri) await transcribeAudio(uri);
    } catch (error: any) {
      const msg = error?.message || '';
      if (msg.includes('shared object') || msg.includes('released')) {
        // Сессия уже освобождена — это нормально при быстром tap/release
        console.warn('Recorder session already released, skipping stop.');
      } else {
        console.error('Failed to stop recording:', error);
        Alert.alert('Ошибка', 'Не удалось остановить запись');
      }
    }
  }, [recorder, clearTimers, stopPulse, transcribeAudio]);

  const startRecording = async () => {
    if (isProcessing || isStarting) return;
    setIsStarting(true);
    stopRequestedDuringStartRef.current = false;

    try {
      // Cleanup любой зависшей сессии
      if (recorder.isRecording) {
        await recorder.stop().catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Ошибка', 'Нет разрешения на доступ к микрофону');
        setIsStarting(false);
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync();
      await recorder.record();

      // Засекаем реальное время старта записи
      recordingStartTimeRef.current = Date.now();
      setIsStarting(false);

      // Если пользователь отпустил кнопку пока мы инициализировались — останавливаем
      if (stopRequestedDuringStartRef.current) {
        stopRequestedDuringStartRef.current = false;
        stopRecordingInternal();
        return;
      }

      startPulse();

      durationTimerRef.current = setTimeout(() => {
        if (recorder.isRecording) {
          stopRecordingInternal();
          Alert.alert('Инфо', 'Максимальная длительность записи (60 секунд) достигнута');
        }
      }, MAX_DURATION_MS);

      warningTimerRef.current = setTimeout(() => {
        if (recorder.isRecording) setShowWarning(true);
      }, WARNING_THRESHOLD_MS);
    } catch (err) {
      console.error('startRecording error:', err);
      Alert.alert('Ошибка', 'Не удалось начать запись');
      setIsStarting(false);
    }
  };

  const handleStop = () => {
    if (isStarting) {
      // Пользователь отпустил кнопку во время фазы инициализации
      stopRequestedDuringStartRef.current = true;
      return;
    }
    if (!isProcessing) {
      stopRecordingInternal();
    }
  };

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState !== 'active' && recorder.isRecording) {
        stopRecordingInternal();
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
      if (recorder.isRecording) {
        recorder.stop().catch(() => {});
      }
      clearTimers();
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [recorder, stopRecordingInternal, clearTimers]);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPressIn={startRecording}
        onPressOut={handleStop}
        disabled={isProcessing}
        activeOpacity={0.7}
        style={styles.touchable}
      >
        <Animated.View
          style={[
            styles.button,
            isRecording && styles.buttonActive,
            (isProcessing || isStarting) && styles.buttonDisabled,
            { transform: [{ scale: pulseAnim }] },
          ]}
        >
          {isProcessing || isStarting ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <Ionicons name={isRecording ? 'stop' : 'mic'} size={36} color="#fff" />
          )}
        </Animated.View>
      </TouchableOpacity>
      <Text style={[styles.hint, isDark ? styles.textDark : styles.textLight]}>
        {showWarning
          ? '⏱️ Запись скоро остановится (5 сек)'
          : isRecording
          ? '🔴 Отпустите, чтобы завершить'
          : isProcessing
          ? '🔄 Обработка...'
          : '🎙️ Зажмите и говорите'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 20 },
  touchable: { borderRadius: 60, overflow: 'hidden' },
  button: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#1D9E75',
    alignItems: 'center', justifyContent: 'center', elevation: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4,
  },
  buttonActive: { backgroundColor: '#E53935' },
  buttonDisabled: { backgroundColor: '#aaaaaa', opacity: 0.8 },
  hint: { marginTop: 12, fontSize: 14, fontWeight: '500', textAlign: 'center' },
  textLight: { color: '#555' },
  textDark: { color: '#ccc' },
});