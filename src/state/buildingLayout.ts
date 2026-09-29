import layout from '../data/buildingLayout.json';
import type { GridPoint } from '../types/game';
import type { ResourceBuildingId } from '../types/state';

/**
 * Typed access to src/data/buildingLayout.json — where the citadel, the five
 * establishments, the Crystal Spire and the invader portals stand. Grid
 * coordinates are 0-based (x, y); players see them as chess names (E7 …).
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

export const CASTLE_FOOTPRINT: TileRect = layout.castle.footprint;
/** Walkable tile in front of the citadel gate — deposits, spawns and repairs happen here. */
export const CASTLE_GATE: GridPoint = layout.castle.gate;
export const SPIRE_FOOTPRINT: TileRect = layout.spire.footprint;
export const SPIRE_WORK_SPOT: GridPoint = layout.spire.workSpot;

export const BUILDING_IDS: ResourceBuildingId[] = layout.constructionOrder as ResourceBuildingId[];

export const BUILDING_SITES: Record<ResourceBuildingId, BuildingSite> = Object.fromEntries(
  BUILDING_IDS.map((id) => {
    const site = (layout.buildings as Record<string, { footprint: TileRect; workSpot: GridPoint }>)[id];
    return [id, { id, ...site }];
  })
) as Record<ResourceBuildingId, BuildingSite>;

export const PORTAL_SITES: PortalSite[] = layout.portals;

export const ROAD_TILES: GridPoint[] = layout.roads.map(([x, y]) => ({ x, y }));

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

/** Resource-node positions (where minions harvest) derived from the layout. */
export const NODE_SPOTS = {
  AETHER: SPIRE_WORK_SPOT,
  STONE: BUILDING_SITES.QUARRY.workSpot,
  WOOD: BUILDING_SITES.WOOD.workSpot,
  ESSENCE: BUILDING_SITES.CAVE.workSpot,
  METAL: BUILDING_SITES.MINE.workSpot,
  PORT: BUILDING_SITES.PORT.workSpot,
} as const;
