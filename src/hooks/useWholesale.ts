import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { marketService } from '../services/marketService';
import { WholesaleAd } from '../types/ads';

export function useWholesale(category?: string, city?: string) {
  const [ads, setAds] = useState<WholesaleAd[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const CACHE_KEY = `wholesale_cache_${category || 'all'}_${city || 'all'}`;
  const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const fetchAds = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      if (!isRefresh) {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL) {
            if (mountedRef.current) setAds(data);
            if (mountedRef.current) setLoading(false);
            return;
          }
        }
      }

      const data = await marketService.getWholesaleAds(category, city);
      if (mountedRef.current) setAds(data);

      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (e: any) {
      if (mountedRef.current) setError(e.message);
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data } = JSON.parse(cached);
        if (mountedRef.current) setAds(data);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [category, city, CACHE_KEY]);

  useEffect(() => {
    fetchAds();
  }, [fetchAds]);

  return { ads, loading, refreshing, error, refresh: () => fetchAds(true) };
}
