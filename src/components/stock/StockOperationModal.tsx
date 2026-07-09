import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  TextInput, ScrollView, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../../context/AppContext';
import { useShop } from '../../context/ShopContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { addStockIn, addStockWaste, addStockCorrection } from '../../db/database';
import VoiceRecorder from '../VoiceRecorder';
import { VoiceSaleResult } from '../../types/voiceSale';

interface StockOperationModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  product: any;
  initialType?: 'stock_in' | 'waste' | 'correction';
}

export default function StockOperationModal({
  visible, onClose, onSuccess, product, initialType = 'stock_in'
}: StockOperationModalProps) {
  const { resolvedTheme, currency } = useAppContext();
  const isDark = resolvedTheme === 'dark';
  const { t } = useTranslation();
  const { isOwner, role, sellerName } = useShop();
  const { user } = useAuth();

  const currentSellerId = user?._id || null;
  const currentSellerName = sellerName || user?.name || null;

  const TYPE_LABELS: Record<string, string> = {
    stock_in: t('warehouse.stockIn'),
    waste:    t('warehouse.waste'),
    correction: t('warehouse.correction'),
  };

  // Продавцу доступен только приём товара — списание и сверку делает владелец
  const availableTypes = (isOwner
    ? ['stock_in', 'waste', 'correction']
    : ['stock_in']) as ('stock_in' | 'waste' | 'correction')[];

  const [type, setType] = useState<'stock_in' | 'waste' | 'correction'>(initialType);
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [unitType, setUnitType] = useState<'base' | 'package'>('base');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (visible) {
      setType(isOwner ? initialType : 'stock_in');
      setQuantity('');
      setPrice('');
      setUnitType('base');
      setNote('');
    }
  }, [visible, initialType, isOwner]);

  const handleSave = () => {
    if (!isOwner && type !== 'stock_in') {
      Alert.alert(t('common.error'), t('sellers.ownerOnly') || 'Доступно только владельцу магазина');
      return;
    }

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert(t('common.error'), t('warehouse.amount'));
      return;
    }

    if (type === 'stock_in') {
      const p = parseFloat(price);
      if (isNaN(p) || p < 0) {
        Alert.alert(t('common.error'), t('addSale.buyPrice'));
        return;
      }
      addStockIn(product.id, qty, p, unitType, note, currentSellerId, currentSellerName);

      if (role === 'seller') {
        api.post('/stock/receipt-log', {
          productName: product.name,
          quantity: qty,
          unit: unitType === 'package' ? (product.package_name || null) : (product.base_unit || null),
          pricePerUnit: p,
          note,
        }).catch(() => {});
      }
    } else if (type === 'waste') {
      if (qty > product.stock) {
        Alert.alert(
          t('warehouse.confirmWasteTitle'),
          t('warehouse.confirmWasteMsg', { qty, stock: product.stock }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.continue'), onPress: () => saveWaste(qty) }
          ]
        );
        return;
      }
      saveWaste(qty);
    } else if (type === 'correction') {
      addStockCorrection(product.id, qty, note);
    }

    onSuccess();
    onClose();
  };

  const saveWaste = (qty: number) => {
    const result = addStockWaste(product.id, qty, note);
    if (!result.success) {
      Alert.alert('Ошибка', result.message || 'Недостаточно на складе');
      return;
    }
    onSuccess();
    onClose();
  };

  const handleVoiceResult = (result: VoiceSaleResult) => {
    const text = result.transcript || result.items[0]?.product_name || '';
    setNote(text);
    const item = result.items[0];
    if (item?.quantity && item.quantity > 0) {
      setQuantity(String(item.quantity));
    }
    if (type === 'stock_in' && item?.buy_price && item.buy_price > 0) {
      setPrice(String(item.buy_price));
    }
  };

  const renderTabs = () => (
    <View style={styles.tabs}>
      {availableTypes.map((tId) => (
        <TouchableOpacity
          key={tId}
          style={[
            styles.tab,
            type === tId && styles.tabActive,
            isDark ? styles.tabDark : styles.tabLight
          ]}
          onPress={() => setType(tId)}
        >
          <Text style={[
            styles.tabText,
            isDark ? styles.tabTextDark : styles.tabTextLight,
            type === tId && styles.tabTextActive
          ]}>
            {TYPE_LABELS[tId]}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior="padding"
        style={styles.centeredView}
      >
        <View style={[styles.modalView, isDark ? styles.modalDark : styles.modalLight]}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, isDark ? styles.textDark : styles.textLight]}>
                {TYPE_LABELS[type]}
              </Text>
              <Text style={styles.subtitle}>{product?.name}</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={isDark ? '#fff' : '#000'} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
            {availableTypes.length > 1 && renderTabs()}

            <Text style={[styles.label, isDark ? styles.textDark : styles.textLight]}>
              {type === 'correction' ? t('warehouse.actualStock') : t('warehouse.amount')}
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, styles.flex1, isDark ? styles.inputDark : styles.inputLight]}
                placeholder="0"
                placeholderTextColor={isDark ? '#888' : '#aaa'}
                keyboardType="numeric"
                value={quantity}
                onChangeText={setQuantity}
                autoFocus
              />
              {product?.has_packages === 1 && type === 'stock_in' && (
                <View style={styles.unitSwitcher}>
                  <TouchableOpacity
                    style={[styles.unitBtn, unitType === 'base' && styles.unitBtnActive]}
                    onPress={() => setUnitType('base')}
                  >
                    <Text style={[styles.unitText, unitType === 'base' && styles.unitTextActive]}>
                      {product.base_unit || t('warehouse.unitBase')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.unitBtn, unitType === 'package' && styles.unitBtnActive]}
                    onPress={() => setUnitType('package')}
                  >
                    <Text style={[styles.unitText, unitType === 'package' && styles.unitTextActive]}>
                      {product.package_name || t('warehouse.unitPackage')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            <Text style={styles.hint}>
              {t('warehouse.currentStockHint', { stock: product?.stock, unit: product?.base_unit || t('warehouse.unitBase') })}
            </Text>

            {type === 'stock_in' && (
              <>
                <Text style={[styles.label, isDark ? styles.textDark : styles.textLight]}>
                  {t('warehouse.pricePerUnit', {
                    unit: unitType === 'base'
                      ? (product?.base_unit || t('warehouse.unitBase'))
                      : (product?.package_name || t('warehouse.unitPackage'))
                  })} ({currency.symbol})
                </Text>
                <TextInput
                  style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
                  placeholder="0"
                  placeholderTextColor={isDark ? '#888' : '#aaa'}
                  keyboardType="numeric"
                  value={price}
                  onChangeText={setPrice}
                />
              </>
            )}

            <Text style={[styles.label, isDark ? styles.textDark : styles.textLight]}>{t('warehouse.note')}</Text>
            <TextInput
              style={[styles.input, styles.textArea, isDark ? styles.inputDark : styles.inputLight]}
              placeholder="..."
              placeholderTextColor={isDark ? '#888' : '#aaa'}
              multiline
              numberOfLines={2}
              value={note}
              onChangeText={setNote}
            />

            <View style={styles.voiceSection}>
               <VoiceRecorder onResult={handleVoiceResult} />
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>{t('common.save')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
  title: { fontSize: 20, fontWeight: 'bold' },
  subtitle: { fontSize: 14, color: '#999', marginTop: 2 },
  form: { flex: 1 },
  tabs: { flexDirection: 'row', backgroundColor: '#F5F5F5', borderRadius: 12, padding: 4, marginBottom: 15 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  tabLight: { backgroundColor: '#F5F5F5' },
  tabDark: { backgroundColor: '#1E1E1E' },
  tabActive: { backgroundColor: '#1D9E75' },
  tabText:       { fontSize: 13, fontWeight: '500' },
  tabTextLight:  { color: '#333' },
  tabTextDark:   { color: '#AAA' },
  tabTextActive: { color: '#fff' },
  label: { fontSize: 14, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  input: { borderRadius: 10, padding: 12, fontSize: 16, borderWidth: 1 },
  inputLight: { backgroundColor: '#F5F5F5', borderColor: '#E0E0E0', color: '#333' },
  inputDark: { backgroundColor: '#1E1E1E', borderColor: '#333', color: '#EEE' },
  inputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  flex1: { flex: 1 },
  unitSwitcher: { flexDirection: 'row', backgroundColor: '#E0E0E0', borderRadius: 8, padding: 2 },
  unitBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  unitBtnActive: { backgroundColor: '#fff' },
  unitText: { fontSize: 12, color: '#666' },
  unitTextActive: { color: '#000', fontWeight: 'bold' },
  hint: { fontSize: 12, color: '#999', marginTop: 4, marginLeft: 4 },
  textArea: { height: 60, textAlignVertical: 'top' },
  voiceSection: { alignItems: 'center', marginVertical: 10 },
  saveBtn: { backgroundColor: '#1D9E75', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 10, marginBottom: 20 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  textLight: { color: '#000' },
  textDark: { color: '#fff' },
});
