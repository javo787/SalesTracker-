import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';

type LockMethod = 'pin' | 'pattern';

interface AppLockContextType {
  isLockEnabled: boolean;
  isLocked: boolean;
  lockMethod: LockMethod | null;
  biometricEnabled: boolean;
  biometricAvailable: boolean;
  setupPin: (pin: string) => Promise<void>;
  setupPattern: (points: number[]) => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  verifyPattern: (points: number[]) => Promise<boolean>;
  authenticateWithBiometrics: () => Promise<boolean>;
  disableLock: () => Promise<void>;
  lock: () => void;
  unlock: () => void;
  isSystemDialogOpen: boolean;
  setIsSystemDialogOpen: (isOpen: boolean) => void;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  isLoading: boolean;
}

const AppLockContext = createContext<AppLockContextType | undefined>(undefined);

export const AppLockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLockEnabled, setIsLockEnabled] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lockMethod, setLockMethod] = useState<LockMethod | null>(null);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [isSystemDialogOpen, setIsSystemDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    loadSettings();
    checkBiometrics();

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, []);

  const loadSettings = async () => {
    try {
      const enabled = await AsyncStorage.getItem('app_lock_enabled');
      const method = await AsyncStorage.getItem('app_lock_method') as LockMethod | null;
      const bioEnabled = await AsyncStorage.getItem('app_lock_biometric_enabled');

      const isEnabled = enabled === 'true';
      setIsLockEnabled(isEnabled);
      setLockMethod(method);
      setBiometricEnabledState(bioEnabled === 'true');

      if (isEnabled) {
        setIsLocked(true);
      }
    } catch (e) {
      console.error('Failed to load app lock settings', e);
    } finally {
      setIsLoading(false);
    }
  };

  const checkBiometrics = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    setBiometricAvailable(hasHardware && isEnrolled);
  };

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (
      appState.current.match(/active/) &&
      nextAppState.match(/inactive|background/)
    ) {
      if (isLockEnabled && !isSystemDialogOpen) {
        // Debounce lock to avoid locking on transient states or system dialogs
        setTimeout(() => {
            if (AppState.currentState !== 'active' && !isSystemDialogOpen) {
                setIsLocked(true);
            }
        }, 1000);
      }
    }
    appState.current = nextAppState;
  };

  const getSalt = async (type: 'pin' | 'pattern') => {
    const key = `app_lock_${type}_salt`;
    let salt = await SecureStore.getItemAsync(key);
    if (!salt) {
      const randomBytes = await Crypto.getRandomBytesAsync(16);
      salt = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      await SecureStore.setItemAsync(key, salt);
    }
    return salt;
  };

  const hashData = async (data: string, type: 'pin' | 'pattern') => {
    const salt = await getSalt(type);
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      data + salt
    );
    return hash;
  };

  const setupPin = async (pin: string) => {
    const hash = await hashData(pin, 'pin');
    await SecureStore.setItemAsync('app_lock_pin_hash', hash);
    await AsyncStorage.setItem('app_lock_enabled', 'true');
    await AsyncStorage.setItem('app_lock_method', 'pin');
    setIsLockEnabled(true);
    setLockMethod('pin');
  };

  const setupPattern = async (points: number[]) => {
    const patternStr = points.join('-');
    const hash = await hashData(patternStr, 'pattern');
    await SecureStore.setItemAsync('app_lock_pattern_hash', hash);
    await AsyncStorage.setItem('app_lock_enabled', 'true');
    await AsyncStorage.setItem('app_lock_method', 'pattern');
    setIsLockEnabled(true);
    setLockMethod('pattern');
  };

  const verifyPin = async (pin: string) => {
    const storedHash = await SecureStore.getItemAsync('app_lock_pin_hash');
    if (!storedHash) return false;
    const hash = await hashData(pin, 'pin');
    return hash === storedHash;
  };

  const verifyPattern = async (points: number[]) => {
    const storedHash = await SecureStore.getItemAsync('app_lock_pattern_hash');
    if (!storedHash) return false;
    const patternStr = points.join('-');
    const hash = await hashData(patternStr, 'pattern');
    return hash === storedHash;
  };

  const authenticateWithBiometrics = async () => {
    if (!biometricAvailable || !biometricEnabled) return false;

    setIsSystemDialogOpen(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'SavdoApp',
        disableDeviceFallback: true,
      });
      if (result.success) {
        setIsLocked(false);
        return true;
      }
      return false;
    } finally {
      // Add a small delay before resetting the flag to catch the background->active transition
      setTimeout(() => setIsSystemDialogOpen(false), 500);
    }
  };

  const setBiometricEnabled = async (enabled: boolean) => {
    setBiometricEnabledState(enabled);
    await AsyncStorage.setItem('app_lock_biometric_enabled', String(enabled));
  };

  const disableLock = async () => {
    await SecureStore.deleteItemAsync('app_lock_pin_hash');
    await SecureStore.deleteItemAsync('app_lock_pattern_hash');
    await SecureStore.deleteItemAsync('app_lock_pin_salt');
    await SecureStore.deleteItemAsync('app_lock_pattern_salt');
    await AsyncStorage.removeItem('app_lock_enabled');
    await AsyncStorage.removeItem('app_lock_method');
    await AsyncStorage.removeItem('app_lock_biometric_enabled');
    setIsLockEnabled(false);
    setIsLocked(false);
    setLockMethod(null);
    setBiometricEnabledState(false);
  };

  const lock = () => setIsLocked(true);
  const unlock = () => setIsLocked(false);

  return (
    <AppLockContext.Provider value={{
      isLockEnabled,
      isLocked,
      lockMethod,
      biometricEnabled,
      biometricAvailable,
      setupPin,
      setupPattern,
      verifyPin,
      verifyPattern,
      authenticateWithBiometrics,
      disableLock,
      lock,
      unlock,
      isSystemDialogOpen,
      setIsSystemDialogOpen,
      setBiometricEnabled,
      isLoading
    }}>
      {children}
    </AppLockContext.Provider>
  );
};

export const useAppLock = () => {
  const context = useContext(AppLockContext);
  if (context === undefined) {
    throw new Error('useAppLock must be used within an AppLockProvider');
  }
  return context;
};
