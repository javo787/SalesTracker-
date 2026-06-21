import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Alert, Linking, Switch, TextInput, ActivityIndicator
} from 'react-native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import Constants from 'expo-constants';
import { analyticsService } from '../services/analyticsService';
import { useAppContext } from '../context/AppContext';
import { useAppLock } from '../context/AppLockContext';
import { getConversionRate } from '../utils/currencyRates';
import { reviewService } from '../services/reviewService';
import { convertAllAmounts, clearAllData, getProducts, getSalesByPeriod, getExpenses, importBackupData } from '../db/database';

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
  { code: 'system', label: 'Как в системе', icon: '⚙️' },
];

const PRIVACY_POLICY_URL = 'https://duxtur.org/privacy'; // TODO: replace with the actual hosted privacy policy URL before publishing to Google Play
const SUPPORT_TELEGRAM_URL = 'https://t.me/savdoapp'; // TODO: verify this is the correct/active support channel

export default function SettingsScreen(props: any) {
  const { t, i18n } = useTranslation();
  const {
    theme, currency, language, setTheme, setCurrency, setLanguage,
    notificationsEnabled, setNotificationsEnabled,
    defaultMinStockAlert, setDefaultMinStockAlert
  } = useAppContext();
  const { isLockEnabled, setIsSystemDialogOpen } = useAppLock();

  const [conversionHistory, setConversionHistory] = useState<any[]>([]);
  const [loadingRate, setLoadingRate] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);

  useEffect(() => {
    loadConversionHistory();
    loadLastBackupTime();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadConversionHistory();
      loadLastBackupTime();
    }, [])
  );

  const loadLastBackupTime = async () => {
    const time = await AsyncStorage.getItem('last_backup_at');
    setLastBackupAt(time);
  };

  const loadConversionHistory = async () => {
    const log = await AsyncStorage.getItem('currency_conversion_log');
    if (log) {
      setConversionHistory(JSON.parse(log));
    }
  };

  const handleCurrencyChange = async (newCurr: any) => {
    if (newCurr.code === currency.code) return;

    setLoadingRate(true);
    try {
      const { rate } = await getConversionRate(currency.code, newCurr.code);
      setLoadingRate(false);

      if (!rate) {
        Alert.alert(t('common.error'), t('settings.currencyConvertError'));
        return;
      }

      Alert.alert(
        t('settings.currencyConvertTitle'),
        t('settings.currencyConvertMsg', { from: currency.code, to: newCurr.code, rate: rate.toFixed(4) }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.continue'),
            onPress: async () => {
              convertAllAmounts(rate);

              // Log history
              const newEntry = {
                date: new Date().toISOString(),
                from: currency.code,
                to: newCurr.code,
                rate: parseFloat(rate.toFixed(4))
              };
              const updatedHistory = [newEntry, ...conversionHistory].slice(0, 20);
              setConversionHistory(updatedHistory);
              await AsyncStorage.setItem('currency_conversion_log', JSON.stringify(updatedHistory));
              await AsyncStorage.setItem('currency_conversion_banner_seen', 'false');

              setCurrency(newCurr.code);

              Alert.alert(
                t('settings.currencyConvertSuccess', {
                  from: currency.code,
                  to: newCurr.code,
                  rate: rate.toFixed(4),
                  date: new Date().toLocaleDateString(i18n.language === 'tg' ? 'tg-TJ' : i18n.language === 'uz' ? 'uz-UZ' : 'ru-RU')
                })
              );
            }
          }
        ]
      );
    } catch (e) {
      setLoadingRate(false);
      Alert.alert(t('common.error'), t('settings.currencyConvertError'));
    }
  };

  const handleClearDataAlert = () => {
    Alert.alert(
      t('settings.clearDataTitle'),
      t('settings.clearDataMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              clearAllData();
              const keys = await AsyncStorage.getAllKeys();
              const prefixesToClear = ['ai_cache_', 'ai_tip_', 'smart_tip_', 'ai_fail_count_', 'currency_rates_cache', 'currency_conversion_log', 'currency_conversion_banner_seen', 'last_sync_at', 'calc_mode'];
              const keysToRemove = keys.filter(k => prefixesToClear.some(p => k.startsWith(p)));
              if (keysToRemove.length > 0) await AsyncStorage.multiRemove(keysToRemove);
              Alert.alert(t('settings.clearDataSuccess'), '');
            } catch (e) {
              Alert.alert(t('common.error'), 'Failed to clear data');
            }
          },
        },
      ]
    );
  };

  const handleExportBackup = async () => {
    try {
      const data = {
        exportedAt: new Date().toISOString(),
        appVersion: Constants.expoConfig?.version,
        currency: currency.code,
        products: getProducts(),
        sales: getSalesByPeriod(3650),
        expenses: getExpenses(3650),
      };
      const json = JSON.stringify(data, null, 2);
      const fileName = `savdo_backup_${Date.now()}.json`;
      const filePath = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(filePath, json, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        analyticsService.logEvent('data_exported', { format: 'json' });
        setIsSystemDialogOpen(true);
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/json',
          dialogTitle: t('settings.backupExport'),
        });
        const now = String(Date.now());
        await AsyncStorage.setItem('last_backup_at', now);
        setLastBackupAt(now);
        setTimeout(() => setIsSystemDialogOpen(false), 1000);
      } else {
        Alert.alert(t('common.error'), 'Sharing not available on this device');
      }
    } catch (e) {
      console.error('Backup export failed', e);
      Alert.alert(t('common.error'), 'Failed to export backup');
    }
  };

  const handleImportBackup = async () => {
    Alert.alert(
      t('settings.backupImport'),
      t('settings.backupImportConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.continue'),
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await DocumentPicker.getDocumentAsync({
                type: 'application/json',
                copyToCacheDirectory: true,
              });

              if (result.canceled || !result.assets || result.assets.length === 0) return;

              const fileUri = result.assets[0].uri;
              const content = await FileSystem.readAsStringAsync(fileUri);
              const data = JSON.parse(content);

              if (!data.products || !data.sales) {
                throw new Error('Invalid backup file');
              }

              importBackupData(data);
              if (data.currency) setCurrency(data.currency);

              analyticsService.logEvent('data_imported', { format: 'json' });
              Alert.alert(t('common.success'), t('settings.backupImportSuccess'));
            } catch (e) {
              console.error('Backup import failed', e);
              Alert.alert(t('common.error'), t('settings.backupImportError'));
            }
          }
        }
      ]
    );
  };

  const { resolvedTheme } = useAppContext();
  const isDark = resolvedTheme === 'dark';
  const themeStyles = isDark ? darkStyles : lightStyles;

  const renderLastBackupStatus = () => {
    if (!lastBackupAt) return t('settings.noBackupYet');
    const timestamp = parseInt(lastBackupAt);
    const diffDays = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('settings.lastBackupToday');
    return t('settings.lastBackup', { time: t('settings.daysAgo', { count: diffDays }) });
  };

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
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <Text style={[styles.sectionTitle, themeStyles.text, { marginBottom: 0 }]}>💰 {t('settings.currency')}</Text>
          {loadingRate && <ActivityIndicator size="small" color="#1D9E75" />}
        </View>
        {CURRENCIES.map(curr => (
          <TouchableOpacity
            key={curr.code}
            style={[
              styles.currencyRow,
              themeStyles.currencyRow,
              currency.code === curr.code && styles.currencyRowActive
            ]}
            onPress={() => handleCurrencyChange(curr)}
            disabled={loadingRate}
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

        {/* История конвертаций */}
        <Text style={[styles.historyTitle, themeStyles.text]}>{t('settings.currencyHistory')}</Text>
        {conversionHistory.length === 0 ? (
          <Text style={styles.historyEmpty}>{t('settings.currencyHistoryEmpty')}</Text>
        ) : (
          conversionHistory.map((item, index) => (
            <View key={index} style={styles.historyRow}>
              <Text style={styles.historyText}>
                {t('settings.currencyHistoryItem', {
                  from: item.from,
                  to: item.to,
                  rate: item.rate,
                  date: new Date(item.date).toLocaleDateString(i18n.language === 'tg' ? 'tg-TJ' : i18n.language === 'uz' ? 'uz-UZ' : 'ru-RU')
                })}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Уведомления и настройки по умолчанию */}
      <View style={[styles.section, themeStyles.section]}>
        <Text style={[styles.sectionTitle, themeStyles.text]}>🔔 {t('settings.notifications')}</Text>

        <View style={styles.switchRow}>
          <Text style={[styles.switchLabel, themeStyles.text]}>{t('settings.lowStockNotif')}</Text>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            trackColor={{ false: '#767577', true: '#1D9E75' }}
            thumbColor={notificationsEnabled ? '#fff' : '#f4f3f4'}
          />
        </View>

        <View style={styles.inputRow}>
          <Text style={[styles.inputLabel, themeStyles.text]}>{t('settings.defaultMinStock')}</Text>
          <TextInput
            style={[styles.numericInput, themeStyles.input]}
            value={String(defaultMinStockAlert)}
            onChangeText={(text) => setDefaultMinStockAlert(parseInt(text) || 0)}
            keyboardType="numeric"
            placeholder="0"
          />
        </View>
      </View>

      {/* Безопасность */}
      <View style={[styles.section, themeStyles.section]}>
        <Text style={[styles.sectionTitle, themeStyles.text]}>🛡️ {t('appLock.securitySettings')}</Text>
        <View style={styles.switchRow}>
          <Text style={[styles.switchLabel, themeStyles.text]}>{t('appLock.enableLock')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {isLockEnabled && <Text style={{ color: '#1D9E75', fontSize: 12, fontWeight: 'bold' }}>ON</Text>}
              <Switch
                value={isLockEnabled}
                onValueChange={() => props.navigation.navigate('AppLockSetup')}
                trackColor={{ false: '#767577', true: '#1D9E75' }}
                thumbColor={isLockEnabled ? '#fff' : '#f4f3f4'}
              />
          </View>
        </View>
        {isLockEnabled && (
            <TouchableOpacity style={styles.linkRow} onPress={() => props.navigation.navigate('AppLockSetup')}>
                <Text style={styles.linkText}>🔑 {t('appLock.changeMethod')}</Text>
            </TouchableOpacity>
        )}
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
              onPress={() => setTheme(tOption.code as 'light' | 'dark' | 'system')}
            >
              <Text style={styles.themeIcon}>{tOption.icon}</Text>
              <Text style={[
                styles.themeLabel,
                themeStyles.themeLabel,
                theme === tOption.code && styles.themeLabelActive
              ]}>
                {tOption.code === 'light' ? t('settings.light') : tOption.code === 'dark' ? t('settings.dark') : t('settings.system')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* О приложении */}
      <View style={[styles.section, themeStyles.section]}>
        <Text style={[styles.sectionTitle, themeStyles.text]}>ℹ️ {t('settings.about')}</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('settings.version')}</Text>
          <Text style={[styles.infoValue, themeStyles.text]}>{Constants.expoConfig?.version ?? '—'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('settings.build')}</Text>
          <Text style={[styles.infoValue, themeStyles.text]}>{String(Constants.expoConfig?.android?.versionCode ?? '—')}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('settings.developer')}</Text>
          <Text style={[styles.infoValue, themeStyles.text]}>SavdoApp Team</Text>
        </View>
        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => Linking.openURL(SUPPORT_TELEGRAM_URL)}
        >
          <Text style={styles.linkText}>📱 {t('settings.support')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
          <Text style={styles.linkText}>📄 {t('settings.privacyPolicy')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkRow} onPress={() => reviewService.openStoreListing()}>
          <Text style={styles.linkText}>⭐ {t('settings.rateApp')}</Text>
        </TouchableOpacity>
      </View>

      {/* Резервное копирование */}
      <View style={[styles.section, themeStyles.section]}>
        <Text style={[styles.sectionTitle, themeStyles.text]}>💾 {t('settings.backup')}</Text>
        <Text style={[styles.backupDesc, { color: isDark ? '#AAA' : '#666' }]}>{t('settings.backupDesc')}</Text>
        <Text style={[styles.backupStatus, { color: isDark ? '#1D9E75' : '#1D9E75' }]}>
          {renderLastBackupStatus()}
        </Text>
        <View style={{ gap: 10 }}>
          <TouchableOpacity style={styles.backupBtn} onPress={handleExportBackup}>
            <Text style={styles.backupBtnText}>{t('settings.backupExport')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.backupBtn, { backgroundColor: 'transparent' }]} onPress={handleImportBackup}>
            <Text style={styles.backupBtnText}>{t('settings.backupImport')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Опасная зона */}
      <View style={[styles.section, themeStyles.section, styles.dangerSection]}>
        <Text style={[styles.sectionTitle, { color: '#E53935' }]}>⚠️ {t('settings.dangerZone')}</Text>
        <TouchableOpacity style={styles.dangerBtn} onPress={handleClearDataAlert}>
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
  input: { backgroundColor: '#F5F5F5', borderColor: '#E0E0E0' },
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
  input: { backgroundColor: '#2C2C2C', borderColor: '#444', color: '#EEE' },
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
  historyTitle: { fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  historyEmpty: { fontSize: 12, color: '#999', fontStyle: 'italic' },
  historyRow: { paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#F0F0F0' },
  historyText: { fontSize: 12, color: '#666' },
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
  switchRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10,
  },
  switchLabel: { fontSize: 14, flex: 1 },
  inputRow: {
    marginTop: 12, borderTopWidth: 0.5, borderTopColor: '#F0F0F0',
    paddingTop: 12,
  },
  inputLabel: { fontSize: 13, color: '#666', marginBottom: 8 },
  numericInput: {
    borderRadius: 8, padding: 10,
    fontSize: 15, borderWidth: 1,
  },
  backupDesc: { fontSize: 13, marginBottom: 8, lineHeight: 18 },
  backupStatus: { fontSize: 12, fontWeight: '600', marginBottom: 16 },
  backupBtn: {
    backgroundColor: '#F0FBF7', borderRadius: 10,
    padding: 12, alignItems: 'center',
    borderWidth: 1, borderColor: '#1D9E75',
  },
  backupBtnText: { color: '#1D9E75', fontSize: 14, fontWeight: '600' },
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
