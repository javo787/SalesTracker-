import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, RefreshControl
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getStats, getSalesByPeriod } from '../db/database';

const PERIODS = [
  { label: 'Сегодня', days: 1 },
  { label: '7 дней', days: 7 },
  { label: '30 дней', days: 30 },
];

export default function ReportScreen() {
  const [period, setPeriod] = useState(1);
  const [stats, setStats] = useState({ revenue: 0, profit: 0, count: 0 });
  const [sales, setSales] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = (days: number) => {
    setStats(getStats(days));
    setSales(getSalesByPeriod(days));
  };

  useFocusEffect(useCallback(() => { loadData(period); }, [period]));

  const onRefresh = () => {
    setRefreshing(true);
    loadData(period);
    setRefreshing(false);
  };

  const margin = stats.revenue > 0
    ? ((stats.profit / stats.revenue) * 100).toFixed(1)
    : '0';

  // Топ товары
  const topProducts = sales.reduce((acc: any, sale: any) => {
    const key = sale.product_name;
    if (!acc[key]) acc[key] = { name: key, profit: 0, count: 0 };
    acc[key].profit += sale.profit;
    acc[key].count += sale.quantity;
    return acc;
  }, {});
  const topList = Object.values(topProducts)
    .sort((a: any, b: any) => b.profit - a.profit)
    .slice(0, 5);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Переключатель периода */}
      <View style={styles.periodRow}>
        {PERIODS.map(p => (
          <TouchableOpacity
            key={p.days}
            style={[styles.periodBtn, period === p.days && styles.periodBtnActive]}
            onPress={() => setPeriod(p.days)}
          >
            <Text style={[styles.periodText, period === p.days && styles.periodTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Главные цифры */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { backgroundColor: '#1D9E75' }]}>
          <Text style={styles.statLabel}>Выручка</Text>
          <Text style={styles.statValue}>{stats.revenue.toLocaleString()}</Text>
          <Text style={styles.statCurrency}>сомони</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#0C447C' }]}>
          <Text style={styles.statLabel}>Прибыль</Text>
          <Text style={styles.statValue}>{stats.profit.toLocaleString()}</Text>
          <Text style={styles.statCurrency}>сомони</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#854F0B' }]}>
          <Text style={styles.statLabel}>Продаж</Text>
          <Text style={styles.statValue}>{stats.count}</Text>
          <Text style={styles.statCurrency}>штук</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#3B6D11' }]}>
          <Text style={styles.statLabel}>Маржа</Text>
          <Text style={styles.statValue}>{margin}%</Text>
          <Text style={styles.statCurrency}>рентабельность</Text>
        </View>
      </View>

      {/* Топ товары */}
      {topList.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Топ товары по прибыли</Text>
          {topList.map((item: any, index) => (
            <View key={item.name} style={styles.topItem}>
              <View style={styles.topRank}>
                <Text style={styles.topRankText}>{index + 1}</Text>
              </View>
              <View style={styles.topInfo}>
                <Text style={styles.topName}>{item.name}</Text>
                <Text style={styles.topCount}>Продано: {item.count} шт</Text>
              </View>
              <Text style={styles.topProfit}>+{item.profit.toLocaleString()} сом</Text>
            </View>
          ))}
        </View>
      )}

      {/* Список продаж */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Все продажи ({sales.length})
        </Text>
        {sales.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Продаж нет за этот период</Text>
          </View>
        ) : (
          sales.map((sale: any) => (
            <View key={sale.id} style={styles.saleItem}>
              <View style={styles.saleLeft}>
                <Text style={styles.saleName}>{sale.product_name}</Text>
                <Text style={styles.saleDate}>
                  {new Date(sale.created_at).toLocaleString('ru-RU', {
                    day: 'numeric', month: 'short',
                    hour: '2-digit', minute: '2-digit'
                  })}
                  {sale.quantity > 1 ? `  ×${sale.quantity}` : ''}
                </Text>
                {sale.note ? (
                  <Text style={styles.saleNote}>{sale.note}</Text>
                ) : null}
              </View>
              <View style={styles.saleRight}>
                <Text style={styles.saleRevenue}>
                  {(sale.sell_price * sale.quantity).toLocaleString()} сом
                </Text>
                <Text style={styles.saleProfit}>
                  +{sale.profit.toLocaleString()} сом
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  periodRow: {
    flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8,
  },
  periodBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#fff', alignItems: 'center',
    borderWidth: 1, borderColor: '#E0E0E0',
  },
  periodBtnActive: { backgroundColor: '#1D9E75', borderColor: '#1D9E75' },
  periodText: { fontSize: 13, fontWeight: '500', color: '#666' },
  periodTextActive: { color: '#fff' },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 10, paddingHorizontal: 16, marginBottom: 8,
  },
  statCard: {
    width: '47%', borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  statLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginBottom: 4 },
  statValue: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  statCurrency: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  section: {
    margin: 16, marginTop: 8, backgroundColor: '#fff',
    borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
  },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 12 },
  topItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#F0F0F0',
  },
  topRank: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#1D9E75', alignItems: 'center',
    justifyContent: 'center', marginRight: 12,
  },
  topRankText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  topInfo: { flex: 1 },
  topName: { fontSize: 14, fontWeight: '500', color: '#222' },
  topCount: { fontSize: 12, color: '#999', marginTop: 2 },
  topProfit: { fontSize: 14, fontWeight: '600', color: '#1D9E75' },
  empty: { alignItems: 'center', padding: 30 },
  emptyText: { fontSize: 14, color: '#999' },
  saleItem: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#F0F0F0',
  },
  saleLeft: { flex: 1, marginRight: 10 },
  saleName: { fontSize: 14, fontWeight: '500', color: '#222' },
  saleDate: { fontSize: 12, color: '#999', marginTop: 2 },
  saleNote: { fontSize: 12, color: '#aaa', marginTop: 2, fontStyle: 'italic' },
  saleRight: { alignItems: 'flex-end' },
  saleRevenue: { fontSize: 14, fontWeight: '600', color: '#222' },
  saleProfit: { fontSize: 13, color: '#1D9E75', marginTop: 2 },
});