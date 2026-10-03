import { useGameStore } from '../../state/useGameStore';
import { CASTLE_FOOTPRINT } from '../../state/buildingLayout';
import type { StructureTarget } from '../StructureManager';
import type { WorkerInstance } from '../WorkerManager';
import type { InvaderContext } from './context';
import type { ActiveInvader, InvaderBlocker, InvaderTarget } from './types';

/** Invaders only break off toward a defender or sapling this close (world px). */
const AGGRO_RADIUS = 110;

/** Fallback citadel target when no StructureManager is attached. */
const fallbackCastle = (ctx: InvaderContext): StructureTarget | undefined => {
  const store = useGameStore.getState();
  if (!store.castleBuilt && store.defense.castleHp <= 0) return undefined;
  const c = ctx.castleCenter();
  return { id: 'CASTLE', rect: CASTLE_FOOTPRINT, x: c.x, y: c.y };
};

const standingStructures = (ctx: InvaderContext): StructureTarget[] =>
  ctx.structures ? ctx.structures.getTargets() : [fallbackCastle(ctx)].filter(Boolean) as StructureTarget[];

export const isTargetValid = (ctx: InvaderContext, target: InvaderTarget | undefined): boolean => {
  if (!target) return false;
  if (target.kind === 'worker') {
    const w = target.worker;
    return w.hp > 0 && w.status === 'COMBAT' && !!w.container?.active;
  }
  if (target.kind === 'blocker') return !target.blocker.dead && target.blocker.container.active;
  const id = target.structure.id;
  return standingStructures(ctx).some((s) => s.id === id);
};

/** Lets a charmed invader attack another invader through the blocker interface. */
const asBlocker = (ctx: InvaderContext, victim: ActiveInvader): InvaderBlocker => ({
  container: victim.container,
  get hp() { return victim.hp; },
  get dead() { return victim.isDead; },
  takeHit: (damage: number) => ctx.damageInvader(victim, damage, '💘'),
});

/**
 * Provoked invaders, rushers and raiding scouts go for the citadel. Otherwise they fight whatever is
 * nearest: a defending minion or sapling that gets close, else the closest
 * standing structure (establishment or citadel).
 */
export const chooseTarget = (
  ctx: InvaderContext,
  invader: ActiveInvader,
  defenders: WorkerInstance[]
): InvaderTarget | undefined => {
  // Charmed: turns on the nearest fellow invader
  if ((invader.charmTimer ?? 0) > 0) {
    const victim = ctx.getInvaders()
      .filter((o) => o !== invader && !o.isDead && (o.emerge ?? 0) <= 0)
      .sort((a, b) => Math.hypot(a.container.x - invader.container.x, a.container.y - invader.container.y) -
        Math.hypot(b.container.x - invader.container.x, b.container.y - invader.container.y))[0];
    if (victim) return { kind: 'blocker', blocker: asBlocker(ctx, victim) };
  }
  // Taunted: must fight the Golem
  const taunter = invader.tauntBy;
  if ((invader.tauntTimer ?? 0) > 0 && taunter && taunter.hp > 0 && taunter.container?.active) {
    return { kind: 'worker', worker: taunter };
  }

  const structures = standingStructures(ctx);
  const castle = structures.find((s) => s.id === 'CASTLE');
  if (((invader.provokedTimer ?? 0) > 0 || invader.isRusher || invader.isScout) && castle) return { kind: 'structure', structure: castle };

  const x = invader.container.x;
  const y = invader.container.y;
  let best: InvaderTarget | undefined;
  let bestDist = AGGRO_RADIUS;
  for (const worker of defenders) {
    if (!worker.container?.active) continue;
    const d = Math.hypot(worker.container.x - x, worker.container.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = { kind: 'worker', worker };
    }
  }
  for (const blocker of ctx.getBlockers()) {
    if (blocker.dead || !blocker.container.active) continue;
    const d = Math.hypot(blocker.container.x - x, blocker.container.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = { kind: 'blocker', blocker };
    }
  }
  if (best) return best;

  let bestTiles = Infinity;
  let structure: StructureTarget | undefined;
  for (const s of structures) {
    const tiles = ctx.nav ? ctx.nav.distanceToRect(x, y, s.rect) : Math.hypot(s.x - x, s.y - y) / 40;
    // Slight bias toward the citadel so ties go to the main keep
    const score = tiles - (s.id === 'CASTLE' ? 0.5 : 0);
    if (score < bestTiles) {
      bestTiles = score;
      structure = s;
    }
  }
  return structure ? { kind: 'structure', structure } : undefined;
};
