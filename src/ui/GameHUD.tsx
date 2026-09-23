import React, { useState, useEffect } from 'react';
import { isConstructionReady } from '../state/constructionProgress';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from '../game/audio/soundFx';
import {
  BookOpen,
  Sliders,
  Zap,
  Volume2,
  VolumeX,
  Sunrise,
  Sun,
  Sunset,
  Moon,
  Maximize,
  Minimize,
  RotateCcw,
  Play,
  FastForward,
  Pause,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  HelpCircle,
  Activity,
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
  Menu,
} from 'lucide-react';
import { PLATFORM_CONFIGS, SEASON_CONFIGS } from '../types/game';
import { CitadelTab } from './CitadelCommandModal';
import { AutoEnhancePrompt } from '../ui/AutoEnhancePrompt';

interface GameHUDProps {
  onOpenCitadel: (tab?: CitadelTab) => void;
  onOpenCodex: () => void;
  onOpenBestiary: () => void;
  onOpenSettings: () => void;
  onOpenFAQ: () => void;
  onOpenSkillTree: () => void;
  onOpenRegression: () => void;
  onOpenQuickTrade: (
    resourceKey: 'aetherShards' | 'wood' | 'stone' | 'arcaneEssence' | 'fish' | 'water'
  ) => void;
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
    defense,
    invasion,
    castleBuilt,
    resourceBuildings,
    timeOfDay,
    weather,
    season,
    platformPhase,
    regressionCount,
    skillPoints,
    isAudioMuted,
    toggleAudioMute,
    autoSettings,
    toggleAutoSetting,
    language,
    gameSpeed,
    setGameSpeed,
    day,
    year,
    dayProgress,
    incrementDay,
    startInvasion,
  } = useGameStore();

  const constructionReady = isConstructionReady({ castleBuilt, resourceBuildings });

  const [isFullscreen, setIsFullscreen] = useState(
    typeof document !== 'undefined' ? !!document.fullscreenElement : false
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'command' | 'status' | 'resources'>('command');
  const [confirmAction, setConfirmAction] = useState<'SKIP_DAY' | 'SUMMON_WAVE' | null>(null);

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

  const handleToggleAudio = () => {
    soundFx.playClick();
    toggleAudioMute();
  };

  const handleConfirmAction = () => {
    soundFx.playClick();
    if (confirmAction === 'SKIP_DAY') incrementDay();
    else if (confirmAction === 'SUMMON_WAVE') startInvasion();
    setConfirmAction(null);
  };

  const timeOfDayConfig = {
    DAWN: {
      label: language === 'TL' ? 'Bukang-liwayway' : 'Dawn',
      icon: <Sunrise className="w-4 h-4 text-amber-300 animate-pulse" />,
      color: 'text-amber-200',
    },
    DAY: {
      label: language === 'TL' ? 'Araw' : 'Day',
      icon: <Sun className="w-4 h-4 text-yellow-400" />,
      color: 'text-yellow-200',
    },
    DUSK: {
      label: language === 'TL' ? 'Takipsilim' : 'Dusk',
      icon: <Sunset className="w-4 h-4 text-purple-400" />,
      color: 'text-purple-200',
    },
    NIGHT: {
      label: language === 'TL' ? 'Gabi' : 'Night',
      icon: <Moon className="w-4 h-4 text-cyan-300" />,
      color: 'text-cyan-200',
    },
  }[timeOfDay];

  const currentPlatform = PLATFORM_CONFIGS[platformPhase || 1];
  const currentSeason = SEASON_CONFIGS[season || 'SPRING'];
  const castleHpPct = Math.round((defense.castleHp / defense.castleMaxHp) * 100);
  const shieldHpPct = Math.round((defense.shieldHp / defense.shieldMaxHp) * 100);

  const resourceGauges = [
    { label: language === 'TL' ? 'Kristal' : 'Gems', key: 'aetherShards' as const, value: resources.aetherShards, color: 'bg-sky-400', text: 'text-sky-300', icon: <Gem className="w-3.5 h-3.5" /> },
    { label: language === 'TL' ? 'Kahoy' : 'Wood', key: 'wood' as const, value: resources.wood, color: 'bg-emerald-400', text: 'text-emerald-300', icon: <Trees className="w-3.5 h-3.5" /> },
    { label: language === 'TL' ? 'Bato' : 'Stone', key: 'stone' as const, value: resources.stone, color: 'bg-amber-400', text: 'text-amber-300', icon: <Hammer className="w-3.5 h-3.5" /> },
    { label: language === 'TL' ? 'Magic' : 'Essence', key: 'arcaneEssence' as const, value: resources.arcaneEssence, color: 'bg-purple-400', text: 'text-purple-300', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { label: language === 'TL' ? 'Isda' : 'Fish', key: 'fish' as const, value: resources.fish, color: 'bg-cyan-400', text: 'text-cyan-300', icon: <Fish className="w-3.5 h-3.5" /> },
    { label: language === 'TL' ? 'Tubig' : 'Water', key: 'water' as const, value: resources.water, color: 'bg-blue-400', text: 'text-blue-300', icon: <Droplets className="w-3.5 h-3.5" /> },
  ];

  return (
    <aside
      className={`relative h-full flex-shrink-0 flex flex-col bg-slate-950 border-l border-slate-800/80 transition-all duration-300 select-none z-10 overflow-hidden ${
        isSidebarOpen ? 'w-[320px]' : 'w-16'
      }`}
    >
      {/* 1. TOP HEADER */}
      <div className="flex flex-col p-3 border-b border-slate-800/80 bg-slate-900/60 gap-3">
        <div className="flex items-center justify-between">
          {isSidebarOpen ? (
            <div className="flex items-center gap-2">
              <span className="text-sm">
                {platformPhase === 1 ? '🏰' : platformPhase === 2 ? '🌋' : platformPhase === 3 ? '❄️' : '✨'}
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                {language === 'TL' ? currentPlatform.name : currentPlatform.nameEn}
              </span>
            </div>
          ) : (
            <div className="mx-auto text-sm">
              {platformPhase === 1 ? '🏰' : platformPhase === 2 ? '🌋' : platformPhase === 3 ? '❄️' : '✨'}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              soundFx.playClick();
              setIsSidebarOpen((v) => !v);
            }}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
          >
            {isSidebarOpen ? <ChevronRight className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        {isSidebarOpen && (
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
              {currentSeason.icon} <span>{language === 'TL' ? currentSeason.name : currentSeason.nameEn}</span>
            </div>
            <div className={`flex items-center gap-1.5 text-[11px] font-bold ${timeOfDayConfig.color}`}>
              {timeOfDayConfig.icon} <span>{timeOfDayConfig.label}</span>
            </div>
          </div>
        )}
      </div>

      {/* 2. MINIFIED STRIP (Nakasara ang sidebar) */}
      {!isSidebarOpen && (
        <div className="flex flex-col items-center py-4 gap-4 flex-1 overflow-y-auto">
          <div className="text-[10px] font-mono font-bold text-sky-400 text-center">W{invasion.waveNumber}</div>
          <div className="text-[10px] font-mono font-bold text-emerald-400 text-center">{castleHpPct}%</div>
          <button onClick={() => { setIsSidebarOpen(true); setActiveTab('command'); }} className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-red-300 cursor-pointer">🏰</button>
          <button onClick={() => { setIsSidebarOpen(true); setActiveTab('status'); }} className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-sky-300 cursor-pointer"><Activity className="w-4 h-4" /></button>
          <button onClick={() => { setIsSidebarOpen(true); setActiveTab('resources'); }} className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-amber-300 cursor-pointer"><Coins className="w-4 h-4" /></button>
        </div>
      )}

      {/* 3. EXPANDED SIDEBAR CONTENT */}
      {isSidebarOpen && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* TABS */}
          <div className="grid grid-cols-3 p-2 gap-1.5 border-b border-slate-800/80 bg-slate-900/30">
            <button
              onClick={() => { soundFx.playClick(); setActiveTab('command'); }}
              className={`py-2 rounded-lg text-[10px] font-bold uppercase transition flex flex-col items-center gap-1 cursor-pointer ${
                activeTab === 'command' ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <span className="text-sm">🏰</span>
              <span>Centro</span>
            </button>
            <button
              onClick={() => { soundFx.playClick(); setActiveTab('status'); }}
              className={`py-2 rounded-lg text-[10px] font-bold uppercase transition flex flex-col items-center gap-1 cursor-pointer ${
                activeTab === 'status' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Status</span>
            </button>
            <button
              onClick={() => { soundFx.playClick(); setActiveTab('resources'); }}
              className={`py-2 rounded-lg text-[10px] font-bold uppercase transition flex flex-col items-center gap-1 cursor-pointer ${
                activeTab === 'resources' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Coins className="w-4 h-4" />
              <span>Yaman</span>
            </button>
          </div>

          {/* MAIN TAB CONTENT */}
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            
            {/* COMMAND TAB */}
            {activeTab === 'command' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 justify-between bg-slate-900/60 p-2 rounded-xl border border-red-500/20">
                  <button
                    onClick={() => { soundFx.playClick(); onOpenCitadel('MINIONS'); }}
                    className="flex-1 flex items-center justify-center gap-2 px-2 py-1.5 rounded-lg bg-red-950/40 border border-red-500/30 text-red-200 text-xs font-bold cursor-pointer hover:bg-red-900/50"
                  >
                    <span>👹</span> <span>{workerCount} Alagad</span>
                  </button>
                  <button
                    onClick={() => { soundFx.playClick(); toggleAutoSetting('autoDispatch'); }}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer ${
                      autoSettings.autoDispatch ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Zap className="w-3 h-3" /> {autoSettings.autoDispatch ? 'AUTO ON' : 'AUTO OFF'}
                  </button>
                </div>

                <button
                  onClick={() => { soundFx.playClick(); onOpenCitadel(); }}
                  className="w-full flex flex-col items-center justify-center gap-1 py-4 rounded-xl bg-gradient-to-br from-red-950 via-purple-950 to-slate-900 border border-red-500/40 hover:border-amber-400 cursor-pointer shadow-lg"
                >
                  <span className="text-2xl">🏰</span>
                  <span className="text-xs font-bold text-red-100">Bukas Centro ng Kuta</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { soundFx.playClick(); onOpenSkillTree(); }}
                    className="p-2.5 rounded-lg bg-purple-950/30 border border-purple-500/30 text-purple-200 text-[11px] font-bold flex flex-col items-center gap-1.5 cursor-pointer hover:bg-purple-900/40"
                  >
                    <Sparkles className="w-4 h-4" /> <span>Skills {skillPoints > 0 && `(${skillPoints})`}</span>
                  </button>
                  <button
                    onClick={() => { soundFx.playClick(); onOpenRegression(); }}
                    className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-[11px] font-bold flex flex-col items-center gap-1.5 cursor-pointer hover:bg-slate-800"
                  >
                    <RotateCcw className="w-4 h-4 text-amber-400" /> <span>Regression</span>
                  </button>
                  <button
                    onClick={() => { soundFx.playClick(); onOpenCodex(); }}
                    className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-[11px] font-bold flex flex-col items-center gap-1.5 cursor-pointer hover:bg-slate-800"
                  >
                    <BookOpen className="w-4 h-4 text-purple-400" /> <span>Gabay</span>
                  </button>
                  <button
                    onClick={() => { soundFx.playClick(); onOpenBestiary(); }}
                    className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-[11px] font-bold flex flex-col items-center gap-1.5 cursor-pointer hover:bg-slate-800"
                  >
                    <span>📖</span> <span>Talaan</span>
                  </button>
                </div>

                <button
                  onClick={() => { soundFx.playClick(); onOpenFAQ(); }}
                  className="w-full mt-2 p-2 rounded-lg bg-slate-900/80 border border-slate-800 text-amber-300 text-[11px] font-bold flex items-center justify-center gap-1.5 hover:border-amber-400/50 cursor-pointer"
                >
                  <HelpCircle className="w-3.5 h-3.5" /> <span>FAQ / Mga Tanong</span>
                </button>
              </div>
            )}

            {/* STATUS TAB */}
            {activeTab === 'status' && (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-2.5">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-slate-400">Kastilyo</span>
                      <span className="text-emerald-300 font-mono font-bold">{castleHpPct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full bg-emerald-400" style={{ width: `${castleHpPct}%` }} />
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-2.5">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-slate-400 flex items-center gap-1"><Shield className="w-2.5 h-2.5 text-sky-400" /> Kalasag</span>
                      <span className="text-sky-300 font-mono font-bold">{shieldHpPct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full bg-sky-400" style={{ width: `${shieldHpPct}%` }} />
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => { soundFx.playClick(); setConfirmAction('SKIP_DAY'); }}
                  className={`w-full rounded-xl border p-3 text-left transition cursor-pointer ${
                    confirmAction === 'SKIP_DAY' ? 'border-sky-400 bg-sky-950/70 ring-1 ring-sky-400' : 'border-slate-800 bg-slate-900/60 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase text-slate-400">Takbo ng Panahon</span>
                    <span className="text-[10px] font-bold text-sky-300">{timeOfDayConfig.label}</span>
                  </div>
                  <div className="text-xs font-bold text-slate-200">Taon {year || 1} • Araw {day || 1}/365</div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-sky-400" style={{ width: `${dayProgress * 100}%` }} />
                  </div>
                </button>

                <button
                  disabled={invasion.isActive}
                  onClick={() => {
                    if (invasion.isActive) return;
                    if (!constructionReady) { soundFx.playClick(); onOpenCitadel('MINIONS'); return; }
                    soundFx.playClick(); setConfirmAction('SUMMON_WAVE');
                  }}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    confirmAction === 'SUMMON_WAVE' ? 'border-red-400 bg-red-950/70 ring-1 ring-red-400' : invasion.isActive ? 'border-red-900/50 bg-red-950/30' : 'border-red-700/40 bg-red-950/30 hover:border-red-500 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase text-slate-400">Pagsalakay (Wave)</span>
                    <span className={`text-[10px] font-bold ${invasion.isActive ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {invasion.isActive ? 'LUMALABAN' : 'HANDA'}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-slate-200">Wave {invasion.waveNumber}/100</div>
                  <div className="mt-1 text-[10px] text-slate-400">
                    {invasion.isActive ? `${invasion.enemiesRemaining}/${invasion.totalEnemiesInWave} natitira` : !constructionReady ? 'Ayusin muna ang kastilyo' : `${Math.ceil(invasion.countdown)}s bago sumalakay`}
                  </div>
                </button>

                {confirmAction && (
                  <div className="w-full p-2.5 rounded-lg border border-amber-500/50 bg-slate-800 flex items-center justify-between gap-2 shadow-lg">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {confirmAction === 'SKIP_DAY' ? <FastForward className="w-4 h-4 text-sky-400" /> : <Swords className="w-4 h-4 text-rose-400" />}
                      <span className="text-[10px] text-slate-200 truncate">{confirmAction === 'SKIP_DAY' ? 'Laktawan araw?' : 'Lumusob agad?'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={handleConfirmAction} className="p-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"><Check className="w-3 h-3 stroke-[3]" /></button>
                      <button onClick={() => setConfirmAction(null)} className="p-1.5 rounded bg-slate-700 text-slate-300 hover:text-white cursor-pointer"><X className="w-3 h-3 stroke-[3]" /></button>
                    </div>
                  </div>
                )}

                <AutoEnhancePrompt onOpenCitadel={onOpenCitadel} embedded />
              </div>
            )}

            {/* RESOURCES TAB */}
            {activeTab === 'resources' && (
              <div className="grid grid-cols-2 gap-2">
                {resourceGauges.map((resource) => (
                  <button
                    key={resource.key}
                    onClick={() => { soundFx.playClick(); onOpenQuickTrade(resource.key); }}
                    className="rounded-xl border border-slate-800 bg-slate-900/60 p-2.5 text-left hover:border-slate-600 cursor-pointer flex flex-col justify-between"
                  >
                    <div className={`flex items-center gap-1.5 text-[11px] font-bold mb-2 ${resource.text}`}>
                      {resource.icon} {resource.label}
                    </div>
                    <div className="font-mono text-sm font-bold text-slate-200 mb-1.5">
                      {resource.value.toLocaleString()}
                    </div>
                    <div className="h-1 rounded-full bg-slate-800 overflow-hidden w-full">
                      <div className={`h-full rounded-full ${resource.color}`} style={{ width: `${Math.min(100, Math.max(8, resource.value / 10))}%` }} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 4. FOOTER CONTROLS */}
          <div className="p-3 border-t border-slate-800/80 bg-slate-900 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button onClick={() => setGameSpeed(0)} className={`p-1.5 rounded flex-1 flex justify-center ${gameSpeed === 0 ? 'bg-rose-500/30 text-rose-300' : 'text-slate-400 hover:bg-slate-800'}`}><Pause className="w-3.5 h-3.5 fill-current" /></button>
                <button onClick={() => setGameSpeed(1)} className={`p-1.5 rounded flex-1 flex justify-center ${gameSpeed === 1 ? 'bg-emerald-500/30 text-emerald-300' : 'text-slate-400 hover:bg-slate-800'}`}><Play className="w-3.5 h-3.5 fill-current" /></button>
                <button onClick={() => setGameSpeed(2)} className={`p-1.5 rounded flex-1 flex justify-center ${gameSpeed === 2 ? 'bg-amber-500/30 text-amber-300' : 'text-slate-400 hover:bg-slate-800'}`}><FastForward className="w-3.5 h-3.5 fill-current" /></button>
              </div>

              <div className="flex items-center gap-1">
                <button onClick={handleToggleAudio} className="p-2 rounded-lg border border-slate-800 text-slate-300 hover:bg-slate-800">{isAudioMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-sky-400" />}</button>
                <button onClick={() => { soundFx.playClick(); onOpenSettings(); }} className="p-2 rounded-lg border border-slate-800 text-slate-300 hover:bg-slate-800"><Sliders className="w-4 h-4" /></button>
                <button onClick={toggleFullscreen} className="p-2 rounded-lg border border-slate-800 text-slate-300 hover:bg-slate-800">{isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};