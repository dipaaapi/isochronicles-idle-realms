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
export type CreatureKind = 'BAT' | 'KIN' | 'GOLEM';
export interface CreatureDef {
  sprite: 'giantBat' | 'dragonKin' | 'magmaGolem';
  hp: number;
  attack: number;
  range: number;
  speed: number;
  cooldown: number;
  flying: boolean;
  ranged?: boolean;
  targets?: 'BACKLINE';
  scale: number;
  slam?: { every: number; telegraph: number; radius: number; attack: number };
  name: { en: string; tl: string };
}
export const CREATURES = LAIR.creatures as unknown as Record<CreatureKind, CreatureDef> & { wavePowerPerWave: number; wavePowerMax: number };
export interface LairEncounter {
  id: string;
  trigger: number;
  spawnY: number;
  spawn: [CreatureKind, number][];
  guardianOf?: string;
}
export const LAIR_ENCOUNTERS = LAIR.encounters as unknown as LairEncounter[];
export const COMBAT = LAIR.combat;

/** Bridges, gates and encounters stay solved once the party gets past them (saved in lairProgress.cleared). */
export const CLEARABLE = new Set([
  ...LAIR_OBSTACLES.filter((o) => o.type === 'BRIDGE' || o.type === 'GATE').map((o) => o.id),
  ...LAIR_ENCOUNTERS.map((e) => e.id),
]);
/** Gates opened by killing their guardian encounter instead of by blows. */
export const guardianOf = (gateId: string): LairEncounter | undefined => LAIR_ENCOUNTERS.find((e) => e.guardianOf === gateId);

/** Encounter head count for this party size (more Generals, bigger packs). */
export const encounterCount = (base: number, generals: number): number => {
  const s = LAIR.encounterScale;
  return Math.max(1, Math.round(base * Math.max(s.min, Math.min(s.max, generals / s.perGenerals))));
};

/** Lair creatures and humans grow a little with the realm's wave, capped so they never outgrow the party. */
export const lairWavePower = (wave: number): number =>
  Math.min(CREATURES.wavePowerMax, 1 + CREATURES.wavePowerPerWave * Math.max(0, wave - LAIR.cave.everyWaves));

/** Average member of the party: the yardstick every lair foe is sized against. */
export const partyAverage = (fighters: LairFighter[]): { hp: number; attack: number } => {
  if (!fighters.length) return { hp: 200, attack: 30 };
  return {
    hp: fighters.reduce((s, f) => s + f.maxHp, 0) / fighters.length,
    attack: fighters.reduce((s, f) => s + f.attack, 0) / fighters.length,
  };
};

/** A creature's hp / attack for this party and wave. */
export const creatureStats = (kind: CreatureKind, avg: { hp: number; attack: number }, wave: number) => {
  const def = CREATURES[kind];
  const k = lairWavePower(wave);
  return { hp: Math.round(def.hp * avg.hp * k), attack: def.attack * avg.attack * k };
};

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
  /** Reach in tiles (from the class's attackRange). */
  range: number;
  /** Seconds between blows. */
  cooldown: number;
}

/** Lair stats: base class stats × research and runes only (no blessings, no brawl bonus). */
export const lairFighters = (state: Pick<GameStoreState, 'roster' | 'skillRanks' | 'runes' | 'runeSlots'>): LairFighter[] => {
  const b = teamBonuses(state);
  const out: LairFighter[] = [];
  for (const g of lairPartyOf(state.roster)) {
    const cfg = UNIT_CLASSES[g.unitClass];
    const attack = (cfg?.baseAttack ?? 20) * b.generalAttack;
    const hp = g.maxHp || cfg?.baseHp || 100;
    const range = Math.max(COMBAT.minRangeTiles, (cfg?.attackRange ?? 60) / COMBAT.rangePxPerTile);
    const cooldown = PARTY.attackCooldown;
    out.push({ id: g.id, unitClass: g.unitClass, isMinion: false, attack, maxHp: hp, damageTaken: b.generalDamageTaken, range, cooldown });
    for (let i = 0; i < PARTY.minionsPerGeneral; i++) {
      out.push({
        id: `${g.id}#${i + 1}`,
        unitClass: g.unitClass,
        isMinion: true,
        attack: attack * PARTY.minionAttackShare * b.attack,
        maxHp: Math.round(hp * PARTY.minionHpShare * b.tenantVigor),
        damageTaken: b.minionDamageTaken,
        range,
        cooldown,
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

// ── Ignara, the Ember Matriarch ─────────────────────────────────────────────

export const MATRIARCH = LAIR.matriarch;
export const HUMANS = LAIR.humans;
export const REWARDS = LAIR.rewards;

/** The realm's dragon. generation 0 = still asleep (the cave has never opened); maxHp 0 = not sized yet. */
export interface DragonState {
  generation: number;
  hp: number;
  maxHp: number;
  slain: boolean;
}
export const freshDragon = (): DragonState => ({ generation: 0, hp: 0, maxHp: 0, slain: false });
/** Awake and alive: she feeds the Demon Realm's volcano with magma. */
export const dragonAwake = (d: DragonState): boolean => d.generation > 0 && !d.slain;

export const normalizeDragon = (raw: unknown): DragonState => {
  if (!raw || typeof raw !== 'object') return freshDragon();
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0);
  const maxHp = Math.floor(num(r.maxHp));
  return {
    generation: Math.min(10000, Math.floor(num(r.generation))),
    maxHp,
    hp: Math.min(maxHp, Math.floor(num(r.hp))),
    slain: r.slain === true,
  };
};

/** Phase index (0..3) for an HP fraction. */
export const matriarchPhase = (hp: number, maxHp: number): number => {
  if (maxHp <= 0) return 0;
  const f = hp / maxHp;
  let phase = 0;
  MATRIARCH.phaseAt.forEach((at, i) => { if (f <= at) phase = i; });
  return phase;
};

/** Her max HP for this party: its damage per second x fightSeconds, growing each generation. */
export const matriarchMaxHp = (fighters: LairFighter[], generation: number): number => {
  const dps = fighters.reduce((s, f) => s + f.attack / Math.max(0.1, f.cooldown), 0);
  return Math.max(1000, Math.round(dps * MATRIARCH.fightSeconds * (1 + MATRIARCH.generationGrowth * Math.max(0, generation - 1))));
};

/** The hoard for slaying this generation (half without recent demon credit). */
export const dragonRewards = (generation: number, fullCredit: boolean): Record<string, number> => {
  const k = (1 + REWARDS.generationGrowth * Math.max(0, generation - 1)) * (fullCredit ? 1 : REWARDS.halfShare);
  return Object.fromEntries(Object.entries(REWARDS.resources).map(([key, v]) => [key, Math.round((v as number) * k)]));
};

// ── Volcanic magma in the Demon Realm ───────────────────────────────────────

export const MAGMA_FLOW = LAIR.volcanicMagma;
export type MagmaStage = 'ACTIVE' | 'CRUST' | 'BASALT';
export interface MagmaTile { stage: MagmaStage; left: number }
const STAGE_SECONDS: Record<MagmaStage, number> = { ACTIVE: MAGMA_FLOW.activeSeconds, CRUST: MAGMA_FLOW.crustSeconds, BASALT: MAGMA_FLOW.basaltSeconds };
const NEXT_STAGE: Record<MagmaStage, MagmaStage | null> = { ACTIVE: 'CRUST', CRUST: 'BASALT', BASALT: null };
export const freshMagmaTile = (): MagmaTile => ({ stage: 'ACTIVE', left: MAGMA_FLOW.activeSeconds });

/**
 * Cools every magma tile by dt seconds. Returns the tiles still out and the
 * ones that finished cooling this tick (the caller turns flooded ones to land).
 */
export const coolMagma = (tiles: Record<string, MagmaTile>, dt: number): { tiles: Record<string, MagmaTile>; done: string[] } => {
  const out: Record<string, MagmaTile> = {};
  const done: string[] = [];
  for (const [k, t] of Object.entries(tiles)) {
    let stage: MagmaStage | null = t.stage;
    let left = t.left - dt;
    while (stage && left <= 0) {
      const next: MagmaStage | null = NEXT_STAGE[stage];
      if (!next) { stage = null; break; }
      left += STAGE_SECONDS[next];
      stage = next;
    }
    if (stage) out[k] = { stage, left };
    else done.push(k);
  }
  return { tiles: out, done };
};

/** Saved magma, keys checked against the island grid (size passed in to keep this module layout-free). */
export const normalizeMagma = (raw: unknown, gridSize: number): Record<string, MagmaTile> => {
  const out: Record<string, MagmaTile> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, gridSize * gridSize)) {
    const m = /^(\d{1,2}),(\d{1,2})$/.exec(k);
    if (!m || Number(m[1]) >= gridSize || Number(m[2]) >= gridSize || !v || typeof v !== 'object') continue;
    const t = v as { stage?: unknown; left?: unknown };
    if (t.stage !== 'ACTIVE' && t.stage !== 'CRUST' && t.stage !== 'BASALT') continue;
    const left = typeof t.left === 'number' && Number.isFinite(t.left) ? Math.max(0, Math.min(STAGE_SECONDS[t.stage], t.left)) : 0;
    out[k] = { stage: t.stage, left };
  }
  return out;
};
