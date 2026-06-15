import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'currency_rates_cache_v2';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

export interface RatesResult {
  rates: Record<string, number>; // rates[code] = how many units of `code` equal 1 TJS
  source: 'live' | 'cached' | 'fallback';
  fetchedAt: string; // ISO date
}

// Офлайн-запасные курсы (примерные, обновляй раз в месяц)
// Approximate rates as of late 2024.
export const FALLBACK_RATES: Record<string, number> = {
  TJS: 1,
  USD: 0.0917,
  RUB: 8.42,
  CNY: 0.666,
  UZS: 1175,
  EUR: 0.0845,
  KZT: 43.2,
  KGS: 7.8, // Approximate fallback for KGS
};

export async function getBaseRates(forceRefresh?: boolean): Promise<RatesResult> {
  try {
    if (!forceRefresh) {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.ts < CACHE_TTL) {
          return {
            rates: parsed.rates,
            source: 'cached',
            fetchedAt: new Date(parsed.ts).toISOString(),
          };
        }
      }
    }

    const res = await fetch('https://open.er-api.com/v6/latest/TJS');
    if (!res.ok) throw new Error('Network response was not ok');
    const data = await res.json();
    if (data.result !== 'success') throw new Error('API result not success');

    const rates: Record<string, number> = data.rates;
    rates['TJS'] = 1;

    // Ensure KGS is present, even if not in API response
    if (!rates['KGS']) {
      rates['KGS'] = FALLBACK_RATES.KGS;
    }

    const ts = Date.now();
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ rates, ts }));

    return {
      rates,
      source: 'live',
      fetchedAt: new Date(ts).toISOString(),
    };
  } catch (e) {
    console.error('Failed to fetch currency rates:', e);
    return {
      rates: FALLBACK_RATES,
      source: 'fallback',
      fetchedAt: new Date().toISOString(),
    };
  }
}

export async function getConversionRate(
  fromCode: string,
  toCode: string
): Promise<{ rate: number; source: 'live' | 'cached' | 'fallback' }> {
  if (fromCode === toCode) {
    return { rate: 1, source: 'cached' };
  }

  const { rates, source } = await getBaseRates();
  const rate = (rates[toCode] || 0) / (rates[fromCode] || 1);

  return { rate, source };
}
