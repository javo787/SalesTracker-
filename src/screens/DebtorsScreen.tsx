import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, TextInput, Modal, KeyboardAvoidingView, Platform,
  RefreshControl, ScrollView, Linking,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import { useShop } from '../context/ShopContext';
import { Colors, LightTheme, DarkTheme, Radius, Shadow, FontSize, Spacing } from '../constants/theme';
import {
  getDebtsWithClients, recordDebtPayment, getDebtPayments, getDebtSummary,
  updateDebtNotificationId, getDebtById,
  addDebt, deleteDebt, searchClients, upsertClient, getClientDebtHistory,
  getAllClientsWithStats, updateClient, deleteClientIfSafe,
} from '../db/database';
import { cancelDebtReminder } from '../utils/notifications';

interface ClientSearchResult { id: number; name: string; phone?: string; }

export default function DebtorsScreen() {
  const { t } = useTranslation();
  const { isOwner } = useShop();
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
  const [clientHistory, setClientHistory] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'info' | 'history'>('info');

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

  // Screen-level tab: 'debts' | 'clients'
  const [screenTab, setScreenTab] = useState<'debts' | 'clients'>('debts');

  // Clients tab state
  const [clients, setClients] = useState<any[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [showEditClientModal, setShowEditClientModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientNote, setNewClientNote] = useState('');
  const [editClientName, setEditClientName] = useState('');
  const [editClientPhone, setEditClientPhone] = useState('');
  const [editClientNote, setEditClientNote] = useState('');
  const [showClientDetailModal, setShowClientDetailModal] = useState(false);

  const loadDebts = useCallback(() => {
    const data = getDebtsWithClients() as any[];
    setDebts(data);
    const summary = getDebtSummary();
    setDebtorCount(summary.debtor_count);
    setTotalAmount(data.reduce((sum: number, d: any) => sum + d.amount_total, 0));
  }, []);

  const loadClients = useCallback(() => {
    const data = getAllClientsWithStats() as any[];
    setClients(data);
  }, []);

  useFocusEffect(useCallback(() => {
    loadDebts();
    loadClients();
  }, [loadDebts, loadClients]));

  const onRefresh = () => {
    setRefreshing(true);
    loadDebts();
    loadClients();
    setRefreshing(false);
  };

  const handleAddClient = () => {
    const name = newClientName.trim();
    if (!name) {
      Alert.alert('Ошибка', 'Введите имя клиента');
      return;
    }
    upsertClient(name, newClientPhone.trim(), newClientNote.trim());
    setNewClientName('');
    setNewClientPhone('');
    setNewClientNote('');
    setShowAddClientModal(false);
    loadClients();
  };

  const handleEditClient = () => {
    if (!selectedClient) return;
    const name = editClientName.trim();
    if (!name) {
      Alert.alert('Ошибка', 'Имя не может быть пустым');
      return;
    }
    updateClient(selectedClient.id, name, editClientPhone.trim(), editClientNote.trim());
    setShowEditClientModal(false);
    setSelectedClient(null);
    loadClients();
  };

  const handleDeleteClient = (client: any) => {
    Alert.alert(
      'Удалить клиента',
      `Удалить "${client.name}"? Это действие нельзя отменить.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            const success = deleteClientIfSafe(client.id);
            if (success) {
              loadClients();
            } else {
              Alert.alert(
                'Нельзя удалить',
                'У клиента есть активные долги. Сначала закройте все долги.'
              );
            }
          },
        },
      ]
    );
  };

  const openClientDetail = (client: any) => {
    setSelectedClient(client);
    setShowClientDetailModal(true);
  };

  const openEditClient = (client: any) => {
    setSelectedClient(client);
    setEditClientName(client.name);
    setEditClientPhone(client.phone || '');
    setEditClientNote(client.note || '');
    setShowEditClientModal(true);
  };

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    (c.phone && c.phone.includes(clientSearch))
  );

  const openClient = (debt: any) => {
    setSelectedDebt(debt);
    setPayments(getDebtPayments(debt.id) as any[]);
    setClientHistory(getClientDebtHistory(debt.client_id) as any[]);
    setActiveTab('info');
    setPaymentAmount('');
    setPaymentNote('');
    setShowModal(true);
  };

  const handlePayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      Alert.alert(t('common.error'), t('debtors.paymentAmount'));
      return;
    }
    const remaining = selectedDebt.amount_total - selectedDebt.amount_paid;
    if (amount > remaining) {
      Alert.alert(t('common.error'), `${t('calculator.labels.sellPrice')}: ${remaining.toFixed(0)} ${currency.symbol}`);
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
    Alert.alert('✅ ' + t('debtors.paymentSuccess'), `${amount} ${currency.symbol}`);
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
      Alert.alert(t('common.error'), t('debtors.errorRequired'));
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
    resetAddModal();
    setShowAddModal(false);
    loadDebts();
    Alert.alert('✅', t('debtors.saveSuccess'));
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
                <Text style={styles.statusText}>{isOverdue ? t('debtors.statusOverdue') : t('debtors.statusActive')}</Text>
              </View>
            </View>
            {item.client_phone ? (
              <Text style={styles.clientPhone}>{item.client_phone}</Text>
            ) : null}
            {item.due_date ? (
              <Text style={[styles.debtDate, isOverdue && { color: '#E53935' }]}>
                {t('debtors.term')}: {new Date(item.due_date + 'T00:00:00').toLocaleDateString(t('tabs.home') === 'Главная' ? 'ru-RU' : t('tabs.home') === 'Асосӣ' ? 'tg-TJ' : 'uz-UZ', {
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
  };

  return (
    <View style={[styles.container, themeStyles.container]}>
      {/* Screen tab switcher */}
      <View style={clientStyles.screenTabRow}>
        <TouchableOpacity
          style={[
            clientStyles.screenTab,
            screenTab === 'debts' && clientStyles.screenTabActive,
          ]}
          onPress={() => setScreenTab('debts')}
        >
          <Text style={[
            clientStyles.screenTabText,
            screenTab === 'debts' && clientStyles.screenTabTextActive,
          ]}>
            Долги
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            clientStyles.screenTab,
            screenTab === 'clients' && clientStyles.screenTabActive,
          ]}
          onPress={() => setScreenTab('clients')}
        >
          <Text style={[
            clientStyles.screenTabText,
            screenTab === 'clients' && clientStyles.screenTabTextActive,
          ]}>
            Клиенты
          </Text>
        </TouchableOpacity>
      </View>

      {screenTab === 'debts' && (
        <>
          {/* Summary header */}
      <View style={[styles.summary, themeStyles.card]}>
        <Text style={styles.summaryLabel}>{t('debtors.totalOwed')}</Text>
        <Text style={[styles.summaryValue, themeStyles.text]}>
          {totalRemaining.toLocaleString()} {currency.symbol}
        </Text>
        <Text style={styles.summaryCount}>{t('debtors.debtorCount', { count: debtorCount })}</Text>
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
              {Math.round(((totalAmount - totalRemaining) / totalAmount) * 100)}% {t('debtors.paidStatus')}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'all' ? styles.filterChipActive : themeStyles.card]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>{t('debtors.filterAll')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'active' ? styles.filterChipActive : themeStyles.card]}
          onPress={() => setFilter('active')}
        >
          <Text style={[styles.filterText, filter === 'active' && styles.filterTextActive]}>{t('debtors.filterActive')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'overdue' ? styles.filterChipActive : themeStyles.card]}
          onPress={() => setFilter('overdue')}
        >
          <Text style={[styles.filterText, filter === 'overdue' && styles.filterTextActive]}>{t('debtors.filterOverdue')}</Text>
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
                <Text style={styles.emptyText}>{t('debtors.emptyList')}</Text>
              </View>
            }
          />
        </>
      )}

      {screenTab === 'clients' && (
        <View style={{ flex: 1 }}>
          {/* Search bar */}
          <View style={clientStyles.searchRow}>
            <View style={[clientStyles.searchWrap, isDark ? clientStyles.searchWrapDark : clientStyles.searchWrapLight]}>
              <Ionicons name="search" size={16} color="#999" style={{ marginRight: 6 }} />
              <TextInput
                style={[clientStyles.searchInput, { color: isDark ? '#EEE' : '#222' }]}
                placeholder="Поиск по имени или номеру..."
                placeholderTextColor="#999"
                value={clientSearch}
                onChangeText={setClientSearch}
              />
              {clientSearch.length > 0 && (
                <TouchableOpacity onPress={() => setClientSearch('')}>
                  <Ionicons name="close-circle" size={16} color="#999" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Clients list */}
          <FlatList
            data={filteredClients}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ padding: 16, paddingTop: 8 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadClients(); setRefreshing(false); }} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={64} color="#ccc" />
                <Text style={styles.emptyText}>
                  {clientSearch ? 'Клиент не найден' : 'Клиентов пока нет'}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[clientStyles.clientCard, isDark ? clientStyles.clientCardDark : clientStyles.clientCardLight]}
                onPress={() => openClientDetail(item)}
                activeOpacity={0.75}
              >
                {/* Left: avatar circle */}
                <View style={[clientStyles.avatar, { backgroundColor: item.active_debt > 0 ? '#FDECEA' : '#E8F5E9' }]}>
                  <Text style={[clientStyles.avatarText, { color: item.active_debt > 0 ? '#E53935' : '#1D9E75' }]}>
                    {item.name.charAt(0).toUpperCase()}
                  </Text>
                </View>

                {/* Center: name + meta */}
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[clientStyles.clientName, { color: isDark ? '#EEE' : '#222' }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.phone ? (
                    <Text style={clientStyles.clientPhone} numberOfLines={1}>{item.phone}</Text>
                  ) : (
                    <Text style={clientStyles.clientPhoneEmpty}>Нет номера</Text>
                  )}
                  {item.last_activity ? (
                    <Text style={clientStyles.clientMeta}>
                      Последняя операция: {new Date(item.last_activity).toLocaleDateString('ru-RU')}
                    </Text>
                  ) : null}
                </View>

                {/* Right: debt badge + call button */}
                <View style={clientStyles.clientRight}>
                  {item.active_debt > 0 && (
                    <View style={clientStyles.debtBadge}>
                      <Text style={clientStyles.debtBadgeText}>
                        {item.active_debt.toLocaleString()} {currency.symbol}
                      </Text>
                    </View>
                  )}
                  {item.phone ? (
                    <TouchableOpacity
                      style={clientStyles.callBtn}
                      onPress={() => Linking.openURL(`tel:${item.phone}`)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="call" size={18} color="#1D9E75" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </TouchableOpacity>
            )}
          />

          {/* FAB: add client manually */}
          <TouchableOpacity
            style={styles.fab}
            onPress={() => {
              setNewClientName('');
              setNewClientPhone('');
              setNewClientNote('');
              setShowAddClientModal(true);
            }}
          >
            <Ionicons name="person-add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Payment modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowModal(false)}
      >
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, themeStyles.card]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, themeStyles.text]}>
                  {selectedDebt?.client_name}
                </Text>
                {selectedDebt?.client_phone ? (
                  <Text style={styles.clientPhoneModal}>{selectedDebt.client_phone}</Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color={isDark ? '#fff' : '#000'} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={[styles.progressCard, { backgroundColor: isDark ? '#1a1a1a' : '#f8f8f8' }]}>
                <View style={styles.progressCardRow}>
                  <View style={styles.progressCardItem}>
                    <Text style={styles.progressCardLabel}>{t('debtors.debtLabel')}</Text>
                    <Text style={[styles.progressCardValue, themeStyles.text]}>
                      {selectedDebt?.amount_total.toLocaleString()} {currency.symbol}
                    </Text>
                  </View>
                  <View style={styles.progressCardItem}>
                    <Text style={styles.progressCardLabel}>{t('debtors.paidLabel')}</Text>
                    <Text style={[styles.progressCardValue, { color: '#1D9E75' }]}>
                      {selectedDebt?.amount_paid.toLocaleString()} {currency.symbol}
                    </Text>
                  </View>
                  <View style={styles.progressCardItem}>
                    <Text style={styles.progressCardLabel}>{t('debtors.remainingLabel')}</Text>
                    <Text style={[styles.progressCardValue, { color: '#E53935' }]}>
                      {(selectedDebt ? selectedDebt.amount_total - selectedDebt.amount_paid : 0).toLocaleString()} {currency.symbol}
                    </Text>
                  </View>
                </View>
                {/* Прогресс-бар оплаты */}
                {selectedDebt && selectedDebt.amount_total > 0 && (
                  <View style={{ marginTop: 10 }}>
                    <View style={styles.progressBg}>
                      <View style={[styles.progressFill, {
                        width: `${Math.round((selectedDebt.amount_paid / selectedDebt.amount_total) * 100)}%` as any
                      }]} />
                    </View>
                    <Text style={styles.progressPct}>
                      {Math.round((selectedDebt.amount_paid / selectedDebt.amount_total) * 100)}% {t('debtors.paidStatus')}
                    </Text>
                  </View>
                )}
                {/* Срок */}
                {selectedDebt?.due_date && (
                  <Text style={[styles.dueDateModal, {
                    color: selectedDebt.due_date < today ? '#E53935' : '#999'
                  }]}>
                    {selectedDebt.due_date < today ? '⚠️ ' + t('debtors.statusOverdue') + ': ' : '📅 ' + t('debtors.term') + ': '}
                    {new Date(selectedDebt.due_date + 'T00:00:00').toLocaleDateString(t('tabs.home') === 'Главная' ? 'ru-RU' : t('tabs.home') === 'Асосӣ' ? 'tg-TJ' : 'uz-UZ', {
                      day: 'numeric', month: 'long', year: 'numeric'
                    })}
                  </Text>
                )}
                {/* Товар из продажи */}
                {selectedDebt?.product_name_from_sale && (
                  <Text style={styles.productNameModal}>
                    🛍️ {selectedDebt.product_name_from_sale}
                  </Text>
                )}
                {/* Заметка */}
                {selectedDebt?.note ? (
                  <Text style={styles.debtNoteModal}>💬 {selectedDebt.note}</Text>
                ) : null}
              </View>

              <View style={[styles.tabRow, { backgroundColor: isDark ? '#1a1a1a' : '#f0f0f0' }]}>
                <TouchableOpacity
                  style={[styles.tab, activeTab === 'info' && styles.tabActive]}
                  onPress={() => setActiveTab('info')}
                >
                  <Text style={[styles.tabText, activeTab === 'info' && styles.tabTextActive]}>
                    {t('debtors.recordPayment')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tab, activeTab === 'history' && styles.tabActive]}
                  onPress={() => setActiveTab('history')}
                >
                  <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
                    {t('debtors.history')} ({clientHistory.length})
                  </Text>
                </TouchableOpacity>
              </View>

              {activeTab === 'info' && (
                <View>
                  <TextInput
                    style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
                    placeholder={t('debtors.paymentAmount')}
                    placeholderTextColor={isDark ? '#888' : '#aaa'}
                    keyboardType="numeric"
                    value={paymentAmount}
                    onChangeText={setPaymentAmount}
                    autoFocus
                  />
                  <TextInput
                    style={[styles.input, isDark ? styles.inputDark : styles.inputLight, { marginTop: 8 }]}
                    placeholder={t('debtors.paymentNote')}
                    placeholderTextColor={isDark ? '#888' : '#aaa'}
                    value={paymentNote}
                    onChangeText={setPaymentNote}
                  />
                  <TouchableOpacity style={styles.payBtn} onPress={handlePayment}>
                    <Text style={styles.payBtnText}>{t('debtors.savePayment')}</Text>
                  </TouchableOpacity>

                  {isOwner && (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => {
                      if (!selectedDebt) return;
                      Alert.alert(
                        t('debtors.deleteConfirmTitle'),
                        t('debtors.deleteConfirmMsg', { name: selectedDebt.client_name }),
                        [
                          { text: t('common.cancel'), style: 'cancel' },
                          { text: t('common.delete'), style: 'destructive', onPress: () => {
                              deleteDebt(selectedDebt.id);
                              setShowModal(false);
                              loadDebts();
                          }}
                        ]
                      );
                    }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#E53935" />
                    <Text style={styles.deleteBtnText}>{t('debtors.deleteDebt')}</Text>
                  </TouchableOpacity>
                  )}
                </View>
              )}

              {activeTab === 'history' && (
                <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                  {clientHistory.length === 0 ? (
                    <Text style={{ color: '#999', textAlign: 'center', padding: 20 }}>
                      {t('debtors.historyEmpty')}
                    </Text>
                  ) : (
                    clientHistory.map((debt: any) => {
                      const debtPayments = getDebtPayments(debt.id) as any[];
                      const isPaid = debt.status === 'paid';
                      return (
                        <View key={String(debt.id)} style={[styles.historyDebtCard,
                          { borderLeftColor: isPaid ? '#1D9E75' : '#E53935' }
                        ]}>
                          {/* Дата создания + статус */}
                          <View style={styles.historyDebtHeader}>
                            <Text style={styles.historyDebtDate}>
                              {new Date(debt.created_at).toLocaleDateString(t('tabs.home') === 'Главная' ? 'ru-RU' : t('tabs.home') === 'Асосӣ' ? 'tg-TJ' : 'uz-UZ', {
                                day: 'numeric', month: 'short', year: 'numeric'
                              })}
                            </Text>
                            <View style={[styles.statusPill,
                              isPaid ? styles.statusActive : styles.statusOverdue
                            ]}>
                              <Text style={styles.statusText}>
                                {isPaid ? '✓ ' + t('debtors.paidLabel') : t('debtors.statusActive')}
                              </Text>
                            </View>
                          </View>

                          {/* Товар если есть */}
                          {debt.product_name && (
                            <Text style={styles.historyDebtProduct}>
                              🛍️ {debt.product_name}
                              {debt.quantity && debt.quantity > 1 ? ` × ${debt.quantity}` : ''}
                            </Text>
                          )}

                          {/* Сумма */}
                          <Text style={styles.historyDebtAmount}>
                            {debt.amount_total.toLocaleString()} {currency.symbol}
                            {debt.remaining > 0 && (
                              ` · ${t('debtors.remainingLabel')} ${debt.remaining.toLocaleString()}`
                            )}
                          </Text>

                          {/* Заметка */}
                          {debt.note ? (
                            <Text style={styles.historyDebtNote}>💬 {debt.note}</Text>
                          ) : null}

                          {/* Платежи по этому долгу */}
                          {debtPayments.length > 0 && (
                            <View style={styles.historyPaymentsList}>
                              {debtPayments.map((p: any) => (
                                <View key={String(p.id)} style={styles.historyPaymentItem}>
                                  <Ionicons name="arrow-up-circle-outline" size={14} color="#1D9E75" />
                                  <Text style={styles.historyPaymentDate}>
                                    {new Date(p.created_at).toLocaleDateString(t('tabs.home') === 'Главная' ? 'ru-RU' : t('tabs.home') === 'Асосӣ' ? 'tg-TJ' : 'uz-UZ', {
                                      day: 'numeric', month: 'short'
                                    })}
                                  </Text>
                                  <Text style={styles.historyPaymentAmount}>
                                    +{p.amount.toLocaleString()} {currency.symbol}
                                  </Text>
                                  {p.note ? (
                                    <Text style={styles.historyPaymentNote}>{p.note}</Text>
                                  ) : null}
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      );
                    })
                  )}
                </ScrollView>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* FAB */}
      {screenTab === 'debts' && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => {
            resetAddModal();
            setShowAddModal(true);
          }}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Add Debt Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddModal(false)}
      >
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, themeStyles.card]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, themeStyles.text]}>{t('debtors.modalNewDebt')}</Text>
              <TouchableOpacity onPress={() => {
                setShowAddModal(false);
                resetAddModal();
              }}>
                <Ionicons name="close" size={24} color={isDark ? '#fff' : '#000'} />
              </TouchableOpacity>
            </View>

            <View style={{ marginBottom: 12, zIndex: 999 }}>
              <Text style={[styles.label, themeStyles.text]}>{t('debtors.clientName')}</Text>
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
                placeholder={t('debtors.clientName')}
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
              <Text style={[styles.label, themeStyles.text]}>{t('debtors.phone')}</Text>
              <TextInput
                style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
                value={clientPhone}
                onChangeText={setClientPhone}
                keyboardType="phone-pad"
                placeholder={t('debtors.phone')}
                placeholderTextColor={isDark ? '#888' : '#aaa'}
              />
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.label, themeStyles.text]}>{t('debtors.amount')}</Text>
              <TextInput
                style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
                value={debtAmount}
                onChangeText={(text) => setDebtAmount(text.replace(/[^0-9.]/g, ''))}
                keyboardType="numeric"
                placeholder={t('debtors.amount')}
                placeholderTextColor={isDark ? '#888' : '#aaa'}
              />
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.label, themeStyles.text]}>{t('debtors.dueDate')}</Text>
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
              <Text style={[styles.label, themeStyles.text]}>{t('debtors.note')}</Text>
              <TextInput
                style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
                value={debtNote}
                onChangeText={setDebtNote}
                placeholder={t('debtors.note')}
                placeholderTextColor={isDark ? '#888' : '#aaa'}
              />
            </View>

            <TouchableOpacity style={styles.payBtn} onPress={handleAddDebt}>
              <Text style={styles.payBtnText}>{t('debtors.addBtn')}</Text>
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

      {/* Add Client Modal */}
      <Modal
        visible={showAddClientModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddClientModal(false)}
      >
        <KeyboardAvoidingView behavior="padding" style={styles.modalOverlay}>
          <View style={[styles.modalContent, themeStyles.card]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, themeStyles.text]}>Новый клиент</Text>
              <TouchableOpacity onPress={() => setShowAddClientModal(false)}>
                <Ionicons name="close" size={24} color={isDark ? '#fff' : '#000'} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, themeStyles.text]}>{t('debtors.clientName')} *</Text>
            <TextInput
              style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
              placeholder="Например: Алишер"
              placeholderTextColor={isDark ? '#888' : '#aaa'}
              value={newClientName}
              onChangeText={setNewClientName}
              autoFocus
              returnKeyType="next"
            />

            <Text style={[styles.label, themeStyles.text, { marginTop: 12 }]}>Телефон</Text>
            <TextInput
              style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
              placeholder="+992 XX XXX XX XX"
              placeholderTextColor={isDark ? '#888' : '#aaa'}
              value={newClientPhone}
              onChangeText={setNewClientPhone}
              keyboardType="phone-pad"
              returnKeyType="next"
            />

            <Text style={[styles.label, themeStyles.text, { marginTop: 12 }]}>Заметка (необязательно)</Text>
            <TextInput
              style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
              placeholder="Любая пометка..."
              placeholderTextColor={isDark ? '#888' : '#aaa'}
              value={newClientNote}
              onChangeText={setNewClientNote}
              returnKeyType="done"
            />

            <TouchableOpacity
              style={[styles.payBtn, { marginTop: 20 }]}
              onPress={handleAddClient}
            >
              <Text style={styles.payBtnText}>Добавить клиента</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Client Modal */}
      <Modal
        visible={showEditClientModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEditClientModal(false)}
      >
        <KeyboardAvoidingView behavior="padding" style={styles.modalOverlay}>
          <View style={[styles.modalContent, themeStyles.card]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, themeStyles.text]}>Редактировать</Text>
              <TouchableOpacity onPress={() => setShowEditClientModal(false)}>
                <Ionicons name="close" size={24} color={isDark ? '#fff' : '#000'} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, themeStyles.text]}>Имя *</Text>
            <TextInput
              style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
              value={editClientName}
              onChangeText={setEditClientName}
              autoFocus
              returnKeyType="next"
            />

            <Text style={[styles.label, themeStyles.text, { marginTop: 12 }]}>Телефон</Text>
            <TextInput
              style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
              value={editClientPhone}
              onChangeText={setEditClientPhone}
              keyboardType="phone-pad"
              returnKeyType="next"
            />

            <Text style={[styles.label, themeStyles.text, { marginTop: 12 }]}>Заметка</Text>
            <TextInput
              style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
              value={editClientNote}
              onChangeText={setEditClientNote}
              returnKeyType="done"
            />

            <TouchableOpacity
              style={[styles.payBtn, { marginTop: 20 }]}
              onPress={handleEditClient}
            >
              <Text style={styles.payBtnText}>Сохранить</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Client Detail Modal */}
      <Modal
        visible={showClientDetailModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowClientDetailModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowClientDetailModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[clientStyles.detailSheet, themeStyles.card]}
          >
            {/* Header */}
            <View style={clientStyles.detailHeader}>
              <View style={[clientStyles.avatar, { width: 48, height: 48, borderRadius: 24 }]}>
                <Text style={[clientStyles.avatarText, { fontSize: 20 }]}>
                  {selectedClient?.name?.charAt(0)?.toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[clientStyles.clientName, { color: isDark ? '#EEE' : '#222', fontSize: 18 }]}>
                  {selectedClient?.name}
                </Text>
                {selectedClient?.phone ? (
                  <TouchableOpacity
                    style={clientStyles.phoneRow}
                    onPress={() => Linking.openURL(`tel:${selectedClient.phone}`)}
                  >
                    <Ionicons name="call" size={14} color="#1D9E75" />
                    <Text style={clientStyles.phoneLink}>{selectedClient.phone}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={clientStyles.clientPhoneEmpty}>Нет номера телефона</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setShowClientDetailModal(false)}>
                <Ionicons name="close" size={24} color={isDark ? '#fff' : '#666'} />
              </TouchableOpacity>
            </View>

            {/* Stats row */}
            <View style={clientStyles.statsRow}>
              <View style={clientStyles.statItem}>
                <Text style={clientStyles.statLabel}>Активных долгов</Text>
                <Text style={[clientStyles.statValue, { color: selectedClient?.active_debt > 0 ? '#E53935' : '#1D9E75' }]}>
                  {selectedClient?.active_debt_count || 0}
                </Text>
              </View>
              <View style={clientStyles.statDivider} />
              <View style={clientStyles.statItem}>
                <Text style={clientStyles.statLabel}>Сумма долга</Text>
                <Text style={[clientStyles.statValue, { color: selectedClient?.active_debt > 0 ? '#E53935' : '#1D9E75' }]}>
                  {(selectedClient?.active_debt || 0).toLocaleString()} {currency.symbol}
                </Text>
              </View>
            </View>

            {selectedClient?.note ? (
              <Text style={clientStyles.noteText}>📝 {selectedClient.note}</Text>
            ) : null}

            {/* Actions */}
            <View style={clientStyles.actionRow}>
              {selectedClient?.phone ? (
                <TouchableOpacity
                  style={[clientStyles.actionBtn, clientStyles.actionBtnGreen]}
                  onPress={() => Linking.openURL(`tel:${selectedClient.phone}`)}
                >
                  <Ionicons name="call" size={18} color="#fff" />
                  <Text style={clientStyles.actionBtnText}>Позвонить</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={[clientStyles.actionBtn, clientStyles.actionBtnGray]}
                onPress={() => {
                  setShowClientDetailModal(false);
                  setTimeout(() => openEditClient(selectedClient), 300);
                }}
              >
                <Ionicons name="pencil" size={18} color="#fff" />
                <Text style={clientStyles.actionBtnText}>Изменить</Text>
              </TouchableOpacity>

              {isOwner && (
                <TouchableOpacity
                  style={[clientStyles.actionBtn, clientStyles.actionBtnRed]}
                  onPress={() => {
                    setShowClientDetailModal(false);
                    setTimeout(() => handleDeleteClient(selectedClient), 300);
                  }}
                >
                  <Ionicons name="trash" size={18} color="#fff" />
                  <Text style={clientStyles.actionBtnText}>Удалить</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
  progressCard: {
    borderRadius: 12, padding: 14, marginBottom: 12,
  },
  progressCardRow: {
    flexDirection: 'row', justifyContent: 'space-between',
  },
  progressCardItem: { alignItems: 'center', flex: 1 },
  progressCardLabel: { fontSize: 11, color: '#999', marginBottom: 4 },
  progressCardValue: { fontSize: 16, fontWeight: '700' },
  progressPct: { fontSize: 11, color: '#999', textAlign: 'right', marginTop: 4 },
  dueDateModal: { fontSize: 13, marginTop: 8 },
  productNameModal: { fontSize: 13, color: '#666', marginTop: 4 },
  debtNoteModal: { fontSize: 13, color: '#888', marginTop: 4, fontStyle: 'italic' },
  clientPhoneModal: { fontSize: 13, color: '#999', marginTop: 2 },
  tabRow: {
    flexDirection: 'row', marginBottom: 12,
    borderRadius: 10, overflow: 'hidden',
  },
  tab: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
  },
  tabActive: { backgroundColor: Colors.primary, borderRadius: 10 },
  tabText: { fontSize: 14, color: '#888' },
  tabTextActive: { color: '#fff', fontWeight: '600' },
  historyDebtCard: {
    borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 10,
    marginBottom: 12, borderBottomWidth: 0.5, borderBottomColor: '#F0F0F0',
  },
  historyDebtHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
  },
  historyDebtDate: { fontSize: 13, color: '#999' },
  historyDebtProduct: { fontSize: 14, fontWeight: '500', color: '#555', marginBottom: 2 },
  historyDebtAmount: { fontSize: 15, fontWeight: '600', color: '#333' },
  historyDebtNote: { fontSize: 12, color: '#aaa', fontStyle: 'italic', marginTop: 2 },
  historyPaymentsList: { marginTop: 8, paddingLeft: 4 },
  historyPaymentItem: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3,
  },
  historyPaymentDate: { fontSize: 12, color: '#999' },
  historyPaymentAmount: { fontSize: 13, fontWeight: '600', color: '#1D9E75' },
  historyPaymentNote: { fontSize: 12, color: '#aaa', flex: 1 },
});

const clientStyles = StyleSheet.create({
  screenTabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: '#F0F0F0',
    borderRadius: 10,
    padding: 3,
  },
  screenTab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 8,
  },
  screenTabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  screenTabText: { fontSize: 14, fontWeight: '500', color: '#888' },
  screenTabTextActive: { color: '#222', fontWeight: '600' },

  searchRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1,
  },
  searchWrapLight: { backgroundColor: '#F5F5F5', borderColor: '#E5E5E5' },
  searchWrapDark:  { backgroundColor: '#2C2C2C', borderColor: '#444' },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },

  clientCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  clientCardLight: { backgroundColor: '#fff' },
  clientCardDark:  { backgroundColor: '#2C2C2C' },

  avatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700' },

  clientName:  { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  clientPhone: { fontSize: 13, color: '#777' },
  clientPhoneEmpty: { fontSize: 13, color: '#bbb', fontStyle: 'italic' },
  clientMeta:  { fontSize: 11, color: '#bbb', marginTop: 2 },

  clientRight: { alignItems: 'flex-end', gap: 6 },
  debtBadge: {
    backgroundColor: '#FDECEA', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  debtBadgeText: { fontSize: 12, fontWeight: '600', color: '#E53935' },
  callBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#E8F5E9',
    alignItems: 'center', justifyContent: 'center',
  },

  detailSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
  },
  detailHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 16,
  },
  phoneRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3,
  },
  phoneLink: { fontSize: 14, color: '#1D9E75', fontWeight: '500' },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#F8F8F8',
    borderRadius: 12, padding: 14, marginBottom: 14,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 11, color: '#999', marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: '700' },
  statDivider: { width: 1, backgroundColor: '#E0E0E0', marginHorizontal: 8 },

  noteText: { fontSize: 13, color: '#777', marginBottom: 14, fontStyle: 'italic' },

  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 13, borderRadius: 12,
  },
  actionBtnGreen: { backgroundColor: '#1D9E75' },
  actionBtnGray:  { backgroundColor: '#757575' },
  actionBtnRed:   { backgroundColor: '#E53935' },
  actionBtnText:  { color: '#fff', fontWeight: '600', fontSize: 14 },
});