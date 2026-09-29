import { soundFx } from '../../game/audio/soundFx';
import { calculateOfflineGains } from '../offlineProgression';
import { ECONOMY_CONFIG, RESOURCE_BUILDING_CONFIG, RESOURCE_PRICES, type TradeableResource } from '../economy';
import { addResourceDelta, canAfford, subtractCost } from '../resources';
import type { GameStoreState, Resources } from '../../types/state';
import type { SliceArgs } from './types';

/** Resource bookkeeping, the merchant, loot drops and offline gains. */
export const createEconomySlice = (...[set, get]: SliceArgs) => ({
  addResources: (delta: Partial<Resources>) => {
    set((state) => ({
      resources: addResourceDelta(state.resources, delta),
      lastSavedTimestamp: Date.now(),
    }));
  },

  spendResources: (cost: Partial<Resources>): boolean => {
    const current = get().resources;
    if (!canAfford(current, cost)) return false;
    set({ resources: subtractCost(current, cost), lastSavedTimestamp: Date.now() });
    return true;
  },

  // Merchant Store Actions
  sellResource: (resourceKey: TradeableResource, amount: number) => {
    const currentAmount = get().resources[resourceKey] ?? 0;
    if (!Number.isFinite(amount) || amount <= 0 || currentAmount < amount) return false;
    const earnings = amount * RESOURCE_PRICES[resourceKey].sell;

    set((prev) => ({
      resources: {
        ...prev.resources,
        [resourceKey]: (prev.resources[resourceKey] ?? 0) - amount,
        coins: prev.resources.coins + earnings,
      },
      lastSavedTimestamp: Date.now(),
    }));

    soundFx.playCoin();
    get().unlockAchievement(
      'first_trade',
      'Aether Merchant',
      'Completed your first resource trade at the merchant outpost.',
      '🪙'
    );
    return true;
  },

  buyResource: (resourceKey: TradeableResource, amount: number) => {
    if (!Number.isSafeInteger(amount) || amount <= 0) return false;
    const totalCost = amount * RESOURCE_PRICES[resourceKey].buy;
    if (!Number.isSafeInteger(totalCost) || get().resources.coins < totalCost) return false;

    set((prev) => ({
      resources: {
        ...prev.resources,
        coins: prev.resources.coins - totalCost,
        [resourceKey]: (prev.resources[resourceKey] ?? 0) + amount,
      },
      lastSavedTimestamp: Date.now(),
    }));

    soundFx.playCoin();
    return true;
  },

  tickMerchantTimer: (deltaSec: number) => {
    set((state) => {
      const next = state.merchantRestockTimer - deltaSec;
      return { merchantRestockTimer: next <= 0 ? ECONOMY_CONFIG.merchantRestockSeconds : next };
    });
  },

  /** Buys just the shortfall for a building's next level, if the coins cover all of it. */
  autoBuyMaterialsForUpgrade: (buildingId: keyof typeof RESOURCE_BUILDING_CONFIG) => {
    const state = get();
    const building = state.resourceBuildings[buildingId];
    const cost = building && RESOURCE_BUILDING_CONFIG[buildingId].costs[building.level];
    if (!cost) return;

    let totalCoinCost = 0;
    const needed: Partial<Resources> = {};
    for (const [key, amount] of Object.entries(cost) as [keyof Resources, number][]) {
      const shortage = amount - (state.resources[key] ?? 0);
      const price = RESOURCE_PRICES[key as TradeableResource];
      if (shortage > 0 && price) {
        totalCoinCost += shortage * price.buy;
        needed[key] = shortage;
      }
    }

    if (totalCoinCost === 0 || state.resources.coins < totalCoinCost) return;

    set((prev) => ({
      resources: addResourceDelta(prev.resources, { ...needed, coins: -totalCoinCost }),
      lastSavedTimestamp: Date.now(),
    }));
    soundFx.playCoin();
  },

  grantRandomLoot: () => {
    // Award a small randomised bundle of resources when scouts are slain
    const rand = () => Math.floor(Math.random() * 8) + 2;
    set((state) => ({
      resources: addResourceDelta(state.resources, {
        coins: rand() * 3,
        aetherShards: rand(),
        wood: rand(),
        stone: rand(),
        fish: Math.floor(Math.random() * 4),
      }),
      lastSavedTimestamp: Date.now(),
    }));
  },

  checkOfflineProgress: () => {
    const state = get();
    const gains = calculateOfflineGains(
      state.lastSavedTimestamp,
      state.workerCount,
      state.upgrades,
      state.unlockedSkills
    );

    if (gains && gains.elapsedSeconds > 15) {
      set((prev) => ({
        resources: addResourceDelta(prev.resources, {
          aetherShards: gains.aetherShardsEarned,
          wood: gains.woodEarned,
          stone: gains.stoneEarned,
        }),
        offlineGains: gains,
        isOfflineModalOpen: true,
        lastSavedTimestamp: Date.now(),
      }));
    } else {
      set({ lastSavedTimestamp: Date.now() });
    }
  },

  closeOfflineModal: () => set({ isOfflineModalOpen: false }),
}) satisfies Partial<GameStoreState>;
