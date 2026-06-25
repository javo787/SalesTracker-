import { AD_UNIT_IDS } from '../constants/ads';

let InterstitialAdLoader: any = null;
try {
  const yandex = require('yandex-mobile-ads');
  InterstitialAdLoader = yandex.InterstitialAdLoader;
} catch (e) {
  console.warn('Yandex InterstitialAdLoader not available:', e);
}

/**
 * Shows an interstitial ad with "silent failure" fallback.
 * Catch error silently, do not show alert to user,
 * do not block navigation or action that triggered it.
 */
export async function showInterstitialSilently(): Promise<void> {
  if (!InterstitialAdLoader) {
    return;
  }

  return new Promise(async (resolve) => {
    let didResolve = false;
    const safeResolve = () => {
      if (!didResolve) {
        didResolve = true;
        resolve();
      }
    };

    // Fallback timeout in case Yandex callbacks don't fire
    const timeout = setTimeout(safeResolve, 5000);

    try {
      const adUnitId = AD_UNIT_IDS.INTERSTITIAL;
      const loader = await InterstitialAdLoader.create();
      const ad = await loader.loadAd({ adUnitId });

      ad.onAdDismissed = () => {
        clearTimeout(timeout);
        ad.delete();
        safeResolve();
      };

      ad.onAdFailedToShow = (error: any) => {
        console.error('Interstitial failed to show (silent):', error);
        clearTimeout(timeout);
        ad.delete();
        safeResolve();
      };

      await ad.show();
    } catch (e) {
      console.error('Error in showInterstitialSilently:', e);
      clearTimeout(timeout);
      safeResolve();
    }
  });
}
