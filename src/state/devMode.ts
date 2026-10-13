import { create } from 'zustand';

/**
 * Developer mode: only switchable from the Credits tab in a dev build
 * (`import.meta.env.DEV`), never persisted, so players can't reach it.
 * The flags are read by the store slices and the Phaser managers.
 */
interface DevModeState {
  enabled: boolean;
  /** Castle and establishments take no damage. */
  godMode: boolean;
  /** Every hit on an invader kills it. */
  oneHitKill: boolean;
  setEnabled: (on: boolean) => void;
  toggle: (flag: 'godMode' | 'oneHitKill') => void;
}

export const useDevMode = create<DevModeState>((set) => ({
  enabled: false,
  godMode: false,
  oneHitKill: false,
  setEnabled: (on) => set(on ? { enabled: true } : { enabled: false, godMode: false, oneHitKill: false }),
  toggle: (flag) => set((s) => ({ [flag]: !s[flag] } as Partial<DevModeState>)),
}));

export const devFlag = (flag: 'godMode' | 'oneHitKill'): boolean => {
  const s = useDevMode.getState();
  return s.enabled && s[flag];
};
