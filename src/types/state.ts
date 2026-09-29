import { UnitClass, InvaderType, HarvestTask, WorkerEquipment, EquipmentItem, EquipmentSlot, GodBlessingId } from './game';

export interface Resources {
  aetherShards: number;
  wood: number;
  stone: number;
  arcaneEssence: number;
  fish: number;
  water: number;
  metal?: number;
  charcoal?: number;
  coal?: number;
  minerals?: number;
  coins: number;
}

export type ResourceBuildingId = 'WOOD' | 'MINE' | 'QUARRY' | 'PORT' | 'CAVE';

export interface ResourceBuildingState {
  level: number;
  unlockedOutputs: string[];
  /** Defense tower level (1–5) once built. */
  towerLevel?: number;
  /** Current structure HP; 0 = wrecked (no production or attacks until repaired). */
  hp?: number;
}

export type ResourceBuildingsState = Record<ResourceBuildingId, ResourceBuildingState>;

export interface OfflineGainsData {
  elapsedSeconds: number;
  aetherShardsEarned: number;
  woodEarned: number;
  stoneEarned: number;
}

export interface UpgradesState {
  nexusLevel: number;
  refineryLevel: number;
  quarryLevel: number;
  golemSpeedLevel: number;
  golemCapacityLevel: number;
}

export interface CastleDefenseState {
  castleHp: number;
  castleMaxHp: number;
  shieldHp: number;
  shieldMaxHp: number;
  wallLevel: number;
  /** Provoke Beacon level (replaced the old castle turret). */
  beaconLevel: number;
  shieldLevel: number;
}

export interface InvasionState {
  isActive: boolean;
  countdown: number; // Seconds until next incursion
  maxCountdown: number; // Used for progress bar
  waveNumber: number;
  enemiesRemaining: number;
  totalEnemiesInWave: number;
  invasionsRepelled: number;
  invaderKills: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlockedAt: number;
}

export interface AutoSettings {
  autoDispatch: boolean;
  autoRest: boolean;
  autoDefend: boolean;
  autoSell: boolean;
  autoTap: boolean;
  autoEvolve: boolean;
}

export type ScreenState = 'TITLE' | 'STORY' | 'GAME';
export type Language = 'EN' | 'TL';

export type TimeOfDayPhase = 'DAWN' | 'DAY' | 'DUSK' | 'NIGHT';
export type WeatherType = 'CLEAR' | 'RAIN' | 'SNOW' | 'HEATWAVE';
export type Season = 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER';
export type PlatformPhase = 1 | 2 | 3 | 4;

export interface PlatformConfig {
  phase: PlatformPhase;
  name: string;
  nameEn: string;
  tagline: string;
  taglineEn: string;
  description: string;
  descriptionEn: string;
  waveRange: string;
  accentColor: string;
  ambientTone: string;
}

export interface RegressionRecord {
  id: string;
  regressionIndex: number;
  waveReached: number;
  phaseReached: PlatformPhase;
  dayReached: number;
  yearReached: number;
  seasonReached: Season;
  invasionsRepelled: number;
  timestamp: number;
  completedWave100: boolean;
}

export interface UnitRosterItem {
  id: string;
  name: string;
  unitClass: UnitClass;
  assignedTask: HarvestTask;
  hp?: number;
  maxHp?: number;
  slimeEvolutionLevel?: number;
  treantEvolutionLevel?: number;
  equipment?: WorkerEquipment;
}

export interface GameStoreState {
  skillPoints: number;
  unlockedSkills: import('../state/skillTree').SkillId[];
  unlockSkill: (id: import('../state/skillTree').SkillId) => boolean;
  difficulty: import('../state/difficulty').Difficulty;
  // Navigation
  screen: ScreenState;
  hasCompletedIntro: boolean;
  realmName: string;
  language: Language;

  // Economy & Resources
  resources: Resources;
  workerCount: number;
  roster: UnitRosterItem[];
  upgrades: UpgradesState;
  castleBuilt: boolean;
  resourceBuildings: ResourceBuildingsState;

  // Castle Defenses & Invasions
  defense: CastleDefenseState;
  invasion: InvasionState;
  achievements: Achievement[];
  isCastleBreachedModalOpen: boolean;
  lootedResources: Partial<Resources> | null;
  merchantRestockTimer: number;

  // Equipment & Inventory
  inventory: EquipmentItem[];
  autoSettings: AutoSettings;

  // Audio & Environment & Seasons
  timeOfDay: TimeOfDayPhase;
  weather: WeatherType;
  day: number; // 1 to 365
  year: number; // 1, 2, 3...
  season: Season;
  dayProgress: number;
  ambientDarkness: number; // 0.0 (high noon) to 1.0 (midnight)
  isAudioMuted: boolean;
  isGoreEnabled: boolean;

  // Platform & Regression Progression
  /** Seed for this realm's random establishment placement (src/state/buildingLayout.ts). */
  layoutSeed: number;
  platformPhase: PlatformPhase; // 1: Demon Citadel, 2: Magma Caldera, 3: Frost Spire, 4: Astral Sanctum
  regressionCount: number;
  regressionHistory: RegressionRecord[];
  isRegressionModalOpen: boolean;
  isWave100VictoryCelebration: boolean;

  // Auto-Enhance Prompts
  promptedUpgrades: Record<string, number>;

  // Graphics & Performance
  targetFps: 30 | 60 | 90;
  showFpsDebug: boolean;
  showTileCoordinates: boolean;
  measuredFps: number;

  // Game Speed (0=paused, 1=normal, 2=fast-forward)
  gameSpeed: 0 | 1 | 2;

  // Offline & Timestamps
  lastSavedTimestamp: number;
  offlineGains: OfflineGainsData | null;
  isOfflineModalOpen: boolean;

  // Silhouette Discovery System (Bestiary)
  discoveredBeasts: UnitClass[];
  discoveredInvaders: InvaderType[];

  // Actions
  setScreen: (screen: ScreenState) => void;
  setLanguage: (lang: Language) => void;
  completeIntro: () => void;
  discoverEntry: (category: 'beast' | 'invader', id: string) => void;
  addResources: (delta: Partial<Resources>) => void;
  spendResources: (cost: Partial<Resources>) => boolean;
  summonWorker: () => boolean;
  summonUnit: (unitClass: UnitClass, initialTask?: HarvestTask, isFreeCost?: boolean) => boolean;
  assignUnitTask: (unitId: string, task: HarvestTask) => void;
  removeUnit: (unitId: string, refundResources?: boolean) => void;
  upgradeSupportSlime: () => boolean;
  upgradeTech: (techKey: keyof UpgradesState) => boolean;
  setTimeOfDay: (phase: TimeOfDayPhase, darkness?: number) => void;
  setWeather: (weather: WeatherType) => void;
  setDayProgress: (progress: number) => void;
  incrementDay: () => void;
  toggleAudioMute: () => boolean;
  toggleGore: () => boolean;
  closeOfflineModal: () => void;
  setPromptedUpgrade: (key: string, level: number) => void;
  setTargetFps: (fps: 30 | 60 | 90) => void;
  checkOfflineProgress: () => void;
  exportSave: () => string;
  importSave: (jsonString: string) => boolean;
  resetRealm: () => void;

  // Merchant Store Actions
  sellResource: (resourceKey: keyof Omit<Resources, 'coins'>, amount: number) => boolean;
  buyResource: (resourceKey: keyof Omit<Resources, 'coins'>, amount: number) => boolean;
  tickMerchantTimer: (deltaSeconds: number) => void;

  // Castle Defense Actions
  upgradeDefense: (defenseKey: 'wallLevel' | 'beaconLevel' | 'shieldLevel') => boolean;
  repairCastle: () => boolean;
  damageCastle: (amount: number) => void;
  upgradeTower: (buildingId: ResourceBuildingId) => boolean;
  repairBuilding: (buildingId: ResourceBuildingId) => boolean;
  /** Invader damage to an establishment; returns true when this hit wrecked it. */
  damageBuilding: (buildingId: ResourceBuildingId, amount: number) => boolean;
  /** Free HP restore (Ent repairs); returns the HP actually restored. */
  restoreBuildingHp: (buildingId: ResourceBuildingId, amount: number) => number;

  // Invasion Actions
  tickInvasionCountdown: (deltaSeconds: number) => void;
  startInvasion: () => void;
  setEnemiesRemaining: (count: number) => void;
  resolveInvasionVictory: (bountyCoins: number) => void;
  resolveCastleBreach: () => void;
  closeCastleBreachedModal: () => void;
  unlockAchievement: (id: string, title: string, description: string, icon: string) => void;

  // Equipment & Crafting Actions
  craftEquipment: (item: EquipmentItem) => boolean;
  purchaseEquipment: (item: EquipmentItem) => boolean;
  equipItem: (unitId: string, item: EquipmentItem) => void;
  unequipItem: (unitId: string, slot: EquipmentSlot) => void;

  // Automation Actions
  toggleAutoSetting: (key: keyof AutoSettings) => void;

  // Dynamic Platform Resource Nodes (Replenished & Enhanced by Treant)
  dynamicResourceNodes: Record<'AETHER' | 'STONE' | 'WOOD' | 'ESSENCE', { x: number; y: number; qualityMultiplier?: number }>;
  replenishResourceNode: (task: 'AETHER' | 'STONE' | 'WOOD' | 'ESSENCE', newPoint: { x: number; y: number; qualityMultiplier?: number }) => void;

  // God Tier Power-ups & Treant Evolution
  activeGodBlessings: Record<GodBlessingId, number>; // Maps blessing ID to remaining duration in seconds
  activateGodBlessing: (blessingId: GodBlessingId) => boolean;
  tickGodBlessings: (deltaSeconds: number) => void;
  upgradeTreant: () => boolean;
  buildCastle: () => boolean;
  upgradeResourceBuilding: (buildingId: ResourceBuildingId) => boolean;

  // FPS & Performance Settings Actions
  setMeasuredFps: (fps: number) => void;
  toggleFpsDebug: () => void;
  toggleTileCoordinates: () => void;

  // Game Speed
  setGameSpeed: (speed: 0 | 1 | 2) => void;

  // Random loot from scouts
  grantRandomLoot: () => void;

  // Regression Actions
  openRegressionModal: () => void;
  closeRegressionModal: () => void;
  performRegression: () => void;
  resetRegressionProgress: (confirmation: string) => boolean;
  dismissWave100Celebration: () => void;

  // ── Establishments ─────────────────────────────────────────────────────────
  /** Skill cooldowns in seconds for each establishment's 2 skills. */
  establishmentSkillCooldowns: Record<ResourceBuildingId, { skill1: number; skill2: number }>;

  /** The establishment currently open in the modal, or null if closed. */
  selectedEstablishmentId: 'CASTLE' | ResourceBuildingId | null;

  /** Auto-buy toggle per building — whether to auto-purchase missing upgrade materials. */
  autoBuyBuildingMaterials: Record<ResourceBuildingId, boolean>;

  // Establishment Actions
  /** Tick skill cooldowns down by delta seconds. */
  tickEstablishmentSkills: (deltaSeconds: number) => void;
  /** Trigger a skill (index 0 or 1) on a building. Returns true if activated. */
  triggerEstablishmentSkill: (buildingId: ResourceBuildingId, skillIndex: 0 | 1) => boolean;
  /** Relocate a building to a new random position. Castle cannot be relocated. */
  relocateBuilding: (buildingId: ResourceBuildingId) => boolean;

  // Establishment Modal Actions
  openEstablishmentModal: (id: 'CASTLE' | ResourceBuildingId) => void;
  closeEstablishmentModal: () => void;
  toggleBuildingAutoBuy: (buildingId: ResourceBuildingId) => void;
  autoBuyMaterialsForUpgrade: (buildingId: ResourceBuildingId) => void;
}

