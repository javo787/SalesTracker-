import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, TextInput, Alert, RefreshControl, Modal, ActivityIndicator, Keyboard
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  addProduct, updateProduct, deleteProduct, getProducts, getDistinctCategories, getProductIdsWithDebts,
  getProductSalesStats, getProductSalesHistory, getUnregisteredProductsFromHistory, db
} from '../db/database';
import { useShop } from '../context/ShopContext';
import { ProductAutocomplete } from '../components/sales/ProductAutocomplete';
import { analyticsService } from '../services/analyticsService';
import { useAppContext } from '../context/AppContext';
import { useExpenses } from '../hooks/useExpenses';
import { useFieldChain } from '../hooks/useFieldChain';
import StockOperationModal from '../components/stock/StockOperationModal';
import StockHistorySheet from '../components/stock/StockHistorySheet';
import ResolvePendingSaleModal from '../components/products/ResolvePendingSaleModal';
import { Colors, LightTheme, DarkTheme, Radius, Shadow } from '../constants/theme';
import { PRESET_COLORS, getColorHex, ColorCircle } from '../constants/colors';

export default function ProductsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { resolvedTheme, currency, defaultMinStockAlert, sellerMode } = useAppContext(); const isDark = resolvedTheme === "dark";
  const { addExpense } = useExpenses();
  const { isOwner, can } = useShop();
  const [products, setProducts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form refs
  const nameRef = useRef<any>(null);
  const categoryRef = useRef<TextInput>(null);
  const buyPriceRef = useRef<TextInput>(null);
  const sellPriceRef = useRef<TextInput>(null);
  const stockRef = useRef<TextInput>(null);
  const minStockAlertRef = useRef<TextInput>(null);
  const articleRef = useRef<TextInput>(null);
  const colorRef = useRef<TextInput>(null);
  const baseUnitRef = useRef<TextInput>(null);
  const packageNameRef = useRef<TextInput>(null);
  const unitsPerPackageRef = useRef<TextInput>(null);

  // Form fields
  const [name, setName] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [stock, setStock] = useState('');
  const [minStockAlert, setMinStockAlert] = useState(String(defaultMinStockAlert));
  const [baseUnit, setBaseUnit] = useState('шт');
  const [hasPackages, setHasPackages] = useState(false);
  const [isContinuous, setIsContinuous] = useState(false);
  const [packageName, setPackageName] = useState('');
  const [unitsPerPackage, setUnitsPerPackage] = useState('1');
  const [category, setCategory] = useState('');
  const [article, setArticle] = useState('');
  const [color, setColor] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [topCategories, setTopCategories] = useState<string[]>([]);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  // Filters & Sorting
  const [activeFilter, setActiveFilter] = useState<'all' | 'low_stock' | 'debts' | 'pending' | { category: string }>('all');
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
  const [moreCategoriesVisible, setMoreCategoriesVisible] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  const [resolveSaleTarget, setResolveSaleTarget] = useState<any | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const [pendingSales, setPendingSales] = useState<any[]>([]);

  const fields = [
    { ref: nameRef, visible: true },
    { ref: categoryRef, visible: true },
    { ref: buyPriceRef, visible: true },
    { ref: sellPriceRef, visible: true },
    { ref: stockRef, visible: true },
    { ref: minStockAlertRef, visible: true },
    { ref: articleRef, visible: showAdvanced },
    { ref: colorRef, visible: showAdvanced && showColorPicker },
    { ref: baseUnitRef, visible: showAdvanced },
    { ref: packageNameRef, visible: showAdvanced && hasPackages },
    { ref: unitsPerPackageRef, visible: showAdvanced && hasPackages },
  ];

  const { getSubmitHandler, getReturnKeyType } = useFieldChain(fields, () => Keyboard.dismiss());

  const loadProducts = () => {
    const allProds = getProducts() as any[];
    setProducts(allProds);

    // Load unregistered products
    const unreg = getUnregisteredProductsFromHistory() as any[];
    setUnregistered(unreg);

    // Load pending review sales
    if (isOwner) {
      const pending = db.getAllSync("SELECT * FROM sales WHERE is_pending_review = 1 ORDER BY created_at DESC") as any[];
      setPendingSales(pending);
    }

    // Derive distinct categories from products to avoid extra SQL query
    const cats = Array.from(new Set(allProds.map(p => p.category).filter(Boolean))) as string[];
    const alphabeticalCats = [...cats].sort((a, b) => a.localeCompare(b));
    setAllCategories(alphabeticalCats);

    // Count frequencies
    const categoryCounts: { [key: string]: number } = {};
    allProds.forEach(p => {
      if (p.category) {
        categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
      }
    });

    // Sort by descending frequency
    const sortedCatsByFrequency = [...cats].sort((a, b) => {
      const countA = categoryCounts[a] || 0;
      const countB = categoryCounts[b] || 0;
      if (countB !== countA) {
        return countB - countA;
      }
      return a.localeCompare(b);
    });

    setTopCategories(sortedCatsByFrequency.slice(0, 4));

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

  useEffect(() => {
    if (route.params?.filter) {
      setActiveFilter(route.params.filter);
    }
  }, [route.params?.filter]);

  useEffect(() => {
    if (route.params?.openAddVariantFor) {
      const p = route.params.openAddVariantFor;
      openAddVariantForm({
        article: p.article?.trim() || p.name?.trim() || '',
        displayName: p.name,
        variants: [p],
      });
      navigation.setParams({ openAddVariantFor: undefined }); // reset parameter
    }
  }, [route.params?.openAddVariantFor]);

  const filteredProducts = useMemo(() => {
    let result = [...products];
    const debtSet = new Set(debtProductIdsList);

    // 1. Search Query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p =>
        (p.name || '').toLowerCase().includes(query) ||
        (p.article || '').toLowerCase().includes(query) ||
        (p.color || '').toLowerCase().includes(query)
      );
    }

    // 2. Chip Filter
    if (activeFilter === 'low_stock') {
      result = result.filter(p => p.stock <= (p.min_stock_alert || 0));
    } else if (activeFilter === 'debts') {
      result = result.filter(p => debtSet.has(p.id));
    } else if (activeFilter === 'pending') {
      return []; // Return empty as we render pendingSales separately
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

  type ProductGroup = {
    article: string;
    displayName: string;
    variants: any[];
  };
  type DisplayItem =
    | { type: 'group'; data: ProductGroup }
    | { type: 'single'; data: any };

  const displayItems = useMemo(() => {
    const groups = new Map<string, any[]>();
    const singles: any[] = [];

    filteredProducts.forEach(p => {
      const groupKey = p.article?.trim() || p.name?.trim();
      if (groupKey) {
        if (!groups.has(groupKey)) groups.set(groupKey, []);
        groups.get(groupKey)!.push(p);
      } else {
        singles.push(p);
      }
    });

    const items: DisplayItem[] = [];

    groups.forEach((variants, art) => {
      if (variants.length > 1) {
        variants.sort((a, b) => (a.color || '').localeCompare(b.color || ''));
        items.push({
          type: 'group',
          data: {
            article: art,
            displayName: variants[0].name,
            variants
          }
        });
      } else {
        singles.push(variants[0]);
      }
    });

    singles.forEach(p => items.push({ type: 'single', data: p }));

    // Re-sort items by stock of the first/main item if desired,
    // but here we just follow the base filteredProducts order mostly.
    // To keep it simple and consistent with filteredProducts sorting:
    items.sort((a, b) => {
      const stockA = a.type === 'single' ? a.data.stock : Math.min(...a.data.variants.map((v: any) => v.stock));
      const stockB = b.type === 'single' ? b.data.stock : Math.min(...b.data.variants.map((v: any) => v.stock));
      return sortDirection === 'asc' ? stockA - stockB : stockB - stockA;
    });

    return items;
  }, [filteredProducts, sortDirection]);

  const openAddVariantForm = (group: ProductGroup) => {
    const template = group.variants[0];
    setName(group.displayName);
    setArticle(group.article);
    setColor('');
    setStock('');
    setBuyPrice(String(template.buy_price));
    setSellPrice(String(template.sell_price));
    setBaseUnit(template.base_unit || 'шт');
    setHasPackages(template.has_packages === 1);
    setPackageName(template.package_name || '');
    setUnitsPerPackage(String(template.units_per_package || 1));
    setIsContinuous(template.is_continuous === 1);
    setEditingId(null);
    setShowAdvanced(true);
    setShowForm(true);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    const start = Date.now();
    loadProducts();
    const elapsed = Date.now() - start;
    if (elapsed < 300) await new Promise(r => setTimeout(r, 300 - elapsed));
    setRefreshing(false);
  };

  const handleSave = () => {
    if (!name.trim() || (isOwner && !buyPrice) || !sellPrice) {
      Alert.alert(t('common.error'), t('products.errorRequired'));
      return;
    }

    // Продавец с правом manage_products не видит поле закупочной цены —
    // бэкенд её всё равно отбросит при синхронизации не-владельцем, но
    // локально в SQLite поле не может остаться пустым/NaN.
    const bPrice = isOwner ? parseFloat(buyPrice) : (parseFloat(buyPrice) || 0);
    const sPrice = parseFloat(sellPrice);
    const st = parseFloat(stock) || 0;
    const alert = parseFloat(minStockAlert) || 0;

    const uPerPkg = parseFloat(unitsPerPackage) || 1;
    const cat = category.trim() || null;

    if (editingId) {
      updateProduct(editingId, name.trim(), bPrice, sPrice, st, alert, baseUnit, hasPackages ? 1 : 0, packageName, uPerPkg, cat, isContinuous ? 1 : 0, article.trim() || null, color.trim() || null);
      analyticsService.logEvent('product_updated', { product_id: editingId });
    } else {
      const result = addProduct(name.trim(), bPrice, sPrice, st, alert, baseUnit, hasPackages ? 1 : 0, packageName, uPerPkg, cat, isContinuous ? 1 : 0, article.trim() || null, color.trim() || null);
      analyticsService.logEvent('product_added', { product_id: result.lastInsertRowId });

      // Suggest adding expense for purchase cost
      const totalPurchaseCost = bPrice * st;
      if (totalPurchaseCost > 0) {
        Alert.alert(
          t('expenses.addProductExpensePrompt'),
          t('expenses.addProductExpenseDesc', {
            amount: totalPurchaseCost.toLocaleString(),
            symbol: currency.symbol
          }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('common.yes') || 'Да',
              onPress: async () => {
                await addExpense({
                  type: 'inventory',
                  category: 'inventory',
                  amount: totalPurchaseCost,
                  description: name.trim(),
                  linkedProductId: result?.lastInsertRowId || undefined,
                });
                Alert.alert('✅', t('expenses.expenseSaved'));
              }
            }
          ]
        );
      }
    }

    resetForm();
    setShowForm(false);
    loadProducts();
  };

  const resetForm = () => {
    setName(''); setBuyPrice(''); setSellPrice(''); setStock('');
    setMinStockAlert(String(defaultMinStockAlert));
    setBaseUnit('шт'); setHasPackages(false); setIsContinuous(false); setPackageName(''); setUnitsPerPackage('1');
    setCategory('');
    setArticle('');
    setColor('');
    setShowColorPicker(false);
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
            setIsContinuous(p.is_continuous === 1);
            setPackageName(p.package_name || '');
            setUnitsPerPackage(String(p.units_per_package || 1));
            setCategory(p.category || '');
            setArticle(p.article || '');
            setColor(p.color || '');
            setShowColorPicker(!!(p.color));
            setShowForm(true);
            setShowAdvanced(
              p.has_packages === 1 ||
              p.base_unit !== 'шт' ||
              p.is_continuous === 1 ||
              !!p.article ||
              !!p.color
            );
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
  const activeCategory = (activeFilter && typeof activeFilter === 'object') ? activeFilter.category : undefined;

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
      <View style={[styles.searchContainer, themeStyles.searchBar]}>
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

          {isOwner && pendingSales.length > 0 && (
            <TouchableOpacity
              style={[styles.chip, themeStyles.chip, activeFilter === 'pending' && styles.chipActive]}
              onPress={() => setActiveFilter('pending')}
            >
              <Text style={[styles.chipText, themeStyles.chipText, activeFilter === 'pending' && styles.chipTextActive]}>⚠️ {t('sellers.pendingReviewTitle')}</Text>
            </TouchableOpacity>
          )}

          {topCategories.map((cat, idx) => (
            <TouchableOpacity
              key={`top-${idx}`}
              style={[
                styles.chip,
                themeStyles.chip,
                activeCategory === cat && styles.chipActive
              ]}
              onPress={() => setActiveFilter({ category: cat })}
            >
              <Text style={[
                styles.chipText,
                themeStyles.chipText,
                activeCategory === cat && styles.chipTextActive
              ]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}

          {/* Render active category if not in top-4 */}
          {activeCategory && !topCategories.includes(activeCategory) && (
            <TouchableOpacity
              key="selected-extra"
              style={[
                styles.chip,
                styles.chipActive
              ]}
              onPress={() => setActiveFilter('all')}
            >
              <Text style={[
                styles.chipText,
                themeStyles.chipText,
                styles.chipTextActive
              ]}>
                {activeCategory}
              </Text>
            </TouchableOpacity>
          )}

          {/* More Categories Button */}
          {allCategories.length > 4 && (
            <TouchableOpacity
              style={[styles.chip, themeStyles.chip]}
              onPress={() => setMoreCategoriesVisible(true)}
            >
              <Text style={[styles.chipText, themeStyles.chipText, { color: Colors.primary, fontWeight: '600' }]}>
                {t('common.more') || 'Ещё'} →
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

    <ScrollView
      ref={scrollViewRef}
      style={styles.flex}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      keyboardShouldPersistTaps="handled"
    >
      {(isOwner || can('manage_products')) && (
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
          <View style={{ zIndex: 3000, overflow: 'visible' }}>
            <ProductAutocomplete
              ref={nameRef}
              inputStyle={[styles.input, themeStyles.input]}
              placeholder={t('addSale.productPlaceholder')}
              placeholderTextColor={isDark ? '#888' : '#aaa'}
              value={name}
              onChange={setName}
              returnKeyType={getReturnKeyType(0)}
              onSubmitEditing={getSubmitHandler(0)}
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
                    setIsContinuous(existing.is_continuous === 1);
                    setPackageName(existing.package_name || '');
                    setUnitsPerPackage(String(existing.units_per_package || 1));
                    setCategory(existing.category || '');
                    setArticle(existing.article || '');
                    setColor(existing.color || '');
                    setShowColorPicker(!!(existing.color));
                    setShowAdvanced(
                      existing.has_packages === 1 ||
                      existing.base_unit !== 'шт' ||
                      existing.is_continuous === 1 ||
                      !!existing.article ||
                      !!existing.color
                    );
                  }
                } else if (p.source === 'history') {
                  setBuyPrice(String(p.purchasePrice || ''));
                  setSellPrice(String(p.lastSalePrice || ''));
                }
              }}
            />
          </View>

          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={[styles.label, themeStyles.text]}>{t('products.category')}</Text>
              <View style={{ zIndex: 2000 }}>
                <TextInput
                  ref={categoryRef}
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
                  returnKeyType={getReturnKeyType(1)}
                  onSubmitEditing={getSubmitHandler(1)}
                  blurOnSubmit={false}
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
            {isOwner && (
              <View style={styles.half}>
                <Text style={[styles.label, themeStyles.text]}>{t('addSale.buyPrice')} *</Text>
                <TextInput
                  ref={buyPriceRef}
                  style={[styles.input, themeStyles.input]}
                  placeholder="0"
                  placeholderTextColor={isDark ? '#888' : '#aaa'}
                  keyboardType="numeric"
                  value={buyPrice}
                  onChangeText={setBuyPrice}
                  returnKeyType={getReturnKeyType(2)}
                  onSubmitEditing={getSubmitHandler(2)}
                  blurOnSubmit={false}
                />
              </View>
            )}
            <View style={styles.half}>
              <Text style={[styles.label, themeStyles.text]}>{t('addSale.sellPrice')} *</Text>
              <TextInput
                ref={sellPriceRef}
                style={[styles.input, themeStyles.input]}
                placeholder="0"
                placeholderTextColor={isDark ? '#888' : '#aaa'}
                keyboardType="numeric"
                value={sellPrice}
                onChangeText={setSellPrice}
                returnKeyType={getReturnKeyType(3)}
                onSubmitEditing={getSubmitHandler(3)}
                blurOnSubmit={false}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={[styles.label, themeStyles.text]}>{t('products.stock')} ({baseUnit})</Text>
              <TextInput
                ref={stockRef}
                style={[styles.input, themeStyles.input]}
                placeholder="0"
                placeholderTextColor={isDark ? '#888' : '#aaa'}
                keyboardType="numeric"
                value={stock}
                onChangeText={setStock}
                returnKeyType={getReturnKeyType(4)}
                onSubmitEditing={getSubmitHandler(4)}
                blurOnSubmit={false}
              />
            </View>
            <View style={styles.half}>
              <Text style={[styles.label, themeStyles.text]}>{t('products.minStock')}</Text>
              <TextInput
                ref={minStockAlertRef}
                style={[styles.input, themeStyles.input]}
                placeholder="0"
                placeholderTextColor={isDark ? '#888' : '#aaa'}
                keyboardType="numeric"
                value={minStockAlert}
                onChangeText={setMinStockAlert}
                returnKeyType={getReturnKeyType(5)}
                onSubmitEditing={getSubmitHandler(5)}
                blurOnSubmit={false}
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
              <Text style={[styles.label, themeStyles.text]}>{t('products.article')}</Text>
              <TextInput
                ref={articleRef}
                style={[styles.input, themeStyles.input]}
                placeholder="6593"
                placeholderTextColor={isDark ? '#888' : '#aaa'}
                value={article}
                onChangeText={setArticle}
                returnKeyType={getReturnKeyType(6)}
                onSubmitEditing={getSubmitHandler(6)}
                blurOnSubmit={false}
              />

              {color !== '' ? (
                <TouchableOpacity
                  onPress={() => setShowColorPicker(!showColorPicker)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 12 }}
                >
                  <ColorCircle
                    size={22}
                    hex={(color ? getColorHex(color) : null) ?? '#BDBDBD'}
                  />
                  <Text style={[themeStyles.text, { fontSize: 14 }]}>{color}</Text>
                  <Ionicons
                    name={showColorPicker ? 'chevron-up' : 'chevron-down'}
                    size={14} color="#888"
                  />
                  <TouchableOpacity
                    onPress={() => { setColor(''); setShowColorPicker(false); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={16} color="#aaa" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ) : (
                !showColorPicker && (
                  <TouchableOpacity
                    onPress={() => setShowColorPicker(true)}
                    style={{ marginBottom: 8, marginTop: 12 }}
                  >
                    <Text style={{ color: '#1D9E75', fontSize: 14 }}>
                      {t('products.color')}
                    </Text>
                  </TouchableOpacity>
                )
              )}

              {showColorPicker && (
                <View style={{ marginTop: color === '' ? 12 : 0 }}>
                  <TextInput
                    ref={colorRef}
                    style={[styles.input, themeStyles.input]}
                    placeholder="Другой цвет..."
                    placeholderTextColor={isDark ? '#888' : '#aaa'}
                    value={PRESET_COLORS.some(c => c.label === color) ? '' : color}
                    onChangeText={setColor}
                    returnKeyType={getReturnKeyType(7)}
                    onSubmitEditing={getSubmitHandler(7)}
                    blurOnSubmit={false}
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
                              style={isSelected ? { borderWidth: 2, borderColor: '#1D9E75' } : null}
                            />
                            {isSelected && (
                              <View style={{
                                position: 'absolute', bottom: -2, right: -2,
                                backgroundColor: '#1D9E75', borderRadius: 8,
                                width: 16, height: 16,
                                justifyContent: 'center', alignItems: 'center'
                              }}>
                                <Ionicons name="checkmark" size={11} color="#fff" />
                              </View>
                            )}
                          </View>
                          <Text style={[themeStyles.text, { fontSize: 9, marginTop: 3 }]} numberOfLines={1}>
                            {preset.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              <Text style={[styles.label, themeStyles.text]}>{t('products.baseUnit')}</Text>
              <TextInput
                ref={baseUnitRef}
                style={[styles.input, themeStyles.input]}
                placeholder={t('products.unitPlaceholder')}
                placeholderTextColor={isDark ? '#888' : '#aaa'}
                value={baseUnit}
                onChangeText={setBaseUnit}
                returnKeyType={getReturnKeyType(8)}
                onSubmitEditing={getSubmitHandler(8)}
                blurOnSubmit={false}
              />

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setHasPackages(!hasPackages)}
              >
                <Ionicons name={hasPackages ? 'checkbox' : 'square-outline'} size={24} color="#1D9E75" />
                <Text style={[styles.checkboxLabel, themeStyles.text]}>{t('products.hasPackages')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setIsContinuous(!isContinuous)}
              >
                <Ionicons name={isContinuous ? 'checkbox' : 'square-outline'} size={24} color="#1D9E75" />
                <Text style={[styles.checkboxLabel, themeStyles.text]}>{t('products.isContinuous')}</Text>
              </TouchableOpacity>

              {hasPackages && (
                <View style={styles.row}>
                  <View style={styles.half}>
                    <Text style={[styles.label, themeStyles.text]}>{t('products.packageName')}</Text>
                    <TextInput
                      ref={packageNameRef}
                      style={[styles.input, themeStyles.input]}
                      placeholder={t('products.packageNamePlaceholder')}
                      placeholderTextColor={isDark ? '#888' : '#aaa'}
                      value={packageName}
                      onChangeText={setPackageName}
                      returnKeyType={getReturnKeyType(9)}
                      onSubmitEditing={getSubmitHandler(9)}
                      blurOnSubmit={false}
                    />
                  </View>
                  <View style={styles.half}>
                    <Text style={[styles.label, themeStyles.text]}>{t('products.unitsPerPackage')}</Text>
                    <TextInput
                      ref={unitsPerPackageRef}
                      style={[styles.input, themeStyles.input]}
                      placeholder="1"
                      placeholderTextColor={isDark ? '#888' : '#aaa'}
                      keyboardType="numeric"
                      value={unitsPerPackage}
                      onChangeText={setUnitsPerPackage}
                      returnKeyType={getReturnKeyType(10)}
                      onSubmitEditing={getSubmitHandler(10)}
                      blurOnSubmit={false}
                    />
                  </View>
                </View>
              )}
            </View>
          )}

          {isOwner && buyPrice && sellPrice && (
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
        <Text style={[styles.sectionTitle, themeStyles.text, { paddingHorizontal: 0, marginBottom: 0 }]}>
          {searchQuery ? `${t('products.found')}: ${filteredProducts.length}` : `${t('products.allProducts')} (${products.length})`}
        </Text>

        <TouchableOpacity
          style={styles.sortBtn}
          onPress={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
        >
          <Text style={[styles.sortBtnText, themeStyles.text]}>
            {t('products.stock')} {sortDirection === 'asc' ? '↑' : '↓'}
          </Text>
        </TouchableOpacity>
      </View>

      {activeFilter === 'pending' ? (
        pendingSales.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>🎉 {t('products.allRegistered')}</Text>
          </View>
        ) : (
          pendingSales.map((sale: any) => (
            <View key={String(sale.id)} style={[styles.productItem, themeStyles.card, { borderLeftWidth: 4, borderLeftColor: '#FF9500' }]}>
              <View style={styles.productMain}>
                <View style={styles.productLeft}>
                  <Text style={[styles.productName, themeStyles.text]}>{sale.product_name}</Text>
                  <Text style={styles.productPrices}>
                    {t('common.revenue')}: {sale.sell_price * sale.quantity} {currency.symbol} · {t('common.quantity')}: {sale.quantity}
                  </Text>
                  <Text style={[styles.infoText, { marginTop: 4 }]}>
                    {t('common.seller')}: {sale.seller_name} · {new Date(sale.created_at.replace(' ', 'T')).toLocaleDateString()}
                  </Text>
                </View>
                <TouchableOpacity
                  style={{ backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignSelf: 'center' }}
                  onPress={() => setResolveSaleTarget(sale)}
                >
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>{t('common.edit')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )
      ) : filteredProducts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{searchQuery ? t('reports.nothingFound') : t('products.noProducts') || 'No products'}</Text>
          <Text style={styles.emptyHint}>{searchQuery ? t('products.tryAnotherQuery') || 'Try another query' : t('products.addFirstProduct') || 'Add your first product'}</Text>
        </View>
      ) : (
        displayItems.map((item, index) => {
          if (item.type === 'single') {
            const p = item.data;
            const isExpanded = expandedProductId === p.id;
            const stats = productStats[p.id];

            return (
              <View key={`single-${p.id}`} style={[
                styles.productItem,
                themeStyles.card,
                p.stock <= 0 && { backgroundColor: isDark ? '#181818' : '#FAFAFA' }
              ]}>
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
                      {isOwner
                        ? `${t('addSale.buyPrice')}: ${p.buy_price} ${currency.symbol}`
                        : `${t('addSale.sellPrice')}: ${p.sell_price} ${currency.symbol}`}
                    </Text>
                  </View>
                  <View style={styles.productRight}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[
                        styles.productStock,
                        { color: p.stock <= 0 ? Colors.danger : p.stock <= (p.min_stock_alert || 0) ? Colors.warning : Colors.primary }
                      ]}>
                        {p.stock} {p.base_unit || t('reports.pcs')}
                      </Text>
                      <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="#aaa" />
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          navigation.navigate('ProductDetail', { product: p });
                        }}
                        style={{ padding: 4 }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
                      </TouchableOpacity>
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
                    </View>

                    <Text style={[styles.infoText, { paddingHorizontal: 12, paddingTop: 8 }]}>
                      {t('products.addedDate')}: {p.created_at ? new Date(p.created_at.replace(' ', 'T')).toLocaleDateString('ru-RU') : '—'}
                      {isOwner && ` · ${t('addSale.sellPrice')}: ${p.sell_price} ${currency.symbol}`}
                    </Text>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 }}>
                      {(isOwner || can('manage_products')) && (
                        <TouchableOpacity
                          onPress={() => {
                            openAddVariantForm({
                              article: p.article?.trim() || p.name?.trim() || '',
                              displayName: p.name,
                              variants: [p],
                            });
                          }}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: Colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}
                        >
                          <Ionicons name="add-circle-outline" size={14} color={Colors.primary} />
                          <Text style={{ color: Colors.primary, fontSize: 12, fontWeight: '600' }}>
                            {t('products.addVariant')}
                          </Text>
                        </TouchableOpacity>
                      )}

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
          } else {
            // RENDERING GROUP
            const { data } = item;
            return (
              <View key={`group-${data.article}`} style={[styles.productItem, themeStyles.card, { paddingBottom: 8 }]}>
                <View style={[styles.productMain, { paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: isDark ? '#333' : '#eee' }]}>
                  <Text style={[styles.productName, themeStyles.text, { fontWeight: 'bold' }]}>{data.displayName}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 12, color: '#999' }}>
                      {t('products.variantsCount', { count: data.variants.length })}
                    </Text>
                    <TouchableOpacity
                      onPress={() => openAddVariantForm(data)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                    >
                      <Ionicons name="add-circle-outline" size={16} color={Colors.primary} />
                      <Text style={{ color: Colors.primary, fontSize: 12, fontWeight: '600' }}>
                        {t('products.addVariant')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {data.variants.map((v: any) => {
                  const isExpanded = expandedProductId === v.id;
                  const stats = productStats[v.id];
                  return (
                    <View key={v.id} style={v.stock <= 0 ? { backgroundColor: isDark ? '#181818' : '#FAFAFA' } : undefined}>
                      <TouchableOpacity
                        style={[styles.productMain, { paddingVertical: 10 }]}
                        onPress={() => {
                          const newId = isExpanded ? null : v.id;
                          setExpandedProductId(newId);
                          if (newId && !productStats[newId]) {
                            const stats = getProductSalesStats(v.id);
                            setProductStats(prev => ({ ...prev, [v.id]: stats }));
                          }
                        }}
                        onLongPress={() => handleLongPress(v)}
                      >
                        <View style={[styles.productLeft, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                          <ColorCircle size={18} hex={(v.color ? getColorHex(v.color) : null) ?? '#BDBDBD'} />
                          <Text style={[themeStyles.text, { fontSize: 14 }]}>{v.color || v.name}</Text>
                        </View>
                        <View style={[styles.productRight, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
                          <Text style={[
                            styles.productStock,
                            { fontSize: 14, color: v.stock <= 0 ? Colors.danger : v.stock <= (v.min_stock_alert || 0) ? Colors.warning : Colors.primary }
                          ]}>
                            {v.stock}
                          </Text>
                          <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="#aaa" />
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation();
                              navigation.navigate('ProductDetail', { product: v });
                            }}
                            style={{ padding: 4 }}
                          >
                            <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
                          </TouchableOpacity>
                        </View>
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={[styles.expandedContent, { borderTopWidth: 1, borderTopColor: isDark ? '#333' : '#eee' }]}>
                          {/* Copied expandedContent block from single item */}
                          <View style={styles.statsRow}>
                            <View style={styles.statBox}>
                              <Text style={styles.statLabel}>{t('products.totalSold')}</Text>
                              <Text style={[styles.statValue, themeStyles.text]}>{stats?.total_sold || 0}</Text>
                            </View>
                            <View style={styles.statBox}>
                              <Text style={styles.statLabel}>{t('products.totalRevenue')}</Text>
                              <Text style={[styles.statValue, themeStyles.text]}>{stats?.total_revenue?.toFixed(0) || 0} {currency.symbol}</Text>
                            </View>
                          </View>

                          <Text style={[styles.infoText, { paddingHorizontal: 12, paddingTop: 8 }]}>
                            {t('products.addedDate')}: {v.created_at ? new Date(v.created_at.replace(' ', 'T')).toLocaleDateString('ru-RU') : '—'}
                            {isOwner && ` · ${t('addSale.sellPrice')}: ${v.sell_price} ${currency.symbol}`}
                          </Text>

                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 }}>
                            {(isOwner || can('manage_products')) && (
                              <TouchableOpacity
                                onPress={() => {
                                  openAddVariantForm({
                                    article: v.article?.trim() || v.name?.trim() || '',
                                    displayName: v.name,
                                    variants: [v],
                                  });
                                }}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: Colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}
                              >
                                <Ionicons name="add-circle-outline" size={14} color={Colors.primary} />
                                <Text style={{ color: Colors.primary, fontSize: 12, fontWeight: '600' }}>
                                  {t('products.addVariant')}
                                </Text>
                              </TouchableOpacity>
                            )}

                            {(stats?.total_sold || 0) > 0 && (
                              <TouchableOpacity
                                onPress={() => {
                                  setHistoryProductName(v.name + (v.color ? ` · ${v.color}` : ''));
                                  setProductSalesHistory(getProductSalesHistory(v.id));
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
                                      prefillSell: v.sell_price,
                                      prefillBuy: v.buy_price,
                                      prefillProductName: v.name + (v.color ? ` · ${v.color}` : ''),
                                      prefillProductId: v.id,
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
                                    setSelectedProduct(v);
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
                                    setSelectedProduct(v);
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
                                    setSelectedProduct(v);
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
                })}

              </View>
            );
          }
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
                          {t('common.profit')}: +{(s.profit || 0).toFixed(0)} {currency.symbol}
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

      <ResolvePendingSaleModal
        visible={!!resolveSaleTarget}
        sale={resolveSaleTarget}
        onClose={() => setResolveSaleTarget(null)}
        onResolved={loadProducts}
      />

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

      {/* More Categories Modal */}
      <Modal
        visible={moreCategoriesVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setMoreCategoriesVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setMoreCategoriesVisible(false)}
        >
          <View style={[styles.modalContent, themeStyles.card]} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, themeStyles.text]}>{t('products.category') || 'Категория'}</Text>
              <TouchableOpacity onPress={() => setMoreCategoriesVisible(false)}>
                <Ionicons name="close" size={24} color={isDark ? '#FFF' : '#000'} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              {allCategories.map((cat, idx) => {
                const isActive = activeCategory === cat;
                return (
                  <TouchableOpacity
                    key={`modal-cat-${idx}`}
                    style={{
                      paddingVertical: 14,
                      paddingHorizontal: 12,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: isDark ? '#333' : '#EEE',
                      backgroundColor: isActive ? (isDark ? '#2C2C2C' : '#E8F5E9') : 'transparent',
                      borderRadius: Radius.md,
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                    onPress={() => {
                      setActiveFilter({ category: cat });
                      setMoreCategoriesVisible(false);
                    }}
                  >
                    <Text style={[
                      themeStyles.text,
                      {
                        fontSize: 15,
                        fontWeight: isActive ? '600' : '400',
                        color: isActive ? Colors.primary : undefined
                      }
                    ]}>
                      {cat}
                    </Text>
                    {isActive && (
                      <Ionicons name="checkmark" size={18} color={Colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
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
  searchBar: { backgroundColor: LightTheme.inputBg, borderColor: LightTheme.inputBorder },
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: DarkTheme.background },
  card: { backgroundColor: DarkTheme.card },
  text: { color: DarkTheme.text },
  input: { backgroundColor: '#2C2C2C', borderColor: '#444', color: '#EEE' },
  chip: { backgroundColor: '#2C2C2C', borderColor: '#444' },
  chipText: { color: '#AAA' },
  searchBar: { backgroundColor: DarkTheme.inputBg, borderColor: DarkTheme.inputBorder },
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
    borderWidth: 1,
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
