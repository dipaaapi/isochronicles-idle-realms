import { RESOURCE_PRICES } from '../state/useGameStore';
import type { Resources } from '../types/state';

/** Icon for a resource key (coins included). */
export const resourceIcon = (key: keyof Resources): string =>
  key === 'coins' ? '🪙' : RESOURCE_PRICES[key as keyof typeof RESOURCE_PRICES]?.icon ?? '•';

/** Compact cost label, e.g. "120🪙 80🪨 12💠". */
export const formatCost = (cost: Partial<Resources>): string =>
  Object.entries(cost)
    .filter(([, amount]) => (amount ?? 0) > 0)
    .map(([key, amount]) => `${amount}${resourceIcon(key as keyof Resources)}`)
    .join(' ');
