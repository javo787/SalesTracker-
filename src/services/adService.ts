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
  _id?: string;
  title?: string;
  subtitle?: string;
  imageUrl: string;
  targetUrl: string;
  active: boolean;
  priority: number;
}

class AdService {
  private isInitialized = false;

  private directAds: DirectAdConfig[] = [];
  private ADS_CACHE_KEY = 'direct_ads_cache';
  private CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

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

  private async refreshDirectAds() {
    const apiUrl = process.env.EXPO_PUBLIC_ADS_API_URL;
    if (!apiUrl) return;

    try {
      const response = await fetch(`${apiUrl}/api/ads`);
      if (response.ok) {
        const ads = await response.json();
        this.directAds = ads;
        await AsyncStorage.setItem(this.ADS_CACHE_KEY, JSON.stringify({
          data: ads,
          timestamp: Date.now()
        }));
      }
    } catch (e) {
      console.warn('Failed to refresh ads from server', e);
      // Fallback to cache
      const cached = await AsyncStorage.getItem(this.ADS_CACHE_KEY);
      if (cached) {
        const { data } = JSON.parse(cached);
        this.directAds = data;
      }
    }
  }

  async getActiveDirectAd(): Promise<DirectAdConfig | null> {
    // Check cache first
    if (this.directAds.length === 0) {
      const cached = await AsyncStorage.getItem(this.ADS_CACHE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        this.directAds = data;

        // Refresh in background if expired
        if (Date.now() - timestamp > this.CACHE_TTL) {
          this.refreshDirectAds();
        }
      } else {
        await this.refreshDirectAds();
      }
    }

    if (this.directAds.length > 0) {
      // Return highest priority active ad
      const activeAds = this.directAds.filter(ad => ad.active);
      return activeAds.length > 0 ? activeAds[0] : null;
    }
    return null;
  }

  async recordAdClick(adId: string) {
    const apiUrl = process.env.EXPO_PUBLIC_ADS_API_URL;
    if (!apiUrl) return;

    try {
      await fetch(`${apiUrl}/api/ads/${adId}/click`, { method: 'POST' });
    } catch (e) {
      console.error('Failed to record ad click', e);
    }
  }

  async recordAdShown() {
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_AD_SHOWN, Date.now().toString());
  }

  getBannerId() { return AD_UNIT_IDS.BANNER; }
  getInterstitialId() { return AD_UNIT_IDS.INTERSTITIAL; }
  getRewardedId() { return AD_UNIT_IDS.REWARDED; }
}

export const adService = new AdService();