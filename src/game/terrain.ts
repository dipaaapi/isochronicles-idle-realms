import layout from '../data/buildingLayout.json';
import { INVADER_CONFIGS, type UnitClass } from '../types/game';
import type { MoveMode } from './Navigation';

/**
 * Who may go where (buildingLayout.json `terrain`): water-type units stay on
 * the ocean and canals, flyers and amphibians go anywhere, everyone else walks
 * on land and crosses water only on bridges.
 */
const WATER = new Set<string>(layout.terrain.water);
const ANY = new Set<string>(layout.terrain.any);

export const minionMoveMode = (unitClass: UnitClass | string): MoveMode =>
  WATER.has(unitClass) ? 'water' : ANY.has(unitClass) ? 'any' : 'land';

export const invaderMoveMode = (type: keyof typeof INVADER_CONFIGS): MoveMode =>
  INVADER_CONFIGS[type]?.flying ? 'any' : 'land';
