import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  PanResponder,
  Animated as RNAnimated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BarChart } from 'react-native-gifted-charts';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '../../context/AppContext';
import { useExpenses } from '../../hooks/useExpenses';
import { Expense } from '../../types/expense';
import { CATEGORY_CONFIG } from './CategoryPicker';
import AddExpenseModal from './AddExpenseModal';

type Period = 1 | 7 | 30;

export default function ExpensesView() {
  const { t, i18n } = useTranslation();
  const { resolvedTheme, currency } = useAppContext(); const isDark = resolvedTheme === "dark";
  const insets = useSafeAreaInsets();
  const { getExpenses, getTotals, deleteExpense } = useExpenses();

  const [period, setPeriod] = useState<Period>(1);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totals, setTotals] = useState({ operational: 0, inventory: 0, total: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [expList, totalData] = await Promise.all([
        getExpenses(period),
        getTotals(period),
      ]);
      setExpenses(expList);
      setTotals(totalData);
    } catch (error) {
      console.error('Failed to load expenses:', error);
    }
  }, [period, getExpenses, getTotals]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleDelete = (expense: Expense) => {
    Alert.alert(
      t('expenses.deleteTitle'),
      t('expenses.deleteMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            await deleteExpense(expense.id);
            loadData();
          }
        }
      ]
    );
  };

  // Group expenses by date
  const groupedExpenses = expenses.reduce((groups: { [key: string]: Expense[] }, expense) => {
    const date = new Date(expense.created_at).toLocaleDateString(i18n.language === 'tg' ? 'tg-TJ' : i18n.language === 'uz' ? 'uz-UZ' : 'ru-RU', {
      day: 'numeric',
      month: 'long',
    });
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(expense);
    return groups;
  }, {});

  const chartData = expenses.length > 0 ? expenses.reduce((acc: any[], expense) => {
    const date = new Date(expense.created_at).toLocaleDateString(i18n.language === 'tg' ? 'tg-TJ' : i18n.language === 'uz' ? 'uz-UZ' : 'ru-RU', { day: 'numeric', month: 'short' });
    const existing = acc.find(d => d.label === date);
    const isOperational = expense.type === 'operational';

    if (existing) {
      if (isOperational) existing.value += expense.amount;
      else existing.stacks[1].value += expense.amount;
    } else {
      acc.push({
        label: date,
        stacks: [
          { value: isOperational ? expense.amount : 0, color: '#FF6B6B' }, // Operational
          { value: !isOperational ? expense.amount : 0, color: '#4ECDC4' }, // Inventory
        ]
      });
    }
    return acc;
  }, []).reverse() : [];

  return (
    <View style={styles.fullContainer}>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, isDark ? styles.cardDark : styles.cardLight]}>
            <Text style={styles.summaryLabel}>{t('expenses.operational')}</Text>
            <Text style={[styles.summaryValue, { color: '#FF6B6B' }]}>
              {totals.operational.toLocaleString()}
            </Text>
          </View>
          <View style={[styles.summaryCard, isDark ? styles.cardDark : styles.cardLight]}>
            <Text style={styles.summaryLabel}>{t('expenses.inventory')}</Text>
            <Text style={[styles.summaryValue, { color: '#4ECDC4' }]}>
              {totals.inventory.toLocaleString()}
            </Text>
          </View>
          <View style={[styles.summaryCard, isDark ? styles.cardDark : styles.cardLight]}>
            <Text style={styles.summaryLabel}>{t('expenses.total')}</Text>
            <Text style={[styles.summaryValue, isDark ? styles.textDark : styles.textLight]}>
              {totals.total.toLocaleString()}
            </Text>
          </View>
        </View>

        {/* Period Switcher */}
        <View style={styles.periodRow}>
          {[
            { label: t('expenses.today'), val: 1 },
            { label: t('expenses.week'), val: 7 },
            { label: t('expenses.month'), val: 30 },
          ].map((p) => (
            <TouchableOpacity
              key={p.val}
              onPress={() => setPeriod(p.val as Period)}
              style={styles.periodBtn}
            >
              <Text style={[
                styles.periodText,
                period === p.val && styles.periodTextActive,
                period !== p.val && (isDark ? styles.textDarkSecondary : styles.textLightSecondary)
              ]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Chart */}
        {chartData.length > 0 && (
          <View style={[styles.chartSection, isDark ? styles.cardDark : styles.cardLight]}>
            <BarChart
              stackData={chartData}
              barWidth={period === 30 ? 10 : 25}
              noOfSections={3}
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
                 <View style={[styles.legendDot, { backgroundColor: '#FF6B6B' }]} />
                 <Text style={styles.legendText}>{t('expenses.operational')}</Text>
               </View>
               <View style={styles.legendItem}>
                 <View style={[styles.legendDot, { backgroundColor: '#4ECDC4' }]} />
                 <Text style={styles.legendText}>{t('expenses.inventory')}</Text>
               </View>
            </View>
          </View>
        )}

        {/* Expense List */}
        {Object.keys(groupedExpenses).length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('expenses.empty')}</Text>
          </View>
        ) : (
          Object.keys(groupedExpenses).map((date) => (
            <View key={date} style={styles.dateGroup}>
              <Text style={styles.dateHeader}>— {date} ─────────────────</Text>
              {groupedExpenses[date].map((expense) => (
                <ExpenseListItem
                  key={String(expense.id)}
                  expense={expense}
                  onDelete={() => handleDelete(expense)}
                  isDark={isDark}
                  currency={currency}
                  t={t}
                />
              ))}
            </View>
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: 30 + insets.bottom }]}
        onPress={() => setModalVisible(true)}
      >
        <Ionicons name="add" size={30} color="#fff" />
        <Text style={styles.fabText}>{t('expenses.addExpense')}</Text>
      </TouchableOpacity>

      <AddExpenseModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSuccess={loadData}
      />
    </View>
  );
}

function ExpenseListItem({ expense, onDelete, isDark, currency, t }: { expense: Expense, onDelete: () => void, isDark: boolean, currency: any, t: any }) {
  const translateX = React.useRef(new RNAnimated.Value(0)).current;

  const panResponder = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 10,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) {
          translateX.setValue(gestureState.dx);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -100) {
          RNAnimated.timing(translateX, {
            toValue: -1000,
            duration: 200,
            useNativeDriver: true,
          }).start(() => onDelete());
        } else {
          RNAnimated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  return (
    <View style={styles.swipeContainer}>
      <View style={styles.deleteBackground}>
        <Ionicons name="trash" size={24} color="#fff" />
      </View>
      <RNAnimated.View
        style={[
          styles.expenseItem,
          isDark ? styles.cardDark : styles.cardLight,
          { transform: [{ translateX }] }
        ]}
        {...panResponder.panHandlers}
      >
        <View style={styles.expenseIcon}>
          <Text style={{ fontSize: 20 }}>{CATEGORY_CONFIG[expense.category].icon}</Text>
        </View>
        <View style={styles.expenseInfo}>
          <Text style={[styles.expenseTitle, isDark ? styles.textDark : styles.textLight]}>
            {expense.description || t(`expenses.categories.${CATEGORY_CONFIG[expense.category].translationKey}`)}
          </Text>
          <Text style={styles.expenseTime}>
            {new Date(expense.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        <Text style={styles.expenseAmount}>
          -{expense.amount.toLocaleString()} {currency.symbol}
        </Text>
      </RNAnimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullContainer: { flex: 1 },
  container: { flex: 1, padding: 16 },
  swipeContainer: {
    position: 'relative',
    marginBottom: 8,
  },
  deleteBackground: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 100,
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardLight: { backgroundColor: '#fff' },
  cardDark: { backgroundColor: '#1E1E1E' },
  summaryLabel: {
    fontSize: 10,
    color: '#999',
    marginBottom: 4,
    textAlign: 'center',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  periodRow: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  periodBtn: {},
  periodText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#999',
  },
  periodTextActive: {
    color: '#1D9E75',
    textDecorationLine: 'underline',
  },
  chartSection: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 15,
    marginTop: 15,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    color: '#999',
  },
  dateGroup: {
    marginBottom: 20,
  },
  dateHeader: {
    fontSize: 12,
    color: '#999',
    marginBottom: 10,
  },
  expenseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  expenseIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  expenseInfo: {
    flex: 1,
  },
  expenseTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  expenseTime: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF6B6B',
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    backgroundColor: '#FF6B6B',
    borderRadius: 30,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  fabText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 5,
  },
  empty: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    color: '#999',
  },
  textLight: { color: '#333' },
  textDark: { color: '#EEE' },
  textLightSecondary: { color: '#666' },
  textDarkSecondary: { color: '#aaa' },
});
