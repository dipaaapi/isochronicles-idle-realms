import localforage from 'localforage';
import type { PersistStorage, StateStorage, StorageValue } from 'zustand/middleware';

/** Persisted realm key. Bumped to -v2 on 2026-10-20 so every player starts fresh with seeded coastlines; the old save stays on disk unread. */
export const SAVE_KEY = 'isochronicle-realm-state-v2';

// Configure LocalForage to use IndexedDB as primary offline store
localforage.config({
  name: 'IsoChronicle_IdleRealms',
  storeName: 'realm_save_data',
  description: 'Local-first offline persistent realm save state',
});

/** Bridge exposed by electron/preload.cjs in the Steam build; absent in the browser. */
interface DesktopBridge {
  readSave: (key: string) => Promise<string | null>;
  writeSave: (key: string, value: string) => Promise<boolean>;
  removeSave: (key: string) => Promise<boolean>;
}
const desktop = (globalThis as { isoDesktop?: DesktopBridge }).isoDesktop;

/** Store keys become file names on desktop (saves/<key>.json). */
const fileKey = (name: string) => name.replace(/[^a-z0-9_-]/gi, '_');

/**
 * Desktop (Steam) saves: files in <AppData>/IsoChronicle/saves, synced by
 * Steam Auto-Cloud. The store persists on every change, so writes are
 * debounced (Steam Cloud and the disk only see a save every few seconds) and
 * flushed when the window closes. The first read migrates an existing
 * IndexedDB save so nobody loses progress moving to the desktop build.
 */
const SAVE_DEBOUNCE_MS = 3000;
/** Set by wipeAllSaveData: nothing may be written again before the page reloads. */
let wiped = false;
const pending = new Map<string, string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const flush = () => {
  flushTimer = null;
  if (wiped) { pending.clear(); return; }
  for (const [name, value] of pending) void desktop?.writeSave(fileKey(name), value);
  pending.clear();
};
if (desktop && typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
}

const desktopStorage = (bridge: DesktopBridge): StateStorage => ({
  getItem: async (name) => {
    if (pending.has(name)) return pending.get(name)!;
    const value = await bridge.readSave(fileKey(name));
    if (value !== null) return value;
    const legacy = await localforage.getItem<string>(name).catch(() => null);
    if (legacy) await bridge.writeSave(fileKey(name), legacy);
    return legacy ?? null;
  },
  setItem: async (name, value) => {
    if (wiped) return;
    pending.set(name, value);
    if (!flushTimer) flushTimer = setTimeout(flush, SAVE_DEBOUNCE_MS);
  },
  removeItem: async (name) => {
    pending.delete(name);
    await bridge.removeSave(fileKey(name));
    await localforage.removeItem(name).catch(() => undefined);
  },
});

const browserStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const value = await localforage.getItem<string>(name);
      return value ?? null;
    } catch (err) {
      console.warn('[IsoChronicle] Error reading from LocalForage, checking localStorage fallback:', err);
      return localStorage.getItem(name);
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (wiped) return;
    try {
      await localforage.setItem(name, value);
    } catch (err) {
      console.warn('[IsoChronicle] Error saving to LocalForage, writing to localStorage fallback:', err);
      localStorage.setItem(name, value);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await localforage.removeItem(name);
    } catch (err) {
      console.warn('[IsoChronicle] Error removing from LocalForage:', err);
      localStorage.removeItem(name);
    }
  },
};

export const localForageStorage: StateStorage = desktop ? desktopStorage(desktop) : browserStorage;

export async function hasSavedRealm(): Promise<boolean> {
  if (desktop) return (await localForageStorage.getItem(SAVE_KEY)) !== null;
  try {
    const raw = await localforage.getItem<string>(SAVE_KEY);
    if (raw) return true;
    const fallback = localStorage.getItem(SAVE_KEY);
    return !!fallback;
  } catch {
    return !!localStorage.getItem(SAVE_KEY);
  }
}

/** Every realm save key this game has used (the old one is still on disk for players who never reset). */
const ALL_SAVE_KEYS = [SAVE_KEY, 'isochronicle-realm-state'];

/**
 * Total wipe: every realm save (IndexedDB, desktop files, localStorage
 * fallback), every isochronicle_* setting (audio, graphics, FPS, music
 * library, tray state) and the session. Blocks further writes so the running
 * game can't save itself back before the caller reloads the page. The baked
 * sprite cache is kept: it holds no progress, only artwork.
 */
export async function wipeAllSaveData(): Promise<void> {
  wiped = true;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  pending.clear();
  if (desktop) for (const key of ALL_SAVE_KEYS) await desktop.removeSave(fileKey(key)).catch(() => false);
  await localforage.clear().catch(() => undefined);
  try {
    for (const key of Object.keys(localStorage)) if (key.toLowerCase().startsWith('isochronicle')) localStorage.removeItem(key);
  } catch { /* storage blocked */ }
  try { sessionStorage.clear(); } catch { /* storage blocked */ }
}

/** How often the realm is written to disk at most (the store changes several times per frame). */
const SAVE_EVERY_MS = 2000;

/**
 * Persist storage for the realm save. The store changes several times every
 * frame; serializing and queueing an IndexedDB write for each change piled up
 * faster than the browser could write and ran the tab out of memory. This
 * keeps only the latest state, serializes it at most every SAVE_EVERY_MS,
 * never starts a write while one is still running, and flushes when the tab
 * is hidden or closed.
 */
/**
 * Permadeath: when the castle falls the realm save is deleted and no realm
 * writes happen until a new run starts (resumeRealmSaves). Settings and the
 * Hall of Legacy are unaffected.
 */
let runEnded = false;
const flushers: Array<() => Promise<void>> = [];

export async function endRunSave(): Promise<void> {
  runEnded = true;
  for (const key of ALL_SAVE_KEYS) await Promise.resolve(localForageStorage.removeItem(key)).catch(() => undefined);
  try { localStorage.removeItem(SAVE_KEY); } catch { /* storage blocked */ }
}

export function resumeRealmSaves(): void {
  runEnded = false;
}

/** Writes the realm save now (used after every repelled wave). */
export async function saveNow(): Promise<void> {
  for (const f of flushers) await f();
}

export function createThrottledStorage<S>(): PersistStorage<S> {
  const latest = new Map<string, StorageValue<S>>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writing = false;
  const schedule = () => { if (!timer) timer = setTimeout(() => void flush(), SAVE_EVERY_MS); };
  const flush = async () => {
    timer = null;
    if (wiped || runEnded) { latest.clear(); return; }
    if (writing) { schedule(); return; }
    writing = true;
    const batch = [...latest];
    latest.clear();
    try {
      for (const [name, value] of batch) await localForageStorage.setItem(name, JSON.stringify(value));
    } catch (err) {
      console.warn('[IsoChronicle] Save failed:', err);
    } finally {
      writing = false;
    }
    if (latest.size) schedule();
  };
  flushers.push(async () => {
    if (timer) { clearTimeout(timer); timer = null; }
    await flush();
    if (!desktop || wiped || runEnded) return;
    // Desktop files are debounced too: push them out now
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    for (const [name, value] of pending) await desktop.writeSave(fileKey(name), value);
    pending.clear();
  });
  if (typeof window !== 'undefined') {
    const now = () => { if (latest.size && !writing) void flush(); };
    window.addEventListener('beforeunload', now);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && now());
  }
  return {
    getItem: async (name) => {
      const pending = latest.get(name);
      if (pending) return pending;
      const raw = await localForageStorage.getItem(name);
      if (!raw) return null;
      try { return JSON.parse(raw) as StorageValue<S>; } catch { return null; }
    },
    setItem: (name, value) => {
      if (wiped || runEnded) return;
      latest.set(name, value);
      schedule();
    },
    removeItem: async (name) => {
      latest.delete(name);
      await localForageStorage.removeItem(name);
    },
  };
}
