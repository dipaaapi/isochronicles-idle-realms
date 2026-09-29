import { TASK_NODE_LOCATIONS, TREANT_EVOLUTION } from '../../types/game';
import type { GameStoreState, ResourceBuildingId } from '../../types/state';
import { useGameStore } from '../../state/useGameStore';
import { CASTLE_CONSTRUCTION_COST, RESOURCE_BUILDING_CONFIG } from '../../state/economy';
import { canAfford } from '../../state/resources';
import { CONSTRUCTION_SECONDS, nextConstruction } from '../../state/constructionProgress';
import { BUILDING_IDS, BUILDING_SITES } from '../../state/buildingLayout';
import { buildingHpOf, buildingMaxHp, towerLevelOf } from '../../state/defenseStats';
import { logMessage } from '../../state/activityLog';
import { IsometricHelper } from '../IsometricHelper';
import { soundFx } from '../audio/soundFx';
import { clampLevel } from './modifiers';
import type { EnrichableNode, WorkerContext, WorkerFrame, WorkerInstance } from './types';

const ENRICHABLE: EnrichableNode[] = ['AETHER', 'STONE', 'WOOD', 'ESSENCE'];

type TreantProfile = typeof TREANT_EVOLUTION[1];

const hpRatio = (b: GameStoreState['resourceBuildings'][ResourceBuildingId]) =>
  buildingHpOf(b) / buildingMaxHp(towerLevelOf(b));

const isDamaged = (b: GameStoreState['resourceBuildings'][ResourceBuildingId] | undefined) =>
  !!b && b.level >= 1 && buildingHpOf(b) < buildingMaxHp(towerLevelOf(b));

/**
 * Walks the Ent to the next unbuilt structure and builds it once supplies allow.
 * Returns true while there is still construction to do (other duties wait).
 */
export function updateConstruction(
  ctx: WorkerContext,
  worker: WorkerInstance,
  store: GameStoreState,
  deltaSec: number,
  effectiveSpeed: number
): boolean {
  // Finish initial construction before repairs, enrichment or fortification.
  const site = nextConstruction(store);
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

  const cost = site.id === 'CASTLE' ? CASTLE_CONSTRUCTION_COST : RESOURCE_BUILDING_CONFIG[site.id].costs[0];
  const affordable = canAfford(store.resources, cost);
  worker.status = affordable ? 'HARVESTING' : 'IDLE';
  worker.constructionTimer = affordable ? (worker.constructionTimer ?? 0) + deltaSec : 0;
  if (worker.constructionTimer >= CONSTRUCTION_SECONDS) {
    const built = site.id === 'CASTLE' ? store.buildCastle() : store.upgradeResourceBuilding(site.id);
    worker.constructionTimer = 0;
    if (built) {
      ctx.spawnHarvestBurst(target.x, target.y - 15, 0x22c55e, 12);
      ctx.spawnFloatingPopup(target.x, target.y - 45, `Ent built ${site.label}!`, '#86efac');
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

/** Chooses the next job once the action timer runs out: castle → establishment → enrich a node. */
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

  // Most damaged establishment (wrecked ones first)
  const damagedId = BUILDING_IDS
    .filter((id) => isDamaged(store.resourceBuildings[id]))
    .sort((a, b) => hpRatio(store.resourceBuildings[a]) - hpRatio(store.resourceBuildings[b]))[0];

  if (damagedId) {
    worker.treantMode = 'REPAIR';
    worker.treantRepairId = damagedId;
    worker.treantActionTimer = 8.0;
    worker.treantTargetTile = { ...BUILDING_SITES[damagedId].workSpot };
    return;
  }

  // Replenish & enrich a resource node: 75% the lowest stockpile, 25% random
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
    ? ENRICHABLE.reduce((lowest, c) => (stock[c] < stock[lowest] ? c : lowest), ENRICHABLE[0])
    : ENRICHABLE[Math.floor(Math.random() * ENRICHABLE.length)];

  // Fixed location for resource landmark nodes (no random movement across map!)
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
      const cfg = RESOURCE_BUILDING_CONFIG[repairId];
      logMessage('buildingRepaired', { building: useGameStore.getState().language === 'TL' ? cfg.label : cfg.labelEn },
        { mergeKey: `repair:${repairId}`, amount: restored, icon: cfg.icon });
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

  // Passive Citadel majesty coin tribute
  const tribute = Math.round(profile.level * 2);
  useGameStore.setState((s) => ({ resources: { ...s.resources, coins: s.resources.coins + tribute } }));
  ctx.spawnHarvestBurst(x, y - 15, 0xfbbf24, 6);
  ctx.spawnFloatingPopup(x, y - 40, `👑 Citadel Majesty Tribute (+${tribute}🪙)`, '#fbbf24');
}

/** Ancient Ent AI: invulnerable builder that constructs, repairs, fortifies and enriches. */
export function updateTreant(ctx: WorkerContext, worker: WorkerInstance, frame: WorkerFrame): void {
  const { store, deltaSec, effectiveSpeed } = frame;
  worker.hp = worker.maxHp; // Builder cannot take damage or be killed
  worker.cargo = 0;
  worker.cargoIcon.setVisible(false);

  const profile = TREANT_EVOLUTION[clampLevel(worker.treantEvolutionLevel)];
  if (updateConstruction(ctx, worker, store, deltaSec, effectiveSpeed)) return;

  if (worker.treantActionTimer === undefined) {
    worker.treantActionTimer = 5.0; // Initial check countdown
    worker.treantMode = 'REPAIR';
  }
  worker.treantActionTimer -= deltaSec;

  const { castleHp, castleMaxHp, shieldHp, shieldMaxHp } = store.defense;
  const isCastleCrushed = castleHp <= 0;
  const castleNeedsWork = castleHp < castleMaxHp || shieldHp < shieldMaxHp;

  if (store.invasion.isActive && castleNeedsWork) {
    // During an invasion, the Ent's only job is to keep the castle standing:
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
