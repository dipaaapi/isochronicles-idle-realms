import config from '../../data/terrainReclamation.json';
import { BUILDING_IDS, GRID_SIZE, isFillableTile } from '../../state/buildingLayout';
import { useGameStore } from '../../state/useGameStore';
import { IsometricHelper } from '../IsometricHelper';
import type { WorkerContext, WorkerFrame, WorkerInstance } from './types';

export const reclamationPoint = (key: string) => {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
};

export const ensureTerrainReclamation = (): void => {
  const store = useGameStore.getState();
  if (store.terrainReclamation) return;
  if (!store.spireBuilt || BUILDING_IDS.some((id) => (store.resourceBuildings[id]?.level ?? 0) < 1)) return;
  const filled = new Set(store.terrainFilled);
  const reclaimed = new Set(store.terrainReclaimed);
  const sources = Object.keys(store.terrainSand).filter((key) => filled.has(key) && !reclaimed.has(key));
  const targets: string[] = [];
  for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) {
    const key = `${x},${y}`;
    if (isFillableTile(x, y) && !filled.has(key)) targets.push(key);
  }
  if (!sources.length || !targets.length) return;
  store.startTerrainReclamation(
    sources[Math.floor(Math.random() * sources.length)],
    targets[Math.floor(Math.random() * targets.length)],
  );
};

/** Diverts one roster worker to the shared excavation/fill project during peacetime. */
export function updateTerrainReclamation(
  ctx: WorkerContext,
  worker: WorkerInstance,
  frame: WorkerFrame,
  treant: boolean,
): boolean {
  if (frame.store.invasion.isActive || !frame.store.castleBuilt) return false;
  ensureTerrainReclamation();
  const project = useGameStore.getState().terrainReclamation;
  if (!project) return false;

  const excavating = project.progress < project.requiredWork / 2;
  const tile = reclamationPoint(excavating ? project.source : project.target);
  const destination = IsometricHelper.gridToScreen(tile.x, tile.y);
  const distance = Math.hypot(destination.x - worker.container.x, destination.y - worker.container.y);
  worker.overrideEmote = excavating ? '⛏️' : '🏝️';
  worker.overrideEmoteTimer = 500;
  worker.cargoIcon.setVisible(!excavating);

  if (distance > config.workRadiusPx) {
    worker.status = 'MOVING_TO_NODE';
    ctx.moveToward(worker, destination.x, destination.y,
      frame.effectiveSpeed * config.travelSpeedMultiplier * frame.deltaSec, frame.deltaSec);
    return true;
  }

  worker.status = 'HARVESTING';
  const rate = treant ? config.treantWorkPerSecond : config.workerWorkPerSecond;
  useGameStore.getState().advanceTerrainReclamation(rate * frame.deltaSec);
  return true;
}
