import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'export_summary_cache';
const BACKEND_URL = (process.env.EXPO_PUBLIC_API_URL || '') + '/api/ai/summary';

export interface SummaryPayload {
  language: 'ru' | 'tj' | 'uz';
  currency: string;
  periodLabel: string;
  totalRevenue: number;
  totalProfit: number;
  totalExpenses: number;
  netProfit: number;
  averageMargin: number;
  totalTransactions: number;
  topProducts: {
    name: string;
    revenue: number;
    profit: number;
    margin: number;
    salesCount: number;
  }[];
  salesByDayOfWeek: {
    label: string;
    totalRevenue: number;
  }[];
  bestDay: string;
  worstDay: string;
  revenueGrowthPercent: number | null;
}

interface SummaryCache {
  summary: string;
  periodLabel: string;
  generatedAt: string;
  expiresAt: string; // 6 hours
  language: string;
}

export const ExportSummaryService = {
  async getCachedSummary(
    periodLabel: string,
    language: string
  ): Promise<string | null> {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const cache: SummaryCache = JSON.parse(raw);
      if (cache.periodLabel !== periodLabel) return null;
      if (cache.language !== language) return null;
      if (new Date(cache.expiresAt) < new Date()) return null;
      return cache.summary;
    } catch (e) {
      console.warn('Error reading summary cache:', e);
      return null;
    }
  },

  async fetchSummary(payload: SummaryPayload): Promise<string> {
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.status === 503) {
      throw new Error('all_providers_failed');
    }

    if (!response.ok) {
      throw new Error('server_error');
    }

    const data = await response.json();
    const cache: SummaryCache = {
      summary: data.summary,
      periodLabel: payload.periodLabel,
      generatedAt: data.generatedAt,
      expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      language: payload.language,
    };

    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    return data.summary;
  },

  async clearCache(): Promise<void> {
    await AsyncStorage.removeItem(CACHE_KEY);
  },
};
