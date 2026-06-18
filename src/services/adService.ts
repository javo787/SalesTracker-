import { MobileAds, BannerAd, BannerAdSize } from 'yandex-mobile-ads';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Тестовые ID от Яндекса
const TEST_BANNER_ID = 'demo-banner-yandex';
const TEST_INTERSTITIAL_ID = 'demo-interstitial-yandex';
const TEST_REWARDED_ID = 'demo-rewarded-yandex';

const STORAGE_KEYS = {
  LAST_AD_SHOWN: 'last_ad_shown_timestamp',
  INSTALL_DATE: 'app_install_date',
};

class AdService {
  private isInitialized = false;

  async init() {
    if (this.isInitialized) return;
    try {
      // Инициализация SDK
      MobileAds.initialize();

      // Проверка даты установки
      const installDate = await AsyncStorage.getItem(STORAGE_KEYS.INSTALL_DATE);
      if (!installDate) {
        await AsyncStorage.setItem(STORAGE_KEYS.INSTALL_DATE, Date.now().toString());
      }

      this.isInitialized = true;
      console.log('Yandex Mobile Ads initialized');
    } catch (e) {
      console.error('Failed to init Yandex Ads', e);
    }
  }

  async canShowAd(isPremium: boolean = false): Promise<boolean> {
    if (isPremium) return false;

    const now = Date.now();

    // 1. Проверка 7-дневного периода (Grace Period)
    const installDateStr = await AsyncStorage.getItem(STORAGE_KEYS.INSTALL_DATE);
    const installDate = installDateStr ? parseInt(installDateStr, 10) : now;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    if (now - installDate < sevenDaysMs) {
      return false;
    }

    // 2. Проверка 30-минутного интервала (Frequency Capping)
    const lastShownStr = await AsyncStorage.getItem(STORAGE_KEYS.LAST_AD_SHOWN);
    const lastShown = lastShownStr ? parseInt(lastShownStr, 10) : 0;
    const thirtyMinutesMs = 30 * 60 * 1000;

    if (now - lastShown < thirtyMinutesMs) {
      return false;
    }

    return true;
  }

  async recordAdShown() {
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_AD_SHOWN, Date.now().toString());
  }

  getBannerId() {
    return TEST_BANNER_ID; // В продакшене заменить на реальный ID
  }
}

export const adService = new AdService();
