import Phaser from 'phaser';
import { IsometricHelper } from './IsometricHelper';
import { PORTAL_SCALE, PORTAL_SITES, PortalSite, rectCenter } from '../state/buildingLayout';
import { riftHpScale } from '../state/portalDefense';
import { normalizeDifficulty } from '../state/difficulty';
import { portalBounty, portalMaxHp } from '../state/defenseStats';
import type { PortalPattern } from '../state/waveTactics';
import { useGameStore } from '../state/useGameStore';
import { logMessage } from '../state/activityLog';
import { soundFx } from './audio/soundFx';
import { createStructureSprite, playStructureAnim, structureHeadroom } from './sprites/StructureSprites';

export type PortalMode = 'dormant' | 'open' | 'destroyed';

export interface PortalState {
  site: PortalSite;
  /** World position of the portal tile centre. */
  x: number;
  y: number;
  /** World position of the land tile invaders step onto. */
  exitX: number;
  exitY: number;
  container: Phaser.GameObjects.Container;
  sprite?: Phaser.GameObjects.Sprite;
  fallback: Phaser.GameObjects.Graphics;
  hpBar: Phaser.GameObjects.Graphics;
  hp: number;
  maxHp: number;
  mode: PortalMode;
  /** Seconds left on a one-shot spawn/absorb animation. */
  busy: number;
  lastHpKey: string;
  /** Bumped every time the rift is torn open for a wave (Rift Sentinels re-form on change). */
  openSerial: number;
  /** HP multiplier of the current wave (sentinels scale with it). */
  hpMultiplier: number;
  /** Seconds left on Warp Ward (damage taken is reduced). */
  wardTimer: number;
}

/** Something standing guard in front of a rift that minions must break first. */
export interface PortalGuard {
  x: number;
  y: number;
  hit: (damage: number) => void;
}

/**
 * The four corner rifts invaders pour out of. Dormant (a faint ember) in
 * peacetime, torn open for each wave, flaring as invaders come out and
 * swirling inward as looters escape back in. Minions can smash an open
 * portal: it stops spawning for the rest of the wave and pays a bounty.
 */
export class PortalManager {
  private portals: PortalState[] = [];
  /** ROTATE pattern: spawns per rift before moving on, and the running count. */
  private rotateEvery = 0;
  private rotateCount = 0;
  private guardProvider?: (p: PortalState) => PortalGuard | null;
  /** Fraction of damage a warded rift still takes. */
  private wardDamageTaken = 1;

  constructor(private scene: Phaser.Scene, private layer: Phaser.GameObjects.Container) {
    for (const site of PORTAL_SITES) {
      // The rift fills its 2×2 corner footprint
      const centre = rectCenter(site.footprint);
      const pos = IsometricHelper.gridToScreen(centre.x, centre.y);
      const exit = IsometricHelper.gridToScreen(site.exit.x, site.exit.y);
      const container = scene.add.container(pos.x, pos.y);
      const fallback = scene.add.graphics();
      const hpBar = scene.add.graphics();
      container.add([fallback, hpBar]);
      layer.add(container);
      container.setScale(PORTAL_SCALE);
      const portal: PortalState = {
        site, x: pos.x, y: pos.y, exitX: exit.x, exitY: exit.y, container, fallback, hpBar,
        hp: 0, maxHp: 1, mode: 'dormant', busy: 0, lastHpKey: '', openSerial: 0, hpMultiplier: 1, wardTimer: 0,
      };
      this.drawFallback(portal);
      this.portals.push(portal);
      this.attachSprite(portal);
      this.applyMode(portal);
    }
  }

  private drawFallback(p: PortalState): void {
    const g = p.fallback;
    g.clear();
    if (p.mode === 'destroyed') {
      g.fillStyle(0x44403c, 1);
      g.fillEllipse(0, -4, 30, 10);
      return;
    }
    g.lineStyle(5, 0x78716c, 1);
    g.strokeEllipse(0, -26, 34, 44);
    if (p.mode === 'open') {
      g.fillStyle(0x3b82f6, 0.85);
      g.fillEllipse(0, -26, 26, 36);
      g.fillStyle(0xfde047, 0.9);
      g.fillCircle(0, -26, 5);
    } else {
      g.fillStyle(0x60a5fa, 0.7);
      g.fillCircle(0, -26, 3);
    }
  }

  private attachSprite(p: PortalState): void {
    if (p.sprite) return;
    const sprite = createStructureSprite(this.scene, 'portal', 'dormant');
    if (!sprite) return;
    p.sprite = sprite;
    p.container.addAt(sprite, 0);
    p.fallback.setVisible(false);
    sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (anim: Phaser.Animations.Animation) => {
      if ((anim.key.endsWith('-spawn') || anim.key.endsWith('-absorb')) && p.mode === 'open') playStructureAnim(sprite, 'idle');
    });
    this.applyMode(p);
  }

  onStripReady(): void {
    for (const p of this.portals) this.attachSprite(p);
  }

  private applyMode(p: PortalState): void {
    this.drawFallback(p);
    if (p.sprite) playStructureAnim(p.sprite, p.mode === 'open' ? 'idle' : p.mode, true);
    p.container.setAlpha(p.mode === 'dormant' ? 0.75 : 1);
    p.lastHpKey = '';
  }

  /** Rift Sentinels register here so minions target them before the rift itself. */
  setGuardProvider(provider: (p: PortalState) => PortalGuard | null, wardDamageTaken: number): void {
    this.guardProvider = provider;
    this.wardDamageTaken = wardDamageTaken;
  }

  /** Nearest standing sentinel of a rift, or null when it is unguarded. */
  guardOf(p: PortalState): PortalGuard | null {
    return this.guardProvider?.(p) ?? null;
  }

  /** Technicians finished mending a smashed rift: it glows dormant again. */
  repair(p: PortalState): void {
    if (p.mode !== 'destroyed') return;
    p.mode = 'dormant';
    this.applyMode(p);
    p.container.setScale(PORTAL_SCALE);
  }

  /** Warp Ward: restores HP to an open rift. */
  heal(p: PortalState, amount: number): void {
    if (p.mode !== 'open' || !(amount > 0)) return;
    p.hp = Math.min(p.maxHp, p.hp + amount);
  }

  getAll(): readonly PortalState[] {
    return this.portals;
  }

  getOpen(): PortalState[] {
    return this.portals.filter((p) => p.mode === 'open');
  }

  /** No rift is left open (smashed, or the formation only opened the ones now destroyed). */
  allSealed(): boolean {
    return !this.portals.some((p) => p.mode === 'open');
  }

  /**
   * Tears the rifts open for a new wave (destroyed ones re-form). The wave's
   * tactic decides which: ALL / ROTATE open every rift, PAIR two opposite
   * corners, SINGLE just one (the others stay dormant).
   */
  open(wave: number, hpMultiplier: number, pattern: PortalPattern = 'ALL', rotateEvery = 0): void {
    // Realm phase and the days the realm has lasted toughen the rifts too
    const store = useGameStore.getState();
    const maxHp = Math.round(portalMaxHp(wave, hpMultiplier) * riftHpScale({
      wave, difficulty: normalizeDifficulty(store.difficulty), day: store.day, year: store.year, phase: store.platformPhase || 1,
    }));
    soundFx.playPortalOpen();
    for (const p of this.portals) {
      p.mode = 'dormant';
      p.busy = 0;
      this.applyMode(p);
    }
    const chosen = this.pickPattern(pattern);
    this.rotateEvery = pattern === 'ROTATE' ? Math.max(1, rotateEvery) : 0;
    this.rotateCount = 0;
    for (const p of chosen) {
      p.mode = 'open';
      p.maxHp = maxHp;
      p.hp = maxHp;
      p.hpMultiplier = hpMultiplier;
      p.wardTimer = 0;
      p.openSerial++;
      this.applyMode(p);
      if (p.sprite) playStructureAnim(p.sprite, 'spawn', true);
      p.container.setScale(0.2 * PORTAL_SCALE);
      this.scene.tweens.add({ targets: p.container, scale: PORTAL_SCALE, duration: 650, ease: 'Back.easeOut' });
    }
    logMessage('portalsOpen', { count: chosen.length });
  }

  private pickPattern(pattern: PortalPattern): PortalState[] {
    if (pattern !== 'PAIR' && pattern !== 'SINGLE') return [...this.portals];
    const first = this.portals[Math.floor(Math.random() * this.portals.length)];
    if (pattern === 'SINGLE' || this.portals.length < 2) return [first];
    const opposite = this.portals
      .filter((p) => p !== first)
      .sort((a, b) => Math.hypot(b.x - first.x, b.y - first.y) - Math.hypot(a.x - first.x, a.y - first.y))[0];
    return [first, opposite];
  }

  /** Wave over: open rifts shrink back to dormant embers; smashed ones stay broken until Technicians repair them. */
  close(): void {
    for (const p of this.portals) {
      if (p.mode !== 'open') continue;
      p.mode = 'dormant';
      this.applyMode(p);
      p.container.setScale(PORTAL_SCALE);
    }
  }

  /** A random open portal for the next invader, or null when all are sealed. */
  pickSpawn(): PortalState | null {
    const open = this.getOpen();
    if (!open.length) return null;
    if (this.rotateEvery > 0) {
      // Rotating rifts: one at a time, moving on every few invaders
      const index = Math.floor(this.rotateCount++ / this.rotateEvery) % open.length;
      return open[index];
    }
    return open[Math.floor(Math.random() * open.length)];
  }

  /** Any portal that is not destroyed (scouts slip through dormant rifts too). */
  pickAny(exclude?: PortalState): PortalState {
    const pool = this.portals.filter((p) => p.mode !== 'destroyed' && p !== exclude);
    return pool[Math.floor(Math.random() * pool.length)] ?? this.portals[0];
  }

  /** Portal whose exit tile is closest to a world point. */
  nearest(x: number, y: number, openOnly = false): PortalState | null {
    let best: PortalState | null = null;
    let bestD = Infinity;
    for (const p of this.portals) {
      if (openOnly && p.mode !== 'open') continue;
      if (!openOnly && p.mode === 'destroyed') continue;
      const d = Math.hypot(p.exitX - x, p.exitY - y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  /** Flare as an invader comes out. */
  playSpawn(p: PortalState): void {
    p.busy = 0.4;
    if (p.sprite && p.mode === 'open') playStructureAnim(p.sprite, 'spawn', true);
    else if (p.sprite && p.mode === 'dormant') {
      // Scouts pry a dormant rift open for a moment
      playStructureAnim(p.sprite, 'spawn', true);
      this.scene.time.delayedCall(450, () => p.mode === 'dormant' && p.sprite?.active && playStructureAnim(p.sprite, 'dormant', true));
    }
    this.sparkle(p, 0x93c5fd);
  }

  /** Inward swirl as an invader escapes back in. */
  playAbsorb(p: PortalState): void {
    p.busy = 0.4;
    if (p.sprite && p.mode !== 'destroyed') {
      playStructureAnim(p.sprite, 'absorb', true);
      if (p.mode === 'dormant') this.scene.time.delayedCall(450, () => p.mode === 'dormant' && p.sprite?.active && playStructureAnim(p.sprite, 'dormant', true));
    }
    this.sparkle(p, 0xfde047);
  }

  private sparkle(p: PortalState, color: number): void {
    for (let i = 0; i < 8; i++) {
      const dot = this.scene.add.rectangle(p.x, p.y - 26, 3, 3, color);
      dot.setDepth(9990);
      this.layer.add(dot);
      const a = (i / 8) * Math.PI * 2;
      this.scene.tweens.add({
        targets: dot,
        x: p.x + Math.cos(a) * 26,
        y: p.y - 26 + Math.sin(a) * 30,
        alpha: 0,
        duration: 420,
        ease: 'Quad.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
  }

  /** Minion damage to an open portal; returns true when this hit destroyed it. */
  damage(p: PortalState, amount: number): boolean {
    if (p.mode !== 'open' || !(amount > 0)) return false;
    if (p.wardTimer > 0) amount *= this.wardDamageTaken;
    p.hp = Math.max(0, p.hp - amount);
    if (p.sprite) {
      const sprite = p.sprite;
      sprite.setTintFill(0xffffff);
      this.scene.time.delayedCall(60, () => sprite.active && sprite.clearTint());
    }
    if (p.hp > 0) return false;

    p.mode = 'destroyed';
    this.applyMode(p);
    const store = useGameStore.getState();
    const bounty = portalBounty(store.invasion.waveNumber);
    store.addResources(bounty);
    const name = store.language === 'TL' ? p.site.name.tl : p.site.name.en;
    logMessage('portalDestroyed', { portal: name, coins: bounty.coins ?? 0 });
    if (this.allSealed()) logMessage('portalsSealed');
    soundFx.playExplosion();
    const origX = p.container.x;
    const origY = p.container.y;
    this.scene.tweens.add({
      targets: p.container,
      x: origX + 4,
      y: origY - 4,
      duration: 40,
      yoyo: true,
      repeat: 4,
      onComplete: () => {
        if (p.container.active) p.container.setPosition(origX, origY);
      },
    });
    for (let i = 0; i < 16; i++) {
      const shard = this.scene.add.rectangle(p.x, p.y - 26, 4, 4, i % 2 ? 0x3b82f6 : 0xfbbf24);
      shard.setDepth(9990);
      this.layer.add(shard);
      this.scene.tweens.add({
        targets: shard,
        x: p.x + Phaser.Math.Between(-50, 50),
        y: p.y - 26 + Phaser.Math.Between(-40, 40),
        angle: Phaser.Math.Between(-180, 180),
        alpha: 0,
        duration: 700,
        ease: 'Cubic.easeOut',
        onComplete: () => shard.destroy(),
      });
    }
    return true;
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    for (const p of this.portals) {
      if (p.busy > 0) p.busy -= dt;
      if (p.wardTimer > 0) p.wardTimer -= dt;
      const show = p.mode === 'open' && p.hp < p.maxHp;
      const key = show ? `${Math.round((p.hp / p.maxHp) * 40)}` : 'off';
      if (key === p.lastHpKey) continue;
      p.lastHpKey = key;
      p.hpBar.clear();
      if (!show) continue;
      const top = -(structureHeadroom('portal') ?? 90) - 4;
      p.hpBar.fillStyle(0x000000, 0.7);
      p.hpBar.fillRect(-19, top - 1, 38, 6);
      p.hpBar.fillStyle(0xa855f7, 1);
      p.hpBar.fillRect(-18, top, 36 * (p.hp / p.maxHp), 4);
    }
  }

  destroy(): void {
    for (const p of this.portals) p.container.destroy();
    this.portals = [];
  }
}
