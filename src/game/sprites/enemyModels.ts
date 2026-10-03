import type { InvaderType } from '../../types/game';
import type { Part, Pose, Shape, Vec3, VoxelModel } from './VoxelSprite';

/**
 * Voxel models for every invader, following the bestiary artwork in
 * public/portraits/. Coordinates are voxels in model space:
 * +x = the character's right, +y = forward, +z = up. Later shapes overwrite
 * earlier ones.
 */

// ── Authoring helpers ────────────────────────────────────────────────────────

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: number): Shape => ({
  kind: 'box', min: [x0, y0, z0], max: [x1, y1, z1], mat,
});
const ell = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, mat: number): Shape => ({
  kind: 'ellipsoid', center: [cx, cy, cz], radii: [rx, ry, rz], mat,
});
const cyl = (cx: number, cy: number, z0: number, radius: number, height: number, mat: number): Shape => ({
  kind: 'cylinder', center: [cx, cy, z0], radius, height, mat,
});
const ball = (cx: number, cy: number, cz: number, r: number, mat: number): Shape => ell(cx, cy, cz, r, r, r, mat);

/** Mirror shapes across the plane x = axis (for left/right limb pairs). */
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

/** Walk cycle phase per frame: stride, pass, opposite stride, pass. */
const STRIDE = [1, 0, -1, 0];

/** Two-frame idle loop: the given pose, then the same pose with `part` sunk one voxel (a breath). */
export const breathe = (part: string, base: Pose = {}): Pose[] => [
  base,
  { ...base, [part]: { ...(base[part] ?? {}), offset: [0, 0, -1] } },
];

// ── 1. Crusader Knight — full silver plate, red plume, sword and kite shield ────

const knight = (): VoxelModel => {
  const M = { steel: 0, dark: 1, bright: 2, visor: 3, leather: 4, blade: 5, plume: 6, mail: 7 };
  const cx = 15;
  const leftLeg: Shape[] = [box(11, 13, 3, 14, 17, 11, M.steel), box(11.2, 16.8, 6, 13.8, 17.4, 8.5, M.bright), box(10.5, 12.5, 0, 14.5, 18.5, 3, M.dark)];
  const leftArm: Shape[] = [box(7, 13.5, 14, 10, 16.5, 22, M.steel), box(6.8, 13.3, 12, 10.2, 16.7, 15, M.dark)];

  const parts: Part[] = [
    { name: 'leftLeg', pivot: [12.5, 15, 11], shapes: leftLeg },
    { name: 'rightLeg', pivot: mirrorPivot([12.5, 15, 11], cx), shapes: mirrorX(leftLeg, cx) },
    {
      name: 'torso', pivot: [15, 15, 11], shapes: [
        box(10.5, 12.5, 9, 19.5, 17.5, 12, M.mail),
        box(10, 12, 11, 20, 18, 13, M.leather),
        box(14, 17.9, 11.3, 16, 18.4, 12.7, M.bright),
        box(10, 12, 13, 20, 18, 23, M.steel),
        box(11.5, 17.6, 15, 18.5, 18.6, 22, M.bright),
        ell(9.8, 15, 22, 2.6, 3.2, 2, M.bright),
        ell(20.2, 15, 22, 2.6, 3.2, 2, M.bright),
      ],
    },
    {
      name: 'head', parent: 'torso', pivot: [15, 15, 23], shapes: [
        box(11.5, 11.5, 23, 18.5, 18.5, 31, M.steel),
        ell(15, 15, 31, 3.5, 3.5, 2, M.steel),
        box(14.5, 18, 23, 15.5, 19, 31, M.bright),
        box(12, 18, 26.5, 18, 19, 27.8, M.visor),
        box(12.5, 18, 24, 14, 19, 25, M.visor),
        box(16, 18, 24, 17.5, 19, 25, M.visor),
        box(14, 11, 31.5, 16, 17, 34, M.plume),
        box(14, 9.5, 28, 16, 12, 33, M.plume),
      ],
    },
    { name: 'leftArm', parent: 'torso', pivot: [8.5, 15, 22], shapes: leftArm },
    {
      name: 'shield', parent: 'leftArm', pivot: [8.5, 15, 14], shapes: [
        box(4.8, 10.5, 12, 7, 20.5, 23, M.bright),
        box(4.8, 12, 9, 7, 19, 12, M.bright),
        box(4.8, 13.5, 7, 7, 17.5, 9, M.bright),
        box(4.3, 10, 22.5, 7, 21, 23.5, M.steel),
        box(4.3, 14.5, 9, 4.8, 16.5, 22, M.steel),
      ],
    },
    { name: 'rightArm', parent: 'torso', pivot: mirrorPivot([8.5, 15, 22], cx), shapes: mirrorX(leftArm, cx) },
    {
      name: 'sword', parent: 'rightArm', pivot: [21.5, 15, 13], shapes: [
        box(21, 13, 12.5, 22, 17, 14, M.leather),
        box(19.5, 17, 11.5, 23.5, 18, 15, M.dark),
        box(21, 18, 12.5, 22, 30, 14, M.blade),
        box(21, 30, 13, 22, 31, 14, M.blade),
      ],
    },
  ];

  const walk: Pose[] = STRIDE.map((s) => ({
    leftLeg: { pitch: 0.5 * s },
    rightLeg: { pitch: -0.5 * s },
    leftArm: { pitch: -0.35 * s },
    rightArm: { pitch: 0.2 * s + 0.15 },
    torso: { offset: [0, 0, s === 0 ? 1 : 0] },
  }));
  const attack: Pose[] = [
    { rightArm: { pitch: 2.6 }, torso: { yaw: 0.3 }, leftArm: { pitch: 0.3 } },
    { rightArm: { pitch: 1.5 }, torso: { yaw: -0.05, offset: [0, 1, 0] }, leftArm: { pitch: 0.2 } },
    { rightArm: { pitch: 0.55 }, torso: { yaw: -0.3, pitch: 0.15, offset: [0, 1.5, -0.5] }, leftArm: { pitch: -0.1 }, leftLeg: { pitch: 0.3 } },
  ];
  const idle = breathe('torso', { rightArm: { pitch: 0.15 } });

  return {
    size: [30, 34, 40],
    foot: [15, 15, 0],
    materials: [
      { color: 0xb8c2d0 }, { color: 0x5b6678 }, { color: 0xe5e9f0 }, { color: 0x0b1020 },
      { color: 0x7c4a1e }, { color: 0xf1f5f9 }, { color: 0xdc2626 }, { color: 0x6b7280 },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── 2. Elven Archer — green tunic, longbow, pointed ears, quiver ────────────

const archer = (): VoxelModel => {
  const M = { tunic: 0, tunicLight: 1, leather: 2, pants: 3, skin: 4, eyes: 5, wood: 6, string: 7, fletch: 8, tip: 9, boots: 10, hair: 11 };
  const cx = 15;
  const leftLeg: Shape[] = [box(12, 13.5, 4, 14.5, 16.5, 11, M.pants), box(11.7, 13, 0, 14.8, 17.5, 4.5, M.boots)];
  const leftArm: Shape[] = [
    box(8.5, 13.8, 17, 11, 16.2, 22, M.tunicLight),
    box(8.6, 13.9, 13, 10.9, 16.1, 17, M.leather),
    box(8.7, 14, 12, 10.8, 16, 13.5, M.skin),
  ];

  const parts: Part[] = [
    { name: 'leftLeg', pivot: [13.25, 15, 11], shapes: leftLeg },
    { name: 'rightLeg', pivot: mirrorPivot([13.25, 15, 11], cx), shapes: mirrorX(leftLeg, cx) },
    {
      name: 'torso', pivot: [15, 15, 11], shapes: [
        box(11, 12.5, 9, 19, 17.5, 22, M.tunic),
        box(11, 12.5, 12.5, 19, 17.8, 13.8, M.leather),
        box(14, 17.6, 12.3, 16, 18.2, 14, M.tip),
        box(12, 17.4, 14, 13.2, 18, 22, M.leather),
        box(11.5, 12.2, 19, 18.5, 17.8, 22.5, M.tunicLight),
      ],
    },
    {
      name: 'quiver', parent: 'torso', pivot: [17, 11, 18], shapes: [
        cyl(17.5, 10.5, 13, 1.7, 11, M.leather),
        box(16, 9, 24, 19, 12, 26.5, M.fletch),
      ],
    },
    {
      name: 'head', parent: 'torso', pivot: [15, 15, 23], shapes: [
        box(12, 12.5, 23, 18, 18, 30, M.skin),
        box(11.5, 11.8, 26, 18.5, 16.5, 31, M.hair),
        box(12, 11.5, 22, 18, 13, 27, M.hair),
        box(12.3, 17, 29, 17.7, 18.3, 30.6, M.hair),
        box(10.3, 14, 26.5, 11.5, 15.5, 30.5, M.skin),
        box(18.5, 14, 26.5, 19.7, 15.5, 30.5, M.skin),
        box(13, 17.6, 26, 14, 18.3, 27.5, M.eyes),
        box(16, 17.6, 26, 17, 18.3, 27.5, M.eyes),
      ],
    },
    { name: 'leftArm', parent: 'torso', pivot: [9.75, 15, 22], shapes: leftArm },
    {
      name: 'bow', parent: 'leftArm', pivot: [9.75, 15, 13], shapes: [
        box(9, 16, 11, 11, 17.5, 15, M.wood),
        box(9, 16.5, 15, 10.5, 17.6, 19, M.wood),
        box(9, 15.6, 19, 10.5, 16.7, 22, M.wood),
        box(9, 14.4, 22, 10.5, 15.6, 24, M.wood),
        box(9, 16.5, 7, 10.5, 17.6, 11, M.wood),
        box(9, 15.6, 4, 10.5, 16.7, 7, M.wood),
        box(9, 14.4, 2, 10.5, 15.6, 4, M.wood),
        box(9.2, 14, 3, 10.2, 15, 23, M.string),
      ],
    },
    { name: 'rightArm', parent: 'torso', pivot: mirrorPivot([9.75, 15, 22], cx), shapes: mirrorX(leftArm, cx) },
    {
      name: 'arrow', parent: 'rightArm', pivot: [20.25, 15, 13], shapes: [
        box(19.8, 13, 12.5, 20.8, 26, 13.5, M.wood),
        box(19.5, 26, 12, 21, 28, 14, M.tip),
        box(19.5, 12, 12, 21, 14.5, 14, M.fletch),
      ],
    },
  ];

  const walk: Pose[] = STRIDE.map((s) => ({
    leftLeg: { pitch: 0.55 * s },
    rightLeg: { pitch: -0.55 * s },
    leftArm: { pitch: -0.4 * s },
    rightArm: { pitch: 0.4 * s },
    arrow: { hidden: true },
    torso: { offset: [0, 0, s === 0 ? 1 : 0] },
  }));
  const draw = (armFwd: number, pull: number, twist: number, showArrow: boolean): Pose => ({
    torso: { yaw: twist },
    leftArm: { pitch: armFwd },
    bow: { pitch: -armFwd },
    rightArm: { pitch: armFwd - 0.15, offset: [0, -pull, 0] },
    arrow: { pitch: -(armFwd - 0.15), hidden: !showArrow },
  });
  const attack: Pose[] = [draw(1.2, 1, 0.2, true), draw(1.45, 4, 0.35, true), draw(1.45, 1, 0.3, false)];
  const idle = breathe('torso', { arrow: { hidden: true } });

  return {
    size: [30, 32, 38],
    foot: [15, 15, 0],
    materials: [
      { color: 0x3f8a3c }, { color: 0x5aab4f }, { color: 0x8b5a2b }, { color: 0x4a3f2c },
      { color: 0xf2c69a }, { color: 0x14532d }, { color: 0x9a6b3a }, { color: 0xf5f5f4 },
      { color: 0xe5e7eb }, { color: 0xcbd5e1 }, { color: 0x3f2a1d }, { color: 0xf3cf5a },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── 3. Mecha Scout — bipedal yellow cyber recon robot with sensor scanner ────

const mechaScout = (): VoxelModel => {
  const M = { shell: 0, shellShade: 1, dark: 2, lens: 3, lensRing: 4, joint: 5, accent: 6, laser: 7 };
  const cx = 15;
  const leg: Shape[] = [
    box(11.5, 13, 6, 14.5, 17, 13, M.shellShade),
    box(12, 13.5, 0, 14, 18.5, 6, M.joint),
    box(10.5, 12.5, 0, 15.5, 19.5, 2.5, M.dark),              // magnetic foot
  ];
  const parts: Part[] = [
    ...pair('Leg', [13, 15, 12], leg, cx),
    {
      name: 'chassis', pivot: [15, 15, 12], shapes: [
        box(10, 11, 10, 20, 19, 18, M.shell),                  // yellow chassis body
        box(11, 18.2, 11, 19, 19.4, 17, M.shellShade),
        ell(15, 15, 23, 6.5, 6.5, 5.5, M.shell),               // scanner dome
        ell(15, 20.8, 23, 3, 1.2, 3, M.lensRing),
        ell(15, 21.6, 23, 1.8, 0.8, 1.8, M.lens),              // glowing cyan eye
        box(8, 13, 13, 10, 17, 17, M.dark),                    // side blaster mounts
        box(20, 13, 13, 22, 17, 17, M.dark),
        box(8.5, 17, 14, 9.5, 22, 16, M.laser),                // twin laser blasters
        box(20.5, 17, 14, 21.5, 22, 16, M.laser),
      ],
    },
  ];

  const walk: Pose[] = STRIDE.map((s) => ({
    leftLeg: { pitch: 0.6 * s },
    rightLeg: { pitch: -0.6 * s },
    chassis: { offset: [0, 0, s === 0 ? 1 : 0], roll: 0.04 * s },
  }));
  const attack: Pose[] = [
    { chassis: { pitch: -0.1 } },
    { chassis: { pitch: 0.15, offset: [0, 2, 0] } },
    { chassis: { pitch: 0.05 } },
  ];
  const idle = breathe('chassis');

  return {
    size: [30, 32, 34],
    foot: [15, 15, 0],
    materials: [
      { color: 0xeab308 }, { color: 0xca8a04 }, { color: 0x1e293b }, { color: 0x22d3ee, emissive: true },
      { color: 0x0f766e }, { color: 0x475569 }, { color: 0xfacc15 }, { color: 0xef4444, emissive: true },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── 4. Mecha Titan — massive heavy industrial red/steel war colossus ─────────

const mechaTitan = (): VoxelModel => {
  const M = { armor: 0, armorLight: 1, armorDark: 2, dark: 3, grid: 4, cannon: 5, glow: 6 };
  const cx = 22;
  const parts: Part[] = [
    ...pair('Leg', [15, 22, 12], [
      box(11, 18, 2, 19, 26, 13, M.armorDark),
      box(10, 17, 0, 20, 28, 3, M.dark),                       // heavy foot
      box(12, 26.2, 5, 18, 27.4, 9, M.armorLight),
    ], cx),
    {
      name: 'torso', pivot: [22, 22, 13], shapes: [
        box(12, 14, 13, 32, 30, 29, M.armor),                  // heavy red chassis
        box(14, 15, 29, 30, 29, 34, M.armorLight),
        box(15, 29.5, 16, 29, 31, 27, M.dark),                 // grill
        box(17, 30.5, 21, 27, 31.5, 23, M.glow),               // visor line
        box(16, 12, 26, 18, 14, 35, M.dark),                   // exhaust
        box(26, 12, 26, 28, 14, 35, M.dark),
      ],
    },
    ...pair('Arm', [8, 22, 27], [
      box(3, 16, 20, 11, 28, 31, M.armorDark),                 // massive pauldron
      box(4, 18, 10, 10, 26, 20, M.armor),
      box(3, 17, 1, 11, 27, 10, M.dark),                       // giant fist
      box(4, 27.2, 13, 10, 34, 18, M.cannon),                  // forearm missile pod
    ], cx, 'torso'),
  ];
  const walk: Pose[] = STRIDE.map((s) => ({
    leftLeg: { pitch: 0.35 * s },
    rightLeg: { pitch: -0.35 * s },
    leftArm: { pitch: -0.25 * s },
    rightArm: { pitch: 0.25 * s },
    torso: { offset: [0, 0, s === 0 ? 1 : 0], roll: 0.04 * s },
  }));
  const attack: Pose[] = [
    { rightArm: { pitch: 2.1 }, leftArm: { pitch: 0.3 }, torso: { yaw: 0.2 } },
    { rightArm: { pitch: 0.8 }, leftArm: { pitch: 0.6 }, torso: { pitch: 0.2, offset: [0, 2, 0] } },
    { rightArm: { pitch: 0.3 } },
  ];
  const idle = breathe('torso');
  return {
    size: [44, 44, 40],
    foot: [22, 22, 0],
    materials: [
      { color: 0xdc2626 }, { color: 0xef4444 }, { color: 0x991b1b }, { color: 0x1f2937 },
      { color: 0x475569 }, { color: 0x334155 }, { color: 0xfacc15, emissive: true },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── 5. High Priest — holy white & gold robes, papal mitre, crucifix staff ────

const highPriest = (): VoxelModel => {
  const M = { white: 0, gold: 1, robeDark: 2, skin: 3, beard: 4, holyStaff: 5, holyGlow: 6, eye: 7 };
  const cx = 15;
  const parts: Part[] = [
    {
      name: 'robe', pivot: [15, 15, 12], shapes: [
        box(10, 10.5, 0, 20, 19.5, 5, M.white),
        box(10.5, 11, 5, 19.5, 19, 12, M.white),
        box(9.8, 10.2, 0, 20.2, 19.8, 1.5, M.gold),            // gold hem
        box(13.5, 18.8, 0, 16.5, 19.8, 12, M.gold),            // golden stole
      ],
    },
    {
      name: 'torso', parent: 'robe', pivot: [15, 15, 12], shapes: [
        box(11, 12, 12, 19, 18, 22, M.white),
        box(13.2, 17.6, 12, 16.8, 18.6, 22, M.gold),           // golden sash
      ],
    },
    {
      name: 'head', parent: 'torso', pivot: [15, 15, 22], shapes: [
        box(12.5, 13, 22, 17.5, 17.5, 27, M.skin),
        box(13, 17.8, 25, 14, 18.4, 26, M.eye),
        box(16, 17.8, 25, 17, 18.4, 26, M.eye),
        box(12.8, 17.2, 19, 17.2, 18.8, 24, M.beard),          // holy white beard
        box(11.5, 11.5, 27, 18.5, 18.5, 34, M.white),          // papal mitre hat
        box(12.5, 12.5, 34, 17.5, 17.5, 38, M.gold),           // golden mitre peak
        box(14, 18.4, 29, 16, 18.8, 33, M.gold),               // golden cross on hat
        box(13, 18.4, 31, 17, 18.8, 32, M.gold),
      ],
    },
    ...pair('Arm', [10, 15, 21], [
      box(8, 13, 13, 11.5, 17, 21, M.white),
      box(7.5, 12.5, 12, 12, 17.5, 14, M.gold),               // gold cuff
      ball(9.7, 15.5, 11.5, 1.4, M.skin),
    ], cx, 'torso'),
    {
      name: 'staff', parent: 'rightArm', pivot: [20.5, 15.5, 12], shapes: [
        box(20, 15, 1, 21, 16, 33, M.holyStaff),               // golden staff
        box(18.5, 15, 33, 22.5, 16, 34.5, M.holyStaff),        // crucifix cross
        box(20, 15, 31, 21, 16, 38, M.holyStaff),
        ball(20.5, 15.5, 34, 2.5, M.holyGlow),                  // divine halo
      ],
    },
  ];
  const walk: Pose[] = STRIDE.map((s) => ({
    robe: { roll: 0.04 * s, offset: [0, 0, s === 0 ? 1 : 0] },
    leftArm: { pitch: -0.25 * s },
    rightArm: { pitch: 0.15 * s },
    staff: { pitch: -0.15 * s },
  }));
  const attack: Pose[] = [
    { rightArm: { pitch: 1.2 }, staff: { pitch: -1.2 }, leftArm: { pitch: 0.6 } },
    { rightArm: { pitch: 1.8 }, staff: { pitch: -1.8, scale: [1.3, 1.3, 1.3] }, leftArm: { pitch: 1.2 } },
    { rightArm: { pitch: 1.0 }, staff: { pitch: -1.0 } },
  ];
  const idle = breathe('torso');
  return {
    size: [30, 32, 42],
    foot: [15, 15, 0],
    materials: [
      { color: 0xf8fafc }, { color: 0xfbbf24 }, { color: 0xe2e8f0 }, { color: 0xf3c6a5 },
      { color: 0xffffff }, { color: 0xd97706 }, { color: 0xfef08a, emissive: true }, { color: 0x0f172a },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── 6. Mecha Valkyrie — aerial cyber warrior with cyan energy wings & lance ──

const valkyrie = (): VoxelModel => {
  const M = { armor: 0, steel: 1, dark: 2, wing: 3, wingGlow: 4, lance: 5, visor: 6 };
  const cx = 15;
  const parts: Part[] = [
    ...pair('Leg', [13.5, 15, 11], [
      box(12, 13.5, 2, 15, 16.5, 11, M.armor),
      box(11.5, 13, 0, 15.5, 17.5, 3, M.steel),
    ], cx),
    {
      name: 'torso', pivot: [15, 15, 11], shapes: [
        box(11.5, 13, 11, 18.5, 17, 22, M.armor),
        box(12, 16.8, 14, 18, 17.8, 20, M.steel),              // chest plate
        box(14, 17.2, 16, 16, 18, 18, M.wingGlow),             // cyan chest core
      ],
    },
    {
      name: 'head', parent: 'torso', pivot: [15, 15, 22], shapes: [
        box(12, 12.5, 22, 18, 17.5, 28, M.armor),
        box(13, 17.2, 24.5, 17, 18, 26, M.visor),              // glowing cyan visor
        box(9.5, 13, 25, 12, 16.5, 30, M.steel),               // aerodynamic ear wings
        box(18, 13, 25, 20.5, 16.5, 30, M.steel),
      ],
    },
    ...pair('Arm', [9.5, 15, 21], [
      box(7.5, 13.5, 13, 11, 16.5, 21, M.armor),
      box(7.2, 13.2, 10, 11.3, 16.8, 13.5, M.steel),
    ], cx, 'torso'),
    ...pair('Wing', [10, 12, 20], [
      box(2, 11, 19, 11, 12, 23, M.wing),                     // holographic wings
      box(0, 11, 16, 6, 12, 30, M.wingGlow),
    ], cx, 'torso'),
    {
      name: 'lance', parent: 'rightArm', pivot: [21, 15, 12], shapes: [
        box(20.5, 14.5, 0, 21.5, 15.5, 36, M.steel),           // lightning spear
        box(19.5, 13.5, 28, 22.5, 16.5, 38, M.lance),
        box(20, 14, 38, 22, 16, 42, M.wingGlow),
      ],
    },
  ];
  const walk: Pose[] = STRIDE.map((s) => ({
    leftLeg: { pitch: 0.5 * s },
    rightLeg: { pitch: -0.5 * s },
    leftWing: { roll: 0.25 * s, yaw: 0.15 * s },
    rightWing: { roll: -0.25 * s, yaw: -0.15 * s },
    torso: { pitch: 0.1, offset: [0, 0, s === 0 ? 1 : 0] },
  }));
  const attack: Pose[] = [
    { rightArm: { pitch: 1.4 }, lance: { pitch: -1.4 }, leftWing: { yaw: 0.4 }, rightWing: { yaw: -0.4 } },
    { rightArm: { pitch: 1.9, offset: [0, 3, 0] }, lance: { pitch: -1.9 }, torso: { pitch: 0.2 } },
    { rightArm: { pitch: 1.1 } },
  ];
  const idle = breathe('torso', { leftWing: { roll: 0.1 }, rightWing: { roll: -0.1 } });
  return {
    size: [34, 32, 42],
    foot: [15, 15, 0],
    materials: [
      { color: 0xcbd5e1 }, { color: 0x94a3b8 }, { color: 0x1e293b },
      { color: 0x38bdf8, emissive: true }, { color: 0x7dd3fc, emissive: true },
      { color: 0x0284c7 }, { color: 0x22d3ee, emissive: true },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── 7. Assassin — dual-blade stealth killer in dark hooded leather ───────────

const assassin = (): VoxelModel => {
  const M = { cloak: 0, leather: 1, mask: 2, eye: 3, blade: 4, poison: 5, skin: 6 };
  const cx = 15;
  const parts: Part[] = [
    ...pair('Leg', [13.5, 15, 11], [
      box(12, 13.5, 3, 15, 16.5, 11, M.leather),
      box(11.5, 13, 0, 15.5, 17, 3.5, M.cloak),
    ], cx),
    {
      name: 'torso', pivot: [15, 15, 11], shapes: [
        box(11, 13, 11, 19, 17, 21, M.cloak),
        box(11.5, 16.8, 12, 18.5, 17.6, 20, M.leather),        // straps
      ],
    },
    {
      name: 'head', parent: 'torso', pivot: [15, 15, 21], shapes: [
        box(11.5, 12, 21, 18.5, 18, 28, M.cloak),              // cowl
        box(12.5, 16.8, 22, 17.5, 18.2, 25, M.mask),           // face mask
        box(13, 17.5, 25.5, 14.2, 18.3, 26.5, M.eye),          // glowing crimson eyes
        box(15.8, 17.5, 25.5, 17, 18.3, 26.5, M.eye),
      ],
    },
    ...pair('Arm', [9.5, 15, 20], [
      box(8, 13.5, 12, 11, 16.5, 20, M.cloak),
      box(7.8, 13.2, 9, 11.2, 16.8, 12.5, M.leather),
    ], cx, 'torso'),
    // Left Dagger
    {
      name: 'leftDagger', parent: 'leftArm', pivot: [9, 15, 10], shapes: [
        box(8.5, 14, 9, 9.5, 16, 11, M.leather),
        box(8.8, 14.5, 2, 9.2, 15.5, 9, M.blade),              // reverse grip blade
        box(8.7, 14.8, 2, 9.3, 15.2, 6, M.poison),             // poison drip
      ],
    },
    // Right Dagger
    {
      name: 'rightDagger', parent: 'rightArm', pivot: [21, 15, 10], shapes: [
        box(20.5, 14, 9, 21.5, 16, 11, M.leather),
        box(20.8, 14.5, 2, 21.2, 15.5, 9, M.blade),
        box(20.7, 14.8, 2, 21.3, 15.2, 6, M.poison),
      ],
    },
  ];
  const walk: Pose[] = STRIDE.map((s) => ({
    leftLeg: { pitch: 0.65 * s },
    rightLeg: { pitch: -0.65 * s },
    leftArm: { pitch: -0.5 * s },
    rightArm: { pitch: 0.5 * s },
    torso: { pitch: 0.18, offset: [0, 0, s === 0 ? 1 : 0] },
  }));
  const attack: Pose[] = [
    { leftArm: { pitch: 1.2 }, rightArm: { pitch: 1.2 }, torso: { pitch: 0.2 } },
    { leftArm: { pitch: 1.8, offset: [0, 2, 0] }, rightArm: { pitch: 1.8, offset: [0, 2, 0] }, torso: { pitch: 0.3 } },
    { leftArm: { pitch: 0.8 }, rightArm: { pitch: 0.8 } },
  ];
  const idle = breathe('torso');
  return {
    size: [30, 32, 36],
    foot: [15, 15, 0],
    materials: [
      { color: 0x0f172a }, { color: 0x334155 }, { color: 0x1e293b },
      { color: 0xef4444, emissive: true }, { color: 0xe2e8f0 }, { color: 0x10b981, emissive: true }, { color: 0xfecdd3 },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── 8. Mecha Drone — hovering quad-thruster drone with central laser cannon ──

const drone = (): VoxelModel => {
  const M = { hull: 0, dark: 1, thruster: 2, thrusterGlow: 3, eye: 4, cannon: 5 };
  const c = 14;
  const parts: Part[] = [
    {
      name: 'body', pivot: [c, c, 10], shapes: [
        ell(c, c, 10, 6, 6, 4, M.hull),                         // main disc
        ell(c, c, 11, 4.5, 4.5, 4, M.dark),
        box(c - 2, c + 5.5, 8.5, c + 2, c + 6.5, 11.5, M.eye), // glowing red sensor
        box(c - 1, c + 6, 5, c + 1, c + 11, 7.5, M.cannon),    // underslung laser
      ],
    },
    // 4 Quad Rotor Pods
    ...pair('FrontPod', [c - 7, c + 7, 10], [
      box(c - 9, c + 5, 8, c - 5, c + 9, 12, M.dark),
      cyl(c - 7, c + 7, 7, 2, 2, M.thrusterGlow),
    ], c, 'body'),
    ...pair('BackPod', [c - 7, c - 7, 10], [
      box(c - 9, c - 9, 8, c - 5, c - 5, 12, M.dark),
      cyl(c - 7, c - 7, 7, 2, 2, M.thrusterGlow),
    ], c, 'body'),
  ];
  const walk: Pose[] = STRIDE.map((s) => ({
    body: { offset: [0, 0, s === 0 ? 1.5 : -0.5], roll: 0.08 * s, pitch: 0.1 },
  }));
  const attack: Pose[] = [
    { body: { pitch: -0.15 } },
    { body: { pitch: 0.25, offset: [0, 2, 0] } },
    { body: { pitch: 0.05 } },
  ];
  const idle: Pose[] = [{ body: { offset: [0, 0, 1] } }, { body: { offset: [0, 0, -1] } }];
  return {
    size: [28, 28, 24],
    foot: [c, c, 0],
    materials: [
      { color: 0x475569 }, { color: 0x1e293b }, { color: 0x0f172a },
      { color: 0x38bdf8, emissive: true }, { color: 0xef4444, emissive: true }, { color: 0x94a3b8 },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── 9. Mecha Siege Tank — heavy treaded combat chassis with artillery cannon ─

const siegeTank = (): VoxelModel => {
  const M = { olive: 0, oliveDark: 1, tread: 2, steel: 3, muzzle: 4, optic: 5 };
  const cx = 18;
  const parts: Part[] = [
    // Left & Right Track Treads
    ...pair('Track', [8, 18, 5], [
      box(3, 6, 0, 8.5, 30, 8, M.tread),
      box(2.5, 8, 7.5, 9, 28, 9.5, M.oliveDark),              // armored track skirt
    ], cx),
    {
      name: 'hull', pivot: [18, 18, 6], shapes: [
        box(9, 8, 4, 27, 28, 12, M.olive),                     // main hull
        box(11, 27.5, 5, 25, 29, 11, M.steel),                 // front glacis
      ],
    },
    {
      name: 'turret', parent: 'hull', pivot: [18, 18, 12], shapes: [
        box(11, 11, 12, 25, 25, 18, M.olive),                  // turret dome
        box(12, 12, 18, 24, 24, 20, M.oliveDark),
        box(16, 24.5, 14, 20, 25.5, 16.5, M.optic),
        box(16.5, 23, 13.5, 19.5, 37, 16.5, M.steel),          // long cannon barrel
        box(15.5, 37, 12.5, 20.5, 40, 17.5, M.muzzle),         // heavy muzzle brake
      ],
    },
  ];
  const walk: Pose[] = STRIDE.map((s) => ({
    hull: { offset: [0, 0, s === 0 ? 0.5 : 0] },
    turret: { yaw: 0.05 * s },
  }));
  const attack: Pose[] = [
    { turret: { pitch: -0.1 } },
    { turret: { pitch: 0.1, offset: [0, -2, 0] } },
    { turret: { offset: [0, -0.5, 0] } },
  ];
  const idle = breathe('hull');
  return {
    size: [36, 42, 26],
    foot: [18, 18, 0],
    materials: [
      { color: 0x4d5f2c }, { color: 0x36441e }, { color: 0x1f2937 },
      { color: 0x64748b }, { color: 0xf97316, emissive: true }, { color: 0xef4444, emissive: true },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── 10. Chrono Time Mage — starry midnight robes, clockwork, hourglass staff ─

const chronoMage = (): VoxelModel => {
  const M = { robe: 0, robeDark: 1, gold: 2, skin: 3, beard: 4, staff: 5, glass: 6, sand: 7, hat: 8, eye: 9 };
  const cx = 15;
  const parts: Part[] = [
    {
      name: 'robe', pivot: [15, 15, 12], shapes: [
        box(10, 10.5, 0, 20, 19.5, 4, M.robeDark),
        box(10.5, 11, 4, 19.5, 19, 12, M.robe),
        box(9.8, 10.3, 0, 20.2, 19.7, 1.2, M.gold),
      ],
    },
    {
      name: 'torso', parent: 'robe', pivot: [15, 15, 12], shapes: [
        box(11, 12, 12, 19, 18, 22, M.robe),
        box(12.5, 17.5, 14, 17.5, 18.5, 19, M.gold),           // clockwork gears mantle
      ],
    },
    {
      name: 'head', parent: 'torso', pivot: [15, 15, 22], shapes: [
        box(12.5, 13, 22, 17.5, 18, 28, M.skin),
        box(13, 17.8, 25, 14, 18.4, 26, M.eye),
        box(16, 17.8, 25, 17, 18.4, 26, M.eye),
        box(12.8, 17, 18, 17.2, 18.8, 24, M.beard),
        ell(15, 15, 28.5, 6.5, 6.5, 0.9, M.hat),               // wizard hat brim
        box(12, 12, 29, 18, 18, 33, M.hat),
        box(13, 13, 33, 17, 17, 37, M.gold),
        box(14, 14, 37, 16, 16, 40, M.hat),
      ],
    },
    ...pair('Arm', [10, 15, 21], [
      box(8, 13, 13, 11.5, 17, 21, M.robe),
      box(7.5, 12.5, 12, 12, 17.5, 14, M.gold),
      ball(9.7, 15.5, 11.5, 1.4, M.skin),
    ], cx, 'torso'),
    {
      name: 'staff', parent: 'rightArm', pivot: [20.5, 15.5, 12], shapes: [
        box(20, 15, 1, 21, 16, 32, M.staff),
        box(18.5, 14, 31, 22.5, 17, 37, M.gold),               // hourglass frame
        ell(20.5, 15.5, 34, 1.6, 1.6, 2.4, M.glass),            // glowing hourglass
        ball(20.5, 15.5, 34, 0.9, M.sand),
      ],
    },
  ];
  const walk: Pose[] = STRIDE.map((s) => ({
    robe: { roll: 0.05 * s, offset: [0, 0, s === 0 ? 1 : 0] },
    leftArm: { pitch: -0.2 * s },
    rightArm: { pitch: 0.15 * s },
    staff: { pitch: -0.15 * s },
  }));
  const attack: Pose[] = [
    { rightArm: { pitch: 1.2 }, staff: { pitch: -1.2, scale: [1.2, 1.2, 1.2] }, leftArm: { pitch: 0.5 } },
    { rightArm: { pitch: 1.8 }, staff: { pitch: -1.8, scale: [1.5, 1.5, 1.5] }, leftArm: { pitch: 1.0 } },
    { rightArm: { pitch: 1.0 }, staff: { pitch: -1.0 } },
  ];
  const idle = breathe('torso');
  return {
    size: [30, 32, 44],
    foot: [15, 15, 0],
    materials: [
      { color: 0x1e1b4b }, { color: 0x0f0e26 }, { color: 0xf59e0b }, { color: 0xfde047 },
      { color: 0xe2e8f0 }, { color: 0x78350f }, { color: 0x38bdf8, emissive: true },
      { color: 0xfacc15, emissive: true }, { color: 0x312e81 }, { color: 0x60a5fa, emissive: true },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── Registry ─────────────────────────────────────────────────────────────────

export type EnemySpriteKey =
  | 'knight' | 'archer' | 'mechaScout' | 'mechaTitan'
  | 'highPriest' | 'valkyrie' | 'assassin' | 'drone' | 'siegeTank' | 'chronoMage';

export const ENEMY_MODELS: Record<EnemySpriteKey, () => VoxelModel> = {
  knight,
  archer,
  mechaScout,
  mechaTitan,
  highPriest,
  valkyrie,
  assassin,
  drone,
  siegeTank,
  chronoMage,
};

/** Which sprite each invader type uses. */
export const INVADER_SPRITE: Record<InvaderType, EnemySpriteKey> = {
  HUMAN_KNIGHT: 'knight',
  HUMAN_ARCHER: 'archer',
  MECHA_SCOUT: 'mechaScout',
  MECHA_TITAN: 'mechaTitan',
  HIGH_PRIEST: 'highPriest',
  MECHA_VALKYRIE: 'valkyrie',
  ASSASSIN: 'assassin',
  MECHA_DRONE: 'drone',
  MECHA_SIEGE_TANK: 'siegeTank',
  CHRONO: 'chronoMage',
};
