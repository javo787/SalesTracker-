import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  FlatList, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../../context/AppContext';
import { getStockMovements, getLastPurchaseInfo } from '../../db/database';

interface StockHistorySheetProps {
  visible: boolean;
  onClose: () => void;
  product: any;
}

export default function StockHistorySheet({ visible, onClose, product }: StockHistorySheetProps) {
  const { t } = useTranslation();
  const { resolvedTheme, currency } = useAppContext(); const isDark = resolvedTheme === "dark";
  const [movements, setMovements] = useState<any[]>([]);
  const [lastPurchaseInfo, setLastPurchaseInfo] = useState<{ price_per_unit: number; created_at: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible && product) {
      loadHistory();
    }
  }, [visible, product]);

  const loadHistory = () => {
    setLoading(true);
    const data = getStockMovements(product.id);
    setMovements(data);
    const lastPurchase = getLastPurchaseInfo(product.id);
    setLastPurchaseInfo(lastPurchase);
    setLoading(false);
  };

  const renderItem = ({ item }: { item: any }) => {
    const isPositive = item.quantity_change > 0;
    const date = new Date(item.created_at).toLocaleString();

    let icon = 'swap-horizontal-outline';
    let color = '#999';
    let typeLabel = t(`warehouse.type${item.type.charAt(0).toUpperCase() + item.type.slice(1)}`);

    if (item.type === 'stock_in') {
      icon = 'arrow-down-circle-outline';
      color = '#1D9E75';
    } else if (item.type === 'waste') {
      icon = 'trash-outline';
      color = '#FF5252';
    } else if (item.type === 'correction') {
      icon = 'git-commit-outline';
      color = '#FF9800';
    }

    return (
      <View style={[styles.item, isDark ? styles.itemDark : styles.itemLight]}>
        <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
          <Ionicons name={icon as any} size={20} color={color} />
        </View>
        <View style={styles.itemMain}>
          <Text style={[styles.itemType, isDark ? styles.textDark : styles.textLight]}>{typeLabel}</Text>
          <Text style={styles.itemDate}>{date}</Text>
          {item.note && <Text style={styles.itemNote}>{item.note}</Text>}
        </View>
        <View style={styles.itemRight}>
          <Text style={[styles.itemQty, { color: isPositive ? '#1D9E75' : '#FF5252' }]}>
            {isPositive ? '+' : ''}{item.quantity_change} {product.base_unit || t('warehouse.unitBase')}
          </Text>
          {item.price_per_unit && (
            <Text style={styles.itemPrice}>
              {item.price_per_unit} {currency.symbol}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.centeredView}>
        <View style={[styles.modalView, isDark ? styles.modalDark : styles.modalLight]}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, isDark ? styles.textDark : styles.textLight]}>
                {t('warehouse.history')}
              </Text>
              <Text style={styles.subtitle}>{product?.name}</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={isDark ? '#fff' : '#000'} />
            </TouchableOpacity>
          </View>

          {lastPurchaseInfo && (
            <Text style={styles.lastPurchase}>
              Последняя закупка: {lastPurchaseInfo.price_per_unit} {currency.symbol} ({new Date(lastPurchaseInfo.created_at).toLocaleDateString('ru-RU')})
            </Text>
          )}

          {loading ? (
            <ActivityIndicator size="large" color="#1D9E75" style={{ marginTop: 20 }} />
          ) : (
            <FlatList
              data={movements}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Ionicons name="receipt-outline" size={48} color="#ccc" />
                  <Text style={styles.emptyText}>{t('warehouse.emptyHistory')}</Text>
                </View>
              }
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          )}

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {t('products.lastUpdate')}: {product?.updated_at ? new Date(product.updated_at).toLocaleString() : '-'}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centeredView: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalView: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, height: '80%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25, shadowRadius: 4, elevation: 5,
  },
  modalLight: { backgroundColor: '#fff' },
  modalDark: { backgroundColor: '#121212' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 'bold' },
  subtitle: { fontSize: 14, color: '#999', marginTop: 2 },
  lastPurchase: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 15,
  },
  item: { flexDirection: 'row', padding: 12, borderRadius: 12, marginBottom: 8, alignItems: 'center' },
  itemLight: { backgroundColor: '#F9F9F9' },
  itemDark: { backgroundColor: '#1E1E1E' },
  iconContainer: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  itemMain: { flex: 1 },
  itemType: { fontSize: 14, fontWeight: '600' },
  itemDate: { fontSize: 11, color: '#999', marginTop: 2 },
  itemNote: { fontSize: 12, color: '#666', marginTop: 4, fontStyle: 'italic' },
  itemRight: { alignItems: 'flex-end' },
  itemQty: { fontSize: 14, fontWeight: 'bold' },
  itemPrice: { fontSize: 11, color: '#999', marginTop: 2 },
  empty: { alignItems: 'center', marginTop: 50 },
  emptyText: { color: '#999', marginTop: 10 },
  footer: { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10, marginTop: 10 },
  footerText: { fontSize: 12, color: '#999', textAlign: 'center' },
  textLight: { color: '#000' },
  textDark: { color: '#fff' },
});
