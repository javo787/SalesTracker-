import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  TextInput, ScrollView, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../../context/AppContext';
import { addStockIn, addStockWaste, addStockCorrection } from '../../db/database';
import VoiceRecorder from '../VoiceRecorder';

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
  const { t } = useTranslation();
  const { theme, currency } = useAppContext();
  const isDark = theme === 'dark';

  const [type, setType] = useState<'stock_in' | 'waste' | 'correction'>(initialType);
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [unitType, setUnitType] = useState<'base' | 'package'>('base');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (visible) {
      setType(initialType);
      setQuantity('');
      setPrice('');
      setUnitType('base');
      setNote('');
    }
  }, [visible, initialType]);

  const handleSave = () => {
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
      addStockIn(product.id, qty, p, unitType, note);
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
    addStockWaste(product.id, qty, note);
    onSuccess();
    onClose();
  };

  const handleTranscript = (text: string) => {
    setNote(text);
    // Simple extraction logic can be added here or relied on AI structure
  };

  const renderTabs = () => (
    <View style={styles.tabs}>
      {(['stock_in', 'waste', 'correction'] as const).map((tId) => (
        <TouchableOpacity
          key={tId}
          style={[
            styles.tab,
            type === tId && styles.tabActive,
            isDark ? styles.tabDark : styles.tabLight
          ]}
          onPress={() => setType(tId)}
        >
          <Text style={[styles.tabText, type === tId && styles.tabTextActive]}>
            {t(`warehouse.${tId}`)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.centeredView}
      >
        <View style={[styles.modalView, isDark ? styles.modalDark : styles.modalLight]}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, isDark ? styles.textDark : styles.textLight]}>
                {t(`warehouse.${type}`)}
              </Text>
              <Text style={styles.subtitle}>{product?.name}</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={isDark ? '#fff' : '#000'} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
            {renderTabs()}

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
               <VoiceRecorder onTranscript={handleTranscript} />
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
  tabText: { fontSize: 13, fontWeight: '500', color: '#666' },
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
