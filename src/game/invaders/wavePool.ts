import type { InvaderType } from '../../types/game';
import WAVE_POOL_JSON from '../../data/wavePool.json';
import { INVADER_CONFIGS } from '../../data/invaders';

/** Which fighters join the waves, from which wave, and how often (relative weight). */
const WAVE_POOL = WAVE_POOL_JSON as Array<{ type: InvaderType; fromWave: number; weight: number }>;

/** Picks a fighter for the wave; `bias` (from the wave's tactic) multiplies pool weights. */
export const pickWaveInvader = (
  waveNumber: number,
  bias: Partial<Record<InvaderType, number>> = {},
  rand: () => number = Math.random,
): InvaderType => {
  const pool = WAVE_POOL.filter((e) => waveNumber >= e.fromWave).map((e) => ({ type: e.type, weight: e.weight * (bias[e.type] ?? 1) }));
  let roll = rand() * pool.reduce((sum, e) => sum + e.weight, 0);
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll <= 0) return entry.type;
  }
  return 'HUMAN_KNIGHT';
};

/** Picks a fighter of the requested faction from the wave's unlocked pool. */
export const pickWaveInvaderOfCategory = (
  waveNumber: number,
  category: 'HUMAN' | 'MECHA',
  rand: () => number = Math.random,
): InvaderType => {
  const pool = WAVE_POOL.filter((entry) => waveNumber >= entry.fromWave && INVADER_CONFIGS[entry.type].category === category);
  if (!pool.length) return category === 'HUMAN' ? 'HUMAN_KNIGHT' : 'MECHA_SCOUT';
  let roll = rand() * pool.reduce((sum, entry) => sum + entry.weight, 0);
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll <= 0) return entry.type;
  }
  return pool[pool.length - 1].type;
};
