import type { Part, Pose, Shape, VoxelModel } from './VoxelSprite';

/**
 * The Kirov-class siege airship (game/KirovAirship.ts) as a voxel model, baked
 * like the characters into 8-direction sheets so it turns to face where it
 * flies. +y is the nose, +z up. Its states reuse the character animation slots:
 *   walk   cruise: four propellers spinning, the envelope riding the air
 *   idle   hovering over its target
 *   run    paratrooper drop: belly hatch open, jump light blinking, a stick of troopers falling
 *   attack carpet bombing / firebombs: bomb bay doors swing open, bombs stream out
 *   skill  wrecking anchor: lowered on its chain, swung, hauled back up
 *   tired  damaged: burning engine, torn envelope smoking, sputtering props
 *   hit    a jolt as a hit lands
 *   death  nose dips, fire spreads, the envelope sags and the hull sinks
 */

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: number): Shape => ({
  kind: 'box', min: [x0, y0, z0], max: [x1, y1, z1], mat,
});
const ell = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, mat: number): Shape => ({
  kind: 'ellipsoid', center: [cx, cy, cz], radii: [rx, ry, rz], mat,
});
const ball = (cx: number, cy: number, cz: number, r: number, mat: number): Shape => ell(cx, cy, cz, r, r, r, mat);

const kirov = (): VoxelModel => {
  const M = {
    env: 0, envMid: 1, envHi: 2, envDark: 3, seam: 4, band: 5, gold: 6, metal: 7, metalHi: 8, metalDk: 9,
    glass: 10, red: 11, green: 12, bomb: 13, chain: 14, fire: 15, fireHot: 16, smoke: 17, para: 18, blade: 19, smokeLight: 20,
  };
  const X = 20, Y = 46, Z = 34; // envelope centre
  const RX = 12.5, RY = 38, RZ = 12.5;

  // ── Envelope: armoured crimson hull with rib seams, a belly band, gold crest and nose cap
  const envelope: Shape[] = [
    ell(X, Y, Z, RX, RY, RZ, M.env),
    ell(X, Y + 2, Z + 4.5, RX - 2.5, RY - 6, RZ - 5, M.envMid),
    ell(X, Y + 6, Z + 8.5, RX - 7, RY - 14, 3, M.envHi),
    ell(X, Y - 2, Z - 6, RX - 1.5, RY - 4, RZ - 6.5, M.envDark),
    // Rib seams: thin rings around the hull
    ...[-26, -16, -6, 4, 14, 24].map((dy) => {
      const k = Math.sqrt(Math.max(0, 1 - (dy / RY) ** 2));
      return ell(X, Y + dy, Z, RX * k + 0.35, 0.55, RZ * k + 0.35, M.seam);
    }),
    // Armoured belly band and gold crest stripe near the nose
    ell(X, Y, Z - 8.5, RX - 3, RY - 8, 2.4, M.band),
    ell(X, Y + 27, Z, RX * 0.72 + 0.4, 1.1, RZ * 0.72 + 0.4, M.gold),
    // Nose cap
    ell(X, Y + RY - 3, Z, 6.5, 5, 6.5, M.metal),
    ell(X, Y + RY - 1, Z + 1.5, 3.5, 3, 3.2, M.metalHi),
    // Tail fins: a cross of armoured vanes, red-tipped
    box(X - 0.8, 4, Z + 4, X + 0.8, 16, Z + 17, M.metalDk), box(X - 0.8, 4, Z + 13, X + 0.8, 9, Z + 17, M.red),
    box(X - 0.8, 4, Z - 15, X + 0.8, 16, Z - 4, M.metalDk),
    box(X - 17, 4, Z - 0.8, X - 4, 16, Z + 0.8, M.metalDk), box(X - 17, 4, Z - 0.8, X - 13, 9, Z + 0.8, M.red),
    box(X + 4, 4, Z - 0.8, X + 17, 16, Z + 0.8, M.metalDk), box(X + 13, 4, Z - 0.8, X + 17, 9, Z + 0.8, M.red),
    // Navigation lights on the fin tips
    ball(X - 17, 6, Z, 0.8, M.red), ball(X + 17, 6, Z, 0.8, M.green),
  ];
  // ── Gondola: the armoured command car slung under the hull, its windows lit
  const gondola: Shape[] = [
    box(X - 4.5, Y - 12, Z - 19, X + 4.5, Y + 14, Z - 13, M.metal),
    box(X - 4.7, Y - 10, Z - 16.5, X + 4.7, Y + 12, Z - 15, M.glass),
    box(X - 3.5, Y + 14, Z - 18, X + 3.5, Y + 17, Z - 14, M.metalHi),
    box(X - 4.5, Y - 12, Z - 13.2, X + 4.5, Y + 14, Z - 12.4, M.metalDk),
    // Struts up to the hull
    ...[-9, 0, 9].flatMap((dy) => [box(X - 3.6, Y + dy - 0.5, Z - 13, X - 2.8, Y + dy + 0.5, Z - 9, M.metalDk), box(X + 2.8, Y + dy - 0.5, Z - 13, X + 3.6, Y + dy + 0.5, Z - 9, M.metalDk)]),
  ];
  // ── Engines: four nacelles on outrigger arms (props are separate parts so they spin)
  const ENGINES: [number, number][] = [[-1, Y + 16], [1, Y + 16], [-1, Y - 16], [1, Y - 16]];
  const nacelles: Shape[] = ENGINES.flatMap(([sx, y]) => [
    box(X + sx * 9, y - 0.8, Z - 7.5, X + sx * 16, y + 0.8, Z - 6.5, M.metalDk),
    ell(X + sx * 17.5, y, Z - 7, 2.4, 5.4, 2.4, M.metal),
    ell(X + sx * 17.5, y + 1.5, Z - 6, 1.4, 3, 1.2, M.metalHi),
  ]);
  const prop = (sx: number, y: number): Shape[] => [
    ball(X + sx * 17.5, y - 5.8, Z - 7, 1, M.metalHi),
    box(X + sx * 17.5 - 0.5, y - 6.3, Z - 12.5, X + sx * 17.5 + 0.5, y - 5.7, Z - 1.5, M.blade),
    box(X + sx * 17.5 - 5.5, y - 6.3, Z - 7.5, X + sx * 17.5 + 5.5, y - 5.7, Z - 6.5, M.blade),
  ];
  // ── Ordnance and drops
  const bayDoors: Shape[] = [box(X - 3.6, Y - 9, Z - 19.6, X + 3.6, Y - 1, Z - 19, M.band)];
  // Finned bombs, big enough to read at game scale
  const bombs: Shape[] = [0, 1, 2].flatMap((i) => [
    ell(X, Y - 8 + i * 3.5, Z - 22 - i * 2.5, 2, 2.8, 2, M.bomb),
    box(X - 2.2, Y - 11 + i * 3.5, Z - 22.6 - i * 2.5, X + 2.2, Y - 10.2 + i * 3.5, Z - 21.4 - i * 2.5, M.metalHi),
  ]);
  // Heavy wrecking anchor on a thick chain (the chain is long so it shows at every drop depth)
  const anchor: Shape[] = [
    ...Array.from({ length: 10 }, (_, i) => ball(X, Y + 8, Z - 19 - i * 1.6, 0.95, i % 2 ? M.chain : M.metalHi)),
    box(X - 1.1, Y + 6.9, Z - 37, X + 1.1, Y + 9.1, Z - 34, M.metalDk),
    box(X - 3, Y + 6.9, Z - 34.6, X + 3, Y + 9.1, Z - 33.6, M.metalHi),
    box(X - 6, Y + 6.6, Z - 39, X + 6, Y + 9.4, Z - 37, M.metalDk),
    box(X - 7, Y + 6.6, Z - 38, X - 5, Y + 9.4, Z - 34.5, M.metalHi), box(X + 5, Y + 6.6, Z - 38, X + 7, Y + 9.4, Z - 34.5, M.metalHi),
    ball(X, Y + 8, Z - 39.4, 1.2, M.red),
  ];
  const jumpLight: Shape[] = [ball(X, Y + 4, Z - 19.6, 0.9, M.red)];
  // Paratroopers under red-and-cream canopies
  const troopers: Shape[] = [0, 1, 2].flatMap((i) => {
    const tx = X + (i - 1) * 4, ty = Y + 4 - i * 3, tz = Z - 23 - i * 4;
    return [
      ell(tx, ty, tz + 3.4, 2.6, 2.6, 1.3, i % 2 ? M.para : M.red),
      box(tx - 0.5, ty - 0.5, tz - 1, tx + 0.5, ty + 0.5, tz + 1.4, M.band),
    ];
  });
  const beacon: Shape[] = [ball(X, Y + 4, Z + RZ + 0.6, 1, M.red)];
  const fire: Shape[] = [
    ell(X + 17.5, Y - 16, Z - 3, 3, 3.6, 4.2, M.fire), ball(X + 17.5, Y - 16, Z - 1, 2, M.fireHot),
    ell(X - 6, Y - 18, Z + 10, 4, 6, 3.6, M.fire), ball(X - 6, Y - 18, Z + 12, 2.2, M.fireHot),
    ell(X + 4, Y + 10, Z + 11, 2.6, 3.4, 2.4, M.fire),
  ];
  const smoke: Shape[] = [ball(X + 17, Y - 20, Z + 3, 3.6, M.smoke), ball(X - 6, Y - 22, Z + 16, 4.2, M.smoke), ball(X - 3, Y - 27, Z + 20, 3.2, M.smokeLight)];

  const parts: Part[] = [
    { name: 'frame', pivot: [X, Y, Z], shapes: [] },
    { name: 'body', parent: 'frame', pivot: [X, Y, Z], shapes: [...envelope, ...nacelles] },
    { name: 'legs', parent: 'frame', pivot: [X, Y, Z - 15], shapes: gondola },
    ...ENGINES.map(([sx, y], i) => ({ name: `prop${i}`, parent: 'frame', pivot: [X + sx * 17.5, y - 6, Z - 7] as [number, number, number], shapes: prop(sx, y) })),
    { name: 'bay', parent: 'frame', pivot: [X, Y - 5, Z - 19.3], shapes: bayDoors },
    { name: 'bombs', parent: 'frame', pivot: [X, Y - 5, Z - 22], shapes: bombs },
    { name: 'anchor', parent: 'frame', pivot: [X, Y + 8, Z - 20], shapes: anchor },
    { name: 'jump', parent: 'frame', pivot: [X, Y + 4, Z - 19.6], shapes: jumpLight },
    { name: 'troopers', parent: 'frame', pivot: [X, Y + 2, Z - 24], shapes: troopers },
    { name: 'beacon', parent: 'frame', pivot: [X, Y + 4, Z + RZ], shapes: beacon },
    { name: 'fire', parent: 'frame', pivot: [X, Y - 17, Z], shapes: fire },
    { name: 'smoke', parent: 'frame', pivot: [X, Y - 22, Z + 10], shapes: smoke },
    // 'head' and 'arms' exist so generated states have something to move; the authored states below win
    { name: 'head', parent: 'body', pivot: [X, Y + RY - 3, Z], shapes: [] },
    { name: 'arms', parent: 'body', pivot: [X, Y, Z], shapes: [] },
  ];

  const hidden = (...names: string[]): Pose => Object.fromEntries(names.map((n) => [n, { hidden: true }]));
  const BASE = hidden('anchor', 'jump', 'troopers', 'bombs', 'fire', 'smoke');
  /** Props spin a sixth of a turn per frame (two blades, so this reads as a smooth spin). */
  const props = (i: number, speed = 1): Pose => Object.fromEntries([0, 1, 2, 3].map((k) => [`prop${k}`, { roll: ((i * speed + k) * Math.PI) / 6 }]));
  const frames = (count: number, each: (i: number) => Pose): Pose[] =>
    Array.from({ length: count }, (_, i) => {
      const f = each(i);
      const pose: Pose = { ...BASE };
      for (const [k, v] of Object.entries(f)) pose[k] = { ...(BASE[k] ?? {}), ...v };
      return pose;
    });
  const bob = (i: number, n: number, amp = 0.6) => Math.sin((i / n) * Math.PI * 2) * amp;
  const blink = (i: number) => ({ beacon: { hidden: i % 3 === 2 } });

  const walk = frames(6, (i) => ({ ...props(i), ...blink(i), frame: { offset: [0, 0, bob(i, 6)], pitch: bob(i, 6, 0.02) } }));
  const idle = frames(4, (i) => ({ ...props(i, 0.7), ...blink(i), frame: { offset: [0, 0, bob(i, 4, 0.4)] } }));
  const run = frames(6, (i) => ({
    ...props(i), ...blink(i),
    bay: { hidden: true },
    jump: { hidden: i % 2 === 1 },
    troopers: { hidden: false, offset: [0, -i * 0.6, -i * 2.4] },
    frame: { offset: [0, 0, bob(i, 6)] },
  }));
  const attack = frames(6, (i) => ({
    ...props(i), ...blink(i),
    bay: { hidden: i > 0 && i < 5 },
    bombs: { hidden: i === 0 || i === 5, offset: [0, 0, -(i - 1) * 3.5] },
    frame: { offset: [0, 0, bob(i, 6)], pitch: i > 0 && i < 5 ? -0.03 : 0 },
  }));
  const ANCHOR_DROP = [0, -5, -11, -16, -19, -16, -10, -4];
  const skill = frames(8, (i) => ({
    ...props(i), ...blink(i),
    anchor: { hidden: i === 0, offset: [0, i === 4 ? 1.5 : 0, ANCHOR_DROP[i] + 12], roll: i === 4 ? 0.25 : i === 5 ? -0.2 : 0 },
    frame: { offset: [0, 0, bob(i, 8) - (i >= 3 && i <= 5 ? 0.8 : 0)] },
  }));
  const tired = frames(6, (i) => ({
    ...Object.fromEntries([0, 1, 2, 3].map((k) => [`prop${k}`, { roll: k === 3 ? (i % 3) * 0.2 : ((i * 0.6 + k) * Math.PI) / 6 }])),
    beacon: { hidden: i % 2 === 1 },
    fire: { hidden: false, scale: [1, 1, 0.8 + (i % 3) * 0.2] },
    smoke: { hidden: false, offset: [0, -i * 0.6, i * 1.2], scale: [1 + i * 0.08, 1 + i * 0.08, 1 + i * 0.08] },
    frame: { offset: [0, 0, bob(i, 6, 0.9) - 0.6], roll: bob(i, 6, 0.04), pitch: -0.03 },
  }));
  const hit = frames(3, (i) => ({ ...props(i), frame: { offset: [[0.8, -0.6, 0][i], 0, [0.4, -0.3, 0][i]], roll: [0.05, -0.04, 0][i] } }));
  const death = frames(10, (i) => {
    const k = i / 9;
    return {
      ...Object.fromEntries([0, 1, 2, 3].map((p) => [`prop${p}`, { roll: (p + i * 0.3) * 0.5 }])),
      fire: { hidden: false, scale: [1 + k * 1.4, 1 + k * 1.4, 1 + k * 1.8] },
      smoke: { hidden: false, offset: [0, -i, i * 1.5], scale: [1 + k, 1 + k, 1 + k] },
      body: { scale: [1, 1, 1 - k * 0.25] },
      frame: { pitch: -0.32 * k, roll: 0.12 * k, offset: [0, 0, -k * 10] },
    };
  });
  return {
    size: [40, 92, 54], foot: [X, Y, 0], pixelsPerVoxel: 0.85,
    materials: [
      { color: 0x9e2426 }, { color: 0xc43a34 }, { color: 0xe8705c }, { color: 0x5c161a }, { color: 0x461014 },
      { color: 0x34323a }, { color: 0xecb246 }, { color: 0x40464e }, { color: 0x808892 }, { color: 0x22262c },
      { color: 0xffd678, emissive: true }, { color: 0xff403a, emissive: true }, { color: 0x50e678, emissive: true },
      { color: 0x282c28 }, { color: 0x9696a0 }, { color: 0xfb8c32, emissive: true }, { color: 0xffec8c, emissive: true },
      { color: 0x5a5458 }, { color: 0xf1e3c8 }, { color: 0x1c1917 }, { color: 0x8a8486 },
    ],
    parts,
    animations: { walk, attack, idle, run, tired, skill, hit, death },
  };
};

export type AirshipSpriteKey = 'kirov';

export const AIRSHIP_MODELS: Record<AirshipSpriteKey, () => VoxelModel> = { kirov };
