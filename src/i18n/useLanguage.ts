import { useGameStore } from '../state/useGameStore';
import type { Language } from './faqTranslations';

/**
 * Tuple-style access to the one game language (the persisted store value), so
 * every screen — HUD, modals, FAQ — follows the same EN/TL toggle. English is
 * the default for new players.
 */
export function useLanguage(): [Language, (lang: Language) => void] {
  const language = useGameStore((s) => s.language);
  const setLanguage = useGameStore((s) => s.setLanguage);
  return [language, setLanguage];
}
