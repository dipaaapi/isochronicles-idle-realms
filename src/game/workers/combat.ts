import { soundFx } from '../audio/soundFx';
import type { ActiveInvader } from '../InvasionManager';
import type { PortalState } from '../PortalManager';
import { CRITICAL_HP, type WorkerContext, type WorkerFrame, type WorkerInstance } from './types';

const warnCriticallyWounded = (ctx: WorkerContext, worker: WorkerInstance) => {
  worker.overrideEmote = '🩹';
  worker.overrideEmoteTimer = 2500;
  ctx.spawnFloatingPopup(worker.container.x, worker.container.y - 35, 'Critically Wounded! 🛡️', '#f59e0b');
  worker.status = 'IDLE';
  worker.stateTimer = 1000;
};

/**
 * Invasion mobilization: fighters rally into COMBAT while invaders or portals
 * remain; critically wounded ones stand down and wait for healing.
 */
export function rallyForInvasion(ctx: WorkerContext, worker: WorkerInstance, frame: WorkerFrame, isFighter: boolean): void {
  const portalsOpen = (ctx.portals?.getOpen().length ?? 0) > 0;
  if (!frame.isInvasionActive || (frame.aliveInvaders.length === 0 && !portalsOpen) || !isFighter) return;

  if (worker.hp < CRITICAL_HP) {
    if (worker.status !== 'IDLE') warnCriticallyWounded(ctx, worker);
  } else if (worker.status !== 'COMBAT') {
    // Golem and unit rally to defend the realm!
    worker.status = 'COMBAT';
    worker.overrideEmote = '⚔️';
    worker.overrideEmoteTimer = 2000;
    worker.cargoIcon.setVisible(false);
    ctx.spawnFloatingPopup(worker.container.x, worker.container.y - 35, 'Defending Realm! ⚔️', '#38bdf8');
    soundFx.playGolemCheer();
  }
}

/**
 * Healer override (Necromancer, HEAL-assigned minions): walk to and heal the most
 * wounded ally (or self). Returns true when it took over this frame.
 */
export function updateHealer(ctx: WorkerContext, worker: WorkerInstance, frame: WorkerFrame): boolean {
  let target: WorkerInstance | null = null;
  let lowestHpRatio = 1.0;
  for (const ally of ctx.getWorkers()) {
    const ratio = ally.hp / ally.maxHp;
    if (ratio < lowestHpRatio) {
      lowestHpRatio = ratio;
      target = ally;
    }
  }
  if (!target && worker.hp < worker.maxHp) target = worker;

  if (!target) {
    // No one to heal, fall back to normal FSM (IDLE or harvest if forced)
    if (worker.status === 'HEALING') {
      worker.status = 'IDLE';
      worker.stateTimer = 500;
    }
    return false;
  }

  const dist = Math.hypot(target.container.x - worker.container.x, target.container.y - worker.container.y);
  if (dist > 60 && target !== worker) {
    worker.status = 'MOVING_TO_NODE';
    ctx.moveToward(worker, target.container.x, target.container.y, frame.effectiveSpeed * 1.35 * frame.deltaSec, frame.deltaSec);
    worker.overrideEmote = '💚';
    worker.overrideEmoteTimer = 500;
    return true;
  }

  // In range! Heal!
  worker.status = 'HEALING';
  worker.overrideEmote = '✨';
  worker.overrideEmoteTimer = 1000;
  worker.combatCooldown -= frame.deltaSec;
  if (worker.combatCooldown <= 0) {
    worker.combatCooldown = 1.0; // 1 heal per second
    ctx.playMinionAttack(worker, target.container.x, target.container.y);
    const healAmt = frame.effectiveAttack * 1.5;
    target.hp = Math.min(target.maxHp, target.hp + healAmt);
    ctx.spawnHarvestBurst(target.container.x, target.container.y - 20, 0x22c55e, 5);
    ctx.spawnFloatingPopup(target.container.x, target.container.y - 45, `+${Math.floor(healAmt)} HP`, '#22c55e');
    soundFx.playHarvest('crystal'); // Fallback heal sound
  }
  return true;
}

/** Closest invader that has fully emerged from its rift. */
function nearestInvader(worker: WorkerInstance, invaders: ActiveInvader[]) {
  let target: ActiveInvader | null = null;
  let distance = Infinity;
  for (const inv of invaders) {
    if ((inv.emerge ?? 0) > 0 || !inv.container?.active) continue;
    const d = Math.hypot(inv.container.x - worker.container.x, inv.container.y - worker.container.y);
    if (d < distance) {
      distance = d;
      target = inv;
    }
  }
  return { target, distance };
}

/** COMBAT state: hunt the nearest invader, or storm the nearest portal when none are close. */
export function updateCombat(ctx: WorkerContext, worker: WorkerInstance, frame: WorkerFrame): void {
  const { config, deltaSec, effectiveSpeed, effectiveAttack } = frame;
  const openPortals = ctx.portals?.getOpen() ?? [];
  if (!frame.isInvasionActive || (frame.aliveInvaders.length === 0 && openPortals.length === 0)) {
    // Threat eliminated: celebrate and return to peaceful routine
    worker.status = 'IDLE';
    worker.stateTimer = 400;
    worker.overrideEmote = '✨';
    worker.overrideEmoteTimer = 2000;
    ctx.spawnFloatingPopup(worker.container.x, worker.container.y - 32, 'Incursion Repelled! 🛡️', '#34d399');
    return;
  }

  if (worker.hp < CRITICAL_HP) {
    warnCriticallyWounded(ctx, worker); // Wounded in melee: retreat
    return;
  }

  const { target: targetInvader, distance: invaderDistance } = nearestInvader(worker, frame.aliveInvaders);

  // Nothing close by: storm the nearest open portal to cut the wave off at its source
  let targetPortal: PortalState | null = null;
  if (openPortals.length > 0 && (!targetInvader || invaderDistance > 150)) {
    let best = invaderDistance;
    for (const portal of openPortals) {
      const d = Math.hypot(portal.x - worker.container.x, portal.y - worker.container.y);
      if (d < best) {
        best = d;
        targetPortal = portal;
      }
    }
  }
  if (!targetPortal && !targetInvader) {
    worker.overrideEmote = '🛡️';
    worker.overrideEmoteTimer = 600;
    return;
  }

  const targetX = targetPortal ? targetPortal.x : targetInvader!.container.x;
  const targetY = targetPortal ? targetPortal.y - 20 : targetInvader!.container.y;
  const workerX = worker.container.x;
  const workerY = worker.container.y;
  const reach = targetPortal ? config.attackRange + 24 : config.attackRange;
  if (Math.hypot(targetX - workerX, targetY - workerY) > reach) {
    // Charge forward into combat, around any buildings in the way
    ctx.moveToward(worker, targetX, targetY, effectiveSpeed * 1.35 * deltaSec, deltaSec);
    return;
  }

  // Within attack range: clash and strike!
  worker.combatCooldown -= deltaSec;
  if (worker.combatCooldown > 0) return;
  worker.combatCooldown = 0.85;
  ctx.playMinionAttack(worker, targetX, targetY);
  worker.overrideEmote = '⚔️';
  worker.overrideEmoteTimer = 900;

  if (targetPortal) {
    ctx.portals?.damage(targetPortal, effectiveAttack);
  } else {
    ctx.invasionManager?.damageInvader(targetInvader!, effectiveAttack, `-${effectiveAttack} ⚔️`);
  }

  // Display projectile or slash depending on range
  if (config.attackRange > 60) {
    soundFx.playLaser(); // Use hover sound for magic/ranged attack
    ctx.spawnHarvestBurst(workerX, workerY - 10, config.lanternColor, 3);
    ctx.spawnHarvestBurst(targetX, targetY - 10, config.lanternColor, 6);
    return;
  }

  ctx.spawnHarvestBurst(targetX, targetY - 10, targetPortal ? 0xfde047 : 0x38bdf8, 6);
  soundFx.playHarvest('stone');
  // Visual punch lunge animation with safe completion
  ctx.scene.tweens.add({
    targets: worker.body,
    x: (targetX - workerX) * 0.25,
    y: (targetY - workerY) * 0.25,
    yoyo: true,
    duration: 80,
    onComplete: () => {
      if (worker.body && worker.body.active) {
        worker.body.x = 0;
        worker.body.y = 0;
      }
    },
  });
}
