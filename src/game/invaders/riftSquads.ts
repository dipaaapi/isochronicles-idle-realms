import config from '../../data/riftSquads.json';
import type { InvaderType } from '../../types/game';

/** Per-rift squads (src/data/riftSquads.json): each open rift sends its own kind and number of invaders. */
export type SquadId = keyof typeof config.squads;
export interface SquadDef {
  icon: string;
  fromWave: number;
  weight: number;
  share: number;
  bias: Partial<Record<InvaderType, number>>;
  mods: { hp: number; speed: number; damage: number };
  commander?: InvaderType;
  name: { en: string; tl: string };
  desc: { en: string; tl: string };
}

export const SQUADS = config.squads as Record<SquadId, SquadDef>;
export const COMMANDER_FROM_WAVE = config.commanderFromWave;

/**
 * One squad per open rift, all different while there are enough to go round
 * (weighted by `weight`, only those unlocked by `fromWave`).
 */
export function rollSquads(count: number, wave: number, rand: () => number = Math.random): SquadId[] {
  const unlocked = (Object.keys(SQUADS) as SquadId[]).filter((id) => wave >= SQUADS[id].fromWave);
  const out: SquadId[] = [];
  for (let i = 0; i < count; i++) {
    const pool = unlocked.filter((id) => !out.includes(id));
    const from = pool.length ? pool : unlocked;
    let roll = rand() * from.reduce((s, id) => s + SQUADS[id].weight, 0);
    let pick = from[from.length - 1];
    for (const id of from) {
      roll -= SQUADS[id].weight;
      if (roll <= 0) {
        pick = id;
        break;
      }
    }
    out.push(pick);
  }
  return out;
}

/** The tactic's bias × the squad's bias. */
export const squadBias = (
  tacticBias: Partial<Record<InvaderType, number>> = {},
  squad: SquadId,
): Partial<Record<InvaderType, number>> => {
  const out: Partial<Record<InvaderType, number>> = { ...tacticBias };
  for (const [type, w] of Object.entries(SQUADS[squad].bias) as Array<[InvaderType, number]>) out[type] = (out[type] ?? 1) * w;
  return out;
};

/** Index of the rift the next invader comes through, weighted by each squad's share. */
export const pickByShare = (squads: SquadId[], rand: () => number = Math.random): number => {
  let roll = rand() * squads.reduce((s, id) => s + SQUADS[id].share, 0);
  for (let i = 0; i < squads.length; i++) {
    roll -= SQUADS[squads[i]].share;
    if (roll <= 0) return i;
  }
  return squads.length - 1;
};
