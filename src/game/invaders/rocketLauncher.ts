import config from '../../data/rocketLaunchers.json';
import type { Difficulty } from '../../state/difficulty';
import type { InvaderType } from '../../types/game';
import type { StructureTarget } from '../StructureManager';

/** V4 Rocket Launcher raids (src/data/rocketLaunchers.json). */
export const LAUNCHERS = config;

/** Launchers rolling out this wave: 0 unless the wave's chance roll hits. */
export const launchersForWave = (wave: number, difficulty: Difficulty, rand: () => number = Math.random): number => {
  if (wave < config.fromWave) return 0;
  const chance = Math.min(config.maxChance, config.chance[difficulty] + (wave - config.fromWave) * config.chancePerWave);
  if (rand() >= chance) return 0;
  return config.launchers.base + Math.floor((wave - 1) / config.launchers.perWaves);
};

/** Mecha guards escorting each launcher. */
export const launcherEscortsFor = (wave: number, difficulty: Difficulty): number =>
  config.escorts[difficulty] + Math.floor((wave - 1) / config.escorts.perWaves);

export const launcherEscortType = (i: number): InvaderType =>
  config.escorts.types[i % config.escorts.types.length] as InvaderType;

export const aimSeconds = (difficulty: Difficulty): number => config.aimSeconds[difficulty];
export const reloadSeconds = (difficulty: Difficulty): number => config.reloadSeconds[difficulty];

/** A random live establishment (never the citadel), favouring ones already in range. */
export const chooseRocketTarget = (
  targets: StructureTarget[],
  distanceTiles: (t: StructureTarget) => number,
  rand: () => number = Math.random,
): StructureTarget | undefined => {
  const sites = targets.filter((t) => t.id !== 'CASTLE');
  if (!sites.length) return undefined;
  const inRange = sites.filter((t) => distanceTiles(t) <= config.rangeTiles);
  const pool = inRange.length ? inRange : sites;
  return pool[Math.floor(rand() * pool.length)];
};
