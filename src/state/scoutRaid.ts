import CONFIG from '../data/scoutRaid.json';
import { useGameStore } from './useGameStore';
import { useTenantCounts } from './tenantCounts';
import { buildingArmor, buildingHpOf, towerAccuracy, towerBuildingOf, towerLevelOf, towerStats } from './defenseStats';
import type { Resources, TowerId } from '../types/state';

export type ScoutRole = 'RUNNER' | 'LOOTER' | 'RAIDER';
export const SCOUT_ROLES = CONFIG.roles as Record<ScoutRole, { weight: number; speed: number; hp: number; alpha?: number; icon: string }>;
export const SCOUT_DEFENCE_CAP = CONFIG.scaling.defenceCap;

const between = ([lo, hi]: number[], rand: () => number) => lo + rand() * (hi - lo);

/** Wave the random fights scale with: the last wave reached (at least 1). */
export const scoutWave = (): number => Math.max(1, useGameStore.getState().invasion.waveNumber || 1);

/** HP / damage multipliers and defence (fraction of each hit ignored) for a scout at this wave. */
export function scoutScaling(wave: number): { hp: number; damage: number; defence: number } {
  const s = CONFIG.scaling;
  const n = Math.max(0, wave - 1);
  return {
    hp: 1 + s.hpPerWave * n,
    damage: 1 + s.damagePerWave * n,
    defence: Math.min(s.defenceCap, s.defenceBase + s.defencePerWave * n),
  };
}

/** How many scouts a random fight brings at this wave. */
export function scoutCount(wave: number, rand: () => number = Math.random): number {
  const c = CONFIG.count;
  const base = Math.floor(between([c.base[0], c.base[1] + 1], rand));
  return Math.min(c.max, base + Math.floor(wave / c.everyWaves));
}

export function pickScoutRole(rand: () => number = Math.random): ScoutRole {
  const entries = Object.entries(SCOUT_ROLES) as [ScoutRole, { weight: number }][];
  let roll = rand() * entries.reduce((sum, [, r]) => sum + r.weight, 0);
  for (const [role, r] of entries) {
    roll -= r.weight;
    if (roll <= 0) return role;
  }
  return 'RAIDER';
}

/** What a looter grabs from the citadel: coins plus one random resource, never more than the stockpile holds. */
export function rollStolen(wave: number, have: Resources, rand: () => number = Math.random): Partial<Resources> {
  const s = CONFIG.steal;
  const scale = 1 + s.perWave * Math.max(0, wave - 1);
  const key = s.resources[Math.floor(rand() * s.resources.length)] as keyof Resources;
  const out: Partial<Resources> = {};
  const coins = Math.min(have.coins ?? 0, Math.round(between(s.coins, rand) * scale));
  if (coins > 0) out.coins = coins;
  const amount = Math.min((have[key] as number) ?? 0, Math.round(between(s.resource, rand) * scale));
  if (amount > 0) out[key] = amount;
  return out;
}

/**
 * How well an establishment can defend itself: current HP stretched by its
 * armor, tower damage per second (damage ÷ cooldown = attack rate) times
 * accuracy, weapon reach, and the tenants on guard. Raider scouts go for the
 * lowest score.
 */
export function defenceScore(id: TowerId): number {
  const w = CONFIG.weakness;
  const store = useGameStore.getState();
  const b = towerBuildingOf(store, id);
  const level = towerLevelOf(b);
  const stats = towerStats(id, level);
  const dps = (stats.damage / Math.max(0.5, stats.cooldown)) * towerAccuracy(id, level);
  const toughness = buildingHpOf(b) / (1 - buildingArmor(id, level));
  const reach = Math.max(stats.radiusTiles, stats.splashTiles, stats.chainTiles, 1);
  const guards = useTenantCounts.getState().counts[id]?.living ?? 0;
  return toughness * w.hp + dps * w.dps + reach * w.radius + guards * w.garrison;
}
