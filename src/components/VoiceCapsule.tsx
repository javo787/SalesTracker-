import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  TouchableOpacity,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  runOnJS,
  interpolateColor,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useAudioRecorder, AudioModule, setAudioModeAsync, RecordingPresets } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import { VoiceSaleResult } from '../types/voiceSale';
import { Colors, Radius, Spacing, FontSize, Shadow } from '../constants/theme';

// ─────────────────────────────────────────────
// Constants & Types
// ─────────────────────────────────────────────
const MAX_DURATION_MS = 60_000;
const WARNING_MS = 55_000;
const MIN_DURATION_MS = 700;

export type CapsuleState = 'idle' | 'recording' | 'locked' | 'sending' | 'processing' | 'success' | 'batch';

interface VoiceCapsuleProps {
  rowWidth: number;
  onStateChange: (state: CapsuleState) => void;
  onResult: (result: VoiceSaleResult) => void;
  onShowBatchReview?: (result: VoiceSaleResult) => void;
  resetCapsuleTrigger?: number; // to reset to idle from parent
}

type GroqLangConfig = {
  language: string | undefined;
  prompt: string;
  model: string;
};

// ─────────────────────────────────────────────
// Language configuration
// ─────────────────────────────────────────────
function getLangConfig(appLang: string): GroqLangConfig {
  switch (appLang) {
    case 'tg':
      return {
        language: undefined,
        prompt:
          'нарх, фурӯш, сомонӣ, килограмм, дона, миқдор, кило, фоида, харид, анбор, мол, ' +
          'помидор, пиёз, картошка, орд, шакар, равған, гӯшт, мурғ, биринҷ, нон',
        model: 'whisper-large-v3-turbo',
      };
    case 'uz':
      return {
        language: undefined,
        prompt:
          'narx, sotuv, som, kilogram, dona, miqdor, kilo, foyda, xarid, ombor, mahsulot, ' +
          'помидор, пиёз, картошка, un, shakar, moy, go\'sht, tovuq, guruch, non, ' +
          'нарх, сом, дона, миқдор',
        model: 'whisper-large-v3-turbo',
      };
    case 'ru':
    default:
      return {
        language: undefined, // auto-detect
        prompt:
          'нарх, продажа, сомони, килограмм, штука, количество, кило, прибыль, ' +
          'закупка, склад, товар, помидор, лук, картошка, мука, сахар, масло',
        model: 'whisper-large-v3-turbo',
      };
  }
}

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

// Helper checks
function isReleasedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('shared object') ||
    msg.includes('already released') ||
    msg.includes('java.lang.Integer') ||
    msg.includes('cannot be cast')
  );
}

function safeIsRecording(recorder: ReturnType<typeof useAudioRecorder>): boolean {
  try {
    return recorder.isRecording;
  } catch {
    return false;
  }
}

async function safeStopRecorder(
  recorder: ReturnType<typeof useAudioRecorder>
): Promise<string | null> {
  try {
    if (!safeIsRecording(recorder)) return null;
    await recorder.stop();
    return recorder.uri ?? null;
  } catch (err) {
    if (!isReleasedError(err)) {
      console.warn('[VoiceCapsule] stop error:', err);
    }
    return null;
  }
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export default function VoiceCapsule({
  rowWidth,
  onStateChange,
  onResult,
  onShowBatchReview,
  resetCapsuleTrigger,
}: VoiceCapsuleProps) {
  const { t } = useTranslation();
  const { resolvedTheme, language } = useAppContext();
  const isDark = resolvedTheme === 'dark';

  // State Machine
  const [capsuleState, setCapsuleStateInternal] = useState<CapsuleState>('idle');
  const [voiceLang, setVoiceLang] = useState(language);
  const [timerText, setTimerText] = useState('00:00');
  const [showWarning, setShowWarning] = useState(false);
  const [batchCount, setBatchCount] = useState(0);
  const [latestBatchResult, setLatestBatchResult] = useState<VoiceSaleResult | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Audio Recorder hook
  const recorder = useAudioRecorder(recordingOptions);

  // Ref variables
  const unmountedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const stopRequestedRef = useRef(false);
  const durationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const secondsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reanimated Shared Values
  const widthVal = useSharedValue(48);
  const slideProgress = useSharedValue(0);
  const lockProgress = useSharedValue(0);
  const isTransitioning = useSharedValue(false);

  // "Send" swap icon animation (mic -> checkmark, WhatsApp/Telegram-style)
  const sendIconOpacity = useSharedValue(0);
  const sendIconScale = useSharedValue(0.6);

  // Waveform heights (0 to 1)
  const wave1 = useSharedValue(0.2);
  const wave2 = useSharedValue(0.2);
  const wave3 = useSharedValue(0.2);
  const wave4 = useSharedValue(0.2);
  const wave5 = useSharedValue(0.2);

  // Haptic state guards
  const hasTriggeredCancelHaptic = useSharedValue(false);
  const hasTriggeredLockHaptic = useSharedValue(false);

  // Wrap state changes to bubble up
  const setCapsuleState = useCallback((state: CapsuleState) => {
    if (unmountedRef.current) return;
    setCapsuleStateInternal(state);
    onStateChange(state);
  }, [onStateChange]);

  // Handle external reset to idle
  useEffect(() => {
    if (resetCapsuleTrigger !== undefined) {
      setCapsuleState('idle');
      widthVal.value = withTiming(48, { duration: 200 });
      setBatchCount(0);
      setLatestBatchResult(null);
    }
  }, [resetCapsuleTrigger, setCapsuleState, widthVal]);

  // Load language settings on mount
  useEffect(() => {
    const loadLang = async () => {
      const saved = await AsyncStorage.getItem('voice_lang_last');
      if (saved && (saved === 'ru' || saved === 'tg' || saved === 'uz')) {
        setVoiceLang(saved);
      } else {
        setVoiceLang(language);
      }
    };
    loadLang();
  }, [language]);

  // First-time onboarding hint: show once per install, explaining that you can
  // swipe to cancel or swipe up to lock (hands-free) recording. Auto-hides
  // after a few seconds and is dismissed immediately on first real interaction.
  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const checkOnboarding = async () => {
      try {
        const seen = await AsyncStorage.getItem('voice_capsule_onboarding_seen');
        if (!seen && !unmountedRef.current) {
          setShowOnboarding(true);
          await AsyncStorage.setItem('voice_capsule_onboarding_seen', '1');
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

  // Clean timers
  const clearTimers = useCallback(() => {
    if (durationTimerRef.current) clearTimeout(durationTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (secondsTimerRef.current) clearInterval(secondsTimerRef.current);
    durationTimerRef.current = null;
    warningTimerRef.current = null;
    secondsTimerRef.current = null;
  }, []);

  // Stop animations
  const stopAnimations = useCallback(() => {
    wave1.value = 0.2;
    wave2.value = 0.2;
    wave3.value = 0.2;
    wave4.value = 0.2;
    wave5.value = 0.2;
    slideProgress.value = 0;
    lockProgress.value = 0;
  }, [wave1, wave2, wave3, wave4, wave5, slideProgress, lockProgress]);

  // Start animations
  const startWaveformAnimations = useCallback(() => {
    wave1.value = withRepeat(withSequence(withTiming(1, { duration: 400 }), withTiming(0.2, { duration: 400 })), -1, true);
    wave2.value = withRepeat(withSequence(withTiming(1, { duration: 300 }), withTiming(0.2, { duration: 350 })), -1, true);
    wave3.value = withRepeat(withSequence(withTiming(1, { duration: 500 }), withTiming(0.2, { duration: 450 })), -1, true);
    wave4.value = withRepeat(withSequence(withTiming(1, { duration: 350 }), withTiming(0.2, { duration: 300 })), -1, true);
    wave5.value = withRepeat(withSequence(withTiming(1, { duration: 450 }), withTiming(0.2, { duration: 400 })), -1, true);
  }, [wave1, wave2, wave3, wave4, wave5]);

  // Handle Haptics
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

  // ── Transcription & API ──────────────────────────
  const transcribeAudio = useCallback(async (uri: string) => {
    if (unmountedRef.current) return;
    setCapsuleState('processing');
    widthVal.value = withTiming(48, { duration: 200 });

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

      const parameters: Record<string, string> = {
        model,
        prompt,
        response_format: 'json',
      };
      if (groqLang) {
        parameters.language = groqLang;
      }

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

      // Cleanup local file
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

      const voiceRes = body as VoiceSaleResult;

      if (voiceRes.items && voiceRes.items.length > 1) {
        // Multiple items -> brief "N поз." pill for visual continuity, then
        // open the batch review modal automatically. Users shouldn't have to
        // discover and tap the pill to see what was recognized.
        setBatchCount(voiceRes.items.length);
        setLatestBatchResult(voiceRes);
        setCapsuleState('batch');
        widthVal.value = withTiming(190, { duration: 250 });
        triggerHaptic('impactMedium');

        setTimeout(() => {
          if (unmountedRef.current) return;
          if (onShowBatchReview) {
            onShowBatchReview(voiceRes);
          }
          setCapsuleState('idle');
          widthVal.value = withTiming(48, { duration: 200 });
        }, 350);
      } else {
        // Single item -> trigger success haptic & update form
        setCapsuleState('idle');
        widthVal.value = withTiming(48, { duration: 200 });
        triggerHaptic('success');
        onResult(voiceRes);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      if (unmountedRef.current) return;
      console.warn('[VoiceCapsule] transcribe error:', err);
      Alert.alert('Ошибка распознавания', err?.message ?? 'Не удалось распознать речь');
      setCapsuleState('idle');
      widthVal.value = withTiming(48, { duration: 200 });
    } finally {
      abortRef.current = null;
    }
  }, [onResult, voiceLang, setCapsuleState, widthVal, triggerHaptic]);

  // Stop Recording
  const stopRecordingInternal = useCallback(async (discard: boolean) => {
    clearTimers();
    stopAnimations();
    setShowWarning(false);

    const durationMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
    startTimeRef.current = null;

    const uri = await safeStopRecorder(recorder);

    if (discard) {
      if (uri) FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      setCapsuleState('idle');
      widthVal.value = withTiming(48, { duration: 200 });
      triggerHaptic('warning');
      return;
    }

    if (!uri) {
      setCapsuleState('idle');
      widthVal.value = withTiming(48, { duration: 200 });
      return;
    }

    if (durationMs < MIN_DURATION_MS) {
      FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      Alert.alert('🎙️ Удержите кнопку', 'Нажмите и удерживайте пока говорите, затем отпустите.');
      setCapsuleState('idle');
      widthVal.value = withTiming(48, { duration: 200 });
      return;
    }

    // Brief "mic -> checkmark" send animation before collapsing into the
    // processing spinner, so sending doesn't feel like an abrupt cut.
    setCapsuleState('sending');
    triggerHaptic('impactLight');
    widthVal.value = withTiming(100, { duration: 220 });
    sendIconOpacity.value = 0;
    sendIconScale.value = 0.6;
    sendIconOpacity.value = withTiming(1, { duration: 120 });
    sendIconScale.value = withSequence(
      withTiming(1.15, { duration: 130 }),
      withTiming(1, { duration: 100 })
    );
    await new Promise((resolve) => setTimeout(resolve, 240));
    if (unmountedRef.current) return;

    await transcribeAudio(uri);
  }, [recorder, clearTimers, stopAnimations, transcribeAudio, setCapsuleState, widthVal, triggerHaptic, sendIconOpacity, sendIconScale]);

  // Start Recording
  const startRecording = async () => {
    if (capsuleState !== 'idle') return;

    setShowOnboarding(false);
    setCapsuleState('recording');
    widthVal.value = withTiming(rowWidth || 350, { duration: 250 });

    stopRequestedRef.current = false;
    hasTriggeredCancelHaptic.value = false;
    hasTriggeredLockHaptic.value = false;

    try {
      if (safeIsRecording(recorder)) {
        await safeStopRecorder(recorder);
        await new Promise((r) => setTimeout(r, 120));
      }

      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Нет доступа к микрофону', 'Разрешите доступ в настройках телефона.');
        setCapsuleState('idle');
        widthVal.value = withTiming(48, { duration: 200 });
        return;
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      await recorder.record();

      startTimeRef.current = Date.now();
      if (stopRequestedRef.current) {
        stopRequestedRef.current = false;
        stopRecordingInternal(false);
        return;
      }

      startWaveformAnimations();
      triggerHaptic('impactMedium');

      // Seconds timer
      setTimerText('00:00');
      const start = Date.now();
      secondsTimerRef.current = setInterval(() => {
        const elapsedSecs = Math.floor((Date.now() - start) / 1000);
        const mins = Math.floor(elapsedSecs / 60).toString().padStart(2, '0');
        const secs = (elapsedSecs % 60).toString().padStart(2, '0');
        setTimerText(`${mins}:${secs}`);
      }, 500);

      // Max limit timer
      durationTimerRef.current = setTimeout(() => {
        if (safeIsRecording(recorder)) {
          stopRecordingInternal(false);
          Alert.alert('Инфо', 'Достигнут лимит записи (60 сек).');
        }
      }, MAX_DURATION_MS);

      // Warning timer
      warningTimerRef.current = setTimeout(() => {
        setShowWarning(true);
      }, WARNING_MS);

    } catch (err) {
      console.error('[VoiceCapsule] start recording error:', err);
      setCapsuleState('idle');
      widthVal.value = withTiming(48, { duration: 200 });
      Alert.alert('Ошибка', 'Не удалось начать запись.');
    }
  };

  // AppState listening & unmount
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
      safeStopRecorder(recorder).catch(() => {});
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [recorder, clearTimers, stopRecordingInternal]);

  // Gestures definition
  const panGesture = Gesture.Pan()
    .onBegin(() => {
      if (isTransitioning.value) return;
      isTransitioning.value = true;
      runOnJS(startRecording)();
    })
    .onUpdate((event) => {
      slideProgress.value = event.translationX;
      lockProgress.value = event.translationY;

      // X threshold check (+80 rightward)
      if (event.translationX >= 80 && !hasTriggeredCancelHaptic.value) {
        hasTriggeredCancelHaptic.value = true;
        runOnJS(triggerHaptic)('warning');
      }

      // Y threshold check (-60 upward)
      if (event.translationY <= -60 && !hasTriggeredLockHaptic.value) {
        hasTriggeredLockHaptic.value = true;
        runOnJS(triggerHaptic)('impactLight');
      }
    })
    .onEnd((event) => {
      isTransitioning.value = false;

      // Intentional sticky cancel: once cancel line is crossed, cancellation is locked in even if dragged back.
      const shouldCancel = event.translationX >= 80 || hasTriggeredCancelHaptic.value;
      const shouldLock = event.translationY <= -60 || hasTriggeredLockHaptic.value;

      if (shouldCancel) {
        runOnJS(stopRecordingInternal)(true);
      } else if (shouldLock) {
        runOnJS(setCapsuleState)('locked');
      } else {
        runOnJS(stopRecordingInternal)(false);
      }
    });

  // Reanimated Styles
  const capsuleAnimatedStyle = useAnimatedStyle(() => {
    return {
      width: widthVal.value,
    };
  });

  const slideHintStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.max(0, slideProgress.value / 80));
    const translateX = Math.max(0, slideProgress.value * 0.4);
    // Stay fully visible (and grow slightly) as the finger approaches the
    // cancel threshold, instead of fading to nothing right when the gesture
    // fires — the hint should confirm the action, not disappear before it.
    const scale = 1 + progress * 0.2;
    return {
      opacity: 1,
      transform: [{ translateX }, { scale }],
    };
  });

  const slideHintTextStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.max(0, slideProgress.value / 80));
    const color = interpolateColor(progress, [0, 1], ['rgba(255,255,255,0.8)', '#FFD9D6']);
    return { color };
  });

  const lockIconStyle = useAnimatedStyle(() => {
    // If not in recording state, hide lock icon completely
    if (capsuleState !== 'recording') {
      return { opacity: 0 };
    }
    const progress = Math.min(1, Math.max(0, -lockProgress.value / 60));
    const opacity = progress;
    const scale = 0.8 + progress * 0.4;
    const translateY = -40 + Math.max(-20, lockProgress.value * 0.3);
    return {
      opacity,
      transform: [{ translateY }, { scale }],
    };
  });

  // Tap handlers for locked state
  const handleLockTrash = () => {
    stopRecordingInternal(true);
  };

  const handleLockSend = () => {
    stopRecordingInternal(false);
  };

  // Tap handler for batch state
  const handleBatchTap = () => {
    if (latestBatchResult && onShowBatchReview) {
      onShowBatchReview(latestBatchResult);
    }
  };

  // Waveform Bar animated height styles (scaled down to fit the more compact 48pt capsule)
  const waveStyle1 = useAnimatedStyle(() => ({ height: 5 + wave1.value * 18 }));
  const waveStyle2 = useAnimatedStyle(() => ({ height: 5 + wave2.value * 18 }));
  const waveStyle3 = useAnimatedStyle(() => ({ height: 5 + wave3.value * 18 }));
  const waveStyle4 = useAnimatedStyle(() => ({ height: 5 + wave4.value * 18 }));
  const waveStyle5 = useAnimatedStyle(() => ({ height: 5 + wave5.value * 18 }));

  // "Send" checkmark icon animated style
  const sendIconStyle = useAnimatedStyle(() => ({
    opacity: sendIconOpacity.value,
    transform: [{ scale: sendIconScale.value }],
  }));

  // Render help colors
  const activeBg = capsuleState === 'recording' ? '#FF3B30' : Colors.primary;

  return (
    <View style={styles.outerContainer}>
      {/* Absolute Lock icon animated above capsule */}
      <Animated.View style={[styles.lockContainer, lockIconStyle]}>
        <Ionicons name="lock-closed" size={18} color="#FF3B30" />
        <Ionicons name="chevron-up" size={12} color="#FF3B30" />
      </Animated.View>

      {capsuleState === 'idle' && showOnboarding ? (
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

      {capsuleState === 'idle' ? (
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.capsule, styles.idleCapsule, capsuleAnimatedStyle]}>
            <Ionicons name="mic" size={24} color="#fff" />

            {/* Informational small language badge */}
            <View style={[styles.langBadge, isDark ? styles.langBadgeDark : styles.langBadgeLight]}>
              <Text style={[styles.langBadgeText, isDark ? styles.textDark : styles.textLight]}>
                {voiceLang.toUpperCase()}
              </Text>
            </View>
          </Animated.View>
        </GestureDetector>
      ) : capsuleState === 'recording' ? (
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.capsule, styles.recordingCapsule, capsuleAnimatedStyle, { backgroundColor: activeBg }]}>
            <View style={styles.recordingRow}>
              <Ionicons name="mic" size={20} color="#fff" />
              <Text style={styles.timerText}>{timerText}</Text>

              {showWarning ? (
                <Text style={styles.warningTextCapsule} numberOfLines={1}>
                  ⏱️ 5 сек
                </Text>
              ) : (
                <View style={styles.waveformContainer}>
                  <Animated.View style={[styles.waveBar, waveStyle1]} />
                  <Animated.View style={[styles.waveBar, waveStyle2]} />
                  <Animated.View style={[styles.waveBar, waveStyle3]} />
                  <Animated.View style={[styles.waveBar, waveStyle4]} />
                  <Animated.View style={[styles.waveBar, waveStyle5]} />
                </View>
              )}

              {/* Slide to Cancel Hint (sliding rightwards) */}
              <Animated.View style={[styles.slideHintRow, slideHintStyle]}>
                <Animated.Text style={[styles.slideHintText, slideHintTextStyle]}>Отмена</Animated.Text>
                <Ionicons name="chevron-forward-outline" size={14} color="rgba(255,255,255,0.7)" />
              </Animated.View>
            </View>
          </Animated.View>
        </GestureDetector>
      ) : capsuleState === 'locked' ? (
        <Animated.View style={[styles.capsule, styles.recordingCapsule, capsuleAnimatedStyle, { backgroundColor: Colors.primary }]}>
          <View style={styles.recordingRow}>
            {/* Trash option */}
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

            {/* Send option */}
            <TouchableOpacity style={styles.lockActionButton} onPress={handleLockSend}>
              <Ionicons name="checkmark-circle" size={26} color="#fff" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      ) : capsuleState === 'sending' ? (
        <Animated.View style={[styles.capsule, styles.idleCapsule, capsuleAnimatedStyle]}>
          <Animated.View style={sendIconStyle}>
            <Ionicons name="checkmark-circle" size={26} color="#fff" />
          </Animated.View>
        </Animated.View>
      ) : capsuleState === 'processing' ? (
        <Animated.View style={[styles.capsule, styles.processingCapsule, capsuleAnimatedStyle]}>
          <ActivityIndicator size="small" color="#fff" />
        </Animated.View>
      ) : capsuleState === 'batch' ? (
        <TouchableOpacity onPress={handleBatchTap} activeOpacity={0.8}>
          <Animated.View style={[styles.capsule, styles.batchCapsule, capsuleAnimatedStyle]}>
            <Ionicons name="document-text-outline" size={16} color="#fff" />
            <Text style={styles.batchText} numberOfLines={1}>
              {t('addSale.itemsCountShort', { count: batchCount })} · {t('common.edit')}
            </Text>
          </Animated.View>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  outerContainer: {
    height: 48,
    justifyContent: 'center',
    position: 'relative',
  },
  capsule: {
    height: 48,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    ...Shadow.md,
  },
  idleCapsule: {
    backgroundColor: Colors.primary,
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
  },
  batchCapsule: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    justifyContent: 'center',
    gap: 6,
  },
  langBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: Colors.primary,
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
    color: Colors.primary,
  },
  textDark: {
    color: '#eee',
  },
  lockContainer: {
    position: 'absolute',
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
  batchText: {
    color: '#fff',
    fontSize: FontSize.sm - 1,
    fontWeight: 'bold',
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
});
