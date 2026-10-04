import Phaser from 'phaser';
import { IsometricHelper } from '../IsometricHelper';
import { Navigation, TILES_FOR } from '../Navigation';
import { invaderMoveMode } from '../terrain';
import { INVADER_CONFIGS } from '../../types/game';
import type { StructureTarget } from '../StructureManager';
import type { InvaderContext } from './context';
import type { ActiveInvader } from './types';

export const EMERGE_SECONDS = 0.7;
export const ENTER_SECONDS = 0.55;

/** Moves toward a world point, sliding around solid footprints. */
export const stepToward = (ctx: InvaderContext, invader: ActiveInvader, tx: number, ty: number, step: number): void => {
  const c = invader.container;
  const dx = tx - c.x;
  const dy = ty - c.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.001) return;
  const move = Math.min(step, dist);
  let nx = c.x + (dx / dist) * move;
  let ny = c.y + (dy / dist) * move;
  if (ctx.nav) ({ x: nx, y: ny } = ctx.nav.pushOut(nx, ny, undefined, invaderMoveMode(invader.type)));
  ctx.faceInvader(invader, nx - c.x, ny - c.y, true);
  c.x = nx;
  c.y = ny;
  const grid = Navigation.tileOf(c.x, c.y);
  invader.gridX = grid.x;
  invader.gridY = grid.y;
  c.setDepth(IsometricHelper.getDepth(grid.x, grid.y, 7));
};

/** Chases a moving world point, detouring around buildings when the line is blocked. */
export const chase = (ctx: InvaderContext, invader: ActiveInvader, tx: number, ty: number, step: number, deltaSec: number): void => {
  const next = ctx.nav ? ctx.nav.steer(invader, invader.container.x, invader.container.y, tx, ty, deltaSec, invaderMoveMode(invader.type)) : { x: tx, y: ty };
  stepToward(ctx, invader, next.x, next.y, step);
};

/** Follows `currentPath` (grid waypoints); returns true once the path is finished. */
export const followPath = (ctx: InvaderContext, invader: ActiveInvader, step: number): boolean => {
  if (invader.pathIndex >= invader.currentPath.length) return true;
  const targetGrid = invader.currentPath[invader.pathIndex];
  const targetIso = IsometricHelper.gridToScreen(targetGrid.x, targetGrid.y);
  const dist = Math.hypot(targetIso.x - invader.container.x, targetIso.y - invader.container.y);
  if (dist <= step) {
    ctx.faceInvader(invader, targetIso.x - invader.container.x, targetIso.y - invader.container.y, true);
    invader.container.x = targetIso.x;
    invader.container.y = targetIso.y;
    invader.gridX = targetGrid.x;
    invader.gridY = targetGrid.y;
    invader.pathIndex++;
    invader.container.setDepth(IsometricHelper.getDepth(invader.gridX, invader.gridY, 7));
  } else {
    stepToward(ctx, invader, targetIso.x, targetIso.y, step);
  }
  return invader.pathIndex >= invader.currentPath.length;
};

/** Follows a breadth-first path to the nearest tile touching the structure. */
export const approachStructure = (
  ctx: InvaderContext,
  invader: ActiveInvader,
  structure: StructureTarget,
  step: number,
  deltaSec: number
): void => {
  const allowed = TILES_FOR[invaderMoveMode(invader.type)];
  invader.structTimer = (invader.structTimer ?? 0) - deltaSec;
  const here = Navigation.tileOf(invader.container.x, invader.container.y);
  if (!invader.structPath || invader.structGoal !== structure.id || invader.structTimer <= 0) {
    invader.structGoal = structure.id;
    invader.structTimer = 1.5;
    invader.structPath = (ctx.nav?.pathToRect(here, structure.rect, allowed) ?? undefined) || undefined;
    if (invader.structPath && invader.structPath.length > 1) invader.structPath.shift(); // drop the start tile
  }
  const path = invader.structPath;
  if (path && path.length > 0) {
    const wp = IsometricHelper.gridToScreen(path[0].x, path[0].y);
    if (Math.hypot(wp.x - invader.container.x, wp.y - invader.container.y) <= Math.max(3, step)) {
      path.shift();
      if (path.length === 0) {
        // Standing beside the footprint — close the last gap toward its centre (pushOut keeps us outside)
        chase(ctx, invader, structure.x, structure.y, step, deltaSec);
        return;
      }
    }
    const next = IsometricHelper.gridToScreen(path[0].x, path[0].y);
    stepToward(ctx, invader, next.x, next.y, step);
    return;
  }
  chase(ctx, invader, structure.x, structure.y, step, deltaSec);
};

/**
 * Stepping out of a portal onto its exit tile, or slipping back into one
 * (looters and scouts). Returns true while the invader is in transit.
 */
export const updatePortalTransit = (ctx: InvaderContext, invader: ActiveInvader, deltaSec: number): boolean => {
  if ((invader.emerge ?? 0) > 0) {
    invader.emerge = (invader.emerge ?? 0) - deltaSec;
    const from = invader.portal;
    const exit = IsometricHelper.gridToScreen(invader.spawnGrid.x, invader.spawnGrid.y);
    const t = Phaser.Math.Clamp(1 - (invader.emerge ?? 0) / EMERGE_SECONDS, 0, 1);
    const ease = Phaser.Math.Easing.Cubic.Out(t);
    if (from) invader.container.setPosition(from.x + (exit.x - from.x) * ease, from.y + (exit.y - from.y) * ease);
    invader.container.setScale(invader.baseScale * (0.3 + 0.7 * ease));
    invader.container.setAlpha(Math.min(1, t * 1.6));
    ctx.faceInvader(invader, exit.x - (from?.x ?? exit.x), exit.y - (from?.y ?? exit.y), true);
    if ((invader.emerge ?? 0) <= 0) {
      invader.container.setPosition(exit.x, exit.y);
      invader.container.setScale(invader.baseScale);
      invader.container.setAlpha(1);
    }
    return true;
  }

  if ((invader.enter ?? 0) > 0) {
    invader.enter = (invader.enter ?? 0) - deltaSec;
    const into = invader.exitPortal;
    if (into) {
      const t = Phaser.Math.Clamp(1 - (invader.enter ?? 0) / ENTER_SECONDS, 0, 1);
      invader.container.x += (into.x - invader.container.x) * Math.min(1, deltaSec * 8);
      invader.container.y += (into.y - 20 - invader.container.y) * Math.min(1, deltaSec * 8);
      invader.container.setScale(invader.baseScale * (1 - 0.75 * t));
      invader.container.setAlpha(1 - t);
    }
    if ((invader.enter ?? 0) <= 0) ctx.despawnEscaped(invader);
    return true;
  }
  return false;
};
