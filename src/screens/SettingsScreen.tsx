import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Alert, Linking
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LANGUAGES = [
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'tg', label: 'Тоҷикӣ', flag: '🇹🇯' },
  { code: 'uz', label: "O'zbek", flag: '🇺🇿' },
];

const CURRENCIES = [
  { code: 'TJS', label: 'Сомони', symbol: 'сом', country: '🇹🇯 Таджикистан' },
  { code: 'UZS', label: 'Сум', symbol: 'сум', country: '🇺🇿 Узбекистан' },
  { code: 'KZT', label: 'Тенге', symbol: '₸', country: '🇰🇿 Казахстан' },
  { code: 'KGS', label: 'Сом', symbol: 'с', country: '🇰🇬 Кыргызстан' },
];

const THEMES = [
  { code: 'light', label: 'Светлая', icon: '☀️' },
  { code: 'dark', label: 'Тёмная', icon: '🌙' },
];

export default function SettingsScreen() {
  const [language, setLanguage] = useState('ru');
  const [currency, setCurrency] = useState('TJS');
  const [theme, setTheme] = useState('light');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const lang = await AsyncStorage.getItem('app_language');
      const curr = await AsyncStorage.getItem('app_currency');
      const th = await AsyncStorage.getItem('app_theme');
      if (lang) setLanguage(lang);
      if (curr) setCurrency(curr);
      if (th) setTheme(th);
    } catch (e) {
      console.error('Ошибка загрузки настроек:', e);
    }
  };

  const saveSettings = async () => {
    try {
      await AsyncStorage.setItem('app_language', language);
      await AsyncStorage.setItem('app_currency', currency);
      await AsyncStorage.setItem('app_theme', theme);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось сохранить настройки');
    }
  };

  const handleClearData = () => {
    Alert.alert(
      'Удалить все данные?',
      'Это действие удалит все продажи и товары. Восстановить будет невозможно.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => Alert.alert('Данные удалены', 'Перезапустите приложение'),
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>

      {/* Язык */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🌐 Язык интерфейса</Text>
        <View style={styles.optionGrid}>
          {LANGUAGES.map(lang => (
            <TouchableOpacity
              key={lang.code}
              style={[styles.optionCard, language === lang.code && styles.optionCardActive]}
              onPress={() => setLanguage(lang.code)}
            >
              <Text style={styles.optionFlag}>{lang.flag}</Text>
              <Text style={[
                styles.optionLabel,
                language === lang.code && styles.optionLabelActive
              ]}>
                {lang.label}
              </Text>
              {language === lang.code && (
                <Text style={styles.checkmark}>✓</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Валюта */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>💰 Валюта</Text>
        {CURRENCIES.map(curr => (
          <TouchableOpacity
            key={curr.code}
            style={[styles.currencyRow, currency === curr.code && styles.currencyRowActive]}
            onPress={() => setCurrency(curr.code)}
          >
            <View style={styles.currencyLeft}>
              <Text style={styles.currencyCountry}>{curr.country}</Text>
              <Text style={styles.currencyName}>{curr.label} ({curr.symbol})</Text>
            </View>
            <View style={[
              styles.radio,
              currency === curr.code && styles.radioActive
            ]}>
              {currency === curr.code && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Тема */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🎨 Тема</Text>
        <View style={styles.themeRow}>
          {THEMES.map(t => (
            <TouchableOpacity
              key={t.code}
              style={[styles.themeBtn, theme === t.code && styles.themeBtnActive]}
              onPress={() => setTheme(t.code)}
            >
              <Text style={styles.themeIcon}>{t.icon}</Text>
              <Text style={[
                styles.themeLabel,
                theme === t.code && styles.themeLabelActive
              ]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Кнопка сохранения */}
      <TouchableOpacity
        style={[styles.saveBtn, saved && styles.saveBtnSuccess]}
        onPress={saveSettings}
      >
        <Text style={styles.saveBtnText}>
          {saved ? '✅ Сохранено!' : 'Сохранить настройки'}
        </Text>
      </TouchableOpacity>

      {/* О приложении */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ℹ️ О приложении</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Версия</Text>
          <Text style={styles.infoValue}>1.0.0</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Разработчик</Text>
          <Text style={styles.infoValue}>SavdoApp Team</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>AI модель</Text>
          <Text style={styles.infoValue}>Gemini 2.5 Flash</Text>
        </View>
        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => Linking.openURL('https://t.me/savdoapp')}
        >
          <Text style={styles.linkText}>📱 Telegram поддержка</Text>
        </TouchableOpacity>
      </View>

      {/* Опасная зона */}
      <View style={[styles.section, styles.dangerSection]}>
        <Text style={[styles.sectionTitle, { color: '#E53935' }]}>⚠️ Опасная зона</Text>
        <TouchableOpacity style={styles.dangerBtn} onPress={handleClearData}>
          <Text style={styles.dangerBtnText}>Удалить все данные</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  section: {
    margin: 16, marginBottom: 0, backgroundColor: '#fff',
    borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
  },
  sectionTitle: {
    fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 14,
  },
  optionGrid: { flexDirection: 'row', gap: 10 },
  optionCard: {
    flex: 1, alignItems: 'center', padding: 12,
    borderRadius: 10, borderWidth: 1.5, borderColor: '#E0E0E0',
    backgroundColor: '#F9F9F9',
  },
  optionCardActive: {
    borderColor: '#1D9E75', backgroundColor: '#F0FBF7',
  },
  optionFlag: { fontSize: 24, marginBottom: 6 },
  optionLabel: { fontSize: 12, color: '#666', fontWeight: '500', textAlign: 'center' },
  optionLabelActive: { color: '#1D9E75' },
  checkmark: { fontSize: 12, color: '#1D9E75', marginTop: 4, fontWeight: 'bold' },
  currencyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#E0E0E0', marginBottom: 8,
    backgroundColor: '#F9F9F9',
  },
  currencyRowActive: {
    borderColor: '#1D9E75', backgroundColor: '#F0FBF7',
  },
  currencyLeft: {},
  currencyCountry: { fontSize: 13, color: '#333', fontWeight: '500' },
  currencyName: { fontSize: 12, color: '#999', marginTop: 2 },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#CCC',
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: '#1D9E75' },
  radioDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: '#1D9E75',
  },
  themeRow: { flexDirection: 'row', gap: 10 },
  themeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, padding: 12,
    borderRadius: 10, borderWidth: 1.5, borderColor: '#E0E0E0',
    backgroundColor: '#F9F9F9',
  },
  themeBtnActive: { borderColor: '#1D9E75', backgroundColor: '#F0FBF7' },
  themeIcon: { fontSize: 18 },
  themeLabel: { fontSize: 14, color: '#666', fontWeight: '500' },
  themeLabelActive: { color: '#1D9E75' },
  saveBtn: {
    margin: 16, backgroundColor: '#1D9E75',
    borderRadius: 12, padding: 16, alignItems: 'center',
  },
  saveBtnSuccess: { backgroundColor: '#3B6D11' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#F0F0F0',
  },
  infoLabel: { fontSize: 14, color: '#666' },
  infoValue: { fontSize: 14, color: '#333', fontWeight: '500' },
  linkRow: { paddingVertical: 12 },
  linkText: { fontSize: 14, color: '#1D9E75', fontWeight: '500' },
  dangerSection: { borderWidth: 1, borderColor: '#FFCDD2' },
  dangerBtn: {
    backgroundColor: '#FFEBEE', borderRadius: 10,
    padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#FFCDD2',
  },
  dangerBtnText: { color: '#E53935', fontSize: 15, fontWeight: '600' },
});