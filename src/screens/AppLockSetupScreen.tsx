import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Dimensions, Alert, ScrollView, Switch, Modal, Platform
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useAppLock } from '../context/AppLockContext';
import { useAppContext } from '../context/AppContext';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import Svg, { Polyline, Line } from 'react-native-svg';

const { width } = Dimensions.get('window');
const GRID_SIZE = 3;
const DOT_SIZE = 20;
const GRID_SPACING = (width * 0.8) / GRID_SIZE;

export default function AppLockSetupScreen() {
  const { t } = useTranslation();
  const { resolvedTheme, currency } = useAppContext(); const isDark = resolvedTheme === "dark";
  const navigation = useNavigation();
  const {
    isLockEnabled, lockMethod, biometricEnabled, biometricAvailable,
    setupPin, setupPattern, verifyPin, verifyPattern, disableLock, setBiometricEnabled
  } = useAppLock();

  const [step, setStep] = useState<'choose' | 'verify_old' | 'setup' | 'confirm' | 'biometric'>('choose');
  const [method, setMethod] = useState<'pin' | 'pattern' | null>(null);
  const [tempCode, setTempCode] = useState<string>('');
  const [tempPattern, setTempPattern] = useState<number[]>([]);
  const [inputPin, setInputPin] = useState('');
  const [activeDots, setActiveDots] = useState<number[]>([]);
  const activeDotsRef = useRef<number[]>([]);
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    activeDotsRef.current = activeDots;
  }, [activeDots]);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const [isDisabling, setIsDisabling] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  const steps = useMemo(() => {
    if (isDisabling) return ['choose', 'verify_old'];
    const s = ['choose'];
    if (isLockEnabled) s.push('verify_old');
    s.push('setup', 'confirm');
    if (biometricAvailable) s.push('biometric');
    return s;
  }, [isLockEnabled, isDisabling, biometricAvailable]);

  const currentStepIndex = steps.indexOf(step);

  const getHeaderInfo = () => {
    switch (step) {
      case 'choose':
        return { title: t('appLock.title'), subtitle: t('appLock.chooseSubtitle') || 'Выберите способ блокировки' };
      case 'verify_old':
        return {
          title: isDisabling ? t('appLock.verifyToDisable') : t('appLock.verifyToChange'),
          subtitle: t('appLock.verifySubtitle') || 'Подтвердите текущий код, чтобы продолжить'
        };
      case 'setup':
        return {
          title: method === 'pin' ? t('appLock.setupPin') : t('appLock.setupPattern'),
          subtitle: method === 'pin' ? (t('appLock.setupSubtitlePin') || 'Введите 4 цифры') : (t('appLock.setupSubtitlePattern') || 'Соедините минимум 4 точки')
        };
      case 'confirm':
        return {
          title: method === 'pin' ? t('appLock.confirmPin') : t('appLock.confirmPattern'),
          subtitle: method === 'pin' ? (t('appLock.confirmSubtitlePin') || 'Введите код ещё раз для подтверждения') : (t('appLock.confirmSubtitlePattern') || 'Нарисуйте тот же узор ещё раз')
        };
      case 'biometric':
        return {
          title: t('appLock.useBiometric'),
          subtitle: t('appLock.biometricSubtitle') || 'Используйте отпечаток пальца для быстрого входа'
        };
      default:
        return { title: '', subtitle: '' };
    }
  };

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleChooseMethod = (m: 'pin' | 'pattern') => {
    setMethod(m);
    setIsDisabling(false);
    if (isLockEnabled) {
        setStep('verify_old');
    } else {
        setStep('setup');
    }
  };

  const handleVerifyOld = async () => {
    let isValid = false;
    if (lockMethod === 'pin') {
      isValid = await verifyPin(inputPin);
    } else {
      isValid = await verifyPattern(activeDots);
    }

    if (isValid) {
      if (isDisabling) {
          await disableLock();
          Alert.alert(t('common.saved'), '');
          navigation.goBack();
      } else {
          setStep('setup');
          setInputPin('');
          setActiveDots([]);
          setError(null);
      }
    } else {
      setError(lockMethod === 'pin' ? t('appLock.wrongPin') : t('appLock.wrongPattern'));
      shake();
      setInputPin('');
      if (lockMethod === 'pattern') {
        setTimeout(() => {
          setActiveDots([]);
          setError(null);
        }, 500);
      } else {
        setActiveDots([]);
      }
    }
  };

  const handleSetup = () => {
    if (method === 'pin') {
      if (inputPin.length === 4) {
        setTempCode(inputPin);
        setInputPin('');
        setStep('confirm');
      }
    } else {
      if (activeDots.length >= 4) {
        setTempPattern(activeDots);
        setActiveDots([]);
        setStep('confirm');
      } else {
          setError(t('appLock.patternTooShort'));
          shake();
      }
    }
  };

  const handleConfirm = async () => {
    if (method === 'pin') {
      if (inputPin === tempCode) {
        const code = await setupPin(inputPin);
        if (code) setRecoveryCode(code);
        if (biometricAvailable) {
            setStep('biometric');
        } else {
            finishSetup();
        }
      } else {
        setError(t('appLock.pinsDontMatch'));
        shake();
        setInputPin('');
      }
    } else {
      if (JSON.stringify(activeDots) === JSON.stringify(tempPattern)) {
        const code = await setupPattern(activeDots);
        if (code) setRecoveryCode(code);
        if (biometricAvailable) {
            setStep('biometric');
        } else {
            finishSetup();
        }
      } else {
        setError(t('appLock.patternsDontMatch'));
        shake();
        setTimeout(() => {
          setActiveDots([]);
          setError(null);
        }, 500);
      }
    }
  };

  const finishSetup = () => {
    if (!recoveryCode) {
        Alert.alert(t('common.saved'), '');
        navigation.goBack();
    }
  };

  const copyRecoveryCode = async () => {
    if (recoveryCode) {
      await Clipboard.setStringAsync(recoveryCode);
      Alert.alert(t('profile.referralCopied'), '');
    }
  };

  const startDisable = () => {
      setIsDisabling(true);
      setMethod(lockMethod);
      setStep('verify_old');
  };

  const handlePinInput = (digit: string) => {
    const next = inputPin + digit;
    if (next.length <= 4) {
      setInputPin(next);
      setError(null);
    }
  };

  const onGesture = useMemo(() => Gesture.Pan()
    .runOnJS(true)
    .onUpdate((event) => {
      const { x, y } = event;
      setCurrentPos({ x, y });
      const col = Math.floor(x / GRID_SPACING);
      const row = Math.floor(y / GRID_SPACING);
      const index = row * GRID_SIZE + col;

      if (index >= 0 && index < 9 && col >= 0 && col < 3 && row >= 0 && row < 3) {
        const dotCenterX = col * GRID_SPACING + GRID_SPACING / 2;
        const dotCenterY = row * GRID_SPACING + GRID_SPACING / 2;
        const dist = Math.sqrt(Math.pow(x - dotCenterX, 2) + Math.pow(y - dotCenterY, 2));

        if (dist < DOT_SIZE * 2 && !activeDotsRef.current.includes(index)) {
          setActiveDots((prev) => [...prev, index]);
          setError(null);
        }
      }
    })
    .onEnd(() => {
      setCurrentPos(null);
    }), []);

  const getDotCenter = (index: number) => {
    const row = Math.floor(index / GRID_SIZE);
    const col = index % GRID_SIZE;
    return {
      x: col * GRID_SPACING + GRID_SPACING / 2,
      y: row * GRID_SPACING + GRID_SPACING / 2,
    };
  };

  const patternLineColor = error ? '#E53935' : (currentPos ? 'rgba(29, 158, 117, 0.55)' : '#1D9E75');

  const renderKeypad = () => {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'BACK'];
    return (
      <View style={styles.keypad}>
        {keys.map((key, index) => (
          <TouchableOpacity
            key={index}
            style={styles.key}
            onPress={() => key === 'BACK' ? setInputPin(inputPin.slice(0, -1)) : key !== '' ? handlePinInput(key) : null}
            disabled={key === ''}
          >
            {key === 'BACK' ? (
              <Ionicons name="backspace-outline" size={28} color={isDark ? '#EEE' : '#333'} />
            ) : (
              <Text style={[styles.keyText, { color: isDark ? '#EEE' : '#333' }]}>{key}</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: isDark ? '#121212' : '#F5F5F5' }]}>
      <Modal
        visible={!!recoveryCode}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: isDark ? '#1E1E1E' : '#FFF' }]}>
            <View style={styles.modalIconWrapper}>
                <Ionicons name="shield-checkmark-outline" size={64} color="#1D9E75" />
                <View style={styles.warningBadge}>
                    <Ionicons name="warning" size={16} color="#FFF" />
                </View>
            </View>
            <Text style={[styles.modalTitle, { color: isDark ? '#EEE' : '#333' }]}>
              {t('appLock.recoveryTitle')}
            </Text>
            <View style={styles.warningContainer}>
                <Ionicons name="alert-circle-outline" size={20} color="#F5A623" />
                <Text style={[styles.modalDesc, { color: isDark ? '#AAA' : '#666', flex: 1, marginBottom: 0, textAlign: 'left', marginLeft: 8 }]}>
                {t('appLock.recoveryDesc')}
                </Text>
            </View>
            <View style={[styles.codeContainer, { backgroundColor: isDark ? '#2A2A2A' : '#F9F9F9', borderColor: isDark ? '#444' : '#E0E0E0', borderWidth: 1 }]}>
              <Text style={[styles.codeText, { color: isDark ? '#FFF' : '#1D9E75' }]}>{recoveryCode}</Text>
              <TouchableOpacity onPress={copyRecoveryCode} style={styles.copyBtn}>
                <Ionicons name="copy-outline" size={24} color="#1D9E75" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.modalBtn}
              onPress={() => {
                setRecoveryCode(null);
                navigation.goBack();
              }}
            >
              <Text style={styles.modalBtnText}>{t('common.continue')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.header}>
        <View style={styles.stepIndicator}>
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <View style={[
                styles.stepDot,
                i <= currentStepIndex ? { backgroundColor: '#1D9E75' } : { backgroundColor: isDark ? '#333' : '#E0E0E0' }
              ]} />
              {i < steps.length - 1 && (
                <View style={[
                  styles.stepLine,
                  i < currentStepIndex ? { backgroundColor: '#1D9E75' } : { backgroundColor: isDark ? '#333' : '#E0E0E0' }
                ]} />
              )}
            </React.Fragment>
          ))}
        </View>
        <Text style={[styles.title, { color: isDark ? '#EEE' : '#333' }]}>
          {getHeaderInfo().title}
        </Text>
        <Text style={[styles.subtitle, { color: isDark ? '#AAA' : '#666' }]}>
          {getHeaderInfo().subtitle}
        </Text>
      </View>

      <View style={styles.content}>
        {step === 'choose' && (
          <View style={styles.options}>
            <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.optionCard, { backgroundColor: isDark ? '#1E1E1E' : '#FFF' }]}
                onPress={() => handleChooseMethod('pin')}
            >
              <View style={[styles.optionIcon, { backgroundColor: isDark ? '#2A2A2A' : '#F0F9F6' }]}>
                <Ionicons name="keypad-outline" size={36} color="#1D9E75" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionText, { color: isDark ? '#EEE' : '#333' }]}>PIN</Text>
                <Text style={[styles.optionSubtext, { color: isDark ? '#AAA' : '#888' }]}>{t('appLock.pinDesc') || '4 цифры'}</Text>
              </View>
              {lockMethod === 'pin' && isLockEnabled ? (
                <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>{t('appLock.currentMethod') || 'Текущий'}</Text>
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={20} color={isDark ? '#444' : '#CCC' } />
              )}
            </TouchableOpacity>

            <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.optionCard, { backgroundColor: isDark ? '#1E1E1E' : '#FFF' }]}
                onPress={() => handleChooseMethod('pattern')}
            >
              <View style={[styles.optionIcon, { backgroundColor: isDark ? '#2A2A2A' : '#F0F9F6' }]}>
                <Ionicons name="grid-outline" size={36} color="#1D9E75" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionText, { color: isDark ? '#EEE' : '#333' }]}>{t('appLock.usePattern')}</Text>
                <Text style={[styles.optionSubtext, { color: isDark ? '#AAA' : '#888' }]}>{t('appLock.patternDesc') || 'Графический узор'}</Text>
              </View>
              {lockMethod === 'pattern' && isLockEnabled ? (
                <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>{t('appLock.currentMethod') || 'Текущий'}</Text>
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={20} color={isDark ? '#444' : '#CCC' } />
              )}
            </TouchableOpacity>

            {isLockEnabled && (
                <TouchableOpacity
                    activeOpacity={0.7}
                    style={[styles.optionCard, styles.dangerOption, { backgroundColor: isDark ? '#1E1E1E' : '#FFF' }]}
                    onPress={startDisable}
                >
                  <View style={[styles.optionIcon, { backgroundColor: isDark ? '#2A1A1A' : '#FFF5F5' }]}>
                    <Ionicons name="trash-outline" size={36} color="#E53935" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionText, { color: '#E53935' }]}>{t('common.delete')}</Text>
                    <Text style={[styles.optionSubtext, { color: '#E53935', opacity: 0.7 }]}>{t('appLock.disableDesc') || 'Отключить защиту'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#FFCDD2" />
                </TouchableOpacity>
            )}
          </View>
        )}

        {(step === 'setup' || step === 'confirm' || step === 'verify_old') && (
          <View style={[styles.inputArea, { backgroundColor: isDark ? '#1A1A1A' : '#FFF', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 }]}>
            {(method === 'pin' || (step === 'verify_old' && lockMethod === 'pin')) ? (
              <>
                <Animated.View style={[styles.pinDots, { transform: [{ translateX: shakeAnim }] }]}>
                  {[0, 1, 2, 3].map((i) => (
                    <View
                      key={i}
                      style={[
                        styles.pinDot,
                        { backgroundColor: inputPin.length > i ? '#1D9E75' : isDark ? '#333' : '#E0E0E0' }
                      ]}
                    />
                  ))}
                </Animated.View>
                {renderKeypad()}
                <TouchableOpacity
                    style={[styles.nextBtn, (inputPin.length < 4) && styles.nextBtnDisabled]}
                    onPress={step === 'verify_old' ? handleVerifyOld : (step === 'setup' ? handleSetup : handleConfirm)}
                    disabled={inputPin.length < 4}
                >
                  <Text style={styles.nextBtnText}>{step === 'confirm' ? t('common.save') : t('common.continue')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <GestureHandlerRootView style={[styles.patternContainer, { marginBottom: 20 }]}>
                  <GestureDetector gesture={onGesture}>
                    <View style={styles.grid}>
                      <Svg style={StyleSheet.absoluteFill}>
                        {activeDots.length > 0 && (
                          <Polyline
                            points={activeDots.map(i => {
                              const center = getDotCenter(i);
                              return `${center.x},${center.y}`;
                            }).join(' ')}
                            fill="none"
                            stroke={patternLineColor}
                            strokeWidth={4}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                          />
                        )}
                        {currentPos && activeDots.length > 0 && (
                          <Line
                            x1={getDotCenter(activeDots[activeDots.length - 1]).x}
                            y1={getDotCenter(activeDots[activeDots.length - 1]).y}
                            x2={currentPos.x}
                            y2={currentPos.y}
                            stroke={patternLineColor}
                            strokeWidth={4}
                            strokeLinecap="round"
                          />
                        )}
                      </Svg>
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                        <View key={i} style={styles.dotWrapper}>
                          <View style={[styles.dot, {
                            backgroundColor: activeDots.includes(i)
                              ? patternLineColor
                              : (isDark ? '#333' : '#E0E0E0')
                          }]} />
                        </View>
                      ))}
                    </View>
                  </GestureDetector>
                </GestureHandlerRootView>
                <View style={styles.row}>
                  <TouchableOpacity style={[styles.nextBtn, { flex: 1, backgroundColor: '#888' }]} onPress={() => setActiveDots([])}>
                    <Text style={styles.nextBtnText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.nextBtn, { flex: 1 }, activeDots.length < 4 && styles.nextBtnDisabled]}
                    onPress={step === 'verify_old' ? handleVerifyOld : (step === 'setup' ? handleSetup : handleConfirm)}
                    disabled={activeDots.length < 4}
                  >
                    <Text style={styles.nextBtnText}>{step === 'confirm' ? t('common.save') : t('common.continue')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            {error && <Text style={styles.errorText}>{error}</Text>}
          </View>
        )}

        {step === 'biometric' && (
            <View style={styles.biometricArea}>
                <Ionicons name="finger-print" size={80} color="#1D9E75" />
                <Text style={[styles.bioDesc, { color: isDark ? '#AAA' : '#666' }]}>
                    {t('appLock.useBiometric')}
                </Text>
                <View style={[styles.bioRow, { backgroundColor: isDark ? '#1E1E1E' : '#FFF' }]}>
                    <Text style={[styles.bioLabel, { color: isDark ? '#EEE' : '#333' }]}>{t('appLock.useBiometric')}</Text>
                    <Switch
                        value={biometricEnabled}
                        onValueChange={setBiometricEnabled}
                        trackColor={{ false: '#767577', true: '#1D9E75' }}
                        thumbColor={biometricEnabled ? '#fff' : '#f4f3f4'}
                    />
                </View>
                <TouchableOpacity style={styles.nextBtn} onPress={finishSetup}>
                    <Text style={styles.nextBtnText}>{t('common.continue')}</Text>
                </TouchableOpacity>
            </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 30, paddingTop: 40, paddingBottom: 20, alignItems: 'center' },
  stepIndicator: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  stepDot: { width: 10, height: 10, borderRadius: 5 },
  stepLine: { width: 20, height: 2, marginHorizontal: 4 },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, textAlign: 'center', marginBottom: 12 },
  content: { padding: 20 },
  options: { gap: 15 },
  optionCard: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 4, gap: 16,
    marginBottom: 8
  },
  optionIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  optionText: { fontSize: 18, fontWeight: '600' },
  optionSubtext: { fontSize: 13, marginTop: 2 },
  activeBadge: { backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  activeBadgeText: { color: '#1D9E75', fontSize: 12, fontWeight: '700' },
  dangerOption: { borderColor: 'rgba(229, 57, 53, 0.2)', borderWidth: 1 },
  inputArea: { alignItems: 'center', padding: 24, borderRadius: 20, marginVertical: 10 },
  pinDots: { flexDirection: 'row', gap: 20, marginBottom: 30 },
  pinDot: { width: 16, height: 16, borderRadius: 8 },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', width: width * 0.8 },
  key: { width: '33.33%', height: 70, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 24 },
  nextBtn: {
    backgroundColor: '#1D9E75', padding: 15, borderRadius: 10,
    width: '100%', alignItems: 'center', marginTop: 30
  },
  nextBtnDisabled: { backgroundColor: '#CCC' },
  nextBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  errorText: { color: '#E53935', marginTop: 15, fontSize: 14 },
  patternContainer: { width: width * 0.8, height: width * 0.8 },
  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
  dotWrapper: { width: '33.33%', height: '33.33%', alignItems: 'center', justifyContent: 'center' },
  dot: { width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2 },
  hint: { marginTop: 10, color: '#666' },
  row: { flexDirection: 'row', gap: 15, width: '100%' },
  biometricArea: { alignItems: 'center', paddingTop: 40 },
  bioDesc: { textAlign: 'center', marginVertical: 20, fontSize: 16 },
  bioRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      padding: 20, borderRadius: 15, width: '100%', marginBottom: 30
  },
  bioLabel: { fontSize: 16, fontWeight: '500' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 20
  },
  modalContent: {
    width: '90%', padding: 24, borderRadius: 32, alignItems: 'center'
  },
  modalIconWrapper: { marginBottom: 20, position: 'relative' },
  warningBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#F5A623', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFF' },
  modalTitle: { fontSize: 22, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  warningContainer: { flexDirection: 'row', backgroundColor: 'rgba(245, 166, 35, 0.08)', padding: 16, borderRadius: 16, marginBottom: 24, alignItems: 'flex-start' },
  modalDesc: { fontSize: 14, lineHeight: 20 },
  codeContainer: {
    flexDirection: 'row', alignItems: 'center', padding: 20,
    borderRadius: 20, gap: 15, marginBottom: 32, width: '100%', justifyContent: 'center'
  },
  codeText: { fontSize: 28, fontWeight: '700', letterSpacing: 4, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  copyBtn: { padding: 8 },
  modalBtn: {
    backgroundColor: '#1D9E75', padding: 15, borderRadius: 10,
    width: '100%', alignItems: 'center'
  },
  modalBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' }
});
