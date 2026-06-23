import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { marketService } from '../services/marketService';
import { NewsFeed } from '../types/ads';
import { notifyImportantNews } from '../utils/notifications';

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

  const checkAndNotifyImportant = async (newsFeed: NewsFeed | null) => {
    if (!newsFeed) return;
    const notifiedKey = 'news_notified_urls';
    const notifiedRaw = await AsyncStorage.getItem(notifiedKey);
    const notified: string[] = notifiedRaw ? JSON.parse(notifiedRaw) : [];

    const important = newsFeed.articles.filter((a: any) =>
      a.relevanceScore >= 9 &&
      ['customs', 'currency'].includes(a.category) &&
      !notified.includes(a.url)
    );

    for (const article of important) {
      await notifyImportantNews(article.title_ru, article.url);
      notified.push(article.url);
    }

    if (important.length > 0) {
      await AsyncStorage.setItem(notifiedKey, JSON.stringify(notified.slice(-30)));
    }
  };

  const fetchNews = useCallback(async (isRefresh = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      if (!isRefresh) {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL) {
            if (mountedRef.current) setNews(data);
            checkAndNotifyImportant(data);
            if (mountedRef.current) setLoading(false);
            return;
          }
        }
      }

      const data = await marketService.getLatestNews();
      if (mountedRef.current) setNews(data);
      checkAndNotifyImportant(data);

      if (data) {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
          data,
          timestamp: Date.now()
        }));
      }
    } catch (e: any) {
      if (mountedRef.current) setError(e.message);
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data } = JSON.parse(cached);
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
