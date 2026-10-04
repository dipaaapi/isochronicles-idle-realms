import type { UnitClass } from '../types/game';
import { ResourceBuildingId, ResourceBuildingsState, UnitRosterItem } from '../types/state';
import { BUILDING_IDS, BUILDING_SITES, CASTLE_GATE, SPIRE_WORK_SPOT } from './buildingLayout';
import { crewGeneralOf } from './establishmentCrews';

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
  FOUNDRY: 'Golem Foundry',
  PAVILION: 'Shadow Pavilion',
  VOIDGATE: 'Void Gate',
  OSSUARY: 'Bone Crypt',
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

/**
 * The Ancient Ent builds only the Citadel Castle and the Crystal Spire; each
 * establishment is raised by its own General (see nextChampionConstruction).
 */
export const nextEntConstruction = (state: {
  castleBuilt: boolean;
  spireBuilt?: boolean;
}) => {
  if (!state.castleBuilt) return { id: 'CASTLE' as const, x: CASTLE_GATE.x, y: CASTLE_GATE.y, label: 'Citadel Castle' };

  if (state.spireBuilt === false) {
    return { id: 'SPIRE' as const, x: SPIRE_WORK_SPOT.x, y: SPIRE_WORK_SPOT.y, label: 'Crystal Spire' };
  }

  return undefined;
};

const isGeneralUnit = (u: UnitRosterItem) => !u.parentBuildingId && !u.id.startsWith('tenant_');

/**
 * The next General the Ent must summon, in construction order: once castle and
 * spire stand, the Ent's first duty is to call every establishment's General
 * (who then builds that establishment), until all thirteen are present.
 * The Ent waits while a summoned General's establishment is still unbuilt: the
 * newest General must finish its home before the next one is called.
 */
export const nextGeneralToSummon = (state: {
  castleBuilt: boolean;
  spireBuilt?: boolean;
  roster: UnitRosterItem[];
  resourceBuildings?: ResourceBuildingsState;
}): { buildingId: ResourceBuildingId; unitClass: UnitClass } | undefined => {
  if (nextEntConstruction(state)) return undefined;
  for (const buildingId of BUILDING_IDS) {
    const unitClass = crewGeneralOf(buildingId);
    if (!unitClass) continue;
    if (!state.roster.some((u) => u.unitClass === unitClass && isGeneralUnit(u))) {
      return { buildingId, unitClass };
    }
    // Summoned but its establishment is not up yet: hold the next summon.
    if (state.resourceBuildings && (state.resourceBuildings[buildingId]?.level ?? 0) < 1) return undefined;
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

