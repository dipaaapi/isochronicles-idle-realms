import { createJSONStorage, type PersistOptions } from 'zustand/middleware';
import { normalizeDifficulty } from '../difficulty';
import { beaconLevelOf } from '../defenseStats';
import { normalizeSkillProgress } from '../skillTree';
import { RESOURCE_KEYS } from '../resources';
import { localForageStorage } from '../storageAdapter';
import { getPhaseFromWave } from './defenseSlice';
import { normalizeResourceBuildings, normalizeSpireTower } from './buildingsSlice';
import {
  INITIAL_AUTO_BUY_BUILDING,
  INITIAL_AUTO_SETTINGS,
  INITIAL_DEFENSE,
  INITIAL_INVASION,
  INITIAL_UPGRADES,
  createInitialResourceNodes,
  applyRealmLayout,
  createSupportSlime,
  perBuilding,
} from './initialState';
import type { GameStoreState, ResourceBuildingId, Resources, UnitRosterItem } from '../../types/state';
import { INVADER_CONFIGS, UNIT_CLASSES } from '../../types/game';
import type { InvaderType, UnitClass } from '../../types/game';
import type { SliceArgs } from './types';

const SAVE_VERSION = '1.3.0';

/** Beast classes renamed by the 10 vs 10 codex (old save key → new key). */
const RENAMED_BEASTS: Record<string, UnitClass> = { WAYFARER: 'LAVA_GARGOYLE', CHRONO: 'SUCCUBUS' };

const migrateBeast = (id: string): string => RENAMED_BEASTS[id] ?? id;

/** Old saves: renamed beasts get their new class; unknown classes and mismatched tenants are dropped. */
const migrateRoster = (roster: UnitRosterItem[]): UnitRosterItem[] =>
  roster
    .map((unit) => ({ ...unit, unitClass: migrateBeast(unit.unitClass) as UnitClass }))
    .filter((unit) => unit.unitClass in UNIT_CLASSES)
    // Tenants must match their establishment's General (older saves put Hounds in the Mine, Liches in the Cave)
    .filter((unit) => !unit.parentBuildingId || UNIT_CLASSES[unit.unitClass].requiredBuilding === unit.parentBuildingId);

/** Codex discoveries limited to entries that still exist (the Deep One left the invaders). */
const migrateDiscovered = <K extends string>(list: unknown, known: Record<K, unknown>, fallback: K[]): K[] =>
  Array.isArray(list)
    ? Array.from(new Set(list.map((id) => migrateBeast(String(id))).filter((id): id is K => id in known)))
    : fallback;

/** Keeps exactly one permanent Support Slime (last in the roster), preserving its evolution. */
const withPermanentSlime = (rawRoster: UnitRosterItem[]): UnitRosterItem[] => {
  const roster = migrateRoster(rawRoster);
  const slime = roster.find((unit) => unit.unitClass === 'AQUA_SLIME');
  return [
    ...roster.filter((unit) => unit.unitClass !== 'AQUA_SLIME'),
    createSupportSlime(slime?.slimeEvolutionLevel),
  ];
};

/**
 * Switches to a saved realm's layout. Saves from before random layouts have no
 * seed and keep the one already rolled. Node positions follow the layout;
 * Ent enrichment levels are kept.
 */
const restoreLayout = (seed: unknown, nodes: GameStoreState['dynamicResourceNodes'], positions?: unknown) => {
  if (typeof seed !== 'number' || !Number.isFinite(seed) || seed <= 0) return {};
  const clean: GameStoreState['buildingPositions'] = {};
  if (positions && typeof positions === 'object') {
    for (const [id, pos] of Object.entries(positions as Record<string, { x?: unknown; y?: unknown }>)) {
      if (Number.isInteger(pos?.x) && Number.isInteger(pos?.y)) clean[id as ResourceBuildingId] = { x: pos.x as number, y: pos.y as number };
    }
  }
  return applyRealmLayout(seed, clean, nodes);
};


const normalizeEstablishmentSkillCooldowns = (raw?: unknown): GameStoreState['establishmentSkillCooldowns'] => {
  const base = {
    ...perBuilding(() => ({ skill1: 0, skill2: 0, skill3: 0 })),
    CASTLE: { skill1: 0, skill2: 0, skill3: 0 },
    SPIRE: { skill1: 0, skill2: 0, skill3: 0 },
  };
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Record<string, Record<string, unknown>>;
  for (const id of Object.keys(base) as (keyof typeof base)[]) {
    if (obj[id]) {
      base[id] = {
        skill1: Number(obj[id].skill1) || 0,
        skill2: Number(obj[id].skill2) || 0,
        skill3: Number(obj[id].skill3) || 0,
      };
    }
  }
  return base;
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
      skillRanks: state.skillRanks,
      regressionCount: state.regressionCount,
      regressionHistory: state.regressionHistory,
      layoutSeed: state.layoutSeed,
      buildingPositions: state.buildingPositions,
      munitions: state.munitions,
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
      spireBuilt: state.spireBuilt,
      spireTower: state.spireTower,
      resourceBuildings: state.resourceBuildings,
  establishmentSkillCooldowns: state.establishmentSkillCooldowns,
      autoBuyBuildingMaterials: state.autoBuyBuildingMaterials,
      autoBuySummon: state.autoBuySummon,
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
        // Saves from before the spire needed building keep it standing once the citadel is up
        munitions: { armorPiercing: 0, incendiary: 0, cryoFrost: 0, teslaChain: 0, voidFlak: 0, ...(data.munitions || {}) },
        spireBuilt: data.spireBuilt ?? (data.castleBuilt ?? false),
        spireTower: normalizeSpireTower(data.spireTower),
        resourceBuildings: normalizeResourceBuildings(data.resourceBuildings),
        roster,
        workerCount: roster.length,
        autoBuyBuildingMaterials: { ...INITIAL_AUTO_BUY_BUILDING, ...(data.autoBuyBuildingMaterials || {}) },
        autoBuySummon: data.autoBuySummon || {},
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
        discoveredBeasts: migrateDiscovered<UnitClass>(data.discoveredBeasts, UNIT_CLASSES, ['GOLEM', 'LAVA_GARGOYLE']),
        discoveredInvaders: migrateDiscovered<InvaderType>(data.discoveredInvaders, INVADER_CONFIGS, []),
        lastSavedTimestamp: Date.now(),
        screen: data.hasCompletedIntro ? 'GAME' : 'TITLE',
        ...restoreLayout(data.layoutSeed, get().dynamicResourceNodes, data.buildingPositions),
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
  skillRanks: state.skillRanks,
  difficulty: state.difficulty,
  hasCompletedIntro: state.hasCompletedIntro,
  realmName: state.realmName,
  resources: state.resources,
  workerCount: state.workerCount,
  roster: state.roster,
  upgrades: state.upgrades,
  castleBuilt: state.castleBuilt,
  spireBuilt: state.spireBuilt,
  spireTower: state.spireTower,
  resourceBuildings: state.resourceBuildings,
  autoBuyBuildingMaterials: state.autoBuyBuildingMaterials,
  autoBuySummon: state.autoBuySummon,
  showTileCoordinates: state.showTileCoordinates,
  isGoreEnabled: state.isGoreEnabled,
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
  buildingPositions: state.buildingPositions,
  munitions: state.munitions,
  lastSavedTimestamp: state.lastSavedTimestamp,
});

/** Upgrades older saves to the current shape when they are rehydrated. */
const merge = (persistedState: unknown, currentState: GameStoreState): GameStoreState => {
  // Saves from before the single-Ent redesign may still carry caretaker links
  const { entAssignments: _legacyCaretakers, ...persisted } =
    (persistedState ?? {}) as Partial<GameStoreState> & { entAssignments?: unknown };
  const roster = withPermanentSlime(persisted.roster ?? currentState.roster);

  return {
    ...currentState,
    ...persisted,
    ...normalizeSkillProgress(persisted),
    difficulty: normalizeDifficulty(persisted.difficulty),
    roster,
    workerCount: roster.length,
    discoveredBeasts: migrateDiscovered<UnitClass>(persisted.discoveredBeasts, UNIT_CLASSES, currentState.discoveredBeasts),
    discoveredInvaders: migrateDiscovered<InvaderType>(persisted.discoveredInvaders, INVADER_CONFIGS, currentState.discoveredInvaders),
    castleBuilt: persisted.castleBuilt ?? ((persisted.defense?.castleHp ?? 0) > 0),
    munitions: { armorPiercing: 0, incendiary: 0, cryoFrost: 0, teslaChain: 0, voidFlak: 0, ...(persisted.munitions ?? {}) },
    pendingBattleEffects: [],
    spireBuilt: persisted.spireBuilt ?? (persisted.castleBuilt ?? ((persisted.defense?.castleHp ?? 0) > 0)),
    spireTower: normalizeSpireTower(persisted.spireTower),
    resourceBuildings: normalizeResourceBuildings(persisted.resourceBuildings),
    establishmentSkillCooldowns: normalizeEstablishmentSkillCooldowns(persisted.establishmentSkillCooldowns),
    autoBuyBuildingMaterials: { ...INITIAL_AUTO_BUY_BUILDING, ...(persisted.autoBuyBuildingMaterials ?? {}) },
    autoBuySummon: persisted.autoBuySummon ?? {},
    defense: persisted.defense
      ? { ...INITIAL_DEFENSE, ...persisted.defense, beaconLevel: beaconLevelOf(persisted.defense) }
      : currentState.defense,
    showTileCoordinates: persisted.showTileCoordinates ?? true,
    layoutSeed: currentState.layoutSeed,
    ...restoreLayout(persisted.layoutSeed, currentState.dynamicResourceNodes, persisted.buildingPositions),
  };
};

export const persistOptions: PersistOptions<GameStoreState, PersistedState> = {
  name: 'isochronicle-realm-state',
  storage: createJSONStorage(() => localForageStorage),
  merge,
  partialize,
};
