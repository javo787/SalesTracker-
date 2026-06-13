import { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Alert, Linking
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';

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
  const { t, i18n } = useTranslation();
  const { theme, currency, language, setTheme, setCurrency, setLanguage } = useAppContext();
  const [saved, setSaved] = useState(false);

  const handleSaveSettings = async () => {
    try {
      await i18n.changeLanguage(language);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      Alert.alert(t('common.error'), 'Не удалось сохранить настройки');
    }
  };

  const handleClearData = () => {
    Alert.alert(
      t('settings.clearDataTitle'),
      t('settings.clearDataMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => Alert.alert('Данные удалены', 'Перезапустите приложение'),
        },
      ]
    );
  };

  const isDark = theme === 'dark';
  const themeStyles = isDark ? darkStyles : lightStyles;

  return (
    <ScrollView style={[styles.container, themeStyles.container]}>

      {/* Язык */}
      <View style={[styles.section, themeStyles.section]}>
        <Text style={[styles.sectionTitle, themeStyles.text]}>🌐 {t('settings.language')}</Text>
        <View style={styles.optionGrid}>
          {LANGUAGES.map(lang => (
            <TouchableOpacity
              key={lang.code}
              style={[
                styles.optionCard,
                themeStyles.optionCard,
                language === lang.code && styles.optionCardActive
              ]}
              onPress={() => setLanguage(lang.code)}
            >
              <Text style={styles.optionFlag}>{lang.flag}</Text>
              <Text style={[
                styles.optionLabel,
                themeStyles.optionLabel,
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
      <View style={[styles.section, themeStyles.section]}>
        <Text style={[styles.sectionTitle, themeStyles.text]}>💰 {t('settings.currency')}</Text>
        {CURRENCIES.map(curr => (
          <TouchableOpacity
            key={curr.code}
            style={[
              styles.currencyRow,
              themeStyles.currencyRow,
              currency.code === curr.code && styles.currencyRowActive
            ]}
            onPress={() => setCurrency(curr.code)}
          >
            <View style={styles.currencyLeft}>
              <Text style={[styles.currencyCountry, themeStyles.text]}>{curr.country}</Text>
              <Text style={styles.currencyName}>{curr.label} ({curr.symbol})</Text>
            </View>
            <View style={[
              styles.radio,
              currency.code === curr.code && styles.radioActive
            ]}>
              {currency.code === curr.code && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Тема */}
      <View style={[styles.section, themeStyles.section]}>
        <Text style={[styles.sectionTitle, themeStyles.text]}>🎨 {t('settings.theme')}</Text>
        <View style={styles.themeRow}>
          {THEMES.map(tOption => (
            <TouchableOpacity
              key={tOption.code}
              style={[
                styles.themeBtn,
                themeStyles.themeBtn,
                theme === tOption.code && styles.themeBtnActive
              ]}
              onPress={() => setTheme(tOption.code as 'light' | 'dark')}
            >
              <Text style={styles.themeIcon}>{tOption.icon}</Text>
              <Text style={[
                styles.themeLabel,
                themeStyles.themeLabel,
                theme === tOption.code && styles.themeLabelActive
              ]}>
                {tOption.code === 'light' ? t('settings.light') : t('settings.dark')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Кнопка сохранения */}
      <TouchableOpacity
        style={[styles.saveBtn, saved && styles.saveBtnSuccess]}
        onPress={handleSaveSettings}
      >
        <Text style={styles.saveBtnText}>
          {saved ? `✅ ${t('common.saved')}` : t('settings.saveBtn')}
        </Text>
      </TouchableOpacity>

      {/* О приложении */}
      <View style={[styles.section, themeStyles.section]}>
        <Text style={[styles.sectionTitle, themeStyles.text]}>ℹ️ {t('settings.about')}</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('settings.version')}</Text>
          <Text style={[styles.infoValue, themeStyles.text]}>1.0.0</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('settings.developer')}</Text>
          <Text style={[styles.infoValue, themeStyles.text]}>SavdoApp Team</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>AI модель</Text>
          <Text style={[styles.infoValue, themeStyles.text]}>Gemini 1.5 Flash</Text>
        </View>
        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => Linking.openURL('https://t.me/savdoapp')}
        >
          <Text style={styles.linkText}>📱 {t('settings.support')}</Text>
        </TouchableOpacity>
      </View>

      {/* Опасная зона */}
      <View style={[styles.section, themeStyles.section, styles.dangerSection]}>
        <Text style={[styles.sectionTitle, { color: '#E53935' }]}>⚠️ {t('settings.dangerZone')}</Text>
        <TouchableOpacity style={styles.dangerBtn} onPress={handleClearData}>
          <Text style={styles.dangerBtnText}>{t('settings.clearData')}</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const lightStyles = StyleSheet.create({
  container: { backgroundColor: '#F5F5F5' },
  section: { backgroundColor: '#fff' },
  text: { color: '#333' },
  optionCard: { backgroundColor: '#F9F9F9' },
  optionLabel: { color: '#666' },
  currencyRow: { backgroundColor: '#F9F9F9' },
  themeBtn: { backgroundColor: '#F9F9F9' },
  themeLabel: { color: '#666' },
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: '#000' },
  section: { backgroundColor: '#1E1E1E' },
  text: { color: '#EEE' },
  optionCard: { backgroundColor: '#2C2C2C', borderColor: '#444' },
  optionLabel: { color: '#AAA' },
  currencyRow: { backgroundColor: '#2C2C2C', borderColor: '#444' },
  themeBtn: { backgroundColor: '#2C2C2C', borderColor: '#444' },
  themeLabel: { color: '#AAA' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: {
    margin: 16, marginBottom: 0,
    borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
  },
  sectionTitle: {
    fontSize: 15, fontWeight: '600', marginBottom: 14,
  },
  optionGrid: { flexDirection: 'row', gap: 10 },
  optionCard: {
    flex: 1, alignItems: 'center', padding: 12,
    borderRadius: 10, borderWidth: 1.5, borderColor: '#E0E0E0',
  },
  optionCardActive: {
    borderColor: '#1D9E75', backgroundColor: '#F0FBF7',
  },
  optionFlag: { fontSize: 24, marginBottom: 6 },
  optionLabel: { fontSize: 12, fontWeight: '500', textAlign: 'center' },
  optionLabelActive: { color: '#1D9E75' },
  checkmark: { fontSize: 12, color: '#1D9E75', marginTop: 4, fontWeight: 'bold' },
  currencyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#E0E0E0', marginBottom: 8,
  },
  currencyRowActive: {
    borderColor: '#1D9E75', backgroundColor: '#F0FBF7',
  },
  currencyLeft: {},
  currencyCountry: { fontSize: 13, fontWeight: '500' },
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
  },
  themeBtnActive: { borderColor: '#1D9E75', backgroundColor: '#F0FBF7' },
  themeIcon: { fontSize: 18 },
  themeLabel: { fontSize: 14, fontWeight: '500' },
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
  infoValue: { fontSize: 14, fontWeight: '500' },
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
