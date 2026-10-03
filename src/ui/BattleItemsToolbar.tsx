import React, { useEffect, useState } from 'react';
import { useGameStore } from '../state/useGameStore';
import { ECONOMY_CONFIG, RESOURCE_PRICES } from '../state/economy';
import type { BattleItemId, Resources } from '../types/state';
import { soundFx } from '../game/audio/soundFx';

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
  bgGradient: string;
  descEn: string;
  descTl: string;
  buffEffectEn: string;
  buffEffectTl: string;
}

const ITEMS: ItemMeta[] = [
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
    bgGradient: 'from-orange-600/80 to-amber-500/80',
    descEn: 'Empowers all allied minions with fiery battle fury.',
    descTl: 'Pinupuno ng nagliliyab na galit sa pakikipaglaban ang lahat ng minion.',
    buffEffectEn: '+200% Attack Damage for all active minions (30s).',
    buffEffectTl: '+200% Lakas ng Pag-atake para sa lahat ng minion (30s).',
  },
  {
    id: 'FORCE_FIELD',
    icon: '🛡️',
    nameEn: 'Aegis Force Field',
    nameTl: 'Kalasag ng Kuta',
    keyBinding: 'w',
    maxDuration: 15,
    timerKey: 'forceFieldTimer',
    color: '#0284c7',
    glowColor: 'rgba(2, 132, 199, 0.7)',
    bgGradient: 'from-sky-600/80 to-cyan-500/80',
    descEn: 'Erects an impenetrable energy barrier over the entire realm.',
    descTl: 'Nagtatayo ng hindi matitibag na harang sa buong kaharian.',
    buffEffectEn: 'Absolute invulnerability for Castle & all Establishments (15s).',
    buffEffectTl: 'Ganap na proteksyon sa Kastilyo at lahat ng gusali laban sa pinsala (15s).',
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
    bgGradient: 'from-pink-600/80 to-emerald-500/80',
    descEn: 'Pours rejuvenative life essence into the realm foundations.',
    descTl: 'Nagbubuhos ng nagpapagaling na enerhiya sa lahat ng gusali.',
    buffEffectEn: 'Rapid HP regeneration for Castle & all Establishments (20s).',
    buffEffectTl: 'Mabilisang nagpapagaling ng HP ng Kastilyo at lahat ng gusali (20s).',
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
    bgGradient: 'from-amber-600/80 to-yellow-400/80',
    descEn: 'Supercharges the Citadel barrier to maximum capacity.',
    descTl: 'Pinupuno ang kalasag ng Kuta hanggang sa pinakamataas na antas.',
    buffEffectEn: 'Instantly restores Citadel shield to 100% & fully repairs structures.',
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
    bgGradient: 'from-purple-600/80 to-indigo-500/80',
    descEn: 'Warps the flow of time to instantly refresh tactical abilities.',
    descTl: 'Binabaluktot ang takbo ng oras upang muling magamit agad ang mga kakayahan.',
    buffEffectEn: 'Instantly resets all skill cooldowns for Citadel & Establishments.',
    buffEffectTl: 'Agad na nirereset ang lahat ng skill cooldown ng Kuta at gusali.',
  },
];

export const BattleItemsToolbar: React.FC = () => {
  const { language, resources, defense, useBattleItem } = useGameStore();
  const [hoveredItem, setHoveredItem] = useState<BattleItemId | null>(null);
  const tl = language === 'TL';

  const handleUseItem = (id: BattleItemId) => {
    const cost = (ECONOMY_CONFIG.battleItems[id]?.cost ?? {}) as Partial<Record<string, number>>;
    const canAfford = Object.entries(cost).every(([k, v]) => ((resources[k as keyof typeof resources] ?? 0) as number) >= (v as number));
    if (canAfford) {
      soundFx.playClick();
      useBattleItem(id);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      const item = ITEMS.find((i) => i.keyBinding === key);
      if (item) {
        handleUseItem(item.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [resources, useBattleItem]);

  return (
    <div className="absolute bottom-3 right-3 z-30 flex items-end gap-2.5 pointer-events-auto select-none">
      {ITEMS.map((item) => {
        const cost = (ECONOMY_CONFIG.battleItems[item.id]?.cost ?? {}) as Partial<Record<string, number>>;
        const canAfford = Object.entries(cost).every(([k, v]) => ((resources[k as keyof typeof resources] ?? 0) as number) >= (v as number));
        
        // Active timer progress
        const timerVal = item.timerKey ? (defense[item.timerKey] ?? 0) : 0;
        const isActive = timerVal > 0;
        const progressPct = item.maxDuration > 0 ? Math.min(100, Math.max(0, (timerVal / item.maxDuration) * 100)) : 0;

        const isHovered = hoveredItem === item.id;

        return (
          <div
            key={item.id}
            className="relative"
            onMouseEnter={() => setHoveredItem(item.id)}
            onMouseLeave={() => setHoveredItem(null)}
          >
            {/* Rich Hover Buff Information Card */}
            {isHovered && (
              <div className="absolute bottom-[calc(100%+10px)] right-0 z-50 w-72 rounded-2xl border border-slate-700/90 bg-slate-950/95 p-3.5 shadow-2xl shadow-black/80 backdrop-blur-md animate-fade-in pointer-events-none">
                {/* Header with icon, name, and hotkey */}
                <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl drop-shadow">{item.icon}</span>
                    <div>
                      <h4 className="font-fantasy text-xs font-bold text-white tracking-wide">
                        {tl ? item.nameTl : item.nameEn}
                      </h4>
                      <p className="text-[10px] text-slate-400">
                        {tl ? 'Gamit sa Labanan' : 'Battle Tactical Skill'}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-[10px] font-extrabold uppercase text-amber-300 shadow">
                    {item.keyBinding.toUpperCase()}
                  </span>
                </div>

                {/* Status / Active Remaining bar */}
                <div className="my-2 rounded-lg bg-slate-900/80 p-2 border border-slate-800">
                  <div className="flex items-center justify-between text-[10px] font-semibold">
                    <span className="text-slate-400">{tl ? 'Katayuan:' : 'Status:'}</span>
                    {isActive ? (
                      <span className="font-mono text-emerald-400 animate-pulse">
                        {tl ? 'AKTIBO' : 'ACTIVE'} ({timerVal.toFixed(1)}s)
                      </span>
                    ) : (
                      <span className={canAfford ? 'text-sky-300 font-semibold' : 'text-rose-400 font-semibold'}>
                        {canAfford ? (tl ? 'Handang Gamitin' : 'Ready to Cast') : (tl ? 'Kulang sa Yaman' : 'Insufficient Cost')}
                      </span>
                    )}
                  </div>
                  {isActive && item.maxDuration > 0 && (
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full transition-all duration-100 ease-linear"
                        style={{
                          width: `${progressPct}%`,
                          backgroundColor: item.color,
                          boxShadow: `0 0 8px ${item.glowColor}`,
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Buff Details */}
                <div className="space-y-1.5 text-[11px] leading-relaxed text-slate-200">
                  <p className="text-slate-300 font-medium">{tl ? item.descTl : item.descEn}</p>
                  <div className="rounded-lg bg-violet-950/40 border border-violet-500/30 p-2 text-[10px] text-violet-200">
                    <span className="font-bold text-amber-300">✦ {tl ? 'Epekto:' : 'Effect:'} </span>
                    {tl ? item.buffEffectTl : item.buffEffectEn}
                  </div>
                </div>

                {/* Cost Section */}
                <div className="mt-2.5 flex items-center justify-between border-t border-slate-800/80 pt-2 text-[10px]">
                  <span className="text-slate-400 font-medium">{tl ? 'Halaga:' : 'Cost:'}</span>
                  <div className="flex items-center gap-1.5">
                    {Object.entries(cost).map(([resKey, amount]) => {
                      const resMeta = RESOURCE_PRICES[resKey as keyof typeof RESOURCE_PRICES];
                      const userHave = (resources[resKey as keyof typeof resources] ?? 0) as number;
                      const hasEnough = userHave >= (amount ?? 0);
                      return (
                        <span
                          key={resKey}
                          className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                            hasEnough ? 'bg-slate-800/80 text-amber-300 border border-slate-700' : 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
                          }`}
                        >
                          <span>{resMeta?.icon ?? '💎'}</span>
                          <span>{userHave}/{amount}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Skill Button */}
            <button
              type="button"
              onClick={() => handleUseItem(item.id)}
              disabled={!canAfford && !isActive}
              className={`relative flex h-13 w-13 items-center justify-center overflow-hidden rounded-2xl border-2 transition-all duration-150 ${
                isActive
                  ? 'border-emerald-400 bg-slate-950 shadow-lg shadow-emerald-500/30 scale-105'
                  : canAfford
                  ? 'border-slate-600 bg-slate-900/90 shadow-lg shadow-black/50 hover:-translate-y-1 hover:border-violet-400 hover:bg-slate-800'
                  : 'border-slate-800 bg-slate-950/70 opacity-45 cursor-not-allowed'
              }`}
              style={{
                boxShadow: isActive ? `0 0 16px ${item.glowColor}` : undefined,
              }}
              aria-label={tl ? item.nameTl : item.nameEn}
            >
              {/* Draining Background duration overlay: height shrinks downwards as timer counts down */}
              {isActive && (
                <div
                  className="absolute bottom-0 left-0 right-0 pointer-events-none transition-all duration-100 ease-linear"
                  style={{
                    height: `${progressPct}%`,
                    backgroundColor: item.color,
                    opacity: 0.38,
                  }}
                />
              )}

              {/* Icon */}
              <span className="relative z-10 text-2xl drop-shadow-md select-none">
                {item.icon}
              </span>

              {/* Hotkey Badge */}
              <span className="absolute -top-1.5 -right-1.5 z-20 flex h-5 w-5 items-center justify-center rounded-lg border border-slate-700 bg-slate-950 text-[10px] font-black uppercase text-amber-300 shadow-md font-mono">
                {item.keyBinding}
              </span>

              {/* Active Timer Countdown Tag */}
              {isActive && (
                <span className="absolute bottom-0.5 left-0 right-0 z-20 text-center font-mono text-[9px] font-black leading-none text-white drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
                  {timerVal >= 10 ? Math.ceil(timerVal) : timerVal.toFixed(1)}s
                </span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
};
