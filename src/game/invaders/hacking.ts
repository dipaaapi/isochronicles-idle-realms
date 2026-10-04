import config from '../../data/technicians.json';
import type { Difficulty } from '../../state/difficulty';
import type { InvaderType } from '../../types/game';
import type { StructureTarget } from '../StructureManager';
import type { InvaderContext } from './context';
import type { ActiveInvader } from './types';
import { isHacked } from '../hackState';

/** Human Technician raids (src/data/technicians.json). */
export const TECHNICIANS = config;

/** Hackers in this wave's raid: one, plus one more every `perWaves` waves. */
export const hackersForWave = (wave: number): number =>
  wave < config.fromWave ? 0 : config.hackers.base + Math.floor((wave - 1) / config.hackers.perWaves);

/** Fighters escorting each hacker. */
export const escortsFor = (wave: number, difficulty: Difficulty): number =>
  config.escorts[difficulty] + Math.floor((wave - 1) / config.escorts.perWaves);

export const escortType = (i: number): InvaderType =>
  config.escorts.types[i % config.escorts.types.length] as InvaderType;

export const hackSeconds = (difficulty: Difficulty): number => config.hackSeconds[difficulty];

/** The nearest establishment (not the citadel) still on the player's side. */
export const chooseHackTarget = (ctx: InvaderContext, invader: ActiveInvader): StructureTarget | undefined => {
  const x = invader.container.x;
  const y = invader.container.y;
  let best: StructureTarget | undefined;
  let bestD = Infinity;
  for (const s of ctx.structures?.getTargets() ?? []) {
    // Establishments only (the Crystal Spire counts as one): never the citadel
    if (s.id === 'CASTLE' || isHacked(s.id)) continue;
    const d = ctx.nav ? ctx.nav.distanceToRect(x, y, s.rect) : Math.hypot(s.x - x, s.y - y) / 40;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
};
