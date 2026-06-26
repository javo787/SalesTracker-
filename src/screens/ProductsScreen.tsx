import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, TextInput, Alert, RefreshControl, Modal
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  addProduct, updateProduct, deleteProduct, getProducts, getDistinctCategories, getProductIdsWithDebts,
  getProductSalesStats, getProductSalesHistory, getUnregisteredProductsFromHistory
} from '../db/database';
import { useShop } from '../context/ShopContext';
import { analyticsService } from '../services/analyticsService';
import { useAppContext } from '../context/AppContext';
import StockOperationModal from '../components/stock/StockOperationModal';
import StockHistorySheet from '../components/stock/StockHistorySheet';
import { ProductAutocomplete } from '../components/sales/ProductAutocomplete';
import { Colors, LightTheme, DarkTheme, Radius, Shadow } from '../constants/theme';

export default function ProductsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { resolvedTheme, currency, defaultMinStockAlert, sellerMode } = useAppContext(); const isDark = resolvedTheme === "dark";
  const { isOwner } = useShop();
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
  const [category, setCategory] = useState('');
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  // Filters & Sorting
  const [activeFilter, setActiveFilter] = useState<'all' | 'low_stock' | 'debts' | { category: string }>('all');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [debtProductIdsList, setDebtProductIdsList] = useState<number[]>([]);

  // Accordion & Stats
  const [expandedProductId, setExpandedProductId] = useState<number | null>(null);
  const [productStats, setProductStats] = useState<Record<number, any>>({});

  // Sales History Modal
  const [productSalesHistory, setProductSalesHistory] = useState<any[]>([]);
  const [showSalesHistory, setShowSalesHistory] = useState(false);
  const [historyProductName, setHistoryProductName] = useState('');

  // Unregistered Products
  const [unregistered, setUnregistered] = useState<any[]>([]);
  const [showUnregisteredModal, setShowUnregisteredModal] = useState(false);
  const [dismissedUnregistered, setDismissedUnregistered] = useState(false);

  // Modal states
  const [opModalVisible, setOpModalVisible] = useState(false);
  const [opType, setOpType] = useState<'stock_in' | 'waste' | 'correction'>('stock_in');
  const [historyVisible, setHistoryVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  const [refreshing, setRefreshing] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const loadProducts = () => {
    const allProds = getProducts() as any[];
    setProducts(allProds);

    // Load unregistered products
    const unreg = getUnregisteredProductsFromHistory() as any[];
    setUnregistered(unreg);

    // Derive distinct categories from products to avoid extra SQL query
    const cats = Array.from(new Set(allProds.map(p => p.category).filter(Boolean))) as string[];
    setAllCategories(cats.sort());

    if (sellerMode === 'wholesale') {
      setDebtProductIdsList(getProductIdsWithDebts());
    }
  };

  useFocusEffect(useCallback(() => { loadProducts(); }, []));

  useEffect(() => {
    if (sellerMode === 'retail' && activeFilter === 'debts') {
      setActiveFilter('all');
    }
  }, [sellerMode]);

  const filteredProducts = useMemo(() => {
    let result = [...products];
    const debtSet = new Set(debtProductIdsList);

    // 1. Search Query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(query));
    }

    // 2. Chip Filter
    if (activeFilter === 'low_stock') {
      result = result.filter(p => p.stock <= (p.min_stock_alert || 0));
    } else if (activeFilter === 'debts') {
      result = result.filter(p => debtSet.has(p.id));
    } else if (typeof activeFilter === 'object' && activeFilter.category) {
      result = result.filter(p => p.category === activeFilter.category);
    }

    // 3. Sorting (by stock)
    result.sort((a, b) => {
      if (sortDirection === 'asc') return a.stock - b.stock;
      return b.stock - a.stock;
    });

    return result;
  }, [products, searchQuery, activeFilter, sortDirection, debtProductIdsList]);

  const onRefresh = async () => {
    setRefreshing(true);
    const start = Date.now();
    loadProducts();
    const elapsed = Date.now() - start;
    if (elapsed < 300) await new Promise(r => setTimeout(r, 300 - elapsed));
    setRefreshing(false);
  };

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

    if (editingId) {
      updateProduct(editingId, name.trim(), bPrice, sPrice, st, alert, baseUnit, hasPackages ? 1 : 0, packageName, uPerPkg, cat);
      analyticsService.logEvent('product_updated', { product_id: editingId });
    } else {
      const result = addProduct(name.trim(), bPrice, sPrice, st, alert, baseUnit, hasPackages ? 1 : 0, packageName, uPerPkg, cat);
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
    setCategory('');
    setEditingId(null);
    setShowAdvanced(false);
  };

  const handleLongPress = (p: any) => {
    Alert.alert(
      p.name,
      t('common.edit'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.edit'),
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
            setCategory(p.category || '');
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
              t('products.deleteConfirmTitle'),
              t('products.deleteConfirmMsg', { name: p.name }),
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
      {/* Unregistered Products Banner */}
      {!dismissedUnregistered && unregistered.length > 0 && (
        <TouchableOpacity
          style={styles.unregisteredBanner}
          onPress={() => setShowUnregisteredModal(true)}
        >
          <View style={styles.unregisteredIcon}>
            <Ionicons name="alert-circle" size={24} color="#FF9800" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.unregisteredTitle}>
              {t('products.unregisteredBannerTitle', { count: unregistered.length })}
            </Text>
            <Text style={styles.unregisteredSub}>
              {t('products.unregisteredBannerSub')}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.unregisteredAction}
            onPress={() => setShowUnregisteredModal(true)}
          >
            <Text style={styles.unregisteredActionText}>{t('products.unregisteredBannerAction')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.unregisteredClose}
            onPress={() => setDismissedUnregistered(true)}
          >
            <Ionicons name="close" size={20} color="#999" />
          </TouchableOpacity>
        </TouchableOpacity>
      )}

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

      {/* Filters Chips */}
      <View style={{ marginBottom: 8 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContainer}
        >
          <TouchableOpacity
            style={[styles.chip, themeStyles.chip, activeFilter === 'all' && styles.chipActive]}
            onPress={() => setActiveFilter('all')}
          >
            <Text style={[styles.chipText, themeStyles.chipText, activeFilter === 'all' && styles.chipTextActive]}>{t('debtors.filterAll')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, themeStyles.chip, activeFilter === 'low_stock' && styles.chipActive]}
            onPress={() => setActiveFilter('low_stock')}
          >
            <Text style={[styles.chipText, themeStyles.chipText, activeFilter === 'low_stock' && styles.chipTextActive]}>🔴 {t('products.lowStockFilter')}</Text>
          </TouchableOpacity>

          {sellerMode === 'wholesale' && (
            <TouchableOpacity
              style={[styles.chip, themeStyles.chip, activeFilter === 'debts' && styles.chipActive]}
              onPress={() => setActiveFilter('debts')}
            >
              <Text style={[styles.chipText, themeStyles.chipText, activeFilter === 'debts' && styles.chipTextActive]}>📋 {t('products.debtsFilter')}</Text>
            </TouchableOpacity>
          )}

          {allCategories.map((cat, idx) => (
            <TouchableOpacity
              key={idx}
              style={[
                styles.chip,
                themeStyles.chip,
                typeof activeFilter === 'object' && activeFilter.category === cat && styles.chipActive
              ]}
              onPress={() => setActiveFilter({ category: cat })}
            >
              <Text style={[
                styles.chipText,
                themeStyles.chipText,
                typeof activeFilter === 'object' && activeFilter.category === cat && styles.chipTextActive
              ]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

    <ScrollView
      ref={scrollViewRef}
      style={styles.flex}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      keyboardShouldPersistTaps="handled"
    >
      {isOwner && (
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
            {showForm ? '✕ ' + t('common.cancel') : (editingId ? '✎ ' + t('common.edit') : '+ ' + t('products.addProduct'))}
          </Text>
        </TouchableOpacity>
      )}

      {showForm && (
        <View style={[styles.form, themeStyles.card]}>
          <Text style={[styles.formTitle, themeStyles.text]}>{editingId ? t('products.editProduct') : t('products.newProduct')}</Text>

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
                  setCategory(existing.category || '');
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
              <Text style={[styles.label, themeStyles.text]}>{t('products.category')}</Text>
              <View style={{ zIndex: 2000 }}>
                <TextInput
                  style={[styles.input, themeStyles.input]}
                  placeholder={t('products.categoryPlaceholder')}
                  placeholderTextColor={isDark ? '#888' : '#aaa'}
                  value={category}
                  onChangeText={(text) => {
                    setCategory(text);
                    setShowCategoryDropdown(true);
                  }}
                  onFocus={() => setShowCategoryDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCategoryDropdown(false), 200)}
                />
                {showCategoryDropdown && (
                  <View style={[styles.categoryDropdown, themeStyles.card]}>
                    <ScrollView keyboardShouldPersistTaps="always" style={{ maxHeight: 150 }}>
                      {allCategories
                        .filter(c => c.toLowerCase().includes(category.toLowerCase()))
                        .map((c, i) => (
                          <TouchableOpacity
                            key={i}
                            style={styles.categoryItem}
                            onPress={() => {
                              setCategory(c);
                              setShowCategoryDropdown(false);
                            }}
                          >
                            <Text style={[themeStyles.text]}>{c}</Text>
                          </TouchableOpacity>
                        ))}
                      {category.trim() !== '' && !allCategories.includes(category) && (
                        <TouchableOpacity
                          style={styles.categoryItem}
                          onPress={() => setShowCategoryDropdown(false)}
                        >
                          <Text style={{ color: '#1D9E75', fontWeight: 'bold' }}>+ {t('products.newCategory')}: {category}</Text>
                        </TouchableOpacity>
                      )}
                      {allCategories.length === 0 && category === '' && (
                        <View style={styles.categoryItem}>
                          <Text style={{ color: '#999', fontStyle: 'italic' }}>{t('products.noCategories')}</Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                )}
              </View>
            </View>
          </View>

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
                placeholder={t('products.unitPlaceholder')}
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
              {editingId ? t('products.saveChanges') : t('common.save')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[styles.sectionTitle, themeStyles.text, { paddingHorizontal: 0, marginBottom: 0 }]}>
            {searchQuery ? `${t('products.found')}: ${filteredProducts.length}` : `${t('products.allProducts')} (${products.length})`}
          </Text>
          <View style={{
            paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
            backgroundColor: sellerMode === 'wholesale' ? '#FFF3E0' : '#F0FBF7',
            borderWidth: 1,
            borderColor: sellerMode === 'wholesale' ? '#FF9800' : '#1D9E75',
          }}>
            <Text style={{
              fontSize: 11, fontWeight: '600',
              color: sellerMode === 'wholesale' ? '#E65100' : '#1D9E75',
            }}>
              {sellerMode === 'wholesale' ? '📦 ' + t('common.wholesale') : '🛒 ' + t('common.retail')}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.sortBtn}
          onPress={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
        >
          <Text style={[styles.sortBtnText, themeStyles.text]}>
            {t('products.stock')} {sortDirection === 'asc' ? '↑' : '↓'}
          </Text>
        </TouchableOpacity>
      </View>

      {filteredProducts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{searchQuery ? t('reports.nothingFound') : t('products.noProducts') || 'No products'}</Text>
          <Text style={styles.emptyHint}>{searchQuery ? t('products.tryAnotherQuery') || 'Try another query' : t('products.addFirstProduct') || 'Add your first product'}</Text>
        </View>
      ) : (
        filteredProducts.map((p: any) => {
          const isExpanded = expandedProductId === p.id;
          const stats = productStats[p.id];

          return (
            <View key={String(p.id)} style={[styles.productItem, themeStyles.card]}>
              <TouchableOpacity
                style={styles.productMain}
                onPress={() => {
                  const newId = isExpanded ? null : p.id;
                  setExpandedProductId(newId);
                  if (newId && !productStats[newId]) {
                    const stats = getProductSalesStats(p.id);
                    setProductStats(prev => ({ ...prev, [p.id]: stats }));
                  }
                }}
                onLongPress={() => handleLongPress(p)}
                delayLongPress={500}
              >
                <View style={styles.productLeft}>
                  <Text style={[styles.productName, themeStyles.text]}>{p.name}</Text>
                  <Text style={styles.productPrices}>
                    {isOwner && `${t('addSale.buyPrice')}: ${p.buy_price} ${currency.symbol} · `}{t('addSale.sellPrice')}: {p.sell_price} {currency.symbol}
                  </Text>
                </View>
                <View style={styles.productRight}>
                  <Text style={[
                    styles.productStock,
                    { color: p.stock <= 0 ? Colors.danger : p.stock <= (p.min_stock_alert || 0) ? Colors.warning : Colors.primary }
                  ]}>
                    {p.stock} {p.base_unit || t('reports.pcs')}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {isOwner && (
                      <Text style={styles.productProfit}>
                        +{(p.sell_price - p.buy_price).toFixed(0)} {currency.symbol}
                      </Text>
                    )}
                    <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="#aaa" />
                  </View>
                </View>
              </TouchableOpacity>

              {isExpanded && (
                <View style={[styles.expandedContent, { borderTopWidth: 1, borderTopColor: isDark ? '#333' : '#eee' }]}>
                  {/* Stats Row */}
                  <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                      <Text style={styles.statLabel}>{t('products.totalSold')}</Text>
                      <Text style={[styles.statValue, themeStyles.text]}>{stats?.total_sold || 0}</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statLabel}>{t('products.totalRevenue')}</Text>
                      <Text style={[styles.statValue, themeStyles.text]}>{stats?.total_revenue?.toFixed(0) || 0} {currency.symbol}</Text>
                    </View>
                    {isOwner && (
                      <View style={styles.statBox}>
                        <Text style={styles.statLabel}>{t('products.totalProfit')}</Text>
                        <Text style={[styles.statValue, { color: Colors.primary }]}>{stats?.total_profit?.toFixed(0) || 0} {currency.symbol}</Text>
                      </View>
                    )}
                  </View>

                  <View style={[styles.infoRow, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                    <Text style={styles.infoText}>
                      {t('products.addedDate')}: {p.created_at ? new Date(p.created_at.replace(' ', 'T')).toLocaleDateString('ru-RU') : '—'}
                    </Text>

                    {(stats?.total_sold || 0) > 0 && (
                      <TouchableOpacity
                        onPress={() => {
                          setHistoryProductName(p.name);
                          setProductSalesHistory(getProductSalesHistory(p.id));
                          setShowSalesHistory(true);
                        }}
                      >
                        <Text style={{ color: Colors.primary, fontSize: 12, fontWeight: '600' }}>
                          {t('products.salesHistory')} →
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={styles.productActions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, isOwner && styles.actionBtnSell]}
                      onPress={() => {
                        navigation.navigate('Main', {
                          screen: 'Tabs',
                          params: {
                            screen: 'Sale',
                            params: {
                              prefillSell: p.sell_price,
                              prefillBuy: p.buy_price,
                              prefillProductName: p.name,
                              prefillProductId: p.id,
                            }
                          }
                        });
                      }}
                    >
                      <Ionicons name="cash-outline" size={18} color="#1D9E75" />
                      <Text style={styles.actionBtnText}>{t('products.sellBtn')}</Text>
                    </TouchableOpacity>
                    {isOwner && (
                      <>
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
                      </>
                    )}
                  </View>
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>

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

      {/* Sales History Modal */}
      <Modal
        visible={showSalesHistory}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSalesHistory(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, themeStyles.card]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, themeStyles.text]}>{t('products.salesHistory')}</Text>
                <Text style={styles.modalSubtitle}>{historyProductName}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowSalesHistory(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={isDark ? '#fff' : '#000'} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {productSalesHistory.length === 0 ? (
                <View style={styles.emptyHistory}>
                  <Text style={styles.emptyHistoryText}>{t('products.noSalesYet')}</Text>
                </View>
              ) : (
                productSalesHistory.map((s, idx) => (
                  <View key={idx} style={[styles.historyItem, { borderBottomColor: isDark ? '#333' : '#eee' }]}>
                    <View style={styles.historyRow}>
                      <Text style={[styles.historyDate, themeStyles.text]}>
                        {new Date(s.created_at.replace(' ', 'T')).toLocaleDateString('ru-RU')} {new Date(s.created_at.replace(' ', 'T')).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <Text style={[styles.historyQty, themeStyles.text]}>{s.quantity} {t('reports.pcs')}</Text>
                    </View>
                    <View style={styles.historyRow}>
                      <Text style={styles.historyPrices}>
                        {t('common.revenue')}: {s.sell_price * s.quantity} {currency.symbol}
                      </Text>
                      {isOwner && (
                        <Text style={[styles.historyProfit, { color: Colors.primary }]}>
                          {t('common.profit')}: +{s.profit.toFixed(0)} {currency.symbol}
                        </Text>
                      )}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Unregistered Products Quick Add Modal */}
      <Modal
        visible={showUnregisteredModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowUnregisteredModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, themeStyles.card, { height: '80%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, themeStyles.text]}>{t('products.quickAddTitle')}</Text>
                <Text style={styles.modalSubtitle}>{t('products.quickAddFromHistory')}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowUnregisteredModal(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={isDark ? '#fff' : '#000'} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {unregistered.length === 0 ? (
                <View style={styles.emptyHistory}>
                  <Text style={styles.emptyHistoryText}>{t('products.allRegistered')}</Text>
                </View>
              ) : (
                unregistered.map((item, idx) => (
                  <View key={idx} style={[styles.unregItem, { borderBottomColor: isDark ? '#333' : '#eee' }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.unregName, themeStyles.text]}>{item.name}</Text>
                      <Text style={styles.unregStats}>
                        {t('common.revenue')}: {item.last_sell_price?.toFixed(0)} {currency.symbol} · {t('common.quantity')}: {item.sales_count}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        style={styles.unregLaterBtn}
                        onPress={() => {
                          const newList = unregistered.filter((_, i) => i !== idx);
                          setUnregistered(newList);
                          if (newList.length === 0) setShowUnregisteredModal(false);
                        }}
                      >
                        <Text style={styles.unregLaterText}>{t('products.laterBtn')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.unregAddBtn}
                        onPress={() => {
                          try {
                            addProduct(
                              item.name,
                              item.last_buy_price || 0,
                              item.last_sell_price || 0,
                              0
                            );
                            Alert.alert(t('common.saved'), t('products.quickAdded'));
                            const newList = unregistered.filter((_, i) => i !== idx);
                            setUnregistered(newList);
                            loadProducts();
                            if (newList.length === 0) setShowUnregisteredModal(false);
                          } catch (e) {
                            Alert.alert(t('common.error'), String(e));
                          }
                        }}
                      >
                        <Text style={styles.unregAddText}>{t('common.addNew')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const lightStyles = StyleSheet.create({
  container: { backgroundColor: LightTheme.background },
  card: { backgroundColor: LightTheme.card },
  text: { color: LightTheme.text },
  input: { backgroundColor: '#F5F5F5', borderColor: '#E0E0E0' },
  chip: { backgroundColor: '#F0F0F0', borderColor: '#E0E0E0' },
  chipText: { color: '#666' },
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: DarkTheme.background },
  card: { backgroundColor: DarkTheme.card },
  text: { color: DarkTheme.text },
  input: { backgroundColor: '#2C2C2C', borderColor: '#444', color: '#EEE' },
  chip: { backgroundColor: '#2C2C2C', borderColor: '#444' },
  chipText: { color: '#AAA' },
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
    borderRadius: Radius.lg,
    height: 48,
    ...Shadow.md,
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
    borderRadius: Radius.lg, padding: 14, alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  form: {
    marginHorizontal: 16, marginBottom: 8,
    borderRadius: Radius.lg, padding: 16,
    ...Shadow.md,
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
    borderRadius: Radius.lg, overflow: 'hidden',
    ...Shadow.md,
  },
  productMain: {
    flexDirection: 'row', justifyContent: 'space-between',
    padding: 14,
  },
  productLeft: { flex: 1 },
  productName: { fontSize: 15, fontWeight: '500' },
  productPrices: { fontSize: 12, color: '#999', marginTop: 3 },
  productRight: { alignItems: 'flex-end' },
  productStock: { fontSize: 15, fontWeight: '700' },
  productProfit: { fontSize: 13, color: '#1D9E75' },
  expandedContent: {
    backgroundColor: 'rgba(0,0,0,0.01)',
  },
  statsRow: {
    flexDirection: 'row',
    padding: 12,
    justifyContent: 'space-between',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  infoRow: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  infoText: {
    fontSize: 12,
    color: '#999',
  },
  productActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    paddingVertical: 12,
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
  actionBtnSell: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(0,0,0,0.06)',
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1D9E75',
  },
  chipsContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: '#1D9E75',
    borderColor: '#1D9E75',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#FFF',
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
  },
  sortBtnText: {
    fontSize: 13,
    fontWeight: '600',
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
  categoryDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    borderRadius: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    zIndex: 3000,
  },
  categoryItem: {
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEE',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    height: '70%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#999',
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  modalBody: {
    flex: 1,
  },
  emptyHistory: {
    padding: 40,
    alignItems: 'center',
  },
  emptyHistoryText: {
    color: '#999',
    fontSize: 15,
  },
  historyItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  historyDate: {
    fontSize: 14,
    fontWeight: '500',
  },
  historyQty: {
    fontSize: 14,
    fontWeight: '600',
  },
  historyPrices: {
    fontSize: 12,
    color: '#999',
  },
  historyProfit: {
    fontSize: 12,
    fontWeight: '600',
  },
  unregisteredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  unregisteredIcon: {
    marginRight: 10,
  },
  unregisteredTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E65100',
  },
  unregisteredSub: {
    fontSize: 12,
    color: '#FF9800',
  },
  unregisteredAction: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  unregisteredActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  unregisteredClose: {
    padding: 4,
    marginLeft: 4,
  },
  unregItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  unregName: {
    fontSize: 15,
    fontWeight: '600',
  },
  unregStats: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  unregLaterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  unregLaterText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  unregAddBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1D9E75',
  },
  unregAddText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: 'bold',
  },
});
