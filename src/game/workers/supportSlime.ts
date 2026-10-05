import { SUPPORT_SLIME_EVOLUTION, UNIT_CLASSES, UnitClass } from '../../types/game';
import { useGameStore } from '../../state/useGameStore';
import { getUnitSummonCost, maxUnitsOfClass, techUpgradeCost } from '../../state/economy';
import { FIGHTER_CLASSES, summonLock } from '../../state/store/rosterSlice';
import { canAfford } from '../../state/resources';
import { nextConstruction } from '../../state/constructionProgress';
import { RESEARCH_CATEGORIES } from '../../data/researchConfig';
import { SLIME_MORALE_BUFFS } from '../../data/slimeBuffs';
import { soundFx } from '../audio/soundFx';
import { clampLevel } from './modifiers';
import type { WorkerContext, WorkerFrame, WorkerInstance } from './types';
import type { Resources, UpgradesState } from '../../types/state';

const distance = (a: WorkerInstance, b: WorkerInstance) =>
  Math.hypot(a.container.x - b.container.x, a.container.y - b.container.y);

/** Heal priority: missing HP counts double, fatigue 1.5×. */
const urgencyOf = (ally: WorkerInstance) =>
  (1 - ally.hp / ally.maxHp) * 2.0 + (1 - ally.stamina / ally.maxStamina) * 1.5;

/** Priority order the Slime summons in: Builder Treant first, then diverse combatants & gatherers. */
const SUMMON_ORDER: UnitClass[] = ['TREANT', ...FIGHTER_CLASSES];

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

/** 
 * Slime Automated Commerce: Auto-Sell surplus materials and Auto-Buy needed shortages.
 */
function handleSlimeMarketAutomation(ctx: WorkerContext, slime: WorkerInstance): void {
  const store = useGameStore.getState();
  const resources = store.resources;

  // 1. AUTO-SELL: If enabled, sell stockpiles that exceed 250 units (keeping safe buffer)
  if (store.autoSettings?.autoSell) {
    const rawTradeables: (keyof Omit<Resources, 'coins'>)[] = ['wood', 'stone', 'fish', 'water', 'minerals'];
    for (const resKey of rawTradeables) {
      const amount = resources[resKey] ?? 0;
      if (amount > 200) {
        const batchToSell = Math.min(25, Math.floor(amount - 150));
        if (batchToSell > 0 && store.sellResource(resKey, batchToSell)) {
          ctx.spawnFloatingPopup(
            slime.container.x,
            slime.container.y - 30,
            `💰 Auto-Sold ${batchToSell} ${resKey}!`,
            '#eab308'
          );
          break; // One sale per interval to prevent spam
        }
      }
    }
  }

  // 2. AUTO-BUY: If enabled and we have abundant gold coins (> 150), top up low crucial resources (< 20)
  if (store.autoSettings?.autoBuy && (resources.coins ?? 0) >= 150) {
    const essentialKeys: (keyof Omit<Resources, 'coins'>)[] = ['wood', 'stone', 'water', 'aetherShards'];
    for (const resKey of essentialKeys) {
      const current = resources[resKey] ?? 0;
      if (current < 15) {
        if (store.buyResource(resKey, 10)) {
          ctx.spawnFloatingPopup(
            slime.container.x,
            slime.container.y - 30,
            `🛒 Auto-Bought 10 ${resKey}!`,
            '#38bdf8'
          );
          break;
        }
      }
    }
  }
}

/**
 * Slime Automated Research / Upgrading: Checks research matrix and structure tech upgrades.
 */
function handleSlimeAutoUpgrade(ctx: WorkerContext, slime: WorkerInstance): void {
  const store = useGameStore.getState();
  if (!store.autoSettings?.autoUpgrade) return;

  // Don't burn resources if initial Castle / Spire hasn't been built yet
  if (nextConstruction(store)) return;

  // Check 5 Research Categories
  for (const cat of RESEARCH_CATEGORIES) {
    for (const node of cat.nodes) {
      const currentLevel = (store.upgrades[node.key] as number) ?? 1;
      if (currentLevel >= node.maxLevel) continue;

      const cost = techUpgradeCost(node.key, currentLevel);
      if (canAfford(store.resources, cost)) {
        if (store.upgradeTech(node.key)) {
          ctx.spawnHarvestBurst(slime.container.x, slime.container.y - 20, 0x8b5cf6, 10);
          ctx.spawnFloatingPopup(
            slime.container.x,
            slime.container.y - 45,
            `🔬 Auto-Researched: ${node.nameEnglish}!`,
            '#a855f7'
          );
          soundFx.playFanfare();
          return; // One research per cycle
        }
      }
    }
  }

  // Also check general tech upgrades (nexus, refinery, quarry, golemSpeed, golemCapacity)
  const generalTechs: (keyof UpgradesState)[] = ['nexusLevel', 'refineryLevel', 'quarryLevel', 'golemSpeedLevel', 'golemCapacityLevel'];
  for (const techKey of generalTechs) {
    const lvl = (store.upgrades[techKey] as number) ?? 1;
    if (lvl < 10) {
      const cost = techUpgradeCost(lvl);
      if (canAfford(store.resources, cost)) {
        if (store.upgradeTech(techKey)) {
          ctx.spawnFloatingPopup(
            slime.container.x,
            slime.container.y - 45,
            `⚙️ Auto-Upgraded: ${String(techKey)}!`,
            '#3b82f6'
          );
          return;
        }
      }
    }
  }
}

/** Every few seconds: auto-evolve, auto-buy/sell, auto-upgrade, and summon missing minions. */
/** Every few seconds: auto-evolve, auto-buy/sell, auto-upgrade, and genesis summon Sprout Treant if missing. */
export function autoSummon(ctx: WorkerContext, slime: WorkerInstance, deltaSec: number): void {
  slime.autoSummonTimer = (slime.autoSummonTimer ?? 3.0) - deltaSec;
  if (slime.autoSummonTimer > 0) return;
  slime.autoSummonTimer = 3.5 + Math.random() * 2.0;

  const store = useGameStore.getState();

  // Slime Market Trading (Auto-Buy & Auto-Sell)
  handleSlimeMarketAutomation(ctx, slime);

  // Slime Research Automation (Auto-Upgrade)
  handleSlimeAutoUpgrade(ctx, slime);

  // Evolutions wait until the Treant has finished building: spending the starting
  // supplies on them would leave the castle unaffordable and soft-lock a new realm.
  if (store.autoSettings?.autoEvolve && !nextConstruction(store)) {
    store.upgradeSupportSlime();
    store.upgradeTreant();
  }

  // Support Slime Genesis Summon: if Sprout Treant is absent, summon Treant for free!
  const hasTreant = store.roster.some((u) => u.unitClass === 'TREANT');
  if (!hasTreant) {
    if (useGameStore.getState().summonUnit('TREANT', 'BUILD', true)) {
      ctx.spawnHarvestBurst(slime.container.x, slime.container.y - 20, 0x22c55e, 16);
      ctx.spawnFloatingPopup(
        slime.container.x,
        slime.container.y - 45,
        '🌱 Slime Summoned: Sprout Treant! (Free) 🌱',
        '#22c55e'
      );
      soundFx.playGolemCheer();
    }
  }
}

/**
 * Slime Random Morale Boost Behavior:
 * Periodically chooses an ally (General/Champion, Ancient Treant, or Establishment Tenant)
 * that does NOT currently have an active Morale Buff (strict max 1 buff per unit).
 * Bestows 1 of 10 unique, powerful buffs!
 */
export function pulseMoraleBoost(ctx: WorkerContext, slime: WorkerInstance, deltaSec: number): void {
  slime.moraleBoostTimer = (slime.moraleBoostTimer ?? 2.0) - deltaSec;
  if (slime.moraleBoostTimer > 0) return;
  slime.moraleBoostTimer = 6.0 + Math.random() * 4.0; // Pulse every 6-10s

  const isTl = useGameStore.getState().language === 'TL';

  // 1. Gather all potential recipients: Generals/Fighters, Ancient Treant, and Establishment Tenants
  const workers = ctx.getWorkers().filter((w) => w.id !== slime.id && w.hp > 0);
  const defenders = ctx.getDefenders ? ctx.getDefenders().filter((d) => !d.dead && d.container?.active) : [];

  interface BoostTarget {
    type: 'WORKER' | 'DEFENDER';
    name: string;
    x: number;
    y: number;
    hasBuff: boolean;
    applyBuff: (buff: typeof SLIME_MORALE_BUFFS[number]) => void;
  }

  const targets: BoostTarget[] = [];

  for (const w of workers) {
    targets.push({
      type: 'WORKER',
      name: w.name || w.unitClass,
      x: w.container.x,
      y: w.container.y,
      hasBuff: (w.activeSlimeBuff?.duration ?? 0) > 0,
      applyBuff: (buff) => {
        w.activeSlimeBuff = {
          ...buff,
          maxDuration: buff.duration,
        };
        w.overrideEmote = buff.icon;
        w.overrideEmoteTimer = 2200;
        if (buff.armorShield) {
          w.armorShield = (w.armorShield || 0) + buff.armorShield;
          w.armorShieldTimer = Math.max(w.armorShieldTimer || 0, buff.duration);
        }
      },
    });
  }

  for (const d of defenders) {
    targets.push({
      type: 'DEFENDER',
      name: d.unitClass === 'TREANT' ? 'Grove Tenant' : `${d.unitClass} Tenant`,
      x: d.container.x,
      y: d.container.y,
      hasBuff: ((d as any).activeSlimeBuff?.duration ?? 0) > 0,
      applyBuff: (buff) => {
        (d as any).activeSlimeBuff = {
          ...buff,
          maxDuration: buff.duration,
        };
        if (buff.armorShield) {
          d.armorShield = (d.armorShield || 0) + buff.armorShield;
        }
      },
    });
  }

  if (targets.length === 0) return;

  // Filter for allies without an active buff (Max 1 per unit)
  const unbuffed = targets.filter((t) => !t.hasBuff);
  const chosenTarget = unbuffed.length > 0
    ? unbuffed[Math.floor(Math.random() * unbuffed.length)]
    : targets[Math.floor(Math.random() * targets.length)];

  if (!chosenTarget) return;

  // Pick 1 of the 10 unique buffs randomly
  const buff = SLIME_MORALE_BUFFS[Math.floor(Math.random() * SLIME_MORALE_BUFFS.length)];
  chosenTarget.applyBuff(buff);

  // Visual & Audio fanfare
  ctx.spawnHarvestBurst(chosenTarget.x, chosenTarget.y - 15, buff.hexColor, 12);
  ctx.spawnFloatingPopup(
    chosenTarget.x,
    chosenTarget.y - 42,
    `✨ ${isTl ? 'Morale Boost' : 'Morale Boost'}: ${buff.icon} ${isTl ? buff.nameTl : buff.name}!`,
    buff.color
  );
  soundFx.playGolemCheer();
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
  } else {
    // In range: hover alongside ally and pulse support healing & stamina restoration
    slime.status = 'HEALING';
    slime.supportCooldown -= deltaSec;
    if (slime.supportCooldown <= 0) {
      slime.supportCooldown = 1.0;
      slime.overrideEmote = '💚';
      slime.overrideEmoteTimer = 650;
      pulseHeal(ctx, slime, allies);
    }
  }

  autoSummon(ctx, slime, deltaSec);
  pulseMoraleBoost(ctx, slime, deltaSec);
}
