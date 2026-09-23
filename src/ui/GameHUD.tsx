import { isConstructionReady } from '../state/constructionProgress';
import React from 'react';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from '../game/audio/soundFx';
import {
  Gem,
  Trees,
  Hammer,
  Sparkles,
  Bot,
  Plus,
  BookOpen,
  Sliders,
  Zap,
  Volume2,
  VolumeX,
  Sun,
  Moon,
  Sunrise,
  Sunset,
  Coins,
  Store,
  Shield,
  Maximize,
  Minimize,
  Fish,
  Droplets,
  RotateCcw,
  Activity,
  Bell,
  ArrowUpRight,
  Play,
  FastForward,
  Pause,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { InvasionBanner } from './InvasionBanner';
import { AutoEnhancePrompt } from './AutoEnhancePrompt';
import { PLATFORM_CONFIGS, SEASON_CONFIGS } from '../types/game';

import { CitadelTab } from './CitadelCommandModal';

interface GameHUDProps {
  onOpenCitadel: (tab?: CitadelTab) => void;
  onOpenCodex: () => void;
  onOpenBestiary: () => void;
  onOpenSettings: () => void;
  onOpenFAQ: () => void;
  onOpenSkillTree: () => void;
  onOpenRegression: () => void;
  onOpenQuickTrade: (resourceKey: 'aetherShards' | 'wood' | 'stone' | 'arcaneEssence' | 'fish' | 'water') => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  onOpenCitadel,
  onOpenCodex,
  onOpenBestiary,
  onOpenSettings,
  onOpenFAQ,
  onOpenSkillTree,
  onOpenRegression,
  onOpenQuickTrade,
}) => {
  const {
    resources,
    workerCount,
    roster,
    defense,
    invasion,
    castleBuilt,
    resourceBuildings,
    timeOfDay,
    weather,
    day,
    year,
    season,
    platformPhase,
    regressionCount,
    skillPoints,
    dayProgress,
    isAudioMuted,
    toggleAudioMute,
    autoSettings,
    toggleAutoSetting,
    language,
    incrementDay,
    startInvasion,
    gameSpeed,
    setGameSpeed,
  } = useGameStore();

  const constructionReady = isConstructionReady({ castleBuilt, resourceBuildings });

  // Active task distribution count
  const aetherCount = roster.filter((u) => u.assignedTask === 'AETHER').length;
  const stoneCount = roster.filter((u) => u.assignedTask === 'STONE').length;
  const woodCount = roster.filter((u) => u.assignedTask === 'WOOD').length;
  const essenceCount = roster.filter((u) => u.assignedTask === 'ESSENCE').length;

  const handleToggleAudio = () => {
    soundFx.playClick();
    toggleAudioMute();
  };

  const [isFullscreen, setIsFullscreen] = React.useState(!!document.fullscreenElement);
  const [isRealmLogOpen, setIsRealmLogOpen] = React.useState(true);
  const [isBottomBarVisible, setIsBottomBarVisible] = React.useState(true);

  React.useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    soundFx.playClick();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  // Time of Day icon & color configuration
  const timeOfDayConfig = {
    DAWN: {
      label: language === 'TL' ? 'Bukang-liwayway' : 'Dawn',
      icon: <Sunrise className="w-4 h-4 text-amber-300 animate-pulse" />,
      color: 'border-amber-500/30 text-amber-200',
    },
    DAY: {
      label: language === 'TL' ? 'Araw' : 'Day',
      icon: <Sun className="w-4 h-4 text-yellow-400" />,
      color: 'border-sky-500/30 text-sky-200',
    },
    DUSK: {
      label: language === 'TL' ? 'Takipsilim' : 'Dusk',
      icon: <Sunset className="w-4 h-4 text-purple-400" />,
      color: 'border-purple-500/30 text-purple-200',
    },
    NIGHT: {
      label: language === 'TL' ? 'Gabi' : 'Night',
      icon: <Moon className="w-4 h-4 text-cyan-300" />,
      color: 'border-indigo-500/30 text-cyan-200',
    },
  }[timeOfDay];

  const castleHpPct = Math.round((defense.castleHp / defense.castleMaxHp) * 100);
  const shieldHpPct = Math.round((defense.shieldHp / defense.shieldMaxHp) * 100);
  const resourceGauges = [
    { label: language === 'TL' ? 'Kristal' : 'Gems', value: resources.aetherShards, color: 'bg-sky-400', text: 'text-sky-300', icon: <Gem className="w-3.5 h-3.5" /> },
    { label: language === 'TL' ? 'Kahoy' : 'Wood', value: resources.wood, color: 'bg-emerald-400', text: 'text-emerald-300', icon: <Trees className="w-3.5 h-3.5" /> },
    { label: language === 'TL' ? 'Bato' : 'Stone', value: resources.stone, color: 'bg-amber-400', text: 'text-amber-300', icon: <Hammer className="w-3.5 h-3.5" /> },
    { label: language === 'TL' ? 'Magic' : 'Essence', value: resources.arcaneEssence, color: 'bg-purple-400', text: 'text-purple-300', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { label: language === 'TL' ? 'Isda' : 'Fish', value: resources.fish, color: 'bg-cyan-400', text: 'text-cyan-300', icon: <Fish className="w-3.5 h-3.5" /> },
    { label: language === 'TL' ? 'Tubig' : 'Water', value: resources.water, color: 'bg-blue-400', text: 'text-blue-300', icon: <Droplets className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-between p-3 md:p-5 select-none">
      {/* Top Section: Header Bar + Incursion Banner */}
      <div className="flex flex-col gap-2 w-full pointer-events-none">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 w-full">
        {/* Realm Badge & Day/Night Indicator */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Platform & Phase Badge */}
          {(() => {
            const currentPlatform = PLATFORM_CONFIGS[platformPhase || 1];
            const currentSeason = SEASON_CONFIGS[season || 'SPRING'];
            return (
              <div className="pointer-events-auto glass-panel px-3.5 py-2 rounded-2xl flex items-center gap-2.5 shadow-md border-red-500/30 bg-red-950/20">
                <div 
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-base shadow-sm border"
                  style={{ backgroundColor: `${currentPlatform.accentColor}25`, borderColor: currentPlatform.accentColor }}
                >
                  {platformPhase === 1 ? '🏰' : platformPhase === 2 ? '🌋' : platformPhase === 3 ? '❄️' : '✨'}
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold flex items-center gap-1.5" style={{ color: currentPlatform.accentColor }}>
                    <span>Phase {platformPhase}: {language === 'TL' ? currentPlatform.name : currentPlatform.nameEn}</span>
                  </div>
                  <div className="text-sm font-bold text-slate-100 flex items-center gap-2 flex-wrap">
                    {/* Season Badge */}
                    <span 
                      className="text-xs px-1.5 py-0.5 rounded font-medium border border-slate-700 bg-slate-900/60 flex items-center gap-1"
                      style={{ color: currentSeason.color }}
                      title={language === 'TL' ? currentSeason.description : currentSeason.descriptionEn}
                    >
                      <span>{currentSeason.icon}</span>
                      <span>{language === 'TL' ? currentSeason.name : currentSeason.nameEn}</span>
                    </span>

                    {/* Day & Year Badge (Day 1 - 365) */}
                    <div 
                      className="relative overflow-hidden text-xs px-1.5 py-0.5 rounded bg-slate-900/50 border border-slate-700 text-slate-300 cursor-pointer hover:bg-slate-800 transition-colors flex items-center gap-1"
                      onClick={() => {
                        soundFx.playClick();
                        if (window.confirm(language === 'TL' ? 'Sigurado ka bang gusto mong pabilisin ang oras papunta sa susunod na araw?' : 'Are you sure you want to skip to the next day?')) {
                          incrementDay();
                        }
                      }}
                      title={language === 'TL' ? 'Pindutin para lumipat sa susunod na araw' : 'Click to skip to next day'}
                    >
                      <div 
                        className="absolute left-0 top-0 bottom-0 bg-slate-600/50 pointer-events-none" 
                        style={{ width: `${dayProgress * 100}%`, transition: 'width 0.5s linear' }} 
                      />
                      <span className="relative z-10 pointer-events-none">
                        Y{year || 1} • {language === 'TL' ? 'Araw' : 'Day'} {day || 1}/365
                      </span>
                    </div>

                    {/* Weather Badge */}
                    <div 
                      className="px-1.5 py-0.5 rounded bg-slate-900/50 border border-slate-700 text-slate-300 text-xs font-mono"
                      title={language === 'TL' ? 'Kasalukuyang Panahon' : 'Current Weather'}
                    >
                      {weather === 'CLEAR' && '☀️'}
                      {weather === 'RAIN' && '🌧️'}
                      {weather === 'SNOW' && '❄️'}
                      {weather === 'HEATWAVE' && '🌡️'}
                    </div>

                    {/* Wave Badge (1 to 100) */}
                    <div 
                      className={`relative overflow-hidden text-xs px-2 py-0.5 rounded border border-red-700/50 font-bold transition-colors ${!invasion.isActive ? 'bg-red-900/50 text-red-200 cursor-pointer hover:bg-red-800/80' : 'bg-red-950/50 text-red-400 cursor-not-allowed'}`}
                      onClick={() => {
                        if (invasion.isActive) return;
                        if (!constructionReady) {
                          onOpenCitadel('MINIONS');
                          return;
                        }
                        soundFx.playClick();
                        if (window.confirm(language === 'TL' ? 'Sigurado ka bang gusto mong simulan agad ang pagsugod ng mga kalaban?' : 'Are you sure you want to summon the next wave early?')) {
                          startInvasion();
                        }
                      }}
                      title={!constructionReady ? (language === 'TL' ? 'Itayo ang kastilyo para simulan ang countdown' : 'Build the castle and all four resource buildings to start waves') : !invasion.isActive ? (language === 'TL' ? 'Pindutin para simulan ang labanan' : 'Click to summon invasion early') : ''}
                    >
                      <div 
                        className="absolute left-0 top-0 bottom-0 bg-red-600/50 pointer-events-none" 
                        style={{ width: `${(Math.max(0, (invasion.maxCountdown - invasion.countdown)) / (invasion.maxCountdown || 1)) * 100}%`, transition: 'width 0.5s linear' }} 
                      />
                      <span className="relative z-10 pointer-events-none">
                        Wave {invasion.waveNumber}/100
                        {!constructionReady && (language === 'TL' ? ' · Unahin ang konstruksyon' : ' · Construction first')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Time of Day Cycle Badge */}
          <div
            className={`pointer-events-auto glass-panel px-3 py-2 rounded-2xl flex items-center gap-1.5 text-xs font-bold ${timeOfDayConfig.color}`}
            title={`Oras sa Mundo: ${timeOfDayConfig.label}`}
          >
            {timeOfDayConfig.icon}
            <span className="tracking-wide uppercase text-[11px]">
              {timeOfDayConfig.label}
            </span>
          </div>
        </div>

        {/* Resource Badges (Click to Quick Trade) */}
        <div className="hidden pointer-events-auto flex-wrap items-center gap-1.5 md:gap-2">
          {/* Aether Shards (Kristal) */}
          <button
            onClick={() => {
              soundFx.playClick();
              onOpenQuickTrade('aetherShards');
            }}
            className="glass-panel px-3 py-1.5 rounded-2xl flex items-center gap-2 border-sky-500/40 hover:border-sky-300 hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-sm group"
            title={language === 'TL' ? 'Pindutin para magpalit ng Kristal ➔ Barya' : 'Click to Quick Trade Gems ➔ Coins'}
          >
            <div className="p-1.5 rounded-xl bg-sky-500/20 text-sky-300 group-hover:scale-110 transition-transform">
              <Gem className="w-4 h-4 fill-sky-400/30" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[9px] uppercase font-bold text-sky-200/80 leading-tight">
                💎 {language === 'TL' ? 'Kristal' : 'Gems'}
              </span>
              <span className="text-sm font-black font-mono text-sky-300 glow-blue">
                {resources.aetherShards.toLocaleString()}
              </span>
            </div>
          </button>

          {/* Wood (Kahoy) */}
          <button
            onClick={() => {
              soundFx.playClick();
              onOpenQuickTrade('wood');
            }}
            className="glass-panel-emerald px-3 py-1.5 rounded-2xl flex items-center gap-2 border-emerald-500/40 hover:border-emerald-300 hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-sm group"
            title={language === 'TL' ? 'Pindutin para magpalit ng Kahoy ➔ Barya' : 'Click to Quick Trade Wood ➔ Coins'}
          >
            <div className="p-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 group-hover:scale-110 transition-transform">
              <Trees className="w-4 h-4" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[9px] uppercase font-bold text-emerald-200/80 leading-tight">
                🌲 {language === 'TL' ? 'Kahoy' : 'Wood'}
              </span>
              <span className="text-sm font-black font-mono text-emerald-300 glow-emerald">
                {resources.wood.toLocaleString()}
              </span>
            </div>
          </button>

          {/* Stone (Bato) */}
          <button
            onClick={() => {
              soundFx.playClick();
              onOpenQuickTrade('stone');
            }}
            className="glass-panel-amber px-3 py-1.5 rounded-2xl flex items-center gap-2 border-amber-500/40 hover:border-amber-300 hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-sm group"
            title={language === 'TL' ? 'Pindutin para magpalit ng Bato ➔ Barya' : 'Click to Quick Trade Stone ➔ Coins'}
          >
            <div className="p-1.5 rounded-xl bg-amber-500/20 text-amber-300 group-hover:scale-110 transition-transform">
              <Hammer className="w-4 h-4" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[9px] uppercase font-bold text-amber-200/80 leading-tight">
                🪨 {language === 'TL' ? 'Bato' : 'Stone'}
              </span>
              <span className="text-sm font-black font-mono text-amber-300 glow-amber">
                {resources.stone.toLocaleString()}
              </span>
            </div>
          </button>

          {/* Arcane Essence (Magic) */}
          <button
            onClick={() => {
              soundFx.playClick();
              onOpenQuickTrade('arcaneEssence');
            }}
            className="glass-panel-purple px-3 py-1.5 rounded-2xl flex items-center gap-2 border-purple-500/40 hover:border-purple-300 hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-sm group"
            title={language === 'TL' ? 'Pindutin para magpalit ng Magic ➔ Barya' : 'Click to Quick Trade Magic ➔ Coins'}
          >
            <div className="p-1.5 rounded-xl bg-purple-500/20 text-purple-300 group-hover:scale-110 transition-transform">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[9px] uppercase font-bold text-purple-200/80 leading-tight">
                🔮 {language === 'TL' ? 'Magic' : 'Magic'}
              </span>
              <span className="text-sm font-black font-mono text-purple-300">
                {resources.arcaneEssence.toLocaleString()}
              </span>
            </div>
          </button>

          {/* Fish (Isda) */}
          <button
            onClick={() => {
              soundFx.playClick();
              onOpenQuickTrade('fish');
            }}
            className="glass-panel-cyan px-3 py-1.5 rounded-2xl flex items-center gap-2 border-cyan-500/40 hover:border-cyan-300 hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-sm group"
            title={language === 'TL' ? 'Pindutin para magpalit ng Isda ➔ Barya' : 'Click to Quick Trade Fish ➔ Coins'}
          >
            <div className="p-1.5 rounded-xl bg-cyan-500/20 text-cyan-300 group-hover:scale-110 transition-transform">
              <Fish className="w-4 h-4" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[9px] uppercase font-bold text-cyan-200/80 leading-tight">
                🐟 {language === 'TL' ? 'Isda' : 'Fish'}
              </span>
              <span className="text-sm font-black font-mono text-cyan-300">
                {resources.fish.toLocaleString()}
              </span>
            </div>
          </button>

          {/* Water (Tubig) */}
          <button
            onClick={() => {
              soundFx.playClick();
              onOpenQuickTrade('water');
            }}
            className="glass-panel-blue px-3 py-1.5 rounded-2xl flex items-center gap-2 border-blue-500/40 hover:border-blue-300 hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-sm group"
            title={language === 'TL' ? 'Pindutin para magpalit ng Tubig ➔ Barya' : 'Click to Quick Trade Water ➔ Coins'}
          >
            <div className="p-1.5 rounded-xl bg-blue-500/20 text-blue-300 group-hover:scale-110 transition-transform">
              <Droplets className="w-4 h-4" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[9px] uppercase font-bold text-blue-200/80 leading-tight">
                💧 {language === 'TL' ? 'Tubig' : 'Water'}
              </span>
              <span className="text-sm font-black font-mono text-blue-300">
                {resources.water.toLocaleString()}
              </span>
            </div>
          </button>

          {/* Gold Coins (Barya) */}
          <div className="glass-panel px-3.5 py-1.5 rounded-2xl flex items-center gap-2 border-amber-400/50 bg-amber-950/40 shadow-md">
            <div className="p-1.5 rounded-xl bg-amber-500/20 text-amber-300">
              <Coins className="w-4 h-4" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[9px] uppercase font-bold text-amber-200 leading-tight">
                🪙 {language === 'TL' ? 'Gintong Barya' : 'Gold Coins'}
              </span>
              <span className="text-sm font-black font-mono text-amber-300">
                {resources.coins.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

    </div>

      {/* Persistent lower-right calls and gauges keep the main play area open. */}
      <aside className={`pointer-events-auto absolute bottom-[8rem] right-3 w-[min(22rem,calc(100vw-1.5rem))] rounded-3xl border border-sky-400/20 bg-slate-950/90 shadow-2xl shadow-slate-950/60 backdrop-blur-xl md:right-5 ${isRealmLogOpen ? 'p-4' : 'p-2'}`}>
        <button
          type="button"
          onClick={() => {
            soundFx.playClick();
            setIsRealmLogOpen((open) => !open);
          }}
          className={`flex w-full items-center justify-between text-left ${isRealmLogOpen ? 'border-b border-slate-800/80 pb-3' : 'rounded-2xl px-2 py-1'}`}
          aria-expanded={isRealmLogOpen}
          title={isRealmLogOpen ? 'Hide Realm Log' : 'Show Realm Log'}
        >
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-sky-400/15 p-2 text-sky-300"><Activity className="h-4 w-4" /></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-300/80">{language === 'TL' ? 'Talaan ng Kuta' : 'Realm Log'}</p>
              {isRealmLogOpen && <p className="text-xs text-slate-400">{language === 'TL' ? 'Mga tawag at kalagayan' : 'Live calls and status'}</p>}
            </div>
          </div>
          <Bell className={`h-4 w-4 ${invasion.isActive ? 'text-rose-400 animate-pulse' : 'text-slate-500'}`} />
        </button>

        {isRealmLogOpen && <div className="max-h-[calc(100vh-11rem)] overflow-y-auto pr-1">
        <div className="space-y-2.5 py-3">
          <InvasionBanner />
          <div className="flex items-start gap-2 text-xs">
            <span className={`mt-0.5 h-2 w-2 rounded-full ${invasion.isActive ? 'bg-rose-400 animate-pulse' : 'bg-emerald-400'}`} />
            <span className="flex-1 text-slate-300">{invasion.isActive ? `${invasion.enemiesRemaining} / ${invasion.totalEnemiesInWave} ${language === 'TL' ? 'kalaban ang natitira' : 'enemies remain'} · Wave ${invasion.waveNumber}` : !constructionReady ? (language === 'TL' ? 'Hinihintay ang konstruksyon' : 'Waves pending construction') : `${language === 'TL' ? 'Susunod na wave' : 'Next wave'} ${Math.ceil(invasion.countdown)}s`}</span>
          </div>
          <div className="flex items-start gap-2 text-xs">
            <span className={`mt-0.5 h-2 w-2 rounded-full ${castleHpPct < 40 ? 'bg-rose-400' : 'bg-amber-400'}`} />
            <span className="flex-1 text-slate-300">{language === 'TL' ? 'Kastilyo' : 'Castle'} {castleHpPct}% · {workerCount} {language === 'TL' ? 'alagad ang aktibo' : 'minions active'}</span>
          </div>

        </div>

        <AutoEnhancePrompt onOpenCitadel={onOpenCitadel} embedded />

        <div className="border-t border-slate-800/80 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{language === 'TL' ? 'Mga Yaman' : 'Resources'}</span>
            <span className="text-[10px] text-slate-500">{language === 'TL' ? 'Pindutin para magpalit' : 'Click to trade'}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
            {resourceGauges.map((resource) => (
              <button
                key={resource.label}
                onClick={() => onOpenQuickTrade(resource.label === 'Gems' || resource.label === 'Kristal' ? 'aetherShards' : resource.label === 'Wood' || resource.label === 'Kahoy' ? 'wood' : resource.label === 'Stone' || resource.label === 'Bato' ? 'stone' : resource.label === 'Essence' || resource.label === 'Magic' ? 'arcaneEssence' : resource.label === 'Fish' || resource.label === 'Isda' ? 'fish' : 'water')}
                className="group text-left"
              >
                <div className="mb-1 flex items-center justify-between text-[10px]"><span className={`flex items-center gap-1 ${resource.text}`}>{resource.icon}{resource.label}</span><span className="font-mono text-slate-300">{resource.value.toLocaleString()}</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-800"><div className={`h-full min-w-[8%] rounded-full ${resource.color} opacity-80 transition-all duration-500 group-hover:opacity-100`} style={{ width: `${Math.min(100, Math.max(8, resource.value / 10))}%` }} /></div>
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-800/80 pt-3">
            <div><div className="mb-1 flex justify-between text-[10px] text-slate-400"><span>{language === 'TL' ? 'Kastilyo' : 'Castle'}</span><span className="text-emerald-300">{castleHpPct}%</span></div><div className="h-1.5 rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${castleHpPct}%` }} /></div></div>
            <div><div className="mb-1 flex justify-between text-[10px] text-slate-400"><span>{language === 'TL' ? 'Kalasag' : 'Shield'}</span><span className="text-sky-300">{shieldHpPct}%</span></div><div className="h-1.5 rounded-full bg-slate-800"><div className="h-full rounded-full bg-sky-400" style={{ width: `${shieldHpPct}%` }} /></div></div>
          </div>
        </div>
        </div>}
      </aside>

      {/* Bottom Controls Bar */}
      <div className="relative w-full pointer-events-none">
        {/* Keep the collapse control above the bar so it never covers speed controls. */}
        <button
          onClick={() => setIsBottomBarVisible((v) => !v)}
          className="pointer-events-auto absolute -top-7 left-1/2 z-30 -translate-x-1/2 rounded-t-xl border border-slate-700 bg-slate-900/90 px-3 py-1 text-slate-400 shadow-lg transition-colors hover:bg-slate-800 hover:text-slate-200"
          aria-label={isBottomBarVisible ? 'Hide bottom controls' : 'Show bottom controls'}
        >
          {isBottomBarVisible ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>

        <div className={`flex flex-col md:flex-row items-end md:items-center justify-between gap-3 w-full transition-transform duration-300 ${isBottomBarVisible ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0 pointer-events-none'}`}>
          {/* Autonomous Workers & Task Distribution */}
          <div className="pointer-events-auto glass-panel p-2 md:p-2.5 rounded-3xl flex flex-wrap items-center gap-2 md:gap-3 shadow-xl">
          {/* Active Units with Live Task Distribution */}
          <button
            onClick={() => {
              soundFx.playClick();
              onOpenCitadel('MINIONS');
            }}
            className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-slate-900/90 border border-red-500/30 hover:border-red-400 hover:scale-102 transition-all cursor-pointer group shadow-sm"
            title={language === 'TL' ? "Pindutin para mag-utos o magdagdag ng mga Alagad na Demonyo at Halimaw" : "Click to command or add Demon Servants and Monsters"}
          >
            <div className="w-8 h-8 rounded-xl bg-red-500/20 flex items-center justify-center text-red-400 group-hover:scale-110 transition-transform text-lg">
              👹
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[9px] uppercase font-bold text-red-300">
                {language === 'TL' ? 'Mga Alagad (Minions)' : 'Servants (Minions)'}
              </span>
              <span className="text-sm font-black font-mono text-red-100">
                {workerCount} {language === 'TL' ? 'Alagad' : 'Minions'}
              </span>
            </div>
          </button>

          {/* Auto Mode Switch */}
          <div className="flex items-center gap-1.5 pl-1 border-l border-slate-700/60">
            <button
              onClick={() => {
                soundFx.playClick();
                toggleAutoSetting('autoDispatch');
              }}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                autoSettings.autoDispatch
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                  : 'bg-slate-900/80 text-slate-400 border border-slate-700/60 hover:text-slate-200'
              }`}
              title={language === 'TL' ? "Kusang magtatrabaho ang mga katulong kapag bukas ito" : "Servants will automatically work when this is on"}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{language === 'TL' ? 'Kusa' : 'Auto'}: {autoSettings.autoDispatch ? (language === 'TL' ? 'BUKAS' : 'ON') : (language === 'TL' ? 'PATAY' : 'OFF')}</span>
            </button>
          </div>
          </div>

          {/* Action Drawers and Modals Toggle */}
          <div className="pointer-events-auto flex items-center flex-wrap gap-2">
          {/* Speed Controls */}
          <div className="glass-panel px-2 py-1.5 rounded-2xl flex items-center gap-1 border-emerald-500/30 shadow-md">
            <button
              onClick={() => { soundFx.playClick(); setGameSpeed(0); }}
              className={`p-1.5 rounded-xl transition-all ${gameSpeed === 0 ? 'bg-rose-500/30 text-rose-300 scale-110 border border-rose-500/50' : 'text-slate-400 hover:text-rose-300 hover:bg-slate-800'}`}
              title="Pause"
            >
              <Pause className="w-4 h-4 fill-current" />
            </button>
            <button
              onClick={() => { soundFx.playClick(); setGameSpeed(1); }}
              className={`p-1.5 rounded-xl transition-all ${gameSpeed === 1 ? 'bg-emerald-500/30 text-emerald-300 scale-110 border border-emerald-500/50' : 'text-slate-400 hover:text-emerald-300 hover:bg-slate-800'}`}
              title="Play (Normal Speed)"
            >
              <Play className="w-4 h-4 fill-current" />
            </button>
            <button
              onClick={() => { soundFx.playClick(); setGameSpeed(2); }}
              className={`p-1.5 rounded-xl transition-all ${gameSpeed === 2 ? 'bg-amber-500/30 text-amber-300 scale-110 border border-amber-500/50' : 'text-slate-400 hover:text-amber-300 hover:bg-slate-800'}`}
              title="Fast Forward (2x Speed)"
            >
              <FastForward className="w-4 h-4 fill-current" />
            </button>
          </div>

          {/* UNIFIED CITADEL COMMAND SANCTUM BUTTON */}
          <button
            onClick={() => {
              soundFx.playClick();
              onOpenCitadel();
            }}
            className="glass-panel px-4 py-2 rounded-2xl flex items-center gap-2.5 bg-gradient-to-r from-red-950/80 via-purple-950/70 to-slate-900/90 border border-red-500/50 hover:border-amber-400 hover:scale-105 transition-all active:scale-95 cursor-pointer shadow-lg shadow-red-950/50 group"
            title={language === 'TL' ? "Pangasiwaan ng Kuta (Citadel Command) - Alagad, Tindahan, Sandata, Agham, at Kastilyo" : "Citadel Command Sanctum - Minions, Market, Forge, Tech Research, & Castle Fortifications"}
          >
            <div className="w-6 h-6 rounded-lg bg-red-600/30 flex items-center justify-center text-sm group-hover:scale-110 transition-transform">
              🏰
            </div>
            <div className="flex flex-col text-left">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black text-red-100 tracking-wide">
                  {language === 'TL' ? 'Pangasiwaan ng Kuta' : 'Citadel Command'}
                </span>
                <span className="text-[9px] font-mono font-bold text-amber-300 bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-500/30">
                  HP {defense.castleHp}
                </span>
              </div>
              <span className="text-[9px] text-slate-400 font-medium">
                {language === 'TL' ? 'Alagad • Tindahan • Gamit • Agham • Depensa' : 'Minions • Shop • Gears • Tech • Castle'}
              </span>
            </div>
          </button>

          {/* Gabay / Paano Laruin (Codex) */}
          <button
            onClick={() => {
              soundFx.playClick();
              onOpenCodex();
            }}
            className="glass-panel px-3.5 py-2 rounded-2xl flex items-center gap-2 hover:border-purple-400 hover:scale-105 text-purple-200 transition-all active:scale-95 cursor-pointer shadow-md"
            title={language === 'TL' ? "Paano laruin ang laro" : "How to play"}
          >
            <BookOpen className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-bold">{language === 'TL' ? 'Gabay' : 'Guide'}</span>
          </button>

          {/* Talaan ng Nilalang (Bestiary / Compendium) */}
          <button
            onClick={() => {
              soundFx.playClick();
              onOpenBestiary();
            }}
            className="glass-panel px-3.5 py-2 rounded-2xl flex items-center gap-2 hover:border-red-400 hover:scale-105 bg-red-950/30 text-red-200 transition-all active:scale-95 cursor-pointer shadow-md border-red-500/30"
            title={language === 'TL' ? "Talaan ng mga Alagad at Kalabang Tao/Mecha (Bestiary)" : "Compendium of Servants and Enemies (Bestiary)"}
          >
            <span className="text-sm">📖</span>
            <span className="text-xs font-bold text-red-300">{language === 'TL' ? 'Talaan' : 'Codex'}</span>
          </button>

          {/* Regression (Rebirth / Timeline Reset) */}
          <button
            onClick={() => {
              soundFx.playClick();
              onOpenRegression();
            }}
            className={`glass-panel px-3.5 py-2 rounded-2xl flex items-center gap-2 hover:scale-105 transition-all active:scale-95 cursor-pointer shadow-md border ${
              invasion.waveNumber >= 100
                ? 'bg-amber-500/20 border-amber-400 text-amber-200 animate-pulse'
                : 'bg-purple-950/30 border-purple-500/40 text-purple-200 hover:border-purple-400'
            }`}
            title={language === 'TL' ? "Regression - Muling Pagkabuhay at Tala ng Pag-usad" : "Regression - Timeline Rebirth & Progression Records"}
          >
            <RotateCcw className="w-4 h-4 text-purple-300" />
            <span className="text-xs font-bold">{language === 'TL' ? 'Regression' : 'Regression'}</span>
            {regressionCount > 0 && (
              <span className="text-[10px] font-mono font-bold text-amber-300 bg-slate-900/90 px-1.5 py-0.5 rounded border border-amber-500/30">
                +{regressionCount}
              </span>
            )}
          </button>

          {/* Audio Mute/Unmute */}
          <button
            onClick={handleToggleAudio}
            className={`glass-panel p-2.5 rounded-2xl transition-all active:scale-95 cursor-pointer shadow-md ${
              isAudioMuted
                ? 'border-rose-500/50 text-rose-400 hover:bg-rose-950/40'
                : 'border-sky-500/30 text-sky-300 hover:bg-slate-850'
            }`}
            title={isAudioMuted ? (language === 'TL' ? 'Buksan ang Tunog' : 'Unmute Audio') : (language === 'TL' ? 'I-mute ang Tunog' : 'Mute Audio')}
          >
            {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button onClick={onOpenSkillTree} className="glass-panel rounded-2xl px-3 py-2.5 text-xs font-bold text-purple-200 hover:border-purple-400">
            Skills{skillPoints > 0 ? ` (${skillPoints})` : ''}
          </button>
          <button onClick={onOpenFAQ} className="glass-panel rounded-2xl px-3 py-2.5 text-xs font-bold text-amber-200 hover:border-amber-400" title="Gameplay FAQ">
            FAQ
          </button>

          {/* Settings */}
          <button
            onClick={() => {
              soundFx.playClick();
              onOpenSettings();
            }}
            className="glass-panel p-2.5 rounded-2xl hover:border-slate-500 hover:scale-105 text-slate-300 transition-all active:scale-95 cursor-pointer shadow-md"
            title={language === 'TL' ? "Mga Setting at Pag-save" : "Settings & Save"}
          >
            <Sliders className="w-4 h-4" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="glass-panel p-2.5 rounded-2xl hover:border-slate-500 hover:scale-105 text-slate-300 transition-all active:scale-95 cursor-pointer shadow-md"
            title={isFullscreen ? (language === 'TL' ? 'Isara ang Buong Screen' : 'Exit Fullscreen') : (language === 'TL' ? 'Buong Screen' : 'Enter Fullscreen')}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
};
