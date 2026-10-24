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
  /** Living dragon-faction creatures and human raiders. */
  foes: number;
  humans: number;
  /** The Matriarch battle is on; her HP and phase (from the store). */
  battle: boolean;
  dragonHp: number;
  dragonMaxHp: number;
  dragonPhase: number;
  /** Three-way battle: each side's remaining strength share (0..1), the side Ignara hunts and the side everyone gangs up on. */
  shares: Record<'DEMON' | 'DRAGON' | 'HUMAN', number>;
  dragonFocus: 'DEMON' | 'HUMAN';
  leader: 'DEMON' | 'DRAGON' | 'HUMAN' | null;
  /** The hoard granted when she fell (shown until the party returns). */
  victory?: Record<string, number>;
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
  foes: 0,
  humans: 0,
  battle: false,
  dragonHp: 0,
  dragonMaxHp: 0,
  dragonPhase: 0,
  shares: { DEMON: 1, DRAGON: 1, HUMAN: 1 },
  dragonFocus: 'DEMON',
  leader: null,
  victory: undefined,
  hold: false,
  setHold: (hold) => set({ hold }),
  publish: (s) => set(s),
}));
