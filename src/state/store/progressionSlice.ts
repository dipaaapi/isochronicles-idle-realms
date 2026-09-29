import { soundFx } from '../../game/audio/soundFx';
import { ECONOMY_CONFIG, techUpgradeCost } from '../economy';
import { canAfford, subtractCost } from '../resources';
import { availableSkillPoints, canLearn, rankOf, type SkillId } from '../skillTree';
import {
  INITIAL_DEFENSE,
  INITIAL_INVASION,
  INITIAL_RESOURCES,
  INITIAL_RESOURCE_BUILDINGS,
  createInitialBlessings,
  createInitialProgress,
  createInitialResourceNodes,
  createInitialWorldClock,
  createSupportSlime,
  rollLayout,
} from './initialState';
import type { Achievement, GameStoreState, RegressionRecord, UpgradesState } from '../../types/state';
import type { SliceArgs } from './types';

const REGRESSION = ECONOMY_CONFIG.regression;

/** Skill tree, tech upgrades, achievements, Regression (prestige) and full resets. */
export const createProgressionSlice = (...[set, get]: SliceArgs) => ({
  learnSkill: (id: SkillId) => {
    const state = get();
    if (!canLearn(id, state.skillRanks, state.skillPoints)) return false;
    const skillRanks = { ...state.skillRanks, [id]: rankOf(state.skillRanks, id) + 1 };
    set({
      skillRanks,
      skillPoints: availableSkillPoints(state.invasion.invasionsRepelled, skillRanks),
      lastSavedTimestamp: Date.now(),
    });
    soundFx.playFanfare();
    return true;
  },

  resetSkills: () => {
    const state = get();
    set({
      skillRanks: {},
      skillPoints: availableSkillPoints(state.invasion.invasionsRepelled, {}),
      lastSavedTimestamp: Date.now(),
    });
    soundFx.playClick();
  },

  upgradeTech: (techKey: keyof UpgradesState): boolean => {
    const state = get();
    const currentLevel = state.upgrades[techKey];
    const cost = techUpgradeCost(currentLevel);
    if (!canAfford(state.resources, cost)) return false;

    set({
      resources: subtractCost(state.resources, cost),
      upgrades: { ...state.upgrades, [techKey]: currentLevel + 1 },
      lastSavedTimestamp: Date.now(),
    });
    soundFx.playFanfare();
    return true;
  },

  unlockAchievement: (id: string, title: string, description: string, icon: string) => {
    if (get().achievements.some((a) => a.id === id)) return;
    const achievement: Achievement = { id, title, description, icon, unlockedAt: Date.now() };
    set((prev) => ({ achievements: [...prev.achievements, achievement], lastSavedTimestamp: Date.now() }));
  },

  // ── Regression ────────────────────────────────────────────────────────────
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
      const nextCount = prev.regressionCount + 1;
      const record: RegressionRecord = {
        id: `reg_${Date.now()}`,
        regressionIndex: nextCount,
        waveReached: prev.invasion.waveNumber,
        phaseReached: prev.platformPhase,
        dayReached: prev.day,
        yearReached: prev.year,
        seasonReached: prev.season,
        invasionsRepelled: prev.invasion.invasionsRepelled,
        timestamp: Date.now(),
        completedWave100: prev.invasion.waveNumber >= ECONOMY_CONFIG.invasion.maxWave,
      };

      // Regression bonuses survive, but the realm must be rebuilt from ruins.
      const slime = prev.roster.find((unit) => unit.unitClass === 'AQUA_SLIME');
      const roster = [createSupportSlime(slime?.slimeEvolutionLevel)];

      // A new realm rises with a fresh random establishment layout
      const layoutSeed = rollLayout();

      return {
        ...createInitialWorldClock(),
        layoutSeed,
        platformPhase: 1,
        // Skills belong to a realm: refunded here and earned again from wave 1.
        // The new tier's permanent team boosts come from regressionCount.
        skillPoints: 0,
        skillRanks: {},
        dynamicResourceNodes: createInitialResourceNodes(),
        activeGodBlessings: createInitialBlessings(),
        isCastleBreachedModalOpen: false,
        lootedResources: null,
        offlineGains: null,
        isOfflineModalOpen: false,
        merchantRestockTimer: ECONOMY_CONFIG.merchantRestockSeconds,
        regressionCount: nextCount,
        regressionHistory: [record, ...prev.regressionHistory],
        isRegressionModalOpen: false,
        isWave100VictoryCelebration: false,
        resources: {
          ...INITIAL_RESOURCES,
          coins: REGRESSION.coinsBase + nextCount * REGRESSION.coinsPerRegression,
          aetherShards: REGRESSION.shardsBase + nextCount * REGRESSION.shardsPerRegression,
        },
        castleBuilt: false,
        resourceBuildings: { ...INITIAL_RESOURCE_BUILDINGS },
        roster,
        workerCount: roster.length,
        defense: {
          ...INITIAL_DEFENSE,
          castleMaxHp: INITIAL_DEFENSE.castleMaxHp + nextCount * REGRESSION.castleHpPerRegression,
          castleHp: 0,
        },
        invasion: { ...INITIAL_INVASION },
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
    const castleMaxHp = Math.max(
      INITIAL_DEFENSE.castleMaxHp,
      state.defense.castleMaxHp - state.regressionCount * REGRESSION.castleHpPerRegression
    );
    set({
      regressionCount: 0,
      regressionHistory: [],
      defense: { ...state.defense, castleMaxHp, castleHp: Math.min(state.defense.castleHp, castleMaxHp) },
      lastSavedTimestamp: Date.now(),
    });
    soundFx.playClick();
    return true;
  },

  /** Wipes all progress back to a brand-new realm; player preferences are kept. */
  resetRealm: () => {
    set({ ...createInitialProgress(), lastSavedTimestamp: Date.now() });
  },
}) satisfies Partial<GameStoreState>;
