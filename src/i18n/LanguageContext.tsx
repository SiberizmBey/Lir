import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import trTranslations from './locales/tr.json';
import enTranslations from './locales/en.json';

export type Language = 'tr' | 'en';
export type LanguageMode = 'auto' | 'tr' | 'en';

export interface LanguageOption {
  code: LanguageMode;
  name: string;
  nativeName: string;
  flag: string;
  description: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  {
    code: 'auto',
    name: 'Otomatik (Sistem Dili)',
    nativeName: 'Auto (System Language)',
    flag: '🌐',
    description: 'İşletim sistemi ve tarayıcı dilini otomatik algılar',
  },
  {
    code: 'tr',
    name: 'Türkçe',
    nativeName: 'Türkçe',
    flag: '🇹🇷',
    description: 'Türkçe arayüz ve yerelleştirilmiş içerik',
  },
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    flag: '🇬🇧',
    description: 'English user interface and localized content',
  },
];

export const STORAGE_KEY_LANGUAGE = 'lir_language_v1';

// Registry of dictionaries
const TRANSLATIONS: Record<Language, any> = {
  tr: trTranslations,
  en: enTranslations,
};

interface LanguageContextType {
  language: Language;
  languageMode: LanguageMode;
  setLanguage: (mode: LanguageMode) => void;
  languages: LanguageOption[];
  t: (key: string, params?: Record<string, string | number | undefined>) => string;
  isTurkish: boolean;
  isEnglish: boolean;
  systemDetectedLanguage: Language;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function detectSystemLanguage(): Language {
  if (typeof navigator !== 'undefined') {
    const list = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const item of list) {
      if (!item) continue;
      const lower = item.toLowerCase();
      if (lower.startsWith('tr')) return 'tr';
      if (lower.startsWith('en')) return 'en';
    }
    const primary = (navigator.language || '').toLowerCase();
    if (primary.startsWith('tr')) return 'tr';
    // For any other international language, default to English
    return 'en';
  }
  return 'tr';
}

function resolveKey(obj: any, path: string): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const segments = path.split('.');
  let current: any = obj;
  for (const segment of segments) {
    if (current && typeof current === 'object' && segment in current) {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return typeof current === 'string' ? current : undefined;
}

function interpolate(template: string, params?: Record<string, string | number | undefined>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return params[key] !== undefined ? String(params[key]) : `{${key}}`;
  });
}

function getInitialLanguageMode(): LanguageMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_LANGUAGE);
    if (saved === 'auto' || saved === 'tr' || saved === 'en') {
      return saved;
    }
  } catch (err) {
    console.warn('Could not read saved language from localStorage:', err);
  }
  // Default to 'auto' for automatic language detection
  return 'auto';
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [languageMode, setLanguageMode] = useState<LanguageMode>(getInitialLanguageMode);
  const [systemDetectedLanguage, setSystemDetectedLanguage] = useState<Language>(detectSystemLanguage);

  useEffect(() => {
    const updateDetected = () => {
      setSystemDetectedLanguage(detectSystemLanguage());
    };
    window.addEventListener('languagechange', updateDetected);
    return () => window.removeEventListener('languagechange', updateDetected);
  }, []);

  const language: Language = useMemo(() => {
    if (languageMode === 'auto') {
      return systemDetectedLanguage;
    }
    return languageMode;
  }, [languageMode, systemDetectedLanguage]);

  const setLanguage = useCallback((newMode: LanguageMode) => {
    setLanguageMode(newMode);
    try {
      localStorage.setItem(STORAGE_KEY_LANGUAGE, newMode);
    } catch (err) {
      console.warn('Could not save language to localStorage:', err);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === STORAGE_KEY_LANGUAGE &&
        (event.newValue === 'auto' || event.newValue === 'tr' || event.newValue === 'en')
      ) {
        setLanguageMode(event.newValue as LanguageMode);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [language]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number | undefined>): string => {
      const activeDict = TRANSLATIONS[language] || TRANSLATIONS['tr'];
      const fallbackDict = TRANSLATIONS['tr'];

      let found = resolveKey(activeDict, key);
      if (found === undefined && activeDict !== fallbackDict) {
        found = resolveKey(fallbackDict, key);
      }

      if (found === undefined) {
        return key;
      }

      return interpolate(found, params);
    },
    [language]
  );

  const value = useMemo(
    () => ({
      language,
      languageMode,
      setLanguage,
      languages: SUPPORTED_LANGUAGES,
      t,
      isTurkish: language === 'tr',
      isEnglish: language === 'en',
      systemDetectedLanguage,
    }),
    [language, languageMode, setLanguage, t, systemDetectedLanguage]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) {
    const sysLang = detectSystemLanguage();
    const fallbackT = (key: string, params?: Record<string, string | number | undefined>) => {
      const dict = TRANSLATIONS[sysLang] || TRANSLATIONS['tr'];
      const val = resolveKey(dict, key) || resolveKey(TRANSLATIONS['tr'], key) || key;
      return interpolate(val, params);
    };

    return {
      language: sysLang,
      languageMode: 'auto' as LanguageMode,
      setLanguage: () => {},
      languages: SUPPORTED_LANGUAGES,
      t: fallbackT,
      isTurkish: sysLang === 'tr',
      isEnglish: sysLang === 'en',
      systemDetectedLanguage: sysLang,
    };
  }
  return context;
}
