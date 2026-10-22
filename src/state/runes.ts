import config from '../data/runes.json';

/**
 * Runes: dropped by wave bosses, slotted per target (Citadel, Establishments,
 * Generals, Minions), merged three-into-one for the next tier. Their stats feed
 * the same team bonuses as the skill tree (src/state/skillTree.ts).
 * Numbers and text live in src/data/runes.json.
 */

export type Localized = { en: string; tl: string };
export type RuneKind = keyof typeof config.runes;
export type RuneTarget = keyof typeof config.targets;

export interface RuneDef {
  target: RuneTarget;
  icon: string;
  stat: string;
  perTier: number;
  name: Localized;
  desc: Localized;
}

/** One rune in the vault or a slot. */
export interface Rune {
  id: string;
  kind: RuneKind;
  tier: number;
}

/** Slotted rune ids per target (fixed length: slotsPerTarget, null = empty). */
export type RuneSlots = Record<RuneTarget, Array<string | null>>;

export const RUNE_CONFIG = config;
export const RUNE_TEXT = config.text;
export const RUNES = config.runes as unknown as Record<RuneKind, RuneDef>;
export const RUNE_KINDS = Object.keys(RUNES) as RuneKind[];
export const RUNE_TARGETS = config.targets as Record<RuneTarget, { icon: string; color: string; name: Localized }>;
export const RUNE_TARGET_IDS = Object.keys(RUNE_TARGETS) as RuneTarget[];
/** Highest tier a boss drops. */
export const DROP_MAX_TIER = config.tierPower.length;
/** Hard ceiling for merges, display, stat power and imported saves. */
export const MAX_TIER = config.maxTier;
export const SLOTS_PER_TARGET = config.slotsPerTarget;
export const MERGE_COUNT = config.mergeCount;

const ROMAN: Array<[number, string]> = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
const roman = (n: number): string => {
  let out = '';
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
};
/** Mythic tiers (past the last listed colour) cycle through these. */
const MYTHIC_COLORS = ['#f43f5e', '#22d3ee', '#e879f9', '#fb923c'];

export const tierName = (tier: number): string => config.tierNames[tier - 1] ?? (tier > 3999 ? String(tier) : roman(Math.max(1, Math.floor(tier))));
export const tierColor = (tier: number): string =>
  config.tierColors[tier - 1] ?? MYTHIC_COLORS[(Math.max(1, tier) - config.tierColors.length - 1) % MYTHIC_COLORS.length];

/** Power multiplier of a tier: the listed table, then +tierGrowth per tier. */
export const tierPower = (tier: number): number => {
  const t = Math.max(1, Math.min(MAX_TIER, Math.floor(tier)));
  const table = config.tierPower;
  return table[t - 1] ?? table[table.length - 1] + config.tierGrowth * (t - table.length);
};


export const emptyRuneSlots = (): RuneSlots =>
  Object.fromEntries(RUNE_TARGET_IDS.map((t) => [t, Array<string | null>(SLOTS_PER_TARGET).fill(null)])) as RuneSlots;

/** Bonus one rune gives to its stat. */
export const runeValue = (rune: Pick<Rune, 'kind' | 'tier'>): number =>
  (RUNES[rune.kind]?.perTier ?? 0) * tierPower(rune.tier);

/** Summed bonus per stat from every slotted rune. */
export const runeStatTotals = (runes: Rune[] | undefined, slots: RuneSlots | undefined): Record<string, number> => {
  const totals: Record<string, number> = {};
  if (!runes || !slots) return totals;
  const byId = new Map(runes.map((r) => [r.id, r]));
  for (const target of RUNE_TARGET_IDS) {
    for (const id of slots[target] ?? []) {
      const rune = id ? byId.get(id) : undefined;
      if (!rune || RUNES[rune.kind]?.target !== target) continue;
      const stat = RUNES[rune.kind].stat;
      totals[stat] = (totals[stat] ?? 0) + runeValue(rune);
    }
  }
  return totals;
};

/** Tier of the rune a boss carries on this wave. */
export const bossRuneTier = (wave: number, climax: boolean): number =>
  Math.max(1, Math.min(DROP_MAX_TIER, 1 + Math.floor(Math.max(0, wave - 1) / config.wavesPerTier) + (climax ? config.climaxBonus : 0)));

export const rollRuneKind = (rand: () => number = Math.random): RuneKind => RUNE_KINDS[Math.floor(rand() * RUNE_KINDS.length)];

export const newRuneId = (): string => `rune_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/** Ids of runes sitting in any slot. */
export const slottedIds = (slots: RuneSlots): Set<string> =>
  new Set(RUNE_TARGET_IDS.flatMap((t) => (slots[t] ?? []).filter((id): id is string => !!id)));

/** Validates saved runes and slots (unknown kinds dropped, tiers clamped, slots only hold owned runes of their target). */
export const normalizeRunes = (rawRunes: unknown, rawSlots: unknown): { runes: Rune[]; runeSlots: RuneSlots } => {
  const runes: Rune[] = [];
  const seen = new Set<string>();
  for (const r of Array.isArray(rawRunes) ? rawRunes : []) {
    if (!r || typeof r.id !== 'string' || seen.has(r.id) || !(r.kind in RUNES)) continue;
    seen.add(r.id);
    runes.push({ id: r.id, kind: r.kind as RuneKind, tier: Math.max(1, Math.min(MAX_TIER, Math.floor(Number(r.tier) || 1))) });
  }
  const byId = new Map(runes.map((r) => [r.id, r]));
  const runeSlots = emptyRuneSlots();
  const used = new Set<string>();
  const saved = (rawSlots && typeof rawSlots === 'object' ? rawSlots : {}) as Record<string, unknown>;
  for (const target of RUNE_TARGET_IDS) {
    const list = Array.isArray(saved[target]) ? (saved[target] as unknown[]) : [];
    // Slots are fixed (extra slots once sold are dropped; their runes go back to the vault)
    for (let i = 0; i < SLOTS_PER_TARGET; i++) {
      const id = list[i];
      const rune = typeof id === 'string' ? byId.get(id) : undefined;
      if (rune && !used.has(rune.id) && RUNES[rune.kind].target === target) {
        runeSlots[target][i] = rune.id;
        used.add(rune.id);
      }
    }
  }
  return { runes, runeSlots };
};
