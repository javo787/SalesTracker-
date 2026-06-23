import { useEffect, useState, useMemo, useRef } from 'react';
import { useRoute, useNavigation } from '@react-navigation/native';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator, Animated, Modal, TouchableWithoutFeedback
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { addSale, getProducts, upsertClient, addDebt } from '../db/database';
import { analyticsService } from '../services/analyticsService';
import { reviewService } from '../services/reviewService';
import VoiceRecorder from '../components/VoiceRecorder';
import { useAppContext } from '../context/AppContext';
import ClientAutocomplete from '../components/debt/ClientAutocomplete';
import GeminiApi from '../utils/geminiApi';
import ExpensesView from '../components/expenses/ExpensesView';
import { ProductAutocomplete } from '../components/sales/ProductAutocomplete';
import { AutocompleteResult } from '../types/product';

const CACHE_TTL = 60 * 60 * 1000; // 1 час в мс

export default function AddSaleScreen(/* props */) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { resolvedTheme, currency, language, sellerMode } = useAppContext(); const isDark = resolvedTheme === "dark";

  const gemini = useMemo(() => {
    const keys = [
      process.env.EXPO_PUBLIC_GEMINI_KEY,
      process.env.EXPO_PUBLIC_GEMINI_KEY_2,
      process.env.EXPO_PUBLIC_GEMINI_KEY_3,
    ].filter(Boolean) as string[];
    return new GeminiApi({ geminiKeys: keys.length ? keys : [''] });
  }, []);

  const [selectedProduct, setSelectedProduct] = useState<AutocompleteResult | null>(null);
  const [productName, setProductName] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [salePricePlaceholder, setSalePricePlaceholder] = useState<number | null>(null);

  const [paymentType, setPaymentType] = useState<'full' | 'partial' | 'debt'>('full');
  const [paidAmount, setPaidAmount] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientId, setClientId] = useState<number | null>(null);

  const quantityInputRef = useRef<TextInput>(null);
  const [processing, setProcessing] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [lastSaved, setLastSaved] = useState<{ name: string; profit: string; revenue: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'sales' | 'expenses'>('sales');
  const [showVoiceBar, setShowVoiceBar] = useState(false);
  const fadeAnim = useMemo(() => new Animated.Value(1), []);

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
    if (!process.env.EXPO_PUBLIC_GEMINI_KEY) {
      Alert.alert(t('common.error'), 'Ключ Gemini API не настроен. Пожалуйста, проверьте файл .env');
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
      const data = await gemini.generateContent({
        contents: [{
          parts: [{
            text: `Act as a professional retail assistant for merchants in Central Asia (Tajikistan/Uzbekistan).
Your task is to accurately extract sales data from voice transcripts.

TRANSCRIPT: "${text}"

RULES:
1. Identify product name, sale price (sell_price), purchase price (buy_price), and quantity.
2. If the user mentions total "revenue" (выручка/савдо) and "profit" (прибыль/фоида), include them.
3. Handle multilingual input (Russian, Tajik, Uzbek).
4. Return ONLY a pure JSON object. No markdown, no explanations.

JSON STRUCTURE:
{
  "product_name": string (capitalized),
  "sell_price": number (0 if unknown),
  "buy_price": number (0 if unknown),
  "quantity": number (1 if unknown),
  "revenue": number (0 if unknown),
  "profit": number (0 if unknown)
}

FEW-SHOT EXAMPLES:
"сегодня савдо 5000 фоида 1200" -> {"product_name":"","sell_price":0,"buy_price":0,"quantity":1,"revenue":5000,"profit":1200}
"бист кило пиёз фурухтум бо дах сомони" -> {"product_name":"Пиёз","sell_price":10,"buy_price":0,"quantity":20,"revenue":200,"profit":0}
"продал 3 пачки чая по 15 купил по 11" -> {"product_name":"Чай","sell_price":15,"buy_price":11,"quantity":3,"revenue":45,"profit":12}
"десять коробок колы по 120 сомони" -> {"product_name":"Кола","sell_price":120,"buy_price":0,"quantity":10,"revenue":1200,"profit":0}
"якешба 50 сомон фоида монд" -> {"product_name":"","sell_price":0,"buy_price":0,"quantity":1,"revenue":0,"profit":50}`
          }]
        }]
      });
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
      Alert.alert(t('common.error'), 'Не удалось обработать. Введите вручную.');
    } finally {
      setProcessing(false);
    }
  };

  const applyAIResult = (parsed: { product_name: string; sell_price: number; buy_price: number; quantity: number; revenue: number; profit: number }) => {
    // Заполняем поля
    if (parsed.product_name) setProductName(parsed.product_name);
    if (parsed.sell_price > 0) setSellPrice(String(parsed.sell_price));
    if (parsed.buy_price > 0) setBuyPrice(String(parsed.buy_price));
    if (parsed.quantity > 0) setQuantity(String(parsed.quantity));

    // Если сказал общую выручку и прибыль — рассчитываем закупочную
    if (parsed.revenue > 0 && parsed.profit > 0 && parsed.sell_price === 0) {
      const calcBuy = (parsed.revenue - parsed.profit) / (parsed.quantity || 1);
      setSellPrice(String(parsed.revenue / (parsed.quantity || 1)));
      setBuyPrice(String(calcBuy));
      setProductName(parsed.product_name || 'Продажа дня');
    }
  };

  const handleSave = () => {
    if (!productName.trim()) {
      Alert.alert(t('common.error'), t('addSale.productPlaceholder'));
      return;
    }

    const finalSellPrice = sellPrice || (salePricePlaceholder ? String(salePricePlaceholder) : '');

    if (!finalSellPrice || !buyPrice) {
      Alert.alert(t('common.error'), 'Введите цену продажи и закупки');
      return;
    }

    const sPrice = parseFloat(finalSellPrice);
    const bPrice = parseFloat(buyPrice);
    const qty = parseFloat(quantity) || 1;

    if (sellerMode === 'wholesale' && paymentType !== 'full' && !clientName.trim()) {
      Alert.alert(t('common.error'), 'Введите имя клиента для записи долга');
      return;
    }

    const saleId = addSale(
      selectedProduct?.id ? parseInt(selectedProduct.id) : null,
      productName.trim(),
      qty,
      sPrice,
      bPrice,
      note
    ) as any;

    // Handle debt
    if (paymentType !== 'full' && clientName.trim()) {
      const resolvedClientId = upsertClient(clientName.trim(), clientPhone.trim());
      const paid = paymentType === 'partial' ? (parseFloat(paidAmount) || 0) : 0;
      const totalDebt = sPrice * qty;
      addDebt(resolvedClientId, saleId?.lastInsertRowId ?? null, totalDebt, paid);
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
    setPaymentType('full'); setPaidAmount('');
    setClientName(''); setClientPhone(''); setClientId(null);
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
    <View style={[styles.container, themeStyles.container]}>
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
              style={[styles.input, themeStyles.input]}
              placeholder={salePricePlaceholder ? `${salePricePlaceholder.toLocaleString()} ${currency.symbol}` : '0'}
              placeholderTextColor={isDark ? '#888' : '#aaa'}
              keyboardType="numeric"
              value={sellPrice}
              onChangeText={setSellPrice}
            />
          </View>
          <View style={styles.halfField}>
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
        />

        <Text style={[styles.label, themeStyles.text]}>{t('addSale.note')}</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline, themeStyles.input]}
          placeholder={t('addSale.notePlaceholder')}
          placeholderTextColor={isDark ? '#888' : '#aaa'}
          value={note}
          onChangeText={setNote}
          multiline
        />

    {/* Payment type selector — shown only in wholesale mode */}
    {sellerMode === 'wholesale' && (
      <View style={styles.paymentSection}>
        <Text style={[styles.label, themeStyles.text]}>Оплата</Text>
        <View style={styles.paymentRow}>
          {(['full', 'partial', 'debt'] as const).map((type) => {
            const labels = { full: '✅ Полностью', partial: '💰 Частично', debt: '📋 В долг' };
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
            placeholder="Внесено сейчас"
            placeholderTextColor={isDark ? '#888' : '#aaa'}
            keyboardType="numeric"
            value={paidAmount}
            onChangeText={setPaidAmount}
          />
        )}

        {(paymentType === 'partial' || paymentType === 'debt') && (
          <View style={{ marginTop: 8 }}>
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
        {(sellPrice || salePricePlaceholder) && buyPrice ? (
          <View style={[styles.preview, themeStyles.preview]}>
            <Text style={styles.previewTitle}>{t('addSale.previewTitle')}</Text>
            <View style={styles.previewRow}>
              <Text style={[styles.previewLabel, themeStyles.text]}>{t('common.revenue')}:</Text>
              <Text style={[styles.previewValue, themeStyles.text]}>
                {(parseFloat(sellPrice || String(salePricePlaceholder)) * (parseFloat(quantity) || 1)).toLocaleString()} {currency.symbol}
              </Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={[styles.previewLabel, themeStyles.text]}>{t('common.profit')}:</Text>
              <Text style={[styles.previewValue, { color: '#1D9E75' }]}>
                {((parseFloat(sellPrice || String(salePricePlaceholder)) - parseFloat(buyPrice)) * (parseFloat(quantity) || 1)).toLocaleString()} {currency.symbol}
              </Text>
            </View>
          </View>
        ) : null}

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>{t('addSale.saveBtn')}</Text>
        </TouchableOpacity>
      </View>

            {/* Успешно сохранено */}
            {lastSaved && (
              <View style={[styles.successCard, themeStyles.successCard]}>
                <Text style={styles.successTitle}>✅ {t('common.saved')}</Text>
                <Text style={[styles.successText, themeStyles.text]}>{lastSaved.name}</Text>
                <Text style={[styles.successText, themeStyles.text]}>{t('common.revenue')}: {lastSaved.revenue} {currency.symbol}</Text>
                <Text style={styles.successProfit}>{t('common.profit')}: +{lastSaved.profit} {currency.symbol}</Text>
              </View>
            )}
          </ScrollView>
        ) : (
          <ExpensesView />
        )}
      </Animated.View>
    </View>
  );
}

const lightStyles = StyleSheet.create({
  container: { backgroundColor: '#F5F5F5' },
  card: { backgroundColor: '#fff' },
  text: { color: '#333' },
  voiceResult: { backgroundColor: '#F8F8F8' },
  input: { backgroundColor: '#F5F5F5', borderColor: '#E0E0E0' },
  successCard: { backgroundColor: '#F0FBF7' },
  preview: { backgroundColor: '#F0FBF7' },
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: '#000' },
  card: { backgroundColor: '#1E1E1E' },
  text: { color: '#EEE' },
  voiceResult: { backgroundColor: '#2C2C2C' },
  input: { backgroundColor: '#2C2C2C', borderColor: '#444', color: '#EEE' },
  successCard: { backgroundColor: '#16332A' },
  preview: { backgroundColor: '#16332A' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 25,
    padding: 4,
    height: 46,
  },
  segmentedControlLight: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
  },
  segmentedControlDark: {
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: '#333',
  },
  tabBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 21,
  },
  tabBtnActive: {
    backgroundColor: '#1D9E75',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  tabTextActive: {
    color: '#fff',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1D9E75',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    zIndex: 999,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  voiceBar: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 10,
  },
  voiceBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  voiceBarTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeBtn: {
    padding: 4,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  voiceResult: { marginTop: 12, padding: 12, borderRadius: 8 },
  voiceResultLabel: { fontSize: 12, color: '#999', marginBottom: 4 },
  voiceResultText: { fontSize: 14, fontStyle: 'italic' },
  processingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  processingText: { fontSize: 14, color: '#1D9E75' },
  form: {
    margin: 16, marginTop: 0,
    borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
  },
  label: { fontSize: 13, marginBottom: 6, marginTop: 12 },
  input: {
    borderRadius: 8, padding: 12,
    fontSize: 15, borderWidth: 1,
  },
  inputMultiline: { height: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10 },
  halfField: { flex: 1 },
  preview: {
    marginTop: 16, padding: 14,
    borderRadius: 10, borderWidth: 1, borderColor: '#1D9E75',
  },
  previewTitle: { fontSize: 13, fontWeight: '600', color: '#1D9E75', marginBottom: 8 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  previewLabel: { fontSize: 14 },
  previewValue: { fontSize: 14, fontWeight: '600' },
  saveBtn: {
    backgroundColor: '#1D9E75', borderRadius: 12,
    padding: 16, alignItems: 'center', marginTop: 20,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  autocomplete: {
    borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 8,
    marginTop: 4, overflow: 'hidden'
  },
  autocompleteItem: {
    padding: 12, borderBottomWidth: 0.5, borderBottomColor: '#EEE'
  },
  successCard: {
    margin: 16, marginTop: 0,
    borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#1D9E75',
  },
  successTitle: { fontSize: 16, fontWeight: 'bold', color: '#1D9E75', marginBottom: 8 },
  successText: { fontSize: 14, marginBottom: 4 },
  successProfit: { fontSize: 16, fontWeight: 'bold', color: '#1D9E75', marginTop: 4 },
  paymentSection: {
    marginTop: 12,
  },
  paymentRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  paymentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  paymentBtnLight: { backgroundColor: '#F5F5F5', borderColor: '#E0E0E0' },
  paymentBtnDark:  { backgroundColor: '#2C2C2C', borderColor: '#444' },
  paymentBtnActive: { backgroundColor: '#1D9E75', borderColor: '#1D9E75' },
  paymentBtnText: { fontSize: 12, fontWeight: '500', color: '#666' },
  paymentBtnTextActive: { color: '#fff' },
});
