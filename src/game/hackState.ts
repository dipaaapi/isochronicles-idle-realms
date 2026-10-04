import type { TowerId } from '../types/state';

/**
 * Establishments hacked by a human Technician this wave (session-only, never
 * saved): they turn hostile until the wave ends. Shared by InvasionManager
 * (hacks), TowerSystem (hostile fire), StructureManager (look) and targeting
 * (invaders leave them alone).
 */
const hacked = new Set<TowerId>();

export const isHacked = (id: string): boolean => hacked.has(id as TowerId);
export const setHacked = (id: TowerId): void => void hacked.add(id);
export const hackedIds = (): TowerId[] => [...hacked];
/** Wave over: every hacked establishment comes back. Returns the ones restored. */
export const clearHacks = (): TowerId[] => {
  const ids = [...hacked];
  hacked.clear();
  return ids;
};
