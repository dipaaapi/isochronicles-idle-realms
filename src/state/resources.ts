import type { Resources } from '../types/state';

/** Every resource key, in display order. */
export const RESOURCE_KEYS: readonly (keyof Resources)[] = [
  'aetherShards', 'wood', 'stone', 'arcaneEssence', 'fish', 'water',
  'metal', 'charcoal', 'coal', 'minerals', 'coins',
];

const amountOf = (resources: Partial<Resources>, key: keyof Resources): number => resources[key] ?? 0;

/** True when every positive entry of `cost` is covered by `resources`. */
export const canAfford = (resources: Resources, cost: Partial<Resources>): boolean =>
  RESOURCE_KEYS.every((key) => amountOf(resources, key) >= amountOf(cost, key));

/** Adds `delta` (may be negative) to every key, clamping each total at 0. */
export const addResourceDelta = (resources: Resources, delta: Partial<Resources>): Resources => {
  const next = { ...resources };
  for (const key of RESOURCE_KEYS) {
    next[key] = Math.max(0, amountOf(resources, key) + amountOf(delta, key));
  }
  return next;
};

/** Subtracts `cost`; callers check `canAfford` first. */
export const subtractCost = (resources: Resources, cost: Partial<Resources>): Resources => {
  const next = { ...resources };
  for (const key of RESOURCE_KEYS) {
    if (cost[key]) next[key] = amountOf(resources, key) - amountOf(cost, key);
  }
  return next;
};

/** Removes `fraction` of every stockpile (rounded down); returns what was taken and what is left. */
export const lootResources = (resources: Resources, fraction: number) => {
  const looted: Partial<Resources> = {};
  const remaining = { ...resources };
  for (const key of RESOURCE_KEYS) {
    const lost = Math.floor(amountOf(resources, key) * fraction);
    looted[key] = lost;
    remaining[key] = amountOf(resources, key) - lost;
  }
  return { looted, remaining };
};
