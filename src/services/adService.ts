import { MobileAds } from 'yandex-mobile-ads';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Тестовые ID от Яндекса
const TEST_BANNER_ID = 'demo-banner-yandex';

const STORAGE_KEYS = {
  LAST_AD_SHOWN: 'last_ad_shown_timestamp',
  INSTALL_DATE: 'app_install_date',
};

export interface DirectAdConfig {
  id: string;
  imageUrl: string;
  targetUrl: string;
  active: boolean;
  priority: number; // Чем выше, тем приоритетнее
}

class AdService {
  private isInitialized = false;

  // Имитация удаленной конфигурации для прямых рекламодателей (например, Alif Bank)
  private directAd: DirectAdConfig | null = {
    id: 'alif-bank-sponsor',
    imageUrl: 'https://alif.tj/assets/images/logo.png', // Пример
    targetUrl: 'https://alif.tj/business-loans',
    active: true,
    priority: 100,
  };

  async init() {
    if (this.isInitialized) return;
    try {
      MobileAds.initialize();

      const installDate = await AsyncStorage.getItem(STORAGE_KEYS.INSTALL_DATE);
      if (!installDate) {
        await AsyncStorage.setItem(STORAGE_KEYS.INSTALL_DATE, Date.now().toString());
      }

      this.isInitialized = true;
      console.log('AdService initialized with Sponsorship support');
    } catch (e) {
      console.error('Failed to init AdService', e);
    }
  }

  async canShowAd(isPremium: boolean = false): Promise<boolean> {
    if (isPremium) return false;

    // Прямая реклама (спонсорство) может игнорировать grace period по желанию бизнеса,
    // но мы оставим общие правила для комфорта пользователя
    const now = Date.now();

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

  async getActiveDirectAd(): Promise<DirectAdConfig | null> {
    // В будущем здесь будет fetch к вашему API / Remote Config
    if (this.directAd && this.directAd.active) {
      return this.directAd;
    }
    return null;
  }

  async recordAdShown() {
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_AD_SHOWN, Date.now().toString());
  }

  getBannerId() {
    return TEST_BANNER_ID;
  }
}

export const adService = new AdService();
