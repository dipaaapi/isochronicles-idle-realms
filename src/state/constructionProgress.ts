import { ResourceBuildingId, ResourceBuildingsState } from '../types/state';
import { BUILDING_IDS, BUILDING_SITES, CASTLE_GATE, SPIRE_WORK_SPOT } from './buildingLayout';

const SITE_LABELS: Record<ResourceBuildingId, string> = {
  WOOD: 'Wood Grove',
  QUARRY: 'Stone Quarry',
  MINE: 'Metal Mine',
  PORT: 'Water Port',
  CAVE: 'Mystic Cave',
  TRENCH: 'Abyssal Trench',
  CRYPT: 'Crypt of Souls',
  PERCH: 'Brimstone Perch',
  KENNEL: 'Infernal Kennel',
};

/** Seconds of Ent work at a site before the structure is finished. */
export const CONSTRUCTION_SECONDS = 4;

/**
 * What the Ent is doing at the current construction site, for the site's
 * pre-construction animation: walking there, building (with progress 0–1),
 * or waiting for supplies.
 */
export interface ConstructionStatus {
  siteId: 'CASTLE' | 'SPIRE' | ResourceBuildingId;
  phase: 'arriving' | 'building' | 'waiting';
  progress: number;
}

/** Establishments that must stand before recruiting and invasions begin (the Mystic Cave is a later bonus). */
export const CORE_BUILDINGS: ResourceBuildingId[] = ['WOOD', 'QUARRY', 'MINE', 'PORT'];

/** Ancient Ent builds Citadel Castle, Spire, and all Realm Establishments in sequence */
export const nextEntConstruction = (state: {
  castleBuilt: boolean;
  spireBuilt?: boolean;
  resourceBuildings?: ResourceBuildingsState;
}) => {
  if (!state.castleBuilt) return { id: 'CASTLE' as const, x: CASTLE_GATE.x, y: CASTLE_GATE.y, label: 'Citadel Castle' };

  if (state.spireBuilt === false) {
    return { id: 'SPIRE' as const, x: SPIRE_WORK_SPOT.x, y: SPIRE_WORK_SPOT.y, label: 'Crystal Spire' };
  }

  if (state.resourceBuildings) {
    for (const id of BUILDING_IDS) {
      if ((state.resourceBuildings[id]?.level ?? 0) < 1) {
        const spot = BUILDING_SITES[id]?.workSpot;
        if (spot) {
          return { id, x: spot.x, y: spot.y, label: SITE_LABELS[id] || id };
        }
      }
    }
  }

  return undefined;
};

export const nextConstruction = nextEntConstruction;

export const nextMinionSpireConstruction = (state: { castleBuilt: boolean; spireBuilt?: boolean }) => {
  if (state.castleBuilt && state.spireBuilt === false) {
    return { id: 'SPIRE' as const, x: SPIRE_WORK_SPOT.x, y: SPIRE_WORK_SPOT.y, label: 'Crystal Spire' };
  }
  return undefined;
};

export const nextChampionConstruction = (
  buildingId: ResourceBuildingId | undefined,
  state: { resourceBuildings: ResourceBuildingsState }
) => {
  if (!buildingId) return undefined;
  if ((state.resourceBuildings[buildingId]?.level ?? 0) >= 1) return undefined;
  const spot = BUILDING_SITES[buildingId]?.workSpot;
  if (!spot) return undefined;
  return { id: buildingId, x: spot.x, y: spot.y, label: SITE_LABELS[buildingId] || buildingId };
};

export const isConstructionReady = (state: {
  castleBuilt: boolean;
  spireBuilt?: boolean;
  resourceBuildings?: ResourceBuildingsState;
}): boolean => state.castleBuilt;

