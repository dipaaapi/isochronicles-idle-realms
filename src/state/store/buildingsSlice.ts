import { soundFx } from '../../game/audio/soundFx';
import { ESTABLISHMENT_SKILLS } from '../../data/establishmentSkills';
import {
  DEFENSE_CONFIG,
  buildingHpOf,
  buildingMaxHp,
  buildingRepairCost,
  towerBuildingOf,
  towerLevelOf,
  towerUpgradeCost,
} from '../defenseStats';
import { CASTLE_CONSTRUCTION_COST, RESOURCE_BUILDING_CONFIG, SPIRE_CONSTRUCTION_COST } from '../economy';
import { INITIAL_RESOURCE_BUILDINGS, INITIAL_SPIRE_TOWER, applyRealmLayout } from './initialState';
import { BUILDING_IDS, BUILDING_SITES, canPlaceEstablishment } from '../buildingLayout';
import type { GameStoreState, ResourceBuildingId, ResourceBuildingsState, SpireTowerState, TowerId } from '../../types/state';
import type { SliceArgs } from './types';

/** Fills in fields older saves lack (the Mystic Cave, tower levels, structure HP). */
export const normalizeResourceBuildings = (raw?: Partial<ResourceBuildingsState>): ResourceBuildingsState => {
  const result = { ...INITIAL_RESOURCE_BUILDINGS };
  for (const id of Object.keys(INITIAL_RESOURCE_BUILDINGS) as ResourceBuildingId[]) {
    const saved = raw?.[id];
    if (!saved || !(saved.level >= 1)) {
      result[id] = { ...INITIAL_RESOURCE_BUILDINGS[id], ...(saved ?? {}) };
      continue;
    }
    const towerLevel = Math.max(1, Math.min(DEFENSE_CONFIG.towerMaxLevel, Math.floor(saved.towerLevel ?? 1)));
    result[id] = { ...saved, towerLevel, hp: buildingHpOf({ ...saved, towerLevel }) };
  }
  return result;
};

/** Fills in the spire tower for saves from before it could fight. */
export const normalizeSpireTower = (raw?: Partial<SpireTowerState>): SpireTowerState => {
  const towerLevel = Math.max(1, Math.min(DEFENSE_CONFIG.towerMaxLevel, Math.floor(raw?.towerLevel ?? 1)));
  const max = buildingMaxHp(towerLevel);
  return { towerLevel, hp: Math.max(0, Math.min(max, Math.round(raw?.hp ?? max))) };
};

/** Wrecked establishments get back a share of their HP when a wave ends. */
export const restoreWreckedBuildings = (buildings: ResourceBuildingsState): ResourceBuildingsState => {
  const result = { ...buildings };
  const fraction = DEFENSE_CONFIG.building.waveEndRestoreFraction;
  for (const id of Object.keys(result) as ResourceBuildingId[]) {
    const b = result[id];
    if (b.level < 1) continue;
    const max = buildingMaxHp(towerLevelOf(b));
    if (buildingHpOf(b) < max * fraction) {
      result[id] = { ...b, hp: Math.round(max * fraction) };
    }
  }
  return result;
};

/** The spire gets the same wave-end restore as the establishments. */
export const restoreWreckedSpire = (spire: SpireTowerState): SpireTowerState => {
  const min = Math.round(buildingMaxHp(spire.towerLevel) * DEFENSE_CONFIG.building.waveEndRestoreFraction);
  return spire.hp < min ? { ...spire, hp: min } : spire;
};

const hasTreant = (state: GameStoreState) => state.roster.some((unit) => unit.unitClass === 'TREANT');

/** Castle construction, establishments, their towers/HP and establishment skills. */
export const createBuildingsSlice = (...[set, get]: SliceArgs) => {
  /** Immutably patches one establishment. */
  const patchBuilding = (
    buildingId: ResourceBuildingId,
    patch: Partial<ResourceBuildingsState[ResourceBuildingId]>,
    save = true
  ) => {
    set((prev) => ({
      resourceBuildings: {
        ...prev.resourceBuildings,
        [buildingId]: { ...prev.resourceBuildings[buildingId], ...patch },
      },
      ...(save ? { lastSavedTimestamp: Date.now() } : {}),
    }));
  };

  /** Patches the tower level / HP of an establishment or the spire. */
  const patchTower = (id: TowerId, patch: { towerLevel?: number; hp?: number }, save = true) => {
    if (id !== 'SPIRE') {
      patchBuilding(id, patch, save);
      return;
    }
    set((prev) => ({
      spireTower: { ...prev.spireTower, ...patch },
      ...(save ? { lastSavedTimestamp: Date.now() } : {}),
    }));
  };

  return ({
    buildCastle: (): boolean => {
      const state = get();
      if (state.castleBuilt || !hasTreant(state)) return false;
      if (!get().spendResources(CASTLE_CONSTRUCTION_COST)) return false;

      set((prev) => ({
        castleBuilt: true,
        defense: { ...prev.defense, castleHp: prev.defense.castleMaxHp, shieldHp: prev.defense.shieldMaxHp },
        lastSavedTimestamp: Date.now(),
      }));
      soundFx.playBuildComplete();
      return true;
    },

    buildSpire: (): boolean => {
      const state = get();
      if (state.spireBuilt || !state.castleBuilt) return false;
      if (!get().spendResources(SPIRE_CONSTRUCTION_COST)) return false;
      set({ spireBuilt: true, spireTower: { ...INITIAL_SPIRE_TOWER }, lastSavedTimestamp: Date.now() });
      soundFx.playBuildComplete();
      return true;
    },

    upgradeResourceBuilding: (buildingId: ResourceBuildingId): boolean => {
      const config = RESOURCE_BUILDING_CONFIG[buildingId];
      if (!config) return false;
      const state = get();
      if ((buildingId as string) === 'SPIRE') {
        if (!state.spireBuilt) return false;
        const currentLevel = state.spireTower?.towerLevel ?? 1;
        const nextLevel = currentLevel + 1;
        const cost = config.costs[nextLevel - 1];
        if (!cost) return false;

        if (!get().spendResources(cost)) {
          get().buyShortfall(cost);
          if (!get().spendResources(cost)) return false;
        }

        patchTower('SPIRE', {
          towerLevel: nextLevel,
          hp: Math.min(buildingMaxHp(nextLevel), (state.spireTower.hp ?? 0) + (buildingMaxHp(nextLevel) - buildingMaxHp(currentLevel))),
        });
        soundFx.playUpgrade();
        return true;
      }

      const previous = state.resourceBuildings[buildingId];
      if (!previous) return false;
      const nextLevel = previous.level + 1;
      const cost = config.costs[nextLevel - 1];
      if (!cost) return false;

      // Auto-buy missing shortfall materials if coins allow
      if (!get().spendResources(cost)) {
        get().buyShortfall(cost);
        if (!get().spendResources(cost)) return false;
      }

      const towerLevel = Math.max(1, previous.towerLevel ?? 1);
      patchBuilding(buildingId, {
        level: nextLevel,
        unlockedOutputs: config.outputs.slice(0, nextLevel),
        towerLevel,
        // A new establishment starts at full health; production upgrades keep damage as-is
        hp: nextLevel === 1 ? buildingMaxHp(towerLevel) : buildingHpOf(previous),
      });
      soundFx.playUpgrade();
      return true;
    },

    upgradeTower: (buildingId: TowerId): boolean => {
      const building = towerBuildingOf(get(), buildingId);
      if (!building || building.level < 1) return false;
      const towerLevel = towerLevelOf(building);
      const cost = towerUpgradeCost(buildingId, towerLevel);
      if (!cost) return false;

      // Auto-buy missing shortfall materials if coins allow
      if (!get().spendResources(cost)) {
        get().buyShortfall(cost);
        if (!get().spendResources(cost)) return false;
      }

      const nextTower = towerLevel + 1;
      // Upgrades raise max HP and heal by the added amount
      const current = towerBuildingOf(get(), buildingId);
      const hp = buildingHpOf(current) + (buildingMaxHp(nextTower) - buildingMaxHp(towerLevel));
      patchTower(buildingId, { towerLevel: nextTower, hp });
      soundFx.playUpgrade();
      return true;
    },

    repairBuilding: (buildingId: TowerId): boolean => {
      const building = towerBuildingOf(get(), buildingId);
      if (!building || building.level < 1) return false;
      const max = buildingMaxHp(towerLevelOf(building));
      if (buildingHpOf(building) >= max) return false;
      if (!get().spendResources(buildingRepairCost())) return false;
      get().restoreBuildingHp(buildingId, Math.round(max * DEFENSE_CONFIG.building.repairFraction));
      soundFx.playHeal();
      return true;
    },

    damageBuilding: (buildingId: TowerId, amount: number): boolean => {
      const state = get();
      if (state.defense.forceFieldTimer > 0) return false;
      const building = towerBuildingOf(get(), buildingId);
      if (!building || building.level < 1 || !(amount > 0)) return false;
      const hp = buildingHpOf(building);
      if (hp <= 0) return false;
      const nextHp = Math.max(0, Math.round(hp - amount));
      patchTower(buildingId, { hp: nextHp }, false);
      return nextHp <= 0;
    },

    restoreBuildingHp: (buildingId: TowerId, amount: number): number => {
      const building = towerBuildingOf(get(), buildingId);
      if (!building || building.level < 1 || !(amount > 0)) return 0;
      const hp = buildingHpOf(building);
      const nextHp = Math.min(buildingMaxHp(towerLevelOf(building)), Math.round(hp + amount));
      if (nextHp <= hp) return 0;
      patchTower(buildingId, { hp: nextHp });
      return nextHp - hp;
    },

    replenishResourceNode: (
      task: 'AETHER' | 'STONE' | 'WOOD' | 'ESSENCE',
      newPoint: { x: number; y: number; qualityMultiplier?: number }
    ) => {
      const state = get();
      if (!state.castleBuilt) return;
      if (task === 'WOOD' && state.resourceBuildings.WOOD.level < 1) return;
      if (task === 'STONE' && state.resourceBuildings.QUARRY.level < 1) return;
      if (task === 'ESSENCE' && (state.resourceBuildings.CAVE?.level ?? 0) < 1) return;
      set((prev) => ({
        dynamicResourceNodes: {
          ...prev.dynamicResourceNodes,
          [task]: { x: newPoint.x, y: newPoint.y, qualityMultiplier: newPoint.qualityMultiplier ?? 1.25 },
        },
      }));
    },

    tickEstablishmentSkills: (deltaSeconds: number) => {
      set((state) => {
        const next = { ...state.establishmentSkillCooldowns };
        let changed = false;
        for (const id of Object.keys(next) as (ResourceBuildingId | 'CASTLE' | 'SPIRE')[]) {
          const current = next[id] ?? { skill1: 0, skill2: 0, skill3: 0 };
          const { skill1 = 0, skill2 = 0, skill3 = 0 } = current;
          const ns1 = Math.max(0, skill1 - deltaSeconds);
          const ns2 = Math.max(0, skill2 - deltaSeconds);
          const ns3 = Math.max(0, skill3 - deltaSeconds);
          if (ns1 !== skill1 || ns2 !== skill2 || ns3 !== skill3) {
            next[id] = { skill1: ns1, skill2: ns2, skill3: ns3 };
            changed = true;
          }
        }
        const cd = state.citadelSkillCooldowns;
        const citadel = cd.overdrive > 0 || cd.overcharge > 0 || cd.resonance > 0
          ? { citadelSkillCooldowns: { overdrive: Math.max(0, cd.overdrive - deltaSeconds), overcharge: Math.max(0, cd.overcharge - deltaSeconds), resonance: Math.max(0, cd.resonance - deltaSeconds) } }
          : {};
        return changed ? { establishmentSkillCooldowns: next, ...citadel } : { ...state, ...citadel };
      });
    },

    triggerEstablishmentSkill: (buildingId: ResourceBuildingId | 'CASTLE' | 'SPIRE', skillIndex: 0 | 1 | 2) => {
      const state = get();
      if (buildingId === 'CASTLE') {
        if (!state.castleBuilt) return false;
      } else if (buildingId === 'SPIRE') {
        if (!state.spireBuilt) return false;
      } else {
        const building = state.resourceBuildings[buildingId];
        if (!building || building.level < 1) return false;
      }

      const slot = skillIndex === 0 ? 'skill1' : skillIndex === 1 ? 'skill2' : 'skill3';
      const cds = state.establishmentSkillCooldowns[buildingId] ?? { skill1: 0, skill2: 0, skill3: 0 };
      if (cds[slot] > 0) return false;

      const skill = ESTABLISHMENT_SKILLS[buildingId]?.[slot];
      if (!skill) return false;

      set((prev) => ({
        pendingSkillCasts: [...prev.pendingSkillCasts, skill.id],
        establishmentSkillCooldowns: {
          ...prev.establishmentSkillCooldowns,
          [buildingId]: { ...(prev.establishmentSkillCooldowns[buildingId] ?? { skill1: 0, skill2: 0, skill3: 0 }), [slot]: skill.cooldownSeconds },
        },
      }));
      soundFx.playFanfare();
      return true;
    },

    takeSkillCasts: (): string[] => {
      const casts = get().pendingSkillCasts;
      if (casts.length > 0) set({ pendingSkillCasts: [] });
      return casts;
    },

    castAbyssalOverdrive: (): boolean => {
      const state = get();
      if (!state.castleBuilt || !state.invasion.isActive || state.citadelSkillCooldowns.overdrive > 0) return false;
      if (!get().spendResources({ aetherShards: 40 })) return false;
      set((prev) => ({
        pendingSkillCasts: [...prev.pendingSkillCasts, 'CASTLE_AEGIS_SHIELD'],
        citadelSkillCooldowns: { ...prev.citadelSkillCooldowns, overdrive: 40 },
      }));
      return true;
    },

    castArcaneOvercharge: (): boolean => {
      const state = get();
      if (!state.spireBuilt || state.citadelSkillCooldowns.overcharge > 0) return false;
      if (!get().spendResources({ coins: 60, arcaneEssence: 5 })) return false;
      set((prev) => ({
        pendingSkillCasts: [...prev.pendingSkillCasts, 'SPIRE_ARCANE_OVERCHARGE'],
        citadelSkillCooldowns: { ...prev.citadelSkillCooldowns, overcharge: 40 },
      }));
      return true;
    },

    castCrystalResonance: (): boolean => {
      const state = get();
      if (!state.spireBuilt || state.citadelSkillCooldowns.resonance > 0) return false;
      const amount = Math.round(state.defense.castleMaxHp * 0.25);
      if (state.defense.castleHp >= state.defense.castleMaxHp) return false;
      set((prev) => ({
        defense: { ...prev.defense, castleHp: Math.min(prev.defense.castleMaxHp, prev.defense.castleHp + amount) },
        citadelSkillCooldowns: { ...prev.citadelSkillCooldowns, resonance: 70 },
      }));
      soundFx.playFanfare();
      return true;
    },

    relocateBuilding: (buildingId: ResourceBuildingId) => {
      // Castle is permanently fixed at center — cannot be relocated
      if ((buildingId as string) === 'CASTLE') return false;
      const building = get().resourceBuildings[buildingId];
      if (!building || building.level < 1) return false;

      // Relocation is a visual-only effect: WorkerManager picks a new position
      // and calls replenishResourceNode. We just signal the event by a small HP bump.
      const maxHp = buildingMaxHp(towerLevelOf(building));
      if (buildingHpOf(building) < maxHp) {
        get().restoreBuildingHp(buildingId, Math.round(maxHp * 0.05));
      }
      soundFx.playClick();
      return true;
    },

    // ── Establishment Modal Actions ──────────────────────────────────────────
    openEstablishmentModal: (id: 'CASTLE' | TowerId) => {
      set({ selectedEstablishmentId: id });
    },

    relocateEstablishment: (id: ResourceBuildingId | 'SPIRE', x: number, y: number): boolean => {
      const state = get();
      if (state.invasion.isActive || !canPlaceEstablishment(id, x, y)) return false;
      // Pin every establishment where it stands so moving one never reshuffles the others
      const pinned: typeof state.buildingPositions = {};
      for (const other of BUILDING_IDS) pinned[other] = { x: BUILDING_SITES[other].footprint.x, y: BUILDING_SITES[other].footprint.y };
      const positions = { ...state.buildingPositions, ...pinned, [id]: { x, y } };
      set({ ...applyRealmLayout(state.layoutSeed, positions, state.dynamicResourceNodes), lastSavedTimestamp: Date.now() });
      soundFx.playFanfare();
      return true;
    },

    closeEstablishmentModal: () => {
      set({ selectedEstablishmentId: null });
    },

    toggleBuildingAutoBuy: (buildingId: TowerId) => {
      set((state) => ({
        autoBuyBuildingMaterials: {
          ...state.autoBuyBuildingMaterials,
          [buildingId]: !state.autoBuyBuildingMaterials[buildingId],
        },
      }));
      soundFx.playClick();
    },
  }) satisfies Partial<GameStoreState>;
};
