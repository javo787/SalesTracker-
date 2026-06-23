import AsyncStorage from '@react-native-async-storage/async-storage';
import { TFunction } from 'i18next';
import { getStats, getSalesByPeriod, getProducts, getExpenseStats } from '../db/database';

export async function getSmartTip(t: TFunction, currency: string): Promise<string> {
  const todayDate = new Date();
  const todayStr = todayDate.toISOString().split('T')[0];
  const cacheKey = `smart_tip_${todayStr}`;

  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) return cached;

    const tip = await generateTip(t, currency);
    await AsyncStorage.setItem(cacheKey, tip);
    return tip;
  } catch (e) {
    console.error('Error in getSmartTip:', e);
    return t('home.tips.general1');
  }
}

async function generateTip(t: TFunction, currency: string): Promise<string> {
  // a) STOCK ALERT
  const products = getProducts() as any[];
  const lowStockProducts = products.filter(p => p.min_stock_alert > 0 && p.stock <= p.min_stock_alert);
  if (lowStockProducts.length > 0) {
    if (lowStockProducts.length === 1) {
      return t('home.tips.lowStock', { name: lowStockProducts[0].name, stock: lowStockProducts[0].stock });
    } else {
      return t('home.tips.lowStockMultiple', { count: lowStockProducts.length });
    }
  }

  // b) TREND COMPARISON
  const stats7 = getStats(7);
  const stats1 = getStats(1); // Today

  // Need to compute average of previous 6 days (excluding today)
  // Since getStats(7) includes today, we subtract today
  const prev6DaysRevenue = stats7.revenue - stats1.revenue;
  const avgRevenue = prev6DaysRevenue / 6;

  if (prev6DaysRevenue > 0 && stats1.count > 0) {
    const diff = (stats1.revenue - avgRevenue) / avgRevenue;
    if (diff > 0.15) {
      return t('home.tips.trendUp', {
        amount: stats1.revenue.toLocaleString(),
        currency,
        percent: Math.round(diff * 100)
      });
    } else if (diff < -0.15) {
      return t('home.tips.trendDown');
    }
  } else if (stats1.count === 0) {
    // Check yesterday if today has no sales
    const salesYesterday = getSalesByPeriod(2).filter((s: any) => {
      const d = new Date(s.created_at).toISOString().split('T')[0];
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return d === yesterday.toISOString().split('T')[0];
    });

    if (salesYesterday.length > 0) {
      const yesterdayRevenue = salesYesterday.reduce((sum: number, s: any) => sum + s.sell_price * s.quantity, 0);
      const diff = (yesterdayRevenue - avgRevenue) / avgRevenue;
      if (diff > 0.15) {
        return t('home.tips.trendUp', {
          amount: yesterdayRevenue.toLocaleString(),
          currency,
          percent: Math.round(diff * 100)
        });
      }
    }
  }

  // c) MARGIN INSIGHT
  const last7DaysSales = getSalesByPeriod(7) as any[];
  if (last7DaysSales.length >= 2) {
    const productStats: Record<string, { qty: number, revenue: number, profit: number, name: string }> = {};
    last7DaysSales.forEach(s => {
      if (!productStats[s.product_name]) {
        productStats[s.product_name] = { qty: 0, revenue: 0, profit: 0, name: s.product_name };
      }
      productStats[s.product_name].qty += s.quantity;
      productStats[s.product_name].revenue += s.sell_price * s.quantity;
      productStats[s.product_name].profit += s.profit;
    });

    const productsArr = Object.values(productStats);
    const bestSeller = productsArr.reduce((prev, curr) => (curr.qty > prev.qty) ? curr : prev);
    const bestSellerMargin = bestSeller.revenue > 0 ? bestSeller.profit / bestSeller.revenue : 0;

    if (bestSellerMargin < 0.1) {
      return t('home.tips.marginLow', { name: bestSeller.name, percent: Math.round(bestSellerMargin * 100) });
    }

    const highMarginProduct = productsArr.reduce((prev, curr) => {
      const currMargin = curr.revenue > 0 ? curr.profit / curr.revenue : 0;
      const prevMargin = prev.revenue > 0 ? prev.profit / prev.revenue : 0;
      return (currMargin > prevMargin) ? curr : prev;
    });
    const highMargin = highMarginProduct.revenue > 0 ? highMarginProduct.profit / highMarginProduct.revenue : 0;
    if (highMargin > 0.4) {
       return t('home.tips.marginHigh', { name: highMarginProduct.name, percent: Math.round(highMargin * 100) });
    }
  }

  // d) CONSISTENCY STREAK
  const last30DaysSales = getSalesByPeriod(30) as any[];
  const saleDays = new Set(last30DaysSales.map(s => s.created_at.split(' ')[0]));
  let streak = 0;
  const tempDate = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const toLocalDateStr = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  while (saleDays.has(toLocalDateStr(tempDate))) {
    streak++;
    tempDate.setDate(tempDate.getDate() - 1);
  }

  if (streak >= 3) {
    return t('home.tips.streak', { days: streak });
  }

  // e) EXPENSE RATIO
  const exp7 = getExpenseStats(7);
  if (exp7.total > 0 && stats7.profit > 0) {
    const ratio = exp7.total / stats7.profit;
    if (ratio > 0.5) {
      return t('home.tips.expenseRatio');
    }
  }

  // f) FALLBACK POOL
  const historyKey = 'smart_tip_history';
  const historyRaw = await AsyncStorage.getItem(historyKey);
  const history: number[] = historyRaw ? JSON.parse(historyRaw) : [];

  const availableIndices = Array.from({ length: 18 }, (_, i) => i + 1)
    .filter(i => !history.includes(i));

  const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)] || 1;

  const newHistory = [randomIndex, ...history].slice(0, 4);
  await AsyncStorage.setItem(historyKey, JSON.stringify(newHistory));

  return t(`home.tips.general${randomIndex}`);
}
