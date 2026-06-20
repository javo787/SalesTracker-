import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNews } from './useNews';

const LAST_SEEN_KEY = 'news_last_seen_date';

export function useNewsUnread() {
  const { news } = useNews();
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    checkUnread();
  }, [news?.date]);

  const checkUnread = async () => {
    if (!news?.date) return;
    const lastSeen = await AsyncStorage.getItem(LAST_SEEN_KEY);
    setHasUnread(lastSeen !== news.date);
  };

  const markAsRead = useCallback(async () => {
    if (news?.date) {
      await AsyncStorage.setItem(LAST_SEEN_KEY, news.date);
      setHasUnread(false);
    }
  }, [news?.date]);

  return { hasUnread, markAsRead };
}
