import { useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, TextInput, Alert, RefreshControl
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { addProduct, updateProduct, deleteProduct, getProducts } from '../db/database';
import { analyticsService } from '../services/analyticsService';
import { useAppContext } from '../context/AppContext';
import StockOperationModal from '../components/stock/StockOperationModal';
import StockHistorySheet from '../components/stock/StockHistorySheet';
import { ProductAutocomplete } from '../components/sales/ProductAutocomplete';

export default function ProductsScreen() {
  const { t } = useTranslation();
  const { resolvedTheme, currency, defaultMinStockAlert } = useAppContext(); const isDark = resolvedTheme === "dark";
  const [products, setProducts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [stock, setStock] = useState('');
  const [minStockAlert, setMinStockAlert] = useState(String(defaultMinStockAlert));
  const [baseUnit, setBaseUnit] = useState('шт');
  const [hasPackages, setHasPackages] = useState(false);
  const [packageName, setPackageName] = useState('');
  const [unitsPerPackage, setUnitsPerPackage] = useState('1');

  // Modal states
  const [opModalVisible, setOpModalVisible] = useState(false);
  const [opType, setOpType] = useState<'stock_in' | 'waste' | 'correction'>('stock_in');
  const [historyVisible, setHistoryVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  const [refreshing, setRefreshing] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const loadProducts = () => setProducts(getProducts());

  useFocusEffect(useCallback(() => { loadProducts(); }, []));

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const query = searchQuery.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(query)
    );
  }, [products, searchQuery]);

  const onRefresh = () => {
    setRefreshing(true);
    loadProducts();
    setRefreshing(false);
  };

  const handleSave = () => {
    if (!name.trim() || !buyPrice || !sellPrice) {
      Alert.alert(t('common.error'), 'Заполните название, цену закупки и продажи');
      return;
    }

    const bPrice = parseFloat(buyPrice);
    const sPrice = parseFloat(sellPrice);
    const st = parseFloat(stock) || 0;
    const alert = parseFloat(minStockAlert) || 0;

    const uPerPkg = parseFloat(unitsPerPackage) || 1;

    if (editingId) {
      updateProduct(editingId, name.trim(), bPrice, sPrice, st, alert, baseUnit, hasPackages ? 1 : 0, packageName, uPerPkg);
      analyticsService.logEvent('product_updated', { product_id: editingId });
    } else {
      const result = addProduct(name.trim(), bPrice, sPrice, st, alert, baseUnit, hasPackages ? 1 : 0, packageName, uPerPkg);
      analyticsService.logEvent('product_added', { product_id: result.lastInsertRowId });
    }

    resetForm();
    setShowForm(false);
    loadProducts();
  };

  const resetForm = () => {
    setName(''); setBuyPrice(''); setSellPrice(''); setStock('');
    setMinStockAlert(String(defaultMinStockAlert));
    setBaseUnit('шт'); setHasPackages(false); setPackageName(''); setUnitsPerPackage('1');
    setEditingId(null);
    setShowAdvanced(false);
  };

  const handleLongPress = (p: any) => {
    Alert.alert(
      p.name,
      'Выберите действие',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: 'Редактировать',
          onPress: () => {
            setEditingId(p.id);
            setName(p.name);
            setBuyPrice(String(p.buy_price));
            setSellPrice(String(p.sell_price));
            setStock(String(p.stock));
            setMinStockAlert(String(p.min_stock_alert || 0));
            setBaseUnit(p.base_unit || 'шт');
            setHasPackages(p.has_packages === 1);
            setPackageName(p.package_name || '');
            setUnitsPerPackage(String(p.units_per_package || 1));
            setShowForm(true);
            setShowAdvanced(p.has_packages === 1 || p.base_unit !== 'шт');
            scrollViewRef.current?.scrollTo({ y: 0, animated: true });
          }
        },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Удалить товар?',
              `Вы уверены, что хотите удалить "${p.name}"?`,
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('common.delete'),
                  style: 'destructive',
                  onPress: () => {
                    deleteProduct(p.id);
                    loadProducts();
                  }
                }
              ]
            );
          }
        }
      ]
    );
  };

  const themeStyles = isDark ? darkStyles : lightStyles;

  return (
    <View style={[styles.container, themeStyles.container]}>
      {/* Search Bar with Autocomplete Suggestions */}
      <View style={[styles.searchContainer, themeStyles.card]}>
        <Ionicons name="search-outline" size={20} color={isDark ? '#888' : '#aaa'} style={styles.searchIcon} />
        <ProductAutocomplete
          containerStyle={styles.searchAutocompleteContainer}
          inputStyle={[styles.searchInput, themeStyles.text]}
          placeholder={t('products.searchPlaceholder')}
          placeholderTextColor={isDark ? '#888' : '#aaa'}
          value={searchQuery}
          onChange={setSearchQuery}
          onSelect={(p) => {
            setSearchQuery(p.name);
          }}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearIcon}>
            <Ionicons name="close-circle" size={20} color={isDark ? '#888' : '#aaa'} />
          </TouchableOpacity>
        )}
      </View>

    <ScrollView
      ref={scrollViewRef}
      style={styles.flex}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity
        style={[styles.addBtn, editingId ? { backgroundColor: '#FF9800' } : null]}
        onPress={() => {
          if (showForm) {
            setShowForm(false);
            resetForm();
          } else {
            setShowForm(true);
          }
        }}
      >
        <Text style={styles.addBtnText}>
          {showForm ? '✕ ' + t('common.cancel') : (editingId ? '✎ Редактировать' : '+ ' + t('products.addProduct'))}
        </Text>
      </TouchableOpacity>

      {showForm && (
        <View style={[styles.form, themeStyles.card]}>
          <Text style={[styles.formTitle, themeStyles.text]}>{editingId ? 'Редактировать товар' : 'Новый товар'}</Text>

          <Text style={[styles.label, themeStyles.text]}>{t('addSale.productName')} *</Text>
          <ProductAutocomplete
            inputStyle={[styles.input, themeStyles.input]}
            placeholder={t('addSale.productPlaceholder')}
            placeholderTextColor={isDark ? '#888' : '#aaa'}
            value={name}
            onChange={setName}
            onSelect={(p) => {
              setName(p.name);
              if (p.source === 'catalog' && p.id) {
                // If it's already in catalog, we might want to switch to editing it
                const existing = products.find(prod => String(prod.id) === String(p.id));
                if (existing) {
                  setEditingId(existing.id);
                  setBuyPrice(String(existing.buy_price));
                  setSellPrice(String(existing.sell_price));
                  setStock(String(existing.stock));
                  setMinStockAlert(String(existing.min_stock_alert || 0));
                  setBaseUnit(existing.base_unit || 'шт');
                  setHasPackages(existing.has_packages === 1);
                  setPackageName(existing.package_name || '');
                  setUnitsPerPackage(String(existing.units_per_package || 1));
                  setShowAdvanced(existing.has_packages === 1 || existing.base_unit !== 'шт');
                }
              } else if (p.source === 'history') {
                setBuyPrice(String(p.purchasePrice || ''));
                setSellPrice(String(p.lastSalePrice || ''));
              }
            }}
          />

          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={[styles.label, themeStyles.text]}>{t('addSale.buyPrice')} *</Text>
              <TextInput
                style={[styles.input, themeStyles.input]}
                placeholder="0"
                placeholderTextColor={isDark ? '#888' : '#aaa'}
                keyboardType="numeric"
                value={buyPrice}
                onChangeText={setBuyPrice}
              />
            </View>
            <View style={styles.half}>
              <Text style={[styles.label, themeStyles.text]}>{t('addSale.sellPrice')} *</Text>
              <TextInput
                style={[styles.input, themeStyles.input]}
                placeholder="0"
                placeholderTextColor={isDark ? '#888' : '#aaa'}
                keyboardType="numeric"
                value={sellPrice}
                onChangeText={setSellPrice}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={[styles.label, themeStyles.text]}>{t('products.stock')} ({baseUnit})</Text>
              <TextInput
                style={[styles.input, themeStyles.input]}
                placeholder="0"
                placeholderTextColor={isDark ? '#888' : '#aaa'}
                keyboardType="numeric"
                value={stock}
                onChangeText={setStock}
              />
            </View>
            <View style={styles.half}>
              <Text style={[styles.label, themeStyles.text]}>{t('products.minStock')}</Text>
              <TextInput
                style={[styles.input, themeStyles.input]}
                placeholder="0"
                placeholderTextColor={isDark ? '#888' : '#aaa'}
                keyboardType="numeric"
                value={minStockAlert}
                onChangeText={setMinStockAlert}
              />
            </View>
          </View>

          <TouchableOpacity
            style={styles.advancedToggle}
            onPress={() => setShowAdvanced(!showAdvanced)}
          >
            <Text style={styles.advancedToggleText}>{t('products.advancedSettings')}</Text>
            <Ionicons name={showAdvanced ? 'chevron-up' : 'chevron-down'} size={16} color="#1D9E75" />
          </TouchableOpacity>

          {showAdvanced && (
            <View style={styles.advancedForm}>
              <Text style={[styles.label, themeStyles.text]}>{t('products.baseUnit')}</Text>
              <TextInput
                style={[styles.input, themeStyles.input]}
                placeholder="шт, кг, л..."
                placeholderTextColor={isDark ? '#888' : '#aaa'}
                value={baseUnit}
                onChangeText={setBaseUnit}
              />

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setHasPackages(!hasPackages)}
              >
                <Ionicons name={hasPackages ? 'checkbox' : 'square-outline'} size={24} color="#1D9E75" />
                <Text style={[styles.checkboxLabel, themeStyles.text]}>{t('products.hasPackages')}</Text>
              </TouchableOpacity>

              {hasPackages && (
                <View style={styles.row}>
                  <View style={styles.half}>
                    <Text style={[styles.label, themeStyles.text]}>{t('products.packageName')}</Text>
                    <TextInput
                      style={[styles.input, themeStyles.input]}
                      placeholder={t('products.packageNamePlaceholder')}
                      placeholderTextColor={isDark ? '#888' : '#aaa'}
                      value={packageName}
                      onChangeText={setPackageName}
                    />
                  </View>
                  <View style={styles.half}>
                    <Text style={[styles.label, themeStyles.text]}>{t('products.unitsPerPackage')}</Text>
                    <TextInput
                      style={[styles.input, themeStyles.input]}
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

          {buyPrice && sellPrice && (
            <View style={styles.marginPreview}>
              <Text style={styles.marginText}>
                {t('products.margin')}: {(parseFloat(sellPrice) - parseFloat(buyPrice)).toFixed(1)} {currency.symbol}
                ({((( parseFloat(sellPrice) - parseFloat(buyPrice)) / parseFloat(sellPrice)) * 100).toFixed(0)}%)
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>
              {editingId ? 'Сохранить изменения' : t('common.save')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={[styles.sectionTitle, themeStyles.text]}>
        {searchQuery ? `Найдено: ${filteredProducts.length}` : `Все товары (${products.length})`}
      </Text>

      {filteredProducts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{searchQuery ? 'Ничего не найдено' : 'Товаров пока нет'}</Text>
          <Text style={styles.emptyHint}>{searchQuery ? 'Попробуй другой запрос' : 'Добавь первый товар выше'}</Text>
        </View>
      ) : (
        filteredProducts.map((p: any) => (
          <View key={String(p.id)} style={[styles.productItem, themeStyles.card]}>
            <TouchableOpacity
              style={styles.productMain}
              onPress={() => {
                setSelectedProduct(p);
                setHistoryVisible(true);
              }}
              onLongPress={() => handleLongPress(p)}
              delayLongPress={500}
            >
              <View style={styles.productLeft}>
                <Text style={[styles.productName, themeStyles.text]}>{p.name}</Text>
                <Text style={styles.productPrices}>
                  {t('addSale.buyPrice')}: {p.buy_price} {currency.symbol} · {t('addSale.sellPrice')}: {p.sell_price} {currency.symbol}
                </Text>
              </View>
              <View style={styles.productRight}>
                <Text style={[
                  styles.productStock,
                  themeStyles.text,
                  p.stock <= (p.min_stock_alert || 0) && { color: '#E53935' }
                ]}>
                  {p.stock} {p.base_unit || t('reports.pcs')}
                </Text>
                <Text style={styles.productProfit}>
                  +{(p.sell_price - p.buy_price).toFixed(0)} {currency.symbol}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={styles.productActions}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => {
                  setSelectedProduct(p);
                  setOpType('stock_in');
                  setOpModalVisible(true);
                }}
              >
                <Ionicons name="add-circle-outline" size={18} color="#1D9E75" />
                <Text style={styles.actionBtnText}>{t('warehouse.stockIn')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => {
                  setSelectedProduct(p);
                  setOpType('waste');
                  setOpModalVisible(true);
                }}
              >
                <Ionicons name="trash-outline" size={18} color="#FF5252" />
                <Text style={[styles.actionBtnText, { color: '#FF5252' }]}>{t('warehouse.waste')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => {
                  setSelectedProduct(p);
                  setOpType('correction');
                  setOpModalVisible(true);
                }}
              >
                <Ionicons name="git-compare-outline" size={18} color="#FF9800" />
                <Text style={[styles.actionBtnText, { color: '#FF9800' }]}>{t('warehouse.correction')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      {selectedProduct && (
        <>
          <StockOperationModal
            visible={opModalVisible}
            product={selectedProduct}
            initialType={opType}
            onClose={() => setOpModalVisible(false)}
            onSuccess={() => {
              loadProducts();
              setOpModalVisible(false);
            }}
          />
          <StockHistorySheet
            visible={historyVisible}
            product={selectedProduct}
            onClose={() => setHistoryVisible(false)}
          />
        </>
      )}
    </ScrollView>
    </View>
  );
}

const lightStyles = StyleSheet.create({
  container: { backgroundColor: '#F5F5F5' },
  card: { backgroundColor: '#fff' },
  text: { color: '#333' },
  input: { backgroundColor: '#F5F5F5', borderColor: '#E0E0E0' },
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: '#000' },
  card: { backgroundColor: '#1E1E1E' },
  text: { color: '#EEE' },
  input: { backgroundColor: '#2C2C2C', borderColor: '#444', color: '#EEE' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    marginBottom: 8,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: 12,
    height: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    zIndex: 100,
  },
  searchIcon: {
    marginRight: 4,
  },
  searchAutocompleteContainer: {
    flex: 1,
    zIndex: 1000,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    height: '100%',
  },
  clearIcon: {
    padding: 4,
  },
  addBtn: {
    margin: 16, backgroundColor: '#1D9E75',
    borderRadius: 12, padding: 14, alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  form: {
    marginHorizontal: 16, marginBottom: 8,
    borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
  },
  formTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  label: { fontSize: 13, marginBottom: 6, marginTop: 10 },
  input: {
    borderRadius: 8, padding: 12,
    fontSize: 15, borderWidth: 1,
  },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  marginPreview: {
    marginTop: 12, padding: 10, backgroundColor: '#F0FBF7',
    borderRadius: 8, borderWidth: 1, borderColor: '#1D9E75',
  },
  marginText: { fontSize: 13, color: '#1D9E75', fontWeight: '500' },
  saveBtn: {
    backgroundColor: '#1D9E75', borderRadius: 10,
    padding: 14, alignItems: 'center', marginTop: 16,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  sectionTitle: {
    fontSize: 15, fontWeight: '600',
    paddingHorizontal: 16, marginBottom: 8,
  },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 15, color: '#999', marginBottom: 6 },
  emptyHint: { fontSize: 13, color: '#bbb' },
  productItem: {
    marginHorizontal: 16, marginBottom: 12,
    borderRadius: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
  },
  productMain: {
    flexDirection: 'row', justifyContent: 'space-between',
    padding: 14,
  },
  productLeft: { flex: 1 },
  productName: { fontSize: 15, fontWeight: '500' },
  productPrices: { fontSize: 12, color: '#999', marginTop: 3 },
  productRight: { alignItems: 'flex-end' },
  productStock: { fontSize: 15, fontWeight: '600' },
  productProfit: { fontSize: 13, color: '#1D9E75', marginTop: 3 },
  productActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1D9E75',
  },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
    padding: 5,
    gap: 5,
  },
  advancedToggleText: {
    fontSize: 13,
    color: '#1D9E75',
    fontWeight: '500',
  },
  advancedForm: {
    marginTop: 5,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 5,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
    gap: 10,
  },
  checkboxLabel: {
    fontSize: 14,
  },
});
