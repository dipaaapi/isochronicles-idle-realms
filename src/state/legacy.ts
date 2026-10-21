import { localForageStorage } from './storageAdapter';
import type { Difficulty } from './difficulty';
import type { PlatformPhase } from '../types/state';
import { sanitizeAvatar, type Avatar } from './playerProfile';

/**
 * Hall of Legacy: every fallen run (the castle fell = game over, permadeath).
 * Stored on this device apart from the realm save (desktop: its own file),
 * so it outlives the run. When the Steam build is ready, `submitToSteam`
 * forwards each entry to a Steam leaderboard through the desktop bridge.
 */

export interface LegacyEntry {
  id: string;
  /** The run's id; an imported save of a fallen run is refused. */
  runId: string;
  lord: string;
  /** The player's profile picture / icon / General when the run fell. */
  avatar?: Avatar;
  realmName: string;
  difficulty: Difficulty;
  biome: PlatformPhase;
  /** Wave the castle fell on, and waves fully repelled. */
  waveReached: number;
  wavesCleared: number;
  /** In-game days survived. */
  days: number;
  /** Real time played (seconds) and the run's start / end. */
  playSeconds: number;
  startedAt: number;
  endedAt: number;
}

const KEY = 'isochronicle-hall-of-legacy';
/** Fallen run ids, cached once the hall is read (startup), for the sync save-import check. */
const fallen = new Set<string>();
export const isFallenRunSync = (runId: unknown): boolean => typeof runId === 'string' && fallen.has(runId);
const MAX_ENTRIES = 200;

export async function loadLegacy(): Promise<LegacyEntry[]> {
  try {
    const raw = await localForageStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    const out = Array.isArray(list)
      ? (list.filter((e) => e && typeof e.id === 'string') as LegacyEntry[]).map((e) => ({ ...e, lord: String(e.lord ?? '').slice(0, 32), avatar: sanitizeAvatar(e.avatar) }))
      : [];
    for (const e of out) fallen.add(e.runId);
    return out;
  } catch {
    return [];
  }
}

/** Ranking: most waves cleared, then most days, then the faster run. */
export const rankLegacy = (list: LegacyEntry[]): LegacyEntry[] =>
  [...list].sort((a, b) => b.wavesCleared - a.wavesCleared || b.days - a.days || a.playSeconds - b.playSeconds);

export async function recordLegacy(entry: LegacyEntry): Promise<void> {
  fallen.add(entry.runId);
  const list = await loadLegacy();
  if (list.some((e) => e.runId === entry.runId)) return;
  const next = rankLegacy([entry, ...list]).slice(0, MAX_ENTRIES);
  await Promise.resolve(localForageStorage.setItem(KEY, JSON.stringify(next))).catch(() => undefined);
  submitToSteam(entry);
}

/** True when this run already fell (its save can no longer be loaded). */
export async function isFallenRun(runId: string | undefined): Promise<boolean> {
  if (!runId) return false;
  return (await loadLegacy()).some((e) => e.runId === runId);
}

/** Steam leaderboard hook: the desktop bridge may expose it later; no-op until then. */
function submitToSteam(entry: LegacyEntry): void {
  const bridge = (globalThis as { isoDesktop?: { submitLeaderboard?: (e: LegacyEntry) => unknown } }).isoDesktop;
  try { void bridge?.submitLeaderboard?.(entry); } catch { /* Steam not ready */ }
}

export const newRunId = (): string => `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const formatPlayTime = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
};
