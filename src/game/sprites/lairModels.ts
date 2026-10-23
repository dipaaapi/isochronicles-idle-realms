import type { Part, Pose, Shape, VoxelModel } from './VoxelSprite';
import { withStateAnimations } from './stateAnimations';

/**
 * Creatures of the Dragon's Lair (game/lair/): the Giant Bat, Ignara's
 * Dragon Kin and the Magma Golem that guards her gate. Same rig as the other
 * characters (+x right, +y forward, +z up; parts body/head/arms/legs so the
 * hit / death / skill states are generated). The Matriarch herself is an
 * arena-scale multi-part renderer (game/lair/MatriarchRenderer.ts), not a sheet.
 */

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: number): Shape => ({
  kind: 'box', min: [x0, y0, z0], max: [x1, y1, z1], mat,
});
const ell = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, mat: number): Shape => ({
  kind: 'ellipsoid', center: [cx, cy, cz], radii: [rx, ry, rz], mat,
});
const ball = (cx: number, cy: number, cz: number, r: number, mat: number): Shape => ell(cx, cy, cz, r, r, r, mat);
const chain = (pts: Array<[number, number, number]>, r0: number, r1: number, mat: number, per = 3): Shape[] => {
  const out: Shape[] = [];
  const total = (pts.length - 1) * per;
  for (let i = 0; i < pts.length - 1; i++) {
    for (let k = 0; k < per; k++) {
      const t = k / per, a = pts[i], b = pts[i + 1];
      const r = r0 + (r1 - r0) * ((i * per + k) / Math.max(1, total));
      out.push(ball(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, r, mat));
    }
  }
  const last = pts[pts.length - 1];
  out.push(ball(last[0], last[1], last[2], r1, mat));
  return out;
};
const FLAP = [0.9, 0.4, -0.3, -0.7, -0.3, 0.4];

// ── Giant Bat: a cave-dark flyer with ember eyes and wide leather wings ────

const giantBat = (): VoxelModel => {
  const M = { fur: 0, furDark: 1, wing: 2, bone: 3, eye: 4, fang: 5, ear: 6 };
  const c = 20;
  const z = 14; // flies above the floor
  const wing = (sx: number): Shape[] => [
    ...chain([[c + sx * 2.5, c, z + 1], [c + sx * 9, c + 1, z + 3.5], [c + sx * 16, c - 1, z + 1]], 0.7, 0.45, M.bone, 3),
    ...[0, 1, 2].flatMap((i) => chain([[c + sx * (9 + i * 2.5), c + 1 - i, z + 3], [c + sx * (7 + i * 3.5), c - 4 - i, z - 1]], 0.45, 0.35, M.bone, 2)),
    ell(c + sx * 9, c - 1.5, z + 1, 7, 4, 0.7, M.wing),
    ell(c + sx * 13, c - 2.5, z, 3.5, 3, 0.6, M.wing),
  ];
  const parts: Part[] = [
    { name: 'body', pivot: [c, c, z], shapes: [ell(c, c, z, 3, 3.6, 3.4, M.fur), ell(c, c + 1.4, z - 0.6, 2.2, 2, 2.2, M.furDark)] },
    {
      name: 'head', parent: 'body', pivot: [c, c + 2.5, z + 2.5], shapes: [
        ball(c, c + 3, z + 3, 2.4, M.fur),
        ...[-1, 1].flatMap((sx) => [
          box(c + sx * 1.2 - 0.6, c + 2.4, z + 4.6, c + sx * 1.2 + 0.6 + sx * 0.6, c + 3.2, z + 7.2, M.ear),
          ball(c + sx * 0.9, c + 5, z + 3.4, 0.55, M.eye),
          box(c + sx * 0.5 - 0.2, c + 5, z + 1.4, c + sx * 0.5 + 0.2, c + 5.4, z + 2.4, M.fang),
        ]),
      ],
    },
    { name: 'arms', parent: 'body', pivot: [c, c, z + 1], shapes: [...wing(-1), ...wing(1)] },
    { name: 'legs', parent: 'body', pivot: [c, c - 2, z - 3], shapes: [...[-1, 1].flatMap((sx) => chain([[c + sx, c - 2, z - 3], [c + sx * 1.4, c - 3, z - 5.5]], 0.5, 0.4, M.bone, 2))] },
  ];
  const walk: Pose[] = FLAP.map((f, i) => ({
    arms: { roll: 0, scale: [1, 1, 1], offset: [0, 0, f * 1.6] },
    body: { offset: [0, 0, -f * 0.8], pitch: 0.15 },
    head: { pitch: i % 3 === 0 ? 0.05 : 0 },
  }));
  const attack: Pose[] = [
    { body: { pitch: -0.3, offset: [0, -1, 1] }, arms: { offset: [0, 0, 2] } },
    { body: { pitch: 0.5, offset: [0, 4, -3] }, head: { pitch: 0.4 }, arms: { offset: [0, 0, -1.5] } },
    { body: { pitch: 0.3, offset: [0, 3, -2] }, head: { pitch: 0.2 } },
    { body: { pitch: 0.1 } },
  ];
  const idle: Pose[] = FLAP.map((f) => ({ arms: { offset: [0, 0, f * 1.2] }, body: { offset: [0, 0, -f * 0.5] } }));
  return {
    size: [40, 34, 26], foot: [c, c, 0], pixelsPerVoxel: 1.1,
    materials: [
      { color: 0x3f3a4a }, { color: 0x27232f }, { color: 0x5b2333 }, { color: 0x1c1917 },
      { color: 0xf97316, emissive: true }, { color: 0xf5f5f4 }, { color: 0x6b2d3a },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── Dragon Kin: a winged drake of Ignara's brood, ember-scaled, spits fire ─

const dragonKin = (): VoxelModel => {
  const M = { scale: 0, scaleDark: 1, belly: 2, horn: 3, eye: 4, wing: 5, flame: 6, claw: 7 };
  const c = 20;
  const parts: Part[] = [
    {
      name: 'legs', pivot: [c, c, 5], shapes: [
        ...[-1, 1].flatMap((sx) => [
          ...chain([[c + sx * 3, c - 2, 6], [c + sx * 4, c - 2.5, 3], [c + sx * 3.5, c - 1, 0.6]], 1.6, 1, M.scaleDark, 2),
          ...chain([[c + sx * 3, c + 3, 6], [c + sx * 3.5, c + 3.5, 3], [c + sx * 3.2, c + 4.5, 0.6]], 1.4, 0.9, M.scaleDark, 2),
          box(c + sx * 3.2 - 0.9, c + 4.6, 0, c + sx * 3.2 + 0.9, c + 6, 0.8, M.claw),
        ]),
      ],
    },
    {
      name: 'body', pivot: [c, c, 7], shapes: [
        ell(c, c, 8, 4.4, 6.5, 3.8, M.scale),
        ell(c, c + 0.5, 6.4, 3.2, 5.2, 2.2, M.belly),
        ...[0, 1, 2, 3].map((i) => box(c - 0.5, c - 4 + i * 2.4, 11.4, c + 0.5, c - 3 + i * 2.4, 12.6, M.horn)),
        ...chain([[c, c - 6, 8], [c, c - 10, 7], [c + 1.5, c - 14, 6], [c + 3, c - 17, 5]], 2.4, 0.7, M.scaleDark, 3),
      ],
    },
    {
      name: 'head', parent: 'body', pivot: [c, c + 6, 10], shapes: [
        ...chain([[c, c + 5, 10], [c, c + 8, 13]], 2.2, 1.8, M.scale, 2),
        ell(c, c + 10, 13.5, 2.4, 3.6, 2.2, M.scale),
        ell(c, c + 12.5, 12.8, 1.6, 1.8, 1.2, M.scaleDark),
        ...[-1, 1].flatMap((sx) => [
          ...chain([[c + sx * 1.4, c + 8.6, 15], [c + sx * 2.4, c + 6.5, 17.5]], 0.6, 0.35, M.horn, 2),
          ball(c + sx * 1.5, c + 11.2, 14.4, 0.55, M.eye),
        ]),
        ball(c, c + 14, 12.6, 0.8, M.flame),
      ],
    },
    {
      name: 'arms', parent: 'body', pivot: [c, c + 1, 11], shapes: [
        ...[-1, 1].flatMap((sx) => [
          ...chain([[c + sx * 3.5, c + 1, 11], [c + sx * 9, c - 1, 15], [c + sx * 14, c - 3, 13]], 0.8, 0.5, M.scaleDark, 3),
          ell(c + sx * 9, c - 2.5, 12.5, 5.5, 3.5, 0.6, M.wing),
        ]),
      ],
    },
  ];
  const walk: Pose[] = [0, 1, 2, 3].map((i) => ({
    legs: { offset: [0, [0.6, 0, -0.6, 0][i], i % 2 ? 0.5 : 0] },
    body: { roll: [0.04, 0, -0.04, 0][i] },
    arms: { offset: [0, 0, [0.8, 0.2, -0.4, 0.2][i]] },
    head: { yaw: [0.06, 0, -0.06, 0][i] },
  }));
  const attack: Pose[] = [
    { head: { pitch: -0.4, offset: [0, -1, 1] }, arms: { offset: [0, 0, 1.5] } },
    { head: { pitch: 0.35, offset: [0, 2, -0.5] }, body: { pitch: 0.08 } },
    { head: { pitch: 0.25, offset: [0, 1.5, 0] } },
    { head: { pitch: 0 } },
  ];
  const idle: Pose[] = [0, 1, 2, 3].map((i) => ({ head: { pitch: [0, -0.05, 0, 0.05][i] }, arms: { offset: [0, 0, [0, 0.4, 0, -0.4][i]] } }));
  return {
    size: [40, 44, 26], foot: [c, c + 2, 0], pixelsPerVoxel: 1.05,
    materials: [
      { color: 0xb91c1c }, { color: 0x7f1d1d }, { color: 0xfbbf24 }, { color: 0x292524 },
      { color: 0xfde047, emissive: true }, { color: 0x9a3412 }, { color: 0xf97316, emissive: true }, { color: 0xe7e5e4 },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── Magma Golem: basalt plates over a molten core, guardian of Ignara's gate ─

const magmaGolem = (): VoxelModel => {
  const M = { rock: 0, rockDark: 1, magma: 2, core: 3, crust: 4 };
  const c = 22;
  const plates = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): Shape[] => [
    ell(cx, cy, cz, rx, ry, rz, M.rock),
    ell(cx + rx * 0.3, cy + ry * 0.4, cz + rz * 0.2, rx * 0.5, ry * 0.5, rz * 0.4, M.rockDark),
  ];
  const parts: Part[] = [
    {
      name: 'legs', pivot: [c, c, 7], shapes: [
        ...[-1, 1].flatMap((sx) => [...plates(c + sx * 4.5, c, 4, 3.2, 3.2, 4.2), box(c + sx * 4.5 - 0.6, c + 2.6, 2, c + sx * 4.5 + 0.6, c + 3.2, 6, M.magma)]),
      ],
    },
    {
      name: 'body', pivot: [c, c, 12], shapes: [
        ...plates(c, c, 14, 7.5, 5.5, 6.5),
        ell(c, c + 4.2, 14, 3.4, 1.6, 3.4, M.magma),
        ball(c, c + 5, 14, 1.8, M.core),
        ...[-1, 1].map((sx) => box(c + sx * 3 - 0.5, c + 4.5, 9, c + sx * 3 + 0.5, c + 5.4, 19, M.magma)),
        ell(c, c - 1, 20, 6, 4.5, 1.6, M.crust),
      ],
    },
    {
      name: 'head', parent: 'body', pivot: [c, c + 1, 21], shapes: [
        ...plates(c, c + 1.5, 23, 3.2, 3, 2.6),
        ...[-1, 1].map((sx) => ball(c + sx * 1.3, c + 4.2, 23.4, 0.7, M.core)),
        box(c - 1.6, c + 4.2, 21.4, c + 1.6, c + 4.8, 22, M.magma),
      ],
    },
    {
      name: 'arms', parent: 'body', pivot: [c, c, 18], shapes: [
        ...[-1, 1].flatMap((sx) => [
          ...plates(c + sx * 9, c, 17, 3, 3, 3),
          ...plates(c + sx * 10, c + 1, 11, 3, 3, 3.5),
          ...plates(c + sx * 10.5, c + 2, 6, 3.6, 3.4, 3),
          box(c + sx * 10.5 - 0.5, c + 4.6, 4.5, c + sx * 10.5 + 0.5, c + 5.2, 8, M.magma),
        ]),
      ],
    },
  ];
  const walk: Pose[] = [0, 1, 2, 3].map((i) => ({
    legs: { offset: [0, [0.8, 0, -0.8, 0][i], 0] },
    body: { roll: [0.05, 0, -0.05, 0][i], offset: [0, 0, i % 2 ? -0.4 : 0] },
    arms: { pitch: [0.12, 0, -0.12, 0][i] },
  }));
  const attack: Pose[] = [
    { arms: { pitch: -0.9, offset: [0, -1, 3] }, body: { pitch: -0.12 } },
    { arms: { pitch: -1.2, offset: [0, -1, 5] }, body: { pitch: -0.18 } },
    { arms: { pitch: 0.7, offset: [0, 3, -2] }, body: { pitch: 0.2 } },
    { arms: { pitch: 0.4, offset: [0, 2, -1] } },
  ];
  const idle: Pose[] = [0, 1, 2, 3].map((i) => ({ body: { offset: [0, 0, [0, 0.3, 0, -0.3][i]] }, arms: { pitch: [0, 0.04, 0, -0.04][i] } }));
  return {
    size: [44, 34, 28], foot: [c, c, 0], pixelsPerVoxel: 1.2,
    materials: [
      { color: 0x44403c }, { color: 0x292524 }, { color: 0xf97316, emissive: true }, { color: 0xfde047, emissive: true }, { color: 0x57534e },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

export type LairSpriteKey = 'giantBat' | 'dragonKin' | 'magmaGolem';

export const LAIR_MODELS: Record<LairSpriteKey, () => VoxelModel> = {
  giantBat: withStateAnimations(giantBat),
  dragonKin: withStateAnimations(dragonKin),
  magmaGolem: withStateAnimations(magmaGolem),
};
