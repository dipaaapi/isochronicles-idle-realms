import { useGameStore } from './useGameStore';
import { DIFFICULTIES, type Difficulty } from './difficulty';
import { INITIAL_RESOURCES } from './store/initialState';
import type { PlatformPhase, Resources } from '../types/state';

/**
 * Starts a realm under the given name, difficulty and biome: scales the new-game
 * stockpile (only on a fresh realm; Start New Realm keeps an existing save) and
 * begins a new permadeath run. Shared by the intro and the Game Over auto-restart.
 */
export function startRealm(difficulty: Difficulty, biome: PlatformPhase, lordName: string): void {
  const supplies = DIFFICULTIES[difficulty].startingSupplies;
  useGameStore.setState((s) => {
    const untouched = (Object.keys(INITIAL_RESOURCES) as (keyof Resources)[]).every(
      (k) => (s.resources[k] ?? 0) === (INITIAL_RESOURCES[k] ?? 0)
    );
    if (s.castleBuilt || !untouched) return { difficulty };
    const resources = { ...s.resources };
    (Object.keys(INITIAL_RESOURCES) as (keyof Resources)[]).forEach((k) => {
      const base = INITIAL_RESOURCES[k] ?? 0;
      resources[k] = Math.max(0, (resources[k] ?? 0) + Math.round(base * (supplies - 1)));
    });
    return { difficulty, resources };
  });
  // A brand-new realm starts a new permadeath run under this name, in the chosen biome
  const st = useGameStore.getState();
  st.setRealmChoice(biome);
  if (!st.castleBuilt || !st.runId) st.beginRun(lordName);
}
