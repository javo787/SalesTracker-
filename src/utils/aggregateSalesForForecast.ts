import db from '../db/database';
import { ForecastPayload } from '../services/ForecastService';

export async function aggregateSalesForForecast(
  language: 'ru' | 'tj' | 'uz',
  currencySymbol: string
): Promise<ForecastPayload> {
  const pad = (n: number) => String(n).padStart(2, '0');
  const toLocalDateStr = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const sixtyDaysAgoStr = toLocalDateStr(sixtyDaysAgo);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = toLocalDateStr(thirtyDaysAgo);

  const twentyEightDaysAgo = new Date();
  twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);
  const twentyEightDaysAgoStr = toLocalDateStr(twentyEightDaysAgo);

  // 1. salesByDayOfWeek (last 60 days)
  const salesByDayRaw = db.getAllSync(`
    SELECT
      strftime('%w', created_at) as dayOfWeek,
      SUM(sell_price * quantity) as totalRevenue,
      SUM(profit) as totalProfit,
      COUNT(*) as salesCount
    FROM sales
    WHERE date(created_at) >= ?
    GROUP BY dayOfWeek
  `, [sixtyDaysAgoStr]) as any[];

  const dayLabels: Record<string, string[]> = {
    ru: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
    tj: ['Яш', 'Дш', 'Сш', 'Чш', 'Пш', 'Ҷм', 'Шб'],
    uz: ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'],
  };

  const labels = dayLabels[language] || dayLabels.ru;

  // Map SQLite dayOfWeek (0=Sun...6=Sat) to [Monday...Sunday]
  // Target index: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
  const salesByDayOfWeek = [1, 2, 3, 4, 5, 6, 0].map((sqliteDay) => {
    const found = salesByDayRaw.find((d) => parseInt(d.dayOfWeek) === sqliteDay);
    return {
      day: sqliteDay,
      label: labels[sqliteDay],
      totalRevenue: found?.totalRevenue || 0,
      totalProfit: found?.totalProfit || 0,
      salesCount: found?.salesCount || 0,
    };
  });

  // 2. topProducts (last 60 days, top 5 by revenue)
  const topProducts = db.getAllSync(`
    SELECT
      product_name as name,
      SUM(sell_price * quantity) as revenue,
      SUM(profit) as profit,
      COUNT(*) as salesCount,
      ROUND(SUM(profit) * 100.0 / NULLIF(SUM(sell_price * quantity), 0), 1) as margin
    FROM sales
    WHERE date(created_at) >= ?
    GROUP BY product_name
    ORDER BY revenue DESC
    LIMIT 5
  `, [sixtyDaysAgoStr]) as any[];

  // 3. weeklyTotals (last 4 weeks)
  const weeklyTotals = db.getAllSync(`
    SELECT
      strftime('%Y-W%W', created_at) as weekLabel,
      SUM(sell_price * quantity) as revenue,
      SUM(profit) as profit
    FROM sales
    WHERE date(created_at) >= ?
    GROUP BY weekLabel
    ORDER BY weekLabel ASC
  `, [twentyEightDaysAgoStr]) as any[];

  // 4. averageDailyRevenue (last 30 days)
  const avgResult = db.getFirstSync(`
    SELECT ROUND(SUM(sell_price * quantity) / 30.0, 0) as avg
    FROM sales
    WHERE date(created_at) >= ?
  `, [thirtyDaysAgoStr]) as any;

  const averageDailyRevenue = avgResult?.avg || 0;

  // Check if we have any data
  const totalSalesCount = salesByDayOfWeek.reduce((acc, d) => acc + d.salesCount, 0);
  if (totalSalesCount === 0) {
    throw new Error('no_data');
  }

  return {
    language,
    currency: currencySymbol,
    periodDays: 60,
    averageDailyRevenue,
    salesByDayOfWeek,
    topProducts,
    weeklyTotals,
  };
}
