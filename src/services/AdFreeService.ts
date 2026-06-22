import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  WATCH_DATE: 'adfree_watch_date',     // "YYYY-MM-DD"
  CHAIN_LENGTH: 'adfree_chain_length', // number as string
  CHAIN_RECORD: 'adfree_chain_record', // number as string
};

function getTodayString(): string {
  return new Date().toLocaleDateString('sv-SE');
}

function getYesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('sv-SE');
}

export const AdFreeService = {

  async isAdFreeToday(): Promise<boolean> {
    const watchDate = await AsyncStorage.getItem(KEYS.WATCH_DATE);
    return watchDate === getYesterdayString();
  },

  async canWatchToday(): Promise<boolean> {
    const watchDate = await AsyncStorage.getItem(KEYS.WATCH_DATE);
    return watchDate !== getTodayString();
  },

  // Call ONLY from Yandex onRewarded callback, never from onAdShown
  async onRewardedWatched(): Promise<void> {
    const today = getTodayString();
    const yesterday = getYesterdayString();
    const watchDate = await AsyncStorage.getItem(KEYS.WATCH_DATE);
    const chainLength = parseInt(
      (await AsyncStorage.getItem(KEYS.CHAIN_LENGTH)) ?? '0', 10
    );
    const chainRecord = parseInt(
      (await AsyncStorage.getItem(KEYS.CHAIN_RECORD)) ?? '0', 10
    );
    const isExtending = watchDate === yesterday || watchDate === today;
    const newChain = isExtending ? chainLength + 1 : 1;
    const newRecord = Math.max(newChain, chainRecord);
    await AsyncStorage.multiSet([
      [KEYS.WATCH_DATE, today],
      [KEYS.CHAIN_LENGTH, String(newChain)],
      [KEYS.CHAIN_RECORD, String(newRecord)],
    ]);
  },

  async getChainLength(): Promise<number> {
    const watchDate = await AsyncStorage.getItem(KEYS.WATCH_DATE);
    const today = getTodayString();
    const yesterday = getYesterdayString();
    if (watchDate !== today && watchDate !== yesterday) return 0;
    return parseInt(
      (await AsyncStorage.getItem(KEYS.CHAIN_LENGTH)) ?? '0', 10
    );
  },

  async getChainRecord(): Promise<number> {
    return parseInt(
      (await AsyncStorage.getItem(KEYS.CHAIN_RECORD)) ?? '0', 10
    );
  },
};
