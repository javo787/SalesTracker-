import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Dimensions, Share
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { api } from '../services/api';
import { Colors, Shadow } from '../constants/theme';
import { useAppContext } from '../context/AppContext';
import { todayLocalDate } from '../db/database';

type RouteParams = {
  CheckInHistory: {
    userId: string;
    sellerName: string;
  };
};

export default function CheckInHistoryScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'CheckInHistory'>>();
  const { userId, sellerName } = route.params;

  const { resolvedTheme } = useAppContext();
  const isDark = resolvedTheme === 'dark';
  const themeStyles = isDark ? darkStyles : lightStyles;

  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch check-in history for all members, filter for our seller later
      const data = await api.get<any[]>(`/shop/checkin/history?period=${period}`);
      const sellerHistory = data.find((h: any) => h.userId === userId);
      if (sellerHistory) {
        setHistoryData(sellerHistory.days || []);
      } else {
        setHistoryData([]);
      }
    } catch (e: any) {
      console.error('Failed to load check-in history:', e);
      Alert.alert(t('common.error'), e.message || 'Error loading history');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, period, t]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleManualConfirm = async (localDate: string) => {
    Alert.alert(
      t('checkIn.manualConfirmTitle', 'Подтвердить вручную'),
      t('checkIn.manualConfirmPrompt', { name: sellerName, date: localDate }) || `Подтвердить приход ${sellerName} вручную за ${localDate}?`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.continue') || 'Продолжить',
          onPress: async () => {
            try {
              setSubmitting(true);
              await api.patch(`/shop/checkin/${userId}/manual-confirm`, { localDate });
              Alert.alert(t('common.success'), t('common.saved') || 'Сохранено!');
              loadHistory();
            } catch (e: any) {
              Alert.alert(t('common.error'), e.message || 'Failed to confirm');
            } finally {
              setSubmitting(false);
            }
          }
        }
      ]
    );
  };

  const exportToCSV = async () => {
    try {
      // Columns: Продавец, Дата, Статус, Способ(ы), Владелец подтвердил вручную (да/пусто).
      const header = `${t('checkIn.csvSeller', 'Продавец')},${t('checkIn.csvDate', 'Дата')},${t('checkIn.csvStatus', 'Статус')},${t('checkIn.csvMethods', 'Способ(ы)')},${t('checkIn.csvOverride', 'Владелец подтвердил вручную (да/пусто)')}\n`;

      const rows = historyData.map((day: any) => {
        let statusText = '';
        if (day.status === 'confirmed') statusText = t('checkIn.statusConfirmed', 'Присутствие подтверждено!');
        else if (day.status === 'partial') statusText = t('checkIn.statusPartial', 'Частично');
        else statusText = t('checkIn.statusMissing', 'Отсутствует');

        const methods = (day.methodsUsed || []).map((m: any) => m.method.toUpperCase()).join('; ');
        const overrideText = day.ownerOverride ? t('common.yes') || 'Да' : '';

        return `${sellerName},${day.localDate},${statusText},"${methods}",${overrideText}`;
      }).join('\n');

      const csvContent = '\uFEFF' + header + rows;
      const fileName = `checkin_history_${sellerName}_${period}.csv`;
      const filePath = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(filePath, csvContent, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'text/csv',
          dialogTitle: t('reports.exportTitle') || 'Экспорт отчёта',
          UTI: 'public.comma-separated-values-text'
        });
      } else {
        Alert.alert(t('common.error'), t('common.sharingNotAvailable') || 'Общий доступ недоступен');
      }
    } catch (e: any) {
      console.error('CSV Export error:', e);
      Alert.alert(t('common.error'), e.message || 'Export failed');
    }
  };

  const getStatusColor = (status: string, override: boolean) => {
    if (override) return '#42A5F5'; // Blue for owner override
    if (status === 'confirmed') return Colors.primary || '#1D9E75';
    if (status === 'partial') return '#FFA726'; // Orange
    return '#EF5350'; // Red
  };

  const getStatusLabel = (status: string, override: boolean) => {
    if (override) return t('checkIn.statusOverrideLabel', '✅ Подтверждено владельцем');
    if (status === 'confirmed') return t('checkIn.statusConfirmedLabel', '✅ Присутствует');
    if (status === 'partial') return t('checkIn.statusPartialLabel', '⚠️ Частично');
    return t('checkIn.statusMissingLabel', '❌ Не отмечен');
  };

  return (
    <ScrollView style={[styles.container, themeStyles.container]}>
      <View style={{ height: Math.max(insets.top, 16) }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={isDark ? '#FFF' : '#000'} />
        </TouchableOpacity>
        <Text style={[styles.title, themeStyles.text]}>{sellerName}</Text>
      </View>

      <View style={styles.periodRow}>
        {(['week', 'month'] as const).map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.periodBtn, themeStyles.periodBtn, period === p && styles.periodBtnActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.periodText, themeStyles.periodText, period === p && styles.periodTextActive]}>
              {t(`reports.${p === 'week' ? 'days7' : 'days30'}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <View style={styles.historyList}>
          {historyData.slice().reverse().map((day) => {
            const isToday = day.localDate === todayLocalDate();
            const canOverride = isToday && day.status !== 'confirmed';

            return (
              <View key={day.localDate} style={[styles.dayCard, themeStyles.card]}>
                <View style={styles.dayHeader}>
                  <Text style={[styles.dayDate, themeStyles.text]}>{day.localDate}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(day.status, day.ownerOverride) }]}>
                    <Text style={styles.statusBadgeText}>
                      {getStatusLabel(day.status, day.ownerOverride)}
                    </Text>
                  </View>
                </View>

                {day.methodsUsed && day.methodsUsed.length > 0 && (
                  <View style={styles.methodsContainer}>
                    {day.methodsUsed.map((m: any, idx: number) => (
                      <View key={idx} style={styles.methodRow}>
                        <Ionicons
                          name={m.method === 'gps' ? 'location-outline' : m.method === 'nfc' ? 'phone-portrait-outline' : 'qr-code-outline'}
                          size={16}
                          color={isDark ? '#AAA' : '#666'}
                        />
                        <Text style={[styles.methodText, themeStyles.subtext]}>
                          {m.method.toUpperCase()} · {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {m.gpsDistanceMeters !== undefined && ` · ~${Math.round(m.gpsDistanceMeters)}м`}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {canOverride && (
                  <TouchableOpacity
                    style={[styles.confirmBtn, { backgroundColor: Colors.primary }]}
                    onPress={() => handleManualConfirm(day.localDate)}
                    disabled={submitting}
                  >
                    <Text style={styles.confirmBtnText}>
                      {t('checkIn.manualConfirmBtn', 'Подтвердить вручную')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      )}

      {!loading && historyData.length > 0 && (
        <TouchableOpacity style={[styles.exportBtn, themeStyles.card]} onPress={exportToCSV}>
          <Text style={styles.exportBtnText}>📤 {t('reports.exportCsv') || 'Экспорт CSV'}</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const lightStyles = StyleSheet.create({
  container: { backgroundColor: '#F8F9FA' },
  card: { backgroundColor: '#FFF' },
  text: { color: '#333' },
  subtext: { color: '#666' },
  periodBtn: { backgroundColor: '#EEE' },
  periodText: { color: '#666' },
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: '#121212' },
  card: { backgroundColor: '#1E1E1E' },
  text: { color: '#EEE' },
  subtext: { color: '#AAA' },
  periodBtn: { backgroundColor: '#333' },
  periodText: { color: '#AAA' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { padding: 40, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20 },
  backBtn: { marginRight: 15 },
  title: { fontSize: 20, fontWeight: 'bold' },
  periodRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 15 },
  periodBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 },
  periodBtnActive: { backgroundColor: Colors.primary },
  periodText: { fontSize: 13 },
  periodTextActive: { color: '#FFF', fontWeight: '600' },
  historyList: { paddingHorizontal: 20, gap: 12 },
  dayCard: { padding: 16, borderRadius: 12, ...Shadow.sm },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  dayDate: { fontSize: 16, fontWeight: '600' },
  statusBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
  statusBadgeText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  methodsContainer: { gap: 6, marginTop: 4 },
  methodRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  methodText: { fontSize: 13 },
  confirmBtn: { marginTop: 12, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  confirmBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  exportBtn: {
    margin: 20, padding: 16, borderRadius: 12,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.primary || '#1D9E75',
  },
  exportBtnText: { color: Colors.primary || '#1D9E75', fontWeight: 'bold' },
});
