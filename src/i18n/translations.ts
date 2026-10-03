import { useGameStore } from '../state/useGameStore';
import type { Language } from '../types/state';
import UI_STRINGS from './uiStrings.json';
import { UNIT_CLASSES } from '../data/units';

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

/** Picks the English or Tagalog variant for the given language. */
export const pick = <T,>(lang: Language, en: T, tl: T): T => (lang === 'TL' ? tl : en);

/**
 * Display name of a roster unit in the player's language. Units are named
 * "<class name> <n>" when summoned (older saves used the Tagalog class name),
 * so the class prefix is swapped for the localized one.
 */
export function unitName(name: string, unitClass: keyof typeof UNIT_CLASSES, lang: Language): string {
  const cfg = UNIT_CLASSES[unitClass];
  if (!cfg) return name;
  const target = lang === 'TL' ? cfg.name : cfg.nameEn;
  for (const prefix of [cfg.nameEn, cfg.name]) {
    if (prefix && name.startsWith(`${prefix} `)) return `${target}${name.slice(prefix.length)}`;
  }
  return name;
}
