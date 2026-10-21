import React, { useState, useEffect } from 'react';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from '../game/audio/soundFx';
import { faqTranslations } from '../i18n/faqTranslations';
import loreMarkdownEn from '../../LORE.md?raw';
import loreMarkdownTl from '../../LORE.tl.md?raw';
import ATLAS_GUIDE from '../i18n/atlasGuide.json';
import {
  X,
  Compass,
  BookOpen,
  HelpCircle,
  Scroll,
  Sparkles,
  Flame,
  Swords,
  Lock,
  Search,
  Castle,
  Trophy,
} from 'lucide-react';
import {
  UNIT_CLASSES,
  INVADER_CONFIGS,
  UnitClass,
  InvaderType,
  PLATFORM_CONFIGS,
  SEASON_CONFIGS,
} from '../types/game';
import { BEAST_PORTRAITS, INVADER_PORTRAITS } from '../game/bestiaryPortraits';
import { type Localized } from '../state/skillTree';
import { StructureAtlas } from './StructureAtlas';
import STRUCTURE_TEXT from '../i18n/structureAtlas.json';
import { useTranslation } from '../i18n/translations';

import { HallOfLegacy } from './HallOfLegacy';
import { formatPlayTime } from '../state/legacy';

export type AtlasTab = 'GUIDE' | 'BESTIARY' | 'STRUCTURES' | 'LEGACY' | 'FAQ' | 'LORE';

interface AtlasModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSection?: AtlasTab;
}

interface LoreSection {
  heading: string;
  /** Paragraphs; a paragraph made only of "- " lines is a bullet list. */
  blocks: Array<{ text: string } | { items: string[] }>;
  plain: string;
}

/** Splits LORE markdown into `##` sections with paragraphs and bullet lists. */
const parseLore = (markdown: string): LoreSection[] =>
  markdown
    .replace(/\r\n/g, '\n')
    .split(/\n(?=## )/)
    .filter((section) => section.startsWith('## '))
    .map((section) => {
      const [heading, ...rest] = section.trim().split('\n');
      const blocks = rest
        .join('\n')
        .split(/\n\s*\n/)
        .map((para) => para.trim())
        .filter(Boolean)
        .map((para) => {
          const lines = para.split('\n');
          return lines.every((line) => line.startsWith('- '))
            ? { items: lines.map((line) => line.slice(2)) }
            : { text: lines.join(' ') };
        });
      return {
        heading: heading.replace(/^##\s*/, ''),
        blocks,
        plain: rest.join(' ').replace(/\*\*/g, ''),
      };
    })
    .filter((section) => section.heading && section.blocks.length > 0);

const LORE: Record<'EN' | 'TL', LoreSection[]> = {
  EN: parseLore(loreMarkdownEn),
  TL: parseLore(loreMarkdownTl),
};

/** Renders the **bold** spans of a guide / lore line. */
const richText = (text: string) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="text-slate-100">{part.slice(2, -2)}</strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );

// Literal class names so Tailwind keeps them
const GUIDE_COLORS: Record<string, { card: string; title: string; badge: string }> = {
  sky: { card: 'border-sky-500/30 bg-sky-950/20', title: 'text-sky-300', badge: 'bg-sky-500/30 border-sky-400/50' },
  emerald: { card: 'border-emerald-500/30 bg-emerald-950/20', title: 'text-emerald-300', badge: 'bg-emerald-500/30 border-emerald-400/50' },
  amber: { card: 'border-amber-500/30 bg-amber-950/20', title: 'text-amber-300', badge: 'bg-amber-500/30 border-amber-400/50' },
  purple: { card: 'border-purple-500/30 bg-purple-950/20', title: 'text-purple-300', badge: 'bg-purple-500/30 border-purple-400/50' },
  rose: { card: 'border-rose-500/30 bg-rose-950/20', title: 'text-rose-300', badge: 'bg-rose-500/30 border-rose-400/50' },
  indigo: { card: 'border-indigo-500/30 bg-indigo-950/20', title: 'text-indigo-300', badge: 'bg-indigo-500/30 border-indigo-400/50' },
  orange: { card: 'border-orange-500/30 bg-orange-950/20', title: 'text-orange-300', badge: 'bg-orange-500/30 border-orange-400/50' },
  cyan: { card: 'border-cyan-500/30 bg-cyan-950/20', title: 'text-cyan-300', badge: 'bg-cyan-500/30 border-cyan-400/50' },
  fuchsia: { card: 'border-fuchsia-500/30 bg-fuchsia-950/20', title: 'text-fuchsia-300', badge: 'bg-fuchsia-500/30 border-fuchsia-400/50' },
  violet: { card: 'border-violet-500/30 bg-violet-950/20', title: 'text-violet-300', badge: 'bg-violet-500/30 border-violet-400/50' },
};

const PHASE_ICONS: Record<1 | 2 | 3 | 4, string> = { 1: '🔥', 2: '🌋', 3: '❄️', 4: '✨' };

export const AtlasModal: React.FC<AtlasModalProps> = ({
  isOpen,
  onClose,
  initialSection = 'GUIDE',
}) => {
  const { t: tr } = useTranslation();
  const {
    language,
    discoveredBeasts,
    discoveredInvaders,
    invasion,
    platformPhase,
    day,
    year,
    season,
    lordName,
    playSeconds,
    difficulty,
  } = useGameStore();

  const isTL = language === 'TL';

  const [activeTab, setActiveTab] = useState<AtlasTab>(initialSection);
  const [bestiarySubTab, setBestiarySubTab] = useState<'BEASTS' | 'INVADERS'>('BEASTS');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialSection);
      setSearchQuery('');
    }
  }, [isOpen, initialSection]);

  if (!isOpen) return null;

  // Bestiary helpers
  const byRole = <K extends string>(keys: K[], roleOf: (k: K) => string) => [
    ...keys.filter((k) => roleOf(k) === 'RULER'),
    ...keys.filter((k) => roleOf(k) !== 'RULER'),
  ];
  const beastKeys = byRole(Object.keys(UNIT_CLASSES) as UnitClass[], (k) => UNIT_CLASSES[k].role);
  const invaderKeys = byRole(
    Object.keys(INVADER_CONFIGS) as InvaderType[],
    (k) => INVADER_CONFIGS[k].role
  );

  const totalBeasts = beastKeys.length;
  const unlockedBeastsCount = beastKeys.filter((k) => discoveredBeasts?.includes(k)).length;
  const totalInvaders = invaderKeys.length;
  const unlockedInvadersCount = invaderKeys.filter((k) =>
    discoveredInvaders?.includes(k)
  ).length;

  const currentPlatform = PLATFORM_CONFIGS[platformPhase || 1];
  const t = (text: Localized) => (isTL ? text.tl : text.en);

  // FAQ & Lore helpers
  const faqContent = faqTranslations[language] || faqTranslations.EN;

  const filteredFaq = faqContent.entries.filter(
    (item) =>
      item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredLore = (LORE[language] ?? LORE.EN).filter(
    (item) =>
      item.heading.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.plain.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="game-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 md:p-6 select-none animate-in fade-in duration-200">
      <div className="game-modal relative w-full max-w-5xl h-[90vh] flex flex-col rounded-3xl border border-sky-500/40 bg-slate-950/95 shadow-2xl shadow-sky-950/80 overflow-hidden">
        
        {/* TOP HEADER */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
              <Compass className="w-5 h-5 animate-spin-slow" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-black tracking-wide text-white flex items-center gap-2">
                <span>{isTL ? 'Atlas ng Kaharian' : 'Realm Atlas'}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/20 border border-sky-400/40 text-sky-300 font-mono uppercase tracking-wider">
                  {t(ATLAS_GUIDE.header.badge)}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                {isTL
                  ? 'Gabay, Talaan ng mga Nilalang, Bulwagan ng Pamana, FAQ, at Kasaysayan ng Nether Realm.'
                  : 'Your complete companion for Guides, Bestiary, the Hall of Legacy, FAQ, and Nether Realm Lore.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              soundFx.playClick();
              onClose();
            }}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* NAVIGATION BAR & SEARCH */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 px-5 py-2.5 border-b border-slate-800/80 bg-slate-900/40">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            {/* TAB 1: GUIDE */}
            <button
              onClick={() => {
                soundFx.playClick();
                setActiveTab('GUIDE');
              }}
              className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'GUIDE'
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{isTL ? 'Gabay' : 'Guide'}</span>
            </button>

            {/* TAB 2: BESTIARY */}
            <button
              onClick={() => {
                soundFx.playClick();
                setActiveTab('BESTIARY');
              }}
              className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'BESTIARY'
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-300" />
              <span>{isTL ? 'Talaan' : 'Bestiary'}</span>
            </button>

            {/* TAB 3: STRUCTURES */}
            <button
              onClick={() => {
                soundFx.playClick();
                setActiveTab('STRUCTURES');
              }}
              className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'STRUCTURES'
                  ? 'bg-amber-700 text-white shadow-md shadow-amber-700/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Castle className="w-3.5 h-3.5 text-amber-300" />
              <span>{t(STRUCTURE_TEXT.tab)}</span>
            </button>

            {/* TAB 3: HALL OF LEGACY */}
            <button
              onClick={() => {
                soundFx.playClick();
                setActiveTab('LEGACY');
              }}
              className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'LEGACY'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Trophy className="w-3.5 h-3.5 text-amber-300" />
              <span>{tr('legacyTitle')}</span>
            </button>

            {/* TAB 4: FAQ */}
            <button
              onClick={() => {
                soundFx.playClick();
                setActiveTab('FAQ');
              }}
              className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'FAQ'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>FAQ</span>
            </button>

            {/* TAB 5: LORE */}
            <button
              onClick={() => {
                soundFx.playClick();
                setActiveTab('LORE');
              }}
              className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'LORE'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Scroll className="w-3.5 h-3.5" />
              <span>{isTL ? 'Kuwento' : 'Lore'}</span>
            </button>
          </div>

          {(activeTab === 'FAQ' || activeTab === 'LORE' || activeTab === 'BESTIARY' || activeTab === 'STRUCTURES') && (
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 pointer-events-none" />
              <input
                type="text"
                placeholder={isTL ? 'Maghanap sa Atlas...' : 'Search Atlas...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-64 pl-8 pr-3 py-1.5 rounded-xl border border-slate-800 bg-slate-950 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500 transition"
              />
            </div>
          )}
        </div>

        {/* WORKSPACE BODY */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar space-y-4">
          
          {/* ================= TAB 1: GUIDE ================= */}
          {activeTab === 'GUIDE' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {ATLAS_GUIDE.steps.map((step, index) => {
                  const color = GUIDE_COLORS[step.color] ?? GUIDE_COLORS.sky;
                  return (
                    <div key={index} className={`glass-panel p-4 rounded-2xl border ${color.card}`}>
                      <div className={`flex items-center gap-2.5 font-bold mb-2 text-sm ${color.title}`}>
                        <span className={`w-7 h-7 shrink-0 rounded-xl border flex items-center justify-center text-xs font-mono text-white ${color.badge}`}>
                          {index + 1}
                        </span>
                        <span>{step.icon} {t(step.title)}</span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed pl-9">{richText(t(step.body))}</p>
                    </div>
                  );
                })}
              </div>

              {/* 4 Realm Phases */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/40 via-slate-900 to-slate-900 border border-purple-500/30">
                <h3 className="text-xs font-bold uppercase tracking-wider text-purple-300 mb-2 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>{t(ATLAS_GUIDE.header.phasesTitle)}</span>
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1 text-center">
                  {([1, 2, 3, 4] as const).map((phase) => {
                    const cfg = PLATFORM_CONFIGS[phase];
                    return (
                      <div
                        key={phase}
                        className={`p-2.5 rounded-xl bg-slate-950/70 border ${platformPhase === phase ? 'border-purple-500' : 'border-slate-800'}`}
                      >
                        <div className="text-lg">{PHASE_ICONS[phase]}</div>
                        <div className="text-xs font-bold text-slate-200 mt-1">{isTL ? cfg.name : cfg.nameEn}</div>
                        <div className="text-[10px] text-slate-500">{platformPhase === phase ? t(ATLAS_GUIDE.header.biomeCurrent) : t(ATLAS_GUIDE.header.biomePick)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 2: BESTIARY ================= */}
          {activeTab === 'BESTIARY' && (
            <div className="space-y-4">
              {/* Beast / Invader Sub-Navigation */}
              <div className="grid grid-cols-2 gap-2 bg-slate-900/70 p-1.5 rounded-2xl border border-slate-800">
                <button
                  onClick={() => {
                    soundFx.playClick();
                    setBestiarySubTab('BEASTS');
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                    bestiarySubTab === 'BEASTS'
                      ? 'bg-gradient-to-r from-red-600 to-amber-600 text-white shadow-lg shadow-red-600/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5 text-amber-300" />
                  <span>{isTL ? 'Mga Alagad na Demonyo at Halimaw' : 'Demon Servants & Monsters'}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/40 font-mono">
                    {unlockedBeastsCount}/{totalBeasts}
                  </span>
                </button>

                <button
                  onClick={() => {
                    soundFx.playClick();
                    setBestiarySubTab('INVADERS');
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                    bestiarySubTab === 'INVADERS'
                      ? 'bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-lg shadow-sky-600/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Swords className="w-3.5 h-3.5 text-sky-300" />
                  <span>{isTL ? 'Mga Kalabang Tao at Mecha' : 'Invading Humans & Mechas'}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/40 font-mono">
                    {unlockedInvadersCount}/{totalInvaders}
                  </span>
                </button>
              </div>

              {/* BEASTS GRID */}
              {bestiarySubTab === 'BEASTS' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {beastKeys
                    .filter((key) => {
                      if (!searchQuery) return true;
                      const config = UNIT_CLASSES[key];
                      const q = searchQuery.toLowerCase();
                      return (
                        config.name.toLowerCase().includes(q) ||
                        (config.nameEn && config.nameEn.toLowerCase().includes(q)) ||
                        config.description.toLowerCase().includes(q) ||
                        (config.descriptionEn && config.descriptionEn.toLowerCase().includes(q))
                      );
                    })
                    .map((key) => {
                      const config = UNIT_CLASSES[key];
                      const isDiscovered = Boolean(discoveredBeasts && discoveredBeasts.includes(key));
                      const portraitSrc = BEAST_PORTRAITS[key];

                      return (
                        <div
                          key={key}
                          className={`relative p-3.5 rounded-2xl border transition-all flex flex-col ${
                            isDiscovered
                              ? 'bg-slate-900/80 border-red-500/30 hover:border-red-400/60 shadow-md'
                              : 'bg-slate-950/90 border-slate-800/80 opacity-75'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Avatar Portrait / Silhouette */}
                            <div
                              className={`w-14 h-14 shrink-0 rounded-2xl overflow-hidden border shadow-inner ${
                                isDiscovered ? 'border-red-500/40' : 'border-slate-800'
                              }`}
                            >
                              {isDiscovered && portraitSrc ? (
                                <img
                                  src={portraitSrc}
                                  alt={config.nameEn || config.name}
                                  className="w-full h-full object-cover [image-rendering:pixelated]"
                                  draggable={false}
                                />
                              ) : (
                                <div className="w-full h-full bg-black flex items-center justify-center">
                                  {portraitSrc ? (
                                    <img
                                      src={portraitSrc}
                                      alt=""
                                      className="w-full h-full object-cover [image-rendering:pixelated] grayscale brightness-[0.3] contrast-150 blur-[1.5px] opacity-80"
                                      draggable={false}
                                    />
                                  ) : (
                                    <span className="text-slate-700 text-2xl font-black opacity-30">
                                      {config.iconEmoji || '👹'}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <h3
                                  className={`font-bold text-sm tracking-wide ${
                                    isDiscovered ? 'text-white' : 'text-slate-500 italic'
                                  }`}
                                >
                                  {isDiscovered
                                    ? (isTL ? config.name : (config.nameEn || config.name))
                                    : (isTL ? '❓ Hindi pa Natutuklasan' : '❓ Undiscovered')}
                                  {config.role === 'RULER' && (
                                    <span className="ml-1.5 text-[9px] font-black uppercase tracking-wider text-amber-300">
                                      👑 {isTL ? 'Pinuno' : 'Ruler'}
                                    </span>
                                  )}
                                </h3>
                                {isDiscovered ? (
                                  <span className="shrink-0 text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                                    {isTL ? 'Bukas ✨' : 'Unlocked ✨'}
                                  </span>
                                ) : (
                                  <span className="shrink-0 text-[10px] font-bold text-slate-500 bg-slate-900 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Lock className="w-2.5 h-2.5" /> {isTL ? 'Nakatago' : 'Locked'}
                                  </span>
                                )}
                              </div>

                              <p className="text-xs text-amber-300/90 font-medium mt-0.5">
                                {isDiscovered
                                  ? (isTL ? config.subtitle : (config.subtitleEn || config.subtitle))
                                  : (isTL ? 'Isang misteryosong nilalang...' : 'A mysterious creature...')}
                              </p>

                              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                                {isDiscovered
                                  ? (isTL ? config.description : (config.descriptionEn || config.description))
                                  : (isTL ? 'Magpatuloy sa paglalaro upang mabuksan ang talaan ng nilalang na ito.' : 'Continue playing to discover this creature\'s codex entry.')}
                              </p>

                              {isDiscovered && (
                                <div className="mt-2.5 flex items-center gap-2 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-300">
                                  <span>⚔️ {config.baseAttack} DMG</span>
                                  <span>💚 {config.baseHp} HP</span>
                                  <span>⚡ {config.baseSpeed} SPD</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              {/* INVADERS GRID */}
              {bestiarySubTab === 'INVADERS' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {invaderKeys
                    .filter((key) => {
                      if (!searchQuery) return true;
                      const config = INVADER_CONFIGS[key];
                      const q = searchQuery.toLowerCase();
                      return (
                        config.name.toLowerCase().includes(q) ||
                        (config.nameEn && config.nameEn.toLowerCase().includes(q)) ||
                        config.description.toLowerCase().includes(q) ||
                        (config.descriptionEn && config.descriptionEn.toLowerCase().includes(q))
                      );
                    })
                    .map((key) => {
                      const config = INVADER_CONFIGS[key];
                      const isDiscovered = Boolean(discoveredInvaders && discoveredInvaders.includes(key));
                      const portraitSrc = INVADER_PORTRAITS[key];

                      return (
                        <div
                          key={key}
                          className={`relative p-3.5 rounded-2xl border transition-all flex flex-col ${
                            isDiscovered
                              ? 'bg-slate-900/80 border-sky-500/30 hover:border-sky-400/60 shadow-md'
                              : 'bg-slate-950/90 border-slate-800/80 opacity-75'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Avatar Portrait / Silhouette */}
                            <div
                              className={`w-14 h-14 shrink-0 rounded-2xl overflow-hidden border shadow-inner ${
                                isDiscovered ? 'border-sky-500/40' : 'border-slate-800'
                              }`}
                            >
                              {isDiscovered && portraitSrc ? (
                                <img
                                  src={portraitSrc}
                                  alt={config.nameEn || config.name}
                                  className="w-full h-full object-cover [image-rendering:pixelated]"
                                  draggable={false}
                                />
                              ) : (
                                <div className="w-full h-full bg-black flex items-center justify-center">
                                  {portraitSrc ? (
                                    <img
                                      src={portraitSrc}
                                      alt=""
                                      className="w-full h-full object-cover [image-rendering:pixelated] grayscale brightness-[0.3] contrast-150 blur-[1.5px] opacity-80"
                                      draggable={false}
                                    />
                                  ) : (
                                    <span className="text-slate-700 text-2xl font-black opacity-30">
                                      ⚔️
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <h3
                                  className={`font-bold text-sm tracking-wide ${
                                    isDiscovered ? 'text-white' : 'text-slate-500 italic'
                                  }`}
                                >
                                  {isDiscovered
                                    ? (isTL ? config.name : (config.nameEn || config.name))
                                    : (isTL ? '❓ Hindi pa Nakakatapat' : '❓ Undiscovered Invader')}
                                  {config.role === 'RULER' && (
                                    <span className="ml-1.5 text-[9px] font-black uppercase tracking-wider text-amber-300">
                                      👑 {isTL ? 'Pinuno' : 'Boss'}
                                    </span>
                                  )}
                                </h3>
                                {isDiscovered ? (
                                  <span className="shrink-0 text-[10px] font-bold text-sky-400 bg-sky-950/60 border border-sky-500/30 px-2 py-0.5 rounded-full">
                                    {isTL ? 'Natuklasan ⚔️' : 'Encountered ⚔️'}
                                  </span>
                                ) : (
                                  <span className="shrink-0 text-[10px] font-bold text-slate-500 bg-slate-900 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Lock className="w-2.5 h-2.5" /> {isTL ? 'Nakatago' : 'Locked'}
                                  </span>
                                )}
                              </div>

                              <p className="text-xs text-sky-300/90 font-medium mt-0.5">
                                {isDiscovered
                                  ? (isTL ? config.subtitle : (config.subtitleEn || config.subtitle))
                                  : (isTL ? 'Isang sundalo o sandata ng tao...' : 'A human crusade unit...')}
                              </p>

                              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                                {isDiscovered
                                  ? (isTL ? config.description : (config.descriptionEn || config.description))
                                  : (isTL ? 'Magpatuloy sa mga alon ng pagsalakay upang makatapat ang kalabang ito.' : 'Advance through invasion waves to encounter this enemy.')}
                              </p>

                              {isDiscovered && (
                                <div className="mt-2.5 flex items-center gap-2 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-300">
                                  <span>⚔️ {config.damage} DMG</span>
                                  <span>💚 {config.hp} HP</span>
                                  <span>⚡ {config.speed} SPD</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 3: HALL OF LEGACY ================= */}
          {activeTab === 'STRUCTURES' && <StructureAtlas isTL={isTL} searchQuery={searchQuery} />}

          {activeTab === 'LEGACY' && (
            <div className="space-y-4">
              {/* The run in progress */}
              <div className="pixel-frame bg-slate-950 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{tr('legacyCurrentRun')}</span>
                  <span className="text-xs font-bold" style={{ color: currentPlatform.accentColor }}>{isTL ? currentPlatform.name : currentPlatform.nameEn}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                  {([
                    [tr('legacyLord'), lordName],
                    [tr('legacyWaves'), String(invasion.invasionsRepelled)],
                    [tr('legacyDays'), `${SEASON_CONFIGS[season].icon} ${(year - 1) * 365 + day}`],
                    [tr('legacyTime'), formatPlayTime(playSeconds)],
                  ] as const).map(([label, value]) => (
                    <div key={label} className="pixel-frame bg-slate-900 p-2">
                      <div className="text-[10px] text-slate-400">{label}</div>
                      <div className="text-sm font-black text-amber-300 truncate">{value}</div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400">💀 {tr('legacyPermadeathHint').replace('{difficulty}', difficulty)}</p>
              </div>
              <HallOfLegacy />
            </div>
          )}

          {/* ================= TAB 4: FREQUENTLY ASKED QUESTIONS ================= */}
          {activeTab === 'FAQ' && (
            <div className="space-y-3">
              {filteredFaq.length === 0 ? (
                <div className="p-8 rounded-2xl bg-slate-900/40 border border-slate-800 text-center text-slate-500 text-xs">
                  {isTL ? 'Walang nahanap na tugmang tanong.' : 'No matching questions found.'}
                </div>
              ) : (
                filteredFaq.map((item, index) => (
                  <div
                    key={index}
                    className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition space-y-1.5"
                  >
                    <h3 className="text-xs font-bold text-white flex items-center gap-2">
                      <span className="text-amber-400">Q:</span>
                      <span>{item.question}</span>
                    </h3>
                    <p className="text-xs text-slate-300 leading-relaxed pl-5">
                      {item.answer}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ================= TAB 5: NETHER REALM LORE ================= */}
          {activeTab === 'LORE' && (
            <div className="space-y-3">
              {filteredLore.length === 0 ? (
                <div className="p-8 rounded-2xl bg-slate-900/40 border border-slate-800 text-center text-slate-500 text-xs">
                  {isTL ? 'Walang nahanap na kasaysayan.' : 'No matching lore entries found.'}
                </div>
              ) : (
                filteredLore.map((item, index) => (
                  <div
                    key={item.heading || index}
                    className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-indigo-500/30 transition space-y-1.5"
                  >
                    <h3 className="text-xs font-bold text-indigo-300 flex items-center gap-2">
                      <Scroll className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{item.heading}</span>
                    </h3>
                    <div className="space-y-2 pl-5">
                      {item.blocks.map((block, i) =>
                        'items' in block ? (
                          <ul key={i} className="list-disc pl-4 space-y-1 text-xs text-slate-300 leading-relaxed">
                            {block.items.map((line, j) => <li key={j}>{richText(line)}</li>)}
                          </ul>
                        ) : (
                          <p key={i} className="text-xs text-slate-300 leading-relaxed">{richText(block.text)}</p>
                        )
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between text-xs">
          <span className="text-slate-500 text-[10px] font-mono">
            {isTL ? 'IsoChronicle Atlas · Lahat ng Kaalaman' : 'IsoChronicle Atlas · Knowledge Base'}
          </span>
          <button
            onClick={() => {
              soundFx.playClick();
              onClose();
            }}
            className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition cursor-pointer shadow-md shadow-sky-600/20"
          >
            {isTL ? 'Naintindihan Ko Na! 🚀' : 'Close Atlas 🚀'}
          </button>
        </div>
      </div>
    </div>
  );
};
