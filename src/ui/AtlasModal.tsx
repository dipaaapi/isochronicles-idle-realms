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
  Shield,
  Zap,
  Flame,
  Swords,
  Lock,
  RotateCcw,
  History,
  Search,
  Award,
  Castle,
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
import { ECONOMY_CONFIG } from '../state/economy';
import {
  REGRESSION_BOOST_PER_TIER,
  REGRESSION_TEXT,
  fillText,
  teamStatTotals,
  type Localized,
  type TeamStat,
  TEAM_STATS,
} from '../state/skillTree';
import { gameConfirm } from './GameDialog';
import { StructureAtlas } from './StructureAtlas';
import STRUCTURE_TEXT from '../i18n/structureAtlas.json';

export type AtlasTab = 'GUIDE' | 'BESTIARY' | 'STRUCTURES' | 'REGRESSION' | 'FAQ' | 'LORE';

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
const PHASE_WAVES: Record<1 | 2 | 3 | 4, [number, number]> = { 1: [1, 25], 2: [26, 50], 3: [51, 75], 4: [76, 100] };

export const AtlasModal: React.FC<AtlasModalProps> = ({
  isOpen,
  onClose,
  initialSection = 'GUIDE',
}) => {
  const {
    language,
    discoveredBeasts,
    discoveredInvaders,
    invasion,
    platformPhase,
    regressionCount,
    regressionHistory,
    performRegression,
    day,
    year,
    season,
    realmName,
    isWave100VictoryCelebration,
    dismissWave100Celebration,
  } = useGameStore();

  const isTL = language === 'TL';

  const [activeTab, setActiveTab] = useState<AtlasTab>(initialSection);
  const [bestiarySubTab, setBestiarySubTab] = useState<'BEASTS' | 'INVADERS'>('BEASTS');
  const [searchQuery, setSearchQuery] = useState('');
  const [regressionNameInput, setRegressionNameInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialSection);
      setSearchQuery('');
      setRegressionNameInput('');
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

  // Regression helpers
  const currentPlatform = PLATFORM_CONFIGS[platformPhase || 1];
  const t = (text: Localized) => (isTL ? text.tl : text.en);
  const hpPerTier = ECONOMY_CONFIG.regression.castleHpPerRegression;
  const boostNow = teamStatTotals({}, regressionCount);
  const boostNext = teamStatTotals({}, regressionCount + 1);
  const boostStats = Object.keys(REGRESSION_BOOST_PER_TIER) as TeamStat[];
  const isRecommended = invasion.waveNumber >= 100;

  const handlePerformRegression = async () => {
    if (regressionNameInput.trim() !== realmName.trim()) return;
    soundFx.playFanfare();
    const promptMsg = fillText(t(REGRESSION_TEXT.confirm), {
      wave: invasion.waveNumber,
      phase: platformPhase,
      day,
      hp: hpPerTier,
    });

    if (await gameConfirm(promptMsg)) {
      performRegression();
      onClose();
    }
  };

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
  const wavesLabel = (phase: 1 | 2 | 3 | 4) =>
    t(ATLAS_GUIDE.header.waves)
      .replace('{from}', String(PHASE_WAVES[phase][0]))
      .replace('{to}', String(PHASE_WAVES[phase][1]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 md:p-6 select-none animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl h-[90vh] flex flex-col rounded-3xl border border-sky-500/40 bg-slate-950/95 shadow-2xl shadow-sky-950/80 overflow-hidden">
        
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
                  ? 'Gabay, Talaan ng mga Nilalang, Muling Pagkabuhay, FAQ, at Kasaysayan ng Nether Realm.'
                  : 'Your complete companion for Guides, Bestiary, Regression, FAQ, and Nether Realm Lore.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              soundFx.playClick();
              if (isWave100VictoryCelebration) dismissWave100Celebration();
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

            {/* TAB 3: REGRESSION */}
            <button
              onClick={() => {
                soundFx.playClick();
                setActiveTab('REGRESSION');
              }}
              className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'REGRESSION'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5 text-purple-300" />
              <span>{isTL ? 'Regresyon' : 'Regression'}</span>
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
                        <div className="text-[10px] text-slate-500 font-mono">{wavesLabel(phase)}</div>
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
                                  className="w-full h-full object-cover"
                                  draggable={false}
                                />
                              ) : (
                                <div className="w-full h-full bg-black flex items-center justify-center">
                                  {portraitSrc ? (
                                    <img
                                      src={portraitSrc}
                                      alt=""
                                      className="w-full h-full object-cover brightness-0 opacity-70"
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
                                  className="w-full h-full object-cover"
                                  draggable={false}
                                />
                              ) : (
                                <div className="w-full h-full bg-black flex items-center justify-center">
                                  {portraitSrc ? (
                                    <img
                                      src={portraitSrc}
                                      alt=""
                                      className="w-full h-full object-cover brightness-0 opacity-70"
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

          {/* ================= TAB 3: REGRESSION ================= */}
          {activeTab === 'STRUCTURES' && <StructureAtlas isTL={isTL} searchQuery={searchQuery} />}

          {activeTab === 'REGRESSION' && (
            <div className="space-y-4">
              {/* Wave 100 Victory Banner if completed */}
              {isWave100VictoryCelebration && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-purple-500/20 to-red-500/20 border border-amber-400/60 shadow-lg text-center animate-bounce-short">
                  <div className="text-3xl mb-1">👑 🏆 ⚡</div>
                  <h3 className="text-lg font-black text-amber-300">
                    {isTL ? 'KUMPLETO ANG WAVE 100! TAGUMPAY NG DEMON LORD!' : 'WAVE 100 CONQUERED! SUPREME DEMON LORD VICTORY!'}
                  </h3>
                  <p className="text-xs text-amber-200/90 mt-1 max-w-md mx-auto">
                    {isTL
                      ? 'Nalampasan mo ang lahat ng 4 na platform at 100 waves ng paglusob ng mga tao! Inirerekomenda na ngayon ang REGRESSION para sa susunod na antas ng kapangyarihan.'
                      : 'You have survived all 4 platforms and 100 waves of crusaders and mechas! Regression is now strongly recommended for eternal transcendence.'}
                  </p>
                </div>
              )}

              {/* Status Overview Card */}
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {isTL ? 'Kasalukuyang Takbo ng Panahon' : 'Current Timeline Progress'}
                  </span>
                  <span className="text-xs font-mono font-bold text-purple-400">
                    {isTL ? `Yugto ${platformPhase} ng 4 · Antas ng Regression ${regressionCount}` : `Phase ${platformPhase} of 4 · Regression Tier ${regressionCount}`}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-[11px] text-slate-400">{isTL ? 'Kasalukuyang Wave' : 'Current Wave'}</div>
                    <div className="text-xl font-black text-red-400 font-mono mt-0.5">{invasion.waveNumber} / 100</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-[11px] text-slate-400">{isTL ? 'Plataporma' : 'Platform'}</div>
                    <div className="text-sm font-black text-purple-300 mt-1 truncate" title={isTL ? currentPlatform.name : currentPlatform.nameEn}>
                      {isTL ? currentPlatform.name : currentPlatform.nameEn}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-[11px] text-slate-400">{isTL ? 'Panahon at Araw' : 'Season & Day'}</div>
                    <div className="text-sm font-black text-emerald-300 mt-1 font-mono">
                      {SEASON_CONFIGS[season].icon} D{day} / Y{year}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-[11px] text-slate-400">{isTL ? 'Napatalsik na Paglusob' : 'Repelled Waves'}</div>
                    <div className="text-xl font-black text-amber-400 font-mono mt-0.5">{invasion.invasionsRepelled}</div>
                  </div>
                </div>
              </div>

              {/* 4 Phases Overview Map */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {isTL ? 'Mga Yugto ng Plataporma (Phases 1 - 4)' : 'Platform Phases (Waves 1 - 100)'}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {([1, 2, 3, 4] as const).map((pIndex) => {
                    const pCfg = PLATFORM_CONFIGS[pIndex];
                    const isActive = platformPhase === pIndex;
                    const isPassed = platformPhase > pIndex;
                    return (
                      <div
                        key={pIndex}
                        className={`p-3 rounded-xl border transition-all ${
                          isActive
                            ? 'bg-purple-950/40 border-purple-500 shadow-md ring-1 ring-purple-500/50'
                            : isPassed
                            ? 'bg-slate-950/40 border-emerald-500/40 opacity-80'
                            : 'bg-slate-950/30 border-slate-800 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold" style={{ color: pCfg.accentColor }}>
                            {isTL ? `Yugto ${pIndex}: ${pCfg.name}` : `Phase ${pIndex}: ${pCfg.nameEn}`}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                            {wavesLabel(pIndex)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-tight line-clamp-2">
                          {isTL ? pCfg.description : pCfg.descriptionEn}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Demon Lord Regression Tier Buffs */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-950/50 to-slate-900/80 border border-purple-500/40 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-2">
                    <Award className="w-4 h-4 text-purple-400" />
                    <span>{isTL ? 'Mga Permanenteng Bonus ng Regression' : 'Permanent Regression Bonuses'}</span>
                  </h4>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    +{hpPerTier * regressionCount} {isTL ? 'Max HP ng Kastilyo' : 'Castle Max HP'}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {boostStats.map((st) => {
                    const curr = boostNow[st] ?? 0;
                    const next = boostNext[st] ?? 0;
                    const perTier = REGRESSION_BOOST_PER_TIER[st];
                    return (
                      <div key={st} className="p-2.5 rounded-xl bg-slate-950/70 border border-purple-500/20">
                        <div className="text-[10px] font-medium text-slate-400">{t(TEAM_STATS[st].name)}</div>
                        <div className="text-xs font-black font-mono text-purple-300 mt-0.5">
                          +{curr.toFixed(0)}% <span className="text-emerald-400 text-[10px]">➜ +{next.toFixed(0)}%</span>
                        </div>
                        <div className="text-[9px] text-slate-500 font-mono mt-0.5">+{perTier}% {isTL ? 'bawat antas' : 'per tier'}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Perform Regression Action */}
              <div className="p-4 rounded-2xl bg-purple-950/30 border border-purple-500/50 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-600/30 border border-purple-400/40 flex items-center justify-center text-purple-300 shrink-0">
                    <RotateCcw className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">
                      {isTL ? 'Magsagawa ng Regression (Muling Pagkabuhay)' : 'Trigger Demon Lord Regression'}
                    </h4>
                    <p className="text-[11px] text-slate-300 leading-relaxed mt-0.5">
                      {isTL
                        ? `I-type ang pangalan ng Realm ("${realmName}") upang i-reset ang takbo ng panahon at makamit ang Tier ${regressionCount + 1} buff!`
                        : `Type your Realm name ("${realmName}") to restart the timeline with permanent Tier ${regressionCount + 1} power!`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    placeholder={realmName}
                    value={regressionNameInput}
                    onChange={(e) => setRegressionNameInput(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl border border-purple-500/40 bg-slate-950 text-xs text-white placeholder-slate-600 outline-none focus:border-purple-400 font-mono"
                  />
                  <button
                    type="button"
                    disabled={regressionNameInput.trim() !== realmName.trim()}
                    onClick={handlePerformRegression}
                    className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 text-white transition cursor-pointer shadow-lg shadow-purple-600/30 disabled:shadow-none"
                  >
                    {isTL ? 'Muling Mabuhay 🌀' : 'Regress 🌀'}
                  </button>
                </div>
              </div>

              {/* Past Regression History Logs */}
              {regressionHistory && regressionHistory.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-slate-400" />
                    <span>{isTL ? 'Kasaysayan ng Muling Pagkabuhay' : 'Past Regression Timeline Logs'}</span>
                  </h4>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar pr-1">
                    {regressionHistory.map((entry, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] flex items-center justify-between font-mono"
                      >
                        <span className="text-purple-300 font-bold">{isTL ? 'Antas' : 'Tier'} {entry.regressionIndex}</span>
                        <span className="text-slate-400">{t(REGRESSION_TEXT.historyWave).replace('{n}', String(entry.waveReached))}</span>
                        <span className="text-slate-500">{isTL ? 'Araw' : 'Day'} {entry.dayReached}</span>
                        <span className="text-slate-500">{new Date(entry.timestamp).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
              if (isWave100VictoryCelebration) dismissWave100Celebration();
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
