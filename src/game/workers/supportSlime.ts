import { SUPPORT_SLIME_EVOLUTION, UNIT_CLASSES, UnitClass } from '../../types/game';
import { useGameStore } from '../../state/useGameStore';
import { maxUnitsOfClass } from '../../state/economy';
import { canAfford } from '../../state/resources';
import { soundFx } from '../audio/soundFx';
import { clampLevel } from './modifiers';
import type { WorkerContext, WorkerFrame, WorkerInstance } from './types';

const distance = (a: WorkerInstance, b: WorkerInstance) =>
  Math.hypot(a.container.x - b.container.x, a.container.y - b.container.y);

/** Heal priority: missing HP counts double, fatigue 1.5×. */
const urgencyOf = (ally: WorkerInstance) =>
  (1 - ally.hp / ally.maxHp) * 2.0 + (1 - ally.stamina / ally.maxStamina) * 1.5;

/** Priority order the Slime summons in: Builder Treant first, then diverse combatants & gatherers. */
const SUMMON_ORDER: UnitClass[] = ['TREANT', 'GOLEM', 'WAYFARER', 'CHRONO', 'MERMAN', 'NECROMANCER'];

/**
 * A Support Slime off cooldown revives a fallen minion if the realm can pay.
 * Returns true when `fallen` was brought back.
 */
export function tryResurrect(ctx: WorkerContext, fallen: WorkerInstance): boolean {
  if (fallen.unitClass === 'AQUA_SLIME') return false;
  const slime = ctx.getWorkers()
    .filter((ally) => ally.unitClass === 'AQUA_SLIME')
    .sort((first, second) => first.resurrectionCooldown - second.resurrectionCooldown)
    .find((ally) => ally.resurrectionCooldown <= 0);
  if (!slime) return false;

  const slimeLevel = clampLevel(slime.supportEvolutionLevel);
  const profile = SUPPORT_SLIME_EVOLUTION[slimeLevel];
  const state = useGameStore.getState();
  if (!canAfford(state.resources, profile.resurrectionCost)) return false;
  state.spendResources(profile.resurrectionCost);

  fallen.hp = Math.max(1, Math.round(fallen.maxHp * (0.35 + slimeLevel * 0.13)));
  fallen.stamina = Math.max(1, Math.round(fallen.maxStamina * (0.40 + slimeLevel * 0.12)));
  fallen.status = 'IDLE';
  fallen.stateTimer = 500;
  fallen.overrideEmote = '✨';
  fallen.overrideEmoteTimer = 2500;
  slime.resurrectionCooldown = profile.resurrectionCooldownSeconds;
  ctx.spawnFloatingPopup(
    fallen.container.x,
    fallen.container.y - 35,
    `✨ Resurrected! (${Math.ceil(profile.resurrectionCooldownSeconds)}s cd)`,
    '#22c55e'
  );
  soundFx.playFanfare();
  return true;
}

/** Pulses HP / stamina (and at Lv.4+ an armor shield) into the neediest allies in range. */
function pulseHeal(ctx: WorkerContext, slime: WorkerInstance, allies: WorkerInstance[]): void {
  const profile = SUPPORT_SLIME_EVOLUTION[clampLevel(slime.supportEvolutionLevel)];
  const targets = [...allies]
    .sort((a, b) => ((1 - b.hp / b.maxHp) * 2 + (1 - b.stamina / b.maxStamina)) -
      ((1 - a.hp / a.maxHp) * 2 + (1 - a.stamina / a.maxStamina)))
    .slice(0, Math.min(profile.healTargets, allies.length));

  for (const ally of targets) {
    if (distance(ally, slime) > 120) continue;

    const nextHp = Math.min(ally.maxHp, ally.hp + Math.max(2, ally.maxHp * (profile.healPercent / 100)));
    const restoredHp = nextHp - ally.hp;
    if (restoredHp > 0) {
      ally.hp = nextHp;
      ctx.spawnFloatingPopup(ally.container.x, ally.container.y - 35, `+${Math.round(restoredHp)} HP`, '#22c55e');
    }

    const nextStamina = Math.min(ally.maxStamina, ally.stamina + Math.max(2, ally.maxStamina * (profile.fatigueRestorePercent / 100)));
    const restoredStamina = nextStamina - ally.stamina;
    if (restoredStamina > 0) {
      ally.stamina = nextStamina;
      ctx.spawnFloatingPopup(ally.container.x, ally.container.y - 50, `+${Math.round(restoredStamina)} Fatigue`, '#38bdf8');
    }

    if (profile.level >= 4 && ally.hp < ally.maxHp) {
      const armorValue = ally.maxHp * (profile.armorPercent / 100);
      if (armorValue > 0) {
        ally.armorShield = Math.max(ally.armorShield, armorValue);
        ally.armorShieldTimer = profile.armorDurationSeconds;
      }
    }
  }

  ctx.spawnHarvestBurst(slime.container.x, slime.container.y - 15, 0x22c55e, 5);
  soundFx.playHarvest('crystal');
}

/** Every few seconds: auto-evolve (if enabled) and summon one missing minion the realm can afford. */
function autoSummon(ctx: WorkerContext, slime: WorkerInstance, deltaSec: number): void {
  slime.autoSummonTimer = (slime.autoSummonTimer ?? 3.0) - deltaSec;
  if (slime.autoSummonTimer > 0) return;
  slime.autoSummonTimer = 4.0 + Math.random() * 2.0;

  const store = useGameStore.getState();
  if (store.autoSettings?.autoEvolve) {
    store.upgradeSupportSlime();
    store.upgradeTreant();
  }

  for (const unitClass of SUMMON_ORDER) {
    const count = store.roster.filter((u) => u.unitClass === unitClass).length;
    if (count >= maxUnitsOfClass(unitClass)) continue;
    const isFree = unitClass === 'TREANT';
    if (!store.summonUnit(unitClass, undefined, isFree)) continue;

    ctx.spawnHarvestBurst(slime.container.x, slime.container.y - 20, 0x38bdf8, 12);
    ctx.spawnHarvestBurst(slime.container.x, slime.container.y - 20, 0xfbbf24, 8);
    ctx.spawnFloatingPopup(
      slime.container.x,
      slime.container.y - 45,
      isFree ? `🌱 Slime Summoned: Sprout Ent! (Free) 🌱` : `✨ Slime Summoned: ${UNIT_CLASSES[unitClass].name}! ✨`,
      isFree ? '#22c55e' : '#38bdf8'
    );
    soundFx.playGolemCheer();
    return; // Summon 1 unit per cycle
  }
}

/** Support Healing Slime AI: invulnerable, follows and heals the neediest ally, auto-summons. */
export function updateSupportSlime(ctx: WorkerContext, slime: WorkerInstance, frame: WorkerFrame): void {
  const { deltaSec, effectiveSpeed } = frame;
  slime.hp = slime.maxHp; // Absolute invulnerability: immune to damage, cannot be killed
  slime.cargo = 0;
  slime.cargoIcon.setVisible(false);

  const allies = ctx.getWorkers().filter((ally) => ally.id !== slime.id && ally.unitClass !== 'AQUA_SLIME' && ally.hp > 0);

  // Most urgent ally (all allies score >= 0, so the first always wins over "none")
  let target: WorkerInstance | null = null;
  let highestUrgency = -1;
  for (const ally of allies) {
    const urgency = urgencyOf(ally);
    if (urgency > highestUrgency) {
      highestUrgency = urgency;
      target = ally;
    }
  }

  if (!target) {
    slime.status = 'IDLE';
    slime.stateTimer = 500;
  } else if (distance(target, slime) > 55) {
    // Move smoothly towards lowest HP / highest fatigue ally
    slime.status = 'MOVING_TO_NODE';
    ctx.moveToward(slime, target.container.x, target.container.y, effectiveSpeed * 1.35 * deltaSec, deltaSec);
    slime.overrideEmote = '💚';
    slime.overrideEmoteTimer = 400;
  } else {
    // In range: hover alongside ally and pulse support healing & stamina restoration
    slime.status = 'HEALING';
    slime.overrideEmote = '✨';
    slime.overrideEmoteTimer = 800;
    slime.supportCooldown -= deltaSec;
    if (slime.supportCooldown <= 0) {
      slime.supportCooldown = 1.0;
      pulseHeal(ctx, slime, allies);
    }
  }

  autoSummon(ctx, slime, deltaSec);
}
