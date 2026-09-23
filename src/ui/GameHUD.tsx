import React from 'react';
import { isConstructionReady } from '../state/constructionProgress';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from '../game/audio/soundFx';
import {
  Gem,
  Trees,
  Hammer,
  Sparkles,
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
  Maximize,
  Minimize,
  Fish,
  Droplets,
  RotateCcw,
  Play,
  FastForward,
  Pause,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { PLATFORM_CONFIGS, SEASON_CONFIGS } from '../types/game';
import { CitadelTab } from './CitadelCommandModal';
import { RealmLog } from '../components/Realmlog';

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
  } = useGameStore();

  const constructionReady = isConstructionReady({ castleBuilt, resourceBuildings });

  const [isFullscreen, setIsFullscreen] = React.useState(
    typeof document !== 'undefined' ? !!document.fullscreenElement : false
  );
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

  const handleToggleAudio = () => {
    soundFx.playClick();
    toggleAudioMute();
  };

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

  return (
    <div className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-between p-3 md:p-5 select-none">
      {/* Top Header Section */}
      <div className="flex flex-col gap-2 w-full pointer-events-none">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 w-full">
          {/* Realm Badge & Day/Night Indicator */}
          <div className="flex items-center gap-2 flex-wrap">
            {(() => {
              const currentPlatform = PLATFORM_CONFIGS[platformPhase || 1];
              const currentSeason = SEASON_CONFIGS[season || 'SPRING'];
              return (
                <div className="pointer-events-auto glass-panel px-3.5 py-2 rounded-2xl flex items-center gap-2.5 shadow-md border-red-500/30 bg-red-950/20">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-base shadow-sm border"
                    style={{
                      backgroundColor: `${currentPlatform.accentColor}25`,
                      borderColor: currentPlatform.accentColor,
                    }}
                  >
                    {platformPhase === 1 ? '🏰' : platformPhase === 2 ? '🌋' : platformPhase === 3 ? '❄️' : '✨'}
                  </div>
                  <div>
                    <div
                      className="text-[10px] uppercase tracking-wider font-bold flex items-center gap-1.5"
                      style={{ color: currentPlatform.accentColor }}
                    >
                      <span>
                        Phase {platformPhase}: {language === 'TL' ? currentPlatform.name : currentPlatform.nameEn}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-slate-100 flex items-center gap-2 flex-wrap">
                      <span
                        className="text-xs px-1.5 py-0.5 rounded font-medium border border-slate-700 bg-slate-900/60 flex items-center gap-1"
                        style={{ color: currentSeason.color }}
                        title={language === 'TL' ? currentSeason.description : currentSeason.descriptionEn}
                      >
                        <span>{currentSeason.icon}</span>
                        <span>{language === 'TL' ? currentSeason.name : currentSeason.nameEn}</span>
                      </span>

                      <div
                        className="px-1.5 py-0.5 rounded bg-slate-900/50 border border-slate-700 text-slate-300 text-xs font-mono"
                        title={language === 'TL' ? 'Kasalukuyang Panahon' : 'Current Weather'}
                      >
                        {weather === 'CLEAR' && '☀️'}
                        {weather === 'RAIN' && '🌧️'}
                        {weather === 'SNOW' && '❄️'}
                        {weather === 'HEATWAVE' && '🌡️'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div
              className={`pointer-events-auto glass-panel px-3 py-2 rounded-2xl flex items-center gap-1.5 text-xs font-bold ${timeOfDayConfig.color}`}
              title={`Oras sa Mundo: ${timeOfDayConfig.label}`}
            >
              {timeOfDayConfig.icon}
              <span className="tracking-wide uppercase text-[11px]">{timeOfDayConfig.label}</span>
            </div>
          </div>
        </div>
      </div>

      {/* HIWALAY NA REALM LOG COMPONENT */}
      <RealmLog
        constructionReady={constructionReady}
        timeOfDayLabel={timeOfDayConfig.label}
        onOpenCitadel={onOpenCitadel}
        onOpenQuickTrade={onOpenQuickTrade}
      />

      {/* Bottom Controls Bar */}
      <div className="relative w-full pointer-events-none">
        <button
          onClick={() => setIsBottomBarVisible((v) => !v)}
          className="pointer-events-auto absolute -top-7 left-1/2 z-30 -translate-x-1/2 rounded-t-xl border border-slate-700 bg-slate-900/90 px-3 py-1 text-slate-400 shadow-lg transition-colors hover:bg-slate-800 hover:text-slate-200"
          aria-label={isBottomBarVisible ? 'Hide bottom controls' : 'Show bottom controls'}
        >
          {isBottomBarVisible ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>

        <div
          className={`flex flex-col md:flex-row items-end md:items-center justify-between gap-3 w-full transition-transform duration-300 ${
            isBottomBarVisible ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0 pointer-events-none'
          }`}
        >
          {/* Minions count & Auto mode */}
          <div className="pointer-events-auto glass-panel p-2 md:p-2.5 rounded-3xl flex flex-wrap items-center gap-2 md:gap-3 shadow-xl">
            <button
              onClick={() => {
                soundFx.playClick();
                onOpenCitadel('MINIONS');
              }}
              className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-slate-900/90 border border-red-500/30 hover:border-red-400 hover:scale-102 transition-all cursor-pointer group shadow-sm"
              title={
                language === 'TL'
                  ? 'Pindutin para mag-utos o magdagdag ng mga Alagad na Demonyo at Halimaw'
                  : 'Click to command or add Demon Servants and Monsters'
              }
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
                title={
                  language === 'TL'
                    ? 'Kusang magtatrabaho ang mga katulong kapag bukas ito'
                    : 'Servants will automatically work when this is on'
                }
              >
                <Zap className="w-3.5 h-3.5" />
                <span>
                  {language === 'TL' ? 'Kusa' : 'Auto'}:{' '}
                  {autoSettings.autoDispatch
                    ? language === 'TL'
                      ? 'BUKAS'
                      : 'ON'
                    : language === 'TL'
                    ? 'PATAY'
                    : 'OFF'}
                </span>
              </button>
            </div>
          </div>

          {/* Action Drawers and Buttons */}
          <div className="pointer-events-auto flex items-center flex-wrap gap-2">
            {/* Speed Controls */}
            <div className="glass-panel px-2 py-1.5 rounded-2xl flex items-center gap-1 border-emerald-500/30 shadow-md">
              <button
                onClick={() => {
                  soundFx.playClick();
                  setGameSpeed(0);
                }}
                className={`p-1.5 rounded-xl transition-all cursor-pointer ${
                  gameSpeed === 0
                    ? 'bg-rose-500/30 text-rose-300 scale-110 border border-rose-500/50'
                    : 'text-slate-400 hover:text-rose-300 hover:bg-slate-800'
                }`}
                title="Pause"
              >
                <Pause className="w-4 h-4 fill-current" />
              </button>
              <button
                onClick={() => {
                  soundFx.playClick();
                  setGameSpeed(1);
                }}
                className={`p-1.5 rounded-xl transition-all cursor-pointer ${
                  gameSpeed === 1
                    ? 'bg-emerald-500/30 text-emerald-300 scale-110 border border-emerald-500/50'
                    : 'text-slate-400 hover:text-emerald-300 hover:bg-slate-800'
                }`}
                title="Play (Normal Speed)"
              >
                <Play className="w-4 h-4 fill-current" />
              </button>
              <button
                onClick={() => {
                  soundFx.playClick();
                  setGameSpeed(2);
                }}
                className={`p-1.5 rounded-xl transition-all cursor-pointer ${
                  gameSpeed === 2
                    ? 'bg-amber-500/30 text-amber-300 scale-110 border border-amber-500/50'
                    : 'text-slate-400 hover:text-amber-300 hover:bg-slate-800'
                }`}
                title="Fast Forward (2x Speed)"
              >
                <FastForward className="w-4 h-4 fill-current" />
              </button>
            </div>

            {/* COMMAND CENTER BUTTON */}
            <button
              onClick={() => {
                soundFx.playClick();
                onOpenCitadel();
              }}
              className="glass-panel px-4 py-2 rounded-2xl flex items-center gap-2.5 bg-gradient-to-r from-red-950/80 via-purple-950/70 to-slate-900/90 border border-red-500/50 hover:border-amber-400 hover:scale-105 transition-all active:scale-95 cursor-pointer shadow-lg shadow-red-950/50 group"
              title={
                language === 'TL'
                  ? 'Centro ng Pangasiwaan - Alagad, Tindahan, Sandata, Agham, at Kastilyo'
                  : 'Command Center - Minions, Market, Forge, Tech Research, & Castle Fortifications'
              }
            >
              <div className="w-6 h-6 rounded-lg bg-red-600/30 flex items-center justify-center text-sm group-hover:scale-110 transition-transform">
                🏰
              </div>
              <div className="flex flex-col text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-red-100 tracking-wide">
                    {language === 'TL' ? 'Centro ng Pangasiwaan' : 'Command Center'}
                  </span>
                  <span className="text-[9px] font-mono font-bold text-amber-300 bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-500/30">
                    HP {defense.castleHp}
                  </span>
                </div>
                <span className="text-[9px] text-slate-400 font-medium">
                  {language === 'TL'
                    ? 'Alagad • Tindahan • Gamit • Agham • Depensa'
                    : 'Minions • Shop • Gears • Tech • Castle'}
                </span>
              </div>
            </button>

            {/* Gabay / Codex */}
            <button
              onClick={() => {
                soundFx.playClick();
                onOpenCodex();
              }}
              className="glass-panel px-3.5 py-2 rounded-2xl flex items-center gap-2 hover:border-purple-400 hover:scale-105 text-purple-200 transition-all active:scale-95 cursor-pointer shadow-md"
              title={language === 'TL' ? 'Paano laruin ang laro' : 'How to play'}
            >
              <BookOpen className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-bold">{language === 'TL' ? 'Gabay' : 'Guide'}</span>
            </button>

            {/* Bestiary */}
            <button
              onClick={() => {
                soundFx.playClick();
                onOpenBestiary();
              }}
              className="glass-panel px-3.5 py-2 rounded-2xl flex items-center gap-2 hover:border-red-400 hover:scale-105 bg-red-950/30 text-red-200 transition-all active:scale-95 cursor-pointer shadow-md border-red-500/30"
              title={
                language === 'TL'
                  ? 'Talaan ng mga Alagad at Kalabang Tao/Mecha (Bestiary)'
                  : 'Compendium of Servants and Enemies (Bestiary)'
              }
            >
              <span className="text-sm">📖</span>
              <span className="text-xs font-bold text-red-300">
                {language === 'TL' ? 'Talaan' : 'Codex'}
              </span>
            </button>

            {/* Regression */}
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
              title={
                language === 'TL'
                  ? 'Regression - Muling Pagkabuhay at Tala ng Pag-usad'
                  : 'Regression - Timeline Rebirth & Progression Records'
              }
            >
              <RotateCcw className="w-4 h-4 text-purple-300" />
              <span className="text-xs font-bold">Regression</span>
              {regressionCount > 0 && (
                <span className="text-[10px] font-mono font-bold text-amber-300 bg-slate-900/90 px-1.5 py-0.5 rounded border border-amber-500/30">
                  +{regressionCount}
                </span>
              )}
            </button>

            {/* Audio Toggle */}
            <button
              onClick={handleToggleAudio}
              className={`glass-panel p-2.5 rounded-2xl transition-all active:scale-95 cursor-pointer shadow-md ${
                isAudioMuted
                  ? 'border-rose-500/50 text-rose-400 hover:bg-rose-950/40'
                  : 'border-sky-500/30 text-sky-300 hover:bg-slate-850'
              }`}
              title={
                isAudioMuted
                  ? language === 'TL'
                    ? 'Buksan ang Tunog'
                    : 'Unmute Audio'
                  : language === 'TL'
                  ? 'I-mute ang Tunog'
                  : 'Mute Audio'
              }
            >
              {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              onClick={onOpenSkillTree}
              className="glass-panel rounded-2xl px-3 py-2.5 text-xs font-bold text-purple-200 hover:border-purple-400 cursor-pointer"
            >
              Skills{skillPoints > 0 ? ` (${skillPoints})` : ''}
            </button>

            <button
              onClick={onOpenFAQ}
              className="glass-panel rounded-2xl px-3 py-2.5 text-xs font-bold text-amber-200 hover:border-amber-400 cursor-pointer"
              title="Gameplay FAQ"
            >
              FAQ
            </button>

            {/* Settings */}
            <button
              onClick={() => {
                soundFx.playClick();
                onOpenSettings();
              }}
              className="glass-panel p-2.5 rounded-2xl hover:border-slate-500 hover:scale-105 text-slate-300 transition-all active:scale-95 cursor-pointer shadow-md"
              title={language === 'TL' ? 'Mga Setting at Pag-save' : 'Settings & Save'}
            >
              <Sliders className="w-4 h-4" />
            </button>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="glass-panel p-2.5 rounded-2xl hover:border-slate-500 hover:scale-105 text-slate-300 transition-all active:scale-95 cursor-pointer shadow-md"
              title={
                isFullscreen
                  ? language === 'TL'
                    ? 'Isara ang Buong Screen'
                    : 'Exit Fullscreen'
                  : language === 'TL'
                  ? 'Buong Screen'
                  : 'Enter Fullscreen'
              }
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};