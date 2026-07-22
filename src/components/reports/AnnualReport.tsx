import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, Modal, ActivityIndicator
} from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { useTranslation } from 'react-i18next';
import { arrayBufferToBase64 } from '../../utils/excelUtils';
import { getAnnualStats } from '../../db/database';
import { useAppContext } from '../../context/AppContext';
import { AD_UNIT_IDS } from '../../constants/ads';
import { ExportSummaryService, SummaryPayload } from '../../services/ExportSummaryService';

let RewardedAdLoader: any = null;
try {
  const yandex = require('yandex-mobile-ads');
  RewardedAdLoader = yandex.RewardedAdLoader;
} catch (e) {
  console.warn('Yandex RewardedAdLoader not available:', e);
}

const showRewardedAd = async (adUnitId: string): Promise<boolean> => {
  if (!RewardedAdLoader) return false;

  try {
    const loader = await RewardedAdLoader.create();
    const ad = await loader.loadAd({ adUnitId });

    return new Promise((resolve) => {
      let rewarded = false;

      ad.onRewarded = () => { rewarded = true; };
      ad.onAdDismissed = () => {
        ad.delete();
        resolve(rewarded);
      };
      ad.onAdFailedToShow = (error: any) => {
        console.error('Ad failed to show:', error);
        ad.delete();
        resolve(false);
      };

      ad.show();
    });
  } catch (error) {
    console.error('Rewarded ad load failed:', error);
    return false;
  }
};

const MONTH_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const MONTH_FULL = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

export default function AnnualReport() {
  const { t, i18n } = useTranslation();
  const { resolvedTheme, currency } = useAppContext(); const isDark = resolvedTheme === "dark";
  const [annualData, setAnnualData] = useState<any>(null);
  const [showMonths, setShowMonths] = useState(false);

  const [showExportModal, setShowExportModal] = useState(false);
  const [cachedSummary, setCachedSummary] = useState<string | null>(null);
  const [isExportLoading, setIsExportLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    const data = getAnnualStats();
    setAnnualData(data);
    checkExportCache(data);
  };

  const getPeriodLabel = () => {
    if (!annualData) return '';
    return `01.01.${annualData.year} — 31.12.${annualData.year}`;
  };

  const checkExportCache = async (data: any) => {
    if (!data) return;
    const label = `${t('reports.year')} ${data.year}`;
    const summary = await ExportSummaryService.getCachedSummary(label, i18n.language);
    setCachedSummary(summary);
  };

  if (!annualData) return null;

  const themeStyles = isDark ? darkStyles : lightStyles;

  const chartData = annualData.months.map((m: any) => ({
    stacks: [
      { value: m.profit, color: '#1D9E75' },
      { value: m.expenses, color: '#FF6B6B' },
    ],
    label: MONTH_SHORT[m.month - 1],
  }));

  const bestMonth = annualData.months.reduce((a: any, b: any) => a.netProfit > b.netProfit ? a : b);
  const worstMonth = annualData.months.reduce((a: any, b: any) => a.netProfit < b.netProfit ? a : b);

  const handleAIExport = async () => {
    if (cachedSummary) {
      generateAIExcel(cachedSummary);
      setShowExportModal(false);
      return;
    }

    if (!RewardedAdLoader) {
      Alert.alert('', t('exportSummary.noInternet'));
      return;
    }

    setShowExportModal(false);
    setIsExportLoading(true);

    const earned = await showRewardedAd(AD_UNIT_IDS.REWARDED);
    if (earned) {
      fetchAndExportAI();
    } else {
      setIsExportLoading(false);
      Alert.alert('', t('exportSummary.noInternet'));
    }
  };

  const fetchAndExportAI = async () => {
    try {
      const bestMonth = annualData.months.reduce((a: any, b: any) => a.netProfit > b.netProfit ? a : b);
      const worstMonth = annualData.months.reduce((a: any, b: any) => a.netProfit < b.netProfit ? a : b);

      const payload: SummaryPayload = {
        language: i18n.language as 'ru' | 'tj' | 'uz',
        currency: currency.symbol,
        periodLabel: getPeriodLabel(),
        totalRevenue: annualData.totals.revenue,
        totalProfit: annualData.totals.profit,
        totalExpenses: annualData.totals.expenses,
        netProfit: annualData.totals.netProfit,
        averageMargin: Math.round((annualData.totals.profit / annualData.totals.revenue) * 100),
        totalTransactions: annualData.totals.salesCount,
        topProducts: annualData.topProducts.slice(0, 5).map((p: any) => ({
          name: p.product_name,
          revenue: 0, // Not explicitly tracked in annual top products, but bbackend can handle
          profit: p.totalProfit,
          margin: 0,
          salesCount: p.totalQty
        })),
        salesByDayOfWeek: [], // Not applicable for annual
        bestDay: MONTH_FULL[bestMonth.month - 1],
        worstDay: MONTH_FULL[worstMonth.month - 1],
        revenueGrowthPercent: null
      };

      const summary = await ExportSummaryService.fetchSummary(payload);
      setCachedSummary(summary);
      generateAIExcel(summary);
    } catch (e) {
      console.error('Annual AI fetch error', e);
      Alert.alert('', t('exportSummary.serverError'));
    } finally {
      setIsExportLoading(false);
    }
  };

  // Заменена функция generateAIExcel
  const generateAIExcel = async (summary: string) => {
    try {
      // Sheet 1: AI Summary
      const summaryData = [
        ["Отчёт Torgo (Годовой)"],
        [getPeriodLabel()],
        [],
        [t('exportSummary.headerRevenue'), `${annualData.totals.revenue} ${currency.symbol}`],
        [t('exportSummary.headerProfit'), `${annualData.totals.profit} ${currency.symbol}`],
        [t('exportSummary.headerExpenses'), `${annualData.totals.expenses} ${currency.symbol}`],
        [t('exportSummary.headerNet'), `${annualData.totals.netProfit} ${currency.symbol}`],
        [],
        [t('exportSummary.headerAnalysis')],
        [summary],
      ];
      const sheet1 = XLSX.utils.aoa_to_sheet(summaryData);
      sheet1['!cols'] = [{ wch: 25 }, { wch: 80 }];

      // Sheet 2: Monthly Data
      const monthHeader = [t('expenses.month'), t('common.revenue'), t('common.profit'), t('reports.expenses'), t('reports.netProfit'), t('home.salesCount')];
      const monthRows = annualData.months.map((m: any) => [
        MONTH_FULL[m.month - 1], m.revenue, m.profit, m.expenses, m.netProfit, m.salesCount
      ]);
      const sheet2 = XLSX.utils.aoa_to_sheet([monthHeader, ...monthRows]);
      sheet2['!cols'] = [{ wch: 20 }];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet1, t('exportSummary.sheetName'));
      XLSX.utils.book_append_sheet(workbook, sheet2, t('expenses.month'));

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      const base64 = arrayBufferToBase64(buffer);
      const fileName = `Torgo_Annual_AI_${annualData.year}.xlsx`;
      const filePath = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(filePath, base64, { encoding: FileSystem.EncodingType.Base64 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: t('exportSummary.fileReady'),
          UTI: 'com.microsoft.excel.xlsx'
        });
      }
    } catch (e) {
      console.error('Annual Excel generation error', e);
      Alert.alert(t('common.error'), 'Error');
    }
  };

  const exportToCSV = async () => {
    try {
      const header = 'ID месяца,Месяц,Выручка,Прибыль,Расходы,Чистая прибыль,Кол-во продаж\n';
      const rows = annualData.months.map((m: any) => {
        return `${m.month},${MONTH_FULL[m.month - 1]},${m.revenue},${m.profit},${m.expenses},${m.netProfit},${m.salesCount}`;
      }).join('\n');

      const csvContent = '\uFEFF' + header + rows;
      const fileName = `annual_report_${annualData.year}.csv`;
      const filePath = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(filePath, csvContent, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'text/csv',
          dialogTitle: 'Экспорт годового отчёта',
          UTI: 'public.comma-separated-values-text'
        });
      } else {
        Alert.alert(t('common.error'), 'Общий доступ недоступен');
      }
    } catch (e) {
      console.error('Export error', e);
      Alert.alert(t('common.error'), 'Не удалось экспортировать файл');
    }
  };

  return (
    <View style={styles.container}>
      {/* A. Year header */}
      <View style={[styles.header, themeStyles.card]}>
        <Text style={[styles.headerTitle, themeStyles.text]}>📊 {t('reports.year')} {annualData.year}</Text>
        <Text style={styles.headerSub}>Январь — Декабрь</Text>
      </View>

      {/* B. 4 summary cards */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { backgroundColor: '#1D9E75' }]}>
          <Text style={styles.statLabel}>{t('common.revenue')}</Text>
          <Text style={styles.statValue}>{annualData.totals.revenue.toLocaleString()}</Text>
          <Text style={styles.statCurrency}>{currency.symbol}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#0C447C' }]}>
          <Text style={styles.statLabel}>{t('reports.netProfit')}</Text>
          <Text style={styles.statValue}>{annualData.totals.netProfit.toLocaleString()}</Text>
          <Text style={styles.statCurrency}>{currency.symbol}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#854F0B' }]}>
          <Text style={styles.statLabel}>{t('home.salesCount')}</Text>
          <Text style={styles.statValue}>{annualData.totals.salesCount}</Text>
          <Text style={styles.statCurrency}>{t('reports.pcs')}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#FF6B6B' }]}>
          <Text style={styles.statLabel}>{t('reports.expenses')}</Text>
          <Text style={styles.statValue}>{annualData.totals.expenses.toLocaleString()}</Text>
          <Text style={styles.statCurrency}>{currency.symbol}</Text>
        </View>
      </View>

      {/* C. Monthly bar chart */}
      <View style={[styles.section, themeStyles.card]}>
        <Text style={[styles.sectionTitle, themeStyles.text]}>{t('reports.trend')}</Text>
        <BarChart
          stackData={chartData}
          barWidth={20}
          noOfSections={4}
          barBorderRadius={4}
          yAxisThickness={0}
          xAxisThickness={0}
          hideRules
          yAxisTextStyle={{ color: '#999', fontSize: 10 }}
          xAxisLabelTextStyle={{ color: '#999', fontSize: 10 }}
          isAnimated
        />
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#1D9E75' }]} />
            <Text style={[styles.legendText, themeStyles.text]}>{t('common.profit')}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#FF6B6B' }]} />
            <Text style={[styles.legendText, themeStyles.text]}>{t('reports.expenses')}</Text>
          </View>
        </View>
      </View>

      {/* D. Best/Worst month cards */}
      <View style={styles.monthCompareRow}>
        <View style={[styles.monthCard, themeStyles.card, { borderColor: '#1D9E75' }]}>
          <Text style={styles.monthCardLabel}>🏆 Лучший месяц</Text>
          <Text style={[styles.monthCardName, themeStyles.text]}>{MONTH_FULL[bestMonth.month - 1]}</Text>
          <Text style={styles.monthCardValue}>{bestMonth.netProfit.toLocaleString()} {currency.symbol}</Text>
        </View>
        <View style={[styles.monthCard, themeStyles.card, { borderColor: '#FF6B6B' }]}>
          <Text style={styles.monthCardLabel}>📉 Худший месяц</Text>
          <Text style={[styles.monthCardName, themeStyles.text]}>{MONTH_FULL[worstMonth.month - 1]}</Text>
          <Text style={styles.monthCardValue}>{worstMonth.netProfit.toLocaleString()} {currency.symbol}</Text>
        </View>
      </View>

      {/* E. Top 10 products table */}
      <View style={[styles.section, themeStyles.card]}>
        <Text style={[styles.sectionTitle, themeStyles.text]}>🏆 {t('reports.topProducts')}</Text>
        {annualData.topProducts.map((p: any, index: number) => (
          <View key={index} style={styles.productRow}>
            <View style={styles.productRank}>
              <Text style={styles.productRankText}>{index + 1}</Text>
            </View>
            <Text style={[styles.productName, themeStyles.text]} numberOfLines={1}>{p.product_name}</Text>
            <Text style={styles.productProfit}>+{p.totalProfit.toLocaleString()} {currency.symbol}</Text>
          </View>
        ))}
      </View>

      {/* F. Month-by-month table */}
      <View style={[styles.section, themeStyles.card]}>
        <TouchableOpacity
          style={styles.collapseHeader}
          onPress={() => setShowMonths(!showMonths)}
        >
          <Text style={[styles.sectionTitle, themeStyles.text, { marginBottom: 0 }]}>
            Показать по месяцам
          </Text>
          <Text style={styles.collapseIcon}>{showMonths ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {showMonths && (
          <View style={styles.tableContainer}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeadCell, themeStyles.text, { flex: 1.2 }]}>{t('expenses.month')}</Text>
              <Text style={[styles.tableHeadCell, themeStyles.text]}>{t('common.revenue')}</Text>
              <Text style={[styles.tableHeadCell, themeStyles.text]}>{t('common.profit')}</Text>
              <Text style={[styles.tableHeadCell, themeStyles.text]}>{t('reports.expenses')}</Text>
              <Text style={[styles.tableHeadCell, themeStyles.text]}>{t('reports.netProfit')}</Text>
            </View>
            {annualData.months.map((m: any) => (
              <View
                key={m.month}
                style={[
                  styles.tableRow,
                  m.netProfit >= 0 ? styles.rowPositive : styles.rowNegative
                ]}
              >
                <Text style={[styles.tableCell, themeStyles.text, { flex: 1.2 }]}>{MONTH_SHORT[m.month - 1]}</Text>
                <Text style={[styles.tableCell, themeStyles.text]}>{m.revenue.toLocaleString()}</Text>
                <Text style={[styles.tableCell, themeStyles.text]}>{(m.profit || 0).toLocaleString()}</Text>
                <Text style={[styles.tableCell, themeStyles.text]}>{m.expenses.toLocaleString()}</Text>
                <Text style={[
                  styles.tableCell,
                  { fontWeight: 'bold', color: m.netProfit >= 0 ? '#1D9E75' : '#FF6B6B' }
                ]}>
                  {m.netProfit >= 0 ? '+' : ''}{m.netProfit.toLocaleString()}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* G. Export button */}
      <TouchableOpacity style={[styles.exportBtn, themeStyles.card]} onPress={() => setShowExportModal(true)}>
        <Text style={styles.exportBtnText}>📤 {t('reports.exportCsv')}</Text>
      </TouchableOpacity>

      {/* Export Choice Modal */}
      <Modal
        visible={showExportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, themeStyles.card]}>
            <Text style={[styles.modalTitle, themeStyles.text, { marginBottom: 20 }]}>
              Выберите формат экспорта
            </Text>

            <TouchableOpacity
              style={[styles.exportOption, themeStyles.card, { borderWidth: 1, borderColor: '#eee' }]}
              onPress={() => {
                setShowExportModal(false);
                exportToCSV();
              }}
            >
              <View style={styles.exportOptionLeft}>
                <Text style={styles.exportOptionEmoji}>📊</Text>
                <View>
                  <Text style={[styles.exportOptionTitle, themeStyles.text]}>{t('exportSummary.buttonBasic')}</Text>
                  <Text style={styles.exportOptionDesc}>Таблица с данными за год</Text>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.exportOption, themeStyles.card, { borderWidth: 1, borderColor: '#eee' }, isExportLoading && { opacity: 0.7 }]}
              onPress={handleAIExport}
              disabled={isExportLoading}
            >
              <View style={styles.exportOptionLeft}>
                <Text style={styles.exportOptionEmoji}>✨</Text>
                <View>
                  <Text style={[styles.exportOptionTitle, themeStyles.text]}>{t('exportSummary.buttonAI')}</Text>
                  <Text style={styles.exportOptionDesc}>+ годовой анализ от AI</Text>
                  <Text style={styles.exportOptionAd}>
                    {cachedSummary ? `[ ✅ ${t('forecast.buttonLabelCached')} ]` : `[ ${t('extendedReport.watchVideo')} ]`}
                  </Text>
                </View>
              </View>
              {isExportLoading && <ActivityIndicator size="small" color="#1D9E75" />}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setShowExportModal(false)}
            >
              <Text style={styles.modalCancelBtnText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const lightStyles = StyleSheet.create({
  card: { backgroundColor: '#fff' },
  text: { color: '#333' },
});

const darkStyles = StyleSheet.create({
  card: { backgroundColor: '#1E1E1E' },
  text: { color: '#EEE' },
});

const styles = StyleSheet.create({
  container: { paddingBottom: 30 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', padding: 20
  },
  modalContent: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    alignSelf: 'center',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  modalCancelBtn: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  modalCancelBtnText: {
    color: '#888',
    fontSize: 14,
  },
  exportOption: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  exportOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  exportOptionEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  exportOptionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  exportOptionDesc: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  exportOptionAd: {
    fontSize: 11,
    color: '#1D9E75',
    fontWeight: 'bold',
    marginTop: 4,
  },
  header: {
    margin: 16, padding: 16, borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  headerSub: { fontSize: 14, color: '#999', marginTop: 4 },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 10, paddingHorizontal: 16, marginBottom: 16,
  },
  statCard: {
    width: '47%', borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  statLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  statCurrency: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  section: {
    margin: 16, marginTop: 0,
    borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 16 },
  legend: {
    flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 16,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12 },
  monthCompareRow: {
    flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 16,
  },
  monthCard: {
    flex: 1, padding: 12, borderRadius: 12, borderWidth: 1,
  },
  monthCardLabel: { fontSize: 11, color: '#999', marginBottom: 4 },
  monthCardName: { fontSize: 15, fontWeight: 'bold' },
  monthCardValue: { fontSize: 14, color: '#1D9E75', fontWeight: '600', marginTop: 2 },
  productRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderBottomWidth: 0.5, borderBottomColor: '#F0F0F0',
  },
  productRank: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#1D9E75',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  productRankText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  productName: { flex: 1, fontSize: 14 },
  productProfit: { fontSize: 14, fontWeight: 'bold', color: '#1D9E75' },
  collapseHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  collapseIcon: { fontSize: 14, color: '#999' },
  tableContainer: { marginTop: 16 },
  tableHeader: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#EEE',
    paddingBottom: 8, marginBottom: 4,
  },
  tableHeadCell: { flex: 1, fontSize: 12, fontWeight: 'bold', textAlign: 'center' },
  tableRow: {
    flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 4, borderRadius: 4,
    marginBottom: 2,
  },
  tableCell: { flex: 1, fontSize: 11, textAlign: 'center' },
  rowPositive: { backgroundColor: 'rgba(29, 158, 117, 0.05)' },
  rowNegative: { backgroundColor: 'rgba(255, 107, 107, 0.05)' },
  exportBtn: {
    margin: 16, marginTop: 0, padding: 16, borderRadius: 12,
    alignItems: 'center', borderWidth: 1, borderColor: '#1D9E75',
  },
  exportBtnText: { color: '#1D9E75', fontWeight: 'bold' },
});
