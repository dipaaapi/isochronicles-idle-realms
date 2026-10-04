import { UNIT_CLASSES } from '../../types/game';
import type { GameStoreState, ResourceBuildingId } from '../../types/state';
import { RESOURCE_BUILDING_CONFIG } from '../../state/economy';
import { canAfford } from '../../state/resources';
import { CONSTRUCTION_SECONDS, nextChampionConstruction } from '../../state/constructionProgress';
import { IsometricHelper } from '../IsometricHelper';
import { soundFx } from '../audio/soundFx';
import type { WorkerContext, WorkerInstance } from './types';
import { BUILDING_SITES } from '../../state/buildingLayout';
import { minionMoveMode } from '../terrain';

/** The establishment a General still has to raise, if any (its home, while unbuilt). */
export const generalHomeSite = (worker: WorkerInstance, store: GameStoreState) => {
  const home = UNIT_CLASSES[worker.unitClass]?.requiredBuilding;
  if (!home || home === 'SPIRE') return undefined;
  return nextChampionConstruction(home as ResourceBuildingId, store);
};

/**
 * A General builds its own establishment: walk to the plot, wait for supplies
 * (auto-buying any shortfall), then work for CONSTRUCTION_SECONDS.
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
  worker.overrideEmote = '🔨';
  worker.overrideEmoteTimer = 400;
  if (distance > 20) {
    worker.status = 'MOVING_TO_NODE';
    worker.currentPath = [];
    ctx.moveToward(worker, target.x, target.y, effectiveSpeed * deltaSec, deltaSec);
    worker.constructionTimer = 0;
    return true;
  }

  const cost = RESOURCE_BUILDING_CONFIG[site.id]?.costs[0] ?? {};
  if (!canAfford(store.resources, cost)) store.buyShortfall(cost);

  const affordable = canAfford(store.resources, cost);
  worker.status = affordable ? 'HARVESTING' : 'IDLE';
  worker.constructionTimer = affordable ? (worker.constructionTimer ?? 0) + deltaSec : 0;
  if (worker.constructionTimer >= CONSTRUCTION_SECONDS) {
    worker.constructionTimer = 0;
    if (store.upgradeResourceBuilding(site.id)) {
      (ctx.scene as any).paveEstablishment?.(site.id, true);
      ctx.spawnHarvestBurst(target.x, target.y - 15, 0x22c55e, 14);
      ctx.spawnFloatingPopup(target.x, target.y - 45, `${worker.name} established ${site.label}! 🏛️`, '#86efac');
      soundFx.playFanfare();
    }
  }
  return true;
}
