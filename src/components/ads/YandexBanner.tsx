import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { adService } from '../../services/adService';
import { useAppContext } from '../../context/AppContext';

// Условный импорт — пакет может быть недоступен в dev без нативной сборки
let BannerAd: any = null;
let BannerAdSize: any = null;
try {
  const yandex = require('@benfurkankilic/expo-yandex-mobile-ads');
  BannerAd = yandex.BannerAd;
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
    setShouldShow(canShow && BannerAd !== null);
  };

  if (!shouldShow || !BannerAd) return null;

  const adSize = BannerAdSize?.BANNER_320x50 ?? '320x50';

  return (
    <View style={styles.container}>
      <BannerAd
        adUnitId={adService.getBannerId()}
        size={size ?? adSize}
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