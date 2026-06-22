import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, RefreshControl, Alert, TextInput, Modal, ActivityIndicator
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { BarChart } from 'react-native-gifted-charts';
import { Calendar } from 'react-native-calendars';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStats, getSalesByPeriod, deleteSale, getExpenseStats } from '../db/database';
import { useAppContext } from '../context/AppContext';
import AnnualReport from '../components/reports/AnnualReport';
import RegistrationPromptModal from '../components/RegistrationPromptModal';
import UniversalBanner from '../components/ads/UniversalBanner';
import { useAuth } from '../context/AuthContext';
import { ExtendedReportService } from '../services/ExtendedReportService';
import { adService } from '../services/adService';
import { AD_UNIT_IDS } from '../constants/ads';
import { ForecastService } from '../services/ForecastService';
import { aggregateSalesForForecast } from '../utils/aggregateSalesForForecast';

let RewardedAd: any = null;
try {
  const yandex = require('yandex-mobile-ads');
  RewardedAd = yandex.RewardedAd;
} catch (e) {
  console.warn('Yandex RewardedAd not available:', e);
}

export default function ReportScreen() {
  const { t, i18n } = useTranslation();
  const { resolvedTheme, currency } = useAppContext(); const isDark = resolvedTheme === "dark";
  const navigation = useNavigation<any>();
  const [period, setPeriod] = useState<number | 'custom'>(30);
  const [dateRange, setDateRange] = useState<{from: string, to: string} | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDates, setSelectedDates] = useState<any>({});

  const [extendedUnlocked, setExtendedUnlocked] = useState(false);
  const [remainingHours, setRemainingHours] = useState(0);
  const [showExtendedModal, setShowExtendedModal] = useState(false);
  const [isAdLoading, setIsAdLoading] = useState(false);

  const [forecastCache, setForecastCache] = useState<any>(null);
  const [isForecastLoading, setIsForecastLoading] = useState(false);
  const [showForecastModal, setShowForecastModal] = useState(false);

  const { isGuest } = useAuth();
  const [showRegPrompt, setShowRegPrompt] = useState(false);

  const [stats, setStats] = useState({ revenue: 0, profit: 0, count: 0 });
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [sales, setSales] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filterText, setFilterText] = useState('');

  const loadData = useCallback((p: number | 'custom', range?: {from: string, to: string}) => {
    if (p === 'custom' && range) {
      setStats(getStats(0, range.from, range.to));
      setSales(getSalesByPeriod(0, range.from, range.to));
      const expStats = getExpenseStats(0, range.from, range.to);
      setExpenseTotal(expStats.total);
    } else {
      const days = typeof p === 'number' ? p : 1;
      setStats(getStats(days));
      setSales(getSalesByPeriod(days));
      const expStats = getExpenseStats(days);
      setExpenseTotal(expStats.total);
    }
  }, []);

  const checkRegPrompt = useCallback(async () => {
    if (!isGuest) return;
    try {
      const lastPrompt = await AsyncStorage.getItem('last_reg_prompt');
      const now = Date.now();
      const weekInMs = 7 * 24 * 60 * 60 * 1000;
      if (!lastPrompt || now - parseInt(lastPrompt) > weekInMs) {
        setShowRegPrompt(true);
        await AsyncStorage.setItem('last_reg_prompt', String(now));
      }
    } catch (e) {
      console.warn('Failed to check reg prompt', e);
    }
  }, [isGuest]);

  const checkExtendedUnlock = useCallback(() => {
    ExtendedReportService.isUnlocked().then(unlocked => {
      setExtendedUnlocked(unlocked);
      // Auto-reset period if unlock expired
      if (!unlocked && (period === 60 || period === 90 || period === 365 || period === 'custom')) {
        setPeriod(30);
      }
    });
    ExtendedReportService.getRemainingHours().then(setRemainingHours);
  }, [period]);

  const checkForecast = useCallback(() => {
    ForecastService.getCachedForecast().then(setForecastCache);
  }, []);

  useFocusEffect(useCallback(() => {
    loadData(period, dateRange || undefined);
    checkRegPrompt();
    checkExtendedUnlock();
    checkForecast();
  }, [period, dateRange, loadData, checkRegPrompt, checkExtendedUnlock, checkForecast]));

  const onRefresh = () => {
    setRefreshing(true);
    loadData(period, dateRange || undefined);
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
            loadData(period);
          }
        }
      ]
    );
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

  const filteredSales = sales.filter(s =>
    s.product_name.toLowerCase().includes(filterText.toLowerCase())
  );

  // Подготовка данных для графика
  const chartData = sales.reduce((acc: any, sale: any) => {
    const date = new Date(sale.created_at).toLocaleDateString(i18n.language === 'tg' ? 'tg-TJ' : i18n.language === 'uz' ? 'uz-UZ' : 'ru-RU', { day: 'numeric', month: 'short' });
    const existing = acc.find((d: any) => d.label === date);
    if (existing) {
      existing.value += sale.sell_price * sale.quantity;
    } else {
      acc.push({ label: date, value: sale.sell_price * sale.quantity });
    }
    return acc;
  }, []).reverse();

  const exportToCSV = async () => {
    if (sales.length === 0) {
      Alert.alert('Экспорт', 'Нет данных для экспорта');
      return;
    }

    try {
      const header = 'ID,Товар,Кол-во,Цена продажи,Цена закупки,Прибыль,Заметка,Дата\n';
      const rows = sales.map(s => {
        const name = (s.product_name || '').replace(/"/g, '""');
        const note = (s.note || '').replace(/"/g, '""');
        return `${s.id},"${name}",${s.quantity},${s.sell_price},${s.buy_price},${s.profit},"${note}",${s.created_at}`;
      }).join('\n');

      const csvContent = '\uFEFF' + header + rows;
      const fileName = `sales_report_${new Date().getTime()}.csv`;
      const filePath = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(filePath, csvContent, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'text/csv',
          dialogTitle: 'Экспорт отчёта',
          UTI: 'public.comma-separated-values-text'
        });
      } else {
        Alert.alert(t('common.error'), 'Общий доступ недоступен на этом устройстве');
      }
    } catch (e) {
      console.error('Export error', e);
      Alert.alert(t('common.error'), 'Не удалось экспортировать файл');
    }
  };

  const PERIODS = [
    { label: t('reports.today'), days: 1 },
    { label: t('reports.days7'), days: 7 },
    { label: t('reports.days30'), days: 30 },
    { label: t('reports.days60'), days: 60, locked: !extendedUnlocked },
    { label: t('reports.days90'), days: 90, locked: !extendedUnlocked },
    { label: t('reports.days365'), days: 365, locked: !extendedUnlocked },
  ];

  const themeStyles = isDark ? darkStyles : lightStyles;

  const handleDayPress = (day: any) => {
    const dateStr = day.dateString;
    let newSelectedDates = { ...selectedDates };

    if (!dateRange || (dateRange.from && dateRange.to) || !dateRange.from) {
      // Start new range
      newSelectedDates = {
        [dateStr]: { startingDay: true, color: '#1D9E75', textColor: 'white' }
      };
      setDateRange({ from: dateStr, to: '' });
    } else {
      // Complete range
      const start = new Date(dateRange.from);
      const end = new Date(dateStr);

      if (end < start) {
        newSelectedDates = {
          [dateStr]: { startingDay: true, color: '#1D9E75', textColor: 'white' }
        };
        setDateRange({ from: dateStr, to: '' });
      } else {
        // Fill range
        let curr = new Date(start);
        while (curr <= end) {
          const dStr = curr.toISOString().split('T')[0];
          newSelectedDates[dStr] = { color: '#E0F2F1', textColor: '#1D9E75' };
          if (dStr === dateRange.from) newSelectedDates[dStr] = { startingDay: true, color: '#1D9E75', textColor: 'white' };
          if (dStr === dateStr) newSelectedDates[dStr] = { endingDay: true, color: '#1D9E75', textColor: 'white' };
          curr.setDate(curr.getDate() + 1);
        }
        setDateRange({ from: dateRange.from, to: dateStr });
      }
    }
    setSelectedDates(newSelectedDates);
  };

  const applyCustomRange = () => {
    if (dateRange && dateRange.from) {
      const finalRange = dateRange.to ? dateRange : { from: dateRange.from, to: dateRange.from };
      setDateRange(finalRange);
      setPeriod('custom');
      setShowCalendar(false);
    }
  };

  const handleWatchExtendedVideo = async () => {
    if (!RewardedAd) {
      Alert.alert('', t('extendedReport.noInternet'));
      return;
    }

    setShowExtendedModal(false);
    setIsAdLoading(true);

    try {
      const adUnitId = AD_UNIT_IDS.REWARDED;
      const rewarded = RewardedAd.createForAdUnitId(adUnitId);

      let rewardedEarned = false;

      rewarded.onAdLoaded(() => {
        setIsAdLoading(false);
        rewarded.show();
      });

      rewarded.onAdFailedToLoad((error: any) => {
        setIsAdLoading(false);
        console.error('Extended Rewarded ad failed to load:', error);
        Alert.alert('', t('extendedReport.noInternet'));
      });

      rewarded.onAdRewarded(() => {
        rewardedEarned = true;
      });

      rewarded.onAdDismissed(() => {
        rewarded.removeAllListeners();
        if (rewardedEarned) {
          ExtendedReportService.onRewardedWatched().then(() => {
            setExtendedUnlocked(true);
            setRemainingHours(24);
            setPeriod(90);
          });
        }
      });

      rewarded.load();
    } catch (e) {
      setIsAdLoading(false);
      console.error('Error showing extended rewarded ad:', e);
      Alert.alert('', t('extendedReport.noInternet'));
    }
  };

  const handleForecastPress = async () => {
    if (forecastCache && forecastCache.language === i18n.language) {
      setShowForecastModal(true);
      return;
    }

    if (!RewardedAd) {
      Alert.alert('', t('forecast.noInternet'));
      return;
    }

    setIsForecastLoading(true);

    try {
      const adUnitId = AD_UNIT_IDS.REWARDED;
      const rewarded = RewardedAd.createForAdUnitId(adUnitId);

      let rewardedEarned = false;

      rewarded.onAdLoaded(() => {
        rewarded.show();
      });

      rewarded.onAdFailedToLoad((error: any) => {
        setIsForecastLoading(false);
        console.error('Forecast Rewarded ad failed to load:', error);
        Alert.alert('', t('forecast.noInternet'));
      });

      rewarded.onAdRewarded(() => {
        rewardedEarned = true;
      });

      rewarded.onAdDismissed(() => {
        rewarded.removeAllListeners();
        if (rewardedEarned) {
          generateForecast();
        } else {
          setIsForecastLoading(false);
        }
      });

      rewarded.load();
    } catch (e) {
      setIsForecastLoading(false);
      console.error('Error showing forecast rewarded ad:', e);
      Alert.alert('', t('forecast.noInternet'));
    }
  };

  const generateForecast = async () => {
    try {
      const payload = await aggregateSalesForForecast(
        i18n.language as 'ru' | 'tj' | 'uz',
        currency.symbol
      );
      const forecast = await ForecastService.fetchForecast(payload);
      const updatedCache = await ForecastService.getCachedForecast();
      setForecastCache(updatedCache);
      setShowForecastModal(true);
    } catch (e: any) {
      if (e.message === 'no_data') {
        Alert.alert('', t('forecast.noData'));
      } else if (e.message === 'rate_limit') {
        Alert.alert('', t('forecast.rateLimited'));
      } else {
        Alert.alert('', t('forecast.serverError'));
      }
    } finally {
      setIsForecastLoading(false);
    }
  };

  const forecastRefreshesIn = forecastCache
    ? Math.max(0, Math.ceil((new Date(forecastCache.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60)))
    : 0;

  return (
    <View style={styles.flex}>
    <ScrollView
      style={[styles.container, themeStyles.container]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Переключатель периода и экспорт */}
      <View style={styles.topRow}>
        <View style={styles.periodRow}>
          {PERIODS.map(p => (
            <TouchableOpacity
              key={p.days}
              style={[
                styles.periodBtn,
                themeStyles.card,
                period === p.days && styles.periodBtnActive,
                p.locked && styles.periodBtnLocked
              ]}
              onPress={() => {
                if (p.locked) {
                  setShowExtendedModal(true);
                  return;
                }
                setPeriod(p.days);
                setDateRange(null);
                setSelectedDates({});
              }}
            >
              <Text style={[
                styles.periodText,
                period === p.days && styles.periodTextActive,
                p.locked && styles.periodTextLocked
              ]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.periodBtn, themeStyles.card, period === 'custom' && styles.periodBtnActive]}
            onPress={() => {
              if (extendedUnlocked) {
                setShowCalendar(true);
              } else {
                setShowExtendedModal(true);
              }
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="calendar-outline" size={18} color={period === 'custom' ? '#fff' : '#1D9E75'} />
              {!extendedUnlocked && (
                <Ionicons name="lock-closed" size={10} color={period === 'custom' ? '#fff' : '#1D9E75'} style={{ marginLeft: 2 }} />
              )}
            </View>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={[styles.exportBtn, themeStyles.card]} onPress={exportToCSV}>
          <Text style={styles.exportBtnText}>📄 CSV</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.badgeRow}>
        {!extendedUnlocked ? (
          <TouchableOpacity
            style={styles.lockBadge}
            onPress={() => setShowExtendedModal(true)}
          >
            <Text style={styles.lockBadgeText}>🔒 {t('extendedReport.lockBadge')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.unlockedBadge}>
            <Text style={styles.unlockedBadgeText}>
              ✅ {t('extendedReport.unlockedBadge', { count: remainingHours })}
            </Text>
          </View>
        )}
        {isAdLoading && (
          <ActivityIndicator size="small" color="#1D9E75" style={{ marginLeft: 10 }} />
        )}
      </View>

      {period === 'custom' && dateRange && (
        <View style={styles.customRangeInfo}>
          <Text style={[styles.customRangeText, themeStyles.text]}>
            📅 {new Date(dateRange.from).toLocaleDateString()} — {new Date(dateRange.to).toLocaleDateString()}
          </Text>
          <TouchableOpacity onPress={() => setShowCalendar(true)}>
            <Text style={styles.changeRangeBtn}>Изменить</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* AI Forecast Entry Point */}
      <View style={styles.forecastContainer}>
        {isForecastLoading ? (
          <View style={[styles.forecastBtn, styles.forecastBtnLoading, themeStyles.card]}>
            <ActivityIndicator size="small" color="#1D9E75" style={{ marginRight: 8 }} />
            <Text style={[styles.forecastBtnTextLoading, { color: '#1D9E75' }]}>
              {t('forecast.buttonLabelLoading')}
            </Text>
          </View>
        ) : forecastCache && forecastCache.language === i18n.language ? (
          <View style={{ alignItems: 'center', width: '100%' }}>
            <TouchableOpacity
              style={[styles.forecastBtn, styles.forecastBtnCached]}
              onPress={handleForecastPress}
            >
              <Text style={styles.forecastBtnTextActive}>🔮 {t('forecast.buttonLabelCached')}</Text>
            </TouchableOpacity>
            <Text style={styles.forecastRefreshText}>
              {t('forecast.refreshesIn', { count: forecastRefreshesIn })}
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.forecastBtn, styles.forecastBtnDefault, themeStyles.card]}
            onPress={handleForecastPress}
          >
            <Text style={styles.forecastBtnTextDefault}>🔮 {t('forecast.buttonLabel')} · Смотреть видео</Text>
          </TouchableOpacity>
        )}
      </View>

      {period === 365 ? (
        <AnnualReport />
      ) : (
        <>
          {/* График тренда */}
          {chartData.length > 0 && (
            <View style={[styles.section, themeStyles.card]}>
              <Text style={[styles.sectionTitle, themeStyles.text]}>{t('reports.trend')}</Text>
              <BarChart
                data={chartData}
                barWidth={period === 30 ? 8 : 22}
                noOfSections={3}
                barBorderRadius={4}
                frontColor="#1D9E75"
                yAxisThickness={0}
                xAxisThickness={0}
                hideRules
                yAxisTextStyle={{ color: '#999', fontSize: 10 }}
                xAxisLabelTextStyle={{ color: '#999', fontSize: 10 }}
                isAnimated
              />
            </View>
          )}

          {/* Главные цифры */}
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: '#1D9E75' }]}>
              <Text style={styles.statLabel}>{t('common.revenue')}</Text>
              <Text style={styles.statValue}>{stats.revenue.toLocaleString()}</Text>
              <Text style={styles.statCurrency}>{currency.symbol}</Text>
            </View>
            <TouchableOpacity
              style={[styles.statCard, { backgroundColor: '#0C447C' }]}
              onPress={() => navigation.navigate('Expenses')}
            >
              <Text style={styles.statLabel}>{t('reports.netProfit')}</Text>
              <Text style={styles.statValue}>{(stats.profit - expenseTotal).toLocaleString()}</Text>
              <Text style={styles.statCurrency}>{currency.symbol}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.statCard, { backgroundColor: '#FF6B6B' }]}
              onPress={() => navigation.navigate('Expenses')}
            >
              <Text style={styles.statLabel}>{t('reports.expenses')}</Text>
              <Text style={styles.statValue}>{expenseTotal.toLocaleString()}</Text>
              <Text style={styles.statCurrency}>{currency.symbol}</Text>
            </TouchableOpacity>
            <View style={[styles.statCard, { backgroundColor: '#854F0B' }]}>
              <Text style={styles.statLabel}>{t('home.salesCount')}</Text>
              <Text style={styles.statValue}>{stats.count}</Text>
              <Text style={styles.statCurrency}>{t('reports.pcs')}</Text>
            </View>
          </View>

          {/* Топ товары */}
          {topList.length > 0 && (
            <View style={[styles.section, themeStyles.card]}>
              <Text style={[styles.sectionTitle, themeStyles.text]}>{t('reports.topProducts')}</Text>
              {topList.map((item: any, index) => (
                <View key={item.name} style={styles.topItem}>
                  <View style={styles.topRank}>
                    <Text style={styles.topRankText}>{index + 1}</Text>
                  </View>
                  <View style={styles.topInfo}>
                    <Text style={[styles.topName, themeStyles.text]}>{item.name}</Text>
                    <Text style={styles.topCount}>Продано: {item.count} {t('reports.pcs')}</Text>
                  </View>
                  <Text style={styles.topProfit}>+{item.profit.toLocaleString()} {currency.symbol}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Список продаж */}
          <View style={[styles.section, themeStyles.card]}>
            <View style={styles.listHeader}>
              <Text style={[styles.sectionTitle, themeStyles.text]}>
                {t('reports.allSales')} ({filteredSales.length})
              </Text>
              <TextInput
                style={[styles.filterInput, themeStyles.input]}
                placeholder={t('reports.searchPlaceholder')}
                placeholderTextColor={isDark ? '#888' : '#aaa'}
                value={filterText}
                onChangeText={setFilterText}
              />
            </View>

            {filteredSales.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  {sales.length === 0 ? t('reports.noSalesPeriod') : t('reports.nothingFound')}
                </Text>
              </View>
            ) : (
              filteredSales.map((sale: any) => (
                <TouchableOpacity
                  key={String(sale.id)}
                  style={styles.saleItem}
                  onLongPress={() => handleDeleteSale(sale)}
                  delayLongPress={500}
                >
                  <View style={styles.saleLeft}>
                    <Text style={[styles.saleName, themeStyles.text]}>{sale.product_name}</Text>
                    <Text style={styles.saleDate}>
                      {new Date(sale.created_at).toLocaleString(i18n.language === 'tg' ? 'tg-TJ' : i18n.language === 'uz' ? 'uz-UZ' : 'ru-RU', {
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
          </View>
          <View style={{ width: '100%' }}>
            <UniversalBanner />
          </View>
        </>
      )}

    </ScrollView>

    <RegistrationPromptModal
      visible={showRegPrompt}
      onClose={() => setShowRegPrompt(false)}
      onRegister={() => {
        setShowRegPrompt(false);
        navigation.navigate('Profile');
      }}
      onBackup={() => {
        setShowRegPrompt(false);
        navigation.navigate('Settings');
      }}
    />

    {/* Extended Report Modal */}
    <Modal
      visible={showExtendedModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowExtendedModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, themeStyles.card]}>
          <Text style={styles.modalEmoji}>📊</Text>
          <Text style={[styles.modalTitle, themeStyles.text]}>
            {t('extendedReport.modalTitle')}
          </Text>
          <Text style={[styles.modalBodyText, themeStyles.text]}>
            {t('extendedReport.modalBody')}
          </Text>
          <TouchableOpacity
            style={styles.watchBtn}
            onPress={handleWatchExtendedVideo}
          >
            <Text style={styles.watchBtnText}>{t('extendedReport.watchVideo')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.modalCancelBtn}
            onPress={() => setShowExtendedModal(false)}
          >
            <Text style={styles.modalCancelBtnText}>{t('extendedReport.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>

    {/* Forecast Modal */}
    <Modal
      visible={showForecastModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowForecastModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.forecastModalContent, themeStyles.card]}>
          <View style={styles.forecastModalHeader}>
            <View>
              <Text style={[styles.forecastModalTitle, themeStyles.text]}>{t('forecast.modalTitle')}</Text>
              <Text style={styles.forecastModalSubtitle}>{t('forecast.modalSubtitle')}</Text>
            </View>
            <TouchableOpacity onPress={() => setShowForecastModal(false)}>
              <Ionicons name="close" size={24} color={isDark ? '#eee' : '#333'} />
            </TouchableOpacity>
          </View>

          {forecastCache && forecastCache.language !== i18n.language && (
            <View style={styles.langWarningBanner}>
              <Text style={styles.langWarningText}>{t('forecast.wrongLanguage')}</Text>
              <TouchableOpacity onPress={() => { setShowForecastModal(false); handleForecastPress(); }}>
                <Text style={styles.langWarningLink}>{t('forecast.refresh')}</Text>
              </TouchableOpacity>
            </View>
          )}

          <ScrollView style={styles.forecastScroll} showsVerticalScrollIndicator={false}>
            <Text style={[styles.forecastText, themeStyles.text]}>
              {forecastCache?.forecast}
            </Text>
          </ScrollView>

          <View style={styles.forecastModalFooter}>
            <Text style={styles.forecastRefreshText}>
              {t('forecast.refreshesIn', { count: forecastRefreshesIn })}
            </Text>
            <TouchableOpacity
              style={styles.forecastCloseBtn}
              onPress={() => setShowForecastModal(false)}
            >
              <Text style={styles.forecastCloseBtnText}>{t('forecast.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    {/* Calendar Modal */}
    <Modal visible={showCalendar} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.calendarContent, themeStyles.card]}>
            <View style={styles.calendarHeader}>
              <Text style={[styles.modalTitle, themeStyles.text]}>Выберите период</Text>
              <TouchableOpacity onPress={() => setShowCalendar(false)}>
                <Ionicons name="close" size={24} color={isDark ? '#eee' : '#333'} />
              </TouchableOpacity>
            </View>

            <Calendar
              onDayPress={handleDayPress}
              markedDates={selectedDates}
              markingType={'period'}
              theme={{
                calendarBackground: isDark ? '#1E1E1E' : '#fff',
                textSectionTitleColor: '#1D9E75',
                selectedDayBackgroundColor: '#1D9E75',
                selectedDayTextColor: '#ffffff',
                todayTextColor: '#1D9E75',
                dayTextColor: isDark ? '#eee' : '#2d4150',
                textDisabledColor: isDark ? '#444' : '#d9e1e8',
                monthTextColor: '#1D9E75',
                arrowColor: '#1D9E75',
              }}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => {
                setShowCalendar(false);
                setSelectedDates({});
                setDateRange(null);
              }}>
                <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, (!dateRange || !dateRange.from) && { opacity: 0.5 }]}
                onPress={applyCustomRange}
                disabled={!dateRange || !dateRange.from}
              >
                <Text style={styles.confirmBtnText}>Применить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const lightStyles = StyleSheet.create({
  container: { backgroundColor: '#F5F5F5' },
  card: { backgroundColor: '#fff' },
  text: { color: '#333' },
  input: { backgroundColor: '#F5F5F5', borderColor: '#E0E0E0' },
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: '#000' },
  card: { backgroundColor: '#1E1E1E' },
  text: { color: '#EEE' },
  input: { backgroundColor: '#2C2C2C', borderColor: '#444', color: '#EEE' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  topRow: {
    flexDirection: 'row', alignItems: 'center', paddingRight: 16,
  },
  periodRow: {
    flex: 1, flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8,
  },
  exportBtn: {
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 8, borderWidth: 1, borderColor: '#E0E0E0',
    marginTop: 8,
  },
  exportBtnText: { fontSize: 13, fontWeight: '600', color: '#1D9E75' },
  periodBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1, borderColor: '#E0E0E0',
  },
  periodBtnActive: { backgroundColor: '#1D9E75', borderColor: '#1D9E75' },
  periodBtnLocked: { opacity: 0.7, borderStyle: 'dashed' },
  periodText: { fontSize: 13, fontWeight: '500', color: '#666' },
  periodTextActive: { color: '#fff' },
  periodTextLocked: { color: '#999' },
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
    margin: 16, marginTop: 8,
    borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
  },
  sectionTitle: { fontSize: 15, fontWeight: '600', marginBottom: 10 },
  listHeader: {
    flexDirection: 'column',
    alignItems: 'stretch', marginBottom: 12,
  },
  filterInput: {
    borderRadius: 8, paddingHorizontal: 10,
    paddingVertical: 8, fontSize: 13,
    borderWidth: 1,
  },
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
  topName: { fontSize: 14, fontWeight: '500' },
  topCount: { fontSize: 12, color: '#999', marginTop: 2 },
  topProfit: { fontSize: 14, fontWeight: '600', color: '#1D9E75' },
  empty: { alignItems: 'center', padding: 30 },
  emptyText: { fontSize: 14, color: '#999' },
  saleItem: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#F0F0F0',
  },
  saleLeft: { flex: 1, marginRight: 10 },
  saleName: { fontSize: 14, fontWeight: '500' },
  saleDate: { fontSize: 12, color: '#999', marginTop: 2 },
  saleNote: { fontSize: 12, color: '#aaa', marginTop: 2, fontStyle: 'italic' },
  saleRight: { alignItems: 'flex-end' },
  saleRevenue: { fontSize: 14, fontWeight: '600' },
  saleProfit: { fontSize: 13, color: '#1D9E75', marginTop: 2 },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', padding: 20
  },
  calendarContent: {
    borderRadius: 20, padding: 16,
  },
  calendarHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: {
    flex: 1, padding: 14, alignItems: 'center',
    borderRadius: 10, borderWidth: 1, borderColor: '#E0E0E0'
  },
  cancelBtnText: { fontWeight: 'bold', color: '#888' },
  confirmBtn: {
    flex: 1, padding: 14, alignItems: 'center',
    borderRadius: 10, backgroundColor: '#1D9E75'
  },
  confirmBtnText: { fontWeight: 'bold', color: '#fff' },
  customRangeInfo: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 16,
    marginBottom: 10,
  },
  customRangeText: { fontSize: 14, fontWeight: '600' },
  changeRangeBtn: { fontSize: 13, color: '#1D9E75', fontWeight: '500' },

  forecastContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  forecastBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    borderWidth: 1.5,
  },
  forecastBtnDefault: {
    borderColor: '#1D9E75',
    backgroundColor: 'transparent',
  },
  forecastBtnCached: {
    backgroundColor: '#1D9E75',
    borderColor: '#1D9E75',
  },
  forecastBtnLoading: {
    borderColor: '#E0E0E0',
    backgroundColor: 'transparent',
  },
  forecastBtnTextDefault: {
    color: '#1D9E75',
    fontWeight: 'bold',
    fontSize: 14,
  },
  forecastBtnTextActive: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  forecastBtnTextLoading: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  forecastRefreshText: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
  },
  forecastModalContent: {
    flex: 1,
    marginTop: 80,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 20,
  },
  forecastModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  forecastModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  forecastModalSubtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  forecastScroll: {
    flex: 1,
  },
  forecastText: {
    fontSize: 15,
    lineHeight: 24,
  },
  forecastModalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 0.5,
    borderTopColor: '#EEE',
  },
  forecastCloseBtn: {
    backgroundColor: '#1D9E75',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  forecastCloseBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  langWarningBanner: {
    backgroundColor: '#FFF9C4',
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  langWarningText: {
    fontSize: 12,
    color: '#827717',
    flex: 1,
    marginRight: 8,
  },
  langWarningLink: {
    fontSize: 12,
    color: '#1D9E75',
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },

  badgeRow: {
    paddingHorizontal: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  lockBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: 'transparent',
  },
  lockBadgeText: {
    fontSize: 12,
    color: '#888',
  },
  unlockedBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: '#1D9E75',
    backgroundColor: 'transparent',
  },
  unlockedBadgeText: {
    fontSize: 12,
    color: '#1D9E75',
    fontWeight: '500',
  },
  modalContent: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  modalEmoji: {
    fontSize: 40,
    marginBottom: 16,
  },
  modalBodyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  watchBtn: {
    width: '100%',
    backgroundColor: '#1D9E75',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  watchBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  modalCancelBtn: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancelBtnText: {
    color: '#888',
    fontSize: 14,
  },
});
