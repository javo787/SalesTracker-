import { useState, useRef, useCallback, useEffect } from 'react';
import { searchProductsForAutocomplete } from '../db/database';
import { AutocompleteResult } from '../types/product';

export function useProductAutocomplete() {
  const [results, setResults] = useState<AutocompleteResult[]>([]);
  const cache = useRef<{ [query: string]: AutocompleteResult[] }>({});
  const cacheKeys = useRef<string[]>([]);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_CACHE_SIZE = 50;

  const evictCache = () => {
    while (cacheKeys.current.length > MAX_CACHE_SIZE) {
      const oldest = cacheKeys.current.shift();
      if (oldest) delete cache.current[oldest];
    }
  };

  const getTopProducts = useCallback(() => {
    if (cache.current['__top5__']) {
      setResults(cache.current['__top5__']);
      return;
    }
    const data = searchProductsForAutocomplete('') as AutocompleteResult[];
    cache.current['__top5__'] = data;
    cacheKeys.current.push('__top5__');
    setResults(data);
  }, []);

  const search = useCallback((query: string) => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (!query.trim()) {
      getTopProducts();
      return;
    }

    debounceTimer.current = setTimeout(() => {
      if (cache.current[query]) {
        setResults(cache.current[query]);
        return;
      }

      const data = searchProductsForAutocomplete(query) as AutocompleteResult[];
      cache.current[query] = data;
      cacheKeys.current.push(query);
      evictCache();
      setResults(data);
    }, 200);
  }, [getTopProducts]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  return {
    results,
    search,
    getTopProducts
  };
}
