import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { BannerAd, BannerAdSize } from 'yandex-mobile-ads';
import { adService } from '../../services/adService';
import { useAppContext } from '../../context/AppContext';

interface YandexBannerProps {
  size?: any; // BannerAdSize
}

export default function YandexBanner({ size = BannerAdSize.STICKY_728x90 }: YandexBannerProps) {
  const [shouldShow, setShouldShow] = useState(false);
  const { isPremium } = useAppContext();

  useEffect(() => {
    checkVisibility();
  }, [isPremium]);

  const checkVisibility = async () => {
    const canShow = await adService.canShowAd(isPremium);
    setShouldShow(canShow);
  };

  if (!shouldShow) return null;

  return (
    <View style={styles.container}>
      <BannerAd
        adUnitId={adService.getBannerId()}
        size={size}
        onAdLoaded={() => {
          console.log('Banner loaded');
          adService.recordAdShown();
        }}
        onAdFailedToLoad={(error: any) => console.error('Banner failed to load', error)}
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
