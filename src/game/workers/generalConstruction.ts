import { UNIT_CLASSES } from '../../types/game';
import type { GameStoreState, ResourceBuildingId } from '../../types/state';
import { nextChampionConstruction } from '../../state/constructionProgress';
import { IsometricHelper } from '../IsometricHelper';
import type { WorkerContext, WorkerInstance } from './types';
import { BUILDING_SITES } from '../../state/buildingLayout';
import { minionMoveMode } from '../terrain';

/** The establishment a General's tenants still have to raise, if any (its home, while unbuilt). */
export const generalHomeSite = (worker: WorkerInstance, store: GameStoreState) => {
  const home = UNIT_CLASSES[worker.unitClass]?.requiredBuilding;
  if (!home || home === 'SPIRE') return undefined;
  return nextChampionConstruction(home as ResourceBuildingId, store);
};

/**
 * While its establishment is unbuilt, a General stands at the plot and
 * summons its tenants one at a time (DefenderSystem); the tenants do the
 * building, paying the castle's supplies step by step.
 * Returns true while the home is unbuilt (scouting waits).
 */
export function updateGeneralConstruction(
  ctx: WorkerContext,
  worker: WorkerInstance,
  store: GameStoreState,
  deltaSec: number,
  effectiveSpeed: number
): boolean {
  const site = generalHomeSite(worker, store);
  if (!site) return false;

  const waterSpot = minionMoveMode(worker.unitClass) === 'water' ? BUILDING_SITES[site.id]?.waterSpot : undefined;
  const target = IsometricHelper.gridToScreen(waterSpot?.x ?? site.x, waterSpot?.y ?? site.y);
  const distance = Math.hypot(target.x - worker.container.x, target.y - worker.container.y);
  worker.overrideEmote = '📯';
  worker.overrideEmoteTimer = 400;
  worker.constructionTimer = 0;
  if (distance > 20) {
    worker.status = 'MOVING_TO_NODE';
    worker.currentPath = [];
    ctx.moveToward(worker, target.x, target.y, effectiveSpeed * deltaSec, deltaSec);
    return true;
  }
  worker.status = 'IDLE';
  return true;
}

/** True once the General stands at its unbuilt plot, ready to call its tenants. */
export const generalAtSite = (worker: WorkerInstance, store: GameStoreState): boolean => {
  const site = generalHomeSite(worker, store);
  if (!site) return true;
  const waterSpot = minionMoveMode(worker.unitClass) === 'water' ? BUILDING_SITES[site.id]?.waterSpot : undefined;
  const target = IsometricHelper.gridToScreen(waterSpot?.x ?? site.x, waterSpot?.y ?? site.y);
  return Math.hypot(target.x - worker.container.x, target.y - worker.container.y) <= 20;
};
