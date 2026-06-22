import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { marketService } from '../services/marketService';
import { Classified, ClassifiedCategory } from '../types/ads';

export function useClassifieds(city?: string, category?: ClassifiedCategory) {
  const [classifieds, setClassifieds] = useState<Classified[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const CACHE_KEY = `classifieds_cache_${city || 'all'}_${category || 'all'}`;
  const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

  const fetchClassifieds = useCallback(async (isRefresh = false, pageNum = 1) => {
    if (isRefresh) {
      setRefreshing(true);
      setPage(1);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      // Try cache first if not refreshing and page 1
      if (!isRefresh && pageNum === 1) {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL) {
            setClassifieds(data);
            setLoading(false);
            setHasMore(data.length >= 20);
            return;
          }
        }
      }

      const response = await marketService.getClassifieds(city, category, pageNum);
      const data = (response as any).items || response;

      if (pageNum === 1) {
        setClassifieds(data);
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
          data,
          timestamp: Date.now()
        }));
      } else {
        setClassifieds(prev => [...prev, ...data]);
      }

      setHasMore(data.length >= 20);
    } catch (e: any) {
      setError(e.message);
      // If error, try to load from cache even if expired
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data } = JSON.parse(cached);
        setClassifieds(data);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [city, category, CACHE_KEY]);

  useEffect(() => {
    fetchClassifieds();
  }, [fetchClassifieds]);

  const loadMore = useCallback(() => {
    if (!loading && !refreshing && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchClassifieds(false, nextPage);
    }
  }, [loading, refreshing, hasMore, page, fetchClassifieds]);

  return {
    classifieds,
    loading,
    refreshing,
    error,
    refresh: () => fetchClassifieds(true),
    loadMore,
    hasMore
  };
}
