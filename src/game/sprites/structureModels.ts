import type { ResourceBuildingId } from '../../types/state';
import type { Part, Pose, Shape, VoxelGeometry } from './VoxelSprite';

/**
 * Voxel models for the citadel, the establishments, the Crystal Spire and the
 * invader portals. Each one follows its Codex art in public/structures/
 * (silhouette, colours, props) — compare the image and the Atlas "Structures"
 * tab side by side before changing a model.
 *
 * They are baked from one fixed camera (STRUCTURE_DIRECTION) where model +y
 * runs along grid +x (screen right-down) and model +x along grid +y (screen
 * left-down), so the faces the player sees are the high-x and high-y sides and
 * (0,0) is the far corner. One tile is ~25.5 voxels, and sprites are drawn at
 * STRUCTURE_PIXEL world units per pixel to match the tile pixel art.
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

/** Stepped cone (tower roofs, peaks) from stacked cylinders, alternating two materials. */
const cone = (cx: number, cy: number, z0: number, r0: number, height: number, mat: number, alt: number = mat, steps: number = 8): Shape[] =>
  Array.from({ length: steps }, (_, i) =>
    cyl(cx, cy, z0 + (height / steps) * i, Math.max(0.8, r0 * (1 - i / steps)), height / steps + 0.01, i % 2 ? alt : mat));

/** Square stepped pyramid (crystal tips, obelisk caps). */
const pyramid = (cx: number, cy: number, z0: number, half: number, height: number, mat: number, steps = 6): Shape[] =>
  Array.from({ length: steps }, (_, i) => {
    const h = Math.max(0.5, half * (1 - i / steps));
    return box(cx - h, cy - h, z0 + (height / steps) * i, cx + h, cy + h, z0 + (height / steps) * (i + 1), mat);
  });

/** Balls along a polyline — lava rivers, tentacles, roots, vines. */
const chain = (points: Array<[number, number, number]>, r0: number, r1: number, mat: number, per = 3): Shape[] => {
  const out: Shape[] = [];
  const total = (points.length - 1) * per;
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const r = r0 + (r1 - r0) * ((i * per + k) / Math.max(1, total));
      out.push(ball(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, r, mat));
    }
  }
  const last = points[points.length - 1];
  out.push(ball(last[0], last[1], last[2], r1, mat));
  return out;
};

/** Diagonal beam from stepped boxes (tower cross-braces). */
const beam = (a: [number, number, number], b: [number, number, number], t: number, mat: number, steps = 10): Shape[] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const f = i / steps;
    const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f, z = a[2] + (b[2] - a[2]) * f;
    return box(x - t, y - t, z - t, x + t, y + t, z + t, mat);
  });

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

/** A small skull: bone ball with two dark sockets on the faces the viewer sees. */
const skull = (x: number, y: number, z: number, r: number, bone: number, dark: number): Shape[] => [
  ball(x, y, z, r, bone),
  box(x + r * 0.55, y - r * 0.55, z - r * 0.1, x + r * 1.02, y - r * 0.1, z + r * 0.35, dark),
  box(x + r * 0.55, y + r * 0.1, z - r * 0.1, x + r * 1.02, y + r * 0.55, z + r * 0.35, dark),
];

// ── Shared establishment pieces ─────────────────────────────────────────────

const pad = (mat: number, edge: number): Shape[] => [
  box(1, 1, 0, 50, 50, 2.5, mat),
  box(0.5, 49, 0, 50.5, 50.5, 3, edge),
  box(49, 0.5, 0, 50.5, 50.5, 3, edge),
];

/** Corner poles and two rails; the building's own foundation rises inside. */
const siteScaffold = (wood: number): Part => ({
  name: 'scaffold', pivot: [25, 25, 2], shapes: [
    ...[[4, 4], [4, 47], [47, 4], [47, 47]].map(([x, y]) => box(x - 0.8, y - 0.8, 2, x + 0.8, y + 0.8, 20, wood)),
    box(3, 46.2, 11, 48, 47.8, 12.4, wood), box(46.2, 3, 11, 47.8, 48, 12.4, wood),
    box(3, 46.2, 18, 48, 47.8, 19.4, wood), box(46.2, 3, 18, 47.8, 48, 19.4, wood),
  ],
});

/**
 * Poses shared by every establishment: normal / wrecked / construction site.
 * The site shows the scaffold around the building's own lowest parts (pivot at
 * ground level) squashed to a third of their height — so every plot already
 * reads as that building — and hides everything above.
 */
const establishmentPoses = (parts: Part[], body: string[], extraHidden: string[] = []) => {
  const base: Pose = { ...hide('scaffold', 'rubble', ...extraHidden) };
  // Wrecked: everything slumps to ~55%; raised top-level parts also drop so they don't float
  const pivotZ = new Map(parts.map((p) => [p.name, p.parent ? null : p.pivot[2]]));
  const ruined: Pose = {
    ...hide('scaffold', ...extraHidden),
    ...Object.fromEntries(body.map((n) => {
      const z = pivotZ.get(n);
      const drop = z && z > 6 ? -(z - 2) * 0.45 : 0;
      return [n, { scale: [1, 1, 0.55] as [number, number, number], roll: 0.05, offset: [0, 0, drop] as [number, number, number] }];
    })),
  };
  const low = new Set(parts.filter((p) => body.includes(p.name) && !p.parent && p.pivot[2] <= 6).map((p) => p.name));
  const site: Pose = {
    ...hide('rubble', ...extraHidden),
    ...Object.fromEntries(body.map((n) => [n, low.has(n) ? { scale: [1, 1, 0.3] as [number, number, number] } : { hidden: true }])),
  };
  return { base, ruined, site };
};

const rubblePart = (a: number, b: number): Part => ({
  name: 'rubble', pivot: [25, 25, 2], shapes: [
    ell(34, 36, 2.5, 6, 5, 3.5, a), ell(14, 38, 2.5, 5, 4, 3, b), ell(38, 14, 2.5, 4.5, 5.5, 3, a),
    box(26, 40, 2.5, 31, 45, 6, b), box(41, 26, 2.5, 46, 30, 5, a),
  ],
});

const establishment = (
  materials: StructureModel['materials'], parts: Part[], size: number,
  animations: { idle: Pose[]; attack: Pose[]; ruined: Pose; site: Pose },
  rates: { idle: number; attack: number }, attackLoops = false
): StructureModel => ({
  size: [51, 51, size], foot: [25.5, 25.5, 0],
  materials, parts,
  animations: { idle: animations.idle, attack: animations.attack, ruined: [animations.ruined], site: [animations.site] },
  rates: { idle: rates.idle, attack: rates.attack, ruined: 1, site: 1 },
  loops: attackLoops ? ['idle', 'attack'] : ['idle'],
});

// ── 1. Nexus Castle (citadel) — gothic keep of red spires on a lava-veined crag ─

const castle = (): StructureModel => {
  const M = {
    rock: 0, rockLight: 1, stone: 2, stoneLight: 3, stoneDark: 4, roof: 5, roofDark: 6, window: 7,
    lava: 8, lavaCore: 9, trim: 10, beacon: 11, beaconCore: 12, wood: 13, rubble: 14, iron: 15,
  };
  // [x, y, radius, wall height] — the back towers stand tallest so they show over the keep
  const towers: Array<[number, number, number, number]> = [
    [9, 9, 6.5, 50], [9, 67, 6, 38], [67, 9, 6, 38], [67, 67, 6.5, 30], [38, 9, 4.5, 44], [9, 38, 4.5, 44],
  ];
  const lavaFall = (x: number, y: number, face: 'x' | 'y', z0: number, z1: number): Shape[] => face === 'x'
    ? [box(x, y - 1.6, z0, x + 1, y + 1.6, z1, M.lava), box(x + 0.3, y - 0.6, z0, x + 1.2, y + 0.6, z1, M.lavaCore)]
    : [box(x - 1.6, y, z0, x + 1.6, y + 1, z1, M.lava), box(x - 0.6, y + 0.3, z0, x + 0.6, y + 1.2, z1, M.lavaCore)];
  const parts: Part[] = [
    {
      name: 'base', pivot: [38, 38, 0], shapes: [
        box(0, 0, 0, 76, 76, 4, M.rock),
        ell(70, 30, 3, 6, 14, 5, M.rockLight), ell(30, 70, 3, 14, 6, 5, M.rockLight),
        ell(70, 70, 2, 7, 7, 5, M.rock), ell(72, 52, 2, 4, 8, 4, M.rock), ell(52, 72, 2, 8, 4, 4, M.rock),
        // Lava rivers spilling down the crag towards the viewer
        ...chain([[70, 48, 6], [73, 52, 3], [75.5, 58, 0.8]], 1.5, 1.2, M.lava),
        ...chain([[48, 70, 6], [53, 73, 3], [60, 75.5, 0.8]], 1.5, 1.2, M.lava),
        ell(74, 62, 0.6, 2.5, 4, 0.8, M.lavaCore), ell(62, 74, 0.6, 4, 2.5, 0.8, M.lavaCore),
      ],
    },
    {
      name: 'walls', pivot: [38, 38, 4], shapes: [
        box(6, 6, 4, 70, 11, 22, M.stone), box(6, 6, 4, 11, 70, 22, M.stone),
        box(6, 65, 4, 70, 70, 22, M.stone), box(65, 6, 4, 70, 70, 22, M.stone),
        box(64.6, 6, 18, 70.4, 70.4, 21, M.stoneLight), box(6, 64.6, 18, 70.4, 70.4, 21, M.stoneLight),
        ...merlons('y', 9, 65, 65, 70, 22, 25.5, M.stoneDark, 4.5, 2.2),
        ...merlons('x', 9, 65, 65, 70, 22, 25.5, M.stoneDark, 4.5, 2.2),
        ...[18, 50].map((y) => box(69.6, y, 10, 70.6, y + 1.6, 16, M.window)),
        ...[18, 50].map((x) => box(x, 69.6, 10, x + 1.6, 70.6, 16, M.window)),
        ...lavaFall(70, 58, 'x', 4, 18), ...lavaFall(58, 70, 'y', 4, 18),
      ],
    },
    {
      name: 'gatehouse', pivot: [68, 38, 4], shapes: [
        box(62, 29, 4, 73, 47, 30, M.stoneDark),
        ...merlons('y', 29, 47, 68, 73, 30, 33, M.stoneDark, 4, 2),
        box(72.2, 33, 4, 73.6, 43, 18, M.trim),                    // gate opening, lava-lit
        ell(72.9, 38, 18, 0.8, 5, 3.5, M.trim),
        box(72.6, 34, 4, 73.8, 42, 9, M.lava),
        box(72.8, 35.5, 4, 74, 40.5, 6, M.lavaCore),
        ...[35, 37.5, 40].map((y) => box(73.3, y, 9, 73.9, y + 0.8, 18, M.iron)),
        box(72.6, 36, 21, 73.8, 40, 27, M.window),                 // lit gothic window
      ],
    },
    {
      name: 'keep', pivot: [38, 38, 4], shapes: [
        box(24, 24, 4, 52, 52, 46, M.stone),
        box(23.4, 23.4, 4, 52.6, 52.6, 8, M.stoneDark),
        box(23.4, 23.4, 42, 52.6, 52.6, 46, M.stoneLight),
        // Tall lancet windows glowing orange on both visible faces
        ...[29, 36, 43].map((y) => box(51.7, y, 14, 52.7, y + 3, 36, M.window)),
        ...[29, 36, 43].map((x) => box(x, 51.7, 14, x + 3, 52.7, 36, M.window)),
        ...[29, 36, 43].map((y) => ell(52.2, y + 1.5, 36, 0.6, 1.5, 2.2, M.window)),
        ...[29, 36, 43].map((x) => ell(x + 1.5, 52.2, 36, 1.5, 0.6, 2.2, M.window)),
        ...[33.5, 40.5].map((y) => box(51.9, y - 0.5, 14, 52.9, y + 0.5, 36, M.trim)),
        ...[33.5, 40.5].map((x) => box(x - 0.5, 51.9, 14, x + 0.5, 52.9, 36, M.trim)),
        // Buttresses
        ...[[52, 26], [52, 49], [26, 52], [49, 52]].map(([x, y]) => box(x - 1.5, y - 1.5, 4, x + 1.5, y + 1.5, 38, M.stoneDark)),
      ],
    },
    {
      name: 'towers', pivot: [38, 38, 4], shapes: towers.flatMap(([cx, cy, r, h]) => [
        cyl(cx, cy, 4, r, h, M.stone),
        cyl(cx, cy, 4, r + 0.6, 4, M.stoneDark),
        cyl(cx, cy, 4 + h - 3, r + 0.8, 3, M.stoneLight),
        box(cx + r - 0.6, cy - 0.8, 4 + h * 0.55, cx + r + 0.4, cy + 0.8, 4 + h * 0.75, M.window),
        box(cx - 0.8, cy + r - 0.6, 4 + h * 0.55, cx + 0.8, cy + r + 0.4, 4 + h * 0.75, M.window),
      ]),
    },
    {
      name: 'roofs', pivot: [38, 38, 30], shapes: [
        ...towers.flatMap(([cx, cy, r, h]) => [
          ...cone(cx, cy, 4 + h, r + 1.4, r * 2.6, M.roof, M.roofDark, 9),
          box(cx - 0.4, cy - 0.4, 4 + h + r * 2.6, cx + 0.4, cy + 0.4, 4 + h + r * 2.6 + 3, M.trim),
        ]),
        // Keep: a crown of four pinnacles round the great central spire
        ...[[27, 27], [27, 49], [49, 27], [49, 49]].flatMap(([x, y]) => [
          cyl(x, y, 46, 3, 6, M.stone), ...cone(x, y, 52, 3.8, 10, M.roof, M.roofDark, 6),
        ]),
        ...cone(38, 38, 46, 11, 22, M.roof, M.roofDark, 11),
      ],
    },
    {
      name: 'beacon', pivot: [38, 38, 72], shapes: [
        ell(38, 38, 72, 3.4, 3.4, 4.2, M.beacon),
        ball(38, 38, 72.4, 1.7, M.beaconCore),
      ],
    },
    {
      name: 'halo', parent: 'beacon', pivot: [38, 38, 72], shapes:
        around(12, 7.5).map(({ c, s }) => ball(38 + c, 38 + s, 72, 1.1, M.beaconCore)),
    },
    {
      name: 'lavaGlow', pivot: [38, 38, 4], shapes: [
        box(70.8, 57, 4, 71.6, 59, 18, M.lavaCore),
        box(57, 70.8, 4, 59, 71.6, 18, M.lavaCore),
      ],
    },
    {
      name: 'rubble', pivot: [38, 38, 4], shapes: [
        ell(58, 60, 4, 7, 6, 4, M.rubble), ell(24, 64, 4, 6, 5, 3.5, M.rubble), ell(64, 22, 4, 5, 7, 4, M.rubble),
        box(44, 60, 4, 50, 64, 8, M.stoneLight), box(62, 44, 4, 66, 49, 7, M.stone), box(30, 30, 24, 36, 36, 27, M.stoneDark),
        ell(38, 38, 25, 8, 8, 3, M.rubble), ell(48, 58, 5, 3, 3, 2, M.lava), ell(60, 40, 5, 2.5, 3, 2, M.lava),
      ],
    },
    {
      name: 'scaffold', pivot: [38, 38, 4], shapes: [
        ...[[6, 6], [6, 70], [70, 6], [70, 70], [38, 70], [70, 38]].map(([x, y]) => box(x - 0.8, y - 0.8, 4, x + 0.8, y + 0.8, 30, M.wood)),
        box(5, 69.4, 14, 71, 70.8, 15.4, M.wood), box(69.4, 5, 14, 70.8, 71, 15.4, M.wood),
        box(5, 69.4, 26, 71, 70.8, 27.4, M.wood), box(69.4, 5, 26, 70.8, 71, 27.4, M.wood),
        box(24, 24, 4, 52, 52, 12, M.stone), box(26, 44, 12, 34, 52, 18, M.stoneLight),
        box(44, 26, 12, 52, 32, 16, M.stoneLight),
      ],
    },
  ];
  const base: Pose = { ...hide('rubble', 'scaffold', 'halo') };
  const glow = (on: boolean): Pose => ({ lavaGlow: { hidden: !on } });
  const idle = withBase(base, [
    { ...glow(true), beacon: { offset: [0, 0, 0] } },
    { ...glow(false), beacon: { offset: [0, 0, 0.6] } },
    { ...glow(true), beacon: { offset: [0, 0, 1.1] } },
    { ...glow(false), beacon: { offset: [0, 0, 0.5] } },
  ]);
  const pulse = withBase(base, [
    { beacon: { scale: [1.25, 1.25, 1.2], offset: [0, 0, 0.8] }, halo: { hidden: false, scale: [0.7, 0.7, 1] } },
    { beacon: { scale: [1.5, 1.5, 1.4], offset: [0, 0, 1.2] }, halo: { hidden: false, scale: [1, 1, 1] } },
    { beacon: { scale: [1.25, 1.25, 1.2], offset: [0, 0, 0.8] }, halo: { hidden: false, scale: [1.3, 1.3, 1] } },
  ]);
  const ruined = [{
    ...hide('roofs', 'beacon', 'halo', 'scaffold', 'lavaGlow'),
    keep: { scale: [1, 1, 0.5] }, towers: { scale: [1, 1, 0.55] }, walls: { scale: [1, 1, 0.75] }, gatehouse: { scale: [1, 1, 0.7] },
  } as Pose];
  const site = [{
    ...hide('gatehouse', 'keep', 'towers', 'roofs', 'beacon', 'halo', 'rubble', 'lavaGlow'),
    walls: { scale: [1, 1, 0.3] },
  } as Pose];
  return {
    size: [76, 76, 80],
    foot: [38, 38, 0],
    materials: [
      { color: 0x2a2530 }, { color: 0x413a48 }, { color: 0x45414f }, { color: 0x5f5a6b }, { color: 0x2c2934 },
      { color: 0xb91c1c }, { color: 0x7f1d1d }, { color: 0xfb923c, emissive: true }, { color: 0xf97316, emissive: true },
      { color: 0xfde047, emissive: true }, { color: 0x141118 }, { color: 0xef4444, emissive: true },
      { color: 0xfde68a, emissive: true }, { color: 0x8b5a2b }, { color: 0x3f3a45 }, { color: 0x52525b },
    ],
    parts,
    animations: { idle, pulse, ruined, site },
    rates: { idle: 4, pulse: 8, ruined: 1, site: 1 },
    loops: ['idle', 'pulse'],
  };
};

// ── 13. Watchtower (Stone Quarry) — timber tower, iron cab, field cannon, ammo crates ─

const quarry = (): StructureModel => {
  const M = {
    rock: 0, rockLight: 1, rockDark: 2, wood: 3, woodDark: 4, plank: 5, iron: 6, ironLight: 7, ironDark: 8,
    brass: 9, flash: 10, shell: 11, glass: 12, edge: 13, flame: 14,
  };
  const legs: Array<[number, number]> = [[9, 9], [9, 29], [29, 9], [29, 29]];
  const parts: Part[] = [
    {
      name: 'ground', pivot: [25, 25, 0], shapes: [
        ...pad(M.rock, M.edge),
        ell(6, 6, 2, 7, 6, 5, M.rockLight), ell(44, 5, 2, 6, 4, 3.5, M.rockDark), ell(5, 44, 2, 4, 6, 3, M.rockDark),
        ell(40, 20, 2.5, 3, 2, 1.4, M.rockLight), ell(22, 44, 2.5, 2, 3, 1.4, M.rockLight),
      ],
    },
    {
      name: 'tower', pivot: [19, 19, 2], shapes: [
        ...legs.map(([x, y]) => box(x - 1.4, y - 1.4, 2, x + 1.4, y + 1.4, 33, M.wood)),
        ...legs.map(([x, y]) => box(x - 2, y - 2, 2, x + 2, y + 2, 4, M.rockDark)),
        // Cross-braces on both faces the viewer sees, plus a mid rail all round
        ...beam([29.6, 9, 5], [29.6, 29, 30], 0.7, M.woodDark, 14), ...beam([29.6, 29, 5], [29.6, 9, 30], 0.7, M.woodDark, 14),
        ...beam([9, 29.6, 5], [29, 29.6, 30], 0.7, M.woodDark, 14), ...beam([29, 29.6, 5], [9, 29.6, 30], 0.7, M.woodDark, 14),
        box(8, 28.6, 17, 30, 30.4, 18.4, M.wood), box(28.6, 8, 17, 30.4, 30, 18.4, M.wood),
        box(6, 6, 31, 32, 32, 34, M.woodDark),                      // platform
      ],
    },
    {
      name: 'cab', pivot: [19, 19, 34], shapes: [
        box(8, 8, 34, 30, 30, 45, M.iron),
        box(7.6, 7.6, 34, 30.4, 30.4, 36, M.ironDark),
        box(7.6, 7.6, 43, 30.4, 30.4, 45, M.ironLight),
        ...[12, 19, 26].map((y) => box(29.8, y - 0.4, 36, 30.6, y + 0.4, 43, M.ironDark)),   // rivet seams
        ...[12, 19, 26].map((x) => box(x - 0.4, 29.8, 36, x + 0.4, 30.6, 43, M.ironDark)),
        box(29.8, 13, 38, 30.6, 17, 41, M.flame),                  // lamp-lit slit
        // Plank roof with an overhang
        box(5.5, 5.5, 45, 32.5, 32.5, 48, M.plank),
        ...[9, 13, 17, 21, 25, 29].map((x) => box(x, 5.5, 47.6, x + 0.6, 32.5, 48.2, M.woodDark)),
        box(5.5, 5.5, 45, 32.5, 6.5, 48, M.woodDark), box(5.5, 31.5, 45, 32.5, 32.5, 48, M.woodDark),
      ],
    },
    {
      name: 'cannon', pivot: [19, 30, 39], shapes: [
        ell(19, 31, 39, 5.5, 4.5, 5.5, M.ironDark),               // breech
        ell(19, 39, 39.5, 4, 10, 4, M.ironDark),
        ell(19, 47.6, 39.8, 4.8, 1.6, 4.8, M.iron),                // muzzle ring
        ell(19, 48.6, 39.8, 2.6, 0.8, 2.6, M.ironDark),
        ell(19, 35.5, 39.3, 4.4, 1.2, 4.4, M.brass),               // brass bands
        ell(19, 43, 39.6, 4.2, 0.8, 4.2, M.iron),
        box(15, 29, 34.5, 23, 33, 37, M.iron),                     // mount
      ],
    },
    { name: 'flash', parent: 'cannon', pivot: [19, 50, 40], shapes: [ball(19, 50, 40, 3, M.flash), ell(19, 49.6, 40, 4.6, 1, 4.6, M.flame)] },
    {
      name: 'crates', pivot: [40, 40, 2], shapes: [
        // Supply crate (back right)
        box(4, 37, 2, 14, 47, 11, M.plank), box(3.8, 36.8, 6, 14.2, 47.2, 7, M.woodDark),
        box(13.8, 37, 2, 14.4, 47, 11, M.woodDark), box(4, 46.8, 2, 14, 47.4, 11, M.woodDark),
        // Open ammo crate (front) full of shells
        box(36, 34, 2, 47, 46, 7, M.woodDark), box(37, 35, 6.6, 46, 45, 7, M.wood),
        ...[38.5, 41.5, 44.5].flatMap((x) => [36.5, 39.5, 42.5].flatMap((y) => [
          cyl(x, y, 7, 1.1, 2.2, M.shell), ball(x, y, 9.4, 1.1, M.brass),
        ])),
        // Loose shells and bottles
        ell(30, 46, 3.4, 1, 2.6, 1, M.brass), ell(34, 47.5, 3.4, 2.6, 1, 1, M.shell),
        cyl(44, 24, 2.5, 1.1, 4.5, M.glass), cyl(46.5, 27, 2.5, 1.1, 3.8, M.glass), cyl(44, 28.5, 2.5, 1, 4, M.glass),
      ],
    },
    rubblePart(M.rockDark, M.woodDark),
    siteScaffold(M.wood),
  ];
  const body = ['tower', 'cab', 'cannon', 'crates'];
  const { base, ruined, site } = establishmentPoses(parts, body, ['flash']);
  const idle = withBase(base, [
    { cannon: { yaw: -0.12 } }, { cannon: { yaw: -0.04 } }, { cannon: { yaw: 0.06 } }, { cannon: { yaw: 0.12 } },
    { cannon: { yaw: 0.04 } }, { cannon: { yaw: -0.06 } },
  ]);
  const attack = withBase(base, [
    { cannon: { pitch: 0.06 } },
    { cannon: { pitch: 0.1, offset: [0, -2.5, 0] }, flash: { hidden: false } },
    { cannon: { pitch: 0.08, offset: [0, -2, 0] }, flash: { hidden: false, scale: [1.4, 1, 1.4] } },
    { cannon: { pitch: 0.04, offset: [0, -1, 0] } },
    { cannon: { pitch: 0 } },
  ]);
  return establishment(
    [
      { color: 0x6b6b6e }, { color: 0x8e8e92 }, { color: 0x48484c }, { color: 0x8b5a2b }, { color: 0x5c3d22 },
      { color: 0xa0703f }, { color: 0x5b6470 }, { color: 0x8a94a3 }, { color: 0x2b2d33 }, { color: 0xd97706 },
      { color: 0xfde047, emissive: true }, { color: 0xb45309 }, { color: 0x7dd3fc }, { color: 0x3f3f46 },
      { color: 0xf97316, emissive: true },
    ],
    parts, 54, { idle, attack, ruined, site }, { idle: 2, attack: 12 }
  );
};

// ── 11. Ore Furnace (Metal Mine) — brick furnace aflame, molten ore, broken columns ─

const mine = (): StructureModel => {
  const M = {
    rock: 0, rockLight: 1, rockDark: 2, brick: 3, brickLight: 4, brickDark: 5, fire: 6, fireCore: 7, ember: 8,
    smoke: 9, pillar: 10, pillarDark: 11, ore: 12, edge: 13,
  };
  const column = (x: number, y: number, h: number, broken = false): Shape[] => [
    box(x - 3.6, y - 3.6, 2, x + 3.6, y + 3.6, 4.5, M.pillarDark),
    cyl(x, y, 4.5, 2.8, h, M.pillar),
    ...[0, 1, 2].map((k) => box(x + 2.3, y - 0.3 + (k - 1) * 1.6, 5, x + 2.9, y + 0.3 + (k - 1) * 1.6, 4.5 + h, M.pillarDark)),
    ...(broken ? [ell(x + 1, y, 4.5 + h, 2.8, 2.8, 1.4, M.pillarDark)] : [box(x - 3.6, y - 3.6, 4.5 + h, x + 3.6, y + 3.6, 7 + h, M.pillarDark)]),
  ];
  const parts: Part[] = [
    {
      name: 'ground', pivot: [25, 25, 0], shapes: [
        ...pad(M.rockDark, M.edge),
        ell(4, 20, 2, 4, 9, 6, M.rock), ell(20, 3, 2, 9, 4, 6, M.rockLight), ell(4, 4, 2, 6, 6, 8, M.rock),
        ell(45, 6, 2, 4, 4, 2.5, M.rockLight), ell(8, 45, 2, 3, 4, 2.5, M.rock),
      ],
    },
    { name: 'columns', pivot: [10, 10, 2], shapes: [...column(7, 10, 44), ...column(6, 30, 30, true), ...column(24, 6, 36), ...column(16, 4, 14, true)] },
    {
      name: 'furnace', pivot: [34, 34, 2], shapes: [
        box(22, 22, 2, 47, 47, 15, M.brick),
        box(24, 24, 15, 45, 45, 28, M.brick),
        box(23, 23, 28, 46, 46, 31.5, M.brickDark),
        box(21.5, 21.5, 2, 47.5, 47.5, 4, M.brickDark),
        // Mortar courses on the two visible faces
        ...[7, 11, 19, 23].flatMap((z) => {
          const lo = z < 15 ? 22 : 24, hi = z < 15 ? 47 : 45;
          return [box(hi - 0.1, lo, z, hi + 0.5, hi, z + 0.6, M.brickDark), box(lo, hi - 0.1, z, hi, hi + 0.5, z + 0.6, M.brickDark)];
        }),
        ...[27, 33, 39].map((y) => box(46.9, y, 4, 47.5, y + 0.6, 15, M.brickLight)),
        ...[27, 33, 39].map((x) => box(x, 46.9, 4, x + 0.6, 47.5, 15, M.brickLight)),
        // Arched fire-mouth on the right face, glowing
        box(29, 46.5, 2, 39, 47.6, 12, M.brickDark),
        box(30, 46.9, 2, 38, 47.8, 10.5, M.fire),
        ell(34, 47.3, 10.5, 4, 0.5, 2, M.fire),
        box(31.5, 47.2, 2, 36.5, 48, 7, M.fireCore),
      ],
    },
    {
      name: 'ore', pivot: [34, 48, 2], shapes: [
        ell(34, 49, 2.6, 5, 2.2, 1, M.ore), ball(30.5, 49.5, 3, 1.3, M.ember), ball(37.5, 49.8, 3, 1.4, M.ore),
        ball(34, 50, 3.6, 1, M.fireCore), ball(40, 48.5, 2.8, 1.1, M.ember),
      ],
    },
    {
      name: 'fire', pivot: [34.5, 34.5, 31], shapes: [
        ell(34.5, 34.5, 33, 8, 8, 4, M.fire),
        ell(34.5, 34.5, 37, 5.5, 5.5, 6, M.fire),
        ell(34.5, 34.5, 36, 3.5, 3.5, 5, M.fireCore),
        ell(31, 37, 41, 2, 2, 5, M.fire), ell(37.5, 32, 42, 2, 2, 5.5, M.fire), ell(35, 35, 44, 1.6, 1.6, 4, M.fireCore),
      ],
    },
    { name: 'smoke', pivot: [32, 31, 48], shapes: [ball(32, 31, 49, 4, M.smoke), ball(29, 29, 55, 5, M.smoke), ball(27, 27, 61, 3.5, M.smoke)] },
    { name: 'blast', pivot: [34.5, 34.5, 40], shapes: around(8, 9).map(({ c, s }) => ball(34.5 + c, 34.5 + s, 40, 1.4, M.fireCore)) },
    rubblePart(M.brickDark, M.rock),
    siteScaffold(M.pillarDark),
  ];
  const body = ['columns', 'furnace', 'ore', 'fire', 'smoke'];
  const { base, ruined, site } = establishmentPoses(parts, body, ['blast']);
  const ruinedOut: Pose = { ...ruined, ...hide('fire', 'smoke', 'blast') };
  const idle = withBase(base, [
    { fire: { scale: [1, 1, 1] }, smoke: { offset: [0, 0, 0] } },
    { fire: { scale: [1.06, 1.06, 1.15] }, smoke: { offset: [-0.5, -0.5, 1] } },
    { fire: { scale: [0.96, 0.96, 0.95] }, smoke: { offset: [-1, -1, 2] } },
    { fire: { scale: [1.04, 1.04, 1.1] }, smoke: { offset: [-0.5, -0.5, 3] } },
  ]);
  const attack = withBase(base, [
    { fire: { scale: [1.2, 1.2, 1.4] } },
    { fire: { scale: [1.4, 1.4, 1.8] }, blast: { hidden: false, scale: [0.6, 0.6, 1] } },
    { fire: { scale: [1.3, 1.3, 1.6] }, blast: { hidden: false, scale: [1.1, 1.1, 1], offset: [0, 0, 3] } },
    { fire: { scale: [1.1, 1.1, 1.2] }, blast: { hidden: false, scale: [1.5, 1.5, 1], offset: [0, 0, 5] } },
    { fire: { scale: [1, 1, 1] } },
  ]);
  return establishment(
    [
      { color: 0x57534e }, { color: 0x78716c }, { color: 0x3a3633 }, { color: 0x6b6560 }, { color: 0x8a837c },
      { color: 0x45403b }, { color: 0xf97316, emissive: true }, { color: 0xfde047, emissive: true },
      { color: 0xdc2626, emissive: true }, { color: 0x3f3f46 }, { color: 0xb8a58c }, { color: 0x8a7a66 },
      { color: 0xfb923c, emissive: true }, { color: 0x2e2a27 },
    ],
    parts, 66, { idle, attack, ruined: ruinedOut, site }, { idle: 4, attack: 12 }
  );
};

// ── 9. Tree of Life (Wood Grove) — giant twisting tree, glowing heart, bright canopy ─

const grove = (): StructureModel => {
  const M = { moss: 0, bark: 1, barkDark: 2, barkLight: 3, leaf: 4, leafLight: 5, leafDeep: 6, glow: 7, glowCore: 8, edge: 9, grass: 10, fern: 11 };
  const C = 25.5;
  const roots = around(7, 1, 0.3).map(({ c, s }) => chain(
    [[C + c * 6, C + s * 6, 8], [C + c * 12, C + s * 12, 4], [C + c * 18, C + s * 18, 2.6], [C + c * 23, C + s * 22, 2.4]],
    3.4, 1.2, c + s > 0.4 ? M.barkLight : M.bark
  )).flat();
  const parts: Part[] = [
    {
      name: 'ground', pivot: [25, 25, 0], shapes: [
        ...pad(M.moss, M.edge),
        ...[[6, 40], [40, 6], [44, 44], [4, 14], [14, 4], [46, 30], [30, 46]].map(([x, y]) => ell(x, y, 3, 2.6, 2.6, 2, M.fern)),
        ...[[10, 46], [46, 12], [36, 47], [47, 38]].map(([x, y]) => ell(x, y, 3, 1.6, 1.6, 2.6, M.grass)),
      ],
    },
    { name: 'roots', pivot: [C, C, 2], shapes: roots },
    {
      name: 'trunk', pivot: [C, C, 2], shapes: [
        cyl(C, C, 2, 8.5, 8, M.bark),
        cyl(C, C, 10, 7, 12, M.bark),
        ell(C, C, 26, 7.5, 7.5, 6, M.bark),
        // Twisting bark ridges
        ...chain([[C + 7, C - 3, 3], [C + 6, C + 2, 12], [C + 3, C + 6, 22], [C - 2, C + 6, 30]], 1.6, 1.2, M.barkDark),
        ...chain([[C - 3, C + 7.5, 3], [C + 3, C + 6.5, 12], [C + 6.5, C + 2, 22], [C + 6, C - 3, 30]], 1.6, 1.2, M.barkLight),
        // Boughs reaching up into the canopy
        ...chain([[C, C, 26], [C - 7, C - 5, 34], [C - 12, C - 8, 40]], 3, 2, M.bark),
        ...chain([[C, C, 26], [C + 8, C + 4, 33], [C + 12, C + 8, 40]], 3, 2, M.bark),
        ...chain([[C, C, 26], [C - 4, C + 9, 34], [C - 6, C + 13, 40]], 3, 2, M.barkDark),
        ...chain([[C, C, 26], [C + 5, C - 8, 34], [C + 8, C - 12, 41]], 3, 2, M.barkDark),
      ],
    },
    {
      name: 'heart', parent: 'trunk', pivot: [C + 6, C + 6, 18], shapes: [
        ell(C + 5.6, C + 5.6, 18, 2.6, 2.6, 3.6, M.glow),
        ball(C + 6.2, C + 6.2, 18, 1.4, M.glowCore),
      ],
    },
    {
      name: 'canopy', parent: 'trunk', pivot: [C, C, 40], shapes: [
        ell(C, C, 48, 15, 15, 9, M.leafDeep),
        ell(12, 16, 44, 9, 9, 7.5, M.leaf), ell(37, 33, 43, 9.5, 9.5, 7.5, M.leaf),
        ell(16, 37, 44, 9, 9, 7, M.leaf), ell(36, 14, 45, 9, 9, 7.5, M.leaf),
        ell(27, 29, 54, 10, 10, 7, M.leaf), ell(18, 22, 55, 8, 8, 6, M.leaf), ell(32, 20, 55, 7, 7, 5.5, M.leaf),
        // Sunlit tops
        ell(38, 35, 48, 6, 6, 3.5, M.leafLight), ell(17, 39, 49, 5.5, 5.5, 3, M.leafLight),
        ell(28, 31, 59, 6.5, 6.5, 3.5, M.leafLight), ell(13, 17, 49, 5, 5, 3, M.leafLight),
        ell(37, 15, 50, 5, 5, 3, M.leafLight), ell(20, 23, 59, 4.5, 4.5, 2.5, M.leafLight),
        ...[[40, 38, 46], [24, 43, 46], [43, 24, 47], [33, 36, 56]].map(([x, y, z]) => ball(x, y, z, 1.2, M.glow)),
      ],
    },
    {
      name: 'sprouts', pivot: [C, C, 2.5], shapes: around(6, 17, 0.5).flatMap(({ c, s }) => [
        box(C + c - 0.5, C + s - 0.5, 2.5, C + c + 0.5, C + s + 0.5, 7, M.barkDark),
        ell(C + c - 1.6, C + s, 7.5, 2, 1.2, 0.9, M.leafLight),
        ell(C + c + 1.6, C + s, 7.8, 2, 1.2, 0.9, M.glow),
      ]),
    },
    rubblePart(M.barkDark, M.bark),
    siteScaffold(M.barkLight),
  ];
  const body = ['roots', 'trunk', 'heart', 'canopy'];
  const { base, ruined, site } = establishmentPoses(parts, body, ['sprouts']);
  const idle = withBase(base, [
    { canopy: { roll: 0.025 }, heart: { scale: [1, 1, 1] } },
    { canopy: { roll: 0.01, offset: [0, 0, -0.4] }, heart: { scale: [1.15, 1.15, 1.15] } },
    { canopy: { roll: -0.02 }, heart: { scale: [1.25, 1.25, 1.25] } },
    { canopy: { roll: 0, offset: [0, 0, 0.3] }, heart: { scale: [1.1, 1.1, 1.1] } },
  ]);
  const attack = withBase(base, [
    { canopy: { roll: 0.05, scale: [1.03, 1.03, 1.03] }, heart: { scale: [1.5, 1.5, 1.5] }, sprouts: { hidden: false, scale: [1, 1, 0.3] } },
    { canopy: { roll: -0.05, scale: [1.06, 1.06, 1.06] }, heart: { scale: [1.8, 1.8, 1.8] }, sprouts: { hidden: false, scale: [1, 1, 0.7] } },
    { canopy: { roll: 0.03, scale: [1.03, 1.03, 1.03] }, heart: { scale: [1.5, 1.5, 1.5] }, sprouts: { hidden: false, scale: [1, 1, 1.1] } },
    { canopy: { roll: 0 }, sprouts: { hidden: false, scale: [1, 1, 0.8] } },
  ]);
  return establishment(
    [
      { color: 0x2f5d2a }, { color: 0x6b4a2b }, { color: 0x4a3220 }, { color: 0x8a6340 }, { color: 0x22a34a },
      { color: 0x7ee787 }, { color: 0x15803d }, { color: 0x86efac, emissive: true }, { color: 0xf0fdf4, emissive: true },
      { color: 0x1f3a1c }, { color: 0x4d8a3a }, { color: 0x166534 },
    ],
    parts, 66, { idle, attack, ruined, site }, { idle: 2, attack: 8 }
  );
};

// ── 10. Wellspring (Water Port) — tiered fountain in a lily pool on a tiled plaza ─

const port = (): StructureModel => {
  const M = { tile: 0, tileDark: 1, stone: 2, stoneDark: 3, water: 4, waterLight: 5, waterDeep: 6, spray: 7, lily: 8, flower: 9, hedge: 10, edge: 11, flowerY: 12 };
  const C = 27;
  const parts: Part[] = [
    {
      name: 'ground', pivot: [25, 25, 0], shapes: [
        box(0.5, 0.5, 0, 50.5, 50.5, 3, M.tile),
        ...[6, 12, 18, 24, 30, 36, 42, 48].flatMap((t) => [box(t, 0.5, 2.9, t + 0.5, 50.5, 3.1, M.tileDark), box(0.5, t, 2.9, 50.5, t + 0.5, 3.1, M.tileDark)]),
        box(0.5, 49, 0, 50.5, 50.5, 3.2, M.edge), box(49, 0.5, 0, 50.5, 50.5, 3.2, M.edge),
        // Flower hedges along the back edges
        box(0.5, 0.5, 3, 4.5, 50, 7, M.hedge), box(0.5, 0.5, 3, 50, 4.5, 7, M.hedge),
        ...[6, 14, 22, 30, 38, 46].flatMap((t, i) => [
          ball(3, t, 7.4, 1.2, i % 2 ? M.flower : M.flowerY), ball(t, 3, 7.4, 1.2, i % 2 ? M.flowerY : M.flower),
        ]),
      ],
    },
    {
      name: 'pool', pivot: [C, C, 3], shapes: [
        box(8, 8, 3, 47, 47, 5.5, M.stone),
        box(10, 10, 3, 45, 45, 5.2, M.waterDeep),
        box(10.5, 10.5, 5, 44.5, 44.5, 5.3, M.water),
        ...[[14, 40], [40, 14], [42, 36], [36, 43], [13, 22], [22, 13]].flatMap(([x, y], i) => [
          ell(x, y, 5.4, 2.4, 2.4, 0.4, M.lily), ...(i % 2 ? [ball(x + 0.6, y + 0.6, 6, 0.9, M.flower)] : []),
        ]),
      ],
    },
    {
      name: 'fountain', pivot: [C, C, 5], shapes: [
        cyl(C, C, 5, 12.5, 3.4, M.stone),
        cyl(C, C, 5, 13, 1, M.stoneDark),
        cyl(C, C, 7.6, 11, 0.9, M.water),
        cyl(C, C, 8.4, 3.2, 9.5, M.stoneDark),
        cyl(C, C, 8.4, 2.6, 9.5, M.stone),
        cyl(C, C, 17.5, 7.5, 2.4, M.stone),
        cyl(C, C, 19.2, 6.3, 0.8, M.water),
        cyl(C, C, 19.8, 1.9, 6, M.stone),
        cyl(C, C, 25.6, 3.8, 1.6, M.stone),
        cyl(C, C, 26.7, 3, 0.6, M.water),
      ],
    },
    {
      name: 'streams', parent: 'fountain', pivot: [C, C, 8], shapes: [
        ...around(6, 7.6, 0.4).map(({ c, s }) => box(C + c - 0.6, C + s - 0.6, 8.5, C + c + 0.6, C + s + 0.6, 19, M.waterLight)),
        ...around(8, 12.8, 0.2).map(({ c, s }) => box(C + c - 0.5, C + s - 0.5, 5.2, C + c + 0.5, C + s + 0.5, 8.4, M.waterLight)),
        ...around(4, 3.9).map(({ c, s }) => box(C + c - 0.4, C + s - 0.4, 20, C + c + 0.4, C + s + 0.4, 26.5, M.waterLight)),
      ],
    },
    { name: 'jet', parent: 'fountain', pivot: [C, C, 27], shapes: [cyl(C, C, 27, 1, 6, M.spray), ball(C, C, 33.5, 1.8, M.spray)] },
    { name: 'surge', pivot: [C, C, 34], shapes: around(10, 6).map(({ c, s }) => ball(C + c, C + s, 34, 1.2, M.spray)) },
    rubblePart(M.stoneDark, M.stone),
    siteScaffold(M.stoneDark),
  ];
  const body = ['pool', 'fountain', 'streams', 'jet'];
  const { base, ruined, site } = establishmentPoses(parts, body, ['surge']);
  const ruinedDry: Pose = { ...ruined, ...hide('streams', 'jet', 'surge') };
  const idle = withBase(base, [
    { jet: { scale: [1, 1, 1] }, streams: { offset: [0, 0, 0] } },
    { jet: { scale: [1, 1, 1.25] }, streams: { offset: [0, 0, -0.4] } },
    { jet: { scale: [1, 1, 1.4] }, streams: { offset: [0, 0, 0] } },
    { jet: { scale: [1, 1, 1.15] }, streams: { offset: [0, 0, -0.4] } },
  ]);
  const attack = withBase(base, [
    { jet: { scale: [1.3, 1.3, 2] } },
    { jet: { scale: [1.6, 1.6, 3] }, surge: { hidden: false, scale: [0.6, 0.6, 1] } },
    { jet: { scale: [1.4, 1.4, 2.6] }, surge: { hidden: false, scale: [1.2, 1.2, 1], offset: [0, 0, 6] } },
    { jet: { scale: [1.1, 1.1, 1.6] }, surge: { hidden: false, scale: [1.7, 1.7, 1], offset: [0, 0, 4] } },
  ]);
  return establishment(
    [
      { color: 0xd6d3d1 }, { color: 0xa8a29e }, { color: 0xe7e5e4 }, { color: 0x9ca3af }, { color: 0x38bdf8 },
      { color: 0xbae6fd, emissive: true }, { color: 0x0369a1 }, { color: 0xf0f9ff, emissive: true }, { color: 0x16a34a },
      { color: 0xf472b6 }, { color: 0x15803d }, { color: 0x78716c }, { color: 0xfacc15 },
    ],
    parts, 44, { idle, attack, ruined: ruinedDry, site }, { idle: 4, attack: 9 }
  );
};

// ── 14. Magma Cavern (Mystic Cave) — erupting volcano cone with lava rivers ───

const cave = (): StructureModel => {
  const M = { rock: 0, rockLight: 1, rockDark: 2, lava: 3, lavaCore: 4, lavaDeep: 5, fire: 6, soot: 7, edge: 8 };
  const C = 25.5;
  const river = (dx: number, dy: number, wiggle: number): Shape[] => {
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const r = 6.5 + 16.5 * t;
      const w = Math.sin(t * 7) * wiggle;
      pts.push([C + dx * r - dy * w, C + dy * r + dx * w, 33 - 30 * t + 1.4]);
    }
    return [...chain(pts, 0.9, 1.2, M.lava, 4), ...chain(pts.slice(0, 3), 0.5, 0.6, M.lavaCore, 4)];
  };
  const parts: Part[] = [
    {
      name: 'ground', pivot: [25, 25, 0], shapes: [
        ...pad(M.rockDark, M.edge),
        ell(46, 40, 2.4, 4, 6, 0.6, M.lava), ell(40, 46, 2.4, 6, 4, 0.6, M.lava), ell(46, 46, 2.6, 3, 3, 0.6, M.lavaCore),
      ],
    },
    {
      name: 'volcano', pivot: [C, C, 2], shapes: [
        ...cone(C, C, 2, 23, 33, M.rock, M.rock, 14),
        // Craggy ridges
        ell(8, 30, 6, 5, 6, 6, M.rockLight), ell(30, 8, 6, 6, 5, 6, M.rockLight), ell(14, 14, 12, 6, 6, 9, M.rockLight),
        ell(38, 18, 8, 4, 5, 7, M.rockDark), ell(18, 38, 8, 5, 4, 7, M.rockDark),
        cyl(C, C, 31, 7, 3, M.rockDark),
        cyl(C, C, 33.5, 5, 1, M.lavaDeep),
        cyl(C, C, 34, 4.2, 0.8, M.lavaCore),
      ],
    },
    { name: 'rivers', parent: 'volcano', pivot: [C, C, 2], shapes: [...river(1, 0, 1.5), ...river(0, 1, -1.5), ...river(0.72, 0.72, 2), ...river(0.95, -0.3, 1)] },
    {
      name: 'fires', pivot: [C, C, 2], shapes: [
        ell(7, 44, 5, 2.6, 2.6, 4, M.fire), ell(7, 44, 4.5, 1.4, 1.4, 2.5, M.lavaCore),
        ell(44, 7, 5, 2.6, 2.6, 4, M.fire), ell(44, 7, 4.5, 1.4, 1.4, 2.5, M.lavaCore),
      ],
    },
    {
      name: 'plume', pivot: [C, C, 35], shapes: [
        ell(C, C, 38, 4.5, 4.5, 5, M.fire), ell(C, C, 38, 2.8, 2.8, 4, M.lavaCore),
        ell(C - 2, C + 1.5, 42, 1.8, 1.8, 3.5, M.fire), ell(C + 1.5, C - 2, 43, 1.6, 1.6, 3.5, M.fire),
      ],
    },
    {
      name: 'bombs', parent: 'plume', pivot: [C, C, 40], shapes: [
        ...around(6, 7).map(({ c, s }, i) => ball(C + c, C + s, 44 + (i % 3) * 3, 1.5, i % 2 ? M.lava : M.lavaCore)),
        ball(C, C, 52, 3, M.soot), ball(C - 2, C - 2, 57, 3.5, M.soot),
      ],
    },
    rubblePart(M.rockDark, M.rock),
    siteScaffold(M.rockLight),
  ];
  const body = ['volcano', 'rivers', 'plume', 'fires'];
  const { base, ruined, site } = establishmentPoses(parts, body, ['bombs']);
  const ruinedCold: Pose = { ...ruined, ...hide('plume', 'bombs', 'fires') };
  const idle = withBase(base, [
    { plume: { scale: [1, 1, 1] }, fires: { scale: [1, 1, 1] } },
    { plume: { scale: [1.1, 1.1, 1.2] }, fires: { scale: [1, 1, 1.15] } },
    { plume: { scale: [0.95, 0.95, 0.9] }, fires: { scale: [1, 1, 0.9] } },
    { plume: { scale: [1.05, 1.05, 1.1] }, fires: { scale: [1, 1, 1.05] } },
  ]);
  const attack = withBase(base, [
    { plume: { scale: [1.3, 1.3, 1.6] } },
    { plume: { scale: [1.6, 1.6, 2.2] }, bombs: { hidden: false, scale: [0.6, 0.6, 0.6] } },
    { plume: { scale: [1.5, 1.5, 2] }, bombs: { hidden: false, scale: [1, 1, 1] } },
    { plume: { scale: [1.2, 1.2, 1.4] }, bombs: { hidden: false, scale: [1.3, 1.3, 1.2] } },
  ]);
  return establishment(
    [
      { color: 0x2f2a28 }, { color: 0x48423f }, { color: 0x1c1917 }, { color: 0xf97316, emissive: true },
      { color: 0xfde047, emissive: true }, { color: 0xdc2626, emissive: true }, { color: 0xfb923c, emissive: true },
      { color: 0x3f3f46 }, { color: 0x1a1210 },
    ],
    parts, 62, { idle, attack, ruined: ruinedCold, site }, { idle: 4, attack: 10 }, true
  );
};

// ── 12. Aether Spire (Crystal Spire) — great crystal on a rune-lit stone dais ──

const spire = (): StructureModel => {
  const M = { stone: 0, stoneLight: 1, stoneDark: 2, rune: 3, crystal: 4, crystalLight: 5, core: 6, deep: 7, wood: 8, arc: 9, edge: 10 };
  const C = 25.5;
  const crystal = (name: string, x: number, y: number, half: number, h: number, mat: number, parent = 'dais'): Part => ({
    name, parent, pivot: [x, y, 7], shapes: [
      box(x - half, y - half, 7, x + half, y + half, 7 + h, mat),
      box(x - half * 0.35, y + half * 0.6, 8, x + half * 0.35, y + half + 0.2, 6 + h, M.crystalLight),
      box(x + half * 0.6, y - half * 0.35, 8, x + half + 0.2, y + half * 0.35, 6 + h, M.crystalLight),
      ...pyramid(x, y, 7 + h, half, half * 2.2, mat, 5),
      ell(x, y, 7 + h * 0.6, half * 0.4, half * 0.4, h * 0.3, M.core),
    ],
  });
  const floater = (i: number, x: number, y: number, z: number, s: number): Shape[] => [
    ...pyramid(x, y, z, s, s * 2.4, i % 2 ? M.crystal : M.crystalLight, 4),
    ...pyramid(x, y, z, s, -s * 1.6, i % 2 ? M.crystalLight : M.crystal, 3),
  ];
  const parts: Part[] = [
    {
      name: 'dais', pivot: [C, C, 0], shapes: [
        box(2, 2, 0, 49, 49, 2.5, M.stoneDark),
        box(5, 5, 2.5, 46, 46, 5, M.stone),
        box(9, 9, 5, 42, 42, 7, M.stoneLight),
        // Rune grooves glowing cyan round each tier
        box(5.5, 45.4, 3, 45.5, 46.2, 4.4, M.rune), box(45.4, 5.5, 3, 46.2, 45.5, 4.4, M.rune),
        box(10, 40, 6.9, 41, 41, 7.2, M.rune), box(40, 10, 6.9, 41, 41, 7.2, M.rune),
        box(10, 10, 6.9, 11, 41, 7.2, M.rune), box(10, 10, 6.9, 41, 11, 7.2, M.rune),
        ...[[48.6, 12], [48.6, 38], [12, 48.6], [38, 48.6]].map(([x, y]) => box(x - 0.6, y - 1.5, 0.6, x + 0.6, y + 1.5, 1.8, M.rune)),
        box(1.5, 48.5, 0, 49.5, 49.5, 2.8, M.edge), box(48.5, 1.5, 0, 49.5, 49.5, 2.8, M.edge),
      ],
    },
    crystal('main', C, C, 5, 34, M.crystal),
    crystal('left', 32, 19, 2.8, 14, M.crystalLight),
    crystal('right', 19, 32, 3, 16, M.crystal),
    crystal('front', 33, 33, 2.4, 10, M.crystalLight),
    crystal('back', 18, 18, 2.6, 18, M.deep),
    {
      name: 'float', pivot: [C, C, 40], shapes: [
        ...floater(0, 9, 19, 36, 1.6), ...floater(1, 41, 25, 44, 1.4), ...floater(2, 21, 42, 30, 1.5),
        ...floater(3, 39, 40, 24, 1.2), ...floater(4, 13, 36, 48, 1.2), ...floater(5, 34, 10, 52, 1.3),
      ],
    },
    { name: 'surge', pivot: [C, C, 52], shapes: around(12, 8).map(({ c, s }) => ball(C + c, C + s, 52, 1.1, M.arc)) },
    rubblePart(M.stoneDark, M.deep),
    siteScaffold(M.wood),
  ];
  const body = ['main', 'left', 'right', 'front', 'back'];
  const { base, site } = establishmentPoses(parts, [...body, 'float'], ['surge']);
  const tilt: Pose = {
    ...base,
    left: { roll: 0.35, pitch: -0.2 }, right: { roll: -0.3, pitch: 0.25 }, front: { roll: 0.3, pitch: 0.35 },
    back: { roll: -0.25, pitch: -0.3 }, main: { yaw: Math.PI / 4 },
  };
  const idle = withBase(tilt, [
    { float: { yaw: 0, offset: [0, 0, 0] } },
    { float: { yaw: Math.PI / 12, offset: [0, 0, 1] } },
    { float: { yaw: Math.PI / 6, offset: [0, 0, 1.6] } },
    { float: { yaw: Math.PI / 4, offset: [0, 0, 1] } },
  ]);
  const attack = withBase(tilt, [
    { main: { yaw: Math.PI / 4, scale: [1.1, 1.1, 1.04] }, float: { yaw: 0.3, offset: [0, 0, 2] }, surge: { hidden: false, scale: [0.5, 0.5, 1] } },
    { main: { yaw: Math.PI / 4, scale: [1.25, 1.25, 1.08] }, float: { yaw: 0.6, offset: [0, 0, 3] }, surge: { hidden: false, yaw: 0.4 } },
    { main: { yaw: Math.PI / 4, scale: [1.15, 1.15, 1.05] }, float: { yaw: 0.9, offset: [0, 0, 2] }, surge: { hidden: false, yaw: 0.8, scale: [1.5, 1.5, 1] } },
    { main: { yaw: Math.PI / 4, scale: [1.02, 1.02, 1] }, float: { yaw: 1.1, offset: [0, 0, 1] } },
  ]);
  const ruined: Pose = {
    ...hide('scaffold', 'surge', 'float'),
    main: { yaw: Math.PI / 4, roll: 0.55, pitch: 0.2, scale: [1, 1, 0.45] },
    left: { roll: 1.1, pitch: -0.3, scale: [1, 1, 0.6] },
    right: { roll: -0.9, pitch: 0.5, scale: [1, 1, 0.55] },
    front: { roll: 0.8, pitch: 0.9, scale: [1, 1, 0.6] },
    back: { roll: -0.7, pitch: -0.8, scale: [1, 1, 0.5] },
  };
  // The crystals grow out of the dais, so the site squashes them instead of hiding them
  const siteLow: Pose = { ...site, ...Object.fromEntries(body.map((n) => [n, { scale: [1, 1, 0.25] as [number, number, number] }])) };
  return establishment(
    [
      { color: 0x334155 }, { color: 0x475569 }, { color: 0x1e293b }, { color: 0x22d3ee, emissive: true },
      { color: 0x22d3ee }, { color: 0xa5f3fc }, { color: 0xecfeff, emissive: true }, { color: 0x0891b2 },
      { color: 0x6f4e2e }, { color: 0xecfeff, emissive: true }, { color: 0x0f172a },
    ],
    parts, 60, { idle, attack, ruined, site: siteLow }, { idle: 3, attack: 9 }
  );
};

// ── 2. Invasion Rift Portal — gothic stone arch round a pink-blue spiral rift ──

const portal = (): StructureModel => {
  const M = { stone: 0, stoneDark: 1, stoneLight: 2, rune: 3, mid: 4, light: 5, core: 6, arm: 7, ember: 8, floor: 9 };
  const C = 17;   // model centre
  const RZ = 22;  // rift centre height
  // Pointed arch: two arcs whose centres sit either side of the middle
  const arch = (from: number, to: number) => {
    const out: Shape[] = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * (Math.PI / 2);
        const x = C + side * (15 * Math.cos(a) - 4);
        const z = 14 + 17 * Math.sin(a);
        if (z < from || z >= to || Math.abs(x - C) < 0.5) continue;
        out.push(box(x - 2, C - 2, z - 2, x + 2, C + 2, z + 2, i % 3 === 0 ? M.stoneLight : M.stone));
      }
    }
    return out;
  };
  const parts: Part[] = [
    { name: 'frame', pivot: [C, C, 0], shapes: [] },
    {
      name: 'plinth', parent: 'frame', pivot: [C, C, 0], shapes: [
        cyl(C, C, 0, 16, 1.6, M.floor),
        ...around(10, 12, 0.3).map(({ c, s }) => box(C + c - 1.2, C + s - 1.2, 1.5, C + c + 1.2, C + s + 1.2, 1.9, M.stoneDark)),
        box(2, 13.5, 0, 8, 20.5, 16, M.stone), box(26, 13.5, 0, 32, 20.5, 16, M.stone),
        box(1.5, 13, 0, 8.5, 21, 3, M.stoneDark), box(25.5, 13, 0, 32.5, 21, 3, M.stoneDark),
        box(4.4, 20.4, 4, 5.6, 21, 14, M.rune), box(28.4, 20.4, 4, 29.6, 21, 14, M.rune),
        // Broken outer arch stubs either side
        box(0, 4, 0, 3, 8, 9, M.stoneDark), box(31, 26, 0, 33.5, 30, 6, M.stoneDark),
      ],
    },
    { name: 'ringLow', parent: 'frame', pivot: [C, C, RZ], shapes: arch(0, 24) },
    {
      name: 'ringTop', parent: 'frame', pivot: [C, C, RZ], shapes: [
        ...arch(24, 40),
        box(C - 2.2, C - 2.2, 29, C + 2.2, C + 2.2, 34, M.stoneLight),          // keystone
        ell(C, C + 2.2, 31.5, 1.2, 0.5, 1.4, M.rune),
      ],
    },
    {
      name: 'vortex', parent: 'frame', pivot: [C, C, RZ], shapes: [
        ell(C, C, RZ, 9.6, 1.1, 10.5, M.mid),
        ell(C, C + 0.3, RZ, 6.6, 1.3, 7.4, M.light),
        ell(C, C + 0.5, RZ, 2.8, 1.6, 3, M.core),
        ...[0, 1, 2].flatMap((k) => Array.from({ length: 6 }, (_, i) => {
          const r = 3.2 + i * 1.3;
          const a = (k * 2 * Math.PI) / 3 + i * 0.55;
          return ell(C + Math.cos(a) * r, C + 0.7, RZ + Math.sin(a) * r * 1.08, 1.2, 1.2, 1.2, i % 2 ? M.arm : M.light);
        })),
      ],
    },
    {
      name: 'flare', parent: 'frame', pivot: [C, C, RZ], shapes: [
        ell(C, C + 1, RZ, 11.5, 0.8, 12.5, M.light),
        ...around(8, 1).map(({ a }) => ell(C + Math.cos(a) * 13, C + 1, RZ + Math.sin(a) * 14, 1.6, 1, 1.6, M.core)),
      ],
    },
    { name: 'ember', parent: 'frame', pivot: [C, C, RZ], shapes: [ball(C, C + 0.5, RZ, 2.2, M.ember), ell(C, C, RZ, 5, 0.6, 5.5, M.stoneDark)] },
  ];
  const turn = { frame: { yaw: -Math.PI / 4 } } as Pose;
  const base: Pose = { ...turn, flare: { hidden: true }, ember: { hidden: true } };
  const step = (2 * Math.PI) / 3 / 6;
  const idle = withBase(base, Array.from({ length: 6 }, (_, i) => ({ vortex: { roll: -i * step } })));
  const spawn = withBase(base, [
    { vortex: { roll: 0, scale: [1.12, 1, 1.12] }, flare: { hidden: false, scale: [0.7, 1, 0.7] } },
    { vortex: { roll: -step, scale: [1.24, 1, 1.24] }, flare: { hidden: false } },
    { vortex: { roll: -2 * step, scale: [1.16, 1, 1.16] }, flare: { hidden: false, scale: [1.1, 1, 1.1] } },
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
    ringLow: { roll: 0.2, offset: [0, 0, -3] },
  } as Pose];
  return {
    size: [34, 34, 42], foot: [17, 17, 0],
    materials: [
      { color: 0x6b6475 }, { color: 0x45404f }, { color: 0x857d91 }, { color: 0xd946ef, emissive: true },
      { color: 0x7c3aed, emissive: true }, { color: 0xec4899, emissive: true }, { color: 0xffffff, emissive: true },
      { color: 0x60a5fa, emissive: true }, { color: 0xf0abfc, emissive: true }, { color: 0x57534e },
    ],
    parts,
    animations: { dormant, idle, spawn, absorb, destroyed },
    rates: { dormant: 2, idle: 10, spawn: 10, absorb: 10, destroyed: 1 },
    loops: ['dormant', 'idle'],
  };
};

// ── 3. Deepwater Basin (Abyssal Trench) — kraken rising from a coral pool ─────

const trench = (): StructureModel => {
  const M = {
    rock: 0, rockLight: 1, rockDark: 2, water: 3, waterLight: 4, waterDeep: 5, octo: 6, octoLight: 7, octoDark: 8,
    eye: 9, coral: 10, coralPink: 11, weed: 12, weedLight: 13, edge: 14, sucker: 15,
  };
  const H = [24, 24];
  const tentacle = (name: string, ang: number, reach: number, height: number): Part => {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i <= 7; i++) {
      const t = i / 7;
      const r = 6 + reach * Math.sin(t * Math.PI * 0.55);
      const z = 5 + height * Math.sin(t * Math.PI * 0.85);
      pts.push([H[0] + dx * r, H[1] + dy * r, z]);
    }
    // Curl the tip back inward
    const tip = pts[pts.length - 1];
    pts.push([tip[0] - dx * 3, tip[1] - dy * 3, tip[2] - 2]);
    return { name, pivot: [H[0] + dx * 6, H[1] + dy * 6, 5], shapes: [...chain(pts, 2.6, 0.9, M.octo, 3), ...chain(pts.slice(0, 6).map(([x, y, z]) => [x + 1.2, y + 1.2, z - 0.8]), 0.9, 0.6, M.sucker, 2)] };
  };
  const parts: Part[] = [
    {
      name: 'ground', pivot: [25, 25, 0], shapes: [
        box(1, 1, 0, 50, 50, 3, M.rockDark),
        box(4, 4, 0, 47, 47, 4.2, M.waterDeep),
        box(5, 5, 4, 46, 46, 4.6, M.water),
        ...[[14, 40], [38, 16], [30, 42], [42, 32]].map(([x, y]) => box(x - 3, y - 0.4, 4.5, x + 3, y + 0.4, 4.8, M.waterLight)),
        // Rocky rim
        ...[[2, 10, 4], [2, 26, 5], [2, 42, 4], [10, 2, 4], [26, 2, 5], [42, 2, 4], [48, 14, 3], [48, 34, 3], [14, 48, 3], [34, 48, 3], [3, 3, 5]]
          .map(([x, y, r], i) => ell(x, y, 3, r, r, r * 0.9, i % 2 ? M.rock : M.rockLight)),
        box(0.5, 49, 0, 50.5, 50.5, 3.2, M.edge), box(49, 0.5, 0, 50.5, 50.5, 3.2, M.edge),
      ],
    },
    {
      name: 'reef', pivot: [10, 10, 3], shapes: [
        // Coral fans and seaweed on the far rocks
        ...chain([[6, 16, 6], [5, 15, 12], [7, 17, 17]], 1.2, 0.8, M.coral, 2), ...chain([[5, 15, 12], [3, 13, 15]], 0.9, 0.7, M.coral, 2),
        ...chain([[16, 5, 6], [15, 4, 11], [17, 6, 15]], 1.2, 0.8, M.coralPink, 2),
        ...chain([[40, 6, 4], [41, 5, 9], [40, 6, 13]], 1, 0.7, M.coral, 2),
        ...chain([[6, 38, 4], [5, 39, 9]], 1, 0.7, M.coralPink, 2),
        ...[[10, 30], [30, 8], [44, 10], [8, 44], [46, 26], [26, 46]].flatMap(([x, y], i) => [
          box(x - 0.5, y - 0.5, 4, x + 0.5, y + 0.5, 11 + (i % 3) * 3, i % 2 ? M.weed : M.weedLight),
          box(x + 0.4, y - 0.4, 7, x + 1.4, y + 0.4, 12 + (i % 3) * 3, M.weed),
        ]),
      ],
    },
    {
      name: 'head', pivot: [H[0], H[1], 5], shapes: [
        ell(H[0], H[1], 12, 8, 8, 9, M.octo),
        ell(H[0] - 1.5, H[1] - 1.5, 17, 5.5, 5.5, 5, M.octoLight),
        ell(H[0], H[1], 5, 9, 9, 2.5, M.octoDark),
        // Glowing eyes on the corner facing the viewer
        ell(H[0] + 6.8, H[1] + 2, 11, 1, 2, 1.6, M.eye), ell(H[0] + 2, H[1] + 6.8, 11, 2, 1, 1.6, M.eye),
        ell(H[0] + 7.4, H[1] + 2, 11, 0.4, 0.9, 1.2, M.octoDark), ell(H[0] + 2, H[1] + 7.4, 11, 0.9, 0.4, 1.2, M.octoDark),
      ],
    },
    tentacle('t1', Math.PI * 1.25, 10, 30),
    tentacle('t2', Math.PI * 0.75, 13, 22),
    tentacle('t3', Math.PI * 1.75, 13, 22),
    tentacle('t4', Math.PI * 0.25, 14, 10),
    { name: 'splash', pivot: [34, 34, 5], shapes: around(10, 10, 0.2).map(({ c, s }) => ball(30 + c, 30 + s, 6, 1.2, M.waterLight)) },
    rubblePart(M.rockDark, M.coral),
    siteScaffold(M.rockLight),
  ];
  const body = ['reef', 'head', 't1', 't2', 't3', 't4'];
  const { base, ruined, site } = establishmentPoses(parts, body, ['splash']);
  const sunk: Pose = { ...ruined, ...hide('t1', 't2', 't3', 't4', 'splash'), head: { scale: [1, 1, 0.4], offset: [0, 0, -3] } };
  const sway = (a: number): Pose => ({ t1: { roll: a * 0.12 }, t2: { pitch: a * 0.1 }, t3: { pitch: -a * 0.1 }, t4: { roll: -a * 0.12 }, head: { offset: [0, 0, a * 0.5] } });
  const idle = withBase(base, [sway(1), sway(0.4), sway(-0.6), sway(-1), sway(-0.3), sway(0.5)]);
  const attack = withBase(base, [
    { t4: { roll: -0.3, pitch: -0.2 }, t2: { pitch: -0.25 }, t3: { pitch: 0.25 } },
    { t4: { roll: 0.35, pitch: 0.3 }, t2: { pitch: 0.35 }, t3: { pitch: -0.35 }, splash: { hidden: false, scale: [0.6, 0.6, 1] } },
    { t4: { roll: 0.25, pitch: 0.2 }, t2: { pitch: 0.25 }, t3: { pitch: -0.25 }, splash: { hidden: false, scale: [1.2, 1.2, 1] } },
    { t4: { roll: 0 }, splash: { hidden: false, scale: [1.6, 1.6, 1], offset: [0, 0, 1] } },
  ]);
  return establishment(
    [
      { color: 0x334155 }, { color: 0x475569 }, { color: 0x1e293b }, { color: 0x1d4ed8 }, { color: 0x60a5fa, emissive: true },
      { color: 0x1e3a8a }, { color: 0x4c3a6b }, { color: 0x6b5a8e }, { color: 0x2e2347 }, { color: 0x67e8f9, emissive: true },
      { color: 0xc026d3 }, { color: 0xf472b6 }, { color: 0x16a34a }, { color: 0x4ade80 }, { color: 0x0f172a },
      { color: 0xa78bfa },
    ],
    parts, 44, { idle, attack, ruined: sunk, site }, { idle: 3, attack: 9 }
  );
};

// ── 4. Bone Mausoleum (Crypt of Souls) — gabled tomb, skull piles, soul flames, ghosts ─

const crypt = (): StructureModel => {
  const M = {
    stone: 0, stoneLight: 1, stoneDark: 2, roof: 3, roofDark: 4, glow: 5, glowCore: 6, bone: 7, boneDark: 8,
    soul: 9, soulCore: 10, ghost: 11, grass: 12, edge: 13, dark: 14,
  };
  const pile = (x: number, y: number, n: number): Shape[] =>
    Array.from({ length: n }, (_, i) => {
      const a = i * 2.4, r = 1 + (i % 4) * 1.6, z = 4 + (i < 4 ? 0 : i < 7 ? 2.6 : 5);
      return skull(x + Math.cos(a) * r, y + Math.sin(a) * r, z, 1.7, i % 3 ? M.bone : M.boneDark, M.dark);
    }).flat();
  const flame = (x: number, y: number, z: number): Shape[] => [ell(x, y, z, 1.6, 1.6, 2.8, M.soul), ell(x, y, z + 2.6, 0.8, 0.8, 1.6, M.soul), ball(x, y, z - 0.4, 0.9, M.soulCore)];
  const ghost = (x: number, y: number, z: number): Shape[] => [
    ell(x, y, z, 2.6, 2.6, 3.2, M.ghost), ell(x, y, z - 3.4, 1.6, 1.6, 2, M.ghost), ell(x - 0.6, y - 0.6, z - 5.4, 0.8, 0.8, 1.2, M.ghost),
    box(x + 2, y - 1.3, z + 0.3, x + 2.7, y - 0.4, z + 1.4, M.dark), box(x + 2, y + 0.4, z + 0.3, x + 2.7, y + 1.3, z + 1.4, M.dark),
  ];
  const parts: Part[] = [
    { name: 'ground', pivot: [25, 25, 0], shapes: pad(M.grass, M.edge) },
    {
      name: 'tomb', pivot: [26, 26, 2], shapes: [
        box(12, 12, 2, 41, 41, 5, M.stoneDark),
        box(41, 20, 2, 44, 32, 4, M.stone), box(44, 21.5, 2, 46, 30.5, 3, M.stoneLight),        // steps
        box(14, 14, 5, 39, 39, 22, M.stone),
        box(13.6, 13.6, 20, 39.4, 39.4, 22, M.stoneLight),
        // Columns flanking the door and at the corners
        ...[[39.6, 15], [39.6, 21], [39.6, 31], [39.6, 37], [15, 39.6], [37, 39.6]].map(([x, y]) => cyl(x, y, 5, 1.5, 15, M.stoneLight)),
        // Arched doorway on the left face, lit sickly yellow
        box(38.6, 22.5, 5, 39.6, 29.5, 15, M.dark),
        ell(39.1, 26, 15, 0.5, 3.5, 2.6, M.dark),
        box(38.9, 23.5, 5, 39.7, 28.5, 13.5, M.glow),
        box(39.3, 24.8, 5, 39.9, 27.2, 10, M.glowCore),
        // Arched windows on the right face
        ...[20, 30].flatMap((x) => [box(x, 38.6, 11, x + 3, 39.6, 17, M.dark), box(x + 0.6, 38.9, 11.5, x + 2.4, 39.7, 16, M.glow)]),
      ],
    },
    {
      name: 'roof', parent: 'tomb', pivot: [26, 26, 22], shapes: [
        ...Array.from({ length: 8 }, (_, k) => box(11.5, 11.5 + k * 1.9, 22 + k * 1.6, 41.5, 41.5 - k * 1.9, 23.7 + k * 1.6, k % 2 ? M.roofDark : M.roof)),
        // Front gable with a skull boss
        ...Array.from({ length: 7 }, (_, k) => box(39, 14 + k * 1.9, 22 + k * 1.6, 40.6, 39 - k * 1.9, 23.7 + k * 1.6, M.stoneLight)),
        ...skull(40.4, 26.5, 27, 1.7, M.bone, M.dark),
        box(25, 25, 35, 27.5, 28, 38, M.stoneDark),
      ],
    },
    { name: 'skulls', pivot: [25, 25, 2], shapes: [...pile(45, 9, 9), ...pile(9, 45, 9), ...pile(45, 44, 6), ...pile(6, 8, 5)] },
    { name: 'souls', pivot: [25, 25, 20], shapes: [...flame(5, 20, 26), ...flame(44, 16, 30), ...flame(18, 46, 28), ...flame(47, 36, 20), ...flame(32, 47, 34)] },
    { name: 'ghosts', pivot: [25, 25, 30], shapes: [...ghost(8, 30, 34), ...ghost(32, 8, 38), ...ghost(46, 46, 30)] },
    rubblePart(M.stoneDark, M.bone),
    siteScaffold(M.stoneDark),
  ];
  const body = ['tomb', 'roof', 'skulls'];
  const { base, ruined, site } = establishmentPoses(parts, body);
  const ruinedOut: Pose = { ...ruined, ...hide('souls', 'ghosts') };
  const siteBare: Pose = { ...site, ...hide('souls', 'ghosts') };
  const idle = withBase(base, [
    { souls: { offset: [0, 0, 0] }, ghosts: { offset: [0, 0, 0], yaw: 0 } },
    { souls: { offset: [0, 0, 1], scale: [1, 1, 1.05] }, ghosts: { offset: [0, 0, 1], yaw: 0.04 } },
    { souls: { offset: [0, 0, 1.6] }, ghosts: { offset: [0, 0, 1.6], yaw: 0.08 } },
    { souls: { offset: [0, 0, 0.8], scale: [1, 1, 1.05] }, ghosts: { offset: [0, 0, 0.8], yaw: 0.04 } },
  ]);
  const attack = withBase(base, [
    { souls: { scale: [1.1, 1.1, 1.3], offset: [0, 0, 2] }, ghosts: { scale: [1.05, 1.05, 1.05] } },
    { souls: { scale: [1.25, 1.25, 1.6], offset: [0, 0, 4] }, ghosts: { scale: [1.15, 1.15, 1.15], offset: [0, 0, -2] } },
    { souls: { scale: [1.15, 1.15, 1.4], offset: [0, 0, 3] }, ghosts: { scale: [1.1, 1.1, 1.1], offset: [0, 0, -4] } },
    { souls: { offset: [0, 0, 1] }, ghosts: { offset: [0, 0, -1] } },
  ]);
  return establishment(
    [
      { color: 0x52605a }, { color: 0x6b7a72 }, { color: 0x37423d }, { color: 0x3f4a45 }, { color: 0x2a332f },
      { color: 0xd9f99d, emissive: true }, { color: 0xfef08a, emissive: true }, { color: 0xe7e0c9 }, { color: 0xb5ab90 },
      { color: 0x4ade80, emissive: true }, { color: 0xdcfce7, emissive: true }, { color: 0x86efac, emissive: true },
      { color: 0x2f3a33 }, { color: 0x1f2622 }, { color: 0x0b0f0d },
    ],
    parts, 48, { idle, attack, ruined: ruinedOut, site: siteBare }, { idle: 3, attack: 9 }
  );
};

// ── 6. Obsidian Spire (Brimstone Perch) — jagged black crag veined with lava ──

const perch = (): StructureModel => {
  const M = { obs: 0, obsLight: 1, obsDark: 2, lava: 3, lavaCore: 4, lavaRed: 5, ash: 6, edge: 7, smoke: 8 };
  const C = 25.5;
  const spike = (x: number, y: number, r: number, h: number, mat: number): Shape[] => cone(x, y, 2, r, h, mat, mat, Math.max(6, Math.round(h / 3)));
  const vein = (pts: Array<[number, number, number]>) => chain(pts, 0.9, 1.3, M.lava, 4);
  const parts: Part[] = [
    {
      name: 'ground', pivot: [25, 25, 0], shapes: [
        ...pad(M.ash, M.edge),
        ...chain([[36, 38, 2.6], [42, 44, 2.6], [48, 47, 2.6]], 1, 1, M.lava, 3),
        ...chain([[38, 30, 2.6], [46, 33, 2.6]], 0.9, 0.9, M.lavaRed, 3),
      ],
    },
    {
      name: 'crag', pivot: [C, C, 2], shapes: [
        ...cone(C, C, 2, 17, 26, M.obs, M.obs, 13),
        ...cone(C, C, 26, 6.5, 26, M.obs, M.obsLight, 10),
        ...spike(15, 18, 7, 30, M.obsDark), ...spike(34, 17, 6, 24, M.obs), ...spike(18, 35, 6, 26, M.obs),
        ...spike(37, 37, 5, 15, M.obsLight), ...spike(10, 31, 4.5, 18, M.obsDark), ...spike(31, 9, 4.5, 20, M.obsDark),
        ...spike(42, 26, 3.5, 10, M.obsLight), ...spike(26, 42, 3.5, 11, M.obsLight),
      ],
    },
    {
      name: 'veins', parent: 'crag', pivot: [C, C, 2], shapes: [
        ...vein([[C + 2, C + 2, 50], [C + 4, C + 3, 40], [C + 6, C + 7, 30], [C + 10, C + 9, 20], [C + 14, C + 15, 8], [C + 17, C + 19, 3]]),
        ...vein([[C + 3, C + 1, 38], [C + 8, C - 1, 28], [C + 13, C + 2, 16], [C + 19, C + 1, 4]]),
        ...vein([[C + 1, C + 4, 34], [C - 1, C + 9, 24], [C + 2, C + 14, 14], [C + 1, C + 20, 4]]),
        ...vein([[C + 11, C + 11, 13], [C + 12, C + 6, 8]]),
      ],
    },
    { name: 'summit', pivot: [C, C, 52], shapes: [ell(C, C, 52.5, 1.6, 1.6, 2.4, M.lavaCore), ell(C, C, 54.5, 1, 1, 2, M.lava)] },
    {
      name: 'spew', pivot: [C, C, 54], shapes: [
        ...around(6, 5).map(({ c, s }, i) => ball(C + c, C + s, 57 + (i % 2) * 3, 1.3, i % 2 ? M.lava : M.lavaCore)),
        ball(C - 2, C - 2, 62, 3, M.smoke),
      ],
    },
    rubblePart(M.obsDark, M.obs),
    siteScaffold(M.obsLight),
  ];
  const body = ['crag', 'veins', 'summit'];
  const { base, ruined, site } = establishmentPoses(parts, body, ['spew']);
  const idle = withBase(base, [
    { summit: { scale: [1, 1, 1] }, veins: { scale: [1, 1, 1] } },
    { summit: { scale: [1.3, 1.3, 1.3] }, veins: { scale: [1.04, 1.04, 1] } },
    { summit: { scale: [0.9, 0.9, 0.9] }, veins: { scale: [1, 1, 1] } },
    { summit: { scale: [1.15, 1.15, 1.15] }, veins: { scale: [1.02, 1.02, 1] } },
  ]);
  const attack = withBase(base, [
    { summit: { scale: [1.6, 1.6, 1.6] }, veins: { scale: [1.06, 1.06, 1] } },
    { summit: { scale: [2, 2, 2] }, spew: { hidden: false, scale: [0.6, 0.6, 0.6] } },
    { summit: { scale: [1.7, 1.7, 1.7] }, spew: { hidden: false, scale: [1.1, 1.1, 1], offset: [0, 0, 2] } },
    { summit: { scale: [1.2, 1.2, 1.2] }, spew: { hidden: false, scale: [1.5, 1.5, 1], offset: [0, 0, 3] } },
  ]);
  return establishment(
    [
      { color: 0x231d2e }, { color: 0x3e3552 }, { color: 0x120e19 }, { color: 0xf97316, emissive: true },
      { color: 0xfde047, emissive: true }, { color: 0xdc2626, emissive: true }, { color: 0x3a3330 }, { color: 0x1a1414 },
      { color: 0x3f3f46 },
    ],
    parts, 64, { idle, attack, ruined, site }, { idle: 3, attack: 10 }
  );
};

// ── 5. Infernal Kennel — iron cages, lava channel, bones and a prowling hellhound ─

const kennel = (): StructureModel => {
  const M = {
    floor: 0, floorLight: 1, floorDark: 2, iron: 3, ironLight: 4, lava: 5, lavaCore: 6, fire: 7, hound: 8,
    houndLight: 9, eye: 10, bone: 11, edge: 12, straw: 13,
  };
  const cage = (x0: number, y0: number, s: number, h: number): Shape[] => {
    const out: Shape[] = [box(x0, y0, 2.5, x0 + s, y0 + s, 3.5, M.iron), ell(x0 + s / 2, y0 + s / 2, 3.6, s / 3, s / 3, 0.6, M.straw)];
    for (let t = 0; t <= s + 0.01; t += s / 4) {
      out.push(box(x0 + s - 0.5, y0 + t - 0.35, 3.5, x0 + s + 0.2, y0 + t + 0.35, 3.5 + h, M.ironLight));
      out.push(box(x0 + t - 0.35, y0 + s - 0.5, 3.5, x0 + t + 0.35, y0 + s + 0.2, 3.5 + h, M.ironLight));
      out.push(box(x0 - 0.2, y0 + t - 0.35, 3.5, x0 + 0.5, y0 + t + 0.35, 3.5 + h, M.iron));
      out.push(box(x0 + t - 0.35, y0 - 0.2, 3.5, x0 + t + 0.35, y0 + 0.5, 3.5 + h, M.iron));
    }
    out.push(box(x0 - 0.5, y0 - 0.5, 3.5 + h, x0 + s + 0.5, y0 + s + 0.5, 5 + h, M.iron));
    out.push(box(x0 - 0.5, y0 + s - 0.6, 3.5 + h * 0.5, x0 + s + 0.5, y0 + s + 0.3, 4.2 + h * 0.5, M.iron));
    return out;
  };
  // A caged hound curled on the straw
  const pup = (x: number, y: number): Shape[] => [
    ell(x, y, 6, 3.2, 4, 2.6, M.hound), ell(x + 2.5, y + 3, 7.5, 1.8, 1.8, 1.8, M.hound),
    ball(x + 4, y + 3.4, 8, 0.5, M.eye), box(x + 1.8, y + 2.4, 9, x + 2.6, y + 3.2, 10.5, M.hound),
  ];
  const parts: Part[] = [
    {
      name: 'ground', pivot: [25, 25, 0], shapes: [
        ...pad(M.floor, M.edge),
        ...[8, 16, 24, 32, 40].flatMap((t) => [box(t, 1, 2.4, t + 0.5, 50, 2.6, M.floorDark), box(1, t, 2.4, 50, t + 0.5, 2.6, M.floorDark)]),
        // Lava channel cutting across the yard
        ...chain([[1, 25, 2], [12, 23, 2], [24, 20.5, 2], [36, 19, 2], [50, 16, 2]], 3.6, 3.6, M.floorDark, 4),
        ...chain([[1, 25, 2.4], [12, 23, 2.4], [24, 20.5, 2.4], [36, 19, 2.4], [50, 16, 2.4]], 2.8, 2.8, M.lava, 4),
        ...chain([[1, 25, 2.9], [12, 23, 2.9], [24, 20.5, 2.9], [36, 19, 2.9], [50, 16, 2.9]], 1.2, 1.2, M.lavaCore, 4),
      ],
    },
    { name: 'cages', pivot: [12, 12, 2], shapes: [...cage(3, 3, 14, 14), ...pup(9, 8), ...cage(22, 3, 13, 13), ...pup(27, 7)] },
    {
      name: 'bones', pivot: [25, 25, 2], shapes: [
        ...[[8, 40, 0.3], [40, 10, 1.2], [44, 22, 0.8], [30, 46, 2], [20, 42, 1.5]].flatMap(([x, y, a]) => {
          const dx = Math.cos(a) * 2.6, dy = Math.sin(a) * 2.6;
          return [box(Math.min(x - dx, x + dx) - 0.4, Math.min(y - dy, y + dy) - 0.4, 2.6, Math.max(x - dx, x + dx) + 0.4, Math.max(y - dy, y + dy) + 0.4, 3.4, M.bone),
            ball(x - dx, y - dy, 3.2, 0.8, M.bone), ball(x + dx, y + dy, 3.2, 0.8, M.bone)];
        }),
        ...skull(46, 30, 4, 1.6, M.bone, M.floorDark),
      ],
    },
    {
      name: 'fires', pivot: [25, 25, 2], shapes: [
        ell(45, 6, 4.5, 2.4, 2.4, 3.6, M.fire), ell(45, 6, 4, 1.2, 1.2, 2, M.lavaCore),
        ell(6, 46, 4.5, 2.4, 2.4, 3.6, M.fire), ell(6, 46, 4, 1.2, 1.2, 2, M.lavaCore),
        ell(20, 20, 4, 1.8, 1.8, 2.6, M.fire),
      ],
    },
    {
      name: 'hound', pivot: [36, 32, 3], shapes: [
        ell(36, 31, 10, 5.5, 10, 5.5, M.hound),                     // body, prowling towards +y
        ell(36, 23.5, 11, 5, 4.5, 5, M.houndLight),                 // haunch
        ell(36, 34, 13.5, 3.5, 6, 2, M.houndLight),                 // spine ridge
        ...[[33, 24], [39, 24], [33, 37], [39, 37]].map(([x, y]) => box(x - 1.2, y - 1.2, 2.5, x + 1.2, y + 1.2, 8, M.hound)),
        ell(36, 42.5, 13, 4.4, 4.4, 4, M.hound),                    // head
        ell(36, 46.5, 11.6, 2.4, 2.8, 2, M.houndLight),             // snout
        box(33.4, 41, 16, 35, 43, 19.5, M.houndLight), box(37, 41, 16, 38.6, 43, 19.5, M.houndLight),   // ears
        ball(39.8, 44.6, 13.8, 0.9, M.eye), ball(37.2, 46.2, 13.8, 0.9, M.eye),
        ...chain([[36, 20, 12], [36, 16, 16], [37, 14, 18]], 1.3, 0.8, M.hound, 2),                 // tail
        ...[[40.8, 28, 11], [40.8, 33, 12], [40.6, 38, 11], [36, 34, 15.6]].map(([x, y, z]) => ball(x, y, z, 0.8, M.fire)),  // ember cracks
      ],
    },
    { name: 'breath', parent: 'hound', pivot: [36, 48, 11.6], shapes: [ell(36, 49, 11.6, 2.4, 1.6, 2, M.fire), ball(36, 49.8, 11.6, 1.1, M.lavaCore)] },
    rubblePart(M.floorDark, M.iron),
    siteScaffold(M.iron),
  ];
  const body = ['cages', 'bones', 'hound', 'fires'];
  const { base, ruined, site } = establishmentPoses(parts, body, ['breath']);
  const ruinedOut: Pose = { ...ruined, ...hide('hound', 'breath', 'fires') };
  const idle = withBase(base, [
    { hound: { offset: [0, 0, 0] }, fires: { scale: [1, 1, 1] } },
    { hound: { offset: [0, 0, 0.4] }, fires: { scale: [1, 1, 1.15] } },
    { hound: { offset: [0, 0.5, 0.2] }, fires: { scale: [1, 1, 0.9] } },
    { hound: { offset: [0, 0, 0] }, fires: { scale: [1, 1, 1.05] } },
  ]);
  const attack = withBase(base, [
    { hound: { offset: [0, -1.5, -0.5] } },
    { hound: { offset: [0, 3, 1.5], pitch: -0.08 }, breath: { hidden: false } },
    { hound: { offset: [0, 4, 0.5] }, breath: { hidden: false, scale: [1.5, 1.6, 1.5] } },
    { hound: { offset: [0, 1.5, 0] } },
  ]);
  return establishment(
    [
      { color: 0x5a3f36 }, { color: 0x73554a }, { color: 0x3a2823 }, { color: 0x2f2f33 }, { color: 0x71717a },
      { color: 0xf97316, emissive: true }, { color: 0xfde047, emissive: true }, { color: 0xfb923c, emissive: true },
      { color: 0x3a302c }, { color: 0x5e4d45 }, { color: 0xef4444, emissive: true }, { color: 0xe7e0c9 },
      { color: 0x1a1210 }, { color: 0x8a6d3b },
    ],
    parts, 36, { idle, attack, ruined: ruinedOut, site }, { idle: 3, attack: 10 }
  );
};

// ── 8. Golem Foundry — rune anvils, forge fire, and the stone golem at work ──

const foundry = (): StructureModel => {
  const M = {
    floor: 0, floorLight: 1, iron: 2, ironLight: 3, ironDark: 4, rune: 5, runeCore: 6, fire: 7, fireCore: 8,
    golem: 9, golemLight: 10, golemDark: 11, wood: 12, edge: 13,
  };
  const parts: Part[] = [
    {
      name: 'ground', pivot: [25, 25, 0], shapes: [
        ...pad(M.floor, M.edge),
        ...[10, 20, 30, 40].flatMap((t) => [box(t, 1, 2.4, t + 0.5, 50, 2.6, M.floorLight), box(1, t, 2.4, 50, t + 0.5, 2.6, M.floorLight)]),
        // Tools on the floor
        box(40, 7, 2.5, 41.4, 18, 3.4, M.wood), box(38.5, 16, 2.5, 43, 19.5, 5.4, M.ironDark),
        box(44, 30, 2.5, 45, 40, 3.2, M.iron), box(45.5, 30, 2.5, 46.5, 40, 3.2, M.iron),
        ...[[30, 44], [34, 46], [26, 47]].map(([x, y]) => ball(x, y, 2.8, 0.5, M.fire)),
      ],
    },
    {
      name: 'anvil', pivot: [28, 28, 2], shapes: [
        box(23, 23, 2, 33, 33, 8, M.ironDark),
        box(25, 25, 8, 31, 31, 12, M.iron),
        box(20, 22, 12, 36, 34, 17, M.ironLight),
        ell(28, 37.5, 14.5, 3, 5, 2.2, M.ironLight),                // horn
        box(35.8, 25, 13, 36.6, 31, 16, M.rune), box(26, 33.8, 13, 30, 34.6, 16, M.rune),
        box(36.6, 27, 14, 37, 29, 15, M.runeCore),
      ],
    },
    {
      name: 'anvil2', pivot: [10, 12, 2], shapes: [
        box(4, 6, 2, 16, 18, 9, M.iron), box(3, 5, 9, 17, 19, 13, M.ironLight),
        box(16.8, 9, 3.5, 17.6, 15, 11.5, M.rune), box(17, 11, 5, 17.8, 13, 10, M.runeCore),
      ],
    },
    {
      name: 'forge', parent: 'anvil', pivot: [28, 28, 17], shapes: [
        ell(28, 28, 19.5, 3.2, 3.2, 3.2, M.fire), ell(28, 28, 21, 1.8, 1.8, 2.6, M.fireCore),
        ell(26, 30, 23, 1, 1, 2.4, M.fire), ell(30, 27, 23.5, 1, 1, 2.4, M.fire),
      ],
    },
    {
      name: 'sparks', pivot: [28, 28, 22], shapes: around(9, 6, 0.2).map(({ c, s }, i) => ball(28 + c, 28 + s, 20 + (i % 3) * 3, 0.6, i % 2 ? M.fireCore : M.fire)),
    },
    {
      name: 'golem', pivot: [12, 38, 2], shapes: [
        box(8, 34, 2, 12, 38, 14, M.golemDark), box(8, 40, 2, 12, 44, 14, M.golem),                 // legs
        box(7, 33, 14, 17, 45, 29, M.golem),                                                          // torso
        box(16.6, 36, 18, 17.4, 42, 25, M.golemLight),
        box(17, 37.5, 20, 17.8, 40.5, 23, M.rune),                                                     // chest rune
        box(9, 36, 29, 16, 42, 35, M.golemLight),                                                      // head
        box(15.8, 37, 31, 16.6, 38.6, 32.6, M.rune), box(15.8, 39.4, 31, 16.6, 41, 32.6, M.rune),     // eyes
        box(8, 31, 24, 14, 33.5, 29, M.golemDark),                                                     // left shoulder + arm
        box(9, 31, 14, 13, 33, 24, M.golem),
        box(13, 32, 17, 14, 33, 19, M.rune),
      ],
    },
    {
      name: 'arm', parent: 'golem', pivot: [12, 46, 27], shapes: [
        box(9, 45, 24, 15, 48, 29, M.golemDark),
        box(10, 45.5, 15, 14, 48, 24, M.golem),
        box(11.4, 46, 11, 12.6, 47.4, 16, M.wood),                  // hammer haft
        box(10, 44, 7.5, 14, 49.5, 11.5, M.ironDark),                // hammer head
        box(14, 45, 8.5, 14.6, 48.5, 10.5, M.rune),
      ],
    },
    rubblePart(M.floorLight, M.golemDark),
    siteScaffold(M.wood),
  ];
  const body = ['anvil', 'anvil2', 'golem', 'arm', 'forge'];
  const { base, ruined, site } = establishmentPoses(parts, body, ['sparks']);
  const ruinedOut: Pose = { ...ruined, ...hide('forge', 'sparks') };
  const idle = withBase(base, [
    { arm: { pitch: 0 }, forge: { scale: [1, 1, 1] } },
    { arm: { pitch: 0.06 }, forge: { scale: [1.1, 1.1, 1.2] } },
    { arm: { pitch: 0.1 }, forge: { scale: [0.95, 0.95, 0.9] } },
    { arm: { pitch: 0.05 }, forge: { scale: [1.05, 1.05, 1.1] } },
  ]);
  const attack = withBase(base, [
    { arm: { roll: -0.5 } },
    { arm: { roll: -1.1 } },
    { arm: { roll: 0.35 }, sparks: { hidden: false, scale: [0.6, 0.6, 0.6] }, forge: { scale: [1.4, 1.4, 1.5] } },
    { arm: { roll: 0.2 }, sparks: { hidden: false, scale: [1.3, 1.3, 1.2] } },
    { arm: { roll: 0 } },
  ]);
  return establishment(
    [
      { color: 0x3a3a42 }, { color: 0x4a4a55 }, { color: 0x4b5563 }, { color: 0x6b7280 }, { color: 0x27272f },
      { color: 0x38bdf8, emissive: true }, { color: 0xe0f2fe, emissive: true }, { color: 0xf97316, emissive: true },
      { color: 0xfde047, emissive: true }, { color: 0x8a6a55 }, { color: 0xa5856e }, { color: 0x5e463a },
      { color: 0x6b4423 }, { color: 0x1f1f24 },
    ],
    parts, 40, { idle, attack, ruined: ruinedOut, site }, { idle: 2, attack: 10 }
  );
};

// ── 7. Shadow Pavilion — striped violet tent, gold trim, lanterns on iron posts ─

const pavilion = (): StructureModel => {
  const M = { canvas: 0, canvasDark: 1, canvasLight: 2, gold: 3, dark: 4, lantern: 5, lanternCore: 6, post: 7, flag: 8, ground: 9, edge: 10 };
  const C = 24;
  const lamp = (x: number, y: number): Shape[] => [
    box(x - 0.7, y - 0.7, 2.5, x + 0.7, y + 0.7, 22, M.post), box(x - 1.6, y - 1.6, 2.5, x + 1.6, y + 1.6, 4, M.post),
    box(x - 1.8, y - 1.8, 22, x + 1.8, y + 1.8, 27, M.lantern), box(x - 1, y - 1, 22.5, x + 1, y + 1, 26.5, M.lanternCore),
    box(x - 2.2, y - 2.2, 27, x + 2.2, y + 2.2, 28, M.post), ...pyramid(x, y, 28, 1.6, 2.5, M.post, 3),
  ];
  const parts: Part[] = [
    { name: 'ground', pivot: [25, 25, 0], shapes: [...pad(M.ground, M.edge), cyl(C, C, 2.5, 18, 0.5, M.dark)] },
    {
      name: 'tent', pivot: [C, C, 2], shapes: [
        cyl(C, C, 2.5, 15, 15, M.canvas),
        // Vertical stripes round the wall
        ...around(16, 15.1).filter((_, i) => i % 2 === 0).map(({ c, s }) => box(C + c - 1.3, C + s - 1.3, 2.5, C + c + 1.3, C + s + 1.3, 17.5, M.canvasDark)),
        // Entrance on the front corner, with drawn-back flaps
        ell(C + 10.6, C + 10.6, 9, 2.4, 2.4, 6.5, M.dark),
        box(C + 9.6, C + 9.6, 2.5, C + 11.4, C + 11.4, 9, M.dark),
        ell(C + 12, C + 7.5, 9, 1.2, 2, 6.5, M.canvasLight), ell(C + 7.5, C + 12, 9, 2, 1.2, 6.5, M.canvasLight),
        ...around(20, 15.6).map(({ c, s }) => ball(C + c, C + s, 17, 1, M.gold)),                 // scalloped trim
      ],
    },
    {
      name: 'roof', parent: 'tent', pivot: [C, C, 17.5], shapes: [
        ...cone(C, C, 17.5, 18, 18, M.canvas, M.canvasLight, 9),
        ...around(12, 9, 0.2).map(({ c, s }) => box(C + c - 0.6, C + s - 0.6, 24, C + c + 0.6, C + s + 0.6, 26, M.gold)),
        ...around(24, 18).map(({ c, s }) => ball(C + c, C + s, 17.2, 1.1, M.gold)),
        box(C - 0.5, C - 0.5, 35, C + 0.5, C + 0.5, 42, M.gold),
        ball(C, C, 42.5, 1, M.gold),
      ],
    },
    { name: 'flag', parent: 'roof', pivot: [C, C, 40], shapes: [box(C + 0.5, C - 0.4, 37, C + 0.9, C + 6, 41, M.flag), box(C + 0.5, C + 5, 36, C + 0.9, C + 7, 38, M.flag)] },
    { name: 'lamps', pivot: [25, 25, 2], shapes: [...lamp(45, 9), ...lamp(9, 45)] },
    { name: 'shadow', pivot: [C, C, 4], shapes: around(14, 21).map(({ c, s }, i) => ell(C + c, C + s, 4 + (i % 3), 1.6, 1.6, 2.4, i % 2 ? M.dark : M.lantern)) },
    rubblePart(M.canvasDark, M.post),
    siteScaffold(M.post),
  ];
  const body = ['tent', 'roof', 'flag', 'lamps'];
  const { base, ruined, site } = establishmentPoses(parts, body, ['shadow']);
  const idle = withBase(base, [
    { flag: { yaw: 0.25 }, lamps: { scale: [1, 1, 1] } },
    { flag: { yaw: 0.05 } },
    { flag: { yaw: -0.2 } },
    { flag: { yaw: 0.02 } },
  ]);
  const attack = withBase(base, [
    { shadow: { hidden: false, scale: [0.5, 0.5, 1] }, flag: { yaw: 0.4 } },
    { shadow: { hidden: false, scale: [0.85, 0.85, 1.2] }, flag: { yaw: -0.3 } },
    { shadow: { hidden: false, scale: [1.1, 1.1, 1] }, flag: { yaw: 0.3 } },
    { shadow: { hidden: false, scale: [1.3, 1.3, 0.6] } },
  ]);
  return establishment(
    [
      { color: 0x6d28d9 }, { color: 0x4c1d95 }, { color: 0x8b5cf6 }, { color: 0xfbbf24 }, { color: 0x150b24 },
      { color: 0xc084fc, emissive: true }, { color: 0xf5d0fe, emissive: true }, { color: 0x27272a }, { color: 0x7c3aed },
      { color: 0x2e1f3d }, { color: 0x1a1024 },
    ],
    parts, 46, { idle, attack, ruined, site }, { idle: 3, attack: 9 }
  );
};

// ── 16. Void Gate — runed obsidian obelisk with violet eyes on a stepped plinth ─

const voidGate = (): StructureModel => {
  const M = { stone: 0, stoneLight: 1, stoneDark: 2, obs: 3, obsLight: 4, void: 5, voidCore: 6, dark: 7, edge: 8, rock: 9 };
  const C = 25.5;
  const parts: Part[] = [
    { name: 'ground', pivot: [25, 25, 0], shapes: pad(M.stoneDark, M.edge) },
    {
      name: 'plinth', pivot: [C, C, 2], shapes: [
        box(7, 7, 2, 44, 44, 6, M.stone),
        box(11, 11, 6, 40, 40, 10, M.stoneLight),
        box(14.5, 14.5, 10, 36.5, 36.5, 13, M.stone),
        // Glowing inlays along each step
        ...[[44, 7, 3.5], [40, 11, 7.5], [36.5, 14.5, 11]].flatMap(([e, lo, z]) => {
          return [box(e - 0.2, lo + 3, z, e + 0.4, e - 3, z + 1, M.void), box(lo + 3, e - 0.2, z, e - 3, e + 0.4, z + 1, M.void)];
        }),
      ],
    },
    {
      name: 'obelisk', pivot: [C, C, 13], shapes: [
        ...Array.from({ length: 9 }, (_, k) => {
          const h = 7.5 - k * 0.45;
          return box(C - h, C - h, 13 + k * 4, C + h, C + h, 17 + k * 4, k % 3 === 2 ? M.obsLight : M.obs);
        }),
        ...pyramid(C, C, 49, 3.6, 9, M.obs, 6),
        // Rune lines down both faces the viewer sees
        ...[18, 26, 34, 42].flatMap((z, i) => {
          const h = 7.5 - Math.floor((z - 13) / 4) * 0.45;
          return [box(C + h - 0.1, C - 2 + (i % 2), z, C + h + 0.5, C + 2 - (i % 2), z + 1, M.void), box(C - 2 + (i % 2), C + h - 0.1, z, C + 2 - (i % 2), C + h + 0.5, z + 1, M.void)];
        }),
      ],
    },
    {
      name: 'eyes', parent: 'obelisk', pivot: [C, C, 38], shapes: [
        ell(C + 6, C - 1, 38, 0.8, 2, 2.4, M.void), ell(C + 6.4, C - 1, 38, 0.5, 1, 1.2, M.voidCore),
        ell(C - 1, C + 6, 38, 2, 0.8, 2.4, M.void), ell(C - 1, C + 6.4, 38, 1, 0.5, 1.2, M.voidCore),
      ],
    },
    {
      name: 'orbs', pivot: [C, C, 30], shapes: around(7, 19, 0.4).flatMap(({ c, s }, i) => i % 2
        ? [ball(C + c, C + s, 22 + (i % 3) * 9, 2, M.void), ball(C + c, C + s, 22 + (i % 3) * 9, 1, M.voidCore)]
        : [ell(C + c, C + s, 20 + (i % 3) * 10, 2.4, 2, 1.8, M.rock)]),
    },
    { name: 'rift', pivot: [C, C, 38], shapes: around(14, 11).map(({ c, s }) => ball(C + c, C + s, 38, 1.1, M.voidCore)) },
    rubblePart(M.stoneDark, M.obs),
    siteScaffold(M.stoneLight),
  ];
  const body = ['plinth', 'obelisk', 'eyes'];
  const { base, ruined, site } = establishmentPoses(parts, body, ['rift']);
  const ruinedOut: Pose = { ...ruined, ...hide('eyes', 'orbs', 'rift') };
  const idle = withBase(base, [
    { orbs: { yaw: 0, offset: [0, 0, 0] } },
    { orbs: { yaw: 0.2, offset: [0, 0, 1] }, eyes: { scale: [1, 1, 1.15] } },
    { orbs: { yaw: 0.4, offset: [0, 0, 1.6] } },
    { orbs: { yaw: 0.6, offset: [0, 0, 1] }, eyes: { scale: [1, 1, 0.6] } },
  ]);
  const attack = withBase(base, [
    { eyes: { scale: [1.4, 1.4, 1.4] }, orbs: { scale: [0.85, 0.85, 1], yaw: 0.3 } },
    { eyes: { scale: [1.8, 1.8, 1.8] }, orbs: { scale: [0.65, 0.65, 1], yaw: 0.7 }, rift: { hidden: false, scale: [0.6, 0.6, 1] } },
    { eyes: { scale: [1.5, 1.5, 1.5] }, orbs: { scale: [0.8, 0.8, 1], yaw: 1 }, rift: { hidden: false, scale: [1.3, 1.3, 1] } },
    { eyes: { scale: [1.1, 1.1, 1.1] }, orbs: { yaw: 1.2 } },
  ]);
  return establishment(
    [
      { color: 0x3f3f4a }, { color: 0x55556a }, { color: 0x27272f }, { color: 0x2a2438 }, { color: 0x3d3550 },
      { color: 0xa855f7, emissive: true }, { color: 0xf0abfc, emissive: true }, { color: 0x0b0712 }, { color: 0x1a1720 },
      { color: 0x1f1a2a },
    ],
    parts, 62, { idle, attack, ruined: ruinedOut, site }, { idle: 3, attack: 9 }
  );
};

// ── 15. Bone Crypt — skull-lined niche walls, sarcophagi, a fallen skeleton ──

const ossuary = (): StructureModel => {
  const M = { stone: 0, stoneLight: 1, stoneDark: 2, floor: 3, bone: 4, boneDark: 5, dark: 6, glow: 7, edge: 8, candle: 9 };
  const niches = (axis: 'x' | 'y'): Shape[] => {
    const out: Shape[] = [];
    for (const z of [6, 13.5, 21]) {
      for (const t of [9, 19, 29, 39]) {
        if (axis === 'x') {
          out.push(box(5, t - 3.5, z, 6, t + 3.5, z + 5.5, M.dark));
          out.push(...skull(5.4, t - 1.6, z + 1.8, 1.5, M.bone, M.dark), ...skull(5.4, t + 1.8, z + 1.8, 1.5, M.boneDark, M.dark));
        } else {
          out.push(box(t - 3.5, 5, z, t + 3.5, 6, z + 5.5, M.dark));
          out.push(...skull(t - 1.6, 5.4, z + 1.8, 1.5, M.boneDark, M.dark), ...skull(t + 1.8, 5.4, z + 1.8, 1.5, M.bone, M.dark));
        }
      }
    }
    return out;
  };
  const sarcophagus = (name: string, x0: number, y0: number, w: number, l: number): Part[] => [
    {
      name, pivot: [x0 + w / 2, y0 + l / 2, 2], shapes: [
        box(x0, y0, 2, x0 + w, y0 + l, 9, M.stone),
        box(x0 - 0.4, y0 - 0.4, 2, x0 + w + 0.4, y0 + l + 0.4, 3.5, M.stoneDark),
        box(x0 + w - 0.2, y0 + 2, 4, x0 + w + 0.4, y0 + l - 2, 7.5, M.stoneLight),
      ],
    },
    {
      name: `${name}Lid`, parent: name, pivot: [x0 + w / 2, y0 + l / 2, 9], shapes: [
        box(x0 - 0.6, y0 - 0.6, 9, x0 + w + 0.6, y0 + l + 0.6, 11, M.stoneLight),
        box(x0 + w / 2 - 0.6, y0 + 3, 11, x0 + w / 2 + 0.6, y0 + l - 3, 11.8, M.stone),
        box(x0 + 2, y0 + l * 0.3 - 0.6, 11, x0 + w - 2, y0 + l * 0.3 + 0.6, 11.8, M.stone),
        cyl(x0 + 1.5, y0 + l - 1.5, 11, 0.5, 1.6, M.boneDark), ball(x0 + 1.5, y0 + l - 1.5, 13, 0.5, M.candle),
      ],
    },
  ];
  const parts: Part[] = [
    {
      name: 'ground', pivot: [25, 25, 0], shapes: [
        ...pad(M.floor, M.edge),
        ...[12, 22, 32, 42].flatMap((t) => [box(t, 6, 2.4, t + 0.5, 50, 2.6, M.stoneDark), box(6, t, 2.4, 50, t + 0.5, 2.6, M.stoneDark)]),
      ],
    },
    {
      name: 'walls', pivot: [3, 3, 2], shapes: [
        box(1, 1, 2, 5, 50, 30, M.stone), box(1, 1, 2, 50, 5, 30, M.stone),
        box(0.6, 0.6, 28, 5.6, 50, 31, M.stoneLight), box(0.6, 0.6, 28, 50, 5.6, 31, M.stoneLight),
        ...niches('x'), ...niches('y'),
        ...[[5.5, 5.5], [5.5, 48], [48, 5.5]].map(([x, y]) => cyl(x, y, 2, 2.2, 29, M.stoneLight)),
        box(5.6, 13.5, 26, 6.6, 15, 28, M.glow), box(13.5, 5.6, 26, 15, 6.6, 28, M.glow),
      ],
    },
    ...sarcophagus('sarcA', 15, 14, 9, 18),
    ...sarcophagus('sarcB', 30, 22, 9, 16),
    {
      name: 'remains', pivot: [25, 25, 2], shapes: [
        // Skeleton sprawled in front of the coffins
        ...skull(40, 41, 4, 1.8, M.bone, M.dark),
        box(35, 40.2, 2.6, 38.6, 41.8, 3.6, M.bone),
        ...[35.5, 36.7, 37.9].map((x) => box(x, 38.8, 2.6, x + 0.5, 43.2, 3.4, M.boneDark)),
        box(30, 40.5, 2.6, 35, 41.3, 3.3, M.bone), box(28, 38, 2.6, 32, 38.8, 3.3, M.bone), box(28, 43, 2.6, 32, 43.8, 3.3, M.bone),
        box(37, 44, 2.6, 37.8, 48, 3.3, M.bone),
        // Skull heaps in the corners
        ...[[10, 40], [12, 44], [8, 46], [44, 10], [46, 14], [42, 8]].flatMap(([x, y], i) => skull(x, y, 4 + (i % 2), 1.6, i % 2 ? M.bone : M.boneDark, M.dark)),
      ],
    },
    { name: 'wisps', pivot: [25, 25, 14], shapes: [...around(6, 13).map(({ c, s }, i) => ball(27 + c, 27 + s, 14 + (i % 3) * 3, 1.2, M.glow))] },
    rubblePart(M.stoneDark, M.bone),
    siteScaffold(M.stoneDark),
  ];
  const body = ['walls', 'sarcA', 'sarcALid', 'sarcB', 'sarcBLid', 'remains'];
  const { base, ruined, site } = establishmentPoses(parts, body, ['wisps']);
  const idle = withBase(base, [
    { sarcALid: { offset: [0, 0, 0] } },
    { sarcALid: { offset: [0, 0, 0.3] } },
    { sarcALid: { offset: [0, 0, 0] }, sarcBLid: { offset: [0, 0, 0.3] } },
    { sarcBLid: { offset: [0, 0, 0] } },
  ]);
  const attack = withBase(base, [
    { sarcALid: { offset: [0, 0, 2], roll: 0.1 }, sarcBLid: { offset: [0, 0, 1.5], roll: -0.1 } },
    { sarcALid: { offset: [0, 0, 4], roll: 0.25 }, sarcBLid: { offset: [0, 0, 3.5], roll: -0.2 }, wisps: { hidden: false, scale: [0.6, 0.6, 1] } },
    { sarcALid: { offset: [0, 0, 3], roll: 0.2 }, sarcBLid: { offset: [0, 0, 2.5], roll: -0.15 }, wisps: { hidden: false, scale: [1.2, 1.2, 1], offset: [0, 0, 4] } },
    { sarcALid: { offset: [0, 0, 0.5] }, wisps: { hidden: false, scale: [1.6, 1.6, 1], offset: [0, 0, 8] } },
  ]);
  return establishment(
    [
      { color: 0x3f4d4a }, { color: 0x5a6b67 }, { color: 0x2a3533 }, { color: 0x34403d }, { color: 0xe7dcc0 },
      { color: 0xb5a98a }, { color: 0x0f1514 }, { color: 0x5eead4, emissive: true }, { color: 0x1a2120 },
      { color: 0xfde68a, emissive: true },
    ],
    parts, 36, { idle, attack, ruined, site }, { idle: 2, attack: 9 }
  );
};

// ── Registry ─────────────────────────────────────────────────────────────────

export type StructureKey =
  | 'castle' | 'quarry' | 'mine' | 'grove' | 'port' | 'cave' | 'spire' | 'portal'
  | 'trench' | 'crypt' | 'perch' | 'kennel'
  | 'foundry' | 'pavilion' | 'voidgate' | 'ossuary';

// Order = bake order: the always-visible citadel, portals and spire first
export const STRUCTURE_MODELS: Record<StructureKey, () => StructureModel> = {
  castle, portal, spire, quarry, mine, grove, port, cave,
  trench, crypt, perch, kennel,
  foundry, pavilion, voidgate: voidGate, ossuary,
};

/** The Codex art each structure is modelled on (public/structures/). */
export const STRUCTURE_ART: Record<StructureKey, string> = {
  castle: 'nexus-castle', portal: 'portal', spire: 'aether-spire', quarry: 'watchtower', mine: 'ore-furnace',
  grove: 'tree-of-life', port: 'wellspring', cave: 'magma-cavern', trench: 'deepwater-basin', crypt: 'bone-mausoleum',
  perch: 'obsidian-spire', kennel: 'infernal-kennel', foundry: 'golem-foundry', pavilion: 'shadow-pavilion',
  voidgate: 'void-gate', ossuary: 'bone-crypt',
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
  FOUNDRY: 'foundry',
  PAVILION: 'pavilion',
  VOIDGATE: 'voidgate',
  OSSUARY: 'ossuary',
};
