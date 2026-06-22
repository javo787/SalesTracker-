// Yandex Mobile Ads — block IDs
// Demo IDs are used automatically in development builds (__DEV__ === true)
// Production IDs are used in release builds (EAS Build / production APK)

export const AD_UNIT_IDS = {
  BANNER: __DEV__
    ? 'demo-banner-yandex'
    : 'R-M-19465120-1',

  INTERSTITIAL: __DEV__
    ? 'demo-interstitial-yandex'
    : 'R-M-19465120-2',

  REWARDED: __DEV__
    ? 'demo-rewarded-yandex'
    : 'R-M-19465120-3',
};
