import { create } from 'zustand';

// Node test VMs have no Vite define; treat them as dev so the flags stay testable
export const DEV_TOOLS: boolean = typeof __DEV_TOOLS__ === 'undefined' ? true : __DEV_TOOLS__;

/**
 * Developer mode: only switchable from the Credits tab in the dev server,
 * never persisted. `DEV_TOOLS` is a compile-time constant (vite.config.ts),
 * so release and Steam builds can't turn it on, even from the console.
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
  setEnabled: (on) => set(on && DEV_TOOLS ? { enabled: true } : { enabled: false, godMode: false, oneHitKill: false }),
  toggle: (flag) => set((s) => ({ [flag]: !s[flag] } as Partial<DevModeState>)),
}));

export const devFlag = (flag: 'godMode' | 'oneHitKill'): boolean => {
  const s = useDevMode.getState();
  return DEV_TOOLS && s.enabled && s[flag];
};
