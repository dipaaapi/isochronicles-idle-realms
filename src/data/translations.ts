import { useGameStore } from '../state/useGameStore';
import type { Language } from '../types/state';

export interface TranslationDictionary {
  // Navigation & General
  close: { en: string; tl: string };
  settings: { en: string; tl: string };
  info: { en: string; tl: string };
  upgrades: { en: string; tl: string };
  skills: { en: string; tl: string };
  status: { en: string; tl: string };
  resources: { en: string; tl: string };
  citadel: { en: string; tl: string };
  establishments: { en: string; tl: string };
  tenants: { en: string; tl: string };
  minions: { en: string; tl: string };
  market: { en: string; tl: string };
  armory: { en: string; tl: string };
  research: { en: string; tl: string };
  codex: { en: string; tl: string };
  bestiary: { en: string; tl: string };
  regression: { en: string; tl: string };
  faq: { en: string; tl: string };
  ready: { en: string; tl: string };
  useSkill: { en: string; tl: string };
  cooldown: { en: string; tl: string };
  repair: { en: string; tl: string };
  maxLevel: { en: string; tl: string };
  upgradeBuilding: { en: string; tl: string };
  upgradeTower: { en: string; tl: string };
  fullHp: { en: string; tl: string };
  insufficientMaterials: { en: string; tl: string };
  requiresEnt: { en: string; tl: string };
  autoBuyMaterialsNote: { en: string; tl: string };
  languageLabel: { en: string; tl: string };
  tagalog: { en: string; tl: string };
  english: { en: string; tl: string };
}

export const TRANSLATIONS: TranslationDictionary = {
  close: { en: 'Close', tl: 'Isara' },
  settings: { en: 'Settings', tl: 'Mga Setting' },
  info: { en: 'Info & Analysis', tl: 'Impormasyon & Pagsusuri' },
  upgrades: { en: 'Upgrades & Repair', tl: 'Mga Upgrade & Kumpuni' },
  skills: { en: 'Skills & Ultimates', tl: 'Mga Kakayahan & Ultimates' },
  status: { en: 'Status', tl: 'Kalagayan' },
  resources: { en: 'Resources', tl: 'Mga Yaman' },
  citadel: { en: 'Citadel', tl: 'Muog / Kastilyo' },
  establishments: { en: 'Establishments', tl: 'Mga Pasilidad' },
  tenants: { en: 'Tenants & Defenders', tl: 'Mga Umuupa & Tagapagtanggol' },
  minions: { en: 'Allied Minions', tl: 'Mga Kasamahang Alagad' },
  market: { en: 'Marketplace', tl: 'Pamilihan' },
  armory: { en: 'Forge & Armory', tl: 'Pandayan & Armas' },
  research: { en: 'Research Matrix', tl: 'Sentro ng Pagsasaliksik' },
  codex: { en: 'Codex & Lore', tl: 'Aklat ng Kasaysayan' },
  bestiary: { en: 'Bestiary', tl: 'Talaan ng mga Nilalang' },
  regression: { en: 'Regression / Rebirth', tl: 'Regresyon / Muling Pagkabuhay' },
  faq: { en: 'FAQ / Help', tl: 'Mga Madalas Itanong' },
  ready: { en: 'READY', tl: 'HANDA' },
  useSkill: { en: 'Use', tl: 'Gamitin' },
  cooldown: { en: 'Cooldown', tl: 'Pahinga' },
  repair: { en: 'Repair Building', tl: 'Kumpunihin ang Gusali' },
  maxLevel: { en: 'MAX LEVEL REACHED', tl: 'PINAKAMATAAS NA ANTAS' },
  upgradeBuilding: { en: 'Upgrade Building', tl: 'I-Upgrade ang Gusali' },
  upgradeTower: { en: 'Upgrade Tower', tl: 'I-Upgrade ang Tore' },
  fullHp: { en: 'HP Full', tl: 'Buo na ang HP' },
  insufficientMaterials: { en: 'Insufficient Materials', tl: 'Kulang ang Materyales' },
  requiresEnt: { en: 'Requires the Ent', tl: 'Kailangan ng Ent' },
  autoBuyMaterialsNote: {
    en: 'Auto-Buy is always active: missing upgrade materials are automatically purchased when supplies are sufficient.',
    tl: 'Laging aktibo ang Auto-Buy: awtomatikong binibili ang mga kulang na materyales kapag sapat ang barya at gamit.',
  },
  languageLabel: { en: 'Language', tl: 'Wika' },
  tagalog: { en: 'Tagalog / Filipino', tl: 'Tagalog / Filipino' },
  english: { en: 'English', tl: 'English' },
};

export function t(key: keyof TranslationDictionary, lang: Language): string {
  const item = TRANSLATIONS[key];
  if (!item) return String(key);
  return lang === 'TL' ? item.tl : item.en;
}

export function useTranslation() {
  const language = useGameStore((s) => s.language);
  const setLanguage = useGameStore((s) => s.setLanguage);
  return {
    language,
    setLanguage,
    t: (key: keyof TranslationDictionary) => t(key, language),
    isTL: language === 'TL',
  };
}

