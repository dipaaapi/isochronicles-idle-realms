/**
 * Typed access to portalDefense.json: rift retaliation, the rift's two skills
 * and ultimate, the Rift Sentinel towers guarding each open portal, and how
 * wave / day / difficulty / phase / time of day / weather scale them.
 */
import config from '../data/portalDefense.json';
import type { Resources, TimeOfDayPhase, WeatherType } from '../types/state';
import { damageMultiplier, daysElapsed, WAVE_BALANCE, type WaveContext } from './waveBalance';

export const PORTAL_DEFENSE = config;
export type PortalSkillId = keyof typeof config.skills | 'ultimate';

export interface RiftContext extends WaveContext {
  phase?: number;
  timeOfDay?: TimeOfDayPhase;
  weather?: WeatherType;
}

/** Combined environment modifiers (time of day × weather). */
export interface RiftEnv {
  damage: number;
  rate: number;
  range: number;
  lashChains: number;
  lashDamage: number;
  wardHeal: number;
  wardSeconds: number;
}

const phaseOf = (phase = 1) => config.scaling.phase[Math.max(0, Math.min(config.scaling.phase.length - 1, phase - 1))];

export function riftEnv(ctx: Pick<RiftContext, 'timeOfDay' | 'weather'>): RiftEnv {
  const t = (config.environment.timeOfDay as Record<string, Partial<RiftEnv>>)[ctx.timeOfDay ?? 'DAY'] ?? {};
  const w = (config.environment.weather as Record<string, Partial<RiftEnv>>)[ctx.weather ?? 'CLEAR'] ?? {};
  const m = (k: keyof RiftEnv) => (t[k] ?? 1) * (w[k] ?? 1);
  return {
    damage: m('damage'), rate: m('rate'), range: m('range'),
    lashChains: (w.lashChains ?? 0) + (t.lashChains ?? 0),
    lashDamage: m('lashDamage'), wardHeal: m('wardHeal'), wardSeconds: m('wardSeconds'),
  };
}

/** Damage scale for every rift / sentinel hit: the invaders' own curve × phase × environment. */
export const riftDamageScale = (ctx: RiftContext): number =>
  damageMultiplier(ctx) * phaseOf(ctx.phase) * riftEnv(ctx).damage;

/** Extra rift HP from the phase and from how long the realm has lasted. */
export const riftHpScale = (ctx: RiftContext): number => {
  const progress = (daysElapsed(ctx.day, ctx.year) - 1) / (WAVE_BALANCE.day.maxDay - 1);
  return config.scaling.riftHp * phaseOf(ctx.phase) * (1 + config.scaling.hpAtMaxDay * progress);
};

export const riftBoltDamage = (scale: number) => Math.max(1, Math.round(config.retaliation.damage * scale));
export const riftLashDamage = (scale: number, env: RiftEnv) => Math.max(1, Math.round(config.skills.riftLash.damage * scale * env.lashDamage));
export const surgeDamage = (scale: number) => Math.max(1, Math.round(config.ultimate.damage * scale));
export const sentinelDamage = (scale: number) => Math.max(1, Math.round(config.towers.damage * scale));
export const sentinelMaxHp = (portalMaxHp: number) => Math.max(1, Math.round(portalMaxHp * config.towers.hpShare));
export const sentinelBounty = (wave: number): Partial<Resources> =>
  ({ coins: Math.round(config.towers.coins + config.towers.coinsPerWave * (Math.max(1, wave) - 1)) });

export const portalSkillName = (id: PortalSkillId, lang: string): string => {
  const def = id === 'ultimate' ? config.ultimate : config.skills[id];
  return lang === 'TL' ? def.name.tl : def.name.en;
};
