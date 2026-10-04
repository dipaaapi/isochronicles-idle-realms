import React, { useRef, useState, useEffect } from 'react';
import type { WeatherType } from '../types/state';
import { isConstructionReady } from '../state/constructionProgress';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from '../game/audio/soundFx';
import {
  Sliders,
  Sunrise,
  Sun,
  Sunset,
  Moon,
  Maximize,
  Minimize,
  Play,
  FastForward,
  Pause,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Compass,
  Swords,
  Check,
  X,
  Gem,
  Trees,
  Hammer,
  Fish,
  Droplets,
  Coins,
  Shield,
  Volume2,
  VolumeX,
  Music,
  CloudRain,
  CloudSnow,
  Flame,
  CloudSun,
  PanelRightClose,
  PanelRightOpen,
  Zap,
  ListMusic,
} from 'lucide-react';
import { PLATFORM_CONFIGS, SEASON_CONFIGS } from '../types/game';
import { CitadelTab } from './CitadelCommandModal';
import { WeatherModal } from './WeatherModal';
import { SkyStatusPanel } from './SkyStatusPanel';
import { AutoEnhancePrompt } from '../ui/AutoEnhancePrompt';
import { ECONOMY_CONFIG, RESOURCE_PRICES } from '../state/economy';
import type { BattleItemId } from '../types/state';
import { HoverTooltip } from './HoverTooltip';
import { useTranslation } from '../i18n/translations';
import { useExternalMusic } from '../state/externalMusic';
import { MusicPlayer } from './MusicPlayer';

interface GameHUDProps {
  onOpenCitadel: (tab?: CitadelTab) => void;
  onOpenAtlas: (section?: 'GUIDE' | 'BESTIARY' | 'REGRESSION' | 'FAQ' | 'LORE') => void;
  onOpenBestiary?: () => void;
  onOpenSettings: () => void;
  onOpenSkillTree: () => void;
  onOpenRegression?: () => void;
  onOpenQuickTrade: (
    resourceKey: 'aetherShards' | 'wood' | 'stone' | 'arcaneEssence' | 'fish' | 'water'
  ) => void;
}

interface ItemMeta {
  id: BattleItemId;
  icon: string;
  nameEn: string;
  nameTl: string;
  keyBinding: string;
  maxDuration: number;
  timerKey?: 'minionFrenzyTimer' | 'forceFieldTimer' | 'massRegenTimer';
  color: string;
  glowColor: string;
  descEn: string;
  descTl: string;
  buffEffectEn: string;
  buffEffectTl: string;
}

const BATTLE_ITEMS: ItemMeta[] = [
  {
    id: 'MINION_FRENZY',
    icon: '🔥',
    nameEn: 'Minion Frenzy',
    nameTl: 'Siklab ng Minion',
    keyBinding: 'q',
    maxDuration: 30,
    timerKey: 'minionFrenzyTimer',
    color: '#f97316',
    glowColor: 'rgba(249, 115, 22, 0.6)',
    descEn: 'Empowers all allied minions with fiery battle fury.',
    descTl: 'Pinupuno ng nagliliyab na galit sa pakikipaglaban ang lahat ng minion.',
    buffEffectEn: '+200% Attack Damage for active minions (30s).',
    buffEffectTl: '+200% Lakas ng Pag-atake para sa mga minion (30s).',
  },
  {
    id: 'FORCE_FIELD',
    icon: '🛡️',
    nameEn: 'Aegis Barrier',
    nameTl: 'Kalasag ng Kuta',
    keyBinding: 'w',
    maxDuration: 15,
    timerKey: 'forceFieldTimer',
    color: '#0284c7',
    glowColor: 'rgba(2, 132, 199, 0.7)',
    descEn: 'Erects an impenetrable energy barrier over the entire realm.',
    descTl: 'Nagtatayo ng hindi matitibag na harang sa buong kaharian.',
    buffEffectEn: 'Absolute invulnerability for Citadel & Establishments (15s).',
    buffEffectTl: 'Ganap na proteksyon sa Kastilyo at lahat ng gusali (15s).',
  },
  {
    id: 'MASS_REGEN',
    icon: '💖',
    nameEn: 'Mass Restoration',
    nameTl: 'Malawakang Lunas',
    keyBinding: 'e',
    maxDuration: 20,
    timerKey: 'massRegenTimer',
    color: '#ec4899',
    glowColor: 'rgba(236, 72, 153, 0.6)',
    descEn: 'Pours rejuvenative life essence into realm foundations.',
    descTl: 'Nagbubuhos ng nagpapagaling na enerhiya sa lahat ng gusali.',
    buffEffectEn: 'Rapid HP regeneration for Castle & Establishments (20s).',
    buffEffectTl: 'Mabilisang nagpapagaling ng HP ng Kastilyo at gusali (20s).',
  },
  {
    id: 'SHIELD_OVERLOAD',
    icon: '⚡',
    nameEn: 'Shield Overload',
    nameTl: 'Soberkarga ng Kalasag',
    keyBinding: 'r',
    maxDuration: 0,
    color: '#eab308',
    glowColor: 'rgba(234, 179, 8, 0.6)',
    descEn: 'Supercharges Citadel barrier to maximum capacity.',
    descTl: 'Pinupuno ang kalasag ng Kuta hanggang sa pinakamataas na antas.',
    buffEffectEn: 'Instantly restores Citadel shield to 100% & repairs structures.',
    buffEffectTl: 'Agad na pinupuno ang kalasag sa 100% at kinukumpuni ang mga gusali.',
  },
  {
    id: 'CHRONO_SURGE',
    icon: '⏱️',
    nameEn: 'Chrono Surge',
    nameTl: 'Pampabilis ng Oras',
    keyBinding: 't',
    maxDuration: 0,
    color: '#a855f7',
    glowColor: 'rgba(168, 85, 247, 0.6)',
    descEn: 'Warps the flow of time to refresh tactical abilities.',
    descTl: 'Binabaluktot ang takbo ng oras upang muling magamit ang kakayahan.',
    buffEffectEn: 'Instantly resets all skill cooldowns for Citadel & Establishments.',
    buffEffectTl: 'Agad na nirereset ang lahat ng skill cooldown ng Kuta at gusali.',
  },
];


type QuickActionId = 'PAUSE' | 'SPEED2' | 'SPEED3' | 'WAVE' | 'DAY' | 'WEATHER' | 'MUSIC' | 'SFX' | 'FULLSCREEN' | 'SETTINGS' | 'SIDEBAR'
  | 'ATLAS' | 'SKILLS' | 'TAB_COMMAND' | 'TAB_STATUS' | 'TAB_RESOURCES';
/**
 * Keyboard quick actions. Most are listed as buttons under the castle bars after the Q–T battle
 * items; `inline` ones already have a button elsewhere (sky panel, tabs, Skills / Atlas) that shows the key.
 */
const QUICK_KEYS: Array<{ id: QuickActionId; codes: string[]; key: string; icon: string; label: string; inline?: true }> = [
  { id: 'PAUSE', codes: ['Backquote'], key: '`', icon: '⏯️', label: 'quickPause' },
  { id: 'SPEED2', codes: ['Digit1', 'Numpad1'], key: '1', icon: '2×', label: 'quickSpeed2' },
  { id: 'SPEED3', codes: ['Digit2', 'Numpad2'], key: '2', icon: '3×', label: 'quickSpeed3' },
  { id: 'WAVE', codes: ['KeyL'], key: 'L', icon: '⚔️', label: 'quickWave' },
  { id: 'DAY', codes: ['KeyO'], key: 'O', icon: '📅', label: 'quickDay', inline: true },
  { id: 'WEATHER', codes: ['KeyP'], key: 'P', icon: '🌦️', label: 'quickWeather', inline: true },
  { id: 'MUSIC', codes: ['KeyM'], key: 'M', icon: '🎵', label: 'quickMusic' },
  { id: 'SFX', codes: ['KeyN'], key: 'N', icon: '🔊', label: 'quickSfx' },
  { id: 'FULLSCREEN', codes: ['KeyK'], key: 'K', icon: '⛶', label: 'quickFullscreen' },
  { id: 'SETTINGS', codes: ['KeyJ'], key: 'J', icon: '⚙️', label: 'quickSettings' },
  { id: 'SIDEBAR', codes: ['KeyI'], key: 'I', icon: '📑', label: 'quickSidebar' },
  { id: 'ATLAS', codes: ['KeyA'], key: 'A', icon: '🧭', label: 'hudAtlas', inline: true },
  { id: 'SKILLS', codes: ['KeyS'], key: 'S', icon: '✨', label: 'hudSkills', inline: true },
  { id: 'TAB_COMMAND', codes: ['KeyZ'], key: 'Z', icon: '🏰', label: 'hudTabCommand', inline: true },
  { id: 'TAB_STATUS', codes: ['KeyX'], key: 'X', icon: '🛡️', label: 'hudTabStatus', inline: true },
  { id: 'TAB_RESOURCES', codes: ['KeyC'], key: 'C', icon: '💎', label: 'hudTabResources', inline: true },
];

/** Small key hint in the corner of a button that has a keyboard shortcut. */
const KeyBadge: React.FC<{ k: string; className?: string }> = ({ k, className = 'top-0.5 right-1' }) => (
  <span className={`pointer-events-none absolute ${className} text-[8px] font-mono font-black uppercase leading-none text-amber-300`}>{k}</span>
);

export const GameHUD: React.FC<GameHUDProps> = ({
  onOpenCitadel,
  onOpenAtlas,
  onOpenSettings,
  onOpenSkillTree,
  onOpenQuickTrade,
}) => {
  const {
    resources,
    defense,
    invasion,
    castleBuilt,
    resourceBuildings,
    timeOfDay,
    season,
    weather,
    platformPhase,
    skillPoints,
    isAudioMuted,
    toggleAudioMute,
    language,
    gameSpeed,
    togglePause,
    toggleFastSpeed,
    day,
    year,
    dayProgress,
    incrementDay,
    startInvasion,
    useBattleItem,
  } = useGameStore();

  const isTL = language === 'TL';
  const { t: tr } = useTranslation();
  const externalMusic = useGameStore((s) => s.musicLibrary.length > 0);
  const isMusicPlayerOpen = useExternalMusic((s) => s.isPlayerOpen);
  const setMusicPlayerOpen = useExternalMusic((s) => s.setPlayerOpen);
  const setMusicManagerOpen = useExternalMusic((s) => s.setManagerOpen);
  const constructionReady = isConstructionReady({ castleBuilt, resourceBuildings });

  const [isFullscreen, setIsFullscreen] = useState(
    typeof document !== 'undefined' ? !!document.fullscreenElement : false
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'command' | 'status' | 'resources'>('command');
  const [confirmAction, setConfirmAction] = useState<'SKIP_DAY' | 'SUMMON_WAVE' | null>(null);
  const [hoveredBattleItem, setHoveredBattleItem] = useState<BattleItemId | null>(null);
  const [battleItemAnchor, setBattleItemAnchor] = useState<HTMLElement | null>(null);
  const [isWeatherModalOpen, setIsWeatherModalOpen] = useState(false);

  const [isBgmOff, setIsBgmOff] = useState(() => soundFx.getIsBgmDisabled());
  const [isSfxOff, setIsSfxOff] = useState(() => soundFx.getIsSfxDisabled());

  // The docked music player lines up with the cards above, which stop short of the scrollbar
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollGutter, setScrollGutter] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setScrollGutter(el.offsetWidth - el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [isSidebarOpen]);

  // Quick actions shared by the O/P/M/N/L keys and the buttons under the castle bars
  const runQuickAction = (id: QuickActionId) => {
    const s = useGameStore.getState();
    if (id === 'PAUSE') {
      soundFx.playClick();
      togglePause();
    } else if (id === 'SPEED2' || id === 'SPEED3') {
      soundFx.playClick();
      toggleFastSpeed(id === 'SPEED2' ? 2 : 3);
    } else if (id === 'FULLSCREEN') {
      toggleFullscreen();
    } else if (id === 'SETTINGS') {
      soundFx.playClick();
      onOpenSettings();
    } else if (id === 'SIDEBAR') {
      soundFx.playClick();
      setIsSidebarOpen((open) => !open);
    } else if (id === 'DAY') {
      soundFx.playClick();
      setConfirmAction(null);
      s.incrementDay();
    } else if (id === 'WEATHER') {
      // The Weather window: pick a weather or switch random weather on / off
      soundFx.playClick();
      setIsWeatherModalOpen((open) => !open);
    } else if (id === 'ATLAS') {
      soundFx.playClick();
      onOpenAtlas('GUIDE');
    } else if (id === 'SKILLS') {
      soundFx.playClick();
      onOpenSkillTree();
    } else if (id === 'TAB_COMMAND' || id === 'TAB_STATUS' || id === 'TAB_RESOURCES') {
      soundFx.playClick();
      setIsSidebarOpen(true);
      setActiveTab(id === 'TAB_COMMAND' ? 'command' : id === 'TAB_STATUS' ? 'status' : 'resources');
    } else if (id === 'MUSIC') {
      handleToggleBgm();
    } else if (id === 'SFX') {
      handleToggleSfx();
    } else if (id === 'WAVE') {
      if (s.invasion.isActive || !isConstructionReady({ castleBuilt: s.castleBuilt, resourceBuildings: s.resourceBuildings })) return;
      soundFx.playClick();
      setConfirmAction(null);
      s.startInvasion();
    }
  };
  const quickActionRef = useRef(runQuickAction);
  quickActionRef.current = runQuickAction;

  // Keyboard shortcuts: ` play/pause, 1 = 2x, 2 = 3x, Q/W/E/R/T battle items,
  // O = next day, P = next weather, L = launch the wave (instant, no confirm), M = music on/off, N = sound effects on/off
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      const el = event.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;

      {
        const quick = QUICK_KEYS.find((q) => q.codes.includes(event.code));
        if (quick) {
          event.preventDefault();
          quickActionRef.current(quick.id);
          return;
        }
        const key = event.key.toLowerCase();
        const matchedItem = BATTLE_ITEMS.find((item) => item.keyBinding === key);
        if (matchedItem) {
          event.preventDefault();
          handleCastBattleItem(matchedItem.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePause, toggleFastSpeed, resources]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    soundFx.playClick();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Fullscreen error: ${err.message}`);
      });
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  };

  const handleToggleBgm = () => {
    soundFx.playClick();
    const disabled = soundFx.toggleBgm();
    setIsBgmOff(disabled);
  };

  const handleToggleSfx = () => {
    soundFx.playClick();
    const disabled = soundFx.toggleSfx();
    setIsSfxOff(disabled);
  };

  const handleConfirmAction = () => {
    soundFx.playClick();
    if (confirmAction === 'SKIP_DAY') incrementDay();
    else if (confirmAction === 'SUMMON_WAVE') startInvasion();
    setConfirmAction(null);
  };

  const handleCastBattleItem = (id: BattleItemId) => {
    const cost = (ECONOMY_CONFIG.battleItems[id]?.cost ?? {}) as Partial<Record<string, number>>;
    const canAfford = Object.entries(cost).every(
      ([k, v]) => ((resources[k as keyof typeof resources] ?? 0) as number) >= (v as number)
    );
    if (canAfford) {
      soundFx.playClick();
      useBattleItem(id);
    }
  };

  // Time of Day Visual Configuration
  const timeOfDayConfig = {
    DAWN: {
      label: isTL ? 'Bukang-liwayway' : 'Dawn',
      icon: <Sunrise className="w-5 h-5 text-amber-300 animate-pulse" />,
      skyGradient: 'from-amber-950/60 via-orange-950/30 to-indigo-950/40',
      glowColor: 'rgba(245, 158, 11, 0.25)',
      accentText: 'text-amber-300',
    },
    DAY: {
      label: isTL ? 'Kasalukuyang Tanghali' : 'Bright Day',
      icon: <Sun className="w-5 h-5 text-yellow-400 animate-spin-slow" />,
      skyGradient: 'from-sky-950/60 via-blue-950/30 to-slate-900/40',
      glowColor: 'rgba(56, 189, 248, 0.25)',
      accentText: 'text-yellow-300',
    },
    DUSK: {
      label: isTL ? 'Takipsilim' : 'Dusk Twilight',
      icon: <Sunset className="w-5 h-5 text-purple-400 animate-pulse" />,
      skyGradient: 'from-purple-950/60 via-pink-950/30 to-slate-950/40',
      glowColor: 'rgba(168, 85, 247, 0.25)',
      accentText: 'text-purple-300',
    },
    NIGHT: {
      label: isTL ? 'Malalim na Gabi' : 'Midnight',
      icon: <Moon className="w-5 h-5 text-cyan-300 animate-pulse" />,
      skyGradient: 'from-indigo-950/70 via-slate-950/60 to-black/80',
      glowColor: 'rgba(6, 182, 212, 0.25)',
      accentText: 'text-cyan-300',
    },
  }[timeOfDay];

  // Weather Visual Configuration
  const weatherConfig = {
    CLEAR: {
      label: isTL ? 'Maaliwalas na Kalangitan' : 'Clear Skies',
      icon: <CloudSun className="w-5 h-5 text-amber-400 animate-pulse" />,
      border: 'border-amber-500/30',
      bg: 'bg-amber-950/20',
      badge: tr('hudWeatherClear'),
    },
    RAIN: {
      label: isTL ? 'Ulan at Pagkulog' : 'Stormy Rain',
      icon: <CloudRain className="w-5 h-5 text-sky-400 animate-bounce-short" />,
      border: 'border-sky-500/30',
      bg: 'bg-sky-950/20',
      badge: tr('hudWeatherRain'),
    },
    SNOW: {
      label: isTL ? 'Niyebeng Yelo' : 'Frost Snow',
      icon: <CloudSnow className="w-5 h-5 text-cyan-300 animate-pulse" />,
      border: 'border-cyan-500/30',
      bg: 'bg-cyan-950/20',
      badge: tr('hudWeatherSnow'),
    },
    HEATWAVE: {
      label: isTL ? 'Matinding Init' : 'Scorching Heat',
      icon: <Flame className="w-5 h-5 text-rose-400 animate-pulse" />,
      border: 'border-rose-500/30',
      bg: 'bg-rose-950/20',
      badge: tr('hudWeatherHeat'),
    },
  }[weather || 'CLEAR'];

  const currentPlatform = PLATFORM_CONFIGS[platformPhase || 1];
  const currentSeason = SEASON_CONFIGS[season || 'SPRING'];
  const castleHpPct = Math.round((defense.castleHp / defense.castleMaxHp) * 100);
  const shieldHpPct = Math.round((defense.shieldHp / defense.shieldMaxHp) * 100);

  const resourceGauges = [
    { label: isTL ? 'Kristal' : 'Gems', key: 'aetherShards' as const, value: resources.aetherShards, color: 'bg-sky-400', text: 'text-sky-300', icon: <Gem className="w-3.5 h-3.5" /> },
    { label: isTL ? 'Kahoy' : 'Wood', key: 'wood' as const, value: resources.wood, color: 'bg-emerald-400', text: 'text-emerald-300', icon: <Trees className="w-3.5 h-3.5" /> },
    { label: isTL ? 'Bato' : 'Stone', key: 'stone' as const, value: resources.stone, color: 'bg-amber-400', text: 'text-amber-300', icon: <Hammer className="w-3.5 h-3.5" /> },
    { label: isTL ? 'Mahika' : 'Essence', key: 'arcaneEssence' as const, value: resources.arcaneEssence, color: 'bg-purple-400', text: 'text-purple-300', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { label: isTL ? 'Isda' : 'Fish', key: 'fish' as const, value: resources.fish, color: 'bg-cyan-400', text: 'text-cyan-300', icon: <Fish className="w-3.5 h-3.5" /> },
    { label: isTL ? 'Tubig' : 'Water', key: 'water' as const, value: resources.water, color: 'bg-blue-400', text: 'text-blue-300', icon: <Droplets className="w-3.5 h-3.5" /> },
  ];

  return (
    <aside
      className={`relative h-full flex-shrink-0 flex flex-col bg-slate-950 border-l border-slate-800/80 transition-all duration-300 select-none z-10 overflow-hidden ${
        isSidebarOpen ? 'w-[335px]' : 'w-16'
      }`}
    >
      {/* 1. TOP HEADER: GAME TITLE & REALM PHASE */}
      <div className="flex flex-col p-3 border-b border-slate-800/90 bg-gradient-to-b from-slate-900 to-slate-950 gap-2">
        {isSidebarOpen ? (
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-purple-600 via-indigo-500 to-sky-400 flex items-center justify-center text-sm shadow-md shadow-purple-500/30">
                  🏰
                </div>
                <div>
                  <h1 className="font-fantasy text-xs font-black tracking-wide text-white drop-shadow">
                    IsoChronicle: Idle Realms
                  </h1>
                  <p className="text-[10px] text-purple-300/80 font-semibold flex items-center gap-1">
                    <span>{isTL ? currentPlatform.name : currentPlatform.nameEn}</span>
                    <span>•</span>
                    <span className="font-mono text-purple-400">{tr('hudPhase').replace('{n}', String(platformPhase))}</span>
                  </p>
                </div>
              </div>

              <span className="px-2 py-0.5 rounded-full text-[9px] font-black font-mono uppercase bg-purple-500/20 text-purple-300 border border-purple-500/40">
                W{invasion.waveNumber}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 rounded-lg bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-sm">
              🏰
            </div>
            <span className="text-[9px] font-mono font-bold text-purple-300">P{platformPhase}</span>
          </div>
        )}
      </div>

      {/* 2. MINIFIED STRIP (WHEN COLLAPSED) */}
      {!isSidebarOpen && (
        <div className="flex flex-col items-center py-3 gap-3 flex-1 overflow-y-auto">
          <div className="text-[10px] font-mono font-bold text-red-400 text-center">W{invasion.waveNumber}</div>
          <div className="text-[10px] font-mono font-bold text-emerald-400 text-center">{castleHpPct}%</div>
          <button onClick={() => { setIsSidebarOpen(true); setActiveTab('command'); }} className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-purple-300 cursor-pointer" title={tr('hudCitadel')}>🏰</button>
          <button onClick={() => { setIsSidebarOpen(true); setActiveTab('status'); }} className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-sky-300 cursor-pointer" title={tr('status')}><Shield className="w-4 h-4" /></button>
          <button onClick={() => { setIsSidebarOpen(true); setActiveTab('resources'); }} className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-amber-300 cursor-pointer" title={tr('resources')}><Coins className="w-4 h-4" /></button>
        </div>
      )}

      {/* 3. EXPANDED SIDEBAR CONTENT */}
      {isSidebarOpen && (
        <div ref={scrollRef} className="flex-1 flex flex-col min-h-0 overflow-y-auto p-3 space-y-3 custom-scrollbar">
          
          {/* SECTION A: ANIMATED TIME OF DAY & WEATHER */}
          <SkyStatusPanel
            timeOfDayConfig={timeOfDayConfig}
            weatherConfig={weatherConfig}
            onSkipDay={() => { soundFx.playClick(); setConfirmAction('SKIP_DAY'); }}
            onOpenWeather={() => { soundFx.playClick(); setIsWeatherModalOpen(true); }}
          />


          {/* SECTION C: NAVIGATION TABS */}
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-900 p-1 border border-slate-800">
            <button
              onClick={() => { soundFx.playClick(); setActiveTab('command'); }}
              className={`relative py-1.5 rounded-lg text-[10px] font-bold uppercase transition cursor-pointer ${
                activeTab === 'command' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tr('hudTabCommand')}
              <KeyBadge k="Z" />
            </button>
            <button
              onClick={() => { soundFx.playClick(); setActiveTab('status'); }}
              className={`relative py-1.5 rounded-lg text-[10px] font-bold uppercase transition cursor-pointer ${
                activeTab === 'status' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tr('hudTabStatus')}
              <KeyBadge k="X" />
            </button>
            <button
              onClick={() => { soundFx.playClick(); setActiveTab('resources'); }}
              className={`relative py-1.5 rounded-lg text-[10px] font-bold uppercase transition cursor-pointer ${
                activeTab === 'resources' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tr('hudTabResources')}
              <KeyBadge k="C" />
            </button>
          </div>

          {/* SECTION D: TAB CONTENT */}
          
          {/* TAB 1: COMMAND */}
          {activeTab === 'command' && (
            <div className="space-y-2">
              {/* Main Citadel Command Opener */}
              <button
                onClick={() => { soundFx.playClick(); onOpenCitadel('OVERVIEW'); }}
                className="w-full p-3 rounded-2xl bg-gradient-to-r from-purple-900/60 to-indigo-900/60 border border-purple-500/40 hover:border-purple-400 flex items-center justify-between transition cursor-pointer shadow-md"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">🏰</span>
                  <div className="text-left">
                    <div className="text-xs font-bold text-white">{isTL ? 'Sentro ng Kuta' : 'Citadel Command'}</div>
                    <div className="text-[10px] text-purple-300/80">{isTL ? 'Lahat ng upgrade: Skill, Agham, Tanggulan, Pandayan' : 'Every upgrade: Skills, Research, Defenses, Armory'}</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-purple-400" />
              </button>

              {/* 2 Quick Hub Buttons (Skills & Atlas) */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { soundFx.playClick(); onOpenSkillTree(); }}
                  className="relative p-2.5 rounded-2xl bg-slate-900/80 border border-purple-500/30 text-purple-200 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-purple-900/40 transition"
                >
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>{tr('hudSkills')} {skillPoints > 0 && `(${skillPoints})`}</span>
                  <KeyBadge k="S" className="top-1 right-2" />
                </button>

                <button
                  onClick={() => { soundFx.playClick(); onOpenAtlas('GUIDE'); }}
                  className="relative p-2.5 rounded-2xl bg-sky-950/50 border border-sky-500/40 text-sky-200 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-sky-900/50 transition shadow-sm"
                >
                  <Compass className="w-4 h-4 text-sky-400" />
                  <span>{tr('hudAtlas')}</span>
                  <KeyBadge k="A" className="top-1 right-2" />
                </button>
              </div>

              {/* Quick Castle Status Summary */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-2">
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-slate-400">{isTL ? 'Kastilyo' : 'Castle'}</span>
                    <span className="text-emerald-300 font-mono font-bold">{castleHpPct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-emerald-400" style={{ width: `${castleHpPct}%` }} />
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-2">
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-slate-400 flex items-center gap-1"><Shield className="w-2.5 h-2.5 text-sky-400" /> {isTL ? 'Kalasag' : 'Shield'}</span>
                    <span className="text-sky-300 font-mono font-bold">{shieldHpPct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-sky-400" style={{ width: `${shieldHpPct}%` }} />
                  </div>
                </div>
              </div>

              {/* Every keyboard shortcut as a button: Q–T battle items, then time, wave, audio and window keys */}
              <div className="grid grid-cols-7 gap-1 rounded-xl border border-purple-500/30 bg-slate-900/60 p-1.5">
              {BATTLE_ITEMS.map((item) => {
                const cost = (ECONOMY_CONFIG.battleItems[item.id]?.cost ?? {}) as Partial<Record<string, number>>;
                const canAfford = Object.entries(cost).every(
                  ([k, v]) => ((resources[k as keyof typeof resources] ?? 0) as number) >= (v as number)
                );
                const timerVal = item.timerKey ? (defense[item.timerKey] ?? 0) : 0;
                const isActive = timerVal > 0;
                const progressPct = item.maxDuration > 0 ? Math.min(100, Math.max(0, (timerVal / item.maxDuration) * 100)) : 0;
                const isHovered = hoveredBattleItem === item.id;

                return (
                  <div
                    key={item.id}
                    className="relative flex flex-col items-center"
                    onMouseEnter={(e) => { setHoveredBattleItem(item.id); setBattleItemAnchor(e.currentTarget); }}
                    onMouseLeave={() => setHoveredBattleItem(null)}
                  >
                    {/* Hover tooltip (portal: the sidebar's overflow can't clip it) */}
                    <HoverTooltip anchor={battleItemAnchor} open={isHovered} placement="bottom">
                      <div className="w-64 rounded-2xl border border-slate-700 bg-slate-950 p-3 shadow-2xl animate-fade-in">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xl">{item.icon}</span>
                            <span className="text-xs font-bold text-white">{isTL ? item.nameTl : item.nameEn}</span>
                          </div>
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-300 font-mono text-[10px] font-bold">
                            {item.keyBinding.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-300 leading-snug">{isTL ? item.descTl : item.descEn}</p>
                        <div className="mt-1 text-[9px] text-purple-300 font-semibold">{isTL ? item.buffEffectTl : item.buffEffectEn}</div>
                        <div className="mt-1.5 pt-1.5 border-t border-slate-800 flex items-center justify-between text-[10px]">
                          <span className="text-slate-400">{tr('hudCost')}</span>
                          <span className="flex items-center gap-1">
                            {Object.entries(cost).map(([resKey, amount]) => {
                              const have = (resources[resKey as keyof typeof resources] ?? 0) as number;
                              return (
                                <span key={resKey} className={`font-mono font-bold ${have >= (amount ?? 0) ? 'text-amber-300' : 'text-rose-400'}`}>
                                  {RESOURCE_PRICES[resKey as keyof typeof RESOURCE_PRICES]?.icon ?? '💎'} {have}/{amount}
                                </span>
                              );
                            })}
                          </span>
                        </div>
                      </div>
                    </HoverTooltip>

                    <button
                      type="button"
                      onClick={() => handleCastBattleItem(item.id)}
                      disabled={!canAfford && !isActive}
                      className={`relative w-full h-11 flex flex-col items-center justify-center rounded-xl border transition cursor-pointer overflow-hidden ${
                        isActive
                          ? 'border-emerald-400 bg-slate-900 shadow-md shadow-emerald-500/30'
                          : canAfford
                          ? 'border-slate-700 bg-slate-900/80 hover:border-purple-400 hover:bg-slate-800'
                          : 'border-slate-800/80 bg-slate-950/60 opacity-40 cursor-not-allowed'
                      }`}
                    >
                      {isActive && (
                        <div
                          className="absolute bottom-0 left-0 right-0 pointer-events-none transition-all duration-100 ease-linear opacity-40"
                          style={{
                            height: `${progressPct}%`,
                            backgroundColor: item.color,
                          }}
                        />
                      )}
                      <span className="relative z-10 text-base leading-none">{item.icon}</span>
                      <span className="absolute top-0.5 right-1 text-[8px] font-mono font-black text-amber-300 uppercase">
                        {item.keyBinding}
                      </span>
                      {isActive && (
                        <span className="absolute bottom-0.5 text-[8px] font-mono font-bold text-white leading-none">
                          {Math.ceil(timerVal)}s
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
                {QUICK_KEYS.filter((q) => !q.inline).map((q) => {
                  const off = (q.id === 'MUSIC' && isBgmOff) || (q.id === 'SFX' && isSfxOff);
                  const on = (q.id === 'PAUSE' && gameSpeed === 0) || (q.id === 'SPEED2' && gameSpeed === 2) ||
                    (q.id === 'SPEED3' && gameSpeed === 3) || (q.id === 'FULLSCREEN' && isFullscreen);
                  const disabled = q.id === 'WAVE' && (invasion.isActive || !constructionReady);
                  const icon = q.id === 'PAUSE' ? (gameSpeed === 0 ? '▶️' : '⏸️') : q.icon;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      title={`${tr(q.label as Parameters<typeof tr>[0])} [${q.key}]`}
                      disabled={disabled}
                      onClick={() => runQuickAction(q.id)}
                      aria-label={`${tr(q.label as Parameters<typeof tr>[0])} (${q.key})`}
                      aria-pressed={on}
                      className={`relative w-full h-11 flex items-center justify-center rounded-xl border transition ${
                        disabled
                          ? 'border-slate-800/80 bg-slate-950/60 opacity-40 cursor-not-allowed'
                          : on
                          ? 'border-amber-400/70 bg-amber-500/15 cursor-pointer'
                          : 'border-slate-700 bg-slate-900/80 hover:border-purple-400 hover:bg-slate-800 cursor-pointer'
                      }`}
                    >
                      <span className={`relative z-10 leading-none select-none ${q.icon.endsWith('×') ? 'text-[11px] font-black font-mono text-amber-200' : 'text-base'} ${off ? 'grayscale opacity-50' : ''}`}>{icon}</span>
                      {off && <span className="absolute inset-x-2 top-1/2 h-0.5 -rotate-45 bg-rose-400/90" />}
                      <span className="absolute top-0.5 right-1 text-[8px] font-mono font-black text-amber-300 uppercase">{q.key}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: STATUS & WAVE ASSAULT */}
          {activeTab === 'status' && (
            <div className="space-y-2.5">
              <button
                disabled={invasion.isActive}
                onClick={() => {
                  if (invasion.isActive) return;
                  if (!constructionReady) { soundFx.playClick(); onOpenCitadel('MINIONS'); return; }
                  soundFx.playClick(); setConfirmAction('SUMMON_WAVE');
                }}
                className={`w-full rounded-2xl border p-3 text-left transition ${
                  confirmAction === 'SUMMON_WAVE' ? 'border-red-400 bg-red-950/70 ring-1 ring-red-400' : invasion.isActive ? 'border-red-900/50 bg-red-950/30' : 'border-red-700/40 bg-red-950/30 hover:border-red-500 cursor-pointer'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase text-slate-400">{isTL ? 'Pagsalakay (Wave)' : 'Invasion (Wave)'}</span>
                  <span className={`text-[10px] font-bold ${invasion.isActive ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {invasion.isActive ? (isTL ? 'LUMALABAN' : 'BATTLING') : (isTL ? 'HANDA' : 'READY')}
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-200">{tr('hudWave').replace('{n}', String(invasion.waveNumber))}</div>
                <div className="mt-1 text-[10px] text-slate-400">
                  {invasion.isActive
                    ? `${invasion.enemiesRemaining}/${invasion.totalEnemiesInWave} ${isTL ? 'natitira' : 'remaining'}`
                    : !constructionReady
                    ? (isTL ? 'Ayusin muna ang kastilyo' : 'Prepare citadel first')
                    : `${Math.ceil(invasion.countdown)}s ${isTL ? 'bago sumalakay' : 'until assault'}`}
                </div>
              </button>

              {confirmAction && (
                <div className="w-full p-2.5 rounded-xl border border-amber-500/50 bg-slate-800 flex items-center justify-between gap-2 shadow-lg">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {confirmAction === 'SKIP_DAY' ? <FastForward className="w-4 h-4 text-sky-400" /> : <Swords className="w-4 h-4 text-rose-400" />}
                    <span className="text-[10px] text-slate-200 truncate">
                      {confirmAction === 'SKIP_DAY'
                        ? (isTL ? 'Laktawan araw?' : 'Skip day?')
                        : (isTL ? 'Lumusob agad?' : 'Assault now?')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={handleConfirmAction} className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"><Check className="w-3 h-3 stroke-[3]" /></button>
                    <button onClick={() => setConfirmAction(null)} className="p-1.5 rounded-lg bg-slate-700 text-slate-300 hover:text-white cursor-pointer"><X className="w-3 h-3 stroke-[3]" /></button>
                  </div>
                </div>
              )}

              <AutoEnhancePrompt onOpenCitadel={onOpenCitadel} embedded />
            </div>
          )}

          {/* TAB 3: RESOURCES */}
          {activeTab === 'resources' && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {resourceGauges.map((resource) => (
                  <button
                    key={resource.key}
                    onClick={() => { soundFx.playClick(); onOpenQuickTrade(resource.key); }}
                    className="rounded-2xl border border-slate-800 bg-slate-900/60 p-2.5 text-left hover:border-slate-600 cursor-pointer flex flex-col justify-between"
                  >
                    <div className={`flex items-center gap-1.5 text-[11px] font-bold mb-1.5 ${resource.text}`}>
                      {resource.icon} {resource.label}
                    </div>
                    <div className="font-mono text-xs font-bold text-slate-200 mb-1">
                      {resource.value.toLocaleString()}
                    </div>
                    <div className="h-1 rounded-full bg-slate-800 overflow-hidden w-full">
                      <div className={`h-full rounded-full ${resource.color}`} style={{ width: `${Math.min(100, Math.max(8, resource.value / 10))}%` }} />
                    </div>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {([
                  ['obsidianShard', '🌋', tr('resObsidian')],
                  ['soulFragments', '💀', tr('resSouls')],
                  ['abyssalPearl', '🔮', tr('resPearl')],
                  ['scrapMetal', '⚙️', tr('resScrap')],
                ] as const).map(([key, icon, label]) => (
                  <div key={key} title={label} className="rounded-xl border border-slate-800 bg-slate-900/60 px-1.5 py-1.5 text-center">
                    <div className="text-sm leading-none">{icon}</div>
                    <div className="mt-1 font-mono text-[10px] font-bold text-slate-200">{(resources[key] ?? 0).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Docked music player: stays mounted (hidden) while the side menu is collapsed so it keeps playing */}
      <div className={isSidebarOpen ? 'pl-3 pb-2' : ''} style={isSidebarOpen ? { paddingRight: 12 + scrollGutter } : undefined}>
        <MusicPlayer placement="SIDEBAR" hidden={!isSidebarOpen} />
      </div>

      {/* 4. FOOTER CONTROLS TOOLBAR */}
      {isSidebarOpen ? (
        <div className="p-2.5 border-t border-slate-800/80 bg-slate-900 flex flex-col gap-1.5">
          {/* Pause, speed, audio, fullscreen, settings and the menu toggle live in the key list above (` 1 2 M N K J I) */}
          <div className="flex items-center justify-end gap-1">
              {/* Your music: YouTube / Spotify player (opens the music manager when no link is saved) */}
              <button
                onClick={() => {
                  soundFx.playClick();
                  if (externalMusic) setMusicPlayerOpen(!isMusicPlayerOpen);
                  else setMusicManagerOpen(true);
                }}
                title={tr('hudMusicPlayer')}
                className={`p-1.5 rounded-lg border transition cursor-pointer ${
                  isMusicPlayerOpen ? 'border-indigo-500/60 bg-indigo-500/20 text-indigo-200' : 'border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <ListMusic className="w-3.5 h-3.5" />
              </button>

          </div>
        </div>
      ) : (
        /* Minimized State Footer: Clear Maximize / Expand button and essentials */
        <div className="p-2 border-t border-slate-800/80 bg-slate-900 flex flex-col items-center gap-2">
          <button
            onClick={() => { soundFx.playClick(); togglePause(); }}
            title={gameSpeed === 0 ? tr('hudPlay') : tr('hudPause')}
            className={`w-10 h-8 rounded-lg flex items-center justify-center transition cursor-pointer border ${
              gameSpeed === 0 ? 'bg-rose-500/30 border-rose-500/50 text-rose-300' : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
            }`}
          >
            {gameSpeed === 0 ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4 fill-current" />}
          </button>

          <button
            onClick={() => { soundFx.playClick(); onOpenSettings(); }}
            title={isTL ? 'Mga Setting' : 'Settings'}
            className="w-10 h-8 rounded-lg border border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => { soundFx.playClick(); setIsSidebarOpen(true); }}
            title={isTL ? 'I-expand ang Menu' : 'Maximize / Expand Menu'}
            className="w-10 h-10 rounded-xl bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/40 flex items-center justify-center cursor-pointer transition transform hover:scale-105 animate-pulse"
          >
            <PanelRightOpen className="w-5 h-5" />
          </button>
        </div>
      )}
      <WeatherModal isOpen={isWeatherModalOpen} onClose={() => setIsWeatherModalOpen(false)} />
    </aside>
  );
};