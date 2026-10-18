import localforage from 'localforage';
import { StateStorage } from 'zustand/middleware';

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
const pending = new Map<string, string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const flush = () => {
  flushTimer = null;
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
  if (desktop) return (await localForageStorage.getItem('isochronicle-realm-state')) !== null;
  try {
    const raw = await localforage.getItem<string>('isochronicle-realm-state');
    if (raw) return true;
    const fallback = localStorage.getItem('isochronicle-realm-state');
    return !!fallback;
  } catch {
    return !!localStorage.getItem('isochronicle-realm-state');
  }
}
