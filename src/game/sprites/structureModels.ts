import type { ResourceBuildingId } from '../../types/state';
import type { Part, Pose, Shape, VoxelGeometry } from './VoxelSprite';
import { recolorModel } from './VoxelSprite';

/**
 * Voxel models for the citadel, the five establishments, the Crystal Spire
 * and the invader portals. They are baked from one fixed camera
 * (STRUCTURE_DIRECTION) where model +y runs along grid +x (screen right-down)
 * and model +x along grid +y (screen left-down), so the faces the player sees
 * are the high-x and high-y sides. One tile is ~25.5 voxels, and sprites are
 * drawn at STRUCTURE_PIXEL world units per pixel to match the tile pixel art.
 */

export interface StructureModel extends VoxelGeometry {
  animations: Record<string, Pose[]>;
  /** Frames per second per animation. */
  rates: Record<string, number>;
  /** Animations that loop (the rest play once and hold). */
  loops: string[];
}

/** Voxels along one tile edge (a tile is 36 art px wide = 25.46 · √2). */
export const VOXELS_PER_TILE = 36 / Math.SQRT2;

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: number): Shape => ({
  kind: 'box', min: [x0, y0, z0], max: [x1, y1, z1], mat,
});
const ell = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, mat: number): Shape => ({
  kind: 'ellipsoid', center: [cx, cy, cz], radii: [rx, ry, rz], mat,
});
const ball = (cx: number, cy: number, cz: number, r: number, mat: number): Shape => ell(cx, cy, cz, r, r, r, mat);
const cyl = (cx: number, cy: number, z: number, radius: number, height: number, mat: number): Shape => ({
  kind: 'cylinder', center: [cx, cy, z], radius, height, mat,
});

/** Stepped cone (tower roofs, spires) from stacked cylinders, alternating two materials. */
const cone = (cx: number, cy: number, z0: number, r0: number, height: number, mat: number, alt: number = mat, steps: number = 8): Shape[] =>
  Array.from({ length: steps }, (_, i) =>
    cyl(cx, cy, z0 + (height / steps) * i, Math.max(0.8, r0 * (1 - i / steps)), height / steps + 0.01, i % 2 ? alt : mat));

/** Merlons (battlement teeth) along a straight wall top. */
const merlons = (axis: 'x' | 'y', from: number, to: number, fixed0: number, fixed1: number, z0: number, z1: number, mat: number, pitch = 5, width = 2.6): Shape[] => {
  const out: Shape[] = [];
  for (let t = from; t + width <= to; t += pitch) {
    out.push(axis === 'x' ? box(t, fixed0, z0, t + width, fixed1, z1, mat) : box(fixed0, t, z0, fixed1, t + width, z1, mat));
  }
  return out;
};

/** Points on a circle in the xy plane. */
const around = (count: number, radius: number, phase = 0) =>
  Array.from({ length: count }, (_, i) => {
    const a = phase + (i / count) * Math.PI * 2;
    return { c: Math.cos(a) * radius, s: Math.sin(a) * radius, a };
  });

/** Pose helper: repeats a base pose under every frame. */
const withBase = (base: Pose, frames: Pose[]): Pose[] =>
  frames.map((f) => {
    const merged: Pose = { ...base };
    for (const [k, v] of Object.entries(f)) merged[k] = { ...(base[k] ?? {}), ...v };
    return merged;
  });

const hide = (...names: string[]): Pose => Object.fromEntries(names.map((n) => [n, { hidden: true }]));

// ── Demon Citadel — 3×3, obsidian keep, four purple-roofed towers, Provoke Beacon ─

const castle = (): StructureModel => {
  const M = {
    stone: 0, stoneLight: 1, stoneDark: 2, roof: 3, roofDark: 4, trim: 5, dark: 6, window: 7,
    beacon: 8, beaconCore: 9, banner: 10, bannerDark: 11, rune: 12, iron: 13, wood: 14, rubble: 15,
  };
  const towers = [[9, 9], [9, 67], [67, 9], [67, 67]];
  const parts: Part[] = [
    {
      name: 'base', pivot: [38, 38, 0], shapes: [
        box(0, 0, 0, 76, 76, 4, M.stoneDark),
        box(1, 1, 4, 75, 75, 5, M.stone),
        box(73, 30, 0, 76, 46, 4.5, M.stoneLight),            // gate steps
        box(74.5, 31, 0, 76, 45, 3, M.stone),
      ],
    },
    {
      name: 'walls', pivot: [38, 38, 5], shapes: [
        box(5, 5, 5, 71, 10, 26, M.stone),
        box(5, 5, 5, 10, 71, 26, M.stone),
        box(5, 66, 5, 71, 71, 26, M.stone),
        box(66, 5, 5, 71, 71, 26, M.stone),
        box(65.6, 5, 21, 71.4, 71.4, 25, M.stoneLight),       // front parapet bands
        box(5, 65.6, 21, 71.4, 71.4, 25, M.stoneLight),
        box(70.4, 5, 5, 71.4, 71, 8, M.stoneDark),            // footing course
        box(5, 70.4, 5, 71, 71.4, 8, M.stoneDark),
        ...merlons('y', 8, 66, 66, 71, 26, 30, M.stone),
        ...merlons('x', 8, 66, 66, 71, 26, 30, M.stone),
        ...merlons('y', 8, 66, 5, 10, 26, 30, M.stoneDark),
        ...merlons('x', 8, 66, 5, 10, 26, 30, M.stoneDark),
        ...[18, 27, 49, 57].map((y) => box(70.6, y, 12, 71.6, y + 1.6, 18, M.window)),
        ...[18, 27, 49, 57].map((x) => box(x, 70.6, 12, x + 1.6, 71.6, 18, M.window)),
      ],
    },
    {
      name: 'gatehouse', pivot: [68, 38, 5], shapes: [
        box(63, 27, 5, 73, 49, 31, M.stone),
        box(62.6, 26.6, 27, 73.4, 49.4, 31, M.stoneLight),
        ...merlons('y', 27, 49, 68, 73, 31, 35, M.stone, 4.4, 2.2),
        box(72.2, 31.5, 5, 73.6, 44.5, 19, M.dark),           // gate opening
        ell(72.9, 38, 19, 0.9, 6.5, 3.6, M.dark),
        box(72.4, 30, 5, 74, 31.5, 22, M.trim),               // gold frame
        box(72.4, 44.5, 5, 74, 46, 22, M.trim),
        box(72.4, 30, 21, 74, 46, 23, M.trim),
        ...[33.5, 36.5, 39.5, 42.5].map((y) => box(73.3, y, 6, 73.9, y + 0.9, 18.5, M.iron)), // portcullis
        box(73.3, 31.5, 11.5, 73.9, 44.5, 12.3, M.iron),
        box(73.3, 31.5, 15.5, 73.9, 44.5, 16.3, M.iron),
        box(73.6, 25.5, 6, 75, 27, 12, M.iron),               // braziers
        ball(74.3, 26.2, 13, 1.6, M.window),
        box(73.6, 49, 6, 75, 50.5, 12, M.iron),
        ball(74.3, 49.8, 13, 1.6, M.window),
        box(72.6, 36.5, 24, 73.8, 39.5, 29, M.rune),          // sigil over the gate
      ],
    },
    {
      name: 'keep', pivot: [38, 38, 5], shapes: [
        box(20, 20, 5, 56, 56, 44, M.stone),
        box(19.4, 19.4, 5, 56.6, 56.6, 10, M.stoneDark),
        box(19.4, 19.4, 40, 56.6, 56.6, 44, M.stoneLight),
        ...merlons('y', 21, 56, 51.5, 56, 44, 48, M.stone),
        ...merlons('x', 21, 56, 51.5, 56, 44, 48, M.stone),
        ...merlons('y', 21, 56, 20, 24.5, 44, 48, M.stoneDark),
        ...merlons('x', 21, 56, 20, 24.5, 44, 48, M.stoneDark),
        ...[25, 32, 41, 48].map((y) => box(55.7, y, 25, 56.7, y + 2.6, 31, M.window)),
        ...[25, 32, 41, 48].map((x) => box(x, 55.7, 25, x + 2.6, 56.7, 31, M.window)),
        ...[25, 32, 41, 48].map((y) => ell(56.4, y + 1.3, 31, 0.6, 1.3, 1.3, M.window)),
        ...[25, 32, 41, 48].map((x) => ell(x + 1.3, 56.4, 31, 1.3, 0.6, 1.3, M.window)),
        // Horned demon sigil on the right face
        box(36.6, 55.9, 32.5, 39.4, 56.9, 40, M.rune),
        box(33, 55.9, 35, 43, 56.9, 36.5, M.rune),
        box(32, 55.9, 37, 33.6, 56.9, 41.5, M.rune),
        box(42.4, 55.9, 37, 44, 56.9, 41.5, M.rune),
        // Buttresses
        box(56, 27, 5, 58.5, 30, 36, M.stoneDark),
        box(56, 46, 5, 58.5, 49, 36, M.stoneDark),
        box(27, 56, 5, 30, 58.5, 36, M.stoneDark),
        box(46, 56, 5, 49, 58.5, 36, M.stoneDark),
      ],
    },
    {
      name: 'towers', pivot: [38, 38, 5], shapes: towers.flatMap(([cx, cy]) => [
        cyl(cx, cy, 5, 8.5, 26, M.stone),
        cyl(cx, cy, 5, 9.2, 4, M.stoneDark),
        cyl(cx, cy, 30, 9.3, 3.5, M.stoneLight),
        box(cx + 5.4, cy + 5.4, 20, cx + 6.9, cy + 6.9, 25, M.window),
        box(cx + 7.6, cy - 0.8, 14, cx + 8.6, cy + 0.8, 19, M.window),
        box(cx - 0.8, cy + 7.6, 14, cx + 0.8, cy + 8.6, 19, M.window),
      ]),
    },
    {
      name: 'roofs', pivot: [38, 38, 33], shapes: towers.flatMap(([cx, cy]) => [
        ...cone(cx, cy, 33.5, 9.4, 16, M.roof, M.roofDark),
        box(cx - 0.5, cy - 0.5, 49, cx + 0.5, cy + 0.5, 53, M.trim),
      ]),
    },
    {
      name: 'spire', pivot: [38, 38, 44], shapes: [
        cyl(38, 38, 44, 9, 3, M.stoneLight),
        cyl(38, 38, 47, 6.5, 11, M.stoneDark),
        ...[0, 1, 2, 3].map((i) => {
          const a = i * Math.PI / 2 + Math.PI / 4;
          return box(38 + Math.cos(a) * 6 - 0.7, 38 + Math.sin(a) * 6 - 0.7, 49, 38 + Math.cos(a) * 6 + 0.7, 38 + Math.sin(a) * 6 + 0.7, 57, M.rune);
        }),
        cyl(38, 38, 58, 8, 2, M.trim),
        ...[[43.5, 38], [32.5, 38], [38, 43.5], [38, 32.5]].map(([x, y]) => box(x - 0.6, y - 0.6, 60, x + 0.6, y + 0.6, 67, M.trim)),
      ],
    },
    {
      name: 'beacon', pivot: [38, 38, 66], shapes: [
        ell(38, 38, 66, 4.6, 4.6, 5.8, M.beacon),
        ball(38, 38, 66.5, 2.3, M.beaconCore),
      ],
    },
    {
      name: 'halo', parent: 'beacon', pivot: [38, 38, 66], shapes:
        around(14, 9.5).map(({ c, s }) => ball(38 + c, 38 + s, 66, 1.25, M.beaconCore)),
    },
    ...[[67, 67], [9, 67], [67, 9]].map(([cx, cy], i): Part => ({
      name: `banner${i}`, pivot: [cx, cy, 55], shapes: [
        box(cx - 0.5, cy - 0.5, 49, cx + 0.5, cy + 0.5, 63, M.dark),
        box(cx + 0.5, cy - 0.4, 55.5, cx + 8, cy + 0.4, 62, M.banner),
        box(cx + 0.5, cy - 0.5, 58, cx + 8, cy + 0.5, 59.3, M.bannerDark),
        box(cx + 7, cy - 0.4, 54, cx + 8, cy + 0.4, 55.5, M.banner),
        ball(cx + 4, cy + 0.6, 60.5, 0.9, M.trim),
      ],
    })),
    {
      name: 'rubble', pivot: [38, 38, 5], shapes: [
        ell(58, 60, 5, 7, 6, 4, M.rubble), ell(24, 64, 5, 6, 5, 3.5, M.rubble), ell(64, 22, 5, 5, 7, 4, M.rubble),
        box(44, 60, 5, 50, 64, 9, M.stoneLight), box(62, 44, 5, 66, 49, 8, M.stone), box(30, 30, 24, 36, 36, 27, M.stoneDark),
        ell(38, 38, 25, 8, 8, 3, M.rubble), box(52, 66, 26, 56, 70, 28, M.stoneDark),
      ],
    },
    {
      name: 'scaffold', pivot: [38, 38, 5], shapes: [
        ...[[6, 6], [6, 70], [70, 6], [70, 70], [38, 70], [70, 38]].flatMap(([x, y]) => [
          box(x - 0.8, y - 0.8, 5, x + 0.8, y + 0.8, 30, M.wood),
        ]),
        box(5, 69.4, 14, 71, 70.8, 15.4, M.wood), box(69.4, 5, 14, 70.8, 71, 15.4, M.wood),
        box(5, 69.4, 26, 71, 70.8, 27.4, M.wood), box(69.4, 5, 26, 70.8, 71, 27.4, M.wood),
        box(20, 20, 5, 56, 56, 12, M.stone), box(24, 44, 12, 34, 54, 18, M.stoneLight),
        box(46, 24, 12, 54, 32, 16, M.stoneLight), ell(60, 58, 5, 4, 3, 3, M.rubble),
      ],
    },
  ];
  const base: Pose = { rubble: { hidden: true }, scaffold: { hidden: true }, halo: { hidden: true } };
  const flags = (a: number): Pose => ({ banner0: { yaw: a }, banner1: { yaw: -a * 0.8 }, banner2: { yaw: a * 0.6 } });
  const idle = withBase(base, [
    { ...flags(0.28), beacon: { offset: [0, 0, 0] } },
    { ...flags(0.1), beacon: { offset: [0, 0, 0.8] } },
    { ...flags(-0.18), beacon: { offset: [0, 0, 1.4] } },
    { ...flags(0.02), beacon: { offset: [0, 0, 0.7] } },
  ]);
  const pulse = withBase(base, [
    { ...flags(0.2), beacon: { scale: [1.2, 1.2, 1.2], offset: [0, 0, 1] }, halo: { hidden: false, scale: [0.7, 0.7, 1] } },
    { ...flags(0.1), beacon: { scale: [1.4, 1.4, 1.35], offset: [0, 0, 1.5] }, halo: { hidden: false, scale: [1, 1, 1] } },
    { ...flags(0), beacon: { scale: [1.2, 1.2, 1.2], offset: [0, 0, 1] }, halo: { hidden: false, scale: [1.25, 1.25, 1] } },
  ]);
  const ruined = [{
    ...hide('roofs', 'spire', 'beacon', 'halo', 'banner0', 'banner1', 'banner2', 'scaffold'),
    keep: { scale: [1, 1, 0.55] }, towers: { scale: [1, 1, 0.7] }, walls: { scale: [1, 1, 0.8] }, gatehouse: { scale: [1, 1, 0.75] },
  } as Pose];
  const site = [{
    ...hide('walls', 'gatehouse', 'keep', 'towers', 'roofs', 'spire', 'beacon', 'halo', 'banner0', 'banner1', 'banner2', 'rubble'),
  } as Pose];
  return {
    size: [76, 76, 76],
    foot: [38, 38, 0],
    materials: [
      { color: 0x4b4468 }, { color: 0x6d6593 }, { color: 0x2e2a45 }, { color: 0x7c3aed }, { color: 0x5b21b6 },
      { color: 0xfbbf24 }, { color: 0x120c1f }, { color: 0xf97316, emissive: true }, { color: 0xef4444, emissive: true },
      { color: 0xfde68a, emissive: true }, { color: 0xb91c1c }, { color: 0x7f1d1d }, { color: 0xc084fc, emissive: true },
      { color: 0x52525b }, { color: 0x8b5a2b }, { color: 0x3f3a57 },
    ],
    parts,
    animations: { idle, pulse, ruined, site },
    rates: { idle: 4, pulse: 8, ruined: 1, site: 1 },
    loops: ['idle', 'pulse'],
  };
};

// ── Shared ground pad for 2×2 establishments ────────────────────────────────

const pad = (mat: number, edge: number): Shape[] => [
  box(1, 1, 0, 50, 50, 2.5, mat),
  box(0.5, 49, 0, 50.5, 50.5, 3, edge),
  box(49, 0.5, 0, 50.5, 50.5, 3, edge),
];

const siteScaffold = (wood: number, stone: number): Part => ({
  name: 'scaffold', pivot: [25, 25, 2], shapes: [
    ...[[5, 5], [5, 45], [45, 5], [45, 45]].map(([x, y]) => box(x - 0.8, y - 0.8, 2, x + 0.8, y + 0.8, 22, wood)),
    box(4, 44.2, 12, 46, 45.8, 13.4, wood), box(44.2, 4, 12, 45.8, 46, 13.4, wood),
    box(4, 44.2, 20, 46, 45.8, 21.4, wood), box(44.2, 4, 20, 45.8, 46, 21.4, wood),
    box(14, 14, 2, 26, 24, 7, stone), box(28, 18, 2, 36, 26, 5, stone), box(18, 30, 2, 24, 36, 9, wood),
  ],
});

/** Poses shared by every establishment: normal / wrecked / construction site. */
const establishmentPoses = (body: string[], extraHidden: string[] = []) => {
  const base: Pose = { ...hide('scaffold', 'rubble', ...extraHidden) };
  const ruined: Pose = {
    ...hide('scaffold', ...extraHidden),
    ...Object.fromEntries(body.map((n) => [n, { scale: [1, 1, 0.6] as [number, number, number], roll: 0.05 }])),
  };
  const site: Pose = { ...hide('rubble', ...body, ...extraHidden) };
  return { base, ruined, site };
};

const rubblePart = (a: number, b: number): Part => ({
  name: 'rubble', pivot: [25, 25, 2], shapes: [
    ell(34, 36, 2.5, 6, 5, 3.5, a), ell(14, 38, 2.5, 5, 4, 3, b), ell(38, 14, 2.5, 4.5, 5.5, 3, a),
    box(26, 40, 2.5, 31, 45, 6, b), box(41, 26, 2.5, 46, 30, 5, a),
  ],
});

// ── Stone Quarry — cut-stone yard, runic pillar, boulder catapult ────────────

const quarry = (): StructureModel => {
  const M = { dirt: 0, stone: 1, stoneLight: 2, stoneDark: 3, wood: 4, woodDark: 5, iron: 6, boulder: 7, rune: 8, rope: 9, edge: 10 };
  const parts: Part[] = [
    { name: 'ground', pivot: [25, 25, 0], shapes: pad(M.dirt, M.edge) },
    {
      name: 'cliff', pivot: [10, 10, 2], shapes: [
        box(2, 2, 2, 16, 14, 15, M.stone),
        box(2, 14, 2, 9, 22, 9, M.stoneLight),
        box(16, 2, 2, 22, 8, 8, M.stoneLight),
        box(2, 2, 15, 10, 9, 19, M.stoneDark),
        box(15.8, 4, 6, 16.6, 12, 7, M.stoneDark),               // chisel lines
        box(4, 13.8, 10, 14, 14.6, 11, M.stoneDark),
        // Runic pillar
        box(3.5, 3.5, 19, 8.5, 8.5, 34, M.stoneDark),
        box(3, 3, 34, 9, 9, 36, M.stone),
        box(8.2, 5, 21, 9, 6.4, 32, M.rune),
        box(5, 8.2, 21, 6.4, 9, 32, M.rune),
        ball(6, 6, 38.5, 2, M.rune),
      ],
    },
    {
      name: 'blocks', pivot: [25, 25, 2], shapes: [
        box(42, 4, 2, 48, 10, 7, M.stoneLight), box(43, 5, 7, 47, 9, 10, M.stone),
        box(4, 40, 2, 10, 47, 6, M.stone), box(11, 43, 2, 15, 47, 4.5, M.stoneLight),
        ball(46, 46, 4.5, 3, M.boulder), ball(42, 48, 4, 2.4, M.boulder), ball(48, 41, 4, 2.4, M.boulder),
      ],
    },
    {
      name: 'frame', pivot: [31, 30, 2], shapes: [
        box(20, 16, 2.5, 42, 19.5, 6, M.woodDark), box(20, 40.5, 2.5, 42, 44, 6, M.woodDark),
        box(20, 16, 2.5, 23.5, 44, 6, M.woodDark), box(38.5, 16, 2.5, 42, 44, 6, M.woodDark),
        ...[[22.5, 15], [39.5, 15], [22.5, 45], [39.5, 45]].flatMap(([x, y]) => [
          ell(x, y, 5.5, 4.6, 1.2, 4.6, M.woodDark), ball(x, y + (y < 30 ? -0.8 : 0.8), 5.5, 1.2, M.iron),
        ]),
        box(29.5, 19.5, 6, 33, 22.5, 29, M.wood), box(29.5, 37.5, 6, 33, 40.5, 29, M.wood),
        box(24, 20, 6, 26.5, 22, 21, M.wood), box(24, 38, 6, 26.5, 40, 21, M.wood),       // braces
        box(35.5, 20, 6, 38, 22, 21, M.wood), box(35.5, 38, 6, 38, 40, 21, M.wood),
        box(30, 19, 25.5, 32.5, 41, 28, M.iron),                // axle
        box(34, 24, 6, 39, 36, 11, M.woodDark),                 // winch
        box(35, 23, 10, 37.5, 37, 12.5, M.rope),
      ],
    },
    {
      name: 'arm', pivot: [31.25, 30, 26.75], shapes: [
        box(30, 8, 25.5, 32.5, 47, 28, M.wood),
        box(28, 6, 27.5, 34.5, 13, 32, M.woodDark),              // bucket
        box(27, 42, 18, 35.5, 48.5, 25.5, M.iron),               // counterweight
        box(28.5, 41, 25, 34, 43, 28, M.woodDark),
      ],
    },
    { name: 'stone', parent: 'arm', pivot: [31.25, 9.5, 33], shapes: [ball(31.25, 9.5, 34, 3.5, M.boulder)] },
    rubblePart(M.stone, M.woodDark),
    siteScaffold(M.wood, M.stoneLight),
  ];
  const body = ['cliff', 'blocks', 'frame', 'arm', 'stone'];
  const { base, ruined, site } = establishmentPoses(body);
  const cocked = 0.55;
  const idle = withBase(base, [
    { arm: { pitch: cocked } }, { arm: { pitch: cocked - 0.04 } }, { arm: { pitch: cocked } }, { arm: { pitch: cocked + 0.03 } },
  ]);
  const attack = withBase(base, [
    { arm: { pitch: cocked + 0.1 } },
    { arm: { pitch: -0.4 } },
    { arm: { pitch: -1.3 } },
    { arm: { pitch: -1.85 }, stone: { hidden: true } },
    { arm: { pitch: -1.5 }, stone: { hidden: true } },
    { arm: { pitch: -0.5 }, stone: { hidden: true } },
    { arm: { pitch: 0.35 }, stone: { hidden: true } },
  ]);
  return {
    size: [51, 51, 52], foot: [25.5, 25.5, 0],
    materials: [
      { color: 0x8a7a5c }, { color: 0x8b93a1 }, { color: 0xaab2bf }, { color: 0x4b5563 }, { color: 0x92633a },
      { color: 0x5c3d22 }, { color: 0x4b5563 }, { color: 0x78716c }, { color: 0xf59e0b, emissive: true },
      { color: 0xd6c7a1 }, { color: 0x5d5340 },
    ],
    parts,
    animations: { idle, attack, ruined: [ruined], site: [site] },
    rates: { idle: 2, attack: 12, ruined: 1, site: 1 },
    loops: ['idle'],
  };
};

// ── Metal Mine — rocky adit with minecart, forge chimney, spike launcher ─────

const mine = (): StructureModel => {
  const M = { dirt: 0, rock: 1, rockLight: 2, rockDark: 3, wood: 4, woodDark: 5, iron: 6, ironLight: 7, dark: 8, ore: 9, coal: 10, spike: 11, glow: 12, edge: 13 };
  const parts: Part[] = [
    { name: 'ground', pivot: [25, 25, 0], shapes: pad(M.dirt, M.edge) },
    {
      name: 'mound', pivot: [16, 16, 2], shapes: [
        ell(16, 16, 4, 17, 16, 20, M.rock),
        ell(9, 28, 2, 9, 9, 11, M.rockDark),
        ell(28, 7, 2, 10, 8, 12, M.rockLight),
        ell(20, 14, 16, 10, 10, 10, M.rockLight),
        ball(24, 26, 12, 1.4, M.ore), ball(12, 29, 9, 1.2, M.ore), ball(29, 12, 14, 1.3, M.ore), ball(22, 24, 20, 1.1, M.ore),
        // Timber-framed adit facing the viewer's left
        box(29, 11.5, 2, 33.5, 21.5, 15, M.dark),
        box(30, 10, 2, 33.8, 12, 17, M.wood), box(30, 21, 2, 33.8, 23, 17, M.wood),
        box(30, 10, 15, 34.2, 23, 18, M.woodDark),
        box(33, 13, 12, 34, 20, 13, M.glow),                      // lantern glow inside
      ],
    },
    {
      name: 'chimney', pivot: [8, 42, 2], shapes: [
        box(4, 38, 2, 12, 46, 10, M.rockDark),
        box(5, 39, 10, 11, 45, 32, M.rockLight),
        box(4.5, 38.5, 32, 11.5, 45.5, 34, M.rockDark),
        box(6, 40, 33.5, 10, 44, 34.5, M.glow),
        box(11.4, 40, 4, 12.2, 44, 8, M.glow),                     // forge mouth
      ],
    },
    {
      name: 'rails', pivot: [40, 16, 2], shapes: [
        ...[35, 38.5, 42, 45.5].map((x) => box(x, 12, 2.5, x + 1.6, 22, 3.3, M.woodDark)),
        box(33.5, 13.3, 3.3, 50, 14.3, 4.1, M.iron), box(33.5, 19.7, 3.3, 50, 20.7, 4.1, M.iron),
        box(39, 12.5, 4.5, 47, 21.5, 10, M.ironLight),              // minecart
        box(39.5, 13, 9.5, 46.5, 21, 10.5, M.iron),
        ell(43, 17, 10.5, 3.3, 3.8, 1.8, M.coal),
        ball(41.5, 15.5, 11.3, 1, M.ore),
      ],
    },
    {
      name: 'base', pivot: [34, 37, 2], shapes: [
        cyl(34, 37, 2, 8.5, 9, M.rockDark),
        cyl(34, 37, 11, 9, 1.6, M.iron),
        ...around(8, 8.6).map(({ c, s }) => ball(34 + c, 37 + s, 12, 0.8, M.ironLight)),
      ],
    },
    {
      name: 'launcher', parent: 'base', pivot: [34, 37, 12.5], shapes: [
        box(29, 31.5, 12.5, 39, 42.5, 20, M.iron),
        box(29.5, 42, 13, 38.5, 43.5, 19.5, M.ironLight),         // muzzle plate
        box(28, 33, 19.5, 40, 41, 21.5, M.ironLight),             // top armour
        box(31, 30, 14, 37, 32, 18, M.woodDark),                   // rear crank
        ball(34, 30.5, 16, 1.3, M.iron),
      ],
    },
    {
      name: 'spikes', parent: 'launcher', pivot: [34, 43, 16], shapes: [
        ...[30.8, 33.2, 35.6].map((x) => box(x, 42, 14.6 + (x === 33.2 ? 2.2 : 0), x + 1.4, 49, 16 + (x === 33.2 ? 2.2 : 0), M.spike)),
        ...[31.5, 33.9, 36.3].map((x) => ell(x, 49.5, 15.3 + (x === 33.9 ? 2.2 : 0), 0.7, 1.6, 0.7, M.ironLight)),
      ],
    },
    rubblePart(M.rock, M.woodDark),
    siteScaffold(M.wood, M.rockLight),
  ];
  const body = ['mound', 'chimney', 'rails', 'base', 'launcher', 'spikes'];
  const { base, ruined, site } = establishmentPoses(body);
  const idle = withBase(base, [
    { launcher: { yaw: -0.3 } }, { launcher: { yaw: -0.1 } }, { launcher: { yaw: 0.15 } }, { launcher: { yaw: 0.3 } },
    { launcher: { yaw: 0.1 } }, { launcher: { yaw: -0.15 } },
  ]);
  const attack = withBase(base, [
    { launcher: { offset: [0, -1.5, 0] } },
    { launcher: { offset: [0, -3, 0] }, spikes: { hidden: true } },
    { launcher: { offset: [0, -1.5, 0] }, spikes: { hidden: true } },
    { spikes: { offset: [0, -5, 0] } },
    {},
  ]);
  return {
    size: [51, 51, 40], foot: [25.5, 25.5, 0],
    materials: [
      { color: 0x6b5a45 }, { color: 0x6b6b75 }, { color: 0x8b8b96 }, { color: 0x44444f }, { color: 0x92633a },
      { color: 0x5c3d22 }, { color: 0x4b5563 }, { color: 0x9ca3af }, { color: 0x0b0a10 }, { color: 0xfb923c, emissive: true },
      { color: 0x1f1f24 }, { color: 0xd1d5db }, { color: 0xfbbf24, emissive: true }, { color: 0x4a3f30 },
    ],
    parts,
    animations: { idle, attack, ruined: [ruined], site: [site] },
    rates: { idle: 2.5, attack: 14, ruined: 1, site: 1 },
    loops: ['idle'],
  };
};

// ── Wood Grove — ancient face-tree, druid rune circle, sapling summons ───────

const grove = (): StructureModel => {
  const M = { moss: 0, bark: 1, barkDark: 2, leaf: 3, leafLight: 4, leafDeep: 5, rune: 6, stone: 7, fruit: 8, eye: 9, log: 10, sprout: 11, edge: 12 };
  const circle = around(18, 19);
  const parts: Part[] = [
    {
      name: 'ground', pivot: [25, 25, 0], shapes: [
        ...pad(M.moss, M.edge),
        ...circle.map(({ c, s }) => box(25.5 + c - 0.8, 25.5 + s - 0.8, 2.5, 25.5 + c + 0.8, 25.5 + s + 0.8, 3, M.rune)),
      ],
    },
    {
      name: 'stones', pivot: [25, 25, 2], shapes: around(6, 21.5, 0.3).map(({ c, s }) =>
        box(25.5 + c - 1.4, 25.5 + s - 1.4, 2.5, 25.5 + c + 1.4, 25.5 + s + 1.4, 9, M.stone)),
    },
    {
      name: 'logs', pivot: [8, 8, 2], shapes: [
        ell(9, 6, 4.5, 6, 2.2, 2.2, M.log), ell(9, 10.5, 4.5, 6, 2.2, 2.2, M.log), ell(9, 8.2, 8, 6, 2.2, 2.2, M.log),
        ball(15, 6, 4.5, 1.6, M.barkDark), ball(15, 10.5, 4.5, 1.6, M.barkDark), ball(15, 8.2, 8, 1.6, M.barkDark),
      ],
    },
    {
      name: 'trunk', pivot: [25.5, 25.5, 2], shapes: [
        ...around(5, 7, 0.4).map(({ c, s }) => ell(25.5 + c, 25.5 + s, 3.5, 4.5, 4.5, 3, M.barkDark)), // roots
        cyl(25.5, 25.5, 2, 7, 34, M.bark),
        cyl(25.5, 25.5, 2, 7.6, 5, M.barkDark),
        box(31.3, 23, 6, 32.6, 25, 30, M.barkDark), box(23, 31.3, 6, 25, 32.6, 30, M.barkDark),
        // Ent face on the corner facing the viewer
        box(29.6, 28.3, 20, 31.4, 30.1, 22, M.eye), box(28.3, 29.6, 20, 30.1, 31.4, 22, M.eye),
        ...[[31, 28.5], [28.5, 31]].map(([x, y]) => box(x - 0.6, y - 0.6, 22, x + 0.9, y + 0.9, 23.5, M.barkDark)),
        box(29.3, 29.3, 14, 31.7, 31.7, 16, M.barkDark),
      ],
    },
    {
      name: 'canopy', parent: 'trunk', pivot: [25.5, 25.5, 34], shapes: [
        ell(25.5, 25.5, 46, 20, 20, 12, M.leaf),
        ell(13, 20, 42, 10, 10, 7.5, M.leafDeep),
        ell(38, 31, 42, 10, 10, 7.5, M.leafDeep),
        ell(20, 38, 43, 9, 9, 7, M.leaf),
        ell(24, 33, 54, 11, 11, 7.5, M.leafLight),
        ell(31, 19, 53, 9, 9, 6.5, M.leafLight),
        ell(25.5, 25.5, 58, 8, 8, 5, M.leafLight),
        ...[[40, 36, 44], [36, 42, 47], [30, 43, 44], [43, 30, 48], [20, 44, 42], [44, 22, 41], [34, 36, 55]].map(([x, y, z]) => ball(x, y, z, 1.4, M.fruit)),
      ],
    },
    {
      name: 'sprouts', pivot: [25.5, 25.5, 2.5], shapes: around(6, 15, 0.5).flatMap(({ c, s }) => [
        box(25.5 + c - 0.5, 25.5 + s - 0.5, 2.5, 25.5 + c + 0.5, 25.5 + s + 0.5, 7, M.barkDark),
        ell(25.5 + c - 1.6, 25.5 + s, 7.5, 2, 1.2, 0.9, M.sprout),
        ell(25.5 + c + 1.6, 25.5 + s, 7.8, 2, 1.2, 0.9, M.leafLight),
      ]),
    },
    rubblePart(M.barkDark, M.log),
    siteScaffold(M.log, M.stone),
  ];
  const body = ['trunk', 'canopy', 'stones', 'logs'];
  const { base, ruined, site } = establishmentPoses(body, ['sprouts']);
  const idle = withBase(base, [
    { canopy: { roll: 0.03 } }, { canopy: { roll: 0.01, offset: [0, 0, -0.4] } }, { canopy: { roll: -0.025 } }, { canopy: { roll: 0, offset: [0, 0, 0.3] } },
  ]);
  const attack = withBase(base, [
    { canopy: { roll: 0.05, scale: [1.03, 1.03, 1.03] }, sprouts: { hidden: false, scale: [1, 1, 0.3] } },
    { canopy: { roll: -0.05, scale: [1.06, 1.06, 1.06] }, sprouts: { hidden: false, scale: [1, 1, 0.7] } },
    { canopy: { roll: 0.03, scale: [1.03, 1.03, 1.03] }, sprouts: { hidden: false, scale: [1, 1, 1.1] } },
    { canopy: { roll: 0 }, sprouts: { hidden: false, scale: [1, 1, 0.8] } },
  ]);
  return {
    size: [51, 51, 66], foot: [25.5, 25.5, 0],
    materials: [
      { color: 0x3f6b35 }, { color: 0x7a4f2c }, { color: 0x4a2e17 }, { color: 0x2f8f3a }, { color: 0x56c45a },
      { color: 0x1f6b2c }, { color: 0x4ade80, emissive: true }, { color: 0x78716c }, { color: 0xf472b6, emissive: true },
      { color: 0xa3e635, emissive: true }, { color: 0x8b5a2b }, { color: 0x86efac }, { color: 0x2f4a26 },
    ],
    parts,
    animations: { idle, attack, ruined: [ruined], site: [site] },
    rates: { idle: 2, attack: 8, ruined: 1, site: 1 },
    loops: ['idle'],
  };
};

// ── Water Port — dock, boathouse, moored boat and the frost-tide obelisk ─────

const port = (): StructureModel => {
  const M = { plank: 0, plankDark: 1, post: 2, stone: 3, roof: 4, roofDark: 5, ice: 6, iceLight: 7, iceCore: 8, rope: 9, sail: 10, boat: 11, lantern: 12, edge: 13 };
  const parts: Part[] = [
    {
      name: 'ground', pivot: [25, 25, 0], shapes: [
        box(1, 1, 0, 40, 50, 3, M.stone),
        box(1, 1, 3, 50, 50, 5, M.plank),
        ...[6, 12, 18, 24, 30, 36, 42, 48].map((y) => box(1, y, 4.9, 50, y + 0.8, 5.2, M.plankDark)),
        ...[[48, 3], [48, 25], [48, 47]].map(([x, y]) => box(x - 1.2, y - 1.2, 0, x + 1.2, y + 1.2, 8, M.post)),
        box(49, 1, 5, 50, 50, 6.4, M.edge),
      ],
    },
    {
      name: 'boathouse', pivot: [12, 14, 5], shapes: [
        box(3, 4, 5, 21, 24, 20, M.plankDark),
        box(2.5, 3.5, 5, 21.5, 24.5, 7, M.stone),
        box(20.6, 11, 5, 21.6, 17, 14, M.post),                   // door
        box(20.8, 8, 12, 21.8, 9.5, 14, M.lantern),
        box(9, 23.6, 11, 14, 24.6, 15, M.lantern),                // window
        box(2, 3, 20, 22, 25, 23, M.roof),
        box(4, 3, 23, 20, 25, 26, M.roofDark),
        box(7, 3, 26, 17, 25, 29, M.roof),
        box(10, 3, 29, 14, 25, 31, M.roofDark),
        box(5, 23, 25, 7, 25.5, 33, M.stone),                     // chimney
      ],
    },
    {
      name: 'boat', pivot: [44, 12, 3], shapes: [
        ell(44, 12, 4, 4.2, 9, 2.6, M.boat),
        box(41.5, 5, 5, 46.5, 19, 6.5, M.plankDark),
        box(43.6, 11, 6, 44.4, 12, 24, M.post),
        box(43.8, 12, 12, 44.2, 20, 22, M.sail),
        box(40, 9, 5, 42, 10, 6, M.rope),
      ],
    },
    {
      name: 'crates', pivot: [10, 40, 5], shapes: [
        box(4, 34, 5, 10, 40, 11, M.plankDark), box(4.5, 40.5, 5, 9.5, 45.5, 10, M.plank),
        cyl(14, 44, 5, 2.6, 6, M.post), cyl(14, 38.5, 5, 2.4, 5.5, M.plankDark),
      ],
    },
    {
      name: 'obelisk', pivot: [31, 34, 5], shapes: [
        box(25, 28, 5, 37, 40, 9, M.stone),
        box(26, 29, 9, 36, 39, 11, M.edge),
        box(27.5, 30.5, 11, 34.5, 37.5, 31, M.ice),
        box(28.5, 31.5, 31, 33.5, 36.5, 38, M.iceLight),
        ell(31, 34, 39.5, 2.2, 2.2, 3, M.iceCore),
        box(34.3, 32, 14, 35, 36, 28, M.iceLight),                 // frost veins
        box(29, 37.3, 14, 33, 38, 28, M.iceLight),
      ],
    },
    {
      name: 'crystal', pivot: [31, 34, 50], shapes: [
        ell(31, 34, 50, 3, 3, 6.5, M.iceLight),
        ell(31, 34, 50, 1.4, 1.4, 3.5, M.iceCore),
      ],
    },
    {
      name: 'shards', parent: 'crystal', pivot: [31, 34, 50], shapes: around(4, 8).map(({ c, s }) =>
        ell(31 + c, 34 + s, 48, 1.1, 1.1, 2.6, M.ice)),
    },
    {
      name: 'frostRing', pivot: [31, 34, 45], shapes: around(16, 11).map(({ c, s }) => ball(31 + c, 34 + s, 45, 1, M.iceCore)),
    },
    rubblePart(M.plankDark, M.stone),
    siteScaffold(M.post, M.stone),
  ];
  const body = ['boathouse', 'boat', 'crates', 'obelisk', 'crystal', 'shards'];
  const { base, ruined, site } = establishmentPoses(body, ['frostRing']);
  const idle = withBase(base, [
    { crystal: { offset: [0, 0, 0] }, shards: { yaw: 0 } },
    { crystal: { offset: [0, 0, 1] }, shards: { yaw: Math.PI / 8 } },
    { crystal: { offset: [0, 0, 1.6] }, shards: { yaw: Math.PI / 4 } },
    { crystal: { offset: [0, 0, 0.8] }, shards: { yaw: (3 * Math.PI) / 8 } },
  ]);
  const attack = withBase(base, [
    { crystal: { scale: [1.2, 1.2, 1.2] }, shards: { scale: [1.2, 1.2, 1] }, frostRing: { hidden: false, scale: [0.6, 0.6, 1] } },
    { crystal: { scale: [1.45, 1.45, 1.4], offset: [0, 0, 1] }, shards: { yaw: 0.6, scale: [1.4, 1.4, 1] }, frostRing: { hidden: false } },
    { crystal: { scale: [1.25, 1.25, 1.2] }, shards: { yaw: 1.2, scale: [1.2, 1.2, 1] }, frostRing: { hidden: false, scale: [1.3, 1.3, 1] } },
    { crystal: { scale: [1.05, 1.05, 1.05] }, shards: { yaw: 1.6 } },
  ]);
  return {
    size: [51, 51, 60], foot: [25.5, 25.5, 0],
    materials: [
      { color: 0xa87b4f }, { color: 0x6f4e2e }, { color: 0x4a3322 }, { color: 0x6b7280 }, { color: 0x1d4ed8 },
      { color: 0x1e3a8a }, { color: 0x67e8f9 }, { color: 0xcffafe, emissive: true }, { color: 0xffffff, emissive: true },
      { color: 0xd6c7a1 }, { color: 0xf1f5f9 }, { color: 0x7c4a26 }, { color: 0xfbbf24, emissive: true }, { color: 0x3f2d1c },
    ],
    parts,
    animations: { idle, attack, ruined: [ruined], site: [site] },
    rates: { idle: 3, attack: 9, ruined: 1, site: 1 },
    loops: ['idle'],
  };
};

// ── Mystic Cave — volcanic mound, essence crystals, horned Hellfire Maw ─────

const cave = (): StructureModel => {
  const M = { soil: 0, rock: 1, rockLight: 2, rockDark: 3, lava: 4, lavaCore: 5, bone: 6, horn: 7, eye: 8, flame: 9, flameCore: 10, crystal: 11, soot: 12, edge: 13 };
  const parts: Part[] = [
    {
      name: 'ground', pivot: [25, 25, 0], shapes: [
        ...pad(M.soil, M.edge),
        ell(36, 44, 2.4, 6, 4, 0.6, M.lava), ell(36, 44, 2.6, 3, 2, 0.5, M.lavaCore),
        box(22, 44, 2.4, 30, 45, 2.8, M.lava), box(44, 30, 2.4, 45, 38, 2.8, M.lava),
      ],
    },
    {
      name: 'mound', pivot: [22, 22, 2], shapes: [
        ell(22, 22, 3, 21, 21, 21, M.rock),
        ell(11, 34, 2, 11, 11, 12, M.rockDark),
        ell(34, 11, 2, 11, 10, 14, M.rockLight),
        ell(20, 20, 20, 13, 13, 12, M.rockLight),
        ell(26, 38, 4, 9, 6.5, 9, M.soot),                          // cave mouth facing the viewer's right
        ell(26, 41, 3, 6, 3, 5, M.soot),
        ell(26, 39, 2.5, 5, 3, 2.2, M.lava),
        box(30, 31, 10, 31, 37, 22, M.lava), box(16, 32, 14, 17, 36, 26, M.lava), box(36, 20, 12, 38, 21, 20, M.lava), // lava cracks
        // Essence crystals
        ell(8, 12, 22, 2.2, 2.2, 6, M.crystal), ell(12, 8, 20, 1.8, 1.8, 5, M.crystal), ell(38, 30, 16, 1.8, 1.8, 4.5, M.crystal),
        ell(14, 30, 24, 1.6, 1.6, 4, M.crystal),
      ],
    },
    {
      name: 'skull', pivot: [26, 42, 20], shapes: [
        box(21, 37, 17, 31, 46, 27, M.bone),
        box(20.5, 36.5, 25, 31.5, 46.5, 28, M.bone),
        box(22.5, 45.6, 21.5, 25, 46.6, 24, M.eye), box(27, 45.6, 21.5, 29.5, 46.6, 24, M.eye),
        box(25.4, 45.8, 19, 26.6, 46.8, 21, M.horn),                // nose slit
        box(21, 39, 27, 23, 42, 31, M.horn), box(20, 39, 30, 22, 41, 34, M.horn), box(19.5, 38.5, 33.5, 21, 40, 36.5, M.horn),
        box(29, 39, 27, 31, 42, 31, M.horn), box(30, 39, 30, 32, 41, 34, M.horn), box(31, 38.5, 33.5, 32.5, 40, 36.5, M.horn),
      ],
    },
    {
      name: 'jaw', parent: 'skull', pivot: [26, 38, 17], shapes: [
        box(21.5, 37.5, 13.5, 30.5, 46, 17, M.bone),
        ...[22.5, 25, 27.5].map((x) => box(x, 45.2, 16.5, x + 1.3, 46.2, 18.5, M.bone)),   // fangs
      ],
    },
    {
      name: 'flame', parent: 'skull', pivot: [26, 46, 17.5], shapes: [
        ell(26, 47.5, 17.5, 3.2, 2.5, 2.4, M.flame),
        ell(26, 49, 17.5, 2, 1.5, 1.6, M.flameCore),
        ell(24, 48.5, 19.5, 1.4, 1.4, 1.4, M.flame),
        ell(28, 48.5, 16, 1.4, 1.4, 1.4, M.flame),
      ],
    },
    rubblePart(M.rockDark, M.bone),
    siteScaffold(M.horn, M.rockLight),
  ];
  const body = ['mound', 'skull', 'jaw'];
  const { base, ruined, site } = establishmentPoses(body, ['flame']);
  const idle = withBase(base, [
    { skull: { offset: [0, 0, 0] } }, { skull: { offset: [0, 0, 0.5] } }, { skull: { offset: [0, 0, 0.8] } }, { skull: { offset: [0, 0, 0.3] } },
  ]);
  const attack = withBase(base, [
    { jaw: { pitch: -0.35 }, flame: { hidden: false, scale: [0.6, 0.6, 0.6] } },
    { jaw: { pitch: -0.7 }, flame: { hidden: false, scale: [1, 1, 1] } },
    { jaw: { pitch: -0.75 }, flame: { hidden: false, scale: [1.15, 1.1, 1.15] } },
    { jaw: { pitch: -0.7 }, flame: { hidden: false, scale: [0.95, 1, 0.95] } },
  ]);
  return {
    size: [51, 51, 40], foot: [25.5, 25.5, 0],
    materials: [
      { color: 0x3b2a2a }, { color: 0x4a3d52 }, { color: 0x6b5a78 }, { color: 0x2a2233 }, { color: 0xf97316, emissive: true },
      { color: 0xfde047, emissive: true }, { color: 0xe7e0d0 }, { color: 0x1c1917 }, { color: 0xef4444, emissive: true },
      { color: 0xfb923c, emissive: true }, { color: 0xfef08a, emissive: true }, { color: 0xc084fc, emissive: true },
      { color: 0x0c0a10 }, { color: 0x2a1e1e },
    ],
    parts,
    animations: { idle, attack, ruined: [ruined], site: [site] },
    rates: { idle: 3, attack: 10, ruined: 1, site: 1 },
    loops: ['idle', 'attack'],
  };
};

// ── Crystal Spire — the aether node: a cluster of cyan crystals on rock ──────

const spire = (): StructureModel => {
  const M = { rock: 0, rockDark: 1, crystal: 2, crystalLight: 3, core: 4, deep: 5, grass: 6, edge: 7, wood: 8, arc: 9 };
  const shard = (name: string, x: number, y: number, h: number, r: number, mat: number): Part => ({
    name, parent: 'rocks', pivot: [x, y, 4], shapes: [
      ell(x, y, 4 + h / 2, r, r, h / 2, mat),
      ell(x, y, 4 + h * 0.55, r * 0.45, r * 0.45, h * 0.35, M.core),
    ],
  });
  const parts: Part[] = [
    { name: 'ground', pivot: [25, 25, 0], shapes: pad(M.grass, M.edge) },
    {
      name: 'rocks', pivot: [25, 25, 2], shapes: [
        ell(25, 25, 3, 16, 16, 5, M.rock), ell(14, 30, 3, 8, 7, 5, M.rockDark), ell(34, 16, 3, 8, 8, 6, M.rockDark),
        ell(33, 34, 3, 7, 6, 4, M.rock),
      ],
    },
    shard('main', 25, 25, 52, 6.5, M.crystal),
    shard('left', 32, 20, 30, 4.2, M.crystalLight),
    shard('right', 20, 32, 34, 4.6, M.crystal),
    shard('front', 34, 33, 20, 3.4, M.crystalLight),
    shard('back', 16, 18, 26, 3.8, M.deep),
    {
      name: 'float', pivot: [25, 25, 62], shapes: around(3, 11).map(({ c, s }) => ell(25 + c, 25 + s, 62, 1.6, 1.6, 3.2, M.crystalLight)),
    },
    // Aether Arc charge: a crackling ring of sparks around the main crystal's tip
    {
      name: 'surge', pivot: [25, 25, 56], shapes: around(12, 7).map(({ c, s }) => ball(25 + c, 25 + s, 56, 1.1, M.arc)),
    },
    rubblePart(M.rockDark, M.deep),
    siteScaffold(M.wood, M.rock),
  ];
  const body = ['main', 'left', 'right', 'front', 'back'];
  const { base, site } = establishmentPoses([...body, 'float'], ['surge']);
  const tilt: Pose = {
    ...base,
    left: { roll: 0.35, pitch: -0.2 }, right: { roll: -0.3, pitch: 0.25 }, front: { roll: 0.3, pitch: 0.35 },
    back: { roll: -0.25, pitch: -0.3 }, main: { roll: 0.04 },
  };
  const idle = withBase(tilt, [
    { float: { yaw: 0, offset: [0, 0, 0] } },
    { float: { yaw: Math.PI / 6, offset: [0, 0, 1] } },
    { float: { yaw: Math.PI / 3, offset: [0, 0, 1.6] } },
    { float: { yaw: Math.PI / 2, offset: [0, 0, 1] } },
  ]);
  // Crystals flare and the sparks ring out as the bolt is loosed
  const attack = withBase(tilt, [
    { main: { roll: 0.04, scale: [1.1, 1.1, 1.04] }, float: { yaw: 0.5, offset: [0, 0, 2] }, surge: { hidden: false, scale: [0.5, 0.5, 1] } },
    { main: { roll: 0.04, scale: [1.25, 1.25, 1.08] }, float: { yaw: 1.2, offset: [0, 0, 3] }, surge: { hidden: false, yaw: 0.4 } },
    { main: { roll: 0.04, scale: [1.15, 1.15, 1.05] }, float: { yaw: 1.9, offset: [0, 0, 2] }, surge: { hidden: false, yaw: 0.8, scale: [1.5, 1.5, 1] } },
    { main: { roll: 0.04, scale: [1.02, 1.02, 1] }, float: { yaw: 2.4, offset: [0, 0, 1] } },
  ]);
  // Wrecked: shards cracked and toppled, the floating crystals fallen dark
  const ruined: Pose = {
    ...hide('scaffold', 'surge', 'float'),
    main: { roll: 0.55, pitch: 0.2, scale: [1, 1, 0.45] },
    left: { roll: 1.1, pitch: -0.3, scale: [1, 1, 0.6] },
    right: { roll: -0.9, pitch: 0.5, scale: [1, 1, 0.55] },
    front: { roll: 0.8, pitch: 0.9, scale: [1, 1, 0.6] },
    back: { roll: -0.7, pitch: -0.8, scale: [1, 1, 0.5] },
  };
  return {
    size: [51, 51, 70], foot: [25.5, 25.5, 0],
    materials: [
      { color: 0x57534e }, { color: 0x3f3a36 }, { color: 0x22d3ee }, { color: 0xa5f3fc }, { color: 0x67e8f9, emissive: true },
      { color: 0x0e7490 }, { color: 0x3f6b35 }, { color: 0x2f4a26 }, { color: 0x6f4e2e }, { color: 0xecfeff, emissive: true },
    ],
    parts,
    animations: { idle, attack, ruined: [ruined], site: [site] },
    rates: { idle: 3, attack: 9, ruined: 1, site: 1 },
    loops: ['idle'],
  };
};

// ── Invader portal — gilded stone ring with a golden-blue rift, faces the viewer ─

const portal = (): StructureModel => {
  const M = { stone: 0, stoneDark: 1, gold: 2, rune: 3, mid: 4, light: 5, core: 6, arm: 7, ember: 8 };
  const C = 17;   // model centre
  const RZ = 26;  // ring centre height
  const ringBlocks = (from: number, to: number) =>
    Array.from({ length: 20 }, (_, i) => (i / 20) * Math.PI * 2)
      .filter((a) => Math.sin(a) >= from && Math.sin(a) < to)
      .map((a, i) => {
        const x = C + Math.cos(a) * 12.5;
        const z = RZ + Math.sin(a) * 12.5;
        return box(x - 1.8, C - 1.8, z - 1.8, x + 1.8, C + 1.8, z + 1.8, i % 3 === 0 ? M.gold : M.stone);
      });
  const parts: Part[] = [
    { name: 'frame', pivot: [C, C, 0], shapes: [] },
    {
      name: 'plinth', parent: 'frame', pivot: [C, C, 0], shapes: [
        box(3, 12, 0, 31, 22, 3, M.stoneDark),
        box(5, 13, 3, 29, 21, 5, M.stone),
        box(2, 14, 0, 7, 20, 30, M.stoneDark), box(27, 14, 0, 32, 20, 30, M.stoneDark),
        box(1.5, 13.5, 29, 7.5, 20.5, 32, M.gold), box(26.5, 13.5, 29, 32.5, 20.5, 32, M.gold),
        box(4, 19.8, 8, 5, 20.6, 24, M.rune), box(29, 19.8, 8, 30, 20.6, 24, M.rune),
      ],
    },
    { name: 'ringLow', parent: 'frame', pivot: [C, C, RZ], shapes: ringBlocks(-2, 0.3) },
    { name: 'ringTop', parent: 'frame', pivot: [C, C, RZ], shapes: [...ringBlocks(0.3, 2), ball(C, C, RZ + 14.5, 1.8, M.rune)] },
    {
      name: 'vortex', parent: 'frame', pivot: [C, C, RZ], shapes: [
        ell(C, C, RZ, 10.6, 1.1, 10.6, M.mid),
        ell(C, C + 0.3, RZ, 7.2, 1.3, 7.2, M.light),
        ell(C, C + 0.5, RZ, 3.2, 1.6, 3.2, M.core),
        ...[0, 1, 2].flatMap((k) => Array.from({ length: 5 }, (_, i) => {
          const r = 3.8 + i * 1.45;
          const a = (k * 2 * Math.PI) / 3 + i * 0.5;
          return ell(C + Math.cos(a) * r, C + 0.7, RZ + Math.sin(a) * r, 1.25, 1.2, 1.25, M.arm);
        })),
      ],
    },
    {
      name: 'flare', parent: 'frame', pivot: [C, C, RZ], shapes: [
        ell(C, C + 1, RZ, 12.5, 0.8, 12.5, M.light),
        ...around(8, 1).map(({ a }) => {
          const x = C + Math.cos(a) * 14;
          const z = RZ + Math.sin(a) * 14;
          return ell(x, C + 1, z, 1.6, 1, 1.6, M.core);
        }),
      ],
    },
    { name: 'ember', parent: 'frame', pivot: [C, C, RZ], shapes: [ball(C, C + 0.5, RZ, 2.2, M.ember), ell(C, C, RZ, 5, 0.6, 5, M.stoneDark)] },
  ];
  const turn = { frame: { yaw: -Math.PI / 4 } } as Pose;
  const base: Pose = { ...turn, flare: { hidden: true }, ember: { hidden: true } };
  const step = (2 * Math.PI) / 3 / 6;
  const idle = withBase(base, Array.from({ length: 6 }, (_, i) => ({ vortex: { roll: -i * step } })));
  const spawn = withBase(base, [
    { vortex: { roll: 0, scale: [1.12, 1, 1.12] }, flare: { hidden: false, scale: [0.7, 1, 0.7] } },
    { vortex: { roll: -step, scale: [1.28, 1, 1.28] }, flare: { hidden: false } },
    { vortex: { roll: -2 * step, scale: [1.18, 1, 1.18] }, flare: { hidden: false, scale: [1.15, 1, 1.15] } },
    { vortex: { roll: -3 * step, scale: [1.05, 1, 1.05] } },
  ]);
  const absorb = withBase(base, [
    { vortex: { roll: 2 * step, scale: [0.92, 1, 0.92] } },
    { vortex: { roll: 4 * step, scale: [0.75, 1, 0.75] } },
    { vortex: { roll: 6 * step, scale: [0.58, 1, 0.58] }, flare: { hidden: false, scale: [0.45, 1, 0.45] } },
    { vortex: { roll: 8 * step, scale: [0.85, 1, 0.85] } },
  ]);
  const dormant = withBase({ ...turn, flare: { hidden: true }, vortex: { hidden: true } }, [
    { ember: { scale: [1, 1, 1] } }, { ember: { scale: [0.75, 1, 0.75] } },
  ]);
  const destroyed = [{
    ...turn, ...hide('vortex', 'flare', 'ember', 'ringTop'),
    ringLow: { roll: 0.25, offset: [0, 0, -3] },
  } as Pose];
  return {
    size: [34, 34, 46], foot: [17, 17, 0],
    materials: [
      { color: 0x78716c }, { color: 0x44403c }, { color: 0xfbbf24 }, { color: 0xfde68a, emissive: true },
      { color: 0x3b82f6, emissive: true }, { color: 0x93c5fd, emissive: true }, { color: 0xffffff, emissive: true },
      { color: 0xfde047, emissive: true }, { color: 0x60a5fa, emissive: true },
    ],
    parts,
    animations: { dormant, idle, spawn, absorb, destroyed },
    rates: { dormant: 2, idle: 10, spawn: 10, absorb: 10, destroyed: 1 },
    loops: ['dormant', 'idle'],
  };
};

// ── Registry ─────────────────────────────────────────────────────────────────

export type StructureKey =
  | 'castle' | 'quarry' | 'mine' | 'grove' | 'port' | 'cave' | 'spire' | 'portal'
  | 'trench' | 'crypt' | 'perch' | 'kennel';

// Order = bake order: the always-visible citadel, portals and spire first
export const STRUCTURE_MODELS: Record<StructureKey, () => StructureModel> = {
  castle, portal, spire, quarry, mine, grove, port, cave,
  // Landmarks: recoloured variants of the base establishments
  trench: () => recolorModel(port(), 0x0c4a6e, 0x22d3ee, 0.55),
  crypt: () => recolorModel(cave(), 0x3f4a3c, 0x4ade80, 0.6),
  perch: () => recolorModel(quarry(), 0x2b1d1a, 0xf97316, 0.65),
  kennel: () => recolorModel(mine(), 0x7f1d1d, 0xfb923c, 0.55),
};

export const BUILDING_SPRITE: Record<ResourceBuildingId, StructureKey> = {
  QUARRY: 'quarry',
  MINE: 'mine',
  WOOD: 'grove',
  PORT: 'port',
  CAVE: 'cave',
  TRENCH: 'trench',
  CRYPT: 'crypt',
  PERCH: 'perch',
  KENNEL: 'kennel',
};
