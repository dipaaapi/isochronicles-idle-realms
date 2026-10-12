import { create } from 'zustand';

/** Session-only bridge between the Phaser live camera and the React stream overlay. */
interface LiveFocusState {
  live: boolean;
  /** 0–1: how heated the fight on screen is (drives reaction rate). */
  intensity: number;
  /** Chess-style tile name of the fight (e.g. "E6"). */
  spot: string;
  /** Bumped when the player clicks the stream: the main camera flies to the fight. */
  focusTick: number;
  requestFocus: () => void;
  set: (patch: Partial<Omit<LiveFocusState, 'set'>>) => void;
}

export const useLiveFocus = create<LiveFocusState>((set) => ({
  live: false,
  intensity: 0,
  spot: '',
  focusTick: 0,
  requestFocus: () => set((s) => ({ focusTick: s.focusTick + 1 })),
  set: (patch) => set(patch),
}));
