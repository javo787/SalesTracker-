import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Theme = 'light' | 'dark';

interface Currency {
  code: string;
  label: string;
  symbol: string;
  country: string;
}

const CURRENCIES: Record<string, Currency> = {
  TJS: { code: 'TJS', label: 'Сомони', symbol: 'сом', country: '🇹🇯 Таджикистан' },
  UZS: { code: 'UZS', label: 'Сум', symbol: 'сум', country: '🇺🇿 Узбекистан' },
  KZT: { code: 'KZT', label: 'Тенге', symbol: '₸', country: '🇰🇿 Казахстан' },
  KGS: { code: 'KGS', label: 'Сом', symbol: 'с', country: '🇰🇬 Кыргызстан' },
};

interface AppContextType {
  theme: Theme;
  currency: Currency;
  language: string;
  setTheme: (theme: Theme) => void;
  setCurrency: (code: string) => void;
  setLanguage: (lang: string) => void;
  loading: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>('light');
  const [currency, setCurrencyState] = useState<Currency>(CURRENCIES.TJS);
  const [language, setLanguageState] = useState('ru');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [savedTheme, savedCurrency, savedLang] = await Promise.all([
        AsyncStorage.getItem('app_theme'),
        AsyncStorage.getItem('app_currency'),
        AsyncStorage.getItem('app_language'),
      ]);

      if (savedTheme) setThemeState(savedTheme as Theme);
      if (savedCurrency && CURRENCIES[savedCurrency]) setCurrencyState(CURRENCIES[savedCurrency]);
      if (savedLang) setLanguageState(savedLang);
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

  return (
    <AppContext.Provider value={{
      theme,
      currency,
      language,
      setTheme,
      setCurrency,
      setLanguage,
      loading
    }}>
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
