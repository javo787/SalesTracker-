import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'extended_report_unlocked_until'; // ISO datetime string

export const ExtendedReportService = {

  // Returns true if unlock is active right now
  async isUnlocked(): Promise<boolean> {
    const val = await AsyncStorage.getItem(KEY);
    if (!val) return false;
    return new Date(val) > new Date();
  },

  // Returns remaining hours of unlock (0 if not unlocked)
  async getRemainingHours(): Promise<number> {
    const val = await AsyncStorage.getItem(KEY);
    if (!val) return 0;
    const diff = new Date(val).getTime() - Date.now();
    if (diff <= 0) return 0;
    return Math.ceil(diff / (1000 * 60 * 60));
  },

  // Call ONLY from Yandex onRewarded callback
  async onRewardedWatched(): Promise<void> {
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await AsyncStorage.setItem(KEY, until);
  },
};
