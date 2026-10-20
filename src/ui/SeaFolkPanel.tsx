import React from 'react';
import { Mountain, Waves } from 'lucide-react';
import { useGameStore } from '../state/useGameStore';
import { useTranslation } from '../i18n/translations';
import { soundFx } from '../game/audio/soundFx';
import { WILD_FACTIONS, WILD_STATE, wildMood, wildTributeCost, type WildFactionId } from '../state/wildFactions';
import { canAfford } from '../state/resources';
import { resourceIcon } from './resourceIcons';

const MOOD_STYLE = {
  CALM: 'text-sky-300 border-sky-700/50',
  RESTLESS: 'text-amber-300 border-amber-600/50',
  ENRAGED: 'text-rose-300 border-rose-600/60',
  TRUCE: 'text-emerald-300 border-emerald-600/50',
} as const;

const TEXT = {
  SEA: { title: 'seaTitle', meter: 'seaContamination', tribute: 'seaTribute', hint: 'seaHint' },
  BROOD: { title: 'broodTitle', meter: 'broodUnrest', tribute: 'broodTribute', hint: 'broodHint' },
} as const;

/**
 * A wild faction in the HUD (Sea Folk / Sand Brood): its meter with the
 * emerge and boss marks, its mood, and the tribute that calms it and buys a
 * truce (src/data/seaFolk.json, src/data/sandBrood.json).
 */
export const SeaFolkPanel: React.FC<{ isTL: boolean; faction?: WildFactionId }> = ({ isTL, faction = 'SEA' }) => {
  const { t: tr } = useTranslation();
  const data = WILD_FACTIONS[faction];
  const keys = WILD_STATE[faction];
  const level = useGameStore((s) => s[keys.meter]);
  const truce = useGameStore((s) => s[keys.truce]);
  const resources = useGameStore((s) => s.resources);
  const offer = useGameStore((s) => (faction === 'SEA' ? s.offerSeaTribute : s.offerBroodTribute));
  const mood = wildMood(data, level, truce);
  const cost = wildTributeCost(data, level);
  const affordable = canAfford(resources, cost);
  const pct = Math.round(level);
  const C = data.contamination;
  const bar = level >= C.bossAt ? 'bg-rose-500' : level >= C.emergeAt ? 'bg-amber-500' : faction === 'SEA' ? 'bg-sky-500' : 'bg-yellow-600';
  const moodName = isTL ? data.moods[mood].tl : data.moods[mood].en;
  const T = TEXT[faction];
  const Icon = faction === 'SEA' ? Waves : Mountain;

  return (
    <div className={`w-full rounded-2xl border bg-slate-950/60 p-3 ${MOOD_STYLE[mood]}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="flex items-center gap-1 text-[10px] uppercase text-slate-400"><Icon className="w-3 h-3" /> {tr(T.title)}</span>
        <span className="text-[10px] font-bold">{moodName}{truce > 0 ? ` · ${truce}` : ''}</span>
      </div>
      <div title={tr(T.hint)}>
        <div className="flex justify-between text-[10px] text-slate-400">
          <span>{tr(T.meter)}</span>
          <span className="font-mono">{pct}%</span>
        </div>
        <div className="relative h-2 mt-0.5 rounded-full bg-slate-800 overflow-hidden">
          <div className={`h-full ${bar} transition-all`} style={{ width: `${pct}%` }} />
          <div className="absolute top-0 h-full w-px bg-amber-200/70" style={{ left: `${C.emergeAt}%` }} />
          <div className="absolute top-0 h-full w-px bg-rose-200/70" style={{ left: `${C.bossAt}%` }} />
        </div>
      </div>
      <button
        type="button"
        disabled={!affordable}
        onClick={() => { soundFx.playClick(); offer(); }}
        className={`mt-2 w-full rounded-xl border px-2 py-1.5 text-left text-[10px] transition ${
          affordable ? 'border-emerald-600/60 bg-emerald-950/40 text-emerald-200 hover:border-emerald-400 cursor-pointer' : 'border-slate-700 bg-slate-900/60 text-slate-500 cursor-not-allowed'
        }`}
      >
        <div className="font-bold">🤝 {tr(T.tribute)}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 font-mono">
          {Object.entries(cost).map(([k, v]) => (
            <span key={k} className={(resources[k as keyof typeof resources] ?? 0) >= (v ?? 0) ? '' : 'text-rose-400'}>
              {resourceIcon(k)} {v}
            </span>
          ))}
        </div>
      </button>
    </div>
  );
};
