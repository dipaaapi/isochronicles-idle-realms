import config from '../data/brawl.json';
import { UNIT_CLASSES } from '../types/game';
import type { UnitRosterItem } from '../types/state';

/**
 * General brawls: rival Generals who keep bumping into each other at the same spot
 * build tension; past the limit they brawl to the death and the winner absorbs 10%
 * of the loser's current stats (+1 … +10 wins). Numbers live in src/data/brawl.json.
 */

export const BRAWL_CONFIG = config;

/** Tension between one pair of Generals: clashes counted at one spot. */
export interface BrawlTension {
  count: number;
  /** Grid spot where this run of clashes started. */
  x: number;
  y: number;
}

/** Order-independent key for a pair of roster ids. */
export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

export const brawlLevelOf = (unit?: Pick<UnitRosterItem, 'brawlLevel'>): number =>
  Math.max(0, Math.min(config.maxLevel, Math.floor(unit?.brawlLevel ?? 0)));

/** Unupgraded stats of a General. */
export const baseStatsOf = (unit: Pick<UnitRosterItem, 'unitClass' | 'maxHp'>) => {
  const cfg = UNIT_CLASSES[unit.unitClass];
  return { attack: cfg?.baseAttack ?? 20, hp: unit.maxHp || cfg?.baseHp || 100 };
};

/** Effective attack / max HP of a General including its brawl bonus. */
export const generalStatsOf = (unit: UnitRosterItem) => {
  const base = baseStatsOf(unit);
  return { attack: base.attack + (unit.brawlAttack ?? 0), hp: base.hp + (unit.brawlHp ?? 0) };
};

/** Fills the tension gauge by one clash at (x, y); returns the new tension. */
export const addClash = (prev: BrawlTension | undefined, x: number, y: number): BrawlTension =>
  prev && Math.hypot(prev.x - x, prev.y - y) <= config.spotRadiusTiles
    ? { ...prev, count: prev.count + 1 }
    : { count: 1, x, y };

export const tensionFull = (t?: BrawlTension): boolean => !!t && t.count > config.clashesToBrawl;

/**
 * Roster after a brawl: winner inherits the loser's entire + level.
 * If the loser was at +3 the winner gains +3 levels (capped at maxLevel=10);
 * the loser resets to +0. The winner's attack and HP bonuses grow by the
 * full accumulated bonus the loser had (their brawlAttack / brawlHp).
 */
export const applyBrawlResult = (roster: UnitRosterItem[], winnerId: string, loserId: string): UnitRosterItem[] => {
  const loser = roster.find((u) => u.id === loserId);
  const winner = roster.find((u) => u.id === winnerId);
  if (!loser || !winner) return roster;
  const loserLevel = brawlLevelOf(loser);
  return roster.map((u) => {
    if (u.id === winnerId) {
      const winLevel = brawlLevelOf(u);
      if (winLevel >= config.maxLevel) return u;
      const newLevel = Math.min(config.maxLevel, winLevel + Math.max(1, loserLevel));
      return {
        ...u,
        brawlLevel: newLevel,
        // Absorb the loser's full accumulated bonus on top of the winner's own
        brawlAttack: (u.brawlAttack ?? 0) + Math.max(0, loser.brawlAttack ?? 0),
        brawlHp: (u.brawlHp ?? 0) + Math.max(0, loser.brawlHp ?? 0),
      };
    }
    if (u.id === loserId) return { ...u, brawlLevel: 0, brawlAttack: 0, brawlHp: 0 };
    return u;
  });
};

/** Chance that a wave invader mirrors a General of this + level. */
export const mirrorChance = (level: number): number =>
  level > 0 ? config.mirror.chance + config.mirror.perLevel * level : 0;

const hex = (s: string) => parseInt(s.replace('#', ''), 16);
export const BRAWL_GLOW_COLOR = hex(config.glow.color);
export const MIRROR_TINT = hex(config.mirror.tint);
