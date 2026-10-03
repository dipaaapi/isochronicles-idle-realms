import React, { useState, useEffect } from 'react';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from '../game/audio/soundFx';
import { faqTranslations } from '../i18n/faqTranslations';
import loreMarkdown from '../../LORE.md?raw';
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
} from '../state/skillTree';

export type AtlasTab = 'GUIDE' | 'BESTIARY' | 'REGRESSION' | 'FAQ' | 'LORE';

interface AtlasModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSection?: AtlasTab;
}

const parsedLore = loreMarkdown
  .split(/\n(?=## )/)
  .map((section) => {
    const [heading, ...body] = section.trim().split('\n');
    return {
      heading: heading.replace(/^##\s*/, ''),
      body: body.join(' ').replace(/\*\*/g, ''),
    };
  })
  .filter((section) => section.heading && section.body);

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

  const handlePerformRegression = () => {
    if (regressionNameInput.trim() !== realmName.trim()) return;
    soundFx.playFanfare();
    const promptMsg = fillText(t(REGRESSION_TEXT.confirm), {
      wave: invasion.waveNumber,
      phase: platformPhase,
      day,
      hp: hpPerTier,
    });

    if (window.confirm(promptMsg)) {
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

  const filteredLore = parsedLore.filter(
    (item) =>
      item.heading.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.body.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
                  Knowledge Hub
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
          <div className="grid grid-cols-5 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
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
              <span>{isTL ? 'Regression' : 'Regression'}</span>
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

          {(activeTab === 'FAQ' || activeTab === 'LORE' || activeTab === 'BESTIARY') && (
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
                {/* Step 1 */}
                <div className="glass-panel p-4 rounded-2xl border border-sky-500/30 bg-sky-950/20 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2.5 text-sky-300 font-bold mb-2 text-sm">
                      <span className="w-7 h-7 rounded-xl bg-sky-500/30 border border-sky-400/50 flex items-center justify-center text-xs font-mono text-white">1</span>
                      <span>🤖 {isTL ? 'Autopilot Minions & Resources' : 'Autopilot Minions & Gathering'}</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed pl-9">
                      {isTL ? (
                        <>
                          Kusang lumalakad ang mga alagad sa lumulutang na isla upang magmina ng 💎 <strong>Kristal</strong>, pumutol ng 🌲 <strong>Kahoy</strong>, at magtipak ng 🪨 <strong>Bato</strong>.
                          <br /><strong className="text-amber-300">Tip:</strong> I-click ang mga Golem upang tumalon at magmadali sa trabaho!
                        </>
                      ) : (
                        <>
                          Your loyal servants roam the floating realm to extract 💎 <strong>Crystals</strong>, chop 🌲 <strong>Wood</strong>, and quarry 🪨 <strong>Stone</strong>.
                          <br /><strong className="text-amber-300">Tip:</strong> Click on your Golems to make them bounce and gather faster!
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="glass-panel p-4 rounded-2xl border border-amber-500/30 bg-amber-950/20 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2.5 text-amber-300 font-bold mb-2 text-sm">
                      <span className="w-7 h-7 rounded-xl bg-amber-500/30 border border-amber-400/50 flex items-center justify-center text-xs font-mono text-white">2</span>
                      <span>🏪 {isTL ? 'Pamilihan at Barya (Quick Trade)' : 'Market Trading & Gold Coins'}</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed pl-9">
                      {isTL ? (
                        <>
                          Gamitin ang <strong>Pamilihan (Market)</strong> upang ibenta ang naipong materyales para sa 🪙 <strong>Gintong Barya</strong> o bumili ng kulang na sangkap anumang oras.
                        </>
                      ) : (
                        <>
                          Visit the <strong>Market</strong> tab to exchange extra materials for 🪙 <strong>Gold Coins</strong> or buy missing ingredients instantly.
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="glass-panel p-4 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2.5 text-emerald-300 font-bold mb-2 text-sm">
                      <span className="w-7 h-7 rounded-xl bg-emerald-500/30 border border-emerald-400/50 flex items-center justify-center text-xs font-mono text-white">3</span>
                      <span>⭐ {isTL ? 'Agham, Sandata, at Kasanayan' : 'Research, Armory & Skills'}</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed pl-9">
                      {isTL ? (
                        <>
                          I-upgrade ang kapasidad at bilis sa <strong>Agham</strong>, magpanday ng pambihirang sandata sa <strong>Pandayan</strong>, at mag-invest sa <strong>Skill Tree</strong> kada 5 waves!
                        </>
                      ) : (
                        <>
                          Enhance minion speed and cargo in <strong>Research</strong>, forge artifacts in the <strong>Armory</strong>, and allocate points in the <strong>Skill Tree</strong> every 5 waves!
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="glass-panel p-4 rounded-2xl border border-rose-500/30 bg-rose-950/20 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2.5 text-rose-300 font-bold mb-2 text-sm">
                      <span className="w-7 h-7 rounded-xl bg-rose-500/30 border border-rose-400/50 flex items-center justify-center text-xs font-mono text-white">4</span>
                      <span>🏰 {isTL ? 'Tanggulan at 100 Wave Crusades' : 'Citadel Defense & 100 Waves'}</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed pl-9">
                      {isTL ? (
                        <>
                          Ipagtanggol ang Kuta laban sa mga Tao at Mecha! Manatiling buo ang 3 natatanging kasanayan ng bawat pasilidad. I-click ang mga kalaban sa mapa para tamaan ng kidlat! ⚡
                        </>
                      ) : (
                        <>
                          Defend the Citadel against Human & Mecha crusaders! Utilize 3 unique skills per establishment. Click enemies anywhere on map to strike them with lightning! ⚡
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* 4 World Phases Infographic Card */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/40 via-slate-900 to-slate-900 border border-purple-500/30">
                <h3 className="text-xs font-bold uppercase tracking-wider text-purple-300 mb-2 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>{isTL ? '4 na Yugto ng Kampanya (Realms)' : 'The 4 Realm Phases (Waves 1 - 100)'}</span>
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1 text-center">
                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    <div className="text-lg">🔥</div>
                    <div className="text-xs font-bold text-slate-200 mt-1">Demon Citadel</div>
                    <div className="text-[10px] text-slate-500 font-mono">Waves 1 - 25</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    <div className="text-lg">🌋</div>
                    <div className="text-xs font-bold text-slate-200 mt-1">Magma Caldera</div>
                    <div className="text-[10px] text-slate-500 font-mono">Waves 26 - 50</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    <div className="text-lg">❄️</div>
                    <div className="text-xs font-bold text-slate-200 mt-1">Frost Spire</div>
                    <div className="text-[10px] text-slate-500 font-mono">Waves 51 - 75</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    <div className="text-lg">✨</div>
                    <div className="text-xs font-bold text-slate-200 mt-1">Astral Sanctum</div>
                    <div className="text-[10px] text-slate-500 font-mono">Waves 76 - 100</div>
                  </div>
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
                                      👑 {isTL ? 'Boss' : 'Boss'}
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
                    Phase {platformPhase} of 4 · Regression Tier {regressionCount}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-[11px] text-slate-400">{isTL ? 'Kasalukuyang Wave' : 'Current Wave'}</div>
                    <div className="text-xl font-black text-red-400 font-mono mt-0.5">{invasion.waveNumber} / 100</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-[11px] text-slate-400">{isTL ? 'Plataporma' : 'Platform'}</div>
                    <div className="text-sm font-black text-purple-300 mt-1 truncate" title={currentPlatform.nameEn}>
                      {currentPlatform.nameEn}
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
                            Phase {pIndex}: {pCfg.nameEn}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                            {pCfg.waveRange}
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
                    +{hpPerTier * regressionCount} Castle Max HP
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {boostStats.map((st) => {
                    const curr = boostNow[st] ?? 0;
                    const next = boostNext[st] ?? 0;
                    const perTier = REGRESSION_BOOST_PER_TIER[st];
                    return (
                      <div key={st} className="p-2.5 rounded-xl bg-slate-950/70 border border-purple-500/20">
                        <div className="text-[10px] font-medium text-slate-400">{st}</div>
                        <div className="text-xs font-black font-mono text-purple-300 mt-0.5">
                          +{curr.toFixed(0)}% <span className="text-emerald-400 text-[10px]">➜ +{next.toFixed(0)}%</span>
                        </div>
                        <div className="text-[9px] text-slate-500 font-mono mt-0.5">+{perTier}% per tier</div>
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
                        <span className="text-purple-300 font-bold">Tier {entry.regressionIndex}</span>
                        <span className="text-slate-400">Wave {entry.waveReached}</span>
                        <span className="text-slate-500">Day {entry.dayReached}</span>
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
                    <p className="text-xs text-slate-300 leading-relaxed pl-5">
                      {item.body}
                    </p>
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
