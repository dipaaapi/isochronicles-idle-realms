import type { WorkerInstance } from './workers/types';

/**
 * Battle targets a General can be ordered to prioritise (Generals panel), outside
 * the invader list: the Kirov airship and the wild factions' creatures. MainScene
 * fills this in once its systems exist; combat reads it every frame.
 */
export interface OrderTarget {
  x: number;
  y: number;
  boss: boolean;
  /** Hits it as this General (only called within reach). */
  strike(damage: number, by: WorkerInstance): void;
}

export const battleTargets: {
  kirov?: () => { x: number; y: number } | null;
  /** Fighting creatures of a wild faction by id ('SEA' = Leviathan's Sea Folk, 'BROOD' = Caterpillar's Sand Brood). */
  wild: Record<string, () => OrderTarget[]>;
  /** A Kirov Invasion Battle is on (the airship or its raiders are on the island). */
  kirovInvasion?: () => boolean;
  /** Two Generals are brawling. */
  brawl?: () => boolean;
} = { wild: {} };
