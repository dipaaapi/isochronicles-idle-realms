import type { Part, Pose, Shape, VoxelModel } from './VoxelSprite';
import { withStateAnimations } from './stateAnimations';

/**
 * The Sea Folk — the ocean's own people, who rise when the war poisons their
 * water, and the Sand Brood of the ground (game/WildFactionManager.ts). Voxel models in the same rig as the other
 * characters (+x right, +y forward, +z up; parts body/head/arms/legs so the
 * hit / death / skill states are generated). Built a little finer than the
 * invaders (more voxels per unit) for crisper sprites.
 */

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: number): Shape => ({
  kind: 'box', min: [x0, y0, z0], max: [x1, y1, z1], mat,
});
const ell = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, mat: number): Shape => ({
  kind: 'ellipsoid', center: [cx, cy, cz], radii: [rx, ry, rz], mat,
});
const ball = (cx: number, cy: number, cz: number, r: number, mat: number): Shape => ell(cx, cy, cz, r, r, r, mat);
const cyl = (cx: number, cy: number, z0: number, radius: number, height: number, mat: number): Shape => ({
  kind: 'cylinder', center: [cx, cy, z0], radius, height, mat,
});
/** Balls along a polyline (tails, coils, hair). */
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
const SWIM = [1, 0.5, 0, -0.5, -1, -0.5, 0, 0.5];

// ── Mermaid: tide-singer with a trident ─────────────────────────────────────

const mermaid = (): VoxelModel => {
  const M = { tail: 0, tailDark: 1, scale: 2, skin: 3, skinShade: 4, hair: 5, hairDark: 6, shell: 7, gold: 8, eye: 9, fin: 10, pearl: 11 };
  const c = 20;
  const parts: Part[] = [
    {
      // The tail is the "legs" part so the generated death/hit states bend it
      name: 'legs', pivot: [c, c, 14], shapes: [
        ...chain([[c, c, 14], [c, c - 1, 10], [c, c - 3, 6], [c, c - 6, 3], [c, c - 10, 2]], 4.6, 2, M.tail, 3),
        ...[0, 1, 2, 3].map((i) => ell(c, c + 2.6 - i * 1.6, 12 - i * 3, 3.2 - i * 0.5, 1, 1.2, M.scale)),
        ell(c - 4, c - 12, 2.5, 4, 2.5, 1, M.fin), ell(c + 4, c - 12, 2.5, 4, 2.5, 1, M.fin),
        ell(c - 5.5, c - 1, 7, 2.5, 1.2, 1, M.tailDark), ell(c + 5.5, c - 1, 7, 2.5, 1.2, 1, M.tailDark),
      ],
    },
    {
      name: 'body', pivot: [c, c, 15], shapes: [
        ell(c, c, 18.5, 4, 3, 4.5, M.skin),
        ell(c, c + 0.4, 15, 4.4, 3.2, 1.8, M.tailDark),             // scaled belt where the tail starts
        ball(c - 1.8, c + 2.4, 20, 1.6, M.shell), ball(c + 1.8, c + 2.4, 20, 1.6, M.shell),
        ball(c, c + 3, 17.5, 0.7, M.pearl),
      ],
    },
    {
      name: 'head', parent: 'body', pivot: [c, c, 23], shapes: [
        ell(c, c, 25.5, 3, 3, 3.3, M.skin),
        box(c - 1.6, c + 2.6, 25.6, c - 0.6, c + 3, 26.4, M.eye), box(c + 0.6, c + 2.6, 25.6, c + 1.6, c + 3, 26.4, M.eye),
        // Flowing coral hair down her back
        ell(c, c - 0.6, 27, 3.4, 3.4, 2.4, M.hair),
        ...chain([[c, c - 2.5, 26], [c - 0.5, c - 4, 22], [c, c - 4.5, 18], [c + 0.6, c - 5, 15]], 2.6, 1.2, M.hair, 2),
        ...chain([[c - 3, c - 1, 25], [c - 3.6, c - 2.4, 21]], 1.4, 0.9, M.hairDark, 2),
        ...chain([[c + 3, c - 1, 25], [c + 3.6, c - 2.4, 21]], 1.4, 0.9, M.hairDark, 2),
        ell(c + 2.8, c + 0.8, 28, 1.2, 1.2, 0.9, M.shell),          // shell hair clip
      ],
    },
    {
      name: 'arms', parent: 'body', pivot: [c, c, 21], shapes: [
        ...chain([[c - 4, c, 21], [c - 5.5, c + 1.5, 17]], 1.2, 1, M.skinShade, 2),
        ...chain([[c + 4, c, 21], [c + 5.5, c + 2, 17.5]], 1.2, 1, M.skinShade, 2),
        // Gold trident in the right hand
        box(c + 5, c + 2, 8, c + 6, c + 3, 30, M.gold),
        box(c + 3, c + 2, 30, c + 8, c + 3, 31, M.gold),
        ...[c + 3, c + 5.5, c + 8].map((x) => box(x - 0.5, c + 2, 31, x + 0.5, c + 3, 34, M.gold)),
      ],
    },
  ];
  const walk: Pose[] = SWIM.map((s) => ({
    legs: { yaw: 0.25 * s, pitch: 0.12 * Math.abs(s) },
    body: { roll: -0.06 * s, offset: [0, 0, 0.6 * Math.abs(s)] },
    head: { roll: 0.05 * s },
  }));
  const attack: Pose[] = [
    { arms: { pitch: -0.7 }, body: { pitch: -0.15 } },
    { arms: { pitch: -0.4 }, body: { pitch: -0.25 } },
    { arms: { pitch: 0.9, offset: [0, 3, 0] }, body: { pitch: 0.25, offset: [0, 2, 0] } },
    { arms: { pitch: 0.6, offset: [0, 2, 0] }, body: { pitch: 0.15 } },
    { arms: { pitch: 0.1 } },
  ];
  const idle: Pose[] = [0, 1, 2, 3, 4, 5].map((i) => ({
    body: { offset: [0, 0, Math.sin((i / 6) * Math.PI * 2) * 0.8] },
    legs: { yaw: Math.sin((i / 6) * Math.PI * 2) * 0.12 },
    head: { yaw: Math.sin((i / 6) * Math.PI * 2) * 0.08 },
  }));
  return {
    size: [40, 40, 36], foot: [c, c, 0], pixelsPerVoxel: 1.15,
    materials: [
      { color: 0x14b8a6 }, { color: 0x0f766e }, { color: 0x5eead4 }, { color: 0xfcd5c4 }, { color: 0xe8b4a0 },
      { color: 0xf472b6 }, { color: 0xbe185d }, { color: 0xfef3c7 }, { color: 0xfbbf24 }, { color: 0x22d3ee, emissive: true },
      { color: 0x99f6e4 }, { color: 0xffffff, emissive: true },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── Piranha: hopping red-bellied biter ──────────────────────────────────────

const piranha = (): VoxelModel => {
  const M = { back: 0, side: 1, belly: 2, fin: 3, tooth: 4, eye: 5, gum: 6, scar: 7 };
  const c = 16;
  const parts: Part[] = [
    {
      name: 'body', pivot: [c, c, 8], shapes: [
        ell(c, c, 9, 4.2, 7, 6, M.side),
        ell(c, c - 0.5, 12, 3.2, 6, 3, M.back),
        ell(c, c + 0.5, 5.5, 3.6, 6, 2.8, M.belly),
        ell(c, c - 1, 15, 0.8, 4, 2.6, M.fin),                     // dorsal fin
        ell(c - 4, c + 1, 7, 0.8, 2.4, 1.6, M.fin), ell(c + 4, c + 1, 7, 0.8, 2.4, 1.6, M.fin),
        box(c + 2.6, c - 3, 10, c + 4.2, c + 2, 10.6, M.scar),
      ],
    },
    {
      name: 'legs', parent: 'body', pivot: [c, c - 6, 9], shapes: [
        ell(c, c - 9, 9, 0.9, 3, 4.6, M.fin),                      // tail fan
        ell(c, c - 7, 9, 2, 2, 3, M.side),
      ],
    },
    {
      name: 'head', parent: 'body', pivot: [c, c + 5, 8], shapes: [
        ell(c, c + 6, 9.5, 3.8, 2.6, 4, M.side),
        ball(c - 2.6, c + 6.4, 11, 1.2, M.eye), ball(c + 2.6, c + 6.4, 11, 1.2, M.eye),
        // Gaping jaw lined with teeth
        ell(c, c + 7.6, 6.5, 3.2, 1.6, 1.4, M.gum),
        ...[-2.4, -1.2, 0, 1.2, 2.4].map((x) => box(c + x - 0.4, c + 8.4, 7, c + x + 0.4, c + 9.2, 8.4, M.tooth)),
        ...[-1.8, -0.6, 0.6, 1.8].map((x) => box(c + x - 0.4, c + 8.4, 5, c + x + 0.4, c + 9.2, 6.2, M.tooth)),
      ],
    },
  ];
  const walk: Pose[] = SWIM.map((s) => ({
    body: { yaw: 0.12 * s, offset: [0, 0, 2.2 * Math.abs(Math.sin((s + 1) * 1.2))], pitch: -0.08 * s },
    legs: { yaw: -0.5 * s },
    head: { pitch: 0.05 * s },
  }));
  const attack: Pose[] = [
    { body: { pitch: 0.2, offset: [0, -1, 0] }, head: { pitch: -0.4 } },
    { body: { pitch: -0.25, offset: [0, 4, 2] }, head: { pitch: -0.6 } },
    { body: { pitch: -0.1, offset: [0, 5, 1] }, head: { pitch: 0.35 } },
    { body: { offset: [0, 1, 0] }, head: { pitch: 0.1 } },
  ];
  const idle: Pose[] = [0, 1, 2, 3].map((i) => ({
    body: { offset: [0, 0, Math.sin((i / 4) * Math.PI * 2) * 0.8] },
    legs: { yaw: Math.sin((i / 4) * Math.PI * 2) * 0.35 },
    head: { pitch: i % 2 ? -0.15 : 0 },
  }));
  return {
    size: [32, 32, 22], foot: [c, c, 0], pixelsPerVoxel: 1.2,
    materials: [
      { color: 0x475569 }, { color: 0x64748b }, { color: 0xdc2626 }, { color: 0x94a3b8 },
      { color: 0xf8fafc }, { color: 0xfacc15, emissive: true }, { color: 0x7f1d1d }, { color: 0x334155 },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── Kappa: shelled river guardian with a water dish on its head ─────────────

const kappa = (): VoxelModel => {
  const M = { skin: 0, skinDark: 1, shell: 2, shellRim: 3, plate: 4, beak: 5, water: 6, eye: 7, hair: 8, claw: 9 };
  const c = 17;
  const parts: Part[] = [
    {
      name: 'legs', pivot: [c, c, 7], shapes: [
        ...[-2.6, 2.6].flatMap((x) => [
          box(c + x - 1.4, c - 1.2, 0, c + x + 1.4, c + 1.2, 7, M.skinDark),
          box(c + x - 1.8, c - 1, 0, c + x + 1.8, c + 3, 1.2, M.skin), // webbed feet
        ]),
      ],
    },
    {
      name: 'body', pivot: [c, c, 8], shapes: [
        ell(c, c + 0.6, 12.5, 5, 3.6, 6, M.skin),
        ell(c, c + 2.8, 12, 3.6, 1.6, 4.6, M.plate),                // belly plates
        ...[10, 12.5, 15].map((z) => box(c - 3.4, c + 4.2, z, c + 3.4, c + 4.5, z + 0.4, M.shellRim)),
        // Domed shell on the back
        ell(c, c - 2.8, 13, 5.6, 3.6, 6.4, M.shell),
        ell(c, c - 3.2, 13, 6, 3, 6.8, M.shellRim),
        ...[[-2, 15], [2, 15], [0, 11]].map(([x, z]) => ell(c + x, c - 6, z, 1.8, 0.6, 1.8, M.shellRim)),
      ],
    },
    {
      name: 'head', parent: 'body', pivot: [c, c, 18], shapes: [
        ell(c, c + 0.6, 21, 4, 3.6, 3.6, M.skin),
        ell(c, c + 4, 20.2, 1.8, 1.8, 1.1, M.beak),
        box(c - 2.4, c + 3, 21.8, c - 1.2, c + 3.6, 22.8, M.eye), box(c + 1.2, c + 3, 21.8, c + 2.4, c + 3.6, 22.8, M.eye),
        // Ragged hair ring around the sacred water dish
        ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const a = (i / 8) * Math.PI * 2;
          return ell(c + Math.cos(a) * 3.4, c + 0.6 + Math.sin(a) * 3, 23.4, 1.2, 1.2, 1.6, M.hair);
        }),
        cyl(c, c + 0.6, 24, 2.6, 0.8, M.shellRim),
        cyl(c, c + 0.6, 24.6, 2.1, 0.4, M.water),
      ],
    },
    {
      name: 'arms', parent: 'body', pivot: [c, c, 15], shapes: [
        ...[-1, 1].flatMap((sx) => [
          box(c + sx * 5 - 1.2, c - 0.6, 9, c + sx * 5 + 1.2, c + 1.4, 16, M.skinDark),
          ...[-0.8, 0, 0.8].map((d) => box(c + sx * 5 + d - 0.3, c + 1.2, 7.6, c + sx * 5 + d + 0.3, c + 2.4, 9.2, M.claw)),
        ]),
      ],
    },
  ];
  const walk: Pose[] = SWIM.map((s) => ({
    legs: { roll: 0.15 * s, offset: [0, 0, Math.abs(s) * 0.5] },
    body: { roll: -0.08 * s, yaw: 0.06 * s },
    arms: { pitch: 0.4 * s },
  }));
  const attack: Pose[] = [
    { arms: { pitch: -1.1 }, body: { pitch: -0.15, roll: 0.1 } },
    { arms: { pitch: -0.6 }, body: { pitch: -0.2 } },
    { arms: { pitch: 1.0, offset: [0, 2, -1] }, body: { pitch: 0.3, offset: [0, 2, 0] } },
    { arms: { pitch: 0.4 }, body: { pitch: 0.1 } },
  ];
  const idle: Pose[] = [0, 1, 2, 3].map((i) => ({
    body: { offset: [0, 0, Math.sin((i / 4) * Math.PI * 2) * 0.5] },
    head: { yaw: [0, 0.18, 0, -0.18][i] },
  }));
  return {
    size: [34, 34, 30], foot: [c, c, 0], pixelsPerVoxel: 1.15,
    materials: [
      { color: 0x65a30d }, { color: 0x3f6212 }, { color: 0x854d0e }, { color: 0x422006 }, { color: 0xd9f99d },
      { color: 0xfacc15 }, { color: 0x38bdf8, emissive: true }, { color: 0x111827 }, { color: 0x14532d }, { color: 0xe7e5e4 },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── Leviathan: the abyssal sea dragon (boss, only one) ──────────────────────

const leviathan = (): VoxelModel => {
  // A sea dragon, not a pole: coils arching out of the water behind it, an S-curved neck with a
  // dorsal sail, a long-snouted dragon head (separate jaw, horns, whiskers, ear fins) and webbed claws
  const M = {
    scale: 0, scaleDark: 1, belly: 2, fin: 3, horn: 4, eye: 5, glow: 6, tooth: 7, spine: 8, water: 9,
    finDark: 10, whisker: 11, maw: 12,
  };
  const c = 40;
  // Neck spine from the water up to the back of the skull (S-curve: up, back, then forward)
  const NECK: Array<[number, number, number]> = [[c, c - 1, 2], [c, c + 1, 12], [c, c - 2, 22], [c, c - 1.5, 31], [c, c + 3, 39], [c, c + 6, 43]];
  // The head is modelled at z ≈ 37 and lifted onto the taller neck
  const LIFT = 8;
  const lift = (shapes: Shape[]): Shape[] => shapes.map((sh): Shape => sh.kind === 'box'
    ? { ...sh, min: [sh.min[0], sh.min[1], sh.min[2] + LIFT], max: [sh.max[0], sh.max[1], sh.max[2] + LIFT] }
    : sh.kind === 'ellipsoid'
      ? { ...sh, center: [sh.center[0], sh.center[1], sh.center[2] + LIFT] }
      : { ...sh, center: [sh.center[0], sh.center[1], sh.center[2] + LIFT] });
  const HEAD: [number, number, number] = [c, c + 9, 37 + LIFT];
  const parts: Part[] = [
    {
      // Coils breaking the surface behind it, ending in a fanned tail fin; foam where they cut the water
      name: 'legs', pivot: [c, c, 3], shapes: [
        ell(c, c - 6, 0.6, 17, 15, 0.7, M.water),
        ...chain([[c - 2, c - 4, 1], [c - 6, c - 9, 9], [c - 10, c - 14, 1]], 5.6, 5, M.scale, 4),
        ...chain([[c - 10, c - 14, 1], [c - 6, c - 19, 8], [c + 1, c - 22, 1]], 5, 4.2, M.scale, 4),
        ...chain([[c + 1, c - 22, 1], [c + 8, c - 22, 6.5], [c + 14, c - 19, 1]], 4.2, 3, M.scaleDark, 4),
        ...chain([[c + 14, c - 19, 1], [c + 19, c - 14, 3.5], [c + 22, c - 9, 2]], 3, 1.6, M.scaleDark, 3),
        // Tail fan
        ell(c + 24, c - 7, 5, 1, 4.5, 4.2, M.fin), ell(c + 24, c - 7, 5, 1.2, 2.6, 2.6, M.finDark),
        // Belly stripe and dorsal spikes along the coils
        ...[[c - 6, c - 8.2, 7.4], [c - 6, c - 18.2, 6.6], [c + 8, c - 21, 5]].map(([x, y, z]) => ell(x, y + 2.6, z - 1.6, 2.6, 1.6, 2.6, M.belly)),
        ...[[c - 6, c - 10, 14.5], [c - 6, c - 20, 13], [c + 8, c - 23, 10.5], [c + 18.5, c - 15.5, 7]].map(([x, y, z]) => ell(x, y, z, 0.9, 2.2, 3, M.spine)),
        // Foam rings where each coil enters the water
        ...[[c - 10, c - 14], [c + 1, c - 22], [c + 14, c - 19], [c - 2, c - 3]].map(([x, y]) => ell(x, y, 1.4, 6.5, 6.5, 0.8, M.water)),
      ],
    },
    {
      name: 'body', pivot: [c, c, 3], shapes: [
        ...chain(NECK, 6, 3.8, M.scale, 5),
        // Pale belly plates down the front of the neck
        ...chain(NECK.slice(0, 5).map(([x, y, z]) => [x, y + 3.6, z] as [number, number, number]), 3.6, 2.4, M.belly, 5),
        ...[5, 11, 17, 23, 29].map((z) => box(c - 2.8, c + 3.6 + (z > 16 ? -1.6 : 0.6), z, c + 2.8, c + 4.8 + (z > 16 ? -1.6 : 0.6), z + 0.5, M.scaleDark)),
        // Dorsal sail: a webbed fin along the back of the neck, tallest at the shoulders
        ...[[c - 4.6, 10, 4.5], [c - 6.4, 16, 5.6], [c - 6.6, 22, 5.6], [c - 6, 28, 5], [c - 4.4, 34, 4], [c - 1.4, 39, 3]].map(([y, z, h]) => ell(c, y, z, 0.8, 2.6, h, M.fin)),
        ...[[c - 7, 11], [c - 9, 17], [c - 9.4, 23], [c - 8.8, 29], [c - 7, 35]].map(([y, z]) => ell(c, y, z, 0.5, 0.9, 2.2, M.finDark)),
        // Glowing scale rows on the flanks
        ...[8, 16, 24, 32].flatMap((z) => [-1, 1].map((sx) => ell(c + sx * (5.6 - z * 0.05), c, z, 0.6, 1.8, 0.9, M.glow))),
      ],
    },
    {
      name: 'arms', parent: 'body', pivot: [c, c + 3, 16], shapes: [-1, 1].flatMap((sx) => [
        ...chain([[c + sx * 4.6, c + 2, 17], [c + sx * 9, c + 6, 13.5], [c + sx * 9, c + 10.5, 9.5]], 2, 1.5, M.scaleDark, 3),
        // Webbed hand: three claws with membrane between
        ell(c + sx * 9, c + 12, 8.6, 2.4, 2, 1, M.fin),
        ...[-1.4, 0, 1.4].map((d) => box(c + sx * 9 + d - 0.35, c + 13.4, 7, c + sx * 9 + d + 0.35, c + 14.6, 8.6, M.tooth)),
      ]),
    },
    {
      name: 'head', parent: 'body', pivot: HEAD, shapes: lift([
        // Skull and long snout with a bony ridge and nostrils
        ell(c, c + 9, 37.4, 5.4, 6.4, 4.4, M.scale),
        ell(c, c + 15.5, 36.4, 3.6, 5.6, 2.6, M.scale),
        ell(c, c + 14, 38.6, 1.4, 6, 1.2, M.scaleDark),
        ...[-1.4, 1.4].map((x) => ball(c + x, c + 20.4, 37.4, 0.6, M.maw)),
        // Upper teeth along the lip
        ...[-2.6, -1.3, 0, 1.3, 2.6].map((x) => box(c + x - 0.35, c + 17 + Math.abs(x) * -0.6, 33.6, c + x + 0.35, c + 18 + Math.abs(x) * -0.6, 34.8, M.tooth)),
        // Eyes under heavy brows, with a glow
        ...[-1, 1].flatMap((sx) => [
          ell(c + sx * 4.6, c + 11, 39.6, 1.6, 2.8, 0.9, M.scaleDark),
          ell(c + sx * 4.4, c + 11.4, 38.6, 1, 1.5, 1, M.eye),
        ]),
        // Pearl horns swept back, a crest of spines and a glowing crest gem
        ...[-1, 1].flatMap((sx) => [
          ...chain([[c + sx * 3, c + 6, 41], [c + sx * 5, c + 2, 44.5], [c + sx * 5.8, c - 3, 46.5]], 1.4, 0.5, M.horn, 3),
          ...chain([[c + sx * 2, c + 9, 41.4], [c + sx * 2.6, c + 6, 44]], 0.8, 0.4, M.horn, 2),
        ]),
        ...[[c + 6, 42.5], [c + 3, 42], [c, 41]].map(([y, z]) => ell(c, y, z, 0.7, 1.6, 2, M.spine)),
        ball(c, c + 10.5, 41.8, 1, M.glow),
        // Ear fins (frills) and whisker barbels trailing back from the snout
        ...[-1, 1].flatMap((sx) => [
          ell(c + sx * 6.2, c + 5.5, 38.5, 0.8, 4, 3.4, M.fin), ell(c + sx * 6.4, c + 4.5, 38.5, 0.5, 2.2, 1.8, M.finDark),
          ...chain([[c + sx * 3.2, c + 18, 35.8], [c + sx * 6.5, c + 15, 32.5], [c + sx * 9.5, c + 10, 31.5], [c + sx * 10.5, c + 6, 33]], 0.55, 0.3, M.whisker, 3),
        ]),
      ]),
    },
    {
      // Lower jaw: opens for the bite and the breath
      name: 'jaw', parent: 'head', pivot: [c, c + 9, 34.5 + LIFT], shapes: lift([
        ell(c, c + 14.6, 33.2, 3.2, 5.2, 1.4, M.belly),
        ell(c, c + 13.6, 34.2, 2.4, 4.2, 0.6, M.maw),
        ...[-2.2, -1, 1, 2.2].map((x) => box(c + x - 0.35, c + 16.6 + Math.abs(x) * -0.6, 34.2, c + x + 0.35, c + 17.4 + Math.abs(x) * -0.6, 35.4, M.tooth)),
      ]),
    },
  ];
  const walk: Pose[] = SWIM.map((s, i) => ({
    body: { roll: 0.07 * s, pitch: 0.05 * s },
    head: { yaw: -0.1 * s, pitch: 0.05 * Math.abs(s) },
    arms: { pitch: 0.25 * s },
    jaw: { pitch: 0.04 * (i % 2) },
    legs: { yaw: 0.05 * s, offset: [0, 0, Math.abs(s) * 0.9] },
  }));
  // Bite: rear back, then lunge with the jaw wide open
  const attack: Pose[] = [
    { body: { pitch: -0.18 }, head: { pitch: -0.25 }, jaw: { pitch: 0.2 } },
    { body: { pitch: -0.32, offset: [0, -2, 1] }, head: { pitch: -0.4 }, jaw: { pitch: 0.55 }, arms: { pitch: -0.4 } },
    { body: { pitch: 0.4, offset: [0, 5, -2] }, head: { pitch: 0.5 }, jaw: { pitch: 0.7 }, arms: { pitch: 0.5 } },
    { body: { pitch: 0.45, offset: [0, 6, -2] }, head: { pitch: 0.45 }, jaw: { pitch: 0 } },
    { body: { pitch: 0.25, offset: [0, 3, -1] }, head: { pitch: 0.2 }, jaw: { pitch: 0.05 } },
    { body: { pitch: 0.06 }, head: { pitch: 0.05 } },
  ];
  const idle: Pose[] = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
    const a = (i / 8) * Math.PI * 2;
    return {
      body: { roll: Math.sin(a) * 0.05, offset: [0, 0, Math.sin(a) * 1.1] },
      head: { yaw: Math.sin(a) * 0.14, pitch: Math.cos(a) * 0.04 },
      jaw: { pitch: Math.max(0, Math.sin(a * 2)) * 0.12 },
      arms: { pitch: Math.sin(a + 1) * 0.15 },
      legs: { yaw: Math.sin(a) * 0.04, offset: [0, 0, Math.cos(a) * 0.6] },
    };
  });
  // Skill: rears up high, throat swelling, then the jaw gapes wide for the breath / roar
  const skill: Pose[] = [
    { body: { pitch: -0.15, offset: [0, -1, 1] }, head: { pitch: -0.2 } },
    { body: { pitch: -0.3, offset: [0, -2, 3] }, head: { pitch: -0.45 }, jaw: { pitch: 0.3 }, arms: { pitch: -0.6 } },
    { body: { pitch: -0.38, offset: [0, -2, 4] }, head: { pitch: -0.55, scale: [1.04, 1.04, 1.04] }, jaw: { pitch: 0.75 }, arms: { pitch: -0.7 } },
    { body: { pitch: 0.1, offset: [0, 2, 2] }, head: { pitch: 0.15 }, jaw: { pitch: 0.85 }, arms: { pitch: 0.2 } },
    { body: { pitch: 0.14, offset: [0, 3, 2] }, head: { pitch: 0.2 }, jaw: { pitch: 0.85 } },
    { body: { pitch: 0.1, offset: [0, 2, 1] }, head: { pitch: 0.12 }, jaw: { pitch: 0.7 } },
    { body: { pitch: 0.04 }, head: { pitch: 0.04 }, jaw: { pitch: 0.3 } },
    { body: { pitch: 0 }, head: { pitch: 0 }, jaw: { pitch: 0.05 } },
  ];
  return {
    size: [80, 80, 60], foot: [c, c, 0], pixelsPerVoxel: 1.1,
    materials: [
      { color: 0x0e7490 }, { color: 0x134e5e }, { color: 0x99f6e4 }, { color: 0x22d3ee }, { color: 0xe2e8f0 },
      { color: 0xfde047, emissive: true }, { color: 0x67e8f9, emissive: true }, { color: 0xf8fafc }, { color: 0x0c4a6e },
      { color: 0xbae6fd }, { color: 0x0891b2 }, { color: 0xa5f3fc }, { color: 0x450a0a },
    ],
    parts,
    animations: { walk, attack, idle, skill },
  };
};

// ── Sand Brood: Dune Arachnid ───────────────────────────────────────────────

const arachnid = (): VoxelModel => {
  const M = { carapace: 0, dark: 1, abdomen: 2, mark: 3, eye: 4, fang: 5, leg: 6, joint: 7 };
  const c = 18;
  const legPairs: Shape[] = [];
  [-1, 1].forEach((sx) => [0, 1, 2, 3].forEach((i) => {
    const y = c + 3 - i * 2.4;
    legPairs.push(...chain([[c + sx * 3, y, 7], [c + sx * 8, y + 1.5 - i * 0.6, 10], [c + sx * 13, y + 2.5 - i * 1.4, 1]], 1, 0.6, M.leg, 3));
    legPairs.push(ball(c + sx * 8, y + 1.5 - i * 0.6, 10, 1.2, M.joint));
  }));
  const parts: Part[] = [
    { name: 'legs', pivot: [c, c, 6], shapes: legPairs },
    {
      name: 'body', pivot: [c, c, 7], shapes: [
        ell(c, c - 5, 9, 5.5, 6.5, 5, M.abdomen),                     // bulbous abdomen
        ell(c, c - 5.5, 12, 3, 4, 2, M.mark),                          // hourglass marking
        ell(c, c + 1.5, 7.5, 3.8, 3.6, 3, M.carapace),
      ],
    },
    {
      name: 'head', parent: 'body', pivot: [c, c + 4, 7], shapes: [
        ell(c, c + 5, 7.5, 2.8, 2.2, 2.4, M.dark),
        ...[-1.4, -0.5, 0.5, 1.4].map((dx) => ball(c + dx, c + 6.8, 8.6 + Math.abs(dx) * 0.3, 0.55, M.eye)),
        box(c - 1.4, c + 6.5, 5, c - 0.6, c + 7.6, 6.5, M.fang), box(c + 0.6, c + 6.5, 5, c + 1.4, c + 7.6, 6.5, M.fang),
      ],
    },
  ];
  const walk: Pose[] = [0, 1, 2, 3].map((i) => ({
    legs: { yaw: [0.12, 0, -0.12, 0][i], offset: [0, 0, i % 2 ? 0.6 : 0] },
    body: { offset: [0, 0, i % 2 ? 0.5 : 0], roll: [0.04, 0, -0.04, 0][i] },
  }));
  const attack: Pose[] = [
    { body: { pitch: 0.2 }, head: { pitch: -0.3 } },
    { body: { pitch: -0.25, offset: [0, 3, 1] }, head: { pitch: 0.4 } },
    { body: { pitch: -0.05 } },
  ];
  const idle: Pose[] = [0, 1, 2, 3].map((i) => ({ body: { offset: [0, 0, [0, 0.4, 0, -0.2][i]] }, legs: { roll: [0, 0.03, 0, -0.03][i] } }));
  return {
    size: [36, 36, 20], foot: [c, c, 0], pixelsPerVoxel: 1.15,
    materials: [
      { color: 0x57534e }, { color: 0x292524 }, { color: 0x7c2d12 }, { color: 0xfbbf24 },
      { color: 0xef4444, emissive: true }, { color: 0xf5f5f4 }, { color: 0x44403c }, { color: 0xa8a29e },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── Sand Brood: Sand Scorpion ───────────────────────────────────────────────

const scorpion = (): VoxelModel => {
  const M = { shell: 0, shellDark: 1, belly: 2, claw: 3, stinger: 4, eye: 5, leg: 6, venom: 7 };
  const c = 18;
  const legs: Shape[] = [];
  [-1, 1].forEach((sx) => [0, 1, 2, 3].forEach((i) => {
    const y = c + 1 - i * 2.2;
    legs.push(...chain([[c + sx * 3.5, y, 4], [c + sx * 7.5, y - 0.5, 5.5], [c + sx * 10, y - 1, 0.8]], 0.9, 0.55, M.leg, 2));
  }));
  const parts: Part[] = [
    { name: 'legs', pivot: [c, c, 4], shapes: legs },
    {
      name: 'body', pivot: [c, c, 5], shapes: [
        ell(c, c, 5, 4.5, 6, 2.8, M.shell),
        ...[0, 1, 2, 3].map((i) => box(c - 4 + i * 0.3, c - 4 + i * 2.6, 6.8, c + 4 - i * 0.3, c - 3.2 + i * 2.6, 7.6, M.shellDark)),
        ell(c, c, 3.4, 3.6, 5, 1.2, M.belly),
        ...[-1, 1].map((sx) => ball(c + sx * 1.2, c + 5.4, 6.6, 0.6, M.eye)),
      ],
    },
    {
      // Pincers forward (the arms part, so attacks snap them)
      name: 'arms', parent: 'body', pivot: [c, c + 5, 5], shapes: [
        ...[-1, 1].flatMap((sx) => [
          ...chain([[c + sx * 3.5, c + 4.5, 5], [c + sx * 6.5, c + 8, 5.5], [c + sx * 6, c + 11, 5.5]], 1.2, 1, M.shellDark, 2),
          ell(c + sx * 6, c + 12.6, 5.6, 2, 2.6, 1.6, M.claw),
          box(c + sx * 6 - 0.4, c + 14.4, 4.6, c + sx * 6 + 0.4 + sx * 1.2, c + 16, 5.4, M.claw),
        ]),
      ],
    },
    {
      // Segmented tail arching over the back, venom stinger at the tip ("head" so the hit/death states move it)
      name: 'head', parent: 'body', pivot: [c, c - 6, 5], shapes: [
        ...chain([[c, c - 6, 5], [c, c - 9.5, 8], [c, c - 10.5, 12.5], [c, c - 8.5, 16.5], [c, c - 5, 18]], 1.9, 1.2, M.shell, 2),
        ell(c, c - 3.2, 17.4, 1.3, 1.6, 1.3, M.venom),
        box(c - 0.4, c - 1.8, 15.2, c + 0.4, c - 1, 17, M.stinger),
      ],
    },
  ];
  const walk: Pose[] = [0, 1, 2, 3].map((i) => ({
    legs: { yaw: [0.1, 0, -0.1, 0][i], offset: [0, 0, i % 2 ? 0.4 : 0] },
    head: { pitch: [0.05, 0, -0.05, 0][i] },
    arms: { yaw: [0.06, 0, -0.06, 0][i] },
  }));
  const attack: Pose[] = [
    { head: { pitch: -0.25 }, arms: { pitch: -0.2 } },
    { head: { pitch: 0.75, offset: [0, 3, 1] }, body: { pitch: -0.1 } },
    { head: { pitch: 0.35 }, arms: { pitch: 0.2, offset: [0, 1.5, 0] } },
    { head: { pitch: 0 } },
  ];
  const idle: Pose[] = [0, 1, 2, 3].map((i) => ({ head: { yaw: [0, 0.12, 0, -0.12][i], pitch: [0, -0.06, 0, -0.06][i] }, arms: { yaw: [0, -0.05, 0, 0.05][i] } }));
  return {
    size: [36, 40, 22], foot: [c, c + 2, 0], pixelsPerVoxel: 1.15,
    materials: [
      { color: 0xb45309 }, { color: 0x78350f }, { color: 0xfcd34d }, { color: 0x92400e },
      { color: 0x1c1917 }, { color: 0xfde047, emissive: true }, { color: 0x854d0e }, { color: 0x84cc16, emissive: true },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── Sand Brood boss: the Ancient Caterpillar ────────────────────────────────

/**
 * A jointed caterpillar: every body segment is its own part, so the walk is a
 * real crawl wave running from the tail to the rearing head. Own walk / idle /
 * attack / skill (rear up, dive, burst out) / hit / death sets with many frames.
 */
const caterpillar = (): VoxelModel => {
  const M = { skin: 0, skinDark: 1, band: 2, spot: 3, leg: 4, mandible: 5, eye: 6, horn: 7, glow: 8, sand: 9, bristle: 10, belly: 11 };
  const c = 32;
  // Body segments, tail (0) to front (5): [x, y, z, radius]
  const segs: Array<[number, number, number, number]> = [
    [c + 3, c - 19, 4.2, 4.2], [c + 1, c - 15, 5.2, 5.2], [c - 2, c - 10.5, 6.2, 6.2], [c - 3, c - 5, 6.9, 6.9], [c - 2, c + 0.5, 7.3, 7.2], [c, c + 5.5, 7.6, 7.3],
  ];
  const segName = (i: number) => `seg${i}`;
  const segmentPart = (i: number): Part => {
    const [x, y, z, r] = segs[i];
    const shapes: Shape[] = [
      ell(x, y, z, r, r * 0.92, r, i % 2 ? M.skin : M.skinDark),
      ell(x, y, z - r * 0.55, r * 0.86, r * 0.82, r * 0.42, M.belly),               // pale underside
      ell(x, y + r * 0.5, z + r * 0.12, r * 1.03, r * 0.3, r * 0.96, M.band),        // ring band at the joint
      ball(x + r * 0.58, y, z + r * 0.5, r * 0.22, M.spot),                          // glowing eye-spots
      ball(x - r * 0.58, y, z + r * 0.5, r * 0.22, M.spot),
      ell(x, y - r * 0.15, z + r * 0.98, 0.9, 0.9, 2, M.horn),                       // dorsal spine
      ...[-1, 1].flatMap((sx) => chain([[x + sx * r * 0.45, y - r * 0.3, z + r * 0.85], [x + sx * r * 0.75, y - r * 0.5, z + r * 1.35]], 0.45, 0.25, M.bristle, 2)),
      // stubby prolegs
      ...[-1, 1].flatMap((sx) => chain([[x + sx * r * 0.7, y, z - r * 0.5], [x + sx * (r * 0.95), y + 0.4, 0.8]], 1.1, 0.8, M.leg, 2)),
    ];
    return { name: segName(i), parent: i ? segName(i - 1) : undefined, pivot: [x, y, z * 0.5], shapes };
  };
  const parts: Part[] = [
    { name: 'legs', pivot: [c, c, 1], shapes: [ell(c, c - 6, 0.6, 15, 20, 0.8, M.sand), ell(c, c - 6, 1, 11, 16, 0.5, M.sand)] },
    ...segs.map((_, i) => segmentPart(i)),
    {
      // Rearing front segment and the great head
      name: 'head', parent: segName(segs.length - 1), pivot: [c, c + 8, 12], shapes: [
        ell(c, c + 9, 15, 7, 6.4, 7, M.skin),
        ell(c, c + 9.4, 16, 7.2, 2.4, 6.6, M.band),
        ell(c, c + 13, 21, 6.6, 5.8, 5.8, M.skinDark),
        ell(c, c + 15.4, 19.5, 4.6, 2, 3, M.belly),                                     // pale face plate
        ...[-1, 1].map((sx) => ball(c + sx * 3.3, c + 17, 23, 1.6, M.eye)),
        ...[-1, 1].map((sx) => ball(c + sx * 4.6, c + 16, 21.2, 0.9, M.eye)),             // second pair of eyes
        ball(c, c + 14.6, 26.8, 1.2, M.glow),                                            // the Deity's mark
        ...[-1, 1].flatMap((sx) => chain([[c + sx * 2.6, c + 12, 26], [c + sx * 5, c + 13, 31], [c + sx * 6.6, c + 11, 34.5]], 0.9, 0.4, M.horn, 3)),
        ...[-1, 1].map((sx) => ball(c + sx * 6.6, c + 11, 34.8, 0.8, M.glow)),          // glowing horn tips
      ],
    },
    {
      name: 'jaw', parent: 'head', pivot: [c, c + 17, 18], shapes: [
        ...[-1, 1].flatMap((sx) => chain([[c + sx * 3, c + 16.5, 18], [c + sx * 2.6, c + 20, 16], [c + sx * 0.7, c + 21.2, 15.2]], 1.4, 0.6, M.mandible, 3)),
        ...[-1, 1].map((sx) => ball(c + sx * 0.8, c + 21.3, 15.3, 0.6, M.glow)),
      ],
    },
    {
      name: 'arms', parent: 'head', pivot: [c, c + 11, 13], shapes: [
        ...[-1, 1].flatMap((sx) => chain([[c + sx * 5, c + 11, 13], [c + sx * 7.4, c + 14, 10], [c + sx * 6.2, c + 16.5, 7.5]], 1.2, 0.7, M.leg, 2)),
      ],
    },
  ];

  // Crawl wave: a hump runs from the tail to the head
  const wave = (a: number, amp: number, lift = 0): Pose => {
    const pose: Pose = {};
    segs.forEach((_, k) => {
      const ph = a - k * 0.95;
      pose[segName(k)] = { offset: [0, Math.cos(ph) * 0.35 * amp, Math.max(0, Math.sin(ph)) * 1.7 * amp + (k === segs.length - 1 ? lift : 0)], pitch: Math.cos(ph) * 0.06 * amp };
    });
    return pose;
  };
  const walk: Pose[] = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return { ...wave(a, 1), head: { pitch: Math.sin(a) * 0.07, yaw: Math.sin(a * 0.5) * 0.12 }, jaw: { pitch: Math.max(0, Math.sin(a * 2)) * 0.15 }, arms: { pitch: Math.sin(a) * 0.35 } };
  });
  const idle: Pose[] = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    return { ...wave(a, 0.3), head: { yaw: Math.sin(a) * 0.18, pitch: Math.cos(a) * 0.06 }, jaw: { pitch: Math.max(0, Math.sin(a * 3)) * 0.18 }, arms: { pitch: Math.sin(a * 2) * 0.25 } };
  });
  // Rear back, then a lunging bite
  const attackKeys: Array<[number, number, number, number]> = [
    // [head pitch, head forward, jaw open, front lift]
    [-0.2, -1, 0.1, 1], [-0.45, -2, 0.35, 2.5], [-0.6, -3, 0.5, 3.5], [0.2, 3, 0.45, 1], [0.6, 6, 0.1, -1], [0.45, 5, 0, -1], [0.2, 2, 0.1, 0], [0, 0, 0, 0],
  ];
  const attack: Pose[] = attackKeys.map(([p, f, j, lift], i) => ({
    ...wave(i * 0.4, 0.3, lift), head: { pitch: p, offset: [0, f, 0] }, jaw: { pitch: j }, arms: { pitch: p > 0 ? 0.7 : -0.4 },
  }));
  // Skill: rears up tall, roars, dives into the sand and bursts out
  const skill: Pose[] = [
    ...[0.3, 0.6, 1, 1, 1].map((t, i): Pose => ({ ...wave(i * 0.5, 0.4, 5 * t), head: { pitch: -0.5 * t, offset: [0, -1, 2 * t] }, jaw: { pitch: i >= 3 ? 0.6 : 0.2 }, arms: { pitch: -0.8 * t } })),
    ...[0.3, 0.7, 1].map((t): Pose => ({ legs: { offset: [0, 0, 0] }, ...wave(0, 0.2, -6 * t), seg5: { offset: [0, 2 * t, -6 * t] }, seg4: { offset: [0, 0, -4 * t] }, head: { pitch: 0.8 * t, offset: [0, 2, -4 * t] }, jaw: { pitch: 0.1 } })),
    ...[1, 0.6, 0.25, 0].map((t): Pose => ({ ...wave(0, 0.2, 4 * t), head: { pitch: -0.3 * t, offset: [0, 0, 2 * t] }, jaw: { pitch: 0.5 * t }, arms: { pitch: -0.6 * t } })),
  ];
  const hit: Pose[] = [1, 0.7, 0.4, 0.15, 0].map((k) => ({
    ...wave(k * 2, 0.5 * k), head: { pitch: -0.35 * k, offset: [0, -2 * k, 0], roll: 0.12 * k }, jaw: { pitch: 0.4 * k },
  }));
  const death: Pose[] = Array.from({ length: 10 }, (_, i) => {
    const t = i / 9;
    return {
      ...wave(t * 3, 0.6 * (1 - t), -2 * t),
      seg0: { roll: 0.5 * t, offset: [0, 0, -1.2 * t] },
      head: { pitch: 0.9 * t, roll: 0.6 * t, offset: [0, 1 * t, -6 * t] }, jaw: { pitch: 0.5 * (1 - t) }, arms: { pitch: 1 * t },
    };
  });
  return {
    size: [64, 64, 40], foot: [c, c, 0], pixelsPerVoxel: 1.1,
    materials: [
      { color: 0xd6a35c }, { color: 0xa16207 }, { color: 0x7c2d12 }, { color: 0x9333ea, emissive: true }, { color: 0x44403c },
      { color: 0x1c1917 }, { color: 0xfde047, emissive: true }, { color: 0xe7e5e4 }, { color: 0xc084fc, emissive: true }, { color: 0xe9d8a6 },
      { color: 0x57534e }, { color: 0xf1d9a8 },
    ],
    parts,
    animations: { walk, attack, idle, skill, hit, death },
  };
};

/** Wild-faction sprites: the Sea Folk and the Sand Brood. */
export type SeaSpriteKey = 'mermaid' | 'piranha' | 'kappa' | 'leviathan' | 'arachnid' | 'scorpion' | 'caterpillar';

export const SEA_MODELS: Record<SeaSpriteKey, () => VoxelModel> = {
  mermaid: withStateAnimations(mermaid),
  piranha: withStateAnimations(piranha),
  kappa: withStateAnimations(kappa),
  leviathan: withStateAnimations(leviathan),
  arachnid: withStateAnimations(arachnid),
  scorpion: withStateAnimations(scorpion),
  caterpillar: withStateAnimations(caterpillar),
};
