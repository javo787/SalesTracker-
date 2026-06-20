import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  BackHandler, Animated, Dimensions, Platform, ActivityIndicator
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAppLock } from '../context/AppLockContext';
import { useAppContext } from '../context/AppContext';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');
const GRID_SIZE = 3;
const DOT_SIZE = 20;
const GRID_SPACING = (width * 0.8) / GRID_SIZE;

export default function LockScreen() {
  const { t } = useTranslation();
  const { resolvedTheme, currency } = useAppContext(); const isDark = resolvedTheme === "dark";
  const {
    lockMethod, verifyPin, verifyPattern,
    authenticateWithBiometrics, biometricAvailable, biometricEnabled,
    unlock, isLoading
  } = useAppLock();

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [lockoutTimer, setLockoutTimer] = useState(0);
  const [currentMethod, setCurrentMethod] = useState(lockMethod);

  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setCurrentMethod(lockMethod);
  }, [lockMethod]);

  useEffect(() => {
    const backAction = () => true; // Prevent back button
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    loadAttempts();
    if (biometricEnabled && biometricAvailable) {
      authenticateWithBiometrics();
    }

    return () => backHandler.remove();
  }, [biometricEnabled, biometricAvailable]);

  useEffect(() => {
    let interval: any;
    if (lockoutTimer > 0) {
      interval = setInterval(() => {
        setLockoutTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [lockoutTimer]);

  const loadAttempts = async () => {
    const savedAttempts = await AsyncStorage.getItem('app_lock_attempts');
    const savedLockout = await AsyncStorage.getItem('app_lock_lockout_time');

    if (savedLockout) {
      const timePassed = Math.floor((Date.now() - parseInt(savedLockout)) / 1000);
      if (timePassed < 30) {
        setLockoutTimer(30 - timePassed);
      }
    }
    if (savedAttempts) {
      setAttempts(parseInt(savedAttempts));
    }
  };

  const saveAttempts = async (newAttempts: number) => {
    setAttempts(newAttempts);
    await AsyncStorage.setItem('app_lock_attempts', String(newAttempts));
    if (newAttempts >= 5) {
      setLockoutTimer(30);
      await AsyncStorage.setItem('app_lock_lockout_time', String(Date.now()));
    }
  };

  const resetAttempts = async () => {
    setAttempts(0);
    await AsyncStorage.removeItem('app_lock_attempts');
    await AsyncStorage.removeItem('app_lock_lockout_time');
  };

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handlePinInput = async (digit: string) => {
    if (lockoutTimer > 0) return;
    const newPin = pin + digit;
    if (newPin.length <= 4) {
      setPin(newPin);
      setError(null);
      if (newPin.length === 4) {
        const isValid = await verifyPin(newPin);
        if (isValid) {
          await resetAttempts();
          unlock();
        } else {
          setError(t('appLock.wrongPin'));
          shake();
          setPin('');
          await saveAttempts(attempts + 1);
        }
      }
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
    setError(null);
  };

  // Pattern Logic
  const [activeDots, setActiveDots] = useState<number[]>([]);

  const onGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (lockoutTimer > 0) return;
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
    .onEnd(async () => {
      if (lockoutTimer > 0) return;
      if (activeDots.length > 0) {
        const isValid = await verifyPattern(activeDots);
        if (isValid) {
          await resetAttempts();
          unlock();
        } else {
          setError(t('appLock.wrongPattern'));
          shake();
          setTimeout(() => setActiveDots([]), 500);
          await saveAttempts(attempts + 1);
        }
      }
    });

  const renderPinDots = () => {
    return (
      <Animated.View style={[styles.pinDots, { transform: [{ translateX: shakeAnim }] }]}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.pinDot,
              { backgroundColor: pin.length > i ? '#1D9E75' : isDark ? '#333' : '#E0E0E0' }
            ]}
          />
        ))}
      </Animated.View>
    );
  };

  const renderKeypad = () => {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'BACK'];
    return (
      <View style={styles.keypad}>
        {keys.map((key, index) => (
          <TouchableOpacity
            key={index}
            style={styles.key}
            onPress={() => key === 'BACK' ? handleDelete() : key !== '' ? handlePinInput(key) : null}
            disabled={key === '' || lockoutTimer > 0}
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

  const renderPatternGrid = () => {
    return (
      <GestureHandlerRootView style={styles.patternContainer}>
        <GestureDetector gesture={onGesture}>
          <View style={styles.grid}>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <View
                key={i}
                style={styles.dotWrapper}
              >
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: activeDots.includes(i)
                        ? (error && activeDots.length > 0 ? '#E53935' : '#1D9E75')
                        : (isDark ? '#333' : '#E0E0E0')
                    }
                  ]}
                />
              </View>
            ))}
          </View>
        </GestureDetector>
      </GestureHandlerRootView>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: isDark ? '#121212' : '#FFF' }]}>
        <ActivityIndicator size="large" color="#1D9E75" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#121212' : '#FFF' }]}>
      <View style={styles.header}>
        <Ionicons name="lock-closed" size={60} color="#1D9E75" />
        <Text style={[styles.title, { color: isDark ? '#EEE' : '#333' }]}>
          {currentMethod === 'pin' ? t('appLock.enterPin') : t('appLock.enterPattern')}
        </Text>
      </View>

      <View style={styles.content}>
        {lockoutTimer > 0 ? (
          <View style={styles.lockout}>
            <Text style={styles.lockoutText}>{t('appLock.tooManyAttempts')}</Text>
            <Text style={styles.timerText}>{t('appLock.tryAgainIn', { seconds: lockoutTimer })}</Text>
          </View>
        ) : (
          <View style={styles.center}>
            {currentMethod === 'pin' ? renderPinDots() : renderPatternGrid()}
            {error && <Text style={styles.errorText}>{error}</Text>}
          </View>
        )}
      </View>

      <View style={styles.footer}>
        {currentMethod === 'pin' ? renderKeypad() : null}

        <View style={styles.switchMethods}>
          {biometricAvailable && biometricEnabled && (
            <TouchableOpacity style={styles.methodBtn} onPress={authenticateWithBiometrics}>
              <Ionicons name="finger-print-outline" size={24} color="#1D9E75" />
              <Text style={styles.methodBtnText}>{t('appLock.useBiometric')}</Text>
            </TouchableOpacity>
          )}

          {lockMethod === 'pin' && currentMethod === 'pattern' && (
            <TouchableOpacity style={styles.methodBtn} onPress={() => { setCurrentMethod('pin'); setError(null); }}>
              <Ionicons name="keypad-outline" size={24} color="#1D9E75" />
              <Text style={styles.methodBtnText}>{t('appLock.usePin')}</Text>
            </TouchableOpacity>
          )}

          {lockMethod === 'pattern' && currentMethod === 'pin' && (
            <TouchableOpacity style={styles.methodBtn} onPress={() => { setCurrentMethod('pattern'); setError(null); }}>
              <Ionicons name="grid-outline" size={24} color="#1D9E75" />
              <Text style={styles.methodBtnText}>{t('appLock.usePattern')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 20,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDots: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 20,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  errorText: {
    color: '#E53935',
    marginTop: 10,
    fontSize: 14,
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: width * 0.8,
    alignSelf: 'center',
  },
  key: {
    width: '33.33%',
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {
    fontSize: 28,
    fontWeight: '400',
  },
  footer: {
    paddingBottom: 40,
  },
  switchMethods: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 20,
  },
  methodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
  },
  methodBtnText: {
    color: '#1D9E75',
    fontSize: 14,
    fontWeight: '500',
  },
  lockout: {
    alignItems: 'center',
  },
  lockoutText: {
    fontSize: 18,
    color: '#E53935',
    fontWeight: '600',
    marginBottom: 10,
  },
  timerText: {
    fontSize: 16,
    color: '#666',
  },
  patternContainer: {
    width: width * 0.8,
    height: width * 0.8,
  },
  grid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dotWrapper: {
    width: '33.33%',
    height: '33.33%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});
