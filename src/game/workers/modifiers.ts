import Phaser from 'phaser';
import { SUPPORT_SLIME_EVOLUTION, TASK_CONFIG, TREANT_EVOLUTION, UNIT_CLASSES } from '../../types/game';
import type { WeatherType, GameStoreState } from '../../types/state';
import { skillBonuses } from '../../state/skillTree';
import type { WorkerFrame, WorkerInstance } from './types';

type EvolutionLevel = 1 | 2 | 3 | 4 | 5;
export const clampLevel = (level: number | undefined): EvolutionLevel =>
  Phaser.Math.Clamp(level ?? 1, 1, 5) as EvolutionLevel;

/** Weather effects on servants: rain = mud, snow = cold, heatwave = both. */
const WEATHER_EFFECTS: Record<WeatherType, { speed: number; drain: number }> = {
  CLEAR: { speed: 1, drain: 1 },
  RAIN: { speed: 0.85, drain: 1 }, // Muddy terrain: 15% slower
  SNOW: { speed: 1, drain: 1.25 }, // Freezing: 25% faster stamina drain
  HEATWAVE: { speed: 0.9, drain: 1.15 }, // Exhausting: 10% slower, 15% faster drain
};

const equipStat = (worker: WorkerInstance, stat: 'bonusSpeed' | 'bonusCargo' | 'bonusAttack' | 'staminaDrainReduction',
  slots: Array<'tool' | 'armor' | 'relic'>) =>
  slots.reduce((sum, slot) => sum + (worker.equipment?.[slot]?.stats[stat] || 0), 0);

/**
 * Applies this frame's timed buffs (motivation, Titan shield) and cargo capacity
 * to `worker`, and returns its effective speed / attack / stamina modifiers.
 * `treantLevel` is the Ent's evolution level (Citadel Majesty speed bonus).
 */
export function computeWorkerFrame(
  worker: WorkerInstance,
  store: GameStoreState,
  treantLevel: number,
  delta: number,
  aliveInvaders: WorkerFrame['aliveInvaders']
): WorkerFrame {
  const deltaSec = delta / 1000;
  const config = UNIT_CLASSES[worker.unitClass];
  const taskCfg = TASK_CONFIG[worker.assignedTask];
  const skills = skillBonuses(store.unlockedSkills);

  // Class-specific cargo bonuses
  let classCapacityBonus = 0;
  if (worker.unitClass === 'CHRONO') classCapacityBonus = 1;
  if (worker.unitClass === 'GOLEM' && (worker.assignedTask === 'STONE' || worker.assignedTask === 'AETHER')) {
    classCapacityBonus = 1;
  }
  worker.maxCargo = config.cargoCapacity + (store.upgrades.golemCapacityLevel - 1) + classCapacityBonus +
    equipStat(worker, 'bonusCargo', ['tool', 'relic']);

  // God Tier Blessings
  const blessings = store.activeGodBlessings || { CELESTIAL_HARVEST: 0, AEGIS_WRATH: 0, TITAN_AWAKENING: 0 };
  const isHarvestBlessingActive = (blessings.CELESTIAL_HARVEST || 0) > 0;
  const isTitanBlessingActive = (blessings.TITAN_AWAKENING || 0) > 0;

  // Titan Awakening: +150% combat attack power (2.5x)
  const titanAttackBonus = isTitanBlessingActive ? 2.5 : 1.0;
  const effectiveAttack = Math.round(
    ((worker.attackPower || 22) + equipStat(worker, 'bonusAttack', ['tool', 'armor', 'relic'])) * titanAttackBonus * skills.attack
  );

  // Titan Awakening: Radiant Armor Shield to all non-slime minions
  if (isTitanBlessingActive && worker.unitClass !== 'AQUA_SLIME') {
    worker.armorShield = Math.max(worker.armorShield, 60);
    worker.armorShieldTimer = Math.max(worker.armorShieldTimer, 2.0);
  }
  if (worker.armorShieldTimer > 0) {
    worker.armorShieldTimer -= deltaSec;
    if (worker.armorShieldTimer <= 0) worker.armorShield = 0;
  }

  // Titan Awakening eliminates stamina drain completely (0 drain)
  const drainReduction = isTitanBlessingActive
    ? 100
    : Phaser.Math.Clamp(equipStat(worker, 'staminaDrainReduction', ['armor', 'relic']), 0, 70);

  // Speed multipliers
  let motivationMult = 1;
  if (worker.buffTimer > 0) {
    worker.buffTimer -= delta;
    motivationMult = 1.25;
  }
  // Wayfarer speed bonus on woodcutting
  const taskSpecialtySpeed = worker.unitClass === 'WAYFARER' && worker.assignedTask === 'WOOD' ? 1.2 : 1;
  const weather = WEATHER_EFFECTS[store.weather] ?? WEATHER_EFFECTS.CLEAR;
  const slimeMovementBonus = worker.unitClass === 'AQUA_SLIME'
    ? 1 + SUPPORT_SLIME_EVOLUTION[clampLevel(worker.supportEvolutionLevel)].speedBonusPercent / 100
    : 1;
  // Celestial Abundance: +50% worker speed on gatherers
  const blessingSpeedBonus = isHarvestBlessingActive ? 1.5 : 1.0;

  // Citadel Majesty: +10% to +35% speed when Castle is in peak condition (>= 90% HP)
  const { castleHp, castleMaxHp } = store.defense;
  const castleHpRatio = castleMaxHp > 0 ? castleHp / castleMaxHp : 1;
  const majestyBonus = TREANT_EVOLUTION[clampLevel(treantLevel)]?.castleMajestyBonus || 15;
  const citadelMajestySpeedBonus = castleHpRatio >= 0.9 ? 1 + majestyBonus / 100 : 1.0;

  const effectiveSpeed =
    (worker.speed + equipStat(worker, 'bonusSpeed', ['tool', 'armor', 'relic'])) *
    (1 + (store.upgrades.golemSpeedLevel - 1) * 0.2) *
    motivationMult * taskSpecialtySpeed * weather.speed * slimeMovementBonus *
    blessingSpeedBonus * citadelMajestySpeedBonus * skills.speed;

  return {
    store,
    delta,
    deltaSec,
    config,
    taskCfg,
    effectiveSpeed,
    effectiveAttack,
    drainReduction,
    weatherDrainMult: weather.drain,
    isInvasionActive: store.invasion.isActive,
    aliveInvaders,
  };
}
