import { useEffect, useState, useMemo, useRef } from 'react';
import { useRoute, useNavigation } from '@react-navigation/native';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator, Animated, Modal, TouchableWithoutFeedback, Easing
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { addSale, addSaleWithSeller, getProducts, upsertClient, addDebt, updateDebtNotificationId } from '../db/database';
import { scheduleDebtReminder } from '../utils/notifications';
import { toISODate } from '../utils/dateUtils';
import { analyticsService } from '../services/analyticsService';
import { reviewService } from '../services/reviewService';
import VoiceRecorder from '../components/VoiceRecorder';
import { useAppContext } from '../context/AppContext';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import ClientAutocomplete from '../components/debt/ClientAutocomplete';
import ExpensesView from '../components/expenses/ExpensesView';
import { ProductAutocomplete } from '../components/sales/ProductAutocomplete';
import { AutocompleteResult } from '../types/product';
import { Colors, LightTheme, DarkTheme, Radius, Shadow, FontSize, Spacing } from '../constants/theme';

const CACHE_TTL = 60 * 60 * 1000; // 1 час в мс

export default function AddSaleScreen(/* props */) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { resolvedTheme, currency, language, sellerMode: contextSellerMode } = useAppContext(); const isDark = resolvedTheme === "dark";
  const { isOwner, isSeller, sellerName, role } = useShop();
  const { user } = useAuth();
  const userId = user?._id || 'guest';

  const [selectedProduct, setSelectedProduct] = useState<AutocompleteResult | null>(null);
  const [productName, setProductName] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [salePricePlaceholder, setSalePricePlaceholder] = useState<number | null>(null);

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
  const [lastSaved, setLastSaved] = useState<{ name: string; profit: string; revenue: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'sales' | 'expenses'>('sales');
  const [showVoiceBar, setShowVoiceBar] = useState(false);
  const fadeAnim = useMemo(() => new Animated.Value(1), []);

  const [isSaved, setIsSaved] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

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


  const handleTranscript = (text: string) => {
    setVoiceText(text);
    if (text) analyzeWithAI(text);
  };

  const analyzeWithAI = async (text: string) => {
    const proxyUrl = process.env.EXPO_PUBLIC_ADS_API_URL;
    if (!proxyUrl) {
      Alert.alert(t('common.error'), t('addSale.errorGemini'));
      return;
    }

    const cacheKey = `ai_cache_${text.trim().toLowerCase()}`;

    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL) {
          console.log('Using cached Gemini response');
          applyAIResult(data);
          return;
        }
      }
    } catch (e) {
      console.warn('Cache read error', e);
    }

    setProcessing(true);
    analyticsService.logEvent('ai_usage', { type: 'voice_sale', language: language });
    try {
      const geminiResponse = await fetch(`${proxyUrl}/api/proxy/gemini`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Act as a professional retail assistant for merchants in Central Asia (Tajikistan/Uzbekistan).\nYour task is to accurately extract sales data from voice transcripts.\n\nTRANSCRIPT: "${text}"\n\nRULES:\n1. Identify product name, sale price (sell_price), purchase price (buy_price), and quantity.\n2. If the user mentions total "revenue" (выручка/савдо) and "profit" (прибыль/фоида), include them.\n3. Handle multilingual input (Russian, Tajik, Uzbek).\n4. Return ONLY a pure JSON object. No markdown, no explanations.\n\nJSON STRUCTURE:\n{\n  "product_name": string (capitalized),\n  "sell_price": number (0 if unknown),\n  "buy_price": number (0 if unknown),\n  "quantity": number (1 if unknown),\n  "revenue": number (0 if unknown),\n  "profit": number (0 if unknown)\n}` }] }]
        }),
      });

      if (!geminiResponse.ok) {
        throw new Error(`Proxy error: ${geminiResponse.status}`);
      }
      const data = await geminiResponse.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim());

      // Сохраняем в кеш
      try {
        await AsyncStorage.setItem(cacheKey, JSON.stringify({
          data: parsed,
          timestamp: Date.now()
        }));
      } catch (e) {
        console.warn('Cache write error', e);
      }

      applyAIResult(parsed);
    } catch (e) {
      Alert.alert(t('common.error'), t('addSale.errorAI'));
    } finally {
      setProcessing(false);
    }
  };

  const applyAIResult = (parsed: { product_name: string; sell_price: number; buy_price: number; quantity: number; revenue: number; profit: number }) => {
    if (parsed.product_name) setProductName(parsed.product_name);
    if (parsed.sell_price > 0) setSellPrice(String(parsed.sell_price));
    if (parsed.buy_price > 0) setBuyPrice(String(parsed.buy_price));
    if (parsed.quantity > 0) setQuantity(String(parsed.quantity));

    if (parsed.revenue > 0 && parsed.profit > 0 && parsed.sell_price === 0) {
      const qty = parsed.quantity > 0.01 ? parsed.quantity : 1;
      const calcBuy = (parsed.revenue - parsed.profit) / qty;
      setSellPrice(String(parsed.revenue / qty));
      setBuyPrice(String(Math.max(0, calcBuy)));
      setProductName(parsed.product_name || t('addSale.defaultProductName'));
    }
  };

  const handleSave = async () => {
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
    const qty = parseFloat(quantity) || 1;

    if (contextSellerMode === 'wholesale' && paymentType !== 'full' && !clientName.trim()) {
      Alert.alert(t('common.error'), t('addSale.errorClientName'));
      return;
    }

    const saleId = addSaleWithSeller(
      selectedProduct?.id ? parseInt(selectedProduct.id) : null,
      productName.trim(),
      qty,
      sPrice,
      bPrice,
      note,
      userId,
      sellerName || user?.name || 'Продавец',
      role || 'owner'
    ) as any;

    // Handle debt
    if (paymentType !== 'full' && clientName.trim()) {
      const resolvedClientId = upsertClient(clientName.trim(), clientPhone.trim());
      const paid = paymentType === 'partial' ? (parseFloat(paidAmount) || 0) : 0;
      const totalDebt = sPrice * qty;
      const isoDueDate = toISODate(dueDate) || '';
      const debtResult = addDebt(resolvedClientId, saleId?.lastInsertRowId ?? null, totalDebt, paid, '', isoDueDate) as any;

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

    const profit = (sPrice - bPrice) * qty;

    analyticsService.logEvent('sale_added', {
      product_id: selectedProduct?.id || 'none',
      quantity: qty,
      profit: profit,
      revenue: sPrice * qty,
      payment_type: paymentType,
    });
    reviewService.incrementSalesAndCheck();

    setLastSaved({
      name: productName,
      profit: profit.toFixed(0),
      revenue: (sPrice * qty).toFixed(0),
    });

    setProductName(''); setSellPrice(''); setBuyPrice('');
    setQuantity(''); setNote(''); setVoiceText('');
    setSelectedProduct(null); setSalePricePlaceholder(null);
    setPaymentType('full'); setPaidAmount(''); setDueDate('');
    setClientName(''); setClientPhone(''); setClientId(null);

    triggerSaveAnimation();
  };

  const themeStyles = isDark ? darkStyles : lightStyles;


  const switchTab = (tab: 'sales' | 'expenses') => {
    if (tab === activeTab) return;

    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setActiveTab(tab);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    });
  };

  return (
    <Animated.View style={[
      styles.container,
      themeStyles.container,
      { transform: [{ scale: scaleAnim }], opacity: opacityAnim }
    ]}>
      {/* Voice Floating Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowVoiceBar(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="mic" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Voice Input Modal (Bottom Bar) */}
      <Modal
        visible={showVoiceBar}
        transparent
        animationType="slide"
        onRequestClose={() => setShowVoiceBar(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowVoiceBar(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.voiceBar, themeStyles.card]}>
                <View style={styles.voiceBarHeader}>
                  <Text style={[styles.voiceBarTitle, themeStyles.text]}>{t('addSale.voiceTitle')}</Text>
                  <TouchableOpacity onPress={() => setShowVoiceBar(false)} style={styles.closeBtn}>
                    <Ionicons name="close" size={24} color={isDark ? '#eee' : '#333'} />
                  </TouchableOpacity>
                </View>

                <VoiceRecorder
                  onTranscript={(text) => {
                    handleTranscript(text);
                    // Мы не закрываем автоматически, чтобы пользователь видел результат AI
                  }}
                />

                {voiceText ? (
                  <View style={[styles.voiceResult, themeStyles.voiceResult]}>
                    <Text style={styles.voiceResultLabel}>{t('addSale.recognized')}:</Text>
                    <Text style={[styles.voiceResultText, themeStyles.text]}>"{voiceText}"</Text>
                  </View>
                ) : null}

                {processing && (
                  <View style={styles.processingRow}>
                    <ActivityIndicator size="small" color="#1D9E75" />
                    <Text style={styles.processingText}>{t('addSale.aiProcessing')}</Text>
                  </View>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Tab Switcher */}
      <View style={styles.tabContainer}>
        <View style={[styles.segmentedControl, isDark ? styles.segmentedControlDark : styles.segmentedControlLight]}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'sales' && styles.tabBtnActive]}
            onPress={() => switchTab('sales')}
          >
            <Text style={[styles.tabText, activeTab === 'sales' && styles.tabTextActive]}>
              {t('home.salesCount')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'expenses' && styles.tabBtnActive]}
            onPress={() => switchTab('expenses')}
          >
            <Text style={[styles.tabText, activeTab === 'expenses' && styles.tabTextActive]}>
              {t('tabs.expenses')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {activeTab === 'sales' ? (
          <ScrollView keyboardShouldPersistTaps="handled">
      {/* Форма */}
      <View style={[styles.form, themeStyles.card]}>
        <Text style={[styles.sectionTitle, themeStyles.text]}>{t('addSale.formTitle')}</Text>

        <Text style={[styles.label, themeStyles.text]}>{t('addSale.productName')} *</Text>
        <ProductAutocomplete
          inputStyle={[styles.input, themeStyles.input]}
          placeholder={t('addSale.productPlaceholder')}
          placeholderTextColor={isDark ? '#888' : '#aaa'}
          value={productName}
          onChange={(text) => {
            setProductName(text);
            setSelectedProduct(null);
            setSalePricePlaceholder(null);
          }}
          onSelect={(product) => {
            setProductName(product.name);
            setBuyPrice(String(product.purchasePrice));
            setSellPrice(''); // Reset entered price
            setSalePricePlaceholder(product.lastSalePrice);
            setSelectedProduct(product);
            setTimeout(() => quantityInputRef.current?.focus(), 100);
          }}
        />

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
              returnKeyType="next"
              onSubmitEditing={() => isOwner ? buyPriceRef.current?.focus() : quantityInputRef.current?.focus()}
              blurOnSubmit={false}
            />
          </View>
          {isOwner && (
            <View style={styles.halfField}>
              <Text style={[styles.label, themeStyles.text]}>{t('addSale.buyPrice')} *</Text>
              <TextInput
                ref={buyPriceRef}
                style={[styles.input, themeStyles.input]}
                placeholder="0"
                placeholderTextColor={isDark ? '#888' : '#aaa'}
                keyboardType="numeric"
                value={buyPrice}
                onChangeText={setBuyPrice}
                returnKeyType="next"
                onSubmitEditing={() => quantityInputRef.current?.focus()}
                blurOnSubmit={false}
              />
            </View>
          )}
        </View>

        <Text style={[styles.label, themeStyles.text]}>{t('addSale.quantity')}</Text>
        <TextInput
          ref={quantityInputRef}
          style={[styles.input, themeStyles.input]}
          placeholder="1"
          placeholderTextColor={isDark ? '#888' : '#aaa'}
          keyboardType="numeric"
          value={quantity}
          onChangeText={setQuantity}
          returnKeyType="next"
          onSubmitEditing={() => noteRef.current?.focus()}
          blurOnSubmit={false}
        />

        <Text style={[styles.label, themeStyles.text]}>{t('addSale.note')}</Text>
        <TextInput
          ref={noteRef}
          style={[styles.input, styles.inputMultiline, themeStyles.input]}
          placeholder={t('addSale.notePlaceholder')}
          placeholderTextColor={isDark ? '#888' : '#aaa'}
          value={note}
          onChangeText={setNote}
          multiline
          returnKeyType="done"
          blurOnSubmit={true}
        />

    {/* Payment type selector — shown only in wholesale mode */}
    {contextSellerMode === 'wholesale' && (
      <View style={styles.paymentSection}>
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
                onChange={(event, selectedDate) => {
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
      </View>
    )}

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

        <TouchableOpacity
          style={[styles.saveBtn, isSaved && { backgroundColor: '#1D9E75' }]}
          onPress={handleSave}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isSaved ? 'checkmark-circle' : 'checkmark'}
            size={20}
            color="#fff"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.saveBtnText}>
            {isSaved ? t('common.saved') : t('addSale.saveBtn')}
          </Text>
        </TouchableOpacity>
      </View>

            {/* Успешно сохранено */}
            {lastSaved && (
              <View style={[styles.successCard, themeStyles.successCard]}>
                <Text style={styles.successTitle}>✅ {t('common.saved')}</Text>
                <Text style={[styles.successText, themeStyles.text]}>{lastSaved.name}</Text>
                <Text style={[styles.successText, themeStyles.text]}>{t('common.revenue')}: {lastSaved.revenue} {currency.symbol}</Text>
                {isOwner && <Text style={styles.successProfit}>{t('common.profit')}: +{lastSaved.profit} {currency.symbol}</Text>}
              </View>
            )}
          </ScrollView>
        ) : (
          <ExpensesView />
        )}
      </Animated.View>
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
  fab: {
    position: 'absolute',
    bottom: 24, right: 24,
    width: 60, height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
    zIndex: 999,
    ...Shadow.lg,
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
    padding: Spacing.lg, alignItems: 'center', marginTop: Spacing.xl,
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
