import { soundFx } from '../../game/audio/soundFx';
import { isConstructionReady } from '../constructionProgress';
import {
  ECONOMY_CONFIG,
  getUnitSummonCost,
  maxUnitsOfClass,
  slimeEvolutionCost,
  slimeEvolutionKillsRequired,
} from '../economy';
import { addResourceDelta, canAfford, subtractCost } from '../resources';
import { TREANT_EVOLUTION, UNIT_CLASSES } from '../../types/game';
import type { EquipmentItem, EquipmentSlot, HarvestTask, InvaderType, UnitClass } from '../../types/game';
import type { GameStoreState, ResourceBuildingId, Resources, UnitRosterItem } from '../../types/state';
import type { SliceArgs } from './types';

/** Castle (Nexus) / Refinery levels a paid summon still needs, or null when unlocked. */
export const summonLock = (
  state: Pick<GameStoreState, 'upgrades' | 'resourceBuildings'>,
  unitClass: UnitClass
): { nexus: number; refinery: number; building?: ResourceBuildingId } | null => {
  const cfg = UNIT_CLASSES[unitClass];
  const { upgrades } = state;
  const homeMissing = !!cfg.requiredBuilding && (state.resourceBuildings[cfg.requiredBuilding]?.level ?? 0) < 1;
  return homeMissing || upgrades.nexusLevel < cfg.requiredNexusLevel || upgrades.refineryLevel < cfg.requiredRefineryLevel
    ? { nexus: cfg.requiredNexusLevel, refinery: cfg.requiredRefineryLevel, building: homeMissing ? cfg.requiredBuilding : undefined }
    : null;
};

/** Fighters the Slime can summon (rulers are unique and arrive on their own). */
export const FIGHTER_CLASSES = (Object.keys(UNIT_CLASSES) as UnitClass[]).filter((c) => UNIT_CLASSES[c].role === 'FIGHTER');

type EquipmentKey = 'tool' | 'armor' | 'relic';
const slotKeyOf = (slot: EquipmentSlot) => slot.toLowerCase() as EquipmentKey;

/** Crafting recipes name their costs differently from the Resources shape. */
export const craftingCost = (item: EquipmentItem): Partial<Resources> => ({
  aetherShards: item.costResources.shards,
  wood: item.costResources.wood,
  stone: item.costResources.stone,
  arcaneEssence: item.costResources.essence,
  obsidianShard: item.costResources.obsidian,
  soulFragments: item.costResources.souls,
  abyssalPearl: item.costResources.pearl,
  scrapMetal: item.costResources.scrap,
});

/** Minion roster, evolutions, equipment and the Bestiary. */
export const createRosterSlice = (...[set, get]: SliceArgs) => ({
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
    const countOfClass = state.roster.filter((u) => u.unitClass === unitClass).length;
    if (countOfClass >= maxUnitsOfClass(unitClass)) return false;

    const config = UNIT_CLASSES[unitClass];
    // Requirements are bypassed for free summons from the Support Slime
    if (!isFreeCost && summonLock(state, unitClass)) return false;

    const cost = isFreeCost ? {} : getUnitSummonCost(unitClass, countOfClass);
    if (!canAfford(state.resources, cost)) return false;

    const newUnitId = `unit_${unitClass.toLowerCase()}_${Date.now()}`;
    const newUnit: UnitRosterItem = {
      id: newUnitId,
      name: `${config.name} ${countOfClass + 1}`,
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
    if (unitClass === 'SUCCUBUS') soundFx.playFanfare();
    else soundFx.playGolemCheer();
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
    soundFx.playFanfare();
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
    soundFx.playFanfare();
    return true;
  },

  // Equipment & Crafting Actions
  craftEquipment: (item: EquipmentItem) => {
    const cost = craftingCost(item);
    if (!canAfford(get().resources, cost)) return false;

    set((prev) => ({
      resources: subtractCost(prev.resources, cost),
      inventory: [...prev.inventory, item],
      lastSavedTimestamp: Date.now(),
    }));

    soundFx.playFanfare();
    get().unlockAchievement(
      'master_smith',
      'Arcane Blacksmith',
      'Crafted an equipment piece for your realm constructs.',
      '⚒️'
    );
    return true;
  },

  purchaseEquipment: (item: EquipmentItem) => {
    const cost = item.costCoins || 50;
    if (get().resources.coins < cost) return false;

    set((prev) => ({
      resources: { ...prev.resources, coins: prev.resources.coins - cost },
      inventory: [...prev.inventory, item],
      lastSavedTimestamp: Date.now(),
    }));

    soundFx.playCoin();
    return true;
  },

  equipItem: (unitId: string, item: EquipmentItem) => {
    set((prev) => {
      const slotKey = slotKeyOf(item.slot);
      const inventory = prev.inventory.filter((i) => i.id !== item.id);

      const roster = prev.roster.map((unit) => {
        if (unit.id !== unitId) return unit;
        const curEquip = unit.equipment || {};
        const prevItem = curEquip[slotKey];
        if (prevItem) inventory.push(prevItem); // Return old item to inventory

        let maxHp = unit.maxHp || 100;
        if (item.slot === 'ARMOR' && item.stats.bonusHp) maxHp += item.stats.bonusHp;
        return {
          ...unit,
          equipment: { ...curEquip, [slotKey]: item },
          maxHp,
          hp: Math.min(maxHp, (unit.hp || maxHp) + (item.stats.bonusHp || 0)),
        };
      });

      return { roster, inventory, lastSavedTimestamp: Date.now() };
    });
    soundFx.playClick();
  },

  unequipItem: (unitId: string, slot: EquipmentSlot) => {
    set((prev) => {
      const slotKey = slotKeyOf(slot);
      const inventory = [...prev.inventory];

      const roster = prev.roster.map((unit) => {
        if (unit.id !== unitId) return unit;
        const equipment = { ...(unit.equipment || {}) };
        const unequipped = equipment[slotKey];
        if (unequipped) inventory.push(unequipped);
        delete equipment[slotKey];
        return { ...unit, equipment };
      });

      return { roster, inventory, lastSavedTimestamp: Date.now() };
    });
    soundFx.playClick();
  },

}) satisfies Partial<GameStoreState>;
