import { createContext, useContext, useMemo, useState } from 'react';
import { dictionary } from './dictionary';

const STORAGE_KEY = 'mlb-quant-ops-language';
const LanguageContext = createContext(null);

function getInitialLanguage() {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'es' || stored === 'en' ? stored : 'en';
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(getInitialLanguage);

  function setLanguage(nextLanguage) {
    const normalized = nextLanguage === 'es' ? 'es' : 'en';
    setLanguageState(normalized);
    window.localStorage.setItem(STORAGE_KEY, normalized);
  }

  const value = useMemo(() => ({
    language,
    setLanguage,
    t(key) {
      return dictionary[language]?.[key] || dictionary.en[key] || key;
    },
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider');
  return context;
}
