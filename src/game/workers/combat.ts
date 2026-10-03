import { soundFx } from '../audio/soundFx';
import { auras } from '../skills/combatMods';
import { CASTLE_GATE } from '../../state/buildingLayout';
import { IsometricHelper } from '../IsometricHelper';
import type { ActiveInvader } from '../InvasionManager';
import type { PortalState } from '../PortalManager';
import { CRITICAL_HP, type WorkerContext, type WorkerFrame, type WorkerInstance } from './types';
import { useGameStore } from '../../state/useGameStore';

/** A fighter skill's name in the player's language. */
const skillName = (skill: { name: string; nameTl?: string }): string =>
  useGameStore.getState().language === 'TL' ? skill.nameTl ?? skill.name : skill.name;

const warnCriticallyWounded = (ctx: WorkerContext, worker: WorkerInstance) => {
  worker.overrideEmote = '🩹';
  worker.overrideEmoteTimer = 2500;
  ctx.spawnFloatingPopup(worker.container.x, worker.container.y - 35, 'Critically Wounded! 🛡️', '#f59e0b');
  worker.status = 'IDLE';
  worker.stateTimer = 1000;
};

/**
 * Invasion mobilization: fighters and detached tenants rally into COMBAT while invaders, portals,
 * or waves are active; critically wounded ones stand down and wait for healing.
 */
export function rallyForInvasion(ctx: WorkerContext, worker: WorkerInstance, frame: WorkerFrame, isFighter: boolean): void {
  const portalsOpen = (ctx.portals?.getOpen().length ?? 0) > 0;
  const hasInvaders = frame.aliveInvaders.length > 0;
  if ((!frame.isInvasionActive && !hasInvaders && !portalsOpen) || !isFighter) return;

  const isTenant = !!worker.parentBuildingId || worker.id.startsWith('tenant_');

  // If a tenant is currently inside its parent establishment repairing/harvesting,
  // let them finish repairs unless an enemy directly approaches within 120px
  if (isTenant && worker.status === 'HARVESTING') {
    const { target: nearbyThreat, distance: threatDist } = nearestInvader(worker, frame.aliveInvaders);
    if (!nearbyThreat || threatDist > 120) {
      return; // Stay at parent establishment to repair / harvest
    }
  }

  if (worker.hp < CRITICAL_HP) {
    if (worker.status !== 'IDLE') warnCriticallyWounded(ctx, worker);
  } else if (worker.status !== 'COMBAT') {
    // Tenants (when detached or threatened) & Champions intercept and fight back!
    worker.status = 'COMBAT';
    worker.overrideEmote = '⚔️';
    worker.overrideEmoteTimer = 2000;
    worker.cargoIcon.setVisible(false);
    ctx.spawnFloatingPopup(
      worker.container.x,
      worker.container.y - 35,
      isTenant ? 'Tenant Retaliating! ⚔️' : 'Intercepting Invaders! ⚔️',
      '#38bdf8'
    );
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

/** Computes a defensive perimeter guard spot in front of the Castle Gate. */
export function getCastleDefensePosition(worker: WorkerInstance): { x: number; y: number } {
  const gateIso = IsometricHelper.gridToScreen(CASTLE_GATE.x, CASTLE_GATE.y);
  // Spread defenders in an organized arc in front of the castle gate
  const hash = (worker.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 9) - 4; // -4 to +4
  const angle = (hash * 28) * (Math.PI / 180);
  const radius = 38 + Math.abs(hash) * 6;
  return {
    x: gateIso.x + Math.sin(angle) * radius,
    y: gateIso.y + Math.cos(angle) * (radius * 0.55) + 12,
  };
}

/** Closest invader that has emerged, prioritizing threats attacking or nearing the castle. */
function nearestInvader(worker: WorkerInstance, invaders: ActiveInvader[]) {
  let target: ActiveInvader | null = null;
  let distance = Infinity;
  const gateIso = IsometricHelper.gridToScreen(CASTLE_GATE.x, CASTLE_GATE.y);

  for (const inv of invaders) {
    if ((inv.emerge ?? 0) > 0 || !inv.container?.active || inv.isDead || inv.isRetreating) continue;
    const dWorker = Math.hypot(inv.container.x - worker.container.x, inv.container.y - worker.container.y);
    const dCastle = Math.hypot(inv.container.x - gateIso.x, inv.container.y - gateIso.y);
    // Highest priority to invaders threatening the Castle
    const priorityScore = dWorker + (dCastle < 140 ? -60 : 0);
    if (priorityScore < distance) {
      distance = priorityScore;
      target = inv;
    }
  }
  return {
    target,
    distance: target ? Math.hypot(target.container.x - worker.container.x, target.container.y - worker.container.y) : Infinity,
  };
}

/** Champion active combat: casts 2 Buff/Enhancement Skills and 1 Unique AOE Ultimate. */
function castChampionSkills(ctx: WorkerContext, worker: WorkerInstance, frame: WorkerFrame): void {
  const { config, deltaSec, effectiveAttack } = frame;
  const skills = config.skills;
  if (!skills) return;

  const wx = worker.container.x;
  const wy = worker.container.y;

  // 1. Unique AOE Ultimate Attack
  worker.ultimateCooldown = (worker.ultimateCooldown ?? (skills.ultimate.cooldownSeconds * 0.4)) - deltaSec;
  if (worker.ultimateCooldown <= 0) {
    worker.ultimateCooldown = skills.ultimate.cooldownSeconds;
    const ult = skills.ultimate;

    // Visual burst effect & fanfare
    ctx.spawnHarvestBurst(wx, wy - 15, config.lanternColor, 20);
    ctx.spawnFloatingPopup(wx, wy - 52, `💥 ${skillName(ult)}!`, '#f43f5e');
    soundFx.playFanfare();

    // Slay / damage all invaders in wide AOE area
    const aoeDamage = Math.round(effectiveAttack * 3.2 + 90);
    for (const inv of frame.aliveInvaders) {
      if (inv.isDead || (inv.emerge && inv.emerge > 0)) continue;
      const dist = Math.hypot(inv.container.x - wx, inv.container.y - wy);
      if (dist <= 240) {
        ctx.invasionManager?.damageInvader(inv, aoeDamage, `-${aoeDamage} 💥`);
      }
    }
    return;
  }

  // 2. Skill 1: Buff Self & Tenants
  worker.skill1Cooldown = (worker.skill1Cooldown ?? (skills.skill1.cooldownSeconds * 0.5)) - deltaSec;
  if (worker.skill1Cooldown <= 0) {
    worker.skill1Cooldown = skills.skill1.cooldownSeconds;
    const sk1 = skills.skill1;
    worker.armorShield = (worker.armorShield || 0) + 80;
    ctx.spawnHarvestBurst(wx, wy - 10, config.lanternColor, 10);
    ctx.spawnFloatingPopup(wx, wy - 42, `✨ ${skillName(sk1)}!`, '#38bdf8');
    soundFx.playGolemCheer();
    return;
  }

  // 3. Skill 2: Enhancement / Protection
  worker.skill2Cooldown = (worker.skill2Cooldown ?? (skills.skill2.cooldownSeconds * 0.75)) - deltaSec;
  if (worker.skill2Cooldown <= 0) {
    worker.skill2Cooldown = skills.skill2.cooldownSeconds;
    const sk2 = skills.skill2;
    worker.hp = Math.min(worker.maxHp, worker.hp + 140);
    ctx.spawnHarvestBurst(wx, wy - 10, 0x22c55e, 10);
    ctx.spawnFloatingPopup(wx, wy - 42, `🛡️ ${skillName(sk2)}!`, '#22c55e');
    soundFx.playClick();
  }
}

/** COMBAT state: hunt the nearest invader, cast champion skills, or storm the nearest portal when none are close. */
export function updateCombat(ctx: WorkerContext, worker: WorkerInstance, frame: WorkerFrame): void {
  const { config, deltaSec, effectiveSpeed, effectiveAttack } = frame;
  const openPortals = ctx.portals?.getOpen() ?? [];
  if (!frame.isInvasionActive && frame.aliveInvaders.length === 0 && openPortals.length === 0) {
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

  // Cast Champion Skills during active combat
  castChampionSkills(ctx, worker, frame);

  const { target: targetInvader, distance: invaderDistance } = nearestInvader(worker, frame.aliveInvaders);

  // Nothing close by: storm the nearest open portal to cut the wave off at its source
  let targetPortal: PortalState | null = null;
  if (openPortals.length > 0 && (!targetInvader || invaderDistance > 160)) {
    let best = invaderDistance;
    for (const portal of openPortals) {
      const d = Math.hypot(portal.x - worker.container.x, portal.y - worker.container.y);
      if (d < best) {
        best = d;
        targetPortal = portal;
      }
    }
  }

  const workerX = worker.container.x;
  const workerY = worker.container.y;

  if (!targetPortal && !targetInvader) {
    // No target invader in range: Move to defensive guard position around the Castle!
    const defPos = getCastleDefensePosition(worker);
    const distToDef = Math.hypot(defPos.x - workerX, defPos.y - workerY);
    worker.overrideEmote = '🛡️';
    worker.overrideEmoteTimer = 600;
    if (distToDef > 20) {
      ctx.moveToward(worker, defPos.x, defPos.y, effectiveSpeed * 1.25 * deltaSec, deltaSec);
    }
    return;
  }

  const targetX = targetPortal ? targetPortal.x : targetInvader!.container.x;
  const targetY = targetPortal ? targetPortal.y - 20 : targetInvader!.container.y;
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
    // Shield Wall: knights block 60% of ranged blows
    const ranged = config.attackRange > 60;
    const shielded = ranged && targetInvader!.type === 'HUMAN_KNIGHT';
    const dealt = shielded ? Math.max(1, Math.round(effectiveAttack * 0.4)) : effectiveAttack;
    ctx.invasionManager?.damageInvader(targetInvader!, dealt, shielded ? `-${dealt} 🛡️` : `-${dealt} ⚔️`);
    // Blood Frenzy (Infernal Kennel, citadel below 30%): melee beasts steal life
    if (!ranged && auras.bloodFrenzy && worker.hp < worker.maxHp) {
      worker.hp = Math.min(worker.maxHp, worker.hp + Math.round(dealt * 0.3));
    }
    // Temporal Stasis also slows a beast's swings
    if ((worker.slowTimer ?? 0) > 0) worker.combatCooldown /= worker.slowFactor ?? 1;
  }

  // Display projectile or slash depending on range
  if (config.attackRange > 60) {
    soundFx.playLaser(); // Use hover sound for magic/ranged attack
    ctx.spawnHarvestBurst(workerX, workerY - 10, config.lanternColor, 3);
    ctx.spawnHarvestBurst(targetX, targetY - 10, config.lanternColor, 6);
    return;
  }

  ctx.spawnHarvestBurst(targetX, targetY - 10, targetPortal ? 0xfde047 : 0x38bdf8, 6);
  // Blows on armoured knights and mecha ring out; everything else is a heavy bash
  if (targetPortal) soundFx.playWallBang();
  else soundFx.playSwordClang();
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
