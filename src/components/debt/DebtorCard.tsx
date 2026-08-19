import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Radius, Shadow } from '../../constants/theme';

interface Debt {
  id: number;
  client_name: string;
  client_phone?: string | null;
  due_date?: string | null;
  created_at: string;
  amount_total: number;
  amount_paid: number;
}

interface DebtorCardProps {
  item: Debt;
  today: string;
  currency: { symbol: string };
  t: (key: string, opts?: any) => string;
  themeStyles: { card: any; text: any };
  onPress: (item: Debt) => void;
}

function DebtorCard({
  item,
  today,
  currency,
  t,
  themeStyles,
  onPress,
}: DebtorCardProps) {
  const remaining = item.amount_total - item.amount_paid;
  const pct = Math.round((item.amount_paid / item.amount_total) * 100);
  const isOverdue = !!(item.due_date && item.due_date < today);
  const locale = t('tabs.home') === 'Главная' ? 'ru-RU' : t('tabs.home') === 'Асосӣ' ? 'tg-TJ' : 'uz-UZ';

  return (
    <TouchableOpacity
      style={[styles.card, themeStyles.card]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.cardRow}>
        <View style={styles.cardLeft}>
          <View style={styles.cardNameRow}>
            <Text style={[styles.clientName, themeStyles.text]}>{item.client_name}</Text>
            <View style={[styles.statusPill, isOverdue ? styles.statusOverdue : styles.statusActive]}>
              <Text style={styles.statusText}>{isOverdue ? t('debtors.statusOverdue') : t('debtors.statusActive')}</Text>
            </View>
          </View>
          {item.client_phone ? (
            <Text style={styles.clientPhone}>{item.client_phone}</Text>
          ) : null}
          {item.due_date ? (
            <Text style={[styles.debtDate, isOverdue && { color: '#E53935' }]}>
              {t('debtors.term')}: {new Date(item.due_date + 'T00:00:00').toLocaleDateString(locale, {
                day: 'numeric', month: 'short', year: 'numeric'
              })}
            </Text>
          ) : (
            <Text style={styles.debtDate}>
              {new Date(item.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
            </Text>
          )}
        </View>
        <View style={styles.cardRight}>
          <Text style={styles.remaining}>
            {remaining.toLocaleString()} {currency.symbol}
          </Text>
          <Text style={styles.totalSmall}>
            {t('debtors.fromTotal', { total: item.amount_total.toLocaleString() })}
          </Text>
        </View>
      </View>
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
      </View>
    </TouchableOpacity>
  );
}

// item — новый объект при каждом делта-синке (SyncService пересобирает
// массив), поэтому сравниваем по полям, которые реально влияют на
// отображение, а не по ссылке — иначе memo ничего бы не давал: после
// любого фонового синка все карточки всё равно перерисовывались бы.
// t сравниваем по ссылке (как и остальные пропы) — при смене языка
// useTranslation() возвращает новую ссылку, и карточка обязана
// перерисоваться с актуальным переводом.
function areEqual(prev: DebtorCardProps, next: DebtorCardProps): boolean {
  return (
    prev.item.id === next.item.id &&
    prev.item.client_name === next.item.client_name &&
    prev.item.client_phone === next.item.client_phone &&
    prev.item.due_date === next.item.due_date &&
    prev.item.amount_total === next.item.amount_total &&
    prev.item.amount_paid === next.item.amount_paid &&
    prev.today === next.today &&
    prev.currency === next.currency &&
    prev.t === next.t &&
    prev.themeStyles === next.themeStyles &&
    prev.onPress === next.onPress
  );
}

export default React.memo(DebtorCard, areEqual);

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.md, padding: 14, marginBottom: 10,
    ...Shadow.md,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cardLeft: { flex: 1 },
  cardRight: { alignItems: 'flex-end' },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clientName: { fontSize: 16, fontWeight: '600' },
  clientPhone: { fontSize: 12, color: '#999', marginTop: 2 },
  debtDate: { fontSize: 11, color: '#bbb', marginTop: 4 },
  remaining: { fontSize: 18, fontWeight: 'bold', color: '#E53935' },
  totalSmall: { fontSize: 11, color: '#999', marginTop: 2 },
  progressBg: {
    height: 4, backgroundColor: '#F0F0F0',
    borderRadius: 2, marginTop: 10, overflow: 'hidden',
  },
  progressFill: { height: 4, backgroundColor: '#1D9E75', borderRadius: 2 },
  statusPill: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  statusActive: { backgroundColor: Colors.warningLight },
  statusOverdue: { backgroundColor: Colors.dangerLight },
  statusText: { fontSize: 11, fontWeight: '600' },
});
