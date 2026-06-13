import { useEffect, useState } from 'react';
import { useRoute } from '@react-navigation/native';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { addSale, getProducts } from '../db/database';
import { useAppContext } from '../context/AppContext';
import GeminiApi from '../utils/geminiApi';

const CACHE_TTL = 60 * 60 * 1000; // 1 час в мс

const gemini = new GeminiApi({
  geminiKeys: [process.env.EXPO_PUBLIC_GEMINI_KEY || ''],
});

export default function AddSaleScreen(/* props */) {
  const { t } = useTranslation();
  const { theme, currency, language } = useAppContext();
  const [products, setProducts] = useState<any[]>([]);
  const [productName, setProductName] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [lastSaved, setLastSaved] = useState<any>(null);

  // добавлено: получение параметров из маршрута (от калькулятора)
  const route = useRoute<any>();

  useEffect(() => {
    if (route.params?.prefillSell) setSellPrice(String(route.params.prefillSell));
    if (route.params?.prefillBuy) setBuyPrice(String(route.params.prefillBuy));
    if (route.params?.prefillQty) setQuantity(String(route.params.prefillQty));
    if (route.params?.prefillPrice) setSellPrice(String(route.params.prefillPrice));
  }, [route.params]);

  useEffect(() => {
    setProducts(getProducts());
  }, []);

  // Слушаем результат распознавания
  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript ?? '';
    setVoiceText(text);
    if (text) analyzeWithAI(text);
  });

  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('error', () => setListening(false));

  const startListening = async () => {
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      Alert.alert(t('common.error'), 'Разрешите доступ к микрофону');
      return;
    }

    let langCode = 'ru-RU';
    if (language === 'tg') langCode = 'tg-TJ';
    else if (language === 'uz') langCode = 'uz-UZ';

    setVoiceText('');
    setListening(true);
    ExpoSpeechRecognitionModule.start({
      lang: langCode,
      interimResults: false,
    });
  };

  const stopListening = () => {
    ExpoSpeechRecognitionModule.stop();
    setListening(false);
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
    try {
      const data = await gemini.generateContent({
        contents: [{
          parts: [{
            text: `Ты помощник торговца в Таджикистане. Из фразы извлеки данные о продаже.
Фраза: "${text}"

Верни ТОЛЬКО JSON без markdown:
{
  "product_name": "название товара или пустая строка",
  "sell_price": число или 0,
  "buy_price": число или 0,
  "quantity": число или 1,
  "revenue": общая выручка если упомянута или 0,
  "profit": прибыль если упомянута или 0
}

Примеры:
"сегодня сработал 2000 доход 400" → {"product_name":"","sell_price":0,"buy_price":0,"quantity":1,"revenue":2000,"profit":400}
"продал 5 кг помидор по 8 сомони" → {"product_name":"помидоры","sell_price":8,"buy_price":0,"quantity":5,"revenue":40,"profit":0}
"мука 2 мешка продал по 120 купил по 90" → {"product_name":"мука","sell_price":120,"buy_price":90,"quantity":2,"revenue":240,"profit":60}`
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

  const applyAIResult = (parsed: any) => {
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
    if (!sellPrice || !buyPrice) {
      Alert.alert(t('common.error'), 'Введите цену продажи и закупки');
      return;
    }

    const sPrice = parseFloat(sellPrice);
    const bPrice = parseFloat(buyPrice);
    const qty = parseInt(quantity) || 1;

    const profit = addSale(
      null,
      productName.trim(),
      qty,
      sPrice,
      bPrice,
      note
    );

    setLastSaved({
      name: productName,
      profit: profit.toFixed(0),
      revenue: (sPrice * qty).toFixed(0)
    });

    // Сброс формы
    setProductName('');
    setSellPrice('');
    setBuyPrice('');
    setQuantity('');
    setNote('');
    setVoiceText('');
  };

  const isDark = theme === 'dark';
  const themeStyles = isDark ? darkStyles : lightStyles;

  return (
    <ScrollView style={[styles.container, themeStyles.container]} keyboardShouldPersistTaps="handled">

      {/* Голосовой ввод */}
      <View style={[styles.voiceSection, themeStyles.card]}>
        <Text style={[styles.sectionTitle, themeStyles.text]}>{t('addSale.voiceTitle')}</Text>
        <TouchableOpacity
          style={[styles.voiceBtn, listening && styles.voiceBtnActive]}
          onPress={listening ? stopListening : startListening}
          disabled={processing}
        >
          <Text style={styles.voiceBtnIcon}>{listening ? '⏹' : '🎤'}</Text>
          <Text style={styles.voiceBtnText}>
            {listening ? t('addSale.voiceBtnStop') : t('addSale.voiceBtnStart')}
          </Text>
        </TouchableOpacity>

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

      {/* Форма */}
      <View style={[styles.form, themeStyles.card]}>
        <Text style={[styles.sectionTitle, themeStyles.text]}>{t('addSale.formTitle')}</Text>

        <Text style={[styles.label, themeStyles.text]}>{t('addSale.productName')} *</Text>
        <TextInput
          style={[styles.input, themeStyles.input]}
          placeholder={t('addSale.productPlaceholder')}
          placeholderTextColor={isDark ? '#888' : '#aaa'}
          value={productName}
          onChangeText={setProductName}
        />

        <View style={styles.row}>
          <View style={styles.halfField}>
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

        {/* Предварительный расчёт */}
        {sellPrice && buyPrice ? (
          <View style={styles.preview}>
            <Text style={styles.previewTitle}>{t('addSale.previewTitle')}</Text>
            <View style={styles.previewRow}>
              <Text style={[styles.previewLabel, themeStyles.text]}>{t('common.revenue')}:</Text>
              <Text style={[styles.previewValue, themeStyles.text]}>
                {(parseFloat(sellPrice) * (parseInt(quantity) || 1)).toLocaleString()} {currency.symbol}
              </Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={[styles.previewLabel, themeStyles.text]}>{t('common.profit')}:</Text>
              <Text style={[styles.previewValue, { color: '#1D9E75' }]}>
                {((parseFloat(sellPrice) - parseFloat(buyPrice)) * (parseInt(quantity) || 1)).toLocaleString()} {currency.symbol}
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
        <View style={styles.successCard}>
          <Text style={styles.successTitle}>✅ {t('common.saved')}</Text>
          <Text style={[styles.successText, themeStyles.text]}>{lastSaved.name}</Text>
          <Text style={[styles.successText, themeStyles.text]}>{t('common.revenue')}: {lastSaved.revenue} {currency.symbol}</Text>
          <Text style={styles.successProfit}>{t('common.profit')}: +{lastSaved.profit} {currency.symbol}</Text>
        </View>
      )}

    </ScrollView>
  );
}

const lightStyles = StyleSheet.create({
  container: { backgroundColor: '#F5F5F5' },
  card: { backgroundColor: '#fff' },
  text: { color: '#333' },
  voiceResult: { backgroundColor: '#F8F8F8' },
  input: { backgroundColor: '#F5F5F5', borderColor: '#E0E0E0' },
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: '#000' },
  card: { backgroundColor: '#1E1E1E' },
  text: { color: '#EEE' },
  voiceResult: { backgroundColor: '#2C2C2C' },
  input: { backgroundColor: '#2C2C2C', borderColor: '#444', color: '#EEE' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  voiceSection: {
    margin: 16,
    borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  voiceBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F0FBF7', borderRadius: 12, padding: 16,
    borderWidth: 1.5, borderColor: '#1D9E75',
  },
  voiceBtnActive: { backgroundColor: '#FFE8E8', borderColor: '#E53935' },
  voiceBtnIcon: { fontSize: 24 },
  voiceBtnText: { fontSize: 15, color: '#1D9E75', fontWeight: '500', flex: 1 },
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
    marginTop: 16, padding: 14, backgroundColor: '#F0FBF7',
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
  successCard: {
    margin: 16, marginTop: 0, backgroundColor: '#F0FBF7',
    borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#1D9E75',
  },
  successTitle: { fontSize: 16, fontWeight: 'bold', color: '#1D9E75', marginBottom: 8 },
  successText: { fontSize: 14, marginBottom: 4 },
  successProfit: { fontSize: 16, fontWeight: 'bold', color: '#1D9E75', marginTop: 4 },
});
