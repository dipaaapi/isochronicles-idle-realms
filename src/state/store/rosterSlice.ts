import { SEA_FOLK } from '../seaFolk';
import { soundFx } from '../../game/audio/soundFx';
import { isConstructionReady } from '../constructionProgress';
import {
  ECONOMY_CONFIG,
  getUnitSummonCost,
  maxUnitsOfClass,
  TENANTS_PER_ESTABLISHMENT,
  slimeEvolutionCost,
  slimeEvolutionKillsRequired,
} from '../economy';
import { addResourceDelta, canAfford, subtractCost } from '../resources';
import { BRAWL_CONFIG, addClash, applyBrawlResult, baseStatsOf, brawlLevelOf, pairKey } from '../brawl';
import { newRuneId, rollRuneKind } from '../runes';
import { clampSturdy, normalizeOrders, sturdyFromBonus, type GeneralOrder, type OrderScope } from '../generalOrders';
import { TREANT_EVOLUTION, UNIT_CLASSES } from '../../types/game';
import type { HarvestTask, InvaderType, UnitClass } from '../../types/game';
import type { GameStoreState, ResourceBuildingId, Resources, UnitRosterItem } from '../../types/state';
import type { SliceArgs } from './types';
import { crewGeneralOf } from '../establishmentCrews';

/** Castle (Nexus) / Refinery levels and required establishment a paid summon still needs, or null when unlocked. */
export const summonLock = (
  state: Pick<GameStoreState, 'upgrades'> & Partial<Pick<GameStoreState, 'spireBuilt' | 'resourceBuildings'>>,
  unitClass: UnitClass
): { nexus: number; refinery: number; building?: string } | null => {
  const cfg = UNIT_CLASSES[unitClass];
  const { upgrades } = state;
  if (upgrades.nexusLevel < cfg.requiredNexusLevel || upgrades.refineryLevel < cfg.requiredRefineryLevel) {
    return { nexus: cfg.requiredNexusLevel, refinery: cfg.requiredRefineryLevel };
  }
  if (cfg.requiredBuilding) {
    const isBuilt = cfg.requiredBuilding === 'SPIRE'
      ? !!state.spireBuilt
      : (state.resourceBuildings?.[cfg.requiredBuilding as ResourceBuildingId]?.level ?? 0) >= 1;
    if (!isBuilt) {
      return { nexus: cfg.requiredNexusLevel, refinery: cfg.requiredRefineryLevel, building: cfg.requiredBuilding };
    }
  }
  return null;
};

/** The General whose home is this establishment (one per establishment), or undefined if none lives there. */
export const generalOf = (buildingId: ResourceBuildingId): UnitClass | undefined => crewGeneralOf(buildingId);

/** Fighters the Slime can summon (rulers are unique and arrive on their own). */
export const FIGHTER_CLASSES = (Object.keys(UNIT_CLASSES) as UnitClass[]).filter((c) => UNIT_CLASSES[c].role === 'FIGHTER');

/** Minion roster, evolutions and the Bestiary. */
export const createRosterSlice = (...[set, get]: SliceArgs) => ({
  recordClash: (aId: string, bId: string, x: number, y: number) => {
    const key = pairKey(aId, bId);
    const next = addClash(get().brawlTension[key], x, y);
    set((prev) => ({ brawlTension: { ...prev.brawlTension, [key]: next } }));
    return next;
  },

  /** A Sea Folk kill: the roster unit that landed it gains +1 (boss kills +bossBonus), same badge as brawls. */
  awardSeaKill: (unitId: string, boss: boolean): boolean => {
    const unit = get().roster.find((u) => u.id === unitId);
    if (!unit) return false;
    const reward = SEA_FOLK.killReward;
    const levels = boss ? reward.bossBonus : 1;
    const base = baseStatsOf(unit);
    set((prev) => ({
      roster: prev.roster.map((u) => u.id !== unitId ? u : {
        ...u,
        brawlLevel: Math.min(BRAWL_CONFIG.maxLevel, brawlLevelOf(u) + levels),
        brawlAttack: (u.brawlAttack ?? 0) + Math.max(1, Math.round(base.attack * reward.attackShare * levels)),
        brawlHp: (u.brawlHp ?? 0) + Math.max(1, Math.round(base.hp * reward.hpShare * levels)),
      }),
      lastSavedTimestamp: Date.now(),
    }));
    return true;
  },

  /** Rank swap: a General takes over its promoted minion's + (attack / HP bonus recomputed from it). */
  setGeneralPlus: (unitId: string, level: number) => {
    const reward = SEA_FOLK.killReward;
    set((prev) => ({
      roster: prev.roster.map((u) => {
        if (u.id !== unitId) return u;
        const base = baseStatsOf(u);
        const lvl = Math.max(0, Math.min(BRAWL_CONFIG.maxLevel, Math.floor(level)));
        return { ...u, brawlLevel: lvl, brawlAttack: Math.round(base.attack * reward.attackShare * lvl), brawlHp: Math.round(base.hp * reward.hpShare * lvl) };
      }),
      lastSavedTimestamp: Date.now(),
    }));
  },

  resolveBrawl: (winnerId: string, loserId: string) => {
    set((prev) => {
      const brawlTension = { ...prev.brawlTension };
      delete brawlTension[pairKey(winnerId, loserId)];
      return { roster: applyBrawlResult(prev.roster, winnerId, loserId), brawlTension, lastSavedTimestamp: Date.now() };
    });
    get().unlockAchievement('first_brawl', '', '', '');
  },

  setGeneralOrder: (unitIds: string[], order: GeneralOrder) => {
    get().setGeneralOrders(unitIds, order === 'AUTO' ? [] : [order], 'GENERAL');
  },

  setGeneralOrders: (unitIds: string[], orders: GeneralOrder[], scope: OrderScope) => {
    const ids = new Set(unitIds);
    const list = normalizeOrders(orders);
    set((prev) => ({
      roster: prev.roster.map((u) => {
        if (!ids.has(u.id)) return u;
        const next = { ...u, order: undefined };
        if (scope !== 'MINIONS') next.orders = list;
        if (scope !== 'GENERAL') next.minionOrders = list;
        return next;
      }),
      lastSavedTimestamp: Date.now(),
    }));
  },

  /** The General's + bonus becomes extra max HP for its own establishment; the + resets. */
  investBrawlPower: (unitId: string): number => {
    const state = get();
    const unit = state.roster.find((u) => u.id === unitId);
    const home = unit ? (UNIT_CLASSES[unit.unitClass]?.requiredBuilding as ResourceBuildingId | undefined) : undefined;
    const building = home ? state.resourceBuildings[home] : undefined;
    if (!unit || !home || !building || building.level < 1) return 0;
    const before = building.sturdy ?? 0;
    const after = clampSturdy(before + sturdyFromBonus(unit.brawlAttack ?? 0, unit.brawlHp ?? 0));
    const added = after - before;
    if (added <= 0) return 0;
    set((prev) => ({
      roster: prev.roster.map((u) => (u.id === unitId ? { ...u, brawlLevel: 0, brawlAttack: 0, brawlHp: 0 } : u)),
      resourceBuildings: {
        ...prev.resourceBuildings,
        // The new HP arrives filled, so investing mid-fight also patches the walls
        [home]: { ...prev.resourceBuildings[home], sturdy: after, hp: (prev.resourceBuildings[home].hp ?? 0) + added },
      },
      lastSavedTimestamp: Date.now(),
    }));
    return added;
  },

  /**
   * A General at +10 may sell their accumulated + to the castle as runes.
   * Each level sold yields one random rune (tier 1). Resets the General's brawl bonus.
   * Returns the number of runes granted (0 if the General has no level to sell).
   */
  sellBrawlPlus: (unitId: string): number => {
    const unit = get().roster.find((u) => u.id === unitId);
    if (!unit) return 0;
    const level = brawlLevelOf(unit);
    if (level < BRAWL_CONFIG.maxLevel) return 0;
    // Grant one random tier-1 rune per + level sold
    const newRunes = Array.from({ length: level }, () => ({
      id: newRuneId(),
      kind: rollRuneKind(),
      tier: 1,
    }));
    set((prev) => ({
      roster: prev.roster.map((u) => (u.id === unitId ? { ...u, brawlLevel: 0, brawlAttack: 0, brawlHp: 0 } : u)),
      runes: [...prev.runes, ...newRunes],
      lastSavedTimestamp: Date.now(),
    }));
    soundFx.playUpgrade();
    return level;
  },

  discoverEntry: (category: 'beast' | 'invader', id: string) => {
    set((prev) => {
      if (category === 'beast') {
        if (prev.discoveredBeasts.includes(id as UnitClass)) return prev;
        soundFx.playFanfare();
        return { discoveredBeasts: [...prev.discoveredBeasts, id as UnitClass], lastSavedTimestamp: Date.now() };
      }
      if (prev.discoveredInvaders.includes(id as InvaderType)) return prev;
      soundFx.playFanfare();
      return { discoveredInvaders: [...prev.discoveredInvaders, id as InvaderType], lastSavedTimestamp: Date.now() };
    });
  },

  assignUnitTask: (unitId: string, task: HarvestTask) => {
    const target = get().roster.find((u) => u.id === unitId);
    // Slime is strictly a support healer and cannot gather resources
    if (target && target.unitClass === 'AQUA_SLIME') return;
    soundFx.playClick();
    set((state) => ({
      roster: state.roster.map((unit) => (unit.id === unitId ? { ...unit, assignedTask: task } : unit)),
      lastSavedTimestamp: Date.now(),
    }));
  },

  removeUnit: (unitId: string, refundResources: boolean = false) => {
    set((state) => {
      const unitToRemove = state.roster.find((u) => u.id === unitId);
      if (!unitToRemove || unitToRemove.unitClass === 'AQUA_SLIME') return state;

      const sameClassCount = state.roster.filter((u) => u.unitClass === unitToRemove.unitClass).length;
      const nextRoster = state.roster.filter((u) => u.id !== unitId);

      return {
        resources: refundResources
          ? addResourceDelta(state.resources, getUnitSummonCost(unitToRemove.unitClass, Math.max(0, sameClassCount - 1)))
          : state.resources,
        roster: nextRoster,
        workerCount: nextRoster.length,
        lastSavedTimestamp: Date.now(),
      };
    });
  },

  summonUnit: (unitClass: UnitClass, initialTask?: HarvestTask, isFreeCost?: boolean): boolean => {
    if (unitClass === 'AQUA_SLIME') return false;

    const state = get();
    if (unitClass !== 'TREANT' && !isConstructionReady(state)) return false;
    const countOfClass = state.roster.filter((u) => u.unitClass === unitClass && !u.parentBuildingId && !u.id.startsWith('tenant_')).length;
    if (countOfClass >= maxUnitsOfClass(unitClass)) return false;

    const config = UNIT_CLASSES[unitClass];
    // Requirements are bypassed for free summons from the Support Slime
    if (!isFreeCost && summonLock(state, unitClass)) return false;

    const cost = isFreeCost ? {} : getUnitSummonCost(unitClass, countOfClass);
    if (!canAfford(state.resources, cost)) return false;

    const newUnitId = `unit_${unitClass.toLowerCase()}_${Date.now()}`;
    const newUnit: UnitRosterItem = {
      id: newUnitId,
      name: `${config.nameEn} ${countOfClass + 1}`,
      unitClass,
      assignedTask: initialTask || config.preferredTask,
      treantEvolutionLevel: unitClass === 'TREANT' ? 1 : undefined,
    };
    const nextRoster = [...state.roster, newUnit];

    set({
      resources: subtractCost(state.resources, cost),
      roster: nextRoster,
      workerCount: nextRoster.length,
      lastSavedTimestamp: Date.now(),
    });

    get().discoverEntry('beast', unitClass);
    soundFx.playSummon();
    return true;
  },

  toggleAutoBuySummon: (unitClass: UnitClass) => {
    set((state) => ({ autoBuySummon: { ...state.autoBuySummon, [unitClass]: !state.autoBuySummon[unitClass] } }));
    soundFx.playClick();
  },

  summonWorker: (): boolean => get().summonUnit('GOLEM', 'AETHER'),

  upgradeSupportSlime: (): boolean => {
    const state = get();
    const slime = state.roster.find((unit) => unit.unitClass === 'AQUA_SLIME');
    if (!slime) return false;

    const currentLevel = slime.slimeEvolutionLevel ?? 1;
    if (currentLevel >= ECONOMY_CONFIG.slimeEvolution.maxLevel) return false;

    const cost = slimeEvolutionCost(currentLevel);
    if (!canAfford(state.resources, cost) ||
      state.invasion.invaderKills < slimeEvolutionKillsRequired(currentLevel)) return false;

    set({
      resources: subtractCost(state.resources, cost),
      roster: state.roster.map((unit) =>
        unit.unitClass === 'AQUA_SLIME'
          ? { ...unit, slimeEvolutionLevel: (unit.slimeEvolutionLevel ?? 1) + 1 }
          : unit
      ),
      lastSavedTimestamp: Date.now(),
    });
    soundFx.playEvolve();
    return true;
  },

  upgradeTreant: (): boolean => {
    const state = get();
    const treant = state.roster.find((unit) => unit.unitClass === 'TREANT');
    if (!treant) return false;

    const currentLevel = (treant.treantEvolutionLevel ?? 1) as 1 | 2 | 3 | 4 | 5;
    if (currentLevel >= 5) return false;

    const nextLevel = (currentLevel + 1) as 1 | 2 | 3 | 4 | 5;
    const cost = TREANT_EVOLUTION[currentLevel].upgradeCost;
    if (!canAfford(state.resources, cost)) return false;

    set({
      resources: subtractCost(state.resources, cost),
      roster: state.roster.map((unit) =>
        unit.unitClass === 'TREANT' ? { ...unit, treantEvolutionLevel: nextLevel } : unit
      ),
      lastSavedTimestamp: Date.now(),
    });
    soundFx.playEvolve();
    return true;
  },


}) satisfies Partial<GameStoreState>;
