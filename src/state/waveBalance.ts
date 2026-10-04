import config from '../data/waveBalance.json';
import type { Season } from '../types/state';
import type { Difficulty } from './difficulty';

/**
 * Invader stat curves (src/data/waveBalance.json): wave 1–100, day 1–365 of
 * the realm, difficulty, and boss / elite / tactic multipliers. Pure, so the
 * balance sim and the tests use the same numbers as the game.
 */

export type DifficultyCurve = (typeof config.difficulty)['NORMAL'];
export const WAVE_BALANCE = config as typeof config & { difficulty: Record<Difficulty, DifficultyCurve> };

export type InvaderRank = 'normal' | 'elite' | 'boss' | 'climax';

export interface WaveContext {
  wave: number;
  difficulty: Difficulty;
  /** Day of the year (1–365) and the year: together, how long the realm has lasted. */
  day?: number;
  year?: number;
  season?: Season;
}

export interface TacticMods {
  hp?: number;
  damage?: number;
}

const clampWave = (wave: number) => Math.max(1, Math.min(config.stats.realmMultiplier.length * 25, wave));

/** Days the realm has lasted, capped at maxDay (365). */
export const daysElapsed = (day = 1, year = 1): number =>
  Math.max(1, Math.min(config.day.maxDay, (Math.max(1, year) - 1) * 365 + Math.max(1, day)));

/** 0 on day 1 → 1 on day 365. */
const dayProgress = (ctx: WaveContext) => (daysElapsed(ctx.day, ctx.year) - 1) / (config.day.maxDay - 1);

export const isClimaxWave = (wave: number) => config.climax.waves.includes(wave);
export const isBossWave = (wave: number) => wave % 5 === 0 || isClimaxWave(wave);

/** Realm multiplier: each realm (25 waves) hardens its invaders a step. */
export const realmMultiplier = (wave: number) =>
  config.stats.realmMultiplier[Math.min(config.stats.realmMultiplier.length - 1, Math.floor((clampWave(wave) - 1) / 25))];

export function hpMultiplier(ctx: WaveContext): number {
  const season = ctx.season ? (config.day.seasonHp as Record<Season, number>)[ctx.season] ?? 1 : 1;
  return (1 + (clampWave(ctx.wave) - 1) * config.stats.hpGrowthPerWave)
    * realmMultiplier(ctx.wave)
    * (1 + config.day.hpAtMaxDay * dayProgress(ctx))
    * season
    * WAVE_BALANCE.difficulty[ctx.difficulty].hp;
}

export function damageMultiplier(ctx: WaveContext): number {
  return (1 + (clampWave(ctx.wave) - 1) * config.stats.damageGrowthPerWave)
    * (1 + config.day.damageAtMaxDay * dayProgress(ctx))
    * WAVE_BALANCE.difficulty[ctx.difficulty].damage;
}

const RANK: Record<InvaderRank, { hp: number; damage: number; bounty: number; scale: number }> = {
  normal: { hp: 1, damage: 1, bounty: 1, scale: 1 },
  elite: config.elite,
  boss: config.boss,
  climax: config.climax,
};

export interface InvaderStats { hp: number; damage: number; bounty: number; scale: number }

export function invaderStats(
  base: { hp: number; damage: number; bountyCoins: number },
  ctx: WaveContext,
  rank: InvaderRank = 'normal',
  tactic: TacticMods = {},
): InvaderStats {
  const w = clampWave(ctx.wave);
  const r = RANK[rank];
  return {
    hp: Math.round((base.hp + (w - 1) * config.stats.hpFlatPerWave) * hpMultiplier(ctx) * r.hp * (tactic.hp ?? 1)),
    damage: Math.round(base.damage * damageMultiplier(ctx) * r.damage * (tactic.damage ?? 1)),
    bounty: Math.round(base.bountyCoins * (1 + (w - 1) * config.stats.bountyGrowthPerWave) * r.bounty),
    scale: r.scale,
  };
}

/** Chance that an ordinary invader comes as an elite (bigger, tougher, richer). */
export function eliteChance(wave: number, difficulty: Difficulty): number {
  if (wave < config.elite.fromWave) return 0;
  return WAVE_BALANCE.difficulty[difficulty].eliteChance + (wave - config.elite.fromWave) * config.elite.chancePerWave;
}

/** Invaders in a wave after difficulty and tactic (base count from economy.json). */
export const scaledEnemyCount = (baseCount: number, difficulty: Difficulty, tacticCount = 1): number =>
  Math.max(1, Math.round(baseCount * WAVE_BALANCE.difficulty[difficulty].count * tacticCount));

/** Gap before the next spawn group, in ms. */
export function spawnIntervalMs(wave: number, difficulty: Difficulty, tacticInterval = 1, rand: () => number = Math.random): number {
  const s = config.spawn;
  const base = Math.max(s.minIntervalMs, s.intervalMs + (clampWave(wave) - 1) * s.intervalPerWave);
  return (base + rand() * s.jitterMs) * WAVE_BALANCE.difficulty[difficulty].spawnInterval * tacticInterval;
}

/** Portal HP multiplier on top of defenseConfig's linear portal HP. */
export const portalHpMultiplier = (wave: number, difficulty: Difficulty, tacticPortalHp = 1): number =>
  (1 + (clampWave(wave) - 1) * config.portal.hpGrowthPerWave) * WAVE_BALANCE.difficulty[difficulty].portalHp * tacticPortalHp;

export const victoryBounty = (wave: number): number => config.victory.coins + wave * config.victory.coinsPerWave;

/** Flat structure-skill damage multiplier for the current wave. */
export const skillPower = (wave: number): number => 1 + (clampWave(wave) - 1) * config.skills.powerPerWave;
