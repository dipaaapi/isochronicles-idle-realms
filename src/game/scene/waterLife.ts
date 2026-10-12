import Phaser from 'phaser';
import { IsometricHelper } from '../IsometricHelper';
import { WATER_DROP_WORLD } from '../PixelTileArt';
import { GRID_SIZE, isWaterTile } from '../../state/buildingLayout';

/** Realm (platformPhase 1–4) → biome sheet made in Aseprite (art/water/*.lua, art/water/build.sh). */
const BIOMES = ['ocean', 'magma', 'frost', 'astral'] as const;
type Biome = (typeof BIOMES)[number];

/** Sheets are painted at 2× (0.5 world unit per pixel) for a crisper surface than the tile atlas. */
const HD_SCALE = 0.5;
const FISH_PER_TILES = 14;
const FISH_SPEED = 26;

const surfaceKey = (b: Biome) => `water-surface-${b}`;
const fishKey = (b: Biome) => `fish-${b}`;

interface Fish {
  sprite: Phaser.GameObjects.Sprite;
  tile: { x: number; y: number };
  target: { x: number; y: number };
  /** Seconds until it dives and resurfaces somewhere else. */
  diveIn: number;
  /** Seconds left under water (hidden). */
  under: number;
}

/**
 * Live water: an animated, seamless HD surface (waves, swell, foam, glints)
 * over every ocean and canal tile, plus fish that wander tile to tile,
 * dive with a ripple ring and pop up elsewhere. Each realm has its own
 * biome — Demon Citadel sea, Magma Caldera lava, Frost Spire ice, Astral
 * void — authored in Aseprite and loaded with Phaser's Aseprite loader.
 */
export class WaterLife {
  private container: Phaser.GameObjects.Container;
  private fishLayer: Phaser.GameObjects.Container;
  private surfaceLayer: Phaser.GameObjects.Container;
  private surfaces: Phaser.GameObjects.Sprite[] = [];
  private fish: Fish[] = [];
  private waterTiles: Array<{ x: number; y: number }> = [];
  private biome: Biome;
  private ready = false;
  /** Last surface speed / frozen state applied (only re-applied when it changes). */
  private appliedFlow = -1;
  private appliedFrozen = -1;

  constructor(private scene: Phaser.Scene, layer: Phaser.GameObjects.Container, phase: number) {
    this.biome = BIOMES[Math.max(0, Math.min(3, (phase || 1) - 1))];
    this.container = scene.add.container(0, 0);
    this.fishLayer = scene.add.container(0, 0);
    this.surfaceLayer = scene.add.container(0, 0);
    // Fish swim under the surface highlights; both sit beneath everything else on the ground FX layer
    this.container.add([this.fishLayer, this.surfaceLayer]);
    layer.addAt(this.container, 0);
    this.load();
  }

  private load(): void {
    const base = import.meta.env.BASE_URL;
    let queued = false;
    for (const b of BIOMES) {
      for (const key of [surfaceKey(b), fishKey(b)]) {
        if (this.scene.textures.exists(key)) continue;
        this.scene.load.aseprite(key, `${base}tiles/${key}.png`, `${base}tiles/${key}.json`);
        queued = true;
      }
    }
    if (!queued) {
      this.onLoaded();
      return;
    }
    this.scene.load.once(Phaser.Loader.Events.COMPLETE, () => this.onLoaded());
    this.scene.load.start();
  }

  private onLoaded(): void {
    if (!this.container.active) return;
    for (const b of BIOMES) {
      for (const key of [surfaceKey(b), fishKey(b)]) {
        if (this.scene.textures.exists(key)) this.scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
      this.makeAnim(`${surfaceKey(b)}:flow`, surfaceKey(b), 'flow', 12, b === 'magma' ? 6 : 9, -1);
      this.makeAnim(`${fishKey(b)}:swim`, fishKey(b), 'swim', 6, 11, -1);
      this.makeAnim(`${fishKey(b)}:dive`, fishKey(b), 'dive', 4, 8, 0);
    }
    this.ready = true;
    this.rebuild();
  }

  private makeAnim(key: string, texture: string, tag: string, count: number, frameRate: number, repeat: number): void {
    if (this.scene.anims.exists(key) || !this.scene.textures.exists(texture)) return;
    this.scene.anims.create({
      key,
      frames: this.scene.anims.generateFrameNames(texture, { prefix: `${tag}-`, start: 0, end: count - 1 }),
      frameRate,
      repeat,
    });
  }

  /** Re-lays the surface and fish (new layout or realm). */
  rebuild(): void {
    if (!this.ready) return;
    for (const s of this.surfaces) s.destroy();
    for (const f of this.fish) f.sprite.destroy();
    this.surfaces = [];
    this.fish = [];
    this.waterTiles = [];
    for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) if (isWaterTile(x, y)) this.waterTiles.push({ x, y });

    // Every tile plays the same loop in lockstep, so the pattern stays seamless across tiles
    this.appliedFlow = -1;
    this.appliedFrozen = -1;
    const flow = `${surfaceKey(this.biome)}:flow`;
    for (const t of this.waterTiles) {
      const p = IsometricHelper.gridToScreen(t.x, t.y);
      const s = this.scene.add.sprite(p.x, p.y + WATER_DROP_WORLD, surfaceKey(this.biome)).setScale(HD_SCALE);
      s.play(flow);
      this.surfaceLayer.add(s);
      this.surfaces.push(s);
    }
    const count = Math.max(3, Math.round(this.waterTiles.length / FISH_PER_TILES));
    for (let i = 0; i < count; i++) this.spawnFish();
  }

  private randomTile(): { x: number; y: number } {
    return this.waterTiles[Math.floor(Math.random() * this.waterTiles.length)];
  }

  private tilePoint(t: { x: number; y: number }): { x: number; y: number } {
    const p = IsometricHelper.gridToScreen(t.x, t.y);
    return { x: p.x + (Math.random() - 0.5) * 20, y: p.y + WATER_DROP_WORLD + (Math.random() - 0.5) * 8 };
  }

  private spawnFish(): void {
    if (!this.waterTiles.length) return;
    const tile = this.randomTile();
    const at = this.tilePoint(tile);
    const sprite = this.scene.add.sprite(at.x, at.y, fishKey(this.biome)).setScale(HD_SCALE).setAlpha(0.88);
    sprite.play(`${fishKey(this.biome)}:swim`);
    sprite.anims.setProgress(Math.random());
    this.fishLayer.add(sprite);
    this.fish.push({ sprite, tile, target: at, diveIn: 6 + Math.random() * 10, under: 0 });
    this.pickNext(this.fish[this.fish.length - 1]);
  }

  /** Next neighbouring water tile (it keeps to the ocean ring and canals). */
  private pickNext(f: Fish): void {
    const n = [
      { x: f.tile.x + 1, y: f.tile.y }, { x: f.tile.x - 1, y: f.tile.y },
      { x: f.tile.x, y: f.tile.y + 1 }, { x: f.tile.x, y: f.tile.y - 1 },
    ].filter((t) => isWaterTile(t.x, t.y));
    if (!n.length) return;
    f.tile = n[Math.floor(Math.random() * n.length)];
    f.target = this.tilePoint(f.tile);
  }

  update(deltaMs: number, phase: number, falls?: { flow: number; frozen: number }): void {
    if (!this.ready) return;
    if (falls) this.matchFalls(falls);
    const biome = BIOMES[Math.max(0, Math.min(3, (phase || 1) - 1))];
    if (biome !== this.biome) {
      this.biome = biome;
      this.rebuild();
      return;
    }
    const dt = deltaMs / 1000;
    for (const f of this.fish) {
      const s = f.sprite;
      if (f.under > 0) {
        f.under -= dt;
        if (f.under <= 0) {
          // Pop up somewhere new
          f.tile = this.randomTile();
          f.target = this.tilePoint(f.tile);
          s.setPosition(f.target.x, f.target.y).setVisible(true).play(`${fishKey(this.biome)}:swim`);
          f.diveIn = 6 + Math.random() * 10;
          this.pickNext(f);
        }
        continue;
      }
      f.diveIn -= dt;
      if (f.diveIn <= 0) {
        s.play(`${fishKey(this.biome)}:dive`);
        s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.setVisible(false));
        f.under = 2 + Math.random() * 3;
        continue;
      }
      const dx = f.target.x - s.x;
      const dy = f.target.y - s.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 2) {
        this.pickNext(f);
        continue;
      }
      const step = Math.min(dist, FISH_SPEED * dt);
      s.setPosition(s.x + (dx / dist) * step, s.y + (dy / dist) * step);
      s.setFlipX(dx < 0);
    }
  }

  /**
   * Keeps the tiles in step with the waterfall mood: ripples speed up in a
   * torrent, slow when calm, and the surface ices over (paused, frosted,
   * fish hidden under it) when the Frost falls freeze.
   */
  private matchFalls(falls: { flow: number; frozen: number }): void {
    const frozen = falls.frozen > 0.5 ? 1 : 0;
    const flow = Math.round(Math.max(0.15, Math.min(2, falls.flow)) * 10) / 10;
    if (flow === this.appliedFlow && frozen === this.appliedFrozen) return;
    this.appliedFlow = flow;
    this.appliedFrozen = frozen;
    for (const s of this.surfaces) {
      s.anims.timeScale = flow;
      if (frozen) {
        s.anims.pause();
        s.setTint(0xe0f2fe);
      } else {
        if (s.anims.isPaused) s.anims.resume();
        s.clearTint();
      }
    }
    this.fishLayer.setVisible(!frozen);
  }

  destroy(): void {
    this.container.destroy();
    this.surfaces = [];
    this.fish = [];
  }
}
