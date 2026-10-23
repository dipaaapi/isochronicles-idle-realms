import LAIR from '../data/dragonsLair.json';
import { ESTABLISHMENT_CREWS } from './establishmentCrews';
import { teamBonuses } from './skillTree';
import { UNIT_CLASSES } from '../types/game';
import type { UnitClass } from '../types/game';
import type { GameStoreState, UnitRosterItem } from '../types/state';

/**
 * Dragon's Lair expedition rules (Phase 4): who goes, what they keep, the
 * route's obstacles and checkpoints. Pure functions over store state so the
 * scene and the tests share them.
 */
export const LAIR_CONFIG = LAIR;
export const LAIR_WIDTH = LAIR.map.width;
export const LAIR_LENGTH = LAIR.map.length;
export const PARTY = LAIR.party;

export type LairObstacleType = 'ROCKFALL' | 'MAGMA' | 'BRIDGE' | 'GATE';
export interface LairObstacle {
  id: string;
  type: LairObstacleType;
  x: number;
  y: number;
  w: number;
  h: number;
  name: { en: string; tl: string };
  every?: number;
  offset?: number;
  warn?: number;
  block?: number;
  damage?: number;
  safe?: number;
  active?: number;
  dps?: number;
  gap?: number[];
  bridge?: number[];
  work?: number;
  hp?: number;
}
export const LAIR_OBSTACLES = LAIR.obstacles as LairObstacle[];
/** Obstacles that stay solved once the party gets past them (saved in lairProgress.cleared). */
export const CLEARABLE = new Set(LAIR_OBSTACLES.filter((o) => o.type === 'BRIDGE' || o.type === 'GATE').map((o) => o.id));

/** Checkpoints sit where each region opens; index 0 is the entrance. */
export const CHECKPOINTS: number[] = LAIR.regions.map((r) => r.from);
export const regionIndexAt = (y: number): number => {
  const i = LAIR.regions.findIndex((r) => y >= r.from && y <= r.to);
  return i < 0 ? 0 : i;
};

export interface LairProgress {
  /** Furthest checkpoint reached (index into CHECKPOINTS); respawns and reloads start here. */
  checkpoint: number;
  /** Bridges repaired and gates broken. */
  cleared: string[];
}
export const freshLairProgress = (): LairProgress => ({ checkpoint: 0, cleared: [] });

/** Keeps a saved progress record inside the lair's real checkpoints and obstacles. */
export const normalizeLairProgress = (raw: unknown): LairProgress => {
  if (!raw || typeof raw !== 'object') return freshLairProgress();
  const r = raw as { checkpoint?: unknown; cleared?: unknown };
  const cp = typeof r.checkpoint === 'number' && Number.isFinite(r.checkpoint) ? Math.floor(r.checkpoint) : 0;
  const cleared = Array.isArray(r.cleared) ? Array.from(new Set(r.cleared.filter((id): id is string => typeof id === 'string' && CLEARABLE.has(id)))) : [];
  return { checkpoint: Math.max(0, Math.min(CHECKPOINTS.length - 1, cp)), cleared };
};

const GENERAL_CLASSES = new Set<UnitClass>(Object.values(ESTABLISHMENT_CREWS).map((c) => c.general));
export const isExpeditionGeneral = (u: UnitRosterItem): boolean =>
  GENERAL_CLASSES.has(u.unitClass) && !u.id.startsWith('tenant_');

/** Every summoned General goes; the Treant and the Support Slime stay home. */
export const lairPartyOf = (roster: UnitRosterItem[]): UnitRosterItem[] => roster.filter(isExpeditionGeneral);

/** Entry wipes the brawl + of every participant for good. */
export const stripExpeditionPower = (roster: UnitRosterItem[]): UnitRosterItem[] =>
  roster.map((u) => (isExpeditionGeneral(u) && (u.brawlLevel || u.brawlAttack || u.brawlHp)
    ? { ...u, brawlLevel: 0, brawlAttack: 0, brawlHp: 0 }
    : u));

export interface LairFighter {
  /** Roster id for Generals, `<generalId>#<n>` for their minions. */
  id: string;
  unitClass: UnitClass;
  isMinion: boolean;
  attack: number;
  maxHp: number;
  /** Multiplier on damage taken (research/runes armour). */
  damageTaken: number;
}

/** Lair stats: base class stats × research and runes only (no blessings, no brawl bonus). */
export const lairFighters = (state: Pick<GameStoreState, 'roster' | 'skillRanks' | 'runes' | 'runeSlots'>): LairFighter[] => {
  const b = teamBonuses(state);
  const out: LairFighter[] = [];
  for (const g of lairPartyOf(state.roster)) {
    const cfg = UNIT_CLASSES[g.unitClass];
    const attack = (cfg?.baseAttack ?? 20) * b.generalAttack;
    const hp = g.maxHp || cfg?.baseHp || 100;
    out.push({ id: g.id, unitClass: g.unitClass, isMinion: false, attack, maxHp: hp, damageTaken: b.generalDamageTaken });
    for (let i = 0; i < PARTY.minionsPerGeneral; i++) {
      out.push({
        id: `${g.id}#${i + 1}`,
        unitClass: g.unitClass,
        isMinion: true,
        attack: attack * PARTY.minionAttackShare * b.attack,
        maxHp: Math.round(hp * PARTY.minionHpShare * b.tenantVigor),
        damageTaken: b.minionDamageTaken,
      });
    }
  }
  return out;
};

/** Magma phase at time t (seconds): SAFE → WARN → ACTIVE, looping. */
export const magmaPhase = (o: LairObstacle, t: number): 'SAFE' | 'WARN' | 'ACTIVE' => {
  const safe = o.safe ?? 4, warn = o.warn ?? 1, active = o.active ?? 2;
  const cycle = safe + warn + active;
  const k = (((t + (o.offset ?? 0)) % cycle) + cycle) % cycle;
  return k < safe ? 'SAFE' : k < safe + warn ? 'WARN' : 'ACTIVE';
};

/** Rockfall phase at time t: IDLE → WARN (shadow) → BLOCKED (rubble), looping. */
export const rockfallPhase = (o: LairObstacle, t: number): 'IDLE' | 'WARN' | 'BLOCKED' => {
  const every = o.every ?? 7, warn = o.warn ?? 1.5, block = o.block ?? 3;
  const k = (((t + (o.offset ?? 0)) % every) + every) % every;
  return k < every - warn - block ? 'IDLE' : k < every - block ? 'WARN' : 'BLOCKED';
};

export const inRect = (o: Pick<LairObstacle, 'x' | 'y' | 'w' | 'h'>, x: number, y: number): boolean =>
  x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h;

/** Row the party may not pass yet: the first unrepaired bridge or unbroken gate (or the route's end). */
export const blockingRow = (cleared: readonly string[]): number => {
  for (const o of LAIR_OBSTACLES) {
    if ((o.type === 'BRIDGE' || o.type === 'GATE') && !cleared.includes(o.id)) return o.y;
  }
  return LAIR.route.stopY;
};

/** True when a tile is permanently impassable given what has been cleared (chasms, gates). */
export const isStaticBlocked = (x: number, y: number, cleared: readonly string[]): boolean => {
  if (x < 0 || y < 0 || x >= LAIR_WIDTH || y >= LAIR_LENGTH) return true;
  for (const o of LAIR_OBSTACLES) {
    if (!inRect(o, x, y)) continue;
    if (o.type === 'GATE' && !cleared.includes(o.id)) return true;
    if (o.type === 'BRIDGE' && !(cleared.includes(o.id) && (o.bridge ?? []).includes(x))) return true;
  }
  return false;
};
