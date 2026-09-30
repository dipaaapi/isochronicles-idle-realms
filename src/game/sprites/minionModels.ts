import type { UnitClass } from '../../types/game';
import type { Part, Pose, Shape, Vec3, VoxelModel } from './VoxelSprite';
import { breathe, ENEMY_MODELS } from './enemyModels';
import { recolorModel } from './VoxelSprite';

/**
 * Voxel models for the Demon Lord's minions, following the bestiary artwork in
 * public/backgrounds/bestiary-icons/. Same conventions as enemyModels.ts:
 * +x = the character's right, +y = forward, +z = up.
 */

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: number): Shape => ({
  kind: 'box', min: [x0, y0, z0], max: [x1, y1, z1], mat,
});
const ell = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, mat: number): Shape => ({
  kind: 'ellipsoid', center: [cx, cy, cz], radii: [rx, ry, rz], mat,
});
const ball = (cx: number, cy: number, cz: number, r: number, mat: number): Shape => ell(cx, cy, cz, r, r, r, mat);

const mirrorX = (shapes: Shape[], axis: number): Shape[] =>
  shapes.map((s) => {
    switch (s.kind) {
      case 'box':
        return { ...s, min: [2 * axis - s.max[0], s.min[1], s.min[2]], max: [2 * axis - s.min[0], s.max[1], s.max[2]] };
      case 'ellipsoid':
      case 'cylinder':
        return { ...s, center: [2 * axis - s.center[0], s.center[1], s.center[2]] };
    }
  });
const mirrorPivot = (p: Vec3, axis: number): Vec3 => [2 * axis - p[0], p[1], p[2]];

/** Adds a left part and its mirrored right twin. */
const pair = (name: string, pivot: Vec3, shapes: Shape[], axis: number, parent?: string): Part[] => [
  { name: `left${name}`, parent, pivot, shapes },
  { name: `right${name}`, parent, pivot: mirrorPivot(pivot, axis), shapes: mirrorX(shapes, axis) },
];

const STRIDE = [1, 0, -1, 0];

// ── Stone Golem (GOLEM) — grey rock brute, cyan glowing eyes and cracks ──────

const golem = (): VoxelModel => {
  const M = { stone: 0, stoneLight: 1, stoneDark: 2, crack: 3, eye: 4 };
  const cx = 17;
  const parts: Part[] = [
    ...pair('Leg', [13.5, 16, 10], [
      box(10.5, 12.5, 2, 16, 19.5, 10, M.stone),
      box(11, 18.8, 5, 15.5, 20, 8.5, M.stoneLight),        // knee plate
      box(10, 11.5, 0, 16.5, 20.5, 2.5, M.stoneDark),
    ], cx),
    {
      name: 'torso', pivot: [17, 16, 10], shapes: [
        box(11, 12, 10, 23, 20, 17, M.stoneDark),
        box(12, 19.2, 11, 22, 20.6, 16, M.stoneLight),        // ab plates
        box(8, 11, 17, 26, 21, 29, M.stone),                  // massive chest
        box(9.5, 20.5, 21, 16.5, 21.8, 28, M.stoneLight),     // pecs
        box(17.5, 20.5, 21, 24.5, 21.8, 28, M.stoneLight),
        box(16.5, 21.2, 17, 17.5, 22.2, 28.5, M.crack),       // glowing fissures
        box(11, 20.6, 13, 12, 21.4, 18, M.crack),
        box(21.5, 20.6, 14, 22.5, 21.4, 19.5, M.crack),
        box(9, 10.4, 20, 25, 11.5, 27, M.stoneDark),          // back slab
      ],
    },
    {
      name: 'head', parent: 'torso', pivot: [17, 16, 28], shapes: [
        box(13.5, 14, 28, 20.5, 21, 34, M.stone),
        box(13, 20.4, 31.5, 21, 21.8, 33, M.stoneDark),       // heavy brow
        box(14.3, 21, 29.8, 16.6, 22, 31.3, M.eye),
        box(17.4, 21, 29.8, 19.7, 22, 31.3, M.eye),
        box(15, 20.9, 28.2, 19, 21.5, 29, M.stoneDark),       // mouth line
      ],
    },
    ...pair('Arm', [7.5, 16, 27], [
      box(3, 12, 23, 10, 20, 30, M.stoneLight),               // boulder shoulder
      box(4, 13, 14, 9, 19, 23, M.stone),
      box(3, 12.5, 5, 10, 20.5, 14, M.stone),                 // huge fist
      box(3.5, 20, 7, 9.5, 21, 12, M.stoneLight),             // knuckles
      box(4.5, 19.2, 16, 5.5, 19.8, 21, M.crack),
    ], cx, 'torso'),
  ];
  const walk: Pose[] = STRIDE.map((s) => ({
    leftLeg: { pitch: 0.4 * s },
    rightLeg: { pitch: -0.4 * s },
    leftArm: { pitch: -0.3 * s },
    rightArm: { pitch: 0.3 * s },
    torso: { offset: [0, 0, s === 0 ? 1 : 0], roll: 0.06 * s },
  }));
  const attack: Pose[] = [
    { rightArm: { pitch: 2.3 }, leftArm: { pitch: 0.4 }, torso: { yaw: 0.25 } },
    { rightArm: { pitch: 1.1 }, torso: { pitch: 0.12, offset: [0, 1.5, 0] } },
    { rightArm: { pitch: 0.3 }, leftArm: { pitch: 0.7 }, torso: { pitch: 0.2, yaw: -0.2, offset: [0, 2, -1] } },
  ];
  return {
    size: [34, 32, 38],
    foot: [17, 16, 0],
    materials: [
      { color: 0x7b818c }, { color: 0xa3a9b3 }, { color: 0x4f5561 },
      { color: 0x22d3ee, emissive: true }, { color: 0x67e8f9, emissive: true },
    ],
    parts,
    animations: { walk, attack, idle: breathe('torso') },
  };
};

// ── Wayfarer — hooded rogue with glowing green eyes and a dagger ─────────────

const wayfarer = (): VoxelModel => {
  const M = { cloak: 0, cloakDark: 1, tunic: 2, leather: 3, pants: 4, boots: 5, shadow: 6, eye: 7, blade: 8, skin: 9 };
  const cx = 15;
  const parts: Part[] = [
    ...pair('Leg', [13.25, 15, 11], [box(12, 13.5, 4, 14.5, 16.5, 11, M.pants), box(11.7, 13, 0, 14.8, 17.8, 4, M.boots)], cx),
    {
      name: 'torso', pivot: [15, 15, 11], shapes: [
        box(11, 12.5, 11, 19, 17.5, 22, M.tunic),
        box(11, 12.5, 12.5, 19, 17.8, 14, M.leather),         // belt
        box(16.5, 17.5, 11, 18.5, 18.6, 13.5, M.leather),     // belt pouch
        box(12, 17.3, 15, 13, 17.9, 21, M.leather),           // strap
        ell(15, 15, 22, 5.3, 3.4, 1.8, M.cloak),              // cloak shoulders
      ],
    },
    { name: 'cape', parent: 'torso', pivot: [15, 12, 22], shapes: [box(10.5, 10.8, 7, 19.5, 12.2, 22, M.cloak), box(11, 10.4, 7, 19, 11, 10, M.cloakDark)] },
    {
      name: 'head', parent: 'torso', pivot: [15, 15, 23], shapes: [
        box(11.2, 11.8, 22.5, 18.8, 18.2, 30.5, M.cloak),     // deep hood
        ell(15, 14.5, 30.5, 4, 3.6, 1.8, M.cloak),
        box(14, 10.5, 25, 16, 12, 31, M.cloakDark),           // hood point
        box(12.5, 17.4, 23, 17.5, 18.4, 28.5, M.shadow),      // face in shadow
        box(12.5, 17.4, 23, 17.5, 18.4, 24.5, M.skin),        // chin
        box(13.2, 18, 26, 14.4, 18.8, 27, M.eye),
        box(15.6, 18, 26, 16.8, 18.8, 27, M.eye),
      ],
    },
    ...pair('Arm', [9.75, 15, 22], [box(8.5, 13.8, 14, 11, 16.2, 22, M.cloakDark), box(8.6, 13.9, 12, 10.9, 16.1, 14.5, M.leather)], cx, 'torso'),
    {
      name: 'dagger', parent: 'rightArm', pivot: [20.25, 15, 12.5], shapes: [
        box(19.8, 14, 12, 20.8, 17, 13.3, M.leather),
        box(19, 17, 11.8, 21.6, 17.8, 13.5, M.cloakDark),     // guard
        box(19.9, 17.8, 12.2, 20.7, 24, 13.1, M.blade),
      ],
    },
  ];
  // Runs hunched forward with the cape streaming behind
  const walk: Pose[] = STRIDE.map((s) => ({
    leftLeg: { pitch: 0.65 * s },
    rightLeg: { pitch: -0.65 * s },
    leftArm: { pitch: -0.5 * s },
    rightArm: { pitch: 0.4 * s },
    torso: { pitch: 0.12, offset: [0, 0, s === 0 ? 1 : 0] },
    cape: { pitch: -0.35 - 0.15 * Math.abs(s) },
  }));
  const attack: Pose[] = [
    { rightArm: { pitch: 2.0 }, torso: { yaw: 0.35, pitch: 0.1 }, cape: { pitch: -0.3 } },
    { rightArm: { pitch: 1.2, offset: [0, 2, 0] }, torso: { yaw: -0.1, pitch: 0.15 }, leftLeg: { pitch: 0.4 }, cape: { pitch: -0.5 } },
    { rightArm: { pitch: 0.6, offset: [0, 1, 0] }, torso: { yaw: -0.35, pitch: 0.18 }, cape: { pitch: -0.6 } },
  ];
  const idle = breathe('torso', { cape: { pitch: -0.1 } });
  return {
    size: [30, 32, 36],
    foot: [15, 15, 0],
    materials: [
      { color: 0x6b5140 }, { color: 0x45342a }, { color: 0x3f5a3a }, { color: 0x5a3f28 }, { color: 0x3b3f47 },
      { color: 0x292524 }, { color: 0x1a1512 }, { color: 0x4ade80, emissive: true }, { color: 0xe2e8f0 }, { color: 0xc68e62 },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── Chrono — old wizard with a pointed hat, orb staff and golden pocket watch ─

const chronoWizard = (): VoxelModel => {
  const M = { robe: 0, robeDark: 1, trim: 2, skin: 3, beard: 4, hat: 5, hatBand: 6, staff: 7, orb: 8, gold: 9, face: 10, eye: 11 };
  const cx = 15;
  const parts: Part[] = [
    {
      name: 'robe', pivot: [15, 15, 12], shapes: [
        box(10, 10.5, 0, 20, 19.5, 4, M.robeDark),
        box(10.5, 11, 4, 19.5, 19, 8, M.robe),
        box(11, 11.5, 8, 19, 18.5, 12, M.robe),
        box(9.8, 10.3, 0, 20.2, 19.7, 1.2, M.trim),
        box(14.3, 18.9, 0, 15.7, 19.8, 12, M.robeDark),       // robe opening
      ],
    },
    {
      name: 'torso', parent: 'robe', pivot: [15, 15, 12], shapes: [
        box(11, 12, 12, 19, 18, 22, M.robe),
        box(11, 12, 13, 19, 18.3, 14.2, M.staff),             // rope belt
        box(12.5, 17.8, 18, 17.5, 18.6, 22, M.trim),          // collar trim
      ],
    },
    {
      name: 'head', parent: 'torso', pivot: [15, 15, 22], shapes: [
        box(12.5, 13, 22, 17.5, 18, 28, M.skin),
        box(12, 12.5, 23, 18, 15, 28, M.beard),               // white hair
        box(13.3, 17.9, 25.5, 14.5, 18.5, 26.5, M.eye),
        box(15.5, 17.9, 25.5, 16.7, 18.5, 26.5, M.eye),
        box(14.5, 18, 24.2, 15.5, 19, 26, M.skin),            // nose
        box(12.5, 16.8, 17, 17.5, 19.2, 24.8, M.beard),       // long beard
        ell(15, 18.4, 17.5, 2.6, 1.3, 3.8, M.beard),
        box(13, 18.2, 24, 17, 19.3, 25, M.beard),             // moustache
        ell(15, 15, 28.6, 6.6, 6.6, 0.9, M.hat),              // brim
        box(12, 12, 29, 18, 18, 32, M.hat),                   // cone
        box(12, 12, 29, 18, 18.3, 30.2, M.hatBand),
        box(13, 12.5, 32, 17, 17.5, 35, M.hat),
        box(14, 13, 35, 16, 17, 38, M.hat),
        box(14.5, 11.5, 37.5, 15.5, 13.5, 40.5, M.hat),       // bent tip
      ],
    },
    ...pair('Arm', [10, 15, 21], [
      box(8, 13, 13, 11.5, 17, 21, M.robe),
      box(7.5, 12.5, 12, 12, 17.5, 14, M.robeDark),           // wide cuff
      ball(9.7, 15.5, 11.5, 1.4, M.skin),
    ], cx, 'torso'),
    {
      name: 'staff', parent: 'rightArm', pivot: [20.3, 15.5, 12], shapes: [
        box(20, 15, 1, 21, 16, 31, M.staff),
        box(20, 16, 31, 21, 17.5, 33, M.staff),               // gnarled crook
        box(20, 17, 33, 21, 18.5, 35.5, M.staff),
        box(20, 15, 34.5, 21, 17.5, 35.5, M.staff),
        ball(20.5, 16, 32.8, 1.5, M.orb),
      ],
    },
    {
      name: 'watch', parent: 'leftArm', pivot: [9.7, 15.5, 11.5], shapes: [
        box(9.4, 16, 11, 10, 17.2, 13, M.gold),               // chain
        ell(9.7, 17.8, 9.5, 2.4, 0.8, 2.4, M.gold),
        ell(9.7, 18.3, 9.5, 1.7, 0.5, 1.7, M.face),
      ],
    },
  ];
  const walk: Pose[] = STRIDE.map((s) => ({
    robe: { roll: 0.05 * s, offset: [0, 0, s === 0 ? 1 : 0] },
    leftArm: { pitch: -0.2 * s },
    watch: { pitch: 0.2 * s },
    rightArm: { pitch: 0.15 * s },
    staff: { pitch: -0.15 * s },
  }));
  // Raises the pocket watch (face kept toward the enemy) and the staff orb flares
  const attack: Pose[] = [
    { leftArm: { pitch: 1.0 }, watch: { pitch: -1.0 }, rightArm: { pitch: 0.4 }, staff: { pitch: -0.4 } },
    { leftArm: { pitch: 1.4 }, watch: { pitch: -1.4, scale: [1.3, 1.3, 1.3] }, rightArm: { pitch: 0.5 }, staff: { pitch: -0.5 } },
    { leftArm: { pitch: 1.2 }, watch: { pitch: -1.2, scale: [1.15, 1.15, 1.15] }, rightArm: { pitch: 0.3 }, staff: { pitch: -0.3 } },
  ];
  // The watch swings gently like a pendulum
  const idle: Pose[] = [{ watch: { roll: 0.2 } }, { watch: { roll: -0.2 }, robe: { offset: [0, 0, -1] } }];
  return {
    size: [30, 32, 44],
    foot: [15, 15, 0],
    materials: [
      { color: 0x5b3fa0 }, { color: 0x3b2a6b }, { color: 0xd4a017 }, { color: 0xe8c39e }, { color: 0xe5e7eb },
      { color: 0x4c3b8a }, { color: 0x2e2257 }, { color: 0x6b4423 }, { color: 0x60a5fa, emissive: true },
      { color: 0xfbbf24 }, { color: 0xf0fdfa, emissive: true }, { color: 0x1e293b },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── Aqua Slime (support) — glossy cyan blob with big shiny eyes ──────────────

const slime = (): VoxelModel => {
  const M = { slime: 0, slimeLight: 1, slimeDeep: 2, eye: 3, shine: 4, iris: 5, halo: 6, mouth: 7 };
  const parts: Part[] = [
    {
      name: 'body', pivot: [12, 12, 0], shapes: [
        ell(12, 12, 1.2, 8.2, 7.6, 1.3, M.slimeDeep),          // puddle base
        ell(12, 12, 6, 7.2, 6.6, 6.4, M.slime),
        ell(11.5, 11.5, 8.6, 5, 4.6, 3.6, M.slimeLight),
        box(8.4, 17.3, 6.5, 10.8, 18.8, 10, M.eye),           // big eyes
        box(13.2, 17.3, 6.5, 15.6, 18.8, 10, M.eye),
        box(9.2, 18.2, 7, 10.4, 19, 8.4, M.iris),
        box(14, 18.2, 7, 15.2, 19, 8.4, M.iris),
        box(8.6, 18.3, 8.8, 9.6, 19.1, 9.8, M.shine),
        box(13.4, 18.3, 8.8, 14.4, 19.1, 9.8, M.shine),
        box(11.4, 18, 5, 12.6, 18.9, 5.9, M.mouth),
        box(8.5, 10.5, 11, 10.5, 12.5, 12.2, M.shine),        // gloss highlight
      ],
    },
    {
      // Healing halo only appears while casting
      name: 'halo', parent: 'body', pivot: [12, 12, 15], shapes: [
        box(8.5, 8.5, 14.5, 15.5, 9.5, 15.5, M.halo),
        box(8.5, 14.5, 14.5, 15.5, 15.5, 15.5, M.halo),
        box(8.5, 9.5, 14.5, 9.5, 14.5, 15.5, M.halo),
        box(14.5, 9.5, 14.5, 15.5, 14.5, 15.5, M.halo),
      ],
    },
  ];
  const hide = { halo: { hidden: true } };
  const walk: Pose[] = [
    { body: { scale: [1.15, 1.15, 0.78] }, ...hide },
    { body: { scale: [0.9, 0.9, 1.18], offset: [0, 0, 2] }, ...hide },
    { body: { scale: [0.96, 0.96, 1.06], offset: [0, 0, 3] }, ...hide },
    { body: { scale: [1.08, 1.08, 0.88], offset: [0, 0, 0.5] }, ...hide },
  ];
  const attack: Pose[] = [
    { body: { scale: [1.2, 1.2, 0.72] }, ...hide },
    { body: { scale: [0.88, 0.88, 1.22], offset: [0, 0, 2] }, halo: { offset: [0, 0, 2], scale: [1.3, 1.3, 1] } },
    { body: { scale: [1.04, 1.04, 0.96] }, halo: { scale: [1.5, 1.5, 1] } },
  ];
  const idle: Pose[] = [{ body: { scale: [1.05, 1.05, 0.95] }, ...hide }, { body: { scale: [0.97, 0.97, 1.04] }, ...hide }];
  return {
    size: [24, 24, 28],
    foot: [12, 12, 0],
    materials: [
      { color: 0x22c3e6 }, { color: 0xa5f3fc }, { color: 0x0e88b0 }, { color: 0x0c2a4a },
      { color: 0xffffff, emissive: true }, { color: 0x38bdf8, emissive: true }, { color: 0x86efac, emissive: true }, { color: 0x0c4a6e },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── Ancient Ent (TREANT) — a living tree with a bark face and green eyes ─────

const treant = (): VoxelModel => {
  const M = { bark: 0, barkDark: 1, leaf: 2, leafLight: 3, eye: 4, moss: 5, vine: 6 };
  const cx = 18;
  const parts: Part[] = [
    ...pair('Leg', [15, 16, 9], [
      box(12.5, 13.5, 2, 17, 18.5, 10, M.barkDark),
      box(11, 12, 0, 18, 20.5, 2.5, M.barkDark),              // root feet
      box(12, 20, 0, 13.5, 23, 1.5, M.bark),
      box(15, 20, 0, 16.5, 22.5, 1.5, M.bark),
    ], cx),
    {
      name: 'trunk', pivot: [18, 16, 9], shapes: [
        box(11.5, 11.5, 9, 24.5, 20.5, 31, M.bark),
        box(13.5, 20.1, 10, 14.5, 21, 30, M.barkDark),        // bark ridges
        box(17.5, 20.1, 9, 18.5, 21, 20, M.barkDark),
        box(21.5, 20.1, 10, 22.5, 21, 30, M.barkDark),
        box(15.5, 20.1, 10, 17, 21, 13, M.moss),
        box(19, 20.2, 14, 20.5, 21.1, 18, M.vine),
        box(14.3, 20.3, 24, 16.7, 21.4, 25.8, M.eye),
        box(19.3, 20.3, 24, 21.7, 21.4, 25.8, M.eye),
        box(13.5, 20.5, 25.8, 22.5, 21.8, 27.3, M.barkDark),  // brow
        box(16.3, 20.3, 18.5, 19.7, 21.2, 20.5, M.barkDark),  // mouth hollow
        box(16.8, 20.8, 20.5, 19.2, 21.8, 23.5, M.bark),      // bark nose
      ],
    },
    {
      name: 'crown', parent: 'trunk', pivot: [18, 16, 31], shapes: [
        ell(18, 16, 36, 10, 9, 6.5, M.leaf),
        ell(11.5, 15, 33.5, 5.5, 5.5, 4, M.leaf),
        ell(24.5, 17, 33.5, 5.5, 5.5, 4, M.leaf),
        ell(18, 15, 40.5, 6, 5.5, 3.5, M.leafLight),
        ell(13.5, 20, 37, 3, 2.5, 2.5, M.leafLight),
        ell(22.5, 20.5, 35.5, 3, 2.5, 2.5, M.leafLight),
      ],
    },
    ...pair('Arm', [11.5, 16, 27], [
      box(8, 14.5, 14, 11.5, 17.5, 28, M.bark),
      box(6.5, 15, 11.5, 8.5, 17.5, 15, M.barkDark),
      box(10, 16.5, 11.5, 11.5, 18.5, 14, M.barkDark),
      ell(8, 16, 28, 3, 3, 2.4, M.leaf),
      box(7.5, 17.5, 20, 8.5, 18.3, 24, M.vine),
    ], cx, 'trunk'),
  ];
  const walk: Pose[] = STRIDE.map((s) => ({
    leftLeg: { pitch: 0.35 * s },
    rightLeg: { pitch: -0.35 * s },
    leftArm: { pitch: -0.25 * s },
    rightArm: { pitch: 0.25 * s },
    trunk: { roll: 0.04 * s, offset: [0, 0, s === 0 ? 1 : 0] },
    crown: { roll: -0.05 * s },
  }));
  const attack: Pose[] = [
    { leftArm: { pitch: 2.4 }, rightArm: { pitch: 2.4 }, trunk: { pitch: -0.08 }, crown: { roll: 0.05 } },
    { leftArm: { pitch: 1.2 }, rightArm: { pitch: 1.2 }, trunk: { pitch: 0.05 } },
    { leftArm: { pitch: 0.25 }, rightArm: { pitch: 0.25 }, trunk: { pitch: 0.15, offset: [0, 1, -1] }, crown: { roll: -0.06 } },
  ];
  const idle: Pose[] = [{ crown: { roll: 0.05 } }, { crown: { roll: -0.05 }, leftArm: { pitch: 0.08 }, rightArm: { pitch: -0.08 } }];
  return {
    size: [38, 32, 48],
    foot: [18, 16, 0],
    materials: [
      { color: 0x7a4f2c }, { color: 0x4a2e17 }, { color: 0x2f8f3a }, { color: 0x56c45a },
      { color: 0x4ade80, emissive: true }, { color: 0x4d7c0f }, { color: 0x65a30d },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── Merman — teal fish-man on a fish tail, orange fins, silver trident ───────

const merman = (): VoxelModel => {
  const M = { scale: 0, scaleLight: 1, belly: 2, fin: 3, finDark: 4, eye: 5, silver: 6, shaft: 7, dark: 8 };
  const cx = 15;
  const parts: Part[] = [
    {
      // Coiled fish tail instead of legs
      name: 'tail', pivot: [15, 15, 10], shapes: [
        ell(15, 15, 9.5, 4.6, 4, 4.2, M.scale),
        ell(15, 13, 5.5, 3.6, 3.6, 3, M.scale),
        ell(15, 10.5, 2.5, 2.6, 3, 2.2, M.scaleLight),
        ell(15, 16.5, 7, 3, 1.8, 3.5, M.belly),
        ell(12.2, 7.8, 1, 3, 1.6, 1, M.fin),                  // tail fluke
        ell(17.8, 7.8, 1, 3, 1.6, 1, M.fin),
        box(14, 7, 0, 16, 9, 1.5, M.finDark),
      ],
    },
    {
      name: 'torso', parent: 'tail', pivot: [15, 15, 12], shapes: [
        ell(15, 15, 18, 5, 3.8, 6.5, M.scale),
        ell(15, 17.8, 17, 3.3, 1.4, 5, M.belly),
        box(14.5, 10.5, 14, 15.5, 13, 24, M.fin),             // dorsal fin
      ],
    },
    {
      name: 'head', parent: 'torso', pivot: [15, 15.5, 23], shapes: [
        ell(15, 16, 26.5, 3.8, 4.2, 3.8, M.scaleLight),
        box(11.6, 17.2, 26.5, 13, 18.8, 28, M.eye),
        box(17, 17.2, 26.5, 18.4, 18.8, 28, M.eye),
        box(13.5, 19.8, 24, 16.5, 20.5, 25, M.dark),
        box(14.5, 11.5, 29, 15.5, 19, 33, M.fin),             // crest
        box(14.5, 13, 33, 15.5, 16, 35, M.finDark),
        ell(10.8, 15, 26, 0.8, 2.4, 2.6, M.fin),              // ear fins
        ell(19.2, 15, 26, 0.8, 2.4, 2.6, M.fin),
      ],
    },
    ...pair('Arm', [9.5, 15, 21], [
      box(8.3, 14, 13, 10.7, 16, 21, M.scale),
      box(8.1, 14, 11.5, 10.9, 16.5, 13.5, M.scaleLight),
      ell(7.8, 15, 15, 0.7, 1.9, 1.7, M.fin),                 // wrist fins
    ], cx, 'torso'),
    {
      name: 'trident', parent: 'rightArm', pivot: [20.5, 15.5, 12.5], shapes: [
        box(20, 15, 0, 21, 16, 33, M.shaft),
        box(18, 15, 32, 23, 16, 33.2, M.silver),
        box(18, 15, 33, 19, 16, 37, M.silver),
        box(20, 15, 33, 21, 16, 39, M.silver),
        box(22, 15, 33, 23, 16, 37, M.silver),
      ],
    },
  ];
  const walk: Pose[] = STRIDE.map((s) => ({
    tail: { roll: 0.08 * s, offset: [0, 0, s === 0 ? 1 : 0] },
    torso: { roll: -0.06 * s },
    leftArm: { pitch: -0.3 * s },
    rightArm: { pitch: 0.2 * s },
    trident: { pitch: -0.2 * s },
  }));
  const thrust = (arm: number, reach: number): Pose => ({
    rightArm: { pitch: arm, offset: [0, reach, 0] },
    trident: { pitch: -Math.PI / 2 - arm },
    torso: { yaw: -0.2 },
  });
  const attack: Pose[] = [thrust(0.9, -2), thrust(1.3, 3), thrust(1.05, 1)];
  const idle: Pose[] = [{ head: { pitch: 0.05 }, tail: { roll: 0.05 } }, { head: { pitch: -0.05 }, tail: { roll: -0.05, offset: [0, 0, -1] } }];
  return {
    size: [30, 36, 40],
    foot: [15, 15, 0],
    materials: [
      { color: 0x14a3a0 }, { color: 0x2dd4bf }, { color: 0x99f6e4 }, { color: 0xf97316 }, { color: 0xc2410c },
      { color: 0xfde047, emissive: true }, { color: 0xd1d5db }, { color: 0x94a3b8 }, { color: 0x083344 },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── Necromancer — hooded skeleton in dark green robes, skull staff, soulfire ─

const necromancer = (): VoxelModel => {
  const M = { robe: 0, robeDark: 1, trim: 2, bone: 3, eye: 4, flame: 5, flameHot: 6, staff: 7, socket: 8 };
  const cx = 15;
  const parts: Part[] = [
    {
      name: 'robe', pivot: [15, 15, 12], shapes: [
        box(10, 10.5, 0, 20, 19.5, 4, M.robeDark),
        box(10.5, 11, 4, 19.5, 19, 8, M.robe),
        box(11, 11.5, 8, 19, 18.5, 12, M.robe),
        box(9.8, 10.3, 0, 20.2, 19.7, 1.2, M.trim),
      ],
    },
    {
      name: 'torso', parent: 'robe', pivot: [15, 15, 12], shapes: [
        box(11, 12, 12, 19, 18, 22, M.robe),
        box(14, 17.6, 5, 16, 18.6, 22, M.trim),
        box(13.5, 17.9, 17, 16.5, 18.8, 20, M.bone),          // exposed ribs
        box(14.3, 18.5, 17.5, 14.8, 19, 19.5, M.socket),
        box(15.2, 18.5, 17.5, 15.7, 19, 19.5, M.socket),
      ],
    },
    {
      name: 'head', parent: 'torso', pivot: [15, 15, 22], shapes: [
        box(11, 11.5, 22, 19, 17.2, 30, M.robe),              // hood
        ell(15, 14.5, 30, 4, 3.5, 2, M.robe),
        box(14, 10.5, 27, 16, 12, 32, M.robeDark),
        ell(15, 15.8, 25.2, 3, 3, 3.2, M.bone),               // skull
        box(13.3, 18.2, 25, 14.6, 19.2, 26.4, M.eye),
        box(15.4, 18.2, 25, 16.7, 19.2, 26.4, M.eye),
        box(13.8, 18.3, 22.8, 16.2, 19, 23.6, M.socket),      // teeth line
      ],
    },
    ...pair('Arm', [10, 15, 21], [box(8, 13, 13, 11.5, 17, 21, M.robe), ball(9.7, 15.5, 12, 1.4, M.bone)], cx, 'torso'),
    {
      name: 'staff', parent: 'rightArm', pivot: [20.3, 15.5, 12], shapes: [
        box(20, 15, 1, 21, 16, 30, M.staff),
        ell(20.5, 15.8, 32.2, 2.2, 2.2, 2.4, M.bone),         // skull head
        box(19.3, 17.8, 32.3, 20.3, 18.4, 33.4, M.eye),
        box(20.7, 17.8, 32.3, 21.7, 18.4, 33.4, M.eye),
      ],
    },
    { name: 'soulfire', parent: 'leftArm', pivot: [9.7, 15.5, 12], shapes: [ell(9.7, 16.5, 14.5, 1.8, 1.8, 2.6, M.flame), ell(9.7, 16.5, 14, 0.9, 0.9, 1.3, M.flameHot)] },
  ];
  const walk: Pose[] = STRIDE.map((s) => ({
    robe: { roll: 0.05 * s, offset: [0, 0, s === 0 ? 1 : 0] },
    leftArm: { pitch: -0.25 * s },
    rightArm: { pitch: 0.15 * s },
    staff: { pitch: -0.15 * s },
    soulfire: { hidden: true },
  }));
  // Raises a hand wreathed in green soulfire
  const attack: Pose[] = [
    { leftArm: { pitch: 1.2 }, soulfire: { scale: [1.2, 1.2, 1.2] }, rightArm: { pitch: 0.3 }, staff: { pitch: -0.3 } },
    { leftArm: { pitch: 1.6 }, soulfire: { scale: [1.8, 1.8, 1.8] }, rightArm: { pitch: 0.5 }, staff: { pitch: -0.5 } },
    { leftArm: { pitch: 1.4 }, soulfire: { scale: [1.4, 1.4, 1.4], offset: [0, 2, 0] }, rightArm: { pitch: 0.3 }, staff: { pitch: -0.3 } },
  ];
  const idle: Pose[] = [
    { leftArm: { pitch: 0.6 }, soulfire: { scale: [1, 1, 1] } },
    { leftArm: { pitch: 0.6 }, soulfire: { scale: [1.3, 1.3, 1.5] }, robe: { offset: [0, 0, -1] } },
  ];
  return {
    size: [30, 32, 40],
    foot: [15, 15, 0],
    materials: [
      { color: 0x1c3a2a }, { color: 0x0f2118 }, { color: 0x15803d }, { color: 0xe7e5e4 },
      { color: 0x4ade80, emissive: true }, { color: 0x22c55e, emissive: true }, { color: 0xbbf7d0, emissive: true },
      { color: 0x5b4636 }, { color: 0x1c1917 },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── Sapling — mini sprout summoned by the Sapling Grove (Ancient Ent palette) ─

const sapling = (): VoxelModel => {
  const M = { bark: 0, barkDark: 1, leaf: 2, leafLight: 3, eye: 4, bud: 5 };
  const cx = 9;
  const parts: Part[] = [
    ...pair('Leg', [7.5, 9, 5], [
      box(6.5, 7.5, 1, 8.5, 10, 5.5, M.barkDark),
      box(6, 7, 0, 9, 11.5, 1.3, M.barkDark),                 // root toes
    ], cx),
    {
      name: 'trunk', pivot: [9, 9, 5], shapes: [
        ell(9, 9, 9, 3.6, 3.2, 4.4, M.bark),
        box(7.6, 11.6, 9.5, 8.8, 12.4, 10.9, M.eye),
        box(9.2, 11.6, 9.5, 10.4, 12.4, 10.9, M.eye),
        box(8.2, 11.9, 7.2, 9.8, 12.5, 7.9, M.barkDark),      // tiny mouth
      ],
    },
    {
      name: 'sprout', parent: 'trunk', pivot: [9, 9, 13], shapes: [
        box(8.5, 8.5, 12.5, 9.5, 9.5, 16, M.barkDark),        // stem
        ell(6.2, 9, 16.5, 3.2, 2, 1.3, M.leaf),               // twin leaves
        ell(11.8, 9, 16.8, 3.2, 2, 1.3, M.leafLight),
        ball(9, 9, 16.8, 1.3, M.bud),
      ],
    },
    ...pair('Arm', [5.8, 9, 10], [
      box(4.6, 8.3, 6, 6.2, 9.7, 10.5, M.bark),
      ell(5.2, 9, 5.8, 1.1, 1.1, 1.1, M.leaf),
    ], cx, 'trunk'),
  ];
  const walk: Pose[] = STRIDE.map((s) => ({
    leftLeg: { pitch: 0.5 * s },
    rightLeg: { pitch: -0.5 * s },
    leftArm: { pitch: -0.4 * s },
    rightArm: { pitch: 0.4 * s },
    trunk: { roll: 0.08 * s, offset: [0, 0, s === 0 ? 1 : 0] },
    sprout: { roll: -0.15 * s },
  }));
  const attack: Pose[] = [
    { leftArm: { pitch: 2.2 }, rightArm: { pitch: 2.2 }, sprout: { roll: 0.2 } },
    { leftArm: { pitch: 0.4 }, rightArm: { pitch: 0.4 }, trunk: { pitch: 0.25, offset: [0, 1.5, -0.5] }, sprout: { roll: -0.2 } },
    { trunk: { pitch: 0.1 } },
  ];
  const idle: Pose[] = [{ sprout: { roll: 0.12 } }, { sprout: { roll: -0.12 }, trunk: { offset: [0, 0, -0.5] } }];
  return {
    size: [18, 18, 20],
    foot: [9, 9, 0],
    materials: [
      { color: 0x7a4f2c }, { color: 0x4a2e17 }, { color: 0x2f8f3a }, { color: 0x56c45a },
      { color: 0x4ade80, emissive: true }, { color: 0xf9a8d4 },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── Registry ─────────────────────────────────────────────────────────────────

export type MinionSpriteKey =
  | 'golem' | 'wayfarer' | 'chrono' | 'slime' | 'treant' | 'merman' | 'necromancer' | 'sapling'
  | 'kraken' | 'demonHound' | 'harpy';

export const MINION_MODELS: Record<MinionSpriteKey, () => VoxelModel> = {
  golem,
  wayfarer,
  chrono: chronoWizard,
  slime,
  treant,
  merman,
  necromancer,
  sapling,
  // Variants of existing models, recoloured to match the codex artwork
  kraken: () => recolorModel(ENEMY_MODELS.deepOne(), 0xb45353, 0xfacc15, 0.6, 1.15),
  demonHound: () => recolorModel(golem(), 0x9a3412, 0xfb923c, 0.65, 0.85),
  harpy: () => recolorModel(wayfarer(), 0x8b5e34, 0xfde68a, 0.6),
};

export const UNIT_SPRITE: Record<UnitClass, MinionSpriteKey> = {
  TREANT: 'treant',
  AQUA_SLIME: 'slime',
  GOLEM: 'golem',
  MERMAN: 'merman',
  NECROMANCER: 'necromancer',
  KRAKEN: 'kraken',
  DEMON_HOUND: 'demonHound',
  SUCCUBUS: 'chrono',
  LAVA_GARGOYLE: 'wayfarer',
  HARPY: 'harpy',
};
