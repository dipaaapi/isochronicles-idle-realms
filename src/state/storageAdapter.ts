import localforage from 'localforage';
import { StateStorage } from 'zustand/middleware';

// Configure LocalForage to use IndexedDB as primary offline store
localforage.config({
  name: 'IsoChronicle_IdleRealms',
  storeName: 'realm_save_data',
  description: 'Local-first offline persistent realm save state',
});

export const localForageStorage: StateStorage = {
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

export async function hasSavedRealm(): Promise<boolean> {
  try {
    const raw = await localforage.getItem<string>('isochronicle-realm-state');
    if (raw) return true;
    const fallback = localStorage.getItem('isochronicle-realm-state');
    return !!fallback;
  } catch {
    return !!localStorage.getItem('isochronicle-realm-state');
  }
}
