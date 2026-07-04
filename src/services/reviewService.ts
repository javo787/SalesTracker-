import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';

const STORAGE_KEYS = {
  SALES_COUNT: 'review_trigger_sales_count',
  LAST_REVIEW_REQUESTED: 'last_review_requested_timestamp',
};

const SALES_THRESHOLD = 5; // Request after 5 successful sales
const REVIEW_COOLDOWN = 30 * 24 * 60 * 60 * 1000; // 30 days cooldown between requests

class ReviewService {
  /**
   * Increments the operation count and potentially triggers a review request.
   */
  async incrementSalesAndCheck() {
    try {
      const countStr = await AsyncStorage.getItem(STORAGE_KEYS.SALES_COUNT);
      const count = (parseInt(countStr || '0', 10)) + 1;
      await AsyncStorage.setItem(STORAGE_KEYS.SALES_COUNT, count.toString());

      if (count >= SALES_THRESHOLD) {
        await this.requestReviewIfNeeded();
      }
    } catch (e) {
      console.warn('[ReviewService] Error incrementing sales count', e);
    }
  }

  /**
   * Triggers the In-App Review UI if thresholds and cooldowns are met.
   */
  async requestReviewIfNeeded() {
    try {
      const isAvailable = await StoreReview.isAvailableAsync();

      if (!isAvailable) {
        console.log('[ReviewService] Review not available');
        return;
      }

      const lastRequestedStr = await AsyncStorage.getItem(STORAGE_KEYS.LAST_REVIEW_REQUESTED);
      const lastRequested = lastRequestedStr ? parseInt(lastRequestedStr, 10) : 0;
      const now = Date.now();

      if (now - lastRequested > REVIEW_COOLDOWN) {
        console.log('[ReviewService] Requesting in-app review');
        await StoreReview.requestReview();
        await AsyncStorage.setItem(STORAGE_KEYS.LAST_REVIEW_REQUESTED, now.toString());
        // Reset counter after request
        await AsyncStorage.setItem(STORAGE_KEYS.SALES_COUNT, '0');
      } else {
        console.log('[ReviewService] Review cooldown active');
      }
    } catch (e) {
      console.warn('[ReviewService] Failed to request review', e);
    }
  }

  /**
   * Manual trigger for "Rate App" in settings.
   */
  async openStoreListing() {
    try {
      const androidPackageName = 'com.torgo.app';
      const itunesItemId = ''; // Set this to real App Store ID when publishing to iOS

      if (Platform.OS === 'ios') {
        // First try the native review dialog
        if (await StoreReview.isAvailableAsync()) {
          await StoreReview.requestReview();
        } else {
          // Fallback to App Store page
          if (itunesItemId) {
            Linking.openURL(`https://apps.apple.com/app/id${itunesItemId}?action=write-review`);
          }
        }
      } else {
        // Android: open Play Store
        Linking.openURL(`market://details?id=${androidPackageName}`);
      }
    } catch (e) {
      console.warn('[ReviewService] Manual open store failed', e);
    }
  }
}

export const reviewService = new ReviewService();
