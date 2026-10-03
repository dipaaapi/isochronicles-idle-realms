import { create } from 'zustand';

/** Living tenants per establishment, published by the Phaser DefenderSystem (not persisted). */
export interface TenantCount {
  living: number;
  garrisoned: number;
  max: number;
}

interface TenantCountsState {
  counts: Record<string, TenantCount>;
  publish: (counts: Record<string, TenantCount>) => void;
}

const same = (a: Record<string, TenantCount>, b: Record<string, TenantCount>): boolean => {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => b[k] && a[k].living === b[k].living && a[k].garrisoned === b[k].garrisoned && a[k].max === b[k].max);
};

export const useTenantCounts = create<TenantCountsState>((set, get) => ({
  counts: {},
  // Only notify React when a count actually changes
  publish: (counts) => {
    if (!same(get().counts, counts)) set({ counts });
  },
}));
