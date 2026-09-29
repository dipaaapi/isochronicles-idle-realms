import { ResourceBuildingId, ResourceBuildingsState } from '../types/state';
import { BUILDING_IDS, BUILDING_SITES, CASTLE_GATE } from './buildingLayout';

const SITE_LABELS: Record<ResourceBuildingId, string> = {
  WOOD: 'Wood Grove',
  QUARRY: 'Stone Quarry',
  MINE: 'Metal Mine',
  PORT: 'Water Port',
  CAVE: 'Mystic Cave',
};

/** Establishments that must stand before recruiting and invasions begin (the Mystic Cave is a later bonus). */
export const CORE_BUILDINGS: ResourceBuildingId[] = ['WOOD', 'QUARRY', 'MINE', 'PORT'];

/**
 * The Ent's next construction job: the citadel first, then each establishment
 * in layout order. x/y is the walkable tile the Ent works from.
 */
export const nextConstruction = (state: { castleBuilt: boolean; resourceBuildings: ResourceBuildingsState }) => {
  if (!state.castleBuilt) return { id: 'CASTLE' as const, x: CASTLE_GATE.x, y: CASTLE_GATE.y, label: 'Castle' };
  const id = BUILDING_IDS.find((b) => (state.resourceBuildings[b]?.level ?? 0) < 1);
  if (!id) return undefined;
  const spot = BUILDING_SITES[id].workSpot;
  return { id, x: spot.x, y: spot.y, label: SITE_LABELS[id] };
};

export const isConstructionReady = (state: {
  castleBuilt: boolean;
  resourceBuildings: ResourceBuildingsState;
}): boolean => state.castleBuilt &&
  CORE_BUILDINGS.every((id) => (state.resourceBuildings[id]?.level ?? 0) >= 1);
