import Phaser from 'phaser';
import { useGameStore } from '../state/useGameStore';
import { GRID_SIZE, isBridgeTile, isLandTile, isProtectedTile, isRaisedTile, isWaterTile, VORTEX_SITE } from '../state/buildingLayout';
import { INVADER_CONFIGS, UNIT_CLASSES } from '../types/game';
import type { GridPoint } from '../types/game';
import { RUNES, bossRuneTier, rollRuneKind, tierColor, tierName, type RuneKind } from '../state/runes';
import type { Resources } from '../types/state';
import { logMessage, type MessageKey } from '../state/activityLog';
import { pickWildCreature, wildGroupSize, wildMood, type WildCreatureDef, type WildFactionData } from '../state/wildFactions';
import { IsometricHelper } from './IsometricHelper';
import { Navigation, type MoveMode } from './Navigation';
import { invaderMoveMode, minionMoveMode } from './terrain';
import { WATER_DROP_WORLD } from './PixelTileArt';
import { soundFx } from './audio/soundFx';
import { playFx, projectileFor, shootProjectile, spawnImpact, spawnSmoke } from './battleFx';
import { hitReaction } from './hitReaction';
import { setPlusBadge } from './plusBadge';
import {
  createSeaSprite, faceCharacterSprite, playCharacterAttack, playCharacterDeath, playCharacterHit, playCharacterSkill, seaSpriteHeadroom,
} from './sprites/CharacterSprites';
import type { SeaSpriteKey } from './sprites/seaModels';
import type { InvasionManager } from './InvasionManager';
import type { WorkerManager } from './WorkerManager';
import type { DefenderSystem, Defender } from './DefenderSystem';
import type { GroundLootManager } from './GroundLootManager';
import type { WorkerInstance } from './workers/types';
import type { OrderTarget } from './battleTargets';
import type { ActiveInvader } from './invaders/types';

/** How a wild faction differs: where it lives, its meter in the store, its colours and log wording. */
export interface WildFactionSpec {
  id: 'SEA' | 'BROOD';
  data: WildFactionData;
  /** water: rises from the shore, swims under the waves; land: bursts from the ground, burrows under it. */
  habitat: 'water' | 'land';
  meter: () => number;
  truce: () => number;
  stir: (amount: number) => void;
  spendTruce: () => void;
  /** Burst / projectile / HP-bar colours and the silhouette tint. */
  color: number;
  bossColor: number;
  silhouetteTint: number;
  /** Activity-log keys (activityMessages.json). */
  logs: { emerge: MessageKey; boss: MessageKey; retreat: MessageKey; level: MessageKey; slain: MessageKey; skill: MessageKey; restless: MessageKey; bodyguards: MessageKey };
  /** The boss reshapes the land: called every frame while it fights, and when it leaves or dies. */
  onBossTick?: (tile: GridPoint, dt: number) => void;
  onBossGone?: () => void;
  /** The boss heaves the ground around a tile (the Ancient Caterpillar surfacing or erupting). */
  onCarve?: (tile: GridPoint, radius: number) => void;
  onDayChange?: () => void;
}

/** Any creature of a rival wild faction, as seen by this one. */
interface WildRef {
  container: Phaser.GameObjects.Container;
  hp: number;
  maxHp: number;
  owner: WildFactionManager;
  creature: Creature;
  attack: number;
}

type Foe =
  | { kind: 'invader'; ref: ActiveInvader }
  | { kind: 'worker'; ref: WorkerInstance }
  | { kind: 'defender'; ref: Defender }
  | { kind: 'wild'; ref: WildRef };

interface Creature {
  kind: string;
  def: WildCreatureDef;
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  hpBar: Phaser.GameObjects.Graphics;
  badge: Phaser.GameObjects.Text;
  hp: number;
  maxHp: number;
  attack: number;
  level: number;
  cooldown: number;
  skillCd: number;
  guard: number;
  /** Next basic attack is a charged one (Poison Sting). */
  charged: boolean;
  /** Cooldowns of the boss's skill rotation (def.skills). */
  skillCds: number[];
  /** Sworn to protect the faction's boss. */
  bodyguard: boolean;
  /** Rune the boss carries (dropped when it dies). */
  rune?: { kind: RuneKind; tier: number };
  home: { x: number; y: number };
  /** Bound movers (the Leviathan to water, the Caterpillar to land) follow a tile path. */
  path: GridPoint[];
  repath: number;
  state: 'rising' | 'fighting' | 'sinking' | 'dead';
}

interface Silhouette { sprite: Phaser.GameObjects.Sprite; path: GridPoint[]; boss: boolean }

const pointOf = (f: Foe) => f.ref.container;
const alive = (f: Foe): boolean => {
  if (f.kind === 'invader') return !f.ref.isDead && f.ref.hp > 0 && f.ref.container.active;
  if (f.kind === 'worker') return f.ref.hp > 0 && f.ref.container.active && f.ref.container.visible;
  if (f.kind === 'wild') return f.ref.creature.state === 'fighting';
  return !f.ref.dead && f.ref.hp > 0 && f.ref.container.active;
};
/** Where a foe may stand: walkers keep to land (off raised rock), swimmers to water, flyers anywhere. */
const foeMode = (f: Foe): MoveMode =>
  f.kind === 'invader' ? invaderMoveMode(f.ref.type) : f.kind === 'wild' ? 'any' : minionMoveMode(f.ref.unitClass);
const standOk = (mode: MoveMode, x: number, y: number): boolean =>
  mode === 'any' ? x >= 0 && y >= 0 && x < GRID_SIZE && y < GRID_SIZE
  : mode === 'water' ? isWaterTile(x, y)
  : isBridgeTile(x, y) || (isLandTile(x, y) && !isRaisedTile(x, y));
const foeAttack = (f: Foe): number =>
  f.kind === 'invader' ? INVADER_CONFIGS[f.ref.type]?.damage ?? 12
  : f.kind === 'worker' ? f.ref.attackPower ?? 12
  : f.kind === 'wild' ? f.ref.attack
  : f.ref.damage ?? 8;

/**
 * A wild faction of the island's ancient powers — the Sea Folk (water) and the
 * Sand Brood (land). Between battles only their silhouettes move (under the
 * waves / under the ground). When a wave or a brawl begins and their meter is
 * high enough, a group rises and fights the demons AND the humans AND the
 * other wild faction; their boss (Leviathan / Ancient Caterpillar) brings a
 * skill rotation and bodyguards and reshapes the land. Kills give +N, the
 * fallen drop treasure, survivors go home when the fighting ends.
 */
export class WildFactionManager {
  private creatures: Creature[] = [];
  private silhouettes: Silhouette[] = [];
  private spawnTiles: GridPoint[] = [];
  private homeTiles: GridPoint[] = [];
  private wasBattle = false;
  private lastAlive = 0;
  private lastDay = -1;
  private wasRestless = false;
  private lastDt = 0;
  private rivals: WildFactionManager[] = [];
  private engaged = new Map<object, { foe: Foe; creature: Creature; cooldown: number }>();
  private readonly D: WildFactionData;

  constructor(
    private spec: WildFactionSpec,
    private scene: Phaser.Scene,
    private underLayer: Phaser.GameObjects.Container,
    private entities: Phaser.GameObjects.Container,
    private invasion: InvasionManager,
    private workers: WorkerManager,
    private defenders: DefenderSystem,
    private loot: GroundLootManager,
  ) {
    this.D = spec.data;
    this.refreshTiles();
    const s = useGameStore.getState();
    this.lastDay = s.day ?? 0;
    this.wasRestless = spec.meter() >= this.D.contamination.emergeAt;
  }

  /** The other wild factions this one fights. */
  setRivals(rivals: WildFactionManager[]): void {
    this.rivals = rivals.filter((r) => r !== this);
  }

  /** Re-reads the terrain (the land changes as the bosses reshape it). */
  refreshTiles(): void {
    this.homeTiles = [];
    this.spawnTiles = [];
    for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) {
      if (this.spec.habitat === 'water') {
        if (!isWaterTile(x, y)) continue;
        this.homeTiles.push({ x, y });
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isLandTile(x + dx, y + dy))) this.spawnTiles.push({ x, y });
      } else if (isLandTile(x, y) && !isProtectedTile(x, y) && !isRaisedTile(x, y)) {
        this.homeTiles.push({ x, y });
        this.spawnTiles.push({ x, y });
      }
    }
  }

  // ── Geometry ───────────────────────────────────────────────────────────────

  private surfaceDrop(): number {
    return this.spec.habitat === 'water' ? WATER_DROP_WORLD : 0;
  }

  private tileWorld(t: GridPoint, jitter = 0.3) {
    const p = IsometricHelper.gridToScreen(t.x + (Math.random() - 0.5) * jitter, t.y + (Math.random() - 0.5) * jitter);
    return { x: p.x, y: p.y + this.surfaceDrop() };
  }

  /** Centre of a tile at the surface the creature stands on (water tiles sit lower). */
  private tilePoint(t: GridPoint, onWater = isWaterTile(t.x, t.y)) {
    const p = IsometricHelper.gridToScreen(t.x, t.y);
    return { x: p.x, y: p.y + (onWater ? WATER_DROP_WORLD : 0) };
  }

  private tileAt(x: number, y: number, onWater: boolean): GridPoint {
    return Navigation.tileOf(x, y - (onWater ? WATER_DROP_WORLD : 0));
  }

  private boundOk(def: WildCreatureDef) {
    if (def.waterOnly) return (x: number, y: number) => isWaterTile(x, y);
    return (x: number, y: number) => isLandTile(x, y) && !isRaisedTile(x, y);
  }

  /** Shortest 8-way path over tiles that pass `ok` (never cutting a corner); [] when unreachable. */
  private tilePath(from: GridPoint, to: GridPoint, ok: (x: number, y: number) => boolean): GridPoint[] {
    const key = (t: GridPoint) => t.y * GRID_SIZE + t.x;
    if (!ok(from.x, from.y) || !ok(to.x, to.y)) return [];
    const prev = new Map<number, number>([[key(from), -1]]);
    const queue: GridPoint[] = [from];
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head];
      if (cur.x === to.x && cur.y === to.y) break;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const n = { x: cur.x + dx, y: cur.y + dy };
        if (n.x < 0 || n.y < 0 || n.x >= GRID_SIZE || n.y >= GRID_SIZE || prev.has(key(n)) || !ok(n.x, n.y)) continue;
        if (dx && dy && (!ok(cur.x + dx, cur.y) || !ok(cur.x, cur.y + dy))) continue;
        prev.set(key(n), key(cur));
        queue.push(n);
      }
    }
    if (!prev.has(key(to))) return [];
    const out: GridPoint[] = [];
    for (let k = key(to); k !== key(from) && k >= 0; k = prev.get(k)!) out.unshift({ x: k % GRID_SIZE, y: Math.floor(k / GRID_SIZE) });
    return out;
  }

  /** Steps a sprite or container along a tile path; true when it arrived. */
  private followPath(obj: { x: number; y: number }, path: GridPoint[], speed: number, dt: number, onWater: boolean, face?: Phaser.GameObjects.Sprite): boolean {
    const next = path[0];
    if (!next) return true;
    const p = this.tilePoint(next, onWater);
    const dx = p.x - obj.x, dy = p.y - obj.y;
    const d = Math.hypot(dx, dy);
    const step = speed * dt;
    if (d <= step) { obj.x = p.x; obj.y = p.y; path.shift(); }
    else { obj.x += (dx / d) * step; obj.y += (dy / d) * step; }
    if (face) faceCharacterSprite(face, dx, dy, true);
    return path.length === 0;
  }

  // ── Per frame ──────────────────────────────────────────────────────────────

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.lastDt = dt;
    const store = useGameStore.getState();
    const wave = store.invasion.isActive;
    const battle = wave || this.workers.isBrawlActive();
    const C = this.D.contamination;

    // A little calm returns on each peaceful day
    if ((store.day ?? 0) !== this.lastDay) {
      if (!battle) this.spec.stir(C.perPeacefulDay);
      this.lastDay = store.day ?? 0;
      this.spec.onDayChange?.();
    }
    // Every death in a wave stirs them up
    if (wave) {
      const aliveNow = this.invasion.getInvaders().filter((i) => !i.isDead).length;
      if (aliveNow < this.lastAlive) this.spec.stir((this.lastAlive - aliveNow) * C.perBattleDeath);
      this.lastAlive = aliveNow;
    } else this.lastAlive = 0;

    if (battle && !this.wasBattle) this.onBattleStart(wave);
    if (!battle && this.wasBattle) this.onBattleEnd();
    this.wasBattle = battle;

    const restless = this.spec.meter() >= C.emergeAt;
    if (restless && !this.wasRestless) logMessage(this.spec.logs.restless, { level: Math.round(this.spec.meter()) });
    this.wasRestless = restless;

    this.updateSilhouettes(dt);
    for (const c of [...this.creatures]) this.updateCreature(c, dt);
    this.updateFightBack(dt);
  }

  // ── Battle lifecycle ───────────────────────────────────────────────────────

  private onBattleStart(wave: boolean): void {
    const C = this.D.contamination;
    if (wave) {
      this.spec.spendTruce();
      this.spec.stir(C.perWave);
    } else this.spec.stir(C.perBrawl);
    const meter = this.spec.meter();
    const truce = this.spec.truce() > 0;
    // Under a truce they only rise against the humans (never for a demon-only brawl)
    if (truce && !wave) return;
    if (!wave && Math.random() > this.D.brawlEmergeChance) return;
    const size = wildGroupSize(this.D, meter);
    if (!this.spawnTiles.length) return;
    const kinds = Array.from({ length: size }, () => pickWildCreature(this.D));
    const bossKind = Object.keys(this.D.creatures).find((k) => this.D.creatures[k].boss);
    // The boss comes when the meter is near the top, and now and then on any restless wave
    // Both island gods are guaranteed third/fourth-side participants in every
    // invasion wave. Brawls retain the old unrest/chance rules.
    const boss = (wave || !!this.D.boss.inBrawls) && !!bossKind && !this.creatures.some((c) => c.def.boss)
      && (wave || meter >= C.bossAt || Math.random() < this.D.boss.randomChance);
    if (size <= 0 && !boss) return;
    if (boss) kinds.push(bossKind!);
    let risen = 0;
    kinds.forEach((kind, i) => this.scene.time.delayedCall(i * 450, () => { if (this.rise(kind)) risen++; }));
    this.scene.time.delayedCall(kinds.length * 450 + 50, () => {
      if (risen > 0) logMessage(this.spec.logs.emerge, { count: risen });
      if (boss) logMessage(this.spec.logs.boss);
    });
  }

  private onBattleEnd(): void {
    this.releaseAll();
    let left = false;
    for (const c of this.creatures) {
      if (c.state === 'dead' || c.state === 'sinking') continue;
      left = true;
      this.sink(c);
    }
    if (left) logMessage(this.spec.logs.retreat);
  }

  private rise(kind: string): boolean {
    const def = this.D.creatures[kind];
    const sprite = createSeaSprite(this.scene, def.sprite as SeaSpriteKey);
    if (!sprite) return false;
    // Water: from a shore tile; land: out of the ground (dug sand first, if any)
    const sand = this.spec.habitat === 'land' ? this.spawnTiles.filter((t) => useGameStore.getState().terrainSand[`${t.x},${t.y}`] !== undefined) : [];
    const pool = sand.length && Math.random() < 0.7 ? sand : this.spawnTiles;
    // The Ocean God's water dragon always surfaces from the Abyssal Vortex in the southern corner
    const fromVortex = !!def.boss && this.spec.habitat !== 'land';
    const tile = fromVortex
      ? { x: Math.round(VORTEX_SITE.center.x), y: Math.round(VORTEX_SITE.center.y) }
      : pool[Math.floor(Math.random() * pool.length)];
    const at = def.waterOnly || def.landOnly ? this.tilePoint(tile) : this.tileWorld(tile);
    const container = this.scene.add.container(at.x, at.y);
    sprite.setScale(def.boss ? 1.25 : 1);
    const head = -((seaSpriteHeadroom(def.sprite as SeaSpriteKey) ?? 40) * sprite.scaleY) - 6;
    const hpBar = this.scene.add.graphics();
    const badge = this.scene.add.text(14, head - 4, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#fde047', stroke: '#0c4a6e', strokeThickness: 3, fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    container.add([sprite, hpBar, badge]);
    container.setData('headY', head);
    container.setAlpha(0);
    this.entities.add(container);
    const c: Creature = {
      kind, def, container, sprite, hpBar, badge, hp: def.hp, maxHp: def.hp, attack: def.damage, level: 0,
      cooldown: def.attackMs / 1000, skillCd: (def.skill.cooldownMs as number) / 1000, guard: 0, charged: false,
      skillCds: (def.skills ?? []).map((_, i) => 2 + i * 3), bodyguard: false,
      home: { x: at.x, y: at.y }, path: [], repath: 0, state: 'rising',
    };
    this.creatures.push(c);
    // The boss: its kin swear to guard it
    if (def.boss) {
      const sworn = this.creatures.filter((o) => o !== c && !o.def.boss && o.state !== 'dead' && o.state !== 'sinking').slice(0, this.D.bodyguards.count);
      for (const o of sworn) { o.bodyguard = true; o.badge.setText(o.level ? `🛡️+${o.level}` : '🛡️'); }
      if (sworn.length) logMessage(this.spec.logs.bodyguards, { count: sworn.length });
      // Sometimes it rises carrying a rune
      if (Math.random() < this.D.boss.runeChance) {
        c.rune = { kind: rollRuneKind(), tier: bossRuneTier(useGameStore.getState().invasion.waveNumber || 1, false) };
        logMessage('bossCarriesRune', { name: def.name, rune: this.runeLabel(c.rune) });
      }
    }
    // Splash out of the water / burst out of the ground
    spawnImpact(at.x, at.y - 6, 'burst', this.spec.color, def.boss ? 3 : 1.8);
    spawnSmoke(at.x, at.y - 4, def.boss ? 2 : 1, 0);
    if (def.boss) this.spec.onCarve?.(tile, this.D.terrain?.carveRadius ?? 2.6);
    if (def.boss && this.spec.habitat === 'land') playFx('battle-caterpillar', 'erupt', at.x, at.y + 2, { scale: 2.2 });
    sprite.y = 18;
    this.scene.tweens.add({ targets: container, alpha: 1, duration: 500 });
    this.scene.tweens.add({ targets: sprite, y: 0, duration: def.boss ? 1400 : 700, ease: 'Back.easeOut', onComplete: () => { c.state = 'fighting'; } });
    soundFx.playExplosion();
    this.drawHp(c);
    return true;
  }

  private sink(c: Creature): void {
    c.state = 'sinking';
    if (c.def.boss) this.spec.onBossGone?.();
    // Bound movers leave where they are (a straight line home could cross the wrong terrain)
    const back = c.def.waterOnly || c.def.landOnly ? { x: c.container.x, y: c.container.y } : c.home;
    this.scene.tweens.add({
      targets: c.container, x: back.x, y: back.y, duration: 900, ease: 'Sine.easeInOut',
      onComplete: () => {
        spawnImpact(back.x, back.y - 4, 'burst', this.spec.color, 1.4);
        this.scene.tweens.add({ targets: c.sprite, y: 20, duration: 600 });
        this.scene.tweens.add({ targets: c.container, alpha: 0, duration: 600, onComplete: () => this.remove(c) });
      },
    });
  }

  private remove(c: Creature): void {
    c.state = 'dead';
    c.container.destroy();
    const i = this.creatures.indexOf(c);
    if (i >= 0) this.creatures.splice(i, 1);
  }

  // ── For rival factions ─────────────────────────────────────────────────────

  /** This faction's fighting creatures, as targets for the other wild faction. */
  targets(): WildRef[] {
    return this.creatures.filter((c) => c.state === 'fighting').map((c) => ({ container: c.container, hp: c.hp, maxHp: c.maxHp, owner: this, creature: c, attack: c.attack }));
  }

  /** Fighting creatures as targets for Generals ordered to hunt this faction (Generals panel). */
  orderTargets(): OrderTarget[] {
    return this.creatures.filter((c) => c.state === 'fighting').map((c) => ({
      x: c.container.x, y: c.container.y, boss: !!c.def.boss,
      strike: (dmg: number, by: WorkerInstance) => { if (c.state === 'fighting') this.hurt(c, dmg, { kind: 'worker', ref: by }); },
      strikeBy: (dmg: number, minion: unknown) => { if (c.state === 'fighting') this.hurt(c, dmg, { kind: 'defender', ref: minion as Defender }); },
    }));
  }

  /** Fighting creatures that environmental hazards (volcanic magma) can burn. */
  hazardTargets(): { x: number; y: number; name: { en: string; tl: string }; hurt: (dmg: number) => void }[] {
    return this.creatures.filter((c) => c.state === 'fighting').map((c) => ({
      x: c.container.x, y: c.container.y, name: c.def.name,
      hurt: (dmg: number) => { if (c.state === 'fighting') this.hurt(c, dmg); },
    }));
  }

  /** A rival creature hit one of ours; true when it died. */
  hurtByRival(c: Creature, dmg: number): boolean {
    this.hurt(c, dmg);
    return c.state !== 'fighting';
  }

  // ── Combat ─────────────────────────────────────────────────────────────────

  private foes(): Foe[] {
    const truce = this.spec.truce() > 0;
    const out: Foe[] = this.invasion.getInvaders().filter((i) => !i.isDead && !i.isRetreating).map((ref) => ({ kind: 'invader' as const, ref }));
    if (!truce) {
      for (const w of this.workers.getWorkers()) out.push({ kind: 'worker', ref: w });
      for (const d of this.defenders.getDefenders()) out.push({ kind: 'defender', ref: d });
    }
    for (const r of this.rivals) for (const ref of r.targets()) out.push({ kind: 'wild', ref });
    return out.filter(alive);
  }

  private updateCreature(c: Creature, dt: number): void {
    if (c.state !== 'fighting') return;
    c.cooldown -= dt;
    c.skillCd -= dt;
    c.guard = Math.max(0, c.guard - dt);
    if (c.def.boss && this.spec.onBossTick) {
      const onWater = !!c.def.waterOnly;
      this.spec.onBossTick(this.tileAt(c.container.x, c.container.y, onWater), dt);
    }
    const foes = this.foes();
    const x = c.container.x, y = c.container.y;
    let target: Foe | null = null;
    let best = Infinity;
    for (const f of foes) {
      const p = pointOf(f);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < best) { best = d; target = f; }
    }

    // Bodyguards: hunt whoever is attacking the boss, or stay at its side
    const boss = c.bodyguard ? this.creatures.find((o) => o.def.boss && o.state === 'fighting') : undefined;
    if (c.bodyguard && !boss) { c.bodyguard = false; c.badge.setText(c.level ? `+${c.level}` : ''); }
    if (boss) {
      const attackers = [...this.engaged.values()].filter((e) => e.creature === boss && alive(e.foe)).map((e) => e.foe);
      const pool = attackers.length ? attackers : foes.filter((f) => Math.hypot(pointOf(f).x - boss.container.x, pointOf(f).y - boss.container.y) <= this.D.bodyguards.radius);
      target = null; best = Infinity;
      for (const f of pool) {
        const d = Math.hypot(pointOf(f).x - x, pointOf(f).y - y);
        if (d < best) { best = d; target = f; }
      }
      if (!target) {
        const bx = boss.container.x - x, byy = boss.container.y - y, bd = Math.hypot(bx, byy);
        if (bd > 50) {
          if (c.def.waterOnly || c.def.landOnly) {
            // Bound kin keep to their own terrain on the way to the boss
            const onWater = !!c.def.waterOnly;
            c.repath -= dt;
            if (c.repath <= 0 || !c.path.length) {
              c.repath = 0.8;
              c.path = this.tilePath(this.tileAt(x, y, onWater), this.tileAt(boss.container.x, boss.container.y, onWater), this.boundOk(c.def));
            }
            this.followPath(c.container, c.path, c.def.speed, dt, onWater, c.sprite);
          } else { c.container.x += (bx / bd) * c.def.speed * dt; c.container.y += (byy / bd) * c.def.speed * dt; faceCharacterSprite(c.sprite, bx, byy, true); }
        } else faceCharacterSprite(c.sprite, 0, 0, false);
        return;
      }
    }
    // Anyone who wanders close notices the creature and turns on it
    for (const f of foes) {
      if (f.kind !== 'wild' && Math.hypot(pointOf(f).x - x, pointOf(f).y - y) <= this.D.fightBack.noticeRadius) this.engage(f, c, false);
    }

    this.useSkill(c, foes, target);
    const bound = c.def.waterOnly || c.def.landOnly;
    const onWater = !!c.def.waterOnly;
    if (!target) {
      if (bound) {
        if (!c.path.length) c.path = this.tilePath(this.tileAt(x, y, onWater), this.homeTiles[Math.floor(Math.random() * this.homeTiles.length)], this.boundOk(c.def));
        this.followPath(c.container, c.path, c.def.speed * 0.6, dt, onWater, c.sprite);
      } else faceCharacterSprite(c.sprite, 0, 0, false);
      return;
    }
    const tp = pointOf(target);
    const dx = tp.x - x, dy = tp.y - y;
    if (best > c.def.range && bound) {
      // Travel over its own terrain to the tile closest to its target, then strike
      c.repath -= dt;
      if (c.repath <= 0 || !c.path.length) {
        c.repath = 0.8;
        const ok = this.boundOk(c.def);
        let goal: GridPoint | null = null, gd = Infinity;
        for (let ty = 0; ty < GRID_SIZE; ty++) for (let tx = 0; tx < GRID_SIZE; tx++) {
          if (!ok(tx, ty)) continue;
          const w = this.tilePoint({ x: tx, y: ty }, onWater);
          const d = Math.hypot(w.x - tp.x, w.y - tp.y);
          if (d < gd) { gd = d; goal = { x: tx, y: ty }; }
        }
        c.path = goal ? this.tilePath(this.tileAt(x, y, onWater), goal, ok) : [];
      }
      this.followPath(c.container, c.path, c.def.speed, dt, onWater, c.sprite);
      return;
    }
    if (best > c.def.range) {
      const step = c.def.speed * dt;
      c.container.x += (dx / best) * step;
      c.container.y += (dy / best) * step;
      faceCharacterSprite(c.sprite, dx, dy, true);
      return;
    }
    faceCharacterSprite(c.sprite, dx, dy, false);
    const frenzy = c.def.skill.id === 'FRENZY' && this.hpShare(target) < (c.def.skill.belowHp as number);
    if (c.cooldown > 0) return;
    c.cooldown = (c.def.attackMs / 1000) / (frenzy ? (c.def.skill.speedUp as number) : 1);
    playCharacterAttack(c.sprite);
    let dmg = Math.round(c.attack * (0.85 + Math.random() * 0.3));
    if (c.charged) { dmg = Math.round(dmg * (c.def.skill.multiplier as number)); c.charged = false; }
    const foe = target;
    if (c.def.range > 60) {
      shootProjectile({ x, y: y - 20 }, { x: tp.x, y: tp.y - 14 }, 'orb', { tint: this.spec.color, onHit: () => this.strike(c, foe, dmg) });
    } else {
      spawnImpact(tp.x, tp.y - 12, 'spark', undefined, 1.2);
      this.strike(c, foe, dmg);
    }
  }

  private hpShare(f: Foe): number {
    return f.ref.hp / Math.max(1, f.ref.maxHp ?? f.ref.hp);
  }

  private strike(c: Creature, foe: Foe, dmg: number): void {
    if (c.state === 'dead' || !alive(foe)) return;
    if (foe.kind === 'invader') this.invasion.damageInvader(foe.ref, dmg, undefined, true);
    else if (foe.kind === 'worker') this.invasion.hurtWorkerFromSea(foe.ref, dmg);
    else if (foe.kind === 'wild') foe.ref.owner.hurtByRival(foe.ref.creature, dmg);
    else foe.ref.takeHit(dmg);
    if (!alive(foe)) this.levelUp(c);
    else if (foe.kind !== 'wild') this.engage(foe, c, true);
  }

  private levelUp(c: Creature): void {
    const L = this.D.levelUp;
    if (c.level >= L.maxLevel) return;
    c.level++;
    c.attack = Math.round(c.def.damage * (1 + L.attackPerLevel * c.level));
    const oldMax = c.maxHp;
    c.maxHp = Math.round(c.def.hp * (1 + L.hpPerLevel * c.level));
    c.hp = Math.min(c.maxHp, c.hp + (c.maxHp - oldMax) + c.maxHp * L.healOnKill);
    c.badge.setText(c.bodyguard ? `🛡️+${c.level}` : `+${c.level}`);
    c.sprite.setTint(0xfef9c3);
    this.scene.time.delayedCall(160, () => c.sprite.active && c.sprite.clearTint());
    const lang = useGameStore.getState().language === 'TL' ? 'tl' : 'en';
    logMessage(this.spec.logs.level, { name: c.def.name[lang], level: c.level });
    this.drawHp(c);
  }

  private useSkill(c: Creature, foes: Foe[], target: Foe | null): void {
    if (c.def.skills?.length) return this.useBossSkills(c, foes);
    const sk = c.def.skill;
    if (sk.id === 'FRENZY' || sk.id === 'NONE' || c.skillCd > 0) return;
    const x = c.container.x, y = c.container.y;
    const near = (r: number) => foes.filter((f) => Math.hypot(pointOf(f).x - x, pointOf(f).y - y) <= r);
    if (sk.id === 'TIDE_SONG') {
      const hurt = this.creatures.filter((o) => o.state === 'fighting' && o.hp < o.maxHp && Math.hypot(o.container.x - x, o.container.y - y) <= (sk.radius as number));
      if (!hurt.length) return;
      for (const o of hurt) { o.hp = Math.min(o.maxHp, o.hp + (sk.heal as number)); this.drawHp(o); spawnImpact(o.container.x, o.container.y - 16, 'burst', 0x5eead4, 1.2); }
    } else if (sk.id === 'SHELL_GUARD') {
      if (!near(this.D.fightBack.noticeRadius).length) return;
      c.guard = (sk.durationMs as number) / 1000;
      c.sprite.setTint(0xa3e635);
      this.scene.time.delayedCall(sk.durationMs as number, () => c.sprite.active && c.sprite.clearTint());
    } else if (sk.id === 'POISON_STING') {
      if (!target || Math.hypot(pointOf(target).x - x, pointOf(target).y - y) > c.def.range * 1.5) return;
      c.charged = true;
      c.sprite.setTint(0xa3e635);
      this.scene.time.delayedCall(500, () => c.sprite.active && c.sprite.clearTint());
    } else if (sk.id === 'WEB_SPIT') {
      if (!target || target.kind === 'defender' || target.kind === 'wild') return;
      const tp = pointOf(target);
      const ref = target.ref as { slowTimer?: number; slowFactor?: number };
      shootProjectile({ x, y: y - 16 }, { x: tp.x, y: tp.y - 12 }, 'orb', {
        tint: 0xf5f5f4, impact: 'burst',
        onHit: () => { ref.slowTimer = Math.max(ref.slowTimer ?? 0, (sk.durationMs as number) / 1000); ref.slowFactor = sk.slow as number; },
      });
    } else return;
    c.skillCd = (sk.cooldownMs as number) / 1000;
    playCharacterSkill(c.sprite);
    const lang = useGameStore.getState().language === 'TL' ? 'tl' : 'en';
    logMessage(this.spec.logs.skill, { name: c.def.name[lang], skill: c.def.skillName[lang] });
  }

  /** Slows every non-minion foe in reach (minions have no slow state yet). */
  private slowAll(foes: Foe[], slow: number, seconds: number): void {
    for (const f of foes) {
      if (f.kind === 'defender' || f.kind === 'wild') continue;
      const ref = f.ref as { slowTimer?: number; slowFactor?: number };
      ref.slowTimer = Math.max(ref.slowTimer ?? 0, seconds);
      ref.slowFactor = slow;
    }
  }

  /** Drags foes toward (x, y) over land only, battering them. */
  private pullAll(c: Creature, foes: Foe[], x: number, y: number, pull: number, damage: number): void {
    for (const f of foes) {
      const u = f.ref.container;
      const dx = x - u.x, dy = y - u.y, d = Math.hypot(dx, dy) || 1;
      const p = Math.min(pull, d - 30);
      const nx = u.x + (dx / d) * p, ny = u.y + (dy / d) * p;
      const t = Navigation.tileOf(nx, ny);
      if (p > 0 && f.kind !== 'wild' && standOk(foeMode(f), t.x, t.y)) this.scene.tweens.add({ targets: u, x: nx, y: ny, duration: 500, ease: 'Sine.easeIn' });
      this.strike(c, f, damage);
    }
  }

  /** A boss's three skills, each on its own cooldown; one fires at a time. */
  private useBossSkills(c: Creature, foes: Foe[]): void {
    const x = c.container.x, y = c.container.y;
    const lang = useGameStore.getState().language === 'TL' ? 'tl' : 'en';
    const skills = c.def.skills!;
    for (let i = 0; i < skills.length; i++) c.skillCds[i] = (c.skillCds[i] ?? 0) - this.lastDt;
    for (let i = 0; i < skills.length; i++) {
      if (c.skillCds[i] > 0) continue;
      const sk = skills[i];
      const r = sk.radius as number;
      const inReach = foes.filter((f) => Math.hypot(pointOf(f).x - x, pointOf(f).y - y) <= r);
      if (!inReach.length) continue;
      if (sk.id === 'HYDRO_BREATH') {
        // A pressurised jet from the jaws to the farthest foe in reach, hitting everyone along the line
        const far = [...inReach].sort((a, b) => Math.hypot(pointOf(b).x - x, pointOf(b).y - y) - Math.hypot(pointOf(a).x - x, pointOf(a).y - y))[0];
        const to = { x: pointOf(far).x, y: pointOf(far).y };
        const mouthY = y + ((c.container.getData('headY') as number | undefined) ?? -40) + 8;
        this.hydroBreath(x, mouthY, to.x, to.y - 6);
        const len = Math.hypot(to.x - x, to.y - y) || 1;
        const ux = (to.x - x) / len, uy = (to.y - y) / len;
        for (const f of this.foes()) {
          const q = pointOf(f);
          const along = (q.x - x) * ux + (q.y - y) * uy;
          const across = Math.abs(-(q.x - x) * uy + (q.y - y) * ux);
          if (along > 0 && along <= len + 10 && across <= (sk.width as number)) this.strike(c, f, sk.damage as number);
        }
        soundFx.playLaser();
      } else if (sk.id === 'TIDAL_WAVE') {
        // A real wave: a foam-crested ring of water rolling outward, then spray where it breaks
        for (let k = 0; k < 2; k++) {
          const wave = this.scene.add.ellipse(x, y, 16, 8).setStrokeStyle(10 - k * 4, k ? 0xe0f2fe : 0x0ea5e9, k ? 0.9 : 0.6).setFillStyle(0x38bdf8, k ? 0 : 0.18);
          this.entities.add(wave);
          this.scene.tweens.add({ targets: wave, scaleX: (r * 2) / 16, scaleY: (r * 2) / 16, alpha: 0, duration: 650, delay: k * 70, ease: 'Cubic.easeOut', onComplete: () => wave.destroy() });
        }
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * Math.PI * 2;
          this.scene.time.delayedCall(380 + k * 12, () => spawnImpact(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.42, 'burst', 0x7dd3fc, 1.8));
        }
        this.scene.cameras.main.shake(280, 0.005);
        soundFx.playExplosion();
        for (const f of inReach) this.strike(c, f, sk.damage as number);
      } else if (sk.id === 'ABYSSAL_ROAR' || sk.id === 'SILK_SNARE') {
        const roar = sk.id === 'ABYSSAL_ROAR';
        for (let k = 0; k < 3; k++) {
          const ring = this.scene.add.ellipse(x, y - 10, 20, 10).setStrokeStyle(3, roar ? 0xa78bfa : 0xf5f5f4, 0.9);
          this.entities.add(ring);
          this.scene.tweens.add({ targets: ring, scaleX: r / 8, scaleY: r / 8, alpha: 0, duration: 700, delay: k * 160, onComplete: () => ring.destroy() });
        }
        if (roar) this.scene.cameras.main.shake(400, 0.003);
        else {
          // Silk Snare: threads shoot out and weave a web; every foe caught gets its own strands
          const holdMs = sk.durationMs as number;
          const web = playFx('battle-caterpillar', 'snare-cast', x, y, { scale: (r / 28) * 0.9, then: 'snare-hold' });
          this.scene.time.delayedCall(holdMs, () => {
            if (web?.active) { web.play('battle-caterpillar:snare-break'); web.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => web.destroy()); }
          });
          for (const f of inReach) {
            const p = pointOf(f);
            const strands = playFx('battle-caterpillar', 'snare-hold', p.x, p.y + 2, { scale: 0.55 });
            this.scene.time.delayedCall(holdMs, () => strands?.destroy());
          }
        }
        this.slowAll(inReach, sk.slow as number, (sk.durationMs as number) / 1000);
      } else if (sk.id === 'MAELSTROM' || sk.id === 'SAND_VORTEX') {
        const tint = sk.id === 'MAELSTROM' ? 0x22d3ee : 0xd6a35c;
        if (sk.id === 'SAND_VORTEX') {
          // A spinning funnel of sand opens over the Caterpillar, drags foes in, then collapses
          const funnel = playFx('battle-caterpillar', 'vortex-open', x, y + 2, { scale: (r / 40) * 1.4, then: 'vortex' });
          this.scene.time.delayedCall(1700, () => {
            if (!funnel?.active) return;
            funnel.play('battle-caterpillar:vortex-close');
            funnel.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => funnel.destroy());
          });
        }
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 4;
          const rr = r * (1 - k / 16);
          this.scene.time.delayedCall(k * 40, () => spawnImpact(x + Math.cos(a) * rr * 0.8, y + Math.sin(a) * rr * 0.4, 'burst', tint, 1.5));
        }
        this.pullAll(c, inReach, x, y, sk.pull as number, sk.damage as number);
      } else if (sk.id === 'BURROW_ERUPT') {
        // Dive, then burst out under the farthest foe in reach (on land)
        const far = [...inReach].sort((a, b) => Math.hypot(pointOf(b).x - x, pointOf(b).y - y) - Math.hypot(pointOf(a).x - x, pointOf(a).y - y))[0];
        const to = pointOf(far);
        const t = Navigation.tileOf(to.x, to.y);
        if (!isLandTile(t.x, t.y)) continue;
        spawnSmoke(x, y - 4, 2, 0);
        // A dust mound runs under the ground from where it dove to where it bursts out
        const mound = playFx('battle-caterpillar', 'burrow', x, y, { scale: 1.3 });
        if (mound) this.scene.tweens.add({ targets: mound, x: to.x, y: to.y, duration: 350, onComplete: () => mound.destroy() });
        this.scene.tweens.add({ targets: c.sprite, y: 22, duration: 350, ease: 'Sine.easeIn', onComplete: () => {
          if (c.state !== 'fighting') return;
          c.container.setPosition(to.x, to.y);
          c.path = [];
          this.spec.onCarve?.(t, 1.4);
          playFx('battle-caterpillar', 'erupt', to.x, to.y + 2, { scale: 1.9 });
          spawnImpact(to.x, to.y - 8, 'explode', undefined, 2.2);
          this.scene.cameras.main.shake(300, 0.005);
          soundFx.playExplosion();
          for (const f of this.foes()) if (Math.hypot(pointOf(f).x - to.x, pointOf(f).y - to.y) <= (sk.blast as number)) this.strike(c, f, sk.damage as number);
          this.scene.tweens.add({ targets: c.sprite, y: 0, duration: 420, ease: 'Back.easeOut' });
        } });
      } else continue;
      c.skillCds[i] = (sk.cooldownMs as number) / 1000;
      playCharacterSkill(c.sprite);
      logMessage(this.spec.logs.skill, { name: c.def.name[lang], skill: sk.name[lang] });
      return;
    }
  }

  /** Hydro Breath art: a layered water jet (wide translucent sheath, bright core) with spray, then a splash. */
  private hydroBreath(x0: number, y0: number, x1: number, y1: number): void {
    const g = this.scene.add.graphics();
    this.entities.add(g);
    const state = { k: 0 };
    const draw = () => {
      g.clear();
      const k = state.k;
      const reach = Math.min(1, k * 2.2);                 // the jet shoots out, holds, then thins away
      const fade = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const ex = x0 + (x1 - x0) * reach, ey = y0 + (y1 - y0) * reach;
      g.lineStyle(18, 0x0ea5e9, 0.25 * fade); g.lineBetween(x0, y0, ex, ey);
      g.lineStyle(10, 0x38bdf8, 0.6 * fade); g.lineBetween(x0, y0, ex, ey);
      g.lineStyle(4, 0xe0f2fe, 0.95 * fade); g.lineBetween(x0, y0, ex, ey);
      // Spray droplets peeling off the jet
      for (let i = 0; i < 10; i++) {
        const t = Math.random() * reach;
        const px = x0 + (x1 - x0) * t + (Math.random() - 0.5) * 14, py = y0 + (y1 - y0) * t + (Math.random() - 0.5) * 10;
        g.fillStyle(0xe0f2fe, 0.8 * fade);
        g.fillCircle(px, py, 1 + Math.random() * 1.8);
      }
      g.fillStyle(0xbae6fd, 0.7 * fade);
      g.fillCircle(x0, y0, 6);
    };
    this.scene.tweens.add({ targets: state, k: 1, duration: 950, onUpdate: draw, onComplete: () => g.destroy() });
    this.scene.time.delayedCall(430, () => {
      for (let i = 0; i < 3; i++) spawnImpact(x1 + (Math.random() - 0.5) * 18, y1 + (Math.random() - 0.5) * 8, 'burst', 0x7dd3fc, 1.6 + i * 0.3);
      this.scene.cameras.main.shake(180, 0.003);
    });
  }

  private hurt(c: Creature, dmg: number, by?: Foe): void {
    // Bodyguards throw themselves into the blows aimed at their boss
    if (c.def.boss && c.state === 'fighting') {
      const g = this.creatures
        .filter((o) => o.bodyguard && o.state === 'fighting' && Math.hypot(o.container.x - c.container.x, o.container.y - c.container.y) <= this.D.bodyguards.radius)
        .sort((a, b) => b.hp - a.hp)[0];
      if (g) {
        const taken = dmg * this.D.bodyguards.share;
        dmg -= taken;
        this.hurt(g, taken, by);
      }
    }
    if (c.state !== 'fighting') return;
    const taken = Math.max(1, Math.round(dmg * (c.guard > 0 ? 1 - (c.def.skill.reduction as number) : 1)));
    c.hp -= taken;
    hitReaction(this.scene, c.sprite, { knock: 1.5 });
    playCharacterHit(c.sprite);
    this.drawHp(c);
    if (c.hp <= 0) this.die(c, by);
  }

  private die(c: Creature, killer?: Foe): void {
    if (killer && alive(killer)) this.rewardKiller(killer, c.def.boss);
    if (c.def.boss) this.spec.onBossGone?.();
    c.state = 'dead';
    c.hpBar.clear();
    c.badge.setText('');
    const { x, y } = c.container;
    // Treasure for the minions to collect
    for (const l of c.def.loot) {
      const amount = Math.round(l.min + Math.random() * (l.max - l.min)) * (1 + c.level * 0.2);
      if (amount > 0) this.loot.dropLoot(x, y, l.res as keyof Resources, Math.round(amount));
    }
    const lang = useGameStore.getState().language === 'TL' ? 'tl' : 'en';
    logMessage(this.spec.logs.slain, { name: c.def.name[lang] });
    if (c.rune) this.dropRune(c);
    spawnImpact(x, y - 10, 'burst', this.spec.color, c.def.boss ? 3 : 1.6);
    playCharacterDeath(c.sprite, () => {
      this.scene.tweens.add({ targets: c.container, alpha: 0, duration: 500, onComplete: () => this.remove(c) });
    });
  }

  /**
   * Whoever lands the killing blow gains +1 (+bossBonus for a boss): Generals,
   * the Treant and the Slime through the roster (same +N badge and stats as a
   * brawl win), minions and invaders on the spot.
   */
  private rewardKiller(killer: Foe, boss: boolean): void {
    if (killer.kind === 'wild') return; // a rival creature levels up through its own strike
    const reward = this.D.killReward;
    const levels = boss ? reward.bossBonus : 1;
    const lang = useGameStore.getState().language === 'TL' ? 'tl' : 'en';
    let name: string;
    let level: number;
    if (killer.kind === 'worker' && useGameStore.getState().awardSeaKill(killer.ref.id, boss)) {
      const unit = useGameStore.getState().roster.find((u) => u.id === killer.ref.id);
      level = unit?.brawlLevel ?? levels;
      name = UNIT_CLASSES[killer.ref.unitClass]?.[lang === 'tl' ? 'name' : 'nameEn'] ?? killer.ref.unitClass;
    } else {
      const ref = killer.ref as { seaLevel?: number; seaBase?: { hp: number; damage?: number }; hp: number; maxHp: number; damage?: number; container: Phaser.GameObjects.Container };
      ref.seaBase ??= { hp: ref.maxHp, damage: ref.damage };
      ref.seaLevel = (ref.seaLevel ?? 0) + levels;
      const hpGain = Math.max(1, Math.round(ref.maxHp * reward.hpShare * levels));
      ref.maxHp += hpGain;
      ref.hp = Math.min(ref.maxHp, ref.hp + hpGain);
      if (typeof ref.damage === 'number') ref.damage = Math.round(ref.damage * (1 + reward.attackShare * levels));
      setPlusBadge(this.scene, ref.container, ref.seaLevel);
      level = ref.seaLevel;
      name = killer.kind === 'invader'
        ? INVADER_CONFIGS[killer.ref.type]?.[lang === 'tl' ? 'name' : 'nameEn'] ?? killer.ref.type
        : UNIT_CLASSES[(killer.ref as Defender).unitClass]?.[lang === 'tl' ? 'name' : 'nameEn'] ?? 'Minion';
    }
    logMessage('seaKillReward', { name, level });
  }

  /** "Tier III Fury Rune" in both languages, for the activity log. */
  private runeLabel(rune: { kind: RuneKind; tier: number }) {
    const def = RUNES[rune.kind];
    return { en: `${def.icon} ${def.name.en} ${tierName(rune.tier)}`, tl: `${def.icon} ${def.name.tl} ${tierName(rune.tier)}` };
  }

  /** A slain boss's rune flies up in its tier colour and lands in the Rune Vault. */
  private dropRune(c: Creature): void {
    const rune = c.rune!;
    c.rune = undefined;
    useGameStore.getState().grantRune(rune.kind, rune.tier);
    logMessage('runeDropped', { name: c.def.name, rune: this.runeLabel(rune) });
    soundFx.playFanfare();
    const color = parseInt(tierColor(rune.tier).replace('#', ''), 16);
    const gem = this.scene.add.star(c.container.x, c.container.y - 30, 4, 4, 9, color, 1).setStrokeStyle(1.5, 0xffffff, 0.9);
    this.entities.add(gem);
    this.scene.tweens.add({ targets: gem, y: gem.y - 46, angle: 360, alpha: 0, duration: 1400, ease: 'Cubic.easeOut', onComplete: () => gem.destroy() });
  }

  private drawHp(c: Creature): void {
    const g = c.hpBar;
    const head = (c.container.getData('headY') as number) ?? -40;
    const w = c.def.boss ? 46 : 22;
    g.clear();
    g.fillStyle(0x000000, 0.7);
    g.fillRect(-w / 2 - 1, head - 1, w + 2, 5);
    g.fillStyle(c.def.boss ? this.spec.bossColor : this.spec.color, 1);
    g.fillRect(-w / 2, head, w * Math.max(0, c.hp / c.maxHp), 3);
  }

  // ── Fighting back: demons and humans turn on the wild factions ────────────

  private sameSide(a: Foe, b: Foe): boolean {
    return (a.kind === 'invader') === (b.kind === 'invader');
  }

  /** `foe` turns on `creature`; when it was struck, up to two nearby allies join in. */
  private engage(foe: Foe, creature: Creature, struck: boolean): void {
    if (foe.kind === 'wild') return;
    const cfg = this.D.fightBack;
    const onIt = () => [...this.engaged.values()].filter((e) => e.creature === creature).length;
    const add = (f: Foe) => {
      if (f.kind === 'wild') return;
      // Already fighting this faction or another one (one fight at a time)
      if (this.engaged.has(f.ref) || f.ref.seaEngaged || onIt() >= cfg.maxPerCreature || !alive(f)) return;
      if (f.kind === 'worker' && (f.ref.isBrawling || f.ref.unitClass === 'TREANT' || f.ref.unitClass === 'AQUA_SLIME')) return;
      f.ref.seaEngaged = true;
      this.engaged.set(f.ref, { foe: f, creature, cooldown: 0.3 + Math.random() * 0.4 });
    };
    add(foe);
    if (!struck) return;
    const p = pointOf(foe);
    this.foes()
      .filter((o) => o.kind !== 'wild' && o.ref !== foe.ref && this.sameSide(o, foe) && Math.hypot(pointOf(o).x - p.x, pointOf(o).y - p.y) <= cfg.allyRadius)
      .slice(0, 2)
      .forEach(add);
  }

  private release(key: object): void {
    const e = this.engaged.get(key);
    if (!e) return;
    if (e.foe.kind !== 'wild') e.foe.ref.seaEngaged = false;
    this.engaged.delete(key);
  }

  private releaseAll(): void {
    for (const key of [...this.engaged.keys()]) this.release(key);
  }

  /** Reach and look of a fighter turning on a wild creature. */
  private fighterStats(f: Foe): { range: number; speed: number; sprite?: Phaser.GameObjects.Sprite; name: string } {
    if (f.kind === 'invader') return { range: INVADER_CONFIGS[f.ref.type]?.attackRange ?? 45, speed: f.ref.speed, sprite: f.ref.sprite, name: f.ref.type };
    if (f.kind === 'wild') return { range: 45, speed: 0, name: 'wild' };
    const unit = UNIT_CLASSES[f.ref.unitClass];
    return { range: unit?.attackRange ?? 45, speed: f.kind === 'worker' ? f.ref.speed : 72, sprite: f.ref.sprite, name: f.ref.unitClass };
  }

  private updateFightBack(dt: number): void {
    const cfg = this.D.fightBack;
    const truce = this.spec.truce() > 0;
    for (const [key, e] of [...this.engaged]) {
      const { foe, creature: c } = e;
      // Under a truce the demons leave this faction alone too
      if (c.state !== 'fighting' || !alive(foe) || (truce && foe.kind !== 'invader')) { this.release(key); continue; }
      const u = foe.ref.container;
      const dx = c.container.x - u.x, dy = c.container.y - u.y;
      const d = Math.hypot(dx, dy);
      if (d > cfg.leash) { this.release(key); continue; }
      const stats = this.fighterStats(foe);
      const swimmer = !!c.def.waterOnly;
      const reach = Math.max(stats.range, swimmer ? cfg.waterReach : 0);
      if (d > reach) {
        // Close in over land only (nobody wades into the sea after a swimmer)
        const step = Math.min(d - reach * 0.8, stats.speed * dt);
        const nx = u.x + (dx / d) * step, ny = u.y + (dy / d) * step;
        const t = Navigation.tileOf(nx, ny);
        if (standOk(foeMode(foe), t.x, t.y)) { u.x = nx; u.y = ny; }
        // Invaders' AI is paused, so face them here; Generals and minions keep their own sprite sync
        // (facing them from two places each frame made their animation flicker)
        if (stats.sprite && foe.kind === 'invader') faceCharacterSprite(stats.sprite, dx, dy, true);
        continue;
      }
      if (stats.sprite && foe.kind === 'invader') faceCharacterSprite(stats.sprite, dx, dy, false);
      e.cooldown -= dt;
      if (e.cooldown > 0) continue;
      e.cooldown = cfg.cooldownMs / 1000 * (0.85 + Math.random() * 0.3);
      if (stats.sprite) playCharacterAttack(stats.sprite);
      const dmg = foeAttack(foe);
      if (stats.range > 60) {
        const kind = projectileFor(stats.name, foe.kind !== 'invader' || INVADER_CONFIGS[(foe.ref as ActiveInvader).type]?.category === 'HUMAN');
        shootProjectile({ x: u.x, y: u.y - 16 }, { x: c.container.x, y: c.container.y - 18 }, kind, { onHit: () => this.hurt(c, dmg, foe) });
      } else {
        spawnImpact(c.container.x, c.container.y - 14, 'spark', undefined, 1.2);
        this.hurt(c, dmg, foe);
      }
    }
  }

  // ── Silhouettes: under the waves / under the ground ───────────────────────

  private updateSilhouettes(dt: number): void {
    const meter = this.spec.meter();
    const mood = wildMood(this.D, meter, this.spec.truce());
    const emerged = this.creatures.length > 0;
    const want = emerged ? 0 : mood === 'CALM' ? 2 : mood === 'TRUCE' ? 3 : this.D.silhouettes.count + (mood === 'ENRAGED' ? 2 : 0);
    // The boss roams below even when calm on land (the Caterpillar carves the ground), only when foul at sea
    const wantBoss = !emerged && (this.spec.habitat === 'land' || meter >= this.D.contamination.bossAt);
    while (this.silhouettes.filter((h) => !h.boss).length < want) if (!this.addSilhouette(false)) break;
    if (wantBoss && !this.silhouettes.some((h) => h.boss)) this.addSilhouette(true);
    const onWater = this.spec.habitat === 'water';
    const ok = onWater ? (x: number, y: number) => isWaterTile(x, y) : (x: number, y: number) => isLandTile(x, y) && !isRaisedTile(x, y);
    for (const h of [...this.silhouettes]) {
      const drop = (!h.boss && this.silhouettes.filter((o) => !o.boss).length > want) || (h.boss && !wantBoss);
      if (drop) {
        this.silhouettes.splice(this.silhouettes.indexOf(h), 1);
        this.scene.tweens.add({ targets: h.sprite, alpha: 0, duration: 800, onComplete: () => h.sprite.destroy() });
        continue;
      }
      // Wander tile to tile through its own terrain only
      const speed = this.D.silhouettes.speed * (h.boss ? 0.6 : 1);
      if (!h.path.length && this.homeTiles.length) h.path = this.tilePath(this.tileAt(h.sprite.x, h.sprite.y - 4, onWater), this.homeTiles[Math.floor(Math.random() * this.homeTiles.length)], ok).slice(0, 12);
      const pos = { x: h.sprite.x, y: h.sprite.y - 4 };
      this.followPath(pos, h.path, speed, dt, onWater, h.sprite);
      h.sprite.setPosition(pos.x, pos.y + 4);
      // A burrowing boss only stirs a little dust as it moves below (it reshapes the land when it surfaces)
      if (h.boss && !onWater && Math.random() < dt * 2) spawnSmoke(pos.x + (Math.random() - 0.5) * 16, pos.y - 2, 0.5, 0);
    }
  }

  private addSilhouette(boss: boolean): boolean {
    if (!this.homeTiles.length) return false;
    const bossKind = Object.keys(this.D.creatures).find((k) => this.D.creatures[k].boss);
    const kind = boss && bossKind ? bossKind : pickWildCreature(this.D);
    const sprite = createSeaSprite(this.scene, this.D.creatures[kind].sprite as SeaSpriteKey);
    if (!sprite) return false;
    const onWater = this.spec.habitat === 'water';
    const at = this.tilePoint(this.homeTiles[Math.floor(Math.random() * this.homeTiles.length)], onWater);
    // A dark shape under the surface / a mound under the ground: flattened, tinted, faint
    sprite.setPosition(at.x, at.y + 4).setTint(this.spec.silhouetteTint).setAlpha(0).setScale(boss ? 1.4 : 0.9, (boss ? 1.4 : 0.9) * 0.55);
    this.underLayer.add(sprite);
    this.scene.tweens.add({ targets: sprite, alpha: this.D.silhouettes.alpha * (boss ? 1.2 : 1), duration: 1200 });
    this.silhouettes.push({ sprite, path: [], boss });
    return true;
  }

  destroy(): void {
    this.releaseAll();
    for (const c of this.creatures) c.container.destroy();
    for (const h of this.silhouettes) h.sprite.destroy();
    this.creatures = [];
    this.silhouettes = [];
  }
}
