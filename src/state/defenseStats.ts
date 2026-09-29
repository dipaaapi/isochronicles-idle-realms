import config from '../data/defenseConfig.json';
import type { CastleDefenseState, ResourceBuildingId, ResourceBuildingState, Resources } from '../types/state';

/**
 * Establishment towers, the citadel's Provoke Beacon and invader portals —
 * pure stat/cost formulas over src/data/defenseConfig.json.
 */

export type TowerAttack = 'catapult' | 'iceStorm' | 'saplings' | 'spikes' | 'flamethrower';
export type CastleUpgradeKey = 'wallLevel' | 'shieldLevel' | 'beaconLevel';
export type Localized = { en: string; tl: string };

interface TowerConfig {
  attack: TowerAttack;
  icon: string;
  name: Localized;
  desc: Localized;
  damage: number;
  damagePerLevel: number;
  cooldown: number;
  cooldownPerLevel: number;
  costs: Array<Partial<Resources>>;
  [extra: string]: unknown;
}

export const DEFENSE_CONFIG = config;
export const DEFENSE_TEXT = config.text;
export const TOWER_MAX_LEVEL = config.towerMaxLevel;
/** Tower zones extend this many tiles past the footprint (2×2 footprint → 4×4 zone). */
export const ZONE_MARGIN = config.zoneMarginTiles;
export const TOWERS = config.towers as unknown as Record<ResourceBuildingId, TowerConfig>;

const round1 = (n: number) => Math.round(n * 10) / 10;

export const buildingMaxHp = (towerLevel: number): number =>
  config.building.hpBase + config.building.hpPerLevel * (Math.max(1, towerLevel) - 1);

/** Tower level of a built establishment (older saves had none → 1). */
export const towerLevelOf = (b?: ResourceBuildingState): number => (b && b.level > 0 ? b.towerLevel ?? 1 : 0);

/** Current HP of a built establishment (older saves had none → full). */
export const buildingHpOf = (b?: ResourceBuildingState): number =>
  !b || b.level < 1 ? 0 : Math.min(b.hp ?? buildingMaxHp(towerLevelOf(b)), buildingMaxHp(towerLevelOf(b)));

export const isBuildingOperational = (b?: ResourceBuildingState): boolean => !!b && b.level >= 1 && buildingHpOf(b) > 0;

export interface TowerStats {
  attack: TowerAttack;
  damage: number;
  cooldown: number;
  shards: number;
  stormSeconds: number;
  radiusTiles: number;
  slowFactor: number;
  slowSeconds: number;
  charges: number;
  perSummon: number;
  saplingHp: number;
  saplingLifetime: number;
  volley: number;
  flameSeconds: number;
  coneDegrees: number;
  burnDps: number;
  burnSeconds: number;
  splashTiles: number;
}

/**
 * Combat stats of an establishment at a tower level. `damageMultiplier`
 * carries permanent skills (e.g. the old Castle Turrets skill now boosts towers).
 */
export function towerStats(id: ResourceBuildingId, towerLevel: number, damageMultiplier = 1): TowerStats {
  const t = TOWERS[id];
  const n = Math.max(1, towerLevel) - 1;
  const num = (key: string, fallback = 0) => (typeof t[key] === 'number' ? (t[key] as number) : fallback);
  const bonusEveryOther = Math.floor(n / 2); // +1 at levels 3 and 5
  return {
    attack: t.attack,
    damage: Math.round((t.damage + t.damagePerLevel * n) * damageMultiplier),
    cooldown: round1(Math.max(0.8, t.cooldown + t.cooldownPerLevel * n)),
    shards: num('shards') + num('shardsPerLevel') * n,
    stormSeconds: num('stormSeconds'),
    radiusTiles: num('radiusTiles'),
    slowFactor: num('slowFactor', 1),
    slowSeconds: num('slowSeconds'),
    charges: num('charges'),
    perSummon: 1 + bonusEveryOther,
    saplingHp: num('saplingHp') + num('saplingHpPerLevel') * n,
    saplingLifetime: num('saplingLifetime'),
    volley: num('volley') + bonusEveryOther,
    flameSeconds: num('flameSeconds'),
    coneDegrees: num('coneDegrees'),
    burnDps: Math.round((num('burnDps') + num('burnDpsPerLevel') * n) * damageMultiplier),
    burnSeconds: num('burnSeconds'),
    splashTiles: num('splashTiles'),
  };
}

/** Cost to raise a tower from `towerLevel` to the next, or null at max. */
export function towerUpgradeCost(id: ResourceBuildingId, towerLevel: number): Partial<Resources> | null {
  if (towerLevel < 1 || towerLevel >= TOWER_MAX_LEVEL) return null;
  return TOWERS[id].costs[towerLevel - 1] ?? null;
}

export const buildingRepairCost = (): Partial<Resources> => ({ ...config.building.repairCost });

type CostCurve = { base: number; growth: number; fromLevel?: number };

/** Cost to raise a citadel upgrade from `level` to the next, or null at max. */
export function castleUpgradeCost(key: CastleUpgradeKey, level: number): Partial<Resources> | null {
  const def = config.castle[key] as { costs: Record<string, CostCurve>; maxLevel?: number };
  if (def.maxLevel && level >= def.maxLevel) return null;
  const cost: Partial<Resources> = {};
  for (const [resource, curve] of Object.entries(def.costs)) {
    if (curve.fromLevel && level < curve.fromLevel) continue;
    cost[resource as keyof Resources] = Math.floor(curve.base * Math.pow(curve.growth, level - 1));
  }
  return cost;
}

export interface BeaconStats {
  radiusTiles: number;
  interval: number;
  duration: number;
}

export function beaconStats(level: number): BeaconStats {
  const b = config.castle.beaconLevel;
  const n = Math.max(1, level) - 1;
  return {
    radiusTiles: round1(b.radiusTiles + b.radiusPerLevel * n),
    interval: round1(Math.max(b.minInterval, b.interval + b.intervalPerLevel * n)),
    duration: round1(b.duration + b.durationPerLevel * n),
  };
}

export const beaconLevelOf = (defense: Partial<CastleDefenseState> & { turretLevel?: number }): number =>
  defense.beaconLevel ?? defense.turretLevel ?? 1;

export function portalMaxHp(wave: number, enemyMultiplier = 1): number {
  const p = config.portal;
  return Math.round((p.hp + p.hpPerWave * (Math.max(1, wave) - 1)) * enemyMultiplier);
}

export function portalBounty(wave: number): Partial<Resources> {
  const p = config.portal;
  return { coins: p.coins + p.coinsPerWave * (Math.max(1, wave) - 1), aetherShards: p.shards + Math.floor(wave / 5) };
}

export const canAfford = (resources: Resources, cost: Partial<Resources> | null): boolean =>
  !!cost && Object.entries(cost).every(([key, amount]) => (resources[key as keyof Resources] ?? 0) >= (amount ?? 0));
