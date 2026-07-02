import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Dimensions, Alert, ScrollView, Switch, Modal
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useAppLock } from '../context/AppLockContext';
import { useAppContext } from '../context/AppContext';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';

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
  const [error, setError] = useState<string | null>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const [isDisabling, setIsDisabling] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

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
      setActiveDots([]);
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
        setActiveDots([]);
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

  const onGesture = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((event) => {
      const { x, y } = event;
      const col = Math.floor(x / GRID_SPACING);
      const row = Math.floor(y / GRID_SPACING);
      const index = row * GRID_SIZE + col;

      if (index >= 0 && index < 9 && col >= 0 && col < 3 && row >= 0 && row < 3) {
        const dotCenterX = col * GRID_SPACING + GRID_SPACING / 2;
        const dotCenterY = row * GRID_SPACING + GRID_SPACING / 2;
        const dist = Math.sqrt(Math.pow(x - dotCenterX, 2) + Math.pow(y - dotCenterY, 2));

        if (dist < DOT_SIZE * 2 && !activeDots.includes(index)) {
          setActiveDots((prev) => [...prev, index]);
          setError(null);
        }
      }
    })
    .onEnd(() => {});

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
            <Ionicons name="shield-checkmark-outline" size={64} color="#1D9E75" />
            <Text style={[styles.modalTitle, { color: isDark ? '#EEE' : '#333' }]}>
              {t('appLock.recoveryTitle') || 'Save recovery code'}
            </Text>
            <Text style={[styles.modalDesc, { color: isDark ? '#AAA' : '#666' }]}>
              {t('appLock.recoveryDesc') || "Save this recovery code — it's the only way to reset your lock if you forget your PIN/pattern. We can't show it again."}
            </Text>
            <View style={[styles.codeContainer, { backgroundColor: isDark ? '#333' : '#F5F5F5' }]}>
              <Text style={[styles.codeText, { color: isDark ? '#FFF' : '#333' }]}>{recoveryCode}</Text>
              <TouchableOpacity onPress={copyRecoveryCode}>
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
        <Text style={[styles.title, { color: isDark ? '#EEE' : '#333' }]}>
          {step === 'choose' && t('appLock.title')}
          {step === 'verify_old' && (isDisabling ? t('appLock.verifyToDisable') : t('appLock.verifyToChange'))}
          {step === 'setup' && (method === 'pin' ? t('appLock.setupPin') : t('appLock.setupPattern'))}
          {step === 'confirm' && (method === 'pin' ? t('appLock.confirmPin') : t('appLock.confirmPattern'))}
          {step === 'biometric' && t('appLock.useBiometric')}
        </Text>
      </View>

      <View style={styles.content}>
        {step === 'choose' && (
          <View style={styles.options}>
            <TouchableOpacity
                style={[styles.optionCard, { backgroundColor: isDark ? '#1E1E1E' : '#FFF' }]}
                onPress={() => handleChooseMethod('pin')}
            >
              <Ionicons name="keypad-outline" size={32} color="#1D9E75" />
              <Text style={[styles.optionText, { color: isDark ? '#EEE' : '#333' }]}>PIN</Text>
              {lockMethod === 'pin' && isLockEnabled && <Ionicons name="checkmark-circle" size={24} color="#1D9E75" />}
            </TouchableOpacity>

            <TouchableOpacity
                style={[styles.optionCard, { backgroundColor: isDark ? '#1E1E1E' : '#FFF' }]}
                onPress={() => handleChooseMethod('pattern')}
            >
              <Ionicons name="grid-outline" size={32} color="#1D9E75" />
              <Text style={[styles.optionText, { color: isDark ? '#EEE' : '#333' }]}>{t('appLock.usePattern')}</Text>
              {lockMethod === 'pattern' && isLockEnabled && <Ionicons name="checkmark-circle" size={24} color="#1D9E75" />}
            </TouchableOpacity>

            {isLockEnabled && (
                <TouchableOpacity
                    style={[styles.optionCard, styles.dangerOption, { backgroundColor: isDark ? '#1E1E1E' : '#FFF' }]}
                    onPress={startDisable}
                >
                  <Ionicons name="trash-outline" size={32} color="#E53935" />
                  <Text style={[styles.optionText, { color: '#E53935' }]}>{t('common.delete')}</Text>
                </TouchableOpacity>
            )}
          </View>
        )}

        {(step === 'setup' || step === 'confirm' || step === 'verify_old') && (
          <View style={styles.inputArea}>
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
                <GestureHandlerRootView style={styles.patternContainer}>
                  <GestureDetector gesture={onGesture}>
                    <View style={styles.grid}>
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                        <View key={i} style={styles.dotWrapper}>
                          <View style={[styles.dot, { backgroundColor: activeDots.includes(i) ? '#1D9E75' : (isDark ? '#333' : '#E0E0E0') }]} />
                        </View>
                      ))}
                    </View>
                  </GestureDetector>
                </GestureHandlerRootView>
                <Text style={styles.hint}>{t('appLock.patternHint')}</Text>
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
  header: { padding: 30, alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '600', textAlign: 'center' },
  content: { padding: 20 },
  options: { gap: 15 },
  optionCard: {
    flexDirection: 'row', alignItems: 'center', padding: 20,
    borderRadius: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, gap: 20
  },
  optionText: { fontSize: 18, fontWeight: '500', flex: 1 },
  dangerOption: { borderColor: '#E53935', borderWidth: 1 },
  inputArea: { alignItems: 'center' },
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
    width: '100%', padding: 30, borderRadius: 20, alignItems: 'center'
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginTop: 20, textAlign: 'center' },
  modalDesc: { textAlign: 'center', marginVertical: 15, fontSize: 14, lineHeight: 20 },
  codeContainer: {
    flexDirection: 'row', alignItems: 'center', padding: 15,
    borderRadius: 10, gap: 15, marginBottom: 25, width: '100%', justifyContent: 'center'
  },
  codeText: { fontSize: 24, fontWeight: 'bold', letterSpacing: 2 },
  modalBtn: {
    backgroundColor: '#1D9E75', padding: 15, borderRadius: 10,
    width: '100%', alignItems: 'center'
  },
  modalBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' }
});
