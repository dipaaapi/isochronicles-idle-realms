import { create } from 'zustand';
import TUTORIAL from '../data/tutorial.json';
import { useWorldHold } from './worldHold';

/**
 * First-run tutorial: a step-by-step spotlight over the HUD (`ui/TutorialOverlay.tsx`,
 * steps in `data/tutorial.json`). The world is frozen while it runs. Finishing or
 * skipping it is remembered on the device; Settings can replay it.
 */
export type TutorialStep = (typeof TUTORIAL.steps)[number];
export const TUTORIAL_STEPS: readonly TutorialStep[] = TUTORIAL.steps;

const DONE_KEY = 'isochronicle_tutorial_done';

export const isTutorialDone = (): boolean => {
  try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return false; }
};

interface TutorialState {
  active: boolean;
  step: number;
  start: () => void;
  next: () => void;
  back: () => void;
  /** Finish or skip: unfreeze the world and remember it. */
  end: () => void;
}

export const useTutorial = create<TutorialState>((set, get) => ({
  active: false,
  step: 0,
  start: () => {
    useWorldHold.getState().setTutorial(true);
    set({ active: true, step: 0 });
  },
  next: () => {
    const { step } = get();
    if (step >= TUTORIAL_STEPS.length - 1) get().end();
    else set({ step: step + 1 });
  },
  back: () => set((s) => ({ step: Math.max(0, s.step - 1) })),
  end: () => {
    try { localStorage.setItem(DONE_KEY, '1'); } catch { /* private mode: it shows again next time */ }
    useWorldHold.getState().setTutorial(false);
    set({ active: false, step: 0 });
  },
}));
