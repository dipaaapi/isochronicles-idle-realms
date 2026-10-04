import config from '../data/scoutLoot.json';
import type { InvaderType } from '../types/game';
import type { Resources } from '../types/state';

/** Peacetime wandering scouts and their ground drops (src/data/scoutLoot.json). */

export type ScoutKind = 'HUMAN' | 'MECHA';

export interface ScoutDef {
  type: InvaderType;
  kind: ScoutKind;
  weight: number;
  hp: number;
  speed: number;
  damage: number;
}

export interface ScoutDrops {
  /** Coin piles scattered on the ground. */
  coinPiles: number[];
  resources: Array<[keyof Resources, number]>;
  /** Equipment id (craftableItems.json) that drops straight into the inventory. */
  itemId?: string;
}

export const SCOUTS = config.scouts as ScoutDef[];

export function pickScout(rand: () => number = Math.random): ScoutDef {
  let roll = rand() * SCOUTS.reduce((sum, s) => sum + s.weight, 0);
  for (const s of SCOUTS) {
    roll -= s.weight;
    if (roll <= 0) return s;
  }
  return SCOUTS[0];
}

const amount = (r: { min: number; max: number; perWave: number }, wave: number, rand: () => number) =>
  Math.max(1, Math.round((r.min + rand() * (r.max - r.min)) * (1 + Math.max(0, wave - 1) * r.perWave * 0.1)));

export function rollScoutDrops(kind: ScoutKind, waveNumber: number, rand: () => number = Math.random): ScoutDrops {
  const wave = Number.isFinite(waveNumber) ? waveNumber : 1;
  const d = config.drops[kind];
  const coins = amount(d.coins, wave, rand);
  const piles = Math.max(1, config.coinPiles);
  const coinPiles = Array.from({ length: piles }, (_, i) =>
    Math.floor(coins / piles) + (i < coins % piles ? 1 : 0)).filter((n) => n > 0);

  const resources: Array<[keyof Resources, number]> = [];
  for (let i = 0; i < d.resourceRolls; i++) {
    const r = d.resources[Math.floor(rand() * d.resources.length)];
    resources.push([r.key as keyof Resources, amount(r, wave, rand)]);
  }
  const itemId = rand() < d.itemChance ? d.itemPool[Math.floor(rand() * d.itemPool.length)] : undefined;
  return { coinPiles, resources, itemId };
}
