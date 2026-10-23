import { soundFx } from '../../game/audio/soundFx';
import {
  DROP_MAX_TIER,
  MAX_TIER,
  MERGE_COUNT,
  RUNES,
  isUnusableRune,
  newRuneId,
  runeSellPrice,
  slottedIds,
  type Rune,
  type RuneKind,
  type RuneTarget,
} from '../runes';
import type { GameStoreState } from '../../types/state';
import type { SliceArgs } from './types';
import { logMessage } from '../activityLog';

/** Rune Vault: boss drops, slotting per target and three-into-one merges. */
export const createRunesSlice = (...[set, get]: SliceArgs) => ({
  grantRune: (kind: RuneKind, tier: number): Rune | null => {
    if (!RUNES[kind]) return null;
    const rune: Rune = { id: newRuneId(), kind, tier: Math.max(1, Math.min(DROP_MAX_TIER, Math.floor(tier))) };
    set((prev) => ({ runes: [...prev.runes, rune], lastSavedTimestamp: Date.now() }));
    return rune;
  },

  slotRune: (runeId: string, slotIndex?: number): boolean => {
    const state = get();
    const rune = state.runes.find((r) => r.id === runeId);
    if (!rune || slottedIds(state.runeSlots).has(runeId)) return false;
    const target: RuneTarget = RUNES[rune.kind].target;
    const row = [...state.runeSlots[target]];
    const index = slotIndex !== undefined && row[slotIndex] === null ? slotIndex : row.indexOf(null);
    if (index < 0) return false;
    row[index] = runeId;
    set({ runeSlots: { ...state.runeSlots, [target]: row }, lastSavedTimestamp: Date.now() });
    soundFx.playUpgrade();
    return true;
  },

  unslotRune: (runeId: string): boolean => {
    const state = get();
    const rune = state.runes.find((r) => r.id === runeId);
    if (!rune) return false;
    const target: RuneTarget = RUNES[rune.kind].target;
    if (!state.runeSlots[target].includes(runeId)) return false;
    set({
      runeSlots: { ...state.runeSlots, [target]: state.runeSlots[target].map((id) => (id === runeId ? null : id)) },
      lastSavedTimestamp: Date.now(),
    });
    soundFx.playClick();
    return true;
  },

  /**
   * Merges MERGE_COUNT runes of one kind and tier (slotted or not) into one of
   * the next tier. Slotted runes are used first, and the upgraded rune takes
   * the first one's slot, so its effect upgrades in place; the other slots used
   * are freed.
   */
  mergeRunes: (kind: RuneKind, tier: number): Rune | null => {
    if (tier >= MAX_TIER) return null;
    const state = get();
    const slotted = slottedIds(state.runeSlots);
    const pool = state.runes
      .filter((r) => r.kind === kind && r.tier === tier)
      .sort((a, b) => Number(slotted.has(b.id)) - Number(slotted.has(a.id)))
      .slice(0, MERGE_COUNT);
    if (pool.length < MERGE_COUNT) return null;
    const used = new Set(pool.map((r) => r.id));
    const merged: Rune = { id: newRuneId(), kind, tier: Math.min(MAX_TIER, tier + 1) };
    const target: RuneTarget = RUNES[kind].target;
    const keep = slotted.has(pool[0].id) ? pool[0].id : null;
    const row = state.runeSlots[target].map((id) => (keep && id === keep ? merged.id : id && used.has(id) ? null : id));
    set({
      runes: [...state.runes.filter((r) => !used.has(r.id)), merged],
      runeSlots: { ...state.runeSlots, [target]: row },
      lastSavedTimestamp: Date.now(),
    });
    soundFx.playEvolve();
    return merged;
  },

  /** Sells a vault rune (never a slotted one) for coins; returns the coins paid (0 = refused). */
  sellRune: (runeId: string): number => {
    const state = get();
    const rune = state.runes.find((r) => r.id === runeId);
    if (!rune || slottedIds(state.runeSlots).has(runeId)) return 0;
    const coins = runeSellPrice(rune.tier);
    set((prev) => ({
      runes: prev.runes.filter((r) => r.id !== runeId),
      resources: { ...prev.resources, coins: prev.resources.coins + coins },
      lastSavedTimestamp: Date.now(),
    }));
    soundFx.playCoin();
    logMessage('runeSold', { rune: RUNES[rune.kind].name, tier: rune.tier, coins });
    return coins;
  },

  /** Sells every rune that can no longer be used (see isUnusableRune). */
  sellObsoleteRunes: (): { count: number; coins: number } => {
    const state = get();
    const doomed = state.runes.filter((r) => isUnusableRune(r, state.runes, state.runeSlots));
    if (!doomed.length) return { count: 0, coins: 0 };
    const ids = new Set(doomed.map((r) => r.id));
    const coins = doomed.reduce((sum, r) => sum + runeSellPrice(r.tier), 0);
    set((prev) => ({
      runes: prev.runes.filter((r) => !ids.has(r.id)),
      resources: { ...prev.resources, coins: prev.resources.coins + coins },
      lastSavedTimestamp: Date.now(),
    }));
    soundFx.playCoin();
    logMessage('runesSoldBulk', { count: doomed.length, coins });
    return { count: doomed.length, coins };
  },
}) satisfies Partial<GameStoreState>;
