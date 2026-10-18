import React from 'react';
import { useGameStore } from '../state/useGameStore';
import {
  MAX_TIER,
  MERGE_COUNT,
  RUNES,
  RUNE_TARGETS,
  RUNE_TARGET_IDS,
  RUNE_TEXT,
  runeValue,
  slottedIds,
  tierColor,
  tierName,
  type Localized,
  type Rune,
  type RuneKind,
} from '../state/runes';
import { TEAM_STATS, formatStat, type TeamStat } from '../state/skillTree';

/** One rune chip: icon, tier numeral in its tier colour, and its bonus. */
const RuneChip: React.FC<{ rune: Rune; t: (s: Localized) => string; action?: React.ReactNode }> = ({ rune, t, action }) => {
  const def = RUNES[rune.kind];
  const color = tierColor(rune.tier);
  const stat = def.stat as TeamStat;
  return (
    <div
      className="flex items-center gap-2 rounded-lg border bg-slate-900/80 px-2 py-1.5"
      style={{ borderColor: `${color}99`, boxShadow: `0 0 10px -4px ${color}` }}
      title={t(def.desc)}
    >
      <span className="text-lg leading-none" aria-hidden="true">{def.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-bold text-white">
          {t(def.name)} <span style={{ color }}>{tierName(rune.tier)}</span>
        </div>
        <div className="font-mono text-[10px] text-emerald-300">
          {TEAM_STATS[stat] ? formatStat(stat, runeValue(rune)) : ''} <span className="text-slate-400">{t(def.desc)}</span>
        </div>
      </div>
      {action}
    </div>
  );
};

/** Rune Vault: slots per target, unslotted runes and merges. Lives as a Citadel Command tab. */
export const RunePanel: React.FC = () => {
  const { runes, runeSlots, slotRune, unslotRune, mergeRunes, language } = useGameStore();
  const t = (s: Localized) => (language === 'TL' ? s.tl : s.en);
  const byId = new Map(runes.map((r) => [r.id, r]));
  const slotted = slottedIds(runeSlots);
  const loose = runes.filter((r) => !slotted.has(r.id)).sort((a, b) => b.tier - a.tier || a.kind.localeCompare(b.kind));

  // Groups of mergeable runes (same kind and tier, unslotted)
  const groups = new Map<string, { kind: RuneKind; tier: number; count: number }>();
  for (const r of loose) {
    const key = `${r.kind}:${r.tier}`;
    const g = groups.get(key) ?? { kind: r.kind, tier: r.tier, count: 0 };
    g.count++;
    groups.set(key, g);
  }
  const mergeable = [...groups.values()].filter((g) => g.count >= MERGE_COUNT && g.tier < MAX_TIER);

  return (
    <div className="space-y-4 text-slate-200">
      <header>
        <h2 className="text-xl font-bold text-sky-200">🔷 {t(RUNE_TEXT.title)}</h2>
        <p className="mt-1 text-xs text-slate-400">{t(RUNE_TEXT.howTo).replace('{count}', String(MERGE_COUNT))}</p>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {RUNE_TARGET_IDS.map((target) => {
          const info = RUNE_TARGETS[target];
          const row = runeSlots[target];
          const free = row.filter((id) => !id).length;
          return (
            <section key={target} className="rounded-xl border border-slate-800 bg-slate-900/40 p-2.5">
              <h3 className="mb-2 flex items-center justify-between text-sm font-bold" style={{ color: info.color }}>
                <span>{info.icon} {t(info.name)}</span>
                <span className="font-mono text-[10px] text-slate-500">{t(RUNE_TEXT.slots)} {row.length - free}/{row.length}</span>
              </h3>
              <div className="space-y-1.5">
                {row.map((id, i) => {
                  const rune = id ? byId.get(id) : undefined;
                  return rune ? (
                    <RuneChip
                      key={i}
                      rune={rune}
                      t={t}
                      action={
                        <button
                          type="button"
                          onClick={() => unslotRune(rune.id)}
                          className="shrink-0 rounded-md bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-300 hover:bg-slate-700"
                        >
                          {t(RUNE_TEXT.unslot)}
                        </button>
                      }
                    />
                  ) : (
                    <div key={i} className="rounded-lg border border-dashed border-slate-700 px-2 py-2.5 text-center text-[10px] text-slate-500">
                      ◇ {t(RUNE_TEXT.empty)}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {mergeable.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {mergeable.map((g) => (
            <button
              key={`${g.kind}:${g.tier}`}
              type="button"
              onClick={() => mergeRunes(g.kind, g.tier)}
              className="rounded-lg border px-2.5 py-1.5 text-[11px] font-bold text-white hover:brightness-125"
              style={{ borderColor: tierColor(g.tier + 1), background: `${tierColor(g.tier + 1)}33` }}
            >
              {RUNES[g.kind].icon} {t(RUNES[g.kind].name)} {tierName(g.tier)} ·{' '}
              {t(RUNE_TEXT.merge).replace('{count}', String(MERGE_COUNT)).replace('{tier}', tierName(g.tier + 1))}
            </button>
          ))}
        </div>
      )}

      <section className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-3">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-indigo-300">{t(RUNE_TEXT.vault)} ({loose.length})</h3>
        {loose.length === 0 ? (
          <p className="text-[11px] text-slate-500">{t(RUNE_TEXT.noRunes)}</p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
            {loose.map((rune) => {
              const target = RUNES[rune.kind].target;
              const full = !runeSlots[target].includes(null);
              return (
                <RuneChip
                  key={rune.id}
                  rune={rune}
                  t={t}
                  action={
                    <button
                      type="button"
                      disabled={full}
                      onClick={() => slotRune(rune.id)}
                      title={`${RUNE_TARGETS[target].icon} ${t(RUNE_TARGETS[target].name)}`}
                      className="shrink-0 rounded-md px-2 py-1 text-[10px] font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                      style={full ? undefined : { background: RUNE_TARGETS[target].color }}
                    >
                      {full ? t(RUNE_TEXT.full) : `${RUNE_TARGETS[target].icon} ${t(RUNE_TEXT.slot)}`}
                    </button>
                  }
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
