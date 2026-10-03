import type { HarvestTask, UnitClass } from '../../types/game';
import { FIGHTER_CLASSES } from '../../state/store/rosterSlice';
import type { GameStoreState, ResourceBuildingId, Resources } from '../../types/state';
import { useGameStore } from '../../state/useGameStore';
import { teamBonuses } from '../../state/skillTree';
import { buildingHpOf, buildingMaxHp, isBuildingOperational, isSpireOperational, towerBuildingOf, towerLevelOf } from '../../state/defenseStats';
import { soundFx } from '../audio/soundFx';
import { renderCargoGraphics } from './legacyWorkerArt';
import { CRITICAL_HP, TASK_BUILDING, isEnrichableTask, type WorkerContext, type WorkerFrame, type WorkerInstance } from './types';

const GATHER_TASKS: HarvestTask[] = ['AETHER', 'WOOD', 'STONE', 'METAL', 'ESSENCE', 'FISH', 'WATER'];
const GATHERER_CLASSES = new Set<UnitClass>(FIGHTER_CLASSES);

/** Level-2 establishments add a by-product to every delivery of their main resource. */
const BYPRODUCTS: Partial<Record<HarvestTask, { building: keyof GameStoreState['resourceBuildings']; resource: keyof Resources }>> = {
  WOOD: { building: 'WOOD', resource: 'charcoal' },
  STONE: { building: 'QUARRY', resource: 'minerals' },
  METAL: { building: 'MINE', resource: 'coal' },
  ESSENCE: { building: 'CAVE', resource: 'aetherShards' },
  FISH: { building: 'PORT', resource: 'water' },
};

const AUTO_SELL_THRESHOLD = 120;
const AUTO_SELL_AMOUNT = 10;
const HARVEST_MS = 2200;

/** True when a task's establishment (if it needs one) is built and not wrecked. */
export const isTaskAvailable = (store: GameStoreState, task: HarvestTask): boolean => {
  // Aether crystals only grow while the Crystal Spire stands (raised and not wrecked)
  if (task === 'AETHER') return isSpireOperational(store);
  const building = TASK_BUILDING[task];
  return !building || (store.castleBuilt && isBuildingOperational(store.resourceBuildings?.[building]));
};

export const isGatherer = (unitClass: UnitClass) => GATHERER_CLASSES.has(unitClass);

/**
 * Gatherers roam between jobs: 60% of the time they pick the scarcest available
 * resource, otherwise a random available one.
 */
export function chooseGatherTask(store: GameStoreState): HarvestTask {
  const tasks = GATHER_TASKS.filter((task) => isTaskAvailable(store, task));
  const stock: Partial<Record<HarvestTask, number>> = {
    AETHER: store.resources.aetherShards,
    WOOD: store.resources.wood,
    STONE: store.resources.stone,
    METAL: store.resources.metal || 0,
    ESSENCE: store.resources.arcaneEssence,
    FISH: store.resources.fish,
    WATER: store.resources.water,
  };
  if (Math.random() < 0.6) {
    return tasks.reduce((lowest, t) => ((stock[t] ?? 0) < (stock[lowest] ?? 0) ? t : lowest), tasks[0]);
  }
  return tasks[Math.floor(Math.random() * tasks.length)];
}

/** Standing emote for the current state (unless a timed override emote is showing). */
export function updateStatusEmote(worker: WorkerInstance, frame: WorkerFrame): void {
  if (worker.overrideEmote) return;
  const { icon } = frame.taskCfg;
  const harvestIcon: Partial<Record<HarvestTask, string>> = { AETHER: '⛏️', WOOD: '🪓', STONE: '🔨' };
  const text = {
    IDLE: '...',
    MOVING_TO_NODE: icon,
    RETURNING_TO_NEXUS: icon,
    HARVESTING: harvestIcon[worker.assignedTask] ?? '⚔️',
    COMBAT: '⚔️',
    HEALING: '💚',
  }[worker.status as string];
  if (text !== undefined) worker.emoteText.setText(text);
}

/** Unbuilt or wrecked establishment: abandon the trip and pick another job from IDLE (tenants wait for repair). */
export function abandonUnavailableTask(worker: WorkerInstance, store: GameStoreState): void {
  if (worker.parentBuildingId) {
    const isOp = store.castleBuilt && isBuildingOperational(store.resourceBuildings?.[worker.parentBuildingId]);
    if (!isOp && (worker.status === 'MOVING_TO_NODE' || worker.status === 'HARVESTING')) {
      worker.status = 'IDLE';
      worker.stateTimer = 1000;
      worker.overrideEmote = '🔒';
      worker.overrideEmoteTimer = 1200;
    }
    return;
  }
  if (isTaskAvailable(store, worker.assignedTask)) return;
  if (worker.status === 'MOVING_TO_NODE' || worker.status === 'HARVESTING') {
    worker.status = 'IDLE';
    worker.stateTimer = 800;
    worker.overrideEmote = '🔒';
    worker.overrideEmoteTimer = 1200;
  }
}

const pauseForRuinedCastle = (worker: WorkerInstance) => {
  worker.overrideEmote = '🏚️';
  worker.overrideEmoteTimer = 1000;
};

/** At the castle and spent: eat fish / drink water, or rest slowly without them. */
function recoverAtNexus(ctx: WorkerContext, worker: WorkerInstance): void {
  const store = useGameStore.getState();
  const { x, y } = worker.container;
  if (worker.hp < CRITICAL_HP) {
    if (store.resources.fish > 0) {
      store.spendResources({ fish: 1 });
      worker.hp = worker.maxHp;
      ctx.spawnFloatingPopup(x, y - 45, '🐟 Healed!', '#0ea5e9');
      worker.stateTimer = 500;
    } else {
      worker.hp = Math.min(worker.maxHp, worker.hp + 5);
      worker.overrideEmote = '💤';
      worker.overrideEmoteTimer = 1000;
      ctx.spawnFloatingPopup(x, y - 35, '+5 HP', '#22c55e');
      worker.stateTimer = 1000;
    }
  } else if (worker.stamina <= 0) {
    if (store.resources.water > 0) {
      store.spendResources({ water: 1 });
      worker.stamina = worker.maxStamina;
      ctx.spawnFloatingPopup(x, y - 55, '💧 Energized!', '#3b82f6');
      worker.stateTimer = 500;
    } else {
      worker.stamina = Math.min(worker.maxStamina, worker.stamina + 10);
      worker.overrideEmote = '💤';
      worker.overrideEmoteTimer = 1000;
      ctx.spawnFloatingPopup(x, y - 35, '+10 Stamina', '#3b82f6');
      worker.stateTimer = 1000;
    }
  } else {
    // Fully recovered, go back to work!
    ctx.dispatchToTaskNode(worker);
  }
}

function updateIdle(ctx: WorkerContext, worker: WorkerInstance, frame: WorkerFrame): void {
  // If the Castle is ruined, workers pause production until the Ent repairs it
  if (frame.store.defense.castleHp <= 0) {
    pauseForRuinedCastle(worker);
    worker.stateTimer = 1000;
    return;
  }

  worker.stateTimer -= frame.delta;
  if (worker.stateTimer > 0) return;

  const atNexus = worker.gridX === ctx.nexusGridPos.x && worker.gridY === ctx.nexusGridPos.y;
  // Only return to castle if fully depleted (0% stamina or critically wounded)
  const fullyDepleted = worker.stamina <= 0 || worker.hp < CRITICAL_HP;
  if (!fullyDepleted) ctx.dispatchToTaskNode(worker);
  else if (!atNexus) ctx.dispatchToNexus(worker);
  else recoverAtNexus(ctx, worker);
}

export const isGeneral = (unitClass: UnitClass, worker?: WorkerInstance): boolean => {
  if (worker && (worker.parentBuildingId || worker.id.startsWith('tenant_'))) return false;
  return unitClass !== 'TREANT' && unitClass !== 'AQUA_SLIME';
};

function updateHarvesting(ctx: WorkerContext, worker: WorkerInstance, frame: WorkerFrame): void {
  const { taskCfg, store } = frame;
  const isGeneralUnit = isGeneral(worker.unitClass, worker);
  const isTenant = !!worker.parentBuildingId || worker.id.startsWith('tenant_');
  const homeBuilding = frame.config.requiredBuilding || (worker.parentBuildingId as ResourceBuildingId | undefined);

  // 1. General Defense, Repair & Scouting Station:
  if (isGeneralUnit) {
    worker.stateTimer -= frame.delta;

    // Check if home establishment is damaged
    if (homeBuilding) {
      const b = towerBuildingOf(store, homeBuilding);
      if (b && b.level >= 1 && buildingHpOf(b) < buildingMaxHp(towerLevelOf(b))) {
        worker.overrideEmote = '🔨';
        worker.overrideEmoteTimer = 400;
        if (Math.random() < 0.15) {
          ctx.spawnHarvestBurst(worker.container.x, worker.container.y - 12, 0x15803d, 4);
        }
        if (worker.stateTimer <= 0) {
          const restored = useGameStore.getState().restoreBuildingHp(homeBuilding, 25);
          if (restored > 0) {
            ctx.spawnFloatingPopup(worker.container.x, worker.container.y - 35, `🔨 General Repaired +${restored} HP!`, '#86efac');
            soundFx.playHarvest('wood');
          }
          worker.stateTimer = 1200;
        }
        return;
      }
    }

    // Check if Citadel Castle is damaged
    if (store.defense.castleHp < store.defense.castleMaxHp) {
      worker.overrideEmote = '🛡️';
      worker.overrideEmoteTimer = 400;
      if (worker.stateTimer <= 0) {
        useGameStore.setState((prev) => ({
          defense: {
            ...prev.defense,
            castleHp: Math.min(prev.defense.castleMaxHp, prev.defense.castleHp + 10),
          },
        }));
        ctx.spawnFloatingPopup(worker.container.x, worker.container.y - 35, `🛡️ Guarding Citadel`, '#38bdf8');
        worker.stateTimer = 1500;
      }
      return;
    }

    // General Vigilance Station / Sector Patrol (never harvests cargo)
    worker.overrideEmote = '🛡️';
    worker.overrideEmoteTimer = 400;
    if (worker.stateTimer <= 0) {
      ctx.spawnFloatingPopup(worker.container.x, worker.container.y - 25, `🧭 Sector Clear`, '#38bdf8');
      worker.status = 'IDLE';
      worker.stateTimer = 400 + Math.random() * 400;
    }
    return;
  }

  // 2. Tenant Repair at Parent Establishment: if establishment is damaged/wrecked, repair it!
  if (isTenant && worker.parentBuildingId) {
    const building = store.resourceBuildings?.[worker.parentBuildingId];
    if (building && building.level >= 1 && buildingHpOf(building) < buildingMaxHp(towerLevelOf(building))) {
      worker.stateTimer -= frame.delta;
      worker.overrideEmote = '🔨';
      worker.overrideEmoteTimer = 400;
      if (Math.random() < 0.15) {
        ctx.spawnHarvestBurst(worker.container.x, worker.container.y - 12, 0x15803d, 4);
      }
      if (worker.stateTimer <= 0) {
        const restored = useGameStore.getState().restoreBuildingHp(worker.parentBuildingId, 25);
        if (restored > 0) {
          ctx.spawnFloatingPopup(worker.container.x, worker.container.y - 35, `🔨 Repaired +${restored} HP!`, '#86efac');
          soundFx.playHarvest('wood');
        }
        worker.stateTimer = 1400;
      }
      return;
    }
  }

  // 3. Normal Tenant Gathering: Visible and active ONLY when parent establishment is available and operational!
  if (isTenant && worker.parentBuildingId) {
    const parentBuilding = store.resourceBuildings?.[worker.parentBuildingId];
    if (!parentBuilding || parentBuilding.level < 1 || buildingHpOf(parentBuilding) <= 0) {
      worker.status = 'IDLE';
      worker.stateTimer = 800;
      worker.overrideEmote = '🔒';
      worker.overrideEmoteTimer = 1000;
      return;
    }
  }

  worker.stateTimer -= frame.delta;
  if (Math.random() < 0.08) {
    ctx.spawnHarvestBurst(worker.container.x, worker.container.y - 12, taskCfg.color, 2);
  }
  if (worker.stateTimer > 0) return;

  worker.cargo = worker.maxCargo;
  renderCargoGraphics(worker.cargoIcon, worker.assignedTask);
  worker.cargoIcon.setVisible(true);

  if (worker.assignedTask === 'WOOD') soundFx.playHarvest('wood');
  else if (worker.assignedTask === 'STONE') soundFx.playHarvest('stone');
  else soundFx.playHarvest('crystal');

  ctx.spawnHarvestBurst(worker.container.x, worker.container.y - 12, taskCfg.color, 8);
  ctx.spawnFloatingPopup(worker.container.x, worker.container.y - 20, `+${worker.cargo} ${taskCfg.label}`, taskCfg.hexColor);
  ctx.dispatchToNexus(worker);
}

/** Unloads cargo at the castle with every yield multiplier, then drains stamina for the trip. */
function depositCargo(ctx: WorkerContext, worker: WorkerInstance, frame: WorkerFrame): void {
  const { taskCfg } = frame;
  const { x, y } = worker.container;
  const store = useGameStore.getState();

  const isHarvestBlessing = (store.activeGodBlessings?.CELESTIAL_HARVEST || 0) > 0;
  // Treant node quality enrichment
  const nodeQuality = isEnrichableTask(worker.assignedTask)
    ? (store.dynamicResourceNodes?.[worker.assignedTask]?.qualityMultiplier ?? 1.0)
    : 1.0;
  const skills = teamBonuses(store);
  const foundationBonus = worker.assignedTask === 'WOOD' || worker.assignedTask === 'STONE' ? skills.foundations : 1;
  const totalMultiplier = (isHarvestBlessing ? 3 : 1) * nodeQuality * skills.harvest * foundationBonus;
  const harvested = Math.max(1, Math.round(worker.cargo * totalMultiplier));
  worker.cargo = 0;
  worker.cargoIcon.setVisible(false);

  if (nodeQuality > 1.0) {
    ctx.spawnFloatingPopup(x, y - 35, `🌿 Enriched Harvest! (${nodeQuality.toFixed(2)}x)`, '#10b981');
  }
  if (isHarvestBlessing) {
    ctx.spawnFloatingPopup(x, y - 48, `✨ 3x Celestial Harvest Yield!`, '#fbbf24');
  }

  // Deposit strictly to the harvested resource (plus level-2 by-products)
  const deposit: Partial<Resources> = { [taskCfg.resourceKey]: harvested };
  const byproduct = BYPRODUCTS[worker.assignedTask];
  if (byproduct && (store.resourceBuildings?.[byproduct.building]?.level ?? 0) >= 2) {
    deposit[byproduct.resource] = (deposit[byproduct.resource] ?? 0) + harvested;
  }
  // Chrono-Automaton bonus Arcane Essence
  if (worker.unitClass === 'SUCCUBUS' && worker.assignedTask === 'ESSENCE') {
    deposit.arcaneEssence = (deposit.arcaneEssence || 0) + Math.round(totalMultiplier);
  }
  store.addResources(deposit);
  soundFx.playDeposit();

  // Auto-Sell subroutine if enabled
  const after = useGameStore.getState();
  if (after.autoSettings.autoSell && (after.resources[taskCfg.resourceKey] || 0) > AUTO_SELL_THRESHOLD) {
    after.sellResource(taskCfg.resourceKey, AUTO_SELL_AMOUNT);
    ctx.spawnFloatingPopup(x, y - 36, `⚡ Auto-Sold ${AUTO_SELL_AMOUNT} ⇄ Coins`, '#fbbf24');
  }

  ctx.spawnFloatingPopup(x, y - 20, `+${harvested} ${taskCfg.label} Delivered`, taskCfg.hexColor);

  // Drain stamina for this expedition (reduced by armor/relic, increased by weather)
  const drain = worker.staminaDrain * (1 - frame.drainReduction / 100) * frame.weatherDrainMult;
  worker.stamina = Math.max(0, worker.stamina - drain);

  worker.status = 'IDLE';
  worker.stateTimer = worker.stamina <= 0 || worker.hp < CRITICAL_HP ? 200 : 600 + Math.random() * 400;
}

/** The peaceful gather loop: IDLE → MOVING_TO_NODE → HARVESTING → RETURNING_TO_NEXUS. */
export function updateGatherState(ctx: WorkerContext, worker: WorkerInstance, frame: WorkerFrame): void {
  const castleRuined = frame.store.defense.castleHp <= 0;
  switch (worker.status) {
    case 'IDLE':
      updateIdle(ctx, worker, frame);
      break;

    case 'MOVING_TO_NODE':
      if (castleRuined) {
        worker.status = 'IDLE';
        pauseForRuinedCastle(worker);
        break;
      }
      ctx.handleMovement(worker, frame.deltaSec, frame.effectiveSpeed, () => {
        worker.status = 'HARVESTING';
        worker.stateTimer = HARVEST_MS;
        ctx.spawnHarvestBurst(worker.container.x, worker.container.y - 12, frame.taskCfg.color, 4);
      });
      break;

    case 'HARVESTING':
      if (castleRuined) {
        worker.status = 'IDLE';
        pauseForRuinedCastle(worker);
        break;
      }
      updateHarvesting(ctx, worker, frame);
      break;

    case 'RETURNING_TO_NEXUS':
      // Cannot deposit into a ruined castle; wait until repaired
      if (castleRuined) {
        pauseForRuinedCastle(worker);
        break;
      }
      ctx.handleMovement(worker, frame.deltaSec, frame.effectiveSpeed, () => depositCargo(ctx, worker, frame));
      break;
  }
}
