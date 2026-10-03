import { soundFx } from '../../game/audio/soundFx';
import { calculateOfflineGains } from '../offlineProgression';
import { ECONOMY_CONFIG, RESOURCE_BUILDING_CONFIG, RESOURCE_PRICES, type TradeableResource } from '../economy';
import { addResourceDelta, canAfford, subtractCost } from '../resources';
import { teamBonuses } from '../skillTree';
import type { BattleEffect, BattleItemId, GameStoreState, ResourceBuildingId, TowerId, Resources } from '../../types/state';
import { isBuildingOperational, towerUpgradeCost } from '../defenseStats';
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

  buyShortfall: (cost: Partial<Resources>): boolean => {
    const state = get();
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

    if (totalCoinCost === 0 || state.resources.coins < totalCoinCost) return false;

    set((prev) => ({
      resources: addResourceDelta(prev.resources, { ...needed, coins: -totalCoinCost }),
      lastSavedTimestamp: Date.now(),
    }));
    soundFx.playCoin();
    return true;
  },

  /** Buys just the shortfall for a building's next level, if the coins cover all of it. */
  autoBuyMaterialsForUpgrade: (buildingId: TowerId) => {
    if (buildingId === 'SPIRE') {
      const spire = get().spireTower;
      const cost = towerUpgradeCost(buildingId, spire.towerLevel);
      if (cost) get().buyShortfall(cost);
      return;
    }
    const building = get().resourceBuildings[buildingId];
    const cost = building && RESOURCE_BUILDING_CONFIG[buildingId].costs[building.level];
    if (cost) get().buyShortfall(cost);
  },

  researchMunition: (kind: 'armorPiercing' | 'incendiary' | 'cryoFrost' | 'teslaChain' | 'voidFlak'): boolean => {
    const { munitions } = get();
    const level = munitions[kind];
    const cfg = ECONOMY_CONFIG.munitions;
    if (level >= cfg.maxLevel) return false;
    // Each level costs its base again (level 2 = 2× base, level 3 = 3× base)
    const cost = Object.fromEntries(
      Object.entries(cfg[kind].cost).map(([key, amount]) => [key, Number(amount) * (level + 1)])
    ) as Partial<Resources>;
    if (!get().spendResources(cost)) return false;
    set((prev) => ({ munitions: { ...prev.munitions, [kind]: level + 1 }, lastSavedTimestamp: Date.now() }));
    soundFx.playFanfare();
    return true;
  },

  useBattleItem: (item: BattleItemId): boolean => {
    const state = get();
    const cfg = ECONOMY_CONFIG.battleItems[item];
    
    // Check if we can afford it
    if (!get().spendResources(cfg.cost as Partial<Resources>)) return false;

    if (item === 'MINION_FRENZY') {
      set((prev) => ({ defense: { ...prev.defense, minionFrenzyTimer: 30 } }));
    } else if (item === 'FORCE_FIELD') {
      set((prev) => ({ defense: { ...prev.defense, forceFieldTimer: 15 } }));
    } else if (item === 'MASS_REGEN') {
      set((prev) => ({ defense: { ...prev.defense, massRegenTimer: 20 } }));
    } else if (item === 'SHIELD_OVERLOAD') {
      set((prev) => {
        const d = { ...prev.defense, shieldHp: prev.defense.shieldMaxHp };
        const b = { ...prev.resourceBuildings };
        for (const k of Object.keys(b)) {
           // wait, we can't fully heal buildings easily here because maxHp relies on towerLevel
           // I will just let the tick loop do a full heal or something, actually let's just heal a massive amount
        }
        return { defense: d };
      });
      // to heal buildings, we can use a small trick:
      for (const k of Object.keys(state.resourceBuildings)) {
        get().restoreBuildingHp(k as any, 99999);
      }
    } else if (item === 'CHRONO_SURGE') {
      set((prev) => {
        const cd = { ...prev.citadelSkillCooldowns };
        cd.overcharge = 0; cd.overdrive = 0; cd.resonance = 0;
        const estab = { ...prev.establishmentSkillCooldowns };
        for (const k of Object.keys(estab)) {
          estab[k as keyof typeof estab] = { skill1: 0, skill2: 0, skill3: 0 };
        }
        return { citadelSkillCooldowns: cd, establishmentSkillCooldowns: estab };
      });
    }

    set((prev) => ({ pendingBattleEffects: [...prev.pendingBattleEffects, item] }));
    soundFx.playFanfare();
    return true;
  },

  takeBattleEffects: (): BattleEffect[] => {
    const effects = get().pendingBattleEffects;
    if (effects.length > 0) set({ pendingBattleEffects: [] });
    return effects;
  },

  tickLandmarks: (deltaSeconds: number) => {
    const state = get();
    if (!state.castleBuilt) return;
    const yields = ECONOMY_CONFIG.landmarkYields as Record<string, Record<string, number>>;
    const delta: Partial<Resources> = {};
    for (const id of ['TRENCH', 'PERCH', 'KENNEL', 'FOUNDRY', 'PAVILION', 'VOIDGATE', 'OSSUARY'] as ResourceBuildingId[]) {
      const building = state.resourceBuildings[id];
      if (!isBuildingOperational(building)) continue;
      for (const [key, perMinute] of Object.entries(yields[id] ?? {})) {
        const k = key as keyof Resources;
        delta[k] = (delta[k] ?? 0) + (perMinute * building.level * deltaSeconds) / 60;
      }
    }
    // Fractions accumulate so slow yields (1 pearl a minute) still arrive
    const carry = { ...(state.landmarkCarry ?? {}) } as Record<string, number>;
    const whole: Partial<Resources> = {};
    for (const [key, amount] of Object.entries(delta)) {
      const total = (carry[key] ?? 0) + (amount as number);
      const gained = Math.floor(total);
      carry[key] = total - gained;
      if (gained > 0) whole[key as keyof Resources] = gained;
    }
    set((prev) => ({
      landmarkCarry: carry,
      ...(Object.keys(whole).length ? { resources: addResourceDelta(prev.resources, whole) } : {}),
    }));
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
      teamBonuses(state)
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
