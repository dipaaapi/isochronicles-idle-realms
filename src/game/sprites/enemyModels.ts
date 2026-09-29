import type { InvaderType } from '../../types/game';
import type { Part, Pose, Shape, Vec3, VoxelModel } from './VoxelSprite';

/**
 * Voxel models for every invader, following the bestiary artwork in
 * public/backgrounds/bestiary-icons/. Coordinates are voxels in model space:
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

/** Walk cycle phase per frame: stride, pass, opposite stride, pass. */
const STRIDE = [1, 0, -1, 0];

/** Two-frame idle loop: the given pose, then the same pose with `part` sunk one voxel (a breath). */
export const breathe = (part: string, base: Pose = {}): Pose[] => [
  base,
  { ...base, [part]: { ...(base[part] ?? {}), offset: [0, 0, -1] } },
];

// ── Crusader Knight — full silver plate, red plume, sword and kite shield ────

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
        box(10.5, 12.5, 9, 19.5, 17.5, 12, M.mail),           // mail skirt
        box(10, 12, 11, 20, 18, 13, M.leather),               // belt
        box(14, 17.9, 11.3, 16, 18.4, 12.7, M.bright),        // buckle
        box(10, 12, 13, 20, 18, 23, M.steel),
        box(11.5, 17.6, 15, 18.5, 18.6, 22, M.bright),        // breastplate ridge
        ell(9.8, 15, 22, 2.6, 3.2, 2, M.bright),              // pauldrons
        ell(20.2, 15, 22, 2.6, 3.2, 2, M.bright),
      ],
    },
    {
      name: 'head', parent: 'torso', pivot: [15, 15, 23], shapes: [
        box(11.5, 11.5, 23, 18.5, 18.5, 31, M.steel),         // great helm
        ell(15, 15, 31, 3.5, 3.5, 2, M.steel),
        box(14.5, 18, 23, 15.5, 19, 31, M.bright),            // centre ridge
        box(12, 18, 26.5, 18, 19, 27.8, M.visor),             // eye slit
        box(12.5, 18, 24, 14, 19, 25, M.visor),               // breaths
        box(16, 18, 24, 17.5, 19, 25, M.visor),
        box(14, 11, 31.5, 16, 17, 34, M.plume),               // plume
        box(14, 9.5, 28, 16, 12, 33, M.plume),
      ],
    },
    { name: 'leftArm', parent: 'torso', pivot: [8.5, 15, 22], shapes: leftArm },
    {
      name: 'shield', parent: 'leftArm', pivot: [8.5, 15, 14], shapes: [
        box(4.8, 10.5, 12, 7, 20.5, 23, M.bright),            // kite shield
        box(4.8, 12, 9, 7, 19, 12, M.bright),
        box(4.8, 13.5, 7, 7, 17.5, 9, M.bright),
        box(4.3, 10, 22.5, 7, 21, 23.5, M.steel),             // rim
        box(4.3, 14.5, 9, 4.8, 16.5, 22, M.steel),            // boss ridge
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

// ── Elven Hunter — blond elf, pointed ears, green tunic, longbow ─────────────

const archer = (): VoxelModel => {
  const M = { tunic: 0, tunicLight: 1, leather: 2, pants: 3, skin: 4, eyes: 5, wood: 6, string: 7, fletch: 8, tip: 9, boots: 10, hair: 11 };
  const cx = 15;
  const leftLeg: Shape[] = [box(12, 13.5, 4, 14.5, 16.5, 11, M.pants), box(11.7, 13, 0, 14.8, 17.5, 4.5, M.boots)];
  const leftArm: Shape[] = [
    box(8.5, 13.8, 17, 11, 16.2, 22, M.tunicLight),
    box(8.6, 13.9, 13, 10.9, 16.1, 17, M.leather),            // bracer
    box(8.7, 14, 12, 10.8, 16, 13.5, M.skin),
  ];

  const parts: Part[] = [
    { name: 'leftLeg', pivot: [13.25, 15, 11], shapes: leftLeg },
    { name: 'rightLeg', pivot: mirrorPivot([13.25, 15, 11], cx), shapes: mirrorX(leftLeg, cx) },
    {
      name: 'torso', pivot: [15, 15, 11], shapes: [
        box(11, 12.5, 9, 19, 17.5, 22, M.tunic),
        box(11, 12.5, 12.5, 19, 17.8, 13.8, M.leather),       // belt
        box(14, 17.6, 12.3, 16, 18.2, 14, M.tip),
        box(12, 17.4, 14, 13.2, 18, 22, M.leather),           // quiver strap
        box(11.5, 12.2, 19, 18.5, 17.8, 22.5, M.tunicLight),  // collar
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
        box(11.5, 11.8, 26, 18.5, 16.5, 31, M.hair),          // blond hair
        box(12, 11.5, 22, 18, 13, 27, M.hair),                // hair down the back
        box(12.3, 17, 29, 17.7, 18.3, 30.6, M.hair),          // fringe
        box(10.3, 14, 26.5, 11.5, 15.5, 30.5, M.skin),        // pointed ears
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
  // Bow and arrow counter-rotate against their arms so the bow stays upright
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

// ── Mecha Scout — white round-headed robot rolling on two wheels ─────────────

const mechaScout = (): VoxelModel => {
  const M = { shell: 0, shellShade: 1, dark: 2, lens: 3, lensRing: 4, tyre: 5, hub: 6, accent: 7, beam: 8 };
  const cx = 15;
  const wheel: Shape[] = [
    ell(8.5, 15, 5.5, 2.2, 5.5, 5.5, M.tyre),
    ell(7.2, 15, 5.5, 0.9, 2.4, 2.4, M.hub),
    box(6.6, 14.5, 1.5, 7.4, 15.5, 9.5, M.hub),               // spoke — shows the spin
  ];
  const parts: Part[] = [
    { name: 'leftWheel', pivot: [8.5, 15, 5.5], shapes: wheel },
    { name: 'rightWheel', pivot: mirrorPivot([8.5, 15, 5.5], cx), shapes: mirrorX(wheel, cx) },
    {
      name: 'chassis', pivot: [15, 15, 8], shapes: [
        box(10, 11, 3, 20, 19, 10, M.shellShade),             // axle body
        box(11, 11.5, 9, 19, 18.5, 15, M.shell),
        ell(15, 18.8, 12, 2, 0.6, 2, M.accent),                // chest ring emblem
        ell(15, 18.9, 12, 1, 0.5, 1, M.lens),
        box(9.5, 9.5, 14.5, 20.5, 20.5, 16, M.accent),         // neck band
        ell(15, 15, 21, 6.5, 6, 6, M.shell),                   // round head
        ell(15, 13, 22, 5.8, 3.5, 5, M.shellShade),            // back shading
        ell(15, 20.6, 21.5, 3, 1.1, 3, M.lensRing),
        ell(15, 21.3, 21.5, 1.8, 0.7, 1.8, M.lens),
        box(9, 14, 19, 9.8, 16, 23, M.accent),                 // ear discs
        box(20.2, 14, 19, 21, 16, 23, M.accent),
      ],
    },
    {
      name: 'antenna', parent: 'chassis', pivot: [18.5, 13.5, 26], shapes: [
        box(18, 13, 25.5, 19, 14, 32, M.shellShade),
        ell(18.5, 13.5, 32.5, 1.1, 1.1, 1.1, M.accent),
      ],
    },
    { name: 'beam', parent: 'chassis', pivot: [15, 22, 21.5], shapes: [ell(15, 27, 21.5, 1.2, 4.5, 1.2, M.beam)] },
  ];

  const walk: Pose[] = [0, 1, 2, 3].map((f) => ({
    leftWheel: { pitch: f * 0.8 },
    rightWheel: { pitch: f * 0.8 },
    chassis: { offset: [0, 0, f % 2], roll: f % 2 ? 0.04 : -0.04 },
    antenna: { pitch: f % 2 ? -0.25 : 0.1 },
    beam: { hidden: true },
  }));
  const attack: Pose[] = [
    { chassis: { pitch: 0.06 }, beam: { hidden: true } },
    { chassis: { offset: [0, -1, 0] }, antenna: { pitch: -0.3 } },
    { chassis: { offset: [0, -0.5, 0] }, beam: { hidden: true }, antenna: { pitch: 0.15 } },
  ];
  const idle = breathe('chassis', { beam: { hidden: true } });

  return {
    size: [30, 32, 36],
    foot: [15, 15, 0],
    materials: [
      { color: 0xe8ecf1 }, { color: 0x9aa4b2 }, { color: 0x1f2937 }, { color: 0x22d3ee, emissive: true },
      { color: 0x0e7490 }, { color: 0x1a1f2b }, { color: 0x6b7280 }, { color: 0x38bdf8 }, { color: 0x67e8f9, emissive: true },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── Heavy Mecha Titan — khaki four-legged walker with shoulder cannon pods ───

const mechaTitan = (): VoxelModel => {
  const M = { armor: 0, armorLight: 1, armorDark: 2, dark: 3, grid: 4, gridDim: 5, flash: 6 };
  const cx = 23;
  const frontLeg: Shape[] = [
    box(9, 28, 13, 15, 33, 19, M.armorDark),                  // hip
    box(7.5, 30, 1.5, 11, 33.5, 15, M.armor),                 // shin
    box(6.5, 29, 0, 12, 35.5, 2, M.dark),                     // foot
  ];
  const backLeg: Shape[] = [
    box(9, 13, 13, 15, 18, 19, M.armorDark),
    box(7.5, 12.5, 1.5, 11, 16, 15, M.armor),
    box(6.5, 10.5, 0, 12, 17, 2, M.dark),
  ];
  const pod: Shape[] = [
    box(3, 16, 20, 12.5, 31, 30, M.armor),
    box(3.5, 16.5, 30, 12, 30.5, 31.2, M.armorLight),
    box(3, 30.5, 21, 12.5, 32, 29, M.armorDark),              // barrel mount
    box(4, 32, 22, 7, 41, 25, M.dark),                        // four chunky barrels
    box(8.5, 32, 22, 11.5, 41, 25, M.dark),
    box(4, 32, 26, 7, 41, 29, M.dark),
    box(8.5, 32, 26, 11.5, 41, 29, M.dark),
  ];
  const gridPanel: Shape[] = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      gridPanel.push(box(18.5 + i * 3, 32.3, 19.5 + j * 3, 20.5 + i * 3, 33.2, 21.5 + j * 3, (i + j) % 2 ? M.gridDim : M.grid));
    }
  }

  const parts: Part[] = [
    { name: 'leftFrontLeg', pivot: [12, 30.5, 18], shapes: frontLeg },
    { name: 'rightFrontLeg', pivot: mirrorPivot([12, 30.5, 18], cx), shapes: mirrorX(frontLeg, cx) },
    { name: 'leftBackLeg', pivot: [12, 15.5, 18], shapes: backLeg },
    { name: 'rightBackLeg', pivot: mirrorPivot([12, 15.5, 18], cx), shapes: mirrorX(backLeg, cx) },
    {
      name: 'hull', pivot: [23, 23, 16], shapes: [
        box(13, 14, 16, 33, 32, 33, M.armor),
        box(14, 15, 33, 32, 31, 35, M.armorLight),
        box(16, 31.5, 18, 30, 32.6, 30.5, M.armorDark),       // front plate
        ...gridPanel,
        box(17, 32.3, 27.5, 29, 33.2, 29.5, M.dark),          // sensor slit
        box(18, 12, 30, 20, 14, 37, M.dark),                  // exhaust stacks
        box(26, 12, 30, 28, 14, 37, M.dark),
      ],
    },
    { name: 'leftPod', parent: 'hull', pivot: [8, 23, 25], shapes: pod },
    { name: 'leftFlash', parent: 'leftPod', pivot: [8, 41, 25.5], shapes: [ell(8, 42.5, 25.5, 3.4, 2.2, 3.4, M.flash)] },
    { name: 'rightPod', parent: 'hull', pivot: mirrorPivot([8, 23, 25], cx), shapes: mirrorX(pod, cx) },
    { name: 'rightFlash', parent: 'rightPod', pivot: mirrorPivot([8, 41, 25.5], cx), shapes: mirrorX([ell(8, 42.5, 25.5, 3.4, 2.2, 3.4, M.flash)], cx) },
  ];

  const noFlash = { leftFlash: { hidden: true }, rightFlash: { hidden: true } };
  // Diagonal leg pairs step together, spider-style
  const walk: Pose[] = STRIDE.map((s) => ({
    leftFrontLeg: { pitch: 0.3 * s },
    rightBackLeg: { pitch: 0.3 * s },
    rightFrontLeg: { pitch: -0.3 * s },
    leftBackLeg: { pitch: -0.3 * s },
    hull: { offset: [0, 0, s === 0 ? 1 : 0], roll: 0.03 * s },
    ...noFlash,
  }));
  const attack: Pose[] = [
    { leftPod: { pitch: -0.1 }, rightPod: { pitch: -0.1 }, ...noFlash },
    { leftPod: { offset: [0, -2, 0] }, rightPod: { offset: [0, -2, 0] }, hull: { offset: [0, -1, 0] } },
    { leftPod: { offset: [0, -1, 0] }, rightPod: { offset: [0, -1, 0] }, ...noFlash },
  ];
  const idle = breathe('hull', noFlash);

  return {
    size: [46, 46, 42],
    foot: [23, 23, 0],
    materials: [
      { color: 0xa89f7e }, { color: 0xc9c0a0 }, { color: 0x6e6650 }, { color: 0x2b2b26 },
      { color: 0xef4444, emissive: true }, { color: 0x7f1d1d }, { color: 0xfff3b0, emissive: true },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── Deep One — green octopus horror with orange eyes and purple fins ─────────

const deepOne = (): VoxelModel => {
  const M = { skin: 0, skinDark: 1, skinLight: 2, eye: 3, pupil: 4, fin: 5, sucker: 6 };
  const c = 18;
  const tentacleAngles = [25, 70, 115, 160, 200, 245, 290, 335].map((deg) => (deg * Math.PI) / 180);
  const parts: Part[] = [
    {
      name: 'body', pivot: [c, c, 8], shapes: [
        ell(c, 16.5, 22, 6.8, 6.8, 8.5, M.skin),              // bulbous head
        ell(c, 15, 26, 4.5, 5, 5, M.skinLight),
        ell(c, 19, 14.5, 5.2, 4.2, 4.2, M.skin),              // face
        ell(15.2, 22.3, 17.6, 1.7, 0.9, 1.7, M.eye),
        ell(20.8, 22.3, 17.6, 1.7, 0.9, 1.7, M.eye),
        box(15, 23, 16.6, 15.6, 23.6, 18.8, M.pupil),
        box(20.6, 23, 16.6, 21.2, 23.6, 18.8, M.pupil),
        box(13.5, 21.5, 19.3, 17, 22.8, 20.3, M.skinDark),    // brows
        box(19, 21.5, 19.3, 22.5, 22.8, 20.3, M.skinDark),
        ell(11, 17, 20, 0.9, 3, 4.2, M.fin),                  // side fins
        ell(25, 17, 20, 0.9, 3, 4.2, M.fin),
      ],
    },
  ];

  // Each tentacle is a 3-segment chain so it can sway and curl
  tentacleAngles.forEach((angle, i) => {
    const dx = Math.sin(angle);
    const dy = Math.cos(angle);
    let parent = 'body';
    for (let k = 0; k < 3; k++) {
      const dist = 5 + k * 3.2;
      const center: Vec3 = [c + dx * dist, c + dy * dist, 8 - k * 2.6 + (k === 2 ? 1.5 : 0)];
      const r = 2 - k * 0.4;
      const name = `t${i}_${k}`;
      parts.push({
        name,
        parent,
        pivot: [c + dx * (dist - 1.6), c + dy * (dist - 1.6), center[2] + 1.3],
        shapes: [
          ell(center[0], center[1], center[2], r, r, r * 0.9, k === 2 ? M.skinDark : M.skin),
          ell(center[0], center[1], center[2] - r * 0.6, r * 0.6, r * 0.6, 0.6, M.sucker),
        ],
      });
      parent = name;
    }
  });

  const tentaclePose = (phase: number, lift: (i: number) => number): Pose => {
    const pose: Pose = {};
    tentacleAngles.forEach((_, i) => {
      for (let k = 0; k < 3; k++) {
        pose[`t${i}_${k}`] = {
          yaw: 0.22 * Math.sin(phase + i * 1.1 + k * 0.6),
          offset: [0, 0, k === 0 ? lift(i) : 0],
        };
      }
    });
    return pose;
  };

  const walk: Pose[] = STRIDE.map((s, f) => ({
    ...tentaclePose((f * Math.PI) / 2, (i) => (i % 2 === (f % 2) ? 1 : 0)),
    body: { offset: [0, 0, s === 0 ? 1.5 : 0], roll: 0.05 * s },
  }));
  // Front tentacles (either side of +y) rise and lash forward
  const front = (i: number, amount: number) => (i === 0 || i === 7 ? amount : 0);
  const attack: Pose[] = [
    { ...tentaclePose(0, (i) => front(i, 4)), body: { pitch: -0.12, offset: [0, -1, 1] } },
    { ...tentaclePose(1, (i) => front(i, 2)), body: { pitch: 0.25, offset: [0, 2.5, 0] } },
    { ...tentaclePose(2, () => 0), body: { pitch: 0.1, offset: [0, 1, 0] } },
  ];
  const idle: Pose[] = [
    { ...tentaclePose(0, () => 0), body: {} },
    { ...tentaclePose(1.6, () => 0), body: { offset: [0, 0, 1] } },
  ];

  return {
    size: [36, 36, 34],
    foot: [c, c, 0],
    materials: [
      { color: 0x3f8f5a }, { color: 0x2c6641 }, { color: 0x6fbf73 }, { color: 0xf59e0b, emissive: true },
      { color: 0x1c1917 }, { color: 0x9d4edd }, { color: 0xc4b5fd },
    ],
    parts,
    animations: { walk, attack, idle },
  };
};

// ── Registry ─────────────────────────────────────────────────────────────────

export type EnemySpriteKey = 'knight' | 'archer' | 'mechaScout' | 'mechaTitan' | 'deepOne';

export const ENEMY_MODELS: Record<EnemySpriteKey, () => VoxelModel> = {
  knight,
  archer,
  mechaScout,
  mechaTitan,
  deepOne,
};

/** Which sprite each invader type uses (variant types share a base model). */
export const INVADER_SPRITE: Record<InvaderType, EnemySpriteKey> = {
  HUMAN_KNIGHT: 'knight',
  VOID_SHADE: 'knight',
  HUMAN_ARCHER: 'archer',
  MECHA_SCOUT: 'mechaScout',
  RIFT_STALKER: 'mechaScout',
  MECHA_TITAN: 'mechaTitan',
  CORRUPTED_GOLEM: 'mechaTitan',
  DEEP_ONE: 'deepOne',
};
