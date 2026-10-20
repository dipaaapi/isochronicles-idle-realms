import SEA from '../data/seaFolk.json';
import BROOD from '../data/sandBrood.json';
import type { Resources } from '../types/state';

/**
 * Shared rules for the wild factions — the Sea Folk (seaFolk.json) and the
 * Sand Brood (sandBrood.json). Both files use one schema: a 0–100 meter
 * ("contamination": sea poison / ground unrest), groups by meter, a creature
 * mix, a boss with a skill rotation, tribute and kill rewards.
 */

export type Localized = { en: string; tl: string };
export type WildMood = 'CALM' | 'RESTLESS' | 'ENRAGED' | 'TRUCE';
export type WildFactionId = 'SEA' | 'BROOD';

export interface WildCreatureDef {
  sprite: string;
  boss: boolean;
  /** Swims only on water tiles (the Leviathan). */
  waterOnly?: boolean;
  /** Walks only on land tiles (the Ancient Caterpillar). */
  landOnly?: boolean;
  hp: number;
  damage: number;
  range: number;
  speed: number;
  attackMs: number;
  skill: { id: string; cooldownMs: number; [k: string]: number | string };
  skills?: Array<{ id: string; cooldownMs: number; radius: number; name: Localized; desc: Localized; [k: string]: unknown }>;
  loot: Array<{ res: string; min: number; max: number }>;
  name: Localized;
  desc: Localized;
  skillName: Localized;
  skillDesc: Localized;
}

export interface WildFactionData {
  contamination: { perWave: number; perBrawl: number; perFire: number; perBattleDeath: number; perPeacefulDay: number; emergeAt: number; bossAt: number; max: number };
  groups: Array<{ at: number; size: number[] }>;
  mix: Record<string, number>;
  brawlEmergeChance: number;
  levelUp: { attackPerLevel: number; hpPerLevel: number; healOnKill: number; maxLevel: number };
  fightBack: { noticeRadius: number; allyRadius: number; maxPerCreature: number; leash: number; cooldownMs: number; waterReach: number };
  boss: { randomChance: number; runeChance: number; inBrawls?: boolean };
  killReward: { attackShare: number; hpShare: number; bossBonus: number };
  silhouettes: { count: number; speed: number; alpha: number };
  bodyguards: { count: number; radius: number; share: number };
  tribute: { base: Record<string, number>; perContamination: number; cleanse: number; truceWaves: number };
  terrain?: { sandDays?: number; carveRadius?: number; floodEverySeconds?: number; floodRadius?: number };
  creatures: Record<string, WildCreatureDef>;
  moods: Record<WildMood, Localized>;
}

export const WILD_FACTIONS: Record<WildFactionId, WildFactionData> = {
  SEA: SEA as unknown as WildFactionData,
  BROOD: BROOD as unknown as WildFactionData,
};

export const clampMeter = (data: WildFactionData, v: number): number =>
  Math.max(0, Math.min(data.contamination.max, Number.isFinite(v) ? v : 0));

export function wildMood(data: WildFactionData, meter: number, truceWaves: number): WildMood {
  if (truceWaves > 0) return 'TRUCE';
  if (meter >= data.contamination.bossAt) return 'ENRAGED';
  if (meter >= data.contamination.emergeAt) return 'RESTLESS';
  return 'CALM';
}

export function wildGroupSize(data: WildFactionData, meter: number, roll = Math.random()): number {
  let size: number[] | null = null;
  for (const g of data.groups) if (meter >= g.at) size = g.size;
  if (!size) return 0;
  return size[0] + Math.floor(roll * (size[1] - size[0] + 1));
}

export function wildTributeCost(data: WildFactionData, meter: number): Partial<Resources> {
  const k = 1 + meter * data.tribute.perContamination;
  const cost: Partial<Resources> = {};
  for (const [res, amount] of Object.entries(data.tribute.base)) cost[res as keyof Resources] = Math.round(amount * k);
  return cost;
}

export function pickWildCreature(data: WildFactionData, roll = Math.random()): string {
  const entries = Object.entries(data.mix);
  let r = roll * entries.reduce((s, [, w]) => s + w, 0);
  for (const [kind, w] of entries) {
    r -= w;
    if (r <= 0) return kind;
  }
  return entries[0][0];
}

/** Store field names for each faction's meter and truce. */
export const WILD_STATE = {
  SEA: { meter: 'seaContamination', truce: 'seaTruceWaves' },
  BROOD: { meter: 'broodUnrest', truce: 'broodTruceWaves' },
} as const;
