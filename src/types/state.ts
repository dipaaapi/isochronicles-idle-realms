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
  /** 🌋 From the Brimstone Perch / Lava Gargoyles: incendiary ammo and Lava Bombs. */
  obsidianShard?: number;
  /** 💀 From invaders slain while a Necromancer or the Crypt of Souls stands: Death Curse, revivals. */
  soulFragments?: number;
  /** 🔮 From the Abyssal Trench: Tidal Amulets and Kinetic Barrier restores. */
  abyssalPearl?: number;
  /** ⚙️ Dropped by defeated Mecha: sold for coins or researched into Armor-Piercing ammo. */
  scrapMetal?: number;
  coins: number;
}

export type BattleItemId = 'MINION_FRENZY' | 'FORCE_FIELD' | 'MASS_REGEN' | 'SHIELD_OVERLOAD' | 'CHRONO_SURGE';
export type BattleEffect = 'MINION_FRENZY' | 'FORCE_FIELD' | 'MASS_REGEN' | 'SHIELD_OVERLOAD' | 'CHRONO_SURGE';

export type ResourceBuildingId =
  | 'WOOD' | 'MINE' | 'QUARRY' | 'PORT' | 'CAVE'
  // Landmarks: homes of the new beasts
  | 'TRENCH' | 'CRYPT' | 'PERCH' | 'KENNEL'
  // Codex landmarks: Golem Foundry, Shadow Pavilion, Void Gate, Bone Crypt
  | 'FOUNDRY' | 'PAVILION' | 'VOIDGATE' | 'OSSUARY';

export interface ResourceBuildingState {
  level: number;
  unlockedOutputs: string[];
  /** Defense tower level (1–5) once built. */
  towerLevel?: number;
  /** Current structure HP; 0 = wrecked (no production or attacks until repaired). */
  hp?: number;
}

export type ResourceBuildingsState = Record<ResourceBuildingId, ResourceBuildingState>;

/** Anything with a defense tower: the five establishments plus the Crystal Spire. */
export type TowerId = ResourceBuildingId | 'SPIRE';

/** The Crystal Spire's defense tower (it has no production levels). */
export interface SpireTowerState {
  /** Defense tower level (1–5). */
  towerLevel: number;
  /** Current structure HP; 0 = wrecked (no aether and no attacks until repaired). */
  hp: number;
}

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

  // ── 5 CATEGORY RESEARCH MATRIX (3 COLUMNS EACH) ──
  // 1. SLIME
  slimeAttackHeal: number;
  slimeDefenseAbsorb: number;
  slimeCooldownBurst: number;

  // 2. ENT (TREANT)
  entAttackConstruct: number;
  entDefenseHpBar: number;
  entCooldownSurvival: number;

  // 3. CASTLE (CITADEL)
  castleAttackTurret: number;
  castleDefenseArmor: number;
  castleCooldownUltimate: number;

  // 4. ESTABLISHMENTS
  establishmentAttackWork: number;
  establishmentDefenseBar: number;
  establishmentCooldownSkill: number;

  // 5. TENANTS
  tenantAttackCounter: number;
  tenantDefenseBar: number;
  tenantCooldownSummon: number;
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
  forceFieldTimer: number;
  minionFrenzyTimer: number;
  massRegenTimer: number;
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
  /** Raids into the human realm (portal expeditions) since the last wave; each few adds an invader. */
  vengeance?: number;
  /** Extra invaders the current/last wave brought for that vengeance. */
  vengeanceExtra?: number;
  /** Formation of the current/last wave (id in src/data/waveTactics.json). */
  tactic?: string;
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
  autoBuy: boolean;
  autoUpgrade: boolean;
  autoTap: boolean;
  autoEvolve: boolean;
  autoSurvivalSkills?: boolean;
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
  parentBuildingId?: ResourceBuildingId;
  hp?: number;
  maxHp?: number;
  slimeEvolutionLevel?: number;
  treantEvolutionLevel?: number;
  equipment?: WorkerEquipment;
}

/** 0 = paused, 1 = normal, 2 = 2×, 3 = 3×. */
export type GameSpeed = 0 | 1 | 2 | 3;

export interface GameStoreState {
  /** Unspent points: earned by clearing wave sets in this realm, minus ranks bought. */
  skillPoints: number;
  skillRanks: import('../state/skillTree').SkillRanks;
  /** Adds one rank to a skill. */
  learnSkill: (id: import('../state/skillTree').SkillId) => boolean;
  /** Refunds every rank for free. */
  resetSkills: () => void;
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
  /** The Crystal Spire is raised by the Treant right after the citadel. */
  spireBuilt: boolean;
  spireTower: SpireTowerState;
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
  /** Tomorrow's weather, rolled a day ahead so the HUD can forecast it. */
  weatherForecast?: WeatherType;
  randomWeatherEnabled: boolean;
  day: number; // 1 to 365
  year: number; // 1, 2, 3...
  season: Season;
  dayProgress: number;
  ambientDarkness: number; // 0.0 (high noon) to 1.0 (midnight)
  isAudioMuted: boolean;
  isGoreEnabled: boolean;
  /** Saved YouTube / Spotify links for the in-game music player (kept across regression, saved with the realm). */
  musicLibrary: import('../state/externalMusic').MusicEntry[];
  /** Which library entry the player is on. */
  musicIndex: number;
  /** Start playing when an entry loads, and move on to the next saved entry when one ends. */
  musicAutoPlay: boolean;
  /** Repeat: the list wraps around (auto-play on) or the current entry replays (auto-play off). */
  musicLoop: boolean;

  // Platform & Regression Progression
  /** Seed for this realm's random establishment placement (src/state/buildingLayout.ts). */
  layoutSeed: number;
  /** Player-relocated establishments (top-left tile), layered over the seeded layout. */
  buildingPositions: Partial<Record<ResourceBuildingId | 'SPIRE', { x: number; y: number }>>;
  /** Tower ammunition research (levels 0–5): AP kinetic, incendiary napalm, cryo-frost shards, tesla chain, void flak. */
  munitions: {
    armorPiercing: number;
    incendiary: number;
    cryoFrost: number;
    teslaChain: number;
    voidFlak: number;
  };
  /** Battle items fired from the Armory; the scene plays them on its next frame. */
  pendingBattleEffects: BattleEffect[];
  /** Crafts and fires a single-use battle item; false when unaffordable or unusable now. */
  useBattleItem: (item: BattleItemId) => boolean;
  researchMunition: (kind: 'armorPiercing' | 'incendiary' | 'cryoFrost' | 'teslaChain' | 'voidFlak') => boolean;
  /** Removes and returns the queued battle effects (scene side). */
  takeBattleEffects: () => BattleEffect[];
  /** Establishment / citadel skill ids waiting for the scene to play them. */
  pendingSkillCasts: string[];
  takeSkillCasts: () => string[];
  /** Seconds until the citadel's Abyssal Overdrive and the Spire's Arcane Overcharge are ready. */
  citadelSkillCooldowns: { overdrive: number; overcharge: number; resonance: number };
  castAbyssalOverdrive: () => boolean;
  castArcaneOvercharge: () => boolean;
  castCrystalResonance: () => boolean;
  /** Passive landmark yields (Abyssal Trench, Brimstone Perch, Infernal Kennel). */
  tickLandmarks: (deltaSeconds: number) => void;
  /** Fractional landmark yields waiting to become whole resources. */
  landmarkCarry?: Record<string, number>;
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
  gameSpeed: GameSpeed;

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
  /** Parses and appends a link without switching what plays (already saved counts as success); false when the link is not a valid YouTube / Spotify link. */
  addMusicLink: (link: string, name?: string) => boolean;
  removeMusicLink: (index: number) => void;
  /** Appends entries read from a playlist file (deduped, capped); returns how many were new. */
  importMusicLibrary: (entries: readonly { link: string; name: string }[]) => number;
  setMusicAutoPlay: (on: boolean) => void;
  setMusicLoop: (on: boolean) => void;
  /** Switches the player to a library entry (wraps around, so ±1 works as next / previous). */
  selectMusic: (index: number) => void;
  completeIntro: () => void;
  discoverEntry: (category: 'beast' | 'invader', id: string) => void;
  addResources: (delta: Partial<Resources>) => void;
  spendResources: (cost: Partial<Resources>) => boolean;
  summonWorker: () => boolean;
  summonUnit: (unitClass: UnitClass, initialTask?: HarvestTask, isFreeCost?: boolean) => boolean;
  summonTenant: (buildingId: ResourceBuildingId) => boolean;
  assignUnitTask: (unitId: string, task: HarvestTask) => void;
  removeUnit: (unitId: string, refundResources?: boolean) => void;
  upgradeSupportSlime: () => boolean;
  upgradeTech: (techKey: keyof UpgradesState) => boolean;
  setTimeOfDay: (phase: TimeOfDayPhase, darkness?: number) => void;
  setWeather: (weather: WeatherType) => void;
  setRandomWeatherEnabled: (enabled: boolean) => void;
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
  upgradeTower: (buildingId: TowerId) => boolean;
  repairBuilding: (buildingId: TowerId) => boolean;
  /** Invader damage to an establishment or the spire; returns true when this hit wrecked it. */
  damageBuilding: (buildingId: TowerId, amount: number) => boolean;
  /** Free HP restore (Treant repairs); returns the HP actually restored. */
  restoreBuildingHp: (buildingId: TowerId, amount: number) => number;

  // Invasion Actions
  tickDefenseTimers: (deltaSec: number) => void;
  tickInvasionCountdown: (deltaSeconds: number) => void;
  startInvasion: () => void;
  /** A tenant came back from a portal expedition: the humans grow vengeful. */
  stirVengeance: (amount: number) => void;
  setEnemiesRemaining: (count: number) => void;
  resolveInvasionVictory: (bountyCoins: number) => void;
  resolveCastleBreach: () => void;
  closeCastleBreachedModal: () => void;
  unlockAchievement: (id: string, title: string, description: string, icon: string) => void;

  // Equipment & Crafting Actions
  craftEquipment: (item: EquipmentItem) => boolean;
  purchaseEquipment: (item: EquipmentItem) => boolean;
  grantEquipmentDrop: (itemId: string) => EquipmentItem | null;
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
  buildSpire: () => boolean;
  upgradeResourceBuilding: (buildingId: ResourceBuildingId) => boolean;

  // FPS & Performance Settings Actions
  setMeasuredFps: (fps: number) => void;
  toggleFpsDebug: () => void;
  toggleTileCoordinates: () => void;

  // Game Speed
  setGameSpeed: (speed: GameSpeed) => void;
  /** One play/pause button: pauses, or resumes at normal speed. */
  togglePause: () => void;
  /** Switches to `speed`, or back to 1× when already running at it. */
  toggleFastSpeed: (speed: 2 | 3) => void;

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
  establishmentSkillCooldowns: Record<ResourceBuildingId | 'CASTLE' | 'SPIRE', { skill1: number; skill2: number; skill3: number }>;

  /** The establishment currently open in the modal, or null if closed. */
  selectedEstablishmentId: 'CASTLE' | TowerId | null;

  /** Auto-buy toggle per building — whether to auto-purchase missing upgrade materials. */
  autoBuyBuildingMaterials: Partial<Record<TowerId, boolean>>;
  /** Minions the Support Slime may buy missing summon materials for (with coins). */
  autoBuySummon: Partial<Record<UnitClass, boolean>>;
  toggleAutoBuySummon: (unitClass: UnitClass) => void;
  /** Buys only the shortfall of `cost` with coins; false when coins cannot cover all of it. */
  buyShortfall: (cost: Partial<Resources>) => boolean;

  // Establishment Actions
  /** Tick skill cooldowns down by delta seconds. */
  tickEstablishmentSkills: (deltaSeconds: number) => void;
  /** Trigger a skill (index 0 or 1) on a building. Returns true if activated. */
  triggerEstablishmentSkill: (buildingId: ResourceBuildingId | 'CASTLE' | 'SPIRE', skillIndex: 0 | 1 | 2) => boolean;
  /** Relocate a building to a new random position. Castle cannot be relocated. */
  relocateBuilding: (buildingId: ResourceBuildingId) => boolean;

  // Establishment Modal Actions
  openEstablishmentModal: (id: 'CASTLE' | TowerId) => void;
  /** Moves an establishment so its top-left tile is (x, y). Refused mid-wave or on a blocked spot. */
  relocateEstablishment: (id: ResourceBuildingId | 'SPIRE', x: number, y: number) => boolean;
  closeEstablishmentModal: () => void;
  toggleBuildingAutoBuy: (buildingId: TowerId) => void;
  autoBuyMaterialsForUpgrade: (buildingId: TowerId) => void;
}

