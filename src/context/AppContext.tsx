import React, { createContext, useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../i18n/i18n';
import { ALL_CURRENCIES, CURRENCIES_MAP, CurrencyDef } from '../constants/currencies';

type Theme = 'light' | 'dark' | 'system';

interface AppContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  currency: CurrencyDef;
  language: string;
  setTheme: (theme: Theme) => void;
  setCurrency: (code: string) => void;
  setLanguage: (lang: string) => void;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => Promise<void>;
  defaultMinStockAlert: number;
  setDefaultMinStockAlert: (value: number) => Promise<void>;
  isPremium: boolean;
  setIsPremium: (value: boolean) => Promise<void>;
  sellerMode: 'retail' | 'wholesale';
  setSellerMode: (mode: 'retail' | 'wholesale') => Promise<void>;
  showGreeting: boolean;
  showDailyTip: boolean;
  setShowGreeting: (value: boolean) => Promise<void>;
  setShowDailyTip: (value: boolean) => Promise<void>;
  loading: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [theme, setThemeState] = useState<Theme>('system');
  const [currency, setCurrencyState] = useState<CurrencyDef>(CURRENCIES_MAP.TJS);
  const [language, setLanguageState] = useState('ru');
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const [defaultMinStockAlert, setDefaultMinStockAlertState] = useState(0);
  const [isPremium, setIsPremiumState] = useState(false);
  const [sellerMode, setSellerModeState] = useState<'retail' | 'wholesale'>('retail');
  const [showGreetingState, setShowGreetingState] = useState(false);
  const [showDailyTipState, setShowDailyTipState] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [
        savedTheme, savedCurrency, savedLang, savedNotifs,
        savedMinStock, savedPremium, savedSellerMode,
        savedShowGreeting, savedShowDailyTip
      ] = await Promise.all([
        AsyncStorage.getItem('app_theme'),
        AsyncStorage.getItem('app_currency'),
        AsyncStorage.getItem('app_language'),
        AsyncStorage.getItem('app_notifications_enabled'),
        AsyncStorage.getItem('app_default_min_stock'),
        AsyncStorage.getItem('app_is_premium'),
        AsyncStorage.getItem('app_seller_mode'),
        AsyncStorage.getItem('app_show_greeting'),
        AsyncStorage.getItem('app_show_daily_tip'),
      ]);

      if (savedTheme) {
        setThemeState(savedTheme as Theme);
      } else {
        // For new users, default to system
        setThemeState('system');
      }
      if (savedCurrency && CURRENCIES_MAP[savedCurrency]) setCurrencyState(CURRENCIES_MAP[savedCurrency]);
      if (savedLang) setLanguageState(savedLang);
      if (savedNotifs !== null) setNotificationsEnabledState(savedNotifs === 'true');
      if (savedMinStock !== null) setDefaultMinStockAlertState(parseInt(savedMinStock) || 0);
      if (savedPremium !== null) setIsPremiumState(savedPremium === 'true');
      if (savedSellerMode === 'retail' || savedSellerMode === 'wholesale') {
        setSellerModeState(savedSellerMode);
      }
      if (savedShowGreeting !== null) setShowGreetingState(savedShowGreeting === 'true');
      if (savedShowDailyTip !== null) setShowDailyTipState(savedShowDailyTip === 'true');
    } catch (e) {
      console.error('Failed to load settings', e);
    } finally {
      setLoading(false);
    }
  };

  const setTheme = useCallback(async (newTheme: Theme) => {
    setThemeState(newTheme);
    await AsyncStorage.setItem('app_theme', newTheme);
  }, []);

  const setCurrency = useCallback(async (code: string) => {
    if (CURRENCIES_MAP[code]) {
      setCurrencyState(CURRENCIES_MAP[code]);
      await AsyncStorage.setItem('app_currency', code);
    }
  }, []);

  const setShowGreeting = useCallback(async (value: boolean) => {
    setShowGreetingState(value);
    await AsyncStorage.setItem('app_show_greeting', String(value));
  }, []);

  const setShowDailyTip = useCallback(async (value: boolean) => {
    setShowDailyTipState(value);
    await AsyncStorage.setItem('app_show_daily_tip', String(value));
  }, []);

  const setLanguage = useCallback(async (lang: string) => {
    setLanguageState(lang);
    await AsyncStorage.setItem('app_language', lang);
    await i18n.changeLanguage(lang);
  }, []);

  const setNotificationsEnabled = useCallback(async (enabled: boolean) => {
    setNotificationsEnabledState(enabled);
    await AsyncStorage.setItem('app_notifications_enabled', String(enabled));
  }, []);

  const setDefaultMinStockAlert = useCallback(async (value: number) => {
    setDefaultMinStockAlertState(value);
    await AsyncStorage.setItem('app_default_min_stock', String(value));
  }, []);

  const setIsPremium = useCallback(async (value: boolean) => {
    setIsPremiumState(value);
    await AsyncStorage.setItem('app_is_premium', String(value));
  }, []);

  const setSellerMode = useCallback(async (mode: 'retail' | 'wholesale') => {
    setSellerModeState(mode);
    await AsyncStorage.setItem('app_seller_mode', mode);
  }, []);

  const resolvedTheme = useMemo(() => {
    if (theme === 'system') {
      return systemColorScheme === 'dark' ? 'dark' : 'light';
    }
    return theme;
  }, [theme, systemColorScheme]);

  const contextValue = useMemo(() => ({
    theme,
    resolvedTheme,
    currency,
    language,
    notificationsEnabled,
    setNotificationsEnabled,
    defaultMinStockAlert,
    setDefaultMinStockAlert,
    isPremium,
    setIsPremium,
    sellerMode,
    setSellerMode,
    showGreeting: showGreetingState,
    showDailyTip: showDailyTipState,
    setShowGreeting,
    setShowDailyTip,
    setTheme,
    setCurrency,
    setLanguage,
    loading
  }), [
    theme,
    resolvedTheme,
    currency,
    language,
    notificationsEnabled,
    setNotificationsEnabled,
    defaultMinStockAlert,
    setDefaultMinStockAlert,
    isPremium,
    setIsPremium,
    sellerMode,
    setSellerMode,
    showGreetingState,
    showDailyTipState,
    setShowGreeting,
    setShowDailyTip,
    setTheme,
    setCurrency,
    setLanguage,
    loading
  ]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppContextProvider');
  }
  return context;
};
