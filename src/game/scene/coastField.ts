import { GRID_SIZE, isWaterTile } from '../../state/buildingLayout';

/**
 * The visible coastline as a smooth field over the island, independent of the
 * tile grid: land amount is bilinearly blended between tile centres (so
 * staircase coves become diagonal curves) and wobbled by layered noise.
 * >= 0.5 is land. Gameplay still uses tiles; only the drawing follows the curve.
 * Coordinates are grid units with tile centres on integers.
 */
export type CoastField = (u: number, v: number) => number;

export const COAST_LAND = 0.5;

export function makeCoastField(seed: number): CoastField {
  const s = (seed % 997) * 0.37;
  const land = (x: number, y: number) => (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE || isWaterTile(x, y) ? 0 : 1);
  return (u, v) => {
    const i = Math.floor(u), j = Math.floor(v);
    const fx = u - i, fy = v - j;
    const a = land(i, j), b = land(i + 1, j), c = land(i, j + 1), d = land(i + 1, j + 1);
    const bil = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
    if (bil === 0 || bil === 1) return bil; // open sea / inland: no wobble needed
    const n = Math.sin(u * 2.3 + v * 1.4 + s) * 0.5 + Math.sin(u * 5.7 - v * 4.3 + s * 1.7) * 0.32 + Math.sin(u * 12.1 + v * 9.7 + s * 0.6) * 0.18;
    return bil + n * 0.26;
  };
}

/** Tiles whose 3×3 neighbourhood mixes land and water: the curve passes through them. */
export function isCoastalTile(x: number, y: number): boolean {
  const water = isWaterTile(x, y);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= GRID_SIZE || ny >= GRID_SIZE) continue;
    if (isWaterTile(nx, ny) !== water) return true;
  }
  return false;
}

/** Chebyshev distance (capped) from a tile to the nearest tile of the other kind. */
export function coastDistance(x: number, y: number, cap = 3): number {
  const water = isWaterTile(x, y);
  for (let r = 1; r <= cap; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GRID_SIZE || ny >= GRID_SIZE) continue;
      if (isWaterTile(nx, ny) !== water) return r;
    }
  }
  return cap + 1;
}

/**
 * Curved field over any set of tiles (dug sand, raised rock, soaked shore).
 * The 0/1 tile grid is gaussian-blurred once, then sampled bilinearly with a
 * little wobble, so a patch reads as a rounded blob (corners melt away)
 * instead of a block of diamonds. >= 0.5 is inside.
 */
export function makeSetField(has: (x: number, y: number) => boolean, seed: number, wobble = 0.2): CoastField {
  const N = GRID_SIZE;
  const raw = new Float32Array(N * N);
  let any = false;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (has(x, y)) { raw[y * N + x] = 1; any = true; }
  if (!any) return () => 0;
  // Separable gaussian (sigma ~0.85 tile), scaled so a lone tile still shows as a small round patch
  const K = [-2, -1, 0, 1, 2].map((d) => Math.exp(-(d * d) / (2 * 0.85 * 0.85)));
  const ksum = K.reduce((a, b) => a + b, 0);
  const tmp = new Float32Array(N * N);
  const blur = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (let i = -2; i <= 2; i++) { const xx = x + i; if (xx >= 0 && xx < N) v += raw[y * N + xx] * K[i + 2]; }
    tmp[y * N + x] = v / ksum;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (let i = -2; i <= 2; i++) { const yy = y + i; if (yy >= 0 && yy < N) v += tmp[yy * N + x] * K[i + 2]; }
    blur[y * N + x] = Math.min(1, (v / ksum) * 1.9);
  }
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? 0 : blur[y * N + x]);
  const s = (seed % 991) * 0.53;
  return (u, v) => {
    const i = Math.floor(u), j = Math.floor(v);
    const fx = u - i, fy = v - j;
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    if (a + b + c + d === 0) return 0;
    const bil = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
    if (bil > 0.97) return bil;
    const n = Math.sin(u * 2.9 + v * 1.7 + s) * 0.5 + Math.sin(u * 6.3 - v * 5.1 + s * 1.9) * 0.32 + Math.sin(u * 13.1 + v * 10.3 + s) * 0.18;
    return bil + n * wobble;
  };
}
