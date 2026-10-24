import Phaser from 'phaser';
import { IsometricHelper, TILE_HEIGHT, TILE_WIDTH } from '../IsometricHelper';
import {
  createEnemySprite, createLairSprite, createMinionSprite, faceCharacterSprite,
  playCharacterAttack, playCharacterHit, playCharacterSkill, playCharacterWork,
} from '../sprites/CharacterSprites';
import { soundFx } from '../audio/soundFx';
import { useGameStore } from '../../state/useGameStore';
import { logMessage } from '../../state/activityLog';
import { unitName } from '../../i18n/translations';
import { INVADER_CONFIGS, type InvaderType } from '../../types/game';
import WAVE_POOL from '../../data/wavePool.json';
import LAIR from '../../data/dragonsLair.json';
import {
  CHECKPOINTS, COMBAT, CREATURES, HUMANS, LAIR_CONFIG, LAIR_ENCOUNTERS, LAIR_LENGTH, LAIR_OBSTACLES, LAIR_WIDTH, MATRIARCH, PARTY,
  blockingRow, creatureStats, encounterCount, guardianOf, inRect, isStaticBlocked, lairFighters, lairWavePower,
  magmaPhase, matriarchMaxHp, matriarchPhase, partyAverage, rockfallPhase,
  type CreatureKind, type LairEncounter, type LairFighter, type LairObstacle,
} from '../../state/lairExpedition';
import { nextStep } from './lairNav';
import { useLairHud } from './lairHud';
import { MatriarchRenderer, type MatriarchPose } from './MatriarchRenderer';
import { TreasureChest } from './treasureChest';

type Faction = 'DEMON' | 'DRAGON' | 'HUMAN';

interface Unit {
  id: string;
  faction: Faction;
  kind: string;
  name: { en: string; tl: string };
  container: Phaser.GameObjects.Container;
  sprite?: Phaser.GameObjects.Sprite;
  hpBar?: Phaser.GameObjects.Graphics;
  gx: number;
  gy: number;
  hp: number;
  maxHp: number;
  attack: number;
  /** Reach in tiles, measured to the target's edge. */
  range: number;
  speed: number;
  cooldownMax: number;
  cooldown: number;
  damageTaken: number;
  flying: boolean;
  ranged: boolean;
  backline: boolean;
  /** Body radius in tiles (the Matriarch is huge). */
  radius: number;
  isMinion: boolean;
  /** Demon formation slot (-1 for foes). */
  slot: number;
  dead: boolean;
  respawnAt: number;
  step: { x: number; y: number } | null;
  repathIn: number;
  target?: Unit;
  retargetIn: number;
  encounter?: string;
  summoned?: boolean;
  /** Summons crumble at this time. */
  expiresAt?: number;
  slamIn?: number;
  slamWarn?: number;
  isBoss?: boolean;
  /** Who hit this unit last, and when (three-way grudges). */
  lastHitBy?: Faction;
  lastHitAt?: number;
  /** Roster id of the General a minion follows (minions avenge hits on it). */
  owner?: string;
  /** Ignara's summons hunt the side that hurt her most when they were called. */
  hunt?: Faction;
  /** Damage over time from Dragon Claw (bleed) and Dragon's Breath (burn). */
  bleedUntil?: number;
  bleedDps?: number;
  burnUntil?: number;
  burnDps?: number;
}

interface Bolt { x0: number; y0: number; x1: number; y1: number; t: number; dur: number; color: number }
interface Spark { x: number; y: number; vx: number; vy: number; t: number; life: number; color: number }
interface Zone { kind: string; t: number; warn: number; done: boolean; draw: (g: Phaser.GameObjects.Graphics, k: number, dt: number) => void; resolve: () => void }
/** A flame of Dragon's Breath flying from her maw to a spot in the cone (`back`: behind her body). */
interface Flame { x0: number; y0: number; x1: number; y1: number; t: number; life: number; size: number; back: boolean }
/** A blood drop falling to the floor, where it leaves a splat. */
interface Drop { x: number; y: number; vx: number; vy: number; floor: number; back: boolean }
/** Floor marks that fade: blood splats and scorched stone. */
interface Decal { x: number; y: number; r: number; t: number; life: number; kind: 'BLOOD' | 'SCORCH'; seed: number }
/** Three claw rakes across a victim. */
interface Slash { x: number; y: number; t: number; dur: number; dir: number; back: boolean }
/** The tail's sweep around her as a fading arc on the floor. */
interface Whip { t: number; dur: number; from: number; sweep: number; rx: number; ry: number; cx: number; cy: number }

/** Columns the formation fills, centre-out, so the party funnels toward the route's middle. */
const SLOT_COLUMNS = [4, 5, 3, 6, 2, 7, 1, 8];
const FACTIONS: Faction[] = ['DEMON', 'DRAGON', 'HUMAN'];
const THREE = LAIR.threeWay;
const HOSTILE: Record<Faction, Faction[]> = { DEMON: ['DRAGON', 'HUMAN'], DRAGON: ['DEMON', 'HUMAN'], HUMAN: ['DEMON', 'DRAGON'] };
const BOLT_COLOR: Record<Faction, number> = { DEMON: 0xc084fc, DRAGON: 0xf97316, HUMAN: 0x7dd3fc };
type Ability = keyof typeof MATRIARCH.abilities;
const SCALE = THREE.scaling;
const DEATH = MATRIARCH.death;
/** Flame colour by age: white-hot core → yellow → orange → deep red. */
const FLAME_RAMP = [0xfff7d6, 0xfde047, 0xfb923c, 0xea580c, 0xb91c1c];

/**
 * The expedition (Phases 4–6): every General and its minions walk the lair
 * as one formation behind an advancing front, through rockfalls, magma
 * pulses, broken bridges and the creatures of Ignara's brood (bats, dragon
 * kin, the Magma Golem guarding her gate). At the chamber the three-way
 * battle starts: the party, the human expedition breaking in through the side
 * tunnels, and Ignara with her summons, all mutually hostile: nobody
 * is allied, each side scores its foes by distance, grudges and who is
 * winning (pickTarget), and Ignara hunts whichever side hurts her most. Her HP lives in
 * the store and only ever goes down. The fallen return at the last
 * checkpoint. Only HP bars float over units; everything else is narrated in
 * the activity log.
 */
export class LairExpedition {
  private units: Unit[] = [];
  private ground: Phaser.GameObjects.Graphics;
  private fx: Phaser.GameObjects.Graphics;
  /** Additive light: lava and gate runes on the floor, bolts and embers over the fight. */
  private glowGround: Phaser.GameObjects.Graphics;
  private glowFx: Phaser.GameObjects.Graphics;
  /** Floor layer under every unit and Ignara: telegraphs, blood and scorch marks. */
  private floorFx: Phaser.GameObjects.Graphics;
  /** Effects behind Ignara's body (drawn just under her depth) so they never paint over her. */
  private fxBack: Phaser.GameObjects.Graphics;
  /** Additive light on the floor from the breath and fresh scorch marks. */
  private floorGlow: Phaser.GameObjects.Graphics;
  private sparks: Spark[] = [];
  private bolts: Bolt[] = [];
  private zones: Zone[] = [];
  private flames: Flame[] = [];
  private drops: Drop[] = [];
  private decals: Decal[] = [];
  private slashes: Slash[] = [];
  private whips: Whip[] = [];
  private chest?: TreasureChest;
  /** Humans sent by phase breach waves (on top of the reinforcement cap). */
  private humanBonus = 0;
  private t = 0;
  private frontY: number;
  private bridgeWork = new Map<string, number>();
  private gateHp = new Map<string, number>();
  private rockPhase = new Map<string, string>();
  private endLogged = false;
  private fighters: LairFighter[];
  private avg: { hp: number; attack: number };
  private wave: number;
  private nextId = 0;
  private spawnedEncounters = new Set<string>();
  /** Packs beaten on this trip: every entry wakes the brood again (only bridges and gates stay solved in the save). */
  private solved = new Set<string>();
  /** Scene times when fallen human raiders break back in through the side tunnels. */
  private humanRespawns: number[] = [];
  // Matriarch battle
  private battle = false;
  private boss?: Unit;
  private bossArt?: MatriarchRenderer;
  private bossTimers = new Map<Ability, number>();
  private bossPhase = -1;
  private lastDemonHitAt = -Infinity;
  private humansFirst = 0;
  private humansSent = 0;
  private victoryAt = 0;
  private victory?: Record<string, number>;
  /** Three-way state: each side's starting strength, Ignara's threat meter, the side she hunts and the side everyone gangs up on. */
  private startStrength: Record<Faction, number> = { DEMON: 1, DRAGON: 1, HUMAN: 1 };
  private shares: Record<Faction, number> = { DEMON: 1, DRAGON: 1, HUMAN: 1 };
  private threat: Record<Faction, number> = { DEMON: 0, DRAGON: 0, HUMAN: 0 };
  private focus: 'DEMON' | 'HUMAN' = 'DEMON';
  private leader: Faction | null = null;
  private focusLoggedAt = -Infinity;
  private shiftLoggedAt = -Infinity;
  /** Damage dealt per 'ATTACKER>TARGET' side pair in the chamber (the headless test checks every pair fights). */
  readonly dealt: Record<string, number> = {};

  constructor(private scene: Phaser.Scene) {
    this.ground = scene.add.graphics().setDepth(1);
    this.glowGround = scene.add.graphics().setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
    this.floorFx = scene.add.graphics().setDepth(3);
    this.floorGlow = scene.add.graphics().setDepth(3.5).setBlendMode(Phaser.BlendModes.ADD);
    this.fxBack = scene.add.graphics().setDepth(4);
    this.fx = scene.add.graphics().setDepth(100000);
    this.glowFx = scene.add.graphics().setDepth(100001).setBlendMode(Phaser.BlendModes.ADD);
    // The HUD store outlives scenes: start each expedition from a clean readout
    useLairHud.getState().publish({ victory: undefined, battle: false, holdingAt: null, holdProgress: 0, foes: 0, humans: 0 });
    const store = useGameStore.getState();
    this.wave = store.invasion.waveNumber;
    this.frontY = CHECKPOINTS[store.lairProgress.checkpoint] ?? 0;
    this.fighters = lairFighters(store);
    this.avg = partyAverage(this.fighters);
    const roster = new Map(store.roster.map((u) => [u.id, u]));
    this.fighters.forEach((f, i) => {
      const general = roster.get(f.id.split('#')[0]);
      const base = general?.name ?? f.unitClass;
      const u = this.makeUnit({
        id: f.id, faction: 'DEMON', kind: f.unitClass,
        name: { en: unitName(base, f.unitClass, 'EN') + (f.isMinion ? ' minion' : ''), tl: unitName(base, f.unitClass, 'TL') + (f.isMinion ? ' (alagad)' : '') },
        sprite: createMinionSprite(scene, f.unitClass), spriteScale: f.isMinion ? 0.7 : 0.9, fallback: 0xa855f7,
        hp: f.maxHp, attack: f.attack, range: f.range, speed: PARTY.speedTilesPerSec, cooldown: f.cooldown,
        damageTaken: f.damageTaken, isMinion: f.isMinion, slot: i,
      });
      if (f.isMinion) u.owner = f.id.split('#')[0];
      this.place(u, this.spawnTile(i));
    });
    for (const o of LAIR_OBSTACLES) if (o.type === 'GATE') this.gateHp.set(o.id, o.hp ?? 1000);
  }

  // ── Units ──────────────────────────────────────────────────────────────────

  private makeUnit(o: {
    id: string; faction: Faction; kind: string; name: { en: string; tl: string };
    sprite: Phaser.GameObjects.Sprite | null; spriteScale: number; fallback: number;
    hp: number; attack: number; range: number; speed: number; cooldown: number;
    damageTaken?: number; isMinion?: boolean; slot?: number; flying?: boolean; ranged?: boolean; backline?: boolean;
  }): Unit {
    const container = this.scene.add.container(0, 0);
    const shadow = this.scene.add.ellipse(0, 3, 16 * o.spriteScale + 4, 7, 0x000000, 0.4);
    const hpBar = this.scene.add.graphics();
    const sprite = o.sprite ?? undefined;
    if (sprite) {
      sprite.setScale(sprite.scaleX * o.spriteScale);
      container.add([shadow, sprite, hpBar]);
    } else {
      container.add([shadow, this.scene.add.circle(0, -10, 6 * o.spriteScale + 2, o.fallback), hpBar]);
    }
    const u: Unit = {
      id: o.id, faction: o.faction, kind: o.kind, name: o.name, container, sprite, hpBar,
      gx: 0, gy: 0, hp: o.hp, maxHp: o.hp, attack: o.attack, range: o.range, speed: o.speed,
      cooldownMax: o.cooldown, cooldown: Math.random() * o.cooldown, damageTaken: o.damageTaken ?? 1,
      flying: !!o.flying, ranged: !!o.ranged || o.range > 2, backline: !!o.backline, radius: 0.3,
      isMinion: !!o.isMinion, slot: o.slot ?? -1, dead: false, respawnAt: 0, step: null, repathIn: 0, retargetIn: 0,
    };
    this.units.push(u);
    return u;
  }

  private spawnCreature(kind: CreatureKind, gx: number, gy: number, encounter?: string, summoned = false): Unit | null {
    if (summoned && this.units.length >= SCALE.maxUnits) return null;
    const def = CREATURES[kind];
    const stats = creatureStats(kind, this.avg, this.wave);
    const u = this.makeUnit({
      id: `c${this.nextId++}`, faction: 'DRAGON', kind, name: def.name,
      sprite: createLairSprite(this.scene, def.sprite), spriteScale: def.scale, fallback: 0xdc2626,
      hp: stats.hp, attack: stats.attack, range: def.range, speed: def.speed, cooldown: def.cooldown,
      flying: def.flying, ranged: !!def.ranged, backline: def.targets === 'BACKLINE',
    });
    u.encounter = encounter;
    u.summoned = summoned;
    if (summoned) {
      u.expiresAt = this.t + MATRIARCH.summonLifetime;
      u.hunt = this.focus;
    }
    if (def.slam) u.slamIn = def.slam.every;
    if (kind === 'GOLEM') u.radius = 0.7;
    this.place(u, { x: Phaser.Math.Clamp(gx, 0, LAIR_WIDTH - 1), y: Phaser.Math.Clamp(gy, 0, LAIR_LENGTH - 1) });
    return u;
  }

  /** A human raider from the wave pool open at this wave, sized to the party (see humans in dragonsLair.json). */
  private spawnHuman(gx: number, gy: number): void {
    if (this.battle && this.units.length >= SCALE.maxUnits) return;
    const open = (WAVE_POOL as { type: string; fromWave: number; weight: number }[]).filter((p) => p.fromWave <= this.wave && INVADER_CONFIGS[p.type as InvaderType]);
    const total = open.reduce((s, p) => s + p.weight, 0);
    let roll = Math.random() * total;
    const pick = open.find((p) => (roll -= p.weight) <= 0) ?? open[0];
    const type = pick.type as InvaderType;
    const cfg = INVADER_CONFIGS[type];
    const poolHp = open.reduce((s, p) => s + INVADER_CONFIGS[p.type as InvaderType].hp, 0) / open.length;
    const poolAtk = open.reduce((s, p) => s + INVADER_CONFIGS[p.type as InvaderType].damage, 0) / open.length;
    const k = HUMANS.powerShare * lairWavePower(this.wave);
    const u = this.makeUnit({
      id: `h${this.nextId++}`, faction: 'HUMAN', kind: type, name: { en: cfg.nameEn ?? cfg.name, tl: cfg.name },
      sprite: createEnemySprite(this.scene, type), spriteScale: 0.85, fallback: 0x38bdf8,
      hp: Math.round(this.avg.hp * k * (cfg.hp / poolHp)), attack: this.avg.attack * k * (cfg.damage / poolAtk),
      range: Math.max(COMBAT.minRangeTiles, (cfg.attackRange ?? 50) / HUMANS.rangePxPerTile),
      speed: Math.max(0.8, Math.min(2.2, (cfg.speed ?? 60) / 40)), cooldown: 1.1,
      flying: !!cfg.flying,
    });
    this.place(u, { x: Phaser.Math.Clamp(Math.round(gx), 0, LAIR_WIDTH - 1), y: Phaser.Math.Clamp(gy, 0, LAIR_LENGTH - 1) });
    this.humansSent++;
  }

  /** Respawn / start tile for a slot: spread over the rows at the current checkpoint. */
  private spawnTile(slot: number): { x: number; y: number } {
    const base = CHECKPOINTS[useGameStore.getState().lairProgress.checkpoint] ?? 0;
    return { x: SLOT_COLUMNS[slot % SLOT_COLUMNS.length], y: Math.min(LAIR_LENGTH - 1, base + Math.floor(slot / SLOT_COLUMNS.length) % 3) };
  }

  private place(u: Unit, t: { x: number; y: number }): void {
    u.gx = t.x;
    u.gy = t.y;
    u.step = null;
    this.syncPosition(u);
  }

  private syncPosition(u: Unit): void {
    const p = IsometricHelper.gridToScreen(u.gx, u.gy);
    u.container.setPosition(p.x, p.y);
    u.container.setDepth(10 + p.y + (u.flying ? 30 : 0));
  }

  private get cleared(): string[] {
    return useGameStore.getState().lairProgress.cleared;
  }

  // ── Terrain ────────────────────────────────────────────────────────────────

  private dangerAt(x: number, y: number): boolean {
    for (const o of LAIR_OBSTACLES) {
      if (!inRect(o, x, y)) continue;
      if (o.type === 'MAGMA' && !(o.gap ?? []).includes(x) && magmaPhase(o, this.t) !== 'SAFE') return true;
      if (o.type === 'ROCKFALL' && rockfallPhase(o, this.t) !== 'IDLE') return true;
    }
    return false;
  }

  /** Ignara's body is solid ground for walkers. */
  private bossBlocks(x: number, y: number): boolean {
    return !!this.boss && !this.boss.dead && Math.hypot(x - this.boss.gx, y - this.boss.gy) < this.boss.radius - 0.4;
  }

  private blocked = (x: number, y: number): boolean => isStaticBlocked(x, y, this.cleared) || this.dangerAt(x, y) || this.bossBlocks(x, y);

  /** The member's place in the formation behind the front. */
  private goalOf(u: Unit, front: number): { x: number; y: number } {
    const rank = Math.floor(u.slot / SLOT_COLUMNS.length);
    let y = Math.max(0, Math.floor(front) - rank);
    const x = SLOT_COLUMNS[u.slot % SLOT_COLUMNS.length];
    for (let tries = 0; tries < 6; tries++) {
      if (!isStaticBlocked(x, y, this.cleared) && !this.bossBlocks(x, y)) return { x, y };
      for (let d = 1; d < LAIR_WIDTH; d++) {
        for (const nx of [x - d, x + d]) if (nx >= 0 && nx < LAIR_WIDTH && !isStaticBlocked(nx, y, this.cleared) && !this.bossBlocks(nx, y)) return { x: nx, y };
      }
      y = Math.max(0, y - 1);
    }
    return { x, y };
  }

  // ── Frame ──────────────────────────────────────────────────────────────────

  update(deltaMs: number): void {
    const dt = Math.min(0.1, deltaMs / 1000);
    this.t += dt;
    const store = useGameStore.getState();
    const hud = useLairHud.getState();
    const demons = this.units.filter((u) => u.faction === 'DEMON' && !u.dead);

    // Victory: hold the hoard on screen a moment, then the loading screen takes the party home
    if (this.victory) {
      this.bossArt?.update(dt);
      // Her remains are gone: the hoard chest drops where she fell
      if (this.bossArt?.gone && !this.chest) {
        const c = IsometricHelper.gridToScreen(MATRIARCH.arenaX, MATRIARCH.arenaY);
        this.chest = new TreasureChest(this.scene, c.x, c.y);
        this.chest.container.setDepth(10 + c.y);
        soundFx.playFanfare();
        soundFx.playCoin();
      }
      this.chest?.update(dt);
      this.drawFx(dt);
      if (this.t >= this.victoryAt) {
        logMessage('lairVictoryReturn');
        store.returnFromLair();
      }
      return;
    }

    // ── Front: advances unless held, blocked by an obstacle or a fight, or the party has strung out
    const block = this.battle ? MATRIARCH.arenaY - MATRIARCH.reachTiles : blockingRow(this.cleared);
    const stopAt = block - 1;
    const lag = demons.length ? demons.reduce((s, u) => s + Math.max(0, this.goalOf(u, this.frontY).y - u.gy), 0) / demons.length : 0;
    const strung = lag > PARTY.regroupTiles;
    const fightAhead = this.units.some((u) => !u.dead && u.faction !== 'DEMON' && !u.isBoss && u.gy <= this.frontY + COMBAT.holdAheadTiles);
    if (!hud.hold && !strung && !fightAhead && this.frontY < stopAt) {
      this.frontY = Math.min(stopAt, this.frontY + PARTY.advanceTilesPerSec * dt);
    }
    for (let i = store.lairProgress.checkpoint + 1; i < CHECKPOINTS.length; i++) {
      if (this.frontY >= CHECKPOINTS[i]) store.reachLairCheckpoint(i);
    }

    // ── Encounters wake as the front nears them
    for (const e of LAIR_ENCOUNTERS) {
      if (this.spawnedEncounters.has(e.id) || this.frontY < e.trigger) continue;
      this.spawnEncounter(e);
    }

    // ── Obstacles
    const holding = this.battle ? null : LAIR_OBSTACLES.find((o) => o.y === blockingRow(this.cleared) && (o.type === 'BRIDGE' || o.type === 'GATE')) ?? null;
    const atHold = !!holding && this.frontY >= stopAt - 0.01;
    let holdProgress = 0;
    if (holding && atHold) holdProgress = this.workOn(holding, demons, dt);
    for (const o of LAIR_OBSTACLES) {
      if (o.type !== 'ROCKFALL') continue;
      const phase = rockfallPhase(o, this.t);
      if (phase === 'BLOCKED' && this.rockPhase.get(o.id) === 'WARN') {
        for (const u of this.units) if (!u.dead && !u.flying && inRect(o, Math.round(u.gx), Math.round(u.gy))) this.hurt(u, o.damage ?? 30, null);
      }
      this.rockPhase.set(o.id, phase);
    }

    // ── The Matriarch's chamber
    const routeEnd = !holding && this.frontY >= LAIR_CONFIG.route.stopY - 1.01;
    if (routeEnd && !this.battle && !store.dragon.slain) this.startBattle();
    if (routeEnd && !this.endLogged && !this.battle) { this.endLogged = true; logMessage('lairRouteEnd'); }
    if (this.battle) this.updateBattle(dt);

    // ── Units
    for (const u of this.units) {
      if (u.isBoss) continue;
      if (u.dead) {
        if (u.faction === 'DEMON' && this.t >= u.respawnAt) this.respawn(u);
        continue;
      }
      if (!u.flying) {
        const tx = Math.round(u.gx), ty = Math.round(u.gy);
        for (const o of LAIR_OBSTACLES) {
          if (o.type === 'MAGMA' && inRect(o, tx, ty) && !(o.gap ?? []).includes(tx) && magmaPhase(o, this.t) === 'ACTIVE') this.hurt(u, (o.dps ?? 20) * dt, null);
        }
      }
      if (u.dead) continue;
      this.tickDots(u, dt);
      if (u.dead) continue;
      if (u.expiresAt !== undefined && this.t >= u.expiresAt) {
        u.hp = 0;
        this.hurt(u, 1, null);
        continue;
      }
      this.think(u, dt, atHold ? holding : null);
      this.drawHp(u);
    }
    this.units = this.units.filter((u) => u.faction === 'DEMON' || u.isBoss || !u.dead);

    this.checkEncounters();
    this.drawObstacles();
    this.drawFx(dt);

    // ── HUD
    const waiting = this.units.filter((u) => u.faction === 'DEMON' && u.dead);
    const d = useGameStore.getState().dragon;
    hud.publish({
      frontY: this.frontY,
      alive: demons.length,
      total: this.fighters.length,
      respawning: waiting.length,
      nextRespawn: waiting.length ? Math.max(0, Math.min(...waiting.map((u) => u.respawnAt)) - this.t) : 0,
      holdingAt: this.battle ? 'BATTLE' : routeEnd ? 'END' : atHold && holding ? holding.id : null,
      holdProgress,
      foes: this.units.filter((u) => !u.dead && u.faction === 'DRAGON' && !u.isBoss).length,
      humans: this.units.filter((u) => !u.dead && u.faction === 'HUMAN').length,
      battle: this.battle,
      dragonHp: d.hp,
      dragonMaxHp: d.maxHp,
      dragonPhase: matriarchPhase(d.hp, d.maxHp),
      shares: { ...this.shares },
      dragonFocus: this.focus,
      leader: this.leader,
    });
  }

  // ── Encounters ─────────────────────────────────────────────────────────────

  private spawnEncounter(e: LairEncounter): void {
    this.spawnedEncounters.add(e.id);
    const generals = this.fighters.filter((f) => !f.isMinion).length;
    for (const [kind, base] of e.spawn) {
      const n = kind === 'GOLEM' ? base : encounterCount(base, generals);
      for (let i = 0; i < n; i++) this.spawnCreature(kind, 1 + ((i * 3 + 2) % (LAIR_WIDTH - 2)), e.spawnY + (i % 3) * 0.6, e.id);
      if (kind !== 'GOLEM') logMessage('lairEncounter', { name: CREATURES[kind].name, count: n });
    }
  }

  /** An encounter is solved when its last creature falls; a guardian's death opens its gate. */
  private checkEncounters(): void {
    for (const id of this.spawnedEncounters) {
      if (this.solved.has(id)) continue;
      if (this.units.some((u) => u.encounter === id && !u.dead)) continue;
      this.solved.add(id);
      const store = useGameStore.getState();
      store.clearLairObstacle(id);
      const e = LAIR_ENCOUNTERS.find((x) => x.id === id);
      if (e?.guardianOf && !this.cleared.includes(e.guardianOf)) {
        store.clearLairObstacle(e.guardianOf);
        logMessage('lairGuardianDown');
      }
    }
  }

  /** Bridges take repair work from members at the bridgehead; an unguarded gate takes their blows. Returns 0..1 progress. */
  private workOn(o: LairObstacle, demons: Unit[], dt: number): number {
    const crew = demons.filter((u) => u.gy >= o.y - 2.5 && u.gy < o.y && !u.target);
    if (o.type === 'BRIDGE') {
      const need = o.work ?? 50;
      const done = Math.min(need, (this.bridgeWork.get(o.id) ?? 0) + crew.length * PARTY.repairPerUnitPerSec * dt);
      this.bridgeWork.set(o.id, done);
      for (const u of crew) if (u.sprite) playCharacterWork(u.sprite);
      if (done >= need) useGameStore.getState().clearLairObstacle(o.id);
      return done / need;
    }
    // A gate held by a living guardian can't be broken: kill the guardian
    const guard = guardianOf(o.id);
    if (guard && !this.cleared.includes(guard.id) && !this.cleared.includes(o.id)) {
      const alive = this.units.filter((u) => u.encounter === guard.id && !u.dead);
      const max = alive.reduce((s, u) => s + u.maxHp, 0) || 1;
      return 1 - alive.reduce((s, u) => s + u.hp, 0) / max;
    }
    const max = o.hp ?? 1000;
    let hp = this.gateHp.get(o.id) ?? max;
    for (const u of crew) {
      u.cooldown -= dt;
      if (u.cooldown > 0) continue;
      u.cooldown = u.cooldownMax;
      hp -= u.attack;
      if (u.sprite) playCharacterAttack(u.sprite);
    }
    this.gateHp.set(o.id, Math.max(0, hp));
    if (hp <= 0) useGameStore.getState().clearLairObstacle(o.id);
    return 1 - Math.max(0, hp) / max;
  }

  // ── AI ─────────────────────────────────────────────────────────────────────

  private dist(a: Unit, b: Unit): number {
    return Math.hypot(a.gx - b.gx, a.gy - b.gy) - b.radius;
  }

  /**
   * Three-way targeting: every side scores every foe (lower wins). Distance
   * first, then a faction bias, a grudge against whoever just hit it (or its
   * General), and a pull toward the side currently winning so no two sides
   * settle into a standing alliance against the third.
   */
  private pickTarget(u: Unit): Unit | undefined {
    const foes = this.units.filter((o) => !o.dead && HOSTILE[u.faction].includes(o.faction));
    if (!foes.length) return undefined;
    if (!this.battle) {
      // Bats dive past the front line for the party's rear
      if (u.backline) {
        const demons = foes.filter((o) => o.faction === 'DEMON');
        if (demons.length) {
          const rear = demons.reduce((a, b) => (a.gy < b.gy ? a : b));
          return foes.filter((o) => o.faction !== 'DEMON').find((o) => this.dist(u, o) < 1.5) ?? rear;
        }
      }
      // On the route: the nearest foe in aggro range
      let best: Unit | undefined;
      let bestD = u.faction === 'DEMON' ? COMBAT.aggroTiles : 99;
      for (const o of foes) {
        const d = this.dist(u, o);
        if (d < bestD) { bestD = d; best = o; }
      }
      return best;
    }
    const bias = THREE.bias[u.faction] as Partial<Record<Faction, number>>;
    const owner = u.owner ? this.units.find((o) => o.id === u.owner && !o.dead) : undefined;
    const grudges = new Set<Faction>();
    for (const src of [u, owner]) {
      if (src?.lastHitBy && this.t - (src.lastHitAt ?? -99) <= THREE.grudgeSeconds) grudges.add(src.lastHitBy);
    }
    const second = this.secondShare();
    let best: Unit | undefined;
    let bestScore = Infinity;
    for (const o of foes) {
      let score = this.dist(u, o) - (bias[o.faction] ?? 0);
      if (grudges.has(o.faction)) score -= THREE.grudgeTiles;
      if (this.leader === o.faction) score -= THREE.leaderPull * (this.shares[o.faction] - second);
      if (u.hunt === o.faction) score -= THREE.huntTiles;
      if (o === u.target) score -= THREE.stickTiles;
      if (score < bestScore) { bestScore = score; best = o; }
    }
    return best;
  }

  /** The second-highest remaining strength share (how far the leader is ahead). */
  private secondShare(): number {
    return FACTIONS.map((f) => this.shares[f]).sort((a, b) => b - a)[1] ?? 0;
  }

  /** Remaining strength of a side as a share of what it started with (Ignara: her HP from the store). */
  private strengthOf(f: Faction): number {
    if (f === 'DRAGON') {
      const d = useGameStore.getState().dragon;
      return d.maxHp > 0 ? d.hp / d.maxHp : 0;
    }
    const hp = this.units.filter((u) => u.faction === f && !u.dead).reduce((s, u) => s + u.hp, 0);
    return hp / Math.max(1, this.startStrength[f]);
  }

  /** Re-reads each side's strength, the side Ignara hunts and the side everyone turns on; narrates the shifts. */
  private updateSides(dt: number): void {
    for (const f of FACTIONS) {
      this.shares[f] = this.strengthOf(f);
      this.threat[f] = Math.max(0, this.threat[f] - THREE.threatDecay * dt);
    }
    const sorted = [...FACTIONS].sort((a, b) => this.shares[b] - this.shares[a]);
    const lead = this.shares[sorted[0]] - this.shares[sorted[1]] > THREE.leaderMargin ? sorted[0] : null;
    if (lead !== this.leader) {
      this.leader = lead;
      if (lead && this.t - this.shiftLoggedAt >= THREE.shiftLogSeconds) {
        this.shiftLoggedAt = this.t;
        logMessage(lead === 'DEMON' ? 'threeWayGangDemon' : lead === 'HUMAN' ? 'threeWayGangHuman' : 'threeWayGangDragon', { name: MATRIARCH.name });
      }
    }
    // Ignara hunts the side that has hurt her most lately (the Demons while nobody has)
    const alive = (f: Faction) => this.units.some((u) => u.faction === f && !u.dead);
    let next: 'DEMON' | 'HUMAN' = this.threat.HUMAN > this.threat.DEMON * 1.1 ? 'HUMAN' : 'DEMON';
    if (!alive(next)) next = next === 'DEMON' ? 'HUMAN' : 'DEMON';
    if (next !== this.focus) {
      this.focus = next;
      if (this.t - this.focusLoggedAt >= THREE.focusLogSeconds) {
        this.focusLoggedAt = this.t;
        logMessage(next === 'HUMAN' ? 'matriarchFocusHumans' : 'matriarchFocusDemons', { name: MATRIARCH.name });
      }
    }
  }

  private think(u: Unit, dt: number, holding: LairObstacle | null): void {
    u.cooldown -= dt;
    u.retargetIn -= dt;
    if (!u.target || u.target.dead || u.retargetIn <= 0) {
      u.target = this.pickTarget(u);
      u.retargetIn = 0.6;
    }
    // Golem slam: telegraphed ring, then a heavy blow to everything near
    if (u.slamIn !== undefined) this.golemSlam(u, dt);

    const target = u.target;
    if (target) {
      const d = this.dist(u, target);
      if (d <= u.range) {
        this.face(u, target.gx - u.gx, target.gy - u.gy, false);
        if (u.cooldown <= 0) this.strike(u, target);
        return;
      }
      this.moveToward(u, target.gx, target.gy, dt);
      return;
    }
    if (u.faction === 'DEMON') {
      const goal = this.goalOf(u, this.frontY);
      this.walk(u, goal, dt, holding);
    } else {
      this.face(u, 0, 1, false);
    }
  }

  private strike(u: Unit, target: Unit): void {
    u.cooldown = u.cooldownMax;
    if (u.sprite) playCharacterAttack(u.sprite);
    if (u.ranged) {
      const a = IsometricHelper.gridToScreen(u.gx, u.gy);
      const b = IsometricHelper.gridToScreen(target.gx, target.gy);
      this.bolts.push({ x0: a.x, y0: a.y - 18, x1: b.x, y1: b.y - 14, t: 0, dur: COMBAT.projectileSeconds, color: BOLT_COLOR[u.faction] });
    }
    this.hurt(target, u.attack, u);
  }

  private golemSlam(u: Unit, dt: number): void {
    const slam = CREATURES.GOLEM.slam!;
    u.slamIn! -= dt;
    if (u.slamWarn === undefined && u.slamIn! <= slam.telegraph) u.slamWarn = slam.telegraph;
    if (u.slamWarn !== undefined) {
      u.slamWarn -= dt;
      const c = IsometricHelper.gridToScreen(u.gx, u.gy);
      this.fx.lineStyle(3, 0xf97316, 0.5 + 0.4 * Math.sin(this.t * 20));
      this.fx.strokeEllipse(c.x, c.y, slam.radius * TILE_WIDTH, slam.radius * TILE_HEIGHT);
      if (u.slamWarn <= 0) {
        u.slamWarn = undefined;
        u.slamIn = slam.every;
        if (u.sprite) playCharacterSkill(u.sprite);
        soundFx.playExplosion();
        this.burst(c.x, c.y, 0xf97316, 24, 200);
        for (const o of this.units) {
          if (!o.dead && o !== u && HOSTILE[u.faction].includes(o.faction) && !o.isBoss && Math.hypot(o.gx - u.gx, o.gy - u.gy) <= slam.radius) {
            this.hurt(o, u.attack * (slam.attack / CREATURES.GOLEM.attack), u);
          }
        }
      }
    }
  }

  private face(u: Unit, dx: number, dy: number, moving: boolean): void {
    if (!u.sprite) return;
    const s0 = IsometricHelper.gridToScreen(0, 0);
    const s1 = IsometricHelper.gridToScreen(dx, dy);
    faceCharacterSprite(u.sprite, s1.x - s0.x, s1.y - s0.y, moving);
  }

  /** Chase: fliers glide straight; walkers step straight while the way is clear, BFS otherwise. */
  private moveToward(u: Unit, gx: number, gy: number, dt: number): void {
    const dx = gx - u.gx, dy = gy - u.gy;
    const d = Math.hypot(dx, dy) || 1;
    const stepLen = u.speed * dt;
    const nx = u.gx + (dx / d) * stepLen, ny = u.gy + (dy / d) * stepLen;
    if (u.flying || !this.blocked(Math.round(nx), Math.round(ny))) {
      u.gx = Phaser.Math.Clamp(nx, 0, LAIR_WIDTH - 1);
      u.gy = Phaser.Math.Clamp(ny, 0, LAIR_LENGTH - 1);
      this.syncPosition(u);
      this.face(u, dx, dy, true);
      return;
    }
    this.walk(u, { x: Phaser.Math.Clamp(Math.round(gx), 0, LAIR_WIDTH - 1), y: Phaser.Math.Clamp(Math.round(gy), 0, LAIR_LENGTH - 1) }, dt, null);
  }

  private walk(u: Unit, goal: { x: number; y: number }, dt: number, holding: LairObstacle | null): void {
    const tx = Math.round(u.gx), ty = Math.round(u.gy);
    u.repathIn -= dt;
    if (!u.step || u.repathIn <= 0 || this.blocked(u.step.x, u.step.y)) {
      u.step = tx === goal.x && ty === goal.y ? { x: goal.x, y: goal.y } : nextStep(tx, ty, goal.x, goal.y, this.blocked);
      u.repathIn = 0.4;
    }
    let dx = 0, dy = 0, moving = false;
    if (u.step) {
      dx = u.step.x - u.gx;
      dy = u.step.y - u.gy;
      const d = Math.hypot(dx, dy);
      const stepLen = u.speed * dt;
      if (d <= stepLen) {
        u.gx = u.step.x;
        u.gy = u.step.y;
        u.step = null;
      } else {
        u.gx += (dx / d) * stepLen;
        u.gy += (dy / d) * stepLen;
      }
      moving = d > 0.01;
    } else if (holding) {
      dy = 1;
    }
    this.syncPosition(u);
    this.face(u, dx, dy, moving);
  }

  private hurt(u: Unit, amount: number, by: Unit | null): void {
    if (u.dead || !(amount > 0)) return;
    if (by && this.battle) this.dealt[`${by.faction}>${u.faction}`] = (this.dealt[`${by.faction}>${u.faction}`] ?? 0) + amount;
    if (u.isBoss) {
      this.hurtBoss(amount, by);
      return;
    }
    if (by) { u.lastHitBy = by.faction; u.lastHitAt = this.t; }
    u.hp -= amount * u.damageTaken;
    if (u.sprite && amount >= 5) playCharacterHit(u.sprite);
    if (u.hp > 0) return;
    u.dead = true;
    u.target = undefined;
    if (u.faction === 'DEMON') {
      u.respawnAt = this.t + PARTY.respawnSeconds;
      u.container.setVisible(false);
      if (!u.isMinion) logMessage('lairMemberDown', { name: u.name, seconds: PARTY.respawnSeconds });
    } else {
      const p = IsometricHelper.gridToScreen(u.gx, u.gy);
      this.burst(p.x, p.y - 12, BOLT_COLOR[u.faction], 10, 110);
      this.scene.tweens.add({ targets: u.container, alpha: 0, duration: 400, onComplete: () => u.container.destroy() });
      // The human expedition keeps sending raiders while the Matriarch lives
      if (u.faction === 'HUMAN' && this.battle) this.humanRespawns.push(this.t + HUMANS.respawnSeconds);
    }
  }

  private respawn(u: Unit): void {
    u.dead = false;
    u.hp = u.maxHp;
    this.place(u, this.spawnTile(u.slot));
    u.container.setVisible(true);
    if (!u.isMinion) logMessage('lairMemberBack', { name: u.name });
  }

  // ── Ignara, the Ember Matriarch ────────────────────────────────────────────

  private startBattle(): void {
    const store = useGameStore.getState();
    this.battle = true;
    store.sizeDragon(matriarchMaxHp(this.fighters, store.dragon.generation));
    const d = useGameStore.getState().dragon;
    const pos = IsometricHelper.gridToScreen(MATRIARCH.arenaX, MATRIARCH.arenaY);
    this.bossArt = new MatriarchRenderer(this.scene, pos.x, pos.y);
    this.bossArt.container.setDepth(10 + pos.y);
    this.fxBack.setDepth(10 + pos.y - 0.5);
    this.boss = {
      id: 'matriarch', faction: 'DRAGON', kind: 'MATRIARCH', name: MATRIARCH.name, container: this.bossArt.container,
      gx: MATRIARCH.arenaX, gy: MATRIARCH.arenaY, hp: d.hp, maxHp: d.maxHp, attack: 0, range: 0, speed: 0,
      cooldownMax: 1, cooldown: 1, damageTaken: 1, flying: false, ranged: false, backline: false, radius: 2.2,
      isMinion: false, slot: -1, dead: false, respawnAt: 0, step: null, repathIn: 0, retargetIn: 0, isBoss: true,
    };
    this.units.push(this.boss);
    for (const key of Object.keys(MATRIARCH.abilities) as Ability[]) this.bossTimers.set(key, MATRIARCH.abilities[key].every * (0.4 + Math.random() * 0.4));
    this.bossArt.setPose('roar');
    soundFx.playDragonRoar();
    soundFx.playBackgroundMusic('BOSS');
    logMessage('matriarchAwakens', { name: MATRIARCH.name });
    // The human expedition breaks in through the side tunnels: one raider per living party member
    this.humansFirst = Math.max(1, this.units.filter((u) => u.faction === 'DEMON' && !u.dead).length);
    for (let i = 0; i < this.humansFirst; i++) this.spawnAtBreach(i);
    logMessage('humansArrive', { count: this.humansFirst });
    this.startStrength.DEMON = this.units.filter((u) => u.faction === 'DEMON').reduce((s, u) => s + u.maxHp, 0);
    this.startStrength.HUMAN = this.units.filter((u) => u.faction === 'HUMAN').reduce((s, u) => s + u.maxHp, 0) * HUMANS.maxTotal;
  }

  /** Humans break in through the side tunnels, between the party and Ignara, so all three sides collide. */
  private spawnAtBreach(i: number): void {
    const b = THREE.breaches[i % THREE.breaches.length];
    const inward = b.x < LAIR_WIDTH / 2 ? 1 : -1;
    this.spawnHuman(b.x + inward * (Math.floor(i / THREE.breaches.length) % 2), b.y + (Math.random() - 0.5));
  }

  private hurtBoss(amount: number, by: Unit | null): void {
    if (!this.boss || this.boss.dead) return;
    if (by?.faction === 'DEMON') this.lastDemonHitAt = this.t;
    if (by && by.faction !== 'DRAGON' && this.boss.maxHp > 0) this.threat[by.faction] += (amount / this.boss.maxHp) * 10;
    const hp = useGameStore.getState().damageDragon(amount);
    this.boss.hp = hp;
    this.bossArt?.hit();
    if (hp <= 0) this.slay();
  }

  private slay(): void {
    if (!this.boss) return;
    this.boss.dead = true;
    this.bossArt?.setPose('dead');
    soundFx.playDragonRoar();
    soundFx.playVictory();
    const fullCredit = this.t - this.lastDemonHitAt <= MATRIARCH.creditSeconds;
    this.victory = useGameStore.getState().slayDragon(fullCredit);
    useLairHud.getState().publish({ victory: this.victory, battle: false, dragonHp: 0 });
    // The brood and the humans scatter
    for (const u of this.units) {
      if (u.faction !== 'DEMON' && !u.isBoss && !u.dead) {
        u.dead = true;
        this.scene.tweens.add({ targets: u.container, alpha: 0, duration: 600, onComplete: () => u.container.destroy() });
      }
    }
    this.victoryAt = this.t + DEATH.collapseSeconds + DEATH.dissolveSeconds + DEATH.chestSeconds;
  }

  private updateBattle(dt: number): void {
    const boss = this.boss;
    if (!boss || boss.dead) return;
    this.bossArt?.update(dt);
    const d = useGameStore.getState().dragon;
    boss.hp = d.hp;
    const phase = matriarchPhase(d.hp, d.maxHp);
    if (phase !== this.bossPhase) {
      if (this.bossPhase >= 0) logMessage('matriarchPhase', { name: MATRIARCH.name, phase: MATRIARCH.phaseNames[phase] });
      this.bossPhase = phase;
      this.bossArt?.setPose('roar');
      this.bossArt?.setRage(phase >= 3 ? 1 : phase === 2 ? 0.45 : 0);
      if (phase > 0) {
        soundFx.playDragonRoar();
        // A fresh human breach each phase keeps the fight three-way, sized to the living party
        const living = this.units.filter((u) => u.faction === 'DEMON' && !u.dead).length;
        const n = Math.ceil(living * (SCALE.phaseWaveShare[phase] ?? 0));
        if (n > 0) {
          this.humanBonus += n;
          for (let i = 0; i < n; i++) this.spawnAtBreach(this.humansSent);
          logMessage('humansReinforce', { count: n });
        }
      }
    }
    // Fallen raiders break back in after respawnSeconds, keeping at least the first breach's numbers (plus phase waves)
    const humans = this.units.filter((u) => u.faction === 'HUMAN' && !u.dead).length;
    const due = this.humanRespawns.filter((at) => this.t >= at).length;
    if (due > 0) {
      this.humanRespawns = this.humanRespawns.filter((at) => this.t < at);
      const n = Math.min(due, Math.max(0, this.humansFirst + this.humanBonus - humans));
      for (let i = 0; i < n; i++) this.spawnAtBreach(this.humansSent);
      if (n > 0) logMessage('humansReinforce', { count: n });
    }
    this.updateSides(dt);
    // Her aim: the nearest of the side she hunts
    const byDist = (a: Unit, b: Unit) => Math.hypot(a.gx - boss.gx, a.gy - boss.gy) - Math.hypot(b.gx - boss.gx, b.gy - boss.gy);
    const hostiles = this.hostilesOfBoss().sort(byDist);
    const near = hostiles.find((u) => u.faction === this.focus) ?? hostiles[0];
    if (near) {
      const a = IsometricHelper.gridToScreen(boss.gx, boss.gy), b = IsometricHelper.gridToScreen(near.gx, near.gy);
      this.bossArt?.face(b.x - a.x);
    }
    if (this.zones.some((z) => !z.done)) return;
    // Abilities: the first ready one her phase allows (heaviest first)
    const order: Ability[] = ['golem', 'summonKin', 'batSwarm', 'eruption', 'dragonBreath', 'tailWhip', 'dragonClaw'];
    for (const key of order) this.bossTimers.set(key, (this.bossTimers.get(key) ?? 0) - dt);
    if (!near) return;
    for (const key of order) {
      const ab = MATRIARCH.abilities[key];
      if (phase < ab.from || (this.bossTimers.get(key) ?? 1) > 0) continue;
      if (this.cast(key, near)) {
        this.bossTimers.set(key, ab.every);
        break;
      }
    }
  }

  private bossAttack(mult: number): number {
    return this.avg.attack * mult * lairWavePower(this.wave);
  }

  private hostilesOfBoss(): Unit[] {
    return this.units.filter((u) => !u.dead && !u.isBoss && u.faction !== 'DRAGON');
  }

  private pose(p: MatriarchPose): void {
    this.bossArt?.setPose(p);
  }

  /** Starts an ability; telegraphed ones resolve after their warning. Returns false if it can't be used now. */
  private cast(key: Ability, aim: Unit): boolean {
    const boss = this.boss!;
    const A = MATRIARCH.abilities;
    const reach = (u: Unit) => Math.hypot(u.gx - boss.gx, u.gy - boss.gy) - boss.radius <= MATRIARCH.reachTiles;
    // The claw takes whoever stands in reach when the hunted side keeps away
    const near = key === 'dragonClaw' && !reach(aim) ? this.hostilesOfBoss().find(reach) ?? aim : aim;
    const inReach = reach(near);
    const hostiles = this.hostilesOfBoss();
    const crowd = Math.min(1, hostiles.length / SCALE.crowdRef);
    const summons = (kind: CreatureKind) => this.units.filter((u) => !u.dead && u.summoned && u.kind === kind).length;
    switch (key) {
      case 'golem': {
        if (summons('GOLEM') >= A.golem.cap) return false;
        this.pose('summon');
        this.spawnCreature('GOLEM', boss.gx, boss.gy - boss.radius - 1, undefined, true);
        return true;
      }
      case 'summonKin':
      case 'batSwarm': {
        const kind: CreatureKind = key === 'summonKin' ? 'KIN' : 'BAT';
        const ab = key === 'summonKin' ? A.summonKin : A.batSwarm;
        // Brood size follows the crowd she faces (party and humans), like the route's packs
        const generals = Math.max(this.fighters.filter((f) => !f.isMinion).length, Math.ceil(hostiles.length / SCALE.summonPerHostiles));
        const room = encounterCount(ab.cap, generals) - summons(kind);
        if (room <= 0) return false;
        this.pose('summon');
        for (let i = 0; i < Math.min(room, encounterCount(ab.count, generals)); i++) this.spawnCreature(kind, boss.gx - 3 + i * 1.3, boss.gy - boss.radius - 0.5 - (i % 2), undefined, true);
        return true;
      }
      case 'eruption': {
        const ab = A.eruption;
        const tiles = Phaser.Math.Clamp(Math.round(hostiles.length * SCALE.eruptionPerHostile), SCALE.eruptionTilesMin, Math.min(ab.tiles * 3, SCALE.eruptionTilesMax));
        const targets = [...hostiles].sort(() => Math.random() - 0.5).slice(0, tiles);
        if (!targets.length) return false;
        this.pose('roar');
        const spots = targets.map((u) => ({ x: Math.round(u.gx), y: Math.round(u.gy) }));
        this.zone('eruption', ab.telegraph, (g, k) => {
          for (const s of spots) {
            const c = IsometricHelper.gridToScreen(s.x, s.y);
            g.fillStyle(0xdc2626, 0.2 + 0.5 * k);
            g.fillEllipse(c.x, c.y, TILE_WIDTH * 0.9, TILE_HEIGHT * 0.9);
          }
        }, () => {
          soundFx.playExplosion();
          for (const u of this.hostilesOfBoss()) {
            if (spots.some((s) => Math.hypot(u.gx - s.x, u.gy - s.y) <= 0.8)) this.hurt(u, this.bossAttack(ab.attack), boss);
          }
          for (const s of spots) {
            const c = IsometricHelper.gridToScreen(s.x, s.y);
            this.bolts.push({ x0: c.x, y0: c.y, x1: c.x, y1: c.y - 70, t: 0, dur: 0.45, color: 0xf97316 });
            this.burst(c.x, c.y - 6, 0xfb923c, 16, 170);
          }
        });
        return true;
      }
      case 'dragonBreath': return this.castBreath(near, crowd);
      case 'tailWhip': {
        const ab = A.tailWhip;
        const within = (u: Unit) => Math.hypot(u.gx - boss.gx, u.gy - boss.gy) - boss.radius <= ab.radius;
        // Only worth a lash when a crowd presses in (or one foe slips behind her)
        const close = hostiles.filter(within);
        if (close.length < ab.minTargets && !close.some((u) => this.isBehind(u))) return false;
        const c = IsometricHelper.gridToScreen(boss.gx, boss.gy);
        const rx = (boss.radius + ab.radius) * TILE_WIDTH * 0.5, ry = (boss.radius + ab.radius) * TILE_HEIGHT * 0.5;
        const facing = this.bossArt?.facingSign ?? 1;
        let posed = false;
        this.zone('tailWhip', ab.telegraph, (g, k) => {
          // A ring of warning around her that tightens as the tail coils
          g.lineStyle(3, 0xdc2626, 0.25 + 0.5 * k);
          g.strokeEllipse(c.x, c.y, rx * 2 * (1.08 - 0.08 * k), ry * 2 * (1.08 - 0.08 * k));
          g.fillStyle(0x7f1d1d, 0.08 + 0.14 * k);
          g.fillEllipse(c.x, c.y, rx * 2, ry * 2);
          if (!posed && k >= 1 - 0.42 / ab.telegraph) {
            posed = true;
            this.pose('tailwhip');
            soundFx.playWhipCrack();
          }
        }, () => {
          // The lash sweeps from behind her round the front
          this.whips.push({ t: 0, dur: 0.45, from: facing > 0 ? Math.PI : 0, sweep: facing > 0 ? -Math.PI * 1.15 : Math.PI * 1.15, rx, ry, cx: c.x, cy: c.y });
          const tip = this.bossArt?.tailTip() ?? c;
          this.burst(tip.x, tip.y, 0xfef3c7, 14, 220);
          for (const u of this.hostilesOfBoss()) {
            if (!within(u)) continue;
            this.hurt(u, this.bossAttack(ab.attack), boss);
            if (u.dead) continue;
            const dx = u.gx - boss.gx, dy = u.gy - boss.gy;
            const dd = Math.hypot(dx, dy) || 1;
            // Knocked away, but never off the route or into a wall
            const nx = Phaser.Math.Clamp(u.gx + (dx / dd) * ab.push, 0, LAIR_WIDTH - 1);
            const ny = Phaser.Math.Clamp(u.gy + (dy / dd) * ab.push, 0, LAIR_LENGTH - 1);
            if (u.flying || !this.blocked(Math.round(nx), Math.round(ny))) { u.gx = nx; u.gy = ny; u.step = null; this.syncPosition(u); }
          }
        });
        return true;
      }
      case 'dragonClaw': {
        if (!inReach) return false;
        const ab = A.dragonClaw;
        const cx = boss.gx + (near.gx - boss.gx) * 0.55, cy = boss.gy + (near.gy - boss.gy) * 0.55;
        let posed = false;
        this.zone('dragonClaw', ab.telegraph, (g, k) => {
          const c = IsometricHelper.gridToScreen(cx, cy);
          g.fillStyle(0x7f1d1d, 0.1 + 0.25 * k);
          g.fillEllipse(c.x, c.y, ab.radius * TILE_WIDTH, ab.radius * TILE_HEIGHT);
          // Three claw grooves scored into the floor as the warning fills
          g.lineStyle(3, 0xef4444, 0.35 + 0.5 * k);
          for (let i = -1; i <= 1; i++) {
            const ox = i * 14;
            g.lineBetween(c.x + ox - 26 * k, c.y - 12 * k + i * 4, c.x + ox + 26 * k, c.y + 12 * k + i * 4);
          }
          if (!posed && k >= 1 - 0.42 / ab.telegraph) {
            posed = true;
            this.pose('claw');
          }
        }, () => {
          soundFx.playClawSlash();
          const bossY = this.bossArt?.container.y ?? 0;
          for (const u of this.hostilesOfBoss()) {
            if (Math.hypot(u.gx - cx, u.gy - cy) > ab.radius) continue;
            this.hurt(u, this.bossAttack(ab.attack), boss);
            const p = IsometricHelper.gridToScreen(u.gx, u.gy);
            const back = p.y < bossY - 4;
            this.slashes.push({ x: p.x, y: p.y - 16, t: 0, dur: 0.32, dir: (this.bossArt?.facingSign ?? 1), back });
            this.bleed(p.x, p.y - 14, p.y, 12, back);
            if (!u.dead) { u.bleedUntil = this.t + ab.bleedSeconds; u.bleedDps = this.bossAttack(ab.bleedDps); }
          }
        });
        return true;
      }
    }
    return false;
  }

  /** A foe on the far side of her from where she faces (the tail's side). */
  private isBehind(u: Unit): boolean {
    const boss = this.boss!;
    const a = IsometricHelper.gridToScreen(boss.gx, boss.gy), b = IsometricHelper.gridToScreen(u.gx, u.gy);
    return Math.sign(b.x - a.x) === -(this.bossArt?.facingSign ?? 1);
  }

  /**
   * Dragon's Breath: aimed at the densest cluster of the side she hunts (several
   * candidate directions scored by how many foes the cone would catch); she
   * inhales through the telegraph, then pours fire from her maw down the cone.
   */
  private castBreath(near: Unit, crowd: number): boolean {
    const boss = this.boss!;
    const ab = MATRIARCH.abilities.dragonBreath;
    const half = ((ab.halfAngle + ab.crowdAngle * crowd) * Math.PI) / 180;
    const reachLen = ab.length + boss.radius;
    const hostiles = this.hostilesOfBoss();
    const inCone = (u: Unit, ux: number, uy: number) => {
      const rx = u.gx - boss.gx, ry = u.gy - boss.gy;
      const along = rx * ux + ry * uy;
      if (along <= boss.radius * 0.5 || along > reachLen) return false;
      return Math.abs(Math.atan2(-rx * uy + ry * ux, along)) <= half;
    };
    const hunted = hostiles.filter((u) => u.faction === this.focus);
    const candidates = [near, ...(hunted.length ? hunted : hostiles)].slice(0, SCALE.breathCandidates + 1);
    let ux = 0, uy = 1, best = -1;
    for (const c of candidates) {
      const dx = c.gx - boss.gx, dy = c.gy - boss.gy;
      const len = Math.hypot(dx, dy) || 1;
      const n = hostiles.filter((u) => inCone(u, dx / len, dy / len)).length;
      if (n > best) { best = n; ux = dx / len; uy = dy / len; }
    }
    if (best <= 0) return false;
    // The cone as floor points: from her edge out to its reach, fanning by `half`
    const conePts = (scale: number) => {
      const pts: Phaser.Geom.Point[] = [];
      const a0 = Math.atan2(uy, ux);
      const r0 = boss.radius * 0.6;
      for (const a of [a0 - half * 0.35, a0 + half * 0.35]) {
        const p = IsometricHelper.gridToScreen(boss.gx + Math.cos(a) * r0, boss.gy + Math.sin(a) * r0);
        pts.push(new Phaser.Geom.Point(p.x, p.y));
      }
      for (let i = 0; i <= 10; i++) {
        const a = a0 + half - (2 * half * i) / 10;
        const p = IsometricHelper.gridToScreen(boss.gx + Math.cos(a) * reachLen * scale, boss.gy + Math.sin(a) * reachLen * scale);
        pts.push(new Phaser.Geom.Point(p.x, p.y));
      }
      return pts;
    };
    const fill = conePts(1);
    const bossY = this.bossArt?.container.y ?? 0;
    const tip = IsometricHelper.gridToScreen(boss.gx + ux * reachLen, boss.gy + uy * reachLen);
    const back = tip.y < bossY - 4;
    this.bossArt?.setPose('breath', ab.telegraph + ab.duration + 0.35, ab.telegraph);
    this.zone('breathWarn', ab.telegraph, (g, k) => {
      g.fillStyle(0x7f1d1d, 0.12 + 0.22 * k);
      g.fillPoints(fill, true);
      // The edge creeps outward as she draws breath
      g.lineStyle(2, 0xf97316, 0.4 + 0.5 * k);
      g.strokePoints(conePts(0.3 + 0.7 * k), true);
    }, () => {
      soundFx.playFireBreath(ab.duration);
      let scorchIn = 0;
      this.zone('breath', ab.duration, (g, k, dt) => {
        g.fillStyle(0x9a3412, 0.28 * (1 - k * 0.5));
        g.fillPoints(fill, true);
        this.floorGlow.fillStyle(0xf97316, 0.18 * (1 - k * 0.6));
        this.floorGlow.fillPoints(fill, true);
        // Flames pour from her maw to random spots in the cone
        const mouth = this.bossArt?.mouth() ?? IsometricHelper.gridToScreen(boss.gx, boss.gy);
        const n = Math.floor(70 * dt + Math.random());
        for (let i = 0; i < n * 2 && this.flames.length < 420; i++) {
          const a = Math.atan2(uy, ux) + (Math.random() * 2 - 1) * half;
          const r = boss.radius * 0.6 + Math.sqrt(Math.random()) * ab.length;
          const p = IsometricHelper.gridToScreen(boss.gx + Math.cos(a) * r, boss.gy + Math.sin(a) * r);
          this.flames.push({ x0: mouth.x, y0: mouth.y, x1: p.x, y1: p.y - 6, t: 0, life: 0.45 + Math.random() * 0.35, size: 7 + Math.random() * 9, back });
        }
        scorchIn -= dt;
        if (scorchIn <= 0) {
          scorchIn = 0.12;
          const a = Math.atan2(uy, ux) + (Math.random() * 2 - 1) * half * 0.9;
          const r = boss.radius + Math.random() * ab.length;
          const p = IsometricHelper.gridToScreen(boss.gx + Math.cos(a) * r, boss.gy + Math.sin(a) * r);
          this.decal(p.x, p.y, 10 + Math.random() * 14, ab.scorchSeconds, 'SCORCH');
        }
        // Damage per second while the breath burns (frame-rate independent), and a lingering burn
        for (const u of this.hostilesOfBoss()) {
          if (!inCone(u, ux, uy)) continue;
          this.hurt(u, this.bossAttack(ab.dps) * dt, boss);
          if (!u.dead) { u.burnUntil = this.t + ab.burnSeconds; u.burnDps = this.bossAttack(ab.burnDps); }
        }
      }, () => {});
    });
    return true;
  }

  /** Bleeding and burning tick on their own, with drips and licks of flame. */
  private tickDots(u: Unit, dt: number): void {
    const boss = this.boss && !this.boss.dead ? this.boss : null;
    if (u.bleedUntil !== undefined && this.t < u.bleedUntil) {
      this.hurt(u, (u.bleedDps ?? 0) * dt, boss);
      if (Math.random() < dt * 5) {
        const p = IsometricHelper.gridToScreen(u.gx, u.gy);
        this.bleed(p.x, p.y - 12, p.y, 2, false);
      }
    }
    if (u.burnUntil !== undefined && this.t < u.burnUntil) {
      this.hurt(u, (u.burnDps ?? 0) * dt, boss);
      if (Math.random() < dt * 9) {
        const p = IsometricHelper.gridToScreen(u.gx, u.gy);
        const x = p.x + (Math.random() - 0.5) * 12;
        this.flames.push({ x0: x, y0: p.y - 4, x1: x + (Math.random() - 0.5) * 6, y1: p.y - 26, t: 0, life: 0.35, size: 4 + Math.random() * 3, back: false });
      }
    }
  }

  /** Blood spray: drops arc out and fall to the floor, where they leave splats. */
  private bleed(x: number, y: number, floor: number, n: number, back: boolean): void {
    for (let i = 0; i < n && this.drops.length < 300; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const v = 60 + Math.random() * 120;
      this.drops.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, floor: floor + (Math.random() - 0.5) * 10, back });
    }
  }

  private decal(x: number, y: number, r: number, life: number, kind: Decal['kind']): void {
    if (this.decals.length > 160) this.decals.shift();
    this.decals.push({ x, y, r, t: 0, life, kind, seed: Math.random() * 10 });
  }

  /** A telegraphed area: drawn while it warns (k 0→1), resolved once when the warning runs out. */
  private zone(kind: string, warn: number, draw: Zone['draw'], resolve: () => void): void {
    this.zones.push({ kind, t: 0, warn: Math.max(0.05, warn), done: false, draw, resolve });
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  private drawHp(u: Unit): void {
    const g = u.hpBar;
    if (!g) return;
    g.clear();
    if (u.hp >= u.maxHp) return;
    const w = u.faction === 'DEMON' ? (u.isMinion ? 14 : 20) : u.kind === 'GOLEM' ? 30 : 16;
    const top = u.kind === 'GOLEM' ? -62 : u.isMinion ? -30 : -40;
    const color = u.faction === 'DEMON' ? (u.isMinion ? 0x86efac : 0x4ade80) : u.faction === 'HUMAN' ? 0x38bdf8 : 0xf97316;
    g.fillStyle(0x000000, 0.7);
    g.fillRect(-w / 2 - 1, top - 1, w + 2, 4);
    g.fillStyle(color, 1);
    g.fillRect(-w / 2, top, w * Math.max(0, u.hp / u.maxHp), 2);
  }

  private drawFx(dt: number): void {
    const g = this.fx;
    const glow = this.glowFx;
    const floor = this.floorFx;
    const back = this.fxBack;
    g.clear();
    glow.clear();
    floor.clear();
    back.clear();
    this.floorGlow.clear();
    this.drawDecals(floor, dt);
    // Telegraphs live on the floor, under every unit and under Ignara
    for (const z of this.zones) {
      if (z.done) continue;
      z.t += dt;
      const k = Math.min(1, z.t / z.warn);
      z.draw(floor, k, dt);
      if (z.t >= z.warn) {
        z.done = true;
        if (!this.boss?.dead) z.resolve();
      }
    }
    this.zones = this.zones.filter((z) => !z.done);
    // Bolts: a glowing head with a fading trail
    for (const b of this.bolts) {
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      const x = b.x0 + (b.x1 - b.x0) * k, y = b.y0 + (b.y1 - b.y0) * k;
      const tk = Math.max(0, k - 0.35);
      const tx = b.x0 + (b.x1 - b.x0) * tk, ty = b.y0 + (b.y1 - b.y0) * tk;
      glow.lineStyle(6, b.color, 0.25 * (1 - k * 0.5));
      glow.lineBetween(tx, ty, x, y);
      glow.fillStyle(b.color, 0.35);
      glow.fillCircle(x, y, 7);
      g.lineStyle(2, b.color, 0.9);
      g.lineBetween(tx, ty, x, y);
      g.fillStyle(0xffffff, 0.95);
      g.fillCircle(x, y, 2);
    }
    this.bolts = this.bolts.filter((b) => b.t < b.dur);
    // Sparks: short-lived embers from eruptions, slams and breath
    for (const s of this.sparks) {
      s.t += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 260 * dt;
      const a = 1 - s.t / s.life;
      glow.fillStyle(s.color, 0.8 * a);
      glow.fillCircle(s.x, s.y, 2.5 * a + 0.8);
    }
    this.sparks = this.sparks.filter((s) => s.t < s.life);
    this.drawFlames(dt, g, back, glow);
    this.drawBlood(dt, g, back);
    this.drawSlashes(dt, g, back);
    this.drawWhips(dt, g, back, glow);
  }

  private drawDecals(floor: Phaser.GameObjects.Graphics, dt: number): void {
    for (const d of this.decals) {
      d.t += dt;
      const a = Math.min(1, (d.life - d.t) / 1.5);
      if (d.kind === 'BLOOD') {
        floor.fillStyle(0x450a0a, 0.75 * a);
        floor.fillEllipse(d.x, d.y, d.r * 2, d.r);
        floor.fillStyle(0x7f1d1d, 0.6 * a);
        floor.fillEllipse(d.x + Math.sin(d.seed) * d.r * 0.4, d.y - 0.5, d.r * 1.1, d.r * 0.5);
        floor.fillStyle(0x450a0a, 0.7 * a);
        for (let i = 0; i < 3; i++) floor.fillCircle(d.x + Math.cos(d.seed + i * 2.1) * d.r * 1.3, d.y + Math.sin(d.seed + i * 2.1) * d.r * 0.6, 1.2);
      } else {
        floor.fillStyle(0x0c0a09, 0.55 * a);
        floor.fillEllipse(d.x, d.y, d.r * 2, d.r);
        // Embers still glowing in the scorch for a moment
        const hot = Math.max(0, 1 - d.t / 2.5);
        if (hot > 0) {
          this.floorGlow.fillStyle(0xf97316, 0.35 * hot);
          this.floorGlow.fillEllipse(d.x, d.y, d.r * 1.1, d.r * 0.5);
        }
      }
    }
    this.decals = this.decals.filter((d) => d.t < d.life);
  }

  private drawFlames(dt: number, front: Phaser.GameObjects.Graphics, back: Phaser.GameObjects.Graphics, glow: Phaser.GameObjects.Graphics): void {
    for (const f of this.flames) {
      f.t += dt;
      const k = Math.min(1, f.t / f.life);
      // Arcs a little as it flies, swelling and cooling from white-hot to deep red
      const x = f.x0 + (f.x1 - f.x0) * k;
      const y = f.y0 + (f.y1 - f.y0) * k - Math.sin(k * Math.PI) * 10;
      const color = FLAME_RAMP[Math.min(FLAME_RAMP.length - 1, Math.floor(k * FLAME_RAMP.length))];
      const r = f.size * (0.45 + k * 0.9);
      const a = k < 0.8 ? 0.85 : (1 - k) * 4.25;
      const layer = f.back ? back : front;
      layer.fillStyle(color, a * 0.8);
      layer.fillCircle(x, y, r);
      if (k > 0.7) {
        layer.fillStyle(0x3f3f46, 0.25 * (1 - k) * 3);
        layer.fillCircle(x + 2, y - r * 0.8, r * 0.8);
      }
      if (!f.back) {
        glow.fillStyle(color, 0.22 * a);
        glow.fillCircle(x, y, r * 1.7);
      }
    }
    this.flames = this.flames.filter((f) => f.t < f.life);
  }

  private drawBlood(dt: number, front: Phaser.GameObjects.Graphics, back: Phaser.GameObjects.Graphics): void {
    for (const d of this.drops) {
      d.vy += 520 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      const layer = d.back ? back : front;
      layer.fillStyle(0x991b1b, 0.95);
      layer.fillEllipse(d.x, d.y, 2.6, 3.4);
      if (d.vy > 0 && d.y >= d.floor) this.decal(d.x, d.floor, 2.5 + Math.random() * 4, 5, 'BLOOD');
    }
    this.drops = this.drops.filter((d) => !(d.vy > 0 && d.y >= d.floor));
  }

  private drawSlashes(dt: number, front: Phaser.GameObjects.Graphics, back: Phaser.GameObjects.Graphics): void {
    for (const s of this.slashes) {
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      const layer = s.back ? back : front;
      // Three rakes drawn fast, then fading: white edge over a blood-red cut
      const grow = Math.min(1, k / 0.35);
      for (let i = -1; i <= 1; i++) {
        const ox = i * 7, oy = i * 5;
        const x0 = s.x + ox - 18 * s.dir, y0 = s.y + oy - 16;
        const x1 = x0 + 36 * s.dir * grow, y1 = y0 + 32 * grow;
        layer.lineStyle(5, 0x7f1d1d, 0.9 * (1 - k));
        layer.lineBetween(x0, y0, x1, y1);
        layer.lineStyle(2, 0xfff1f2, (1 - k));
        layer.lineBetween(x0, y0, x1, y1);
      }
    }
    this.slashes = this.slashes.filter((s) => s.t < s.dur);
  }

  private drawWhips(dt: number, front: Phaser.GameObjects.Graphics, back: Phaser.GameObjects.Graphics, glow: Phaser.GameObjects.Graphics): void {
    for (const w of this.whips) {
      w.t += dt;
      const k = Math.min(1, w.t / w.dur);
      // The sweeping arc: a bright head with a fading tail; the half in front of her draws over her
      const head = w.from + w.sweep * Math.min(1, k * 1.4);
      for (let i = 0; i < 14; i++) {
        const a = head - (w.sweep * i) / 26;
        const a2 = head - (w.sweep * (i + 1)) / 26;
        const p1 = { x: w.cx + Math.cos(a) * w.rx, y: w.cy + Math.sin(a) * w.ry };
        const p2 = { x: w.cx + Math.cos(a2) * w.rx, y: w.cy + Math.sin(a2) * w.ry };
        const fade = (1 - i / 14) * (1 - k);
        const layer = p1.y < w.cy ? back : front;
        layer.lineStyle(7 * (1 - i / 14) + 2, 0xfef3c7, 0.8 * fade);
        layer.lineBetween(p1.x, p1.y - 8, p2.x, p2.y - 8);
        if (p1.y >= w.cy) {
          glow.lineStyle(12, 0xfbbf24, 0.2 * fade);
          glow.lineBetween(p1.x, p1.y - 8, p2.x, p2.y - 8);
        }
      }
    }
    this.whips = this.whips.filter((w) => w.t < w.dur);
  }

  /** A burst of embers at a screen point (capped so a crowded fight stays cheap). */
  private burst(x: number, y: number, color: number, n: number, speed = 140): void {
    for (let i = 0; i < n && this.sparks.length < 400; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - speed * 0.8, t: 0, life: 0.5 + Math.random() * 0.6, color });
    }
  }

  private diamond(x: number, y: number, color: number, alpha: number, inset = 0, g: Phaser.GameObjects.Graphics = this.ground): void {
    const c = IsometricHelper.gridToScreen(x, y);
    const hw = TILE_WIDTH / 2 - inset * 2;
    const hh = TILE_HEIGHT / 2 - inset;
    g.fillStyle(color, alpha);
    g.fillPoints([
      new Phaser.Geom.Point(c.x, c.y - hh), new Phaser.Geom.Point(c.x + hw, c.y),
      new Phaser.Geom.Point(c.x, c.y + hh), new Phaser.Geom.Point(c.x - hw, c.y),
    ], true);
  }

  /** A shaded boulder: shadow, dark body, lit cap and a highlight. */
  private boulder(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
    g.fillStyle(0x000000, 0.45);
    g.fillEllipse(x + 2, y + r * 0.5, r * 2.2, r * 0.9);
    g.fillStyle(0x3a332f, 1);
    g.fillEllipse(x, y - r * 0.3, r * 2, r * 1.6);
    g.fillStyle(0x6b625b, 1);
    g.fillEllipse(x - r * 0.15, y - r * 0.55, r * 1.5, r * 1.0);
    g.fillStyle(0xa8a29e, 0.8);
    g.fillEllipse(x - r * 0.4, y - r * 0.8, r * 0.6, r * 0.35);
  }

  /** Telegraph → active → resolved, readable from the colours alone. */
  private drawObstacles(): void {
    const g = this.ground;
    const glow = this.glowGround;
    g.clear();
    glow.clear();
    const t = this.t;
    const pulse = 0.5 + 0.5 * Math.sin(t * 8);
    const cleared = this.cleared;
    for (const o of LAIR_OBSTACLES) {
      for (let y = o.y; y < o.y + o.h; y++) {
        for (let x = o.x; x < o.x + o.w; x++) {
          const c = IsometricHelper.gridToScreen(x, y);
          const n = Math.abs(Math.sin(x * 12.9898 + y * 78.233)) % 1;
          if (o.type === 'MAGMA') {
            if ((o.gap ?? []).includes(x)) {
              // Basalt stepping stones over the channel
              this.diamond(x, y, 0x1c1714, 1);
              this.diamond(x, y, 0x57534e, 1, 4);
              this.diamond(x, y, 0x78716c, 0.6, 9);
              continue;
            }
            const phase = magmaPhase(o, t);
            if (phase === 'SAFE') {
              // Cooling crust, still glowing in its seams
              this.diamond(x, y, 0x1f0d08, 1);
              this.diamond(x, y, 0x3b1a10, 1, 3);
              g.lineStyle(1.5, 0xea580c, 0.35 + 0.15 * Math.sin(t * 2 + n * 6));
              g.lineBetween(c.x - 18, c.y - 2 + n * 4, c.x + 4, c.y + 3);
              g.lineBetween(c.x + 4, c.y + 3, c.x + 16, c.y - 4);
            } else if (phase === 'WARN') {
              this.diamond(x, y, 0x3b1a10, 1);
              this.diamond(x, y, 0xc2410c, 0.45 + 0.4 * pulse, 4);
              this.diamond(x, y, 0xf97316, 0.5 * pulse, 0, glow);
            } else {
              this.diamond(x, y, 0xb45309, 1);
              this.diamond(x, y, 0xf97316, 1, 3);
              this.diamond(x, y, 0xfde047, 0.55 + 0.3 * Math.sin(t * 5 + n * 9), 8);
              this.diamond(x, y, 0xf97316, 0.6, 0, glow);
              // Bubbles rising and popping
              const b = (t * 1.3 + n * 5) % 1;
              g.fillStyle(0xfef08a, 1 - b);
              g.fillCircle(c.x - 10 + n * 20, c.y - 2, 1.5 + b * 4);
              g.lineStyle(1, 0x7c2d12, 0.6 * (1 - b));
              g.strokeCircle(c.x - 10 + n * 20, c.y - 2, 1.5 + b * 4);
            }
          } else if (o.type === 'ROCKFALL') {
            const phase = rockfallPhase(o, t);
            if (phase === 'WARN') {
              // Shadow of the falling rock grows, dust trickles from above
              this.diamond(x, y, 0xdc2626, 0.18 + 0.3 * pulse, 3);
              g.fillStyle(0x000000, 0.25 + 0.3 * pulse);
              g.fillEllipse(c.x, c.y, 26 + 14 * pulse, 12 + 6 * pulse);
              for (let i = 0; i < 3; i++) {
                const k = (t * 1.8 + i * 0.33 + n) % 1;
                g.fillStyle(0xa8a29e, 0.7 * (1 - k));
                g.fillCircle(c.x - 8 + i * 8, c.y - 80 + k * 76, 1.6);
              }
            } else if (phase === 'BLOCKED') {
              this.diamond(x, y, 0x1c1917, 0.85, 1);
              this.boulder(g, c.x - 7, c.y + 1, 9 + n * 3);
              this.boulder(g, c.x + 8, c.y - 3, 7 + n * 2);
            }
          } else if (o.type === 'BRIDGE') {
            const isBridge = (o.bridge ?? []).includes(x);
            if (isBridge && cleared.includes(o.id)) {
              // Repaired span: dressed stone slabs with a dark joint
              this.diamond(x, y, 0x1c1917, 1);
              this.diamond(x, y, 0x78716c, 1, 2);
              this.diamond(x, y, 0xa8a29e, 0.55, 8);
              g.lineStyle(1, 0x292524, 0.8);
              g.lineBetween(c.x - TILE_WIDTH / 4, c.y - TILE_HEIGHT / 4, c.x + TILE_WIDTH / 4, c.y + TILE_HEIGHT / 4);
            } else {
              // The chasm: black depths with lava glowing far below
              this.diamond(x, y, 0x020101, 1);
              this.diamond(x, y, 0x7c2d12, 0.25 + 0.1 * Math.sin(t * 1.5 + n * 6), 8);
              this.diamond(x, y, 0xf97316, 0.12, 6, glow);
              if (isBridge) {
                // Broken slab, filling in as the party works on it
                const work = (this.bridgeWork.get(o.id) ?? 0) / (o.work ?? 50);
                this.diamond(x, y, 0x57534e, 0.25 + work * 0.7, Math.max(2, 10 - work * 8));
              }
            }
          } else if (o.type === 'GATE' && !cleared.includes(o.id)) {
            // Obsidian portcullis with molten runes
            const hTop = 52;
            this.diamond(x, y, 0x0c0a09, 1);
            g.fillStyle(0x1c1917, 1);
            g.fillRect(c.x - TILE_WIDTH / 4, c.y - hTop, TILE_WIDTH / 2, hTop);
            g.fillStyle(0x292524, 1);
            g.fillRect(c.x - TILE_WIDTH / 4, c.y - hTop, TILE_WIDTH / 2, 6);
            g.lineStyle(3, 0x44403c, 1);
            for (let i = 1; i < 4; i++) g.lineBetween(c.x - TILE_WIDTH / 4 + i * (TILE_WIDTH / 8), c.y - hTop + 6, c.x - TILE_WIDTH / 4 + i * (TILE_WIDTH / 8), c.y);
            g.fillStyle(0xf97316, 0.6 + 0.35 * pulse);
            g.fillRect(c.x - 3, c.y - 38, 6, 6);
            g.fillRect(c.x - 1, c.y - 30, 2, 14);
            glow.fillStyle(0xf97316, 0.25 + 0.2 * pulse);
            glow.fillCircle(c.x, c.y - 30, 12);
          }
        }
      }
      if (o.type === 'GATE' && !cleared.includes(o.id) && !guardianOf(o.id)) {
        const max = o.hp ?? 1000;
        const hp = this.gateHp.get(o.id) ?? max;
        if (hp < max) {
          const c = IsometricHelper.gridToScreen(o.x + o.w / 2, o.y);
          g.fillStyle(0x000000, 0.7);
          g.fillRect(c.x - 41, c.y - 69, 82, 6);
          g.fillStyle(0xf97316, 1);
          g.fillRect(c.x - 40, c.y - 68, 80 * (hp / max), 4);
        }
      }
    }
  }

  /** Centre of the living party in grid units (camera follow); the arena once the battle is on. */
  centroid(): { x: number; y: number } {
    const alive = this.units.filter((u) => u.faction === 'DEMON' && !u.dead);
    if (!alive.length) return { x: LAIR_WIDTH / 2, y: CHECKPOINTS[useGameStore.getState().lairProgress.checkpoint] ?? 0 };
    const c = { x: alive.reduce((s, u) => s + u.gx, 0) / alive.length, y: alive.reduce((s, u) => s + u.gy, 0) / alive.length };
    return this.battle && this.boss ? { x: (c.x + this.boss.gx) / 2, y: (c.y + this.boss.gy) / 2 } : c;
  }
}
