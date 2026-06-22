import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import YandexBanner from './YandexBanner';
import DirectBanner from './DirectBanner';
import { adService, DirectAdConfig } from '../../services/adService';
import { useAppContext } from '../../context/AppContext';
import { AdFreeService } from '../../services/AdFreeService';
import { AD_UNIT_IDS } from '../../constants/ads';

interface UniversalBannerProps {
  size?: string;
}

export default function UniversalBanner({ size }: UniversalBannerProps) {
  const [directAd, setDirectAd] = useState<DirectAdConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdFree, setIsAdFree] = React.useState(false);
  const [yandexFailed, setYandexFailed] = useState(false);
  const { isPremium } = useAppContext();

  useEffect(() => {
    AdFreeService.isAdFreeToday().then(setIsAdFree);
    loadAds();
  }, [isPremium]);

  const loadAds = async () => {
    try {
      const activeDirect = await adService.getActiveDirectAd();
      setDirectAd(activeDirect);
    } catch (e) {
      console.error('Failed to load universal banner', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading || isPremium || isAdFree) return null;

  // Banner fallback chain:
  // 1. Yandex banner loads successfully -> show it
  // 2. Yandex returns onAdFailedToLoad -> if DirectBanner data exists, show it
  // 3. Otherwise -> null

  if (!yandexFailed) {
    return <YandexBanner size={size} onFailed={() => setYandexFailed(true)} />;
  }

  if (directAd) {
    return <DirectBanner config={directAd} />;
  }

  return null;
}
