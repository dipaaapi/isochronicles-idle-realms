import { isConstructionReady } from './constructionProgress';
import { normalizeDifficulty } from './difficulty';
import { SKILLS, skillBonuses, normalizeSkillProgress } from './skillTree';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  GameStoreState,
  Resources,
  UpgradesState,
  CastleDefenseState,
  InvasionState,
  Achievement,
  AutoSettings,
  ScreenState,
  TimeOfDayPhase,
  UnitRosterItem,
  Season,
  PlatformPhase,
  RegressionRecord,
  ResourceBuildingId,
  ResourceBuildingsState,
} from '../types/state';
import {
  UnitClass,
  InvaderType,
  UNIT_CLASSES,
  HarvestTask,
  EquipmentItem,
  EquipmentSlot,
  PLATFORM_CONFIGS,
  SEASON_CONFIGS,
  GOD_BLESSINGS,
  TREANT_EVOLUTION,
  GodBlessingId,
} from '../types/game';
import { localForageStorage } from './storageAdapter';
import { calculateOfflineGains } from './offlineProgression';
import { soundFx } from '../game/audio/soundFx';

export const getPhaseFromWave = (wave: number): PlatformPhase => {
  if (wave <= 25) return 1;
  if (wave <= 50) return 2;
  if (wave <= 75) return 3;
  return 4;
};

export const getSeasonFromDay = (day: number): Season => {
  const dayInYear = ((day - 1) % 365) + 1;
  if (dayInYear <= 91) return 'SPRING';
  if (dayInYear <= 182) return 'SUMMER';
  if (dayInYear <= 273) return 'AUTUMN';
  return 'WINTER';
};

export const RESOURCE_PRICES = {
  aetherShards: { sell: 10, buy: 25, label: 'Kristal (Gems)', icon: '💎' },
  wood: { sell: 6, buy: 15, label: 'Kahoy (Wood)', icon: '🌲' },
  stone: { sell: 8, buy: 20, label: 'Bato (Stone)', icon: '🪨' },
  arcaneEssence: { sell: 25, buy: 60, label: 'Magic (Potion)', icon: '🔮' },
  fish: { sell: 4, buy: 10, label: 'Isda (Fish)', icon: '🐟' },
  water: { sell: 2, buy: 5, label: 'Tubig (Water)', icon: '💧' },
  metal: { sell: 12, buy: 30, label: 'Metal', icon: '🔩' },
  charcoal: { sell: 10, buy: 24, label: 'Charcoal', icon: '🪵' },
  coal: { sell: 14, buy: 32, label: 'Coal', icon: '⚫' },
  minerals: { sell: 18, buy: 40, label: 'Minerals', icon: '💠' },
};

const INITIAL_RESOURCES: Resources = {
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
  coins: 100,
};

export const RESOURCE_BUILDING_CONFIG: Record<ResourceBuildingId, {
  label: string;
  labelEn: string;
  icon: string;
  outputs: string[];
  costs: Array<Partial<Resources>>;
}> = {
  WOOD: {
    label: 'Kagubatan',
    labelEn: 'Wood Grove',
    icon: '🌲',
    outputs: ['wood', 'charcoal'],
    costs: [{ wood: 20, stone: 15, coins: 25 }, { wood: 35, stone: 25, coins: 50 }],
  },
  MINE: {
    label: 'Minahan',
    labelEn: 'Metal Mine',
    icon: '⛏️',
    outputs: ['metal', 'coal'],
    costs: [{ wood: 25, stone: 20, coins: 30 }, { wood: 40, stone: 35, coins: 60 }],
  },
  QUARRY: {
    label: 'Kwartel',
    labelEn: 'Stone Quarry',
    icon: '🪨',
    outputs: ['stone', 'minerals'],
    costs: [{ wood: 15, stone: 25, coins: 25 }, { wood: 30, stone: 45, coins: 55 }],
  },
  PORT: {
    label: 'Pantalan',
    labelEn: 'Water Port',
    icon: '⚓',
    outputs: ['water', 'fish'],
    costs: [{ wood: 25, stone: 15, coins: 30 }, { wood: 40, stone: 25, coins: 65 }],
  },
};

const INITIAL_RESOURCE_BUILDINGS: ResourceBuildingsState = {
  WOOD: { level: 0, unlockedOutputs: [] },
  MINE: { level: 0, unlockedOutputs: [] },
  QUARRY: { level: 0, unlockedOutputs: [] },
  PORT: { level: 0, unlockedOutputs: [] },
};

export const CASTLE_CONSTRUCTION_COST: Partial<Resources> = {
  aetherShards: 25,
  wood: 35,
  stone: 30,
  coins: 50,
};

const INITIAL_DEFENSE: CastleDefenseState = {
  castleHp: 0,
  castleMaxHp: 500,
  shieldHp: 200,
  shieldMaxHp: 200,
  wallLevel: 1,
  turretLevel: 1,
  shieldLevel: 1,
};

const INITIAL_INVASION: InvasionState = {
  isActive: false,
  countdown: 150, // 2.5 minutes countdown
  maxCountdown: 150,
  waveNumber: 1,
  enemiesRemaining: 0,
  totalEnemiesInWave: 0,
  invasionsRepelled: 0,
  invaderKills: 0,
};

const INITIAL_AUTO_SETTINGS: AutoSettings = {
  autoDispatch: true,
  autoRest: true,
  autoDefend: true,
  autoSell: false,
  autoTap: true,
  autoEvolve: true,
};

const INITIAL_UPGRADES: UpgradesState = {
  nexusLevel: 1,
  refineryLevel: 1,
  quarryLevel: 1,
  golemSpeedLevel: 1,
  golemCapacityLevel: 1,
};

const INITIAL_ROSTER: UnitRosterItem[] = [
  { id: 'unit_slime_support_1', name: 'Support Healing Slime', unitClass: 'AQUA_SLIME', assignedTask: 'HEAL', hp: 9999, maxHp: 9999, slimeEvolutionLevel: 1, equipment: {} },
];

const INITIAL_DYNAMIC_NODES = {
  AETHER: { x: 1, y: 1, qualityMultiplier: 1.0 },
  STONE: { x: 8, y: 2, qualityMultiplier: 1.0 },
  WOOD: { x: 8, y: 8, qualityMultiplier: 1.0 },
  ESSENCE: { x: 1, y: 8, qualityMultiplier: 1.0 },
};

const getUnitSummonCost = (unitClass: UnitClass, countOfClass: number): Partial<Resources> => {
  let aetherShards = 0;
  let wood = 0;
  let stone = 0;

  switch (unitClass) {
    case 'GOLEM':
      aetherShards = 30 + countOfClass * 20;
      stone = 20 + countOfClass * 15;
      break;
    case 'WAYFARER':
      aetherShards = 40 + countOfClass * 25;
      wood = 30 + countOfClass * 20;
      break;
    case 'CHRONO':
      aetherShards = 70 + countOfClass * 40;
      stone = 45 + countOfClass * 25;
      wood = 35 + countOfClass * 20;
      break;
    case 'MERMAN':
      aetherShards = 35 + countOfClass * 20;
      wood = 25 + countOfClass * 15;
      break;
    case 'NECROMANCER':
      aetherShards = 60 + countOfClass * 30;
      stone = 30 + countOfClass * 20;
      break;
    case 'TREANT':
      aetherShards = 45;
      wood = 40;
      stone = 30;
      break;
  }

  return { aetherShards, wood, stone };
};

export const useGameStore = create<GameStoreState>()(
  persist(
    (set, get) => ({
      screen: 'TITLE',
      difficulty: 'NORMAL',
      skillPoints: 0,
      unlockedSkills: [],
      unlockSkill: (id) => {
        const state = get();
        const skill = SKILLS[id];
        if (!skill || state.skillPoints < 1 || state.unlockedSkills.includes(id) ||
          (skill.prerequisite && !state.unlockedSkills.includes(skill.prerequisite))) return false;
        set({ skillPoints: state.skillPoints - 1, unlockedSkills: [...state.unlockedSkills, id], lastSavedTimestamp: Date.now() });
        soundFx.playFanfare();
        return true;
      },
      hasCompletedIntro: false,
      realmName: 'Kuta ng Kadiliman (Demon Realm)',
      language: 'EN',
      resources: { ...INITIAL_RESOURCES },
      workerCount: INITIAL_ROSTER.length,
      roster: [...INITIAL_ROSTER],
      upgrades: { ...INITIAL_UPGRADES },
      castleBuilt: false,
      resourceBuildings: { ...INITIAL_RESOURCE_BUILDINGS },
      defense: { ...INITIAL_DEFENSE },
      invasion: { ...INITIAL_INVASION },
      inventory: [],
      autoSettings: { ...INITIAL_AUTO_SETTINGS },
      achievements: [],
      isCastleBreachedModalOpen: false,
      lootedResources: null,
      merchantRestockTimer: 90,
      // Audio & Environment
      timeOfDay: 'DAY',
      weather: 'CLEAR',
      ambientDarkness: 0,
      isAudioMuted: soundFx.getIsMuted(),
      lastSavedTimestamp: Date.now(),
      offlineGains: null,
      isOfflineModalOpen: false,
      day: 1,
      year: 1,
      season: 'SPRING',
      dayProgress: 0,
      isGoreEnabled: false,

      // Platform & Regression Progression
      platformPhase: 1,
      regressionCount: 0,
      regressionHistory: [],
      isRegressionModalOpen: false,
      isWave100VictoryCelebration: false,

      // Silhouette Discovery: Starting beasts are pre-discovered
      discoveredBeasts: ['GOLEM', 'WAYFARER'],
      discoveredInvaders: [],
      promptedUpgrades: {},
      dynamicResourceNodes: { ...INITIAL_DYNAMIC_NODES },
      activeGodBlessings: {
        CELESTIAL_HARVEST: 0,
        AEGIS_WRATH: 0,
        TITAN_AWAKENING: 0,
      },
      
      targetFps: (Number(localStorage.getItem('isochronicle_target_fps')) || 60) as 30 | 60 | 90,
      showFpsDebug: false,
      showTileCoordinates: true,
      measuredFps: 60,
      gameSpeed: 1 as 0 | 1 | 2,

      setScreen: (screen: ScreenState) => {
        set({ screen, lastSavedTimestamp: Date.now() });
      },

      setLanguage: (lang) => {
        set({ language: lang, lastSavedTimestamp: Date.now() });
      },

      discoverEntry: (category: 'beast' | 'invader', id: string) => {
        set((prev) => {
          if (category === 'beast') {
            const castId = id as UnitClass;
            if (!prev.discoveredBeasts.includes(castId)) {
              soundFx.playFanfare();
              return {
                discoveredBeasts: [...prev.discoveredBeasts, castId],
                lastSavedTimestamp: Date.now(),
              };
            }
          } else {
            const castId = id as InvaderType;
            if (!prev.discoveredInvaders.includes(castId)) {
              soundFx.playFanfare();
              return {
                discoveredInvaders: [...prev.discoveredInvaders, castId],
                lastSavedTimestamp: Date.now(),
              };
            }
          }
          return prev;
        });
      },

      setTimeOfDay: (phase, darkness) => {
        set((state) => ({
          timeOfDay: phase,
          ambientDarkness: darkness !== undefined ? darkness : state.ambientDarkness,
        }));
      },

      setWeather: (weather) => {
        set({ weather });
      },

      setDayProgress: (progress: number) => {
        set({ dayProgress: progress });
      },

      incrementDay: () => {
        set((state) => {
          const currentDay = state.day || 1;
          const currentYear = state.year || 1;
          let nextDay = currentDay + 1;
          let nextYear = currentYear;

          // Day cycle 1 to 365 days
          if (nextDay > 365) {
            nextDay = 1;
            nextYear += 1;
          }

          const nextSeason = getSeasonFromDay(nextDay);
          
          // Random season-weighted weather
          const rand = Math.random();
          let nextWeather = state.weather;
          if (nextSeason === 'WINTER') {
            nextWeather = rand < 0.55 ? 'SNOW' : rand < 0.85 ? 'CLEAR' : 'RAIN';
          } else if (nextSeason === 'SUMMER') {
            nextWeather = rand < 0.50 ? 'HEATWAVE' : rand < 0.85 ? 'CLEAR' : 'RAIN';
          } else if (nextSeason === 'AUTUMN') {
            nextWeather = rand < 0.50 ? 'RAIN' : rand < 0.85 ? 'CLEAR' : 'HEATWAVE';
          } else {
            // Spring
            nextWeather = rand < 0.60 ? 'CLEAR' : rand < 0.90 ? 'RAIN' : 'HEATWAVE';
          }

          return {
            day: nextDay,
            year: nextYear,
            season: nextSeason,
            weather: nextWeather,
            lastSavedTimestamp: Date.now(),
          };
        });
      },

      toggleAudioMute: () => {
        const newMuted = soundFx.toggleMute();
        set({ isAudioMuted: newMuted });
        return newMuted;
      },

      toggleGore: () => {
        let newGore = false;
        set((state) => {
          newGore = !state.isGoreEnabled;
          return { isGoreEnabled: newGore };
        });
        return newGore;
      },

      completeIntro: () => {
        set({
          hasCompletedIntro: true,
          screen: 'GAME',
          lastSavedTimestamp: Date.now(),
        });
      },

      addResources: (delta: Partial<Resources>) => {
        set((state) => {
          const updated: Resources = {
            aetherShards: Math.max(0, state.resources.aetherShards + (delta.aetherShards || 0)),
            wood: Math.max(0, state.resources.wood + (delta.wood || 0)),
            stone: Math.max(0, state.resources.stone + (delta.stone || 0)),
            arcaneEssence: Math.max(0, state.resources.arcaneEssence + (delta.arcaneEssence || 0)),
            fish: Math.max(0, state.resources.fish + (delta.fish || 0)),
            water: Math.max(0, state.resources.water + (delta.water || 0)),
            metal: Math.max(0, (state.resources.metal || 0) + (delta.metal || 0)),
            charcoal: Math.max(0, (state.resources.charcoal || 0) + (delta.charcoal || 0)),
            coal: Math.max(0, (state.resources.coal || 0) + (delta.coal || 0)),
            minerals: Math.max(0, (state.resources.minerals || 0) + (delta.minerals || 0)),
            coins: Math.max(0, state.resources.coins + (delta.coins || 0)),
          };
          return {
            resources: updated,
            lastSavedTimestamp: Date.now(),
          };
        });
      },

      spendResources: (cost: Partial<Resources>): boolean => {
        const current = get().resources;
        if (
          (cost.aetherShards && current.aetherShards < cost.aetherShards) ||
          (cost.wood && current.wood < cost.wood) ||
          (cost.stone && current.stone < cost.stone) ||
          (cost.arcaneEssence && current.arcaneEssence < cost.arcaneEssence) ||
          (cost.fish && current.fish < cost.fish) ||
          (cost.water && current.water < cost.water) ||
          (cost.coins && current.coins < cost.coins)
        ) {
          return false;
        }

        set({
          resources: {
            aetherShards: current.aetherShards - (cost.aetherShards || 0),
            wood: current.wood - (cost.wood || 0),
            stone: current.stone - (cost.stone || 0),
            arcaneEssence: current.arcaneEssence - (cost.arcaneEssence || 0),
            fish: current.fish - (cost.fish || 0),
            water: current.water - (cost.water || 0),
            metal: (current.metal || 0) - (cost.metal || 0),
            charcoal: (current.charcoal || 0) - (cost.charcoal || 0),
            coal: (current.coal || 0) - (cost.coal || 0),
            minerals: (current.minerals || 0) - (cost.minerals || 0),
            coins: current.coins - (cost.coins || 0),
          },
          lastSavedTimestamp: Date.now(),
        });
        return true;
      },

      assignUnitTask: (unitId: string, task: HarvestTask) => {
        const target = get().roster.find((u) => u.id === unitId);
        // Slime is strictly a support healer and cannot gather resources
        if (target && target.unitClass === 'AQUA_SLIME') {
          return;
        }
        soundFx.playClick();
        set((state) => {
          const updatedRoster = state.roster.map((unit) =>
            unit.id === unitId ? { ...unit, assignedTask: task } : unit
          );
          return {
            roster: updatedRoster,
            lastSavedTimestamp: Date.now(),
          };
        });
      },

      removeUnit: (unitId: string, refundResources: boolean = false) => {
        set((state) => {
          const unitToRemove = state.roster.find((u) => u.id === unitId);
          if (!unitToRemove || unitToRemove.unitClass === 'AQUA_SLIME') {
            return state;
          }

          const sameClassCount = state.roster.filter((u) => u.unitClass === unitToRemove.unitClass).length;
          const refundCost = refundResources
            ? getUnitSummonCost(unitToRemove.unitClass, Math.max(0, sameClassCount - 1))
            : null;

          const nextRoster = state.roster.filter((u) => u.id !== unitId);

          return {
            resources: refundCost
              ? {
                  ...state.resources,
                  aetherShards: state.resources.aetherShards + (refundCost.aetherShards || 0),
                  wood: state.resources.wood + (refundCost.wood || 0),
                  stone: state.resources.stone + (refundCost.stone || 0),
                }
              : state.resources,
            roster: nextRoster,
            workerCount: nextRoster.length,
            lastSavedTimestamp: Date.now(),
          };
        });
      },

      summonUnit: (unitClass: UnitClass, initialTask?: HarvestTask, isFreeCost?: boolean): boolean => {
        if (unitClass === 'AQUA_SLIME') {
          return false;
        }

        const state = get();
        if (unitClass !== 'TREANT' && !isConstructionReady(state)) return false;
        const countOfClass = state.roster.filter((u) => u.unitClass === unitClass).length;
        const config = UNIT_CLASSES[unitClass];

        // Strict limit: Treant max 1 per platform, all other minion types max 2 per type
        const maxAllowed = unitClass === 'TREANT' ? 1 : 2;
        if (countOfClass >= maxAllowed) {
          return false;
        }

        // Verify requirements (bypassed if free summon from Support Slime)
        if (!isFreeCost) {
          if (
            state.upgrades.nexusLevel < config.requiredNexusLevel ||
            state.upgrades.refineryLevel < config.requiredRefineryLevel
          ) {
            return false;
          }
        }

        const cost = getUnitSummonCost(unitClass, countOfClass);
        const costShards = isFreeCost ? 0 : (cost.aetherShards || 0);
        const costWood = isFreeCost ? 0 : (cost.wood || 0);
        const costStone = isFreeCost ? 0 : (cost.stone || 0);

        if (
          isFreeCost ||
          (state.resources.aetherShards >= costShards &&
            state.resources.wood >= costWood &&
            state.resources.stone >= costStone)
        ) {
          const newUnitId = `unit_${unitClass.toLowerCase()}_${Date.now()}`;
          const newUnit: UnitRosterItem = {
            id: newUnitId,
            name: `${config.name} ${countOfClass + 1}`,
            unitClass,
            assignedTask: initialTask || config.preferredTask,
            treantEvolutionLevel: unitClass === 'TREANT' ? 1 : undefined,
          };

          const nextRoster = [...state.roster, newUnit];

          set({
            resources: {
              ...state.resources,
              aetherShards: state.resources.aetherShards - costShards,
              wood: state.resources.wood - costWood,
              stone: state.resources.stone - costStone,
            },
            roster: nextRoster,
            workerCount: nextRoster.length,
            lastSavedTimestamp: Date.now(),
          });

          get().discoverEntry('beast', unitClass);

          if (unitClass === 'CHRONO') {
            soundFx.playFanfare();
          } else {
            soundFx.playGolemCheer();
          }
          return true;
        }

        return false;
      },

      summonWorker: (): boolean => {
        return get().summonUnit('GOLEM', 'AETHER');
      },

      upgradeSupportSlime: (): boolean => {
        const state = get();
        const slime = state.roster.find((unit) => unit.unitClass === 'AQUA_SLIME');
        if (!slime) return false;

        const currentLevel = slime.slimeEvolutionLevel ?? 1;
        if (currentLevel >= 5) return false;

        const requiredKills = currentLevel * 12;
        const costShards = 30 + currentLevel * 25;
        const costWood = 20 + currentLevel * 18;
        const costStone = 15 + currentLevel * 12;
        const costCoins = 40 + currentLevel * 35;

        if (
          state.resources.aetherShards >= costShards &&
          state.resources.wood >= costWood &&
          state.resources.stone >= costStone &&
          state.resources.coins >= costCoins &&
          state.invasion.invaderKills >= requiredKills
        ) {
          set({
            resources: {
              ...state.resources,
              aetherShards: state.resources.aetherShards - costShards,
              wood: state.resources.wood - costWood,
              stone: state.resources.stone - costStone,
              coins: state.resources.coins - costCoins,
            },
            roster: state.roster.map((unit) =>
              unit.unitClass === 'AQUA_SLIME'
                ? { ...unit, slimeEvolutionLevel: (unit.slimeEvolutionLevel ?? 1) + 1 }
                : unit
            ),
            lastSavedTimestamp: Date.now(),
          });
          soundFx.playFanfare();
          return true;
        }
        return false;
      },

      upgradeTreant: (): boolean => {
        const state = get();
        const treant = state.roster.find((unit) => unit.unitClass === 'TREANT');
        if (!treant) return false;

        const currentLevel = (treant.treantEvolutionLevel ?? 1) as 1 | 2 | 3 | 4 | 5;
        if (currentLevel >= 5) return false;

        const nextLevel = (currentLevel + 1) as 1 | 2 | 3 | 4 | 5;
        const profile = TREANT_EVOLUTION[currentLevel];
        const cost = profile.upgradeCost;

        if (
          state.resources.aetherShards >= cost.aetherShards &&
          state.resources.wood >= cost.wood &&
          state.resources.stone >= cost.stone &&
          state.resources.coins >= cost.coins
        ) {
          set({
            resources: {
              ...state.resources,
              aetherShards: state.resources.aetherShards - cost.aetherShards,
              wood: state.resources.wood - cost.wood,
              stone: state.resources.stone - cost.stone,
              coins: state.resources.coins - cost.coins,
            },
            roster: state.roster.map((unit) =>
              unit.unitClass === 'TREANT'
                ? { ...unit, treantEvolutionLevel: nextLevel }
                : unit
            ),
            lastSavedTimestamp: Date.now(),
          });
          soundFx.playFanfare();
          return true;
        }
        return false;
      },

      buildCastle: (): boolean => {
        const state = get();
        if (state.castleBuilt || !state.roster.some((unit) => unit.unitClass === 'TREANT')) return false;
        if (!get().spendResources(CASTLE_CONSTRUCTION_COST)) return false;

        set((prev) => ({
          castleBuilt: true,
          defense: {
            ...prev.defense,
            castleHp: prev.defense.castleMaxHp,
            shieldHp: prev.defense.shieldMaxHp,
          },
          lastSavedTimestamp: Date.now(),
        }));
        soundFx.playFanfare();
        return true;
      },

      upgradeResourceBuilding: (buildingId: ResourceBuildingId): boolean => {
        const state = get();
        if (!state.roster.some((unit) => unit.unitClass === 'TREANT')) return false;

        const building = state.resourceBuildings[buildingId];
        const config = RESOURCE_BUILDING_CONFIG[buildingId];
        const nextLevel = building.level + 1;
        const cost = config.costs[nextLevel - 1];
        if (!cost || !get().spendResources(cost)) return false;

        set((prev) => ({
          resourceBuildings: {
            ...prev.resourceBuildings,
            [buildingId]: {
              level: nextLevel,
              unlockedOutputs: config.outputs.slice(0, nextLevel),
            },
          },
          lastSavedTimestamp: Date.now(),
        }));
        soundFx.playFanfare();
        return true;
      },

      activateGodBlessing: (blessingId: GodBlessingId): boolean => {
        const state = get();
        const cfg = GOD_BLESSINGS[blessingId];
        if (!cfg) return false;

        const cost = cfg.costResources;
        if (
          state.resources.aetherShards >= cost.aetherShards &&
          state.resources.arcaneEssence >= cost.arcaneEssence &&
          state.resources.coins >= cost.coins
        ) {
          set((prev) => ({
            resources: {
              ...prev.resources,
              aetherShards: prev.resources.aetherShards - cost.aetherShards,
              arcaneEssence: prev.resources.arcaneEssence - cost.arcaneEssence,
              coins: prev.resources.coins - cost.coins,
            },
            activeGodBlessings: {
              ...prev.activeGodBlessings,
              [blessingId]: cfg.durationSeconds,
            },
            lastSavedTimestamp: Date.now(),
          }));
          soundFx.playFanfare();
          return true;
        }
        return false;
      },

      tickGodBlessings: (deltaSeconds: number) => {
        set((prev) => {
          let changed = false;
          const nextBlessings = { ...prev.activeGodBlessings };
          for (const key of Object.keys(nextBlessings) as GodBlessingId[]) {
            if (nextBlessings[key] > 0) {
              nextBlessings[key] = Math.max(0, nextBlessings[key] - deltaSeconds);
              changed = true;
            }
          }
          if (!changed) return prev;
          return {
            activeGodBlessings: nextBlessings,
          };
        });
      },

      upgradeTech: (techKey: keyof UpgradesState): boolean => {
        const state = get();
        const currentLevel = state.upgrades[techKey];
        const costShards = Math.floor(40 * Math.pow(1.6, currentLevel - 1));
        const costWood = Math.floor(30 * Math.pow(1.5, currentLevel - 1));
        const costStone = Math.floor(25 * Math.pow(1.5, currentLevel - 1));

        if (
          state.resources.aetherShards >= costShards &&
          state.resources.wood >= costWood &&
          state.resources.stone >= costStone
        ) {
          set({
            resources: {
              ...state.resources,
              aetherShards: state.resources.aetherShards - costShards,
              wood: state.resources.wood - costWood,
              stone: state.resources.stone - costStone,
            },
            upgrades: {
              ...state.upgrades,
              [techKey]: currentLevel + 1,
            },
            lastSavedTimestamp: Date.now(),
          });
          soundFx.playFanfare();
          return true;
        }
        return false;
      },

      closeOfflineModal: () => set({ isOfflineModalOpen: false }),

      setPromptedUpgrade: (key, level) => {
        set((prev) => ({
          promptedUpgrades: {
            ...prev.promptedUpgrades,
            [key]: Math.max(prev.promptedUpgrades[key] || 0, level)
          }
        }));
      },

      setTargetFps: (fps) => {
        localStorage.setItem('isochronicle_target_fps', String(fps));
        set({ targetFps: fps, lastSavedTimestamp: Date.now() });
      },

      setMeasuredFps: (fps: number) => {
        // Lightweight update — no persist timestamp to avoid save churn
        set({ measuredFps: fps });
      },

      toggleFpsDebug: () => {
        set((state) => ({ showFpsDebug: !state.showFpsDebug }));
      },

      toggleTileCoordinates: () => {
        set((state) => ({ showTileCoordinates: !state.showTileCoordinates }));
      },

      setGameSpeed: (speed: 0 | 1 | 2) => {
        set({ gameSpeed: speed });
      },

      grantRandomLoot: () => {
        // Award a small randomised bundle of resources when scouts are slain
        const rand = () => Math.floor(Math.random() * 8) + 2;
        set((state) => ({
          resources: {
            ...state.resources,
            coins: state.resources.coins + rand() * 3,
            aetherShards: state.resources.aetherShards + rand(),
            wood: state.resources.wood + rand(),
            stone: state.resources.stone + rand(),
            fish: state.resources.fish + Math.floor(Math.random() * 4),
          },
          lastSavedTimestamp: Date.now(),
        }));
      },

      checkOfflineProgress: () => {
        const state = get();
        const gains = calculateOfflineGains(
          state.lastSavedTimestamp,
          state.workerCount,
          state.upgrades,
          state.unlockedSkills
        );

        if (gains && gains.elapsedSeconds > 15) {
          set((prev) => ({
            resources: {
              aetherShards: prev.resources.aetherShards + gains.aetherShardsEarned,
              wood: prev.resources.wood + gains.woodEarned,
              stone: prev.resources.stone + gains.stoneEarned,
              arcaneEssence: prev.resources.arcaneEssence,
              fish: prev.resources.fish,
              water: prev.resources.water,
              metal: prev.resources.metal || 0,
              charcoal: prev.resources.charcoal || 0,
              coal: prev.resources.coal || 0,
              minerals: prev.resources.minerals || 0,
              coins: prev.resources.coins,
            },
            offlineGains: gains,
            isOfflineModalOpen: true,
            lastSavedTimestamp: Date.now(),
          }));
        } else {
          set({ lastSavedTimestamp: Date.now() });
        }
      },

      exportSave: (): string => {
        const state = get();
        const exportData = {
          version: '1.3.0',
          difficulty: state.difficulty,
          skillPoints: state.skillPoints,
          unlockedSkills: state.unlockedSkills,
          regressionCount: state.regressionCount,
          regressionHistory: state.regressionHistory,
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
          if (!data.resources) {
            throw new Error('Invalid save payload');
          }

          const importedRoster: UnitRosterItem[] = Array.isArray(data.roster) && data.roster.length > 0
            ? data.roster
            : [...INITIAL_ROSTER];

          set({
            realmName: data.realmName || 'Aether Haven',
            difficulty: normalizeDifficulty(data.difficulty),
            ...normalizeSkillProgress(data),
            regressionHistory: Array.isArray(data.regressionHistory) ? data.regressionHistory : [],
            platformPhase: getPhaseFromWave(data.invasion?.waveNumber ?? 1),
            year: data.year || 1,
            season: data.season || 'SPRING',
            hasCompletedIntro: !!data.hasCompletedIntro,
            resources: {
              aetherShards: Number(data.resources.aetherShards) || 0,
              wood: Number(data.resources.wood) || 0,
              stone: Number(data.resources.stone) || 0,
              arcaneEssence: Number(data.resources.arcaneEssence) || 0,
              fish: Number(data.resources.fish) || 0,
              water: Number(data.resources.water) || 0,
              metal: Number(data.resources.metal) || 0,
              charcoal: Number(data.resources.charcoal) || 0,
              coal: Number(data.resources.coal) || 0,
              minerals: Number(data.resources.minerals) || 0,
              coins: Number(data.resources.coins) || 0,
            },
            castleBuilt: data.castleBuilt ?? false,
            resourceBuildings: {
              ...INITIAL_RESOURCE_BUILDINGS,
              ...(data.resourceBuildings || {}),
            },
            roster: importedRoster,
            workerCount: importedRoster.length,
            upgrades: {
              ...INITIAL_UPGRADES,
              ...(data.upgrades || {}),
            },
            language: data.language || 'EN',
            defense: {
              ...INITIAL_DEFENSE,
              ...(data.defense || {}),
            },
            invasion: {
              ...INITIAL_INVASION,
              ...(data.invasion || {}),
            },
            achievements: data.achievements || [],
            inventory: data.inventory || [],
            autoSettings: {
              ...INITIAL_AUTO_SETTINGS,
              ...(data.autoSettings || {}),
            },
            timeOfDay: data.timeOfDay || 'DAY',
            day: data.day || 1,
            ambientDarkness: data.ambientDarkness || 0,
            isAudioMuted: data.isAudioMuted || false,
            isGoreEnabled: data.isGoreEnabled || false,
            discoveredBeasts: data.discoveredBeasts || ['GOLEM', 'WAYFARER'],
            discoveredInvaders: data.discoveredInvaders || [],
            lastSavedTimestamp: Date.now(),
            screen: data.hasCompletedIntro ? 'GAME' : 'TITLE',
          });
          return true;
        } catch (err) {
          console.error('[IsoChronicle] Import error:', err);
          return false;
        }
      },

      // Merchant Store Actions
      sellResource: (resourceKey, amount) => {
        const state = get();
        const currentAmount = state.resources[resourceKey] ?? 0;
        if (currentAmount < amount || amount <= 0) return false;
        const price = RESOURCE_PRICES[resourceKey].sell;
        const earnings = amount * price;

        set((prev) => ({
          resources: {
            ...prev.resources,
            [resourceKey]: (prev.resources[resourceKey] ?? 0) - amount,
            coins: prev.resources.coins + earnings,
          },
          lastSavedTimestamp: Date.now(),
        }));

        soundFx.playCoin();
        get().unlockAchievement(
          'first_trade',
          'Aether Merchant',
          'Completed your first resource trade at the merchant outpost.',
          '🪙'
        );
        return true;
      },

      buyResource: (resourceKey, amount) => {
        if (!Number.isSafeInteger(amount) || amount <= 0) return false;
        const state = get();
        const price = RESOURCE_PRICES[resourceKey].buy;
        const totalCost = amount * price;
        if (!Number.isSafeInteger(totalCost) || state.resources.coins < totalCost) return false;

        set((prev) => ({
          resources: {
            ...prev.resources,
            coins: prev.resources.coins - totalCost,
            [resourceKey]: (prev.resources[resourceKey] ?? 0) + amount,
          },
          lastSavedTimestamp: Date.now(),
        }));

        soundFx.playCoin();
        return true;
      },

      tickMerchantTimer: (deltaSec) => {
        set((state) => {
          const next = state.merchantRestockTimer - deltaSec;
          return {
            merchantRestockTimer: next <= 0 ? 90 : next,
          };
        });
      },

      // Castle Defense Actions
      upgradeDefense: (defenseKey) => {
        const state = get();
        const currentLevel = state.defense[defenseKey];
        const baseCost = defenseKey === 'wallLevel' ? 70 : defenseKey === 'turretLevel' ? 90 : 110;
        const costCoins = Math.floor(baseCost * Math.pow(1.5, currentLevel - 1));

        if (state.resources.coins < costCoins) return false;

        set((prev) => {
          const nextDef = { ...prev.defense, [defenseKey]: currentLevel + 1 };
          if (defenseKey === 'wallLevel') {
            nextDef.castleMaxHp += 200;
            nextDef.castleHp = Math.min(nextDef.castleMaxHp, nextDef.castleHp + 200);
          } else if (defenseKey === 'shieldLevel') {
            nextDef.shieldMaxHp += 100;
            nextDef.shieldHp = nextDef.shieldMaxHp;
          }
          return {
            resources: {
              ...prev.resources,
              coins: prev.resources.coins - costCoins,
            },
            defense: nextDef,
            lastSavedTimestamp: Date.now(),
          };
        });

        soundFx.playFanfare();
        get().unlockAchievement(
          'citadel_fortified',
          'Citadel of Iron',
          'Upgraded Castle Fortifications to repel void invaders.',
          '🏰'
        );
        return true;
      },

      repairCastle: () => {
        const state = get();
        const costCoins = 40;
        const repairAmount = 120;
        if (
          state.resources.coins < costCoins ||
          state.defense.castleHp >= state.defense.castleMaxHp
        ) {
          return false;
        }

        set((prev) => ({
          resources: {
            ...prev.resources,
            coins: prev.resources.coins - costCoins,
          },
          defense: {
            ...prev.defense,
            castleHp: Math.min(prev.defense.castleMaxHp, prev.defense.castleHp + repairAmount),
          },
          lastSavedTimestamp: Date.now(),
        }));

        soundFx.playClick();
        return true;
      },

      damageCastle: (amount) => {
        const state = get();
        let remainingDmg = amount * skillBonuses(state.unlockedSkills).castleDamage;
        let nextShield = state.defense.shieldHp;
        let nextHp = state.defense.castleHp;

        // Damage reduction from wall level (4% per level)
        const dmgReduction = Math.min(0.4, (state.defense.wallLevel - 1) * 0.04);
        remainingDmg = Math.max(1, Math.round(remainingDmg * (1 - dmgReduction)));

        if (nextShield > 0) {
          if (nextShield >= remainingDmg) {
            nextShield -= remainingDmg;
            remainingDmg = 0;
          } else {
            remainingDmg -= nextShield;
            nextShield = 0;
          }
        }

        if (remainingDmg > 0) {
          nextHp = Math.max(0, nextHp - remainingDmg);
        }

        soundFx.playCastleHit();

        set((prev) => ({
          defense: {
            ...prev.defense,
            shieldHp: nextShield,
            castleHp: nextHp,
          },
        }));

        if (nextHp <= 0) {
          get().resolveCastleBreach();
        }
      },

      // Invasion Actions
      tickInvasionCountdown: (deltaSec) => {
        const state = get();
        if (!isConstructionReady(state) || state.invasion.isActive) return;

        const nextCountdown = state.invasion.countdown - deltaSec;
        if (nextCountdown <= 0) {
          get().startInvasion();
        } else {
          set((prev) => ({
            invasion: {
              ...prev.invasion,
              countdown: nextCountdown,
            },
          }));
        }
      },

      startInvasion: () => {
        const state = get();
        if (!isConstructionReady(state) || state.invasion.isActive) return;
        const totalEnemies = 4 + state.invasion.waveNumber * 2;
        set((prev) => ({
          invasion: {
            ...prev.invasion,
            isActive: true,
            enemiesRemaining: totalEnemies,
            totalEnemiesInWave: totalEnemies,
            countdown: 0,
          },
        }));
        soundFx.playCastleHit();
      },

      setEnemiesRemaining: (count) => {
        set((prev) => ({
          invasion: {
            ...prev.invasion,
            enemiesRemaining: count,
          },
        }));
      },

      resolveInvasionVictory: (bountyCoins) => {
        soundFx.playFanfare();
        set((prev) => {
          const currentWave = prev.invasion.waveNumber;
          const nextWave = Math.min(100, currentWave + 1);
          const nextPhase = getPhaseFromWave(nextWave);
          const completedWave100 = currentWave >= 100;

          return {
            resources: {
              ...prev.resources,
              coins: prev.resources.coins + bountyCoins,
            },
            platformPhase: nextPhase,
            isWave100VictoryCelebration: completedWave100 || prev.isWave100VictoryCelebration,
            isRegressionModalOpen: completedWave100 ? true : prev.isRegressionModalOpen,
            invasion: {
              ...prev.invasion,
              isActive: false,
              waveNumber: nextWave,
              invasionsRepelled: prev.invasion.invasionsRepelled + 1,
              countdown: 150, // 2.5 min until next wave
              maxCountdown: 150,
            },
            defense: {
              ...prev.defense,
              shieldHp: prev.defense.shieldMaxHp, // Recharge shield
            },
            lastSavedTimestamp: Date.now(),
          };
        });

        get().unlockAchievement(
          'first_defense',
          'Sunder Vanguard',
          'Successfully defended Nexus Prime from a Void Incursion.',
          '⚔️'
        );
      },

      resolveCastleBreach: () => {
        soundFx.playBreach();
        set((prev) => {
          // Enemies loot 50% of the player's stored resources when the castle is crushed
          const currentRes = prev.resources;
          const lostShards = Math.floor(currentRes.aetherShards * 0.5);
          const lostWood = Math.floor(currentRes.wood * 0.5);
          const lostStone = Math.floor(currentRes.stone * 0.5);
          const lostEssence = Math.floor(currentRes.arcaneEssence * 0.5);
          const lostFish = Math.floor(currentRes.fish * 0.5);
          const lostWater = Math.floor(currentRes.water * 0.5);
          const lostCoins = Math.floor(currentRes.coins * 0.5);

          const lootedResources: Partial<Resources> = {
            aetherShards: lostShards,
            wood: lostWood,
            stone: lostStone,
            arcaneEssence: lostEssence,
            fish: lostFish,
            water: lostWater,
            coins: lostCoins,
          };

          const remainingResources: Resources = {
            aetherShards: currentRes.aetherShards - lostShards,
            wood: currentRes.wood - lostWood,
            stone: currentRes.stone - lostStone,
            arcaneEssence: currentRes.arcaneEssence - lostEssence,
            fish: currentRes.fish - lostFish,
            water: currentRes.water - lostWater,
            metal: Math.max(0, (currentRes.metal || 0) - Math.floor((currentRes.metal || 0) * 0.5)),
            charcoal: Math.max(0, (currentRes.charcoal || 0) - Math.floor((currentRes.charcoal || 0) * 0.5)),
            coal: Math.max(0, (currentRes.coal || 0) - Math.floor((currentRes.coal || 0) * 0.5)),
            minerals: Math.max(0, (currentRes.minerals || 0) - Math.floor((currentRes.minerals || 0) * 0.5)),
            coins: currentRes.coins - lostCoins,
          };

          return {
            resources: remainingResources,
            lootedResources,
            // Reset base structures and restore castle health
            defense: {
              ...prev.defense,
              castleHp: prev.defense.castleMaxHp,
              shieldHp: prev.defense.shieldMaxHp,
            },
            upgrades: { ...INITIAL_UPGRADES },
            roster: [...INITIAL_ROSTER],
            workerCount: INITIAL_ROSTER.length,
            invasion: {
              ...prev.invasion,
              isActive: false,
              countdown: 180,
              maxCountdown: 180,
              enemiesRemaining: 0,
            },
            isCastleBreachedModalOpen: true,
            lastSavedTimestamp: Date.now(),
          };
        });
      },

      closeCastleBreachedModal: () => {
        set({ isCastleBreachedModalOpen: false, lootedResources: null });
      },

      unlockAchievement: (id, title, description, icon) => {
        const state = get();
        if (state.achievements.some((a) => a.id === id)) return;

        const newAch: Achievement = {
          id,
          title,
          description,
          icon,
          unlockedAt: Date.now(),
        };

        set((prev) => ({
          achievements: [...prev.achievements, newAch],
          lastSavedTimestamp: Date.now(),
        }));
      },

      // Equipment & Crafting Actions
      craftEquipment: (item) => {
        const state = get();
        const cost = item.costResources;
        if (
          (cost.shards && state.resources.aetherShards < cost.shards) ||
          (cost.wood && state.resources.wood < cost.wood) ||
          (cost.stone && state.resources.stone < cost.stone) ||
          (cost.essence && state.resources.arcaneEssence < cost.essence)
        ) {
          return false;
        }

        set((prev) => ({
          resources: {
            ...prev.resources,
            aetherShards: prev.resources.aetherShards - (cost.shards || 0),
            wood: prev.resources.wood - (cost.wood || 0),
            stone: prev.resources.stone - (cost.stone || 0),
            arcaneEssence: prev.resources.arcaneEssence - (cost.essence || 0),
          },
          inventory: [...prev.inventory, item],
          lastSavedTimestamp: Date.now(),
        }));

        soundFx.playFanfare();
        get().unlockAchievement(
          'master_smith',
          'Arcane Blacksmith',
          'Crafted an equipment piece for your realm constructs.',
          '⚒️'
        );
        return true;
      },

      purchaseEquipment: (item) => {
        const state = get();
        const cost = item.costCoins || 50;
        if (state.resources.coins < cost) return false;

        set((prev) => ({
          resources: {
            ...prev.resources,
            coins: prev.resources.coins - cost,
          },
          inventory: [...prev.inventory, item],
          lastSavedTimestamp: Date.now(),
        }));

        soundFx.playCoin();
        return true;
      },

      equipItem: (unitId, item) => {
        set((prev) => {
          const slotKey = item.slot.toLowerCase() as 'tool' | 'armor' | 'relic';
          const updatedInventory = [...prev.inventory];
          // Remove equipped item from inventory
          const idx = updatedInventory.findIndex((i) => i.id === item.id);
          if (idx >= 0) updatedInventory.splice(idx, 1);

          const updatedRoster = prev.roster.map((unit) => {
            if (unit.id !== unitId) return unit;
            const curEquip = unit.equipment || {};
            const prevItem = curEquip[slotKey];
            if (prevItem) {
              updatedInventory.push(prevItem); // Return old item to inventory
            }

            const newEquipment = { ...curEquip, [slotKey]: item };
            let newMaxHp = unit.maxHp || 100;
            if (item.slot === 'ARMOR' && item.stats.bonusHp) {
              newMaxHp += item.stats.bonusHp;
            }
            return {
              ...unit,
              equipment: newEquipment,
              maxHp: newMaxHp,
              hp: Math.min(newMaxHp, (unit.hp || newMaxHp) + (item.stats.bonusHp || 0)),
            };
          });

          return {
            roster: updatedRoster,
            inventory: updatedInventory,
            lastSavedTimestamp: Date.now(),
          };
        });

        soundFx.playClick();
      },

      unequipItem: (unitId, slot) => {
        set((prev) => {
          const slotKey = slot.toLowerCase() as 'tool' | 'armor' | 'relic';
          const updatedInventory = [...prev.inventory];

          const updatedRoster = prev.roster.map((unit) => {
            if (unit.id !== unitId) return unit;
            const curEquip = unit.equipment || {};
            const unequipped = curEquip[slotKey];
            if (unequipped) {
              updatedInventory.push(unequipped);
            }

            const newEquipment = { ...curEquip };
            delete newEquipment[slotKey];
            return {
              ...unit,
              equipment: newEquipment,
            };
          });

          return {
            roster: updatedRoster,
            inventory: updatedInventory,
            lastSavedTimestamp: Date.now(),
          };
        });

        soundFx.playClick();
      },

      toggleAutoSetting: (key) => {
        set((prev) => ({
          autoSettings: {
            ...prev.autoSettings,
            [key]: !prev.autoSettings[key],
          },
        }));
        soundFx.playClick();
      },

      openRegressionModal: () => {
        set({ isRegressionModalOpen: true });
      },

      closeRegressionModal: () => {
        set({ isRegressionModalOpen: false });
      },

      dismissWave100Celebration: () => {
        set({ isWave100VictoryCelebration: false });
      },

      performRegression: () => {
        soundFx.playFanfare();
        set((prev) => {
          const newRecord: RegressionRecord = {
            id: `reg_${Date.now()}`,
            regressionIndex: prev.regressionCount + 1,
            waveReached: prev.invasion.waveNumber,
            phaseReached: prev.platformPhase,
            dayReached: prev.day,
            yearReached: prev.year,
            seasonReached: prev.season,
            invasionsRepelled: prev.invasion.invasionsRepelled,
            timestamp: Date.now(),
            completedWave100: prev.invasion.waveNumber >= 100,
          };

          // Regression bonuses survive, but the realm must be rebuilt from ruins.
          const bonusStartingCoins = 100 + (prev.regressionCount + 1) * 75;
          const bonusStartingShards = 50 + (prev.regressionCount + 1) * 25;
          const slime = prev.roster.find((unit) => unit.unitClass === 'AQUA_SLIME');
          const rebuildingRoster: UnitRosterItem[] = [{
            id: 'unit_slime_support_1',
            name: 'Support Healing Slime',
            unitClass: 'AQUA_SLIME',
            assignedTask: 'HEAL',
            hp: 9999,
            maxHp: 9999,
            slimeEvolutionLevel: slime?.slimeEvolutionLevel ?? 1,
            equipment: {},
          }];

          return {
            platformPhase: 1,
            day: 1,
            year: 1,
            season: 'SPRING',
            dayProgress: 0,
            timeOfDay: 'DAY',
            weather: 'CLEAR',
            ambientDarkness: 0,
            gameSpeed: 1,
            skillPoints: prev.skillPoints + 1,
            dynamicResourceNodes: { ...INITIAL_DYNAMIC_NODES },
            activeGodBlessings: { CELESTIAL_HARVEST: 0, AEGIS_WRATH: 0, TITAN_AWAKENING: 0 },
            isCastleBreachedModalOpen: false,
            lootedResources: null,
            offlineGains: null,
            isOfflineModalOpen: false,
            merchantRestockTimer: 90,
            regressionCount: prev.regressionCount + 1,
            regressionHistory: [newRecord, ...prev.regressionHistory],
            isRegressionModalOpen: false,
            isWave100VictoryCelebration: false,
            resources: {
              ...INITIAL_RESOURCES,
              coins: bonusStartingCoins,
              aetherShards: bonusStartingShards,
            },
            castleBuilt: false,
            resourceBuildings: { ...INITIAL_RESOURCE_BUILDINGS },
            roster: rebuildingRoster,
            workerCount: rebuildingRoster.length,
            defense: {
              ...INITIAL_DEFENSE,
              castleMaxHp: INITIAL_DEFENSE.castleMaxHp + (prev.regressionCount + 1) * 100,
              castleHp: 0,
            },
            invasion: {
              ...INITIAL_INVASION,
              waveNumber: 1,
              countdown: 150,
              maxCountdown: 150,
            },
            lastSavedTimestamp: Date.now(),
          };
        });

        get().unlockAchievement(
          'first_regression',
          'Eternal Regression',
          'Conquered the mortal world and regressed with the memories of the Demon Citadel.',
          '🌀'
        );
      },

      resetRegressionProgress: (confirmation: string): boolean => {
        if (confirmation.trim().toUpperCase() !== 'RESET REGRESSIONS') return false;
        const state = get();
        const castleMaxHp = Math.max(INITIAL_DEFENSE.castleMaxHp, state.defense.castleMaxHp - state.regressionCount * 100);
        set({
          regressionCount: 0,
          regressionHistory: [],
          skillPoints: 0,
          unlockedSkills: [],
          defense: { ...state.defense, castleMaxHp, castleHp: Math.min(state.defense.castleHp, castleMaxHp) },
          lastSavedTimestamp: Date.now(),
        });
        soundFx.playClick();
        return true;
      },

      resetRealm: () => {
        set({
          skillPoints: 0,
          unlockedSkills: [],
          difficulty: 'NORMAL',
          screen: 'TITLE',
          hasCompletedIntro: false,
          realmName: 'Kuta ng Kadiliman (Demon Realm)',
          resources: { ...INITIAL_RESOURCES },
          workerCount: INITIAL_ROSTER.length,
          roster: [...INITIAL_ROSTER],
          upgrades: { ...INITIAL_UPGRADES },
          castleBuilt: false,
          resourceBuildings: { ...INITIAL_RESOURCE_BUILDINGS },
          defense: { ...INITIAL_DEFENSE },
          invasion: { ...INITIAL_INVASION },
          inventory: [],
          autoSettings: { ...INITIAL_AUTO_SETTINGS },
          achievements: [],
          isCastleBreachedModalOpen: false,
          lootedResources: null,
          merchantRestockTimer: 90,
          timeOfDay: 'DAY',
          weather: 'CLEAR',
          ambientDarkness: 0,
          day: 1,
          year: 1,
          season: 'SPRING',
          dayProgress: 0,
          platformPhase: 1,
          regressionCount: 0,
          regressionHistory: [],
          isRegressionModalOpen: false,
          isWave100VictoryCelebration: false,
          discoveredBeasts: ['GOLEM', 'WAYFARER'],
          discoveredInvaders: [],
          promptedUpgrades: {},
          dynamicResourceNodes: { ...INITIAL_DYNAMIC_NODES },
          activeGodBlessings: {
            CELESTIAL_HARVEST: 0,
            AEGIS_WRATH: 0,
            TITAN_AWAKENING: 0,
          },
          gameSpeed: 1,
          lastSavedTimestamp: Date.now(),
          offlineGains: null,
          isOfflineModalOpen: false,
        });
      },

      replenishResourceNode: (task, newPoint) => {
        const state = get();
        if (!state.castleBuilt) return;
        if (task === 'WOOD' && state.resourceBuildings.WOOD.level < 1) return;
        if (task === 'STONE' && state.resourceBuildings.QUARRY.level < 1) return;
        if (task === 'ESSENCE' && state.resourceBuildings.PORT.level < 1) return;
        set((state) => ({
          dynamicResourceNodes: {
            ...state.dynamicResourceNodes,
            [task]: {
              x: newPoint.x,
              y: newPoint.y,
              qualityMultiplier: newPoint.qualityMultiplier ?? 1.25,
            },
          },
        }));
      },
    }),
    {
      name: 'isochronicle-realm-state',
      storage: createJSONStorage(() => localForageStorage),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<GameStoreState>;
        const savedRoster = persisted.roster ?? currentState.roster;
        const savedSlimes = savedRoster.filter((unit) => unit.unitClass === 'AQUA_SLIME');
        const permanentSlimes: UnitRosterItem[] = [
          { id: 'unit_slime_support_1', name: 'Support Healing Slime', unitClass: 'AQUA_SLIME', assignedTask: 'HEAL', hp: 9999, maxHp: 9999, slimeEvolutionLevel: savedSlimes[0]?.slimeEvolutionLevel ?? 1, equipment: {} },
        ];
        const roster = [
          ...savedRoster.filter((unit) => unit.unitClass !== 'AQUA_SLIME'),
          permanentSlimes[0],
        ];
        const resourceBuildings = persisted.resourceBuildings ?? { ...INITIAL_RESOURCE_BUILDINGS };

        return {
          ...currentState,
          ...persisted,
          ...normalizeSkillProgress(persisted),
          difficulty: normalizeDifficulty(persisted.difficulty),
          roster,
          workerCount: roster.length,
          castleBuilt: persisted.castleBuilt ?? ((persisted.defense?.castleHp ?? 0) > 0),
          resourceBuildings,
          showTileCoordinates: persisted.showTileCoordinates ?? true,
        };
      },
      partialize: (state) => ({
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
        showTileCoordinates: state.showTileCoordinates,
        defense: state.defense,
        invasion: state.invasion,
        achievements: state.achievements,
        inventory: state.inventory,
        autoSettings: state.autoSettings,
        day: state.day,
        year: state.year,
        season: state.season,
        platformPhase: state.platformPhase,
        regressionCount: state.regressionCount,
        regressionHistory: state.regressionHistory,
        lastSavedTimestamp: state.lastSavedTimestamp,
      }),
    }
  )
);

