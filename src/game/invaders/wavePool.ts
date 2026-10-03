import type { InvaderType } from '../../types/game';
import WAVE_POOL_JSON from '../../data/wavePool.json';

/** Which fighters join the waves, from which wave, and how often (relative weight). */
const WAVE_POOL = WAVE_POOL_JSON as Array<{ type: InvaderType; fromWave: number; weight: number }>;

export const pickWaveInvader = (waveNumber: number): InvaderType => {
  const pool = WAVE_POOL.filter((e) => waveNumber >= e.fromWave);
  let roll = Math.random() * pool.reduce((sum, e) => sum + e.weight, 0);
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll <= 0) return entry.type;
  }
  return 'HUMAN_KNIGHT';
};
