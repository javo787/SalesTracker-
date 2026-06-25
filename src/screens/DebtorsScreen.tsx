import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, TextInput, Modal, KeyboardAvoidingView, Platform,
  RefreshControl,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import { Colors, LightTheme, DarkTheme, Radius, Shadow, FontSize, Spacing } from '../constants/theme';
import {
  getDebtsWithClients, recordDebtPayment, getDebtPayments, getDebtSummary,
  updateDebtNotificationId, getDebtById,
  addDebt, deleteDebt, searchClients, upsertClient,
} from '../db/database';
import { cancelDebtReminder } from '../utils/notifications';

interface ClientSearchResult { id: number; name: string; phone?: string; }

export default function DebtorsScreen() {
  const { resolvedTheme, currency } = useAppContext();
  const isDark = resolvedTheme === 'dark';
  const themeStyles = isDark ? darkStyles : lightStyles;

  const [debts, setDebts] = useState<any[]>([]);
  const [debtorCount, setDebtorCount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [payments, setPayments] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);

  const [filter, setFilter] = useState<'all' | 'active' | 'overdue'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [debtNote, setDebtNote] = useState('');
  const [searchResults, setSearchResults] = useState<ClientSearchResult[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const loadDebts = useCallback(() => {
    const data = getDebtsWithClients() as any[];
    setDebts(data);
    const summary = getDebtSummary();
    setDebtorCount(summary.debtor_count);
    setTotalAmount(data.reduce((sum: number, d: any) => sum + d.amount_total, 0));
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

  const handlePayment = async () => {
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

    // Если полностью погашен — отменить уведомление
    const updated = getDebtById(selectedDebt.id) as any;
    if (updated && updated.status === 'paid' && selectedDebt.notification_id) {
      await cancelDebtReminder(selectedDebt.notification_id);
      updateDebtNotificationId(selectedDebt.id, null);
    }

    setShowModal(false);
    loadDebts();
    Alert.alert('✅ Платёж записан', `${amount} ${currency.symbol}`);
  };

  const handleDueDateChange = (text: string) => {
    // Auto-mask: ДД.ММ.ГГГГ
    const digits = text.replace(/\D/g, '');
    let masked = '';
    if (digits.length <= 2) {
      masked = digits;
    } else if (digits.length <= 4) {
      masked = digits.slice(0, 2) + '.' + digits.slice(2);
    } else {
      masked = digits.slice(0, 2) + '.' + digits.slice(2, 4) + '.' + digits.slice(4, 8);
    }
    setDueDate(masked);
  };

  const handleAddDebt = () => {
    if (!clientName.trim() || !debtAmount || parseFloat(debtAmount) <= 0) {
      Alert.alert('Ошибка', 'Имя и сумма обязательны');
      return;
    }
    let currentClientId = selectedClientId;
    if (!currentClientId) {
      currentClientId = upsertClient(clientName.trim(), clientPhone.trim());
    }
    let parsedDueDate: string | null = null;
    if (dueDate.length === 10) {
      const parts = dueDate.split('.');
      if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
        parsedDueDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }
    addDebt(currentClientId, null, parseFloat(debtAmount), 0, debtNote.trim(), parsedDueDate || '');
    setShowAddModal(false);
    loadDebts();
    Alert.alert('✅', `Долг добавлен`);
  };

  const handleDueDateChange = (text: string) => {
    let cleaned = text.replace(/[^0-9]/g, '');
    if (cleaned.length > 8) cleaned = cleaned.slice(0, 8);
    let formatted = cleaned;
    if (cleaned.length > 2) formatted = cleaned.slice(0, 2) + '.' + cleaned.slice(2);
    if (cleaned.length > 4) formatted = formatted.slice(0, 5) + '.' + formatted.slice(5);
    setDueDate(formatted);
  };

  const resetAddModal = () => {
    setClientName('');
    setClientPhone('');
    setDebtAmount('');
    setDueDate('');
    setDebtNote('');
    setSearchResults([]);
    setSelectedClientId(null);
    setShowDatePicker(false);
  };

  const totalRemaining = debts.reduce((sum, d) => sum + d.remaining, 0);

  const today = new Date().toISOString().split('T')[0];

  const filteredDebts = debts.filter(d => {
    if (filter === 'active') return !d.due_date || d.due_date >= today;
    if (filter === 'overdue') return d.due_date && d.due_date < today;
    return true;
  });

  const renderItem = ({ item }: { item: any }) => {
    const remaining = item.amount_total - item.amount_paid;
    const pct = Math.round((item.amount_paid / item.amount_total) * 100);
    const isOverdue = item.due_date && item.due_date < today;
    return (
      <TouchableOpacity
        style={[styles.card, themeStyles.card]}
        onPress={() => openClient(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardRow}>
          <View style={styles.cardLeft}>
            <View style={styles.cardNameRow}>
              <Text style={[styles.clientName, themeStyles.text]}>{item.client_name}</Text>
              <View style={[styles.statusPill, isOverdue ? styles.statusOverdue : styles.statusActive]}>
                <Text style={styles.statusText}>{isOverdue ? 'Просрочен' : 'Активен'}</Text>
              </View>
            </View>
            {item.client_phone ? (
              <Text style={styles.clientPhone}>{item.client_phone}</Text>
            ) : null}
            {item.due_date ? (
              <Text style={[styles.debtDate, isOverdue && { color: '#E53935' }]}>
                Срок: {new Date(item.due_date + 'T00:00:00').toLocaleDateString('ru-RU', {
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
        <Text style={styles.summaryCount}>{debtorCount} чел.</Text>
        {totalAmount > 0 && (
          <View style={styles.summaryProgressWrap}>
            <View style={styles.summaryProgressBg}>
              <View
                style={[
                  styles.summaryProgressFill,
                  { width: `${Math.round(((totalAmount - totalRemaining) / totalAmount) * 100)}%` as any },
                ]}
              />
            </View>
            <Text style={styles.summaryProgressLabel}>
              {Math.round(((totalAmount - totalRemaining) / totalAmount) * 100)}% оплачено
            </Text>
          </View>
        )}
      </View>

      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'all' ? styles.filterChipActive : themeStyles.card]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>Все</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'active' ? styles.filterChipActive : themeStyles.card]}
          onPress={() => setFilter('active')}
        >
          <Text style={[styles.filterText, filter === 'active' && styles.filterTextActive]}>Активные</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'overdue' ? styles.filterChipActive : themeStyles.card]}
          onPress={() => setFilter('overdue')}
        >
          <Text style={[styles.filterText, filter === 'overdue' && styles.filterTextActive]}>Просрочены</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredDebts}
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

            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => {
                if (!selectedDebt) return;
                Alert.alert(
                  'Удалить долг?',
                  `${selectedDebt.client_name} — удалить запись безвозвратно?`,
                  [
                    { text: 'Отмена', style: 'cancel' },
                    { text: 'Удалить', style: 'destructive', onPress: () => {
                        deleteDebt(selectedDebt.id);
                        setShowModal(false);
                        loadDebts();
                    }}
                  ]
                );
              }}
            >
              <Ionicons name="trash-outline" size={16} color="#E53935" />
              <Text style={styles.deleteBtnText}>Удалить долг</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          resetAddModal();
          setShowAddModal(true);
        }}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Add Debt Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, themeStyles.card]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, themeStyles.text]}>Новый долг</Text>
              <TouchableOpacity onPress={() => {
                setShowAddModal(false);
                resetAddModal();
              }}>
                <Ionicons name="close" size={24} color={isDark ? '#fff' : '#000'} />
              </TouchableOpacity>
            </View>

            <View style={{ marginBottom: 12, zIndex: 999 }}>
              <Text style={[styles.label, themeStyles.text]}>Имя клиента</Text>
              <TextInput
                style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
                value={clientName}
                onChangeText={(text) => {
                  setClientName(text);
                  setSelectedClientId(null);
                  if (text.trim().length > 0) {
                    setSearchResults(searchClients(text) as ClientSearchResult[]);
                  } else {
                    setSearchResults([]);
                  }
                }}
                placeholder="Имя"
                placeholderTextColor={isDark ? '#888' : '#aaa'}
              />
              {searchResults.length > 0 && (
                <View style={[styles.autocompleteContainer, themeStyles.card]}>
                  <FlatList
                    data={searchResults}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={styles.autocompleteItem}
                        onPress={() => {
                          setClientName(item.name);
                          setSelectedClientId(item.id);
                          setSearchResults([]);
                          if (item.phone) setClientPhone(item.phone);
                        }}
                      >
                        <Text style={[styles.autocompleteText, themeStyles.text]}>{item.name}</Text>
                        {item.phone && <Text style={styles.autocompletePhone}>{item.phone}</Text>}
                      </TouchableOpacity>
                    )}
                    style={{ maxHeight: 120 }}
                  />
                </View>
              )}
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.label, themeStyles.text]}>Телефон</Text>
              <TextInput
                style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
                value={clientPhone}
                onChangeText={setClientPhone}
                keyboardType="phone-pad"
                placeholder="Телефон (необязательно)"
                placeholderTextColor={isDark ? '#888' : '#aaa'}
              />
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.label, themeStyles.text]}>Сумма долга</Text>
              <TextInput
                style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
                value={debtAmount}
                onChangeText={(text) => setDebtAmount(text.replace(/[^0-9.]/g, ''))}
                keyboardType="numeric"
                placeholder="Сумма долга"
                placeholderTextColor={isDark ? '#888' : '#aaa'}
              />
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.label, themeStyles.text]}>Срок оплаты</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  style={[styles.input, isDark ? styles.inputDark : styles.inputLight, { flex: 1 }]}
                  value={dueDate}
                  onChangeText={handleDueDateChange}
                  placeholder="ДД.ММ.ГГГГ"
                  placeholderTextColor={isDark ? '#888' : '#aaa'}
                  keyboardType="numeric"
                  maxLength={10}
                />
                <TouchableOpacity
                  onPress={() => setShowDatePicker(true)}
                  style={{
                    padding: 10,
                    backgroundColor: isDark ? '#2a2a2a' : '#f0f0f0',
                    borderRadius: 8,
                  }}
                >
                  <Ionicons name="calendar-outline" size={22} color={Colors.primary} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.label, themeStyles.text]}>Заметка</Text>
              <TextInput
                style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
                value={debtNote}
                onChangeText={setDebtNote}
                placeholder="Заметка (необязательно)"
                placeholderTextColor={isDark ? '#888' : '#aaa'}
              />
            </View>

            <TouchableOpacity style={styles.payBtn} onPress={handleAddDebt}>
              <Text style={styles.payBtnText}>Добавить долг</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {showDatePicker && (
        <DateTimePicker
          value={dueDate.length === 10
            ? new Date(dueDate.split('.').reverse().join('-') + 'T00:00:00')
            : new Date()
          }
          mode="date"
          display="default"
          minimumDate={new Date()}
          onChange={(event: any, selectedDate?: Date) => {
            setShowDatePicker(false);
            if (event.type === 'dismissed' || !selectedDate) return;
            const d = String(selectedDate.getDate()).padStart(2, '0');
            const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
            const y = selectedDate.getFullYear();
            setDueDate(`${d}.${m}.${y}`);
          }}
        />
      )}
    </View>
  );
}

const lightStyles = StyleSheet.create({
  container: { backgroundColor: LightTheme.background },
  card: { backgroundColor: LightTheme.card },
  text: { color: LightTheme.text },
});
const darkStyles = StyleSheet.create({
  container: { backgroundColor: DarkTheme.background },
  card: { backgroundColor: DarkTheme.card },
  text: { color: DarkTheme.text },
});
const styles = StyleSheet.create({
  container: { flex: 1 },
  summary: {
    margin: 16, marginBottom: 8, padding: 16,
    borderRadius: Radius.md, alignItems: 'center',
    ...Shadow.md,
  },
  summaryLabel: { fontSize: 13, color: '#999', marginBottom: 4 },
  summaryValue: { fontSize: 28, fontWeight: 'bold' },
  summaryCount: { fontSize: 13, color: '#1D9E75', marginTop: 2 },
  card: {
    borderRadius: Radius.md, padding: 14, marginBottom: 10,
    ...Shadow.md,
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
  summaryProgressWrap: { width: '100%', marginTop: 12, alignItems: 'center' },
  summaryProgressBg: {
    height: 6, width: '100%', backgroundColor: '#E0E0E0',
    borderRadius: 3, overflow: 'hidden',
  },
  summaryProgressFill: { height: 6, backgroundColor: Colors.primary, borderRadius: 3 },
  summaryProgressLabel: { fontSize: 11, color: '#999', marginTop: 4 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusPill: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  statusActive: { backgroundColor: Colors.warningLight },
  statusOverdue: { backgroundColor: Colors.dangerLight },
  statusText: { fontSize: 11, fontWeight: '600' },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
  },
  filterText: {
    color: '#888',
    fontSize: 14,
  },
  filterTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    padding: 12,
  },
  deleteBtnText: {
    color: '#E53935',
    fontSize: 14,
    fontWeight: '500',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    zIndex: 5,
    backgroundColor: Colors.primary,
    borderRadius: 28,
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  autocompleteContainer: {
    zIndex: 999,
    elevation: 5,
    position: 'absolute',
    top: 44,   // высота TextInput
    left: 0,
    right: 0,
    marginTop: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    overflow: 'hidden',
  },
  autocompleteItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  autocompleteText: {
    fontSize: 14,
    fontWeight: '500',
  },
  autocompletePhone: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
});