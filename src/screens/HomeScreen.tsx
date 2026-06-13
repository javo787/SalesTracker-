import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, RefreshControl, Alert, ActivityIndicator
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { getStats, getSalesToday, deleteSale } from '../db/database';

export default function HomeScreen() {
  const [stats, setStats] = useState({ revenue: 0, profit: 0, count: 0 });
  const [todaySales, setTodaySales] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [aiTip, setAiTip] = useState<string | null>(null);
  const [loadingTip, setLoadingTip] = useState(false);

  const loadData = () => {
    const s = getStats(1);
    setStats(s);
    const sales = getSalesToday();
    setTodaySales(sales);
  };

  useFocusEffect(useCallback(() => {
    loadData();
    loadAiTip();
  }, []));

  const loadAiTip = async () => {
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `ai_tip_${today}`;

    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        setAiTip(cached);
        return;
      }

      // Если нет в кеше, генерируем новый
      generateAiTip(cacheKey);
    } catch (e) {
      console.warn('AI Tip load error', e);
    }
  };

  const generateAiTip = async (cacheKey: string) => {
    setLoadingTip(true);
    try {
      const weekStats = getStats(7);
      const lang = await AsyncStorage.getItem('app_language') || 'ru';
      const langName = lang === 'tg' ? 'таджикский' : lang === 'uz' ? 'узбекский' : 'русский';

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.EXPO_PUBLIC_GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Ты опытный бизнес-консультант для малых торговцев в Центральной Азии.
Дай один короткий (2-3 предложения), практичный и вдохновляющий совет на основе статистики за неделю:
Выручка: ${weekStats.revenue} сом, Прибыль: ${weekStats.profit} сом, Продаж: ${weekStats.count}.
Если данных мало, дай общий совет по торговле на базаре.
Отвечай на языке: ${langName}.`
              }]
            }]
          })
        }
      );
      const data = await response.json();
      const tip = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      if (tip) {
        setAiTip(tip);
        await AsyncStorage.setItem(cacheKey, tip);
      }
    } catch (e) {
      console.warn('AI Tip generation error', e);
    } finally {
      setLoadingTip(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
    setRefreshing(false);
  };

  const handleDeleteSale = (sale: any) => {
    Alert.alert(
      'Удалить продажу?',
      `Вы уверены, что хотите удалить продажу "${sale.product_name}"? Остаток товара будет возвращен.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            deleteSale(sale.id);
            loadData();
          }
        }
      ]
    );
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
      {aiTip || loadingTip ? (
        <View style={styles.aiCard}>
          <View style={styles.aiHeader}>
            <Text style={styles.aiEmoji}>💡</Text>
            <Text style={styles.aiTitle}>Совет дня от AI</Text>
          </View>
          {loadingTip ? (
            <ActivityIndicator size="small" color="#1D9E75" style={{ marginVertical: 10 }} />
          ) : (
            <Text style={styles.aiText}>{aiTip}</Text>
          )}
        </View>
      ) : null}

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
          <TouchableOpacity
            key={sale.id}
            style={styles.saleItem}
            onLongPress={() => handleDeleteSale(sale)}
            delayLongPress={500}
          >
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
          </TouchableOpacity>
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
  aiCard: {
    margin: 16, marginBottom: 4, padding: 16,
    backgroundColor: '#fff', borderRadius: 12,
    borderLeftWidth: 4, borderLeftColor: '#1D9E75',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 2, elevation: 2,
  },
  aiHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  aiEmoji: { fontSize: 18, marginRight: 8 },
  aiTitle: { fontSize: 14, fontWeight: 'bold', color: '#1D9E75' },
  aiText: { fontSize: 14, color: '#444', lineHeight: 20, fontStyle: 'italic' },
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