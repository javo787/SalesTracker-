import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, RefreshControl
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getStats, getSalesToday } from '../db/database';

export default function HomeScreen() {
  const [stats, setStats] = useState({ revenue: 0, profit: 0, count: 0 });
  const [todaySales, setTodaySales] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = () => {
    const s = getStats(1);
    setStats(s);
    const sales = getSalesToday();
    setTodaySales(sales);
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Заголовок */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Сегодня</Text>
        <Text style={styles.headerDate}>
          {new Date().toLocaleDateString('ru-RU', {
            day: 'numeric', month: 'long', year: 'numeric'
          })}
        </Text>
      </View>

      {/* Карточки статистики */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: '#1D9E75' }]}>
          <Text style={styles.statLabel}>Выручка</Text>
          <Text style={styles.statValue}>{stats.revenue.toLocaleString()} сом</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#0C447C' }]}>
          <Text style={styles.statLabel}>Прибыль</Text>
          <Text style={styles.statValue}>{stats.profit.toLocaleString()} сом</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: '#854F0B', flex: 1 }]}>
          <Text style={styles.statLabel}>Продаж сегодня</Text>
          <Text style={styles.statValue}>{stats.count} шт</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#3B6D11', flex: 1 }]}>
          <Text style={styles.statLabel}>Средний чек</Text>
          <Text style={styles.statValue}>
            {stats.count > 0
              ? Math.round(stats.revenue / stats.count).toLocaleString()
              : 0} сом
          </Text>
        </View>
      </View>

      {/* Последние продажи */}
      <Text style={styles.sectionTitle}>Последние продажи</Text>

      {todaySales.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Продаж пока нет</Text>
          <Text style={styles.emptyHint}>Нажми «+ Продажа» чтобы добавить</Text>
        </View>
      ) : (
        todaySales.map((sale: any) => (
          <View key={sale.id} style={styles.saleItem}>
            <View style={styles.saleLeft}>
              <Text style={styles.saleName}>{sale.product_name}</Text>
              <Text style={styles.saleTime}>
                {new Date(sale.created_at).toLocaleTimeString('ru-RU', {
                  hour: '2-digit', minute: '2-digit'
                })}
                {sale.quantity > 1 ? `  ×${sale.quantity}` : ''}
              </Text>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: { padding: 20, backgroundColor: '#1D9E75' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  headerDate: { fontSize: 13, color: '#rgba(255,255,255,0.8)', marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 12 },
  statCard: {
    flex: 1, borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  statLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  sectionTitle: {
    fontSize: 16, fontWeight: '600', color: '#333',
    paddingHorizontal: 16, marginTop: 24, marginBottom: 8
  },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 16, color: '#999', marginBottom: 6 },
  emptyHint: { fontSize: 13, color: '#bbb' },
  saleItem: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 8,
    borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
  },
  saleLeft: { flex: 1 },
  saleName: { fontSize: 15, fontWeight: '500', color: '#222' },
  saleTime: { fontSize: 12, color: '#999', marginTop: 3 },
  saleRight: { alignItems: 'flex-end' },
  saleRevenue: { fontSize: 15, fontWeight: '600', color: '#222' },
  saleProfit: { fontSize: 13, color: '#1D9E75', marginTop: 3 },
});