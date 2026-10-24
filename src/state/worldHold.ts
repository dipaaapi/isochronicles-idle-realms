import { create } from 'zustand';

/**
 * Reasons the world is frozen regardless of the game speed: the loading
 * screen is still up, or the tutorial is running. While held the scenes skip
 * their simulation (no waves, no clock, no payouts) and the run clock stops.
 */
interface WorldHoldState {
  loading: boolean;
  tutorial: boolean;
  setLoading: (loading: boolean) => void;
  setTutorial: (tutorial: boolean) => void;
}

export const useWorldHold = create<WorldHoldState>((set) => ({
  loading: false,
  tutorial: false,
  setLoading: (loading) => set({ loading }),
  setTutorial: (tutorial) => set({ tutorial }),
}));

export const isWorldHeld = (): boolean => {
  const s = useWorldHold.getState();
  return s.loading || s.tutorial;
};
