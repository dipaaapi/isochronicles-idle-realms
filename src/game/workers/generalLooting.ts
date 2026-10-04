import { IsometricHelper } from '../IsometricHelper';
import { CASTLE_GATE } from '../../state/buildingLayout';
import type { GroundLootManager } from '../GroundLootManager';
import type { WorkerContext, WorkerInstance } from './types';
import { minionMoveMode } from '../terrain';

/** How far (world units) a General will walk for a drop: the whole platform. */
const LOOT_SEARCH_RANGE = 2000;
/** After a pickup, grab more drops this close before heading home. */
const CHAIN_RANGE = 140;
const MAX_CARRY = 5;
/** Seconds without getting any closer before a General gives up on a drop. */
const STUCK_SECONDS = 2.5;

/**
 * Generals collect drops on the platform: walk to the drop, pick it up, carry
 * it to the Citadel gate. Nothing counts until it is delivered there.
 * Returns true while the General is busy looting or hauling.
 */
export function updateGeneralLooting(
  ctx: WorkerContext,
  loot: GroundLootManager | undefined,
  worker: WorkerInstance,
  deltaSec: number,
  effectiveSpeed: number
): boolean {
  // Water Generals can't walk onto land drops: leave them to the land Generals
  if (!loot || minionMoveMode(worker.unitClass) === 'water') return false;
  const carried = (worker.carriedLoot ?? []).filter((id, i) => loot.carry(id, worker.container.x, worker.container.y, i));
  worker.carriedLoot = carried;

  // Keep walking to the claimed drop
  let target = worker.lootTargetId ? loot.touchClaim(worker.lootTargetId) : null;
  if (worker.lootTargetId && !target) worker.lootTargetId = undefined;

  if (!target && carried.length < MAX_CARRY) {
    const range = carried.length > 0 ? CHAIN_RANGE : LOOT_SEARCH_RANGE;
    target = loot.getNearestLoot(worker.container.x, worker.container.y, range, 'general');
    if (target) {
      loot.claim(target, worker.id);
      worker.lootTargetId = target.id;
      worker.lootBestDist = Infinity;
      worker.lootStuckTimer = 0;
    }
  }

  if (target) {
    worker.overrideEmote = '💰';
    worker.overrideEmoteTimer = 400;
    worker.status = 'MOVING_TO_NODE';
    const dist = Math.hypot(target.container.x - worker.container.x, target.container.y - worker.container.y);
    // Not getting any closer (drop behind water / under a building): drop the claim so it isn't stuck forever
    if (dist < (worker.lootBestDist ?? Infinity) - 1) {
      worker.lootBestDist = dist;
      worker.lootStuckTimer = 0;
    } else {
      worker.lootStuckTimer = (worker.lootStuckTimer ?? 0) + deltaSec;
    }
    if (dist > 12 && (worker.lootStuckTimer ?? 0) > STUCK_SECONDS) {
      loot.abandon(target);
      worker.lootTargetId = undefined;
      worker.lootStuckTimer = 0;
      return carried.length > 0;
    }
    if (dist > 12) {
      ctx.moveToward(worker, target.container.x, target.container.y, effectiveSpeed * deltaSec, deltaSec);
    } else {
      loot.pickUp(target);
      worker.carriedLoot = [...carried, target.id];
      worker.lootTargetId = undefined;
    }
    return true;
  }

  if (carried.length === 0) return false;

  // Haul everything to the castle gate; it counts only on delivery
  const gate = IsometricHelper.gridToScreen(CASTLE_GATE.x + 0.5, CASTLE_GATE.y + 0.5);
  worker.overrideEmote = '🏰';
  worker.overrideEmoteTimer = 400;
  worker.status = 'RETURNING_TO_NEXUS';
  if (Math.hypot(gate.x - worker.container.x, gate.y - worker.container.y) > 28) {
    ctx.moveToward(worker, gate.x, gate.y, effectiveSpeed * deltaSec, deltaSec);
    return true;
  }
  for (const id of carried) loot.collectLoot(id, worker.name);
  worker.carriedLoot = [];
  worker.overrideEmote = '✨';
  worker.overrideEmoteTimer = 1000;
  return true;
}
