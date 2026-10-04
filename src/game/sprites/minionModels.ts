import type { UnitClass } from '../../types/game';
import type { Part, Pose, Shape, Vec3, VoxelModel } from './VoxelSprite';
import { breathe } from './enemyModels';
import { recolorModel } from './VoxelSprite';

/**
 * Voxel models for the Demon Lord's minions, following the bestiary artwork in
 * public/portraits/. Same conventions as enemyModels.ts:
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

// ── Lava Gargoyle (LAVA_GARGOYLE) — volcanic rock, fiery bat wings & horns ───

const lavaGargoyle = (): VoxelModel => {
  const M = { rock: 0, magma: 1, flame: 2, horn: 3, eye: 4, wingBone: 5, wingMembrane: 6 };
  const cx = 16;
  const parts: Part[] = [
    ...pair('Leg', [13, 16, 8], [
      box(11, 14, 2, 15, 18, 9, M.rock),
      box(10.5, 13, 0, 15.5, 19.5, 2.5, M.rock),               // talons
      box(11.2, 17.5, 4, 14.8, 18.2, 7, M.magma),             // glowing vein
    ], cx),
    {
      name: 'torso', pivot: [16, 16, 9], shapes: [
        box(11, 13, 9, 21, 19, 23, M.rock),
        box(12, 18.2, 11, 20, 19.5, 21, M.magma),             // magma chest core
        box(14, 18.8, 13, 18, 19.8, 19, M.flame),
        box(15.5, 10, 8, 16.5, 12, 18, M.rock),               // spiked tail
        box(15.5, 7.5, 5, 16.5, 10, 8.5, M.flame),
      ],
    },
    {
      name: 'head', parent: 'torso', pivot: [16, 16, 23], shapes: [
        box(12.5, 13, 23, 19.5, 19.5, 29, M.rock),
        box(13.2, 19.2, 25.5, 14.8, 19.8, 27, M.eye),         // burning orange eyes
        box(17.2, 19.2, 25.5, 18.8, 19.8, 27, M.eye),
        box(14, 18.8, 23.5, 18, 19.6, 24.5, M.magma),         // fanged maw
        box(11, 14, 28, 13.5, 17, 33, M.horn),                // curved horns
        box(18.5, 14, 28, 21, 17, 33, M.horn),
      ],
    },
    ...pair('Arm', [9.5, 16, 21], [
      box(8, 14, 13, 11, 18, 22, M.rock),
      box(7.5, 13.5, 7, 11.5, 18.5, 13, M.magma),             // fiery claws
      box(7.8, 17.5, 7.5, 11.2, 18.6, 10.5, M.flame),
    ], cx, 'torso'),
    ...pair('Wing', [10, 12, 20], [
      box(4, 11, 19, 11, 12.5, 22, M.wingBone),               // wing spar
      box(1, 11, 21, 5, 12.5, 30, M.wingBone),
      box(1.5, 11.5, 14, 10, 12.2, 26, M.wingMembrane),       // fiery membrane
      box(2.5, 11.6, 16, 9, 12.1, 23, M.flame),
    ], cx, 'torso'),
  ];
  const walk: Pose[] = STRIDE.map((s) => ({
    leftLeg: { pitch: 0.5 * s },
    rightLeg: { pitch: -0.5 * s },
    leftArm: { pitch: -0.4 * s },
    rightArm: { pitch: 0.4 * s },
    leftWing: { yaw: 0.3 * s, roll: 0.1 * s },
    rightWing: { yaw: -0.3 * s, roll: -0.1 * s },
    torso: { pitch: 0.1, offset: [0, 0, s === 0 ? 1 : 0] },
  }));
  const attack: Pose[] = [
    { leftWing: { yaw: 0.6 }, rightWing: { yaw: -0.6 }, rightArm: { pitch: 1.8 }, torso: { pitch: -0.1 } },
    { leftWing: { yaw: -0.4 }, rightWing: { yaw: 0.4 }, rightArm: { pitch: 0.5, offset: [0, 2, 0] }, torso: { pitch: 0.25 } },
    { leftWing: { yaw: 0.1 }, rightWing: { yaw: -0.1 }, rightArm: { pitch: 0.8 }, torso: { pitch: 0.1 } },
  ];
  const idle = breathe('torso', { leftWing: { roll: 0.15 }, rightWing: { roll: -0.15 } });
  return {
    size: [36, 32, 36],
    foot: [16, 16, 0],
    materials: [
      { color: 0x27272a }, { color: 0xea580c, emissive: true }, { color: 0xfbbf24, emissive: true },
      { color: 0x18181b }, { color: 0xf97316, emissive: true }, { color: 0x3f3f46 }, { color: 0xc2410c, emissive: true },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── Succubus (SUCCUBUS) — dark winged demoness, horns, purple/charm magic ───

const succubus = (): VoxelModel => {
  const M = { skin: 0, hair: 1, corset: 2, horn: 3, eye: 4, wingBone: 5, wingMembrane: 6, magicOrb: 7, magicGlow: 8 };
  const cx = 15;
  const parts: Part[] = [
    ...pair('Leg', [13.5, 15, 11], [
      box(12.2, 13.8, 3, 14.8, 16.2, 11, M.skin),
      box(12, 13.5, 0, 15, 16.8, 3.5, M.corset),              // high heel boots
    ], cx),
    {
      name: 'torso', pivot: [15, 15, 11], shapes: [
        box(12, 13.5, 11, 18, 16.5, 15, M.corset),            // waist
        box(11.5, 13, 15, 18.5, 17, 21, M.corset),             // bustier
        box(12.5, 15.8, 16, 17.5, 17.2, 20.5, M.skin),         // chest
      ],
    },
    {
      name: 'head', parent: 'torso', pivot: [15, 15, 21], shapes: [
        box(12.5, 13, 21, 17.5, 17, 27, M.skin),
        box(11.5, 12, 22, 18.5, 16.5, 28, M.hair),             // long dark violet hair
        box(13.2, 16.8, 23.5, 14.4, 17.4, 24.5, M.eye),       // glowing magenta eyes
        box(15.6, 16.8, 23.5, 16.8, 17.4, 24.5, M.eye),
        box(10.5, 13.5, 27, 12.5, 15.5, 31, M.horn),          // curved demon horns
        box(17.5, 13.5, 27, 19.5, 15.5, 31, M.horn),
      ],
    },
    ...pair('Arm', [10, 15, 20], [
      box(8.8, 14, 13, 11.2, 16, 20, M.skin),
      box(8.5, 13.8, 11, 11.5, 16.2, 13.5, M.corset),         // glove
    ], cx, 'torso'),
    ...pair('Wing', [11, 12, 19], [
      box(5, 11, 18, 12, 12.2, 21, M.wingBone),
      box(2, 11, 20, 6, 12.2, 28, M.wingBone),
      box(3, 11.4, 13, 11, 12, 24, M.wingMembrane),
    ], cx, 'torso'),
    {
      name: 'orb', parent: 'rightArm', pivot: [20, 16, 12], shapes: [
        ball(20, 17, 12, 2.2, M.magicOrb),
        ball(20, 17, 12, 1.2, M.magicGlow),
      ],
    },
  ];
  const walk: Pose[] = STRIDE.map((s) => ({
    leftLeg: { pitch: 0.45 * s },
    rightLeg: { pitch: -0.45 * s },
    leftArm: { pitch: -0.3 * s },
    rightArm: { pitch: 0.3 * s },
    leftWing: { yaw: 0.25 * s, roll: 0.1 * s },
    rightWing: { yaw: -0.25 * s, roll: -0.1 * s },
    torso: { roll: 0.04 * s },
  }));
  const attack: Pose[] = [
    { rightArm: { pitch: 1.4 }, orb: { scale: [1.4, 1.4, 1.4] }, leftWing: { yaw: 0.4 }, rightWing: { yaw: -0.4 } },
    { rightArm: { pitch: 1.8 }, orb: { scale: [2.0, 2.0, 2.0], offset: [0, 2, 0] }, torso: { pitch: 0.15 } },
    { rightArm: { pitch: 1.0 }, orb: { scale: [1.2, 1.2, 1.2] } },
  ];
  const idle = breathe('torso', { leftWing: { roll: 0.1 }, rightWing: { roll: -0.1 } });
  return {
    size: [32, 30, 36],
    foot: [15, 15, 0],
    materials: [
      { color: 0xf5d0c5 }, { color: 0x3b0764 }, { color: 0x581c87 }, { color: 0x18181b },
      { color: 0xf472b6, emissive: true }, { color: 0x2e1065 }, { color: 0x7e22ce },
      { color: 0xd946ef, emissive: true }, { color: 0xfce7f3, emissive: true },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── Demon Hound (DEMON_HOUND) — 4-legged infernal wolf with magma veins ──────

const demonHound = (): VoxelModel => {
  const M = { coal: 0, magma: 1, flame: 2, tooth: 3, eye: 4 };
  const cx = 15;
  const parts: Part[] = [
    // Front legs
    ...pair('FrontLeg', [11, 19, 8], [
      box(9.5, 17.5, 1, 12.5, 20.5, 9, M.coal),
      box(9, 17, 0, 13, 21.5, 1.8, M.coal),                    // paws
      box(9.8, 19.8, 3, 12.2, 20.6, 7, M.magma),
    ], cx),
    // Back legs
    ...pair('BackLeg', [11, 9, 8], [
      box(9.5, 7.5, 1, 12.5, 10.5, 9, M.coal),
      box(9, 7, 0, 13, 11.5, 1.8, M.coal),
      box(9.8, 9.8, 3, 12.2, 10.6, 7, M.magma),
    ], cx),
    {
      name: 'body', pivot: [15, 14, 9], shapes: [
        box(10, 6, 8, 20, 22, 16, M.coal),
        box(13.5, 7, 15.5, 16.5, 21, 18, M.magma),             // burning spine
        box(14, 8, 17.5, 16, 20, 19.5, M.flame),
        box(14, 3, 12, 16, 7, 15, M.flame),                   // flaming tail
      ],
    },
    {
      name: 'head', parent: 'body', pivot: [15, 22, 14], shapes: [
        box(11.5, 20, 12, 18.5, 28, 18, M.coal),               // wolf snout
        box(12.5, 24, 11, 17.5, 29, 14, M.magma),              // lower jaw
        box(12.8, 27.5, 13.8, 13.8, 28.5, 14.8, M.tooth),      // fangs
        box(16.2, 27.5, 13.8, 17.2, 28.5, 14.8, M.tooth),
        box(12.2, 25.5, 17.2, 13.6, 26.5, 18.2, M.eye),        // red glow eyes
        box(16.4, 25.5, 17.2, 17.8, 26.5, 18.2, M.eye),
        box(10.5, 20.5, 17.5, 12.5, 22.5, 21, M.flame),        // burning ears
        box(17.5, 20.5, 17.5, 19.5, 22.5, 21, M.flame),
      ],
    },
  ];
  const walk: Pose[] = STRIDE.map((s) => ({
    leftFrontLeg: { pitch: 0.5 * s },
    rightFrontLeg: { pitch: -0.5 * s },
    leftBackLeg: { pitch: -0.5 * s },
    rightBackLeg: { pitch: 0.5 * s },
    body: { roll: 0.06 * s, offset: [0, 0, s === 0 ? 1 : 0] },
    head: { pitch: 0.1 * s },
  }));
  const attack: Pose[] = [
    { head: { pitch: -0.3, offset: [0, -1, 1] }, body: { pitch: -0.15 } },
    { head: { pitch: 0.4, offset: [0, 3, -1] }, body: { pitch: 0.25, offset: [0, 2, 0] } },
    { head: { pitch: 0.1 }, body: { pitch: 0.05 } },
  ];
  const idle = breathe('body', { head: { pitch: 0.05 } });
  return {
    size: [30, 34, 26],
    foot: [15, 14, 0],
    materials: [
      { color: 0x18181b }, { color: 0xea580c, emissive: true }, { color: 0xf97316, emissive: true },
      { color: 0xffedd5 }, { color: 0xef4444, emissive: true },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── Harpy (HARPY) — golden feathered avian scout with talons & plumage ───────

const harpy = (): VoxelModel => {
  const M = { feather: 0, featherLight: 1, skin: 2, talon: 3, beak: 4, eye: 5, wingTip: 6 };
  const cx = 15;
  const parts: Part[] = [
    ...pair('Leg', [13.5, 15, 10], [
      box(12.5, 14, 2, 14.5, 16, 10, M.talon),
      box(11.5, 13, 0, 15.5, 17.5, 2.5, M.talon),             // sharp raptor talons
    ], cx),
    {
      name: 'torso', pivot: [15, 15, 10], shapes: [
        box(12, 13, 10, 18, 17, 20, M.feather),
        box(12.5, 15.5, 11, 17.5, 17.4, 19, M.featherLight),  // golden breast feathers
        box(13.5, 8.5, 9, 16.5, 13, 14, M.featherLight),      // tail feathers
      ],
    },
    {
      name: 'head', parent: 'torso', pivot: [15, 15, 20], shapes: [
        box(12.5, 13, 20, 17.5, 17, 26, M.skin),
        box(13.5, 17, 21.5, 16.5, 19.5, 24, M.beak),          // curved beak
        box(12.8, 16.2, 23.5, 13.8, 17, 24.5, M.eye),
        box(16.2, 16.2, 23.5, 17.2, 17, 24.5, M.eye),
        box(13, 12, 25, 17, 16, 30, M.featherLight),          // feathered crest
      ],
    },
    ...pair('Wing', [10, 15, 19], [
      box(4, 14, 16, 11, 16, 21, M.feather),                  // spread feathered wings
      box(0, 14, 12, 5, 16, 24, M.wingTip),
      box(1, 14.2, 14, 8, 15.8, 22, M.featherLight),
    ], cx, 'torso'),
  ];
  const walk: Pose[] = STRIDE.map((s) => ({
    leftLeg: { pitch: 0.6 * s },
    rightLeg: { pitch: -0.6 * s },
    leftWing: { roll: 0.3 * s, yaw: 0.2 * s },
    rightWing: { roll: -0.3 * s, yaw: -0.2 * s },
    torso: { pitch: 0.12, offset: [0, 0, s === 0 ? 1 : 0] },
  }));
  const attack: Pose[] = [
    { leftWing: { roll: 0.7 }, rightWing: { roll: -0.7 }, leftLeg: { pitch: -0.5 }, rightLeg: { pitch: -0.5 } },
    { leftWing: { roll: -0.4 }, rightWing: { roll: 0.4 }, leftLeg: { pitch: 0.8, offset: [0, 2, 0] }, rightLeg: { pitch: 0.8, offset: [0, 2, 0] } },
    { leftWing: { roll: 0.1 }, rightWing: { roll: -0.1 } },
  ];
  const idle = breathe('torso', { leftWing: { roll: 0.1 }, rightWing: { roll: -0.1 } });
  return {
    size: [34, 30, 32],
    foot: [15, 15, 0],
    materials: [
      { color: 0xd97706 }, { color: 0xfde68a }, { color: 0xfbbf24 }, { color: 0x78350f },
      { color: 0xf59e0b }, { color: 0x0f172a }, { color: 0xb45309 },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── Kraken (KRAKEN) — Abyssal sea monstrosity with writhing tentacles ────────

const kraken = (): VoxelModel => {
  const M = { deep: 0, mantle: 1, suction: 2, eye: 3, beak: 4, dark: 5 };
  const c = 16;
  const parts: Part[] = [
    {
      name: 'head', pivot: [c, c, 14], shapes: [
        ell(c, c, 22, 9, 8.5, 9, M.deep),                       // bulbous octopus mantle
        ell(c, c, 24, 7.5, 7, 7, M.mantle),
        box(c - 5.5, c + 7.5, 15, c - 2.5, c + 8.8, 18, M.eye),// glowing yellow eyes
        box(c + 2.5, c + 7.5, 15, c + 5.5, c + 8.8, 18, M.eye),
        box(c - 2, c + 6.5, 11, c + 2, c + 8.5, 14, M.beak),
      ],
    },
    // 6 outer tentacles
    ...pair('FrontTentacle', [c - 5, c + 5, 12], [
      box(c - 8, c + 3, 2, c - 3, c + 7, 13, M.deep),
      box(c - 7.5, c + 5.5, 3, c - 3.5, c + 7.5, 11, M.suction),
    ], c),
    ...pair('SideTentacle', [c - 7, c, 12], [
      box(c - 11, c - 3, 1, c - 4, c + 3, 12, M.deep),
      box(c - 10.5, c - 2.5, 2, c - 4.5, c + 2.5, 10, M.suction),
    ], c),
    ...pair('BackTentacle', [c - 5, c - 5, 12], [
      box(c - 8, c - 7, 2, c - 3, c - 3, 13, M.deep),
      box(c - 7.5, c - 6.5, 3, c - 3.5, c - 3.5, 11, M.suction),
    ], c),
  ];
  const walk: Pose[] = STRIDE.map((s) => ({
    leftFrontTentacle: { pitch: 0.4 * s, roll: 0.2 * s },
    rightFrontTentacle: { pitch: -0.4 * s, roll: -0.2 * s },
    leftSideTentacle: { roll: 0.3 * s },
    rightSideTentacle: { roll: -0.3 * s },
    head: { offset: [0, 0, s === 0 ? 1 : 0], roll: 0.05 * s },
  }));
  const attack: Pose[] = [
    { head: { pitch: -0.15 }, leftFrontTentacle: { pitch: 0.8 }, rightFrontTentacle: { pitch: 0.8 } },
    { head: { pitch: 0.2, offset: [0, 3, -1] }, leftFrontTentacle: { pitch: -0.5, offset: [0, 2, 0] }, rightFrontTentacle: { pitch: -0.5, offset: [0, 2, 0] } },
    { head: { pitch: 0.05 } },
  ];
  const idle = breathe('head', { leftSideTentacle: { roll: 0.1 }, rightSideTentacle: { roll: -0.1 } });
  return {
    size: [36, 36, 36],
    foot: [c, c, 0],
    materials: [
      { color: 0x0f766e }, { color: 0x14b8a6 }, { color: 0x99f6e4 },
      { color: 0xfacc15, emissive: true }, { color: 0x115e59 }, { color: 0x042f2e },
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

// ── Ancient Ent (TREANT) — a living tree with a bark face and green canopy ───

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

// ── Merman (MERMAN) — cyan sea warrior, fin crest, trident ───────────────────

const merman = (): VoxelModel => {
  const M = { scale: 0, scaleLight: 1, belly: 2, fin: 3, finDark: 4, eye: 5, silver: 6, shaft: 7, dark: 8 };
  const cx = 15;
  const parts: Part[] = [
    {
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

// ── Necromancer (NECROMANCER) — Lich skeleton, dark robe, skull staff ────────

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

// ── Sapling — mini sprout summoned by the Sapling Grove ──────────────────────

const sapling = (): VoxelModel => {
  const M = { bark: 0, barkDark: 1, leaf: 2, leafLight: 3, eye: 4, bud: 5 };
  const cx = 9;
  const parts: Part[] = [
    ...pair('Leg', [7.5, 9, 5], [
      box(6.5, 7.5, 1, 8.5, 10, 5.5, M.barkDark),
      box(6, 7, 0, 9, 11.5, 1.3, M.barkDark),
    ], cx),
    {
      name: 'trunk', pivot: [9, 9, 5], shapes: [
        ell(9, 9, 9, 3.6, 3.2, 4.4, M.bark),
        box(7.6, 11.6, 9.5, 8.8, 12.4, 10.9, M.eye),
        box(9.2, 11.6, 9.5, 10.4, 12.4, 10.9, M.eye),
        box(8.2, 11.9, 7.2, 9.8, 12.5, 7.9, M.barkDark),
      ],
    },
    {
      name: 'sprout', parent: 'trunk', pivot: [9, 9, 13], shapes: [
        box(8.5, 8.5, 12.5, 9.5, 9.5, 16, M.barkDark),
        ell(6.2, 9, 16.5, 3.2, 2, 1.3, M.leaf),
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

// ── Thornwood Dryad (DRYAD) — bark-skinned grove spirit, leaf crown, thorn staff ─

const dryad = (): VoxelModel => {
  const M = { bark: 0, barkDark: 1, leaf: 2, leafLight: 3, eye: 4, bloom: 5, skin: 6 };
  const cx = 15;
  const parts: Part[] = [
    ...pair('Leg', [13.3, 15, 9], [
      box(12, 13.8, 1.5, 14.6, 16.2, 9, M.bark),
      box(11.6, 13.2, 0, 15, 17.4, 1.6, M.barkDark),              // root feet
    ], cx),
    {
      name: 'torso', pivot: [15, 15, 9], shapes: [
        box(11.5, 12.5, 8, 18.5, 17.5, 11, M.leaf),               // leaf skirt
        box(11, 12, 6.5, 19, 18, 8.5, M.leafLight),
        box(12, 13, 11, 18, 17, 20, M.skin),
        box(12.6, 16.8, 12, 17.4, 17.6, 19, M.bark),              // bark bodice
        box(14.6, 17.4, 13, 15.4, 18, 18, M.barkDark),
        box(11.5, 12.6, 17, 18.5, 17.4, 20.5, M.bark),            // shoulders
      ],
    },
    {
      name: 'head', parent: 'torso', pivot: [15, 15, 20], shapes: [
        box(12.7, 13.2, 20, 17.3, 17.4, 25.5, M.skin),
        box(13.3, 17.2, 22.4, 14.6, 17.9, 23.6, M.eye),
        box(15.4, 17.2, 22.4, 16.7, 17.9, 23.6, M.eye),
        ell(15, 14.6, 26, 4, 3.6, 2.2, M.leaf),                   // leaf crown / hair
        ell(15, 12.4, 22.5, 3.6, 1.8, 4.2, M.leaf),               // hair down the back
        box(11.8, 15, 25.5, 12.8, 16, 29, M.barkDark),            // twig antlers
        box(17.2, 15, 25.5, 18.2, 16, 29, M.barkDark),
        ball(12.2, 16.8, 26.6, 1, M.bloom),
        ball(17.8, 16.8, 26.6, 1, M.bloom),
      ],
    },
    ...pair('Arm', [11, 15, 19], [
      box(9.8, 14, 12, 11.8, 16, 19.5, M.skin),
      box(9.6, 13.8, 10.5, 12, 16.2, 12, M.bark),                 // bark bracer
    ], cx, 'torso'),
    {
      name: 'staff', parent: 'rightArm', pivot: [20, 15, 11], shapes: [
        box(19.5, 14.5, 0, 20.5, 15.5, 27, M.barkDark),
        box(18.5, 14.5, 26, 19.5, 15.5, 29, M.barkDark),         // forked thorn head
        box(20.5, 14.5, 26, 21.5, 15.5, 30, M.barkDark),
        ell(20, 15, 28.5, 1.8, 1.8, 1.8, M.leafLight),
        ball(20, 16, 29, 0.9, M.bloom),
      ],
    },
  ];
  const walk: Pose[] = STRIDE.map((s) => ({
    leftLeg: { pitch: 0.45 * s },
    rightLeg: { pitch: -0.45 * s },
    leftArm: { pitch: -0.35 * s },
    rightArm: { pitch: 0.2 * s },
    torso: { offset: [0, 0, s === 0 ? 1 : 0] },
  }));
  const attack: Pose[] = [
    { rightArm: { pitch: 1.9 }, staff: { pitch: -0.4 }, leftArm: { pitch: 0.6 } },
    { rightArm: { pitch: 1.2 }, staff: { pitch: 0.3 }, leftArm: { pitch: 1.1 }, torso: { pitch: 0.1 } },
    { rightArm: { pitch: 0.6 }, staff: { pitch: 0.5 }, leftArm: { pitch: 0.8 }, torso: { pitch: 0.15, offset: [0, 1, 0] } },
  ];
  return {
    size: [30, 30, 34],
    foot: [15, 15, 0],
    materials: [
      { color: 0x7c5a3a }, { color: 0x4a3423 }, { color: 0x4d7c0f }, { color: 0x84cc16 },
      { color: 0xfde047, emissive: true }, { color: 0xf472b6, emissive: true }, { color: 0xa3b18a },
    ],
    parts,
    animations: { walk, attack, idle: breathe('torso') },
  };
};

// ── Watchtower Minotaur (MINOTAUR) — bull-headed brute with a great pick-hammer ─

const minotaur = (): VoxelModel => {
  const M = { hide: 0, hideDark: 1, horn: 2, eye: 3, iron: 4, haft: 5, leather: 6, ring: 7 };
  const cx = 17;
  const parts: Part[] = [
    ...pair('Leg', [14, 16, 10], [
      box(12, 13.5, 3, 16, 18.5, 10, M.hideDark),
      box(11.6, 13, 0, 16.4, 19, 3, M.horn),                      // hooves
    ], cx),
    {
      name: 'torso', pivot: [17, 16, 10], shapes: [
        box(11.5, 12.5, 9, 22.5, 19.5, 13, M.leather),            // kilt
        box(12, 13, 13, 22, 19, 19, M.hide),
        box(9.5, 12, 19, 24.5, 20.5, 28, M.hide),                 // huge chest
        box(11, 20, 21, 16.5, 21, 27, M.hideDark),
        box(17.5, 20, 21, 23, 21, 27, M.hideDark),
        box(10, 12.5, 25, 24, 13.5, 28, M.leather),               // strap across the back
        box(16.5, 20.2, 13.5, 17.5, 21, 26, M.leather),           // chest strap
      ],
    },
    {
      name: 'head', parent: 'torso', pivot: [17, 17, 28], shapes: [
        box(14, 15, 27.5, 20, 21, 33.5, M.hide),
        box(14.8, 20.5, 27.5, 19.2, 23.5, 31, M.hideDark),        // bull muzzle
        box(16.4, 23.3, 28, 17.6, 23.8, 29, M.ring),              // nose ring
        box(14.4, 20.8, 31.5, 15.8, 21.6, 32.6, M.eye),
        box(18.2, 20.8, 31.5, 19.6, 21.6, 32.6, M.eye),
        box(10, 17, 32, 14, 19, 34, M.horn),                      // horns sweep out and up
        box(9, 17, 33.5, 10.5, 19, 37, M.horn),
        box(20, 17, 32, 24, 19, 34, M.horn),
        box(23.5, 17, 33.5, 25, 19, 37, M.horn),
      ],
    },
    ...pair('Arm', [8.5, 16, 26], [
      box(5.5, 13.5, 18, 10, 18.5, 27, M.hide),
      box(5.2, 13.2, 14, 10.3, 18.8, 18, M.leather),             // bracer
      box(5.5, 14, 10, 10, 18.5, 14, M.hideDark),                 // fist
    ], cx, 'torso'),
    {
      name: 'hammer', parent: 'rightArm', pivot: [26.5, 16, 12], shapes: [
        box(26, 15.5, 0, 27, 16.5, 30, M.haft),
        box(23, 13.5, 28, 30, 18.5, 33, M.iron),                  // pick-hammer head
        box(30, 15, 29, 33, 17, 32, M.iron),                      // pick spike
      ],
    },
  ];
  const walk: Pose[] = STRIDE.map((s) => ({
    leftLeg: { pitch: 0.4 * s },
    rightLeg: { pitch: -0.4 * s },
    leftArm: { pitch: -0.3 * s },
    rightArm: { pitch: 0.15 * s },
    torso: { offset: [0, 0, s === 0 ? 1 : 0], roll: 0.05 * s },
  }));
  const attack: Pose[] = [
    { rightArm: { pitch: 2.5 }, hammer: { pitch: 0.2 }, torso: { pitch: -0.1, yaw: 0.2 } },
    { rightArm: { pitch: 1.3 }, hammer: { pitch: 0.4 }, torso: { pitch: 0.1 } },
    { rightArm: { pitch: 0.4 }, hammer: { pitch: 0.6 }, torso: { pitch: 0.22, yaw: -0.15, offset: [0, 2, -1] } },
  ];
  return {
    size: [36, 34, 40],
    foot: [17, 16, 0],
    materials: [
      { color: 0x8b5a2b }, { color: 0x5c3a1a }, { color: 0xe7dcc4 }, { color: 0xef4444, emissive: true },
      { color: 0x6b7280 }, { color: 0x4a3423 }, { color: 0x3f2a1a }, { color: 0xfbbf24 },
    ],
    parts,
    animations: { walk, attack, idle: breathe('torso') },
  };
};

// ── Ember Imp (EMBER_IMP) — small red imp with a pick and an ember lantern ───

const emberImp = (): VoxelModel => {
  const M = { skin: 0, skinDark: 1, horn: 2, eye: 3, iron: 4, haft: 5, ember: 6, apron: 7 };
  const cx = 14;
  const parts: Part[] = [
    ...pair('Leg', [12.5, 14, 6], [
      box(11.5, 13, 1, 13.5, 15, 6.5, M.skinDark),
      box(11.2, 12.5, 0, 13.8, 16, 1.2, M.skinDark),
    ], cx),
    {
      name: 'torso', pivot: [14, 14, 6], shapes: [
        box(10.5, 11.5, 6, 17.5, 16.5, 14, M.skin),               // pot belly
        box(11, 16.2, 6, 17, 17, 13, M.apron),                    // soot apron
        box(13.5, 8.5, 6, 14.5, 11.5, 7, M.skinDark),             // tail
        box(13.2, 6.5, 6, 14.8, 8.5, 8, M.skinDark),              // spade tip
      ],
    },
    {
      name: 'head', parent: 'torso', pivot: [14, 14, 14], shapes: [
        box(10.5, 11, 14, 17.5, 17, 20.5, M.skin),                // big head
        box(11.4, 16.8, 17, 13, 17.6, 18.5, M.eye),
        box(15, 16.8, 17, 16.6, 17.6, 18.5, M.eye),
        box(12.5, 16.8, 14.8, 15.5, 17.4, 15.6, M.skinDark),      // grin
        box(8.5, 13, 18, 10.5, 15, 19.5, M.skin),                 // pointed ears
        box(17.5, 13, 18, 19.5, 15, 19.5, M.skin),
        box(11, 13, 20.5, 12.5, 14.5, 23.5, M.horn),
        box(15.5, 13, 20.5, 17, 14.5, 23.5, M.horn),
      ],
    },
    ...pair('Arm', [9.8, 14, 13], [
      box(8.8, 13, 7.5, 10.8, 15, 13.5, M.skin),
    ], cx, 'torso'),
    {
      name: 'pick', parent: 'rightArm', pivot: [19.2, 14, 8], shapes: [
        box(18.7, 13.5, 2, 19.7, 14.5, 18, M.haft),
        box(16, 13.5, 17, 23, 14.5, 18.5, M.iron),                // pick head
        box(15, 13.5, 16, 16.2, 14.5, 17.2, M.iron),
        box(22.8, 13.5, 16, 24, 14.5, 17.2, M.iron),
      ],
    },
    {
      name: 'lantern', parent: 'leftArm', pivot: [8.8, 14, 8], shapes: [
        box(8.3, 14.6, 4, 9.3, 15.4, 7.5, M.iron),
        box(7.3, 14, 1.5, 10.3, 16, 4.5, M.iron),
        box(7.8, 14.4, 2, 9.8, 15.6, 4, M.ember),
      ],
    },
  ];
  const walk: Pose[] = STRIDE.map((s) => ({
    leftLeg: { pitch: 0.55 * s },
    rightLeg: { pitch: -0.55 * s },
    leftArm: { pitch: -0.3 * s },
    rightArm: { pitch: 0.3 * s },
    torso: { offset: [0, 0, s === 0 ? 1 : 0], roll: 0.08 * s },
  }));
  const attack: Pose[] = [
    { rightArm: { pitch: 2.4 }, pick: { pitch: 0.3 }, torso: { pitch: -0.1 } },
    { rightArm: { pitch: 1.2 }, pick: { pitch: 0.6 }, torso: { pitch: 0.15 } },
    { rightArm: { pitch: 0.3 }, pick: { pitch: 0.8 }, torso: { pitch: 0.25, offset: [0, 1, 0] } },
  ];
  return {
    size: [28, 28, 26],
    foot: [14, 14, 0],
    materials: [
      { color: 0xdc2626 }, { color: 0x991b1b }, { color: 0x292524 }, { color: 0xfde047, emissive: true },
      { color: 0x71717a }, { color: 0x78350f }, { color: 0xfb923c, emissive: true }, { color: 0x44403c },
    ],
    parts,
    animations: { walk, attack, idle: breathe('torso') },
  };
};

// ── Void Wraith (VOID_WRAITH) — hooded violet shade that floats, void scythe ─

const voidWraith = (): VoxelModel => {
  const M = { shroud: 0, shroudDark: 1, void: 2, eye: 3, blade: 4, haft: 5, wisp: 6 };
  const cx = 15;
  const parts: Part[] = [
    {
      name: 'shroud', pivot: [15, 15, 8], shapes: [
        box(12.5, 12.5, 2, 17.5, 17.5, 5, M.shroudDark),          // ragged tail (no feet)
        box(13.5, 13.5, 0, 16.5, 16.5, 2, M.wisp),
        box(11.5, 11.5, 5, 18.5, 18.5, 10, M.shroudDark),
        box(10.8, 11, 10, 19.2, 19, 20, M.shroud),
        box(14.5, 18.6, 11, 15.5, 19.4, 19, M.void),              // rift seam down the front
      ],
    },
    {
      name: 'head', parent: 'shroud', pivot: [15, 15, 20], shapes: [
        box(11.5, 11.5, 20, 18.5, 17.5, 27.5, M.shroud),          // hood
        box(13, 10, 24, 17, 12, 30, M.shroudDark),                // hood point
        box(12.6, 16.8, 21, 17.4, 18, 26, M.void),                // empty face
        box(13.4, 17.6, 23.2, 14.6, 18.3, 24.4, M.eye),
        box(15.4, 17.6, 23.2, 16.6, 18.3, 24.4, M.eye),
      ],
    },
    ...pair('Arm', [10.5, 15, 19], [
      box(8.8, 13.5, 12, 11.4, 16.5, 19.5, M.shroud),
      ball(10.1, 15.6, 11.5, 1.2, M.void),                         // shadow hand
    ], cx, 'shroud'),
    {
      name: 'scythe', parent: 'rightArm', pivot: [19.9, 15, 11.5], shapes: [
        box(19.4, 14.5, 0, 20.4, 15.5, 31, M.haft),
        box(20.4, 14.5, 29, 26, 15.5, 31, M.blade),               // curved blade
        box(25, 14.5, 26, 26.5, 15.5, 29.5, M.blade),
        box(24, 14.5, 24.5, 25.5, 15.5, 26.5, M.blade),
      ],
    },
  ];
  const walk: Pose[] = STRIDE.map((s) => ({
    shroud: { offset: [0, 0, 3 + (s === 0 ? 1 : 0)], pitch: 0.08 },
    leftArm: { pitch: -0.2 * s },
    rightArm: { pitch: 0.15 * s },
  }));
  const attack: Pose[] = [
    { shroud: { offset: [0, 0, 3] }, rightArm: { pitch: 2.4 }, scythe: { pitch: 0.2 }, head: { pitch: -0.1 } },
    { shroud: { offset: [0, 1, 3] }, rightArm: { pitch: 1.4 }, scythe: { pitch: 0.7 } },
    { shroud: { offset: [0, 2, 2], pitch: 0.15 }, rightArm: { pitch: 0.5 }, scythe: { pitch: 1.0 } },
  ];
  const idle: Pose[] = [
    { shroud: { offset: [0, 0, 3] } },
    { shroud: { offset: [0, 0, 4] }, head: { pitch: 0.05 } },
  ];
  return {
    size: [30, 30, 38],
    foot: [15, 15, 0],
    materials: [
      { color: 0x4c1d95 }, { color: 0x2e1065 }, { color: 0x0b0418 }, { color: 0xe879f9, emissive: true },
      { color: 0xc4b5fd }, { color: 0x1f2937 }, { color: 0xa855f7, emissive: true },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── Bone Knight (BONE_KNIGHT) — skeletal knight, bone tower-shield, greatsword ─

const boneKnight = (): VoxelModel => {
  const M = { bone: 0, boneDark: 1, rust: 2, rustDark: 3, eye: 4, cloth: 5, blade: 6 };
  const cx = 15;
  const parts: Part[] = [
    ...pair('Leg', [13, 15, 10], [
      box(12.2, 14.2, 2, 13.8, 15.8, 10, M.bone),
      box(11.4, 13.4, 5, 14.6, 16.6, 7.5, M.rust),                 // knee guard
      box(11.5, 13, 0, 14.5, 17, 2, M.rustDark),                  // sabatons
    ], cx),
    {
      name: 'torso', pivot: [15, 15, 10], shapes: [
        box(12, 13, 9, 18, 17, 11.5, M.boneDark),                 // pelvis
        box(12.5, 16.6, 6, 17.5, 17.2, 12, M.cloth),              // tattered loincloth
        box(14.2, 14.2, 11.5, 15.8, 15.8, 15.5, M.boneDark),      // spine
        box(11.5, 12.5, 15.5, 18.5, 17.5, 22.5, M.bone),          // ribcage
        box(12, 17.4, 16, 18, 18, 17, M.boneDark),                // rib gaps
        box(12, 17.4, 18, 18, 18, 19, M.boneDark),
        box(12, 17.4, 20, 18, 18, 21, M.boneDark),
        box(14.6, 17.6, 15.5, 15.4, 18.2, 22.5, M.bone),          // sternum
        box(9.5, 12.5, 21, 12.5, 17.5, 24, M.rust),               // rusted pauldrons
        box(17.5, 12.5, 21, 20.5, 17.5, 24, M.rust),
      ],
    },
    {
      name: 'head', parent: 'torso', pivot: [15, 15, 23], shapes: [
        ell(15, 16, 26, 3.2, 3.2, 3.4, M.bone),                   // skull
        box(13.4, 18.7, 25.8, 14.8, 19.4, 27.2, M.eye),
        box(15.2, 18.7, 25.8, 16.6, 19.4, 27.2, M.eye),
        box(13.8, 18.6, 23.4, 16.2, 19.2, 24.2, M.boneDark),      // teeth
        box(11.8, 12.6, 28.5, 18.2, 18, 30.5, M.rust),            // rusted skullcap
        box(14.5, 12, 30.5, 15.5, 16.5, 33, M.cloth),             // crest
      ],
    },
    ...pair('Arm', [10.5, 15, 22], [
      box(9.8, 14.2, 14, 11.2, 15.8, 22, M.bone),
      box(9.4, 13.8, 13, 11.6, 16.2, 15.5, M.rust),               // gauntlet
    ], cx, 'torso'),
    {
      name: 'shield', parent: 'leftArm', pivot: [10.5, 15, 15], shapes: [
        box(6, 16, 9, 10, 18, 23, M.boneDark),                    // bone tower-shield
        box(6.5, 17.8, 10, 9.5, 18.6, 22, M.bone),
        box(7.6, 18.4, 14.5, 8.4, 19, 18.5, M.rustDark),          // boss
      ],
    },
    {
      name: 'sword', parent: 'rightArm', pivot: [20.5, 15, 13], shapes: [
        box(20, 14.5, 9, 21, 15.5, 14, M.rustDark),                // grip
        box(18.5, 14.3, 13.5, 22.5, 15.7, 14.5, M.rust),          // crossguard
        box(19.8, 14.6, 14.5, 21.2, 15.4, 30, M.blade),           // greatsword blade
      ],
    },
  ];
  const walk: Pose[] = STRIDE.map((s) => ({
    leftLeg: { pitch: 0.42 * s },
    rightLeg: { pitch: -0.42 * s },
    leftArm: { pitch: -0.15 * s },
    rightArm: { pitch: 0.3 * s },
    torso: { offset: [0, 0, s === 0 ? 1 : 0] },
  }));
  const attack: Pose[] = [
    { rightArm: { pitch: 2.3 }, sword: { pitch: 0.1 }, leftArm: { pitch: 0.6 }, torso: { yaw: 0.2 } },
    { rightArm: { pitch: 1.3 }, sword: { pitch: 0.4 }, leftArm: { pitch: 0.7 } },
    { rightArm: { pitch: 0.4 }, sword: { pitch: 0.7 }, leftArm: { pitch: 0.5 }, torso: { pitch: 0.18, yaw: -0.2, offset: [0, 1, 0] } },
  ];
  return {
    size: [30, 30, 36],
    foot: [15, 15, 0],
    materials: [
      { color: 0xe7e5e4 }, { color: 0xa8a29e }, { color: 0x9a5b34 }, { color: 0x5c3317 },
      { color: 0x38bdf8, emissive: true }, { color: 0x4b1d1d }, { color: 0xcbd5e1 },
    ],
    parts,
    animations: { walk, attack, idle: breathe('torso') },
  };
};

// ── Prism Warden (PRISM_WARDEN) — crystal-armoured spire guard, prism halberd ─

const prismWarden = (): VoxelModel => {
  const M = { stone: 0, stoneDark: 1, crystal: 2, crystalDark: 3, glow: 4, cloth: 5, haft: 6 };
  const cx = 15;
  const parts: Part[] = [
    ...pair('Leg', [13, 15, 10], [
      box(12, 14, 2, 14, 16, 10, M.stoneDark),
      box(11.6, 13.6, 5.5, 14.4, 16.6, 8, M.crystal),             // crystal knee
      box(11.5, 13, 0, 14.5, 17, 2, M.stone),                     // stone boots
    ], cx),
    {
      name: 'torso', pivot: [15, 15, 10], shapes: [
        box(12, 13, 9, 18, 17, 12, M.stoneDark),                  // belt
        box(12.5, 16.6, 5, 17.5, 17.2, 11, M.cloth),              // tabard
        box(11.5, 12.5, 12, 18.5, 17.5, 22.5, M.stone),           // stone chest
        box(13.2, 17.3, 14, 16.8, 18.2, 20.5, M.crystal),         // crystal core
        box(14.2, 18, 15.5, 15.8, 18.6, 19, M.glow),
        box(9.5, 12.5, 20.5, 12.5, 17.5, 23.5, M.crystalDark),    // crystal pauldrons
        box(17.5, 12.5, 20.5, 20.5, 17.5, 23.5, M.crystalDark),
        box(10, 14, 23.5, 11.5, 15.5, 27, M.crystal),             // shoulder shards
        box(18.5, 14, 23.5, 20, 15.5, 27, M.crystal),
      ],
    },
    {
      name: 'head', parent: 'torso', pivot: [15, 15, 23], shapes: [
        box(12.3, 12.8, 22.5, 17.7, 18, 28.5, M.stone),           // helm
        box(12.8, 17.8, 24.6, 17.2, 18.5, 25.8, M.glow),          // visor slit
        box(14.3, 14, 28.5, 15.7, 16, 33.5, M.crystal),           // crystal crest
        box(12.6, 14.5, 28.5, 13.6, 15.5, 31, M.crystalDark),
        box(16.4, 14.5, 28.5, 17.4, 15.5, 31, M.crystalDark),
      ],
    },
    ...pair('Arm', [10.5, 15, 22], [
      box(9.6, 14, 14, 11.4, 16, 22, M.stoneDark),
      box(9.2, 13.6, 13, 11.8, 16.4, 15.5, M.crystalDark),        // crystal gauntlet
    ], cx, 'torso'),
    {
      name: 'halberd', parent: 'rightArm', pivot: [20.5, 15, 13], shapes: [
        box(20, 14.5, 3, 21, 15.5, 30, M.haft),                   // haft
        box(19.2, 14.2, 30, 21.8, 15.8, 31, M.stoneDark),         // collar
        box(19.6, 14.4, 31, 21.4, 15.6, 37, M.crystal),           // prism spearhead
        box(20.1, 14.3, 33, 20.9, 15.7, 36, M.glow),
        box(21.4, 14.6, 29, 24, 15.4, 32.5, M.crystalDark),       // axe blade
      ],
    },
  ];
  const walk: Pose[] = STRIDE.map((s) => ({
    leftLeg: { pitch: 0.4 * s },
    rightLeg: { pitch: -0.4 * s },
    leftArm: { pitch: -0.35 * s },
    rightArm: { pitch: 0.2 * s },
    torso: { offset: [0, 0, s === 0 ? 1 : 0] },
  }));
  const attack: Pose[] = [
    { rightArm: { pitch: 2.2 }, halberd: { pitch: 0.2 }, leftArm: { pitch: 0.5 }, torso: { yaw: 0.2 } },
    { rightArm: { pitch: 1.3 }, halberd: { pitch: 0.6 }, leftArm: { pitch: 0.6 } },
    { rightArm: { pitch: 0.5 }, halberd: { pitch: 1.0 }, leftArm: { pitch: 0.4 }, torso: { pitch: 0.18, yaw: -0.2, offset: [0, 1, 0] } },
  ];
  return {
    size: [30, 30, 40],
    foot: [15, 15, 0],
    materials: [
      { color: 0x64748b }, { color: 0x334155 }, { color: 0x67e8f9 }, { color: 0x0891b2 },
      { color: 0xa5f3fc, emissive: true }, { color: 0x6d28d9 }, { color: 0x1e293b },
    ],
    parts,
    animations: { walk, attack, idle: breathe('torso') },
  };
};

// ── Registry ─────────────────────────────────────────────────────────────────

export type MinionSpriteKey =
  | 'golem' | 'slime' | 'treant' | 'merman' | 'necromancer' | 'sapling'
  | 'lavaGargoyle' | 'succubus' | 'demonHound' | 'harpy' | 'kraken'
  | 'dryad' | 'minotaur' | 'emberImp' | 'voidWraith' | 'boneKnight' | 'prismWarden';

export const MINION_MODELS: Record<MinionSpriteKey, () => VoxelModel> = {
  golem,
  slime,
  treant,
  merman,
  necromancer,
  sapling,
  lavaGargoyle,
  succubus,
  demonHound,
  harpy,
  kraken,
  dryad,
  minotaur,
  emberImp,
  voidWraith,
  boneKnight,
  prismWarden,
};

export const UNIT_SPRITE: Record<UnitClass, MinionSpriteKey> = {
  TREANT: 'treant',
  AQUA_SLIME: 'slime',
  GOLEM: 'golem',
  MERMAN: 'merman',
  NECROMANCER: 'necromancer',
  KRAKEN: 'kraken',
  DEMON_HOUND: 'demonHound',
  SUCCUBUS: 'succubus',
  LAVA_GARGOYLE: 'lavaGargoyle',
  HARPY: 'harpy',
  DRYAD: 'dryad',
  MINOTAUR: 'minotaur',
  EMBER_IMP: 'emberImp',
  VOID_WRAITH: 'voidWraith',
  BONE_KNIGHT: 'boneKnight',
  PRISM_WARDEN: 'prismWarden',
};
