import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ЯЗЫКОВЫЕ РЕСУРСЫ ЛЕНИВАЯ ЗАГРУЗКА
// Раньше все 8 языков (ru, tg, en, uz, uz-Cyrl, pt, it, es) собирались одним
// огромным JS-объектом (~6000 строк) и целиком строились в памяти при каждом
// холодном старте приложения, ещё до первого рендера. Это ощутимая часть
// задержки при открытии приложения.
//
// Теперь переводы разнесены по отдельным JSON-файлам (./locales/*.json),
// и при старте в память грузится только активный язык пользователя
// (+ ru как язык по умолчанию/fallback, если он ещё не активен).
// Остальные языки подгружаются лениво через i18n.addResourceBundle(),
// когда пользователь реально переключает язык в настройках.
//
// Metro должен видеть статические строки в require(), поэтому пути
// перечисляем явно, а не собираем динамическим шаблоном.
type SupportedLanguage = 'ru' | 'tg' | 'en' | 'uz' | 'uz-Cyrl' | 'pt' | 'it' | 'es';

const FALLBACK_LANGUAGE: SupportedLanguage = 'ru';

const localeLoaders: Record<SupportedLanguage, () => Record<string, unknown>> = {
  ru: () => require('./locales/ru.json'),
  tg: () => require('./locales/tg.json'),
  en: () => require('./locales/en.json'),
  uz: () => require('./locales/uz.json'),
  'uz-Cyrl': () => require('./locales/uz-Cyrl.json'),
  pt: () => require('./locales/pt.json'),
  it: () => require('./locales/it.json'),
  es: () => require('./locales/es.json'),
};

const loadedLanguages = new Set<string>();

function normalizeLanguage(lang?: string | null): SupportedLanguage {
  if (lang && Object.prototype.hasOwnProperty.call(localeLoaders, lang)) {
    return lang as SupportedLanguage;
  }
  return FALLBACK_LANGUAGE;
}

function ensureLanguageLoaded(lang?: string | null) {
  const normalized = normalizeLanguage(lang);
  if (loadedLanguages.has(normalized)) return;
  const translation = localeLoaders[normalized]();
  i18n.addResourceBundle(normalized, 'translation', translation, true, true);
  loadedLanguages.add(normalized);
}

const initI18n = async () => {
  const savedLanguage = await AsyncStorage.getItem('app_language');
  const activeLanguage = normalizeLanguage(savedLanguage);

  const initialResources: Record<string, { translation: Record<string, unknown> }> = {
    [FALLBACK_LANGUAGE]: { translation: localeLoaders[FALLBACK_LANGUAGE]() },
  };
  loadedLanguages.add(FALLBACK_LANGUAGE);

  if (activeLanguage !== FALLBACK_LANGUAGE) {
    initialResources[activeLanguage] = { translation: localeLoaders[activeLanguage]() };
    loadedLanguages.add(activeLanguage);
  }

  await i18n
    .use(initReactI18next)
    .init({
      resources: initialResources,
      lng: activeLanguage,
      fallbackLng: FALLBACK_LANGUAGE,
      interpolation: {
        escapeValue: false,
      },
      returnNull: false,
      react: {
        useSuspense: false,
      },
    });
};

initI18n();

// Единственное место переключения языка в приложении — AppContext.setLanguage,
// которое вызывает i18n.changeLanguage(lang). Оборачиваем этот метод, чтобы
// нужный словарь подгружался лениво прямо перед переключением, не трогая
// код самого AppContext.
const originalChangeLanguage = i18n.changeLanguage.bind(i18n);
i18n.changeLanguage = ((...args: Parameters<typeof i18n.changeLanguage>) => {
  ensureLanguageLoaded(args[0]);
  return originalChangeLanguage(...args);
}) as typeof i18n.changeLanguage;

export default i18n;
