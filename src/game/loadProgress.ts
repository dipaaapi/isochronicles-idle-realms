import { create } from 'zustand';

/**
 * What the loading screen waits for before handing the realm to the player:
 * the baked character sheets and structure strips (Web Workers) and the
 * world scene itself. Baked art is cached per page load, so a remount after
 * Regression finishes almost at once.
 */
export type LoadTask = 'characters' | 'structures';

interface LoadProgressState {
  tasks: Record<LoadTask, { done: number; total: number }>;
  sceneReady: boolean;
  setTotal: (task: LoadTask, total: number) => void;
  setDone: (task: LoadTask, done: number) => void;
  setSceneReady: (ready: boolean) => void;
}

export const useLoadProgress = create<LoadProgressState>((set) => ({
  tasks: { characters: { done: 0, total: 0 }, structures: { done: 0, total: 0 } },
  sceneReady: false,
  setTotal: (task, total) => set((s) => ({ tasks: { ...s.tasks, [task]: { ...s.tasks[task], total } } })),
  setDone: (task, done) => set((s) => ({ tasks: { ...s.tasks, [task]: { ...s.tasks[task], done } } })),
  setSceneReady: (sceneReady) => set({ sceneReady }),
}));

/** 0..1 over every step (each bake counts per sheet, the scene counts as a few). */
export const loadFraction = (s: Pick<LoadProgressState, 'tasks' | 'sceneReady'>): number => {
  const sceneWeight = 4;
  const total = s.tasks.characters.total + s.tasks.structures.total + sceneWeight;
  const done = s.tasks.characters.done + s.tasks.structures.done + (s.sceneReady ? sceneWeight : 0);
  // Totals arrive when the bakes start; until then we are still booting
  if (s.tasks.characters.total === 0 || s.tasks.structures.total === 0) return Math.min(0.05, done / total);
  return Math.min(1, done / total);
};

export const isLoadComplete = (s: Pick<LoadProgressState, 'tasks' | 'sceneReady'>): boolean =>
  s.sceneReady &&
  s.tasks.characters.total > 0 && s.tasks.characters.done >= s.tasks.characters.total &&
  s.tasks.structures.total > 0 && s.tasks.structures.done >= s.tasks.structures.total;
