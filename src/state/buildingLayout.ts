import layout from '../data/buildingLayout.json';
import type { GridPoint } from '../types/game';
import type { ResourceBuildingId } from '../types/state';

/**
 * Typed access to src/data/buildingLayout.json — the square platform (GRID_SIZE), the
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
  /** Walkable tile beside the footprint where minions work and the Treant builds. */
  workSpot: GridPoint;
  /** Water establishments only: the water tile beside the footprint where its water-type General builds. */
  waterSpot?: GridPoint;
}

export interface PortalSite {
  id: string;
  name: { en: string; tl: string };
  tile: GridPoint;
  /** Land tile invaders step onto when they leave the portal. */
  exit: GridPoint;
  /** The 2×2 rift itself, in the corner. */
  footprint: TileRect;
  /** The two Rift Sentinel tower tiles curving around the exit. */
  towers: GridPoint[];
  /** The 4×4 invasion zone (rift, towers, the water and land around them): nothing is built here. */
  zone: TileRect;
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

// ── Canals ───────────────────────────────────────────────────────────────────

export type CanalDirection = 'NORTH' | 'WEST' | 'EAST' | 'SOUTH';

export interface Canal {
  dir: CanalDirection;
  /** Water tiles from the ocean ring to the citadel wall (last one is the dock). */
  tiles: GridPoint[];
  /** Tile against the citadel wall where water-type units deliver their haul. */
  dock: GridPoint;
}

/** Four straight channels from the ocean ring to the citadel (centre column / row). */
export const CANALS: Canal[] = (() => {
  const fp = CASTLE_FOOTPRINT;
  const cx = fp.x + Math.floor(fp.w / 2);
  const cy = fp.y + Math.floor(fp.h / 2);
  const last = GRID_SIZE - 2;
  const line = (from: number, to: number, at: (i: number) => GridPoint): GridPoint[] => {
    const out: GridPoint[] = [];
    const dir = to >= from ? 1 : -1;
    for (let i = from; dir > 0 ? i <= to : i >= to; i += dir) out.push(at(i));
    return out;
  };
  const make = (dir: CanalDirection, tiles: GridPoint[]): Canal => ({ dir, tiles, dock: tiles[tiles.length - 1] });
  const all: Record<CanalDirection, Canal> = {
    NORTH: make('NORTH', line(1, fp.y - 1, (y) => ({ x: cx, y }))),
    SOUTH: make('SOUTH', line(last, fp.y + fp.h, (y) => ({ x: cx, y }))),
    WEST: make('WEST', line(1, fp.x - 1, (x) => ({ x, y: cy }))),
    EAST: make('EAST', line(last, fp.x + fp.w, (x) => ({ x, y: cy }))),
  };
  return (layout.canals.directions as CanalDirection[]).map((d) => all[d]);
})();

const CANAL_KEYS = new Set(CANALS.flatMap((c) => c.tiles.map((t) => `${t.x},${t.y}`)));
export const isCanalTile = (x: number, y: number): boolean => CANAL_KEYS.has(`${x},${y}`);
export const CANAL_DOCKS: GridPoint[] = CANALS.map((c) => c.dock);
/** Establishments run by water-type crews: always placed against water. */
export const WATER_ESTABLISHMENTS: ResourceBuildingId[] = layout.canals.waterEstablishments as ResourceBuildingId[];

/** Buildings the player can pick up and move. */
export type MovableId = ResourceBuildingId | 'SPIRE';
/** Pavement owners: the castle's ring road plus one road per establishment. */
export type RoadOwner = MovableId | 'CASTLE';

export const BUILDING_IDS: ResourceBuildingId[] = layout.constructionOrder as ResourceBuildingId[];

/**
 * Corner rifts: from the JSON corner tile, the 2×2 rift fills the corner, the
 * exit lies `exitStep` tiles diagonally inward and the sentinel towers sit at
 * `towerOffsets` (mirrored per corner), all inside a `size`×`size` zone.
 */
export const PORTAL_SITES: PortalSite[] = layout.portals.map((p) => {
  const z = layout.portalZone;
  const sx = p.tile.x === 0 ? 1 : -1;
  const sy = p.tile.y === 0 ? 1 : -1;
  const rectFrom = (n: number): TileRect => ({ x: sx > 0 ? p.tile.x : p.tile.x - n + 1, y: sy > 0 ? p.tile.y : p.tile.y - n + 1, w: n, h: n });
  return {
    id: p.id,
    name: p.name,
    tile: p.tile,
    exit: { x: p.tile.x + sx * z.exitStep, y: p.tile.y + sy * z.exitStep },
    footprint: rectFrom(z.portalSize),
    towers: z.towerOffsets.map(([dx, dy]) => ({ x: p.tile.x + sx * dx, y: p.tile.y + sy * dy })),
    zone: rectFrom(z.size),
  };
});
/** Visual scale of a rift sprite filling its 2×2 footprint. */
export const PORTAL_SCALE: number = layout.portalZone.portalScale;
export const isPortalTile = (x: number, y: number): boolean => PORTAL_SITES.some((p) => rectContainsTile(p.footprint, x, y));
export const isRiftTowerTile = (x: number, y: number): boolean => PORTAL_SITES.some((p) => p.towers.some((t) => t.x === x && t.y === y));

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

/** True for tiles on the platform's land (inside the ocean ring, off the canals). */
export const isLandTile = (x: number, y: number): boolean =>
  x >= 1 && y >= 1 && x <= GRID_SIZE - 2 && y <= GRID_SIZE - 2 && !isCanalTile(x, y);

/** Ocean ring (minus the corner rifts) and canal tiles. */
export const isWaterTile = (x: number, y: number): boolean => {
  if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) return false;
  if (isPortalTile(x, y)) return false;
  return x === 0 || y === 0 || x === GRID_SIZE - 1 || y === GRID_SIZE - 1 || isCanalTile(x, y);
};

/**
 * Which connected body of water a tile belongs to: each ocean side joins only
 * its own canal (the corner rifts and the citadel split them), so water-type
 * units stay within one region. Null for land.
 */
export const waterRegionOf = (x: number, y: number): CanalDirection | null => {
  if (!isWaterTile(x, y)) return null;
  const canal = CANALS.find((c) => c.tiles.some((t) => t.x === x && t.y === y));
  if (canal) return canal.dir;
  if (y === 0) return 'NORTH';
  if (y === GRID_SIZE - 1) return 'SOUTH';
  return x === 0 ? 'WEST' : 'EAST';
};

/** Water tiles edge-adjacent to a footprint (closest to the citadel first). */
export const waterAround = (rect: TileRect): GridPoint[] => {
  const out: GridPoint[] = [];
  for (let i = 0; i < rect.w; i++) out.push({ x: rect.x + i, y: rect.y - 1 }, { x: rect.x + i, y: rect.y + rect.h });
  for (let i = 0; i < rect.h; i++) out.push({ x: rect.x - 1, y: rect.y + i }, { x: rect.x + rect.w, y: rect.y + i });
  const c = rectCenter(CASTLE_FOOTPRINT);
  return out.filter((t) => isWaterTile(t.x, t.y)).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y));
};

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

export interface LayoutResult {
  sites: Record<ResourceBuildingId, BuildingSite>;
  roads: GridPoint[];
  roadsByBuilding: Record<RoadOwner, GridPoint[]>;
  /** Road tiles over a canal. */
  bridges: GridPoint[];
}

/**
 * Seeded establishment layout. Thirteen 2×2 sites only just fit the platform,
 * so an unlucky seed can paint itself into a corner. Then the sites already
 * placed are kept (so earlier buildings never move) and only the rest are
 * re-rolled with derived seeds — still deterministic per seed — with a little
 * more room each time. Sites always keep at least a one-tile gap so every
 * work spot stays free and reachable.
 */
export function generateLayout(
  seed: number,
  positions: BuildingPositions = {}
): LayoutResult {
  let fixed = positions;
  for (let attempt = 0; attempt < 80; attempt++) {
    // The first pass uses the classic spacing (so earlier layouts never change);
    // re-rolls may sit closer to the citadel and then nearer the shore.
    const room = attempt === 0 ? { clearance: 3, margin: layout.establishments.edgeMargin }
      : attempt < 30 ? { clearance: 2, margin: layout.establishments.edgeMargin }
      : attempt < 50 ? { clearance: 2, margin: 1 }
      // Canals and the 4×4 rift zones eat land: last re-rolls may sit one ring nearer the citadel
      : { clearance: 1, margin: 1 };
    const result = tryLayout(seed + attempt * 7919, fixed, [2, 1], room);
    if ('roads' in result) return result;
    fixed = result.placed;
  }
  throw new Error('No room to place every establishment');
}

function tryLayout(
  seed: number,
  positions: BuildingPositions,
  gaps: number[],
  room: { clearance: number; margin: number }
): LayoutResult | { placed: BuildingPositions } {
  const { size } = layout.establishments;
  const castleClearance = room.clearance;
  const edgeMargin = room.margin;
  const random = seededRandom(seed);
  const key = (x: number, y: number) => `${x},${y}`;

  const minPos = edgeMargin;
  const maxX = GRID_SIZE - 1 - edgeMargin - (size.w - 1);
  const maxY = GRID_SIZE - 1 - edgeMargin - (size.h - 1);

  const createBlocked = (gap: number) => {
    const blocked = new Set<string>();
    const block = (rect: TileRect) => {
      for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) blocked.add(key(x, y));
    };
    block(expandRect(CASTLE_FOOTPRINT, castleClearance));
    block(expandRect(SPIRE_FOOTPRINT, gap));
    block(expandRect({ ...SPIRE_WORK_SPOT, w: 1, h: 1 }, 1));
    // Each rift's 4×4 invasion zone stays clear
    for (const portal of PORTAL_SITES) block(portal.zone);
    return { blocked, block };
  };

  const gate = CASTLE_GATE;
  const sites = {} as Record<ResourceBuildingId, BuildingSite>;
  const placedRects: TileRect[] = [];

  // Relocated establishments claim their tiles first
  for (const id of BUILDING_IDS) {
    if (positions[id]) {
      const moved = { ...positions[id]!, ...size };
      placedRects.push(moved);
    }
  }

  // General builds establishments: separated from castle & other establishments, biased towards outer edge with random chance
  for (const id of BUILDING_IDS) {
    if (positions[id]) {
      const footprint: TileRect = { ...positions[id]!, ...size };
      sites[id] = { id, footprint, workSpot: workSpotFor(footprint), waterSpot: waterAround(footprint)[0] };
      continue;
    }

    let spot: GridPoint | null = null;
    for (const gap of gaps) {
      const { blocked, block } = createBlocked(gap);
      for (const pr of placedRects) block(expandRect(pr, gap));

      const wet = WATER_ESTABLISHMENTS.includes(id);
      const fits = (x: number, y: number) => {
        for (let dy = 0; dy < size.h; dy++) for (let dx = 0; dx < size.w; dx++) {
          if (blocked.has(key(x + dx, y + dy)) || !isLandTile(x + dx, y + dy)) return false;
        }
        // Water crews need water beside their establishment
        return !wet || waterAround({ x, y, ...size }).length > 0;
      };

      const edgeCandidates: GridPoint[] = [];
      const innerCandidates: GridPoint[] = [];

      // Water establishments may sit right on the shore
      const lo = wet ? 1 : minPos;
      const hiX = wet ? GRID_SIZE - 2 - (size.w - 1) : maxX;
      const hiY = wet ? GRID_SIZE - 2 - (size.h - 1) : maxY;
      for (let y = lo; y <= hiY; y++) {
        for (let x = lo; x <= hiX; x++) {
          if (!fits(x, y)) continue;
          const distToEdge = Math.min(x - 1, (GRID_SIZE - 2) - (x + size.w - 1), y - 1, (GRID_SIZE - 2) - (y + size.h - 1));
          if (distToEdge <= 2) {
            edgeCandidates.push({ x, y });
          } else {
            innerCandidates.push({ x, y });
          }
        }
      }

      const totalCandidates = [...edgeCandidates, ...innerCandidates];
      if (totalCandidates.length === 0) continue;

      // 80% chance to place near the edge of the map, 20% random inner chance
      if (edgeCandidates.length > 0 && (random() < 0.8 || innerCandidates.length === 0)) {
        spot = edgeCandidates[Math.floor(random() * edgeCandidates.length)];
      } else if (innerCandidates.length > 0) {
        spot = innerCandidates[Math.floor(random() * innerCandidates.length)];
      } else {
        spot = totalCandidates[Math.floor(random() * totalCandidates.length)];
      }

      if (spot) break;
    }

    if (!spot) {
      const placed: BuildingPositions = {};
      for (const [placedId, site] of Object.entries(sites)) placed[placedId as MovableId] = { x: site.footprint.x, y: site.footprint.y };
      return { placed };
    }

    const footprint: TileRect = { ...spot, ...size };
    const workSpot = workSpotFor(footprint);
    sites[id] = { id, footprint, workSpot, waterSpot: waterAround(footprint)[0] };
    placedRects.push(footprint);
  }

  // Roads: a paved ring around the castle, then a shortest walk (around every
  // footprint, never through one) from that ring to each work spot, so no road is cut.
  const solids = [CASTLE_FOOTPRINT, SPIRE_FOOTPRINT, ...BUILDING_IDS.map((id) => sites[id].footprint)];
  const isSolid = (x: number, y: number) => solids.some((r) => rectContainsTile(r, x, y));
  const roads = new Map<string, GridPoint>();
  const roadsByBuilding = {} as Record<RoadOwner, GridPoint[]>;

  const ring: GridPoint[] = [];
  const around = expandRect(CASTLE_FOOTPRINT, 1);
  for (let y = around.y; y < around.y + around.h; y++) {
    for (let x = around.x; x < around.x + around.w; x++) {
      // Ring tiles over a canal (including the gate) become bridges
      if (!rectContainsTile(CASTLE_FOOTPRINT, x, y) && (isLandTile(x, y) || isCanalTile(x, y)) && !isSolid(x, y)) ring.push({ x, y });
    }
  }
  roadsByBuilding.CASTLE = ring;
  for (const t of ring) roads.set(key(t.x, t.y), t);
  void gate;

  const walkRoad = (target: GridPoint, bridging: boolean): GridPoint[] | null => {
    // BFS from the work spot back to the nearest ring tile (4-way)
    const prev = new Map<string, string | null>([[key(target.x, target.y), null]]);
    const queue: GridPoint[] = [target];
    const ringKeys = new Set(ring.map((t) => key(t.x, t.y)));
    let end: GridPoint | null = ringKeys.has(key(target.x, target.y)) ? target : null;
    while (queue.length && !end) {
      const cur = queue.shift()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        const k = key(nx, ny);
        if (prev.has(k) || !(isLandTile(nx, ny) || (bridging && isCanalTile(nx, ny))) || isSolid(nx, ny)) continue;
        prev.set(k, key(cur.x, cur.y));
        if (ringKeys.has(k)) { end = { x: nx, y: ny }; break; }
        queue.push({ x: nx, y: ny });
      }
    }
    if (!end) return null;
    const list: GridPoint[] = [];
    for (let k: string | null | undefined = key(end.x, end.y); k; k = prev.get(k)) {
      const [x, y] = k.split(',').map(Number);
      list.push({ x, y });
      roads.set(k, { x, y });
    }
    return list; // ordered castle → work spot
  };
  // Land only first; bridge a canal only when there is no dry way round
  const computeRoad = (target: GridPoint): GridPoint[] => walkRoad(target, false) ?? walkRoad(target, true) ?? [target];

  roadsByBuilding.SPIRE = computeRoad(SPIRE_WORK_SPOT);
  for (const id of BUILDING_IDS) {
    roadsByBuilding[id] = computeRoad(sites[id].workSpot);
  }

  const roadList = Array.from(roads.values());
  return { sites, roads: roadList, roadsByBuilding, bridges: roadList.filter((t) => isCanalTile(t.x, t.y)) };
}

/**
 * Seeded Crystal Spire spot, so the spire lands somewhere different each realm
 * like the establishments: any clear inland tile off the castle and the rifts
 * (kept a few tiles from the shore so the thirteen sites still fit around it).
 */
export function randomSpireSpot(seed: number): GridPoint {
  const { w, h } = layout.spire.footprint;
  const random = seededRandom((seed ^ 0x5f1e3d) >>> 0);
  const blocked = [expandRect(CASTLE_FOOTPRINT, 2), ...PORTAL_SITES.map((p) => expandRect(p.zone, 1))];
  const hits = (r: TileRect, x: number, y: number) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y;
  const candidates: GridPoint[] = [];
  for (let y = 3; y <= GRID_SIZE - 4 - (h - 1); y++) {
    for (let x = 3; x <= GRID_SIZE - 4 - (w - 1); x++) {
      if (blocked.some((r) => hits(r, x, y))) continue;
      if (CANALS.some((c) => c.tiles.some((t) => hits({ ...t, w: 1, h: 1 }, x, y)))) continue;
      candidates.push({ x, y });
    }
  }
  if (candidates.length === 0) return { x: layout.spire.footprint.x, y: layout.spire.footprint.y };
  return candidates[Math.floor(random() * candidates.length)];
}

/** Current establishment sites. Entries are updated in place by applyLayoutSeed. */
const initialLayout = generateLayout(1);
export const BUILDING_SITES: Record<ResourceBuildingId, BuildingSite> = initialLayout.sites;
/** Current decorative road tiles (updated in place). */
export const ROAD_TILES: GridPoint[] = [...initialLayout.roads];
/** Roads mapped by building/spire. */
export const ROADS_BY_BUILDING: Record<RoadOwner, GridPoint[]> = { ...initialLayout.roadsByBuilding };
/** Current road tiles over canals (updated in place). */
export const BRIDGE_TILES: GridPoint[] = [...initialLayout.bridges];
export const isBridgeTile = (x: number, y: number): boolean => BRIDGE_TILES.some((t) => t.x === x && t.y === y);

let activeSeed = 0;
let activePositions = '{}';
export const getLayoutSeed = () => activeSeed;

/**
 * Switches the realm to the layout for `seed`. Site objects are mutated in
 * place so every module holding a reference (NODE_SPOTS, TASK_NODE_LOCATIONS)
 * follows along. The Phaser scene is keyed on the seed and remounts to redraw.
 */
export function applyLayoutSeed(seed: number, positions: BuildingPositions = {}): void {
  // Saves from an older layout (20×20, before canals / rift zones) may have a hand-placed
  // building off the land, over a canal, in a rift zone or against the citadel: let it re-roll
  const overCanal = (id: MovableId, p: GridPoint) => {
    const size = id === 'SPIRE' ? layout.spire.footprint : layout.establishments.size;
    const rect: TileRect = { x: p.x, y: p.y, w: size.w, h: size.h };
    const hits = (o: TileRect) => rect.x < o.x + o.w && rect.x + rect.w > o.x && rect.y < o.y + o.h && rect.y + rect.h > o.y;
    for (let y = p.y; y < p.y + size.h; y++) for (let x = p.x; x < p.x + size.w; x++) if (!isLandTile(x, y)) return true;
    return PORTAL_SITES.some((ps) => hits(ps.zone)) || hits(expandRect(CASTLE_FOOTPRINT, 1));
  };
  positions = Object.fromEntries(Object.entries(positions).filter(([id, p]) => p && !overCanal(id as MovableId, p))) as BuildingPositions;
  const posKey = JSON.stringify(positions);
  if (seed === activeSeed && posKey === activePositions) return;
  activeSeed = seed;
  activePositions = posKey;
  // The spire moves first so establishments are placed (and roads routed) around it
  const spire = positions.SPIRE ?? randomSpireSpot(seed);
  Object.assign(SPIRE_FOOTPRINT, { ...spire, w: layout.spire.footprint.w, h: layout.spire.footprint.h });
  Object.assign(SPIRE_WORK_SPOT, workSpotFor(SPIRE_FOOTPRINT));
  const { sites, roads, roadsByBuilding, bridges } = generateLayout(seed, positions);
  for (const id of BUILDING_IDS) {
    Object.assign(BUILDING_SITES[id].footprint, sites[id].footprint);
    Object.assign(BUILDING_SITES[id].workSpot, sites[id].workSpot);
    BUILDING_SITES[id].waterSpot = sites[id].waterSpot;
  }
  ROAD_TILES.splice(0, ROAD_TILES.length, ...roads);
  BRIDGE_TILES.splice(0, BRIDGE_TILES.length, ...bridges);
  for (const key of Object.keys(roadsByBuilding) as RoadOwner[]) {
    ROADS_BY_BUILDING[key] = roadsByBuilding[key];
  }
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
  const { castleClearance } = layout.establishments;
  const size = id === 'SPIRE' ? layout.spire.footprint : layout.establishments.size;
  const rect: TileRect = { x, y, w: size.w, h: size.h };
  const overlaps = (other: TileRect) =>
    rect.x < other.x + other.w && rect.x + rect.w > other.x && rect.y < other.y + other.h && rect.y + rect.h > other.y;
  const tile = (p: GridPoint): TileRect => ({ ...p, w: 1, h: 1 });
  for (let ty = y; ty < y + size.h; ty++) for (let tx = x; tx < x + size.w; tx++) if (!isLandTile(tx, ty)) return false;
  if (id !== 'SPIRE' && WATER_ESTABLISHMENTS.includes(id) && waterAround(rect).length === 0) return false;
  if (overlaps(expandRect(CASTLE_FOOTPRINT, castleClearance - 1))) return false;
  // Portals: their 4×4 invasion zone (rift, sentinels, exit) is off limits
  if (PORTAL_SITES.some((p) => overlaps(p.zone))) return false;
  // Other establishments (the spire counts as one): no overlap, and never on their work spot
  const others: Array<{ footprint: TileRect; workSpot: GridPoint }> = [
    ...BUILDING_IDS.filter((o) => o !== id).map((o) => BUILDING_SITES[o]),
    ...(id === 'SPIRE' ? [] : [{ footprint: SPIRE_FOOTPRINT, workSpot: SPIRE_WORK_SPOT }]),
  ];
  if (others.some((o) => overlaps(o.footprint) || overlaps(tile(o.workSpot)))) return false;
  // Our own work spot must be free and reachable
  const spot = workSpotFor(rect);
  if (!spot || others.some((o) => rectContainsTile(o.footprint, spot.x, spot.y))) return false;
  return true;
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
