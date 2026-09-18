import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { translations, type Lang, type TranslationKey } from '@/data/i18n';

interface LanguageContextValue {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  t: (key: TranslationKey) => string;
  toggleLang: () => void;
  setLang: (lang: Lang) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('ar');

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => (prev === 'ar' ? 'en' : 'ar'));
  }, []);

  useEffect(() => {
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang]);

  const t = useCallback((key: TranslationKey) => translations[lang][key], [lang]);

  return (
    <LanguageContext.Provider value={{ lang, dir: lang === 'ar' ? 'rtl' : 'ltr', t, toggleLang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used within LanguageProvider');
  return ctx;
}
