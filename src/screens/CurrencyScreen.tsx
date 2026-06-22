import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, TextInput, ActivityIndicator, RefreshControl
} from 'react-native';
import { getBaseRates, FALLBACK_RATES } from '../utils/currencyRates';
import UniversalBanner from '../components/ads/UniversalBanner';
import { useAppContext } from '../context/AppContext';

const CURRENCIES = [
  { code: 'USD', name: 'Доллар США',       flag: '🇺🇸' },
  { code: 'RUB', name: 'Российский рубль', flag: '🇷🇺' },
  { code: 'CNY', name: 'Китайский юань',   flag: '🇨🇳' },
  { code: 'UZS', name: 'Узбекский сум',    flag: '🇺🇿' },
  { code: 'EUR', name: 'Евро',             flag: '🇪🇺' },
  { code: 'KZT', name: 'Казахский тенге',  flag: '🇰🇿' },
  { code: 'KGS', name: 'Киргизский сом',   flag: '🇰🇬' },
];

const QUICK_CARDS = [
  { label: '1 000 руб', code: 'RUB', amount: 1000 },
  { label: '100 USD',   code: 'USD', amount: 100  },
  { label: '1 юань',    code: 'CNY', amount: 1    },
  { label: '1 000 сум', code: 'UZS', amount: 1000 },
];

const FROM_OPTIONS = ['USD', 'RUB', 'CNY', 'UZS', 'KZT', 'EUR', 'KGS', 'TJS'];
const TO_OPTIONS   = ['TJS', 'USD', 'RUB', 'CNY', 'UZS', 'KZT', 'EUR', 'KGS'];

export default function CurrencyScreen() {
  const { resolvedTheme } = useAppContext();
  const isDark = resolvedTheme === 'dark';
  const themeStyles = isDark ? darkStyles : lightStyles;
  const [rates, setRates]           = useState<Record<string, number>>(FALLBACK_RATES);
  const [updatedAt, setUpdatedAt]   = useState<string>('');
  const [loading, setLoading]       = useState(true);
  const [offline, setOffline]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Конвертер
  const [amount, setAmount]   = useState('100');
  const [fromCur, setFromCur] = useState('USD');
  const [toCur, setToCur]     = useState('TJS');

  useEffect(() => { fetchRates(false); }, []);

  const fetchRates = async (force: boolean) => {
    try {
      const result = await getBaseRates(force);
      setRates(result.rates);
      setOffline(result.source === 'fallback');

      if (result.source === 'fallback') {
        setUpdatedAt('офлайн — примерные курсы');
      } else {
        const dt = new Date(result.fetchedAt);
        setUpdatedAt(dt.toLocaleString('ru-RU', {
          day: 'numeric', month: 'short',
          hour: '2-digit', minute: '2-digit'
        }));
      }
    } catch (e) {
      setOffline(true);
      setRates(FALLBACK_RATES);
      setUpdatedAt('офлайн — примерные курсы');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => { setRefreshing(true); fetchRates(true); };

  // Конвертация через TJS как базу
  const convertAmount = (amt: number, from: string, to: string): number => {
    if (!rates[from] || !rates[to]) return 0;
    const inTJS = amt / rates[from];
    return inTJS * rates[to];
  };

  const fmt = (n: number): string => {
    if (isNaN(n) || n === 0) return '—';
    if (n >= 1) return n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
    return n.toFixed(4);
  };

  const convResult = convertAmount(parseFloat(amount) || 0, fromCur, toCur);
  const rate1 = convertAmount(1, fromCur, toCur);

  return (
    <ScrollView
      style={[styles.container, themeStyles.container]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Шапка с быстрыми карточками */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Курсы валют</Text>
          {loading
            ? <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
            : <Text style={styles.updatedAt}>{updatedAt}</Text>
          }
        </View>

        {offline && (
          <View style={styles.offlineBadge}>
            <Text style={styles.offlineBadgeText}>⚠️ Нет интернета — примерные курсы</Text>
          </View>
        )}

        <Text style={styles.quickLabel}>Быстрый расчёт</Text>
        <View style={styles.quickGrid}>
          {QUICK_CARDS.map(q => {
            const val = convertAmount(q.amount, q.code, 'TJS');
            const rate1str = fmt(convertAmount(1, q.code, 'TJS'));
            return (
              <View key={q.code} style={styles.quickCard}>
                <Text style={styles.quickCardLabel}>{q.label} →</Text>
                <Text style={styles.quickCardVal}>
                  {val ? fmt(val) + ' TJS' : '—'}
                </Text>
                <Text style={styles.quickCardRate}>
                  1 {q.code} = {rate1str} TJS
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Конвертер */}
      <View style={[styles.section, themeStyles.section]}>
        <Text style={[styles.sectionTitle, themeStyles.sectionTitle]}>Конвертер</Text>

        <Text style={styles.label}>Сумма</Text>
        <TextInput
          style={[styles.input, themeStyles.input]}
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
          placeholder="0"
          placeholderTextColor={isDark ? '#888' : '#aaa'}
        />

        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={styles.label}>Из</Text>
            <View style={styles.pickerWrap}>
              {FROM_OPTIONS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.pickerItem, themeStyles.pickerItem, fromCur === c && styles.pickerItemActive]}
                  onPress={() => setFromCur(c)}
                >
                  <Text style={[styles.pickerText, themeStyles.pickerText, fromCur === c && styles.pickerTextActive]}>
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.swapCol}>
            <TouchableOpacity
              style={[styles.swapBtn, themeStyles.swapBtn]}
              onPress={() => { setFromCur(toCur); setToCur(fromCur); }}
            >
              <Text style={styles.swapBtnText}>⇄</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.half}>
            <Text style={styles.label}>В</Text>
            <View style={styles.pickerWrap}>
              {TO_OPTIONS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.pickerItem, themeStyles.pickerItem, toCur === c && styles.pickerItemActive]}
                  onPress={() => setToCur(c)}
                >
                  <Text style={[styles.pickerText, themeStyles.pickerText, toCur === c && styles.pickerTextActive]}>
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <View style={[styles.resultBox, themeStyles.resultBox]}>
          <Text style={styles.resultMain}>{fmt(convResult)} {toCur}</Text>
          <Text style={styles.resultSub}>
            1 {fromCur} = {fmt(rate1)} {toCur}
          </Text>
        </View>
      </View>

      {/* Таблица курсов */}
      <View style={[styles.section, themeStyles.section]}>
        <Text style={[styles.sectionTitle, themeStyles.sectionTitle]}>Все курсы к сомони (TJS)</Text>
        {CURRENCIES.map((c, i) => {
          const tjsVal  = fmt(convertAmount(1, c.code, 'TJS'));
          const invVal  = fmt(convertAmount(1, 'TJS', c.code));
          return (
            <View
              key={c.code}
              style={[styles.rateRow, themeStyles.rateRow, i === CURRENCIES.length - 1 && { borderBottomWidth: 0 }]}
            >
              <View style={styles.rateLeft}>
                <Text style={styles.rateFlag}>{c.flag}</Text>
                <View>
                  <Text style={[styles.rateCode, themeStyles.rateCode]}>{c.code}</Text>
                  <Text style={styles.rateName}>{c.name}</Text>
                </View>
              </View>
              <View style={styles.rateRight}>
                <Text style={[styles.rateVal, themeStyles.rateCode]}>{tjsVal} <Text style={styles.rateCur}>TJS</Text></Text>
                <Text style={styles.rateInv}>1 TJS = {invVal} {c.code}</Text>
              </View>
            </View>
          );
        })}

        <TouchableOpacity style={styles.refreshBtn} onPress={() => fetchRates(true)}>
          <Text style={styles.refreshBtnText}>Обновить курсы</Text>
        </TouchableOpacity>
      </View>

      <View style={{ width: '100%' }}>
        <UniversalBanner />
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const GREEN = '#1D9E75';

const lightStyles = StyleSheet.create({
  container: { backgroundColor: '#F5F5F5' },
  section: { backgroundColor: '#fff', borderColor: '#E0E0E0' },
  sectionTitle: { color: '#333' },
  input: { backgroundColor: '#F5F5F5', color: '#222', borderColor: '#E0E0E0' },
  pickerItem: { backgroundColor: '#F9F9F9', borderColor: '#E0E0E0' },
  pickerText: { color: '#555' },
  swapBtn: { backgroundColor: '#F0FBF7' },
  resultBox: { backgroundColor: '#F0FBF7' },
  rateRow: { borderBottomColor: '#F0F0F0' },
  rateCode: { color: '#222' },
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: '#000' },
  section: { backgroundColor: '#1E1E1E', borderColor: '#333' },
  sectionTitle: { color: '#EEE' },
  input: { backgroundColor: '#2C2C2C', color: '#EEE', borderColor: '#444' },
  pickerItem: { backgroundColor: '#2C2C2C', borderColor: '#444' },
  pickerText: { color: '#AAA' },
  swapBtn: { backgroundColor: '#16332A' },
  resultBox: { backgroundColor: '#16332A' },
  rateRow: { borderBottomColor: '#333' },
  rateCode: { color: '#EEE' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },

  header: { backgroundColor: GREEN, padding: 16, paddingBottom: 20 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  headerTitle: { fontSize: 18, fontWeight: '500', color: '#fff' },
  updatedAt: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },

  offlineBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8,
    padding: 8, marginVertical: 8,
  },
  offlineBadgeText: { fontSize: 12, color: '#fff', textAlign: 'center' },

  quickLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 14, marginBottom: 8 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickCard: {
    width: '47.5%',
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderRadius: 10, padding: 12,
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.2)',
  },
  quickCardLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  quickCardVal: { fontSize: 17, fontWeight: '500', color: '#fff' },
  quickCardRate: { fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 3 },

  section: {
    margin: 16, marginBottom: 0, backgroundColor: '#fff',
    borderRadius: 16, padding: 16,
    borderWidth: 0.5, borderColor: '#E0E0E0',
  },
  sectionTitle: { fontSize: 15, fontWeight: '500', color: '#333', marginBottom: 12 },

  label: { fontSize: 12, color: '#888', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#F5F5F5', borderRadius: 10, padding: 13,
    fontSize: 18, color: '#222', borderWidth: 0.5, borderColor: '#E0E0E0',
  },

  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4 },
  half: { flex: 1 },
  swapCol: { paddingTop: 28, alignItems: 'center' },
  swapBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F0FBF7', borderWidth: 0.5, borderColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
  },
  swapBtnText: { fontSize: 16, color: GREEN },

  pickerWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  pickerItem: {
    paddingHorizontal: 8, paddingVertical: 5,
    borderRadius: 8, borderWidth: 0.5, borderColor: '#E0E0E0',
    backgroundColor: '#F9F9F9',
  },
  pickerItemActive: { backgroundColor: GREEN, borderColor: GREEN },
  pickerText: { fontSize: 12, color: '#555', fontWeight: '500' },
  pickerTextActive: { color: '#fff' },

  resultBox: {
    marginTop: 14, backgroundColor: '#F0FBF7', borderRadius: 12,
    padding: 16, alignItems: 'center',
    borderWidth: 0.5, borderColor: GREEN,
  },
  resultMain: { fontSize: 28, fontWeight: '500', color: GREEN },
  resultSub: { fontSize: 12, color: '#888', marginTop: 5 },

  rateRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#F0F0F0',
  },
  rateLeft: { flexDirection: 'row', alignItems: 'center' },
  rateFlag: { fontSize: 22, marginRight: 10 },
  rateCode: { fontSize: 14, fontWeight: '500', color: '#222' },
  rateName: { fontSize: 11, color: '#999', marginTop: 1 },
  rateRight: { alignItems: 'flex-end' },
  rateVal: { fontSize: 15, fontWeight: '500', color: '#222' },
  rateCur: { fontSize: 12, color: '#999', fontWeight: '400' },
  rateInv: { fontSize: 11, color: '#aaa', marginTop: 2 },

  refreshBtn: {
    marginTop: 14, padding: 12, borderRadius: 10,
    borderWidth: 0.5, borderColor: GREEN, alignItems: 'center',
  },
  refreshBtnText: { fontSize: 13, color: GREEN, fontWeight: '500' },
});