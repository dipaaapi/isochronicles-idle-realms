import { create } from 'zustand';

/** Live expedition readout the lair scene publishes for the React HUD (runtime only, never saved). */
export interface LairHudState {
  /** Furthest row the party front has reached (0..length-1). */
  frontY: number;
  alive: number;
  total: number;
  /** Seconds until the next fallen member returns (0 = none waiting). */
  nextRespawn: number;
  respawning: number;
  /** What holds the party right now: an obstacle id, 'END' at the chamber, or null while advancing. */
  holdingAt: string | null;
  /** 0..1 work / damage on the obstacle holding the party. */
  holdProgress: number;
  /** The player's Hold order: the party stops advancing (still repairs and fights). */
  hold: boolean;
  setHold: (hold: boolean) => void;
  publish: (s: Partial<Omit<LairHudState, 'publish' | 'setHold' | 'hold'>>) => void;
}

export const useLairHud = create<LairHudState>((set) => ({
  frontY: 0,
  alive: 0,
  total: 0,
  nextRespawn: 0,
  respawning: 0,
  holdingAt: null,
  holdProgress: 0,
  hold: false,
  setHold: (hold) => set({ hold }),
  publish: (s) => set(s),
}));
