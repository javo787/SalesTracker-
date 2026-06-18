import AsyncStorage from '@react-native-async-storage/async-storage';

const AD_UNIT_IDS = {
  BANNER: 'R-M-19465120-1',
  INTERSTITIAL: 'R-M-19465120-2',
  REWARDED: 'R-M-19465120-3',
};

const STORAGE_KEYS = {
  LAST_AD_SHOWN: 'last_ad_shown_timestamp',
  INSTALL_DATE: 'app_install_date',
};

export interface DirectAdConfig {
  id: string;
  imageUrl: string;
  targetUrl: string;
  active: boolean;
  priority: number;
}

class AdService {
  private isInitialized = false;

  private directAd: DirectAdConfig | null = {
    id: 'alif-bank-sponsor',
    imageUrl: 'https://alif.tj/assets/images/logo.png',
    targetUrl: 'https://alif.tj/business-loans',
    active: true,
    priority: 100,
  };

  async init() {
    if (this.isInitialized) return;
    try {
      const installDate = await AsyncStorage.getItem(STORAGE_KEYS.INSTALL_DATE);
      if (!installDate) {
        await AsyncStorage.setItem(STORAGE_KEYS.INSTALL_DATE, Date.now().toString());
      }
      this.isInitialized = true;
      console.log('AdService initialized');
    } catch (e) {
      console.error('Failed to init AdService', e);
    }
  }

  async canShowAd(isPremium: boolean = false): Promise<boolean> {
    if (isPremium) return false;

    const now = Date.now();
    const installDateStr = await AsyncStorage.getItem(STORAGE_KEYS.INSTALL_DATE);
    const installDate = installDateStr ? parseInt(installDateStr, 10) : now;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    if (now - installDate < sevenDaysMs) return false;

    const lastShownStr = await AsyncStorage.getItem(STORAGE_KEYS.LAST_AD_SHOWN);
    const lastShown = lastShownStr ? parseInt(lastShownStr, 10) : 0;
    const thirtyMinutesMs = 30 * 60 * 1000;

    if (now - lastShown < thirtyMinutesMs) return false;

    return true;
  }

  async getActiveDirectAd(): Promise<DirectAdConfig | null> {
    if (this.directAd && this.directAd.active) {
      return this.directAd;
    }
    return null;
  }

  async recordAdShown() {
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_AD_SHOWN, Date.now().toString());
  }

  getBannerId() { return AD_UNIT_IDS.BANNER; }
  getInterstitialId() { return AD_UNIT_IDS.INTERSTITIAL; }
  getRewardedId() { return AD_UNIT_IDS.REWARDED; }
}

export const adService = new AdService();