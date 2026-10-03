import { CRAFTABLE_ITEMS, TASK_NODE_LOCATIONS, TREANT_EVOLUTION, UNIT_CLASSES, type EquipmentSlot } from '../../types/game';
import type { GameStoreState, ResourceBuildingId, ResourceBuildingState, TowerId } from '../../types/state';
import { useGameStore } from '../../state/useGameStore';
import { CASTLE_CONSTRUCTION_COST, RESOURCE_BUILDING_CONFIG, SPIRE_CONSTRUCTION_COST } from '../../state/economy';
import { canAfford } from '../../state/resources';
import { craftingCost } from '../../state/store/rosterSlice';
import { CONSTRUCTION_SECONDS, nextEntConstruction, nextGeneralToSummon } from '../../state/constructionProgress';
import { BUILDING_IDS, BUILDING_SITES, SPIRE_WORK_SPOT } from '../../state/buildingLayout';
import { DEFENSE_TEXT, buildingHpOf, buildingMaxHp, towerBuildingOf, towerLevelOf } from '../../state/defenseStats';
import { logMessage } from '../../state/activityLog';
import { IsometricHelper } from '../IsometricHelper';
import { soundFx } from '../audio/soundFx';
import { clampLevel } from './modifiers';
import type { EnrichableNode, WorkerContext, WorkerFrame, WorkerInstance } from './types';

const ENRICHABLE: EnrichableNode[] = ['AETHER', 'STONE', 'WOOD', 'ESSENCE'];

type TreantProfile = typeof TREANT_EVOLUTION[1];

const hpRatio = (b: ResourceBuildingState | undefined) =>
  buildingHpOf(b) / buildingMaxHp(towerLevelOf(b));

const isBuildingBuilt = (store: GameStoreState, id: TowerId): boolean => {
  if (id === 'SPIRE') return !!store.spireBuilt;
  return (store.resourceBuildings[id]?.level ?? 0) >= 1;
};

const isDamaged = (store: GameStoreState, id: TowerId): boolean => {
  if (!isBuildingBuilt(store, id)) return false;
  const b = towerBuildingOf(store, id);
  return !!b && buildingHpOf(b) < buildingMaxHp(towerLevelOf(b));
};

/** Everything the Ent repairs besides the citadel. */
const REPAIRABLE: TowerId[] = ['SPIRE', ...BUILDING_IDS];

const repairSpot = (id: TowerId) => (id === 'SPIRE' ? SPIRE_WORK_SPOT : BUILDING_SITES[id].workSpot);

const towerLabel = (id: TowerId, tl: boolean): { name: string; icon: string } => {
  if (id === 'SPIRE') return { name: tl ? DEFENSE_TEXT.spireName.tl : DEFENSE_TEXT.spireName.en, icon: '💎' };
  const cfg = RESOURCE_BUILDING_CONFIG[id];
  return { name: tl ? (cfg?.label ?? id) : (cfg?.labelEn ?? id), icon: cfg?.icon ?? '🏛️' };
};

/**
 * Walks the Ent to the castle or spire site and builds it once supplies allow.
 * Returns true while there is still construction to do (other duties wait).
 */
export function updateConstruction(
  ctx: WorkerContext,
  worker: WorkerInstance,
  store: GameStoreState,
  deltaSec: number,
  effectiveSpeed: number
): boolean {
  const site = nextEntConstruction(store);
  if (!site) return false;

  const target = IsometricHelper.gridToScreen(site.x, site.y);
  const distance = Math.hypot(target.x - worker.container.x, target.y - worker.container.y);
  worker.overrideEmote = '🔨';
  worker.overrideEmoteTimer = 400;
  if (distance > 20) {
    worker.status = 'MOVING_TO_NODE';
    ctx.moveToward(worker, target.x, target.y, effectiveSpeed * 1.1 * deltaSec, deltaSec);
    worker.constructionTimer = 0;
    return true;
  }

  const cost: Partial<typeof store.resources> = site.id === 'CASTLE' ? CASTLE_CONSTRUCTION_COST : SPIRE_CONSTRUCTION_COST;

  // Auto-buy missing shortfall materials if gold coins allow
  if (!canAfford(store.resources, cost)) {
    store.buyShortfall(cost);
  }

  const affordable = canAfford(store.resources, cost);
  worker.status = affordable ? 'HARVESTING' : 'IDLE';
  worker.constructionTimer = affordable ? (worker.constructionTimer ?? 0) + deltaSec : 0;
  if (worker.constructionTimer >= CONSTRUCTION_SECONDS) {
    worker.constructionTimer = 0;
    if (site.id === 'CASTLE') {
      const built = store.buildCastle();
      if (built) {
        ctx.spawnHarvestBurst(target.x, target.y - 15, 0x22c55e, 14);
        ctx.spawnFloatingPopup(target.x, target.y - 45, `Ancient Ent built Citadel Castle! 🏰`, '#86efac');
      }
    } else {
      const built = store.buildSpire();
      if (built) {
        ctx.spawnHarvestBurst(target.x, target.y - 15, 0x38bdf8, 16);
        ctx.spawnFloatingPopup(target.x, target.y - 45, `Ancient Ent raised Crystal Spire! 💎`, '#38bdf8');
        soundFx.playFanfare();
      }
    }
  }
  return true;
}

/** Sends the Ent to repair the castle (hull, then shield). */
const targetCastle = (ctx: WorkerContext, worker: WorkerInstance, actionTimer: number) => {
  worker.treantMode = 'REPAIR';
  worker.treantRepairId = undefined;
  worker.treantActionTimer = actionTimer;
  worker.treantTargetTile = { ...ctx.nexusGridPos };
};

/** Chooses the next job once the action timer runs out: castle → built establishment → enrich built node. */
function chooseTreantJob(
  ctx: WorkerContext,
  worker: WorkerInstance,
  store: GameStoreState,
  profile: TreantProfile
): void {
  const { castleHp, castleMaxHp, shieldHp, shieldMaxHp } = store.defense;
  if (castleHp < castleMaxHp || shieldHp < shieldMaxHp) {
    targetCastle(ctx, worker, castleHp <= 0 ? 4.0 : 8.0);
    return;
  }

  // Most damaged BUILT establishment or spire (wrecked ones first, only if already constructed)
  const damagedId = REPAIRABLE
    .filter((id) => isDamaged(store, id))
    .sort((a, b) => hpRatio(towerBuildingOf(store, a)) - hpRatio(towerBuildingOf(store, b)))[0];

  if (damagedId) {
    worker.treantMode = 'REPAIR';
    worker.treantRepairId = damagedId;
    worker.treantActionTimer = 8.0;
    worker.treantTargetTile = { ...repairSpot(damagedId) };
    return;
  }

  // Replenish & enrich a resource node ONLY for built establishments
  const availableEnrichNodes: EnrichableNode[] = [];
  if (store.spireBuilt) availableEnrichNodes.push('AETHER');
  if ((store.resourceBuildings['WOOD']?.level ?? 0) >= 1) availableEnrichNodes.push('WOOD');
  if ((store.resourceBuildings['QUARRY']?.level ?? 0) >= 1) availableEnrichNodes.push('STONE');
  if ((store.resourceBuildings['MINE']?.level ?? 0) >= 1) availableEnrichNodes.push('ESSENCE');

  if (availableEnrichNodes.length === 0) {
    // If no resource buildings are built yet, focus on Castle
    targetCastle(ctx, worker, 6.0);
    return;
  }

  worker.treantRepairId = undefined;
  worker.treantMode = 'REPLENISH';
  worker.treantActionTimer = profile.replenishCooldownSeconds + Math.random() * 4.0;

  const stock: Record<EnrichableNode, number> = {
    AETHER: store.resources.aetherShards,
    STONE: store.resources.stone,
    WOOD: store.resources.wood,
    ESSENCE: store.resources.arcaneEssence,
  };

  const targetType = Math.random() < 0.75
    ? availableEnrichNodes.reduce((lowest, c) => (stock[c] < stock[lowest] ? c : lowest), availableEnrichNodes[0])
    : availableEnrichNodes[Math.floor(Math.random() * availableEnrichNodes.length)];

  // Fixed location for resource landmark nodes
  const node = TASK_NODE_LOCATIONS[targetType];
  worker.treantTargetTile = { x: node.x, y: node.y };
  store.replenishResourceNode(targetType, { x: node.x, y: node.y, qualityMultiplier: profile.enrichmentMultiplier });

  const iso = IsometricHelper.gridToScreen(node.x, node.y);
  ctx.spawnFloatingPopup(iso.x, iso.y - 25, `🌱 Lv.${profile.level} Enriched ${targetType} (${profile.enrichmentMultiplier}x)!`, '#10b981');
}

/** The Ent's work pulse at its destination: repair a building, the castle, its shield, or bless the soil. */
function performTreantAction(ctx: WorkerContext, worker: WorkerInstance, store: GameStoreState, profile: TreantProfile): void {
  const { x, y } = worker.container;
  const repairId = worker.treantRepairId;

  if (worker.treantMode === 'REPAIR' && repairId) {
    // Patch up a damaged or wrecked establishment
    const restored = useGameStore.getState().restoreBuildingHp(repairId, profile.repairAmount);
    if (restored > 0) {
      ctx.spawnHarvestBurst(x, y - 15, 0x15803d, 6);
      soundFx.playHarvest('wood');
      const label = towerLabel(repairId, useGameStore.getState().language === 'TL');
      logMessage('buildingRepaired', { building: label.name },
        { mergeKey: `repair:${repairId}`, amount: restored, icon: label.icon });
    } else {
      worker.treantActionTimer = 0; // fully repaired: pick the next job
    }
    return;
  }

  if (worker.treantMode !== 'REPAIR') {
    // Nature regrowth bloom on resource node
    ctx.spawnHarvestBurst(x, y - 15, 0x10b981, 10);
    ctx.spawnFloatingPopup(x, y - 40, `✨ Soil Enriched (${profile.enrichmentMultiplier}x Yields)`, '#10b981');
    soundFx.playHarvest('wood');
    return;
  }

  const defense = store.defense;
  if (defense.castleHp < defense.castleMaxHp) {
    const nextHp = Math.min(defense.castleMaxHp, defense.castleHp + profile.repairAmount);
    useGameStore.setState((s) => ({ defense: { ...s.defense, castleHp: nextHp } }));
    ctx.spawnHarvestBurst(x, y - 15, 0x15803d, 6);
    ctx.spawnFloatingPopup(x, y - 40, `+${profile.repairAmount} Castle HP 🏰 (Lv.${profile.level})`, '#22c55e');
    soundFx.playHarvest('stone');
    return;
  }

  // Castle at 100% HP: Treant applies Ironbark Shield Fortification
  const shieldBonus = Math.round(profile.repairAmount * 0.75);
  const nextShield = Math.min(defense.shieldMaxHp, defense.shieldHp + shieldBonus);
  if (nextShield > defense.shieldHp) {
    useGameStore.setState((s) => ({ defense: { ...s.defense, shieldHp: nextShield } }));
    ctx.spawnHarvestBurst(x, y - 15, 0x38bdf8, 8);
    ctx.spawnFloatingPopup(x, y - 40, `🛡️ Ironbark Shield +${shieldBonus} (Lv.${profile.level})`, '#38bdf8');
    soundFx.playHarvest('crystal');
    return;
  }

  // Castle Fortification Upgrades (Wall / Beacon / Shield)
  if (store.resources.coins >= 80) {
    const upgraded = store.upgradeDefense('wallLevel') || store.upgradeDefense('shieldLevel') || store.upgradeDefense('beaconLevel');
    if (upgraded) {
      ctx.spawnHarvestBurst(x, y - 15, 0xa855f7, 10);
      ctx.spawnFloatingPopup(x, y - 45, `🏰 Ent Upgraded Castle Defense!`, '#c084fc');
      return;
    }
  }

  // Passive Citadel majesty coin tribute
  const tribute = Math.round(profile.level * 2);
  useGameStore.setState((s) => ({ resources: { ...s.resources, coins: s.resources.coins + tribute } }));
  ctx.spawnHarvestBurst(x, y - 15, 0xfbbf24, 6);
  ctx.spawnFloatingPopup(x, y - 40, `👑 Citadel Majesty Tribute (+${tribute}🪙)`, '#fbbf24');
}

/**
 * Ancient Ent Auto-Forge & Armory:
 * The Ancient Ent inspects fighting minions in the realm. When a minion lacks
 * gear or a stronger piece is craftable/purchasable, the Ancient Ent automatically
 * crafts from materials or purchases with coins and equips it to the minion.
 */
function autoForgeAndEquipByAncientEnt(
  ctx: WorkerContext,
  worker: WorkerInstance,
  store: GameStoreState
): void {
  const fighters = store.roster.filter(
    (u) => u.unitClass !== 'TREANT' && u.unitClass !== 'AQUA_SLIME'
  );
  if (fighters.length === 0) return;

  const slots: EquipmentSlot[] = ['TOOL', 'ARMOR', 'RELIC'];

  for (const fighter of fighters) {
    for (const slot of slots) {
      const slotKey = slot.toLowerCase() as 'tool' | 'armor' | 'relic';
      const currentItem = fighter.equipment?.[slotKey];

      // 1. Equip from existing inventory first
      const inInventory = store.inventory.find((i) => i.slot === slot);
      if (inInventory && !currentItem) {
        store.equipItem(fighter.id, inInventory);
        ctx.spawnHarvestBurst(worker.container.x, worker.container.y - 15, 0xa855f7, 6);
        ctx.spawnFloatingPopup(
          worker.container.x,
          worker.container.y - 45,
          `⚒️ Ent equipped ${inInventory.name}!`,
          '#c084fc'
        );
        return;
      }

      if (currentItem) continue;

      // 2. Craft or buy a missing piece for this slot
      const candidateItems = CRAFTABLE_ITEMS.filter((i) => i.slot === slot);
      for (const item of candidateItems) {
        const cost = craftingCost(item);
        if (canAfford(store.resources, cost)) {
          // Craft directly using stockpiled resources
          if (store.craftEquipment(item)) {
            store.equipItem(fighter.id, item);
            ctx.spawnHarvestBurst(worker.container.x, worker.container.y - 15, 0xa855f7, 10);
            ctx.spawnFloatingPopup(
              worker.container.x,
              worker.container.y - 45,
              `⚒️ Ent forged ${item.name}!`,
              '#c084fc'
            );
            return;
          }
        } else if (store.resources.coins >= (item.costCoins || 50)) {
          // Buy using surplus realm gold coins
          if (store.purchaseEquipment(item)) {
            store.equipItem(fighter.id, item);
            ctx.spawnHarvestBurst(worker.container.x, worker.container.y - 15, 0xfbbf24, 10);
            ctx.spawnFloatingPopup(
              worker.container.x,
              worker.container.y - 45,
              `🪙 Ent bought ${item.name}!`,
              '#fbbf24'
            );
            return;
          }
        }
      }
    }
  }
}

/**
 * Mother Ancient Ent: Life Giver & General Summoner.
 * After the castle and spire, the Ent's first duty is to call forth every
 * establishment's General, one at a time, in construction order. The founding
 * summon is free (the Ent gives life; it does not buy it), and the General then
 * builds its own establishment. Returns true while Generals are still missing.
 */
export function updateGeneralSummoning(
  ctx: WorkerContext,
  worker: WorkerInstance,
  store: GameStoreState,
  deltaSec: number,
  effectiveSpeed: number
): boolean {
  const next = nextGeneralToSummon(store);
  if (!next) return false;

  // The ritual happens at the citadel gate
  const target = IsometricHelper.gridToScreen(ctx.nexusGridPos.x, ctx.nexusGridPos.y);
  const distance = Math.hypot(target.x - worker.container.x, target.y - worker.container.y);
  worker.overrideEmote = '🌳';
  worker.overrideEmoteTimer = 400;
  if (distance > 35) {
    worker.status = 'MOVING_TO_NODE';
    ctx.moveToward(worker, target.x, target.y, effectiveSpeed * 1.1 * deltaSec, deltaSec);
    return true;
  }

  worker.status = 'HARVESTING';
  worker.autoSummonTimer = (worker.autoSummonTimer ?? 2.5) - deltaSec;
  if (worker.autoSummonTimer > 0) return true;
  worker.autoSummonTimer = 2.5;

  // Mother Ent channels life-giving nature magic to birth the General!
  worker.overrideEmoteTimer = 2200;
  ctx.spawnHarvestBurst(worker.container.x, worker.container.y - 18, 0x22c55e, 24);
  ctx.spawnHarvestBurst(worker.container.x, worker.container.y - 18, 0xfbbf24, 16);
  if (store.summonUnit(next.unitClass, undefined, true)) soundFx.playGolemCheer();
  return true;
}

/** Ancient Ent AI: invulnerable builder that constructs, repairs, fortifies, crafts gear, enriches and mothers/summons generals. */
export function updateTreant(ctx: WorkerContext, worker: WorkerInstance, frame: WorkerFrame): void {
  const { store, deltaSec, effectiveSpeed } = frame;
  worker.hp = worker.maxHp; // Builder cannot take damage or be killed
  worker.cargo = 0;
  worker.cargoIcon.setVisible(false);

  const profile = TREANT_EVOLUTION[clampLevel(worker.treantEvolutionLevel)];

  // ── Ancient Ent Auto-Forge & Armory Check ──
  worker.entGearTimer = (worker.entGearTimer ?? 3.0) - deltaSec;
  if (worker.entGearTimer <= 0) {
    worker.entGearTimer = 4.0;
    autoForgeAndEquipByAncientEnt(ctx, worker, store);
  }

  // Duties in order: castle & spire, then summon every General, then care for the realm
  if (updateConstruction(ctx, worker, store, deltaSec, effectiveSpeed)) return;
  if (updateGeneralSummoning(ctx, worker, store, deltaSec, effectiveSpeed)) return;

  if (worker.treantActionTimer === undefined) {
    worker.treantActionTimer = 5.0; // Initial check countdown
    worker.treantMode = 'REPAIR';
  }
  worker.treantActionTimer -= deltaSec;

  const { castleHp, castleMaxHp, shieldHp, shieldMaxHp } = store.defense;
  const isCastleCrushed = castleHp <= 0;
  const castleNeedsWork = castleHp < castleMaxHp || shieldHp < shieldMaxHp;

  if (store.invasion.isActive && castleNeedsWork) {
    // During an invasion, the Ent's primary job is to keep the castle standing:
    // repair the hull first, then restore its protective shield.
    targetCastle(ctx, worker, Math.min(worker.treantActionTimer, 0.25));
    worker.supportCooldown = Math.min(worker.supportCooldown, 0.25);
  } else if (isCastleCrushed && (worker.treantMode !== 'REPAIR' || worker.treantRepairId)) {
    targetCastle(ctx, worker, 4.0);
  } else if (worker.treantActionTimer <= 0) {
    chooseTreantJob(ctx, worker, store, profile);
  }

  // Walk toward the target
  const dest = worker.treantTargetTile || ctx.nexusGridPos;
  const destIso = IsometricHelper.gridToScreen(dest.x, dest.y);

  const dist = Math.hypot(destIso.x - worker.container.x, destIso.y - worker.container.y);
  if (dist > 35) {
    worker.status = 'MOVING_TO_NODE';
    ctx.moveToward(worker, destIso.x, destIso.y, effectiveSpeed * 1.1 * deltaSec, deltaSec);
    worker.overrideEmote = worker.treantMode === 'REPAIR' ? '🔨' : '🌱';
    worker.overrideEmoteTimer = 400;
    return;
  }

  // At destination: perform action
  worker.status = 'HARVESTING';
  worker.overrideEmote = worker.treantMode === 'REPAIR' ? '🏰' : '✨';
  worker.overrideEmoteTimer = 1200;
  worker.supportCooldown -= deltaSec;
  if (worker.supportCooldown <= 0) {
    worker.supportCooldown = profile.castleRepairCooldownSeconds;
    performTreantAction(ctx, worker, store, profile);
  }
}
