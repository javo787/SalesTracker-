import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { AudioModule, useAudioRecorder, RecordingPresets } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { useAppContext } from '../context/AppContext';
import { Ionicons } from '@expo/vector-icons';

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
}

const WHISPER_PROMPT = "нарх, фурӯш, сомони, кило, дона, сабад, миқдор, доставка, скидка, килограмм, штук";
const MAX_DURATION = 60000;
const WARNING_THRESHOLD = 55000;

export default function VoiceRecorder({ onTranscript }: VoiceRecorderProps) {
  const { theme, language } = useAppContext();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const durationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDark = theme === 'dark';

  useEffect(() => {
    return () => {
      if (recorder.isRecording) {
        recorder.stop().catch(() => {});
      }
      clearTimers();
    };
  }, [recorder]);

  const clearTimers = () => {
    if (durationTimer.current) clearTimeout(durationTimer.current);
    if (warningTimer.current) clearTimeout(warningTimer.current);
  };

  const startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const stopPulse = () => {
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
  };

  const startRecording = async () => {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Ошибка', 'Разрешите доступ к микрофону для использования голосового ввода');
        return;
      }

      await AudioModule.setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();

      setIsRecording(true);
      startPulse();

      // Auto stop after 60s
      durationTimer.current = setTimeout(() => {
        stopRecording();
        Alert.alert('Предупреждение', 'Максимальная длительность записи (60 секунд) достигнута');
      }, MAX_DURATION);

      // Warning at 55s
      warningTimer.current = setTimeout(() => {
        setShowWarning(true);
      }, WARNING_THRESHOLD);

    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Ошибка', 'Не удалось начать запись');
    }
  };

  const stopRecording = async () => {
    if (!isRecording) return;

    setIsRecording(false);
    setShowWarning(false);
    stopPulse();
    clearTimers();

    try {
      await recorder.stop();
      const uri = recorder.uri;

      if (uri) {
        await transcribeAudio(uri);
      }
    } catch (error) {
      console.error('Failed to stop recording', error);
      Alert.alert('Ошибка', 'Не удалось остановить запись');
    }
  };

  const transcribeAudio = async (uri: string) => {
    setIsProcessing(true);
    try {
      const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
      if (!apiKey) {
        throw new Error('GROQ API Key is missing');
      }

      const formData = new FormData();
      // @ts-ignore
      formData.append('file', {
        uri,
        type: 'audio/m4a',
        name: 'voice.m4a',
      });
      formData.append('model', 'whisper-large-v3');
      formData.append('prompt', WHISPER_PROMPT);
      formData.append('response_format', 'json');

      // Language detection based on app language
      let groqLang = 'ru';
      if (language === 'tg') groqLang = 'tg';
      else if (language === 'uz') groqLang = 'uz';
      formData.append('language', groqLang);

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (response.status === 429) {
        throw new Error('Превышен лимит запросов Groq API. Попробуйте позже.');
      }

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Groq API error:', errorData);
        throw new Error('Ошибка при распознавании речи');
      }

      const result = await response.json();
      if (result.text) {
        onTranscript(result.text);
      }

      // Cleanup
      await FileSystem.deleteAsync(uri).catch(() => {});
    } catch (error: unknown) {
      console.error('Transcription error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Не удалось распознать речь. Проверьте интернет.';
      Alert.alert('Ошибка', errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPressIn={startRecording}
        onPressOut={stopRecording}
        disabled={isProcessing}
        activeOpacity={0.7}
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
            <ActivityIndicator color="#fff" />
          ) : (
            <Ionicons
              name={isRecording ? "stop" : "mic"}
              size={32}
              color="#fff"
            />
          )}
        </Animated.View>
      </TouchableOpacity>
      <Text style={[styles.hint, isDark ? styles.textDark : styles.textLight]}>
        {showWarning
          ? 'Запись скоро остановится (5с)'
          : isRecording
          ? 'Отпустите, чтобы завершить'
          : isProcessing
          ? 'Обработка...'
          : 'Зажмите и говорите'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  button: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1D9E75',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  buttonActive: {
    backgroundColor: '#E53935',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  hint: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  textLight: {
    color: '#666',
  },
  textDark: {
    color: '#aaa',
  },
});
