import { INVADER_CONFIGS, type InvaderType } from '../../types/game';
import type { Difficulty } from '../../state/difficulty';
import { eliteChance, isBossWave, isClimaxWave, type InvaderRank } from '../../state/waveBalance';
import type { WaveTactic } from '../../state/waveTactics';
import { pickWaveInvader } from './wavePool';

export interface PlannedSpawn {
  type: InvaderType;
  rank: InvaderRank;
  /** The tactic's mid-wave ruler. */
  escort?: boolean;
}

/** The ruler leading a boss wave: High Priest and Mecha Valkyrie take turns. */
export const bossRulerFor = (wave: number): InvaderType =>
  Math.floor(wave / 5) % 2 === 1 ? 'HIGH_PRIEST' : 'MECHA_VALKYRIE';

/**
 * Lays out a wave in spawn order: fighters drawn with the tactic's bias and
 * sorted into its formation, a few promoted to elites, the tactic's escort
 * mid-wave and the boss last.
 */
export function buildWavePlan(
  wave: number,
  count: number,
  tactic: WaveTactic,
  difficulty: Difficulty,
  rand: () => number = Math.random,
): PlannedSpawn[] {
  const boss = isBossWave(wave) && count > 1;
  const escort = tactic.escort && count > 3 ? tactic.escort : undefined;
  const fighters = Math.max(0, count - (boss ? 1 : 0) - (escort ? 1 : 0));
  const elite = eliteChance(wave, difficulty);

  const plan: PlannedSpawn[] = [];
  for (let i = 0; i < fighters; i++) {
    plan.push({ type: pickWaveInvader(wave, tactic.bias, rand), rank: rand() < elite ? 'elite' : 'normal' });
  }

  const range = (s: PlannedSpawn) => INVADER_CONFIGS[s.type].attackRange ?? 50;
  const hp = (s: PlannedSpawn) => INVADER_CONFIGS[s.type].hp;
  if (tactic.order === 'MELEE_FIRST') plan.sort((a, b) => range(a) - range(b));
  else if (tactic.order === 'RANGED_FIRST') plan.sort((a, b) => range(b) - range(a));
  else if (tactic.order === 'HEAVY_LAST') plan.sort((a, b) => hp(a) - hp(b));

  if (escort) plan.splice(Math.floor(plan.length * escort.at), 0, { type: escort.type, rank: 'elite', escort: true });
  if (boss) plan.push({ type: bossRulerFor(wave), rank: isClimaxWave(wave) ? 'climax' : 'boss' });
  if (count === 1 && plan.length === 0) plan.push({ type: pickWaveInvader(wave, tactic.bias, rand), rank: 'normal' });
  return plan;
}
