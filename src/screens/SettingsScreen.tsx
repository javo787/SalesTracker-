import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Alert, Linking, Switch, TextInput, ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ALL_CURRENCIES, CurrencyDef } from '../constants/currencies';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { analyticsService } from '../services/analyticsService';
import { useAppContext } from '../context/AppContext';
import { useShop } from '../context/ShopContext';
import { useAppLock } from '../context/AppLockContext';
import { getConversionRate } from '../utils/currencyRates';
import { reviewService } from '../services/reviewService';
import { convertAllAmounts, clearAllData, getProducts, getSalesByPeriod, getExpenses, importBackupData } from '../db/database';

const LANGUAGES = [
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'tg', label: 'Тоҷикӣ', flag: '🇹🇯' },
  { code: 'uz', label: "O'zbek", flag: '🇺🇿' },
];


const PRIVACY_POLICY_URL = 'https://savdo-tan.vercel.app/privacy';
const SUPPORT_URL = 'https://savdo-tan.vercel.app/support';

// Иконка в цветном кружке
function SettingIcon({ name, color }: { name: any; color: string }) {
  return (
    <View style={[iconStyles.wrap, { backgroundColor: color }]}>
      <Ionicons name={name} size={16} color="#fff" />
    </View>
  );
}

// Строка настройки с иконкой, заголовком и правой частью
function SettingRow({
  icon, iconColor, label, sublabel, right, onPress, isDark, isLast = false,
}: {
  icon: any; iconColor: string; label: string;
  sublabel?: string; right?: React.ReactNode;
  onPress?: () => void; isDark: boolean; isLast?: boolean;
}) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      onPress={onPress}
      activeOpacity={0.7}
      style={[rowStyles.row, !isLast && rowStyles.rowBorder,
        { borderBottomColor: isDark ? '#2A2A2A' : '#F0F0F0' }
      ]}
    >
      <SettingIcon name={icon} color={iconColor} />
      <View style={rowStyles.rowContent}>
        <Text style={[rowStyles.rowLabel, { color: isDark ? '#EEE' : '#111' }]}>
          {label}
        </Text>
        {sublabel ? (
          <Text style={[rowStyles.rowSublabel, { color: isDark ? '#777' : '#999' }]}>
            {sublabel}
          </Text>
        ) : null}
      </View>
      {right}
      {onPress && !right && (
        <Ionicons name="chevron-forward" size={16} color={isDark ? '#555' : '#CCC'} />
      )}
    </Wrapper>
  );
}

// Заголовок группы секций
function SectionLabel({ label, isDark }: { label: string; isDark: boolean }) {
  return (
    <Text style={[sectionLabelStyles.text, { color: isDark ? '#777' : '#999' }]}>
      {label.toUpperCase()}
    </Text>
  );
}

// Карточка-обёртка группы
function SettingGroup({ children, isDark }: { children: React.ReactNode; isDark: boolean }) {
  return (
    <View style={[groupStyles.card, {
      backgroundColor: isDark ? '#1E1E1E' : '#fff',
      shadowColor: '#000',
    }]}>
      {children}
    </View>
  );
}

const iconStyles = StyleSheet.create({
  wrap: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
});
const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '500' },
  rowSublabel: { fontSize: 12, marginTop: 1 },
});
const sectionLabelStyles = StyleSheet.create({
  text: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginLeft: 16, marginBottom: 6, marginTop: 20 },
});
const groupStyles = StyleSheet.create({
  card: { borderRadius: 14, marginHorizontal: 16, overflow: 'hidden', elevation: 1, shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 2 },
});

export default function SettingsScreen(props: any) {
  const { t, i18n } = useTranslation();
  const { isOwner, hasShop } = useShop();
  const {
    theme, currency, language, setTheme, setCurrency, setLanguage,
    notificationsEnabled, setNotificationsEnabled,
    defaultMinStockAlert, setDefaultMinStockAlert,
    sellerMode, setSellerMode, resolvedTheme,
    showGreeting, setShowGreeting, showDailyTip, setShowDailyTip
  } = useAppContext();

  const insets = useSafeAreaInsets();
  const [currencyExpanded, setCurrencyExpanded] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const { isLockEnabled, setIsSystemDialogOpen } = useAppLock();

  const [conversionHistory, setConversionHistory] = useState<any[]>([]);
  const [loadingRate, setLoadingRate] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [syncEnabled, setSyncEnabled] = useState(true);

  useEffect(() => {
    loadConversionHistory();
    loadLastBackupTime();
    loadSyncSettings();
  }, []);

  const loadSyncSettings = async () => {
    const val = await AsyncStorage.getItem('sync_enabled');
    if (val === null) {
      setSyncEnabled(hasShop);
      await AsyncStorage.setItem('sync_enabled', hasShop ? 'true' : 'false');
    } else {
      setSyncEnabled(val === 'true');
    }
  };

  const handleSyncToggle = async (val: boolean) => {
    if (!hasShop) return;

    if (!val && isOwner) {
      Alert.alert(
        t('settings.syncDisableConfirmTitle'),
        t('settings.syncDisableConfirmMsg'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.continue'),
            style: 'destructive',
            onPress: async () => {
              setSyncEnabled(false);
              await AsyncStorage.setItem('sync_enabled', 'false');
            }
          }
        ]
      );
    } else {
      setSyncEnabled(val);
      await AsyncStorage.setItem('sync_enabled', val ? 'true' : 'false');
    }
  };

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
              Alert.alert(t('common.error'), t('common.error'));
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
        Alert.alert(t('common.error'), t('common.sharingNotAvailable'));
      }
    } catch (e) {
      console.error('Backup export failed', e);
      Alert.alert(t('common.error'), t('common.backupExportFailed'));
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
              Alert.alert(t('common.error'), t('common.backupImportFailed'));
            }
          }
        }
      ]
    );
  };

  const isDark = resolvedTheme === 'dark';

  const renderLastBackupStatus = () => {
    if (!lastBackupAt) return t('settings.noBackupYet');
    const timestamp = parseInt(lastBackupAt);
    const diffDays = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('settings.lastBackupToday');
    return t('settings.lastBackup', { time: t('settings.daysAgo', { count: diffDays }) });
  };

  return (
    <ScrollView
      style={[newStyles.container, { backgroundColor: isDark ? '#000' : '#F2F2F7' }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ height: Math.max(insets.top, 16) + 8 }} />

      {/* ── ПРОФИЛЬ / РЕЖИМ ── */}
      <SectionLabel label={t('common.sellerMode')} isDark={isDark} />
      <SettingGroup isDark={isDark}>
        {/* Segmented control режима продавца */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
          <View style={[newStyles.segmented, { backgroundColor: isDark ? '#2C2C2C' : '#F0F0F0' }]}>
            <TouchableOpacity
              style={[newStyles.segBtn, sellerMode === 'retail' && newStyles.segBtnActive]}
              onPress={() => setSellerMode('retail')}
            >
              <Ionicons name="storefront-outline" size={14}
                color={sellerMode === 'retail' ? '#fff' : (isDark ? '#AAA' : '#666')} />
              <Text style={[newStyles.segText,
                { color: sellerMode === 'retail' ? '#fff' : (isDark ? '#AAA' : '#666') }
              ]}>
                {t('common.retail')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[newStyles.segBtn, sellerMode === 'wholesale' && newStyles.segBtnActive]}
              onPress={() => setSellerMode('wholesale')}
            >
              <Ionicons name="cube-outline" size={14}
                color={sellerMode === 'wholesale' ? '#fff' : (isDark ? '#AAA' : '#666')} />
              <Text style={[newStyles.segText,
                { color: sellerMode === 'wholesale' ? '#fff' : (isDark ? '#AAA' : '#666') }
              ]}>
                {t('common.wholesale')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SettingGroup>

      {/* ── ВНЕШНИЙ ВИД ── */}
      <SectionLabel label={t('settings.theme')} isDark={isDark} />
      <SettingGroup isDark={isDark}>
        <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
          <View style={[newStyles.segmented, { backgroundColor: isDark ? '#2C2C2C' : '#F0F0F0' }]}>
            {[
              { code: 'light', icon: 'sunny-outline', label: t('settings.light') },
              { code: 'dark', icon: 'moon-outline', label: t('settings.dark') },
              { code: 'system', icon: 'phone-portrait-outline', label: t('settings.system') },
            ].map(opt => (
              <TouchableOpacity
                key={opt.code}
                style={[newStyles.segBtn, theme === opt.code && newStyles.segBtnActive]}
                onPress={() => setTheme(opt.code as any)}
              >
                <Ionicons name={opt.icon as any} size={14}
                  color={theme === opt.code ? '#fff' : (isDark ? '#AAA' : '#666')} />
                <Text style={[newStyles.segText,
                  { color: theme === opt.code ? '#fff' : (isDark ? '#AAA' : '#666') }
                ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </SettingGroup>

      {/* ── ЯЗЫК ── */}
      <SectionLabel label={t('settings.language')} isDark={isDark} />
      <SettingGroup isDark={isDark}>
        {LANGUAGES.map((lang, i) => (
          <SettingRow
            key={lang.code}
            icon="language-outline"
            iconColor="#5856D6"
            label={`${lang.flag}  ${lang.label}`}
            isDark={isDark}
            isLast={i === LANGUAGES.length - 1}
            onPress={() => setLanguage(lang.code)}
            right={
              language === lang.code ? (
                <Ionicons name="checkmark" size={18} color="#1D9E75" />
              ) : null
            }
          />
        ))}
      </SettingGroup>

      {/* ── ВАЛЮТА ── */}
      <SectionLabel label={t('settings.currency')} isDark={isDark} />
      <SettingGroup isDark={isDark}>

        {/* Строка-аккордеон — всегда видна */}
        <SettingRow
          icon="cash-outline"
          iconColor="#34C759"
          label={t('settings.currency')}
          sublabel={`${currency.code} · ${currency.symbol} · ${currency.label}`}
          isDark={isDark}
          isLast={!currencyExpanded}
          onPress={isOwner ? () => {
            setCurrencyExpanded(prev => !prev);
            setCurrencySearch('');
          } : undefined}
          right={
            isOwner ? (
              <Ionicons
                name={currencyExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={isDark ? '#555' : '#CCC'}
              />
            ) : null
          }
        />

        {currencyExpanded && (
          <View>
            {/* Поиск */}
            <View style={{
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: isDark ? '#2A2A2A' : '#F0F0F0',
            }}>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: isDark ? '#2C2C2C' : '#F0F0F0',
                borderRadius: 10,
                paddingHorizontal: 10,
                gap: 6,
              }}>
                <Ionicons name="search-outline" size={15} color="#999" />
                <TextInput
                  value={currencySearch}
                  onChangeText={setCurrencySearch}
                  placeholder={t('common.search') || 'Поиск...'}
                  placeholderTextColor="#999"
                  style={{
                    flex: 1,
                    fontSize: 14,
                    paddingVertical: 8,
                    color: isDark ? '#EEE' : '#111',
                  }}
                  autoCorrect={false}
                  autoCapitalize="none"
                  clearButtonMode="while-editing"
                />
              </View>
            </View>

            {/* Список валют */}
            <ScrollView
              style={{ maxHeight: 320 }}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {(() => {
                const query = currencySearch.toLowerCase().trim();
                const priorityCurrencies = ALL_CURRENCIES.filter(c => c.priority);
                const otherCurrencies = ALL_CURRENCIES.filter(c => !c.priority);

                const filterFn = (c: CurrencyDef) =>
                  !query ||
                  c.code.toLowerCase().includes(query) ||
                  c.label.toLowerCase().includes(query) ||
                  c.country.toLowerCase().includes(query);

                const filteredPriority = priorityCurrencies.filter(filterFn);
                const filteredOther = otherCurrencies.filter(filterFn);
                const allFiltered = [...filteredPriority, ...filteredOther];

                return allFiltered.map((curr, i) => (
                  <SettingRow
                    key={curr.code}
                    icon="ellipse"
                    iconColor={currency.code === curr.code ? '#1D9E75' : '#ccc'}
                    label={curr.country}
                    sublabel={`${curr.label} · ${curr.symbol}`}
                    isDark={isDark}
                    isLast={i === allFiltered.length - 1}
                    onPress={() => {
                      handleCurrencyChange(curr);
                      setCurrencyExpanded(false);
                      setCurrencySearch('');
                    }}
                    right={
                      currency.code === curr.code ? (
                        <Ionicons name="checkmark" size={18} color="#1D9E75"
                          style={{ marginRight: 4 }} />
                      ) : loadingRate ? null : null
                    }
                  />
                ));
              })()}
            </ScrollView>
          </View>
        )}
      </SettingGroup>

      {/* История конвертаций — компактно под валютой */}
      {conversionHistory.length > 0 && (
        <View style={{ marginHorizontal: 16, marginTop: 6 }}>
          {conversionHistory.slice(0, 3).map((item, index) => (
            <Text key={index} style={{ fontSize: 11, color: isDark ? '#555' : '#BBB', marginBottom: 2 }}>
              {t('settings.currencyHistoryItem', {
                from: item.from, to: item.to, rate: item.rate,
                date: new Date(item.date).toLocaleDateString(
                  i18n.language === 'tg' ? 'tg-TJ' : i18n.language === 'uz' ? 'uz-UZ' : 'ru-RU'
                )
              })}
            </Text>
          ))}
        </View>
      )}

      {/* ── УВЕДОМЛЕНИЯ ── */}
      <SectionLabel label={t('settings.notifications')} isDark={isDark} />
      <SettingGroup isDark={isDark}>
        <SettingRow
          icon="notifications-outline"
          iconColor="#FF9500"
          label={t('settings.lowStockNotif')}
          isDark={isDark}
          right={
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: '#767577', true: '#1D9E75' }}
              thumbColor="#fff"
            />
          }
        />
        <View style={[rowStyles.row, { borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: isDark ? '#2A2A2A' : '#F0F0F0' }]}>
          <SettingIcon name="alert-circle-outline" color="#FF9500" />
          <View style={rowStyles.rowContent}>
            <Text style={[rowStyles.rowLabel, { color: isDark ? '#EEE' : '#111' }]}>
              {t('settings.defaultMinStock')}
            </Text>
          </View>
          <TextInput
            style={[newStyles.numInput, {
              backgroundColor: isDark ? '#2C2C2C' : '#F5F5F5',
              color: isDark ? '#EEE' : '#333',
              borderColor: isDark ? '#444' : '#E0E0E0',
            }]}
            value={String(defaultMinStockAlert)}
            onChangeText={(text) => setDefaultMinStockAlert(parseInt(text) || 0)}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor="#999"
          />
        </View>
      </SettingGroup>

      {/* ── СИНХРОНИЗАЦИЯ ── */}
      <SectionLabel label={t('settings.syncTitle')} isDark={isDark} />
      <SettingGroup isDark={isDark}>
        <SettingRow
          icon="sync-outline"
          iconColor="#007AFF"
          label={hasShop
            ? (syncEnabled ? t('settings.syncEnabledLabel') : t('settings.syncDisabledLabel'))
            : t('settings.syncUnavailableLabel')
          }
          isDark={isDark}
          isLast
          right={
            <Switch
              value={hasShop && syncEnabled}
              onValueChange={handleSyncToggle}
              disabled={!hasShop}
              trackColor={{ false: '#767577', true: '#1D9E75' }}
              thumbColor="#fff"
            />
          }
        />
      </SettingGroup>
      <View style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 4 }}>
        <Text style={{ fontSize: 12, color: isDark ? '#777' : '#999', lineHeight: 16 }}>
          {t('settings.syncExplanation')}
        </Text>
      </View>

      {/* ── БЕЗОПАСНОСТЬ ── */}
      <SectionLabel label={t('appLock.securitySettings')} isDark={isDark} />
      <SettingGroup isDark={isDark}>
        <SettingRow
          icon="lock-closed-outline"
          iconColor="#FF3B30"
          label={t('appLock.enableLock')}
          sublabel={isLockEnabled ? 'ON' : undefined}
          isDark={isDark}
          isLast={!isLockEnabled}
          right={
            <Switch
              value={isLockEnabled}
              onValueChange={() => props.navigation.navigate('AppLockSetup')}
              trackColor={{ false: '#767577', true: '#1D9E75' }}
              thumbColor="#fff"
            />
          }
        />
        {isLockEnabled && (
          <SettingRow
            icon="key-outline"
            iconColor="#FF3B30"
            label={t('appLock.changeMethod')}
            isDark={isDark}
            isLast
            onPress={() => props.navigation.navigate('AppLockSetup')}
          />
        )}
      </SettingGroup>

      {/* ── ДАННЫЕ И РЕЗЕРВНОЕ КОПИРОВАНИЕ ── */}
      {isOwner && (
        <>
          <SectionLabel label={t('settings.backup')} isDark={isDark} />
          <SettingGroup isDark={isDark}>
            <SettingRow
              icon="cloud-upload-outline"
              iconColor="#007AFF"
              label={t('settings.backupExport')}
              sublabel={renderLastBackupStatus()}
              isDark={isDark}
              onPress={handleExportBackup}
            />
            <SettingRow
              icon="cloud-download-outline"
              iconColor="#007AFF"
              label={t('settings.backupImport')}
              isDark={isDark}
              isLast
              onPress={handleImportBackup}
            />
          </SettingGroup>
        </>
      )}

      {/* ── ПЕРЕКЛЮЧАТЕЛИ ГЛАВНОГО ЭКРАНА ── */}
      <SectionLabel label={t('settings.homeScreenSection')} isDark={isDark} />
      <SettingGroup isDark={isDark}>
        <SettingRow
          icon="hand-left-outline"
          iconColor="#5856D6"
          label={t('settings.showGreeting')}
          sublabel={t('settings.showGreetingSub')}
          isDark={isDark}
          right={
            <Switch
              value={showGreeting}
              onValueChange={setShowGreeting}
              trackColor={{ false: '#767577', true: '#1D9E75' }}
              thumbColor="#fff"
            />
          }
        />
        <SettingRow
          icon="bulb-outline"
          iconColor="#FF9500"
          label={t('settings.showDailyTip')}
          sublabel={t('settings.showDailyTipSub')}
          isDark={isDark}
          isLast
          right={
            <Switch
              value={showDailyTip}
              onValueChange={setShowDailyTip}
              trackColor={{ false: '#767577', true: '#1D9E75' }}
              thumbColor="#fff"
            />
          }
        />
      </SettingGroup>

      {/* ── О ПРИЛОЖЕНИИ ── */}
      <SectionLabel label={t('settings.about')} isDark={isDark} />
      <SettingGroup isDark={isDark}>
        <SettingRow
          icon="information-circle-outline"
          iconColor="#8E8E93"
          label={t('settings.version')}
          isDark={isDark}
          right={
            <Text style={{ fontSize: 14, color: isDark ? '#777' : '#999' }}>
              {Constants.expoConfig?.version ?? '—'}
            </Text>
          }
        />
        <SettingRow
          icon="hammer-outline"
          iconColor="#8E8E93"
          label={t('settings.build')}
          isDark={isDark}
          right={
            <Text style={{ fontSize: 14, color: isDark ? '#777' : '#999' }}>
              {String(Constants.expoConfig?.android?.versionCode ?? '—')}
            </Text>
          }
        />
        <SettingRow
          icon="help-circle-outline"
          iconColor="#1D9E75"
          label={t('settings.support')}
          sublabel={t('settings.supportSublabel')}
          isDark={isDark}
          onPress={() => {
            const lang = i18n.language === 'tg' ? 'tg'
              : i18n.language === 'uz' ? 'uz'
              : i18n.language === 'ru' ? 'ru'
              : 'en';
            Linking.openURL(`${SUPPORT_URL}?lang=${lang}`);
          }}
        />
        <SettingRow
          icon="document-text-outline"
          iconColor="#8E8E93"
          label={t('settings.privacyPolicy')}
          isDark={isDark}
          onPress={() => {
            const lang = i18n.language === 'tg' ? 'tg'
              : i18n.language === 'uz' ? 'uz'
              : i18n.language === 'ru' ? 'ru'
              : 'en';
            Linking.openURL(`${PRIVACY_POLICY_URL}?lang=${lang}`);
          }}
        />
        <SettingRow
          icon="star-outline"
          iconColor="#FF9500"
          label={t('settings.rateApp')}
          isDark={isDark}
          isLast
          onPress={() => reviewService.openStoreListing()}
        />
      </SettingGroup>

      {/* ── ОПАСНАЯ ЗОНА ── */}
      {isOwner && (
        <>
          <SectionLabel label={t('settings.dangerZone')} isDark={isDark} />
          <SettingGroup isDark={isDark}>
            <SettingRow
              icon="trash-outline"
              iconColor="#FF3B30"
              label={t('settings.clearData')}
              isDark={isDark}
              isLast
              onPress={handleClearDataAlert}
            />
          </SettingGroup>
        </>
      )}

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const newStyles = StyleSheet.create({
  container: { flex: 1 },
  segmented: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
  },
  segBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 5,
    paddingVertical: 8, borderRadius: 8,
  },
  segBtnActive: {
    backgroundColor: '#1D9E75',
    shadowColor: '#1D9E75',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  segText: { fontSize: 13, fontWeight: '600' },
  numInput: {
    width: 60, textAlign: 'center',
    borderRadius: 8, padding: 8,
    fontSize: 15, borderWidth: 1,
  },
});
