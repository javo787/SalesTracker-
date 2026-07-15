import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  ScrollView, View, Text, TouchableOpacity, StyleSheet,
  Alert, FlatList, Modal, TextInput, ActivityIndicator, Animated
} from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import { useShop } from '../context/ShopContext';
import { Colors, LightTheme, DarkTheme, Radius, Shadow, FontSize, Spacing } from '../constants/theme';
import {
  getProductSalesStats,
  getProductSalesHistory,
  getStockMovements,
  getProductSalesByDay,
  getDebtsByProductId,
  getProductExpenses,
  recordDebtPayment,
  deleteSale,
  getProducts
} from '../db/database';
import StockOperationModal from '../components/stock/StockOperationModal';
import EditProductModal from '../components/products/EditProductModal';

const ProductDetailScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { product: initialProduct } = route.params;
  const { resolvedTheme, currency } = useAppContext();
  const isDark = resolvedTheme === 'dark';
  const { isOwner, isSeller } = useShop();

  const [product, setProduct] = useState(initialProduct);
  const [activeTab, setActiveTab] = useState<'sales' | 'stock' | 'debts' | 'expenses'>('sales');
  const [period, setPeriod] = useState<7 | 30 | 0>(30); // 0 = all time
  const [salesHistory, setSalesHistory] = useState<any[]>([]);
  const [stockMovements, setStockMovements] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [debts, setDebts] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<{ total: number; count: number }>({ total: 0, count: 0 });
  const [stats, setStats] = useState<any>(null);

  const [editModalVisible, setEditModalVisible] = useState(false);

  const [opModalVisible, setOpModalVisible] = useState(false);
  const [opType, setOpType] = useState<'stock_in' | 'waste' | 'correction'>('stock_in');

  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  const themeStyles = isDark ? DarkTheme : LightTheme;

  const loadData = useCallback(() => {
    const s = getProductSalesStats(product.id);
    setStats(s);
    // Increase limit to ensure accurate stats for at least 30 days
    setSalesHistory(getProductSalesHistory(product.id, 500));
    setStockMovements(getStockMovements(product.id, 100));
    setChartData(getProductSalesByDay(product.id, 14));

    if (isOwner) {
      setDebts(getDebtsByProductId(product.id));
      setExpenses(getProductExpenses(product.id));
    }
  }, [product.id, isOwner]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRecordPayment = () => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Ошибка', 'Введите корректную сумму');
      return;
    }

    recordDebtPayment(selectedDebt.id, amount, paymentNote);
    Alert.alert('Успешно', 'Оплата принята');
    setPaymentModalVisible(false);
    setPaymentAmount('');
    setPaymentNote('');
    loadData();
  };

  const handleDeleteSale = (saleId: number) => {
    Alert.alert(
      'Удаление продажи',
      'Вы уверены, что хотите удалить эту продажу? Товар вернется на склад.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            deleteSale(saleId);
            loadData();
          }
        }
      ]
    );
  };

  const EDIT_FIELD_LABELS: Record<string, string> = {
    name: t('addSale.productName'),
    category: t('products.category'),
    buy_price: t('addSale.buyPrice'),
    sell_price: t('addSale.sellPrice'),
    stock: t('products.stock'),
    min_stock_alert: t('products.minStock'),
    base_unit: t('products.baseUnit'),
    article: t('products.article'),
    color: t('products.color'),
    package_name: t('products.packageName'),
    units_per_package: t('products.unitsPerPackage'),
    is_continuous: t('products.isContinuous'),
  };

  const formatDiffValue = (field: string, val: any) => {
    if (field === 'is_continuous') return val ? 'Да' : 'Нет';
    if (val === null || val === undefined || val === '') return '—';
    return String(val);
  };

  const handleProductSaved = (updated: any) => {
    setProduct(updated);
    setEditModalVisible(false);
    loadData();
    Alert.alert('Успешно', 'Товар обновлён');
  };

  const avgDailySales = useMemo(() => {
    // We need 30d stats. getProductSalesStats returns all-time.
    // Spec says: "compute avgDailySales = stats?.total_quantity_30d / 30 (use 30d stats)"
    // Since existing getProductSalesStats doesn't have 30d, I'll calculate it from salesHistory
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const qty30d = salesHistory
      .filter(s => new Date(s.created_at.replace(' ', 'T')) >= thirtyDaysAgo)
      .reduce((sum, s) => sum + s.quantity, 0);
    return qty30d / 30;
  }, [salesHistory]);

  const forecastDays = useMemo(() => {
    if (!avgDailySales || avgDailySales === 0) return null;
    return Math.floor(product.stock / avgDailySales);
  }, [product.stock, avgDailySales]);

  const minPrice = useMemo(() => {
    return Math.ceil(product.buy_price * 1.02);
  }, [product.buy_price]);

  return (
    <View style={[styles.container, { backgroundColor: themeStyles.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: isDark ? DarkTheme.card : Colors.primary }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>{product.name}</Text>
            {product.category && (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{product.category}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.headerContent}>
          <View style={styles.stockRow}>
            <Text style={[
              styles.stockValue,
              { color: product.stock > product.min_stock_alert ? '#2ECC71' : '#FF6B6B' }
            ]}>
              {product.stock} {product.base_unit}
            </Text>

            <View style={[
              styles.forecastBadge,
              forecastDays !== null && forecastDays < 5 ? styles.forecastLow : null
            ]}>
              <Text style={styles.forecastText}>
                {forecastDays !== null && forecastDays < 5 ? '⚠️ ' : ''}
                ≈ {forecastDays !== null ? `${forecastDays} дней` : '— дней'}
              </Text>
            </View>
          </View>

          <View style={styles.priceRow}>
            <View style={styles.breakevenInfo}>
              {isOwner ? (
                <>
                  <Text style={styles.priceInfoText}>
                    Закупка: <Text style={styles.bold}>{product.buy_price}</Text> ·
                    Продажа: <Text style={styles.bold}>{product.sell_price}</Text> ·
                    Маржа: <Text style={styles.bold}>{product.buy_price > 0 ? Math.round(((product.sell_price - product.buy_price) / product.buy_price) * 100) : 0}%</Text>
                  </Text>
                  <Text style={styles.minPriceText}>Мин. цена: {minPrice} {currency.symbol}</Text>
                </>
              ) : (
                <Text style={styles.priceInfoText}>
                  Продажа: <Text style={styles.bold}>{product.sell_price}</Text> {currency.symbol}
                </Text>
              )}
            </View>
            {isOwner && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => navigation.navigate('Products', { openAddVariantFor: product })}
                  style={styles.editBtn}
                >
                  <Ionicons name="add-circle-outline" size={20} color="#fff" />
                  <Text style={styles.editBtnText}>{t('products.addVariant')}</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setEditModalVisible(true)} style={styles.editBtn}>
                  <Ionicons name="pencil" size={20} color="#fff" />
                  <Text style={styles.editBtnText}>Редактировать</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>

      <EditProductModal
        visible={editModalVisible}
        product={product}
        onClose={() => setEditModalVisible(false)}
        onSaved={handleProductSaved}
      />

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Section B: KPI Cards */}
        <View style={styles.section}>
          <View style={styles.periodSelector}>
            {[7, 30, 0].map((p) => (
              <TouchableOpacity
                key={p}
                style={[
                  styles.periodBtn,
                  period === p ? { backgroundColor: Colors.primary } : { backgroundColor: themeStyles.border }
                ]}
                onPress={() => setPeriod(p as any)}
              >
                <Text style={[
                  styles.periodBtnText,
                  period === p ? { color: '#fff' } : { color: themeStyles.textSecondary }
                ]}>
                  {p === 0 ? 'Всё' : `${p}д`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kpiScroll}>
            {/* KPI Cards implementation */}
            {useMemo(() => {
              const cutoff = period === 0 ? new Date(0) : new Date();
              if (period > 0) cutoff.setDate(cutoff.getDate() - period);

              const filteredSales = salesHistory.filter(s => new Date(s.created_at.replace(' ', 'T')) >= cutoff);
              const totalQty = filteredSales.reduce((sum, s) => sum + s.quantity, 0);
              const totalRevenue = filteredSales.reduce((sum, s) => sum + (s.sell_price * s.quantity), 0);
              const totalProfit = filteredSales.reduce((sum, s) => sum + (s.profit || 0), 0);
              const periodDays = period || (salesHistory.length > 0 ?
                Math.max(1, Math.ceil((new Date().getTime() - new Date(salesHistory[salesHistory.length-1].created_at.replace(' ', 'T')).getTime()) / (1000 * 60 * 60 * 24)))
                : 1);

              const cards = [
                { label: 'Продано', value: `${totalQty}`, suffix: product.base_unit },
                { label: 'Выручка', value: totalRevenue.toLocaleString(), suffix: currency.symbol },
                { label: 'Прибыль', value: totalProfit.toLocaleString(), suffix: currency.symbol, ownerOnly: true },
                { label: 'В день', value: (totalQty / periodDays).toFixed(1), suffix: product.base_unit },
                { label: 'Средний чек', value: (totalQty > 0 ? (totalRevenue / totalQty) : 0).toLocaleString(), suffix: currency.symbol },
                { label: 'Запас дней', value: forecastDays !== null ? `${forecastDays}` : '—', suffix: 'дней' },
              ];

              return cards.filter(c => !c.ownerOnly || isOwner).map((card, idx) => (
                <View key={idx} style={[styles.kpiCard, { backgroundColor: themeStyles.card }]}>
                  <Text style={styles.kpiLabel}>{card.label}</Text>
                  <Text style={[styles.kpiValue, { color: themeStyles.text }]}>
                    {card.value} <Text style={styles.kpiSuffix}>{card.suffix}</Text>
                  </Text>
                </View>
              ));
            }, [period, salesHistory, product.base_unit, currency.symbol, isOwner, themeStyles, forecastDays])}
          </ScrollView>
        </View>

        {/* Section C: Bar Chart */}
        <View style={[styles.section, styles.chartSection]}>
          <Text style={[styles.sectionTitle, { color: themeStyles.text }]}>Продажи за 14 дней</Text>
          {chartData.length > 0 ? (
            <View style={styles.chartContainer}>
              {(() => {
                const maxQty = Math.max(...chartData.map(d => d.qty), 1);
                const avgQty = chartData.reduce((sum, d) => sum + d.qty, 0) / chartData.length;
                const chartHeight = 150;
                const barWidth = 18;
                const gap = 8;

                return (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <Svg height={chartHeight + 30} width={chartData.length * (barWidth + gap) + 20}>
                      {chartData.map((d, i) => {
                        const h = (d.qty / maxQty) * chartHeight;
                        const x = i * (barWidth + gap) + 10;
                        const y = chartHeight - h;
                        const isAboveAvg = d.qty >= avgQty;

                        return (
                          <React.Fragment key={i}>
                            <Rect
                              x={x}
                              y={y}
                              width={barWidth}
                              height={h}
                              fill={isAboveAvg ? Colors.primary : '#BDC3C7'}
                              rx={4}
                            />
                            <SvgText
                              x={x + barWidth / 2}
                              y={chartHeight + 15}
                              fontSize="10"
                              fill={themeStyles.textTertiary}
                              textAnchor="middle"
                            >
                              {d.day.split('-')[2]}.{d.day.split('-')[1]}
                            </SvgText>
                            {d.qty > 0 && (
                              <SvgText
                                x={x + barWidth / 2}
                                y={y - 5}
                                fontSize="10"
                                fontWeight="bold"
                                fill={themeStyles.textSecondary}
                                textAnchor="middle"
                              >
                                {d.qty}
                              </SvgText>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </Svg>
                  </ScrollView>
                );
              })()}
            </View>
          ) : (
            <View style={styles.emptyChart}>
              <Text style={{ color: themeStyles.textTertiary }}>Нет данных для графика</Text>
            </View>
          )}
        </View>

        {/* Section D: Tabs */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'sales' && styles.activeTab]}
            onPress={() => setActiveTab('sales')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'sales' ? Colors.primary : themeStyles.textSecondary }]}>Продажи</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'stock' && styles.activeTab]}
            onPress={() => setActiveTab('stock')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'stock' ? Colors.primary : themeStyles.textSecondary }]}>Склад</Text>
          </TouchableOpacity>
          {isOwner && (
            <>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'debts' && styles.activeTab]}
                onPress={() => setActiveTab('debts')}
              >
                <Text style={[styles.tabText, { color: activeTab === 'debts' ? Colors.primary : themeStyles.textSecondary }]}>Долги</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'expenses' && styles.activeTab]}
                onPress={() => setActiveTab('expenses')}
              >
                <Text style={[styles.tabText, { color: activeTab === 'expenses' ? Colors.primary : themeStyles.textSecondary }]}>Расходы</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={styles.tabContent}>
          {activeTab === 'sales' && (
            <View>
              {salesHistory.length === 0 ? (
                <Text style={styles.emptyText}>Нет продаж</Text>
              ) : (
                salesHistory.map((item, idx) => (
                  <View key={idx} style={[styles.historyRow, { borderBottomColor: themeStyles.border }]}>
                    <View style={styles.historyInfo}>
                      <Text style={[styles.historyDate, { color: themeStyles.text }]}>
                        {new Date(item.created_at.replace(' ', 'T')).toLocaleDateString('ru-RU')} {new Date(item.created_at.replace(' ', 'T')).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <Text style={[styles.historyQty, { color: themeStyles.text }]}>{item.quantity} {product.base_unit} × {item.sell_price} {currency.symbol}</Text>
                      {isOwner && item.seller_name && (
                        <Text style={styles.sellerName}>Продавец: {item.seller_name}</Text>
                      )}
                      {item.note && <Text style={styles.historyNote}>{item.note}</Text>}
                    </View>
                    {isOwner && (
                      <TouchableOpacity onPress={() => handleDeleteSale(item.id)} style={styles.deleteBtn}>
                        <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </View>
          )}

          {activeTab === 'stock' && (
            <View>
              {product.created_at && (
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: isDark ? '#2A2A2A' : '#F0F0F0',
                }}>
                  <View style={[styles.moveIcon, { backgroundColor: '#88888820' }]}>
                    <Ionicons name="calendar-outline" size={18} color="#888" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: '#888' }}>
                      {t('productDetail.systemAdded')}
                    </Text>
                    <Text style={[
                      { fontSize: 13, fontWeight: '600' },
                      isDark ? { color: '#EEE' } : { color: '#111' },
                    ]}>
                      {new Date(product.created_at.replace(' ', 'T'))
                        .toLocaleDateString('ru-RU', {
                          day: '2-digit', month: 'long', year: 'numeric',
                        })}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 2 }}>
                      <Text style={{ fontSize: 12, color: '#888' }}>
                        {t('productDetail.initialStock')}:{' '}
                        <Text style={{ color: isDark ? '#CCC' : '#333', fontWeight: '500' }}>
                          {product.initial_stock != null ? product.initial_stock : product.stock} {product.base_unit || t('reports.pcs')}
                        </Text>
                      </Text>
                      {isOwner && (product.initial_buy_price ?? product.buy_price) > 0 && (
                        <Text style={{ fontSize: 12, color: '#888' }}>
                          {t('addSale.buyPrice')}:{' '}
                          <Text style={{ color: isDark ? '#CCC' : '#333', fontWeight: '500' }}>
                            {product.initial_buy_price != null ? product.initial_buy_price : product.buy_price} {currency.symbol}
                          </Text>
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              )}

              {stockMovements.length === 0 ? (
                <Text style={styles.emptyText}>Нет движений</Text>
              ) : (
                stockMovements.map((item, idx) => {
                  let icon = 'cube-outline';
                  let color = '#999';
                  if (item.type === 'stock_in') { icon = 'arrow-down-circle'; color = '#2ECC71'; }
                  if (item.type === 'waste') { icon = 'trash-outline'; color = '#FF6B6B'; }
                  if (item.type === 'correction') { icon = 'sync-outline'; color = '#FFA726'; }
                  if (item.type === 'edit') { icon = 'create-outline'; color = '#5B8DEF'; }

                  let editDiff: { field: string; old: any; new: any }[] | null = null;
                  if (item.type === 'edit' && item.note) {
                    try { editDiff = JSON.parse(item.note); } catch { editDiff = null; }
                  }

                  return (
                    <View key={idx} style={[styles.historyRow, { borderBottomColor: themeStyles.border }]}>
                      <View style={[styles.moveIcon, { backgroundColor: color + '20' }]}>
                        <Ionicons name={icon as any} size={20} color={color} />
                      </View>
                      <View style={styles.historyInfo}>
                        <Text style={[styles.historyDate, { color: themeStyles.text }]}>
                          {new Date(item.created_at.replace(' ', 'T')).toLocaleDateString('ru-RU')}
                          {'  '}
                          <Text style={{ fontSize: 11, color: '#888' }}>
                            {new Date(item.created_at.replace(' ', 'T')).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </Text>

                        {item.type === 'edit' ? (
                          (() => {
                            const visibleDiff = isOwner
                              ? editDiff
                              : editDiff?.filter(d => d.field !== 'buy_price');
                            return visibleDiff && visibleDiff.length > 0 ? (
                              visibleDiff.map((d, i) => (
                                <Text key={i} style={[styles.historyQty, { color: themeStyles.text, fontWeight: '600', fontSize: 13 }]}>
                                  {EDIT_FIELD_LABELS[d.field] || d.field}: {formatDiffValue(d.field, d.old)} → {formatDiffValue(d.field, d.new)}
                                </Text>
                              ))
                            ) : (
                              item.note && <Text style={styles.historyNote}>{item.note}</Text>
                            );
                          })()
                        ) : (
                          <>
                            <Text style={[styles.historyQty, { color: themeStyles.text, fontWeight: 'bold' }]}>
                              {item.quantity_change > 0 ? '+' : ''}{item.quantity_change} {product.base_unit}
                            </Text>
                            {isOwner && item.price_per_unit > 0 && (
                              <Text style={styles.historyPrices}>Цена: {item.price_per_unit} {currency.symbol}</Text>
                            )}
                            {isOwner && item.seller_name && (
                              <Text style={styles.sellerName}>Продавец: {item.seller_name}</Text>
                            )}
                            {item.note && <Text style={styles.historyNote}>{item.note}</Text>}
                          </>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {activeTab === 'debts' && (
            <View>
              {debts.length === 0 ? (
                <Text style={styles.emptyText}>Нет активных долгов</Text>
              ) : (
                debts.map((item, idx) => (
                  <View key={idx} style={[styles.historyRow, { borderBottomColor: themeStyles.border }]}>
                    <View style={styles.historyInfo}>
                      <Text style={[styles.clientName, { color: themeStyles.text }]}>{item.client_name}</Text>
                      <Text style={styles.clientPhone}>{item.client_phone}</Text>
                      <Text style={[styles.debtAmount, { color: Colors.danger }]}>
                        Осталось: {item.remaining} {currency.symbol}
                        <Text style={styles.totalDebt}> (из {item.amount_total})</Text>
                      </Text>
                      {item.due_date && (
                        <Text style={[styles.dueDate, { color: new Date(item.due_date) < new Date() ? Colors.danger : '#999' }]}>
                          До: {new Date(item.due_date).toLocaleDateString('ru-RU')}
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.payBtn}
                      onPress={() => {
                        setSelectedDebt(item);
                        setPaymentAmount(String(item.remaining));
                        setPaymentModalVisible(true);
                      }}
                    >
                      <Text style={styles.payBtnText}>Оплата</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}

          {activeTab === 'expenses' && (
            <View style={[styles.expensesCard, { backgroundColor: themeStyles.card, borderColor: themeStyles.border }]}>
              <View style={styles.expenseSummaryRow}>
                <Text style={[styles.expenseLabel, { color: themeStyles.textSecondary }]}>Потрачено на закупку:</Text>
                <Text style={[styles.expenseValue, { color: themeStyles.text }]}>{expenses.total} {currency.symbol}</Text>
              </View>
              <View style={styles.expenseSummaryRow}>
                <Text style={[styles.expenseLabel, { color: themeStyles.textSecondary }]}>Заработано за 30 дней:</Text>
                <Text style={[styles.expenseValue, { color: Colors.primary }]}>
                  {salesHistory
                    .filter(s => new Date(s.created_at.replace(' ', 'T')) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
                    .reduce((sum, s) => sum + (s.profit || 0), 0)
                  } {currency.symbol}
                </Text>
              </View>
              <View style={[styles.divider, { backgroundColor: themeStyles.border }]} />
              <View style={styles.expenseSummaryRow}>
                <Text style={[styles.expenseLabel, { color: themeStyles.textSecondary }]}>Рентабельность:</Text>
                <Text style={[styles.profitabilityValue, { color: Colors.primary }]}>
                  {expenses.total > 0 ? (
                    ((salesHistory.reduce((sum, s) => sum + (s.profit || 0), 0) - expenses.total) / expenses.total * 100).toFixed(1)
                  ) : '0.0'}%
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={{height: 100}} />
      </ScrollView>

      {/* FAB Action Panel */}
      <View style={[styles.fabPanel, { backgroundColor: isDark ? '#1E1E1E' : '#fff' }]}>
        <TouchableOpacity
          style={styles.fabBtn}
          onPress={() => {
            navigation.navigate('Main', {
              screen: 'Tabs',
              params: {
                screen: 'Sale',
                params: {
                  prefillSell: product.sell_price,
                  prefillBuy: product.buy_price,
                  prefillProductName: product.name,
                  prefillProductId: product.id,
                }
              }
            });
          }}
        >
          <Ionicons name="cash-outline" size={24} color={Colors.primary} />
          <Text style={styles.fabBtnText}>Продать</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.fabBtn}
          onPress={() => {
            setOpType('stock_in');
            setOpModalVisible(true);
          }}
        >
          <Ionicons name="add-circle-outline" size={24} color={Colors.primary} />
          <Text style={styles.fabBtnText}>Приём</Text>
        </TouchableOpacity>

        {isOwner && (
          <>
            <TouchableOpacity
              style={styles.fabBtn}
              onPress={() => {
                setOpType('waste');
                setOpModalVisible(true);
              }}
            >
              <Ionicons name="trash-outline" size={24} color={Colors.danger} />
              <Text style={[styles.fabBtnText, { color: Colors.danger }]}>Списание</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.fabBtn}
              onPress={() => {
                setOpType('correction');
                setOpModalVisible(true);
              }}
            >
              <Ionicons name="sync-outline" size={24} color={Colors.warning} />
              <Text style={[styles.fabBtnText, { color: Colors.warning }]}>Сверка</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Debt Payment Modal */}
      <Modal
        visible={paymentModalVisible}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.paymentModal, { backgroundColor: themeStyles.card }]}>
            <Text style={[styles.modalTitle, { color: themeStyles.text }]}>Принять оплату</Text>
            <Text style={styles.modalSubtitle}>{selectedDebt?.client_name}</Text>

            <View style={styles.modalInputs}>
              <Text style={[styles.inputLabel, { color: themeStyles.textSecondary }]}>Сумма оплаты</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: themeStyles.background, color: themeStyles.text, borderColor: themeStyles.border }]}
                value={paymentAmount}
                onChangeText={setPaymentAmount}
                keyboardType="numeric"
                placeholder="0"
              />

              <Text style={[styles.inputLabel, { color: themeStyles.textSecondary }]}>Примечание</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: themeStyles.background, color: themeStyles.text, borderColor: themeStyles.border }]}
                value={paymentNote}
                onChangeText={setPaymentNote}
                placeholder="Напр. Наличные"
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setPaymentModalVisible(false)} style={styles.modalCancel}>
                <Text style={{ color: themeStyles.textSecondary }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleRecordPayment} style={styles.modalSave}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <StockOperationModal
        visible={opModalVisible}
        product={product}
        initialType={opType}
        onClose={() => setOpModalVisible(false)}
        onSuccess={() => {
          setOpModalVisible(false);
          loadData();
          // Update local product state for stock
          const p = getProducts().find((item: any) => item.id === product.id);
          if (p) setProduct(p);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    padding: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: 'bold',
    marginBottom: Spacing.md,
  },
  periodSelector: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  periodBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
  periodBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  kpiScroll: {
    gap: Spacing.md,
  },
  kpiCard: {
    width: 120,
    padding: Spacing.md,
    borderRadius: Radius.md,
    ...Shadow.sm,
  },
  kpiLabel: {
    fontSize: FontSize.xs,
    color: '#999',
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: FontSize.lg,
    fontWeight: 'bold',
  },
  kpiSuffix: {
    fontSize: FontSize.xs,
    fontWeight: 'normal',
  },
  chartSection: {
    marginTop: -Spacing.sm,
  },
  chartContainer: {
    height: 200,
    justifyContent: 'center',
  },
  emptyChart: {
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
    borderStyle: 'dashed',
    borderRadius: Radius.md,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  tab: {
    paddingVertical: Spacing.md,
    marginRight: Spacing.xl,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  tabContent: {
    padding: Spacing.lg,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 40,
    fontSize: FontSize.md,
  },
  historyRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  historyInfo: {
    flex: 1,
  },
  historyDate: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    marginBottom: 2,
  },
  historyQty: {
    fontSize: FontSize.md,
  },
  sellerName: {
    fontSize: FontSize.xs,
    color: '#999',
    marginTop: 2,
  },
  historyNote: {
    fontSize: FontSize.xs,
    color: Colors.warning,
    marginTop: 2,
    fontStyle: 'italic',
  },
  deleteBtn: {
    padding: Spacing.sm,
  },
  moveIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  historyPrices: {
    fontSize: FontSize.xs,
    color: '#999',
  },
  clientName: {
    fontSize: FontSize.md,
    fontWeight: 'bold',
  },
  clientPhone: {
    fontSize: FontSize.xs,
    color: '#999',
  },
  debtAmount: {
    fontSize: FontSize.md,
    fontWeight: '600',
    marginTop: 4,
  },
  totalDebt: {
    fontSize: FontSize.xs,
    color: '#999',
    fontWeight: 'normal',
  },
  dueDate: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  payBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
  },
  payBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: FontSize.sm,
  },
  expensesCard: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    ...Shadow.sm,
  },
  expenseSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  expenseLabel: {
    fontSize: FontSize.md,
  },
  expenseValue: {
    fontSize: FontSize.md,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    marginVertical: Spacing.md,
  },
  profitabilityValue: {
    fontSize: FontSize.xl,
    fontWeight: 'bold',
  },
  fabPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: Spacing.md,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'space-around',
    ...Shadow.lg,
  },
  fabBtn: {
    alignItems: 'center',
    gap: 4,
  },
  fabBtnText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  paymentModal: {
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    ...Shadow.lg,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: 'bold',
  },
  modalSubtitle: {
    fontSize: FontSize.md,
    color: '#999',
    marginBottom: Spacing.lg,
  },
  modalInputs: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  inputLabel: {
    fontSize: FontSize.sm,
    marginBottom: 4,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    fontSize: FontSize.md,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.lg,
    alignItems: 'center',
  },
  modalCancel: {
    padding: Spacing.sm,
  },
  modalSave: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.sm,
  },
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: Spacing.lg,
    borderBottomLeftRadius: Radius.xl,
    borderBottomRightRadius: Radius.xl,
    ...Shadow.md,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  backBtn: {
    marginRight: Spacing.md,
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerTitle: {
    fontSize: FontSize.xxl,
    fontWeight: 'bold',
    color: '#fff',
    flexShrink: 1,
  },
  categoryBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  categoryText: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  headerContent: {
    marginTop: Spacing.xs,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  stockValue: {
    fontSize: FontSize.hero,
    fontWeight: 'bold',
  },
  forecastBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
  },
  forecastLow: {
    backgroundColor: '#FF6B6B',
  },
  forecastText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.1)',
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  breakevenInfo: {
    flex: 1,
  },
  priceInfoText: {
    color: '#fff',
    fontSize: FontSize.sm,
    opacity: 0.9,
  },
  bold: {
    fontWeight: 'bold',
  },
  minPriceText: {
    color: '#fff',
    fontSize: FontSize.xs,
    marginTop: 2,
    opacity: 0.8,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  editBtnText: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  scrollContent: {
    flex: 1,
  }
});

export default ProductDetailScreen;
