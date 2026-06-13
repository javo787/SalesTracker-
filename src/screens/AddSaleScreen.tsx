import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator
} from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { addSale, getProducts } from '../db/database';

export default function AddSaleScreen() {
  const [products, setProducts] = useState<any[]>([]);
  const [productName, setProductName] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [note, setNote] = useState('');
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [lastSaved, setLastSaved] = useState<any>(null);

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
      Alert.alert('Нет доступа', 'Разрешите доступ к микрофону');
      return;
    }
    setVoiceText('');
    setListening(true);
    ExpoSpeechRecognitionModule.start({
      lang: 'ru-RU',
      interimResults: false,
    });
  };

  const stopListening = () => {
    ExpoSpeechRecognitionModule.stop();
    setListening(false);
  };

  const analyzeWithAI = async (text: string) => {
    setProcessing(true);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.EXPO_PUBLIC_GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
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
          })
        }
      );
      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim());

      // Заполняем поля
      if (parsed.product_name) setProductName(parsed.product_name);
      if (parsed.sell_price > 0) setSellPrice(String(parsed.sell_price));
      if (parsed.buy_price > 0) setBuyPrice(String(parsed.buy_price));
      if (parsed.quantity > 1) setQuantity(String(parsed.quantity));

      // Если сказал общую выручку и прибыль — рассчитываем закупочную
      if (parsed.revenue > 0 && parsed.profit > 0 && parsed.sell_price === 0) {
        const calcBuy = parsed.revenue - parsed.profit;
        setSellPrice(String(parsed.revenue));
        setBuyPrice(String(calcBuy));
        setProductName(parsed.product_name || 'Продажа дня');
      }

    } catch (e) {
      Alert.alert('Ошибка AI', 'Не удалось обработать. Введите вручную.');
    } finally {
      setProcessing(false);
    }
  };

  const handleSave = () => {
    if (!productName.trim()) {
      Alert.alert('Ошибка', 'Введите название товара');
      return;
    }
    if (!sellPrice || !buyPrice) {
      Alert.alert('Ошибка', 'Введите цену продажи и закупки');
      return;
    }

    const profit = addSale(
      null,
      productName.trim(),
      parseInt(quantity) || 1,
      parseFloat(sellPrice),
      parseFloat(buyPrice),
      note
    );

    setLastSaved({
      name: productName,
      profit: profit.toFixed(0),
      revenue: (parseFloat(sellPrice) * (parseInt(quantity) || 1)).toFixed(0)
    });

    // Сброс формы
    setProductName('');
    setSellPrice('');
    setBuyPrice('');
    setQuantity('1');
    setNote('');
    setVoiceText('');
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">

      {/* Голосовой ввод */}
      <View style={styles.voiceSection}>
        <Text style={styles.sectionTitle}>Голосовой ввод</Text>
        <TouchableOpacity
          style={[styles.voiceBtn, listening && styles.voiceBtnActive]}
          onPress={listening ? stopListening : startListening}
          disabled={processing}
        >
          <Text style={styles.voiceBtnIcon}>{listening ? '⏹' : '🎤'}</Text>
          <Text style={styles.voiceBtnText}>
            {listening ? 'Слушаю... (нажми чтобы остановить)' : 'Нажми и говори'}
          </Text>
        </TouchableOpacity>

        {voiceText ? (
          <View style={styles.voiceResult}>
            <Text style={styles.voiceResultLabel}>Распознано:</Text>
            <Text style={styles.voiceResultText}>"{voiceText}"</Text>
          </View>
        ) : null}

        {processing && (
          <View style={styles.processingRow}>
            <ActivityIndicator size="small" color="#1D9E75" />
            <Text style={styles.processingText}>AI анализирует...</Text>
          </View>
        )}
      </View>

      {/* Форма */}
      <View style={styles.form}>
        <Text style={styles.sectionTitle}>Данные продажи</Text>

        <Text style={styles.label}>Товар *</Text>
        <TextInput
          style={styles.input}
          placeholder="Например: помидоры, мука, носки"
          value={productName}
          onChangeText={setProductName}
        />

        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.label}>Цена продажи *</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              keyboardType="numeric"
              value={sellPrice}
              onChangeText={setSellPrice}
            />
          </View>
          <View style={styles.halfField}>
            <Text style={styles.label}>Цена закупки *</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              keyboardType="numeric"
              value={buyPrice}
              onChangeText={setBuyPrice}
            />
          </View>
        </View>

        <Text style={styles.label}>Количество</Text>
        <TextInput
          style={styles.input}
          placeholder="1"
          keyboardType="numeric"
          value={quantity}
          onChangeText={setQuantity}
        />

        <Text style={styles.label}>Заметка (необязательно)</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          placeholder="Любая заметка..."
          value={note}
          onChangeText={setNote}
          multiline
        />

        {/* Предварительный расчёт */}
        {sellPrice && buyPrice ? (
          <View style={styles.preview}>
            <Text style={styles.previewTitle}>Предварительный расчёт</Text>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Выручка:</Text>
              <Text style={styles.previewValue}>
                {(parseFloat(sellPrice) * (parseInt(quantity) || 1)).toLocaleString()} сом
              </Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Прибыль:</Text>
              <Text style={[styles.previewValue, { color: '#1D9E75' }]}>
                {((parseFloat(sellPrice) - parseFloat(buyPrice)) * (parseInt(quantity) || 1)).toLocaleString()} сом
              </Text>
            </View>
          </View>
        ) : null}

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Сохранить продажу</Text>
        </TouchableOpacity>
      </View>

      {/* Успешно сохранено */}
      {lastSaved && (
        <View style={styles.successCard}>
          <Text style={styles.successTitle}>✅ Сохранено!</Text>
          <Text style={styles.successText}>{lastSaved.name}</Text>
          <Text style={styles.successText}>Выручка: {lastSaved.revenue} сом</Text>
          <Text style={styles.successProfit}>Прибыль: +{lastSaved.profit} сом</Text>
        </View>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  voiceSection: {
    margin: 16, backgroundColor: '#fff',
    borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 12 },
  voiceBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F0FBF7', borderRadius: 12, padding: 16,
    borderWidth: 1.5, borderColor: '#1D9E75',
  },
  voiceBtnActive: { backgroundColor: '#FFE8E8', borderColor: '#E53935' },
  voiceBtnIcon: { fontSize: 24 },
  voiceBtnText: { fontSize: 15, color: '#1D9E75', fontWeight: '500', flex: 1 },
  voiceResult: { marginTop: 12, padding: 12, backgroundColor: '#F8F8F8', borderRadius: 8 },
  voiceResultLabel: { fontSize: 12, color: '#999', marginBottom: 4 },
  voiceResultText: { fontSize: 14, color: '#333', fontStyle: 'italic' },
  processingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  processingText: { fontSize: 14, color: '#1D9E75' },
  form: {
    margin: 16, marginTop: 0, backgroundColor: '#fff',
    borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
  },
  label: { fontSize: 13, color: '#555', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#F5F5F5', borderRadius: 8, padding: 12,
    fontSize: 15, color: '#222', borderWidth: 1, borderColor: '#E0E0E0',
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
  previewLabel: { fontSize: 14, color: '#555' },
  previewValue: { fontSize: 14, fontWeight: '600', color: '#222' },
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
  successText: { fontSize: 14, color: '#333', marginBottom: 4 },
  successProfit: { fontSize: 16, fontWeight: 'bold', color: '#1D9E75', marginTop: 4 },
});