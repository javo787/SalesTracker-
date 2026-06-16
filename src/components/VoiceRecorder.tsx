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
  Platform,
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

const WHISPER_PROMPT = "нарх, фурӯш, сомони, кило, дона, сабад, миқдор, доставка, скидка, килограмм, штук";
const MAX_DURATION_MS = 60000;
const WARNING_THRESHOLD_MS = 55000;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

/**
 * Optimized recording settings for bazaar environment.
 * We use any to avoid strict type mismatches between different Expo SDK 56 sub-versions.
 */
const recordingOptions: any = {
  ...RecordingPresets.HIGH_QUALITY,
  android: {
    extension: '.m4a',
    outputFormat: 2, // MPEG_4
    audioEncoder: 3, // AAC
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

  // Ref to track if user released the button while we were still initializing the recorder
  const stopRequestedDuringStartRef = useRef(false);

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
    if (isProcessing) return;
    setIsProcessing(true);
    abortControllerRef.current = new AbortController();

    try {
      const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
      if (!apiKey) throw new Error('GROQ API ключ не настроен');

      let groqLang = 'ru';
      if (language === 'tg') groqLang = 'tg';
      else if (language === 'uz') groqLang = 'uz';

      /**
       * Using FileSystem.uploadAsync (legacy) as it is the most reliable way
       * to send binary files in React Native without Blob support issues.
       */
      const uploadResult = await FileSystem.uploadAsync(GROQ_API_URL, audioUri, {
        fieldName: 'file',
        httpMethod: 'POST',
        mimeType: 'audio/m4a',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        parameters: {
          'model': 'whisper-large-v3',
          'prompt': WHISPER_PROMPT,
          'response_format': 'json',
          'language': groqLang,
        },
      });

      if (uploadResult.status === 429) throw new Error('Превышен лимит запросов Groq API');

      let responseBody;
      try {
        responseBody = JSON.parse(uploadResult.body);
      } catch (e) {
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

      // Cleanup local file after successful transcription
      await FileSystem.deleteAsync(audioUri, { idempotent: true });
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      console.error('Transcription error:', error);
      Alert.alert('Ошибка', error?.message || 'Не удалось распознать речь');
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  }, [language, onTranscript, isProcessing]);

  const stopRecordingInternal = useCallback(async () => {
    if (!recorder.isRecording) {
      clearTimers();
      stopPulse();
      setShowWarning(false);
      return;
    }

    try {
      await recorder.stop();
      setShowWarning(false);
      stopPulse();
      clearTimers();

      const uri = recorder.uri;
      if (uri) {
        await transcribeAudio(uri);
      }
    } catch (error: any) {
      const msg = error?.message || '';
      if (msg.includes('shared object') || msg.includes('released')) {
        console.warn('Recorder session already released, skipping stop.');
      } else {
        console.error('Failed to stop recording:', error);
        Alert.alert('Ошибка', 'Не удалось остановить запись');
      }
      clearTimers();
      stopPulse();
      setShowWarning(false);
    }
  }, [recorder, clearTimers, stopPulse, transcribeAudio]);

  const startRecording = async () => {
    if (isProcessing || isStarting) return;
    setIsStarting(true);
    stopRequestedDuringStartRef.current = false;

    try {
      // Cleanup any dangling sessions
      if (recorder.isRecording) {
        await recorder.stop().catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 100));
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

      setIsStarting(false);

      // If user released the button while we were preparing, trigger immediate stop
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
      // User let go of the button during initialization phase
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