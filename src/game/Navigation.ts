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
/** Road over a canal: land units walk across, water units swim under. */
export const WALK_BRIDGE = 3;

/** Which tiles a unit may stand on: land (+bridges), water (+bridges) or anything (flyers, amphibians). */
export type MoveMode = 'land' | 'water' | 'any';
export const TILES_FOR: Record<MoveMode, number[]> = {
  land: [WALK_LAND, WALK_BRIDGE],
  water: [WALK_WATER, WALK_BRIDGE],
  any: [WALK_LAND, WALK_WATER, WALK_BRIDGE],
};

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

  /** Swaps the terrain grid (e.g. bridges moved with a relocated establishment's road). */
  setBaseGrid(grid: number[][]): void {
    this.baseGrid = grid;
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

  /** Whether a mover of `mode` may stand on tile (x, y) (solids aside). */
  allows(x: number, y: number, mode: MoveMode): boolean {
    const v = this.grid[y]?.[x];
    if (v === undefined || v === WALK_SOLID) return false;
    return TILES_FOR[mode].includes(v);
  }

  /**
   * Keeps a mover on its own terrain: when the point lies on a forbidden tile
   * it is pushed onto the closest allowed neighbour. A unit stranded with no
   * allowed neighbour is left free so it can walk back to its terrain.
   */
  private keepOnTerrain(g: { x: number; y: number }, mode: MoveMode): { x: number; y: number } | null {
    if (mode === 'any') return null;
    const tx = Math.round(g.x);
    const ty = Math.round(g.y);
    if (this.grid[ty]?.[tx] === undefined || this.grid[ty][tx] === WALK_SOLID || this.allows(tx, ty, mode)) return null;
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || !this.allows(tx + dx, ty + dy, mode)) continue;
        const cx = Math.min(tx + dx + 0.49, Math.max(tx + dx - 0.49, g.x));
        const cy = Math.min(ty + dy + 0.49, Math.max(ty + dy - 0.49, g.y));
        const d = Math.hypot(cx - g.x, cy - g.y);
        if (d < bestD) {
          bestD = d;
          best = { x: cx, y: cy };
        }
      }
    }
    return best;
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
  pushOut(x: number, y: number, radius: number = 0.22, mode: MoveMode = 'land'): { x: number; y: number } {
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
    

    // Land units stay off the water, water units in it
    const terrain = this.keepOnTerrain(g, mode);
    if (terrain) { g = terrain; moved = true; }

    // Clamp again after solid push-out
    if (g.x < minBound) { g.x = minBound; moved = true; }
    else if (g.x > maxBound) { g.x = maxBound; moved = true; }
    if (g.y < minBound) { g.y = minBound; moved = true; }
    else if (g.y > maxBound) { g.y = maxBound; moved = true; }
    
    return moved ? Navigation.toWorld(g.x, g.y) : { x, y };
  }

  /** True when the straight line between two world points crosses no solid footprint. */
  hasLineOfSight(ax: number, ay: number, bx: number, by: number, radius: number = 0.15, mode: MoveMode = 'any'): boolean {
    const a = Navigation.toGrid(ax, ay);
    const b = Navigation.toGrid(bx, by);
    const startOk = mode === 'any' || this.allows(Math.round(a.x), Math.round(a.y), mode);
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.2));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const gx = a.x + (b.x - a.x) * t;
      const gy = a.y + (b.y - a.y) * t;
      if (this.solidAt(gx, gy, radius)) return false;
      // Crossing the wrong terrain (only once the mover stands on its own)
      if (startOk && mode !== 'any' && !this.allows(Math.round(gx), Math.round(gy), mode)) return false;
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
  steer(agent: NavAgent, x: number, y: number, tx: number, ty: number, dtSec: number, mode: MoveMode = 'land'): { x: number; y: number } {
    if ((this.solids.length === 0 && mode === 'any') || this.hasLineOfSight(x, y, tx, ty, 0.15, mode)) {
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
      agent.navPath = this.planPath(from, to, mode) || undefined;
    }
    const path = agent.navPath;
    if (!path || path.length === 0) return { x: tx, y: ty };
    // Skip waypoints we can already see past
    while (path.length > 1) {
      const next = Navigation.toWorld(path[1].x, path[1].y);
      if (!this.hasLineOfSight(x, y, next.x, next.y, 0.15, mode)) break;
      path.shift();
    }
    const head = Navigation.toWorld(path[0].x, path[0].y);
    if (Math.hypot(head.x - x, head.y - y) < 4 && path.length > 1) path.shift();
    return Navigation.toWorld(path[0].x, path[0].y);
  }

  /**
   * Grid path for a mover of `mode`. A target on the wrong terrain is swapped
   * for the reachable allowed tile closest to it (a Merman chasing a knight on
   * land swims to the nearest bank); a stranded unit first heads for its terrain.
   */
  private planPath(from: GridPoint, to: GridPoint, mode: MoveMode): GridPoint[] | null {
    const allowed = TILES_FOR[mode];
    if (mode !== 'any' && !this.allows(from.x, from.y, mode)) {
      const home = this.nearestAllowedTile(from, mode);
      return home ? this.pathfinder.findPath(from.x, from.y, home.x, home.y, [...TILES_FOR.any]) : null;
    }
    if (this.allows(to.x, to.y, mode)) {
      const direct = this.pathfinder.findPath(from.x, from.y, to.x, to.y, allowed);
      if (direct) return direct;
    } else if (mode === 'land' && this.isSolidTile(to.x, to.y)) {
      const open = this.nearestOpenTile(to);
      const direct = open && this.pathfinder.findPath(from.x, from.y, open.x, open.y, allowed);
      if (direct) return direct;
    }
    return this.pathTowards(from, to, allowed);
  }

  /** BFS over allowed tiles to the reachable tile closest to `to`. */
  private pathTowards(from: GridPoint, to: GridPoint, allowed: number[]): GridPoint[] | null {
    const W = this.grid[0]?.length ?? 0;
    const H = this.grid.length;
    const key = (x: number, y: number) => y * W + x;
    const prev = new Map<number, number>([[key(from.x, from.y), -1]]);
    const queue: GridPoint[] = [from];
    let best = from;
    let bestD = Math.hypot(from.x - to.x, from.y - to.y);
    while (queue.length) {
      const cur = queue.shift()!;
      const d = Math.hypot(cur.x - to.x, cur.y - to.y);
      if (d < bestD) {
        bestD = d;
        best = cur;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || prev.has(key(nx, ny)) || !allowed.includes(this.grid[ny][nx])) continue;
        prev.set(key(nx, ny), key(cur.x, cur.y));
        queue.push({ x: nx, y: ny });
      }
    }
    const path: GridPoint[] = [];
    for (let k = key(best.x, best.y); k !== -1; k = prev.get(k)!) path.unshift({ x: k % W, y: Math.floor(k / W) });
    return path;
  }

  /** Closest tile a mover of `mode` may stand on. */
  nearestAllowedTile(tile: GridPoint, mode: MoveMode): GridPoint | null {
    const H = this.grid.length;
    const W = this.grid[0]?.length ?? 0;
    let best: GridPoint | null = null;
    let bestD = Infinity;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!this.allows(x, y, mode)) continue;
        const d = Math.hypot(x - tile.x, y - tile.y);
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    }
    return best;
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
