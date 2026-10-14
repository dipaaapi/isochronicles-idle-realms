import config from '../data/tenantWork.json';
import type { Resources } from '../types/state';

/** Tenant summoning, construction and repair tuning (src/data/tenantWork.json). */
export const TENANT_WORK = config as {
  summonCost: Partial<Resources>;
  firstTenantFree: boolean;
  buildSteps: number;
  buildStepSeconds: number;
  repairStepSeconds: number;
  repairStepHp: number;
  repairStepCost: Partial<Resources>;
  workRadiusPx: number;
};

/** The slice of `cost` paid on construction step `step` (0-based) of `steps`; the slices add up to the whole cost. */
export const buildStepCost = (cost: Partial<Resources>, step: number, steps: number): Partial<Resources> => {
  const out: Partial<Resources> = {};
  for (const [key, amount] of Object.entries(cost) as [keyof Resources, number][]) {
    const slice = Math.floor(((step + 1) * amount) / steps) - Math.floor((step * amount) / steps);
    if (slice > 0) out[key] = slice;
  }
  return out;
};

/** Share of an establishment's construction already paid for (0–1). */
export const buildProgressOf = (buildStep: number | undefined): number =>
  Math.max(0, Math.min(1, (buildStep ?? 0) / Math.max(1, config.buildSteps)));
