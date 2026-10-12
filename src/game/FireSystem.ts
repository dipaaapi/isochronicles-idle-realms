import Phaser from 'phaser';
import { IsometricHelper, TILE_WIDTH } from './IsometricHelper';
import type { StructureManager, StructureTarget } from './StructureManager';
import type { InvasionManager } from './InvasionManager';
import type { Defender } from './DefenderSystem';
import type { WorkerInstance } from './workers/types';
import { useGameStore } from '../state/useGameStore';
import { GRID_SIZE, isLandTile, isWaterTile, rectCenter } from '../state/buildingLayout';
import { buildingMaxHp, towerBuildingOf, towerLevelOf } from '../state/defenseStats';
import { UNIT_CLASSES } from '../types/game';
import type { TowerId } from '../types/state';
import { logMessage } from '../state/activityLog';
import { soundFx } from './audio/soundFx';
import CFG from '../data/fireConfig.json';

const rand = ([lo, hi]: number[]): number => lo + Math.random() * (hi - lo);

interface Fire {
  id: TowerId;
  /** 0–100: 0 = out, 100 = collapse. */
  level: number;
  /** Seconds the Treant and the General keep panicking. */
  panic: number;
  /** Shore tile (world) the bucket brigade fills up at. */
  shore: { x: number; y: number };
}

interface Torch {
  fromX: number;
  fromY: number;
  target: StructureTarget;
  t: number;
}

type CrewPhase = 'TO_WATER' | 'FILLING' | 'TO_FIRE' | 'SPLASHING';

interface Crew {
  fire: TowerId;
  phase: CrewPhase;
  timer: number;
}

/**
 * Torch raids. In a random fight (raiding scouts between waves) human
 * scouts lob torches at nearby establishments. A burning establishment has a
 * fire gauge that climbs on its own: tenants form a bucket brigade (fill at
 * the nearest shore, splash on the building) to push it back to 0 — the fire
 * is out, but the building is not repaired. If the gauge reaches 100 the
 * establishment collapses. The Treant and the establishment's General panic
 * for a few seconds whenever a torch lands.
 */
export class FireSystem {
  private fires = new Map<TowerId, Fire>();
  private torches: Torch[] = [];
  private torchCooldowns = new WeakMap<object, number>();
  private crews = new Map<Defender, Crew>();
  private scurry = new WeakMap<WorkerInstance, { x: number; y: number; t: number }>();
  private gfx: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Container,
    private structures: StructureManager,
    private invasion: InvasionManager,
    private walkable: (x: number, y: number) => boolean
  ) {
    this.gfx = scene.add.graphics();
    layer.add(this.gfx);
  }

  isBurning(id: TowerId): boolean {
    return this.fires.has(id);
  }

  private targetOf(id: TowerId): StructureTarget | undefined {
    return this.structures.getTargets().find((t) => t.id === id);
  }

  /** Nearest walkable land tile next to water, as a world point. */
  private shoreNear(target: StructureTarget): { x: number; y: number } {
    const c = rectCenter(target.rect);
    let best = { x: target.x, y: target.y };
    let bestD = Infinity;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (!isLandTile(x, y) || !this.walkable(x, y)) continue;
        if (!(isWaterTile(x + 1, y) || isWaterTile(x - 1, y) || isWaterTile(x, y + 1) || isWaterTile(x, y - 1))) continue;
        const d = (x - c.x) ** 2 + (y - c.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = IsometricHelper.gridToScreen(x, y);
        }
      }
    }
    return best;
  }

  private ignite(target: StructureTarget): void {
    const id = target.id as TowerId;
    const fire = this.fires.get(id);
    const name = this.structures.displayName(id);
    if (fire) {
      fire.level = Math.min(100, fire.level + CFG.torch.hitAdd);
      fire.panic = CFG.panicSeconds;
      logMessage('fireSpread', { building: name }, { mergeKey: `fire+:${id}` });
    } else {
      this.fires.set(id, { id, level: CFG.torch.ignite, panic: CFG.panicSeconds, shore: this.shoreNear(target) });
      logMessage('fireStarted', { building: name });
    }
    soundFx.playExplosion();
  }

  // ── Panic (called from WorkerManager before a worker's normal routine) ──

  /** True while this Treant / General is panicking; it scurries around instead of working. */
  panic(worker: WorkerInstance, deltaSec: number, move: (x: number, y: number, step: number) => void): boolean {
    if (!this.fires.size) return false;
    const isTreant = worker.unitClass === 'TREANT';
    const home = UNIT_CLASSES[worker.unitClass]?.requiredBuilding as TowerId | undefined;
    let fire: Fire | undefined;
    for (const f of this.fires.values()) {
      if (f.panic <= 0) continue;
      if (home === f.id) fire = f;
      else if (isTreant) {
        const t = this.targetOf(f.id);
        if (t && Math.hypot(t.x - worker.container.x, t.y - worker.container.y) <= CFG.treantPanicRange) fire = f;
      }
      if (fire) break;
    }
    if (!fire) return false;

    let spot = this.scurry.get(worker);
    if (!spot || spot.t <= 0) {
      const a = Math.random() * Math.PI * 2;
      const r = 20 + Math.random() * 45;
      spot = { x: worker.container.x + Math.cos(a) * r, y: worker.container.y + Math.sin(a) * r * 0.5, t: 0.5 + Math.random() * 0.5 };
      this.scurry.set(worker, spot);
    }
    spot.t -= deltaSec;
    worker.overrideEmote = '😱';
    worker.overrideEmoteTimer = 400;
    move(spot.x, spot.y, 95 * deltaSec);
    return true;
  }

  // ── Bucket brigade (called from DefenderSystem for each tenant) ──

  /** Runs a tenant's firefighting; returns true when it took over this frame. */
  driveFirefighter(d: Defender, dt: number, step: (x: number, y: number, speed: number) => void): boolean {
    let crew = this.crews.get(d);
    if (crew && !this.fires.has(crew.fire)) {
      this.crews.delete(d);
      crew = undefined;
    }
    if (!crew) {
      if (d.dead || d.home === 'SUMMON' || d.state === 'IN_HUMAN_REALM' || d.state === 'TO_PORTAL') return false;
      crew = this.recruit(d);
      if (!crew) return false;
    }
    const fire = this.fires.get(crew.fire)!;
    const target = this.targetOf(crew.fire);
    if (!target) {
      this.crews.delete(d);
      return false;
    }

    const at = (x: number, y: number, r: number) => Math.hypot(x - d.container.x, y - d.container.y) <= r;
    const reach = (Math.max(target.rect.w, target.rect.h) * TILE_WIDTH) / 2 + 22;
    switch (crew.phase) {
      case 'TO_WATER':
        if (at(fire.shore.x, fire.shore.y, 12)) {
          crew.phase = 'FILLING';
          crew.timer = CFG.fillSeconds;
        } else step(fire.shore.x, fire.shore.y, 1.2);
        break;
      case 'FILLING':
        crew.timer -= dt;
        if (crew.timer <= 0) crew.phase = 'TO_FIRE';
        break;
      case 'TO_FIRE':
        if (at(target.x, target.y, reach)) {
          crew.phase = 'SPLASHING';
          crew.timer = CFG.splashSeconds;
        } else step(target.x, target.y, 1.1);
        break;
      case 'SPLASHING':
        crew.timer -= dt;
        if (crew.timer <= 0) {
          fire.level -= CFG.splash;
          this.splashFx(target, d.container.x, d.container.y);
          crew.phase = 'TO_WATER';
          if (fire.level <= 0) this.extinguish(fire);
        }
        break;
    }
    return true;
  }

  /** Signs a tenant up for the nearest fire short of hands: its own establishment first. */
  private recruit(d: Defender): Crew | undefined {
    let pick: Fire | undefined;
    let pickD = Infinity;
    for (const f of this.fires.values()) {
      let hands = 0;
      for (const c of this.crews.values()) if (c.fire === f.id) hands++;
      if (hands >= CFG.crewPerFire) continue;
      const t = this.targetOf(f.id);
      if (!t) continue;
      const dist = d.home === f.id ? -1 : Math.hypot(t.x - d.container.x, t.y - d.container.y);
      if (dist > CFG.crewRange) continue;
      if (dist < pickD) {
        pickD = dist;
        pick = f;
      }
    }
    if (!pick) return undefined;
    const crew: Crew = { fire: pick.id, phase: 'TO_WATER', timer: 0 };
    this.crews.set(d, crew);
    return crew;
  }

  private extinguish(fire: Fire): void {
    this.fires.delete(fire.id);
    logMessage('fireOut', { building: this.structures.displayName(fire.id) });
  }

  private collapse(fire: Fire): void {
    this.fires.delete(fire.id);
    const store = useGameStore.getState();
    const b = towerBuildingOf(store, fire.id);
    store.damageBuilding(fire.id, buildingMaxHp(towerLevelOf(b)) * 10);
    logMessage('fireCollapsed', { building: this.structures.displayName(fire.id) });
    soundFx.playExplosion();
  }

  // ── Frame ──

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    const store = useGameStore.getState();
    this.throwTorches(dt, store.invasion.isActive);

    for (const torch of [...this.torches]) {
      torch.t += dt / CFG.torch.flightSeconds;
      if (torch.t >= 1) {
        this.torches.splice(this.torches.indexOf(torch), 1);
        if (this.targetOf(torch.target.id as TowerId)) this.ignite(torch.target);
      }
    }

    for (const fire of [...this.fires.values()]) {
      if (!this.targetOf(fire.id)) {
        // Already wrecked by other means: the flames die with it
        this.fires.delete(fire.id);
        continue;
      }
      fire.panic = Math.max(0, fire.panic - dt);
      fire.level += CFG.risePerSecond * dt;
      if (fire.level >= 100) this.collapse(fire);
    }
    for (const d of [...this.crews.keys()]) if (d.dead || !d.container.active) this.crews.delete(d);

    this.draw(dt);
  }

  /** Human scouts in a random fight lob torches at establishments in range. */
  private throwTorches(dt: number, waveOn: boolean): void {
    if (waveOn) return;
    const targets = this.structures.getTargets().filter((t) => t.id !== 'CASTLE' && t.id !== 'SPIRE');
    if (!targets.length) return;
    for (const inv of this.invasion.getInvaders()) {
      if (!inv.isScout || inv.scoutKind !== 'HUMAN' || inv.isDead || inv.isRetreating || !inv.container.active) continue;
      const cd = (this.torchCooldowns.get(inv) ?? rand(CFG.torch.cooldown) / 2) - dt;
      if (cd > 0) {
        this.torchCooldowns.set(inv, cd);
        continue;
      }
      this.torchCooldowns.set(inv, rand(CFG.torch.cooldown));
      if (Math.random() > CFG.torch.chance) continue;
      let best: StructureTarget | undefined;
      let bestD: number = CFG.torch.range;
      for (const t of targets) {
        const dist = Math.hypot(t.x - inv.container.x, t.y - inv.container.y);
        if (dist < bestD) {
          bestD = dist;
          best = t;
        }
      }
      if (!best) continue;
      this.torches.push({ fromX: inv.container.x, fromY: inv.container.y - 18, target: best, t: 0 });
      logMessage('torchThrown', { building: this.structures.displayName(best.id) }, { mergeKey: `torch:${best.id}` });
    }
  }

  private splashFx(target: StructureTarget, fromX: number, fromY: number): void {
    // Drawn next frame as a short spray; a sound sells it
    this.sprays.push({ x0: fromX, y0: fromY - 10, x1: target.x, y1: target.y - 20, t: 0.35 });
    soundFx.playClick();
  }

  private sprays: Array<{ x0: number; y0: number; x1: number; y1: number; t: number }> = [];

  private draw(dt: number): void {
    const g = this.gfx;
    g.clear();
    const now = performance.now() / 1000;

    // Torches in flight: an arcing ember with a short trail
    for (const torch of this.torches) {
      for (let k = 0; k < 4; k++) {
        const t = Math.max(0, torch.t - k * 0.05);
        const x = torch.fromX + (torch.target.x - torch.fromX) * t;
        const y = torch.fromY + (torch.target.y - 30 - torch.fromY) * t - Math.sin(Math.PI * t) * 70;
        g.fillStyle(k === 0 ? 0xfde047 : 0xf97316, 1 - k * 0.22);
        g.fillCircle(x, y, 4 - k * 0.7);
      }
    }

    // Flames, smoke and the fire gauge on each burning establishment
    for (const fire of this.fires.values()) {
      const t = this.targetOf(fire.id);
      if (!t) continue;
      const half = (Math.max(t.rect.w, t.rect.h) * TILE_WIDTH) / 2;
      const flames = 3 + Math.round(fire.level / 12);
      for (let i = 0; i < flames; i++) {
        const seed = i * 12.9898 + fire.id.length;
        const ox = Math.sin(seed) * half * 0.6;
        const oy = Math.cos(seed * 1.7) * half * 0.25 - 20;
        const flick = 0.7 + 0.3 * Math.sin(now * 12 + seed);
        const h = (12 + fire.level * 0.22) * flick;
        const x = t.x + ox;
        const y = t.y + oy;
        g.fillStyle(0xdc2626, 0.85);
        g.fillTriangle(x - 6, y, x + 6, y, x, y - h);
        g.fillStyle(0xfb923c, 0.9);
        g.fillTriangle(x - 4, y, x + 4, y, x, y - h * 0.7);
        g.fillStyle(0xfde047, 0.9);
        g.fillTriangle(x - 2, y, x + 2, y, x, y - h * 0.4);
        g.fillStyle(0x334155, 0.18);
        g.fillCircle(x + Math.sin(now + seed) * 6, y - h - ((now * 20 + seed * 10) % 40), 6);
      }
      const top = t.y - half - 44;
      g.fillStyle(0x000000, 0.65);
      g.fillRect(t.x - 21, top - 1, 42, 6);
      g.fillStyle(fire.level > 70 ? 0xef4444 : 0xf97316, 1);
      g.fillRect(t.x - 20, top, 40 * Math.min(1, fire.level / 100), 4);
    }

    // Buckets: full (blue) on the way to the fire, empty (grey) on the way back
    for (const [d, crew] of this.crews) {
      const full = crew.phase === 'TO_FIRE' || crew.phase === 'SPLASHING';
      const x = d.container.x + 7;
      const y = d.container.y - 12;
      g.fillStyle(0x78716c, 1);
      g.fillRect(x - 3, y - 4, 6, 6);
      if (full) {
        g.fillStyle(0x38bdf8, 1);
        g.fillRect(x - 2, y - 4, 4, 2);
      }
    }

    // Water sprays
    for (const s of [...this.sprays]) {
      s.t -= dt;
      if (s.t <= 0) {
        this.sprays.splice(this.sprays.indexOf(s), 1);
        continue;
      }
      for (let k = 0; k < 6; k++) {
        const u = k / 5;
        const x = s.x0 + (s.x1 - s.x0) * u + (Math.random() - 0.5) * 6;
        const y = s.y0 + (s.y1 - s.y0) * u - Math.sin(Math.PI * u) * 18 + (Math.random() - 0.5) * 6;
        g.fillStyle(0x7dd3fc, 0.8 * (s.t / 0.35));
        g.fillCircle(x, y, 2.5);
      }
    }
  }

  destroy(): void {
    this.gfx.destroy();
    this.fires.clear();
    this.crews.clear();
  }
}
