import layout from '../data/buildingLayout.json';
import type { GridPoint } from '../types/game';
import type { ResourceBuildingId } from '../types/state';

/**
 * Typed access to src/data/buildingLayout.json — the 20×20 platform, the
 * citadel at its centre, the Crystal Spire and the invader portals — plus the
 * five establishments, which are placed randomly per realm from a layout seed
 * (see applyLayoutSeed). Grid coordinates are 0-based (x, y); players see them
 * as chess names (E7 …).
 */

/** Tile rectangle: tiles x..x+w-1 × y..y+h-1. */
export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BuildingSite {
  id: ResourceBuildingId;
  footprint: TileRect;
  /** Walkable tile beside the footprint where minions work and the Ent builds. */
  workSpot: GridPoint;
}

export interface PortalSite {
  id: string;
  name: { en: string; tl: string };
  tile: GridPoint;
  /** Land tile invaders step onto when they leave the portal. */
  exit: GridPoint;
}

/** Tiles per side; the outer ring is ocean (except the corner portals). */
export const GRID_SIZE: number = layout.gridSize;
/** Centre tile of the platform. */
export const GRID_CENTER: GridPoint = { x: Math.floor(GRID_SIZE / 2), y: Math.floor(GRID_SIZE / 2) };

export const CASTLE_FOOTPRINT: TileRect = layout.castle.footprint;
/** Walkable tile in front of the citadel gate — deposits, spawns and repairs happen here. */
export const CASTLE_GATE: GridPoint = layout.castle.gate;
/** Mutable: a relocated spire updates these in place (see applyLayoutSeed). */
export const SPIRE_FOOTPRINT: TileRect = { ...layout.spire.footprint };
export const SPIRE_WORK_SPOT: GridPoint = { ...layout.spire.workSpot };

/** Buildings the player can pick up and move. */
export type MovableId = ResourceBuildingId | 'SPIRE';

export const BUILDING_IDS: ResourceBuildingId[] = layout.constructionOrder as ResourceBuildingId[];

export const PORTAL_SITES: PortalSite[] = layout.portals;

/** Continuous grid coordinate of a rectangle's centre (tile centres sit on integers). */
export const rectCenter = (rect: TileRect): { x: number; y: number } => ({
  x: rect.x + (rect.w - 1) / 2,
  y: rect.y + (rect.h - 1) / 2,
});

export const rectContainsTile = (rect: TileRect, x: number, y: number): boolean =>
  x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;

/** Rectangle grown by `margin` tiles on every side (tower range zones). */
export const expandRect = (rect: TileRect, margin: number): TileRect => ({
  x: rect.x - margin,
  y: rect.y - margin,
  w: rect.w + margin * 2,
  h: rect.h + margin * 2,
});

/**
 * Distance in tiles from a continuous grid point to a rectangle's outer edge
 * (0 when inside). Tile (x, y) spans x-0.5 … x+0.5.
 */
export const distanceToRect = (gx: number, gy: number, rect: TileRect): number => {
  const minX = rect.x - 0.5;
  const maxX = rect.x + rect.w - 0.5;
  const minY = rect.y - 0.5;
  const maxY = rect.y + rect.h - 0.5;
  const dx = gx < minX ? minX - gx : gx > maxX ? gx - maxX : 0;
  const dy = gy < minY ? minY - gy : gy > maxY ? gy - maxY : 0;
  return Math.hypot(dx, dy);
};

/** True for tiles on the platform's land (inside the ocean ring). */
export const isLandTile = (x: number, y: number): boolean =>
  x >= 1 && y >= 1 && x <= GRID_SIZE - 2 && y <= GRID_SIZE - 2;

// ── Random establishment placement ──────────────────────────────────────────

/** Small deterministic PRNG (mulberry32) so a seed always yields the same layout. */
const seededRandom = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const newLayoutSeed = (): number => Math.floor(Math.random() * 0x7fffffff) + 1;

/**
 * Places the five establishments at random for `seed`: fully on land, clear of
 * the citadel, spire, gate and portals, and at least `minGap` tiles apart so
 * the platform never gets cluttered and every tile stays reachable. Each
 * establishment's work spot is the free side tile closest to the castle gate.
 * Also returns decorative road tiles leading from the gate to each work spot.
 */
/** Player-chosen top-left tiles for relocated establishments. */
export type BuildingPositions = Partial<Record<MovableId, GridPoint>>;

/** Free edge tile of a footprint closest to the castle gate (where minions work). */
const workSpotFor = (footprint: TileRect): GridPoint => {
  const sides: GridPoint[] = [];
  for (let i = 0; i < footprint.w; i++) sides.push({ x: footprint.x + i, y: footprint.y - 1 }, { x: footprint.x + i, y: footprint.y + footprint.h });
  for (let i = 0; i < footprint.h; i++) sides.push({ x: footprint.x - 1, y: footprint.y + i }, { x: footprint.x + footprint.w, y: footprint.y + i });
  return sides
    .filter((s) => isLandTile(s.x, s.y))
    .sort((a, b) => Math.hypot(a.x - CASTLE_GATE.x, a.y - CASTLE_GATE.y) - Math.hypot(b.x - CASTLE_GATE.x, b.y - CASTLE_GATE.y))[0];
};

export function generateLayout(
  seed: number,
  positions: BuildingPositions = {}
): { sites: Record<ResourceBuildingId, BuildingSite>; roads: GridPoint[] } {
  const { size, castleClearance, minGap, edgeMargin } = layout.establishments;
  const random = seededRandom(seed);
  const key = (x: number, y: number) => `${x},${y}`;
  const blocked = new Set<string>();
  const block = (rect: TileRect) => {
    for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) blocked.add(key(x, y));
  };

  block(expandRect(CASTLE_FOOTPRINT, castleClearance));
  block(expandRect(SPIRE_FOOTPRINT, minGap));
  block(expandRect({ ...SPIRE_WORK_SPOT, w: 1, h: 1 }, 1));
  for (const portal of PORTAL_SITES) block(expandRect({ ...portal.exit, w: 1, h: 1 }, minGap));

  const minPos = edgeMargin;
  const maxX = GRID_SIZE - 1 - edgeMargin - (size.w - 1);
  const maxY = GRID_SIZE - 1 - edgeMargin - (size.h - 1);
  const fits = (x: number, y: number) => {
    for (let dy = 0; dy < size.h; dy++) for (let dx = 0; dx < size.w; dx++) {
      if (blocked.has(key(x + dx, y + dy))) return false;
    }
    return true;
  };

  const gate = CASTLE_GATE;
  const sites = {} as Record<ResourceBuildingId, BuildingSite>;
  // Relocated establishments claim their tiles first; the rest are placed around them
  for (const id of BUILDING_IDS) {
    const moved = positions[id];
    if (moved) block(expandRect({ ...moved, ...size }, minGap));
  }
  for (const id of BUILDING_IDS) {
    let spot: GridPoint | null = positions[id] ? { ...positions[id]! } : null;
    for (let attempt = 0; attempt < 400 && !spot; attempt++) {
      const x = minPos + Math.floor(random() * (maxX - minPos + 1));
      const y = minPos + Math.floor(random() * (maxY - minPos + 1));
      if (fits(x, y)) spot = { x, y };
    }
    // Deterministic fallback scan (never expected on a 20×20 platform)
    for (let y = minPos; y <= maxY && !spot; y++) for (let x = minPos; x <= maxX && !spot; x++) {
      if (fits(x, y)) spot = { x, y };
    }
    if (!spot) throw new Error(`No room to place ${id}`);

    const footprint: TileRect = { ...spot, ...size };
    const workSpot = workSpotFor(footprint);

    sites[id] = { id, footprint, workSpot };
    if (!positions[id]) block(expandRect(footprint, minGap));
  }

  // Roads: an L from the gate to each work spot, never paving over a footprint
  const solids = [CASTLE_FOOTPRINT, SPIRE_FOOTPRINT, ...BUILDING_IDS.map((id) => sites[id].footprint)];
  const roads = new Map<string, GridPoint>();
  const pave = (x: number, y: number) => {
    if (!solids.some((r) => rectContainsTile(r, x, y))) roads.set(key(x, y), { x, y });
  };
  // The Crystal Spire gets a road too (it can be relocated like the establishments)
  for (const workSpot of [SPIRE_WORK_SPOT, ...BUILDING_IDS.map((id) => sites[id].workSpot)]) {
    const stepX = Math.sign(workSpot.x - gate.x);
    const stepY = Math.sign(workSpot.y - gate.y);
    for (let x = gate.x; x !== workSpot.x; x += stepX) pave(x, gate.y);
    for (let y = gate.y; ; y += stepY) {
      pave(workSpot.x, y);
      if (y === workSpot.y) break;
    }
  }
  return { sites, roads: Array.from(roads.values()) };
}

/** Current establishment sites. Entries are updated in place by applyLayoutSeed. */
export const BUILDING_SITES: Record<ResourceBuildingId, BuildingSite> = generateLayout(1).sites;
/** Current decorative road tiles (updated in place). */
export const ROAD_TILES: GridPoint[] = [];

let activeSeed = 0;
let activePositions = '{}';
export const getLayoutSeed = () => activeSeed;

/**
 * Switches the realm to the layout for `seed`. Site objects are mutated in
 * place so every module holding a reference (NODE_SPOTS, TASK_NODE_LOCATIONS)
 * follows along. The Phaser scene is keyed on the seed and remounts to redraw.
 */
export function applyLayoutSeed(seed: number, positions: BuildingPositions = {}): void {
  const posKey = JSON.stringify(positions);
  if (seed === activeSeed && posKey === activePositions) return;
  activeSeed = seed;
  activePositions = posKey;
  // The spire moves first so establishments are placed (and roads routed) around it
  const spire = positions.SPIRE;
  Object.assign(SPIRE_FOOTPRINT, spire ? { ...spire, w: layout.spire.footprint.w, h: layout.spire.footprint.h } : layout.spire.footprint);
  Object.assign(SPIRE_WORK_SPOT, spire ? workSpotFor(SPIRE_FOOTPRINT) : layout.spire.workSpot);
  const { sites, roads } = generateLayout(seed, positions);
  for (const id of BUILDING_IDS) {
    Object.assign(BUILDING_SITES[id].footprint, sites[id].footprint);
    Object.assign(BUILDING_SITES[id].workSpot, sites[id].workSpot);
  }
  ROAD_TILES.splice(0, ROAD_TILES.length, ...roads);
}
applyLayoutSeed(1);

/** Current footprint of a movable building. */
export const footprintOf = (id: MovableId): TileRect => (id === 'SPIRE' ? SPIRE_FOOTPRINT : BUILDING_SITES[id].footprint);

/**
 * Whether establishment `id` may be moved so its top-left tile is (x, y): fully
 * on land, clear of the citadel, spire, portals and one free tile away from
 * every other establishment.
 */
export function canPlaceEstablishment(id: MovableId, x: number, y: number): boolean {
  const { castleClearance, edgeMargin } = layout.establishments;
  const size = id === 'SPIRE' ? layout.spire.footprint : layout.establishments.size;
  const rect: TileRect = { x, y, ...size };
  const overlaps = (other: TileRect) =>
    rect.x < other.x + other.w && rect.x + rect.w > other.x && rect.y < other.y + other.h && rect.y + rect.h > other.y;
  if (x < edgeMargin - 1 || y < edgeMargin - 1) return false;
  if (x + size.w - 1 > GRID_SIZE - edgeMargin || y + size.h - 1 > GRID_SIZE - edgeMargin) return false;
  if (overlaps(expandRect(CASTLE_FOOTPRINT, castleClearance - 1))) return false;
  if (id !== 'SPIRE' && overlaps(expandRect(SPIRE_FOOTPRINT, 1))) return false;
  if (id !== 'SPIRE' && overlaps({ ...SPIRE_WORK_SPOT, w: 1, h: 1 })) return false;
  if (PORTAL_SITES.some((p) => overlaps(expandRect({ ...p.exit, w: 1, h: 1 }, 1)))) return false;
  return BUILDING_IDS.every((other) => other === id || !overlaps(expandRect(BUILDING_SITES[other].footprint, 1)));
}

/** Resource-node positions (where minions harvest) derived from the layout. */
export const NODE_SPOTS = {
  AETHER: SPIRE_WORK_SPOT,
  STONE: BUILDING_SITES.QUARRY.workSpot,
  WOOD: BUILDING_SITES.WOOD.workSpot,
  ESSENCE: BUILDING_SITES.CAVE.workSpot,
  METAL: BUILDING_SITES.MINE.workSpot,
  PORT: BUILDING_SITES.PORT.workSpot,
} as const;
