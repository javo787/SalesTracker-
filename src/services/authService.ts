import * as SecureStore from 'expo-secure-store';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import { AuthResult, User } from '../types/auth';

WebBrowser.maybeCompleteAuthSession();

export const AuthService = {
  async saveAuthData(result: AuthResult) {
    await SecureStore.setItemAsync('auth_token', result.token);
    await AsyncStorage.setItem('auth_user', JSON.stringify(result.user));
  },

  async loginAsGuest(): Promise<AuthResult> {
    try {
      const result = await api.post<AuthResult>('/auth/guest', {});
      await this.saveAuthData(result);
      return result;
    } catch (e) {
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
    const result = await api.post<AuthResult>('/auth/email/login', { email, password });
    await this.saveAuthData(result);
    return result;
  },

  async registerWithEmail(email: string, password: string, name: string, referralCode?: string): Promise<AuthResult> {
    const result = await api.post<AuthResult>('/auth/email/register', { email, password, name, referralCode });
    await this.saveAuthData(result);
    return result;
  },

  async loginWithTelegram(): Promise<AuthResult> {
    const tempToken = Math.random().toString(36).substring(7);
    const botUsername = process.env.EXPO_PUBLIC_TELEGRAM_BOT_USERNAME;
    const url = `https://t.me/${botUsername}?start=${tempToken}`;

    await WebBrowser.openBrowserAsync(url);

    return new Promise((resolve, reject) => {
      let attempts = 0;
      let settled = false;
      const interval = setInterval(async () => {
        if (settled) return;
        try {
          const result = await api.get<AuthResult>(`/auth/telegram/check?token=${tempToken}`);
          if (settled) return;
          settled = true;
          clearInterval(interval);
          await this.saveAuthData(result);
          resolve(result);
        } catch (e) {
          attempts++;
          if (attempts > 30 || settled) {
            if (!settled) {
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
          settled = true;
          clearInterval(interval);
          reject(new Error('Telegram auth timeout'));
        }
      }, 70000);
    });
  },

  async logout() {
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
