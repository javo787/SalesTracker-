import React, { createContext, useState, useEffect, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Theme = 'light' | 'dark' | 'system';

interface Currency {
  code: string;
  label: string;
  symbol: string;
  country: string;
}

const CURRENCIES: Record<string, Currency> = {
  TJS: { code: 'TJS', label: 'Сомони', symbol: 'TJS', country: '🇹🇯 Таджикистан' },
  UZS: { code: 'UZS', label: 'Сум', symbol: 'сум', country: '🇺🇿 Узбекистан' },
  KZT: { code: 'KZT', label: 'Тенге', symbol: '₸', country: '🇰🇿 Казахстан' },
  KGS: { code: 'KGS', label: 'Сом', symbol: 'с', country: '🇰🇬 Кыргызстан' },
};

interface AppContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  currency: Currency;
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
  loading: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [theme, setThemeState] = useState<Theme>('system');
  const [currency, setCurrencyState] = useState<Currency>(CURRENCIES.TJS);
  const [language, setLanguageState] = useState('ru');
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const [defaultMinStockAlert, setDefaultMinStockAlertState] = useState(0);
  const [isPremium, setIsPremiumState] = useState(false);
  const [sellerMode, setSellerModeState] = useState<'retail' | 'wholesale'>('retail');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [savedTheme, savedCurrency, savedLang, savedNotifs, savedMinStock, savedPremium, savedSellerMode] = await Promise.all([
        AsyncStorage.getItem('app_theme'),
        AsyncStorage.getItem('app_currency'),
        AsyncStorage.getItem('app_language'),
        AsyncStorage.getItem('app_notifications_enabled'),
        AsyncStorage.getItem('app_default_min_stock'),
        AsyncStorage.getItem('app_is_premium'),
        AsyncStorage.getItem('app_seller_mode'),
      ]);

      if (savedTheme) {
        setThemeState(savedTheme as Theme);
      } else {
        // For new users, default to system
        setThemeState('system');
      }
      if (savedCurrency && CURRENCIES[savedCurrency]) setCurrencyState(CURRENCIES[savedCurrency]);
      if (savedLang) setLanguageState(savedLang);
      if (savedNotifs !== null) setNotificationsEnabledState(savedNotifs === 'true');
      if (savedMinStock !== null) setDefaultMinStockAlertState(parseInt(savedMinStock) || 0);
      if (savedPremium !== null) setIsPremiumState(savedPremium === 'true');
      if (savedSellerMode === 'retail' || savedSellerMode === 'wholesale') {
        setSellerModeState(savedSellerMode);
      }
    } catch (e) {
      console.error('Failed to load settings', e);
    } finally {
      setLoading(false);
    }
  };

  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme);
    await AsyncStorage.setItem('app_theme', newTheme);
  };

  const setCurrency = async (code: string) => {
    if (CURRENCIES[code]) {
      setCurrencyState(CURRENCIES[code]);
      await AsyncStorage.setItem('app_currency', code);
    }
  };

  const setLanguage = async (lang: string) => {
    setLanguageState(lang);
    await AsyncStorage.setItem('app_language', lang);
    const i18n = (await import('../i18n/i18n')).default;
    i18n.changeLanguage(lang);
  };

  const setNotificationsEnabled = async (enabled: boolean) => {
    setNotificationsEnabledState(enabled);
    await AsyncStorage.setItem('app_notifications_enabled', String(enabled));
  };

  const setDefaultMinStockAlert = async (value: number) => {
    setDefaultMinStockAlertState(value);
    await AsyncStorage.setItem('app_default_min_stock', String(value));
  };

  const setIsPremium = async (value: boolean) => {
    setIsPremiumState(value);
    await AsyncStorage.setItem('app_is_premium', String(value));
  };

  const setSellerMode = async (mode: 'retail' | 'wholesale') => {
    setSellerModeState(mode);
    await AsyncStorage.setItem('app_seller_mode', mode);
  };

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
    defaultMinStockAlert,
    isPremium,
    sellerMode,
    setSellerMode,
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
