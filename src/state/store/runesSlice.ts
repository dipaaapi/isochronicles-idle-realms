import { soundFx } from '../../game/audio/soundFx';
import {
  DROP_MAX_TIER,
  MAX_TIER,
  MERGE_COUNT,
  RUNES,
  newRuneId,
  slottedIds,
  type Rune,
  type RuneKind,
  type RuneTarget,
} from '../runes';
import type { GameStoreState } from '../../types/state';
import type { SliceArgs } from './types';

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
}) satisfies Partial<GameStoreState>;
