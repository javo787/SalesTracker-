import React, { useState, useRef, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../../context/AppContext';
import { Colors, LightTheme, DarkTheme, Radius, Shadow } from '../../constants/theme';
import { PRESET_COLORS, getColorHex, ColorCircle } from '../../constants/colors';
import { updateProduct } from '../../db/database';
import { useFieldChain } from '../../hooks/useFieldChain';

interface EditProductModalProps {
  visible: boolean;
  product: any;
  onClose: () => void;
  onSaved: (updated: any) => void;
}

export default function EditProductModal({ visible, product, onClose, onSaved }: EditProductModalProps) {
  const { t } = useTranslation();
  const { resolvedTheme, currency } = useAppContext();
  const isDark = resolvedTheme === 'dark';
  const themeStyles = isDark ? DarkTheme : LightTheme;

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [stock, setStock] = useState('');
  const [minStockAlert, setMinStockAlert] = useState('');
  const [baseUnit, setBaseUnit] = useState('шт');
  const [hasPackages, setHasPackages] = useState(false);
  const [isContinuous, setIsContinuous] = useState(false);
  const [packageName, setPackageName] = useState('');
  const [unitsPerPackage, setUnitsPerPackage] = useState('1');
  const [article, setArticle] = useState('');
  const [color, setColor] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);

  const categoryRef = useRef<any>(null);
  const buyPriceRef = useRef<any>(null);
  const sellPriceRef = useRef<any>(null);
  const stockRef = useRef<any>(null);
  const minStockAlertRef = useRef<any>(null);
  const articleRef = useRef<any>(null);
  const baseUnitRef = useRef<any>(null);

  useEffect(() => {
    if (visible && product) {
      setName(product.name || '');
      setCategory(product.category || '');
      setBuyPrice(String(product.buy_price ?? ''));
      setSellPrice(String(product.sell_price ?? ''));
      setStock(String(product.stock ?? 0));
      setMinStockAlert(String(product.min_stock_alert || 0));
      setBaseUnit(product.base_unit || 'шт');
      setHasPackages(product.has_packages === 1);
      setIsContinuous(product.is_continuous === 1);
      setPackageName(product.package_name || '');
      setUnitsPerPackage(String(product.units_per_package || 1));
      setArticle(product.article || '');
      setColor(product.color || '');
      setShowColorPicker(!!product.color);
      setShowAdvanced(
        product.has_packages === 1 ||
        product.base_unit !== 'шт' ||
        product.is_continuous === 1 ||
        !!product.article ||
        !!product.color
      );
    }
  }, [visible, product]);

  const { getSubmitHandler, getReturnKeyType } = useFieldChain(
    [
      { ref: categoryRef, visible: true },
      { ref: buyPriceRef, visible: true },
      { ref: sellPriceRef, visible: true },
      { ref: stockRef, visible: true },
      { ref: minStockAlertRef, visible: true },
      { ref: articleRef, visible: showAdvanced },
      { ref: baseUnitRef, visible: showAdvanced },
    ],
    () => handleSave()
  );

  const handleSave = () => {
    if (!name.trim() || !buyPrice || !sellPrice) {
      Alert.alert(t('common.error'), t('products.errorRequired'));
      return;
    }

    const bPrice = parseFloat(buyPrice);
    const sPrice = parseFloat(sellPrice);
    const st = parseFloat(stock) || 0;
    const alert = parseFloat(minStockAlert) || 0;
    const uPerPkg = parseFloat(unitsPerPackage) || 1;
    const cat = category.trim() || null;
    const finalArticle = article.trim() || null;
    const finalColor = color.trim() || null;

    setSaving(true);
    try {
      updateProduct(
        product.id, name.trim(), bPrice, sPrice, st, alert, baseUnit,
        hasPackages ? 1 : 0, packageName, uPerPkg, cat,
        isContinuous ? 1 : 0, finalArticle, finalColor
      );

      onSaved({
        ...product,
        name: name.trim(), category: cat, buy_price: bPrice, sell_price: sPrice,
        stock: st, min_stock_alert: alert, base_unit: baseUnit,
        has_packages: hasPackages ? 1 : 0, package_name: packageName,
        units_per_package: uPerPkg, is_continuous: isContinuous ? 1 : 0,
        article: finalArticle, color: finalColor,
      });
    } finally {
      setSaving(false);
    }
  };

  if (!product) return null;

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
                {t('products.editProduct')}
              </Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={themeStyles.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: '100%' }}>
              <Text style={[styles.label, { color: themeStyles.text }]}>{t('addSale.productName')} *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: themeStyles.inputBg, borderColor: themeStyles.inputBorder, color: themeStyles.text }]}
                placeholder={t('addSale.productPlaceholder')}
                placeholderTextColor={isDark ? '#888' : '#aaa'}
                value={name}
                onChangeText={setName}
                returnKeyType="next"
                onSubmitEditing={() => categoryRef.current?.focus()}
                blurOnSubmit={false}
              />

              <Text style={[styles.label, { color: themeStyles.text }]}>{t('products.category')}</Text>
              <TextInput
                ref={categoryRef}
                style={[styles.input, { backgroundColor: themeStyles.inputBg, borderColor: themeStyles.inputBorder, color: themeStyles.text }]}
                placeholder={t('products.categoryPlaceholder')}
                placeholderTextColor={isDark ? '#888' : '#aaa'}
                value={category}
                onChangeText={setCategory}
                returnKeyType={getReturnKeyType(0)}
                onSubmitEditing={getSubmitHandler(0)}
                blurOnSubmit={false}
              />

              <View style={styles.row}>
                <View style={styles.half}>
                  <Text style={[styles.label, { color: themeStyles.text }]}>{t('addSale.buyPrice')} *</Text>
                  <TextInput
                    ref={buyPriceRef}
                    style={[styles.input, { backgroundColor: themeStyles.inputBg, borderColor: themeStyles.inputBorder, color: themeStyles.text }]}
                    placeholder="0"
                    placeholderTextColor={isDark ? '#888' : '#aaa'}
                    keyboardType="numeric"
                    value={buyPrice}
                    onChangeText={setBuyPrice}
                    returnKeyType={getReturnKeyType(1)}
                    onSubmitEditing={getSubmitHandler(1)}
                    blurOnSubmit={false}
                  />
                </View>
                <View style={styles.half}>
                  <Text style={[styles.label, { color: themeStyles.text }]}>{t('addSale.sellPrice')} *</Text>
                  <TextInput
                    ref={sellPriceRef}
                    style={[styles.input, { backgroundColor: themeStyles.inputBg, borderColor: themeStyles.inputBorder, color: themeStyles.text }]}
                    placeholder="0"
                    placeholderTextColor={isDark ? '#888' : '#aaa'}
                    keyboardType="numeric"
                    value={sellPrice}
                    onChangeText={setSellPrice}
                    returnKeyType={getReturnKeyType(2)}
                    onSubmitEditing={getSubmitHandler(2)}
                    blurOnSubmit={false}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.half}>
                  <Text style={[styles.label, { color: themeStyles.text }]}>{t('products.stock')} ({baseUnit})</Text>
                  <TextInput
                    ref={stockRef}
                    style={[styles.input, { backgroundColor: themeStyles.inputBg, borderColor: themeStyles.inputBorder, color: themeStyles.text }]}
                    placeholder="0"
                    placeholderTextColor={isDark ? '#888' : '#aaa'}
                    keyboardType="numeric"
                    value={stock}
                    onChangeText={setStock}
                    returnKeyType={getReturnKeyType(3)}
                    onSubmitEditing={getSubmitHandler(3)}
                    blurOnSubmit={false}
                  />
                  {String(product.stock ?? 0) !== stock && stock !== '' && (
                    <Text style={styles.stockChangeHint}>
                      {product.stock ?? 0} → {stock || 0} {baseUnit}
                    </Text>
                  )}
                </View>
                <View style={styles.half}>
                  <Text style={[styles.label, { color: themeStyles.text }]}>{t('products.minStock')}</Text>
                  <TextInput
                    ref={minStockAlertRef}
                    style={[styles.input, { backgroundColor: themeStyles.inputBg, borderColor: themeStyles.inputBorder, color: themeStyles.text }]}
                    placeholder="0"
                    placeholderTextColor={isDark ? '#888' : '#aaa'}
                    keyboardType="numeric"
                    value={minStockAlert}
                    onChangeText={setMinStockAlert}
                    returnKeyType={getReturnKeyType(4)}
                    onSubmitEditing={getSubmitHandler(4)}
                    blurOnSubmit={false}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={styles.advancedToggle}
                onPress={() => setShowAdvanced(!showAdvanced)}
              >
                <Text style={styles.advancedToggleText}>{t('products.advancedSettings')}</Text>
                <Ionicons name={showAdvanced ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.primary} />
              </TouchableOpacity>

              {showAdvanced && (
                <View>
                  <Text style={[styles.label, { color: themeStyles.text }]}>{t('products.article')}</Text>
                  <TextInput
                    ref={articleRef}
                    style={[styles.input, { backgroundColor: themeStyles.inputBg, borderColor: themeStyles.inputBorder, color: themeStyles.text }]}
                    placeholder="6593"
                    placeholderTextColor={isDark ? '#888' : '#aaa'}
                    value={article}
                    onChangeText={setArticle}
                    returnKeyType={getReturnKeyType(5)}
                    onSubmitEditing={getSubmitHandler(5)}
                    blurOnSubmit={false}
                  />

                  {color !== '' ? (
                    <TouchableOpacity
                      onPress={() => setShowColorPicker(!showColorPicker)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 12 }}
                    >
                      <ColorCircle size={22} hex={(color ? getColorHex(color) : null) ?? '#BDBDBD'} />
                      <Text style={{ color: themeStyles.text, fontSize: 14 }}>{color}</Text>
                      <Ionicons name={showColorPicker ? 'chevron-up' : 'chevron-down'} size={14} color="#888" />
                      <TouchableOpacity
                        onPress={() => { setColor(''); setShowColorPicker(false); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close-circle" size={16} color="#aaa" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ) : (
                    !showColorPicker && (
                      <TouchableOpacity onPress={() => setShowColorPicker(true)} style={{ marginBottom: 8, marginTop: 12 }}>
                        <Text style={{ color: Colors.primary, fontSize: 14 }}>{t('products.color')}</Text>
                      </TouchableOpacity>
                    )
                  )}

                  {showColorPicker && (
                    <View style={{ marginTop: color === '' ? 12 : 0 }}>
                      <TextInput
                        style={[styles.input, { backgroundColor: themeStyles.inputBg, borderColor: themeStyles.inputBorder, color: themeStyles.text }]}
                        placeholder="Другой цвет..."
                        placeholderTextColor={isDark ? '#888' : '#aaa'}
                        value={PRESET_COLORS.some(c => c.label === color) ? '' : color}
                        onChangeText={setColor}
                      />
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                        {PRESET_COLORS.map((preset) => {
                          const isSelected = color === preset.label;
                          return (
                            <TouchableOpacity
                              key={preset.label}
                              onPress={() => setColor(preset.label)}
                              style={{ width: 58, alignItems: 'center' }}
                            >
                              <View style={{ position: 'relative' }}>
                                <ColorCircle
                                  hex={preset.hex}
                                  size={32}
                                  style={isSelected ? { borderWidth: 2, borderColor: Colors.primary } : null}
                                />
                                {isSelected && (
                                  <View style={styles.colorCheckBadge}>
                                    <Ionicons name="checkmark" size={11} color="#fff" />
                                  </View>
                                )}
                              </View>
                              <Text style={{ color: themeStyles.text, fontSize: 9, marginTop: 3 }} numberOfLines={1}>
                                {preset.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  <Text style={[styles.label, { color: themeStyles.text }]}>{t('products.baseUnit')}</Text>
                  <TextInput
                    ref={baseUnitRef}
                    style={[styles.input, { backgroundColor: themeStyles.inputBg, borderColor: themeStyles.inputBorder, color: themeStyles.text }]}
                    placeholder={t('products.unitPlaceholder')}
                    placeholderTextColor={isDark ? '#888' : '#aaa'}
                    value={baseUnit}
                    onChangeText={setBaseUnit}
                    returnKeyType={getReturnKeyType(6)}
                    onSubmitEditing={getSubmitHandler(6)}
                    blurOnSubmit={false}
                  />

                  <TouchableOpacity style={styles.checkboxRow} onPress={() => setHasPackages(!hasPackages)}>
                    <Ionicons name={hasPackages ? 'checkbox' : 'square-outline'} size={24} color={Colors.primary} />
                    <Text style={[styles.checkboxLabel, { color: themeStyles.text }]}>{t('products.hasPackages')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.checkboxRow} onPress={() => setIsContinuous(!isContinuous)}>
                    <Ionicons name={isContinuous ? 'checkbox' : 'square-outline'} size={24} color={Colors.primary} />
                    <Text style={[styles.checkboxLabel, { color: themeStyles.text }]}>{t('products.isContinuous')}</Text>
                  </TouchableOpacity>

                  {hasPackages && (
                    <View style={styles.row}>
                      <View style={styles.half}>
                        <Text style={[styles.label, { color: themeStyles.text }]}>{t('products.packageName')}</Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: themeStyles.inputBg, borderColor: themeStyles.inputBorder, color: themeStyles.text }]}
                          placeholder={t('products.packageNamePlaceholder')}
                          placeholderTextColor={isDark ? '#888' : '#aaa'}
                          value={packageName}
                          onChangeText={setPackageName}
                        />
                      </View>
                      <View style={styles.half}>
                        <Text style={[styles.label, { color: themeStyles.text }]}>{t('products.unitsPerPackage')}</Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: themeStyles.inputBg, borderColor: themeStyles.inputBorder, color: themeStyles.text }]}
                          placeholder="1"
                          placeholderTextColor={isDark ? '#888' : '#aaa'}
                          keyboardType="numeric"
                          value={unitsPerPackage}
                          onChangeText={setUnitsPerPackage}
                        />
                      </View>
                    </View>
                  )}
                </View>
              )}

              {buyPrice !== '' && sellPrice !== '' && !isNaN(parseFloat(buyPrice)) && !isNaN(parseFloat(sellPrice)) && (
                <View style={styles.marginPreview}>
                  <Text style={styles.marginText}>
                    {t('products.margin')}: {(parseFloat(sellPrice) - parseFloat(buyPrice)).toFixed(1)} {currency.symbol}
                    {' '}({parseFloat(sellPrice) > 0 ? (((parseFloat(sellPrice) - parseFloat(buyPrice)) / parseFloat(sellPrice)) * 100).toFixed(0) : 0}%)
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>{t('products.saveChanges')}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={[styles.cancelBtnText, { color: themeStyles.textSecondary }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
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
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: 16,
    paddingBottom: 24,
    maxHeight: '90%',
    ...Shadow.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700' },
  label: { fontSize: 13, marginBottom: 6, marginTop: 10 },
  input: {
    borderRadius: 8, padding: 12,
    fontSize: 15, borderWidth: 1,
  },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  stockChangeHint: {
    fontSize: 12, color: Colors.warning, marginTop: 4, fontWeight: '500',
  },
  advancedToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 14, marginBottom: 4,
  },
  advancedToggleText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  checkboxRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12,
  },
  checkboxLabel: { fontSize: 14 },
  colorCheckBadge: {
    position: 'absolute', bottom: -2, right: -2,
    backgroundColor: Colors.primary, borderRadius: 8,
    width: 16, height: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  marginPreview: {
    marginTop: 12, padding: 10, backgroundColor: '#F0FBF7',
    borderRadius: 8, borderWidth: 1, borderColor: Colors.primary,
  },
  marginText: { fontSize: 13, color: Colors.primary, fontWeight: '500' },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: 10,
    padding: 14, alignItems: 'center', marginTop: 18,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  cancelBtn: { alignItems: 'center', padding: 12, marginTop: 4 },
  cancelBtnText: { fontSize: 14 },
});
