import { TileType } from '../types/game';
import { TILE_WIDTH, TILE_HEIGHT, TILE_DEPTH } from './IsometricHelper';
import PLATFORM_THEMES from '../data/platformThemes.json';
import type { Difficulty } from '../state/difficulty';

/**
 * PixelTileArt — pure (DOM-free) pixel painter for the 2.5D isometric tiles.
 *
 * Every tile is painted pixel-by-pixel into an RGBA buffer at "art pixel"
 * resolution, then displayed at ART_PIXEL world units per pixel with NEAREST
 * filtering so it stays crisp pixel art at any zoom / devicePixelRatio.
 */

export const ART_PIXEL = 2; // world units per art pixel

export const TILE_ART_W = TILE_WIDTH / ART_PIXEL;        // 36
const TOP_H = TILE_HEIGHT / ART_PIXEL;                   // 18
const HALF_W = TILE_ART_W / 2;                           // 18
const HALF_H = TOP_H / 2;                                // 9
const LAND_DEPTH = TILE_DEPTH / ART_PIXEL;               // 12
export const WATER_ART_DROP = 4;                         // water surface sits 4 art px (8 world) below land
const CLIFF_DEPTH = 26;                                  // extra rock under the island's front edges
const CLIFF_JAG = 6;
export const TILE_ART_H = TOP_H + LAND_DEPTH + CLIFF_DEPTH + CLIFF_JAG + 2;

/** World-space offset from a tile's gridToScreen() centre to its frame's top-left corner. */
export const TILE_FRAME_OFFSET_X = -HALF_W * ART_PIXEL;
export const TILE_FRAME_OFFSET_Y = -HALF_H * ART_PIXEL;
/** World-space drop of the water surface relative to land. */
export const WATER_DROP_WORLD = WATER_ART_DROP * ART_PIXEL;

export interface TilePalette {
  topColor: number;
  leftColor: number;
  rightColor: number;
  strokeColor: number;
}

export interface TileArtSpec {
  type: TileType;
  colors: TilePalette;
  gridX: number;
  gridY: number;
  /** Left (south-west) face is on the island's outer edge — extend into a cliff. */
  cliffLeft: boolean;
  /** Right (south-east) face is on the island's outer edge — extend into a cliff. */
  cliffRight: boolean;
  platformPhase: 1 | 2 | 3 | 4;
  /** Difficulty theme (platformThemes.json): Easy blooms, Hard cracks and darkens. Defaults to NORMAL. */
  difficulty?: Difficulty;
  /** Water only: which grid neighbours are land (+x, -x, +y, -y), for shallows and shore foam. */
  shore?: { px: boolean; nx: boolean; py: boolean; ny: boolean };
  /** Layout seed: places the random curved sand patches on the grass. */
  seed?: number;
  /**
   * Living terrain as curved fields over the island (>= 0.5 inside): sand the
   * Caterpillar churned, shore the Leviathan is soaking, and raised rock.
   */
  terrain?: {
    sand?: (u: number, v: number) => number; wet?: (u: number, v: number) => number; raised?: (u: number, v: number) => number;
    /** Curved road strip (> 0 inside) and its cobble colour. */
    road?: (u: number, v: number) => number; roadColor?: number;
  };
}

const SAND = 0xe9d8a6;
const WET_SAND = 0xb8a47a;
const BANK = [0xc9b07a, 0xa88f5e, 0x8a7448, 0x6e5b38];

type Phase = 1 | 2 | 3 | 4;
const hex = (v: string) => Number(v);
const THEMES = Object.fromEntries(Object.entries(PLATFORM_THEMES.difficulty).map(([k, t]) => [k, { ...t, tint: hex(t.tint) }])) as
  Record<Difficulty, { tint: number; tintAmount: number; blossom: number; crack: number; rubble: number; cliffDarken: number }>;
const REALM_GLOW = Object.fromEntries(Object.entries(PLATFORM_THEMES.realmGlow).map(([k, v]) => [k, hex(v)])) as unknown as Record<Phase, number>;
const REALM_BLOSSOM = Object.fromEntries(Object.entries(PLATFORM_THEMES.realmBlossom).map(([k, v]) => [k, v.map(hex)])) as unknown as Record<Phase, number[]>;

export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
}

// ── Colour helpers ───────────────────────────────────────────────────────────

const shade = (c: number, f: number): number => {
  const r = Math.min(255, Math.round(((c >> 16) & 0xff) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 0xff) * f));
  const b = Math.min(255, Math.round((c & 0xff) * f));
  return (r << 16) | (g << 8) | b;
};

const mix = (a: number, b: number, t: number): number => {
  const r = Math.round(((a >> 16) & 0xff) * (1 - t) + ((b >> 16) & 0xff) * t);
  const g = Math.round(((a >> 8) & 0xff) * (1 - t) + ((b >> 8) & 0xff) * t);
  const bl = Math.round((a & 0xff) * (1 - t) + (b & 0xff) * t);
  return (r << 16) | (g << 8) | bl;
};

/** Deterministic 0..1 hash so every tile is unique but stable across renders. */
const hash = (a: number, b: number, c: number, d: number = 0): number => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647 + d * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

// Rock colour the cliffs blend toward, per realm phase
const CLIFF_ROCK: Record<1 | 2 | 3 | 4, number> = {
  1: 0x3b2a3a,
  2: 0x3a2418,
  3: 0x1f2d3d,
  4: 0x2e2a4a,
};

// ── Geometry ─────────────────────────────────────────────────────────────────

/** Is art pixel (px, py) inside the top diamond (py relative to diamond top)? */
/** True for pixels on a tile frame's top (diamond) face. */
export const isTopPixel = (px: number, py: number): boolean => inTop(px, py);

const inTop = (px: number, py: number): boolean => {
  if (py < 0 || py >= TOP_H) return false;
  const dx = Math.abs(px + 0.5 - HALF_W);
  const dy = Math.abs(py + 0.5 - HALF_H);
  return dx / HALF_W + dy / HALF_H <= 1;
};

/** Normalised diamond distance: 0 at centre, 1 on the edge. */
const diamondDist = (px: number, py: number): number =>
  Math.abs(px + 0.5 - HALF_W) / HALF_W + Math.abs(py + 0.5 - HALF_H) / HALF_H;

// Last row of the top face in each column (tips fall back to the middle row)
const TOP_BOTTOM_ROW: number[] = Array.from({ length: TILE_ART_W }, (_, px) => {
  let last = HALF_H - 1;
  for (let py = 0; py < TOP_H; py++) if (inTop(px, py)) last = py;
  return last;
});

// ── Water ────────────────────────────────────────────────────────────────────

const SHALLOW = 0x2dd4bf;
const DEEP = 0x0b2a5b;
const FOAM = 0xf0fdff;

/**
 * One ocean pixel. Works in island coordinates so the pattern runs on across
 * tiles: deep blue offshore turning turquoise in the shallows, rolling curved
 * crests (light ridge, dark trough) and a ragged foam line along every shore,
 * so the coast bulges and bites instead of running straight like a canal.
 */
function paintWater(
  base: number,
  colors: TilePalette,
  gx: number,
  gy: number,
  px: number,
  py: number,
  shore: TileArtSpec['shore']
): number {
  // Position inside the tile along the grid axes (0..1)
  const sx = (px + 0.5 - HALF_W) / HALF_W;
  const sy = (py + 0.5) / HALF_H;
  const lx = Math.min(1, Math.max(0, (sx + sy) / 2));
  const ly = Math.min(1, Math.max(0, (sy - sx) / 2));
  const wx = gx + lx;
  const wy = gy + ly;

  // Distance to the nearest land edge (grid units); far offshore when there is none
  let shoreDist = 3;
  if (shore?.px) shoreDist = Math.min(shoreDist, 1 - lx);
  if (shore?.nx) shoreDist = Math.min(shoreDist, lx);
  if (shore?.py) shoreDist = Math.min(shoreDist, 1 - ly);
  if (shore?.ny) shoreDist = Math.min(shoreDist, ly);

  // Ragged coast: smooth lumps along the shore, a pixel-scale jitter on top
  const lump = Math.sin(wx * 2.3 + wy * 1.7) * 0.5 + Math.sin(wx * 5.1 - wy * 3.7 + 1.3) * 0.3;
  const jitter = hash(Math.floor(wx * 9), Math.floor(wy * 9), 71) * 0.06;
  const coast = shoreDist - (0.14 + lump * 0.11 + jitter);

  // Depth tint
  const depth = Math.min(1, Math.max(0, coast / 0.7));
  let c = mix(mix(base, SHALLOW, 0.5), mix(base, DEEP, 0.6), depth);

  // Rolling crests: a sine band bent by a slower sine, so each crest curves
  const swell = Math.sin(wx * 1.9 + wy * 1.1 + Math.sin(wy * 1.3 - wx * 0.7) * 1.8);
  if (swell > 0.93) c = mix(c, 0xf0f9ff, 0.55 + (swell - 0.93) * 4);
  else if (swell > 0.8) c = mix(c, colors.strokeColor, 0.3);
  else if (swell > 0.62) c = shade(c, 0.88);                     // trough shadow in front of the crest
  else if (swell < -0.7) c = mix(c, DEEP, 0.18);

  // Sun glints
  if (hash(gx, gy, px, py + 900) > 0.992) c = mix(c, 0xffffff, 0.6);

  // Shore foam: a solid lip, then broken bubbles
  if (coast < 0) c = mix(FOAM, SHALLOW, 0.12);
  else if (coast < 0.08 && hash(gx, gy, px, py + 950) > 0.4) c = mix(c, FOAM, 0.75);
  else if (coast < 0.16 && hash(gx, gy, px, py + 970) > 0.82) c = mix(c, FOAM, 0.5);
  return c;
}

// ── Painter ──────────────────────────────────────────────────────────────────

export function paintTile(buf: PixelBuffer, ox: number, oy: number, spec: TileArtSpec): void {
  const { type, colors, gridX: gx, gridY: gy, platformPhase } = spec;
  const theme = THEMES[spec.difficulty ?? 'NORMAL'] ?? THEMES.NORMAL;
  const isLand = type !== 'OCEAN_BLOCK' && type !== 'SPAWN_BLOCK' && type !== 'NEXUS_BASE';
  const isWater = type === 'OCEAN_BLOCK';
  const yOff = isWater ? WATER_ART_DROP : 0;
  const sideDepth = LAND_DEPTH - yOff;

  const put = (px: number, py: number, color: number, alpha: number = 255) => {
    const i = ((oy + py) * buf.width + (ox + px)) * 4;
    buf.data[i] = (color >> 16) & 0xff;
    buf.data[i + 1] = (color >> 8) & 0xff;
    buf.data[i + 2] = color & 0xff;
    buf.data[i + 3] = alpha;
  };

  // 1. Side faces (left = south-west, right = south-east), including cliffs
  for (let px = 0; px < TILE_ART_W; px++) {
    const isLeft = px < HALF_W;
    const faceColor = isLeft ? colors.leftColor : colors.rightColor;
    const hasCliff = isLeft ? spec.cliffLeft : spec.cliffRight;
    const start = TOP_BOTTOM_ROW[px] + 1 + yOff;
    const sideEnd = start + sideDepth;
    // Chunky 2-px wide jag so the underside reads as pixel-art rock
    const jag = Math.floor(hash(gx, gy, Math.floor(px / 2), 7) * CLIFF_JAG);
    const end = hasCliff ? sideEnd + CLIFF_DEPTH - CLIFF_JAG + jag : sideEnd;
    const rock = shade(mix(faceColor, CLIFF_ROCK[platformPhase], 0.75), theme.cliffDarken);

    for (let py = start; py < end; py++) {
      const depthIn = py - start;
      const n = hash(gx, gy, px, py);
      let c: number;

      if (py < sideEnd) {
        // Upper side band — the tile's own material
        c = faceColor;
        if (isWater) {
          c = depthIn === 0 ? mix(colors.strokeColor, 0xffffff, 0.3) : shade(faceColor, 1 - depthIn * 0.035);
        } else if (type === 'AETHER_GRASS' && (depthIn < 2 || (depthIn === 2 && n < 0.45))) {
          c = shade(colors.topColor, 0.82); // grass overhang lip
        } else if (depthIn % 4 === 3 && n > 0.2) {
          c = shade(faceColor, 0.84); // strata line
        }
        if (n < 0.1) c = shade(c, 0.9);
        else if (n > 0.93) c = shade(c, 1.1);
        if (!hasCliff && py === sideEnd - 1) c = shade(c, 0.65);
      } else {
        // Cliff rock hanging below the island
        const t = (py - sideEnd) / (CLIFF_DEPTH + CLIFF_JAG);
        c = shade(rock, 1 - t * 0.45);
        if ((py - sideEnd) % 5 === 2 && n > 0.25) c = shade(c, 0.8);
        if (n < 0.12) c = shade(c, 0.88);
        // Glowing aether veins
        if (hash(gx, gy, Math.floor(px / 2), Math.floor(py / 3)) > 0.975) c = mix(c, colors.strokeColor, 0.75);
        if (py >= end - 1) c = shade(c, 0.6);
      }
      // Face edge outline where the two faces meet and at the outer tips
      if (px === HALF_W - 1 || px === HALF_W) c = shade(c, isLeft ? 0.92 : 1.08);
      if (px === 0 || px === TILE_ART_W - 1) c = shade(c, 0.8);

      put(px, py, c);
    }
  }

  // 2. Top face
  for (let py = 0; py < TOP_H; py++) {
    for (let px = 0; px < TILE_ART_W; px++) {
      if (!inTop(px, py)) continue;
      const n = hash(gx, gy, px, py + 100);
      let c = colors.topColor;

      // Pixel dither
      if (n < 0.12) c = shade(c, 0.9);
      else if (n > 0.92) c = shade(c, 1.08);

      const d = diamondDist(px, py);
      switch (type) {
        case 'AETHER_GRASS': {
          // Living terrain (curved patches, not whole tiles)
          if (spec.terrain) {
            const t = paintLivingTerrain(gx, gy, px, py, spec.terrain, c);
            if (t !== null) { c = t; break; }
          }
          // Meadow tone drifts in broad, soft swathes that ignore tile borders
          {
            const { u, v } = frameUV(gx, gy, px, py);
            const sway = Math.sin(u * 0.41 + v * 0.23) * 0.5 + Math.sin(u * 0.17 - v * 0.37 + 1.7) * 0.5;
            c = shade(c, 1 + sway * 0.07);
          }
          const blade = hash(gx, gy, px, py + 200);
          if (blade > 0.955) c = mix(c, colors.strokeColor, 0.7);
          else if (blade < 0.05) c = shade(c, 0.78);
          // Little "v" tufts
          if (py > 0 && hash(gx, gy, px, py + 300) > 0.985 && inTop(px, py - 1)) {
            put(px, py - 1 + yOff, shade(colors.strokeColor, 1.1));
          }
          // Random sandy clearings with soft, curving edges (seeded per realm)
          const patch = sandPatch(gx, gy, px, py, spec.seed ?? 0);
          if (patch > 0.8) { c = hash(gx, gy, px, py + 1300) > 0.85 ? WET_SAND : SAND; break; }
          if (patch > 0.76) c = mix(c, SAND, 0.5);
          const bloom = hash(gx, gy, px, py + 400);
          if (platformPhase === 1 && bloom > 0.994) c = n > 0.5 ? 0xf472b6 : 0xfde047;
          else if (bloom < theme.blossom) c = REALM_BLOSSOM[platformPhase][n > 0.5 ? 0 : 1];
          break;
        }
        case 'ANCIENT_STONE': {
          // Iso-aligned cobbles
          const u = px + 2 * py;
          const v = px - 2 * py + 64;
          const cell = hash(gx, gy, Math.floor(u / 10), Math.floor(v / 10) + 500);
          c = shade(c, 0.9 + cell * 0.2);
          if (u % 10 === 0 || v % 10 === 0) c = shade(colors.topColor, 0.7);
          break;
        }
        case 'OCEAN_BLOCK': {
          c = paintWater(c, colors, gx, gy, px, py, spec.shore);
          break;
        }
        case 'NEXUS_BASE': {
          if (d > 0.55 && d < 0.66) c = mix(colors.strokeColor, 0xffffff, 0.25);
          else if (d < 0.22) c = mix(c, colors.strokeColor, 0.45);
          else if ((px + py) % 4 === 0) c = shade(c, 0.9);
          break;
        }
        case 'SPAWN_BLOCK': {
          // Cracked basalt dais under the 2×2 rift, veined with its glow
          c = mix(0x15111f, colors.strokeColor, n * 0.18);
          if (hash(gx, gy, px, py + 300) > 0.94) c = mix(colors.strokeColor, 0xffffff, 0.2);
          else if ((px + py * 2 + gx * 3) % 9 === 0) c = shade(c, 0.75);
          break;
        }
        default: {
          // Resource-node bases: runic glints
          if (hash(gx, gy, px, py + 600) > 0.95) c = mix(c, colors.strokeColor, 0.8);
          if (d > 0.62 && d < 0.68 && (px + py) % 3 !== 0) c = mix(c, colors.strokeColor, 0.35);
        }
      }

      // Difficulty theme: tint, rubble and glowing cracks in the realm's colour
      if (isLand) {
        if (theme.tintAmount > 0) c = mix(c, theme.tint, theme.tintAmount);
        if (hash(gx, gy, Math.floor(px / 2), py + 700) < theme.rubble) c = shade(c, 0.7);
        if (theme.crack > 0 && hash(gx, gy, 0, 800) < theme.crack * 40) {
          // A short jagged fissure: dark rim, with an ember of the realm's glow deep inside
          const start = Math.floor(hash(gx, gy, 1, 801) * TILE_ART_W * 0.4) + TILE_ART_W * 0.3;
          const len = 3 + Math.floor(hash(gx, gy, 2, 802) * 3);
          const row = py - HALF_H;
          if (Math.abs(row) <= len) {
            const jitter = Math.floor(hash(gx, gy, py, 803) * 3) - 1;
            const off = Math.abs(px - (start + row * 2 + jitter));
            if (off < 0.5 && Math.abs(row) < len) c = mix(REALM_GLOW[platformPhase], 0x000000, 0.35);
            else if (off < 1.5) c = shade(c, 0.45);
          }
        }
      }

      // Bevel: lit upper edges, shaded lower edges (water stays one seamless surface)
      if (isWater) {
        put(px, py + yOff, c);
        continue;
      }
      const upperEdge = !inTop(px, py - 1) || (!inTop(px - 1, py) && py < HALF_H) || (!inTop(px + 1, py) && py < HALF_H);
      const lowerEdge = !inTop(px, py + 1) || (!inTop(px - 1, py) && py >= HALF_H) || (!inTop(px + 1, py) && py >= HALF_H);
      // Grass blends tile to tile (no bevel lines, so the meadow doesn't read as a grid of diamonds)
      if (type !== 'AETHER_GRASS') {
        if (upperEdge) c = px < HALF_W ? shade(c, 1.22) : shade(c, 1.1);
        else if (lowerEdge) c = shade(c, 0.8);
      }

      put(px, py + yOff, c);
    }
  }
}

// ── Coastline (global shore field) ───────────────────────────────────────────

/** Island coordinates (grid units, tile centres on integers) of a frame pixel; may lie outside the tile. */
function frameUV(gx: number, gy: number, px: number, oy: number): { u: number; v: number; lx: number; ly: number } {
  const sx = (px + 0.5 - HALF_W) / HALF_W;
  const sy = (oy + 0.5) / HALF_H;
  const lx = (sx + sy) / 2;
  const ly = (sy - sx) / 2;
  return { u: gx - 0.5 + lx, v: gy - 0.5 + ly, lx, ly };
}

/** Smooth, seeded sand-patch value (0..1) — clearings above ~0.56. */
function sandPatch(gx: number, gy: number, px: number, py: number, seed: number): number {
  const { u, v } = frameUV(gx, gy, px, py);
  const s = (seed % 1013) * 0.61;
  const blob = Math.sin(u * 0.53 + s) * Math.sin(v * 0.47 + s * 1.3) * 0.6 + Math.sin(u * 1.37 - v * 1.11 + s * 2.1) * 0.25 + Math.sin(u * 3.1 + v * 2.7) * 0.08;
  return (blob + 1) / 2;
}

/** Pixel classes in a coastal frame: what the shore layer copies over the animated water. */
export const COAST_NONE = 0, COAST_LAND = 1, COAST_BANK = 2, COAST_WATER = 3;

/**
 * Re-paints a tile the coastline passes through, following the global field
 * instead of the tile's diamond: land pixels (beach sand toward the water),
 * a short sandy bank where land drops to the water line, and water below.
 * `field(u, v) >= 0.5` is land. Returns the per-pixel class mask.
 */
export function paintCoast(
  buf: PixelBuffer, ox: number, oy: number, spec: TileArtSpec,
  field: (u: number, v: number) => number,
  palettes: { water: TilePalette; grass: TilePalette }
): Uint8Array {
  const { gridX: gx, gridY: gy } = spec;
  const mask = new Uint8Array(TILE_ART_W * TILE_ART_H);
  const isWaterTile = spec.type === 'OCEAN_BLOCK';
  const own = (spec.type === 'AETHER_GRASS');
  const put = (px: number, py: number, color: number) => {
    const i = ((oy + py) * buf.width + (ox + px)) * 4;
    buf.data[i] = (color >> 16) & 0xff;
    buf.data[i + 1] = (color >> 8) & 0xff;
    buf.data[i + 2] = color & 0xff;
    buf.data[i + 3] = 255;
  };
  const clear = (px: number, py: number) => { buf.data[((oy + py) * buf.width + (ox + px)) * 4 + 3] = 0; };
  const landAt = (px: number, row: number) => {
    if (!inTop(px, row)) return -1;
    const { u, v } = frameUV(gx, gy, px, row);
    return field(u, v);
  };
  for (let px = 0; px < TILE_ART_W; px++) {
    const bottom = TOP_BOTTOM_ROW[px];
    for (let row = 0; row <= bottom + WATER_ART_DROP; row++) {
      const f = landAt(px, row);
      if (f >= 0.5) {
        // Land: keep a land tile's own art inland, beach toward the water
        let c: number;
        const n = hash(gx, gy, px, row + 1400);
        if (!isWaterTile && !own && f >= 0.62) { mask[row * TILE_ART_W + px] = COAST_LAND; continue; }
        if (f < 0.535) c = n > 0.5 ? mix(FOAM, SHALLOW, 0.15) : WET_SAND;
        else if (f < 0.6) c = mix(WET_SAND, SAND, 0.5);
        else if (f < 0.7) c = n > 0.9 ? shade(SAND, 0.92) : SAND;
        else if (f < 0.76) c = mix(SAND, palettes.grass.topColor, 0.55);
        else if (isWaterTile) {
          c = palettes.grass.topColor;
          if (n < 0.12) c = shade(c, 0.9); else if (n > 0.92) c = shade(c, 1.08);
          if (hash(gx, gy, px, row + 1500) > 0.955) c = mix(c, palettes.grass.strokeColor, 0.7);
        } else { mask[row * TILE_ART_W + px] = COAST_LAND; continue; } // grass tile's own pixel
        put(px, row, c);
        mask[row * TILE_ART_W + px] = COAST_LAND;
        continue;
      }
      // Bank: land just above drops to the water line
      let bank = -1;
      for (let k = 1; k <= WATER_ART_DROP; k++) if (landAt(px, row - k) >= 0.5) { bank = k; break; }
      if (bank > 0) {
        put(px, row, shade(BANK[bank - 1], hash(gx, gy, px, row + 1600) > 0.8 ? 0.9 : 1));
        mask[row * TILE_ART_W + px] = COAST_BANK;
        continue;
      }
      // Water surface seen here comes from the top-face point WATER_ART_DROP rows up
      const src = row - WATER_ART_DROP;
      if (src >= 0 && inTop(px, src)) {
        const fs = landAt(px, src);
        let c = paintWater(palettes.water.topColor, palettes.water, gx, gy, px, src, undefined);
        if (fs > 0.4) c = mix(c, FOAM, 0.65); // surf along the curve
        else if (fs > 0.32 && hash(gx, gy, px, src + 1700) > 0.5) c = mix(c, FOAM, 0.4);
        put(px, row, c);
        mask[row * TILE_ART_W + px] = COAST_WATER;
      } else if (inTop(px, row) && !isWaterTile) {
        clear(px, row); // let the tile behind show, exactly like a water tile's top rows
      }
    }
    // A land tile's side face below a watery bottom edge would draw a straight bank: drop it
    if (!isWaterTile && landAt(px, bottom) < 0.5) {
      for (let row = bottom + WATER_ART_DROP + 1; row < TILE_ART_H; row++) clear(px, row);
    }
  }
  return mask;
}

// ── Living terrain: raised rock, soaked shore, churned sand ─────────────────

const ROCK_TOP = 0xc9a26b;
const ROCK_RIM = 0xe7cc98;
const CLIFF = [0x9a7248, 0x8a6440, 0x84603d, 0x7a5636, 0x725033, 0x6b4a2e, 0x644529, 0x5d3f27, 0x553a23, 0x4f3520, 0x49311d, 0x432c1a];
const CLIFF_ROWS = CLIFF.length;

/**
 * One pixel of the living terrain, or null where the grass stays. Raised rock
 * gets a lit rim and strata on top and a cliff face falling CLIFF_ROWS pixels
 * below its lower edge (painted into whatever tile lies there), so the plateau
 * reads as standing above the land.
 */
function paintLivingTerrain(gx: number, gy: number, px: number, py: number, T: NonNullable<TileArtSpec['terrain']>, base: number): number | null {
  const { u, v } = frameUV(gx, gy, px, py);
  // Paved road: small iso cobbles with a darker curb along its curved edge
  const road = T.road?.(u, v) ?? -1;
  if (road > 0 && T.roadColor !== undefined) {
    const cu = px + 2 * py, cv = px - 2 * py + 64;
    let c = shade(T.roadColor, 0.9 + hash(gx, gy, Math.floor(cu / 6), Math.floor(cv / 6) + 500) * 0.2);
    if (cu % 6 === 0 || cv % 6 === 0) c = shade(T.roadColor, 0.78);
    if (road < 0.22) c = shade(T.roadColor, 0.68);
    return c;
  }
  if (road > -0.25 && T.roadColor !== undefined) return shade(base, 0.86); // worn grass beside the road
  const raised = T.raised;
  if (raised) {
    const f = raised(u, v);
    if (f >= 0.5) {
      // Two terraces: the heaved core stands a step above its rim, with its own little ledge
      const core = f >= 0.82;
      let c = f < 0.58 || (f >= 0.82 && f < 0.86) ? ROCK_RIM : core ? shade(ROCK_TOP, 1.05) : ROCK_TOP;
      const strata = Math.sin(v * 9 + u * 2 + Math.sin(u * 3) * 0.8);
      if (f >= 0.6 && strata > 0.82) c = shade(c, 0.88);
      // Cracks the Caterpillar tore, glowing with the Deity's purple where they run deep
      const crack = Math.abs(Math.sin(u * 4.1 + Math.sin(v * 3.3) * 1.4) + Math.sin(v * 5.3 - u * 1.7) * 0.6);
      if (crack < 0.07) c = core ? 0xc084fc : 0x4a3220;
      else if (crack < 0.13 && core) c = mix(c, 0x7e22ce, 0.45);
      // Ledge shadow just below the core terrace
      if (!core && f > 0.7) {
        const up = frameUV(gx, gy, px, py - 2);
        if (raised(up.u, up.v) >= 0.82) c = shade(c, 0.72);
      }
      // Boulders and pebbles strewn on top
      const b = hash(Math.floor(u * 3), Math.floor(v * 3), 7, 2300);
      if (b > 0.9 && hash(gx, gy, px, py + 2400) > 0.4) c = shade(0xb08a58, 0.85 + hash(gx, gy, px, py + 2500) * 0.3);
      if (hash(gx, gy, px, py + 2100) > 0.965) c = shade(c, 0.8);
      else if (hash(gx, gy, px, py + 2200) > 0.985) c = mix(c, 0x6b8f3a, 0.6); // a tuft clinging on top
      return c;
    }
    for (let k = 1; k <= CLIFF_ROWS; k++) {
      const up = frameUV(gx, gy, px, py - k);
      if (raised(up.u, up.v) >= 0.5) {
        let c = CLIFF[k - 1];
        // Rock strata in bands, vertical cracks, a lit edge where the face turns
        if (k % 4 === 0) c = shade(c, 0.82);
        if ((px + Math.floor(py / 2)) % 5 === 0) c = shade(c, 0.86);
        const side = frameUV(gx, gy, px - 1, py - k);
        if (raised(side.u, side.v) < 0.5) c = shade(c, 1.18);
        if (k === CLIFF_ROWS && hash(gx, gy, px, py + 2600) > 0.6) c = 0x3a2614; // rubble at the foot
        return c;
      }
    }
    // Cast shadow on the ground just below the cliff
    for (let k = CLIFF_ROWS + 1; k <= CLIFF_ROWS + 4; k++) {
      const up = frameUV(gx, gy, px, py - k);
      if (raised(up.u, up.v) >= 0.5) return shade(base, 0.72 + (k - CLIFF_ROWS) * 0.05);
    }
  }
  const wet = T.wet?.(u, v) ?? 0;
  if (wet >= 0.5) {
    let c = mix(WET_SAND, SHALLOW, 0.18 + 0.12 * Math.sin(u * 3 + v * 2));
    if (hash(gx, gy, px, py + 1900) > 0.985) c = mix(c, FOAM, 0.7);
    return c;
  }
  const sand = T.sand?.(u, v) ?? 0;
  if (sand >= 0.5) {
    const ripple = Math.sin(u * 7.3 + v * 3.1 + Math.sin(v * 2.3) * 1.6);
    let c = sand < 0.56 ? mix(SAND, 0x5f8f3e, 0.35) : SAND; // grass fringe at the edge
    // Dune ripples with a lit crest and a shaded trough
    if (ripple > 0.82) c = shade(c, 1.12);
    else if (ripple > 0.6) c = shade(c, 1.05);
    else if (ripple < -0.75) c = shade(c, 0.84);
    // Burrow holes: a dark pit with a raised, lighter rim
    const hu = Math.floor(u * 1.5), hv = Math.floor(v * 1.5);
    if (hash(hu, hv, 3, 2700) > 0.72 && sand > 0.62) {
      const cx = (hu + 0.3 + hash(hu, hv, 4, 2800) * 0.4) / 1.5, cy = (hv + 0.3 + hash(hu, hv, 5, 2900) * 0.4) / 1.5;
      const d = Math.hypot((u - cx) * 1.0, (v - cy) * 1.0);
      if (d < 0.07) c = 0x3b2a16;
      else if (d < 0.11) c = shade(SAND, 0.7);
      else if (d < 0.16) c = shade(SAND, 1.14);
    }
    // Segmented crawl tracks winding across the sand
    const track = Math.abs(Math.sin(u * 1.9 + Math.sin(v * 1.3) * 1.8) * 1.2 - v * 0.0 - Math.cos(v * 2.1) * 0.5);
    if (track < 0.05 && (Math.floor((u + v) * 9) % 2 === 0)) c = shade(c, 0.8);
    if (hash(gx, gy, px, py + 1800) > 0.97) c = shade(c, 0.75);
    return c;
  }
  return null;
}
