import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, RefreshControl, Alert, PanResponder, Animated as RNAnimated
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { getStats, getSalesToday, deleteSale, getDebtSummary } from '../db/database';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { getSmartTip } from '../utils/smartTips';
import CurrencyConversionBanner from '../components/CurrencyConversionBanner';
import WholesalePromoStrip from '../components/market/WholesalePromoStrip';
import { useNewsUnread } from '../hooks/useNewsUnread';
import { FEATURES } from '../config/features';

function SaleListItem({ sale, onDelete, isDark, currency, t, i18n, themeStyles }: any) {
  const translateX = useRef(new RNAnimated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 10,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) {
          translateX.setValue(gestureState.dx);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -80) {
          RNAnimated.timing(translateX, {
            toValue: -80,
            duration: 200,
            useNativeDriver: true,
          }).start();
        } else {
          RNAnimated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const reset = () => {
    RNAnimated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
    }).start();
  };

  return (
    <View style={styles.swipeContainer}>
      <TouchableOpacity
        style={styles.deleteBackground}
        onPress={() => {
          onDelete();
          reset();
        }}
      >
        <Ionicons name="trash" size={20} color="#fff" />
      </TouchableOpacity>
      <RNAnimated.View
        style={[
          styles.saleItem,
          themeStyles.card,
          { transform: [{ translateX }] }
        ]}
        {...panResponder.panHandlers}
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
      </RNAnimated.View>
    </View>
  );
}

function StatCard({ label, value, currency, unit, icon, color, themeStyles, trend }: any) {
  return (
    <View style={[styles.statCard, themeStyles.card]}>
      <View style={styles.statHeader}>
        <Ionicons name={icon} size={16} color={color} />
        <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[styles.statValue, themeStyles.text]}>
        {value.toLocaleString()} {currency || unit}
      </Text>
      {trend !== undefined && trend !== null && (
        <View style={styles.trendContainer}>
          <Ionicons
            name={trend >= 0 ? "trending-up" : "trending-down"}
            size={12}
            color={trend >= 0 ? "#1D9E75" : "#FF6B6B"}
          />
          <Text style={[styles.trendText, { color: trend >= 0 ? "#1D9E75" : "#FF6B6B" }]}>
            {trend > 0 ? `+${trend}` : trend}% {trend === 0 ? '' : 'vs avg'}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const { resolvedTheme, currency, sellerMode } = useAppContext(); const isDark = resolvedTheme === "dark";
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const { hasUnread } = useNewsUnread();

  const [stats, setStats] = useState({ revenue: 0, profit: 0, count: 0 });
  const [stats7, setStats7] = useState({ revenue: 0, profit: 0, count: 0 });
  const [todaySales, setTodaySales] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [dailyTip, setDailyTip] = useState<string | null>(null);
  const [debtSummary, setDebtSummary] = useState({ total_remaining: 0, debtor_count: 0 });

  const loadData = () => {
    const s = getStats(1);
    setStats(s);
    const s7 = getStats(7);
    setStats7(s7);
    const sales = getSalesToday();
    setTodaySales(sales);
    setDebtSummary(getDebtSummary());
  };

  const loadTip = async () => {
    const tip = await getSmartTip(t, currency.symbol);
    setDailyTip(tip);
  };

  useFocusEffect(useCallback(() => {
    loadData();
    loadTip();
  }, [t, currency.symbol]));

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
    loadTip();
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

  const themeStyles = isDark ? darkStyles : lightStyles;

  const getGreeting = () => {
    const hour = new Date().getHours();
    const name = user?.name || '';
    if (hour < 12) return t('home.greetingMorning', { name });
    if (hour < 18) return t('home.greetingAfternoon', { name });
    return t('home.greetingEvening', { name });
  };

  return (
    <ScrollView
      style={[styles.container, themeStyles.container]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Заголовок */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={styles.headerTitle}>{getGreeting()}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('News')} style={styles.newsBtn}>
            <Ionicons name="newspaper-outline" size={22} color="#fff" />
            {hasUnread && <View style={styles.newsBadgeDot} />}
          </TouchableOpacity>
        </View>
        <Text style={styles.headerDate}>
          {new Date().toLocaleDateString(i18n.language === 'tg' ? 'tg-TJ' : i18n.language === 'uz' ? 'uz-UZ' : 'ru-RU', {
            day: 'numeric', month: 'long', year: 'numeric'
          })}
        </Text>
      </View>

      <CurrencyConversionBanner />

  {sellerMode === 'wholesale' && debtSummary.total_remaining > 0 && (
    <TouchableOpacity
      style={[styles.debtWidget, themeStyles.card]}
      onPress={() => navigation.navigate('Debtors')}
      activeOpacity={0.7}
    >
      <View style={styles.debtWidgetLeft}>
        <Text style={styles.debtWidgetIcon}>📋</Text>
        <View>
          <Text style={styles.debtWidgetLabel}>Вам должны</Text>
          <Text style={styles.debtWidgetCount}>
            {debtSummary.debtor_count} чел.
          </Text>
        </View>
      </View>
      <View style={styles.debtWidgetRight}>
        <Text style={[styles.debtWidgetAmount, themeStyles.text]}>
          {debtSummary.total_remaining.toLocaleString()} {currency.symbol}
        </Text>
        <Ionicons name="chevron-forward" size={16} color="#1D9E75" />
      </View>
    </TouchableOpacity>
  )}

      {/* Карточки статистики */}
      {dailyTip ? (
        <View style={[styles.tipCard, themeStyles.card]}>
          <View style={styles.tipHeader}>
            <Text style={styles.tipEmoji}>💡</Text>
            <Text style={styles.tipTitle}>{t('home.tipTitle')}</Text>
          </View>
          <Text style={[styles.tipText, themeStyles.text]}>{dailyTip}</Text>
        </View>
      ) : null}

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={[styles.actionChip, themeStyles.card]}
          onPress={() => navigation.navigate('Sale')}
        >
          <Ionicons name="add-circle-outline" size={18} color="#1D9E75" />
          <Text style={[styles.actionText, themeStyles.text]}>{t('tabs.sale')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionChip, themeStyles.card]}
          onPress={() => navigation.navigate('Expenses')}
        >
          <Ionicons name="receipt-outline" size={18} color="#FF6B6B" />
          <Text style={[styles.actionText, themeStyles.text]}>{t('tabs.expenses')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionChip, themeStyles.card]}
          onPress={() => navigation.navigate('Calculator')}
        >
          <Ionicons name="calculator-outline" size={18} color="#0C447C" />
          <Text style={[styles.actionText, themeStyles.text]}>{t('tabs.home') === 'Главная' ? 'Калькулятор' : 'Calc'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <StatCard
          label={t('common.revenue')}
          value={stats.revenue}
          currency={currency.symbol}
          icon="cash-outline"
          color="#1D9E75"
          themeStyles={themeStyles}
          trend={useMemo(() => {
            const avg = (stats7.revenue - stats.revenue) / 6;
            if (avg <= 0) return null;
            const diff = (stats.revenue - avg) / avg;
            return Math.round(diff * 100);
          }, [stats.revenue, stats7.revenue])}
        />
        <StatCard
          label={t('common.profit')}
          value={stats.profit}
          currency={currency.symbol}
          icon="trending-up-outline"
          color="#0C447C"
          themeStyles={themeStyles}
          trend={useMemo(() => {
            const avg = (stats7.profit - stats.profit) / 6;
            if (avg <= 0) return null;
            const diff = (stats.profit - avg) / avg;
            return Math.round(diff * 100);
          }, [stats.profit, stats7.profit])}
        />
      </View>

      <View style={styles.statsRow}>
        <StatCard
          label={t('home.salesCount')}
          value={stats.count}
          unit={t('reports.pcs')}
          icon="cart-outline"
          color="#854F0B"
          themeStyles={themeStyles}
        />
        <StatCard
          label={t('home.avgCheck')}
          value={stats.count > 0 ? Math.round(stats.revenue / stats.count) : 0}
          currency={currency.symbol}
          icon="calculator-outline"
          color="#3B6D11"
          themeStyles={themeStyles}
        />
      </View>

      {FEATURES.WHOLESALE_ENABLED && <WholesalePromoStrip />}

      {/* Последние продажи */}
      <Text style={[styles.sectionTitle, themeStyles.text]}>{t('home.recentSales')}</Text>

      {todaySales.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="cart-outline" size={48} color={isDark ? '#444' : '#CCC'} />
          <Text style={styles.emptyText}>{t('home.noSales')}</Text>
          <Text style={styles.emptyHint}>{t('home.noSalesHint')}</Text>
          <TouchableOpacity
            style={styles.addSaleCta}
            onPress={() => navigation.navigate('Sale')}
          >
            <Text style={styles.addSaleCtaText}>{t('home.addSaleCta')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        todaySales.map((sale: any) => (
          <SaleListItem
            key={String(sale.id)}
            sale={sale}
            onDelete={() => handleDeleteSale(sale)}
            isDark={isDark}
            currency={currency}
            t={t}
            i18n={i18n}
            themeStyles={themeStyles}
          />
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
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  newsBtn: { padding: 4, position: 'relative' },
  newsBadgeDot: { position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF6B6B' },
  headerDate: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  tipCard: {
    margin: 16, marginBottom: 4, padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4, borderLeftColor: '#1D9E75',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 2, elevation: 2,
  },
  tipHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  tipEmoji: { fontSize: 18, marginRight: 8 },
  tipTitle: { fontSize: 14, fontWeight: 'bold', color: '#1D9E75' },
  tipText: { fontSize: 14, lineHeight: 20, fontStyle: 'italic' },
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 12 },
  statCard: {
    flex: 1, borderRadius: 12, padding: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 2, elevation: 2,
  },
  statHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
  statLabel: { fontSize: 11, color: '#999', flex: 1 },
  statValue: { fontSize: 17, fontWeight: 'bold' },
  trendContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  trendText: { fontSize: 10, fontWeight: '600', marginLeft: 2 },
  sectionTitle: {
    fontSize: 16, fontWeight: '600',
    paddingHorizontal: 16, marginTop: 24, marginBottom: 8
  },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 16, color: '#999', marginTop: 12, marginBottom: 6 },
  emptyHint: { fontSize: 13, color: '#bbb', marginBottom: 20 },
  addSaleCta: {
    backgroundColor: '#1D9E75',
    paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 20,
  },
  addSaleCtaText: { color: '#fff', fontWeight: '600' },
  quickActions: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 16,
  },
  actionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
  },
  actionText: { fontSize: 12, fontWeight: '500' },
  swipeContainer: {
    position: 'relative',
    marginBottom: 8,
    marginHorizontal: 16,
  },
  deleteBackground: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 80,
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 25,
  },
  saleItem: {
    flexDirection: 'row', justifyContent: 'space-between',
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
  debtWidget: {
    marginHorizontal: 16, marginTop: 12, marginBottom: 0,
    borderRadius: 12, padding: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderLeftWidth: 4, borderLeftColor: '#E53935',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 2, elevation: 2,
  },
  debtWidgetLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  debtWidgetIcon: { fontSize: 22 },
  debtWidgetLabel: { fontSize: 13, color: '#999' },
  debtWidgetCount: { fontSize: 12, color: '#E53935', fontWeight: '500' },
  debtWidgetRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  debtWidgetAmount: { fontSize: 18, fontWeight: 'bold' },
});
