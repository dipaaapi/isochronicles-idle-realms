import { recommendedFps } from './deviceProfile';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { soundFx } from '../game/audio/soundFx';
import type { GameStoreState } from '../types/state';
import { createInitialProgress } from './store/initialState';
import { createBuildingsSlice } from './store/buildingsSlice';
import { createDefenseSlice } from './store/defenseSlice';
import { createEconomySlice } from './store/economySlice';
import { createPersistenceSlice, persistOptions } from './store/persistence';
import { createProgressionSlice } from './store/progressionSlice';
import { createRosterSlice } from './store/rosterSlice';
import { TARGET_FPS_STORAGE_KEY, createWorldSlice } from './store/worldSlice';
import type { StoreGet, StoreSet } from './store/types';

/**
 * The single persistent game store. State shape and actions are declared in
 * GameStoreState (src/types/state.ts); each domain's actions live in a slice
 * under src/state/store/, and new-game values in store/initialState.ts.
 */

// Re-exported so UI / game code keeps importing from one place.
export { RESOURCE_PRICES, RESOURCE_BUILDING_CONFIG, CASTLE_CONSTRUCTION_COST } from './economy';
export { INITIAL_AUTO_BUY_BUILDING } from './store/initialState';
export { getPhaseFromWave } from './store/defenseSlice';
export { getSeasonFromDay } from './store/worldSlice';

/** Player preferences — kept across resetRealm, not part of createInitialProgress. */
const createPreferences = () => ({
  language: 'EN' as const,
  isAudioMuted: soundFx.getIsMuted(),
  isGoreEnabled: false,
  targetFps: (Number(localStorage.getItem(TARGET_FPS_STORAGE_KEY)) || recommendedFps()) as 30 | 60 | 90,
  showFpsDebug: false,
  showTileCoordinates: true,
  measuredFps: 60,
  lastSavedTimestamp: Date.now(),
});

const createGameStore = (set: StoreSet, get: StoreGet): GameStoreState => ({
  ...createInitialProgress(),
  ...createPreferences(),
  ...createWorldSlice(set, get),
  ...createEconomySlice(set, get),
  ...createRosterSlice(set, get),
  ...createBuildingsSlice(set, get),
  ...createDefenseSlice(set, get),
  ...createProgressionSlice(set, get),
  ...createPersistenceSlice(set, get),
});

export const useGameStore = create<GameStoreState>()(persist(createGameStore, persistOptions));
