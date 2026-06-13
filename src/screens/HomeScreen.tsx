import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, RefreshControl, Alert, ActivityIndicator
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getStats, getSalesToday, deleteSale } from '../db/database';
import { useAppContext } from '../context/AppContext';

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const { theme, currency } = useAppContext();
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
    if (!process.env.EXPO_PUBLIC_GEMINI_KEY) return;

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
Выручка: ${weekStats.revenue} ${currency.symbol}, Прибыль: ${weekStats.profit} ${currency.symbol}, Продаж: ${weekStats.count}.
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
      t('reports.deleteSaleTitle'),
      t('reports.deleteSaleMsg', { name: sale.product_name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            deleteSale(sale.id);
            loadData();
          }
        }
      ]
    );
  };

  const isDark = theme === 'dark';
  const themeStyles = isDark ? darkStyles : lightStyles;

  return (
    <ScrollView
      style={[styles.container, themeStyles.container]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Заголовок */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('reports.today')}</Text>
        <Text style={styles.headerDate}>
          {new Date().toLocaleDateString(i18n.language === 'tg' ? 'tg-TJ' : i18n.language === 'uz' ? 'uz-UZ' : 'ru-RU', {
            day: 'numeric', month: 'long', year: 'numeric'
          })}
        </Text>
      </View>

      {/* Карточки статистики */}
      {aiTip || loadingTip ? (
        <View style={[styles.aiCard, themeStyles.card]}>
          <View style={styles.aiHeader}>
            <Text style={styles.aiEmoji}>💡</Text>
            <Text style={styles.aiTitle}>{t('home.aiTipTitle')}</Text>
          </View>
          {loadingTip ? (
            <ActivityIndicator size="small" color="#1D9E75" style={{ marginVertical: 10 }} />
          ) : (
            <Text style={[styles.aiText, themeStyles.text]}>{aiTip}</Text>
          )}
        </View>
      ) : null}

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: '#1D9E75' }]}>
          <Text style={styles.statLabel}>{t('common.revenue')}</Text>
          <Text style={styles.statValue}>{stats.revenue.toLocaleString()} {currency.symbol}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#0C447C' }]}>
          <Text style={styles.statLabel}>{t('common.profit')}</Text>
          <Text style={styles.statValue}>{stats.profit.toLocaleString()} {currency.symbol}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: '#854F0B', flex: 1 }]}>
          <Text style={styles.statLabel}>{t('home.salesCount')}</Text>
          <Text style={styles.statValue}>{stats.count} {t('reports.pcs')}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#3B6D11', flex: 1 }]}>
          <Text style={styles.statLabel}>{t('home.avgCheck')}</Text>
          <Text style={styles.statValue}>
            {stats.count > 0
              ? Math.round(stats.revenue / stats.count).toLocaleString()
              : 0} {currency.symbol}
          </Text>
        </View>
      </View>

      {/* Последние продажи */}
      <Text style={[styles.sectionTitle, themeStyles.text]}>{t('home.recentSales')}</Text>

      {todaySales.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('home.noSales')}</Text>
          <Text style={styles.emptyHint}>{t('home.noSalesHint')}</Text>
        </View>
      ) : (
        todaySales.map((sale: any) => (
          <TouchableOpacity
            key={sale.id}
            style={[styles.saleItem, themeStyles.card]}
            onLongPress={() => handleDeleteSale(sale)}
            delayLongPress={500}
          >
            <View style={styles.saleLeft}>
              <Text style={[styles.saleName, themeStyles.text]}>{sale.product_name}</Text>
              <Text style={styles.saleTime}>
                {new Date(sale.created_at).toLocaleTimeString(i18n.language === 'tg' ? 'tg-TJ' : i18n.language === 'uz' ? 'uz-UZ' : 'ru-RU', {
                  hour: '2-digit', minute: '2-digit'
                })}
                {sale.quantity > 1 ? `  ×${sale.quantity}` : ''}
              </Text>
            </View>
            <View style={styles.saleRight}>
              <Text style={[styles.saleRevenue, themeStyles.text]}>
                {(sale.sell_price * sale.quantity).toLocaleString()} {currency.symbol}
              </Text>
              <Text style={styles.saleProfit}>
                +{sale.profit.toLocaleString()} {currency.symbol}
              </Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const lightStyles = StyleSheet.create({
  container: { backgroundColor: '#F5F5F5' },
  card: { backgroundColor: '#fff' },
  text: { color: '#333' },
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: '#000' },
  card: { backgroundColor: '#1E1E1E' },
  text: { color: '#EEE' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 20, backgroundColor: '#1D9E75' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  headerDate: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  aiCard: {
    margin: 16, marginBottom: 4, padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4, borderLeftColor: '#1D9E75',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 2, elevation: 2,
  },
  aiHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  aiEmoji: { fontSize: 18, marginRight: 8 },
  aiTitle: { fontSize: 14, fontWeight: 'bold', color: '#1D9E75' },
  aiText: { fontSize: 14, lineHeight: 20, fontStyle: 'italic' },
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 12 },
  statCard: {
    flex: 1, borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  statLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  sectionTitle: {
    fontSize: 16, fontWeight: '600',
    paddingHorizontal: 16, marginTop: 24, marginBottom: 8
  },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 16, color: '#999', marginBottom: 6 },
  emptyHint: { fontSize: 13, color: '#bbb' },
  saleItem: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginHorizontal: 16, marginBottom: 8,
    borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
  },
  saleLeft: { flex: 1 },
  saleName: { fontSize: 15, fontWeight: '500' },
  saleTime: { fontSize: 12, color: '#999', marginTop: 3 },
  saleRight: { alignItems: 'flex-end' },
  saleRevenue: { fontSize: 15, fontWeight: '600' },
  saleProfit: { fontSize: 13, color: '#1D9E75', marginTop: 3 },
});
