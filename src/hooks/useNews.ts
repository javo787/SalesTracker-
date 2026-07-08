import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { marketService } from '../services/marketService';
import { NewsFeed } from '../types/ads';
import { notifyImportantNews, notifyImportantNewsBatch } from '../utils/notifications';

const CACHE_KEY = 'news_cache';
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

// Модульный (не per-hook-instance) флаг: useNews() монтируется параллельно в
// нескольких местах (NewsPreviewCard на главном экране, NewsScreen,
// useNewsUnread для бейджа) — без этого флага два параллельных вызова могли
// оба прочитать AsyncStorage "notified" ДО того, как один из них его обновит,
// и оба отправить пуш по одной и той же статье. Флаг общий на всё
// приложение, поэтому вынесен из тела useNews() наружу.
let notifyCheckInFlight = false;

async function checkAndNotifyImportant(newsFeed: NewsFeed | null) {
  if (!newsFeed) return;
  if (notifyCheckInFlight) return; // кто-то другой уже проверяет прямо сейчас — не дублируем
  notifyCheckInFlight = true;
  try {
    const notifiedKey = 'news_notified_urls';
    const notifiedRaw = await AsyncStorage.getItem(notifiedKey);
    const notified: string[] = notifiedRaw ? JSON.parse(notifiedRaw) : [];

    const important = newsFeed.articles.filter((a: any) =>
      a.relevanceScore >= 9 &&
      ['customs', 'currency'].includes(a.category) &&
      !notified.includes(a.url)
    );

    if (important.length === 0) return;

    // Одно уведомление на всю пачку новых важных новостей, а не цикл с
    // отдельным пушем на каждую — раньше именно это и раздражало
    // пользователя при накоплении бэклога за несколько дней без захода в
    // приложение.
    if (important.length === 1) {
      await notifyImportantNews(important[0].title_ru, important[0].url);
    } else {
      await notifyImportantNewsBatch(important.length, important[0].url);
    }

    const updated = [...notified, ...important.map((a: any) => a.url)];
    await AsyncStorage.setItem(notifiedKey, JSON.stringify(updated.slice(-30)));
  } finally {
    notifyCheckInFlight = false;
  }
}

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
            checkAndNotifyImportant(data);
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
      checkAndNotifyImportant(data);

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
