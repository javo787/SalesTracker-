import { useEffect, useState, useMemo, useRef } from 'react';
import { useRoute, useNavigation } from '@react-navigation/native';
import {
  View, Text, TextInput, TouchableOpacity, Share, Keyboard,
  StyleSheet, ScrollView, Alert, ActivityIndicator, Animated, Modal, TouchableWithoutFeedback, Easing
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { addSale, addSaleWithSeller, getProducts, upsertClient, addDebt, updateDebtNotificationId, addOrderWithItems } from '../db/database';
import { scheduleDebtReminder } from '../utils/notifications';
import { toISODate } from '../utils/dateUtils';
import { analyticsService } from '../services/analyticsService';
import { reviewService } from '../services/reviewService';
import { SyncService } from '../services/syncService';
import VoiceCapsule, { CapsuleState } from '../components/VoiceCapsule';
import VoiceBatchReview from '../components/VoiceBatchReview';
import { VoiceSaleResult, VoiceSaleItem } from '../types/voiceSale';
import { matchProductByName, ProductMatchResult } from '../utils/productMatching';
import { SmartMatchQuotaService } from '../services/SmartMatchQuotaService';
import { api } from '../services/api';
import { VariantPicker } from '../components/sales/VariantPicker';
import { useAppContext } from '../context/AppContext';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { useFieldChain } from '../hooks/useFieldChain';
import ClientAutocomplete from '../components/debt/ClientAutocomplete';
import ExpensesView from '../components/expenses/ExpensesView';
import { ProductAutocomplete } from '../components/sales/ProductAutocomplete';
import { AutocompleteResult } from '../types/product';
import { Colors, LightTheme, DarkTheme, Radius, Shadow, FontSize, Spacing } from '../constants/theme';
import { ColorCircle, getColorHex } from '../constants/colors';

const CACHE_TTL = 60 * 60 * 1000; // 1 час в мс

type CartItem = {
  id: string;
  product: AutocompleteResult | null;
  productId: number | null;
  productName: string;
  quantity: number;
  sellPrice: number;
  buyPrice: number;
  note: string;
  unitLabel: string;
};

export default function AddSaleScreen(/* props */) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { resolvedTheme, currency, language, sellerMode: contextSellerMode, isPremium } = useAppContext(); const isDark = resolvedTheme === "dark";
  const { isOwner, isSeller, sellerName, role, shopName } = useShop();
  const { user } = useAuth();
  const userId = user?._id || 'guest';

  const [selectedProduct, setSelectedProduct] = useState<AutocompleteResult | null>(null);
  const [ambiguousCandidates, setAmbiguousCandidates] = useState<AutocompleteResult[]>([]);
  const [productName, setProductName] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitType, setUnitType] = useState<'base' | 'package'>('base');
  const [note, setNote] = useState('');
  const [salePricePlaceholder, setSalePricePlaceholder] = useState<number | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  const productInputRef = useRef<any>(null);
  const [paymentType, setPaymentType] = useState<'full' | 'partial' | 'debt'>('full');
  const [paidAmount, setPaidAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientId, setClientId] = useState<number | null>(null);

  const sellPriceRef = useRef<TextInput>(null);
  const buyPriceRef = useRef<TextInput>(null);
  const noteRef = useRef<TextInput>(null);
  const quantityInputRef = useRef<TextInput>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handleDueDateChange = (text: string) => {
    // Remove all non-digits
    const digits = text.replace(/\D/g, '');
    let formatted = digits;
    if (digits.length >= 3 && digits.length <= 4) {
      formatted = digits.slice(0, 2) + '.' + digits.slice(2);
    } else if (digits.length >= 5) {
      formatted = digits.slice(0, 2) + '.' + digits.slice(2, 4) + '.' + digits.slice(4, 8);
    }
    setDueDate(formatted);
  };
  const [voiceText, setVoiceText] = useState('');
  const [showDebtOptions, setShowDebtOptions] = useState(false);
  const [lastSaved, setLastSaved] = useState<{
    name: string; profit: string; revenue: string; shareText?: string;
  } | null>(null);

  const [isSaved, setIsSaved] = useState(false);
  const [resetCapsuleTrigger, setResetCapsuleTrigger] = useState(0);
  const [capsuleState, setCapsuleState] = useState<CapsuleState>('idle');
  const [rowWidth, setRowWidth] = useState(0);
  const [showFullClient, setShowFullClient] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [maskBuyPrice, setMaskBuyPrice] = useState(true);

  const fields = [
    { ref: productInputRef, visible: true },
    { ref: sellPriceRef, visible: true },
    { ref: buyPriceRef, visible: isOwner && !(maskBuyPrice && selectedProduct) },
    { ref: quantityInputRef, visible: true },
    { ref: noteRef, visible: showNoteInput || note !== '' },
  ];

  const { getSubmitHandler, getReturnKeyType } = useFieldChain(fields, () => handleSave());

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;
  const otherButtonsOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(otherButtonsOpacity, {
      toValue: capsuleState === 'idle' ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [capsuleState]);

  const isFormDirty = !!(
    productName || sellPrice || buyPrice || quantity || note ||
    selectedProduct || clientName || paymentType !== 'full'
  );

  const handleClearForm = () => {
    setProductName(''); setSellPrice(''); setBuyPrice('');
    setQuantity(''); setNote(''); setVoiceText('');
    setSelectedProduct(null); setSalePricePlaceholder(null);
    setAmbiguousCandidates([]); setUnitType('base');
    setShowNoteInput(false);
    setPaymentType('full'); setPaidAmount(''); setDueDate('');
    setClientName(''); setClientPhone(''); setClientId(null);
    setShowFullClient(false); setShowDebtOptions(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => productInputRef.current?.focus(), 100);
  };

  const addToCart = () => {
    if (!productName.trim()) {
      Alert.alert(t('common.error'), t('addSale.productPlaceholder'));
      return;
    }

    const finalSellPrice = sellPrice || (salePricePlaceholder ? String(salePricePlaceholder) : '');
    if (!finalSellPrice) {
      Alert.alert(t('common.error'), t('addSale.errorPrices'));
      return;
    }

    if (isOwner && !buyPrice) {
      Alert.alert(t('common.error'), t('addSale.errorPrices'));
      return;
    }

    const sPrice = parseFloat(finalSellPrice);
    const bPrice = parseFloat(buyPrice) || 0;
    let qty = parseFloat(quantity) || 1;
    const pId = selectedProduct?.id ? parseInt(selectedProduct.id) : null;

    if (selectedProduct?.has_packages === 1 && selectedProduct?.is_continuous !== 1 && unitType === 'package') {
      qty = qty * (selectedProduct.units_per_package || 1);
    }

    const getUnitLabel = (q: number, p: AutocompleteResult | null) => {
      if (p?.has_packages === 1 && p?.is_continuous !== 1) {
        const packs = (q / (p.units_per_package || 1)).toFixed(2);
        return `${packs} ${p.package_name} (${q} ${p.base_unit})`;
      }
      return `${q} ${p?.base_unit || 'шт'}`;
    };

    setCartItems((prev: CartItem[]) => {
      const existingIndex = prev.findIndex((item: CartItem) =>
        item.productId === pId &&
        (pId !== null || item.productName === productName.trim())
      );

      if (existingIndex > -1) {
        const newCart = [...prev];
        const existingItem = { ...newCart[existingIndex] };
        existingItem.quantity += qty;
        existingItem.unitLabel = getUnitLabel(existingItem.quantity, existingItem.product);
        newCart[existingIndex] = existingItem;
        return newCart;
      }

      const newItem: CartItem = {
        id: Math.random().toString(36).substring(2, 9),
        product: selectedProduct,
        productId: pId,
        productName: productName.trim(),
        quantity: qty,
        sellPrice: sPrice,
        buyPrice: bPrice,
        note: note.trim(),
        unitLabel: getUnitLabel(qty, selectedProduct)
      };
      return [...prev, newItem];
    });

    // Clear form
    setProductName(''); setSellPrice(''); setBuyPrice('');
    setQuantity(''); setNote(''); setVoiceText('');
    setSelectedProduct(null); setSalePricePlaceholder(null);
    setShowNoteInput(false);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => productInputRef.current?.focus(), 100);
  };

  const handleShareReceipt = async () => {
    if (cartItems.length === 0) return;

    const now = new Date();
    const date = now.toLocaleDateString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
    const time = now.toLocaleTimeString('ru-RU', {
      hour: '2-digit', minute: '2-digit',
    });

    const divider = '─────────────────────';

    const itemLines = cartItems.map((item: CartItem) => {
      const lineTotal = (item.sellPrice * item.quantity).toLocaleString();
      return `${item.productName}\n  ${item.unitLabel}  ×  ${item.sellPrice.toLocaleString()} = ${lineTotal} ${currency.symbol}`;
    }).join('\n\n');

    const parts: string[] = [];
    if (shopName) parts.push(shopName.toUpperCase());
    parts.push(`${date}  ${time}`);
    parts.push('');
    parts.push(divider);
    parts.push(itemLines);
    parts.push(divider);
    parts.push(`${t('addSale.receiptTotal')}: ${cartTotal.toLocaleString()} ${currency.symbol}`);
    parts.push('');
    parts.push(t('addSale.thankYou'));

    Keyboard.dismiss();
    await new Promise(resolve => setTimeout(resolve, 150));
    try {
      await Share.share({
        message: parts.join('\n'),
        title: shopName || t('addSale.receiptTotal'),
      });
    } catch (_) {}
  };

  const triggerSaveAnimation = () => {
    // Вибрация
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Последовательность: сжатие → отскок → возврат
    Animated.sequence([
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0.96,
          duration: 80,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0.85,
          duration: 80,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1.02,
          friction: 4,
          tension: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
      ]),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 150,
        useNativeDriver: true,
      }),
    ]).start();

    // Показать состояние "Сохранено!"
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 1800);
  };

  // добавлено: получение параметров из маршрута (от калькулятора)
  const route = useRoute<any>(); // useRoute in @react-navigation/native is notoriously hard to type without complex generic

  useEffect(() => {
    if (route.params?.prefillSell || route.params?.prefillBuy || route.params?.prefillQty || route.params?.prefillPrice || route.params?.prefillProductName || route.params?.prefillProductId) {
      if (route.params?.prefillSell) setSellPrice(String(route.params.prefillSell));
      if (route.params?.prefillBuy) setBuyPrice(String(route.params.prefillBuy));
      if (route.params?.prefillQty) setQuantity(String(route.params.prefillQty));
      if (route.params?.prefillPrice) setSellPrice(String(route.params.prefillPrice));
      if (route.params?.prefillProductName) setProductName(String(route.params.prefillProductName));
      if (route.params?.prefillProductId) {
        const products = getProducts() as any[];
        const found = products.find(p => p.id === route.params.prefillProductId);
        if (found) {
          setSelectedProduct({
            id: String(found.id),
            name: found.name,
            source: 'catalog',
            purchasePrice: found.buy_price,
            lastSalePrice: found.sell_price,
            salesCount: 0,
            lastSoldAt: null,
            base_unit: found.base_unit,
            has_packages: found.has_packages,
            package_name: found.package_name,
            units_per_package: found.units_per_package,
          });
        }
      }

      // Clear params to prevent them from reappearing on tab switch
      navigation.setParams({
        prefillSell: undefined,
        prefillBuy: undefined,
        prefillQty: undefined,
        prefillPrice: undefined,
        prefillProductName: undefined,
        prefillProductId: undefined,
      });
    }
  }, [route.params, navigation]);


  const [voiceResult, setVoiceResult] = useState<VoiceSaleResult | null>(null);

  const handleVoiceResult = async (result: VoiceSaleResult) => {
    analyticsService.logEvent('ai_usage', {
      type: 'voice_sale',
      language: result.language_detected,
      source: result.source,
      itemsCount: result.items.length
    });

    if (result.items.length === 1) {
      await applyAIResult(result.items[0], result.transcript);
      if (result.transcript) setVoiceText(result.transcript);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      setVoiceResult(result);
    }
  };

  const resolveAmbiguity = async (
    itemName: string,
    transcript: string | undefined,
    match: ProductMatchResult
  ): Promise<{ productId: number | null; confidence: string }> => {
    if (match.confidence !== 'ambiguous' || match.candidates.length === 0) {
      return { productId: null, confidence: match.confidence };
    }

    const canUseSmart = await SmartMatchQuotaService.canUseSmartMatch(isPremium);

    if (canUseSmart && transcript) {
      try {
        const data: any = await api.post('/voice-disambiguate', {
          transcript,
          candidates: match.candidates.map(c => ({
            id: c.id, name: c.name, color: c.color, size: c.article, price: c.lastSalePrice
          })),
        });
        await SmartMatchQuotaService.consumeUsage();

        if (data.matched_candidate_id && data.confidence === 'high') {
          return { productId: parseInt(data.matched_candidate_id), confidence: 'ai_matched' };
        }
      } catch (e) {
        console.warn('[voice-disambiguate] fallback to local picker', e);
      }
    }

    // Лимит исчерпан или AI не уверен → локальный пикер (UI решает через needsVariantPick)
    return { productId: null, confidence: 'ambiguous' };
  };

  const applyAIResult = async (item: VoiceSaleItem, transcript?: string) => {
    if (item.product_name) setProductName(item.product_name);
    if (item.sell_price > 0) setSellPrice(String(item.sell_price));
    if (item.buy_price > 0) setBuyPrice(String(item.buy_price));
    if (item.quantity > 0) setQuantity(String(item.quantity));

    const catalog = getProducts();
    const match = matchProductByName(item.product_name, catalog as any);

    if (match.confidence === 'exact' || match.confidence === 'fuzzy_confident') {
      setSelectedProduct(match.match);
    } else if (match.confidence === 'ambiguous') {
      const resolved = await resolveAmbiguity(item.product_name, transcript, match);
      if (resolved.productId) {
        const picked = match.candidates.find(c => c.id === String(resolved.productId));
        if (picked) setSelectedProduct(picked);
      } else {
        setAmbiguousCandidates(match.candidates);
      }
    }
  };

  const handleBatchConfirm = (items: VoiceSaleItem[]) => {
    const catalog = getProducts();
    const newCartItems: CartItem[] = items.map(it => {
      const match = matchProductByName(it.product_name, catalog as any);
      let linkedProduct = (match.confidence === 'exact' || match.confidence === 'fuzzy_confident')
        ? match.match
        : null;

      // Позиция уже разрешена вручную (VariantPicker) или через AI в VoiceBatchReview —
      // matchedProductId есть, но matchProductByName выше этого не знает. Достаём товар из каталога.
      if (!linkedProduct && it.matchedProductId) {
        const found = (catalog as any[]).find(p => p.id === it.matchedProductId);
        if (found) linkedProduct = found;
      }

      const resolvedProductId = linkedProduct?.id
        ? parseInt(linkedProduct.id)
        : (it.matchedProductId ?? null);

      const unitType = (it as any).unitType || 'base';
      const isPackageSale = linkedProduct?.has_packages === 1
        && linkedProduct?.is_continuous !== 1
        && unitType === 'package';
      const resolvedQuantity = isPackageSale
        ? it.quantity * (linkedProduct!.units_per_package || 1)
        : it.quantity;
      const resolvedUnitLabel = isPackageSale
        ? `${it.quantity} ${linkedProduct!.package_name} (${resolvedQuantity} ${linkedProduct!.base_unit})`
        : `${it.quantity} ${linkedProduct?.base_unit || t('warehouse.unitBase')}`;

      return {
        id: Math.random().toString(36).substring(2, 9),
        product: linkedProduct,
        productId: resolvedProductId,
        productName: it.product_name,
        quantity: resolvedQuantity,
        sellPrice: it.sell_price,
        buyPrice: it.buy_price,
        note: '',
        unitLabel: resolvedUnitLabel
      };
    });

    setCartItems(prev => [...prev, ...newCartItems]);
    setVoiceResult(null);
    triggerSaveAnimation();
  };

  const handleSave = async () => {
    let finalItems: CartItem[] = [...cartItems];

    // If form is filled, add it as last item
    if (productName.trim()) {
      const finalSellPrice = sellPrice || (salePricePlaceholder ? String(salePricePlaceholder) : '');
      if (finalSellPrice && (!isOwner || buyPrice)) {
        const sPrice = parseFloat(finalSellPrice);
        const bPrice = parseFloat(buyPrice) || 0;
        let qty = parseFloat(quantity) || 1;
        if (selectedProduct?.has_packages === 1 && selectedProduct?.is_continuous !== 1 && unitType === 'package') {
          qty = qty * (selectedProduct.units_per_package || 1);
        }

        const getUnitLabel = (q: number, p: AutocompleteResult | null) => {
          if (p?.has_packages === 1 && p?.is_continuous !== 1) {
            const packs = (q / (p.units_per_package || 1)).toFixed(2);
            return `${packs} ${p.package_name} (${q} ${p.base_unit})`;
          }
          return `${q} ${p?.base_unit || 'шт'}`;
        };

        finalItems.push({
          id: 'temp',
          product: selectedProduct,
          productId: selectedProduct?.id ? parseInt(selectedProduct.id) : null,
          productName: productName.trim(),
          quantity: qty,
          sellPrice: sPrice,
          buyPrice: bPrice,
          note: note.trim(),
          unitLabel: getUnitLabel(qty, selectedProduct)
        });
      }
    }

    if (finalItems.length === 0) {
      if (!productName.trim()) {
        Alert.alert(t('common.error'), t('addSale.productPlaceholder'));
      } else {
        Alert.alert(t('common.error'), t('addSale.errorPrices'));
      }
      return;
    }

    if (contextSellerMode === 'wholesale' && paymentType !== 'full' && !clientName.trim()) {
      Alert.alert(t('common.error'), t('addSale.errorClientName'));
      return;
    }

    const seller_Id = userId;
    const seller_Name = user?.name || sellerName || 'Продавец';
    const current_role = role || 'owner';

    let orderId: number | null = null;
    let singleSaleId: number | null = null;
    let totalRevenue = 0;

    try {
      if (finalItems.length > 1 || cartItems.length > 0) {
        // Multiple items flow
        const itemsWithPending = finalItems.map(it => ({
          ...it,
          isPendingReview: it.productId === null ? 1 : 0
        }));

        const orderResult = addOrderWithItems(
          itemsWithPending,
          clientName.trim() ? upsertClient(clientName.trim(), clientPhone.trim()) : null,
          paymentType,
          parseFloat(paidAmount) || 0,
          toISODate(dueDate) || '',
          seller_Id,
          seller_Name,
          current_role
        );
        orderId = orderResult.orderId;
        totalRevenue = orderResult.totalAmount;
      } else {
        // Single item retail flow - maintain identical behavior
        const item = finalItems[0];
        const isPending = item.productId === null ? 1 : 0;

        const saleResult = addSaleWithSeller(
          item.productId,
          item.productName,
          item.quantity,
          item.sellPrice,
          item.buyPrice,
          item.note,
          seller_Id,
          seller_Name,
          current_role,
          isPending
        ) as any;
        singleSaleId = saleResult?.lastInsertRowId;
        totalRevenue = item.sellPrice * item.quantity;

        // Single item debt logic
        if (paymentType !== 'full' && clientName.trim()) {
          const resolvedClientId = upsertClient(clientName.trim(), clientPhone.trim());
          const paid = paymentType === 'partial' ? (parseFloat(paidAmount) || 0) : 0;
          const totalDebt = totalRevenue;
          const isoDueDate = toISODate(dueDate) || '';
          const debtResult = addDebt(resolvedClientId, singleSaleId, totalDebt, paid, '', isoDueDate) as any;

          if (isoDueDate && debtResult?.lastInsertRowId) {
            const notifId = await scheduleDebtReminder(
              debtResult.lastInsertRowId,
              clientName,
              totalDebt - paid,
              isoDueDate,
              currency.symbol
            );
            if (notifId) {
              updateDebtNotificationId(debtResult.lastInsertRowId, notifId);
            }
          }
        }
      }
    } catch (e) {
      console.error('Failed to save sale:', e);
      Alert.alert(t('common.error'), t('addSale.saveFailed') || 'Не удалось сохранить продажу');
      return;
    }

    // Analytics and notifications
    analyticsService.logEvent('sale_added', {
      items_count: finalItems.length,
      total_revenue: totalRevenue,
      payment_type: paymentType,
    });
    reviewService.incrementSalesAndCheck();

    // Trigger background auto sync with debounce
    SyncService.pushDebounced();

    const savedItems = finalItems; // те же позиции что идут в БД
    const savedTotal = savedItems.reduce(
      (s, i) => s + i.sellPrice * i.quantity, 0
    );
    const now = new Date();
    const receiptText = [
      shopName ? shopName.toUpperCase() : null,
      now.toLocaleDateString('ru-RU') + '  ' +
      now.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' }),
      '',
      '─────────────────────',
      ...savedItems.map(i =>
        `${i.productName}\n  ${i.unitLabel} × ${i.sellPrice.toLocaleString()} = ${(i.sellPrice*i.quantity).toLocaleString()} ${currency.symbol}`
      ),
      '─────────────────────',
      `${t('addSale.receiptTotal')}: ${savedTotal.toLocaleString()} ${currency.symbol}`,
      '',
      t('addSale.thankYou'),
    ].filter(Boolean).join('\n');

    setLastSaved({
      name: finalItems.length > 1 ? `${finalItems.length} поз.` : finalItems[0].productName,
      profit: finalItems.reduce((acc, it) => acc + (it.sellPrice - it.buyPrice) * it.quantity, 0).toFixed(0),
      revenue: totalRevenue.toFixed(0),
      shareText: receiptText,
    });

    // Reset all
    setProductName(''); setSellPrice(''); setBuyPrice('');
    setQuantity(''); setNote(''); setVoiceText('');
    setSelectedProduct(null); setSalePricePlaceholder(null);
    setCartItems([]);
    setPaymentType('full'); setPaidAmount(''); setDueDate('');
    setClientName(''); setClientPhone(''); setClientId(null);
    setShowFullClient(false); setShowNoteInput(false);
    setShowDebtOptions(false);
    setPaymentType('full');

    triggerSaveAnimation();
  };

  const themeStyles = isDark ? darkStyles : lightStyles;

  const cartTotal = cartItems.reduce((sum: number, item: CartItem) => sum + item.sellPrice * item.quantity, 0);

  return (
    <Animated.View style={[
      styles.container,
      themeStyles.container,
      { transform: [{ scale: scaleAnim }], opacity: opacityAnim }
    ]}>
      {/* Voice Batch Review Modal (Triggered directly by voiceResult !== null) */}
      <Modal
        visible={voiceResult !== null}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setVoiceResult(null);
          setResetCapsuleTrigger(prev => prev + 1);
        }}
      >
        <TouchableWithoutFeedback onPress={() => {
          setVoiceResult(null);
          setResetCapsuleTrigger(prev => prev + 1);
        }}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.voiceBar, themeStyles.card]}>
                {voiceResult && (
                  <VoiceBatchReview
                    result={voiceResult}
                    onConfirm={(items) => {
                      handleBatchConfirm(items);
                      setResetCapsuleTrigger(prev => prev + 1);
                    }}
                    onCancel={() => {
                      setVoiceResult(null);
                      setResetCapsuleTrigger(prev => prev + 1);
                    }}
                  />
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <View style={{ flex: 1 }}>
          <ScrollView keyboardShouldPersistTaps="handled">
            {/* Cart List */}
            {cartItems.length > 0 && (
              <View style={[styles.cartContainer, themeStyles.card]}>
                <View style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 10,
                }}>
                  <Text style={{ fontSize: 13, color: '#888' }}>
                    {cartItems.length} {t('addSale.positionsLabel')}
                  </Text>
                  <Text style={[{ fontSize: 16, fontWeight: '700' }, themeStyles.text]}>
                    {cartTotal.toLocaleString()} {currency.symbol}
                  </Text>
                </View>
                {cartItems.map((item: CartItem, index: number) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.cartItem, index === cartItems.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => {
                      setProductName(item.productName);
                      setQuantity(String(item.quantity));
                      setSellPrice(String(item.sellPrice));
                      setBuyPrice(String(item.buyPrice));
                      setNote(item.note);
                      setSelectedProduct(item.product);
                      if (item.product?.has_packages) {
                        setUnitType('base'); // Reset to base for editing
                      }
                      setCartItems((prev: CartItem[]) => prev.filter((i: CartItem) => i.id !== item.id));
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cartItemName, themeStyles.text]}>{item.productName}</Text>
                      <Text style={styles.cartItemDetails}>{item.unitLabel} · {item.sellPrice} {currency.symbol}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.cartItemTotal, themeStyles.text]}>{(item.sellPrice * item.quantity).toLocaleString()} {currency.symbol}</Text>
                      <TouchableOpacity onPress={() => setCartItems((prev: CartItem[]) => prev.filter((i: CartItem) => i.id !== item.id))}>
                        <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))}

                <View style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 10,
                  paddingTop: 10,
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: isDark ? '#333' : '#eee',
                }}>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
                    onPress={handleShareReceipt}
                  >
                    <Ionicons name="share-outline" size={16} color={Colors.primary} />
                    <Text style={{ color: Colors.primary, fontSize: 14 }}>
                      {t('addSale.shareReceipt')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
                    onPress={handleSave}
                  >
                    <Text style={{ color: Colors.primary, fontSize: 14, fontWeight: '700' }}>
                      {t('addSale.checkoutAction')}
                    </Text>
                    <Ionicons name="arrow-forward-outline" size={16} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

      {/* Форма */}
      <View style={[styles.form, themeStyles.card]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
          <Text style={[styles.sectionTitle, themeStyles.text, { marginBottom: 0 }]}>{t('addSale.formTitle')}</Text>
          {isFormDirty && (
            <TouchableOpacity
              onPress={handleClearForm}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close-circle-outline" size={16} color="#888" />
              <Text style={{ fontSize: 13, color: '#888' }}>{t('addSale.clearForm')}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[styles.label, themeStyles.text]}>{t('addSale.productName')} *</Text>
          {productName && !selectedProduct && (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>{t('addSale.newProductBadge')}</Text>
            </View>
          )}
        </View>
        <ProductAutocomplete
          ref={productInputRef}
          inputStyle={[styles.input, themeStyles.input]}
          placeholder={t('addSale.productPlaceholder')}
          placeholderTextColor={isDark ? '#888' : '#aaa'}
          value={productName}
          onChange={(text) => {
            setProductName(text);
            setSelectedProduct(null);
            setSalePricePlaceholder(null);
            setAmbiguousCandidates([]);
          }}
          onSelect={(product) => {
            setProductName(product.name);
            setBuyPrice(String(product.purchasePrice));
            setSellPrice(''); // Reset entered price
            setSalePricePlaceholder(product.lastSalePrice);
            setSelectedProduct(product);
            setAmbiguousCandidates([]);
            setTimeout(() => getSubmitHandler(0)(), 100);
          }}
          returnKeyType={getReturnKeyType(0)}
          onSubmitEditing={getSubmitHandler(0)}
        />

        {ambiguousCandidates.length > 0 && !selectedProduct && (
          <VariantPicker
            candidates={ambiguousCandidates}
            isDark={isDark}
            onSelect={(product) => {
              setSelectedProduct(product);
              setAmbiguousCandidates([]);
            }}
          />
        )}

        {selectedProduct !== null && selectedProduct.color && selectedProduct.color !== '' && (
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginTop: 4,
            marginLeft: 2,
          }}>
            <ColorCircle
              size={14}
              hex={getColorHex(selectedProduct.color) ?? '#BDBDBD'}
            />
            <Text style={{ fontSize: 12, color: '#888' }}>
              {selectedProduct.color}
            </Text>
          </View>
        )}

        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={[styles.label, themeStyles.text]}>{t('addSale.sellPrice')} *</Text>
            <TextInput
              ref={sellPriceRef}
              style={[styles.input, themeStyles.input]}
              placeholder={salePricePlaceholder ? `${salePricePlaceholder.toLocaleString()} ${currency.symbol}` : '0'}
              placeholderTextColor={isDark ? '#888' : '#aaa'}
              keyboardType="numeric"
              value={sellPrice}
              onChangeText={setSellPrice}
              returnKeyType={getReturnKeyType(1)}
              onSubmitEditing={getSubmitHandler(1)}
              blurOnSubmit={false}
            />
          </View>
          {isOwner && (
            <View style={styles.halfField}>
              <Text style={[styles.label, themeStyles.text]}>{t('addSale.buyPrice')} *</Text>
              {maskBuyPrice && selectedProduct ? (
                <TouchableOpacity
                  style={[styles.input, themeStyles.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                  onPress={() => {
                    setMaskBuyPrice(false);
                    setTimeout(() => setMaskBuyPrice(true), 2500);
                  }}
                >
                  <Text style={themeStyles.text}>•••• {currency.symbol}</Text>
                  <Ionicons name="eye-outline" size={18} color="#888" />
                </TouchableOpacity>
              ) : (
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
              )}
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[styles.label, themeStyles.text]}>{t('addSale.quantity')}</Text>
          {selectedProduct?.has_packages === 1 && selectedProduct?.is_continuous !== 1 && (
            <View style={styles.unitToggle}>
              <TouchableOpacity
                onPress={() => setUnitType('base')}
                style={[styles.unitBtn, unitType === 'base' && styles.unitBtnActive]}
              >
                <Text style={[styles.unitBtnText, unitType === 'base' && styles.unitBtnTextActive]}>
                  {selectedProduct.base_unit}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setUnitType('package')}
                style={[styles.unitBtn, unitType === 'package' && styles.unitBtnActive]}
              >
                <Text style={[styles.unitBtnText, unitType === 'package' && styles.unitBtnTextActive]}>
                  {selectedProduct.package_name}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View>
          <TextInput
            ref={quantityInputRef}
            style={[styles.input, themeStyles.input]}
            placeholder={selectedProduct?.is_continuous === 1 ? String(selectedProduct.units_per_package || '1') : '1'}
            placeholderTextColor={isDark ? '#888' : '#aaa'}
            keyboardType="numeric"
            value={quantity}
            onChangeText={setQuantity}
            returnKeyType={getReturnKeyType(3)}
            onSubmitEditing={getSubmitHandler(3)}
            blurOnSubmit={false}
          />
          {selectedProduct?.has_packages === 1 && selectedProduct?.is_continuous !== 1 && quantity !== '' && (
            <Text style={styles.quantityHint}>
              {unitType === 'package'
                ? `≈ ${(parseFloat(quantity) || 0) * (selectedProduct.units_per_package || 1)} ${selectedProduct.base_unit}`
                : `≈ ${((parseFloat(quantity) || 0) / (selectedProduct.units_per_package || 1)).toFixed(2)} ${selectedProduct.package_name}`
              }
            </Text>
          )}
          {selectedProduct?.stock !== undefined && (parseFloat(quantity) || 0) > selectedProduct.stock && (
            <Text style={styles.lowStockWarning}>
              {t('addSale.lowStockWarning', { stock: selectedProduct.stock })}
            </Text>
          )}
        </View>

        {showNoteInput || note !== '' ? (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={[styles.label, themeStyles.text, { marginTop: 0 }]}>{t('addSale.note')}</Text>
              <TouchableOpacity onPress={() => { setNote(''); setShowNoteInput(false); }}>
                <Ionicons name="close-circle-outline" size={18} color="#888" />
              </TouchableOpacity>
            </View>
            <TextInput
              ref={noteRef}
              style={[styles.input, styles.inputMultiline, themeStyles.input]}
              placeholder={t('addSale.notePlaceholder')}
              placeholderTextColor={isDark ? '#888' : '#aaa'}
              value={note}
              onChangeText={setNote}
              multiline
              returnKeyType={getReturnKeyType(4)}
              onSubmitEditing={getSubmitHandler(4)}
              blurOnSubmit={true}
              autoFocus={showNoteInput}
              onBlur={() => {
                if (note === '') setShowNoteInput(false);
              }}
            />
          </View>
        ) : (
          <TouchableOpacity onPress={() => setShowNoteInput(true)} style={styles.noteLink}>
            <Text style={styles.noteLinkText}>📝 {t('addSale.note')}</Text>
          </TouchableOpacity>
        )}

    {/* Payment type selector */}
    <View style={styles.paymentSection}>
      {contextSellerMode !== 'wholesale' && !showDebtOptions && (
        <TouchableOpacity
          style={{ alignSelf: 'flex-end', paddingVertical: 4 }}
          onPress={() => {
            setShowDebtOptions(true);
            setPaymentType('debt');
          }}
        >
          <Text style={{ color: Colors.primary, fontSize: 13 }}>
            {t('addSale.debtLink')}
          </Text>
        </TouchableOpacity>
      )}

      {(contextSellerMode === 'wholesale' || showDebtOptions) && (
        <View>
          {contextSellerMode === 'wholesale' ? (
            <>
              <Text style={[styles.label, themeStyles.text]}>{t('addSale.paymentLabel')}</Text>
              <View style={styles.paymentRow}>
                {(['full', 'partial', 'debt'] as const).map((type) => {
                  const labels = {
                    full: t('addSale.paymentFull'),
                    partial: t('addSale.paymentPartial'),
                    debt: t('addSale.paymentDebt')
                  };
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.paymentBtn,
                        isDark ? styles.paymentBtnDark : styles.paymentBtnLight,
                        paymentType === type && styles.paymentBtnActive,
                      ]}
                      onPress={() => {
                        setPaymentType(type);
                        if (type === 'full') setShowDebtOptions(false);
                      }}
                    >
                      <Text style={[
                        styles.paymentBtnText,
                        paymentType === type && styles.paymentBtnTextActive,
                      ]}>
                        {labels[type]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : (
            <View style={styles.paymentRow}>
              {(['partial', 'debt'] as const).map((type) => {
                const labels = {
                  partial: t('addSale.paymentPartial'),
                  debt:    t('addSale.paymentDebt'),
                };
                return (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.paymentBtn,
                      isDark ? styles.paymentBtnDark : styles.paymentBtnLight,
                      paymentType === type && styles.paymentBtnActive,
                    ]}
                    onPress={() => setPaymentType(type)}
                  >
                    <Text style={[
                      styles.paymentBtnText,
                      paymentType === type && styles.paymentBtnTextActive,
                    ]}>
                      {labels[type]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {paymentType === 'full' && contextSellerMode === 'wholesale' && (
            <View style={{ marginTop: Spacing.md }}>
              {showFullClient ? (
                <ClientAutocomplete
                  value={clientName}
                  phone={clientPhone}
                  onChange={setClientName}
                  onChangePhone={setClientPhone}
                  onSelect={(c) => {
                    setClientName(c.name);
                    setClientPhone(c.phone);
                    setClientId(c.id);
                  }}
                />
              ) : (
                <TouchableOpacity onPress={() => setShowFullClient(true)} style={styles.addClientBtn}>
                  <Ionicons name="person-outline" size={18} color={Colors.primary} />
                  <Text style={styles.addClientBtnText}>{t('addSale.addClientOptional')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {paymentType === 'partial' && (
            <TextInput
              style={[styles.input, themeStyles.input, { marginTop: 8 }]}
              placeholder={t('addSale.paidNowPlaceholder')}
              placeholderTextColor={isDark ? '#888' : '#aaa'}
              keyboardType="numeric"
              value={paidAmount}
              onChangeText={setPaidAmount}
            />
          )}

          {(paymentType === 'partial' || paymentType === 'debt') && (
            <View style={{ marginTop: 8, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[{ fontSize: FontSize.sm, color: '#888', minWidth: 40 }]}>
                  {t('addSale.dueDateLabel')}
                </Text>
                <TextInput
                  style={[styles.input, themeStyles.input, { flex: 1 }]}
                  placeholder="ДД.ММ.ГГГГ"
                  placeholderTextColor={isDark ? '#888' : '#aaa'}
                  keyboardType="numeric"
                  value={dueDate}
                  onChangeText={handleDueDateChange}
                  maxLength={10}
                />
                <TouchableOpacity
                  onPress={() => setShowDatePicker(true)}
                  style={{ padding: 10, backgroundColor: isDark ? '#2C2C2E' : '#F2F2F7', borderRadius: 10 }}
                >
                  <Ionicons name="calendar-outline" size={22} color={isDark ? '#fff' : '#333'} />
                </TouchableOpacity>
              </View>

              {showDatePicker && (
                <DateTimePicker
                  value={(() => {
                    if (!dueDate) return new Date();
                    const [d, m, y] = dueDate.split('.').map(Number);
                    if (d && m && y && y > 1000) {
                      return new Date(y, m - 1, d);
                    }
                    return new Date();
                  })()}
                  mode="date"
                  display="default"
                  minimumDate={new Date()}
                  onChange={(event: any, selectedDate?: Date) => {
                    setShowDatePicker(false);
                    if (selectedDate) {
                      const d = selectedDate.getDate().toString().padStart(2, '0');
                      const m = (selectedDate.getMonth() + 1).toString().padStart(2, '0');
                      const y = selectedDate.getFullYear();
                      setDueDate(`${d}.${m}.${y}`);
                    }
                  }}
                />
              )}

              <ClientAutocomplete
                value={clientName}
                phone={clientPhone}
                onChange={setClientName}
                onChangePhone={setClientPhone}
                onSelect={(c) => {
                  setClientName(c.name);
                  setClientPhone(c.phone);
                  setClientId(c.id);
                }}
              />
            </View>
          )}

          {contextSellerMode !== 'wholesale' && showDebtOptions && (
            <TouchableOpacity
              onPress={() => {
                setShowDebtOptions(false);
                setPaymentType('full');
              }}
              style={{ marginTop: 6, alignSelf: 'flex-start' }}
            >
              <Text style={{ color: '#999', fontSize: 12 }}>
                ✕ {t('addSale.paymentFull')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>

        {/* Предварительный расчёт */}
        {(sellPrice || salePricePlaceholder) && (buyPrice || isSeller) ? (
          <View style={[styles.preview, themeStyles.preview]}>
            <Text style={styles.previewTitle}>{t('addSale.previewTitle')}</Text>
            <View style={styles.previewRow}>
              <Text style={[styles.previewLabel, themeStyles.text]}>{t('common.revenue')}:</Text>
              <Text style={[styles.previewValue, themeStyles.text]}>
                {(parseFloat(sellPrice || String(salePricePlaceholder)) * (parseFloat(quantity) || 1)).toLocaleString()} {currency.symbol}
              </Text>
            </View>
            {isOwner && (
              <View style={styles.previewRow}>
                <Text style={[styles.previewLabel, themeStyles.text]}>{t('common.profit')}:</Text>
                <Text style={[styles.previewValue, { color: '#1D9E75' }]}>
                  {((parseFloat(sellPrice || String(salePricePlaceholder)) - parseFloat(buyPrice)) * (parseFloat(quantity) || 1)).toLocaleString()} {currency.symbol}
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {cartItems.length > 0 && (
          <View style={styles.runningTotal}>
            <Text style={[styles.runningTotalText, themeStyles.text]}>
              {t('addSale.cartTotal', { total: cartTotal.toLocaleString(), symbol: currency.symbol, count: cartItems.length })}
            </Text>
          </View>
        )}

        <View
          style={styles.actionsRowContainer}
          onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
        >
          <Animated.View
            style={[styles.remainingActionsRow, { opacity: otherButtonsOpacity }]}
            pointerEvents={capsuleState === 'idle' ? 'auto' : 'none'}
          >
            {/* Leftmost spacer for the capsule */}
            <View style={{ width: 56 }} />

            <TouchableOpacity
              style={[styles.saveBtn, { flex: 1 }, isSaved && { backgroundColor: '#1D9E75' }]}
              onPress={handleSave}
              activeOpacity={0.8}
            >
              <Ionicons
                name={isSaved ? 'checkmark-circle' : 'checkmark'}
                size={20}
                color="#fff"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.saveBtnText} numberOfLines={1}>
                {cartItems.length > 0
                  ? t('addSale.checkoutBtn', { total: cartTotal.toLocaleString(), symbol: currency.symbol })
                  : (isSaved ? t('common.saved') : t('addSale.saveBtn'))
                }
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.addToCartBtn}
              onPress={addToCart}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={30} color="#fff" />
            </TouchableOpacity>
          </Animated.View>

          {/* Absolute VoiceCapsule on the left expanding rightward */}
          <View style={styles.capsuleAbsoluteContainer}>
            <VoiceCapsule
              rowWidth={rowWidth}
              onStateChange={setCapsuleState}
              onResult={handleVoiceResult}
              onShowBatchReview={(res) => setVoiceResult(res)}
              resetCapsuleTrigger={resetCapsuleTrigger}
            />
          </View>
        </View>
      </View>

            {/* Успешно сохранено */}
            {lastSaved && (
              <View style={[styles.successCard, themeStyles.successCard]}>
                {/* Шапка: заголовок + кнопка шеринга */}
                <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
                  <Text style={styles.successTitle}>✅ {t('common.saved')}</Text>
                  {lastSaved.shareText && (
                    <TouchableOpacity
                      onPress={async () => {
                        Keyboard.dismiss();
                        await new Promise(r => setTimeout(r, 150));
                        try {
                          await Share.share({
                            message: lastSaved!.shareText!,
                            title: shopName || t('addSale.receiptTotal'),
                          });
                        } catch (_) {}
                      }}
                      hitSlop={{ top:8, bottom:8, left:8, right:8 }}
                    >
                      <Ionicons name="share-outline" size={20} color={Colors.primary} />
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={[styles.successText, themeStyles.text]}>{lastSaved.name}</Text>
                <Text style={[styles.successText, themeStyles.text]}>{t('common.revenue')}: {lastSaved.revenue} {currency.symbol}</Text>
                {isOwner && <Text style={styles.successProfit}>{t('common.profit')}: +{lastSaved.profit} {currency.symbol}</Text>}
              </View>
            )}
          </ScrollView>
      </View>
    </Animated.View>
  );
}

const lightStyles = StyleSheet.create({
  container: { backgroundColor: LightTheme.background },
  card: { backgroundColor: LightTheme.card },
  text: { color: LightTheme.text },
  voiceResult: { backgroundColor: '#F8F8F8' },
  input: { backgroundColor: LightTheme.inputBg, borderColor: LightTheme.inputBorder },
  successCard: { backgroundColor: Colors.primaryLight },
  preview: { backgroundColor: Colors.primaryLight },
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: DarkTheme.background },
  card: { backgroundColor: DarkTheme.card },
  text: { color: DarkTheme.text },
  voiceResult: { backgroundColor: '#2C2C2C' },
  input: { backgroundColor: DarkTheme.inputBg, borderColor: DarkTheme.inputBorder, color: DarkTheme.text },
  successCard: { backgroundColor: '#16332A' },
  preview: { backgroundColor: '#16332A' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: Radius.xl,
    padding: Spacing.xs,
    height: 46,
  },
  segmentedControlLight: {
    backgroundColor: LightTheme.card,
    borderWidth: 1,
    borderColor: LightTheme.border,
  },
  segmentedControlDark: {
    backgroundColor: DarkTheme.background,
    borderWidth: 1,
    borderColor: DarkTheme.border,
  },
  tabBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.xl,
  },
  tabBtnActive: {
    backgroundColor: Colors.primary,
    ...Shadow.md,
  },
  tabText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: '#666',
  },
  tabTextActive: {
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  voiceBar: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    paddingBottom: 40,
    ...Shadow.lg,
  },
  voiceBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  voiceBarTitle: {
    fontSize: FontSize.lg,
    fontWeight: 'bold',
  },
  closeBtn: {
    padding: Spacing.xs,
  },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '600', marginBottom: Spacing.md },
  voiceResult: { marginTop: Spacing.md, padding: Spacing.md, borderRadius: Radius.sm },
  voiceResultLabel: { fontSize: FontSize.sm, color: '#999', marginBottom: Spacing.xs },
  voiceResultText: { fontSize: FontSize.md, fontStyle: 'italic' },
  processingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  processingText: { fontSize: FontSize.md, color: Colors.primary },
  form: {
    margin: Spacing.lg, marginTop: 0,
    borderRadius: Radius.lg, padding: Spacing.lg,
    ...Shadow.md,
  },
  label: { fontSize: FontSize.md - 1, marginBottom: Spacing.sm, marginTop: Spacing.md },
  input: {
    borderRadius: Radius.sm, padding: Spacing.md,
    fontSize: FontSize.lg - 1, borderWidth: 1,
  },
  inputMultiline: { height: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: Spacing.md },
  halfField: { flex: 1 },
  preview: {
    marginTop: Spacing.lg, padding: Spacing.lg - 2,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary,
  },
  previewTitle: { fontSize: FontSize.md - 1, fontWeight: '600', color: Colors.primary, marginBottom: Spacing.sm },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.xs },
  previewLabel: { fontSize: FontSize.md },
  previewValue: { fontSize: FontSize.md, fontWeight: '600' },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    padding: Spacing.lg, alignItems: 'center',
    ...Shadow.md,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: FontSize.lg, fontWeight: 'bold' },
  autocomplete: {
    borderWidth: 1, borderColor: '#E0E0E0', borderRadius: Radius.sm,
    marginTop: Spacing.xs, overflow: 'hidden',
  },
  autocompleteItem: {
    padding: Spacing.md, borderBottomWidth: 0.5, borderBottomColor: '#EEE',
  },
  successCard: {
    margin: Spacing.lg, marginTop: 0,
    borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.primary,
  },
  successTitle: { fontSize: FontSize.lg, fontWeight: 'bold', color: Colors.primary, marginBottom: Spacing.sm },
  successText: { fontSize: FontSize.md, marginBottom: Spacing.xs },
  cartContainer: {
    margin: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    ...Shadow.sm,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  cartItemName: {
    fontSize: FontSize.md,
    fontWeight: '500',
  },
  cartItemDetails: {
    fontSize: FontSize.sm,
    color: '#888',
    marginTop: 2,
  },
  cartItemTotal: {
    fontSize: FontSize.md,
    fontWeight: '600',
    marginBottom: 4,
  },
  newBadge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  newBadgeText: {
    fontSize: 10,
    color: '#2196F3',
    fontWeight: 'bold',
  },
  noteLink: {
    paddingVertical: Spacing.sm,
  },
  noteLinkText: {
    color: Colors.primary,
    fontSize: FontSize.md,
  },
  addClientBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.xs,
  },
  addClientBtnText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  runningTotal: {
    marginTop: Spacing.lg,
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  runningTotalText: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xl,
    alignItems: 'center',
  },
  actionsRowContainer: {
    position: 'relative',
    width: '100%',
    minHeight: 56,
    marginTop: Spacing.xl,
    justifyContent: 'center',
  },
  remainingActionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
    alignItems: 'center',
  },
  capsuleAbsoluteContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 10,
    justifyContent: 'center',
  },
  addToCartBtn: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.md,
  },
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: '#F2F2F7',
    borderRadius: Radius.md,
    padding: 2,
    marginTop: Spacing.md,
  },
  unitBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  unitBtnActive: {
    backgroundColor: '#fff',
    ...Shadow.sm,
  },
  unitBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: '#8E8E93',
  },
  unitBtnTextActive: {
    color: '#000',
  },
  quantityHint: {
    fontSize: FontSize.xs,
    color: '#888',
    marginTop: 4,
    marginLeft: 4,
  },
  lowStockWarning: {
    fontSize: FontSize.xs,
    color: '#FF9500',
    marginTop: 4,
    marginLeft: 4,
  },
  successProfit: { fontSize: FontSize.lg, fontWeight: 'bold', color: Colors.primary, marginTop: Spacing.xs },
  paymentSection: {
    marginTop: Spacing.md,
  },
  paymentRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  paymentBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.sm,
    alignItems: 'center',
    borderWidth: 1,
  },
  paymentBtnLight: { backgroundColor: LightTheme.background, borderColor: LightTheme.inputBorder },
  paymentBtnDark:  { backgroundColor: DarkTheme.inputBg, borderColor: DarkTheme.inputBorder },
  paymentBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  paymentBtnText: { fontSize: FontSize.sm, fontWeight: '500', color: '#666' },
  paymentBtnTextActive: { color: '#fff' },
});
