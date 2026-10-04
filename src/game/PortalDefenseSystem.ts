import Phaser from 'phaser';
import { IsometricHelper } from './IsometricHelper';
import type { Navigation } from './Navigation';
import { minionMoveMode } from './terrain';
import type { InvasionManager } from './InvasionManager';
import type { DefenderSystem, Defender } from './DefenderSystem';
import type { PortalManager, PortalState, PortalGuard } from './PortalManager';
import type { WorkerInstance } from './workers/types';
import { useGameStore } from '../state/useGameStore';
import { normalizeDifficulty } from '../state/difficulty';
import { logMessage } from '../state/activityLog';
import { soundFx } from './audio/soundFx';
import { RiftWorks, type RiftJob } from './riftWorks';
import { RiftMist } from './riftMist';
import { createStructureSprite, isStructureReady, playStructureAnim, structureHeadroom } from './sprites/StructureSprites';
import {
  PORTAL_DEFENSE, PortalSkillId, RiftEnv, portalSkillName, riftBoltDamage, riftDamageScale, riftEnv,
  riftLashDamage, sentinelBounty, sentinelDamage, sentinelMaxHp, surgeDamage,
} from '../state/portalDefense';

/** The vector stand-in is drawn a size up so it reads clearly on its own tile. */
const SENTINEL_SCALE = 1.35;
/** The baked voxel sentinel (structureModels `sentinel`) is tall; shrink it to sit on one plinth tile. */
const SPRITE_SCALE = 0.8;

const CFG = PORTAL_DEFENSE;

/** A Rift Sentinel tower standing in front of an open rift. */
interface Sentinel extends PortalGuard {
  portal: PortalState;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Graphics;
  /** Baked voxel tower, once its strip is ready (the vector body hides then). */
  sprite?: Phaser.GameObjects.Sprite;
  hpBar: Phaser.GameObjects.Graphics;
  hp: number;
  maxHp: number;
  cooldown: number;
  dead: boolean;
}

/** A sentinel tower tile: standing (sentinel), or being raised by Technicians (progress 0–1). */
interface Slot {
  portal: PortalState;
  index: number;
  x: number;
  y: number;
  sentinel?: Sentinel;
  progress: number;
  job: RiftJob;
  repairJob: RiftJob;
}

/** Per-rift cooldowns for its bolt, skills and ultimate. */
interface RiftMind {
  serial: number;
  bolt: number;
  lash: number;
  ward: number;
  surgeUsed: boolean;
}

/** A demon-side unit the rift can strike: a roster minion or a tenant/summon. */
type Foe =
  | { kind: 'worker'; worker: WorkerInstance; x: number; y: number }
  | { kind: 'defender'; defender: Defender; x: number; y: number };

/**
 * The rifts fight back. While open, each portal:
 *  - fires a void bolt at the nearest demon or beast in range,
 *  - casts Rift Lash (chain bolt) and Warp Ward (heal + damage ward),
 *  - unleashes Worldbreaker Surge once per wave below 40% HP,
 *  - raises two Rift Sentinel towers on its 4×4 zone that shoot too and
 *    must be toppled before minions can strike the rift.
 * Power follows the invaders' own curve (wave, day, difficulty) × realm
 * phase, and the time of day and weather tilt it (portalDefense.json).
 * Everything is narrated in the activity log (no floating text).
 */
export class PortalDefenseSystem {
  private sentinels: Sentinel[] = [];
  /** This frame's damage scale and environment (set at the top of update). */
  private scale = 1;
  private env: RiftEnv = riftEnv({});
  private minds = new Map<PortalState, RiftMind>();
  private slots: Slot[] = [];
  /** Smashed-rift repair progress (0–1) and its job, per rift. */
  private riftRepair = new Map<PortalState, { progress: number; job: RiftJob }>();
  private works: RiftWorks;
  private mist?: RiftMist;
  private pointer: () => { x: number; y: number } | null = () => null;

  constructor(
    private scene: Phaser.Scene,
    private layer: Phaser.GameObjects.Container,
    private portals: PortalManager,
    private invasion: InvasionManager,
    private defenders: DefenderSystem,
    private workers: () => WorkerInstance[],
    private nav: Navigation
  ) {
    portals.setGuardProvider((p) => this.guardOf(p), CFG.skills.warpWard.damageTaken);
    this.works = new RiftWorks(scene, layer);
    const B = CFG.builders;
    for (const portal of portals.getAll()) {
      portal.site.towers.forEach((t, index) => {
        const pos = IsometricHelper.gridToScreen(t.x, t.y);
        // Technicians stand a little toward the exit side of the plinth
        const exit = IsometricHelper.gridToScreen(portal.site.exit.x, portal.site.exit.y);
        const len = Math.hypot(exit.x - pos.x, exit.y - pos.y) || 1;
        const spot = { x: pos.x + ((exit.x - pos.x) / len) * 22, y: pos.y + ((exit.y - pos.y) / len) * 22 };
        const slot = { portal, index, x: pos.x, y: pos.y, progress: 0 } as Slot;
        slot.job = {
          id: `${portal.site.id}-build-${index}`, portal, ...spot, siteX: pos.x, siteY: pos.y, scaffold: true,
          progress: () => (slot.sentinel ? 1 : slot.progress),
          work: (dt) => {
            if (slot.sentinel) return true;
            slot.progress = Math.min(1, slot.progress + dt / B.buildSeconds);
            if (slot.progress < 1) return false;
            this.raiseSentinel(slot);
            return true;
          },
        };
        slot.repairJob = {
          id: `${portal.site.id}-mend-${index}`, portal, ...spot, siteX: pos.x, siteY: pos.y, scaffold: false,
          progress: () => (slot.sentinel ? slot.sentinel.hp / slot.sentinel.maxHp : 1),
          work: (dt) => {
            const sen = slot.sentinel;
            if (!sen) return true;
            sen.hp = Math.min(sen.maxHp, sen.hp + (sen.maxHp / B.repairTowerSeconds) * dt);
            this.drawHp(sen);
            return sen.hp >= sen.maxHp;
          },
        };
        this.slots.push(slot);
      });
      const repair = { progress: 0 } as { progress: number; job: RiftJob };
      repair.job = {
        id: `${portal.site.id}-rift`, portal, x: portal.exitX, y: portal.exitY, siteX: portal.x, siteY: portal.y, scaffold: false,
        progress: () => (portal.mode === 'destroyed' ? repair.progress : 1),
        work: (dt) => {
          if (portal.mode !== 'destroyed') return true;
          repair.progress = Math.min(1, repair.progress + dt / B.repairPortalSeconds);
          if (repair.progress < 1) return false;
          repair.progress = 0;
          this.portals.repair(portal);
          logMessage('riftRepaired', { portal: this.portalName(portal) });
          return true;
        },
      };
      this.riftRepair.set(portal, repair);
    }
  }

  /** The mist lives in the air layer (above units), created after this system. */
  attachMist(airLayer: Phaser.GameObjects.Container, pointer: () => { x: number; y: number } | null): void {
    this.mist = new RiftMist(this.scene, airLayer, this.portals.getAll());
    this.pointer = pointer;
  }

  /** Work waiting at a rift: smashed rift first, then missing sentinels, then damaged ones. */
  private jobsAt(p: PortalState): RiftJob[] {
    const jobs: RiftJob[] = [];
    if (p.mode === 'destroyed') jobs.push(this.riftRepair.get(p)!.job);
    for (const slot of this.slots) {
      if (slot.portal !== p) continue;
      if (!slot.sentinel) jobs.push(slot.job);
      else if (slot.sentinel.hp < slot.sentinel.maxHp) jobs.push(slot.repairJob);
    }
    return jobs;
  }

  private portalName(p: PortalState): string {
    return useGameStore.getState().language === 'TL' ? p.site.name.tl : p.site.name.en;
  }

  private guardOf(p: PortalState): PortalGuard | null {
    return this.sentinels.find((s) => s.portal === p && !s.dead) ?? null;
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    const store = useGameStore.getState();
    const active = store.invasion.isActive && store.defense.castleHp > 0;
    const wave = store.invasion.waveNumber || 1;
    const ctx = {
      wave, difficulty: normalizeDifficulty(store.difficulty), day: store.day, year: store.year, season: store.season,
      phase: store.platformPhase || 1, timeOfDay: store.timeOfDay, weather: store.weather,
    };
    this.scale = riftDamageScale(ctx);
    this.env = riftEnv(ctx);

    for (const portal of this.portals.getAll()) {
      let mind = this.minds.get(portal);
      if (!mind) {
        mind = { serial: 0, bolt: 1, lash: 4, ward: 8, surgeUsed: false };
        this.minds.set(portal, mind);
      }
      if (portal.mode === 'open' && mind.serial !== portal.openSerial) {
        // Freshly torn open: sentinels rise, skills start on a short delay
        mind.serial = portal.openSerial;
        mind.bolt = 1;
        mind.lash = 4;
        mind.ward = 8;
        mind.surgeUsed = false;
        this.rearm(portal);
      }
      if (portal.mode !== 'open' || !active) continue;
      this.updateRift(portal, mind, dt);
    }

    // Between waves the Technicians build and mend in the mist
    const peace = !store.invasion.isActive && store.defense.castleHp > 0;
    this.works.update(dt, peace, this.portals.getAll(), (p) => this.jobsAt(p));
    const walkers = this.invasion.getInvaders().filter((i) => !i.isDead).map((i) => i.container);
    this.mist?.update(dt, store.invasion.isActive, this.pointer(), walkers);

    this.sentinels = this.sentinels.filter((s) => !s.dead);
    for (const s of this.sentinels) {
      if (!s.sprite) this.attachSprite(s);
      // Sentinels only fight for an open rift during a wave
      if (!active || s.portal.mode !== 'open') continue;
      s.cooldown -= dt;
      if (s.cooldown > 0) continue;
      const foe = this.nearestFoe(s.x, s.y, CFG.towers.range * this.env.range);
      if (!foe) {
        s.cooldown = 0.3;
        continue;
      }
      s.cooldown = CFG.towers.cooldown / this.env.rate;
      if (s.sprite) playStructureAnim(s.sprite, 'attack', true);
      this.bolt(s.x, s.y - this.muzzle(s), foe, 0x38bdf8, 2);
      this.strike(foe, sentinelDamage(this.scale));
    }
  }

  // ── The rift itself ──────────────────────────────────────────────

  private updateRift(p: PortalState, mind: RiftMind, dt: number): void {
    const top = p.y - 26 * p.container.scaleY;
    const reach = (r: number) => r * this.env.range;

    // Ultimate: Worldbreaker Surge, once per wave when badly hurt
    if (!mind.surgeUsed && p.hp / p.maxHp < CFG.ultimate.trigger) {
      mind.surgeUsed = true;
      this.surge(p);
      return;
    }

    mind.ward -= dt;
    if (mind.ward <= 0) {
      const hurt = p.hp < p.maxHp * 0.9 || this.sentinels.some((s) => s.portal === p && !s.dead && s.hp < s.maxHp * 0.9);
      if (hurt && this.nearestFoe(p.x, p.y, reach(CFG.retaliation.range))) {
        mind.ward = CFG.skills.warpWard.cooldown;
        this.warpWard(p);
      } else mind.ward = 1;
    }

    mind.lash -= dt;
    if (mind.lash <= 0) {
      const foes = this.foesNear(p.x, p.y, reach(CFG.skills.riftLash.range));
      if (foes.length) {
        mind.lash = CFG.skills.riftLash.cooldown / this.env.rate;
        this.riftLash(p, foes, riftLashDamage(this.scale, this.env));
      } else mind.lash = 0.5;
    }

    mind.bolt -= dt;
    if (mind.bolt <= 0) {
      const foe = this.nearestFoe(p.x, p.y, reach(CFG.retaliation.range));
      if (foe) {
        mind.bolt = CFG.retaliation.cooldown / this.env.rate;
        this.bolt(p.x, top, foe, 0x60a5fa, 3);
        this.strike(foe, riftBoltDamage(this.scale));
      } else mind.bolt = 0.3;
    }
  }

  /** Skill 1 — a void whip jumping between nearby demons and beasts. */
  private riftLash(p: PortalState, foes: Foe[], damage: number): void {
    let fromX = p.x;
    let fromY = p.y - 26;
    const pool = [...foes];
    for (let i = 0; i < CFG.skills.riftLash.chains + this.env.lashChains && pool.length; i++) {
      pool.sort((a, b) => Math.hypot(a.x - fromX, a.y - fromY) - Math.hypot(b.x - fromX, b.y - fromY));
      const next = pool.shift()!;
      this.bolt(fromX, fromY, next, 0xa855f7, 3, true);
      this.strike(next, damage);
      fromX = next.x;
      fromY = next.y - 14;
    }
    soundFx.playLaser();
    this.logSkill(p, 'riftLash');
  }

  /** Skill 2 — mends the rift and its sentinels and wards them for a few seconds. */
  private warpWard(p: PortalState): void {
    const w = CFG.skills.warpWard;
    const heal = w.heal * this.env.wardHeal;
    const seconds = w.wardSeconds * this.env.wardSeconds;
    this.portals.heal(p, p.maxHp * heal);
    p.wardTimer = seconds;
    for (const s of this.sentinels) {
      if (s.portal !== p || s.dead) continue;
      s.hp = Math.min(s.maxHp, s.hp + s.maxHp * heal);
      this.drawHp(s);
    }
    const ring = this.scene.add.graphics();
    ring.setDepth(9990);
    this.layer.add(ring);
    ring.lineStyle(3, 0x22d3ee, 0.9);
    ring.strokeEllipse(p.x, p.y - 26, 50, 62);
    ring.lineStyle(2, 0x67e8f9, 0.6);
    ring.strokeEllipse(p.x, p.y, 120, 60);
    this.scene.tweens.add({ targets: ring, alpha: 0, duration: seconds * 1000, ease: 'Quad.easeIn', onComplete: () => ring.destroy() });
    this.logSkill(p, 'warpWard');
  }

  /** Ultimate — Worldbreaker Surge: a blast that hurts, flings and slows everything near the rift. */
  private surge(p: PortalState): void {
    const u = CFG.ultimate;
    const damage = surgeDamage(this.scale);
    for (const foe of this.foesNear(p.x, p.y, u.radius * this.env.range)) {
      this.strike(foe, damage);
      if (foe.kind === 'worker') {
        const w = foe.worker;
        w.slowFactor = Math.min(w.slowFactor ?? 1, u.slow);
        w.slowTimer = Math.max(w.slowTimer ?? 0, u.slowSeconds);
      }
      const c = foe.kind === 'worker' ? foe.worker.container : foe.defender.container;
      if (!c.active) continue;
      const len = Math.hypot(foe.x - p.x, foe.y - p.y) || 1;
      const mode = minionMoveMode(foe.kind === 'worker' ? foe.worker.unitClass : foe.defender.unitClass);
      const pos = this.nav.pushOut(foe.x + ((foe.x - p.x) / len) * u.knockback, foe.y + ((foe.y - p.y) / len) * u.knockback, 0.2, mode);
      this.scene.tweens.add({ targets: c, x: pos.x, y: pos.y, duration: 280, ease: 'Quad.easeOut' });
    }
    // Shockwave rings + void shards
    for (let i = 0; i < 3; i++) {
      const ring = this.scene.add.graphics();
      ring.setDepth(9990);
      this.layer.add(ring);
      ring.lineStyle(4 - i, i === 1 ? 0xfde047 : 0x7c3aed, 0.9);
      ring.strokeEllipse(0, 0, 40, 20);
      ring.setPosition(p.x, p.y);
      this.scene.tweens.add({
        targets: ring, scaleX: (u.radius * 2) / 40, scaleY: u.radius / 20, alpha: 0,
        delay: i * 120, duration: 600, ease: 'Cubic.easeOut', onComplete: () => ring.destroy(),
      });
    }
    this.scene.cameras.main.shake(260, 0.004);
    soundFx.playExplosion();
    soundFx.playPortalOpen();
    this.logSkill(p, 'ultimate');
  }

  private logSkill(p: PortalState, id: PortalSkillId): void {
    const lang = useGameStore.getState().language;
    const portal = lang === 'TL' ? p.site.name.tl : p.site.name.en;
    logMessage(id === 'ultimate' ? 'portalUltimate' : 'portalSkill', { portal, skill: portalSkillName(id, lang) });
  }

  // ── Rift Sentinels ───────────────────────────────────────────────

  /** A Rift Sentinel finishes going up on its plinth (built by Technicians). */
  private raiseSentinel(slot: Slot): void {
    const p = slot.portal;
    const maxHp = Math.max(1, sentinelMaxHp(p.maxHp));
    const container = this.scene.add.container(slot.x, slot.y);
    const body = this.scene.add.graphics();
    const hpBar = this.scene.add.graphics();
    container.add([body, hpBar]);
    this.layer.add(container);
    const s: Sentinel = {
      portal: p, container, body, hpBar, hp: maxHp, maxHp, cooldown: 1.5 + Math.random(), dead: false,
      x: slot.x, y: slot.y,
      hit: (damage) => this.hitSentinel(s, damage),
    };
    this.drawSentinel(s);
    this.attachSprite(s);
    container.setScale(SENTINEL_SCALE, 0.05);
    this.scene.tweens.add({ targets: container, scaleY: SENTINEL_SCALE, duration: 700, ease: 'Back.easeOut' });
    this.sentinels.push(s);
    slot.sentinel = s;
    slot.progress = 0;
    logMessage('riftSentinelBuilt', { portal: this.portalName(p) });
  }

  /** The rift opens for a wave: its standing sentinels are re-armed to this wave's strength. */
  private rearm(p: PortalState): void {
    const maxHp = sentinelMaxHp(p.maxHp);
    let count = 0;
    for (const slot of this.slots) {
      const s = slot.sentinel;
      if (slot.portal !== p || !s || s.dead) continue;
      s.maxHp = maxHp;
      s.hp = maxHp;
      s.cooldown = 1.5 + Math.random();
      this.drawHp(s);
      count++;
    }
    if (count) logMessage('riftSentinelsRise', { count });
  }

  /** Height of the arc crystal above the plinth (where bolts leave). */
  private muzzle(s: Sentinel): number {
    if (!s.sprite) return 44 * SENTINEL_SCALE;
    return ((structureHeadroom('sentinel') ?? 110) - 16) * SPRITE_SCALE;
  }

  /** Swaps the vector stand-in for the baked voxel tower when its strip is ready. */
  private attachSprite(s: Sentinel): void {
    if (s.sprite || s.dead || !isStructureReady(this.scene, 'sentinel')) return;
    const sprite = createStructureSprite(this.scene, 'sentinel', 'idle');
    if (!sprite) return;
    s.sprite = sprite;
    // The container is scaled for the vector body; undo that for the sprite
    sprite.setScale(SPRITE_SCALE / SENTINEL_SCALE);
    s.container.addAt(sprite, 1);
    // Lift the HP bar (drawn at y = -53 in container space) just above the crystal
    const top = ((structureHeadroom('sentinel') ?? 110) * SPRITE_SCALE) / SENTINEL_SCALE;
    s.hpBar.setY(Math.min(0, 53 - top - 4));
    s.body.clear();
    s.body.fillStyle(0x000000, 0.3);
    s.body.fillEllipse(0, 0, 24, 11);
    sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (anim: Phaser.Animations.Animation) => {
      if (anim.key.endsWith('-attack') && !s.dead) playStructureAnim(sprite, 'idle');
    });
  }

  /** Vector stand-in until the voxel strip bakes: marble plinth, steel column, arc crystal. */
  private drawSentinel(s: Sentinel): void {
    const g = s.body;
    g.clear();
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(0, 0, 26, 12);
    g.fillStyle(0xa8a29e, 1);
    g.fillRect(-10, -8, 20, 8);
    g.fillStyle(0xeab308, 1);
    g.fillRect(-9, -9, 18, 2);
    g.fillStyle(0x475569, 1);
    g.fillPoints([{ x: -6, y: -9 }, { x: 6, y: -9 }, { x: 4, y: -30 }, { x: -4, y: -30 }], true);
    g.fillStyle(0x94a3b8, 1);
    g.fillPoints([{ x: 0, y: -9 }, { x: 6, y: -9 }, { x: 4, y: -30 }, { x: 0, y: -30 }], true);
    g.fillStyle(0xeab308, 1);
    g.fillRect(-5, -31, 10, 2);
    g.fillStyle(0x38bdf8, 1);
    g.fillPoints([{ x: 0, y: -44 }, { x: 5, y: -37 }, { x: 0, y: -32 }, { x: -5, y: -37 }], true);
    g.fillStyle(0xe0f2fe, 1);
    g.fillPoints([{ x: 0, y: -42 }, { x: 2, y: -37 }, { x: 0, y: -34 }], true);
    g.fillStyle(0x38bdf8, 0.9);
    g.fillRect(2, -27, 1, 16);
  }

  private drawHp(s: Sentinel): void {
    s.hpBar.clear();
    if (s.dead || s.hp >= s.maxHp) return;
    s.hpBar.fillStyle(0x000000, 0.7);
    s.hpBar.fillRect(-13, -53, 26, 5);
    s.hpBar.fillStyle(0xc084fc, 1);
    s.hpBar.fillRect(-12, -52, 24 * Math.max(0, s.hp / s.maxHp), 3);
  }

  private hitSentinel(s: Sentinel, damage: number): void {
    if (s.dead || !(damage > 0)) return;
    if (s.portal.wardTimer > 0) damage *= CFG.skills.warpWard.damageTaken;
    s.hp -= damage;
    this.drawHp(s);
    s.body.setAlpha(0.5);
    this.scene.time.delayedCall(60, () => s.body.active && s.body.setAlpha(1));
    soundFx.playWallBang();
    if (s.hp <= 0) this.topple(s, true);
  }

  /** Sentinel falls: by minion hands (bounty + log) or quietly when its rift closes. */
  private topple(s: Sentinel, byMinions: boolean): void {
    if (s.dead) return;
    s.dead = true;
    for (const slot of this.slots) if (slot.sentinel === s) slot.sentinel = undefined;
    s.hpBar.clear();
    if (byMinions) {
      const store = useGameStore.getState();
      const bounty = sentinelBounty(store.invasion.waveNumber || 1);
      store.addResources(bounty);
      const portal = store.language === 'TL' ? s.portal.site.name.tl : s.portal.site.name.en;
      logMessage('riftSentinelDown', { portal, coins: bounty.coins ?? 0 });
      soundFx.playExplosion();
      for (let i = 0; i < 10; i++) {
        const shard = this.scene.add.rectangle(s.x, s.y - 30 * SENTINEL_SCALE, 3, 3, i % 2 ? 0x7c3aed : 0x57534e);
        shard.setDepth(9990);
        this.layer.add(shard);
        this.scene.tweens.add({
          targets: shard, x: s.x + Phaser.Math.Between(-30, 30), y: s.y - 30 + Phaser.Math.Between(-20, 30),
          alpha: 0, duration: 600, ease: 'Cubic.easeOut', onComplete: () => shard.destroy(),
        });
      }
    }
    this.scene.tweens.add({
      targets: s.container, scaleY: 0.05, alpha: 0, duration: byMinions ? 420 : 300, ease: 'Quad.easeIn',
      onComplete: () => s.container.destroy(),
    });
  }

  // ── Targeting & hits ─────────────────────────────────────────────

  private foesNear(x: number, y: number, range: number): Foe[] {
    const foes: Foe[] = [];
    for (const w of this.workers()) {
      if (w.hp <= 0 || !w.container?.active || !w.container.visible) continue;
      const d = Math.hypot(w.container.x - x, w.container.y - y);
      if (d <= range) foes.push({ kind: 'worker', worker: w, x: w.container.x, y: w.container.y });
    }
    for (const d of this.defenders.getDefenders()) {
      if (d.dead || !d.container.active || !d.container.visible) continue;
      if (Math.hypot(d.container.x - x, d.container.y - y) <= range) foes.push({ kind: 'defender', defender: d, x: d.container.x, y: d.container.y });
    }
    return foes;
  }

  private nearestFoe(x: number, y: number, range: number): Foe | null {
    let best: Foe | null = null;
    let bestD = Infinity;
    for (const f of this.foesNear(x, y, range)) {
      const d = Math.hypot(f.x - x, f.y - y);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  private strike(foe: Foe, damage: number): void {
    if (foe.kind === 'worker') this.invasion.hurtWorkerFromRift(foe.worker, damage);
    else foe.defender.takeHit(damage);
  }

  private bolt(fromX: number, fromY: number, foe: Foe, color: number, width: number, jagged = false): void {
    const toX = foe.x;
    const toY = foe.y - 14;
    const g = this.scene.add.graphics();
    g.setDepth(9990);
    this.layer.add(g);
    g.lineStyle(width, color, 0.95);
    if (jagged) {
      g.beginPath();
      g.moveTo(fromX, fromY);
      for (let i = 1; i < 5; i++) {
        const t = i / 5;
        g.lineTo(fromX + (toX - fromX) * t + Phaser.Math.Between(-6, 6), fromY + (toY - fromY) * t + Phaser.Math.Between(-6, 6));
      }
      g.lineTo(toX, toY);
      g.strokePath();
    } else g.lineBetween(fromX, fromY, toX, toY);
    g.fillStyle(color, 0.9);
    g.fillCircle(toX, toY, width + 2);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
  }

  destroy(): void {
    this.works.destroy();
    this.mist?.destroy();
    for (const s of this.sentinels) s.container.destroy();
    this.sentinels = [];
    this.minds.clear();
  }
}
