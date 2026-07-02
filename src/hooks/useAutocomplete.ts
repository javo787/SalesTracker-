import { useState, useRef, useCallback, useEffect } from 'react';
import { Keyboard } from 'react-native';

export function useAutocomplete<T>(
  fetchFn: (query: string) => T[],
  fetchTop: () => T[],
  delay: number = 200,
) {
  const [results, setResults] = useState<T[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const cache = useRef<Record<string, T[]>>({});
  const cacheKeys = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const evict = () => {
    while (cacheKeys.current.length > 50) {
      const oldest = cacheKeys.current.shift();
      if (oldest) delete cache.current[oldest];
    }
  };

  const setCached = (key: string, data: T[]) => {
    cache.current[key] = data;
    if (!cacheKeys.current.includes(key)) cacheKeys.current.push(key);
    evict();
  };

  const search = useCallback((query: string) => {
    if (timer.current) clearTimeout(timer.current);
    const trimmed = query.trim();

    if (!trimmed) {
      const key = '__top__';
      if (cache.current[key]) { setResults(cache.current[key]); setIsOpen(true); return; }
      const data = fetchTop();
      setCached(key, data);
      setResults(data);
      setIsOpen(true);
      return;
    }

    timer.current = setTimeout(() => {
      if (cache.current[trimmed]) {
        setResults(cache.current[trimmed]);
        setIsOpen(cache.current[trimmed].length > 0);
        return;
      }
      const data = fetchFn(trimmed);
      setCached(trimmed, data);
      setResults(data);
      setIsOpen(data.length > 0);
    }, delay);
  }, [fetchFn, fetchTop, delay]);

  const onFocus = useCallback((currentValue: string) => {
    if (currentValue.trim()) {
      search(currentValue);
    }
  }, [search]);

  // KEY LOGIC: 150ms delay lets onPress fire before dropdown disappears
  const onBlur = useCallback(() => {
    timer.current = setTimeout(() => setIsOpen(false), 150);
  }, []);

  const select = useCallback((item: T, onSelect: (item: T) => void) => {
    if (timer.current) clearTimeout(timer.current);
    onSelect(item);
    setIsOpen(false);
  }, []);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setIsOpen(false);
  }, []);

  const invalidateCache = useCallback(() => {
    cache.current = {};
    cacheKeys.current = [];
  }, []);

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      if (timer.current) clearTimeout(timer.current);
      setIsOpen(false);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { results, isOpen, search, onFocus, onBlur, select, dismiss, invalidateCache };
}
