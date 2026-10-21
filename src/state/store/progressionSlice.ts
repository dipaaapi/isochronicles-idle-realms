import { soundFx } from '../../game/audio/soundFx';
import { difficultyChangeCost } from '../difficultyChange';
import { normalizeDifficulty, type Difficulty } from '../difficulty';
import { logMessage } from '../activityLog';
import { techUpgradeCost } from '../economy';
import { canAfford, subtractCost } from '../resources';
import { availableSkillPoints, canLearn, rankOf, type SkillId } from '../skillTree';
import { createInitialProgress } from './initialState';
import { achievementDef, unlockSteamAchievement } from '../achievements';
import type { Achievement, GameStoreState, UpgradesState } from '../../types/state';
import { newRunId } from '../legacy';
import { resumeRealmSaves } from '../storageAdapter';
import type { SliceArgs } from './types';

/** Skill tree, tech upgrades, achievements, the permadeath run and full resets. */
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
    soundFx.playSkillLearn();
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
    const currentLevel = state.upgrades[techKey] ?? 1;
    const cost = techUpgradeCost(techKey, currentLevel);
    if (!canAfford(state.resources, cost)) return false;

    set({
      resources: subtractCost(state.resources, cost),
      upgrades: { ...state.upgrades, [techKey]: currentLevel + 1 },
      lastSavedTimestamp: Date.now(),
    });
    soundFx.playUpgrade();
    return true;
  },

  unlockAchievement: (id: string, title: string, description: string, icon: string) => {
    if (get().achievements.some((a) => a.id === id)) return;
    const def = achievementDef(id);
    const achievement: Achievement = {
      id,
      title: def?.en.title ?? title,
      description: def?.en.desc ?? description,
      icon: def?.icon ?? icon,
      unlockedAt: Date.now(),
    };
    set((prev) => ({ achievements: [...prev.achievements, achievement], lastSavedTimestamp: Date.now() }));
    unlockSteamAchievement(id);
  },

  beginRun: (lordName: string) => {
    resumeRealmSaves();
    set({
      lordName: lordName.trim().slice(0, 32) || 'Demon Lord',
      runId: newRunId(),
      runStartedAt: Date.now(),
      playSeconds: 0,
      gameOverRun: null,
      lastSavedTimestamp: Date.now(),
    });
  },

  changeDifficulty: (next: Difficulty): boolean => {
    const state = get();
    const from = normalizeDifficulty(state.difficulty);
    if (from === next) return false;
    const cost = difficultyChangeCost(from, next, state.invasion.waveNumber);
    if (!get().spendResources(cost)) return false;
    set({ difficulty: next, lastSavedTimestamp: Date.now() });
    logMessage('difficultyChanged', { difficulty: next });
    soundFx.playUpgrade();
    return true;
  },

  addPlayTime: (seconds: number) => {
    if (!(seconds > 0)) return;
    set((prev) => ({ playSeconds: prev.playSeconds + seconds }));
  },

  dismissGameOver: () => {
    set({ gameOverRun: null });
  },

  /** Wipes all progress back to a brand-new realm; player preferences are kept. */
  resetRealm: () => {
    set({ ...createInitialProgress(), lastSavedTimestamp: Date.now() });
  },
}) satisfies Partial<GameStoreState>;
