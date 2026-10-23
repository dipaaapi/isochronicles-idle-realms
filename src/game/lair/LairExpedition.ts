import Phaser from 'phaser';
import { IsometricHelper, TILE_HEIGHT, TILE_WIDTH } from '../IsometricHelper';
import { createMinionSprite, faceCharacterSprite, playCharacterAttack, playCharacterHit, playCharacterWork } from '../sprites/CharacterSprites';
import { useGameStore } from '../../state/useGameStore';
import { logMessage } from '../../state/activityLog';
import { unitName } from '../../i18n/translations';
import {
  CHECKPOINTS, LAIR_CONFIG, LAIR_LENGTH, LAIR_OBSTACLES, LAIR_WIDTH, PARTY,
  blockingRow, inRect, isStaticBlocked, lairFighters, magmaPhase, rockfallPhase,
  type LairFighter, type LairObstacle,
} from '../../state/lairExpedition';
import { nextStep } from './lairNav';
import { useLairHud } from './lairHud';

interface Member {
  f: LairFighter;
  name: { en: string; tl: string };
  container: Phaser.GameObjects.Container;
  sprite?: Phaser.GameObjects.Sprite;
  hpBar: Phaser.GameObjects.Graphics;
  /** Continuous grid position. */
  gx: number;
  gy: number;
  hp: number;
  dead: boolean;
  respawnAt: number;
  cooldown: number;
  slot: number;
  step: { x: number; y: number } | null;
  repathIn: number;
}

/** Columns the formation fills, centre-out, so the party funnels toward the route's middle. */
const SLOT_COLUMNS = [4, 5, 3, 6, 2, 7, 1, 8];

/**
 * The expedition on the move (Phase 4): every General and its minions walk
 * the lair as one formation behind an advancing front. Rockfalls, magma
 * pulses, broken bridges and the Golem Gate hold or hurt them; the fallen
 * return at the last checkpoint. Obstacles are drawn on one ground layer;
 * nothing floats over units but their HP bars.
 */
export class LairExpedition {
  private members: Member[] = [];
  private ground: Phaser.GameObjects.Graphics;
  private t = 0;
  private frontY: number;
  private bridgeWork = new Map<string, number>();
  private gateHp = new Map<string, number>();
  private rockPhase = new Map<string, string>();
  private endLogged = false;

  constructor(private scene: Phaser.Scene) {
    this.ground = scene.add.graphics().setDepth(1);
    const store = useGameStore.getState();
    this.frontY = CHECKPOINTS[store.lairProgress.checkpoint] ?? 0;
    const roster = new Map(store.roster.map((u) => [u.id, u]));
    lairFighters(store).forEach((f, i) => {
      const general = roster.get(f.id.split('#')[0]);
      const base = general?.name ?? f.unitClass;
      const name = {
        en: unitName(base, f.unitClass, 'EN') + (f.isMinion ? ' minion' : ''),
        tl: unitName(base, f.unitClass, 'TL') + (f.isMinion ? ' (alagad)' : ''),
      };
      const container = scene.add.container(0, 0);
      const shadow = scene.add.ellipse(0, 3, 16, 7, 0x000000, 0.4);
      const sprite = createMinionSprite(scene, f.unitClass) ?? undefined;
      const hpBar = scene.add.graphics();
      if (sprite) {
        sprite.setScale(sprite.scaleX * (f.isMinion ? 0.7 : 0.9));
        container.add([shadow, sprite, hpBar]);
      } else {
        const body = scene.add.circle(0, -10, f.isMinion ? 5 : 7, 0xa855f7);
        container.add([shadow, body, hpBar]);
      }
      const m: Member = {
        f, name, container, sprite, hpBar, gx: 0, gy: 0, hp: f.maxHp, dead: false,
        respawnAt: 0, cooldown: Math.random(), slot: i, step: null, repathIn: 0,
      };
      this.place(m, this.spawnTile(i));
      this.members.push(m);
    });
    for (const o of LAIR_OBSTACLES) if (o.type === 'GATE') this.gateHp.set(o.id, o.hp ?? 1000);
  }

  /** Respawn / start tile for a slot: spread over the rows at the current checkpoint. */
  private spawnTile(slot: number): { x: number; y: number } {
    const base = CHECKPOINTS[useGameStore.getState().lairProgress.checkpoint] ?? 0;
    const x = SLOT_COLUMNS[slot % SLOT_COLUMNS.length];
    const y = Math.min(LAIR_LENGTH - 1, base + Math.floor(slot / SLOT_COLUMNS.length) % 3);
    return { x, y };
  }

  private place(m: Member, t: { x: number; y: number }): void {
    m.gx = t.x;
    m.gy = t.y;
    m.step = null;
    this.syncPosition(m);
  }

  private syncPosition(m: Member): void {
    const p = IsometricHelper.gridToScreen(m.gx, m.gy);
    m.container.setPosition(p.x, p.y);
    m.container.setDepth(10 + p.y);
  }

  private get cleared(): string[] {
    return useGameStore.getState().lairProgress.cleared;
  }

  /** Tiles a member must not step onto right now. */
  private dangerAt(x: number, y: number): boolean {
    for (const o of LAIR_OBSTACLES) {
      if (!inRect(o, x, y)) continue;
      if (o.type === 'MAGMA' && !(o.gap ?? []).includes(x) && magmaPhase(o, this.t) !== 'SAFE') return true;
      if (o.type === 'ROCKFALL' && rockfallPhase(o, this.t) !== 'IDLE') return true;
    }
    return false;
  }

  private blocked = (x: number, y: number): boolean => isStaticBlocked(x, y, this.cleared) || this.dangerAt(x, y);

  /** The member's place in the formation behind the front. */
  private goalOf(m: Member, front: number): { x: number; y: number } {
    const rank = Math.floor(m.slot / SLOT_COLUMNS.length);
    let y = Math.max(0, Math.floor(front) - rank);
    const x = SLOT_COLUMNS[m.slot % SLOT_COLUMNS.length];
    // Static blockers (chasm, gate) in the goal row: fall back to the nearest open tile or row before it
    for (let tries = 0; tries < 6; tries++) {
      if (!isStaticBlocked(x, y, this.cleared)) return { x, y };
      for (let d = 1; d < LAIR_WIDTH; d++) {
        for (const nx of [x - d, x + d]) if (nx >= 0 && nx < LAIR_WIDTH && !isStaticBlocked(nx, y, this.cleared)) return { x: nx, y };
      }
      y = Math.max(0, y - 1);
    }
    return { x, y };
  }

  update(deltaMs: number): void {
    const dt = Math.min(0.1, deltaMs / 1000);
    this.t += dt;
    const store = useGameStore.getState();
    const hud = useLairHud.getState();
    const alive = this.members.filter((m) => !m.dead);

    // ── The front advances unless held, blocked, or the party has strung out
    const block = blockingRow(this.cleared);
    const stopAt = block - 1;
    // Strung out = members lag their own formation slots (not the front), so a deep column still advances
    const lag = alive.length ? alive.reduce((s, m) => s + Math.max(0, this.goalOf(m, this.frontY).y - m.gy), 0) / alive.length : 0;
    const strung = lag > PARTY.regroupTiles;
    if (!hud.hold && !strung && this.frontY < stopAt) {
      this.frontY = Math.min(stopAt, this.frontY + PARTY.advanceTilesPerSec * dt);
    }
    // Checkpoints: the front passing a region's start saves it
    for (let i = store.lairProgress.checkpoint + 1; i < CHECKPOINTS.length; i++) {
      if (this.frontY >= CHECKPOINTS[i]) store.reachLairCheckpoint(i);
    }

    // ── Obstacles: hazards tick, the holding obstacle takes work / blows
    const holding = LAIR_OBSTACLES.find((o) => o.y === block && (o.type === 'BRIDGE' || o.type === 'GATE')) ?? null;
    let holdProgress = 0;
    if (holding && this.frontY >= stopAt - 0.01) holdProgress = this.workOn(holding, alive, dt);
    for (const o of LAIR_OBSTACLES) {
      if (o.type !== 'ROCKFALL') continue;
      const phase = rockfallPhase(o, this.t);
      if (phase === 'BLOCKED' && this.rockPhase.get(o.id) === 'WARN') {
        for (const m of alive) if (inRect(o, Math.round(m.gx), Math.round(m.gy))) this.hurt(m, o.damage ?? 30);
      }
      this.rockPhase.set(o.id, phase);
    }

    // ── Members: move toward their slot, burn on magma, respawn
    const near = holding && this.frontY >= stopAt - 0.01;
    for (const m of this.members) {
      if (m.dead) {
        if (this.t >= m.respawnAt) this.respawn(m);
        continue;
      }
      const tx = Math.round(m.gx), ty = Math.round(m.gy);
      for (const o of LAIR_OBSTACLES) {
        if (o.type === 'MAGMA' && inRect(o, tx, ty) && !(o.gap ?? []).includes(tx) && magmaPhase(o, this.t) === 'ACTIVE') {
          this.hurt(m, (o.dps ?? 20) * dt);
        }
      }
      if (m.dead) continue;
      this.move(m, dt, near ? holding : null);
      this.drawHp(m);
    }

    this.drawObstacles();

    // ── HUD readout
    const waiting = this.members.filter((m) => m.dead);
    const end = !holding && this.frontY >= LAIR_CONFIG.route.stopY - 1.01;
    if (end && !this.endLogged) { this.endLogged = true; logMessage('lairRouteEnd'); }
    hud.publish({
      frontY: this.frontY,
      alive: alive.length,
      total: this.members.length,
      respawning: waiting.length,
      nextRespawn: waiting.length ? Math.max(0, Math.min(...waiting.map((m) => m.respawnAt)) - this.t) : 0,
      holdingAt: end ? 'END' : near && holding ? holding.id : null,
      holdProgress,
    });
  }

  /** Bridges take repair work from members at the bridgehead; gates take their blows. Returns 0..1 progress. */
  private workOn(o: LairObstacle, alive: Member[], dt: number): number {
    const crew = alive.filter((m) => m.gy >= o.y - 2.5 && m.gy < o.y);
    if (o.type === 'BRIDGE') {
      const need = o.work ?? 50;
      const done = Math.min(need, (this.bridgeWork.get(o.id) ?? 0) + crew.length * PARTY.repairPerUnitPerSec * dt);
      this.bridgeWork.set(o.id, done);
      for (const m of crew) if (m.sprite) playCharacterWork(m.sprite);
      if (done >= need) useGameStore.getState().clearLairObstacle(o.id);
      return done / need;
    }
    const max = o.hp ?? 1000;
    let hp = this.gateHp.get(o.id) ?? max;
    for (const m of crew) {
      m.cooldown -= dt;
      if (m.cooldown > 0) continue;
      m.cooldown = PARTY.attackCooldown;
      hp -= m.f.attack;
      if (m.sprite) playCharacterAttack(m.sprite);
    }
    this.gateHp.set(o.id, Math.max(0, hp));
    if (hp <= 0) useGameStore.getState().clearLairObstacle(o.id);
    return 1 - Math.max(0, hp) / max;
  }

  private move(m: Member, dt: number, holding: LairObstacle | null): void {
    const goal = this.goalOf(m, this.frontY);
    const tx = Math.round(m.gx), ty = Math.round(m.gy);
    m.repathIn -= dt;
    if (!m.step || m.repathIn <= 0 || this.blocked(m.step.x, m.step.y)) {
      // Already on the goal tile: finish the walk to its centre
      m.step = tx === goal.x && ty === goal.y ? { x: goal.x, y: goal.y } : nextStep(tx, ty, goal.x, goal.y, this.blocked);
      m.repathIn = 0.4;
    }
    let dx = 0, dy = 0, moving = false;
    if (m.step) {
      dx = m.step.x - m.gx;
      dy = m.step.y - m.gy;
      const d = Math.hypot(dx, dy);
      const stepLen = PARTY.speedTilesPerSec * dt;
      if (d <= stepLen) {
        m.gx = m.step.x;
        m.gy = m.step.y;
        m.step = null;
      } else {
        m.gx += (dx / d) * stepLen;
        m.gy += (dy / d) * stepLen;
      }
      moving = d > 0.01;
    } else if (holding) {
      // Facing the bridge / gate while working on it
      dy = 1;
    }
    this.syncPosition(m);
    if (m.sprite) {
      const s0 = IsometricHelper.gridToScreen(0, 0);
      const s1 = IsometricHelper.gridToScreen(dx, dy);
      faceCharacterSprite(m.sprite, s1.x - s0.x, s1.y - s0.y, moving);
    }
  }

  private hurt(m: Member, amount: number): void {
    if (m.dead) return;
    m.hp -= amount * m.f.damageTaken;
    if (m.sprite && amount >= 5) playCharacterHit(m.sprite);
    if (m.hp > 0) return;
    m.dead = true;
    m.respawnAt = this.t + PARTY.respawnSeconds;
    m.container.setVisible(false);
    if (!m.f.isMinion) logMessage('lairMemberDown', { name: m.name, seconds: PARTY.respawnSeconds });
  }

  private respawn(m: Member): void {
    m.dead = false;
    m.hp = m.f.maxHp;
    this.place(m, this.spawnTile(m.slot));
    m.container.setVisible(true);
    if (!m.f.isMinion) logMessage('lairMemberBack', { name: m.name });
  }

  private drawHp(m: Member): void {
    const g = m.hpBar;
    g.clear();
    if (m.hp >= m.f.maxHp) return;
    const w = m.f.isMinion ? 14 : 20;
    const top = m.f.isMinion ? -30 : -40;
    g.fillStyle(0x000000, 0.7);
    g.fillRect(-w / 2 - 1, top - 1, w + 2, 4);
    g.fillStyle(m.f.isMinion ? 0x86efac : 0x4ade80, 1);
    g.fillRect(-w / 2, top, w * Math.max(0, m.hp / m.f.maxHp), 2);
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
            const fixed = cleared.includes(o.id);
            if (isBridge && fixed) {
              this.diamond(x, y, 0x78350f, 1);
              this.diamond(x, y, 0xa16207, 0.8, 5);
            } else {
              this.diamond(x, y, 0x020617, 1);
              if (isBridge) this.diamond(x, y, 0x78350f, 0.35 + (this.bridgeWork.get(o.id) ?? 0) / (o.work ?? 50) * 0.5, 8);
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
      // Gate HP bar across its centre
      if (o.type === 'GATE' && !cleared.includes(o.id)) {
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

  /** Centre of the living party in grid units (camera follow). */
  centroid(): { x: number; y: number } {
    const alive = this.members.filter((m) => !m.dead);
    if (!alive.length) return { x: LAIR_WIDTH / 2, y: CHECKPOINTS[useGameStore.getState().lairProgress.checkpoint] ?? 0 };
    return { x: alive.reduce((s, m) => s + m.gx, 0) / alive.length, y: alive.reduce((s, m) => s + m.gy, 0) / alive.length };
  }
}
