import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, RefreshControl, Alert, PanResponder, Animated as RNAnimated
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { getStats, getSalesToday, deleteSale, getDebtSummary, getMyStats, getMySalesToday } from '../db/database';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useShop } from '../context/ShopContext';
import { getSmartTip } from '../utils/smartTips';
import CurrencyConversionBanner from '../components/CurrencyConversionBanner';
import WholesalePromoStrip from '../components/market/WholesalePromoStrip';
import { useNewsUnread } from '../hooks/useNewsUnread';
import { FEATURES } from '../config/features';
import { Colors, LightTheme, DarkTheme, Radius, Shadow, FontSize, Spacing } from '../constants/theme';

const SaleListItem = React.memo(({ sale, onDelete, isDark, currency, t, i18n, themeStyles }: any) => {
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
          {sale.profit !== null && sale.profit !== undefined && (
            <Text style={styles.saleProfit}>
              +{sale.profit.toLocaleString()} {currency.symbol}
            </Text>
          )}
        </View>
      </RNAnimated.View>
    </View>
  );
});

function StatCard({ label, value, currency, unit, icon, color, themeStyles, trend }: any) {
  const bgMap: Record<string, string> = {
    '#1D9E75': Colors.primaryLight,
    '#0C447C': Colors.infoLight,
    '#854F0B': Colors.brownLight,
    '#3B6D11': Colors.greenDarkLight,
  };
  const iconBg = bgMap[color] || '#F0F0F0';

  return (
    <View style={[styles.statCard, themeStyles.card, Shadow.md]}>
      <View style={styles.statHeader}>
        <View style={[styles.statIconBg, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        <Text style={[styles.statLabel, { color: themeStyles.textSecondary?.color || '#999' }]} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[styles.statValue, themeStyles.text]}>
        {value.toLocaleString()} {currency || unit}
      </Text>
      {trend !== undefined && trend !== null && (
        <View style={[styles.trendPill, { backgroundColor: trend >= 0 ? Colors.primaryLight : Colors.dangerLight }]}>
          <Ionicons
            name={trend >= 0 ? "trending-up" : "trending-down"}
            size={11}
            color={trend >= 0 ? Colors.primary : Colors.danger}
          />
          <Text style={[styles.trendText, { color: trend >= 0 ? Colors.primary : Colors.danger }]}>
            {trend > 0 ? `+${trend}` : trend}%
          </Text>
        </View>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const { resolvedTheme, currency, sellerMode: contextSellerMode } = useAppContext(); const isDark = resolvedTheme === "dark";
  const { user } = useAuth();
  const { isOwner, isSeller, sellerName, shopId } = useShop();
  const navigation = useNavigation<any>();
  const { hasUnread } = useNewsUnread();

  const [stats, setStats] = useState({ revenue: 0, profit: 0, count: 0 });
  const [stats7, setStats7] = useState({ revenue: 0, profit: 0, count: 0 });
  const [todaySales, setTodaySales] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [dailyTip, setDailyTip] = useState<string | null>(null);
  const [debtSummary, setDebtSummary] = useState({ total_remaining: 0, debtor_count: 0 });

  const loadData = () => {
    const userId = user?._id || 'guest';
    const s = isOwner ? getStats(1) : getMyStats(userId, 1);
    setStats(s);
    const s7 = isOwner ? getStats(7) : getMyStats(userId, 7);
    setStats7(s7);
    const sales = isOwner ? getSalesToday() : getMySalesToday(userId);
    setTodaySales(sales);
    if (contextSellerMode === 'wholesale') {
      setDebtSummary(getDebtSummary());
    }
  };

  const loadTip = async () => {
    const tip = await getSmartTip(t, currency.symbol);
    setDailyTip(tip);
  };

  useFocusEffect(useCallback(() => {
    loadData();
    loadTip();
  }, [t, currency.symbol]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    await loadTip();
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

  const revenueTrend = useMemo(() => {
    const avg = (stats7.revenue - stats.revenue) / 6;
    if (avg === 0) return null;
    const diff = (stats.revenue - avg) / Math.abs(avg);
    return Math.round(diff * 100);
  }, [stats.revenue, stats7.revenue]);

  const profitTrend = useMemo(() => {
    const avg = (stats7.profit - stats.profit) / 6;
    if (avg === 0) return null;
    const diff = (stats.profit - avg) / Math.abs(avg);
    return Math.round(diff * 100);
  }, [stats.profit, stats7.profit]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    const name = isSeller ? (sellerName || user?.name || '') : (user?.name || '');
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
      <LinearGradient
        colors={[Colors.primary, Colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{getGreeting()}</Text>
            <Text style={styles.headerDate}>
              {new Date().toLocaleDateString(i18n.language === 'tg' ? 'tg-TJ' : i18n.language === 'uz' ? 'uz-UZ' : 'ru-RU', {
                day: 'numeric', month: 'long', year: 'numeric'
              })}
            </Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('News')} style={styles.newsBtn}>
            <Ionicons name="newspaper-outline" size={22} color="#fff" />
            {hasUnread && <View style={styles.newsBadgeDot} />}
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <CurrencyConversionBanner />

  {contextSellerMode === 'wholesale' && debtSummary.total_remaining > 0 && (
    <TouchableOpacity
      style={[styles.debtWidget, themeStyles.card]}
      onPress={() => navigation.navigate('Debtors')}
      activeOpacity={0.7}
    >
      <View style={styles.debtWidgetLeft}>
        <Text style={styles.debtWidgetIcon}>📋</Text>
        <View>
          <Text style={styles.debtWidgetLabel}>{t('debtors.totalOwed')}</Text>
          <Text style={styles.debtWidgetCount}>
            {t('debtors.debtorCount', { count: debtSummary.debtor_count })}
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
          style={[styles.actionChip, { backgroundColor: Colors.primaryLight }]}
          onPress={() => navigation.navigate('Sale')}
        >
          <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
          <Text style={[styles.actionText, { color: Colors.primary }]}>{t('tabs.sale')}</Text>
        </TouchableOpacity>
        {isOwner && (
          <TouchableOpacity
            style={[styles.actionChip, { backgroundColor: Colors.dangerLight }]}
            onPress={() => navigation.navigate('Expenses')}
          >
            <Ionicons name="receipt-outline" size={18} color={Colors.danger} />
            <Text style={[styles.actionText, { color: Colors.danger }]}>{t('tabs.expenses')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.actionChip, { backgroundColor: Colors.infoLight }]}
          onPress={() => navigation.navigate('Calculator')}
        >
          <Ionicons name="calculator-outline" size={18} color={Colors.info} />
          <Text style={[styles.actionText, { color: Colors.info }]}>{t('tabs.calculator')}</Text>
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
          trend={revenueTrend}
        />
        {isOwner && (
          <StatCard
            label={t('common.profit')}
            value={stats.profit}
            currency={currency.symbol}
            icon="trending-up-outline"
            color="#0C447C"
            themeStyles={themeStyles}
            trend={profitTrend}
          />
        )}
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

      {FEATURES.WHOLESALE_ENABLED && contextSellerMode === 'retail' && <WholesalePromoStrip />}

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
  container: { backgroundColor: LightTheme.background },
  card: { backgroundColor: LightTheme.card },
  text: { color: LightTheme.text },
  textSecondary: { color: LightTheme.textSecondary },
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: DarkTheme.background },
  card: { backgroundColor: DarkTheme.card },
  text: { color: DarkTheme.text },
  textSecondary: { color: DarkTheme.textSecondary },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    padding: Spacing.xl, paddingTop: Spacing.xl,
    borderBottomLeftRadius: Radius.lg, borderBottomRightRadius: Radius.lg,
    ...Shadow.lg,
  },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerTitle: { fontSize: FontSize.xxl, fontWeight: 'bold', color: '#fff', marginBottom: Spacing.xs },
  newsBtn: { padding: Spacing.sm, position: 'relative' },
  newsBadgeDot: { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.danger },
  headerDate: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.8)', marginTop: Spacing.xs },
  tipCard: {
    margin: Spacing.lg, marginBottom: Spacing.sm, padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderLeftWidth: 4, borderLeftColor: Colors.primary,
    ...Shadow.md,
  },
  tipHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  tipEmoji: { fontSize: FontSize.xl, marginRight: Spacing.sm },
  tipTitle: { fontSize: FontSize.md, fontWeight: 'bold', color: Colors.primary },
  tipText: { fontSize: FontSize.md, lineHeight: 20, fontStyle: 'italic' },
  statsRow: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.lg, marginTop: Spacing.md },
  statCard: {
    flex: 1, borderRadius: Radius.lg, padding: Spacing.md,
    ...Shadow.md,
  },
  statIconBg: {
    width: 32, height: 32, borderRadius: Radius.sm,
    justifyContent: 'center', alignItems: 'center',
  },
  statHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm, gap: Spacing.sm },
  statLabel: { fontSize: FontSize.sm, flex: 1 },
  statValue: { fontSize: FontSize.xl, fontWeight: 'bold' },
  trendPill: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
    borderRadius: Radius.pill, alignSelf: 'flex-start',
  },
  trendText: { fontSize: FontSize.xs, fontWeight: '700', marginLeft: 2 },
  sectionTitle: {
    fontSize: FontSize.lg, fontWeight: '600',
    paddingHorizontal: Spacing.lg, marginTop: Spacing.xxl, marginBottom: Spacing.sm,
  },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: FontSize.lg, color: '#999', marginTop: Spacing.md, marginBottom: Spacing.sm },
  emptyHint: { fontSize: FontSize.md, color: '#bbb', marginBottom: Spacing.xl },
  addSaleCta: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderRadius: Radius.pill,
  },
  addSaleCtaText: { color: '#fff', fontWeight: '600' },
  quickActions: {
    flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, marginTop: Spacing.lg,
  },
  actionChip: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.xl,
  },
  actionText: { fontSize: FontSize.sm, fontWeight: '600' },
  swipeContainer: {
    position: 'relative',
    marginBottom: Spacing.sm,
    marginHorizontal: Spacing.lg,
  },
  deleteBackground: {
    position: 'absolute',
    right: 0, top: 0, bottom: 0,
    width: 80,
    backgroundColor: Colors.danger,
    borderRadius: Radius.lg,
    justifyContent: 'center', alignItems: 'flex-end',
    paddingRight: 25,
  },
  saleItem: {
    flexDirection: 'row', justifyContent: 'space-between',
    borderRadius: Radius.lg, padding: Spacing.lg - 2,
    ...Shadow.sm,
  },
  saleLeft: { flex: 1 },
  saleName: { fontSize: FontSize.lg - 1, fontWeight: '500' },
  saleTime: { fontSize: FontSize.sm, color: '#999', marginTop: Spacing.xs + 1 },
  saleRight: { alignItems: 'flex-end' },
  saleRevenue: { fontSize: FontSize.lg - 1, fontWeight: '600' },
  saleProfit: { fontSize: FontSize.md - 1, color: Colors.primary, marginTop: Spacing.xs + 1 },
  debtWidget: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.md, marginBottom: 0,
    borderRadius: Radius.lg, padding: Spacing.lg - 2,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderLeftWidth: 4, borderLeftColor: '#E53935',
    ...Shadow.md,
  },
  debtWidgetLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  debtWidgetIcon: { fontSize: 22 },
  debtWidgetLabel: { fontSize: FontSize.md - 1, color: '#999' },
  debtWidgetCount: { fontSize: FontSize.sm, color: '#E53935', fontWeight: '500' },
  debtWidgetRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  debtWidgetAmount: { fontSize: FontSize.xl, fontWeight: 'bold' },
});
