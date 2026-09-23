import { useCallback, useEffect, useState } from 'react';
import type { Language } from './faqTranslations';

const STORAGE_KEY = 'game-language';
const DEFAULT_LANGUAGE: Language = 'EN';

function readStoredLanguage(): Language {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'TL' ? 'TL' : DEFAULT_LANGUAGE;
}

// Simple pub-sub so every component using this hook stays in sync
const listeners = new Set<(lang: Language) => void>();
let currentLanguage: Language = readStoredLanguage();

function setGlobalLanguage(lang: Language) {
  currentLanguage = lang;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, lang);
  }
  listeners.forEach((listener) => listener(lang));
}

export function useLanguage(): [Language, (lang: Language) => void] {
  const [language, setLanguageState] = useState<Language>(currentLanguage);

  useEffect(() => {
    listeners.add(setLanguageState);
    return () => { listeners.delete(setLanguageState); };
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setGlobalLanguage(lang);
  }, []);

  return [language, setLanguage];
}