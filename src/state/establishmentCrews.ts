import crewData from '../data/establishmentCrews.json';
import type { UnitClass } from '../types/game';
import type { ResourceBuildingId, Resources } from '../types/state';

/** Which tiles a tenant works: the ocean ring, open grass, roads, its own building, or around a rift. */
export type GatherSource = 'OCEAN' | 'GRASS' | 'PAVEMENT' | 'ESTABLISHMENT' | 'PORTAL';

export interface GatherJob {
  source: GatherSource;
  icon: string;
  yield: Partial<Resources>;
}

export interface ExpeditionJob {
  /** Tenants of this establishment that may be in the human realm at once. */
  slots: number;
  icon: string;
  yield: Partial<Resources>;
}

export interface EstablishmentCrew {
  general: UnitClass;
  gather: GatherJob[];
  expedition?: ExpeditionJob;
}

export const CREW_CONFIG = crewData as unknown as {
  spawnIntervalSeconds: number;
  gatherSeconds: number;
  searchRadius: number;
  expedition: {
    minSeconds: number;
    maxSeconds: number;
    chance: number;
    vengeancePerTrip: number;
    vengeancePerExtraInvader: number;
    maxExtraInvaders: number;
  };
  sources: Record<GatherSource | 'HUMAN_REALM', { icon: string; en: string; tl: string }>;
  crews: Record<ResourceBuildingId, EstablishmentCrew>;
};

export const ESTABLISHMENT_CREWS = CREW_CONFIG.crews;

/** The General (and tenant kind) of an establishment. */
export const crewGeneralOf = (buildingId: ResourceBuildingId): UnitClass | undefined => ESTABLISHMENT_CREWS[buildingId]?.general;

/** Extra invaders the next wave brings for the vengeance stirred up by portal expeditions. */
export const vengeanceExtraInvaders = (vengeance: number): number => {
  const { vengeancePerExtraInvader, maxExtraInvaders } = CREW_CONFIG.expedition;
  return Math.min(maxExtraInvaders, Math.floor(Math.max(0, vengeance) / vengeancePerExtraInvader));
};

/** "🌊 Ocean · 🏰 Human realm" — where an establishment's tenants gather, for the UI. */
export const crewSourceLabels = (buildingId: ResourceBuildingId, tagalog: boolean): string => {
  const crew = ESTABLISHMENT_CREWS[buildingId];
  if (!crew) return '';
  const sources: Array<GatherSource | 'HUMAN_REALM'> = [...new Set(crew.gather.map((g) => g.source))];
  if (crew.expedition) sources.push('HUMAN_REALM');
  return sources.map((s) => `${CREW_CONFIG.sources[s].icon} ${tagalog ? CREW_CONFIG.sources[s].tl : CREW_CONFIG.sources[s].en}`).join(' · ');
};
