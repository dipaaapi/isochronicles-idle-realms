import Phaser from 'phaser';
import { IsometricHelper } from './IsometricHelper';
import { Navigation, NavAgent } from './Navigation';
import type { ActiveInvader, InvaderBlocker, InvasionManager } from './InvasionManager';
import type { StructureManager } from './StructureManager';
import { useGameStore } from '../state/useGameStore';
import { TileRect, expandRect, isLandTile } from '../state/buildingLayout';
import type { TowerId } from '../types/state';
import type { UnitClass } from '../types/game';
import { createMinionSprite, faceCharacterSprite, playCharacterAttack } from './sprites/CharacterSprites';

/** A garrison guard raised by an establishment, or a summoned ally (skeletons). */
interface Defender extends InvaderBlocker, NavAgent {
  home: TowerId | 'SUMMON';
  /** Summons: what kind (e.g. 'skeleton') and seconds left before they crumble. */
  tag?: string;
  life?: number;
  damage: number;
  container: Phaser.GameObjects.Container;
  sprite?: Phaser.GameObjects.Sprite;
  hpBar: Phaser.GameObjects.Graphics;
  maxHp: number;
  cooldown: number;
  postX: number;
  postY: number;
  target?: ActiveInvader;
  lastX: number;
  lastY: number;
}

const MAX_PER_ESTABLISHMENT = 5;
const SPAWN_INTERVAL = 20; // seconds between recruits per establishment
const GUARD_RADIUS = 5; // tiles around the establishment (and a nearby citadel)
const DEFENDER_HP = 60;
const DEFENDER_DAMAGE = 8;
const DEFENDER_SPEED = 60;
const DEFENDER_REACH = 24;
const IDLE_REGEN = 2; // hp per second while not fighting

const GUARD_CLASS: Record<TowerId, UnitClass> = {
  SPIRE: 'SUCCUBUS',
  WOOD: 'TREANT',
  MINE: 'GOLEM',
  QUARRY: 'GOLEM',
  PORT: 'MERMAN',
  CAVE: 'NECROMANCER',
  TRENCH: 'KRAKEN',
  CRYPT: 'NECROMANCER',
  PERCH: 'HARPY',
  KENNEL: 'DEMON_HOUND',
};

const inRect = (rect: TileRect, x: number, y: number): boolean => {
  const g = Navigation.toGrid(x, y);
  return g.x >= rect.x - 0.5 && g.x <= rect.x + rect.w - 0.5 && g.y >= rect.y - 0.5 && g.y <= rect.y + rect.h - 0.5;
};

export interface SummonOptions {
  tag: string;
  unitClass: UnitClass;
  hp: number;
  damage: number;
  life: number;
  tint?: number;
}

/**
 * Every operational establishment slowly raises up to five guards. They hold
 * posts around their establishment and fight any invader inside its guard
 * radius, and also cover the citadel when it stands within that radius.
 */
export class DefenderSystem {
  private defenders: Defender[] = [];
  private spawnTimers = new Map<TowerId, number>();

  constructor(
    private scene: Phaser.Scene,
    private layer: Phaser.GameObjects.Container,
    private structures: StructureManager,
    private invasion: InvasionManager,
    private nav: Navigation
  ) {}

  /** Raises a temporary ally at a world point (Necromancer skeletons, Raise the Dead). */
  summon(x: number, y: number, opts: SummonOptions): void {
    const pos = this.nav.pushOut(x, y, 0.18);
    this.createUnit('SUMMON', opts.unitClass, pos, opts.hp, opts.damage, opts);
  }

  /** Living summons with this tag. */
  summonCount(tag: string): number {
    return this.defenders.filter((d) => !d.dead && d.tag === tag).length;
  }

  /** Invaders fight defenders that get in their way. */
  getBlockers(): InvaderBlocker[] {
    return this.defenders;
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    const castleAlive = useGameStore.getState().defense.castleHp > 0;
    const castle = this.structures.getCastleTarget();
    const zones = new Map<TowerId, TileRect[]>();

    for (const tower of this.structures.getTowers()) {
      const guard = [expandRect(tower.rect, GUARD_RADIUS)];
      if (castle && this.nav.distanceToRect(tower.x, tower.y, castle.rect) <= GUARD_RADIUS) {
        guard.push(expandRect(castle.rect, GUARD_RADIUS));
      }
      zones.set(tower.id, guard);

      if (!castleAlive) continue;
      const count = this.defenders.filter((d) => d.home === tower.id).length;
      if (count >= MAX_PER_ESTABLISHMENT) {
        this.spawnTimers.set(tower.id, SPAWN_INTERVAL);
        continue;
      }
      const timer = (this.spawnTimers.get(tower.id) ?? SPAWN_INTERVAL) - dt;
      if (timer <= 0) {
        this.spawn(tower.id, tower.rect);
        this.spawnTimers.set(tower.id, SPAWN_INTERVAL);
      } else {
        this.spawnTimers.set(tower.id, timer);
      }
    }

    const invaders = this.invasion
      .getInvaders()
      .filter((i) => !i.isDead && !i.isRetreating && (i.emerge ?? 0) <= 0 && i.container.active);

    for (const d of [...this.defenders]) {
      if (d.dead || !d.container.active) continue;
      if (d.life !== undefined) {
        d.life -= dt;
        if (d.life <= 0) {
          this.kill(d);
          continue;
        }
      }
      // Summons guard the ground around where they rose
      const guard = d.home === 'SUMMON'
        ? [expandRect({ ...Navigation.tileOf(d.postX, d.postY), w: 1, h: 1 }, GUARD_RADIUS)]
        : zones.get(d.home) ?? [];
      const guarding = (inv: ActiveInvader) => guard.some((z) => inRect(z, inv.container.x, inv.container.y));

      if (!d.target || d.target.isDead || d.target.isRetreating || !guarding(d.target)) {
        d.target = invaders
          .filter(guarding)
          .sort((a, b) => this.dist(d, a.container) - this.dist(d, b.container))[0];
      }

      const tx = d.target ? d.target.container.x : d.postX;
      const ty = d.target ? d.target.container.y : d.postY;
      const dist = Math.hypot(tx - d.container.x, ty - d.container.y);

      if (d.target && dist <= DEFENDER_REACH) {
        if (d.sprite) faceCharacterSprite(d.sprite, tx - d.container.x, ty - d.container.y, false);
        d.cooldown -= dt;
        if (d.cooldown <= 0) {
          d.cooldown = 1;
          if (d.sprite) playCharacterAttack(d.sprite);
          this.invasion.damageInvader(d.target, d.damage);
        }
      } else if (dist > 3) {
        this.step(d, tx, ty, dt);
      }

      if (!d.target && d.hp < d.maxHp) {
        d.hp = Math.min(d.maxHp, d.hp + IDLE_REGEN * dt);
        this.drawHp(d);
      }

      const mx = d.container.x - d.lastX;
      const my = d.container.y - d.lastY;
      if (d.sprite && Math.hypot(mx, my) > 0.02) faceCharacterSprite(d.sprite, mx, my, true);
      else if (d.sprite && !(d.target && dist <= DEFENDER_REACH)) faceCharacterSprite(d.sprite, 0, 1, false);
      d.lastX = d.container.x;
      d.lastY = d.container.y;
    }
  }

  private dist(d: Defender, p: { x: number; y: number }): number {
    return Math.hypot(p.x - d.container.x, p.y - d.container.y);
  }

  private step(d: Defender, tx: number, ty: number, dt: number): void {
    const next = this.nav.steer(d, d.container.x, d.container.y, tx, ty, dt);
    const dx = next.x - d.container.x;
    const dy = next.y - d.container.y;
    const len = Math.hypot(dx, dy) || 1;
    const stepLen = Math.min(len, DEFENDER_SPEED * dt);
    const moved = this.nav.pushOut(d.container.x + (dx / len) * stepLen, d.container.y + (dy / len) * stepLen, 0.18);
    d.container.setPosition(moved.x, moved.y);
  }

  private spawn(home: TowerId, rect: TileRect): void {
    // Posts sit on the free ring just outside the footprint
    const ringRect = expandRect(rect, 1);
    const ring: Array<{ x: number; y: number }> = [];
    for (let y = ringRect.y; y < ringRect.y + ringRect.h; y++) {
      for (let x = ringRect.x; x < ringRect.x + ringRect.w; x++) {
        const inside = x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
        if (!inside && !this.nav.isSolidTile(x, y) && isLandTile(x, y)) ring.push({ x, y });
      }
    }
    const spot = ring[Math.floor(Math.random() * ring.length)] ?? { x: rect.x - 1, y: rect.y };
    const pos = IsometricHelper.gridToScreen(spot.x + (Math.random() - 0.5) * 0.4, spot.y + (Math.random() - 0.5) * 0.4);
    this.createUnit(home, GUARD_CLASS[home], pos, DEFENDER_HP, DEFENDER_DAMAGE);
  }

  private createUnit(
    home: TowerId | 'SUMMON',
    unitClass: UnitClass,
    pos: { x: number; y: number },
    hp: number,
    damage: number,
    summon?: SummonOptions
  ): void {
    const container = this.scene.add.container(pos.x, pos.y);
    const shadow = this.scene.add.ellipse(0, 3, 14, 6, 0x000000, 0.35);
    const hpBar = this.scene.add.graphics();
    const sprite = createMinionSprite(this.scene, unitClass) ?? undefined;
    if (sprite) {
      sprite.setScale(sprite.scaleX * 0.8);
      if (summon?.tint !== undefined) sprite.setTint(summon.tint);
      container.add([shadow, sprite, hpBar]);
    } else {
      const body = this.scene.add.graphics();
      body.fillStyle(0x64748b, 1);
      body.fillEllipse(0, -8, 10, 14);
      body.fillStyle(0x38bdf8, 1);
      body.fillRect(-2, -14, 4, 3);
      container.add([shadow, body, hpBar]);
    }
    this.layer.add(container);
    container.setScale(0.1);
    this.scene.tweens.add({ targets: container, scale: 1, duration: 380, ease: 'Back.easeOut' });

    const defender: Defender = {
      home, container, sprite, hpBar, damage, tag: summon?.tag, life: summon?.life,
      hp, maxHp: hp, cooldown: 0.5, dead: false,
      postX: pos.x, postY: pos.y, lastX: pos.x, lastY: pos.y,
      takeHit: (damage: number) => this.hit(defender, damage),
    };
    this.defenders.push(defender);
  }

  private drawHp(d: Defender): void {
    d.hpBar.clear();
    if (d.hp >= d.maxHp) return;
    d.hpBar.fillStyle(0x000000, 0.7);
    d.hpBar.fillRect(-9, -30, 18, 4);
    d.hpBar.fillStyle(0x38bdf8, 1);
    d.hpBar.fillRect(-8, -29, 16 * Math.max(0, d.hp / d.maxHp), 2);
  }

  private hit(d: Defender, damage: number): void {
    if (d.dead) return;
    d.hp -= damage;
    this.drawHp(d);
    if (d.sprite) {
      const sprite = d.sprite;
      sprite.setTintFill(0xffffff);
      this.scene.time.delayedCall(60, () => sprite.active && sprite.clearTint());
    }
    if (d.hp <= 0) this.kill(d);
  }

  private kill(d: Defender): void {
    if (d.dead) return;
    d.dead = true;
    this.defenders = this.defenders.filter((o) => o !== d);
    this.scene.tweens.add({ targets: d.container, scale: 0.1, alpha: 0, duration: 260, onComplete: () => d.container.destroy() });
  }

  destroy(): void {
    for (const d of this.defenders) d.container.destroy();
    this.defenders = [];
  }
}
