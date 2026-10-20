import { soundFx } from '../../game/audio/soundFx';
import { logMessage } from '../activityLog';
import { SEA_FOLK, clampContamination, seaTributeCost } from '../seaFolk';
import type { SliceArgs } from './types';

/** Sea Folk: how poisoned the sea is, and the tribute that buys a truce. */
export const createSeaSlice = (...[set, get]: SliceArgs) => ({
  /** War spills into the sea (waves, brawls, fires, deaths); negative values let it heal. */
  stirSea: (amount: number) => {
    if (!amount) return;
    set((prev) => ({ seaContamination: clampContamination(prev.seaContamination + amount) }));
  },

  /** Pays the Sea Folk off: cleanses the water and buys a truce for the next waves. */
  offerSeaTribute: (): boolean => {
    const state = get();
    const cost = seaTributeCost(state.seaContamination);
    if (!state.spendResources(cost)) return false;
    set({
      seaContamination: clampContamination(state.seaContamination - SEA_FOLK.tribute.cleanse),
      seaTruceWaves: SEA_FOLK.tribute.truceWaves,
      lastSavedTimestamp: Date.now(),
    });
    soundFx.playFanfare();
    logMessage('seaTribute', { waves: SEA_FOLK.tribute.truceWaves });
    return true;
  },

  /** A wave began: one truce wave is used up. */
  spendSeaTruceWave: () => {
    set((prev) => ({ seaTruceWaves: Math.max(0, prev.seaTruceWaves - 1) }));
  },
});
