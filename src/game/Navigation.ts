import { GridPoint } from '../types/game';
import { TILE_HEIGHT, TILE_WIDTH } from './IsometricHelper';
import { PathfindingService } from './PathfindingService';
import { TileRect, distanceToRect, GRID_SIZE } from '../state/buildingLayout';

const HALF_W = TILE_WIDTH / 2;
const HALF_H = TILE_HEIGHT / 2;

/** Walk-grid cell values understood by PathfindingService. */
export const WALK_LAND = 0;
export const WALK_WATER = 1;
export const WALK_SOLID = 2;

export interface SolidArea {
  id: string;
  rect: TileRect;
}

/** Per-unit steering memory (cached detour path). */
export interface NavAgent {
  navPath?: GridPoint[];
  navGoal?: string;
  navTimer?: number;
}

/**
 * Obstacles for everything that walks: the citadel, establishments, the
 * Crystal Spire and the invader portals are solid footprints nobody may cross.
 * Works in continuous grid space where a tile's centre sits on integer (x, y)
 * and the tile spans ±0.5 around it.
 */
export class Navigation {
  private solids: SolidArea[] = [];
  private grid: number[][] = [];

  constructor(private pathfinder: PathfindingService, private baseGrid: number[][]) {
    this.rebuild();
  }

  /** Continuous grid position of a world point (inverse of gridToScreen, without flooring). */
  static toGrid(x: number, y: number): { x: number; y: number } {
    return { x: (x / HALF_W + y / HALF_H) / 2, y: (y / HALF_H - x / HALF_W) / 2 };
  }

  static toWorld(gx: number, gy: number): { x: number; y: number } {
    return { x: (gx - gy) * HALF_W, y: (gx + gy) * HALF_H };
  }

  static tileOf(x: number, y: number): GridPoint {
    const g = Navigation.toGrid(x, y);
    return { x: Math.round(g.x), y: Math.round(g.y) };
  }

  setSolids(solids: SolidArea[]): void {
    const key = (list: SolidArea[]) => list.map((s) => `${s.id}:${s.rect.x},${s.rect.y},${s.rect.w},${s.rect.h}`).join('|');
    if (key(solids) === key(this.solids)) return;
    this.solids = solids.map((s) => ({ id: s.id, rect: { ...s.rect } }));
    this.rebuild();
  }

  getSolids(): readonly SolidArea[] {
    return this.solids;
  }

  private rebuild(): void {
    this.grid = this.baseGrid.map((row) => [...row]);
    for (const { rect } of this.solids) {
      for (let y = rect.y; y < rect.y + rect.h; y++) {
        for (let x = rect.x; x < rect.x + rect.w; x++) {
          if (this.grid[y]?.[x] !== undefined) this.grid[y][x] = WALK_SOLID;
        }
      }
    }
    this.pathfinder.initGrid(this.grid);
  }

  isSolidTile(x: number, y: number): boolean {
    return this.grid[y]?.[x] === WALK_SOLID;
  }

  /** The solid area covering a continuous grid point (optionally grown by `pad` tiles). */
  solidAt(gx: number, gy: number, pad: number = 0): SolidArea | undefined {
    return this.solids.find(({ rect }) =>
      gx > rect.x - 0.5 - pad && gx < rect.x + rect.w - 0.5 + pad &&
      gy > rect.y - 0.5 - pad && gy < rect.y + rect.h - 0.5 + pad);
  }

  /**
   * Pushes a world point out of every solid footprint (grown by `radius`
   * tiles) along the shallowest axis — the collision response for all movers.
   */
  pushOut(x: number, y: number, radius: number = 0.22): { x: number; y: number } {
    let g = Navigation.toGrid(x, y);
    let moved = false;
    
    // Clamp to platform bounds
    const minBound = 0 + radius;
    const maxBound = GRID_SIZE - 1 - radius;
    if (g.x < minBound) { g.x = minBound; moved = true; }
    else if (g.x > maxBound) { g.x = maxBound; moved = true; }
    if (g.y < minBound) { g.y = minBound; moved = true; }
    else if (g.y > maxBound) { g.y = maxBound; moved = true; }

    for (let pass = 0; pass < 2; pass++) {
      const hit = this.solidAt(g.x, g.y, radius);
      if (!hit) break;
      const r = hit.rect;
      const left = g.x - (r.x - 0.5 - radius);
      const right = r.x + r.w - 0.5 + radius - g.x;
      const top = g.y - (r.y - 0.5 - radius);
      const bottom = r.y + r.h - 0.5 + radius - g.y;
      const min = Math.min(left, right, top, bottom);
      if (min === left) g = { x: g.x - left - 0.001, y: g.y };
      else if (min === right) g = { x: g.x + right + 0.001, y: g.y };
      else if (min === top) g = { x: g.x, y: g.y - top - 0.001 };
      else g = { x: g.x, y: g.y + bottom + 0.001 };
      moved = true;
    }
    
    // Clamp again after solid push-out
    if (g.x < minBound) { g.x = minBound; moved = true; }
    else if (g.x > maxBound) { g.x = maxBound; moved = true; }
    if (g.y < minBound) { g.y = minBound; moved = true; }
    else if (g.y > maxBound) { g.y = maxBound; moved = true; }
    
    return moved ? Navigation.toWorld(g.x, g.y) : { x, y };
  }

  /** True when the straight line between two world points crosses no solid footprint. */
  hasLineOfSight(ax: number, ay: number, bx: number, by: number, radius: number = 0.15): boolean {
    const a = Navigation.toGrid(ax, ay);
    const b = Navigation.toGrid(bx, by);
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.2));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.solidAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, radius)) return false;
    }
    return true;
  }

  /** Distance in tiles from a world point to a footprint's edge. */
  distanceToRect(x: number, y: number, rect: TileRect): number {
    const g = Navigation.toGrid(x, y);
    return distanceToRect(g.x, g.y, rect);
  }

  /**
   * Shortest walkable path from a tile to any tile touching `rect`
   * (breadth-first over the platform grid).
   */
  pathToRect(start: GridPoint, rect: TileRect, allowed: number[]): GridPoint[] | null {
    const H = this.grid.length;
    const W = this.grid[0]?.length ?? 0;
    const touches = (x: number, y: number) =>
      x >= rect.x - 1 && x <= rect.x + rect.w && y >= rect.y - 1 && y <= rect.y + rect.h &&
      !(x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h) &&
      // edge-adjacent only (no diagonal corners)
      ((x >= rect.x && x < rect.x + rect.w) || (y >= rect.y && y < rect.y + rect.h));
    const key = (x: number, y: number) => y * W + x;
    const prev = new Map<number, number>();
    const queue: GridPoint[] = [start];
    prev.set(key(start.x, start.y), -1);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (touches(cur.x, cur.y)) {
        const path: GridPoint[] = [];
        let k = key(cur.x, cur.y);
        while (k !== -1) {
          path.unshift({ x: k % W, y: Math.floor(k / W) });
          k = prev.get(k)!;
        }
        return path;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || prev.has(key(nx, ny))) continue;
        if (!allowed.includes(this.grid[ny][nx])) continue;
        prev.set(key(nx, ny), key(cur.x, cur.y));
        queue.push({ x: nx, y: ny });
      }
    }
    return null;
  }

  /**
   * Where a unit chasing a (possibly moving) world target should head next:
   * straight at it when nothing solid is in the way, otherwise along a cached
   * A* detour around the footprints. Water never blocks steering.
   */
  steer(agent: NavAgent, x: number, y: number, tx: number, ty: number, dtSec: number): { x: number; y: number } {
    if (this.solids.length === 0 || this.hasLineOfSight(x, y, tx, ty)) {
      agent.navPath = undefined;
      return { x: tx, y: ty };
    }
    const from = Navigation.tileOf(x, y);
    const to = Navigation.tileOf(tx, ty);
    const goal = `${to.x},${to.y}`;
    agent.navTimer = (agent.navTimer ?? 0) - dtSec;
    if (!agent.navPath || agent.navGoal !== goal || agent.navTimer <= 0) {
      agent.navGoal = goal;
      agent.navTimer = 0.6;
      const target = this.isSolidTile(to.x, to.y) ? this.nearestOpenTile(to) : to;
      agent.navPath = (target && this.pathfinder.findPath(from.x, from.y, target.x, target.y, [WALK_LAND, WALK_WATER])) || undefined;
    }
    const path = agent.navPath;
    if (!path || path.length === 0) return { x: tx, y: ty };
    // Skip waypoints we can already see past
    while (path.length > 1) {
      const next = Navigation.toWorld(path[1].x, path[1].y);
      if (!this.hasLineOfSight(x, y, next.x, next.y)) break;
      path.shift();
    }
    const head = Navigation.toWorld(path[0].x, path[0].y);
    if (Math.hypot(head.x - x, head.y - y) < 4 && path.length > 1) path.shift();
    return Navigation.toWorld(path[0].x, path[0].y);
  }

  /** Closest non-solid tile to `tile` (ring search). */
  nearestOpenTile(tile: GridPoint): GridPoint | null {
    const H = this.grid.length;
    const W = this.grid[0]?.length ?? 0;
    for (let r = 1; r < Math.max(W, H); r++) {
      let best: GridPoint | null = null;
      let bestD = Infinity;
      for (let y = tile.y - r; y <= tile.y + r; y++) {
        for (let x = tile.x - r; x <= tile.x + r; x++) {
          if (x < 0 || y < 0 || x >= W || y >= H || this.grid[y][x] === WALK_SOLID) continue;
          const d = Math.hypot(x - tile.x, y - tile.y);
          if (d < bestD) {
            bestD = d;
            best = { x, y };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }
}
