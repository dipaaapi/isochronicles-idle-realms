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
}

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
          const blade = hash(gx, gy, px, py + 200);
          if (blade > 0.955) c = mix(c, colors.strokeColor, 0.7);
          else if (blade < 0.05) c = shade(c, 0.78);
          // Little "v" tufts
          if (py > 0 && hash(gx, gy, px, py + 300) > 0.985 && inTop(px, py - 1)) {
            put(px, py - 1 + yOff, shade(colors.strokeColor, 1.1));
          }
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
          const ripple = (py * 7 + Math.floor((px + gx * 5 + gy * 3) / 5)) % 11;
          if (ripple === 0) c = mix(c, colors.strokeColor, 0.55);
          else if (ripple === 1) c = mix(c, 0xffffff, 0.12);
          break;
        }
        case 'NEXUS_BASE': {
          if (d > 0.55 && d < 0.66) c = mix(colors.strokeColor, 0xffffff, 0.25);
          else if (d < 0.22) c = mix(c, colors.strokeColor, 0.45);
          else if ((px + py) % 4 === 0) c = shade(c, 0.9);
          break;
        }
        case 'SPAWN_BLOCK': {
          if (d < 0.42) c = mix(0x05030f, colors.strokeColor, n * 0.25);
          else if (d < 0.54) c = colors.strokeColor;
          else if (d < 0.6) c = shade(colors.strokeColor, 0.55);
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

      // Bevel: lit upper edges, shaded lower edges
      const upperEdge = !inTop(px, py - 1) || (!inTop(px - 1, py) && py < HALF_H) || (!inTop(px + 1, py) && py < HALF_H);
      const lowerEdge = !inTop(px, py + 1) || (!inTop(px - 1, py) && py >= HALF_H) || (!inTop(px + 1, py) && py >= HALF_H);
      if (upperEdge) c = px < HALF_W ? shade(c, 1.22) : shade(c, 1.1);
      else if (lowerEdge) c = shade(c, 0.8);

      put(px, py + yOff, c);
    }
  }
}
