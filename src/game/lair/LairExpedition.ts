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
import {
  CHECKPOINTS, COMBAT, CREATURES, HUMANS, LAIR_CONFIG, LAIR_ENCOUNTERS, LAIR_LENGTH, LAIR_OBSTACLES, LAIR_WIDTH, MATRIARCH, PARTY,
  blockingRow, creatureStats, encounterCount, guardianOf, inRect, isStaticBlocked, lairFighters, lairWavePower,
  magmaPhase, matriarchMaxHp, matriarchPhase, partyAverage, rockfallPhase,
  type CreatureKind, type LairEncounter, type LairFighter, type LairObstacle,
} from '../../state/lairExpedition';
import { nextStep } from './lairNav';
import { useLairHud } from './lairHud';
import { MatriarchRenderer, type MatriarchPose } from './MatriarchRenderer';

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
}

interface Bolt { x0: number; y0: number; x1: number; y1: number; t: number; dur: number; color: number }
interface Zone { kind: string; t: number; warn: number; done: boolean; draw: (g: Phaser.GameObjects.Graphics, k: number, dt: number) => void; resolve: () => void }

/** Columns the formation fills, centre-out, so the party funnels toward the route's middle. */
const SLOT_COLUMNS = [4, 5, 3, 6, 2, 7, 1, 8];
const HOSTILE: Record<Faction, Faction[]> = { DEMON: ['DRAGON', 'HUMAN'], DRAGON: ['DEMON', 'HUMAN'], HUMAN: ['DEMON', 'DRAGON'] };
const BOLT_COLOR: Record<Faction, number> = { DEMON: 0xc084fc, DRAGON: 0xf97316, HUMAN: 0x7dd3fc };
type Ability = keyof typeof MATRIARCH.abilities;

/**
 * The expedition (Phases 4–6): every General and its minions walk the lair
 * as one formation behind an advancing front, through rockfalls, magma
 * pulses, broken bridges and the creatures of Ignara's brood (bats, dragon
 * kin, the Magma Golem guarding her gate). At the chamber the three-way
 * battle starts: the party, the human expedition breaking in from the far
 * side, and Ignara with her summons, all mutually hostile. Her HP lives in
 * the store and only ever goes down. The fallen return at the last
 * checkpoint. Only HP bars float over units; everything else is narrated in
 * the activity log.
 */
export class LairExpedition {
  private units: Unit[] = [];
  private ground: Phaser.GameObjects.Graphics;
  private fx: Phaser.GameObjects.Graphics;
  private bolts: Bolt[] = [];
  private zones: Zone[] = [];
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

  constructor(private scene: Phaser.Scene) {
    this.ground = scene.add.graphics().setDepth(1);
    this.fx = scene.add.graphics().setDepth(100000);
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
    if (summoned) u.expiresAt = this.t + MATRIARCH.summonLifetime;
    if (def.slam) u.slamIn = def.slam.every;
    if (kind === 'GOLEM') u.radius = 0.7;
    this.place(u, { x: Phaser.Math.Clamp(gx, 0, LAIR_WIDTH - 1), y: Phaser.Math.Clamp(gy, 0, LAIR_LENGTH - 1) });
    return u;
  }

  /** A human raider from the wave pool open at this wave, sized to the party (see humans in dragonsLair.json). */
  private spawnHuman(gx: number, gy: number): void {
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
    this.place(u, { x: Phaser.Math.Clamp(Math.round(gx), 0, LAIR_WIDTH - 1), y: gy });
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
      if (this.spawnedEncounters.has(e.id) || this.cleared.includes(e.id) || this.frontY < e.trigger) continue;
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
      if (this.cleared.includes(id)) continue;
      if (this.units.some((u) => u.encounter === id && !u.dead)) continue;
      const store = useGameStore.getState();
      store.clearLairObstacle(id);
      const e = LAIR_ENCOUNTERS.find((x) => x.id === id);
      if (e?.guardianOf) {
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
    if (guard && !this.cleared.includes(guard.id)) {
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

  private pickTarget(u: Unit): Unit | undefined {
    const foes = this.units.filter((o) => !o.dead && HOSTILE[u.faction].includes(o.faction));
    if (!foes.length) return undefined;
    // Bats dive past the front line for the party's rear
    if (u.backline) {
      const demons = foes.filter((o) => o.faction === 'DEMON');
      if (demons.length) {
        const rear = demons.reduce((a, b) => (a.gy < b.gy ? a : b));
        const nearOther = foes.filter((o) => o.faction !== 'DEMON').find((o) => this.dist(u, o) < 1.5);
        return nearOther ?? rear;
      }
    }
    // Her battle: the Generals go for Ignara while their minions hold off everything else
    if (this.battle && u.faction === 'DEMON' && !u.isMinion && this.boss && !this.boss.dead) return this.boss;
    const aggro = u.faction === 'DEMON' && !this.battle ? COMBAT.aggroTiles : 99;
    let best: Unit | undefined;
    let bestD = aggro;
    for (const o of foes) {
      const d = this.dist(u, o);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
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
    if (u.isBoss) {
      this.hurtBoss(amount, by);
      return;
    }
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
      this.scene.tweens.add({ targets: u.container, alpha: 0, duration: 400, onComplete: () => u.container.destroy() });
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
    // The human expedition breaks in from the far side: one raider per living party member
    this.humansFirst = Math.max(1, this.units.filter((u) => u.faction === 'DEMON' && !u.dead).length);
    for (let i = 0; i < this.humansFirst; i++) this.spawnHuman(0.5 + (i % LAIR_WIDTH), HUMANS.spawnY - (Math.floor(i / LAIR_WIDTH) % 3));
    logMessage('humansArrive', { count: this.humansFirst });
  }

  private hurtBoss(amount: number, by: Unit | null): void {
    if (!this.boss || this.boss.dead) return;
    if (by?.faction === 'DEMON') this.lastDemonHitAt = this.t;
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
    this.victoryAt = this.t + 6;
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
      if (phase > 0) soundFx.playDragonRoar();
    }
    // Human reinforcements, bounded
    const humans = this.units.filter((u) => u.faction === 'HUMAN' && !u.dead).length;
    const cap = Math.round(this.humansFirst * HUMANS.maxTotal);
    if (humans < this.humansFirst * HUMANS.reinforceBelow && this.humansSent < cap) {
      const n = Math.min(cap - this.humansSent, Math.ceil(this.humansFirst / 2));
      for (let i = 0; i < n; i++) this.spawnHuman(0.5 + (i % LAIR_WIDTH), HUMANS.spawnY);
      logMessage('humansReinforce', { count: n });
    }
    // Face whoever is nearest
    const near = this.units.filter((u) => !u.dead && !u.isBoss && u.faction !== 'DRAGON')
      .sort((a, b) => Math.hypot(a.gx - boss.gx, a.gy - boss.gy) - Math.hypot(b.gx - boss.gx, b.gy - boss.gy))[0];
    if (near) {
      const a = IsometricHelper.gridToScreen(boss.gx, boss.gy), b = IsometricHelper.gridToScreen(near.gx, near.gy);
      this.bossArt?.face(b.x - a.x);
    }
    if (this.zones.some((z) => !z.done)) return;
    // Abilities: the first ready one her phase allows (heaviest first)
    const order: Ability[] = ['golem', 'summonKin', 'batSwarm', 'eruption', 'fireBreath', 'wingGust', 'bite', 'claw'];
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
  private cast(key: Ability, near: Unit): boolean {
    const boss = this.boss!;
    const A = MATRIARCH.abilities;
    const inReach = Math.hypot(near.gx - boss.gx, near.gy - boss.gy) - boss.radius <= MATRIARCH.reachTiles;
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
        // Brood size follows the party's size, like the route's packs
        const generals = this.fighters.filter((f) => !f.isMinion).length;
        const room = encounterCount(ab.cap, generals) - summons(kind);
        if (room <= 0) return false;
        this.pose('summon');
        for (let i = 0; i < Math.min(room, encounterCount(ab.count, generals)); i++) this.spawnCreature(kind, boss.gx - 3 + i * 1.3, boss.gy - boss.radius - 0.5 - (i % 2), undefined, true);
        return true;
      }
      case 'eruption': {
        const ab = A.eruption;
        const targets = this.hostilesOfBoss().sort(() => Math.random() - 0.5).slice(0, ab.tiles);
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
            this.bolts.push({ x0: c.x, y0: c.y, x1: c.x, y1: c.y - 60, t: 0, dur: 0.5, color: 0xf97316 });
          }
        });
        return true;
      }
      case 'fireBreath': {
        const ab = A.fireBreath;
        // A strip from her toward the target, along the grid
        const dx = near.gx - boss.gx, dy = near.gy - boss.gy;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const inStrip = (u: Unit) => {
          const rx = u.gx - boss.gx, ry = u.gy - boss.gy;
          const along = rx * ux + ry * uy;
          const across = Math.abs(-rx * uy + ry * ux);
          return along > 0 && along < ab.length + boss.radius && across <= ab.width / 2 + 0.3;
        };
        const drawStrip = (g: Phaser.GameObjects.Graphics, color: number, alpha: number) => {
          const pts = [[-ab.width / 2, boss.radius * 0.6], [ab.width / 2, boss.radius * 0.6], [ab.width / 2, ab.length + boss.radius], [-ab.width / 2, ab.length + boss.radius]]
            .map(([a, b]) => IsometricHelper.gridToScreen(boss.gx + ux * b - uy * a, boss.gy + uy * b + ux * a));
          g.fillStyle(color, alpha);
          g.fillPoints(pts.map((p) => new Phaser.Geom.Point(p.x, p.y)), true);
        };
        this.pose('breath');
        this.zone('breathWarn', ab.telegraph, (g, k) => drawStrip(g, 0xdc2626, 0.15 + 0.3 * k), () => {
          soundFx.playLaser();
          // The breath burns for its duration
          this.zone('breath', ab.duration, (g, k, dt) => {
            drawStrip(g, 0xf97316, 0.55 - 0.2 * k);
            // Damage per second while the breath burns (frame-rate independent)
            for (const u of this.hostilesOfBoss()) if (inStrip(u)) this.hurt(u, this.bossAttack(ab.dps) * dt, boss);
          }, () => {});
        });
        return true;
      }
      case 'wingGust': {
        const ab = A.wingGust;
        this.pose('gust');
        this.zone('gust', ab.telegraph, (g, k) => {
          const c = IsometricHelper.gridToScreen(boss.gx, boss.gy);
          g.lineStyle(4, 0xfef3c7, 0.2 + 0.5 * k);
          g.strokeEllipse(c.x, c.y, (boss.radius + ab.radius) * 2 * TILE_WIDTH * 0.5, (boss.radius + ab.radius) * 2 * TILE_HEIGHT * 0.5);
        }, () => {
          for (const u of this.hostilesOfBoss()) {
            const dx = u.gx - boss.gx, dy = u.gy - boss.gy;
            const dd = Math.hypot(dx, dy) || 1;
            if (dd - boss.radius > ab.radius) continue;
            this.hurt(u, this.bossAttack(ab.attack), boss);
            if (u.dead) continue;
            // Blown back, but never off the route or into a wall
            const nx = Phaser.Math.Clamp(u.gx + (dx / dd) * ab.push, 0, LAIR_WIDTH - 1);
            const ny = Phaser.Math.Clamp(u.gy + (dy / dd) * ab.push, 0, LAIR_LENGTH - 1);
            if (u.flying || !this.blocked(Math.round(nx), Math.round(ny))) { u.gx = nx; u.gy = ny; u.step = null; this.syncPosition(u); }
          }
        });
        return true;
      }
      case 'bite': {
        if (!inReach) return false;
        const ab = A.bite;
        this.pose('bite');
        const victim = near;
        this.zone('bite', ab.telegraph, (g, k) => {
          const c = IsometricHelper.gridToScreen(victim.gx, victim.gy);
          g.lineStyle(3, 0xdc2626, 0.4 + 0.5 * k);
          g.strokeEllipse(c.x, c.y, TILE_WIDTH * 0.8, TILE_HEIGHT * 0.8);
        }, () => {
          if (!victim.dead && Math.hypot(victim.gx - boss.gx, victim.gy - boss.gy) - boss.radius <= MATRIARCH.reachTiles + 0.5) this.hurt(victim, this.bossAttack(ab.attack), boss);
        });
        return true;
      }
      case 'claw': {
        if (!inReach) return false;
        const ab = A.claw;
        this.pose('claw');
        const cx = boss.gx + (near.gx - boss.gx) * 0.5, cy = boss.gy + (near.gy - boss.gy) * 0.5;
        this.zone('claw', ab.telegraph, (g, k) => {
          const c = IsometricHelper.gridToScreen(cx, cy);
          g.fillStyle(0xdc2626, 0.12 + 0.3 * k);
          g.fillEllipse(c.x, c.y, ab.radius * TILE_WIDTH, ab.radius * TILE_HEIGHT);
        }, () => {
          for (const u of this.hostilesOfBoss()) if (Math.hypot(u.gx - cx, u.gy - cy) <= ab.radius) this.hurt(u, this.bossAttack(ab.attack), boss);
        });
        return true;
      }
    }
    return false;
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
    g.clear();
    for (const z of this.zones) {
      if (z.done) continue;
      z.t += dt;
      const k = Math.min(1, z.t / z.warn);
      z.draw(g, k, dt);
      if (z.t >= z.warn) {
        z.done = true;
        if (!this.boss?.dead) z.resolve();
      }
    }
    this.zones = this.zones.filter((z) => !z.done);
    for (const b of this.bolts) {
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      const x = b.x0 + (b.x1 - b.x0) * k, y = b.y0 + (b.y1 - b.y0) * k;
      g.fillStyle(b.color, 1 - k * 0.5);
      g.fillCircle(x, y, 3);
      g.lineStyle(2, b.color, 0.6 * (1 - k));
      g.lineBetween(b.x0 + (b.x1 - b.x0) * Math.max(0, k - 0.3), b.y0 + (b.y1 - b.y0) * Math.max(0, k - 0.3), x, y);
    }
    this.bolts = this.bolts.filter((b) => b.t < b.dur);
  }

  private diamond(x: number, y: number, color: number, alpha: number, inset = 0): void {
    const c = IsometricHelper.gridToScreen(x, y);
    const hw = TILE_WIDTH / 2 - inset * 2;
    const hh = TILE_HEIGHT / 2 - inset;
    this.ground.fillStyle(color, alpha);
    this.ground.fillPoints([
      new Phaser.Geom.Point(c.x, c.y - hh), new Phaser.Geom.Point(c.x + hw, c.y),
      new Phaser.Geom.Point(c.x, c.y + hh), new Phaser.Geom.Point(c.x - hw, c.y),
    ], true);
  }

  /** Telegraph → active → resolved, readable from the colours alone. */
  private drawObstacles(): void {
    const g = this.ground;
    g.clear();
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 8);
    const cleared = this.cleared;
    for (const o of LAIR_OBSTACLES) {
      for (let y = o.y; y < o.y + o.h; y++) {
        for (let x = o.x; x < o.x + o.w; x++) {
          if (o.type === 'MAGMA') {
            if ((o.gap ?? []).includes(x)) { this.diamond(x, y, 0x57534e, 0.9, 2); continue; }
            const phase = magmaPhase(o, this.t);
            if (phase === 'SAFE') this.diamond(x, y, 0x431407, 0.95);
            else if (phase === 'WARN') this.diamond(x, y, 0xea580c, 0.5 + 0.4 * pulse);
            else { this.diamond(x, y, 0xf97316, 1); this.diamond(x, y, 0xfde047, 0.5 * pulse, 6); }
          } else if (o.type === 'ROCKFALL') {
            const phase = rockfallPhase(o, this.t);
            if (phase === 'WARN') this.diamond(x, y, 0xdc2626, 0.25 + 0.35 * pulse, 3);
            else if (phase === 'BLOCKED') {
              this.diamond(x, y, 0x1c1917, 0.8, 1);
              const c = IsometricHelper.gridToScreen(x, y);
              g.fillStyle(0x78716c, 1);
              g.fillRect(c.x - 12, c.y - 14, 12, 10);
              g.fillRect(c.x + 2, c.y - 10, 10, 8);
              g.fillStyle(0xa8a29e, 1);
              g.fillRect(c.x - 12, c.y - 14, 12, 3);
            }
          } else if (o.type === 'BRIDGE') {
            const isBridge = (o.bridge ?? []).includes(x);
            if (isBridge && cleared.includes(o.id)) {
              this.diamond(x, y, 0x78350f, 1);
              this.diamond(x, y, 0xa16207, 0.8, 5);
            } else {
              this.diamond(x, y, 0x020617, 1);
              if (isBridge) this.diamond(x, y, 0x78350f, 0.35 + ((this.bridgeWork.get(o.id) ?? 0) / (o.work ?? 50)) * 0.5, 8);
            }
          } else if (o.type === 'GATE' && !cleared.includes(o.id)) {
            const c = IsometricHelper.gridToScreen(x, y);
            this.diamond(x, y, 0x292524, 1);
            g.fillStyle(0x44403c, 1);
            g.fillRect(c.x - TILE_WIDTH / 4, c.y - 34, TILE_WIDTH / 2, 30);
            g.fillStyle(0x9a3412, 0.6 + 0.3 * pulse);
            g.fillRect(c.x - 3, c.y - 30, 6, 20);
          }
        }
      }
      if (o.type === 'GATE' && !cleared.includes(o.id) && !guardianOf(o.id)) {
        const max = o.hp ?? 1000;
        const hp = this.gateHp.get(o.id) ?? max;
        if (hp < max) {
          const c = IsometricHelper.gridToScreen(o.x + o.w / 2, o.y);
          g.fillStyle(0x000000, 0.7);
          g.fillRect(c.x - 41, c.y - 49, 82, 6);
          g.fillStyle(0xf97316, 1);
          g.fillRect(c.x - 40, c.y - 48, 80 * (hp / max), 4);
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
