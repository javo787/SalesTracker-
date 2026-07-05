import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Image, KeyboardAvoidingView, Platform
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';

WebBrowser.maybeCompleteAuthSession();

export default function AuthScreen() {
  const { t } = useTranslation();
  const { resolvedTheme, currency } = useAppContext(); const isDark = resolvedTheme === "dark";
  const { loginAsGuest, loginWithEmail, registerWithEmail, loginWithGoogle, loginWithTelegram } = useAuth();

  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [referralCode, setReferralCode] = useState('');

  const handleGoogleAuth = async (idToken: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await loginWithGoogle(idToken);
    } catch (e: any) {
      setError(e.message || t('auth.errorNetwork'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGooglePress = async () => {
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken;
      if (!idToken) throw new Error('No idToken returned from Google Sign-In');
      await handleGoogleAuth(idToken);
    } catch (e: any) {
      setError(e.message || t('auth.errorNetwork'));
    }
  };

  const handleTelegramAuth = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await loginWithTelegram();
    } catch (e: any) {
      setError(e.message || t('auth.errorNetwork'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuth = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (isLogin) {
        await loginWithEmail(email, password);
      } else {
        await registerWithEmail(email, password, name, referralCode);
      }
    } catch (e: any) {
      setError(e.message || t('auth.errorInvalid'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuest = async () => {
    setIsLoading(true);
    try {
      await loginAsGuest();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const themeStyles = isDark ? darkStyles : lightStyles;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, themeStyles.container]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Image source={require('../../assets/icon.png')} style={styles.logo} />
          <Text style={[styles.title, themeStyles.text]}>Torgo</Text>
          <Text style={styles.tagline}>Учёт продаж для базарных торговцев</Text>
        </View>

        <TouchableOpacity
          style={styles.guestBtn}
          onPress={handleGuest}
          disabled={isLoading}
        >
          <Text style={styles.guestBtnText}>{t('auth.guestBtn')}</Text>
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={[styles.divider, themeStyles.divider]} />
          <Text style={styles.dividerText}>{t('auth.orVia')}</Text>
          <View style={[styles.divider, themeStyles.divider]} />
        </View>

        <View style={styles.socialRow}>
          <TouchableOpacity
            style={[styles.socialBtn, styles.googleBtn]}
            onPress={handleGooglePress}
            disabled={isLoading}
          >
            <Ionicons name="logo-google" size={24} color="#000" />
            <Text style={styles.googleBtnText}>Google</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.socialBtn, styles.telegramBtn]}
            onPress={handleTelegramAuth}
            disabled={isLoading}
          >
            <Ionicons name="paper-plane" size={24} color="#fff" />
            <Text style={styles.telegramBtnText}>Telegram</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.dividerRow}>
          <View style={[styles.divider, themeStyles.divider]} />
          <Text style={styles.dividerText}>{t('auth.orEmail')}</Text>
          <View style={[styles.divider, themeStyles.divider]} />
        </View>

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, isLogin && styles.activeTab]}
            onPress={() => setIsLogin(true)}
          >
            <Text style={[styles.tabText, isLogin && styles.activeTabText]}>{t('auth.login')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, !isLogin && styles.activeTab]}
            onPress={() => setIsLogin(false)}
          >
            <Text style={[styles.tabText, !isLogin && styles.activeTabText]}>{t('auth.register')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          {!isLogin && (
            <TextInput
              style={[styles.input, themeStyles.input]}
              placeholder={t('auth.name')}
              placeholderTextColor={isDark ? '#888' : '#aaa'}
              value={name}
              onChangeText={setName}
            />
          )}
          <TextInput
            style={[styles.input, themeStyles.input]}
            placeholder={t('auth.email')}
            placeholderTextColor={isDark ? '#888' : '#aaa'}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={[styles.input, themeStyles.input]}
            placeholder={t('auth.password')}
            placeholderTextColor={isDark ? '#888' : '#aaa'}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          {!isLogin && (
            <TextInput
              style={[styles.input, themeStyles.input]}
              placeholder={t('auth.referralCode')}
              placeholderTextColor={isDark ? '#888' : '#aaa'}
              value={referralCode}
              onChangeText={setReferralCode}
            />
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleAuth}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>{isLogin ? t('auth.login') : t('auth.register')}</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.termsText}>{t('auth.terms')}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const lightStyles = StyleSheet.create({
  container: { backgroundColor: '#F5F5F5' },
  text: { color: '#333' },
  divider: { backgroundColor: '#E0E0E0' },
  input: { backgroundColor: '#fff', borderColor: '#E0E0E0' },
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: '#000' },
  text: { color: '#EEE' },
  divider: { backgroundColor: '#333' },
  input: { backgroundColor: '#1E1E1E', borderColor: '#444', color: '#EEE' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  header: { alignItems: 'center', marginTop: 40, marginBottom: 32 },
  logo: { width: 80, height: 80, borderRadius: 20 },
  title: { fontSize: 28, fontWeight: 'bold', marginTop: 16 },
  tagline: { fontSize: 14, color: '#1D9E75', marginTop: 4, fontWeight: '500' },
  guestBtn: {
    backgroundColor: '#1D9E75',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  guestBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  divider: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 12, color: '#888', fontSize: 12 },
  socialRow: { flexDirection: 'row', gap: 12 },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
  },
  googleBtn: { backgroundColor: '#fff', borderColor: '#E0E0E0' },
  googleBtnText: { color: '#000', fontWeight: '600' },
  telegramBtn: { backgroundColor: '#2AABEE', borderColor: '#2AABEE' },
  telegramBtnText: { color: '#fff', fontWeight: '600' },
  tabRow: { flexDirection: 'row', marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: '#1D9E75' },
  tabText: { color: '#888', fontWeight: '600' },
  activeTabText: { color: '#1D9E75' },
  form: { gap: 12 },
  input: { padding: 14, borderRadius: 12, borderWidth: 1, fontSize: 16 },
  submitBtn: { backgroundColor: '#1D9E75', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  errorText: { color: '#E53935', fontSize: 13, textAlign: 'center' },
  termsText: { marginTop: 32, textAlign: 'center', color: '#999', fontSize: 12, lineHeight: 18 },
});