import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../../context/AppContext';
import { Colors, LightTheme, DarkTheme, Radius, Shadow } from '../../constants/theme';
import { PRESET_COLORS, getColorHex, ColorCircle } from '../../constants/colors';
import { getProducts, receiveProductBatch, BatchReceiveItem } from '../../db/database';
import { SyncService } from '../../services/syncService';

interface ReceiveBatchModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function ReceiveBatchModal({ visible, onClose, onSaved }: ReceiveBatchModalProps) {
  const { t } = useTranslation();
  const { resolvedTheme, currency } = useAppContext();
  const isDark = resolvedTheme === 'dark';
  const themeStyles = isDark ? DarkTheme : LightTheme;

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 state
  const [article, setArticle] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');

  // Step 2 state
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [customColorInput, setCustomColorInput] = useState('');
  const [sizesInput, setSizesInput] = useState('');
  const [sizesList, setSizesList] = useState<string[]>([]);

  // Step 3 state (quantities: Record<color, Record<size, string>>)
  const [currentColorIdx, setCurrentColorIdx] = useState(0);
  const [quantities, setQuantities] = useState<Record<string, Record<string, string>>>({});
  const [bulkQtyInput, setBulkQtyInput] = useState('1');

  const [saving, setSaving] = useState(false);
  const [existingProducts, setExistingProducts] = useState<any[]>([]);

  useEffect(() => {
    if (visible) {
      setStep(1);
      setArticle('');
      setName('');
      setCategory('');
      setBuyPrice('');
      setSellPrice('');
      setSelectedColors([]);
      setCustomColorInput('');
      setSizesInput('40, 42, 44, 46');
      setSizesList(['40', '42', '44', '46']);
      setCurrentColorIdx(0);
      setQuantities({});
      setBulkQtyInput('1');

      getProducts().then(setExistingProducts).catch(console.error);
    }
  }, [visible]);

  // Handle article match prefill
  const handleArticleChange = (text: string) => {
    setArticle(text);
    const match = existingProducts.find(p => p.article && p.article.trim().toLowerCase() === text.trim().toLowerCase());
    if (match) {
      if (!name) setName(match.name || '');
      if (!category) setCategory(match.category || '');
      if (!buyPrice) setBuyPrice(String(match.buy_price ?? ''));
      if (!sellPrice) setSellPrice(String(match.sell_price ?? ''));
    }
  };

  const handleAddColor = (c: string) => {
    const trimmed = c.trim();
    if (!trimmed) return;
    if (!selectedColors.includes(trimmed)) {
      setSelectedColors([...selectedColors, trimmed]);
    }
  };

  const handleRemoveColor = (c: string) => {
    setSelectedColors(selectedColors.filter(col => col !== c));
  };

  const handleGoToStep2 = () => {
    if (!name.trim() || !buyPrice || !sellPrice) {
      Alert.alert(t('common.error'), t('products.errorRequired'));
      return;
    }
    setStep(2);
  };

  const handleGoToStep3 = () => {
    if (selectedColors.length === 0) {
      Alert.alert(t('common.error'), 'Укажите хотя бы один цвет');
      return;
    }
    const parsedSizes = sizesInput
      .split(/[,;\s]+/)
      .map(s => s.trim())
      .filter(Boolean);

    if (parsedSizes.length === 0) {
      Alert.alert(t('common.error'), 'Укажите хотя бы один размер');
      return;
    }

    setSizesList(parsedSizes);

    // Initialize quantities matrix
    const initialQty: Record<string, Record<string, string>> = {};
    selectedColors.forEach(c => {
      initialQty[c] = {};
      parsedSizes.forEach(s => {
        initialQty[c][s] = quantities[c]?.[s] || '';
      });
    });
    setQuantities(initialQty);
    setCurrentColorIdx(0);
    setStep(3);
  };

  const handleQuantityChange = (color: string, size: string, val: string) => {
    setQuantities(prev => ({
      ...prev,
      [color]: {
        ...(prev[color] || {}),
        [size]: val,
      }
    }));
  };

  const handleBulkFillCurrentColor = () => {
    const currentColor = selectedColors[currentColorIdx];
    if (!currentColor) return;
    const newColorQty: Record<string, string> = {};
    sizesList.forEach(s => {
      newColorQty[s] = bulkQtyInput;
    });

    setQuantities(prev => ({
      ...prev,
      [currentColor]: newColorQty,
    }));
  };

  const handleSaveBatch = async () => {
    const finalArticle = article.trim() || null;
    const bPrice = parseFloat(buyPrice) || 0;
    const sPrice = parseFloat(sellPrice) || 0;
    const cat = category.trim() || null;

    setSaving(true);
    try {
      const batchItems: BatchReceiveItem[] = [];
      for (const color of selectedColors) {
        for (const size of sizesList) {
          const qtyStr = quantities[color]?.[size];
          const qty = parseFloat(qtyStr || '0') || 0;
          if (qty > 0) {
            batchItems.push({
              article: finalArticle,
              name: name.trim(),
              category: cat,
              buyPrice: bPrice,
              sellPrice: sPrice,
              color: color.trim(),
              size: size.trim(),
              quantity: qty,
            });
          }
        }
      }

      if (batchItems.length > 0) {
        await receiveProductBatch(batchItems);
      }

      SyncService.pushDebounced();
      Alert.alert('✅ Успешно', 'Партия товаров добавлена на склад');
      onSaved();
      onClose();
    } catch (e) {
      console.error('Error saving batch:', e);
      Alert.alert(t('common.error'), 'Не удалось сохранить партию');
    } finally {
      setSaving(false);
    }
  };

  const currentColor = selectedColors[currentColorIdx];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheetWrap}
        >
          <View style={[styles.sheet, { backgroundColor: themeStyles.card }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: themeStyles.text }]}>
                Приёмка партии товаров (Шаг {step} из 3)
              </Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color={themeStyles.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }}>
              {step === 1 && (
                <View>
                  <Text style={[styles.stepSubtitle, { color: themeStyles.textSecondary }]}>
                    1. Общая информация о модели
                  </Text>

                  <Text style={[styles.label, { color: themeStyles.text }]}>{t('products.article')}</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: themeStyles.inputBg, borderColor: themeStyles.inputBorder, color: themeStyles.text }]}
                    placeholder="Напр. 6593"
                    placeholderTextColor={isDark ? '#888' : '#aaa'}
                    value={article}
                    onChangeText={handleArticleChange}
                  />

                  <Text style={[styles.label, { color: themeStyles.text }]}>{t('addSale.productName')} *</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: themeStyles.inputBg, borderColor: themeStyles.inputBorder, color: themeStyles.text }]}
                    placeholder="Напр. Костюм тройка"
                    placeholderTextColor={isDark ? '#888' : '#aaa'}
                    value={name}
                    onChangeText={setName}
                  />

                  <Text style={[styles.label, { color: themeStyles.text }]}>{t('products.category')}</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: themeStyles.inputBg, borderColor: themeStyles.inputBorder, color: themeStyles.text }]}
                    placeholder={t('products.categoryPlaceholder')}
                    placeholderTextColor={isDark ? '#888' : '#aaa'}
                    value={category}
                    onChangeText={setCategory}
                  />

                  <View style={styles.row}>
                    <View style={styles.half}>
                      <Text style={[styles.label, { color: themeStyles.text }]}>{t('addSale.buyPrice')} *</Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: themeStyles.inputBg, borderColor: themeStyles.inputBorder, color: themeStyles.text }]}
                        placeholder="0"
                        keyboardType="numeric"
                        value={buyPrice}
                        onChangeText={setBuyPrice}
                      />
                    </View>
                    <View style={styles.half}>
                      <Text style={[styles.label, { color: themeStyles.text }]}>{t('addSale.sellPrice')} *</Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: themeStyles.inputBg, borderColor: themeStyles.inputBorder, color: themeStyles.text }]}
                        placeholder="0"
                        keyboardType="numeric"
                        value={sellPrice}
                        onChangeText={setSellPrice}
                      />
                    </View>
                  </View>

                  <TouchableOpacity style={styles.nextBtn} onPress={handleGoToStep2}>
                    <Text style={styles.nextBtnText}>Далее: Цвета и Размеры →</Text>
                  </TouchableOpacity>
                </View>
              )}

              {step === 2 && (
                <View>
                  <Text style={[styles.stepSubtitle, { color: themeStyles.textSecondary }]}>
                    2. Выберите цвета и размеры в этой поставке
                  </Text>

                  <Text style={[styles.label, { color: themeStyles.text }]}>Цвета в этой поставке *</Text>

                  {/* Selected Color Chips */}
                  <View style={styles.chipRow}>
                    {selectedColors.map((c) => (
                      <View key={c} style={[styles.selectedChip, { backgroundColor: isDark ? '#333' : '#E8F5E9' }]}>
                        <ColorCircle hex={getColorHex(c) ?? '#BDBDBD'} size={14} />
                        <Text style={{ color: themeStyles.text, fontSize: 13 }}>{c}</Text>
                        <TouchableOpacity onPress={() => handleRemoveColor(c)}>
                          <Ionicons name="close-circle" size={16} color="#888" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>

                  {/* Preset Colors Grid */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {PRESET_COLORS.map((preset) => (
                        <TouchableOpacity
                          key={preset.label}
                          onPress={() => handleAddColor(preset.label)}
                          style={{ alignItems: 'center', width: 52 }}
                        >
                          <ColorCircle hex={preset.hex} size={28} />
                          <Text style={{ color: themeStyles.text, fontSize: 9, marginTop: 2 }} numberOfLines={1}>
                            {preset.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, marginBottom: 12 }}>
                    <TextInput
                      style={[styles.input, { flex: 1, backgroundColor: themeStyles.inputBg, borderColor: themeStyles.inputBorder, color: themeStyles.text }]}
                      placeholder="Другой цвет..."
                      placeholderTextColor={isDark ? '#888' : '#aaa'}
                      value={customColorInput}
                      onChangeText={setCustomColorInput}
                    />
                    <TouchableOpacity
                      style={styles.addSmallBtn}
                      onPress={() => {
                        handleAddColor(customColorInput);
                        setCustomColorInput('');
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: 'bold' }}>+</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={[styles.label, { color: themeStyles.text }]}>Размеры в этой поставке (через запятую) *</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: themeStyles.inputBg, borderColor: themeStyles.inputBorder, color: themeStyles.text }]}
                    placeholder="Напр. 40, 42, 44, 46 или S, M, L, XL"
                    placeholderTextColor={isDark ? '#888' : '#aaa'}
                    value={sizesInput}
                    onChangeText={setSizesInput}
                  />

                  <View style={styles.btnRow}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
                      <Text style={{ color: themeStyles.textSecondary }}>← Назад</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.nextBtn, { flex: 1 }]} onPress={handleGoToStep3}>
                      <Text style={styles.nextBtnText}>Далее: Количество →</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {step === 3 && (
                <View>
                  <View style={styles.progressHeader}>
                    <Text style={[styles.stepSubtitle, { color: Colors.primary, fontWeight: 'bold' }]}>
                      3. Количество ({currentColorIdx + 1} из {selectedColors.length} цветов)
                    </Text>
                  </View>

                  {/* Current color header */}
                  <View style={[styles.currentColorCard, { backgroundColor: isDark ? '#2C2C2E' : '#F0FDF4' }]}>
                    <ColorCircle hex={getColorHex(currentColor) ?? '#BDBDBD'} size={20} />
                    <Text style={[styles.currentColorTitle, { color: themeStyles.text }]}>
                      Цвет: {currentColor}
                    </Text>
                  </View>

                  {/* Bulk fill action */}
                  <View style={styles.bulkFillRow}>
                    <Text style={{ fontSize: 13, color: themeStyles.textSecondary }}>Заполнить все по:</Text>
                    <TextInput
                      style={[styles.bulkInput, { backgroundColor: themeStyles.inputBg, borderColor: themeStyles.inputBorder, color: themeStyles.text }]}
                      keyboardType="numeric"
                      value={bulkQtyInput}
                      onChangeText={setBulkQtyInput}
                    />
                    <TouchableOpacity style={styles.bulkBtn} onPress={handleBulkFillCurrentColor}>
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Применить</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Sizes vertical list */}
                  {sizesList.map((sz) => (
                    <View key={sz} style={styles.sizeQtyRow}>
                      <Text style={[styles.sizeLabel, { color: themeStyles.text }]}>Размер {sz}</Text>
                      <TextInput
                        style={[styles.qtyInput, { backgroundColor: themeStyles.inputBg, borderColor: themeStyles.inputBorder, color: themeStyles.text }]}
                        placeholder="0"
                        placeholderTextColor={isDark ? '#888' : '#aaa'}
                        keyboardType="numeric"
                        value={quantities[currentColor]?.[sz] || ''}
                        onChangeText={(val) => handleQuantityChange(currentColor, sz, val)}
                      />
                      <Text style={{ fontSize: 12, color: themeStyles.textSecondary }}>шт</Text>
                    </View>
                  ))}

                  <View style={[styles.btnRow, { marginTop: 16 }]}>
                    {currentColorIdx > 0 ? (
                      <TouchableOpacity
                        style={styles.backBtn}
                        onPress={() => setCurrentColorIdx(currentColorIdx - 1)}
                      >
                        <Text style={{ color: themeStyles.textSecondary }}>← Пред. цвет</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={styles.backBtn} onPress={() => setStep(2)}>
                        <Text style={{ color: themeStyles.textSecondary }}>← Шаг 2</Text>
                      </TouchableOpacity>
                    )}

                    {currentColorIdx < selectedColors.length - 1 ? (
                      <TouchableOpacity
                        style={[styles.nextBtn, { flex: 1 }]}
                        onPress={() => setCurrentColorIdx(currentColorIdx + 1)}
                      >
                        <Text style={styles.nextBtnText}>След. цвет →</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.saveBtn, saving && { opacity: 0.6 }, { flex: 1 }]}
                        disabled={saving}
                        onPress={handleSaveBatch}
                      >
                        <Text style={styles.saveBtnText}>✓ Сохранить партию</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheetWrap: { width: '100%' },
  sheet: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: 16,
    paddingBottom: 24,
    ...Shadow.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sheetTitle: { fontSize: 16, fontWeight: 'bold' },
  stepSubtitle: { fontSize: 13, marginBottom: 12 },
  label: { fontSize: 13, marginBottom: 6, marginTop: 10 },
  input: {
    borderRadius: 8, padding: 10,
    fontSize: 14, borderWidth: 1,
  },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  selectedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 5, paddingHorizontal: 10, borderRadius: 16,
  },
  addSmallBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 8, paddingHorizontal: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 16, alignItems: 'center' },
  backBtn: { padding: 12 },
  nextBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10, padding: 12, alignItems: 'center',
  },
  nextBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10, padding: 12, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  progressHeader: { marginBottom: 8 },
  currentColorCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 8, marginBottom: 12,
  },
  currentColorTitle: { fontSize: 15, fontWeight: 'bold' },
  bulkFillRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#EEE',
  },
  bulkInput: {
    borderWidth: 1, borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8,
    width: 50, textAlign: 'center', fontSize: 14,
  },
  bulkBtn: {
    backgroundColor: Colors.primary, borderRadius: 6,
    paddingVertical: 6, paddingHorizontal: 10,
  },
  sizeQtyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EEE',
  },
  sizeLabel: { fontSize: 14, flex: 1 },
  qtyInput: {
    borderWidth: 1, borderRadius: 6, paddingVertical: 4, paddingHorizontal: 10,
    width: 70, textAlign: 'center', fontSize: 14, marginRight: 8,
  },
});
