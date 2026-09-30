/**
 * VoxelSprite — renders jointed voxel models into 8-direction pixel-art frames.
 *
 * Characters are authored as small voxel figures (boxes / ellipsoids /
 * cylinders grouped into parts with pivots). Each animation frame poses the
 * parts, voxelises them, then ray-casts the grid from 8 isometric camera
 * angles (2:1 dimetric, 30° elevation) with banded face lighting and a
 * coloured outline. Pure and DOM-free so it can be previewed offline.
 *
 * Model space: +x = character's right, +y = forward (facing), +z = up.
 */

export type Vec3 = [number, number, number];

export interface Material {
  color: number;
  /** Unlit (always full brightness) — eyes, visors, energy cores, muzzle flashes. */
  emissive?: boolean;
}

export type Shape =
  | { kind: 'box'; min: Vec3; max: Vec3; mat: number }
  | { kind: 'ellipsoid'; center: Vec3; radii: Vec3; mat: number }
  | { kind: 'cylinder'; center: Vec3; radius: number; height: number; mat: number };

export interface Part {
  name: string;
  parent?: string;
  /** Joint position in model space (rest pose). */
  pivot: Vec3;
  shapes: Shape[];
}

export interface PartPose {
  /** Rotation about +x — positive swings a hanging limb forward. */
  pitch?: number;
  /** Rotation about +y (lean sideways). */
  roll?: number;
  /** Rotation about +z (turn). */
  yaw?: number;
  offset?: Vec3;
  /** Per-axis scale about the pivot (squash & stretch, pulsing orbs). */
  scale?: Vec3;
  hidden?: boolean;
}

export type Pose = Record<string, PartPose>;

export type AnimationName = 'walk' | 'attack' | 'idle';

export interface VoxelModel {
  /** Grid size in voxels [x, y, z]. */
  size: Vec3;
  /** Ground contact point (feet centre) in model space. */
  foot: Vec3;
  materials: Material[];
  parts: Part[];
  animations: Record<AnimationName, Pose[]>;
  /** Sprite pixels per voxel (default 1). */
  pixelsPerVoxel?: number;
}

/** A model's shape without its animation table (structures carry their own named animations). */
export type VoxelGeometry = Omit<VoxelModel, 'animations'>;

export const DIRECTION_COUNT = 8;
export const ANIMATION_ORDER: AnimationName[] = ['walk', 'attack', 'idle'];

const ELEVATION = Math.PI / 6; // 30° → ground squares project exactly 2:1

// ── Math helpers ─────────────────────────────────────────────────────────────

type Mat3 = number[]; // row-major 3x3
interface Transform { m: Mat3; t: Vec3 }

const mulMat = (a: Mat3, b: Mat3): Mat3 => {
  const r = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return r;
};
const mulVec = (m: Mat3, v: Vec3): Vec3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a: Vec3): Vec3 => scale(a, 1 / Math.hypot(a[0], a[1], a[2]));
const invert = (m: Mat3): Mat3 => {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det,
  ];
};

const rotation = (pitch: number, roll: number, yaw: number): Mat3 => {
  const cx = Math.cos(pitch), sx = Math.sin(pitch);
  const cy = Math.cos(roll), sy = Math.sin(roll);
  const cz = Math.cos(yaw), sz = Math.sin(yaw);
  const rx: Mat3 = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const ry: Mat3 = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const rz: Mat3 = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return mulMat(rz, mulMat(ry, rx));
};

const compose = (a: Transform, b: Transform): Transform => ({
  m: mulMat(a.m, b.m),
  t: add(mulVec(a.m, b.t), a.t),
});

const apply = (tr: Transform, p: Vec3): Vec3 => add(mulVec(tr.m, p), tr.t);

// ── Voxelisation ─────────────────────────────────────────────────────────────

const inShape = (s: Shape, p: Vec3): boolean => {
  switch (s.kind) {
    case 'box':
      return p[0] >= s.min[0] && p[0] < s.max[0] && p[1] >= s.min[1] && p[1] < s.max[1] && p[2] >= s.min[2] && p[2] < s.max[2];
    case 'ellipsoid': {
      const dx = (p[0] - s.center[0]) / s.radii[0];
      const dy = (p[1] - s.center[1]) / s.radii[1];
      const dz = (p[2] - s.center[2]) / s.radii[2];
      return dx * dx + dy * dy + dz * dz <= 1;
    }
    case 'cylinder': {
      const dx = p[0] - s.center[0];
      const dy = p[1] - s.center[1];
      return p[2] >= s.center[2] && p[2] < s.center[2] + s.height && dx * dx + dy * dy <= s.radius * s.radius;
    }
  }
};

const shapeBounds = (s: Shape): [Vec3, Vec3] => {
  switch (s.kind) {
    case 'box':
      return [s.min, s.max];
    case 'ellipsoid':
      return [sub(s.center, s.radii), add(s.center, s.radii)];
    case 'cylinder':
      return [
        [s.center[0] - s.radius, s.center[1] - s.radius, s.center[2]],
        [s.center[0] + s.radius, s.center[1] + s.radius, s.center[2] + s.height],
      ];
  }
};

/** Poses the model and fills a voxel grid (value = material index + 1, 0 = empty). */
export function voxelize(model: VoxelGeometry, pose: Pose): Uint8Array {
  const [W, D, H] = model.size;
  const grid = new Uint8Array(W * D * H);
  const transforms = new Map<string, Transform>();

  const partTransform = (part: Part): Transform => {
    const cached = transforms.get(part.name);
    if (cached) return cached;
    const p = pose[part.name] ?? {};
    const [sx, sy, sz] = p.scale ?? [1, 1, 1];
    const r = mulMat(rotation(p.pitch ?? 0, p.roll ?? 0, p.yaw ?? 0), [sx, 0, 0, 0, sy, 0, 0, 0, sz]);
    const offset = p.offset ?? [0, 0, 0];
    // local = T(pivot + offset) · R · S · T(-pivot)
    const local: Transform = { m: r, t: add(sub(part.pivot, mulVec(r, part.pivot)), offset) };
    const parent = part.parent ? model.parts.find((q) => q.name === part.parent) : undefined;
    const tr = parent ? compose(partTransform(parent), local) : local;
    transforms.set(part.name, tr);
    return tr;
  };

  const isHidden = (part: Part): boolean => {
    if (pose[part.name]?.hidden) return true;
    const parent = part.parent ? model.parts.find((q) => q.name === part.parent) : undefined;
    return parent ? isHidden(parent) : false;
  };

  for (const part of model.parts) {
    if (isHidden(part)) continue;
    const tr = partTransform(part);
    const inv: Mat3 = invert(tr.m);

    for (const shape of part.shapes) {
      // Posed AABB from the 8 rest-pose corners
      const [lo, hi] = shapeBounds(shape);
      const min: Vec3 = [Infinity, Infinity, Infinity];
      const max: Vec3 = [-Infinity, -Infinity, -Infinity];
      for (let c = 0; c < 8; c++) {
        const corner: Vec3 = [c & 1 ? hi[0] : lo[0], c & 2 ? hi[1] : lo[1], c & 4 ? hi[2] : lo[2]];
        const w = apply(tr, corner);
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], w[k]);
          max[k] = Math.max(max[k], w[k]);
        }
      }
      const x0 = Math.max(0, Math.floor(min[0])), x1 = Math.min(W - 1, Math.ceil(max[0]));
      const y0 = Math.max(0, Math.floor(min[1])), y1 = Math.min(D - 1, Math.ceil(max[1]));
      const z0 = Math.max(0, Math.floor(min[2])), z1 = Math.min(H - 1, Math.ceil(max[2]));

      for (let z = z0; z <= z1; z++) {
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            // Inverse-map the voxel centre into rest space (no holes when limbs rotate)
            const rest = mulVec(inv, sub([x + 0.5, y + 0.5, z + 0.5], tr.t));
            if (inShape(shape, rest)) grid[(z * D + y) * W + x] = shape.mat + 1;
          }
        }
      }
    }
  }
  return grid;
}

// ── Camera ───────────────────────────────────────────────────────────────────

interface Camera { right: Vec3; up: Vec3; forward: Vec3 }

/** Direction 0 faces the viewer (screen-down); directions step 45° clockwise on screen. */
const cameraFor = (direction: number): Camera => {
  const a = (-direction * Math.PI) / 4;
  const back: Vec3 = [Math.sin(a), Math.cos(a), 0];
  const forward: Vec3 = normalize([-back[0] * Math.cos(ELEVATION), -back[1] * Math.cos(ELEVATION), -Math.sin(ELEVATION)]);
  const right = normalize(cross(forward, [0, 0, 1]));
  const up = cross(right, forward);
  return { right, up, forward };
};

/**
 * Screen-space unit vector (x right, y down) a character in `direction` faces.
 * Used at runtime to pick the frame row matching a movement vector.
 */
export const DIRECTION_VECTORS: Array<{ x: number; y: number }> = Array.from({ length: DIRECTION_COUNT }, (_, d) => {
  const cam = cameraFor(d);
  const fwd: Vec3 = [0, 1, 0];
  const x = dot(fwd, cam.right);
  const y = -dot(fwd, cam.up);
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
});

/** Best frame row for a screen-space movement vector. */
export function directionFromVector(dx: number, dy: number, fallback: number = 0): number {
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return fallback;
  let best = fallback;
  let bestDot = -Infinity;
  const len = Math.hypot(dx, dy);
  for (let d = 0; d < DIRECTION_COUNT; d++) {
    const v = DIRECTION_VECTORS[d];
    const score = (v.x * dx + v.y * dy) / len;
    if (score > bestDot) {
      bestDot = score;
      best = d;
    }
  }
  return best;
}

// ── Sheet layout ─────────────────────────────────────────────────────────────

export interface FrameLayout {
  frameWidth: number;
  frameHeight: number;
  /** Foot position inside each frame (pixels). */
  anchorX: number;
  anchorY: number;
}

export interface SheetLayout extends FrameLayout {
  columns: number; // total frames per direction
  animations: Record<AnimationName, { start: number; count: number }>;
}

/** Frame size / foot anchor that fits the model's bounding box as seen from `directions`. */
function frameBounds(model: VoxelGeometry, directions: number[]): FrameLayout {
  const ppv = model.pixelsPerVoxel ?? 1;
  const [W, D, H] = model.size;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const d of directions) {
    const cam = cameraFor(d);
    for (let c = 0; c < 8; c++) {
      const corner: Vec3 = [c & 1 ? W : 0, c & 2 ? D : 0, c & 4 ? H : 0];
      const rel = sub(corner, model.foot);
      const sx = dot(rel, cam.right) * ppv;
      const sy = -dot(rel, cam.up) * ppv;
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
    }
  }
  // Symmetric width keeps the foot centred horizontally; +1px border for outlines
  const halfW = Math.ceil(Math.max(-minX, maxX)) + 1;
  return {
    frameWidth: halfW * 2,
    frameHeight: Math.ceil(maxY - minY) + 2,
    anchorX: halfW,
    anchorY: Math.ceil(-minY) + 1,
  };
}

export function sheetLayout(model: VoxelModel): SheetLayout {
  const animations = {} as SheetLayout['animations'];
  let start = 0;
  for (const name of ANIMATION_ORDER) {
    animations[name] = { start, count: model.animations[name].length };
    start += model.animations[name].length;
  }
  return {
    ...frameBounds(model, Array.from({ length: DIRECTION_COUNT }, (_, d) => d)),
    columns: start,
    animations,
  };
}

// ── Ray-cast renderer ────────────────────────────────────────────────────────

const shadeColor = (c: number, f: number): number => {
  const r = Math.max(0, Math.min(255, Math.round(((c >> 16) & 0xff) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((c >> 8) & 0xff) * f)));
  const b = Math.max(0, Math.min(255, Math.round((c & 0xff) * f)));
  return (r << 16) | (g << 8) | b;
};

/**
 * Renders one posed grid from one direction into `out` (RGBA, stride = out.width)
 * at pixel offset (ox, oy).
 */
function renderView(
  model: VoxelGeometry,
  grid: Uint8Array,
  direction: number,
  layout: FrameLayout,
  out: { data: Uint8ClampedArray; width: number },
  ox: number,
  oy: number
): void {
  const [W, D, H] = model.size;
  const ppv = model.pixelsPerVoxel ?? 1;
  const cam = cameraFor(direction);
  const fw = layout.frameWidth;
  const fh = layout.frameHeight;
  // Light from the viewer's upper-left
  const light = normalize(add(add(scale(cam.right, -0.55), scale(cam.up, 0.75)), scale(cam.forward, -0.45)));

  const colors = new Int32Array(fw * fh).fill(-1);
  const depths = new Float32Array(fw * fh).fill(Infinity);
  const far = W + D + H;

  for (let j = 0; j < fh; j++) {
    for (let i = 0; i < fw; i++) {
      const u = (i + 0.5 - layout.anchorX) / ppv;
      const v = (layout.anchorY - (j + 0.5)) / ppv;
      const origin = add(add(add(model.foot, scale(cam.right, u)), scale(cam.up, v)), scale(cam.forward, -far));
      const dir = cam.forward;

      // Slab intersection with the grid bounds
      let tMin = 0, tMax = Infinity;
      const bounds: Vec3 = [W, D, H];
      let hit = true;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(dir[k]) < 1e-9) {
          if (origin[k] < 0 || origin[k] >= bounds[k]) { hit = false; break; }
        } else {
          let t0 = (0 - origin[k]) / dir[k];
          let t1 = (bounds[k] - origin[k]) / dir[k];
          if (t0 > t1) [t0, t1] = [t1, t0];
          tMin = Math.max(tMin, t0);
          tMax = Math.min(tMax, t1);
        }
      }
      if (!hit || tMin >= tMax) continue;

      // Amanatides–Woo DDA
      const start = add(origin, scale(dir, tMin + 1e-4));
      const cell: Vec3 = [Math.floor(start[0]), Math.floor(start[1]), Math.floor(start[2])];
      const step: Vec3 = [Math.sign(dir[0]), Math.sign(dir[1]), Math.sign(dir[2])];
      const tDelta: Vec3 = [Math.abs(1 / dir[0]), Math.abs(1 / dir[1]), Math.abs(1 / dir[2])];
      const tNext: Vec3 = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        const boundary = step[k] > 0 ? cell[k] + 1 : cell[k];
        tNext[k] = step[k] === 0 ? Infinity : tMin + (boundary - start[k]) / dir[k];
      }
      let axis = 2;
      let t = tMin;

      while (t <= tMax + 1e-6) {
        const [cx, cy, cz] = cell;
        if (cx < 0 || cy < 0 || cz < 0 || cx >= W || cy >= D || cz >= H) break;
        const value = grid[(cz * D + cy) * W + cx];
        if (value) {
          const mat = model.materials[value - 1];
          const normal: Vec3 = [0, 0, 0];
          normal[axis] = -step[axis];
          let color = mat.color;
          if (!mat.emissive) {
            const lambert = Math.max(0, dot(normal, light));
            // Three pixel-art light bands
            const band = lambert > 0.6 ? 1.12 : lambert > 0.25 ? 0.92 : 0.7;
            color = shadeColor(color, band);
          }
          colors[j * fw + i] = color;
          depths[j * fw + i] = t;
          break;
        }
        if (tNext[0] < tNext[1] && tNext[0] < tNext[2]) axis = 0;
        else if (tNext[1] < tNext[2]) axis = 1;
        else axis = 2;
        t = tNext[axis];
        cell[axis] += step[axis];
        tNext[axis] += tDelta[axis];
      }
    }
  }

  // Post-pass: inner edge darkening + coloured silhouette outline
  const put = (i: number, j: number, color: number) => {
    const idx = ((oy + j) * out.width + (ox + i)) * 4;
    out.data[idx] = (color >> 16) & 0xff;
    out.data[idx + 1] = (color >> 8) & 0xff;
    out.data[idx + 2] = color & 0xff;
    out.data[idx + 3] = 255;
  };
  const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let j = 0; j < fh; j++) {
    for (let i = 0; i < fw; i++) {
      const k = j * fw + i;
      if (colors[k] >= 0) {
        let color = colors[k];
        for (const [di, dj] of neighbours) {
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= fw || nj >= fh) continue;
          const nk = nj * fw + ni;
          if (colors[nk] >= 0 && depths[nk] < depths[k] - 2.5) {
            color = shadeColor(color, 0.72);
            break;
          }
        }
        put(i, j, color);
      } else {
        let edge = -1;
        for (const [di, dj] of neighbours) {
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= fw || nj >= fh) continue;
          const nk = nj * fw + ni;
          if (colors[nk] >= 0) { edge = colors[nk]; break; }
        }
        if (edge >= 0) put(i, j, shadeColor(edge, 0.28));
      }
    }
  }
}

/**
 * Renders the full sprite sheet: rows = 8 directions, columns = every
 * animation frame in ANIMATION_ORDER.
 */
export function renderSheet(model: VoxelModel): { layout: SheetLayout; width: number; height: number; data: Uint8ClampedArray } {
  const layout = sheetLayout(model);
  const width = layout.frameWidth * layout.columns;
  const height = layout.frameHeight * DIRECTION_COUNT;
  const data = new Uint8ClampedArray(width * height * 4);
  const out = { data, width };

  for (const name of ANIMATION_ORDER) {
    const { start } = layout.animations[name];
    model.animations[name].forEach((pose, f) => {
      const grid = voxelize(model, pose);
      for (let d = 0; d < DIRECTION_COUNT; d++) {
        renderView(model, grid, d, layout, out, (start + f) * layout.frameWidth, d * layout.frameHeight);
      }
    });
  }
  return { layout, width, height, data };
}

// ── Single-direction strips (structures) ─────────────────────────────────────

/**
 * Direction whose camera lines the model's axes up with the island's tiles:
 * model +y runs along grid +x (screen right-down) and model +x along grid +y
 * (screen left-down), so a model W×D voxels wide covers tiles exactly.
 */
export const STRUCTURE_DIRECTION = 7;

export interface StripLayout extends FrameLayout {
  columns: number;
  animations: Record<string, { start: number; count: number }>;
}

/**
 * Renders every frame of every named animation from one direction into a
 * single-row strip (used for buildings and portals, which never turn).
 */
export function renderStrip(
  model: VoxelGeometry,
  animations: Record<string, Pose[]>,
  direction: number = STRUCTURE_DIRECTION
): { layout: StripLayout; width: number; height: number; data: Uint8ClampedArray } {
  const frame = frameBounds(model, [direction]);
  const table: StripLayout['animations'] = {};
  let columns = 0;
  for (const [name, poses] of Object.entries(animations)) {
    table[name] = { start: columns, count: poses.length };
    columns += poses.length;
  }
  const layout: StripLayout = { ...frame, columns, animations: table };
  const width = frame.frameWidth * columns;
  const height = frame.frameHeight;
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [name, poses] of Object.entries(animations)) {
    poses.forEach((pose, f) => {
      renderView(model, voxelize(model, pose), direction, frame, { data, width }, (table[name].start + f) * frame.frameWidth, 0);
    });
  }
  return { layout, width, height, data };
}

// ── Variants ─────────────────────────────────────────────────────────────────

const mixChannel = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
const mixColor = (from: number, to: number, t: number): number =>
  (mixChannel(from >> 16, to >> 16, t) << 16) |
  (mixChannel((from >> 8) & 0xff, (to >> 8) & 0xff, t) << 8) |
  mixChannel(from & 0xff, to & 0xff, t);

/**
 * A recoloured copy of a model: every lit material is blended toward `tint`
 * (keeping its light/dark shading) and emissive materials take `glow`. Used to
 * give related characters their own look without a new voxel model.
 */
export function recolorModel<T extends VoxelGeometry>(model: T, tint: number, glow: number, amount = 0.6, scale = 1): T {
  return {
    ...model,
    materials: model.materials.map((m) => ({ ...m, color: m.emissive ? glow : mixColor(m.color, tint, amount) })),
    pixelsPerVoxel: (model.pixelsPerVoxel ?? 1) * scale,
  };
}
