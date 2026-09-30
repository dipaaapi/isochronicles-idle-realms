import { NODE_SPOTS, applyLayoutSeed, newLayoutSeed, type BuildingPositions } from '../buildingLayout';
import { ECONOMY_CONFIG } from '../economy';
import type { Difficulty } from '../difficulty';
import type { SkillRanks } from '../skillTree';
import type {
  AutoSettings,
  CastleDefenseState,
  GameSpeed,
  GameStoreState,
  InvasionState,
  ResourceBuildingId,
  ResourceBuildingsState,
  Resources,
  SpireTowerState,
  UnitRosterItem,
  UpgradesState,
} from '../../types/state';
import { buildingMaxHp } from '../defenseStats';
import type { GodBlessingId, InvaderType, UnitClass } from '../../types/game';

export const INITIAL_RESOURCES: Resources = {
  aetherShards: 50,
  wood: 65,
  stone: 60,
  arcaneEssence: 0,
  fish: 0,
  water: 0,
  metal: 0,
  charcoal: 0,
  coal: 0,
  minerals: 0,
  obsidianShard: 0,
  soulFragments: 0,
  abyssalPearl: 0,
  scrapMetal: 0,
  coins: 100,
};

/** Builds a per-establishment record with the same starting value. */
const perBuilding = <T>(value: () => T): Record<ResourceBuildingId, T> => ({
  WOOD: value(),
  MINE: value(),
  QUARRY: value(),
  PORT: value(),
  TRENCH: value(),
  CRYPT: value(),
  PERCH: value(),
  KENNEL: value(),
  CAVE: value(),
});

export const INITIAL_RESOURCE_BUILDINGS: ResourceBuildingsState = perBuilding(() => ({ level: 0, unlockedOutputs: [] }));

/** The spire's tower starts at level 1 and full health once raised. */
export const INITIAL_SPIRE_TOWER: SpireTowerState = { towerLevel: 1, hp: buildingMaxHp(1) };

export const INITIAL_DEFENSE: CastleDefenseState = {
  castleHp: 0,
  castleMaxHp: 500,
  shieldHp: 200,
  shieldMaxHp: 200,
  wallLevel: 1,
  beaconLevel: 1,
  shieldLevel: 1,
};

export const INITIAL_INVASION: InvasionState = {
  isActive: false,
  countdown: ECONOMY_CONFIG.invasion.countdownSeconds, // 2.5 minutes countdown
  maxCountdown: ECONOMY_CONFIG.invasion.countdownSeconds,
  waveNumber: 1,
  enemiesRemaining: 0,
  totalEnemiesInWave: 0,
  invasionsRepelled: 0,
  invaderKills: 0,
};

export const INITIAL_AUTO_SETTINGS: AutoSettings = {
  autoDispatch: true,
  autoRest: true,
  autoDefend: true,
  autoSell: false,
  autoTap: true,
  autoEvolve: true,
};

export const INITIAL_UPGRADES: UpgradesState = {
  nexusLevel: 1,
  refineryLevel: 1,
  quarryLevel: 1,
  golemSpeedLevel: 1,
  golemCapacityLevel: 1,
};

export const SUPPORT_SLIME_ID = 'unit_slime_support_1';

/** The permanent Support Slime; its evolution level survives breaches and regressions. */
export const createSupportSlime = (slimeEvolutionLevel = 1): UnitRosterItem => ({
  id: SUPPORT_SLIME_ID,
  name: 'Support Healing Slime',
  unitClass: 'AQUA_SLIME',
  assignedTask: 'HEAL',
  hp: 9999,
  maxHp: 9999,
  slimeEvolutionLevel,
  equipment: {},
});

// Harvest spots beside the Crystal Spire, Quarry, Grove and Mystic Cave (src/data/buildingLayout.json)
export const createInitialResourceNodes = (): GameStoreState['dynamicResourceNodes'] => ({
  AETHER: { ...NODE_SPOTS.AETHER, qualityMultiplier: 1.0 },
  STONE: { ...NODE_SPOTS.STONE, qualityMultiplier: 1.0 },
  WOOD: { ...NODE_SPOTS.WOOD, qualityMultiplier: 1.0 },
  ESSENCE: { ...NODE_SPOTS.ESSENCE, qualityMultiplier: 1.0 },
});

export const createInitialBlessings = (): Record<GodBlessingId, number> => ({
  CELESTIAL_HARVEST: 0,
  AEGIS_WRATH: 0,
  TITAN_AWAKENING: 0,
});

export const INITIAL_AUTO_BUY_BUILDING: Record<ResourceBuildingId, boolean> = perBuilding(() => false);

/** Session-only world clock / weather values shared by new games and regressions. */
export const createInitialWorldClock = () => ({
  day: 1,
  year: 1,
  season: 'SPRING' as const,
  dayProgress: 0,
  timeOfDay: 'DAY' as const,
  weather: 'CLEAR' as const,
  ambientDarkness: 0,
  gameSpeed: 1 as GameSpeed,
});

/** Rolls and applies a fresh random establishment layout; returns its seed. */
/**
 * Applies a layout (seed + relocated establishments) and moves the resource
 * nodes to the new work spots, keeping each node's Ent enrichment level.
 */
export const applyRealmLayout = (
  seed: number,
  positions: BuildingPositions,
  nodes: GameStoreState['dynamicResourceNodes']
) => {
  applyLayoutSeed(seed, positions);
  const fresh = createInitialResourceNodes();
  const dynamicResourceNodes = { ...fresh };
  for (const k of Object.keys(fresh) as (keyof typeof fresh)[]) {
    dynamicResourceNodes[k] = { ...fresh[k], qualityMultiplier: nodes?.[k]?.qualityMultiplier ?? 1.0 };
  }
  return { layoutSeed: seed, buildingPositions: positions, dynamicResourceNodes };
};

export const rollLayout = (): number => {
  const seed = newLayoutSeed();
  applyLayoutSeed(seed);
  return seed;
};

/**
 * Every progression field of a brand-new realm (no player preferences, no actions).
 * Used for the store's initial state and by resetRealm, so the two can never drift.
 * Rolls a new random layout first, so resource nodes sit at the new work spots.
 */
export const createInitialProgress = () => {
  const layoutSeed = rollLayout();
  const roster = [createSupportSlime()];
  return {
    screen: 'TITLE' as const,
    difficulty: 'NORMAL' as Difficulty,
    skillPoints: 0,
    skillRanks: {} as SkillRanks,
    hasCompletedIntro: false,
    realmName: 'Kuta ng Kadiliman (Demon Realm)',
    resources: { ...INITIAL_RESOURCES },
    workerCount: roster.length,
    roster,
    upgrades: { ...INITIAL_UPGRADES },
    castleBuilt: false,
    spireBuilt: false,
    spireTower: { ...INITIAL_SPIRE_TOWER },
    resourceBuildings: { ...INITIAL_RESOURCE_BUILDINGS },
    defense: { ...INITIAL_DEFENSE },
    invasion: { ...INITIAL_INVASION },
    inventory: [],
    autoSettings: { ...INITIAL_AUTO_SETTINGS },
    achievements: [],
    isCastleBreachedModalOpen: false,
    lootedResources: null,
    merchantRestockTimer: ECONOMY_CONFIG.merchantRestockSeconds,
    ...createInitialWorldClock(),
    offlineGains: null,
    isOfflineModalOpen: false,

    // Platform & Regression Progression
    layoutSeed,
    buildingPositions: {} as BuildingPositions,
    munitions: { armorPiercing: 0, incendiary: 0 },
    pendingSkillCasts: [] as string[],
    citadelSkillCooldowns: { overdrive: 0, overcharge: 0 },
    pendingBattleEffects: [] as Array<'LAVA_BOMB' | 'DEATH_CURSE'>,
    platformPhase: 1 as const,
    regressionCount: 0,
    regressionHistory: [],
    isRegressionModalOpen: false,
    isWave100VictoryCelebration: false,

    // Silhouette Discovery: Starting beasts are pre-discovered
    discoveredBeasts: ['GOLEM', 'LAVA_GARGOYLE'] as UnitClass[],
    discoveredInvaders: [] as InvaderType[],
    promptedUpgrades: {},
    dynamicResourceNodes: createInitialResourceNodes(),
    activeGodBlessings: createInitialBlessings(),

    // Establishments
    establishmentSkillCooldowns: perBuilding(() => ({ skill1: 0, skill2: 0 })),
    selectedEstablishmentId: null,
    autoBuyBuildingMaterials: { ...INITIAL_AUTO_BUY_BUILDING },
    autoBuySummon: {},
  } satisfies Partial<GameStoreState>;
};
