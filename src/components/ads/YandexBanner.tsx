import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { adService } from '../../services/adService';
import { useAppContext } from '../../context/AppContext';

// Условный импорт — используем базовый пакет yandex-mobile-ads
// чтобы избежать импорта @expo/config-plugins в рантайме через @benfurkankilic/expo-yandex-mobile-ads
let BannerView: any = null;
let BannerAdSize: any = null;
try {
  const yandex = require('yandex-mobile-ads');
  BannerView = yandex.BannerView;
  BannerAdSize = yandex.BannerAdSize;
} catch (e) {
  console.warn('Yandex Mobile Ads not available:', e);
}

interface YandexBannerProps {
  size?: string;
}

export default function YandexBanner({ size }: YandexBannerProps) {
  const [shouldShow, setShouldShow] = useState(false);
  const { isPremium } = useAppContext();

  useEffect(() => {
    checkVisibility();
  }, [isPremium]);

  const checkVisibility = async () => {
    const canShow = await adService.canShowAd(isPremium);
    setShouldShow(canShow && BannerView !== null);
  };

  if (!shouldShow || !BannerView) return null;

  // BannerAdSize.sticky(width) или BANNER_320x50
  const adSize = BannerAdSize?.BANNER_320x50 ?? { width: 320, height: 50 };

  return (
    <View style={styles.container}>
      <BannerView
        adUnitId={adService.getBannerId()}
        adSize={size ?? adSize}
        onAdLoaded={() => {
          console.log('Banner loaded');
          adService.recordAdShown();
        }}
        onAdFailedToLoad={(error: any) =>
          console.error('Banner failed to load', error)
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: 'transparent',
  },
});