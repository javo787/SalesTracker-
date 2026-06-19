import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { marketService } from '../services/marketService';
import { NewsFeed } from '../types/ads';

export function useNews() {
  const [news, setNews] = useState<NewsFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const CACHE_KEY = 'news_cache';
  const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

  const fetchNews = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      if (!isRefresh) {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL) {
            setNews(data);
            setLoading(false);
            return;
          }
        }
      }

      const data = await marketService.getLatestNews();
      setNews(data);

      if (data) {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
          data,
          timestamp: Date.now()
        }));
      }
    } catch (e: any) {
      setError(e.message);
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data } = JSON.parse(cached);
        setNews(data);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [CACHE_KEY]);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  return { news, loading, refreshing, error, refresh: () => fetchNews(true) };
}
