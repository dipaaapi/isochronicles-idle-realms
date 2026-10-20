import { FrameOp, Pose, refineGeometry, refinePose, tweenPoses } from './VoxelSprite';
import type { StructureModel } from './structureModels';

/**
 * Turns a hand-authored structure model into the HD strip the game draws:
 * - DETAIL× finer voxels (high definition; drawn at 1/DETAIL scale, STRUCTURE_PIXEL),
 * - smoother loops (in-between frames tweened from the authored key poses),
 * - extra states derived from the model itself:
 *     build    — the building rising from its foundation in BUILD_STAGES steps (frame picked by progress)
 *     damaged  — idle loop with soot, cracks and flickering embers (below half HP)
 *     collapse — shakes, sinks and crumbles into the ruin (played once when it falls)
 */
export const DETAIL = 2;
export const BUILD_STAGES = 8;

const TWEEN_STEPS = 1;
const RUIN_NAMES = ['ruined', 'destroyed'];

export interface ExpandedStructure {
  model: StructureModel;
  animations: Record<string, Pose[]>;
  rates: Record<string, number>;
  loops: string[];
  ops: Record<string, Array<FrameOp | undefined>>;
}

export function expandStructure(source: StructureModel): ExpandedStructure {
  const model = refineGeometry(source, DETAIL);
  const animations: Record<string, Pose[]> = {};
  const rates: Record<string, number> = { ...source.rates };
  const loops = [...source.loops];
  const ops: ExpandedStructure['ops'] = {};

  for (const [name, poses] of Object.entries(source.animations)) {
    const refined = poses.map((p) => refinePose(p, DETAIL));
    const smooth = refined.length > 1 && !RUIN_NAMES.includes(name);
    animations[name] = smooth ? tweenPoses(refined, TWEEN_STEPS, loops.includes(name)) : refined;
    if (smooth) rates[name] = (rates[name] ?? 4) * (TWEEN_STEPS + 1);
  }

  const idle = animations.idle;
  if (!idle?.length) return { model, animations, rates, loops, ops };
  const rest = idle[0];

  // Construction: the finished building revealed bottom-up, roof last
  animations.build = Array.from({ length: BUILD_STAGES }, () => rest);
  ops.build = Array.from({ length: BUILD_STAGES }, (_, i) => ({ clipZ: 0.12 + (0.88 * (i + 1)) / BUILD_STAGES }));
  rates.build = 1;

  // Damaged: the idle loop, scorched (embers flicker frame to frame)
  animations.damaged = idle;
  ops.damaged = idle.map(() => ({ scorch: 0.55 }));
  rates.damaged = rates.idle ?? 4;
  loops.push('damaged');

  // Collapse: sways, then sinks into rubble and ends on the ruin pose
  const ruinName = RUIN_NAMES.find((n) => animations[n]);
  const ruin = ruinName ? animations[ruinName][0] : undefined;
  const sway = (dx: number, sink: number): Pose => {
    const out: Pose = {};
    for (const part of model.parts.filter((p) => !p.parent)) {
      const base = rest[part.name] ?? {};
      const o = base.offset ?? [0, 0, 0];
      out[part.name] = { ...base, offset: [o[0] + dx, o[1] - dx * 0.5, o[2] - sink] };
    }
    for (const [name, p] of Object.entries(rest)) out[name] ??= p;
    return out;
  };
  const shake = [1.5, -1.5, 1, -1].map((d) => d * DETAIL);
  const collapse: Pose[] = shake.map((d, i) => sway(d, i * 0.4 * DETAIL));
  const collapseOps: FrameOp[] = shake.map((_, i) => ({ scorch: 0.4 + i * 0.1 }));
  for (let i = 0; i < 4; i++) {
    collapse.push(sway(i % 2 ? -0.6 * DETAIL : 0.6 * DETAIL, (2 + i * 2) * DETAIL));
    collapseOps.push({ clipZ: 0.85 - i * 0.17, scorch: 0.8 });
  }
  if (ruin) { collapse.push(ruin); collapseOps.push({ scorch: 0.5 }); }
  animations.collapse = collapse;
  ops.collapse = collapseOps;
  rates.collapse = 10;

  return { model, animations, rates, loops, ops };
}
