import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  USAGE_DATE: 'smart_match_usage_date',
  USAGE_COUNT: 'smart_match_usage_count',
};

export const FREE_DAILY_LIMIT = 3;

function getTodayString(): string {
  return new Date().toLocaleDateString('sv-SE'); // "YYYY-MM-DD", как в AdFreeService
}

export const SmartMatchQuotaService = {
  async canUseSmartMatch(isPremium: boolean): Promise<boolean> {
    if (isPremium) return true;
    const date = await AsyncStorage.getItem(KEYS.USAGE_DATE);
    if (date !== getTodayString()) return true;
    const count = parseInt((await AsyncStorage.getItem(KEYS.USAGE_COUNT)) ?? '0', 10);
    return count < FREE_DAILY_LIMIT;
  },

  async consumeUsage(): Promise<void> {
    const today = getTodayString();
    const date = await AsyncStorage.getItem(KEYS.USAGE_DATE);
    const count = date === today
      ? parseInt((await AsyncStorage.getItem(KEYS.USAGE_COUNT)) ?? '0', 10)
      : 0;
    await AsyncStorage.multiSet([
      [KEYS.USAGE_DATE, today],
      [KEYS.USAGE_COUNT, String(count + 1)],
    ]);
  },

  async getRemainingToday(isPremium: boolean): Promise<number | null> {
    if (isPremium) return null; // безлимит, UI не показывает счётчик
    const date = await AsyncStorage.getItem(KEYS.USAGE_DATE);
    if (date !== getTodayString()) return FREE_DAILY_LIMIT;
    const count = parseInt((await AsyncStorage.getItem(KEYS.USAGE_COUNT)) ?? '0', 10);
    return Math.max(0, FREE_DAILY_LIMIT - count);
  },
};
