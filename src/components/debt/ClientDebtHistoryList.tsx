import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../../context/AppContext';
import { Colors, Radius } from '../../constants/theme';
import { getDebtPayments } from '../../db/database';

interface ClientDebtHistoryListProps {
  history: any[];
}

export const ClientDebtHistoryList: React.FC<ClientDebtHistoryListProps> = ({ history }) => {
  const { t } = useTranslation();
  const { currency } = useAppContext();

  if (history.length === 0) {
    return (
      <Text style={{ color: '#999', textAlign: 'center', padding: 20 }}>
        {t('debtors.historyEmpty')}
      </Text>
    );
  }

  return (
    <View style={styles.container}>
      {history.map((debt: any) => {
        const debtPayments = getDebtPayments(debt.id) as any[];
        const isPaid = debt.status === 'paid';
        const paidAmount = debt.amount_total - (debt.remaining || 0);

        return (
          <View
            key={String(debt.id)}
            style={[
              styles.historyDebtCard,
              { borderLeftColor: isPaid ? '#1D9E75' : '#E53935' }
            ]}
          >
            {/* Дата создания + статус */}
            <View style={styles.historyDebtHeader}>
              <Text style={styles.historyDebtDate}>
                {new Date(debt.created_at).toLocaleDateString(t('tabs.home') === 'Главная' ? 'ru-RU' : t('tabs.home') === 'Асосӣ' ? 'tg-TJ' : 'uz-UZ', {
                  day: 'numeric', month: 'short', year: 'numeric'
                })}
              </Text>
              <View style={[styles.statusPill, isPaid ? styles.statusPaid : styles.statusActive]}>
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

            {/* Детализация сумм */}
            <View style={styles.amountInfo}>
              <Text style={styles.amountLine}>
                <Text style={styles.amountLabel}>{t('debtors.originalDebt')}:</Text> {debt.amount_total.toLocaleString()} {currency.symbol}
              </Text>
              <Text style={styles.amountLine}>
                <Text style={styles.amountLabel}>{t('debtors.paidLabel')}:</Text> {paidAmount.toLocaleString()} {currency.symbol}
              </Text>
              <Text style={[styles.amountLine, { fontWeight: '600' }]}>
                {debt.remaining > 0 ? (
                  <Text style={{ color: '#E53935' }}>
                    <Text style={styles.amountLabel}>{t('debtors.remainingLabel')}:</Text> {debt.remaining.toLocaleString()} {currency.symbol}
                  </Text>
                ) : (
                  <Text style={{ color: '#1D9E75' }}>{t('debtors.fullyPaid')}</Text>
                )}
              </Text>
            </View>

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
                      <Text style={styles.historyPaymentNote} numberOfLines={1}>{p.note}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: 20,
  },
  historyDebtCard: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F0F0F0',
  },
  historyDebtHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  historyDebtDate: {
    fontSize: 13,
    color: '#999',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  statusPaid: {
    backgroundColor: '#E8F5E9',
  },
  statusActive: {
    backgroundColor: '#FFF3E0',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  historyDebtProduct: {
    fontSize: 14,
    fontWeight: '500',
    color: '#555',
    marginBottom: 6,
  },
  amountInfo: {
    marginBottom: 4,
  },
  amountLine: {
    fontSize: 14,
    color: '#333',
    marginBottom: 1,
  },
  amountLabel: {
    color: '#777',
    fontSize: 13,
  },
  historyDebtNote: {
    fontSize: 12,
    color: '#aaa',
    fontStyle: 'italic',
    marginTop: 4,
  },
  historyPaymentsList: {
    marginTop: 10,
    paddingLeft: 4,
    borderTopWidth: 0.5,
    borderTopColor: '#f9f9f9',
    paddingTop: 6,
  },
  historyPaymentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
  },
  historyPaymentDate: {
    fontSize: 12,
    color: '#999',
  },
  historyPaymentAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1D9E75',
  },
  historyPaymentNote: {
    fontSize: 12,
    color: '#aaa',
    flex: 1,
    marginLeft: 4,
  },
});
