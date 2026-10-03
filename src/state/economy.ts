import config from '../data/economy.json';
import type { ResourceBuildingId, Resources, UpgradesState } from '../types/state';
import type { UnitClass } from '../types/game';
import { RESEARCH_CATEGORIES, calcResearchCost } from '../data/researchConfig';

/**
 * Prices, build costs and progression formulas — pure lookups over src/data/economy.json.
 */

export const ECONOMY_CONFIG = config;

export type TradeableResource = keyof Omit<Resources, 'coins'>;

export const RESOURCE_PRICES: Record<TradeableResource, { sell: number; buy: number; label: string; labelEn?: string; icon: string }> =
  config.resourcePrices;

export const RESOURCE_BUILDING_CONFIG: Record<ResourceBuildingId, {
  label: string;
  labelEn: string;
  icon: string;
  outputs: string[];
  costs: Array<Partial<Resources>>;
}> = config.resourceBuildings;

export const CASTLE_CONSTRUCTION_COST: Partial<Resources> = config.castleConstructionCost;
export const SPIRE_CONSTRUCTION_COST: Partial<Resources> = config.spireConstructionCost;

type CostFormula = { base: Partial<Resources>; perUnit?: Partial<Resources>; perLevel?: Partial<Resources> };

/** base + step × n for every key the formula names. */
const scaleCost = (base: Partial<Resources>, step: Partial<Resources> | undefined, n: number): Partial<Resources> => {
  const cost: Partial<Resources> = { ...base };
  for (const [key, amount] of Object.entries(step ?? {}) as [keyof Resources, number][]) {
    cost[key] = (cost[key] ?? 0) + amount * n;
  }
  return cost;
};

/** Cost to summon one more `unitClass` when `countOfClass` already exist. */
export const getUnitSummonCost = (unitClass: UnitClass, countOfClass: number): Partial<Resources> => {
  const formula = (config.unitSummon.costs as Record<string, CostFormula | undefined>)[unitClass];
  return formula ? scaleCost(formula.base, formula.perUnit, countOfClass) : {};
};

export const maxUnitsOfClass = (unitClass: UnitClass): number =>
  unitClass === 'TREANT' ? config.unitSummon.maxTreants : config.unitSummon.maxPerClass;

/** Tenants that serve under one establishment's General. */
export const TENANTS_PER_ESTABLISHMENT: number = config.unitSummon.tenantsPerEstablishment;

export const slimeEvolutionCost = (currentLevel: number): Partial<Resources> =>
  scaleCost(config.slimeEvolution.cost.base, config.slimeEvolution.cost.perLevel, currentLevel);

export const slimeEvolutionKillsRequired = (currentLevel: number): number =>
  currentLevel * config.slimeEvolution.killsPerLevel;

export const techUpgradeCost = (techKey: keyof UpgradesState | number, levelFallback?: number): Partial<Resources> => {
  // If techKey is a key of UpgradesState
  if (typeof techKey === 'string') {
    for (const cat of RESEARCH_CATEGORIES) {
      const node = cat.nodes.find((n) => n.key === techKey);
      if (node) {
        return calcResearchCost(node, levelFallback ?? 1);
      }
    }
  }

  const currentLevel = typeof techKey === 'number' ? techKey : (levelFallback ?? 1);
  const cost: Partial<Resources> = {};
  for (const [key, { base, growth }] of Object.entries(config.techUpgrade) as [keyof Resources, { base: number; growth: number }][]) {
    cost[key] = Math.floor(base * Math.pow(growth, currentLevel - 1));
  }
  return cost;
};

export const enemiesInWave = (wave: number): number =>
  config.invasion.baseEnemies + wave * config.invasion.enemiesPerWave;

