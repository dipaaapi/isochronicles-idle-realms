import { isCoveTile } from '../buildingLayout';
import { coolMagma, freshMagmaTile } from '../lairExpedition';
import { soundFx } from '../../game/audio/soundFx';
import { logMessage } from '../activityLog';
import { WILD_FACTIONS, clampMeter, wildTributeCost } from '../wildFactions';
import type { SliceArgs } from './types';
import reclamation from '../../data/terrainReclamation.json';

const BROOD = WILD_FACTIONS.BROOD;
const uniq = (keys: string[]) => [...new Set(keys)];

/**
 * Sand Brood meter / truce / tribute, and the living terrain: land the sea has
 * claimed (flooded), land the Leviathan is eating (flooding, becomes sea when
 * it dies or leaves) and sand the Ancient Caterpillar dug (settles back into
 * land after sandDays days). Tile keys are "x,y".
 */
export const createWildSlice = (...[set, get]: SliceArgs) => ({
  stirBrood: (amount: number) => {
    if (!amount) return;
    set((prev) => ({ broodUnrest: clampMeter(BROOD, prev.broodUnrest + amount) }));
  },

  offerBroodTribute: (): boolean => {
    const state = get();
    if (!state.spendResources(wildTributeCost(BROOD, state.broodUnrest))) return false;
    set({
      broodUnrest: clampMeter(BROOD, state.broodUnrest - BROOD.tribute.cleanse),
      broodTruceWaves: BROOD.tribute.truceWaves,
      lastSavedTimestamp: Date.now(),
    });
    soundFx.playFanfare();
    logMessage('broodTribute', { waves: BROOD.tribute.truceWaves });
    return true;
  },

  spendBroodTruceWave: () => {
    set((prev) => ({ broodTruceWaves: Math.max(0, prev.broodTruceWaves - 1) }));
  },

  /** The Caterpillar dug these land tiles into sand (today's day stamp). */
  digSand: (keys: string[]) => {
    if (!keys.length) return;
    set((prev) => {
      const terrainSand = { ...prev.terrainSand };
      for (const k of keys) if (!prev.terrainFlooded.includes(k)) terrainSand[k] = prev.day;
      return { terrainSand };
    });
  },

  /** The Leviathan is eating these shore tiles; they turn to sea once it is gone. */
  markFlooding: (keys: string[]) => {
    if (!keys.length) return;
    set((prev) => ({ terrainFlooding: uniq([...prev.terrainFlooding, ...keys.filter((k) => !prev.terrainFlooded.includes(k))]) }));
  },

  /** The Leviathan died or left: every tile it was eating becomes ocean for good. */
  floodPending: () => {
    set((prev) => {
      if (!prev.terrainFlooding.length) return prev;
      const terrainSand = { ...prev.terrainSand };
      for (const k of prev.terrainFlooding) delete terrainSand[k];
      return { terrainFlooded: uniq([...prev.terrainFlooded, ...prev.terrainFlooding]), terrainFlooding: [], terrainSand, lastSavedTimestamp: Date.now() };
    });
  },

  /**
   * The Ancient Caterpillar surfaced and heaved the ground around it:
   * sea it filled becomes sand (land), sand becomes plain land, land becomes
   * raised rock (only flyers cross it until the next day).
   */
  applyCarve: (carve: { filled: string[]; toSand: string[]; toLand: string[]; raised: string[] }) => {
    set((prev) => {
      const terrainSand = { ...prev.terrainSand };
      const terrainRaised = { ...prev.terrainRaised };
      for (const k of carve.toLand) delete terrainSand[k];
      for (const k of [...carve.filled, ...carve.toSand]) terrainSand[k] = prev.day;
      for (const k of carve.raised) terrainRaised[k] = prev.day;
      const filled = new Set(carve.filled);
      return {
        terrainSand,
        terrainRaised,
        terrainFilled: uniq([...prev.terrainFilled, ...carve.filled]),
        terrainFlooded: prev.terrainFlooded.filter((k) => !filled.has(k)),
        terrainReclaimed: prev.terrainReclaimed.filter((k) => !filled.has(k)),
        lastSavedTimestamp: Date.now(),
      };
    });
  },

  startTerrainReclamation: (source: string, target: string) => {
    set((prev) => prev.terrainReclamation ? prev : {
      terrainReclamation: { source, target, progress: 0, requiredWork: reclamation.requiredWork },
      lastSavedTimestamp: Date.now(),
    });
    logMessage('reclamationStarted');
  },

  advanceTerrainReclamation: (work: number) => {
    if (!(work > 0)) return;
    let completed = false;
    set((prev) => {
      const job = prev.terrainReclamation;
      if (!job) return prev;
      const progress = Math.min(job.requiredWork, job.progress + work);
      if (progress < job.requiredWork) return { terrainReclamation: { ...job, progress } };
      const terrainSand = { ...prev.terrainSand };
      delete terrainSand[job.source];
      terrainSand[job.target] = prev.day;
      const filled = new Set(prev.terrainFilled);
      filled.delete(job.source);
      filled.add(job.target);
      completed = true;
      return {
        terrainSand,
        terrainFilled: [...filled],
        terrainFlooded: uniq([...prev.terrainFlooded.filter((key) => key !== job.target), job.source]),
        terrainReclaimed: uniq([...prev.terrainReclaimed.filter((key) => key !== job.source), job.target]),
        terrainReclamation: null,
        lastSavedTimestamp: Date.now(),
      };
    });
    if (completed) logMessage('reclamationComplete');
  },

  spillMagma: (keys: string[]) => {
    if (!keys.length) return;
    set((prev) => {
      const volcanicMagma = { ...prev.volcanicMagma };
      for (const k of keys) volcanicMagma[k] = freshMagmaTile();
      return { volcanicMagma };
    });
  },

  coolVolcanicMagma: (dt: number) => {
    const prev = get();
    if (!(dt > 0) || Object.keys(prev.volcanicMagma).length === 0) return;
    const { tiles, done } = coolMagma(prev.volcanicMagma, dt);
    if (!done.length) {
      set({ volcanicMagma: tiles });
      return;
    }
    // Cooled basalt becomes plain land: flooded shore and coves are filled, dug / eaten sand settles
    // (never a tile the Sand God's reclamation is moving)
    const job = prev.terrainReclamation;
    const flooded = new Set(prev.terrainFlooded);
    const free = done.filter((k) => k !== job?.source && k !== job?.target);
    const restored = free.filter((k) => {
      const [x, y] = k.split(',').map(Number);
      return flooded.has(k) || isCoveTile(x, y) || k in prev.terrainSand;
    });
    if (!restored.length) {
      set({ volcanicMagma: tiles });
      return;
    }
    const back = new Set(restored);
    const filled = restored.filter((k) => !(k in prev.terrainSand) || flooded.has(k));
    set({
      volcanicMagma: tiles,
      terrainFlooded: prev.terrainFlooded.filter((k) => !back.has(k)),
      terrainFilled: uniq([...prev.terrainFilled, ...filled]),
      terrainSand: Object.fromEntries(Object.entries(prev.terrainSand).filter(([k]) => !back.has(k))),
      terrainReclaimed: prev.terrainReclaimed.filter((k) => !back.has(k)),
      lastSavedTimestamp: Date.now(),
    });
    logMessage('magmaLandRestored', { tiles: restored.length });
  },

  /** A new day: raised rock settles back into plain land. */
  liftRaised: () => {
    set((prev) => {
      const entries = Object.entries(prev.terrainRaised);
      const kept = entries.filter(([, day]) => day >= prev.day);
      return kept.length === entries.length ? prev : { terrainRaised: Object.fromEntries(kept) };
    });
  },

  /** Dug sand older than sandDays settles back into flat land. */
  settleSand: () => {
    const days = BROOD.terrain?.sandDays ?? 6;
    set((prev) => {
      const entries = Object.entries(prev.terrainSand);
      const kept = entries.filter(([, dug]) => prev.day - dug < days && prev.day >= dug);
      return kept.length === entries.length ? prev : { terrainSand: Object.fromEntries(kept) };
    });
  },
});
