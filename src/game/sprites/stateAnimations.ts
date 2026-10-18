import type { Part, PartPose, Pose, StateAnimation, Vec3, VoxelModel } from './VoxelSprite';
import TUNING from '../../data/stateAnimations.json';

/**
 * State animations for the Generals (run, fatigued walk, skill cast, flinch,
 * death), built like a blockout: each state is a short list of key poses
 * applied to the model's *rig* (body, head, limbs) rather than its details, so
 * every model gets motion that reads at a glance. Preview them with
 * `model-tool.mjs render <key> --anim run --blockout` (each part in one flat
 * colour) before checking the detailed render.
 *
 * Hand-authored poses win: a model that already defines an animation keeps it.
 * Angles live in src/data/stateAnimations.json.
 */

type Rig = { body: string[]; legs: string[]; arms: string[]; wings: string[]; head?: string };

const LIMB = /(Leg|Tentacle)$/;
const ARM = /Arm$/;
const WING = /Wing$/;

/** Sorts the parts into rig roles by name and hierarchy. */
function rigOf(parts: Part[]): Rig {
  const roots = parts.filter((p) => !p.parent);
  return {
    // Everything rooted that isn't a leg carries the upper body (torso, robe, shroud…)
    body: roots.filter((p) => !LIMB.test(p.name)).map((p) => p.name),
    legs: parts.filter((p) => LIMB.test(p.name)).map((p) => p.name),
    arms: parts.filter((p) => ARM.test(p.name)).map((p) => p.name),
    wings: parts.filter((p) => WING.test(p.name)).map((p) => p.name),
    head: parts.find((p) => p.name === 'head')?.name,
  };
}

const addV = (a: Vec3 | undefined, b: Vec3 | undefined): Vec3 | undefined =>
  a || b ? [(a?.[0] ?? 0) + (b?.[0] ?? 0), (a?.[1] ?? 0) + (b?.[1] ?? 0), (a?.[2] ?? 0) + (b?.[2] ?? 0)] : undefined;
const mulV = (a: Vec3 | undefined, b: Vec3 | undefined): Vec3 | undefined =>
  a || b ? [(a?.[0] ?? 1) * (b?.[0] ?? 1), (a?.[1] ?? 1) * (b?.[1] ?? 1), (a?.[2] ?? 1) * (b?.[2] ?? 1)] : undefined;

/** Layers `extra` on top of a part pose: angles and offsets add, scales multiply. */
function layer(base: PartPose | undefined, extra: PartPose): PartPose {
  const b = base ?? {};
  return {
    ...b,
    pitch: (b.pitch ?? 0) + (extra.pitch ?? 0),
    roll: (b.roll ?? 0) + (extra.roll ?? 0),
    yaw: (b.yaw ?? 0) + (extra.yaw ?? 0),
    offset: addV(b.offset, extra.offset),
    scale: mulV(b.scale, extra.scale),
  };
}

/** A key pose for the rig; each role is layered over every part in it. */
interface RigKey { body?: PartPose; legs?: PartPose; arms?: PartPose; wings?: PartPose; head?: PartPose; all?: PartPose }

function applyKey(rig: Rig, base: Pose, key: RigKey): Pose {
  const pose: Pose = { ...base };
  const put = (names: string[], extra?: PartPose) => {
    if (extra) for (const n of names) pose[n] = layer(pose[n], extra);
  };
  // Legs are roots too, so whole-body moves (sinking, hopping) go through `all`
  put([...rig.body, ...rig.legs], key.all);
  put(rig.body, key.body);
  put(rig.legs, key.legs);
  put(rig.arms, key.arms);
  put(rig.wings, key.wings);
  if (rig.head) put([rig.head], key.head);
  return pose;
}

/** Scales the limb swing of a gait pose (bigger strides for running, small shuffles when tired). */
function swing(rig: Rig, pose: Pose, factor: number): Pose {
  const out: Pose = { ...pose };
  for (const n of [...rig.legs, ...rig.arms, ...rig.wings]) {
    const p = pose[n];
    if (p) out[n] = { ...p, pitch: (p.pitch ?? 0) * factor, roll: (p.roll ?? 0) * factor };
  }
  return out;
}

const T = TUNING;

function buildStates(model: VoxelModel): Record<StateAnimation, Pose[]> {
  const rig = rigOf(model.parts);
  const { walk, attack, idle } = model.animations;
  const rest = idle[0] ?? {};

  // Run: wider strides, forward lean, airborne on the passing frames
  const run = walk.map((pose, f) =>
    applyKey(rig, swing(rig, pose, T.run.swing), {
      body: { pitch: -T.run.lean },
      head: { pitch: T.run.lean * 0.5 },
      all: { offset: [0, 0, f % 2 === 1 ? T.run.hop : 0] },
    })
  );

  // Fatigued: dragging shuffle, hunched back, head and arms hanging
  const tired = walk.map((pose, f) =>
    applyKey(rig, swing(rig, pose, T.tired.swing), {
      body: { pitch: -T.tired.hunch, offset: [0, 0, -T.tired.sag] },
      head: { pitch: -T.tired.droop + (f % 2) * 0.08 },
      wings: { pitch: -0.3 },
    })
  );

  // Skill: anticipation squash → arms raised, stretched tall → the attack release
  const charge = applyKey(rig, rest, {
    body: { scale: [1.06, 1.06, 0.9], pitch: T.skill.windup },
    arms: { pitch: -0.5 },
    head: { pitch: 0.15 },
  });
  const raise = applyKey(rig, rest, {
    body: { scale: [0.96, 0.96, 1.08], pitch: -T.skill.windup * 0.5 },
    all: { offset: [0, 0, 1] },
    arms: { pitch: T.skill.raise },
    wings: { pitch: 0.6 },
    head: { pitch: 0.25 },
  });
  const skill = [charge, raise, raise, ...attack, attack[attack.length - 1] ?? rest];

  // Hit: recoil back hard, then settle
  const recoil = (k: number) =>
    applyKey(rig, rest, {
      body: { pitch: T.hit.recoil * k, offset: [0, -T.hit.knockback * k, 0], scale: [1 + 0.06 * k, 1 + 0.06 * k, 1 - 0.08 * k] },
      head: { pitch: T.hit.recoil * 0.8 * k },
      arms: { pitch: -0.6 * k },
    });
  const hit = [recoil(1), recoil(0.5), rest];

  // Death: stagger back, knees buckle, slump forward and sink into the ground
  const death = T.death.keys.map((k) =>
    applyKey(rig, rest, {
      body: { pitch: k.pitch, roll: k.roll },
      head: { pitch: k.head },
      legs: { scale: [1, 1, k.legs] },
      arms: { pitch: k.arms },
      wings: { pitch: -k.legs },
      all: { offset: [0, 0, -k.sink] },
    })
  );

  return { run, tired, skill, hit, death };
}

/** A copy of the model with every missing state animation filled in. */
export function withStateAnimations(make: () => VoxelModel): () => VoxelModel {
  return () => {
    const model = make();
    const states = buildStates(model);
    return { ...model, animations: { ...states, ...model.animations } };
  };
}
