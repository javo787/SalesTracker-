import { AD_UNIT_IDS } from '../constants/ads';

let InterstitialAd: any = null;
try {
  const yandex = require('yandex-mobile-ads');
  InterstitialAd = yandex.InterstitialAd;
} catch (e) {
  console.warn('Yandex InterstitialAd not available:', e);
}

/**
 * Shows an interstitial ad with "silent failure" fallback.
 * Catch error silently, do not show alert to user,
 * do not block navigation or action that triggered it.
 */
export async function showInterstitialSilently(): Promise<void> {
  if (!InterstitialAd) {
    return;
  }

  return new Promise((resolve) => {
    try {
      const adUnitId = AD_UNIT_IDS.INTERSTITIAL;
      const interstitial = InterstitialAd.createForAdUnitId(adUnitId);

      let didResolve = false;

      const safeResolve = () => {
        if (!didResolve) {
          didResolve = true;
          resolve();
        }
      };

      interstitial.onAdLoaded(() => {
        interstitial.show();
      });

      interstitial.onAdFailedToLoad((error: any) => {
        console.error('Interstitial failed to load (silent):', error);
        safeResolve();
      });

      interstitial.onAdDismissed(() => {
        safeResolve();
      });

      interstitial.onAdShown(() => {
        // We resolve when dismissed, but we could resolve here if we wanted non-blocking
      });

      interstitial.load();

      // Fallback timeout in case Yandex callbacks don't fire
      setTimeout(safeResolve, 5000);
    } catch (e) {
      console.error('Error in showInterstitialSilently:', e);
      resolve();
    }
  });
}
