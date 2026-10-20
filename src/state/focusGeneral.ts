import { create } from 'zustand';

export type GeneralSkillSlot = 'skill1' | 'skill2' | 'ultimate';

export interface SkillCooldown { left: number; total: number }

interface FocusGeneralState {
  /** The General the camera follows (← / →), or null. */
  generalId: string | null;
  unitClass: string | null;
  cooldowns: Record<GeneralSkillSlot, SkillCooldown> | null;
  /** Bumped by the HUD (button or F / G / H) to ask the scene to cast `castSlot`. */
  castTick: number;
  castSlot: GeneralSkillSlot | null;
  setFocus: (generalId: string | null, unitClass: string | null) => void;
  setCooldowns: (cooldowns: Record<GeneralSkillSlot, SkillCooldown> | null) => void;
  requestCast: (slot: GeneralSkillSlot) => void;
}

/**
 * Session-only bridge between the camera focus in MainScene and the HUD's
 * General skill panel (never persisted).
 */
export const useFocusGeneral = create<FocusGeneralState>((set) => ({
  generalId: null,
  unitClass: null,
  cooldowns: null,
  castTick: 0,
  castSlot: null,
  setFocus: (generalId, unitClass) => set({ generalId, unitClass, ...(generalId ? {} : { cooldowns: null }) }),
  setCooldowns: (cooldowns) => set({ cooldowns }),
  requestCast: (slot) => set((s) => ({ castTick: s.castTick + 1, castSlot: slot })),
}));
