import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import YandexBanner from './YandexBanner';
import DirectBanner from './DirectBanner';
import { adService, DirectAdConfig } from '../../services/adService';
import { useAppContext } from '../../context/AppContext';
import { AdFreeService } from '../../services/AdFreeService';

export default function UniversalBanner() {
  const [directAd, setDirectAd] = useState<DirectAdConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdFree, setIsAdFree] = React.useState(false);
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

  // Если есть прямая реклама (спонсор), показываем её. Если нет - показываем Yandex.
  if (directAd) {
    return <DirectBanner config={directAd} />;
  }

  return <YandexBanner />;
}
