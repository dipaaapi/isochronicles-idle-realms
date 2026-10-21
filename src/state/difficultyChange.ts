import config from '../data/difficultyChange.json';
import type { Difficulty } from './difficulty';
import type { Resources } from '../types/state';

/** Order from easiest to hardest. */
const RANK: Record<Difficulty, number> = { EASY: 0, NORMAL: 1, HARD: 2 };

/** Price of switching the running realm from `from` to `to` at this wave (src/data/difficultyChange.json). */
export function difficultyChangeCost(from: Difficulty, to: Difficulty, wave: number): Partial<Resources> {
  if (from === to) return {};
  const mult = RANK[to] < RANK[from] ? config.easierMultiplier : config.harderMultiplier;
  const out: Partial<Resources> = {};
  for (const [k, v] of Object.entries(config.base) as Array<[keyof Resources, number]>) {
    const per = (config.perWave as Record<string, number>)[k] ?? 0;
    out[k] = Math.round((v + per * Math.max(1, wave)) * mult);
  }
  return out;
}
