import React from 'react';
import { useGameStore } from '../state/useGameStore';
import { Swords, ShieldAlert, Zap, AlertTriangle } from 'lucide-react';

export const InvasionBanner: React.FC = () => {
  const { invasion, defense } = useGameStore();

  const isImminent = !invasion.isActive && invasion.countdown <= 30;
  const isActive = invasion.isActive;

  if (!isImminent && !isActive) return null;

  const hpPct = Math.round((defense.castleHp / defense.castleMaxHp) * 100);
  const shieldPct = Math.round((defense.shieldHp / defense.shieldMaxHp) * 100);

  if (isActive) {
    return (
      <div className="pointer-events-auto flex w-full flex-col items-start justify-between gap-3 rounded-2xl border border-rose-500/70 bg-rose-950/95 px-3 py-2.5 shadow-lg shadow-rose-950/60 backdrop-blur-md animate-pulse">
        <div className="flex items-start gap-2">
          <div className="rounded-xl bg-rose-500/20 p-1.5 text-lg text-rose-300">
            ⚔️🤖
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1 text-[11px] font-bold tracking-wide text-rose-200">
              <span>{invasion.waveNumber >= 0 ? `Wave ${invasion.waveNumber}` : 'Invasion'}</span>
              <span className="rounded-lg bg-rose-500/40 px-2 py-0.5 text-[10px] text-rose-200 font-bold">
                {invasion.enemiesRemaining} / {invasion.totalEnemiesInWave} Kalaban Natitira
              </span>
            </div>
            <div className="text-[10px] font-medium text-amber-300">
              ⚡ Demon Lord, pindutin ang screen para tamaan sila ng Kidlat ng Kadiliman!
            </div>
          </div>
        </div>

        {/* Castle Integrity Mini-Gauges */}
        <div className="flex w-full items-center gap-3">
          {/* Hull */}
          <div className="flex-1">
            <div className="flex justify-between text-[11px] font-bold text-slate-200 mb-0.5">
              <span>Buhay ng Kastilyo</span>
              <span className="font-bold text-emerald-400">{hpPct}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  hpPct > 50 ? 'bg-emerald-500' : hpPct > 25 ? 'bg-amber-500' : 'bg-rose-500'
                }`}
                style={{ width: `${hpPct}%` }}
              />
            </div>
          </div>

          {/* Shield */}
          <div className="w-24">
            <div className="flex justify-between text-[11px] font-bold text-slate-200 mb-0.5">
              <span>Kalasag</span>
              <span className="font-bold text-sky-400">{shieldPct}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-sky-400 rounded-full transition-all duration-300"
                style={{ width: `${shieldPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Imminent warning
  return (
    <div className="pointer-events-auto flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-amber-950/90 border border-amber-500/60 shadow-lg backdrop-blur-md">
      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
      <span className="text-xs font-bold text-amber-200">
        ⚠️ Babala, Demon Lord: May mga Kawal ng Tao at Mecha na susugod sa loob ng {Math.ceil(invasion.countdown)} segundo! Ihanda ang iyong mga Halimaw! 🐺👹
      </span>
    </div>
  );
};
