import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, TextInput, Modal, KeyboardAvoidingView, Platform,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import {
  getDebtsWithClients, recordDebtPayment, getDebtPayments,
} from '../db/database';

export default function DebtorsScreen() {
  const { resolvedTheme, currency } = useAppContext();
  const isDark = resolvedTheme === 'dark';
  const themeStyles = isDark ? darkStyles : lightStyles;

  const [debts, setDebts] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [payments, setPayments] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);

  const loadDebts = useCallback(() => {
    setDebts(getDebtsWithClients() as any[]);
  }, []);

  useFocusEffect(useCallback(() => { loadDebts(); }, [loadDebts]));

  const onRefresh = () => {
    setRefreshing(true);
    loadDebts();
    setRefreshing(false);
  };

  const openClient = (debt: any) => {
    setSelectedDebt(debt);
    setPayments(getDebtPayments(debt.id) as any[]);
    setPaymentAmount('');
    setPaymentNote('');
    setShowModal(true);
  };

  const handlePayment = () => {
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Ошибка', 'Введите сумму платежа');
      return;
    }
    const remaining = selectedDebt.amount_total - selectedDebt.amount_paid;
    if (amount > remaining) {
      Alert.alert('Ошибка', `Максимальная сумма: ${remaining.toFixed(0)} ${currency.symbol}`);
      return;
    }
    recordDebtPayment(selectedDebt.id, amount, paymentNote);
    setShowModal(false);
    loadDebts();
    Alert.alert('✅ Платёж записан', `${amount} ${currency.symbol}`);
  };

  const totalRemaining = debts.reduce((sum, d) => sum + d.remaining, 0);

  const renderItem = ({ item }: { item: any }) => {
    const remaining = item.amount_total - item.amount_paid;
    const pct = Math.round((item.amount_paid / item.amount_total) * 100);
    return (
      <TouchableOpacity
        style={[styles.card, themeStyles.card]}
        onPress={() => openClient(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardRow}>
          <View style={styles.cardLeft}>
            <Text style={[styles.clientName, themeStyles.text]}>{item.client_name}</Text>
            {item.client_phone ? (
              <Text style={styles.clientPhone}>{item.client_phone}</Text>
            ) : null}
            <Text style={styles.debtDate}>
              {new Date(item.created_at).toLocaleDateString('ru-RU', {
                day: 'numeric', month: 'short',
              })}
            </Text>
          </View>
          <View style={styles.cardRight}>
            <Text style={styles.remaining}>
              {remaining.toLocaleString()} {currency.symbol}
            </Text>
            <Text style={styles.totalSmall}>
              из {item.amount_total.toLocaleString()}
            </Text>
          </View>
        </View>
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, themeStyles.container]}>
      {/* Summary header */}
      <View style={[styles.summary, themeStyles.card]}>
        <Text style={styles.summaryLabel}>Итого должны</Text>
        <Text style={[styles.summaryValue, themeStyles.text]}>
          {totalRemaining.toLocaleString()} {currency.symbol}
        </Text>
        <Text style={styles.summaryCount}>{debts.length} чел.</Text>
      </View>

      <FlatList
        data={debts}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle-outline" size={64} color="#1D9E75" />
            <Text style={styles.emptyText}>Долгов нет</Text>
          </View>
        }
      />

      {/* Payment modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, themeStyles.card]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, themeStyles.text]}>
                {selectedDebt?.client_name}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color={isDark ? '#fff' : '#000'} />
              </TouchableOpacity>
            </View>

            {selectedDebt && (
              <View style={styles.debtInfo}>
                <Text style={styles.debtInfoText}>
                  Долг: {selectedDebt.amount_total.toLocaleString()} {currency.symbol}
                </Text>
                <Text style={styles.debtInfoText}>
                  Оплачено: {selectedDebt.amount_paid.toLocaleString()} {currency.symbol}
                </Text>
                <Text style={[styles.debtInfoRemaining, { color: '#E53935' }]}>
                  Остаток: {(selectedDebt.amount_total - selectedDebt.amount_paid).toLocaleString()} {currency.symbol}
                </Text>
              </View>
            )}

            {payments.length > 0 && (
              <View style={styles.paymentHistory}>
                <Text style={[styles.historyTitle, themeStyles.text]}>История платежей</Text>
                {payments.map((p: any) => (
                  <View key={String(p.id)} style={styles.historyItem}>
                    <Text style={styles.historyDate}>
                      {new Date(p.created_at).toLocaleDateString('ru-RU', {
                        day: 'numeric', month: 'short',
                      })}
                    </Text>
                    <Text style={styles.historyAmount}>
                      +{p.amount.toLocaleString()} {currency.symbol}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={[styles.label, themeStyles.text]}>Записать платёж</Text>
            <TextInput
              style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
              placeholder="Сумма"
              placeholderTextColor={isDark ? '#888' : '#aaa'}
              keyboardType="numeric"
              value={paymentAmount}
              onChangeText={setPaymentAmount}
              autoFocus
            />
            <TextInput
              style={[styles.input, isDark ? styles.inputDark : styles.inputLight, { marginTop: 8 }]}
              placeholder="Заметка (необязательно)"
              placeholderTextColor={isDark ? '#888' : '#aaa'}
              value={paymentNote}
              onChangeText={setPaymentNote}
            />
            <TouchableOpacity style={styles.payBtn} onPress={handlePayment}>
              <Text style={styles.payBtnText}>Сохранить платёж</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
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
  summary: {
    margin: 16, marginBottom: 8, padding: 16,
    borderRadius: 12, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
  },
  summaryLabel: { fontSize: 13, color: '#999', marginBottom: 4 },
  summaryValue: { fontSize: 28, fontWeight: 'bold' },
  summaryCount: { fontSize: 13, color: '#1D9E75', marginTop: 2 },
  card: {
    borderRadius: 12, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cardLeft: { flex: 1 },
  cardRight: { alignItems: 'flex-end' },
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
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 16, color: '#999' },
  modalOverlay: {
    flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  debtInfo: { marginBottom: 16, gap: 4 },
  debtInfoText: { fontSize: 14, color: '#666' },
  debtInfoRemaining: { fontSize: 16, fontWeight: 'bold' },
  paymentHistory: { marginBottom: 16 },
  historyTitle: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  historyItem: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#F0F0F0',
  },
  historyDate: { fontSize: 13, color: '#999' },
  historyAmount: { fontSize: 13, fontWeight: '600', color: '#1D9E75' },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 6 },
  input: {
    borderRadius: 8, padding: 12, fontSize: 15, borderWidth: 1,
  },
  inputLight: { backgroundColor: '#F5F5F5', borderColor: '#E0E0E0', color: '#333' },
  inputDark:  { backgroundColor: '#2C2C2C', borderColor: '#444',    color: '#EEE' },
  payBtn: {
    backgroundColor: '#1D9E75', borderRadius: 12,
    padding: 16, alignItems: 'center', marginTop: 16,
  },
  payBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
