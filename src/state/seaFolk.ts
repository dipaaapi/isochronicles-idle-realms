import SEA from '../data/seaFolk.json';
import type { Resources } from '../types/state';

/** Typed access to src/data/seaFolk.json (the Sea Folk third faction). */

export type SeaCreature = keyof typeof SEA.creatures;
export type SeaMood = keyof typeof SEA.moods;
export type Localized = { en: string; tl: string };

export interface SeaCreatureDef {
  sprite: 'mermaid' | 'piranha' | 'kappa' | 'leviathan';
  boss: boolean;
  /** Swims only on water tiles (the Leviathan). */
  waterOnly?: boolean;
  hp: number;
  damage: number;
  range: number;
  speed: number;
  attackMs: number;
  skill: { id: string; cooldownMs: number; [k: string]: number | string };
  /** Boss skill rotation (the Leviathan): each on its own cooldown. */
  skills?: Array<{ id: string; cooldownMs: number; radius: number; name: Localized; desc: Localized; [k: string]: unknown }>;
  loot: Array<{ res: string; min: number; max: number }>;
  name: Localized;
  desc: Localized;
  skillName: Localized;
  skillDesc: Localized;
}

export const SEA_FOLK = SEA;
export const SEA_CREATURES = SEA.creatures as unknown as Record<SeaCreature, SeaCreatureDef>;
export const SEA_CONTAMINATION = SEA.contamination;

export const clampContamination = (v: number): number =>
  Math.max(0, Math.min(SEA.contamination.max, Number.isFinite(v) ? v : 0));

/** How the sea feels right now (drives emergence, the HUD badge and the silhouettes). */
export function seaMood(contamination: number, truceWaves: number): SeaMood {
  if (truceWaves > 0) return 'TRUCE';
  if (contamination >= SEA.contamination.bossAt) return 'ENRAGED';
  if (contamination >= SEA.contamination.emergeAt) return 'RESTLESS';
  return 'CALM';
}

/** Group size for the current contamination (0 when the sea is still calm). */
export function seaGroupSize(contamination: number, roll = Math.random()): number {
  let size: number[] | null = null;
  for (const g of SEA.groups) if (contamination >= g.at) size = g.size;
  if (!size) return 0;
  return size[0] + Math.floor(roll * (size[1] - size[0] + 1));
}

/** Tribute grows with how poisoned the sea is. */
export function seaTributeCost(contamination: number): Partial<Resources> {
  const k = 1 + contamination * SEA.tribute.perContamination;
  const cost: Partial<Resources> = {};
  for (const [res, amount] of Object.entries(SEA.tribute.base)) cost[res as keyof Resources] = Math.round(amount * k);
  return cost;
}

/** Random creature from the weighted mix (the Leviathan is spawned separately). */
export function pickSeaCreature(roll = Math.random()): SeaCreature {
  const entries = Object.entries(SEA.mix) as Array<[SeaCreature, number]>;
  let r = roll * entries.reduce((s, [, w]) => s + w, 0);
  for (const [kind, w] of entries) {
    r -= w;
    if (r <= 0) return kind;
  }
  return entries[0][0];
}
