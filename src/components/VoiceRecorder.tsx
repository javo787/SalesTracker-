import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import * as FileSystem from 'expo-file-system';
import { useAppContext } from '../context/AppContext';
import { Ionicons } from '@expo/vector-icons';

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
}

// ---------------------------------------------------------------------
// 1. КОНФИГУРАЦИЯ ЗАПИСИ (ПРАВИЛЬНЫЕ ПАРАМЕТРЫ)
// ---------------------------------------------------------------------
const WHISPER_PROMPT = "нарх, фурӯш, сомони, кило, дона, сабад, миқдор, доставка, скидка, килограмм, штук";
const MAX_DURATION_MS = 60000; // 60 секунд
const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

// ✅ ОТВЕТ НА ОШИБКУ: Константы из библиотеки ожидают строки, а не числа.
// Используем готовый пресет и явно задаём параметры.
const recordingOptions = {
  ...RecordingPresets.HIGH_QUALITY, // Базовые высокие настройки
  android: {
    extension: '.m4a', // Формат файла
    outputFormat: 'mpeg_4', // СТРОКА: 'mpeg_4', 'mpeg_4_hd' и т.д.
    audioEncoder: 'aac', // СТРОКА: 'aac', 'amr_nb' и т.д.
    sampleRate: 44100, // Частота дискретизации
    numberOfChannels: 2, // Стерео
    bitRate: 128000, // Битрейт
  },
  ios: {
    extension: '.m4a',
    outputFormat: 'mpeg4aac', // СТРОКА для iOS
    audioQuality: 'max', // СТРОКА: 'min', 'low', 'medium', 'high', 'max'
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {},
};

// ---------------------------------------------------------------------
// 2. ОСНОВНОЙ КОМПОНЕНТ
// ---------------------------------------------------------------------
export default function VoiceRecorder({ onTranscript }: VoiceRecorderProps) {
  const { theme, language } = useAppContext();
  const recorder = useAudioRecorder(recordingOptions);
  const [isProcessing, setIsProcessing] = useState(false);
  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isDark = theme === 'dark';

  // Синхронизируем состояние интерфейса с рекордером
  const isRecording = recorder.isRecording;
  const showWarning = false; // Для простоты можно убрать предупреждение

  // Анимация пульсации
  const pulseAnim = useRef(new Animated.Value(1)).current;
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

  // Транскрипция через Groq API
  const transcribeAudio = useCallback(async (audioUri: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    abortControllerRef.current = new AbortController();
    try {
      const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
      if (!apiKey) throw new Error('GROQ API ключ не настроен');

      let groqLang = 'ru';
      if (language === 'tg') groqLang = 'tg';
      else if (language === 'uz') groqLang = 'uz';

      // Загружаем файл как Blob
      const response = await fetch(audioUri);
      const blob = await response.blob();

      const formData = new FormData();
      formData.append('file', blob, 'recording.m4a');
      formData.append('model', 'whisper-large-v3');
      formData.append('prompt', WHISPER_PROMPT);
      formData.append('response_format', 'json');
      formData.append('language', groqLang);

      const uploadResult = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
        signal: abortControllerRef.current.signal,
      });

      if (uploadResult.status === 429) throw new Error('Превышен лимит запросов Groq API');
      if (!uploadResult.ok) {
        const errorText = await uploadResult.text();
        throw new Error(`Ошибка API (${uploadResult.status}): ${errorText}`);
      }

      const result = await uploadResult.json();
      if (result.text) onTranscript(result.text);
      else throw new Error('Нет текста в ответе');
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      console.error('Transcription error:', error);
      Alert.alert('Ошибка', error?.message || 'Не удалось распознать речь');
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  }, [language, onTranscript, isProcessing]);

  // Остановка записи
  const stopRecordingAndTranscribe = useCallback(async () => {
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (uri) {
        await transcribeAudio(uri);
      }
    } catch (error) {
      console.error('Ошибка остановки:', error);
      Alert.alert('Ошибка', 'Не удалось сохранить запись');
    }
  }, [recorder, transcribeAudio]);

  // Старт записи
  const startRecording = useCallback(async () => {
    if (isProcessing) return;
    try {
      // Запрашиваем разрешения
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Ошибка', 'Нет разрешения на запись');
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      // Начинаем запись
      await recorder.prepareToRecordAsync();
      await recorder.record();
      startPulse();

      // Автоостановка по таймеру
      durationTimerRef.current = setTimeout(() => {
        if (recorder.isRecording) {
          stopRecordingAndTranscribe();
          Alert.alert('Предупреждение', 'Максимальная длительность записи (60 секунд) достигнута');
        }
      }, MAX_DURATION_MS);
    } catch (err) {
      console.error('startRecording error:', err);
      Alert.alert('Ошибка', 'Не удалось начать запись');
    }
  }, [recorder, isProcessing, startPulse, stopRecordingAndTranscribe]);

  // Остановка по отпусканию кнопки
  const handleStop = useCallback(() => {
    if (recorder.isRecording && !isProcessing) {
      if (durationTimerRef.current) clearTimeout(durationTimerRef.current);
      stopRecordingAndTranscribe();
      stopPulse();
    }
  }, [recorder.isRecording, isProcessing, stopRecordingAndTranscribe, stopPulse]);

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      if (durationTimerRef.current) clearTimeout(durationTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (recorder.isRecording) {
        recorder.stop().catch(() => {});
      }
    };
  }, [recorder]);

  // Остановка при уходе в фон
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState !== 'active' && recorder.isRecording) {
        handleStop();
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [recorder.isRecording, handleStop]);

  // Интерфейс
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
            isProcessing && styles.buttonDisabled,
            { transform: [{ scale: pulseAnim }] },
          ]}
        >
          {isProcessing ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <Ionicons name={isRecording ? 'stop' : 'mic'} size={36} color="#fff" />
          )}
        </Animated.View>
      </TouchableOpacity>
      <Text style={[styles.hint, isDark ? styles.textDark : styles.textLight]}>
        {isProcessing
          ? '🔄 Обработка...'
          : isRecording
          ? '🔴 Отпустите, чтобы завершить'
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