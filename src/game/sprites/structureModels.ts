import type { ResourceBuildingId } from '../../types/state';
import type { Part, Pose, Shape, VoxelGeometry } from './VoxelSprite';

/**
 * Voxel models for the citadel, the establishments, the Crystal Spire and the
 * invader portals. These models are the design source (the old Codex
 * pictures were removed on 2026-10-24); check every state in the Atlas
 * "Structures" tab before changing a model.
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
        // Siren lamp: iron collar seated on the spire tip, red glass dome (spins its beams in battle)
        cyl(38, 38, 66, 2.2, 3, M.iron), cyl(38, 38, 68.5, 3.6, 1.2, M.iron),
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

// ── 10. Abyssal Wharf (Water Port) — black-water basin under a drowned beast's rib cage ─

const port = (): StructureModel => {
  // Abyssal Wharf: a black-water basin under a giant rib cage, a horned idol pouring the tide, bone pilings and ghost lanterns
  const M = { quay: 0, quayLight: 1, quayDark: 2, water: 3, waterDeep: 4, glow: 5, glowHot: 6, bone: 7, boneDark: 8, idol: 9, idolDark: 10, iron: 11, edge: 12 };
  const C = 25.5;
  const BX = C + 3, BY = C + 3; // basin centre (toward the island)
  // One rib of the arching rib cage: a curve of bone balls over the basin
  const rib = (t: number): Shape[] => {
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI;
      // Each rib arches across the basin (from one side of the quay to the other); t steps along the spine
      pts.push([BX - 11 * Math.cos(a) + t, BY + 11 * Math.cos(a) + t, 4 + 15 * Math.sin(a)]);
    }
    return chain(pts, 1.1, 1.1, M.bone, 2);
  };
  const parts: Part[] = [
    {
      name: 'ground', pivot: [25, 25, 0], shapes: [
        ...pad(M.quayDark, M.edge),
        // Stone quay ring and the basin of black water
        cyl(BX, BY, 2, 15, 2.2, M.quay),
        cyl(BX, BY, 2.3, 12.5, 2.2, M.water),
        cyl(BX, BY, 2.4, 8, 2.2, M.waterDeep),
        ...around(10, 13.7, 0.15).map(({ c, s }, i) => box(BX + c - 1.2, BY + s - 1.2, 2, BX + c + 1.2, BY + s + 1.2, 5, i % 2 ? M.quayLight : M.quay)),
      ],
    },
    {
      name: 'cage', pivot: [BX, BY, 4], shapes: [
        ...rib(-7.5), ...rib(-2.5), ...rib(2.5), ...rib(7.5),
        // Spine along the top
        ...chain([[BX - 8, BY - 8, 19], [BX + 8, BY + 8, 19]], 1.4, 1.4, M.boneDark, 6),
        // The skull at the spine's end, eyes lit
        ell(BX + 10, BY + 10, 18, 3, 3, 2.6, M.bone), box(BX + 12, BY + 11, 18, BX + 13, BY + 12, 19, M.glowHot), box(BX + 11, BY + 12, 18, BX + 12, BY + 13, 19, M.glowHot),
      ],
    },
    {
      name: 'idol', pivot: [8, 8, 2], shapes: [
        box(3, 3, 2, 15, 15, 8, M.quayDark),
        ell(9, 9, 15, 5, 5, 7.5, M.idol),
        // Horns sweeping up
        ...chain([[6, 10, 20], [3.5, 11, 25], [4.5, 13, 29]], 1.3, 0.6, M.idolDark, 3),
        ...chain([[10, 6, 20], [11, 3.5, 25], [13, 4.5, 29]], 1.3, 0.6, M.idolDark, 3),
        // Glowing eyes and an open maw pouring the tide into the basin
        box(12.6, 11, 17.5, 13.4, 12.2, 18.5, M.glowHot), box(11, 12.6, 17.5, 12.2, 13.4, 18.5, M.glowHot),
        ell(13, 13, 13, 2.2, 2.2, 2, M.idolDark),
        ...chain([[14, 14, 12.5], [17, 17, 9], [19, 19, 4.5]], 1.4, 1.8, M.water, 3),
      ],
    },
    {
      name: 'pier', pivot: [C, C, 2], shapes: [
        // Bone pilings and a short iron-bound jetty out over the water
        box(BX + 9, BY - 2, 4, BX + 17, BY + 2, 5, M.quayLight),
        ...[[BX + 10, BY - 3], [BX + 10, BY + 3], [BX + 15, BY - 3], [BX + 15, BY + 3]].map(([x, y]) => cyl(x, y, 2, 0.9, 5.5, M.bone)),
        box(BX + 9, BY - 2.2, 5, BX + 17, BY - 1.8, 5.4, M.iron), box(BX + 9, BY + 1.8, 5, BX + 17, BY + 2.2, 5.4, M.iron),
      ],
    },
    {
      name: 'lanterns', pivot: [C, C, 2], shapes: [
        ...[[44, 14], [14, 44], [BX + 16, BY]].flatMap(([x, y]) => [
          box(x - 0.4, y - 0.4, 2, x + 0.4, y + 0.4, 11, M.iron),
          box(x - 1.2, y - 1.2, 11, x + 1.2, y + 1.2, 13.6, M.iron),
          ell(x, y, 12.3, 0.9, 0.9, 1.1, M.glow),
        ]),
      ],
    },
    {
      name: 'wisps', pivot: [BX, BY, 4], shapes: [
        ...around(5, 6, 0.4).map(({ c, s }, i) => ball(BX + c, BY + s, 5 + (i % 2), 0.9, i % 2 ? M.glow : M.glowHot)),
      ],
    },
    {
      name: 'surge', pivot: [BX, BY, 4], shapes: [
        ...chain([[BX, BY, 4], [BX + 0.6, BY - 0.6, 12], [BX - 0.4, BY + 0.4, 20]], 3, 1.6, M.water, 3),
        ...chain([[BX, BY, 6], [BX, BY, 18]], 1.4, 0.8, M.glow, 3),
        ...around(6, 4, 0.2).map(({ c, s }) => ball(BX + c, BY + s, 18, 1.1, M.glowHot)),
      ],
    },
    rubblePart(M.quayDark, M.quay),
    siteScaffold(M.iron),
  ];
  const body = ['cage', 'idol', 'pier', 'lanterns', 'wisps'];
  const { base, ruined, site } = establishmentPoses(parts, body, ['surge']);
  const idle = withBase(base, [
    { wisps: { offset: [0, 0, 0], roll: 0 } },
    { wisps: { offset: [0, 0, 0.8], roll: 0.4 } },
    { wisps: { offset: [0, 0, 1.4], roll: 0.8 } },
    { wisps: { offset: [0, 0, 0.6], roll: 1.2 } },
  ]);
  const attack = withBase(base, [
    { surge: { hidden: false, scale: [0.7, 0.7, 0.4] } },
    { surge: { hidden: false, scale: [1, 1, 0.8] } },
    { surge: { hidden: false, scale: [1.15, 1.15, 1.15] } },
    { surge: { hidden: false, scale: [0.9, 0.9, 1.3] } },
  ]);
  return establishment(
    [
      { color: 0x3f3a44 }, { color: 0x5b5563 }, { color: 0x232028 }, { color: 0x115e59, emissive: true }, { color: 0x0b2b2b },
      { color: 0x34d399, emissive: true }, { color: 0xa7f3d0, emissive: true }, { color: 0xb8b0a4 }, { color: 0x8a8278 },
      { color: 0x44403c }, { color: 0x1c1917 }, { color: 0x27272a }, { color: 0x121016 },
    ],
    parts, 44, { idle, attack, ruined, site }, { idle: 4, attack: 10 }, true
  );
};

// ── 14. Gargoyle Grotto (Mystic Cave) — slate hill, arcane cave, crystal spines, gargoyle statues ─

const cave = (): StructureModel => {
  // Gargoyle Grotto: a hunched slate hill split by a glowing arcane cave, crystal spines and two gargoyle statues
  const M = { slate: 0, slateLight: 1, slateDark: 2, crystal: 3, crystalCore: 4, teal: 5, stone: 6, stoneDark: 7, edge: 8, hollow: 9, rune: 10 };
  const C = 25.5;
  // A crystal spine: a stack of shrinking boxes leaning outward
  const spine = (x: number, y: number, z: number, h: number, lean: [number, number], mat: number): Shape[] =>
    Array.from({ length: 5 }, (_, i) => {
      const k = i / 5, w = 2.8 * (1 - k * 0.65);
      const cx = x + lean[0] * h * k, cy = y + lean[1] * h * k;
      return box(cx - w, cy - w, z + (h / 5) * i, cx + w, cy + w, z + (h / 5) * (i + 1), i === 4 ? M.crystalCore : mat);
    });
  const gargoyle = (x: number, y: number, z: number, s: number): Shape[] => [
    box(x - 2 * s, y - 2 * s, z, x + 2 * s, y + 2 * s, z + 1.2 * s, M.stoneDark),          // plinth
    ell(x, y, z + 3.2 * s, 1.8 * s, 1.6 * s, 2.2 * s, M.stone),                           // crouched body
    ball(x + 0.8 * s, y + 0.8 * s, z + 5.6 * s, 1.2 * s, M.stone),                          // head
    box(x + 0.2 * s, y + 0.2 * s, z + 6.4 * s, x + 0.6 * s, y + 0.6 * s, z + 7.6 * s, M.stoneDark), // horn
    box(x + 1.1 * s, y + 1.1 * s, z + 5.6 * s, x + 1.5 * s, y + 1.5 * s, z + 6 * s, M.teal), // lit eye
    ell(x - 2.2 * s, y + 0.4 * s, z + 4.4 * s, 0.5 * s, 2.4 * s, 2 * s, M.stoneDark),      // folded wings
    ell(x + 0.4 * s, y - 2.2 * s, z + 4.4 * s, 2.4 * s, 0.5 * s, 2 * s, M.stoneDark),
  ];
  const parts: Part[] = [
    {
      name: 'ground', pivot: [25, 25, 0], shapes: [
        ...pad(M.slateDark, M.edge),
        // A rune circle carved into the floor before the cave
        ...around(12, 8, 0.2).map(({ c, s }) => box(C + 11 + c - 0.6, C + 11 + s - 0.6, 2.4, C + 11 + c + 0.6, C + 11 + s + 0.6, 2.8, M.rune)),
      ],
    },
    {
      name: 'hill', pivot: [C, C, 2], shapes: [
        ell(C - 3, C - 3, 9, 19, 19, 14, M.slate),
        ell(C - 9, C + 6, 7, 11, 10, 10, M.slateLight),
        ell(C + 6, C - 9, 7, 10, 11, 10, M.slateLight),
        ell(C - 6, C - 6, 18, 11, 11, 9, M.slateDark),
        ell(C - 4, C - 4, 24, 6, 6, 5, M.slate),
        // Cracked boulders round the foot
        ell(8, 40, 4, 4, 3.5, 3, M.slateDark), ell(40, 8, 4, 3.5, 4, 3, M.slateDark), ell(44, 30, 3.5, 3, 2.6, 2.2, M.slate),
        // The cave: a dark hollow facing the island, framed by a slate arch
        ell(C + 9, C + 9, 7, 7.5, 7.5, 7.5, M.slateLight),
        ell(C + 11, C + 11, 6.4, 5.4, 5.4, 6, M.hollow),
        ell(C + 12.4, C + 12.4, 5.6, 3.4, 3.4, 4.2, M.crystal),
      ],
    },
    {
      name: 'crystals', parent: 'hill', pivot: [C, C, 20], shapes: [
        ...spine(C - 6, C - 6, 26, 20, [0.05, 0.05], M.crystal),
        ...spine(C - 13, C + 2, 15, 15, [-0.25, 0.15], M.crystal),
        ...spine(C + 2, C - 13, 15, 15, [0.15, -0.25], M.teal),
        ...spine(C + 8, C + 2, 12, 11, [0.3, 0.1], M.crystal),
        ...spine(C + 2, C + 8, 12, 11, [0.1, 0.3], M.teal),
        ...spine(10, 36, 2.5, 9, [-0.1, 0.2], M.crystal),
        ...spine(36, 10, 2.5, 9, [0.2, -0.1], M.teal),
        ...spine(42, 30, 2.5, 7, [0.25, 0], M.crystal),
      ],
    },
    { name: 'gargoyles', parent: 'hill', pivot: [C, C, 20], shapes: [...gargoyle(C - 12, C + 10, 12, 1.7), ...gargoyle(C + 10, C - 12, 12, 1.7)] },
    {
      name: 'orb', pivot: [C - 6, C - 6, 44], shapes: [
        ball(C - 6, C - 6, 44, 3, M.crystal), ball(C - 6, C - 6, 44, 1.8, M.crystalCore),
        ...around(6, 5.5).map(({ c, s }, i) => ball(C - 6 + c, C - 6 + s, 44 + (i % 2 ? 1.5 : -1.5), 0.9, i % 2 ? M.teal : M.crystal)),
      ],
    },
    rubblePart(M.slateDark, M.slate),
    siteScaffold(M.stoneDark),
  ];
  const body = ['hill', 'crystals', 'gargoyles'];
  const { base, ruined, site } = establishmentPoses(parts, body, ['orb']);
  const idle = withBase(base, [
    { crystals: { scale: [1, 1, 1] } },
    { crystals: { scale: [1, 1, 1.04] } },
    { crystals: { scale: [1, 1, 1.07] } },
    { crystals: { scale: [1, 1, 1.03] } },
  ]);
  const attack = withBase(base, [
    { orb: { hidden: false, scale: [0.5, 0.5, 0.5] }, crystals: { scale: [1, 1, 1.08] } },
    { orb: { hidden: false, scale: [1, 1, 1] }, crystals: { scale: [1, 1, 1.12] } },
    { orb: { hidden: false, scale: [1.35, 1.35, 1.35] }, crystals: { scale: [1, 1, 1.08] } },
    { orb: { hidden: false, scale: [1.6, 1.6, 1.6], offset: [0, 0, 2] } },
  ]);
  return establishment(
    [
      { color: 0x2e2a3a }, { color: 0x4a4560 }, { color: 0x1b1824 }, { color: 0xa855f7, emissive: true },
      { color: 0xf3e8ff, emissive: true }, { color: 0x2dd4bf, emissive: true }, { color: 0x6b7280 }, { color: 0x4b5563 },
      { color: 0x15121c }, { color: 0x07060a }, { color: 0x7c3aed, emissive: true },
    ],
    parts, 50, { idle, attack, ruined, site }, { idle: 4, attack: 10 }, true
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

// ── Dragon Volcano: Ignara's mountain on the north corner (replaced the North Rift) ──

/**
 * Basalt cone with a smoking crater and a cave mouth facing the island (+x/+y).
 * Its look counts the waves to the next cave opening (scene/volcano.ts picks one):
 *   stage1 … stage4  cold → crater glow → first lava seams → cracks and heavy smoke
 *   open             rubble gone, the mouth roars with firelight, lava pours down the face
 *   erupt            the rumble before a magma flow: plume, lava fountain, ash
 *   dormant          Ignara slain: cold crust, thin smoke
 */
const volcano = (): StructureModel => {
  const M = {
    rock: 0, rockMid: 1, rockLit: 2, rockDark: 3, ash: 4, magma: 5, magmaHot: 6, ember: 7,
    crust: 8, smoke: 9, smokeLight: 10, cave: 11, glow: 12, glowDim: 13,
  };
  const C = 32;
  const TOP = 46;        // crater rim height
  const R0 = 31, RT = 8; // base / rim radius
  // Concave volcanic profile: a broad apron at the foot, steep near the crater
  const radiusAt = (z: number) => RT + (R0 - RT) * Math.pow(Math.max(0, 1 - z / TOP), 1.7);
  // Deterministic crag noise
  const n = (i: number) => { const s = Math.sin(i * 127.1) * 43758.5453; return s - Math.floor(s); };
  // The mouth faces the island: the diagonal toward +x / +y
  const MX = Math.SQRT1_2, MY = Math.SQRT1_2;
  const onFace = (ang: number, z: number, out = 0) => {
    const r = radiusAt(z) + out;
    return [C + Math.cos(ang) * r, C + Math.sin(ang) * r, z] as [number, number, number];
  };
  const FRONT = Math.PI / 4;

  // ── Mountain: stacked rings, strata, crags and a shoulder ridge
  const body: Shape[] = [];
  const steps = 23;
  for (let i = 0; i < steps; i++) {
    const z = (TOP / steps) * i;
    // Wobbling rings (radius and centre drift) so no level reads as a clean stripe
    const wob = (n(i + 900) - 0.5) * 2.2;
    body.push(cyl(C + (n(i + 950) - 0.5) * 1.6, C + (n(i + 980) - 0.5) * 1.6, z, radiusAt(z) + wob, TOP / steps + 0.05, M.rock));
  }
  // Lava-rock ridges running down the slopes (darker gullies, lit spines)
  for (let k = 0; k < 9; k++) {
    const ang = (k / 9) * Math.PI * 2 + n(k + 40) * 0.4;
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 6; i++) pts.push(onFace(ang + (n(k * 7 + i) - 0.5) * 0.12, 3 + (TOP - 8) * (i / 6), -0.4));
    body.push(...chain(pts, 2.2, 1.1, k % 2 ? M.rockLit : M.rockDark, 3));
  }
  for (let i = 0; i < 70; i++) {
    const ang = n(i) * Math.PI * 2;
    const z = 2 + n(i + 50) * (TOP - 6);
    const [x, y] = onFace(ang, z, -0.6);
    const r = 1.8 + n(i + 99) * 2.6;
    body.push(ball(x, y, z, r, n(i + 7) > 0.6 ? M.rockLit : n(i + 7) > 0.3 ? M.rockMid : M.rockDark));
  }
  // A lower shoulder on the left flank breaks the cone's symmetry
  body.push(ell(C - 8, C + 14, 8, 15, 11, 10, M.rock), ell(C - 9, C + 15, 13, 9, 7, 5, M.rockLit));
  body.push(ell(C + 16, C - 6, 6, 11, 10, 7, M.rockMid));
  // Ash on the upper slopes
  for (const a of around(10, radiusAt(TOP - 4) - 0.4, 0.3)) body.push(ball(C + a.c, C + a.s, TOP - 4, 1.6, M.ash));
  // Crater lip and throat
  body.push(cyl(C, C, TOP - 1, RT + 0.6, 1.4, M.rockLit), cyl(C, C, TOP - 3, RT - 2.2, 3.4, M.cave));

  // ── Cave mouth at the foot, facing the island: a tunnel CUT INTO the slope
  // (material -1 carves voxels out of the mountain), not a dome stuck on it.
  // Dark rock lines the tunnel, arch stones sit flush with the slope, the
  // firelight burns deep inside and the rubble seal fills the opening.
  const CARVE = -1;
  const MD = 25.5;                                   // tunnel centre, a little inside the slope
  const mx = C + MX * MD, my = C + MY * MD;
  const PX = MY, PY = -MX;                           // across the opening
  const at = (out: number, across: number, z: number): [number, number, number] =>
    [mx + MX * out + PX * across, my + MY * out + PY * across, z];
  const ARCH_W = 6.2, ARCH_H = 9;
  const archStones: Shape[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = Math.PI * (i / 10);                     // 0 → π: one jamb, over the top, the other jamb
    const across = Math.cos(t) * (ARCH_W + 1.4);
    const z = Math.sin(t) * (ARCH_H + 1.2);
    // Each stone sits on the slope surface at its height
    const out = radiusAt(z) - MD + 0.2;
    archStones.push(ball(...at(out, across, Math.max(1, z)), i === 5 ? 2.3 : 1.9, i % 2 ? M.rockLit : M.rockMid));
  }
  const mouth: Shape[] = [
    // Dark rock shell inside the mountain (becomes the tunnel walls once carved)
    ell(...at(-1.5, 0, 3), ARCH_W + 2.4, ARCH_W + 2.4, ARCH_H + 2.2, M.cave),
    ell(...at(-4, 0, 3), ARCH_W + 1.2, ARCH_W + 1.2, ARCH_H + 1, M.rockDark),
    // The opening itself, carved through to the outside
    ell(...at(3.5, 0, 0), ARCH_W, ARCH_W + 3, ARCH_H, CARVE),
    ell(...at(-0.5, 0, 0), ARCH_W - 1, ARCH_W - 1, ARCH_H - 1.2, CARVE),
    ...archStones,
    // Threshold slab worn flat by the brood's comings and goings
    ell(...at(5.5, 0, 0.3), 4.5, 4.5, 0.6, M.rockMid),
  ];
  // Fire deep inside the tunnel: a hot core at the back and a lit floor running out
  const mouthGlow: Shape[] = [
    ell(...at(-3.5, 0, 3.5), 2.6, 2.6, 3.4, M.glow),
    ell(...at(-1, 0, 0.6), 1.8, 1.8, 0.7, M.magma), ell(...at(1.5, 0, 0.5), 1.4, 1.4, 0.5, M.magma),
  ];
  const mouthEmber: Shape[] = [ell(...at(-3.5, 0, 3), 2.2, 2.2, 2.6, M.glowDim)];
  // Sealed: rubble piled inside the arch
  const rubble: Shape[] = [];
  for (let i = 0; i < 12; i++) {
    const k = (i % 4) - 1.5, row = Math.floor(i / 4);
    rubble.push(ball(...at(1.2 + row * 0.4, k * 2.9, 1.8 + row * 2.8), 2.2 - row * 0.2, n(i + 300) > 0.5 ? M.rockMid : M.rockLit));
  }
  // Glowing cracks between the rubble stones (stage 3+)
  const rubbleCracks: Shape[] = [-1, 0, 1].map((k) => {
    const [x, y, z] = at(3.4, k * 2.9, 2 + Math.abs(k) * 2.4);
    return box(x - 0.35, y - 0.35, z, x + 0.35, y + 0.35, z + 1.6, M.magma);
  });

  // ── Lava seams down the visible faces (they light up stage by stage)
  const seam = (ang: number, len: number, seed: number): Shape[] => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 5; i++) {
      const z = TOP - 1 - (len * i) / 5;
      pts.push(onFace(ang + (n(seed + i) - 0.5) * 0.18, z, 0.5));
    }
    return chain(pts, 1.1, 0.7, M.magma, 3);
  };
  const seam1 = seam(FRONT - 0.32, 22, 11);
  const seam2 = seam(FRONT + 0.36, 30, 23);
  const seam3 = seam(FRONT + 0.05, 36, 37);
  // ── Crater: a dull red glow early, a boiling lava pool later
  const craterDim: Shape[] = [cyl(C, C, TOP - 0.6, RT - 2.6, 0.8, M.crust), ball(C, C, TOP + 0.2, 2.4, M.ember)];
  const craterHot: Shape[] = [cyl(C, C, TOP - 0.4, RT - 2.2, 0.9, M.magma), ball(C, C, TOP + 0.6, 3, M.magmaHot), ball(C + 2.6, C - 1.8, TOP + 0.4, 1.6, M.magmaHot)];
  // ── Open cave: lava spilling over the lip and down to the mouth
  const flowPts: [number, number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const z = TOP - (TOP - 9) * (i / 8);
    flowPts.push(onFace(FRONT + Math.sin(i * 0.9) * 0.1, z, 0.9));
  }
  const flow: Shape[] = [...chain(flowPts, 1.6, 2.2, M.magma, 3), ...chain(flowPts.slice(2), 0.8, 1, M.magmaHot, 2)];
  // ── Smoke: three puffs that rise and swell (offset per frame)
  const puff = (dx: number, dy: number, r: number, mat: number): Shape[] => [
    ball(C + dx, C + dy, TOP + 4, r, mat), ball(C + dx + r * 0.6, C + dy - r * 0.3, TOP + 4 + r * 0.5, r * 0.75, mat), ball(C + dx - r * 0.5, C + dy + r * 0.4, TOP + 3.6, r * 0.7, mat),
  ];
  // ── Eruption plume and fountain
  const plume: Shape[] = [
    ...chain([[C, C, TOP], [C + 0.5, C - 0.5, TOP + 6], [C - 0.5, C + 0.5, TOP + 11]], 2.6, 1.6, M.magma, 3),
    ball(C, C, TOP + 12, 2.2, M.magmaHot),
    ...around(6, 4.5, 0.4).map((a) => ball(C + a.c, C + a.s, TOP + 7 + (a.a % 1) * 3, 1, M.ember)),
  ];
  const ashCloud: Shape[] = [ball(C, C, TOP + 17, 6.5, M.smoke), ball(C + 4, C - 3, TOP + 15, 4.8, M.smokeLight), ball(C - 4, C + 3, TOP + 16, 5, M.smoke)];
  const embers: Shape[] = Array.from({ length: 8 }, (_, i) => ball(C + (n(i + 500) - 0.5) * 12, C + (n(i + 600) - 0.5) * 12, TOP + 3 + n(i + 700) * 8, 0.55, M.ember));

  const parts: Part[] = [
    { name: 'frame', pivot: [C, C, 0], shapes: [] },
    { name: 'body', parent: 'frame', pivot: [C, C, 0], shapes: body },
    { name: 'mouth', parent: 'frame', pivot: [mx, my, 6], shapes: mouth },
    { name: 'mouthEmber', parent: 'frame', pivot: [mx, my, 6], shapes: mouthEmber },
    { name: 'mouthGlow', parent: 'frame', pivot: [mx, my, 6], shapes: mouthGlow },
    { name: 'rubble', parent: 'frame', pivot: [mx, my, 2], shapes: rubble },
    { name: 'rubbleCracks', parent: 'frame', pivot: [mx, my, 2], shapes: rubbleCracks },
    { name: 'seam1', parent: 'frame', pivot: [C, C, TOP], shapes: seam1 },
    { name: 'seam2', parent: 'frame', pivot: [C, C, TOP], shapes: seam2 },
    { name: 'seam3', parent: 'frame', pivot: [C, C, TOP], shapes: seam3 },
    { name: 'craterDim', parent: 'frame', pivot: [C, C, TOP], shapes: craterDim },
    { name: 'craterHot', parent: 'frame', pivot: [C, C, TOP], shapes: craterHot },
    { name: 'flow', parent: 'frame', pivot: [C, C, TOP], shapes: flow },
    { name: 'smokeA', parent: 'frame', pivot: [C, C, TOP + 4], shapes: puff(0, 0, 3.4, M.smoke) },
    { name: 'smokeB', parent: 'frame', pivot: [C, C, TOP + 4], shapes: puff(2.5, -2, 2.8, M.smokeLight) },
    { name: 'smokeC', parent: 'frame', pivot: [C, C, TOP + 4], shapes: puff(-2.5, 2, 3, M.smoke) },
    { name: 'plume', parent: 'frame', pivot: [C, C, TOP], shapes: plume },
    { name: 'ash', parent: 'frame', pivot: [C, C, TOP + 15], shapes: ashCloud },
    { name: 'embers', parent: 'frame', pivot: [C, C, TOP + 4], shapes: embers },
  ];

  /** Rising smoke: each puff climbs and swells over the loop, staggered so the column never empties. */
  const smoke = (i: number, frames: number, rise: number, swell: number, show: string[]): Pose => {
    const pose: Pose = {};
    show.forEach((name, k) => {
      const t = ((i / frames) + k / show.length) % 1;
      pose[name] = { offset: [t * 2.2, -t * 1.6, t * rise], scale: [1 + t * swell, 1 + t * swell, 1 + t * swell] };
    });
    for (const name of ['smokeA', 'smokeB', 'smokeC']) if (!show.includes(name)) pose[name] = { hidden: true };
    return pose;
  };
  const allFx = hide('mouthGlow', 'mouthEmber', 'rubbleCracks', 'seam1', 'seam2', 'seam3', 'craterDim', 'craterHot', 'flow', 'plume', 'ash', 'embers');
  const lit = (...names: string[]): Pose => Object.fromEntries(names.map((name) => [name, { hidden: false }]));
  const loop = (frames: number, base: Pose, each: (i: number) => Pose): Pose[] =>
    withBase(base, Array.from({ length: frames }, (_, i) => each(i)));
  const pulse = (i: number, frames: number, lo: number, hi: number) => lo + (hi - lo) * (0.5 + 0.5 * Math.sin((i / frames) * Math.PI * 2));

  const F = 8;
  const stage1 = loop(F, allFx, (i) => smoke(i, F, 6, 0.4, ['smokeA']));
  const stage2 = loop(F, { ...allFx, ...lit('craterDim') }, (i) => ({
    ...smoke(i, F, 8, 0.5, ['smokeA', 'smokeB']),
    craterDim: { hidden: false, scale: [1, 1, pulse(i, F, 0.8, 1.2)] },
  }));
  const stage3 = loop(F, { ...allFx, ...lit('craterDim', 'seam1', 'rubbleCracks', 'mouthEmber') }, (i) => ({
    ...smoke(i, F, 9, 0.6, ['smokeA', 'smokeB']),
    seam1: { hidden: i % 4 === 3 },
    mouthEmber: { hidden: false, scale: [pulse(i, F, 0.8, 1), pulse(i, F, 0.8, 1), pulse(i, F, 0.8, 1)] },
  }));
  const stage4 = loop(F, { ...allFx, ...lit('craterHot', 'seam1', 'seam2', 'rubbleCracks', 'mouthEmber', 'embers') }, (i) => ({
    ...smoke(i, F, 11, 0.75, ['smokeA', 'smokeB', 'smokeC']),
    seam2: { hidden: i % 3 === 2 },
    embers: { offset: [0, 0, (i / F) * 5] },
    craterHot: { scale: [1, 1, pulse(i, F, 0.9, 1.3)] },
  }));
  const open = loop(F, { ...allFx, rubble: { hidden: true }, ...lit('craterHot', 'seam1', 'seam2', 'seam3', 'mouthGlow', 'flow', 'embers') }, (i) => ({
    ...smoke(i, F, 13, 0.9, ['smokeA', 'smokeB', 'smokeC']),
    mouthGlow: { scale: [pulse(i, F, 0.85, 1.15), pulse(i, F, 0.85, 1.15), pulse(i, F, 0.9, 1.1)] },
    flow: { offset: [0, 0, -((i % 4) * 0.35)] },
    embers: { offset: [0, 0, (i / F) * 7] },
    craterHot: { scale: [1, 1, pulse(i, F, 0.9, 1.4)] },
  }));
  const erupt = loop(F, { ...allFx, ...lit('craterHot', 'seam1', 'seam2', 'seam3', 'plume', 'ash', 'embers', 'rubbleCracks', 'mouthEmber') }, (i) => ({
    ...smoke(i, F, 14, 1, ['smokeA', 'smokeB', 'smokeC']),
    plume: { scale: [1, 1, pulse(i, F, 0.7, 1.35)] },
    ash: { offset: [0, 0, (i / F) * 4], scale: [1 + (i / F) * 0.5, 1 + (i / F) * 0.5, 1 + (i / F) * 0.4] },
    embers: { offset: [0, 0, (i / F) * 10] },
  }));
  const dormant = loop(4, { ...allFx }, (i) => smoke(i, 4, 4, 0.25, ['smokeB']));
  return {
    size: [64, 64, 66], foot: [C, C, 0],
    materials: [
      { color: 0x3a3330 }, { color: 0x4a423d }, { color: 0x6b615a }, { color: 0x221d1b }, { color: 0x8a817a },
      { color: 0xf97316, emissive: true }, { color: 0xfde047, emissive: true }, { color: 0xdc2626, emissive: true },
      { color: 0x5b1d10 }, { color: 0x57534e }, { color: 0x78716c }, { color: 0x0c0a09 },
      { color: 0xea580c, emissive: true }, { color: 0x9a3412, emissive: true },
    ],
    parts,
    animations: { idle: stage1, stage1, stage2, stage3, stage4, open, erupt, dormant },
    rates: { idle: 6, stage1: 5, stage2: 6, stage3: 7, stage4: 8, open: 9, erupt: 10, dormant: 3 },
    loops: ['idle', 'stage1', 'stage2', 'stage3', 'stage4', 'open', 'erupt', 'dormant'],
  };
};

const portal = (): StructureModel => {
  const M = { stone: 0, stoneDark: 1, stoneLight: 2, rune: 3, mid: 4, light: 5, core: 6, arm: 7, ember: 8, floor: 9, bone: 10, swirl: 11 };
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
        // Glowing rune carved into every other block's face
        if (i % 2 === 1) out.push(box(x - 0.6, C + 2, z - 0.8, x + 0.6, C + 2.4, z + 0.8, M.rune));
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
        // Broken outer arches either side (one still has its lintel)
        box(0, 2, 0, 2.6, 4.6, 11, M.stoneDark), box(0, 8.4, 0, 2.6, 11, 9, M.stoneDark),
        box(0, 2, 11, 2.6, 7.5, 13, M.stone), box(0.5, 2.6, 6, 1.1, 3.4, 9, M.rune),
        box(31, 23, 0, 33.6, 25.6, 8, M.stoneDark), box(31, 29.4, 0, 33.6, 32, 5, M.stoneDark),
        box(31.5, 25.6, 4, 32.1, 26.4, 7, M.rune),
        // Cracked flagstones
        box(C - 6, C + 5, 1.6, C + 6, C + 5.6, 1.8, M.stoneDark), box(C + 4, C - 7, 1.6, C + 4.6, C + 3, 1.8, M.stoneDark),
      ],
    },
    { name: 'ringLow', parent: 'frame', pivot: [C, C, RZ], shapes: arch(0, 24) },
    {
      name: 'ringTop', parent: 'frame', pivot: [C, C, RZ], shapes: [
        ...arch(24, 40),
        box(C - 2.2, C - 2.2, 29, C + 2.2, C + 2.2, 34, M.stoneLight),          // keystone
        ell(C, C + 2.2, 31.5, 1.2, 0.5, 1.4, M.rune),
        // Skull crowning the keystone, eyes lit by the rift
        ell(C, C + 0.5, 36, 2.6, 2.4, 2.4, M.bone),
        box(C - 1.6, C + 1, 33.4, C + 1.6, C + 2.6, 35, M.bone),
        box(C - 1.5, C + 2.6, 35.6, C - 0.4, C + 3, 36.8, M.rune), box(C + 0.4, C + 2.6, 35.6, C + 1.5, C + 3, 36.8, M.rune),
      ],
    },
    {
      name: 'vortex', parent: 'frame', pivot: [C, C, RZ], shapes: [
        ell(C, C - 0.2, RZ, 10.6, 0.9, 11.4, M.swirl),
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
      { color: 0xd6d3d1 }, { color: 0x1d4ed8, emissive: true },
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

// ── 6. Harpy Aerie (Brimstone Perch) — obsidian pillars crowned by a bone nest, sulfur braziers ─

const perch = (): StructureModel => {
  // Harpy Aerie: jagged obsidian pillars crowned by a great bone-and-feather nest, sulfur braziers below
  const M = { obsidian: 0, obsidianHi: 1, obsidianDk: 2, nest: 3, nestDk: 4, bone: 5, egg: 6, sulfur: 7, sulfurHot: 8, banner: 9, pole: 10, edge: 11, basalt: 12, feather: 13 };
  const C = 25.5;
  // A faceted pillar: stacked boxes that twist and narrow
  const pillar = (x: number, y: number, h: number, w: number, twist: number): Shape[] =>
    Array.from({ length: 7 }, (_, i) => {
      const k = i / 7, ww = w * (1 - k * 0.45);
      const dx = Math.sin(i * twist) * 1.2, dy = Math.cos(i * twist) * 1.2;
      return box(x + dx - ww, y + dy - ww, 2 + (h / 7) * i, x + dx + ww, y + dy + ww, 2 + (h / 7) * (i + 1) + 0.05, i % 3 === 1 ? M.obsidianHi : M.obsidian);
    });
  const NZ = 38; // nest height
  const parts: Part[] = [
    {
      name: 'ground', pivot: [25, 25, 0], shapes: [
        ...pad(M.basalt, M.edge),
        ell(40, 40, 2.6, 4, 3, 0.4, M.sulfur), ell(44, 33, 2.6, 2.4, 2, 0.4, M.sulfur), ell(12, 42, 2.6, 2.6, 2.2, 0.4, M.sulfur),
      ],
    },
    {
      name: 'crag', pivot: [C, C, 2], shapes: [
        ell(C - 3, C - 3, 4, 14, 14, 5, M.obsidianDk),
        ...pillar(C - 4, C - 4, NZ - 4, 5.5, 0.6),
        ...pillar(C + 7, C - 9, 22, 3.6, 0.9),
        ...pillar(C - 9, C + 7, 18, 3.4, 1.1),
        ...pillar(C + 9, C + 6, 11, 2.6, 0.7),
        // Shards jutting from the base
        box(C + 4, C + 10, 2, C + 6, C + 12, 9, M.obsidianHi), box(C + 12, C - 1, 2, C + 14, C + 1, 7, M.obsidian),
      ],
    },
    {
      name: 'nest', parent: 'crag', pivot: [C - 4, C - 4, NZ], shapes: [
        // Woven rim of branches and bones
        ...around(16, 7.5, 0.1).map(({ c, s }, i) => ell(C - 4 + c, C - 4 + s, NZ + 1, 2.2, 2.2, 1.6, i % 4 === 0 ? M.bone : i % 2 ? M.nest : M.nestDk)),
        cyl(C - 4, C - 4, NZ - 1, 7, 1.6, M.nestDk),
        // Ribs sticking up out of the weave
        ...around(5, 7.8, 0.5).map(({ c, s }) => box(C - 4 + c - 0.4, C - 4 + s - 0.4, NZ + 1, C - 4 + c + 0.4, C - 4 + s + 0.4, NZ + 5, M.bone)),
        // Eggs glowing with brimstone
        ell(C - 5, C - 3, NZ + 1.6, 1.6, 1.6, 2.1, M.egg), ell(C - 2.6, C - 5.4, NZ + 1.5, 1.4, 1.4, 1.9, M.egg),
        // Black feathers drifting off the rim
        ell(C + 3, C - 9, NZ + 2, 0.5, 2.4, 0.4, M.feather), ell(C - 10, C + 2, NZ + 1, 2.2, 0.5, 0.4, M.feather),
      ],
    },
    {
      name: 'banners', parent: 'crag', pivot: [C, C, 2], shapes: [
        box(C + 7 - 0.4, C - 9 - 0.4, 24, C + 7 + 0.4, C - 9 + 0.4, 31, M.pole), box(C + 7.4, C - 9.2, 26, C + 7.6, C - 4.5, 30.5, M.banner),
        box(C - 9 - 0.4, C + 7 - 0.4, 20, C - 9 + 0.4, C + 7 + 0.4, 27, M.pole), box(C - 9.2, C + 7.4, 22, C - 4.5, C + 7.6, 26.5, M.banner),
      ],
    },
    {
      name: 'braziers', pivot: [C, C, 2], shapes: [
        ...[[42, 20], [20, 42]].flatMap(([x, y]) => [
          cyl(x, y, 2, 1.8, 3.4, M.obsidianHi), cyl(x, y, 5.4, 2.4, 1, M.obsidianDk),
          ell(x, y, 7.6, 1.8, 1.8, 2.6, M.sulfur), ell(x, y, 7.2, 1, 1, 1.6, M.sulfurHot),
        ]),
      ],
    },
    {
      name: 'gust', pivot: [C - 4, C - 4, NZ + 3], shapes: [
        ...around(8, 6, 0.3).map(({ c, s }, i) => ell(C - 4 + c, C - 4 + s, NZ + 4 + (i % 2) * 2, 0.6, 2.2, 0.5, i % 3 === 0 ? M.sulfurHot : M.feather)),
        ...around(5, 3.5, 0.9).map(({ c, s }) => box(C - 4 + c - 0.5, C - 4 + s - 0.5, NZ + 6, C - 4 + c + 0.5, C - 4 + s + 0.5, NZ + 8, M.obsidianHi)),
      ],
    },
    rubblePart(M.obsidianDk, M.basalt),
    siteScaffold(M.pole),
  ];
  const body = ['crag', 'nest', 'banners', 'braziers'];
  const { base, ruined, site } = establishmentPoses(parts, body, ['gust']);
  const idle = withBase(base, [
    { braziers: { scale: [1, 1, 1] }, banners: { roll: 0 } },
    { braziers: { scale: [1, 1, 1.12] }, banners: { roll: 0.015 } },
    { braziers: { scale: [1, 1, 0.92] }, banners: { roll: 0.025 } },
    { braziers: { scale: [1, 1, 1.06] }, banners: { roll: 0.01 } },
  ]);
  const attack = withBase(base, [
    { gust: { hidden: false, scale: [0.6, 0.6, 0.6] } },
    { gust: { hidden: false, scale: [1.1, 1.1, 1.1], offset: [0, 0, 1] } },
    { gust: { hidden: false, scale: [1.6, 1.6, 1.4], offset: [0, 0, 2.5] } },
    { gust: { hidden: false, scale: [2, 2, 1.6], offset: [0, 0, 4] } },
  ]);
  return establishment(
    [
      { color: 0x1e1b2e }, { color: 0x4c4566 }, { color: 0x0f0d18 }, { color: 0x6b4e2e }, { color: 0x3f2d1c },
      { color: 0xe7e5e4 }, { color: 0xecfccb, emissive: true }, { color: 0xbef264, emissive: true }, { color: 0xfef08a, emissive: true },
      { color: 0x7f1d1d }, { color: 0x292524 }, { color: 0x0c0a12 }, { color: 0x2a2730 }, { color: 0x18181b },
    ],
    parts, 58, { idle, attack, ruined, site }, { idle: 4, attack: 10 }, true
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
    golem: 9, golemLight: 10, golemDark: 11, wood: 12, edge: 13, obsidian: 14, obsidianLight: 15, brick: 16, moss: 17,
  };
  // Golem stands in the middle on a rune circle; the four power pillars hold the corners
  const gx = 25, gy = 24;
  const PILLARS: Array<[number, number]> = [[7, 7], [7, 43], [43, 7], [43, 43]];
  const CROWN_Z = 22.5;
  const CORE: [number, number, number] = [gx, gy + 5.2, 19];
  const parts: Part[] = [
    {
      name: 'ground', pivot: [25, 25, 0], shapes: [
        ...pad(M.floor, M.edge),
        // Flagstones
        ...[10, 20, 30, 40].flatMap((t) => [box(t, 1, 2.4, t + 0.5, 50, 2.6, M.floorLight), box(1, t, 2.4, 50, t + 0.5, 2.6, M.floorLight)]),
        // Rune circle under the golem and the molten channel feeding it from the furnace
        ...around(16, 11, 0).map(({ c, s }) => ball(gx + c, gy + s, 2.6, 0.7, M.rune)),
        ...around(8, 7.5, 0.4).map(({ c, s }) => ball(gx + c, gy + s, 2.6, 0.5, M.runeCore)),
        box(24, 12, 2.3, 26, 14, 2.8, M.fire), box(24.4, 12, 2.6, 25.6, 14, 2.9, M.fireCore),
        // Pillar plinths
        ...PILLARS.flatMap(([x, y]) => [box(x - 4, y - 4, 2, x + 4, y + 4, 4, M.ironDark), box(x - 3.4, y - 3.4, 4, x + 3.4, y + 3.4, 5, M.obsidianLight)]),
        // Scattered embers and a slag heap
        ...[[33, 44], [36, 47], [15, 46]].map(([x, y]) => ball(x, y, 2.8, 0.5, M.fire)),
        ell(44, 26, 2.5, 3, 2.4, 1.6, M.ironDark), ball(44.5, 26, 3.6, 0.7, M.fire),
      ],
    },
    {
      // The four power pillars: obsidian shafts banded with runes, crowned by crystals that feed the golem
      name: 'pillars', pivot: [25, 25, 5], shapes: PILLARS.flatMap(([x, y]) => [
        cyl(x, y, 5, 2.2, 13.5, M.obsidian),
        box(x - 2.6, y - 2.6, 5, x + 2.6, y + 2.6, 6.5, M.obsidianLight),
        ...[9, 13, 17].map((z) => cyl(x, y, z, 2.4, 0.8, M.rune)),
        box(x - 2.8, y - 2.8, 18.5, x + 2.8, y + 2.8, 20, M.obsidianLight),   // capital
        ...cone(x, y, 20, 1.7, 5, M.rune, M.runeCore, 4),              // crystal crown
        ball(x, y, 21.2, 1, M.runeCore),
      ]),
    },
    {
      // Arcs of power from each crown down into the golem's core
      name: 'beams', pivot: [CORE[0], CORE[1], CORE[2]], shapes: PILLARS.flatMap(([x, y]) => {
        const mid: [number, number, number] = [(x + CORE[0]) / 2, (y + CORE[1]) / 2, CROWN_Z + 1];
        return chain([[x, y, CROWN_Z], mid, CORE], 0.7, 0.55, M.runeCore, 12);
      }),
    },
    {
      // A brick furnace at the back with a chimney and a fire mouth
      name: 'furnace', pivot: [25, 8, 2], shapes: [
        box(18, 3, 2, 32, 12, 15, M.brick),
        ...[5, 8, 11, 14].map((z) => box(17.8, 2.8, z, 32.2, 12.2, z + 0.4, M.golemDark)),
        box(21, 11.6, 4, 29, 12.4, 11, M.fire), box(23, 11.8, 5, 27, 12.6, 9, M.fireCore),
        box(22, 5, 15, 28, 10, 27, M.brick), box(21.5, 4.5, 26, 28.5, 10.5, 27.5, M.ironDark),
      ],
    },
    {
      // The stone golem: rounded boulders, not boards
      name: 'golem', pivot: [gx, gy, 2], shapes: [
        // Legs and feet
        ell(gx - 4.5, gy, 6, 3.4, 3.4, 4.6, M.golemDark), ell(gx + 4.5, gy, 6, 3.4, 3.4, 4.6, M.golemDark),
        ell(gx - 4.5, gy + 1, 2.8, 3.8, 4.4, 1.6, M.golem), ell(gx + 4.5, gy + 1, 2.8, 3.8, 4.4, 1.6, M.golem),
        // Hips, a barrel torso and a lighter chest slab
        ell(gx, gy, 11, 6.5, 4.6, 3, M.golemDark),
        ell(gx, gy, 17.5, 8, 5.8, 6.8, M.golem),
        ell(gx, gy + 2.4, 18.5, 5.6, 3.4, 4.6, M.golemLight),
        // Glowing cracks spreading from the core
        box(gx - 0.3, gy + 5.4, 13.5, gx + 0.3, gy + 5.8, 17, M.rune),
        box(gx - 4, gy + 5, 19.6, gx - 1.5, gy + 5.6, 20, M.rune), box(gx + 1.5, gy + 5, 18, gx + 4.2, gy + 5.6, 18.4, M.rune),
        // Massive shoulders with crystal growths and moss
        ell(gx - 8.5, gy, 21.5, 4.4, 4.4, 3.8, M.golemDark), ell(gx + 8.5, gy, 21.5, 4.4, 4.4, 3.8, M.golemDark),
        ...cone(gx - 9, gy - 1, 24, 1.2, 4, M.rune, M.runeCore, 3), ...cone(gx + 9.5, gy, 24, 1, 3.4, M.rune, M.runeCore, 3),
        ell(gx - 7.5, gy - 1.5, 24.6, 2.4, 2.2, 0.8, M.moss), ell(gx + 7, gy + 1, 24.6, 2, 2, 0.7, M.moss),
        // Sunken head between the shoulders, brow ridge over glowing eyes
        ell(gx + 0.6, gy + 1, 28, 4.2, 4, 3.4, M.golemLight),
        box(gx - 3.2, gy + 3.6, 29.6, gx + 4.6, gy + 5.2, 30.8, M.golemDark),     // brow
        box(gx - 2.4, gy + 4.6, 27.6, gx - 0.8, gy + 5.2, 28.8, M.runeCore), box(gx + 1.2, gy + 4.6, 27.6, gx + 2.8, gy + 5.2, 28.8, M.runeCore),
        // Eyes also on the face the camera sees
        box(gx + 4.2, gy - 1.2, 27.6, gx + 4.9, gy + 0.2, 28.8, M.runeCore), box(gx + 4.2, gy + 1.6, 27.6, gx + 4.9, gy + 3, 28.8, M.runeCore),
        box(gx + 4.1, gy - 2, 29.4, gx + 5, gy + 4, 30.4, M.golemDark),
      ],
    },
    {
      name: 'core', parent: 'golem', pivot: CORE, shapes: [ball(CORE[0], CORE[1], CORE[2], 2.2, M.rune), ball(CORE[0], CORE[1] + 0.6, CORE[2], 1.2, M.runeCore)],
    },
    {
      // Both arms hang to boulder fists; the attack slams them down
      name: 'arm', parent: 'golem', pivot: [gx, gy, 21], shapes: [-1, 1].flatMap((sx) => [
        ell(gx + sx * 10.5, gy, 16.5, 2.8, 2.8, 4.4, M.golem),
        ell(gx + sx * 11, gy + 0.5, 11.5, 2.6, 2.6, 2.4, M.golemDark),
        ell(gx + sx * 11.2, gy + 1, 7.5, 3.6, 3.6, 3.2, M.golemLight),
        box(gx + sx * 11.2 - 0.3, gy + 4.2, 7, gx + sx * 11.2 + 0.3, gy + 4.6, 9, M.rune),
      ]),
    },
    {
      // A real anvil: wide foot, narrow waist, flat face with a heel and a tapering horn
      name: 'anvil', pivot: [25, 41, 2], shapes: [
        box(20, 38, 2, 30, 44, 4, M.ironDark),
        box(21.5, 38.8, 4, 28.5, 43.2, 5, M.iron),
        box(23, 39.5, 5, 27, 42.5, 8.5, M.ironDark),
        box(19, 38.2, 8.5, 31, 43.8, 11.5, M.iron),
        box(19, 38.2, 11.2, 31, 43.8, 11.8, M.ironLight),
        box(17, 38.8, 9, 19, 43.2, 11.5, M.iron),                     // heel
        ell(33, 41, 10.2, 2.4, 2.4, 1.3, M.iron), ell(35.4, 41, 10.4, 1.4, 1.5, 0.9, M.iron), ball(37, 41, 10.6, 0.6, M.ironLight), // horn
        box(28.5, 40, 11.8, 29.5, 41, 12, M.ironDark),               // hardy hole
        // Red-hot ingot and a hammer resting on the face
        box(21, 39.5, 11.8, 25, 42, 12.8, M.fire), box(22, 40.2, 12.6, 24, 41.3, 13, M.fireCore),
        box(26, 40.5, 11.8, 30, 41.5, 12.6, M.wood), box(25.2, 39.6, 11.8, 26.8, 42.4, 14, M.ironDark),
      ],
    },
    {
      name: 'forge', parent: 'anvil', pivot: [23, 41, 13], shapes: [
        ell(23, 41, 13.5, 1.6, 1.4, 1, M.fire), ell(23, 41, 14.2, 0.8, 0.8, 0.8, M.fireCore),
      ],
    },
    {
      name: 'sparks', pivot: [23, 41, 14], shapes: around(9, 5, 0.2).map(({ c, s }, i) => ball(23 + c, 41 + s, 13 + (i % 3) * 2.5, 0.6, i % 2 ? M.fireCore : M.fire)),
    },
    rubblePart(M.floorLight, M.golemDark),
    siteScaffold(M.wood),
  ];
  const body = ['pillars', 'furnace', 'golem', 'core', 'arm', 'anvil', 'forge', 'beams'];
  const { base, ruined, site } = establishmentPoses(parts, body, ['sparks']);
  const ruinedOut: Pose = { ...ruined, ...hide('forge', 'sparks', 'beams') };
  // Idle: the pillars pulse power into the golem, its core throbs and the ingot glows
  const idle = withBase(base, [
    { beams: { scale: [1, 1, 1] }, core: { scale: [1, 1, 1] }, forge: { scale: [1, 1, 1] }, arm: { pitch: 0 } },
    { beams: { scale: [1.04, 1.04, 1.04] }, core: { scale: [1.2, 1.2, 1.2] }, forge: { scale: [1.2, 1.2, 1.3] }, arm: { pitch: 0.03 } },
    { beams: { hidden: true }, core: { scale: [0.9, 0.9, 0.9] }, forge: { scale: [0.9, 0.9, 0.9] }, arm: { pitch: 0.05 } },
    { beams: { scale: [0.97, 0.97, 0.97] }, core: { scale: [1.1, 1.1, 1.1] }, forge: { scale: [1.1, 1.1, 1.15] }, arm: { pitch: 0.02 } },
  ]);
  // Attack: the golem raises both fists and slams them down in a burst of sparks
  const attack = withBase(base, [
    { arm: { pitch: -0.6 }, core: { scale: [1.3, 1.3, 1.3] } },
    { arm: { pitch: -1.2 }, golem: { offset: [0, 0, 0.6] }, core: { scale: [1.5, 1.5, 1.5] } },
    { arm: { pitch: 0.35 }, golem: { offset: [0, 0, -0.4] }, sparks: { hidden: false, scale: [0.6, 0.6, 0.6] }, forge: { scale: [1.5, 1.5, 1.6] } },
    { arm: { pitch: 0.2 }, sparks: { hidden: false, scale: [1.3, 1.3, 1.2] } },
    { arm: { pitch: 0 } },
  ]);
  return establishment(
    [
      { color: 0x3a3a42 }, { color: 0x4a4a55 }, { color: 0x4b5563 }, { color: 0x6b7280 }, { color: 0x27272f },
      { color: 0x38bdf8, emissive: true }, { color: 0xe0f2fe, emissive: true }, { color: 0xf97316, emissive: true },
      { color: 0xfde047, emissive: true }, { color: 0x7d6a5c }, { color: 0x9c8876 }, { color: 0x4f4038 },
      { color: 0x6b4423 }, { color: 0x1f1f24 }, { color: 0x1c1626 }, { color: 0x3b2f4a }, { color: 0x7f2f1d }, { color: 0x4d6b2f },
    ],
    parts, 40, { idle, attack, ruined: ruinedOut, site }, { idle: 4, attack: 10 }
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

// ── Rift Sentinel — human crusade pylon guarding a rift (Technicians raise it) ─
// Marble plinth, steel column banded in gold with glowing arc conduits, and a
// gyro ring spinning round a floating arc crystal that fires the bolts.

const sentinel = (): StructureModel => {
  const M = { marble: 0, marbleDark: 1, steel: 2, steelDark: 3, gold: 4, arc: 5, arcCore: 6, crystal: 7, rubble: 8 };
  const C = 13;
  const parts: Part[] = [
    {
      name: 'base', pivot: [C, C, 0], shapes: [
        cyl(C, C, 0, 11.5, 2, M.marbleDark),                                   // octagonal footing
        cyl(C, C, 2, 10, 2.5, M.marble),
        cyl(C, C, 4.5, 8.4, 1, M.gold),                                        // gold trim
        cyl(C, C, 5.5, 7.4, 3, M.marble),
        ...around(4, 8.8, Math.PI / 4).map(({ c, s }) => box(C + c - 1.4, C + s - 1.4, 2, C + c + 1.4, C + s + 1.4, 9, M.marbleDark)),
        ...around(4, 8.8, Math.PI / 4).map(({ c, s }) => box(C + c - 1, C + s - 1, 9, C + c + 1, C + s + 1, 10, M.gold)),
      ],
    },
    {
      name: 'column', parent: 'base', pivot: [C, C, 8], shapes: [
        cyl(C, C, 8.5, 5, 8, M.steel),
        cyl(C, C, 16.5, 4.2, 8, M.steelDark),
        cyl(C, C, 24.5, 3.6, 6, M.steel),
        cyl(C, C, 15.8, 5.4, 1.2, M.gold), cyl(C, C, 23.8, 4.7, 1.2, M.gold), cyl(C, C, 30.2, 4.4, 1.2, M.gold),
        // Arc conduits on the faces the camera sees
        box(C + 4.6, C - 0.6, 9.5, C + 5.3, C + 0.6, 30, M.arc),
        box(C - 0.6, C + 4.6, 9.5, C + 0.6, C + 5.3, 30, M.arc),
        // Buttress fins
        ...[[1, 0], [0, 1], [-1, 0], [0, -1]].map(([dx, dy]) =>
          box(C + dx * 5 - (dy ? 0.6 : 0) - (dx < 0 ? 2.2 : 0), C + dy * 5 - (dx ? 0.6 : 0) - (dy < 0 ? 2.2 : 0), 8.5,
              C + dx * 5 + (dy ? 0.6 : 0) + (dx > 0 ? 2.2 : 0), C + dy * 5 + (dx ? 0.6 : 0) + (dy > 0 ? 2.2 : 0), 16, M.steelDark)),
      ],
    },
    {
      name: 'crown', parent: 'column', pivot: [C, C, 31], shapes: [
        cyl(C, C, 31, 5, 1.5, M.gold),
        ...around(4, 4.4, 0).map(({ c, s }) => box(C + c - 0.7, C + s - 0.7, 32.5, C + c + 0.7, C + s + 0.7, 38, M.gold)),
      ],
    },
    {
      name: 'ring', parent: 'column', pivot: [C, C, 38], shapes:
        around(14, 6.2, 0).map(({ c, s }, i) => box(C + c - 0.8, C + s - 0.8, 37.4, C + c + 0.8, C + s + 0.8, 38.6, i % 2 ? M.steel : M.gold)),
    },
    {
      name: 'crystal', parent: 'column', pivot: [C, C, 39], shapes: [
        ...pyramid(C, C, 39, 2.6, 6, M.crystal, 5),
        ...pyramid(C, C, 39, 2.6, -5, M.crystal, 5).map((sh) => sh),
        ball(C, C, 39, 1.6, M.arcCore),
      ],
    },
    {
      name: 'flare', parent: 'column', pivot: [C, C, 39], shapes: [
        ell(C, C, 39, 5.5, 5.5, 5.5, M.arc),
        ball(C, C, 39, 3, M.arcCore),
      ],
    },
    {
      name: 'rubble', pivot: [C, C, 0], shapes: [
        box(4, 6, 0, 11, 10, 3, M.marbleDark), box(14, 15, 0, 19, 21, 2.5, M.steelDark),
        box(9, 16, 0, 13, 19, 2, M.marble), ball(18, 8, 1.5, 1.6, M.crystal),
      ],
    },
  ];
  const base: Pose = { flare: { hidden: true }, rubble: { hidden: true } };
  const idle = withBase(base, Array.from({ length: 8 }, (_, i) => ({
    ring: { yaw: (i / 8) * (Math.PI / 2) },
    crystal: { offset: [0, 0, Math.sin((i / 8) * Math.PI * 2) * 0.8], yaw: (i / 8) * (Math.PI / 2) },
  })));
  const attack = withBase(base, [
    { ring: { yaw: 0.3 }, crystal: { scale: [1.15, 1.15, 1.15] }, flare: { hidden: false, scale: [0.6, 0.6, 0.6] } },
    { ring: { yaw: 0.9 }, crystal: { scale: [1.25, 1.25, 1.25] }, flare: { hidden: false } },
    { ring: { yaw: 1.4 }, crystal: { scale: [1.1, 1.1, 1.1] }, flare: { hidden: false, scale: [0.75, 0.75, 0.75] } },
    { ring: { yaw: 1.7 } },
  ]);
  const destroyed: Pose[] = [{
    ...hide('crown', 'ring', 'crystal', 'flare'),
    column: { pitch: 0.55, offset: [0, 0, -9] },
    rubble: { hidden: false },
  }];
  return {
    size: [26, 26, 48], foot: [C, C, 0],
    materials: [
      { color: 0xe7e5e4 }, { color: 0xa8a29e }, { color: 0x94a3b8 }, { color: 0x475569 }, { color: 0xeab308 },
      { color: 0x38bdf8, emissive: true }, { color: 0xffffff, emissive: true }, { color: 0x7dd3fc, emissive: true },
      { color: 0x57534e },
    ],
    parts,
    animations: { idle, attack, destroyed },
    rates: { idle: 8, attack: 12, destroyed: 1 },
    loops: ['idle'],
  };
};

// ── Registry ─────────────────────────────────────────────────────────────────

export type StructureKey =
  | 'castle' | 'quarry' | 'mine' | 'grove' | 'port' | 'cave' | 'spire' | 'portal'
  | 'trench' | 'crypt' | 'perch' | 'kennel'
  | 'foundry' | 'pavilion' | 'voidgate' | 'ossuary' | 'sentinel' | 'volcano';

// Order = bake order: the always-visible citadel, portals and spire first
export const STRUCTURE_MODELS: Record<StructureKey, () => StructureModel> = {
  castle, portal, sentinel, spire, quarry, mine, grove, port, cave,
  trench, crypt, perch, kennel,
  foundry, pavilion, voidgate: voidGate, ossuary, volcano,
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
