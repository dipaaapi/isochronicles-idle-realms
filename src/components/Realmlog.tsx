import React, { useState } from 'react';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from '../game/audio/soundFx';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  FastForward,
  Swords,
  Check,
  X,
  Gem,
  Trees,
  Hammer,
  Sparkles,
  Fish,
  Droplets,
} from 'lucide-react';
import { AutoEnhancePrompt } from '../ui/AutoEnhancePrompt';
import { CitadelTab } from '../ui/CitadelCommandModal';

interface RealmLogProps {
  constructionReady: boolean;
  timeOfDayLabel: string;
  onOpenCitadel: (tab?: CitadelTab) => void;
  onOpenQuickTrade: (
    resourceKey: 'aetherShards' | 'wood' | 'stone' | 'arcaneEssence' | 'fish' | 'water'
  ) => void;
}

export const RealmLog: React.FC<RealmLogProps> = ({
  constructionReady,
  timeOfDayLabel,
  onOpenCitadel,
  onOpenQuickTrade,
}) => {
  const {
    resources,
    workerCount,
    defense,
    invasion,
    day,
    year,
    dayProgress,
    language,
    incrementDay,
    startInvasion,
  } = useGameStore();

  const [isRealmLogOpen, setIsRealmLogOpen] = useState(true);
  const [realmLogTab, setRealmLogTab] = useState<'status' | 'resources'>('status');

  // Inline confirmation state: null | 'SKIP_DAY' | 'SUMMON_WAVE'
  const [confirmAction, setConfirmAction] = useState<'SKIP_DAY' | 'SUMMON_WAVE' | null>(null);

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

  const handleConfirmAction = () => {
    soundFx.playClick();
    if (confirmAction === 'SKIP_DAY') {
      incrementDay();
    } else if (confirmAction === 'SUMMON_WAVE') {
      startInvasion();
    }
    setConfirmAction(null);
  };

  const handleCancelAction = () => {
    soundFx.playClick();
    setConfirmAction(null);
  };

  return (
    <aside
      className={`pointer-events-auto absolute bottom-[8rem] right-3 w-[min(20rem,calc(100vw-1.5rem))]
        rounded-2xl border border-sky-400/20 bg-slate-950/90 shadow-2xl
        shadow-slate-950/60 backdrop-blur-xl md:right-5 select-none z-20
        ${isRealmLogOpen ? 'p-3' : 'p-2'}`}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => {
          soundFx.playClick();
          setIsRealmLogOpen((open) => !open);
        }}
        className={`flex w-full items-center justify-between text-left cursor-pointer ${
          isRealmLogOpen ? 'border-b border-slate-800/80 pb-2' : 'rounded-xl px-1 py-1'
        }`}
        aria-expanded={isRealmLogOpen}
      >
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-sky-400/15 p-1.5 text-sky-300">
            <Activity className="h-4 w-4" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-sky-300">
            {language === 'TL' ? 'Talaan ng Kuta' : 'Realm Log'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {invasion.isActive && (
            <span className="h-2 w-2 rounded-full bg-rose-400 animate-pulse" />
          )}
          {isRealmLogOpen ? (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronUp className="h-4 w-4 text-slate-500" />
          )}
        </div>
      </button>

      {isRealmLogOpen && (
        <div className="pt-3">
          {/* Tabs */}
          <div className="mb-3 flex rounded-xl bg-slate-900/80 p-1">
            <button
              type="button"
              onClick={() => {
                soundFx.playClick();
                setRealmLogTab('status');
              }}
              className={`flex-1 rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
                realmLogTab === 'status'
                  ? 'bg-sky-500/15 text-sky-300'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {language === 'TL' ? 'Kalagayan' : 'Status'}
            </button>

            <button
              type="button"
              onClick={() => {
                soundFx.playClick();
                setRealmLogTab('resources');
              }}
              className={`flex-1 rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
                realmLogTab === 'resources'
                  ? 'bg-sky-500/15 text-sky-300'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {language === 'TL' ? 'Yaman' : 'Resources'}
            </button>
          </div>

          {/* STATUS TAB */}
          {realmLogTab === 'status' && (
            <div className="space-y-2">
              {/* Day & Wave Controls */}
              <div className="grid grid-cols-2 gap-2">
                {/* Day Trigger */}
                <button
                  type="button"
                  onClick={() => {
                    soundFx.playClick();
                    setConfirmAction('SKIP_DAY');
                  }}
                  className={`rounded-xl border p-2.5 text-left transition cursor-pointer ${
                    confirmAction === 'SKIP_DAY'
                      ? 'border-sky-400 bg-sky-950/70 shadow-md ring-1 ring-sky-400'
                      : 'border-slate-800 bg-slate-900/50 hover:border-slate-600'
                  }`}
                  title={
                    language === 'TL'
                      ? 'Pindutin para lumipat sa susunod na araw'
                      : 'Click to skip to next day'
                  }
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">
                      {language === 'TL' ? 'Oras' : 'Time'}
                    </span>
                    <span className="text-[10px] text-sky-300">{timeOfDayLabel}</span>
                  </div>

                  <div className="text-xs font-bold text-slate-200">
                    Y{year || 1} • {language === 'TL' ? 'Araw' : 'Day'} {day || 1}/365
                  </div>

                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-sky-400 transition-all"
                      style={{ width: `${dayProgress * 100}%` }}
                    />
                  </div>
                </button>

                {/* Wave Trigger */}
                <button
                  type="button"
                  disabled={invasion.isActive}
                  onClick={() => {
                    if (invasion.isActive) return;

                    if (!constructionReady) {
                      soundFx.playClick();
                      onOpenCitadel('MINIONS');
                      return;
                    }

                    soundFx.playClick();
                    setConfirmAction('SUMMON_WAVE');
                  }}
                  className={`rounded-xl border p-2.5 text-left transition ${
                    confirmAction === 'SUMMON_WAVE'
                      ? 'border-red-400 bg-red-950/70 shadow-md ring-1 ring-red-400'
                      : invasion.isActive
                      ? 'border-red-900/50 bg-red-950/30'
                      : 'border-red-700/40 bg-red-950/30 hover:border-red-500 cursor-pointer'
                  }`}
                  title={
                    !constructionReady
                      ? language === 'TL'
                        ? 'Itayo muna ang kastilyo at resource buildings'
                        : 'Build the castle and resource buildings first'
                      : !invasion.isActive
                      ? language === 'TL'
                        ? 'Pindutin para simulan ang susunod na wave'
                        : 'Click to summon the next wave'
                      : ''
                  }
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">
                      {language === 'TL' ? 'Pagsalakay' : 'Invasion'}
                    </span>
                    <span
                      className={`text-[10px] font-bold ${
                        invasion.isActive ? 'text-rose-300' : 'text-emerald-300'
                      }`}
                    >
                      {invasion.isActive
                        ? language === 'TL'
                          ? 'AKTIBO'
                          : 'ACTIVE'
                        : language === 'TL'
                        ? 'HANDA'
                        : 'READY'}
                    </span>
                  </div>

                  <div className="text-xs font-bold text-slate-200">
                    Wave {invasion.waveNumber}/100
                  </div>

                  <div className="mt-1 text-[10px] text-slate-500">
                    {invasion.isActive
                      ? `${invasion.enemiesRemaining}/${invasion.totalEnemiesInWave} ${
                          language === 'TL' ? 'kalaban' : 'enemies'
                        }`
                      : !constructionReady
                      ? language === 'TL'
                        ? 'Construction muna'
                        : 'Construction first'
                      : `${Math.ceil(invasion.countdown)}s`}
                  </div>

                  {!invasion.isActive && constructionReady && (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-red-500 transition-all"
                        style={{
                          width: `${
                            (Math.max(0, invasion.maxCountdown - invasion.countdown) /
                              (invasion.maxCountdown || 1)) *
                            100
                          }%`,
                        }}
                      />
                    </div>
                  )}
                </button>
              </div>

              {/* INLINE CONFIRMATION PROMPT (Pumapalit sa window.confirm popup) */}
              {confirmAction && (
                <div className="w-full p-2.5 rounded-xl border border-amber-500/50 bg-slate-900/95 shadow-xl flex items-center justify-between gap-2 animate-fade-in">
                  <div className="flex items-center gap-2 min-w-0">
                    {confirmAction === 'SKIP_DAY' ? (
                      <FastForward className="w-4 h-4 text-sky-400 shrink-0" />
                    ) : (
                      <Swords className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <p className="text-[11px] font-medium text-slate-200 leading-tight">
                      {confirmAction === 'SKIP_DAY'
                        ? language === 'TL'
                          ? 'Lumaktaw sa susunod na araw?'
                          : 'Skip to next day?'
                        : language === 'TL'
                        ? 'Simulan na agad ang wave?'
                        : 'Summon next wave early?'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleConfirmAction}
                      className="p-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer"
                      title={language === 'TL' ? 'Oo' : 'Confirm'}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelAction}
                      className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition cursor-pointer"
                      title={language === 'TL' ? 'Hindi' : 'Cancel'}
                    >
                      <X className="w-3.5 h-3.5 stroke-[3]" />
                    </button>
                  </div>
                </div>
              )}

              {/* Castle + Shield HP */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-2.5">
                  <div className="mb-1 flex justify-between text-[10px]">
                    <span className="text-slate-500">{language === 'TL' ? 'Kastilyo' : 'Castle'}</span>
                    <span className="text-emerald-300">{castleHpPct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-emerald-400 transition-all"
                      style={{ width: `${castleHpPct}%` }}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-2.5">
                  <div className="mb-1 flex justify-between text-[10px]">
                    <span className="text-slate-500">{language === 'TL' ? 'Kalasag' : 'Shield'}</span>
                    <span className="text-sky-300">{shieldHpPct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-sky-400 transition-all"
                      style={{ width: `${shieldHpPct}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Minions count */}
              <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">
                  {language === 'TL' ? 'Mga Alagad' : 'Minions'}
                </span>
                <span className="font-mono text-xs font-bold text-red-300">{workerCount}</span>
              </div>

              <AutoEnhancePrompt onOpenCitadel={onOpenCitadel} embedded />
            </div>
          )}

          {/* RESOURCES TAB */}
          {realmLogTab === 'resources' && (
            <div className="grid grid-cols-2 gap-2">
              {resourceGauges.map((resource) => (
                <button
                  key={resource.key}
                  onClick={() => {
                    soundFx.playClick();
                    onOpenQuickTrade(resource.key);
                  }}
                  className="rounded-xl border border-slate-800 bg-slate-900/50 p-2.5 text-left transition hover:border-slate-600 cursor-pointer"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className={`flex items-center gap-1 text-[10px] ${resource.text}`}>
                      {resource.icon}
                      {resource.label}
                    </span>
                    <span className="font-mono text-xs text-slate-300">
                      {resource.value.toLocaleString()}
                    </span>
                  </div>

                  <div className="h-1 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full rounded-full ${resource.color} opacity-80 transition-all`}
                      style={{
                        width: `${Math.min(100, Math.max(8, resource.value / 10))}%`,
                      }}
                    />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  );
};