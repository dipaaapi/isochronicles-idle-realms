import { useGameStore } from '../state/useGameStore';
import type { Language } from '../types/state';
import UI_STRINGS from './uiStrings.json';

export type TranslationKey = keyof typeof UI_STRINGS;

export function t(key: TranslationKey, lang: Language): string {
  const item = UI_STRINGS[key];
  if (!item) return String(key);
  return lang === 'TL' ? item.tl : item.en;
}

export function useTranslation() {
  const language = useGameStore((s) => s.language);
  const setLanguage = useGameStore((s) => s.setLanguage);
  return {
    language,
    setLanguage,
    t: (key: TranslationKey) => t(key, language),
    isTL: language === 'TL',
  };
}
