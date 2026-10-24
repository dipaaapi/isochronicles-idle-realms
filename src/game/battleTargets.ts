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
  /** Hits it as a minion (DefenderSystem defender), so it retaliates against that minion. */
  strikeBy?(damage: number, minion: unknown): void;
}

export const battleTargets: {
  kirov?: () => { x: number; y: number } | null;
  /** Fighting creatures of a wild faction by id ('SEA' = Leviathan's Sea Folk, 'BROOD' = Caterpillar's Sand Brood). */
  wild: Record<string, () => OrderTarget[]>;
  /** A Kirov Invasion Battle is on (the airship or its raiders are on the island). */
  kirovInvasion?: () => boolean;
  /** Game seconds until the next Kirov Invasion Battle rolls in (raids tick only between waves). */
  nextKirovIn?: () => number;
  /** Two Generals are brawling. */
  brawl?: () => boolean;
  /** Open rifts (each strike hits its standing sentinel first, then the rift). */
  rifts?: () => OrderTarget[];
  /** Ground loot: the nearest drop to a point, and collecting it (credits it at once). */
  loot?: {
    nearest: (x: number, y: number, maxDist: number) => { id: string; x: number; y: number } | null;
    collect: (id: string, by: string) => boolean;
  };
} = { wild: {} };

/** Brawls may start only while the realm has no hostile battle underway. */
export const hasNonBrawlBattle = (waveActive: boolean): boolean =>
  waveActive ||
  !!battleTargets.kirovInvasion?.() ||
  Object.values(battleTargets.wild).some((targets) => targets().length > 0);
