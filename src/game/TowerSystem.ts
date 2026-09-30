import Phaser from 'phaser';
import { IsometricHelper } from './IsometricHelper';
import { Navigation, NavAgent } from './Navigation';
import type { ActiveInvader, InvaderBlocker, InvasionManager } from './InvasionManager';
import type { StructureManager } from './StructureManager';
import { useGameStore } from '../state/useGameStore';
import { teamBonuses } from '../state/skillTree';
import { TileRect, isLandTile } from '../state/buildingLayout';
import { towerStats, TowerStats } from '../state/defenseStats';
import type { TowerId } from '../types/state';
import { logMessage } from '../state/activityLog';
import { soundFx } from './audio/soundFx';
import { ECONOMY_CONFIG } from '../state/economy';
import { isModActive } from './skills/combatMods';
import { INVADER_CONFIGS } from '../types/game';
import { createSaplingSprite, faceCharacterSprite, playCharacterAttack } from './sprites/CharacterSprites';

type Tower = ReturnType<StructureManager['getTowers']>[number];

/** A mini sapling minion summoned by the Sapling Grove. */
interface Sapling extends InvaderBlocker, NavAgent {
  container: Phaser.GameObjects.Container;
  sprite?: Phaser.GameObjects.Sprite;
  body: Phaser.GameObjects.Graphics;
  hpBar: Phaser.GameObjects.Graphics;
  maxHp: number;
  damage: number;
  life: number;
  cooldown: number;
  zone: TileRect;
  homeX: number;
  homeY: number;
  target?: ActiveInvader;
  lastX: number;
  lastY: number;
}

const SAPLING_SPEED = 62;
const SAPLING_REACH = 24;

/** True when a world point lies inside a tile rectangle (continuous grid). */
const inZone = (zone: TileRect, x: number, y: number): boolean => {
  const g = Navigation.toGrid(x, y);
  return g.x >= zone.x - 0.5 && g.x <= zone.x + zone.w - 0.5 && g.y >= zone.y - 0.5 && g.y <= zone.y + zone.h - 0.5;
};

/**
 * Establishment defenses. Each operational establishment guards the 4×4 tile
 * zone around its footprint with its own weapon:
 *  - Quarry: boulder catapult (splash)
 *  - Port: ice storm (many shards, slows)
 *  - Grove: summons mini saplings (5 summons per wave)
 *  - Mine: metal-spike volley (one spike per invader)
 *  - Mystic Cave: hellfire flamethrower (cone + burn)
 *  - Crystal Spire: aether arc (a bolt that chains between invaders)
 */
export class TowerSystem {
  private cooldowns = new Map<TowerId, number>();
  private saplings: Sapling[] = [];
  private groveCharges = 0;
  private wasActive = false;
  private flames: Array<{ tower: Tower; stats: TowerStats; aim: { x: number; y: number }; left: number; tick: number; origin: { x: number; y: number } }> = [];

  constructor(
    private scene: Phaser.Scene,
    private layer: Phaser.GameObjects.Container,
    private groundLayer: Phaser.GameObjects.Container,
    private structures: StructureManager,
    private invasion: InvasionManager,
    private nav: Navigation
  ) {}

  /** Saplings block and absorb invader attacks. */
  getBlockers(): InvaderBlocker[] {
    return this.saplings;
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    const store = useGameStore.getState();
    // Towers also wake up for raiding scouts between waves
    const raiders = this.invasion.getInvaders().some((i) => i.isScout && !i.isDead && !i.isRetreating);
    const active = (store.invasion.isActive || raiders) && store.defense.castleHp > 0;

    if (active && !this.wasActive) {
      this.groveCharges = towerStats('WOOD', 1).charges;
      this.cooldowns.clear();
    }
    if (!active && this.wasActive) {
      for (const s of [...this.saplings]) this.killSapling(s, false);
      this.flames = [];
    }
    this.wasActive = active;

    this.updateSaplings(dt);
    this.updateFlames(dt);
    if (!active) return;

    const aegis = (store.activeGodBlessings?.AEGIS_WRATH || 0) > 0;
    const team = teamBonuses(store);
    const damageMultiplier = team.turret;
    const invaders = this.invasion.getInvaders().filter((i) => !i.isDead && !i.isRetreating && !(i.emerge && i.emerge > 0));

    for (const tower of this.structures.getTowers()) {
      const stats = towerStats(tower.id, tower.towerLevel, damageMultiplier);
      // Eagle Eye (Perch) and Arcane Overcharge (Spire) double the fire rate
      const boosted = (tower.id === 'PERCH' && isModActive('eagleEye')) || (tower.id === 'SPIRE' && isModActive('spireOvercharge'));
      const cd = (this.cooldowns.get(tower.id) ?? 0.8) - dt * (aegis ? 2 : 1) * (boosted ? 2 : 1);
      this.cooldowns.set(tower.id, cd);
      if (cd > 0) continue;
      const inRange = invaders.filter((i) => inZone(tower.zone, i.container.x, i.container.y));
      if (inRange.length === 0) continue;
      const fired = this.fire(tower, stats, inRange);
      this.cooldowns.set(tower.id, fired ? stats.cooldown * team.towerCooldown : 0.3);
    }
  }

  private fire(tower: Tower, stats: TowerStats, targets: ActiveInvader[]): boolean {
    switch (stats.attack) {
      case 'catapult': return this.fireCatapult(tower, stats, targets);
      case 'iceStorm': return this.fireIceStorm(tower, stats, targets);
      case 'saplings': return this.summonSaplings(tower, stats);
      case 'spikes': return this.fireSpikes(tower, stats, targets);
      case 'flamethrower': return this.fireFlames(tower, stats, targets);
      case 'aetherArc': return this.fireAetherArc(tower, stats, targets);
    }
  }

  /**
   * One tower hit, with Armory munitions applied: armor-piercing rounds against
   * Mecha, incendiary rounds set targets burning, and anti-air bonus vs flyers.
   * Returns the damage dealt.
   */
  private hit(inv: ActiveInvader, damage: number, quiet = false, flyingMultiplier = 1): number {
    const { munitions } = useGameStore.getState();
    const cfg = INVADER_CONFIGS[inv.type];
    let dealt = damage;
    if (cfg.category === 'MECHA') dealt *= 1 + ECONOMY_CONFIG.munitions.armorPiercing.perLevel * (munitions?.armorPiercing ?? 0);
    if (cfg.flying) dealt *= flyingMultiplier;
    if (inv.type === 'HUMAN_KNIGHT') dealt *= 0.4; // Shield Wall blocks ranged fire
    dealt = Math.round(dealt);
    this.invasion.damageInvader(inv, dealt, undefined, quiet);
    const incendiary = munitions?.incendiary ?? 0;
    if (incendiary > 0) {
      const { burnDpsPerLevel, burnSeconds } = ECONOMY_CONFIG.munitions.incendiary;
      this.invasion.applyBurn(inv, burnDpsPerLevel * incendiary, burnSeconds);
    }
    return dealt;
  }

  private credit(tower: Tower, damage: number): void {
    if (damage <= 0) return;
    logMessage('towerStrike', { building: this.structures.displayName(tower.id) }, { mergeKey: `tower:${tower.id}`, amount: Math.round(damage) });
  }

  /** Damages every invader within `radiusTiles` of a world point; returns total damage dealt. */
  private splash(x: number, y: number, radiusTiles: number, damage: number, quiet = false): number {
    const c = Navigation.toGrid(x, y);
    let total = 0;
    for (const inv of this.invasion.getInvaders()) {
      if (inv.isDead || (inv.emerge ?? 0) > 0) continue;
      const g = Navigation.toGrid(inv.container.x, inv.container.y);
      if (Math.hypot(g.x - c.x, g.y - c.y) > radiusTiles) continue;
      this.hit(inv, damage, quiet);
      total += damage;
    }
    return total;
  }

  private add<T extends Phaser.GameObjects.GameObject>(obj: T, depth = 9985): T {
    (obj as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(depth);
    this.layer.add(obj);
    return obj;
  }

  // ── Quarry: boulder catapult ────────────────────────────────────────────────

  private fireCatapult(tower: Tower, stats: TowerStats, targets: ActiveInvader[]): boolean {
    // Aim at the invader with the most neighbours nearby (best splash)
    const target = targets
      .map((t) => ({ t, n: targets.filter((o) => Math.hypot(o.container.x - t.container.x, o.container.y - t.container.y) < 40).length }))
      .sort((a, b) => b.n - a.n || b.t.hp - a.t.hp)[0].t;
    const tx = target.container.x;
    const ty = target.container.y;
    this.structures.playAttack(tower.id);
    const sx = tower.muzzleX;
    const sy = tower.muzzleY;
    this.scene.time.delayedCall(260, () => {
      const rock = this.add(this.scene.add.circle(sx, sy, 5.5, 0x78716c));
      rock.setStrokeStyle(1.5, 0x292524);
      const shadow = this.scene.add.ellipse(sx, tower.y, 12, 5, 0x000000, 0.3);
      this.groundLayer.add(shadow);
      const flight = { t: 0 };
      this.scene.tweens.add({
        targets: flight,
        t: 1,
        duration: 750,
        ease: 'Linear',
        onUpdate: () => {
          const k = flight.t;
          const x = sx + (tx - sx) * k;
          const baseY = sy + (ty - sy) * k;
          rock.setPosition(x, baseY - Math.sin(Math.PI * k) * 90);
          rock.setAngle(k * 540);
          shadow.setPosition(x, tower.y + (ty - tower.y) * k);
        },
        onComplete: () => {
          rock.destroy();
          shadow.destroy();
          this.impactDust(tx, ty, 0xa8a29e, stats.splashTiles);
          soundFx.playExplosion();
          this.scene.cameras.main.shake(90, 0.003);
          this.credit(tower, this.splash(tx, ty, stats.splashTiles, stats.damage));
        },
      });
    });
    return true;
  }

  private impactDust(x: number, y: number, color: number, radiusTiles: number): void {
    const ring = this.scene.add.ellipse(x, y, 10, 5);
    ring.setStrokeStyle(3, color, 0.9);
    this.groundLayer.add(ring);
    this.scene.tweens.add({
      targets: ring,
      scaleX: radiusTiles * 8,
      scaleY: radiusTiles * 8,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    for (let i = 0; i < 10; i++) {
      const p = this.add(this.scene.add.rectangle(x, y - 4, 4, 4, i % 2 ? color : 0x57534e));
      const a = (i / 10) * Math.PI * 2;
      this.scene.tweens.add({
        targets: p,
        x: x + Math.cos(a) * Phaser.Math.Between(18, 34),
        y: y - 4 + Math.sin(a) * Phaser.Math.Between(9, 17) - 8,
        alpha: 0,
        duration: 520,
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  // ── Port: ice storm ─────────────────────────────────────────────────────────

  private fireIceStorm(tower: Tower, stats: TowerStats, targets: ActiveInvader[]): boolean {
    const center = targets
      .map((t) => ({ t, n: targets.filter((o) => Math.hypot(o.container.x - t.container.x, o.container.y - t.container.y) < 70).length }))
      .sort((a, b) => b.n - a.n)[0].t;
    const cx = center.container.x;
    const cy = center.container.y;
    const g = Navigation.toGrid(cx, cy);
    this.structures.playAttack(tower.id);
    soundFx.playHarvest('crystal');

    // Frost patch on the ground for the storm's duration
    const frost = this.scene.add.ellipse(cx, cy, stats.radiusTiles * 72 * 1.4, stats.radiusTiles * 36 * 1.4, 0xa5f3fc, 0.18);
    frost.setStrokeStyle(1.5, 0xcffafe, 0.6);
    this.groundLayer.add(frost);
    this.scene.tweens.add({ targets: frost, alpha: 0, delay: stats.stormSeconds * 1000, duration: 500, onComplete: () => frost.destroy() });

    let dealt = 0;
    for (let i = 0; i < stats.shards; i++) {
      this.scene.time.delayedCall((i / stats.shards) * stats.stormSeconds * 1000, () => {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * stats.radiusTiles;
        const p = IsometricHelper.gridToScreen(g.x + Math.cos(a) * r, g.y + Math.sin(a) * r);
        const shard = this.add(this.scene.add.polygon(p.x + 18, p.y - 120, [0, -7, 2.5, 0, 0, 7, -2.5, 0], 0xcffafe));
        shard.setStrokeStyle(1, 0x22d3ee);
        shard.setAngle(-20);
        this.scene.tweens.add({
          targets: shard,
          x: p.x,
          y: p.y - 4,
          duration: 260,
          ease: 'Quad.easeIn',
          onComplete: () => {
            shard.destroy();
            this.iceSplash(p.x, p.y);
            for (const inv of this.invasion.getInvaders()) {
              if (inv.isDead) continue;
              const ig = Navigation.toGrid(inv.container.x, inv.container.y);
              const sg = Navigation.toGrid(p.x, p.y);
              if (Math.hypot(ig.x - sg.x, ig.y - sg.y) > 0.4) continue;
              this.invasion.applySlow(inv, stats.slowFactor, stats.slowSeconds);
              this.hit(inv, stats.damage, true);
              dealt += stats.damage;
            }
            if (i === stats.shards - 1) this.credit(tower, dealt);
          },
        });
      });
    }
    return true;
  }

  private iceSplash(x: number, y: number): void {
    for (let i = 0; i < 4; i++) {
      const p = this.add(this.scene.add.rectangle(x, y - 3, 2.5, 2.5, 0xffffff));
      this.scene.tweens.add({
        targets: p,
        x: x + Phaser.Math.Between(-10, 10),
        y: y - Phaser.Math.Between(6, 14),
        alpha: 0,
        duration: 300,
        onComplete: () => p.destroy(),
      });
    }
  }

  // ── Mine: metal spike volley ────────────────────────────────────────────────

  private fireSpikes(tower: Tower, stats: TowerStats, targets: ActiveInvader[]): boolean {
    // Flak Barrage: anti-air launchers pick flying targets first
    const antiAir = stats.flyingMultiplier > 1;
    const flyRank = (i: ActiveInvader) => (antiAir && INVADER_CONFIGS[i.type].flying ? 0 : 1);
    const picks = [...targets]
      .sort((a, b) => flyRank(a) - flyRank(b) ||
        Math.hypot(a.container.x - tower.x, a.container.y - tower.y) - Math.hypot(b.container.x - tower.x, b.container.y - tower.y))
      .slice(0, stats.volley);
    this.structures.playAttack(tower.id);
    let dealt = 0;
    let landed = 0;
    // Extra spikes beyond the number of invaders go to the nearest again
    for (let i = 0; i < stats.volley; i++) {
      const target = picks[i % picks.length];
      this.scene.time.delayedCall(70 + i * 90, () => {
        if (target.isDead) {
          landed++;
          return;
        }
        const sx = tower.muzzleX;
        const sy = tower.muzzleY;
        const tx = target.container.x;
        const ty = target.container.y - 14;
        const angle = Math.atan2(ty - sy, tx - sx);
        const spike = this.add(this.scene.add.rectangle(sx, sy, 14, 2.5, 0xd1d5db));
        spike.setStrokeStyle(0.8, 0x4b5563);
        spike.setRotation(angle);
        soundFx.playHarvest('stone');
        this.scene.tweens.add({
          targets: spike,
          x: tx,
          y: ty,
          duration: Math.max(120, Math.hypot(tx - sx, ty - sy) * 1.3),
          ease: 'Linear',
          onComplete: () => {
            spike.destroy();
            landed++;
            if (!target.isDead) {
              dealt += this.hit(target, stats.damage, false, stats.flyingMultiplier);
            }
            if (landed >= stats.volley) this.credit(tower, dealt);
          },
        });
      });
    }
    return true;
  }

  // ── Crystal Spire: aether arc ───────────────────────────────────────────────

  private fireAetherArc(tower: Tower, stats: TowerStats, targets: ActiveInvader[]): boolean {
    // First strike: the invader nearest the spire; each jump goes to the nearest
    // invader not yet hit within `chainTiles` (it may leave the zone).
    const distTo = (a: { x: number; y: number }, b: ActiveInvader) => Math.hypot(b.container.x - a.x, b.container.y - a.y);
    const origin = { x: tower.muzzleX, y: tower.muzzleY };
    const chain: ActiveInvader[] = [[...targets].sort((a, b) => distTo(tower, a) - distTo(tower, b))[0]];
    const pool = this.invasion.getInvaders().filter((i) => !i.isDead && !i.isRetreating && (i.emerge ?? 0) <= 0);
    while (chain.length < stats.chains) {
      const last = chain[chain.length - 1];
      const lg = Navigation.toGrid(last.container.x, last.container.y);
      const next = pool
        .filter((i) => !chain.includes(i))
        .map((i) => {
          const g = Navigation.toGrid(i.container.x, i.container.y);
          return { i, d: Math.hypot(g.x - lg.x, g.y - lg.y) };
        })
        .filter((c) => c.d <= stats.chainTiles)
        .sort((a, b) => a.d - b.d)[0];
      if (!next) break;
      chain.push(next.i);
    }

    this.structures.playAttack(tower.id);
    soundFx.playHarvest('crystal');
    let dealt = 0;
    let from = origin;
    chain.forEach((target, k) => {
      const to = { x: target.container.x, y: target.container.y - 14 };
      const start = from;
      this.scene.time.delayedCall(180 + k * 90, () => {
        this.lightning(start.x, start.y, target.isDead ? start.x : target.container.x, target.isDead ? start.y : target.container.y - 14);
        if (!target.isDead) {
          // Each jump loses a little power
          const damage = Math.max(1, Math.round(stats.damage * Math.pow(0.85, k)));
          this.hit(target, damage, true);
          dealt += damage;
          this.iceSplash(target.container.x, target.container.y - 10);
        }
        if (k === chain.length - 1) this.credit(tower, dealt);
      });
      from = to;
    });
    return true;
  }

  /** A jagged, fading bolt between two points. */
  private lightning(x0: number, y0: number, x1: number, y1: number): void {
    const gfx = this.add(this.scene.add.graphics());
    const segments = 6;
    const points = Array.from({ length: segments + 1 }, (_, i) => {
      const t = i / segments;
      const jitter = i === 0 || i === segments ? 0 : Phaser.Math.Between(-7, 7);
      return { x: x0 + (x1 - x0) * t + jitter, y: y0 + (y1 - y0) * t + jitter * 0.5 };
    });
    gfx.lineStyle(5, 0x22d3ee, 0.35);
    gfx.strokePoints(points, false);
    gfx.lineStyle(2, 0xecfeff, 1);
    gfx.strokePoints(points, false);
    this.scene.tweens.add({ targets: gfx, alpha: 0, duration: 260, ease: 'Quad.easeIn', onComplete: () => gfx.destroy() });
  }

  // ── Mystic Cave: hellfire flamethrower ──────────────────────────────────────

  private fireFlames(tower: Tower, stats: TowerStats, targets: ActiveInvader[]): boolean {
    // The Hellfire Maw sits on the cave's right-front face
    const origin = { x: tower.muzzleX, y: tower.muzzleY };
    const target = [...targets].sort((a, b) =>
      Math.hypot(a.container.x - origin.x, a.container.y - origin.y) - Math.hypot(b.container.x - origin.x, b.container.y - origin.y))[0];
    this.structures.playAttack(tower.id);
    soundFx.playExplosion();
    this.flames.push({ tower, stats, aim: { x: target.container.x, y: target.container.y }, left: stats.flameSeconds, tick: 0, origin });
    return true;
  }

  private updateFlames(dt: number): void {
    for (const flame of [...this.flames]) {
      flame.left -= dt;
      flame.tick += dt;
      // Track the nearest invader still in the zone
      const live = this.invasion.getInvaders().filter((i) => !i.isDead && inZone(flame.tower.zone, i.container.x, i.container.y));
      if (live.length) {
        const nearest = live.sort((a, b) =>
          Math.hypot(a.container.x - flame.origin.x, a.container.y - flame.origin.y) - Math.hypot(b.container.x - flame.origin.x, b.container.y - flame.origin.y))[0];
        flame.aim.x += (nearest.container.x - flame.aim.x) * Math.min(1, dt * 6);
        flame.aim.y += (nearest.container.y - flame.aim.y) * Math.min(1, dt * 6);
      }
      const dirX = flame.aim.x - flame.origin.x;
      const dirY = flame.aim.y - flame.origin.y;
      const len = Math.hypot(dirX, dirY) || 1;
      for (let i = 0; i < 3; i++) this.flameParticle(flame.origin, dirX / len, dirY / len, Math.min(len + 20, 150));

      while (flame.tick >= 0.1) {
        flame.tick -= 0.1;
        const half = ((flame.stats.coneDegrees / 2) * Math.PI) / 180;
        let dealt = 0;
        for (const inv of live) {
          const vx = inv.container.x - flame.origin.x;
          const vy = inv.container.y - flame.origin.y;
          const d = Math.hypot(vx, vy);
          if (d > len + 40) continue;
          const cos = (vx * dirX + vy * dirY) / (Math.max(1, d) * len);
          if (cos < Math.cos(half) && d > 24) continue;
          const dmg = Math.max(1, Math.round(flame.stats.damage * 0.1));
          this.hit(inv, dmg, true);
          this.invasion.applyBurn(inv, flame.stats.burnDps, flame.stats.burnSeconds);
          dealt += dmg;
        }
        this.credit(flame.tower, dealt);
      }
      if (flame.left <= 0) {
        this.flames.splice(this.flames.indexOf(flame), 1);
        this.structures.stopAttack(flame.tower.id);
      }
    }
  }

  private flameParticle(origin: { x: number; y: number }, ux: number, uy: number, reach: number): void {
    const spread = (Math.random() - 0.5) * 0.5;
    const cos = Math.cos(spread);
    const sin = Math.sin(spread);
    const dx = ux * cos - uy * sin;
    const dy = ux * sin + uy * cos;
    const dist = reach * (0.6 + Math.random() * 0.4);
    const colors = [0xfef08a, 0xfb923c, 0xf97316, 0xef4444];
    const p = this.add(this.scene.add.circle(origin.x, origin.y, 3 + Math.random() * 2, colors[Math.floor(Math.random() * colors.length)], 0.95));
    this.scene.tweens.add({
      targets: p,
      x: origin.x + dx * dist,
      y: origin.y + dy * dist - Math.random() * 10,
      scale: 2.4,
      alpha: 0,
      duration: 380 + Math.random() * 160,
      ease: 'Quad.easeOut',
      onComplete: () => p.destroy(),
    });
  }

  // ── Grove: sapling summons ──────────────────────────────────────────────────

  private summonSaplings(tower: Tower, stats: TowerStats): boolean {
    if (this.groveCharges <= 0) return false;
    this.groveCharges--;
    this.structures.playAttack(tower.id);
    soundFx.playGolemCheer();
    // Saplings sprout on the zone ring around the grove's footprint
    const ring: Array<{ x: number; y: number }> = [];
    for (let y = tower.zone.y; y < tower.zone.y + tower.zone.h; y++) {
      for (let x = tower.zone.x; x < tower.zone.x + tower.zone.w; x++) {
        const inside = x >= tower.rect.x && x < tower.rect.x + tower.rect.w && y >= tower.rect.y && y < tower.rect.y + tower.rect.h;
        if (!inside && !this.nav.isSolidTile(x, y) && isLandTile(x, y)) ring.push({ x, y });
      }
    }
    for (let i = 0; i < stats.perSummon; i++) {
      const spot = ring[Math.floor(Math.random() * ring.length)] ?? { x: tower.rect.x - 1, y: tower.rect.y };
      this.spawnSapling(tower, stats, spot.x, spot.y);
    }
    logMessage('saplingsSummoned', { left: this.groveCharges }, { mergeKey: 'saplings', amount: stats.perSummon });
    return true;
  }

  private spawnSapling(tower: Tower, stats: TowerStats, gx: number, gy: number): void {
    const pos = IsometricHelper.gridToScreen(gx + (Math.random() - 0.5) * 0.4, gy + (Math.random() - 0.5) * 0.4);
    const container = this.scene.add.container(pos.x, pos.y);
    const shadow = this.scene.add.ellipse(0, 3, 12, 5, 0x000000, 0.35);
    const body = this.scene.add.graphics();
    const hpBar = this.scene.add.graphics();
    const sprite = createSaplingSprite(this.scene) ?? undefined;
    if (!sprite) {
      body.fillStyle(0x7a4f2c, 1);
      body.fillEllipse(0, -6, 9, 11);
      body.fillStyle(0x56c45a, 1);
      body.fillEllipse(-3, -14, 6, 3);
      body.fillEllipse(3, -14, 6, 3);
    }
    container.add(sprite ? [shadow, sprite, hpBar] : [shadow, body, hpBar]);
    this.layer.add(container);
    container.setScale(0.1);
    this.scene.tweens.add({ targets: container, scale: 1, duration: 380, ease: 'Back.easeOut' });

    // Sprout burst of leaves
    for (let i = 0; i < 8; i++) {
      const leaf = this.add(this.scene.add.rectangle(pos.x, pos.y - 6, 3, 3, i % 2 ? 0x4ade80 : 0x86efac));
      const a = (i / 8) * Math.PI * 2;
      this.scene.tweens.add({
        targets: leaf,
        x: pos.x + Math.cos(a) * 16,
        y: pos.y - 6 + Math.sin(a) * 9 - 6,
        alpha: 0,
        duration: 450,
        onComplete: () => leaf.destroy(),
      });
    }

    const sapling: Sapling = {
      container, sprite, body, hpBar,
      hp: stats.saplingHp, maxHp: stats.saplingHp, damage: stats.damage,
      life: stats.saplingLifetime, cooldown: 0.4, dead: false,
      zone: tower.zone, homeX: pos.x, homeY: pos.y, lastX: pos.x, lastY: pos.y,
      takeHit: (damage: number) => this.hitSapling(sapling, damage),
    };
    this.drawSaplingHp(sapling);
    this.saplings.push(sapling);
  }

  private drawSaplingHp(s: Sapling): void {
    s.hpBar.clear();
    if (s.hp >= s.maxHp) return;
    s.hpBar.fillStyle(0x000000, 0.7);
    s.hpBar.fillRect(-9, -26, 18, 4);
    s.hpBar.fillStyle(0x4ade80, 1);
    s.hpBar.fillRect(-8, -25, 16 * Math.max(0, s.hp / s.maxHp), 2);
  }

  private hitSapling(s: Sapling, damage: number): void {
    if (s.dead) return;
    s.hp -= damage;
    this.drawSaplingHp(s);
    if (s.sprite) {
      const sprite = s.sprite;
      sprite.setTintFill(0xffffff);
      this.scene.time.delayedCall(60, () => sprite.active && sprite.clearTint());
    }
    if (s.hp <= 0) this.killSapling(s, true);
  }

  private killSapling(s: Sapling, burst: boolean): void {
    if (s.dead) return;
    s.dead = true;
    this.saplings = this.saplings.filter((o) => o !== s);
    if (burst && s.container.active) {
      for (let i = 0; i < 6; i++) {
        const leaf = this.add(this.scene.add.rectangle(s.container.x, s.container.y - 8, 3, 3, 0x86efac));
        this.scene.tweens.add({
          targets: leaf,
          x: leaf.x + Phaser.Math.Between(-14, 14),
          y: leaf.y + Phaser.Math.Between(-12, 6),
          alpha: 0,
          duration: 420,
          onComplete: () => leaf.destroy(),
        });
      }
    }
    this.scene.tweens.add({ targets: s.container, scale: 0.1, alpha: 0, duration: 260, onComplete: () => s.container.destroy() });
  }

  private updateSaplings(dt: number): void {
    const invaders = this.invasion.getInvaders();
    for (const s of [...this.saplings]) {
      if (s.dead || !s.container.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        this.killSapling(s, true);
        continue;
      }
      // Hunt invaders inside the grove's zone only
      if (!s.target || s.target.isDead || !inZone(s.zone, s.target.container.x, s.target.container.y)) {
        s.target = invaders
          .filter((i) => !i.isDead && (i.emerge ?? 0) <= 0 && inZone(s.zone, i.container.x, i.container.y))
          .sort((a, b) => Math.hypot(a.container.x - s.container.x, a.container.y - s.container.y) - Math.hypot(b.container.x - s.container.x, b.container.y - s.container.y))[0];
      }
      const tx = s.target ? s.target.container.x : s.homeX;
      const ty = s.target ? s.target.container.y : s.homeY;
      const dist = Math.hypot(tx - s.container.x, ty - s.container.y);
      if (s.target && dist <= SAPLING_REACH) {
        if (s.sprite) faceCharacterSprite(s.sprite, tx - s.container.x, ty - s.container.y, false);
        s.cooldown -= dt;
        if (s.cooldown <= 0) {
          s.cooldown = 0.9;
          if (s.sprite) playCharacterAttack(s.sprite);
          this.hit(s.target, s.damage);
          logMessage('towerStrike', { building: this.structures.displayName('WOOD') }, { mergeKey: 'tower:WOOD', amount: s.damage });
        }
      } else if (dist > 3) {
        const next = this.nav.steer(s, s.container.x, s.container.y, tx, ty, dt);
        const dx = next.x - s.container.x;
        const dy = next.y - s.container.y;
        const d = Math.hypot(dx, dy) || 1;
        const step = Math.min(d, SAPLING_SPEED * dt);
        const moved = this.nav.pushOut(s.container.x + (dx / d) * step, s.container.y + (dy / d) * step, 0.18);
        s.container.setPosition(moved.x, moved.y);
      }
      const mx = s.container.x - s.lastX;
      const my = s.container.y - s.lastY;
      if (s.sprite && Math.hypot(mx, my) > 0.02) faceCharacterSprite(s.sprite, mx, my, true);
      else if (s.sprite && !(s.target && dist <= SAPLING_REACH)) faceCharacterSprite(s.sprite, 0, 1, false);
      s.lastX = s.container.x;
      s.lastY = s.container.y;
    }
  }

  destroy(): void {
    for (const s of this.saplings) s.container.destroy();
    this.saplings = [];
    this.flames = [];
  }
}
