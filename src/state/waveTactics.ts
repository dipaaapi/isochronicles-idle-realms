import config from '../data/waveTactics.json';
import type { InvaderType } from '../types/game';
import type { Difficulty } from './difficulty';
import { WAVE_BALANCE } from './waveBalance';

export type PortalPattern = 'ALL' | 'PAIR' | 'SINGLE' | 'ROTATE';
export type SpawnOrder = 'NONE' | 'MELEE_FIRST' | 'RANGED_FIRST' | 'HEAVY_LAST';
export type TacticEffect = 'SHIELD_WALL' | 'OVERCLOCK' | 'SANCTUARY' | 'PHASE_VEIL' | 'WAR_CRY';

export interface Localized { en: string; tl: string }

export interface WaveTactic {
  id: string;
  name: Localized;
  desc: Localized;
  icon: string;
  fromWave: number;
  weight: number;
  portals: PortalPattern;
  rotateEvery?: number;
  /** Invaders that step out back-to-back before the next gap. */
  burst: number;
  /** Multipliers (default 1). */
  interval?: number;
  count?: number;
  hp?: number;
  damage?: number;
  speed?: number;
  portalHp?: number;
  rusherBonus?: number;
  order: SpawnOrder;
  /** Pool weight multipliers per invader type. */
  bias?: Partial<Record<InvaderType, number>>;
  /** A ruler that joins at this fraction of the wave. */
  escort?: { type: InvaderType; at: number };
  effect?: TacticEffect;
}

export const WAVE_TACTICS = config.tactics as WaveTactic[];
export const TACTIC_EFFECTS = config.effects;
const DEFAULT_TACTIC = WAVE_TACTICS[0];

export const tacticOf = (id: string | undefined): WaveTactic =>
  WAVE_TACTICS.find((t) => t.id === id) ?? DEFAULT_TACTIC;

/** Wave a tactic unlocks at: Easy meets them later, Hard sooner. */
export const tacticUnlockWave = (tactic: WaveTactic, difficulty: Difficulty): number =>
  tactic.fromWave <= 1 ? 1 : Math.max(2, Math.round(tactic.fromWave / WAVE_BALANCE.difficulty[difficulty].tacticDepth));

/**
 * Rolls the tactic for a wave. The first two waves are always a plain
 * skirmish, and the same tactic never repeats twice in a row when there is a choice.
 */
export function rollWaveTactic(wave: number, difficulty: Difficulty, previous?: string, rand: () => number = Math.random): string {
  if (wave <= 2) return DEFAULT_TACTIC.id;
  let pool = WAVE_TACTICS.filter((t) => wave >= tacticUnlockWave(t, difficulty));
  if (pool.length > 1) pool = pool.filter((t) => t.id !== previous);
  let roll = rand() * pool.reduce((sum, t) => sum + t.weight, 0);
  for (const t of pool) {
    roll -= t.weight;
    if (roll <= 0) return t.id;
  }
  return pool[pool.length - 1]?.id ?? DEFAULT_TACTIC.id;
}
