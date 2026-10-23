import Phaser from 'phaser';
import KIROV from '../data/kirov.json';
import LOCOMOTION from '../data/locomotion.json';
import { useGameStore } from '../state/useGameStore';
import { logMessage } from '../state/activityLog';
import { scoutWave } from '../state/scoutRaid';
import { GRID_SIZE } from '../state/buildingLayout';
import { UNIT_CLASSES } from '../types/game';
import { IsometricHelper } from './IsometricHelper';
import { Navigation } from './Navigation';
import { soundFx } from './audio/soundFx';
import { playFx, projectileFor, shootProjectile, spawnImpact, spawnSmoke } from './battleFx';
import type { InvasionManager } from './InvasionManager';
import type { StructureManager, StructureTarget } from './StructureManager';
import type { WorkerInstance } from './workers/types';
import type { Defender } from './DefenderSystem';
import {
  createAirshipSprite, faceCharacterSprite, playCharacterAttack, playCharacterDeath, playCharacterHit, playCharacterSkill,
} from './sprites/CharacterSprites';

type SkillId = 'CARPET_BOMB' | 'WRECKING_ANCHOR' | 'FIREBOMB_RAIN';
type ShipState = 'arrive' | 'siege' | 'leave' | 'down';

interface Ship {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Sprite;
  hpBar: Phaser.GameObjects.Graphics;
  shadow: Phaser.GameObjects.Ellipse;
  /** Ground point under the airship (island space). */
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  wave: number;
  state: ShipState;
  target?: StructureTarget;
  exit?: { x: number; y: number };
  stayMs: number;
  busyMs: number;
  hitMs: number;
  dropMs: number;
  dropped: boolean;
  skillCds: number[];
  bob: number;
  smokeMs: number;
  /** The 8-direction voxel sheet (false = the side-view fallback sheet, flipped left/right). */
  voxel: boolean;
  /** Last travel direction in screen space (the voxel ship keeps facing it while hovering). */
  faceX: number;
  faceY: number;
  /** Paratrooper drop playing until this many ms are left of busyMs. */
  dropUntil: number;
}

const FLYERS = new Set<string>(LOCOMOTION.fly);
const ALT = KIROV.altitude;

/**
 * The Kirov siege airship. It leads every Kirov Invasion Battle (the raids between waves), never
 * a wave: it drifts in from the island's edge, drops paratrooper raiders, then
 * hovers over the castle or an establishment and attacks only structures with
 * three skills (Carpet Bombing, Wrecking Anchor, Firebomb Rain). Armoured and
 * huge, it can only be hurt by flyers, long-range fighters, the towers and the
 * Demon Lord's click. Tuned in src/data/kirov.json.
 */
export class KirovAirship {
  private ship?: Ship;
  private unitCds = new Map<object, number>();
  private towerCds = new Map<string, number>();
  private clickCd = 0;
  private burns: Array<{ target: StructureTarget; fx: Phaser.GameObjects.Sprite | null; lifeMs: number; tickMs: number; dps: number }> = [];

  constructor(
    private scene: Phaser.Scene,
    private air: Phaser.GameObjects.Container,
    private ground: Phaser.GameObjects.Container,
    private structures: StructureManager,
    private invasion: InvasionManager,
    private workers: () => WorkerInstance[],
    private defenders: () => Defender[],
  ) {}

  /** True while the airship is over the island (keeps the raid's battle state on). */
  isActive(): boolean {
    return !!this.ship && this.ship.state !== 'down';
  }

  /** Ground point under the airship while it is over the island (Generals ordered to chase it). */
  groundPoint(): { x: number; y: number } | null {
    const s = this.ship;
    return s && s.state !== 'down' && s.state !== 'leave' ? { x: s.x, y: s.y } : null;
  }

  /** A Kirov Invasion Battle started: the airship always leads it. */
  maybeLaunch(): void {
    if (this.ship || !this.scene.textures.exists('battle-kirov')) return;
    if (useGameStore.getState().invasion.isActive) return;
    this.launch(scoutWave());
  }

  /** Sends the airship in now (also used by the dev panel). */
  launch(wave = scoutWave()): void {
    if (this.ship || !this.scene.textures.exists('battle-kirov')) return;
    const edge = this.edgePoint();
    const root = this.scene.add.container(edge.x, edge.y - ALT);
    // The 8-direction voxel airship once its sheet is baked; the side-view sheet until then
    const voxelBody = createAirshipSprite(this.scene, 'kirov');
    const body = voxelBody
      ? voxelBody.setScale(voxelBody.scaleX * KIROV.voxelScale)
      : this.scene.add.sprite(0, 0, 'battle-kirov').setScale(KIROV.scale).play('battle-kirov:cruise');
    const hpBar = this.scene.add.graphics();
    root.add([body, hpBar]);
    this.air.add(root);
    const shadow = this.scene.add.ellipse(edge.x, edge.y, 120, 34, 0x000000, 0.28);
    this.ground.add(shadow);
    const maxHp = Math.round(KIROV.hp + KIROV.hpPerWave * wave);
    body.setInteractive({ useHandCursor: true, pixelPerfect: false });
    body.on('pointerdown', () => this.demonStrike());
    this.ship = {
      root, body, hpBar, shadow, x: edge.x, y: edge.y, hp: maxHp, maxHp, wave, state: 'arrive',
      stayMs: KIROV.maxStayMs, busyMs: 0, hitMs: 0, dropMs: 0, dropped: false,
      skillCds: KIROV.skills.map((_, i) => 2500 + i * 2200), bob: 0, smokeMs: 0,
      voxel: !!voxelBody, faceX: 1, faceY: 0, dropUntil: 0,
    };
    this.pickTarget();
    this.drawHp();
    soundFx.playExplosion();
    logMessage('kirovArrive', { hp: maxHp });
  }

  update(deltaMs: number): void {
    this.updateBurns(deltaMs);
    const s = this.ship;
    if (!s || s.state === 'down') return;
    const dt = deltaMs / 1000;
    s.stayMs -= deltaMs;
    s.busyMs = Math.max(0, s.busyMs - deltaMs);
    s.hitMs = Math.max(0, s.hitMs - deltaMs);
    this.clickCd = Math.max(0, this.clickCd - deltaMs);

    // A wave starting (or its time running out) sends it home: it never joins a wave
    if (s.state !== 'leave' && (useGameStore.getState().invasion.isActive || s.stayMs <= 0)) this.leave();
    if (s.state === 'siege' && (!s.target || !this.alive(s.target))) {
      this.pickTarget();
      if (!s.target) this.leave();
      else s.state = 'arrive';
    }

    // Movement: drift to the target (or out of the map)
    const goal = s.state === 'leave' ? s.exit! : s.target ? { x: s.target.x, y: s.target.y + 6 } : { x: s.x, y: s.y };
    const dx = goal.x - s.x, dy = goal.y - s.y;
    const d = Math.hypot(dx, dy);
    if (s.busyMs <= 0 || s.state === 'leave') {
      const step = KIROV.speed * (s.state === 'leave' ? 1.8 : 1) * dt;
      if (d > step) { s.x += (dx / d) * step; s.y += (dy / d) * step; }
      else if (s.state === 'leave') { this.remove(); return; }
      else if (s.state === 'arrive') s.state = 'siege';
      if (s.voxel) {
        if (d > 4) { s.faceX = dx; s.faceY = dy; }
      } else if (Math.abs(dx) > 4) s.body.setFlipX(dx < 0);
    }
    // Voxel ship: face the travel direction; cruise, limp when burning, or hold the drop pose
    if (s.voxel) {
      const gait = this.dropping(s) ? 'run' : s.hp < s.maxHp * 0.4 ? 'tired' : 'walk';
      faceCharacterSprite(s.body, s.faceX, s.faceY, true, gait);
    }
    s.bob += dt;
    s.root.setPosition(s.x, s.y - ALT + Math.sin(s.bob * 1.3) * 3);
    s.shadow.setPosition(s.x, s.y).setScale(0.95 + Math.sin(s.bob * 1.3) * 0.04);

    // Low on lift gas: burning and smoking
    if (s.hp < s.maxHp * 0.4) {
      s.smokeMs -= deltaMs;
      const back = s.voxel ? (s.faceX < 0 ? -1 : 1) : s.body.flipX ? -1 : 1;
      if (s.smokeMs <= 0) { s.smokeMs = 140; spawnSmoke(s.root.x - back * 40, s.root.y + 4, 1.6, -10); }
    }

    // Paratroopers: a stick on the first pass over land, then every so often
    if (s.state !== 'leave') {
      s.dropMs -= deltaMs;
      const overLand = this.overLand(s);
      if (overLand && s.busyMs <= 0 && (!s.dropped || s.dropMs <= 0)) this.dropTroops(s);
    }

    if (s.state === 'siege' && s.busyMs <= 0) this.useSkills(s, deltaMs);
    else for (let i = 0; i < s.skillCds.length; i++) s.skillCds[i] -= deltaMs;

    this.updateAntiAir(s, deltaMs);
  }

  // ── Targets and movement ───────────────────────────────────────────────────

  private alive(t: StructureTarget): boolean {
    return this.structures.getTargets().some((o) => o.id === t.id);
  }

  /** The castle or an establishment, preferring the nearest few. */
  private pickTarget(): void {
    const s = this.ship;
    if (!s) return;
    const all = this.structures.getTargets();
    if (!all.length) { s.target = undefined; return; }
    const near = [...all].sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y)).slice(0, 3);
    s.target = near[Math.floor(Math.random() * near.length)];
  }

  /** A point just off one of the island's four edges. */
  private edgePoint(): { x: number; y: number } {
    const n = GRID_SIZE;
    const along = 3 + Math.random() * (n - 6);
    const side = Math.floor(Math.random() * 4);
    const g = side === 0 ? { x: -5, y: along } : side === 1 ? { x: n + 4, y: along } : side === 2 ? { x: along, y: -5 } : { x: along, y: n + 4 };
    return IsometricHelper.gridToScreen(g.x, g.y);
  }

  private overLand(s: Ship): boolean {
    const t = Navigation.tileOf(s.x, s.y);
    return t.x >= 1 && t.y >= 1 && t.x < GRID_SIZE - 1 && t.y < GRID_SIZE - 1;
  }

  private leave(): void {
    const s = this.ship;
    if (!s || s.state === 'leave') return;
    s.state = 'leave';
    s.exit = this.edgePoint();
    if (!s.voxel) s.body.play(s.hp < s.maxHp * 0.4 ? 'battle-kirov:damaged' : 'battle-kirov:cruise');
    logMessage('kirovLeave');
  }

  private remove(): void {
    const s = this.ship;
    if (!s) return;
    s.root.destroy();
    s.shadow.destroy();
    this.ship = undefined;
    this.unitCds.clear();
    this.towerCds.clear();
  }

  // ── Troop drops ────────────────────────────────────────────────────────────

  private dropTroops(s: Ship): void {
    const T = KIROV.troops;
    const count = Math.min(T.max, T.base + Math.floor(s.wave / T.everyWaves));
    s.dropped = true;
    s.dropMs = T.dropEveryMs;
    s.busyMs = 1300;
    this.playState('drop', 1300);
    const tile = Navigation.tileOf(s.x, s.y);
    let landed = 0;
    for (let i = 0; i < count; i++) {
      this.scene.time.delayedCall(250 + i * 220, () => {
        if (!this.ship || useGameStore.getState().invasion.isActive) return;
        if (this.invasion.spawnRaidTrooper({ x: tile.x + Math.round((Math.random() - 0.5) * 3), y: tile.y + Math.round((Math.random() - 0.5) * 3) })) landed++;
      });
    }
    this.scene.time.delayedCall(300 + count * 220, () => { if (landed) logMessage('kirovTroops', { count: landed }); });
  }

  // ── Skills (structures only) ───────────────────────────────────────────────

  private useSkills(s: Ship, deltaMs: number): void {
    for (let i = 0; i < s.skillCds.length; i++) s.skillCds[i] -= deltaMs;
    const ready = s.skillCds.findIndex((cd) => cd <= 0);
    if (ready < 0 || !s.target) return;
    const sk = KIROV.skills[ready];
    s.skillCds[ready] = sk.cooldownMs;
    const lang = useGameStore.getState().language === 'TL' ? 'tl' : 'en';
    logMessage('kirovSkill', { skill: sk.name[lang], target: this.structures.displayName(s.target.id) });
    const target = s.target;
    switch (sk.id as SkillId) {
      case 'CARPET_BOMB': return this.carpetBomb(s, target, sk.bombs ?? 6, Math.round((sk.damage ?? 0) + (sk.damagePerWave ?? 0) * s.wave));
      case 'WRECKING_ANCHOR': return this.wreckingAnchor(s, target, Math.round((sk.damage ?? 0) + (sk.damagePerWave ?? 0) * s.wave));
      case 'FIREBOMB_RAIN': return this.firebombRain(s, target, sk.canisters ?? 5, sk.burnMs ?? 7000, (sk.burnDps ?? 12) + (sk.burnDpsPerWave ?? 0) * s.wave);
    }
  }

  /** True while the voxel ship holds its paratrooper-drop loop. */
  private dropping(s: Ship): boolean {
    return s.busyMs > 0 && s.dropUntil > 0 && s.busyMs > s.dropUntil;
  }

  /** Plays a one-shot state on the body, then returns to cruising (or limping). */
  private playState(tag: string, busyMs: number): void {
    const s = this.ship;
    if (!s) return;
    s.busyMs = Math.max(s.busyMs, busyMs);
    if (s.voxel) {
      // Drop = the 'run' loop while busy; bombs and firebombs = attack; the anchor = skill; hits flinch
      if (tag === 'drop') s.dropUntil = Math.max(1, s.busyMs - busyMs);
      else if (tag === 'anchor') playCharacterSkill(s.body);
      else if (tag === 'hit') playCharacterHit(s.body);
      else playCharacterAttack(s.body);
      return;
    }
    s.body.play(`battle-kirov:${tag}`);
    const back = () => {
      if (!this.ship || this.ship.state === 'down' || s.body.anims.currentAnim?.key !== `battle-kirov:${tag}`) return;
      s.body.play(s.hp < s.maxHp * 0.4 ? 'battle-kirov:damaged' : 'battle-kirov:cruise');
    };
    if (tag === 'drop') this.scene.time.delayedCall(busyMs, back);
    else s.body.once(Phaser.Animations.Events.ANIMATION_COMPLETE, back);
  }

  /** Where ordnance leaves the airship (its bay, in island space). */
  private bay(s: Ship): { x: number; y: number } {
    return { x: s.root.x, y: s.root.y + 22 * KIROV.scale };
  }

  private impactPoint(t: StructureTarget, spread = 1): { x: number; y: number } {
    return { x: t.x + (Math.random() - 0.5) * 46 * spread, y: t.y + (Math.random() - 0.5) * 20 * spread };
  }

  private fall(from: { x: number; y: number }, to: { x: number; y: number }, tag: 'bomb-fall' | 'canister', ms: number, onLand: () => void): void {
    const p = playFx('battle-ordnance', tag, from.x, from.y, { scale: 1.3 });
    if (!p) { this.scene.time.delayedCall(ms, onLand); return; }
    this.scene.tweens.add({ targets: p, x: to.x, y: to.y, duration: ms, ease: 'Quad.easeIn', onComplete: () => { p.destroy(); onLand(); } });
  }

  private carpetBomb(s: Ship, target: StructureTarget, bombs: number, damage: number): void {
    this.playState('bomb', 1200);
    for (let k = 0; k < bombs; k++) {
      this.scene.time.delayedCall(260 + k * 150, () => {
        if (!this.ship) return;
        const to = this.impactPoint(target);
        this.fall(this.bay(s), to, 'bomb-fall', 520, () => {
          playFx('battle-ordnance', 'blast', to.x, to.y, { scale: 1.6 });
          if (k % 2 === 0) soundFx.playExplosion();
          this.scene.cameras.main.shake(120, 0.002);
          if (this.alive(target)) this.structures.damage(target, damage);
        });
      });
    }
  }

  private wreckingAnchor(s: Ship, target: StructureTarget, damage: number): void {
    this.playState('anchor', 1200);
    this.scene.time.delayedCall(640, () => {
      if (!this.ship) return;
      playFx('battle-ordnance', 'anchor-slam', target.x, target.y + 4, { scale: 2 });
      spawnImpact(target.x, target.y - 10, 'explode', undefined, 2.4);
      this.scene.cameras.main.shake(380, 0.006);
      soundFx.playExplosion();
      if (this.alive(target)) this.structures.damage(target, damage);
    });
  }

  private firebombRain(s: Ship, target: StructureTarget, canisters: number, burnMs: number, dps: number): void {
    this.playState('flare', 1000);
    for (let k = 0; k < canisters; k++) {
      this.scene.time.delayedCall(120 + k * 170, () => {
        if (!this.ship) return;
        const to = this.impactPoint(target, 0.9);
        this.fall({ x: s.root.x + (k % 2 ? 40 : -40) * KIROV.scale, y: s.root.y + 16 }, to, 'canister', 640, () => {
          const fx = playFx('battle-ordnance', 'napalm', to.x, to.y, { scale: 1.2 });
          this.burns.push({ target, fx, lifeMs: burnMs, tickMs: 1000, dps: dps / canisters });
        });
      });
    }
  }

  private updateBurns(deltaMs: number): void {
    if (!this.burns.length) return;
    this.burns = this.burns.filter((b) => {
      b.lifeMs -= deltaMs;
      b.tickMs -= deltaMs;
      if (b.tickMs <= 0) {
        b.tickMs += 1000;
        if (this.alive(b.target)) this.structures.damage(b.target, Math.max(1, Math.round(b.dps)));
      }
      if (b.lifeMs > 0) return true;
      if (b.fx?.active) this.scene.tweens.add({ targets: b.fx, alpha: 0, duration: 500, onComplete: () => b.fx?.destroy() });
      return false;
    });
  }

  // ── Taking damage: flyers, long range, towers and the Demon Lord ──────────

  private updateAntiAir(s: Ship, deltaMs: number): void {
    const A = KIROV.antiAir;
    const aim = { x: s.root.x, y: s.root.y };
    for (const [k, v] of this.unitCds) this.unitCds.set(k, v - deltaMs);
    const shooters: Array<{ key: object; x: number; y: number; cls: string; dmg: number }> = [];
    for (const w of this.workers()) {
      if (w.hp <= 0 || !w.container.active || !w.container.visible) continue;
      shooters.push({ key: w, x: w.container.x, y: w.container.y, cls: w.unitClass, dmg: w.attackPower ?? 12 });
    }
    for (const d of this.defenders()) {
      if (d.hp <= 0 || !d.container.active) continue;
      shooters.push({ key: d, x: d.container.x, y: d.container.y, cls: d.unitClass, dmg: d.damage ?? 8 });
    }
    for (const u of shooters) {
      const range = UNIT_CLASSES[u.cls as keyof typeof UNIT_CLASSES]?.attackRange ?? 0;
      if (!FLYERS.has(u.cls) && range < A.longRange) continue;
      if (Math.hypot(u.x - s.x, u.y - s.y) > A.reach) continue;
      if ((this.unitCds.get(u.key) ?? 0) > 0) continue;
      this.unitCds.set(u.key, A.cooldownMs * (0.85 + Math.random() * 0.3));
      const kind = projectileFor(u.cls, false);
      shootProjectile({ x: u.x, y: u.y - 16 }, { x: aim.x + (Math.random() - 0.5) * 50, y: aim.y + (Math.random() - 0.5) * 16 }, kind, { onHit: () => this.hurt(u.dmg) });
    }
    for (const t of this.structures.getTowers()) {
      const cd = (this.towerCds.get(t.id) ?? 0) - deltaMs;
      this.towerCds.set(t.id, cd);
      if (cd > 0 || Math.hypot(t.x - s.x, t.y - s.y) > A.reach * 1.3) continue;
      this.towerCds.set(t.id, A.towerCooldownMs);
      shootProjectile({ x: t.muzzleX, y: t.muzzleY }, aim, 'plasma', { onHit: () => this.hurt(A.towerDamage * Math.max(1, t.towerLevel)) });
    }
  }

  private demonStrike(): void {
    const s = this.ship;
    if (!s || s.state === 'down' || this.clickCd > 0) return;
    this.clickCd = KIROV.antiAir.demonLordCooldownMs;
    spawnImpact(s.root.x + (Math.random() - 0.5) * 60, s.root.y + (Math.random() - 0.5) * 20, 'explode', undefined, 2);
    this.hurt(KIROV.antiAir.demonLordDamage);
  }

  private hurt(raw: number): void {
    const s = this.ship;
    if (!s || s.state === 'down') return;
    const dmg = Math.max(1, Math.round(raw * (1 - KIROV.defence)));
    const wasHealthy = s.hp >= s.maxHp * 0.4;
    s.hp = Math.max(0, s.hp - dmg);
    this.drawHp();
    if (s.hp <= 0) { this.shootDown(); return; }
    if (wasHealthy && s.hp < s.maxHp * 0.4) logMessage('kirovCrippled');
    if (s.hitMs <= 0 && s.busyMs <= 0) {
      s.hitMs = 700;
      this.playState('hit', 0);
    }
  }

  private drawHp(): void {
    const s = this.ship;
    if (!s) return;
    const w = 90, y = -36 * KIROV.scale;
    s.hpBar.clear();
    s.hpBar.fillStyle(0x0b0b0f, 0.85).fillRect(-w / 2 - 1, y - 1, w + 2, 6);
    s.hpBar.fillStyle(s.hp < s.maxHp * 0.4 ? 0xf97316 : 0xef4444, 1).fillRect(-w / 2, y, w * (s.hp / s.maxHp), 4);
    // Armour plating notches
    s.hpBar.fillStyle(0x94a3b8, 1);
    for (let i = 1; i < 10; i++) s.hpBar.fillRect(-w / 2 + (w / 10) * i, y, 1, 4);
  }

  private shootDown(): void {
    const s = this.ship;
    if (!s) return;
    s.state = 'down';
    s.hpBar.clear();
    s.body.disableInteractive();
    if (s.voxel) playCharacterDeath(s.body, () => {});
    else s.body.play('battle-kirov:destroyed');
    soundFx.playExplosion();
    this.scene.cameras.main.shake(500, 0.006);
    this.scene.tweens.add({ targets: s.root, y: s.y - 10, duration: 1450, ease: 'Quad.easeIn' });
    this.scene.tweens.add({ targets: s.shadow, scaleX: 1.6, scaleY: 1.6, alpha: 0.5, duration: 1450 });
    this.scene.time.delayedCall(1450, () => {
      for (let k = 0; k < 4; k++) {
        this.scene.time.delayedCall(k * 120, () => playFx('battle-ordnance', 'blast', s.x + (Math.random() - 0.5) * 70, s.y + (Math.random() - 0.5) * 24, { scale: 2.2 }));
      }
      soundFx.playExplosion();
      this.scene.cameras.main.shake(600, 0.01);
      const coins = Math.round(KIROV.bounty.coins + KIROV.bounty.coinsPerWave * s.wave);
      useGameStore.getState().addResources({ coins });
      logMessage('kirovDown', { coins });
      this.scene.tweens.add({ targets: [s.root, s.shadow], alpha: 0, duration: 700, delay: 300, onComplete: () => this.remove() });
    });
  }

  destroy(): void {
    for (const b of this.burns) b.fx?.destroy();
    this.burns = [];
    this.remove();
  }
}
