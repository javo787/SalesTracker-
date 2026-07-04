import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import { AuthResult, User } from '../types/auth';

WebBrowser.maybeCompleteAuthSession();

export const AuthService = {
  async saveAuthData(result: AuthResult) {
    console.log('[AUTH_LOG][service:save] userId=', result.user._id, 'token=', result.token ? `${result.token.slice(0, 8)}...(len:${result.token.length})` : 'none'); // AUTH_LOG
    await SecureStore.setItemAsync('auth_token', result.token);
    await AsyncStorage.setItem('auth_user', JSON.stringify(result.user));
  },

  async loginAsGuest(): Promise<AuthResult> {
    console.log('[AUTH_LOG][service:loginAsGuest] entry'); // AUTH_LOG
    try {
      const result = await api.post<AuthResult>('/auth/guest', {});
      console.log('[AUTH_LOG][service:loginAsGuest] success'); // AUTH_LOG
      await this.saveAuthData(result);
      return result;
    } catch (e: any) {
      console.error('[AUTH_LOG][service:loginAsGuest] error=', e.message, 'falling back to local guest'); // AUTH_LOG
      // Fallback to local guest if offline
      const localGuest: AuthResult = {
        token: 'local_guest_token',
        user: {
          _id: 'local_guest',
          authProvider: 'anonymous',
          name: 'Гость (оффлайн)',
          referralCode: '',
          referralCount: 0,
          createdAt: new Date().toISOString(),
          lastSyncAt: new Date().toISOString(),
        }
      };
      await AsyncStorage.setItem('auth_user', JSON.stringify(localGuest.user));
      return localGuest;
    }
  },

  async loginWithEmail(email: string, password: string): Promise<AuthResult> {
    console.log('[AUTH_LOG][service:loginWithEmail] entry email=', email); // AUTH_LOG
    const result = await api.post<AuthResult>('/auth/email/login', { email, password });
    console.log('[AUTH_LOG][service:loginWithEmail] success'); // AUTH_LOG
    await this.saveAuthData(result);
    return result;
  },

  async registerWithEmail(email: string, password: string, name: string, referralCode?: string): Promise<AuthResult> {
    console.log('[AUTH_LOG][service:registerWithEmail] entry email=', email); // AUTH_LOG
    const result = await api.post<AuthResult>('/auth/email/register', { email, password, name, referralCode });
    console.log('[AUTH_LOG][service:registerWithEmail] success'); // AUTH_LOG
    await this.saveAuthData(result);
    return result;
  },

  async loginWithTelegram(): Promise<AuthResult> {
    const tempToken = Math.random().toString(36).substring(7);
    const botUsername = process.env.EXPO_PUBLIC_TELEGRAM_BOT_USERNAME;
    const url = `https://t.me/${botUsername}?start=${tempToken}`;

    console.log('[AUTH_LOG][service:telegram] bot=', botUsername, 'url=', url); // AUTH_LOG
    await WebBrowser.openBrowserAsync(url);

    return new Promise((resolve, reject) => {
      let attempts = 0;
      let settled = false;
      const interval = setInterval(async () => {
        if (settled) return;
        try {
          console.log('[AUTH_LOG][service:telegram] polling attempt=', attempts); // AUTH_LOG
          const result = await api.get<AuthResult>(`/auth/telegram/check?token=${tempToken}`);
          if (settled) return;
          console.log('[AUTH_LOG][service:telegram] poll success'); // AUTH_LOG
          settled = true;
          clearInterval(interval);
          await this.saveAuthData(result);
          resolve(result);
        } catch (e) {
          attempts++;
          if (attempts > 30 || settled) {
            if (!settled) {
              console.error('[AUTH_LOG][service:telegram] poll timeout (attempts)'); // AUTH_LOG
              settled = true;
              clearInterval(interval);
              reject(new Error('Telegram auth timeout'));
            }
          }
        }
      }, 2000);

      // Safety: clear interval after 70s even if something goes wrong
      setTimeout(() => {
        if (!settled) {
          console.error('[AUTH_LOG][service:telegram] poll timeout (safety)'); // AUTH_LOG
          settled = true;
          clearInterval(interval);
          reject(new Error('Telegram auth timeout'));
        }
      }, 70000);
    });
  },

  async logout() {
    console.log('[AUTH_LOG][service:logout] entry'); // AUTH_LOG
    await SecureStore.deleteItemAsync('auth_token');
    await AsyncStorage.removeItem('auth_user');
  },

  async getStoredToken(): Promise<string | null> {
    return SecureStore.getItemAsync('auth_token');
  },

  async getStoredUser(): Promise<User | null> {
    const userStr = await AsyncStorage.getItem('auth_user');
    return userStr ? JSON.parse(userStr) : null;
  }
};
