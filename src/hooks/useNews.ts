import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { marketService } from '../services/marketService';
import { NewsFeed } from '../types/ads';

const CACHE_KEY = 'news_cache';
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

export function useNews() {
  const [news, setNews] = useState<NewsFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const fetchNews = useCallback(async (isRefresh = false) => {
    if (isFetchingRef.current) {
      console.log('[useNews] already fetching, skip');
      return;
    }
    isFetchingRef.current = true;
    console.log('[useNews] fetchNews start, isRefresh=', isRefresh);

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      if (!isRefresh) {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        console.log('[useNews] cache raw exists:', !!cached);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          const age = Date.now() - timestamp;
          console.log('[useNews] cache age ms:', age, '| TTL:', CACHE_TTL, '| data null?', data === null);
          if (data && age < CACHE_TTL) {
            console.log('[useNews] serving from cache, articles:', data?.articles?.length);
            if (mountedRef.current) setNews(data);
            if (mountedRef.current) setLoading(false);
            return;
          }
          console.log('[useNews] cache invalid (null data or expired) — going to network');
        }
      }

      console.log('[useNews] calling marketService.getLatestNews()');
      const data = await marketService.getLatestNews();
      console.log('[useNews] got data:', data === null ? 'NULL' : `articles=${data?.articles?.length}, date=${data?.date}`);

      if (mountedRef.current) setNews(data);

      if (data) {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
        console.log('[useNews] saved to cache');
      } else {
        console.warn('[useNews] data is null — NOT saving to cache');
      }
    } catch (e: any) {
      console.error('[useNews] error:', e?.message);
      if (mountedRef.current) setError(e.message);
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data } = JSON.parse(cached);
        console.log('[useNews] fallback to cache after error, data null?', data === null);
        if (mountedRef.current) setNews(data);
      }
    } finally {
      isFetchingRef.current = false;
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  return { news, loading, refreshing, error, refresh: () => fetchNews(true) };
}
