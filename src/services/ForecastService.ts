import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const CACHE_KEY = 'ai_forecast_cache';
const BACKEND_URL = (process.env.EXPO_PUBLIC_ADS_API_URL || '') + '/api/ai/forecast';

export interface ForecastPayload {
  language: 'ru' | 'tj' | 'uz';
  currency: string;
  periodDays: number;
  averageDailyRevenue: number;
  salesByDayOfWeek: {
    day: number;
    label: string;
    totalRevenue: number;
    totalProfit: number;
    salesCount: number;
  }[];
  topProducts: {
    name: string;
    revenue: number;
    profit: number;
    margin: number;
    salesCount: number;
  }[];
  weeklyTotals: {
    weekLabel: string;
    revenue: number;
    profit: number;
  }[];
}

interface ForecastCache {
  forecast: string;
  generatedAt: string;
  expiresAt: string; // 24h from generatedAt
  language: string;
}

export const ForecastService = {
  async getCachedForecast(): Promise<ForecastCache | null> {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const cache: ForecastCache = JSON.parse(raw);
      if (new Date(cache.expiresAt) < new Date()) return null;
      return cache;
    } catch (e) {
      console.warn('Error reading forecast cache:', e);
      return null;
    }
  },

  async fetchForecast(payload: ForecastPayload): Promise<string> {
    const token = await SecureStore.getItemAsync('auth_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (response.status === 429 || response.status === 503) {
      const data = await response.json().catch(() => ({}));
      if (data.error === 'rate_limit') {
        throw new Error('rate_limit');
      }
      throw new Error('server_error');
    }

    if (!response.ok) {
      throw new Error('server_error');
    }

    const data = await response.json();
    const cache: ForecastCache = {
      forecast: data.forecast,
      generatedAt: data.generatedAt,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      language: payload.language,
    };

    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    return data.forecast;
  },

  async clearCache(): Promise<void> {
    await AsyncStorage.removeItem(CACHE_KEY);
  },
};
