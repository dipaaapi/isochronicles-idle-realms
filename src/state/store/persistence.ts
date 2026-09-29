import { createJSONStorage, type PersistOptions } from 'zustand/middleware';
import { normalizeDifficulty } from '../difficulty';
import { beaconLevelOf } from '../defenseStats';
import { normalizeSkillProgress } from '../skillTree';
import { RESOURCE_KEYS } from '../resources';
import { localForageStorage } from '../storageAdapter';
import { applyLayoutSeed } from '../buildingLayout';
import { getPhaseFromWave } from './defenseSlice';
import { normalizeResourceBuildings } from './buildingsSlice';
import {
  INITIAL_AUTO_BUY_BUILDING,
  INITIAL_AUTO_SETTINGS,
  INITIAL_DEFENSE,
  INITIAL_INVASION,
  INITIAL_UPGRADES,
  createInitialEntAssignments,
  createInitialResourceNodes,
  createSupportSlime,
} from './initialState';
import type { GameStoreState, ResourceBuildingId, Resources, UnitRosterItem } from '../../types/state';
import type { SliceArgs } from './types';

const SAVE_VERSION = '1.3.0';

/** Keeps exactly one permanent Support Slime (last in the roster), preserving its evolution. */
const withPermanentSlime = (roster: UnitRosterItem[]): UnitRosterItem[] => {
  const slime = roster.find((unit) => unit.unitClass === 'AQUA_SLIME');
  return [
    ...roster.filter((unit) => unit.unitClass !== 'AQUA_SLIME'),
    createSupportSlime(slime?.slimeEvolutionLevel),
  ];
};

/** Drops caretaker links to Ents that are no longer in the roster. */
const normalizeEntAssignments = (
  raw: Partial<Record<ResourceBuildingId, string | null>> | undefined,
  roster: UnitRosterItem[]
): Record<ResourceBuildingId, string | null> => {
  const result = createInitialEntAssignments();
  for (const id of Object.keys(result) as ResourceBuildingId[]) {
    const unitId = raw?.[id];
    if (unitId && roster.some((unit) => unit.id === unitId)) result[id] = unitId;
  }
  return result;
};

/**
 * Switches to a saved realm's layout. Saves from before random layouts have no
 * seed and keep the one already rolled. Node positions follow the layout;
 * Ent enrichment levels are kept.
 */
const restoreLayout = (seed: unknown, nodes: GameStoreState['dynamicResourceNodes']) => {
  if (typeof seed !== 'number' || !Number.isFinite(seed) || seed <= 0) return {};
  applyLayoutSeed(seed);
  const positions = createInitialResourceNodes();
  const dynamicResourceNodes = { ...positions };
  for (const k of Object.keys(positions) as (keyof typeof positions)[]) {
    dynamicResourceNodes[k] = { ...positions[k], qualityMultiplier: nodes?.[k]?.qualityMultiplier ?? 1.0 };
  }
  return { layoutSeed: seed, dynamicResourceNodes };
};

const toResources = (raw: Record<string, unknown>): Resources =>
  Object.fromEntries(RESOURCE_KEYS.map((key) => [key, Number(raw[key]) || 0])) as unknown as Resources;

/** JSON save file export / import from the Settings drawer. */
export const createPersistenceSlice = (...[set, get]: SliceArgs) => ({
  exportSave: (): string => {
    const state = get();
    const exportData = {
      version: SAVE_VERSION,
      difficulty: state.difficulty,
      skillPoints: state.skillPoints,
      unlockedSkills: state.unlockedSkills,
      regressionCount: state.regressionCount,
      regressionHistory: state.regressionHistory,
      layoutSeed: state.layoutSeed,
      platformPhase: state.platformPhase,
      year: state.year,
      season: state.season,
      exportedAt: new Date().toISOString(),
      realmName: state.realmName,
      language: state.language,
      hasCompletedIntro: state.hasCompletedIntro,
      resources: state.resources,
      workerCount: state.workerCount,
      roster: state.roster,
      upgrades: state.upgrades,
      castleBuilt: state.castleBuilt,
      resourceBuildings: state.resourceBuildings,
      entAssignments: state.entAssignments,
      autoBuyBuildingMaterials: state.autoBuyBuildingMaterials,
      defense: state.defense,
      invasion: state.invasion,
      achievements: state.achievements,
      inventory: state.inventory,
      autoSettings: state.autoSettings,
      timeOfDay: state.timeOfDay,
      day: state.day,
      ambientDarkness: state.ambientDarkness,
      isAudioMuted: state.isAudioMuted,
      isGoreEnabled: state.isGoreEnabled,
      discoveredBeasts: state.discoveredBeasts,
      discoveredInvaders: state.discoveredInvaders,
      promptedUpgrades: state.promptedUpgrades,
      targetFps: state.targetFps,
      lastSavedTimestamp: Date.now(),
    };
    return JSON.stringify(exportData, null, 2);
  },

  importSave: (jsonString: string): boolean => {
    try {
      const data = JSON.parse(jsonString);
      if (!data.resources) throw new Error('Invalid save payload');

      const roster = withPermanentSlime(Array.isArray(data.roster) ? data.roster : []);

      set({
        realmName: data.realmName || 'Aether Haven',
        difficulty: normalizeDifficulty(data.difficulty),
        ...normalizeSkillProgress(data),
        regressionHistory: Array.isArray(data.regressionHistory) ? data.regressionHistory : [],
        platformPhase: getPhaseFromWave(data.invasion?.waveNumber ?? 1),
        year: data.year || 1,
        season: data.season || 'SPRING',
        hasCompletedIntro: !!data.hasCompletedIntro,
        resources: toResources(data.resources),
        castleBuilt: data.castleBuilt ?? false,
        resourceBuildings: normalizeResourceBuildings(data.resourceBuildings),
        roster,
        workerCount: roster.length,
        entAssignments: normalizeEntAssignments(data.entAssignments, roster),
        autoBuyBuildingMaterials: { ...INITIAL_AUTO_BUY_BUILDING, ...(data.autoBuyBuildingMaterials || {}) },
        upgrades: { ...INITIAL_UPGRADES, ...(data.upgrades || {}) },
        language: data.language || 'EN',
        defense: {
          ...INITIAL_DEFENSE,
          ...(data.defense || {}),
          beaconLevel: beaconLevelOf(data.defense || {}),
        },
        invasion: { ...INITIAL_INVASION, ...(data.invasion || {}) },
        achievements: data.achievements || [],
        inventory: data.inventory || [],
        autoSettings: { ...INITIAL_AUTO_SETTINGS, ...(data.autoSettings || {}) },
        timeOfDay: data.timeOfDay || 'DAY',
        day: data.day || 1,
        ambientDarkness: data.ambientDarkness || 0,
        isAudioMuted: data.isAudioMuted || false,
        isGoreEnabled: data.isGoreEnabled || false,
        discoveredBeasts: data.discoveredBeasts || ['GOLEM', 'WAYFARER'],
        discoveredInvaders: data.discoveredInvaders || [],
        lastSavedTimestamp: Date.now(),
        screen: data.hasCompletedIntro ? 'GAME' : 'TITLE',
        ...restoreLayout(data.layoutSeed, get().dynamicResourceNodes),
      });
      return true;
    } catch (err) {
      console.error('[IsoChronicle] Import error:', err);
      return false;
    }
  },
}) satisfies Partial<GameStoreState>;

type PersistedState = ReturnType<typeof partialize>;

/** The subset of the store written to IndexedDB. */
const partialize = (state: GameStoreState) => ({
  skillPoints: state.skillPoints,
  unlockedSkills: state.unlockedSkills,
  difficulty: state.difficulty,
  hasCompletedIntro: state.hasCompletedIntro,
  realmName: state.realmName,
  resources: state.resources,
  workerCount: state.workerCount,
  roster: state.roster,
  upgrades: state.upgrades,
  castleBuilt: state.castleBuilt,
  resourceBuildings: state.resourceBuildings,
  entAssignments: state.entAssignments,
  autoBuyBuildingMaterials: state.autoBuyBuildingMaterials,
  showTileCoordinates: state.showTileCoordinates,
  defense: state.defense,
  invasion: state.invasion,
  achievements: state.achievements,
  inventory: state.inventory,
  autoSettings: state.autoSettings,
  discoveredBeasts: state.discoveredBeasts,
  discoveredInvaders: state.discoveredInvaders,
  day: state.day,
  year: state.year,
  season: state.season,
  platformPhase: state.platformPhase,
  regressionCount: state.regressionCount,
  regressionHistory: state.regressionHistory,
  layoutSeed: state.layoutSeed,
  lastSavedTimestamp: state.lastSavedTimestamp,
});

/** Upgrades older saves to the current shape when they are rehydrated. */
const merge = (persistedState: unknown, currentState: GameStoreState): GameStoreState => {
  const persisted = (persistedState ?? {}) as Partial<GameStoreState>;
  const roster = withPermanentSlime(persisted.roster ?? currentState.roster);

  return {
    ...currentState,
    ...persisted,
    ...normalizeSkillProgress(persisted),
    difficulty: normalizeDifficulty(persisted.difficulty),
    roster,
    workerCount: roster.length,
    castleBuilt: persisted.castleBuilt ?? ((persisted.defense?.castleHp ?? 0) > 0),
    resourceBuildings: normalizeResourceBuildings(persisted.resourceBuildings),
    entAssignments: normalizeEntAssignments(persisted.entAssignments, roster),
    autoBuyBuildingMaterials: { ...INITIAL_AUTO_BUY_BUILDING, ...(persisted.autoBuyBuildingMaterials ?? {}) },
    defense: persisted.defense
      ? { ...INITIAL_DEFENSE, ...persisted.defense, beaconLevel: beaconLevelOf(persisted.defense) }
      : currentState.defense,
    showTileCoordinates: persisted.showTileCoordinates ?? true,
    layoutSeed: currentState.layoutSeed,
    ...restoreLayout(persisted.layoutSeed, currentState.dynamicResourceNodes),
  };
};

export const persistOptions: PersistOptions<GameStoreState, PersistedState> = {
  name: 'isochronicle-realm-state',
  storage: createJSONStorage(() => localForageStorage),
  merge,
  partialize,
};
