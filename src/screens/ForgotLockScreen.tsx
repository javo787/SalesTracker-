import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useAppLock } from '../context/AppLockContext';
import { useAppContext } from '../context/AppContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Google from 'expo-auth-session/providers/google';
import { useNavigation } from '@react-navigation/native';

export default function ForgotLockScreen() {
  const { t } = useTranslation();
  const { resolvedTheme } = useAppContext();
  const isDark = resolvedTheme === 'dark';
  const navigation = useNavigation();
  const { user, loginWithEmail, loginWithGoogle, loginWithTelegram } = useAuth();
  const { verifyRecoveryCode, disableLock, unlock } = useAppLock();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'initial' | 'email_login' | 'recovery_code' | 'reset_pending'>('initial');

  // Email form
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');

  // Recovery code
  const [recoveryInput, setRecoveryCode] = useState('');

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      handleGoogleVerify(id_token);
    }
  }, [response]);

  const handleSuccess = async () => {
    await disableLock();
    unlock();
    Alert.alert(t('common.success'), t('appLock.resetSuccessMsg') || 'Lock removed successfully. You can set a new one in Settings.');
    // Navigation back to settings will be handled by the parent mounting the main stack
    // If we are in the same stack, we can navigate.
    try {
        (navigation as any).navigate('Settings');
    } catch (e) {
        // Fallback if Settings is not in current stack
    }
  };

  const handleEmailVerify = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await loginWithEmail(email, password);
      await handleSuccess();
    } catch (e: any) {
      setError(e.message || t('auth.errorInvalid'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleVerify = async (idToken: string) => {
    setIsLoading(true);
    try {
      await loginWithGoogle(idToken);
      await handleSuccess();
    } catch (e: any) {
      setError(e.message || t('auth.errorNetwork'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleTelegramVerify = async () => {
    setIsLoading(true);
    try {
      await loginWithTelegram();
      await handleSuccess();
    } catch (e: any) {
      setError(e.message || t('auth.errorNetwork'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecoveryVerify = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const isValid = await verifyRecoveryCode(recoveryInput);
      if (isValid) {
        await handleSuccess();
      } else {
        setError(t('appLock.wrongRecoveryCode') || 'Invalid recovery code');
      }
    } catch (e) {
      setError(t('common.error'));
    } finally {
      setIsLoading(false);
    }
  };

  const requestResetGrace = async () => {
    await AsyncStorage.setItem('app_lock_reset_requested_at', String(Date.now()));
    setStep('reset_pending');
  };

  const renderAuthProviderVerify = () => {
    if (user?.authProvider === 'google') {
      return (
        <View style={styles.authBox}>
          <Text style={[styles.desc, { color: isDark ? '#AAA' : '#666' }]}>
            {t('appLock.verifyGoogleDesc') || 'Please sign in with your Google account to reset the lock.'}
          </Text>
          <TouchableOpacity
            style={[styles.btn, styles.googleBtn]}
            onPress={() => promptAsync()}
            disabled={isLoading || !request}
          >
            <Ionicons name="logo-google" size={24} color="#000" />
            <Text style={styles.googleBtnText}>Google</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (user?.authProvider === 'telegram') {
        return (
          <View style={styles.authBox}>
            <Text style={[styles.desc, { color: isDark ? '#AAA' : '#666' }]}>
              {t('appLock.verifyTelegramDesc') || 'Please verify via Telegram to reset the lock.'}
            </Text>
            <TouchableOpacity
              style={[styles.btn, styles.telegramBtn]}
              onPress={handleTelegramVerify}
              disabled={isLoading}
            >
              <Ionicons name="paper-plane" size={24} color="#FFF" />
              <Text style={styles.telegramBtnText}>Telegram</Text>
            </TouchableOpacity>
          </View>
        );
    }

    if (user?.authProvider === 'email') {
        return (
          <View style={styles.form}>
            <Text style={[styles.desc, { color: isDark ? '#AAA' : '#666' }]}>
              {t('appLock.verifyEmailDesc') || 'Please enter your password to reset the lock.'}
            </Text>
            <TextInput
              style={[styles.input, isDark && styles.darkInput]}
              placeholder={t('auth.email')}
              value={email}
              editable={false}
              placeholderTextColor="#888"
            />
            <TextInput
              style={[styles.input, isDark && styles.darkInput]}
              placeholder={t('auth.password')}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholderTextColor="#888"
            />
            {error && <Text style={styles.errorText}>{error}</Text>}
            <TouchableOpacity style={styles.btn} onPress={handleEmailVerify} disabled={isLoading}>
              {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>{t('auth.login')}</Text>}
            </TouchableOpacity>
          </View>
        );
    }

    // Anonymous
    if (step === 'recovery_code') {
        return (
            <View style={styles.form}>
                <Text style={[styles.desc, { color: isDark ? '#AAA' : '#666' }]}>
                    {t('appLock.enterRecoveryDesc') || 'Enter the 8-character recovery code you saved during setup.'}
                </Text>
                <TextInput
                    style={[styles.input, isDark && styles.darkInput, styles.codeInput]}
                    placeholder="XXXX-XXXX"
                    value={recoveryInput}
                    onChangeText={(val) => {
                        let formatted = val.toUpperCase().replace(/[^A-Z0-9]/g, '');
                        if (formatted.length > 4) {
                            formatted = formatted.slice(0, 4) + '-' + formatted.slice(4, 8);
                        }
                        setRecoveryCode(formatted.slice(0, 9));
                    }}
                    placeholderTextColor="#888"
                    autoCapitalize="characters"
                />
                {error && <Text style={styles.errorText}>{error}</Text>}
                <TouchableOpacity style={styles.btn} onPress={handleRecoveryVerify} disabled={isLoading || recoveryInput.length < 9}>
                    {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>{t('common.continue')}</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.linkBtn} onPress={requestResetGrace}>
                    <Text style={styles.linkText}>{t('appLock.noRecoveryCode') || "I don't have this code"}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (step === 'reset_pending') {
        return (
            <View style={styles.center}>
                <Ionicons name="time-outline" size={80} color="#1D9E75" />
                <Text style={[styles.title, { color: isDark ? '#EEE' : '#333' }]}>
                    {t('appLock.resetRequestedTitle') || 'Reset Requested'}
                </Text>
                <Text style={[styles.desc, { color: isDark ? '#AAA' : '#666', textAlign: 'center' }]}>
                    {t('appLock.resetRequestedDesc', { hours: 24 }) || "Your lock will be automatically removed in 24 hours. If this wasn't you, just open the app and enter the correct code to cancel this request."}
                </Text>
                <TouchableOpacity style={styles.btn} onPress={() => navigation.goBack()}>
                    <Text style={styles.btnText}>{t('common.continue')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.center}>
             <Ionicons name="help-circle-outline" size={80} color="#1D9E75" />
             <Text style={[styles.desc, { color: isDark ? '#AAA' : '#666', textAlign: 'center', marginBottom: 30 }]}>
                {t('appLock.forgotChoiceDesc') || "You can reset the lock using your recovery code, or request an automatic reset if you lost it."}
             </Text>
             <TouchableOpacity style={styles.btn} onPress={() => setStep('recovery_code')}>
                <Text style={styles.btnText}>{t('appLock.useRecoveryCode') || 'Use recovery code'}</Text>
             </TouchableOpacity>
             <TouchableOpacity style={[styles.btn, { backgroundColor: '#888', marginTop: 15 }]} onPress={requestResetGrace}>
                <Text style={styles.btnText}>{t('appLock.requestReset') || 'Request reset (24h)'}</Text>
             </TouchableOpacity>
        </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: isDark ? '#121212' : '#F5F5F5' }]}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={24} color={isDark ? '#EEE' : '#333'} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: isDark ? '#EEE' : '#333' }]}>
                {t('appLock.forgotCode') || 'Forgot code?'}
            </Text>
        </View>

        <View style={styles.content}>
            {renderAuthProviderVerify()}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20, marginBottom: 30
  },
  backBtn: { padding: 10, marginLeft: -10 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', marginLeft: 10 },
  content: { padding: 20, flex: 1 },
  authBox: { alignItems: 'center' },
  desc: { fontSize: 16, lineHeight: 24, marginBottom: 30 },
  btn: {
    backgroundColor: '#1D9E75', padding: 16, borderRadius: 12,
    width: '100%', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3
  },
  btnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  googleBtn: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E0E0E0', flexDirection: 'row', gap: 10, justifyContent: 'center' },
  googleBtnText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  telegramBtn: { backgroundColor: '#2AABEE', flexDirection: 'row', gap: 10, justifyContent: 'center' },
  telegramBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  form: { gap: 15 },
  input: {
    backgroundColor: '#FFF', padding: 15, borderRadius: 10,
    borderWidth: 1, borderColor: '#E0E0E0', fontSize: 16
  },
  darkInput: { backgroundColor: '#1E1E1E', borderColor: '#333', color: '#EEE' },
  codeInput: { textAlign: 'center', fontSize: 24, fontWeight: 'bold', letterSpacing: 2 },
  errorText: { color: '#E53935', textAlign: 'center' },
  linkBtn: { padding: 10, marginTop: 10, alignItems: 'center' },
  linkText: { color: '#1D9E75', fontWeight: '500', textDecorationLine: 'underline' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', marginVertical: 20 }
});
