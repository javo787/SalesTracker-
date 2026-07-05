import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../../context/AppContext';
import { ExpenseType, ExpenseCategory } from '../../types/expense';
import CategoryPicker from './CategoryPicker';
import VoiceRecorder from '../VoiceRecorder';
import { VoiceSaleResult } from '../../types/voiceSale';
import { useExpenses } from '../../hooks/useExpenses';
import { analyticsService } from '../../services/analyticsService';

interface AddExpenseModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const EXPENSE_VOICE_PROMPT = "сомони, харид, нарх, обед, аренда, свет, вода, доставка, зарплата, лампочка, весы";

export default function AddExpenseModal({ visible, onClose, onSuccess }: AddExpenseModalProps) {
  const { t } = useTranslation();
  const { resolvedTheme, currency } = useAppContext(); const isDark = resolvedTheme === "dark";
  const { addExpense } = useExpenses();

  const [type, setType] = useState<ExpenseType>('operational');
  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (visible) {
      // Reset form when opening
      setType('operational');
      setCategory('other');
      setAmount('');
      setDescription('');
    }
  }, [visible]);

  useEffect(() => {
    if (type === 'inventory') {
      setCategory('inventory');
    } else {
      setCategory('other');
    }
  }, [type]);

  const extractAmountFromText = (text: string): number | null => {
    const match = text.match(/(\d[\d\s]*)\s*(сомон|сом|tjs)?/i);
    if (match) return parseInt(match[1].replace(/\s/g, ''));
    return null;
  };

  const handleVoiceResult = (result: VoiceSaleResult) => {
    const text = result.transcript || result.items[0]?.product_name || '';
    setDescription(text);
    const extracted = extractAmountFromText(text);
    if (extracted !== null) {
      setAmount(String(extracted));
    }
  };

  const handleSave = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert(t('common.error'), t('addSale.sellPrice')); // Reusing for "Enter amount"
      return;
    }

    try {
      await addExpense({
        type,
        category,
        amount: numAmount,
        description,
      });
      analyticsService.logEvent('expense_added', { type, category, amount: numAmount });
      onSuccess();
      onClose();
    } catch (error) {
      Alert.alert(t('common.error'), 'Failed to save expense');
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior="padding"
        style={styles.centeredView}
      >
        <View style={[styles.modalView, isDark ? styles.modalDark : styles.modalLight]}>
          <View style={styles.header}>
            <Text style={[styles.title, isDark ? styles.textDark : styles.textLight]}>
              {t('expenses.newExpense')}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={isDark ? '#fff' : '#000'} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
            {/* Type Switcher */}
            <View style={[styles.typeSwitcher, { backgroundColor: isDark ? '#2A2A2A' : '#F5F5F5' }]}>
              <TouchableOpacity
                style={[
                  styles.typeBtn,
                  type === 'operational' && styles.typeBtnActive,
                  isDark ? styles.typeBtnDark : styles.typeBtnLight,
                ]}
                onPress={() => setType('operational')}
              >
                <Text style={[styles.typeText, type === 'operational' && styles.typeTextActive]}>
                  {t('expenses.operational')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.typeBtn,
                  type === 'inventory' && styles.typeBtnActive,
                  isDark ? styles.typeBtnDark : styles.typeBtnLight,
                ]}
                onPress={() => setType('inventory')}
              >
                <Text style={[styles.typeText, type === 'inventory' && styles.typeTextActive]}>
                  {t('expenses.inventory')}
                </Text>
              </TouchableOpacity>
            </View>

            {type === 'operational' && (
              <>
                <Text style={[styles.label, isDark ? styles.textDark : styles.textLight]}>{t('expenses.category')}</Text>
                <CategoryPicker selectedCategory={category} onSelect={setCategory} isDark={isDark} />
              </>
            )}

            {type === 'inventory' && (
              <View style={[styles.inventoryHint, { backgroundColor: isDark ? '#1A2A1A' : '#F0FBF7' }]}>
                <Ionicons name="information-circle-outline" size={16} color="#1D9E75" />
                <Text style={styles.inventoryHintText}>
                  {t('expenses.inventoryHint')}
                </Text>
              </View>
            )}

            <Text style={[styles.label, isDark ? styles.textDark : styles.textLight]}>{t('expenses.amount')} ({currency.symbol})</Text>
            <TextInput
              style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
              placeholder="0"
              placeholderTextColor={isDark ? '#888' : '#aaa'}
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              autoFocus
            />

            <Text style={[styles.label, isDark ? styles.textDark : styles.textLight]}>{t('expenses.description')}</Text>
            <TextInput
              style={[styles.input, styles.textArea, isDark ? styles.inputDark : styles.inputLight]}
              placeholder={t('expenses.descriptionPlaceholder')}
              placeholderTextColor={isDark ? '#888' : '#aaa'}
              multiline
              numberOfLines={3}
              value={description}
              onChangeText={setDescription}
            />

            <View style={styles.voiceSection}>
               <VoiceRecorder onResult={handleVoiceResult} />
               <Text style={styles.voiceHint}>{t('expenses.voiceHint')}</Text>
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
  centeredView: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalView: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    height: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalLight: { backgroundColor: '#fff' },
  modalDark: { backgroundColor: '#121212' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  form: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 15,
    marginBottom: 8,
  },
  input: {
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
  },
  inputLight: {
    backgroundColor: '#F5F5F5',
    borderColor: '#E0E0E0',
    color: '#333',
  },
  inputDark: {
    backgroundColor: '#1E1E1E',
    borderColor: '#333',
    color: '#EEE',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  typeSwitcher: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 10,
  },
  inventoryHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#1D9E75',
  },
  inventoryHintText: {
    fontSize: 13,
    color: '#1D9E75',
    flex: 1,
    lineHeight: 18,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  typeBtnLight: { backgroundColor: '#F5F5F5' },
  typeBtnDark: { backgroundColor: '#1E1E1E' },
  typeBtnActive: {
    backgroundColor: '#1D9E75',
  },
  typeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  typeTextActive: {
    color: '#fff',
  },
  voiceSection: {
    alignItems: 'center',
    marginVertical: 15,
  },
  voiceHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
  },
  saveBtn: {
    backgroundColor: '#1D9E75',
    borderRadius: 15,
    padding: 18,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 30,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  textLight: { color: '#000' },
  textDark: { color: '#fff' },
});
