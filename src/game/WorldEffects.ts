import Phaser from 'phaser';
import { TileInfo } from '../types/game';
import { WeatherType } from '../types/state';
import { IsometricHelper, TILE_WIDTH, TILE_HEIGHT } from './IsometricHelper';
import { ART_PIXEL, WATER_DROP_WORLD } from './PixelTileArt';
import { soundFx } from './audio/soundFx';
import { logMessage } from '../state/activityLog';

/**
 * Living-world effects on, above and behind the island:
 *  - sky: a pixel sun and moon travel an arc from one edge of the platform to
 *    the other, sinking behind it at dusk/dawn; stars twinkle at night,
 *  - tiles react to anyone walking on them (grass sways, water wakes travel
 *    with the walker, stone kicks up dust); fish leap out of the water,
 *  - weather in world space: slanted rain with splashes, swaying snow that
 *    settles, heat shimmer; pixel clouds drift over the island,
 *  - thunderstorms: bolts, double strikes, sheet lightning, screen shake.
 *
 * Layers: `skyLayer` sits behind the tiles (so the island occludes the sun and
 * moon), `groundLayer` just above the tiles (under units), `airLayer` above
 * every unit.
 */

const P = ART_PIXEL; // effects use the same chunky pixel size as the tiles
const HALF_W = TILE_WIDTH / 2;
const HALF_H = TILE_HEIGHT / 2;

const GRASS_TYPES = new Set(['AETHER_GRASS', 'ANCIENT_GROVE']);
const CLOUD_VARIANTS = 3;
const WIND = { x: 9, y: 4.5 }; // world px / s, along the iso X axis

// Day cycle windows (progress 0 = midnight, 0.5 = noon)
const SUN_RISE = 0.22;
const MOON_RISE = 0.72;
const ARC_SPAN = 0.56;

interface ActorTrack { x: number; y: number; cooldown: number }
interface Cloud { body: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image; speed: number }
interface Drop { x: number; y: number; vx: number; vy: number; groundY: number; onWater: boolean; onIsland: boolean }
interface Flake { x: number; y: number; groundY: number; speed: number; phase: number; size: number; onIsland: boolean }
interface Mark { x: number; y: number; age: number; life: number; kind: 'ring' | 'bounce' | 'snow' | 'haze' }

export class WorldEffects {
  private readonly actors = new Map<Phaser.GameObjects.Container, ActorTrack>();
  private readonly waterTiles: TileInfo[];
  private readonly landTiles: TileInfo[];
  private clouds: Cloud[] = [];
  private fishTimer = Phaser.Math.Between(2500, 6000);
  private lightningTimer = Phaser.Math.Between(4000, 9000);
  private cloudWeather: WeatherType | null = null;
  private weather: WeatherType = 'CLEAR';
  private stormy = false;

  // Weather particles are pooled as plain data and drawn into two Graphics per frame
  private drops: Drop[] = [];
  private flakes: Flake[] = [];
  private marks: Mark[] = [];
  private spawnAccum = 0;
  private readonly weatherAir: Phaser.GameObjects.Graphics;
  private readonly weatherGround: Phaser.GameObjects.Graphics;

  // Sky
  private readonly sun: Phaser.GameObjects.Container;
  private readonly moon: Phaser.GameObjects.Container;
  private readonly stars: Phaser.GameObjects.Graphics;
  private readonly starField: Array<{ x: number; y: number; phase: number; big: boolean }>;
  private readonly arc: { cx: number; horizonY: number; radiusX: number; height: number };
  private elapsed = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly skyLayer: Phaser.GameObjects.Container,
    private readonly groundLayer: Phaser.GameObjects.Container,
    private readonly airLayer: Phaser.GameObjects.Container,
    private readonly tiles: TileInfo[][],
    private readonly getActors: () => Phaser.GameObjects.Container[],
    private readonly bounds: Phaser.Geom.Rectangle
  ) {
    const flat = tiles.flat();
    this.waterTiles = flat.filter((t) => t.type === 'OCEAN_BLOCK');
    this.landTiles = flat.filter((t) => t.walkable && t.type !== 'SPAWN_BLOCK');
    this.createCloudTextures();
    this.createCelestialTextures();

    this.weatherGround = scene.add.graphics();
    groundLayer.add(this.weatherGround);
    this.weatherAir = scene.add.graphics();
    airLayer.add(this.weatherAir);

    // The arc runs between the island's left and right tips, set slightly
    // inward so the sun and moon sink behind the platform at either end
    const rows = tiles.length;
    const cols = tiles[0]?.length ?? 0;
    const leftTip = IsometricHelper.gridToScreen(0, rows - 1);
    const rightTip = IsometricHelper.gridToScreen(cols - 1, 0);
    const top = IsometricHelper.gridToScreen(0, 0).y - HALF_H;
    this.arc = {
      cx: (leftTip.x + rightTip.x) / 2,
      horizonY: leftTip.y + HALF_H,
      radiusX: (rightTip.x - leftTip.x) / 2 - HALF_W,
      height: leftTip.y + HALF_H - (top - 60),
    };

    this.stars = scene.add.graphics();
    this.starField = Array.from({ length: 34 }, () => ({
      x: Phaser.Math.Between(bounds.left - 60, bounds.right + 60),
      y: Phaser.Math.Between(bounds.top - 160, this.arc.horizonY - 20),
      phase: Math.random() * Math.PI * 2,
      big: Math.random() < 0.2,
    }));
    this.sun = this.createCelestial('pixel-sun', 0xfde68a, 34);
    this.moon = this.createCelestial('pixel-moon', 0xc7d2fe, 24);
    skyLayer.add([this.stars, this.sun, this.moon]);
  }

  update(delta: number, weather: WeatherType, dayProgress: number, darkness: number): void {
    this.elapsed += delta;
    if (weather !== this.weather) {
      this.weather = weather;
      // Roughly half of all rainy days roll into a full thunderstorm
      this.stormy = weather === 'RAIN' && Math.random() < 0.55;
      this.lightningTimer = Phaser.Math.Between(2500, 6000);
      if (this.stormy) {
        logMessage('thunderstorm');
      }
    }

    this.updateSky(dayProgress, darkness);
    this.updateActors(delta);

    this.fishTimer -= delta;
    if (this.fishTimer <= 0) {
      this.fishTimer = Phaser.Math.Between(2500, 7500);
      this.leapFish();
    }

    if (weather === 'RAIN') {
      this.lightningTimer -= delta;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = this.stormy ? Phaser.Math.Between(3500, 9000) : Phaser.Math.Between(12000, 25000);
        if (this.stormy || Math.random() < 0.4) {
          if (this.stormy && Math.random() < 0.3) this.sheetLightning();
          else this.strikeLightning();
        }
      }
    }

    this.updateWeather(delta, weather);
    this.updateClouds(delta, weather);
  }

  destroy(): void {
    this.actors.clear();
    this.clouds = [];
    this.drops = [];
    this.flakes = [];
    this.marks = [];
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Tile whose top face contains a point (gridToScreen gives tile centres). */
  private tileAt(x: number, y: number): TileInfo | null {
    const gx = Math.round((x / HALF_W + y / HALF_H) / 2);
    const gy = Math.round((y / HALF_H - x / HALF_W) / 2);
    return this.tiles[gy]?.[gx] ?? null;
  }

  private snap(v: number): number {
    return Math.round(v / P) * P;
  }

  private pixelRect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    g.fillRect(this.snap(x), this.snap(y), w * P, h * P);
  }

  /** Random point on the island surface (water sits lower). */
  private randomSurfacePoint(): { x: number; y: number; onWater: boolean } {
    const row = Phaser.Math.Between(0, this.tiles.length - 1);
    const tile = this.tiles[row][Phaser.Math.Between(0, this.tiles[row].length - 1)];
    const c = IsometricHelper.gridToScreen(tile.x, tile.y);
    // Uniform point inside the tile's diamond
    const u = Math.random() - 0.5;
    const v = Math.random() - 0.5;
    const onWater = tile.type === 'OCEAN_BLOCK';
    return { x: c.x + (u - v) * HALF_W, y: c.y + (u + v) * HALF_H + (onWater ? WATER_DROP_WORLD : 0), onWater };
  }

  // ── Sky: sun, moon, stars ──────────────────────────────────────────────────

  private paintTexture(key: string, size: number, paint: (x: number, y: number) => number | null): void {
    if (this.scene.textures.exists(key)) return;
    const tex = this.scene.textures.createCanvas(key, size, size);
    if (!tex) return;
    const img = tex.context.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const color = paint(x, y);
        if (color === null) continue;
        const i = (y * size + x) * 4;
        img.data[i] = (color >> 16) & 0xff;
        img.data[i + 1] = (color >> 8) & 0xff;
        img.data[i + 2] = color & 0xff;
        img.data[i + 3] = 255;
      }
    }
    tex.context.putImageData(img, 0, 0);
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    tex.refresh();
  }

  private createCelestialTextures(): void {
    // Sun: banded disc with eight stubby rays
    this.paintTexture('pixel-sun', 26, (x, y) => {
      const dx = x + 0.5 - 13;
      const dy = y + 0.5 - 13;
      const d = Math.hypot(dx, dy);
      if (d <= 7.2) {
        if (dx + dy < -5) return 0xfffbeb;                  // hot highlight
        return d > 6 ? 0xf59e0b : d > 4.5 ? 0xfbbf24 : 0xfde047;
      }
      const angle = Math.atan2(dy, dx);
      const onRay = Math.abs(Math.sin(angle * 4)) < 0.2;
      if (onRay && d > 8.5 && d < (Math.round(angle * 4 / Math.PI) % 2 === 0 ? 12.5 : 11)) return 0xfbbf24;
      return null;
    });
    // Moon: pale disc, craters and a soft terminator on one side
    this.paintTexture('pixel-moon', 20, (x, y) => {
      const dx = x + 0.5 - 10;
      const dy = y + 0.5 - 10;
      const d = Math.hypot(dx, dy);
      if (d > 7.2) return null;
      const craters: Array<[number, number, number]> = [[-2, -2, 1.8], [2.5, 1.5, 1.3], [-1, 3.5, 1], [3, -3, 0.9]];
      if (craters.some(([cx, cy, r]) => Math.hypot(dx - cx, dy - cy) <= r)) return 0xa5b4c8;
      if (dx > 3.5) return 0xb8c2d6;
      return d > 6 ? 0xcbd5e1 : 0xe8edf5;
    });
  }

  private createCelestial(key: string, glowColor: number, glowRadius: number): Phaser.GameObjects.Container {
    const glow = this.scene.add.graphics();
    glow.fillStyle(glowColor, 0.08);
    glow.fillCircle(0, 0, glowRadius * 1.6);
    glow.fillStyle(glowColor, 0.14);
    glow.fillCircle(0, 0, glowRadius);
    const body = this.scene.add.image(0, 0, key).setScale(P);
    const container = this.scene.add.container(0, 0, [glow, body]);
    container.setVisible(false);
    return container;
  }

  /** Places a body on the arc: t = 0 rising at the left edge, 1 setting at the right. */
  private placeOnArc(body: Phaser.GameObjects.Container, t: number, horizonTint: number | null): void {
    if (t < -0.08 || t > 1.08) {
      body.setVisible(false);
      return;
    }
    const theta = t * Math.PI;
    const x = this.arc.cx - this.arc.radiusX * Math.cos(theta);
    const y = this.arc.horizonY - this.arc.height * Math.sin(theta);
    body.setPosition(this.snap(x), this.snap(y));
    body.setVisible(true);
    // Fade as it dips toward the platform's edge (the tiles in front hide the rest)
    const lift = Math.sin(Math.max(0, Math.min(Math.PI, theta)));
    body.setAlpha(Phaser.Math.Clamp((lift + 0.05) / 0.25, 0, 1));
    const image = body.list[1] as Phaser.GameObjects.Image;
    if (horizonTint !== null && lift < 0.35) image.setTint(horizonTint);
    else image.clearTint();
  }

  private updateSky(progress: number, darkness: number): void {
    const sunT = (progress - SUN_RISE) / ARC_SPAN;
    const moonT = (((progress - MOON_RISE) % 1) + 1) % 1 / ARC_SPAN;
    this.placeOnArc(this.sun, sunT, 0xfb923c);
    this.placeOnArc(this.moon, moonT, null);

    // Clouds dim the sky bodies
    const overcast = this.weather === 'RAIN' ? 0.35 : this.weather === 'SNOW' ? 0.6 : 1;
    this.sun.setAlpha(this.sun.alpha * overcast);
    this.moon.setAlpha(this.moon.alpha * overcast);

    this.stars.clear();
    const starAlpha = Phaser.Math.Clamp((darkness - 0.3) / 0.5, 0, 1) * (this.weather === 'RAIN' ? 0.25 : 1);
    if (starAlpha <= 0) return;
    for (const star of this.starField) {
      const twinkle = 0.55 + 0.45 * Math.sin(this.elapsed / 700 + star.phase);
      this.stars.fillStyle(star.big ? 0xfef9c3 : 0xe0e7ff, starAlpha * twinkle);
      this.pixelRect(this.stars, star.x, star.y, 1, 1);
      if (star.big && twinkle > 0.8) {
        this.pixelRect(this.stars, star.x - P, star.y, 1, 1);
        this.pixelRect(this.stars, star.x + P, star.y, 1, 1);
        this.pixelRect(this.stars, star.x, star.y - P, 1, 1);
        this.pixelRect(this.stars, star.x, star.y + P, 1, 1);
      }
    }
  }

  // ── Tile reactions ─────────────────────────────────────────────────────────

  private updateActors(delta: number): void {
    const live = new Set(this.getActors().filter((c) => c.active));
    for (const container of this.actors.keys()) {
      if (!live.has(container)) this.actors.delete(container);
    }

    for (const container of live) {
      const track = this.actors.get(container);
      if (!track) {
        this.actors.set(container, { x: container.x, y: container.y, cooldown: 0 });
        continue;
      }
      const dx = container.x - track.x;
      const dy = container.y - track.y;
      track.x = container.x;
      track.y = container.y;
      track.cooldown -= delta;
      const moved = Math.hypot(dx, dy);
      if (moved < 0.05 || track.cooldown > 0) continue;

      const tile = this.tileAt(container.x, container.y);
      if (!tile) continue;
      const dirX = dx / moved;
      const dirY = dy / moved;

      if (GRASS_TYPES.has(tile.type)) {
        this.rustleGrass(container.x, container.y, dirX, dirY);
        track.cooldown = 320;
      } else if (tile.type === 'OCEAN_BLOCK') {
        this.waterWake(container.x, container.y + WATER_DROP_WORLD, dirX, dirY);
        track.cooldown = 260;
      } else if (tile.type === 'ANCIENT_STONE' || tile.type === 'NEXUS_BASE') {
        this.kickDust(container.x, container.y, dirX, dirY);
        track.cooldown = 420;
      }
    }
  }

  /** Blades around the feet bend the way the walker is heading, then spring back; a few clippings fly ahead. */
  private rustleGrass(x: number, y: number, dirX: number, dirY: number): void {
    const colors = [0x34d399, 0x10b981, 0x6ee7b7];
    for (let i = 0; i < 6; i++) {
      const blade = this.scene.add.graphics();
      blade.fillStyle(colors[i % colors.length], 1);
      this.pixelRect(blade, 0, -3 * P, 1, 3);
      blade.setPosition(x + Phaser.Math.Between(-10, 10), y + Phaser.Math.Between(-3, 5));
      this.groundLayer.add(blade);
      this.scene.tweens.add({
        targets: blade,
        rotation: dirX * 0.7,
        y: blade.y + dirY * 2,
        duration: 140,
        yoyo: true,
        ease: 'Sine.easeOut',
        onComplete: () => {
          this.scene.tweens.add({ targets: blade, alpha: 0, duration: 260, onComplete: () => blade.destroy() });
        },
      });
    }
    for (let i = 0; i < 3; i++) {
      const clip = this.scene.add.graphics();
      clip.fillStyle(colors[i], 1);
      this.pixelRect(clip, 0, 0, 1, 1);
      clip.setPosition(x, y - 4);
      this.groundLayer.add(clip);
      this.scene.tweens.add({
        targets: clip,
        x: x + dirX * Phaser.Math.Between(10, 18) + Phaser.Math.Between(-4, 4),
        y: y - 4 + dirY * Phaser.Math.Between(6, 10) - Phaser.Math.Between(4, 10),
        alpha: 0,
        duration: Phaser.Math.Between(380, 560),
        ease: 'Quad.easeOut',
        onComplete: () => clip.destroy(),
      });
    }
  }

  /** A bow wave that travels forward with the swimmer, plus a V-shaped wake trailing behind. */
  private waterWake(x: number, y: number, dirX: number, dirY: number): void {
    const bow = this.scene.add.graphics();
    bow.lineStyle(P, 0xe0f2fe, 0.85);
    bow.strokeEllipse(0, 0, 14, 7);
    bow.setPosition(x + dirX * 6, y + dirY * 3);
    this.groundLayer.add(bow);
    this.scene.tweens.add({
      targets: bow,
      x: bow.x + dirX * 18,
      y: bow.y + dirY * 9,
      scaleX: 2.2,
      scaleY: 2.2,
      alpha: 0,
      duration: 720,
      ease: 'Sine.easeOut',
      onComplete: () => bow.destroy(),
    });

    const perpX = -dirY;
    const perpY = dirX;
    for (const side of [-1, 1]) {
      const arm = this.scene.add.graphics();
      arm.fillStyle(0xbae6fd, 0.9);
      for (let k = 0; k < 3; k++) this.pixelRect(arm, -dirX * k * 4 + perpX * side * k * 3, -dirY * k * 2 + perpY * side * k * 1.5, 2, 1);
      arm.setPosition(x - dirX * 6, y - dirY * 3);
      this.groundLayer.add(arm);
      this.scene.tweens.add({
        targets: arm,
        x: arm.x + perpX * side * 8,
        y: arm.y + perpY * side * 4,
        alpha: 0,
        duration: 650,
        onComplete: () => arm.destroy(),
      });
    }
  }

  private kickDust(x: number, y: number, dirX: number, dirY: number): void {
    for (let i = 0; i < 3; i++) {
      const puff = this.scene.add.graphics();
      puff.fillStyle(0xcbd5e1, 0.55);
      this.pixelRect(puff, 0, 0, 2, 1);
      puff.setPosition(x - dirX * 4 + Phaser.Math.Between(-3, 3), y - dirY * 2);
      this.groundLayer.add(puff);
      this.scene.tweens.add({
        targets: puff,
        x: puff.x - dirX * Phaser.Math.Between(6, 12),
        y: puff.y - Phaser.Math.Between(4, 8),
        alpha: 0,
        duration: Phaser.Math.Between(400, 600),
        onComplete: () => puff.destroy(),
      });
    }
  }

  // ── Fish ───────────────────────────────────────────────────────────────────

  private splash(x: number, y: number): void {
    const ring = this.scene.add.graphics();
    ring.lineStyle(P, 0xf0f9ff, 0.9);
    ring.strokeEllipse(0, 0, 10, 5);
    ring.setPosition(x, y);
    this.groundLayer.add(ring);
    this.scene.tweens.add({ targets: ring, scaleX: 2.4, scaleY: 2.4, alpha: 0, duration: 600, onComplete: () => ring.destroy() });

    for (let i = 0; i < 4; i++) {
      const drop = this.scene.add.graphics();
      drop.fillStyle(0xe0f2fe, 1);
      this.pixelRect(drop, 0, 0, 1, 1);
      drop.setPosition(x, y);
      this.airLayer.add(drop);
      const vx = Phaser.Math.Between(-10, 10);
      const peak = Phaser.Math.Between(6, 12);
      const arc = { t: 0 };
      this.scene.tweens.add({
        targets: arc,
        t: 1,
        duration: 320,
        onUpdate: () => {
          drop.x = x + vx * arc.t;
          drop.y = y - 4 * peak * arc.t * (1 - arc.t);
        },
        onComplete: () => drop.destroy(),
      });
    }
  }

  private leapFish(): void {
    const tile = Phaser.Utils.Array.GetRandom(this.waterTiles);
    if (!tile) return;
    const base = IsometricHelper.gridToScreen(tile.x, tile.y);
    const startX = base.x + Phaser.Math.Between(-10, 10);
    const startY = base.y + WATER_DROP_WORLD + Phaser.Math.Between(-3, 3);
    const endX = startX + Phaser.Math.RND.sign() * Phaser.Math.Between(10, 18);
    const endY = startY + Phaser.Math.Between(-4, 4);
    const height = Phaser.Math.Between(18, 30);

    const fish = this.scene.add.graphics();
    const golden = Math.random() < 0.15;
    if (golden) {
      logMessage('goldenFish', { tile: IsometricHelper.tileName(tile.x, tile.y) });
    }
    const bodyColor = golden ? 0xfbbf24 : Math.random() < 0.5 ? 0xf97316 : 0x94a3b8;
    fish.fillStyle(bodyColor, 1);
    fish.fillRect(-3 * P, -P, 5 * P, 2 * P);
    fish.fillRect(-2 * P, -1.5 * P, 3 * P, 3 * P);
    fish.fillStyle(Phaser.Display.Color.ValueToColor(bodyColor).darken(25).color, 1);
    fish.fillRect(-5 * P, -1.5 * P, 2 * P, 3 * P);
    fish.fillStyle(0x0f172a, 1);
    fish.fillRect(1 * P, -P, P, P);
    fish.setPosition(startX, startY);
    fish.setScale(endX > startX ? 1 : -1, 1);
    this.airLayer.add(fish);

    this.splash(startX, startY);
    const arc = { t: 0 };
    this.scene.tweens.add({
      targets: arc,
      t: 1,
      duration: 760,
      ease: 'Linear',
      onUpdate: () => {
        const t = arc.t;
        fish.x = Phaser.Math.Linear(startX, endX, t);
        fish.y = Phaser.Math.Linear(startY, endY, t) - 4 * height * t * (1 - t);
        const slope = (endY - startY) - 4 * height * (1 - 2 * t);
        fish.rotation = Math.atan2(slope, Math.abs(endX - startX)) * (endX > startX ? 1 : -1);
      },
      onComplete: () => {
        fish.destroy();
        this.splash(endX, endY);
        soundFx.playSplash();
      },
    });
  }

  // ── Weather particles ──────────────────────────────────────────────────────

  private updateWeather(delta: number, weather: WeatherType): void {
    const dt = delta / 1000;
    const rate = weather === 'RAIN' ? (this.stormy ? 110 : 55) : weather === 'SNOW' ? 22 : weather === 'HEATWAVE' ? 6 : 0;
    this.spawnAccum += rate * dt;
    while (this.spawnAccum >= 1) {
      this.spawnAccum -= 1;
      if (weather === 'RAIN') this.spawnDrop();
      else if (weather === 'SNOW') this.spawnFlake();
      else if (weather === 'HEATWAVE') this.spawnHaze();
    }
    if (rate === 0) this.spawnAccum = 0;

    // Rain
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.y >= d.groundY) {
        this.drops.splice(i, 1);
        if (d.onIsland) this.marks.push({ x: d.x, y: d.groundY, age: 0, life: d.onWater ? 450 : 260, kind: d.onWater ? 'ring' : 'bounce' });
      }
    }
    // Snow sways as it falls and settles on land
    for (let i = this.flakes.length - 1; i >= 0; i--) {
      const f = this.flakes[i];
      f.y += f.speed * dt;
      f.x += Math.sin(this.elapsed / 600 + f.phase) * 10 * dt + WIND.x * 0.4 * dt;
      if (f.y >= f.groundY) {
        this.flakes.splice(i, 1);
        if (f.onIsland) this.marks.push({ x: f.x, y: f.groundY, age: 0, life: 7000, kind: 'snow' });
      }
    }
    for (let i = this.marks.length - 1; i >= 0; i--) {
      this.marks[i].age += delta;
      if (this.marks[i].age >= this.marks[i].life) this.marks.splice(i, 1);
    }
    // Keep settled snow bounded
    if (this.marks.length > 260) this.marks.splice(0, this.marks.length - 260);

    this.drawWeather();
  }

  private spawnDrop(): void {
    const target = Math.random() < 0.85 ? this.randomSurfacePoint() : null;
    const x = target ? target.x : Phaser.Math.Between(this.bounds.left, this.bounds.right);
    const groundY = target ? target.y : this.bounds.bottom + 40;
    const vy = Phaser.Math.Between(430, 520);
    const vx = (this.stormy ? 150 : 80) + Phaser.Math.Between(-15, 15);
    const fall = Phaser.Math.FloatBetween(0.45, 0.8);
    this.drops.push({
      x: x - vx * fall,
      y: groundY - vy * fall,
      vx,
      vy,
      groundY,
      onWater: target?.onWater ?? false,
      onIsland: target !== null,
    });
  }

  private spawnFlake(): void {
    const target = Math.random() < 0.8 ? this.randomSurfacePoint() : null;
    const speed = Phaser.Math.Between(26, 44);
    const fall = Phaser.Math.FloatBetween(3, 6);
    const groundY = target ? target.y : this.bounds.bottom + 30;
    this.flakes.push({
      x: (target ? target.x : Phaser.Math.Between(this.bounds.left, this.bounds.right)) - WIND.x * 0.4 * fall,
      y: groundY - speed * fall,
      groundY,
      speed,
      phase: Math.random() * Math.PI * 2,
      size: Math.random() < 0.25 ? 2 : 1,
      onIsland: target !== null && !target.onWater,
    });
  }

  private spawnHaze(): void {
    const p = this.randomSurfacePoint();
    if (p.onWater) return;
    this.marks.push({ x: p.x, y: p.y, age: 0, life: 1600, kind: 'haze' });
  }

  private drawWeather(): void {
    const air = this.weatherAir;
    const ground = this.weatherGround;
    air.clear();
    ground.clear();

    // Rain streaks, snapped to the pixel grid and slanted with the wind
    air.fillStyle(this.stormy ? 0xbfdbfe : 0x93c5fd, 0.6);
    for (const d of this.drops) {
      const len = 4;
      const sx = (d.vx / d.vy) * P;
      for (let k = 0; k < len; k++) this.pixelRect(air, d.x - sx * k, d.y - P * k, 1, 1);
    }

    air.fillStyle(0xf8fafc, 0.9);
    for (const f of this.flakes) {
      this.pixelRect(air, f.x, f.y, f.size, f.size);
      if (f.size === 2) {
        this.pixelRect(air, f.x - P, f.y + P / 2, 1, 1);
        this.pixelRect(air, f.x + 2 * P, f.y + P / 2, 1, 1);
      }
    }

    for (const m of this.marks) {
      const t = m.age / m.life;
      switch (m.kind) {
        case 'ring':
          ground.lineStyle(P / 2, 0xe0f2fe, 0.7 * (1 - t));
          ground.strokeEllipse(m.x, m.y, 4 + t * 12, 2 + t * 6);
          break;
        case 'bounce':
          ground.fillStyle(0xbfdbfe, 0.8 * (1 - t));
          this.pixelRect(ground, m.x - P - t * 4, m.y - t * 5, 1, 1);
          this.pixelRect(ground, m.x + P + t * 4, m.y - t * 5, 1, 1);
          break;
        case 'snow':
          ground.fillStyle(0xf1f5f9, 0.85 * Math.min(1, (1 - t) * 3));
          this.pixelRect(ground, m.x, m.y, 1, 1);
          break;
        case 'haze': {
          // Wavy rising heat shimmer
          const rise = t * 26;
          const wobble = Math.sin(this.elapsed / 120 + m.x) * 3;
          ground.fillStyle(0xfed7aa, 0.22 * Math.sin(t * Math.PI));
          this.pixelRect(ground, m.x + wobble - 2 * P, m.y - rise, 2, 1);
          this.pixelRect(ground, m.x - wobble + P, m.y - rise - 3 * P, 2, 1);
          break;
        }
      }
    }
  }

  // ── Clouds ─────────────────────────────────────────────────────────────────

  /** Paints a few chunky pixel-art cloud textures (lit tops, shaded bellies). */
  private createCloudTextures(): void {
    for (let v = 0; v < CLOUD_VARIANTS; v++) {
      const key = `pixel-cloud-${v}`;
      if (this.scene.textures.exists(key)) continue;
      const w = 48, h = 22;
      const tex = this.scene.textures.createCanvas(key, w, h);
      if (!tex) continue;
      const img = tex.context.createImageData(w, h);
      const puffs = Array.from({ length: 5 + v }, (_, i) => ({
        x: 8 + (i * (w - 16)) / (4 + v) + Math.sin(i * 7.3 + v) * 3,
        y: 13 - Math.abs(Math.sin(i * 2.1 + v)) * 5,
        r: 5 + Math.abs(Math.cos(i * 3.7 + v * 1.3)) * 4,
      }));
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let best = Infinity;
          let top = 0;
          for (const p of puffs) {
            const d = Math.hypot((x - p.x) / p.r, ((y - p.y) * 1.4) / p.r);
            if (d < best) { best = d; top = (y - p.y) / p.r; }
          }
          if (best > 1 || y > 17) continue;
          const shade = top < -0.35 ? 255 : top < 0.3 ? 226 : 190;
          const i = (y * w + x) * 4;
          img.data[i] = shade;
          img.data[i + 1] = shade;
          img.data[i + 2] = Math.min(255, shade + 12);
          img.data[i + 3] = 255;
        }
      }
      tex.context.putImageData(img, 0, 0);
      tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
      tex.refresh();
    }
  }

  private cloudTint(): number {
    if (this.weather === 'RAIN') return this.stormy ? 0x4b5563 : 0x6b7280;
    return this.weather === 'SNOW' ? 0xe2e8f0 : 0xffffff;
  }

  private updateClouds(delta: number, weather: WeatherType): void {
    const wanted = weather === 'RAIN' ? (this.stormy ? 9 : 7) : weather === 'SNOW' ? 5 : 3;

    if (weather !== this.cloudWeather) {
      this.cloudWeather = weather;
      for (const cloud of this.clouds) cloud.body.setTint(this.cloudTint()).setAlpha(weather === 'RAIN' ? 0.75 : 0.55);
    }
    // The first batch is scattered over the island; later arrivals drift in from upwind
    const initial = this.clouds.length === 0;
    while (this.clouds.length < wanted) this.spawnCloud(initial);
    if (this.clouds.length > wanted) {
      const extra = this.clouds.pop();
      extra?.body.destroy();
      extra?.shadow.destroy();
    }

    const dt = delta / 1000;
    const gust = this.stormy ? 2.2 : 1;
    for (const cloud of this.clouds) {
      cloud.body.x += WIND.x * cloud.speed * gust * dt;
      cloud.body.y += WIND.y * cloud.speed * gust * dt;
      cloud.shadow.setPosition(cloud.body.x + 26, cloud.body.y + 70);
      if (cloud.body.x - cloud.body.displayWidth / 2 > this.bounds.right || cloud.body.y > this.bounds.bottom) {
        this.placeCloudUpwind(cloud);
      }
    }
  }

  private spawnCloud(anywhere: boolean): void {
    const key = `pixel-cloud-${Phaser.Math.Between(0, CLOUD_VARIANTS - 1)}`;
    const scale = P * Phaser.Math.FloatBetween(1, 1.6);
    const body = this.scene.add.image(0, 0, key).setScale(scale).setAlpha(this.weather === 'RAIN' ? 0.75 : 0.55);
    body.setTint(this.cloudTint());
    const shadow = this.scene.add.image(0, 0, key).setScale(scale).setTintFill(0x000000).setAlpha(0.1);
    this.airLayer.add(body);
    this.groundLayer.add(shadow);
    const cloud: Cloud = { body, shadow, speed: Phaser.Math.FloatBetween(0.7, 1.4) };
    if (anywhere) {
      body.setPosition(
        Phaser.Math.Between(this.bounds.left, this.bounds.right),
        Phaser.Math.Between(this.bounds.top, this.bounds.centerY)
      );
    } else {
      this.placeCloudUpwind(cloud);
    }
    this.clouds.push(cloud);
  }

  /** Re-enter from the upwind (top-left) side. */
  private placeCloudUpwind(cloud: Cloud): void {
    const along = Phaser.Math.FloatBetween(0, 1);
    cloud.body.setPosition(
      Phaser.Math.Linear(this.bounds.left - 80, this.bounds.centerX, along),
      Phaser.Math.Linear(this.bounds.centerY, this.bounds.top - 40, along)
    );
  }

  /** Clouds briefly light up from within. */
  private lightClouds(duration: number): void {
    for (const cloud of this.clouds) cloud.body.setTint(0xe0e7ff);
    this.scene.time.delayedCall(duration, () => {
      for (const cloud of this.clouds) if (cloud.body.active) cloud.body.setTint(this.cloudTint());
    });
  }

  // ── Lightning ──────────────────────────────────────────────────────────────

  /** Flicker inside the clouds with no bolt — distant rumble. */
  private sheetLightning(): void {
    this.lightClouds(140);
    this.scene.cameras.main.flash(120, 90, 100, 140, true);
    this.scene.time.delayedCall(Phaser.Math.Between(600, 1400), () => soundFx.playThunder(0.45));
  }

  private strikeLightning(): void {
    const tile = Phaser.Utils.Array.GetRandom(this.landTiles);
    if (!tile) return;
    const ground = IsometricHelper.gridToScreen(tile.x, tile.y);
    const tx = ground.x + Phaser.Math.Between(-8, 8);
    const ty = ground.y + Phaser.Math.Between(-4, 4);
    this.drawBolt(tx, ty, 1);
    logMessage('lightning', { tile: IsometricHelper.tileName(tile.x, tile.y) });

    // A storm sometimes forks into a second strike nearby
    if (this.stormy && Math.random() < 0.3) {
      this.scene.time.delayedCall(Phaser.Math.Between(140, 260), () =>
        this.drawBolt(tx + Phaser.Math.Between(-60, 60), ty + Phaser.Math.Between(-30, 30), 0.7)
      );
    }

    this.lightClouds(180);
    this.scene.cameras.main.flash(160, 190, 215, 255, true);
    this.scene.cameras.main.shake(Phaser.Math.Between(220, 380), this.stormy ? 0.008 : 0.005, true);
    this.scene.time.delayedCall(Phaser.Math.Between(120, 500), () => soundFx.playThunder(1));
  }

  private drawBolt(tx: number, ty: number, strength: number): void {
    const bolt = this.scene.add.graphics();
    const drawPath = (points: Phaser.Math.Vector2[], width: number, color: number, alpha: number) => {
      bolt.lineStyle(width, color, alpha);
      bolt.beginPath();
      bolt.moveTo(points[0].x, points[0].y);
      for (const p of points.slice(1)) bolt.lineTo(p.x, p.y);
      bolt.strokePath();
    };
    const jagged = (x0: number, y0: number, x1: number, y1: number, segments: number, spread: number) =>
      Array.from({ length: segments + 1 }, (_, i) => {
        const t = i / segments;
        const jitter = i === 0 || i === segments ? 0 : Phaser.Math.Between(-spread, spread);
        return new Phaser.Math.Vector2(this.snap(Phaser.Math.Linear(x0, x1, t) + jitter), this.snap(Phaser.Math.Linear(y0, y1, t)));
      });

    const main = jagged(tx + Phaser.Math.Between(-60, 60), ty - 380, tx, ty, 16, 12);
    const branchFrom = main[Phaser.Math.Between(4, 9)];
    const branch = jagged(branchFrom.x, branchFrom.y, branchFrom.x + Phaser.Math.Between(-55, 55), branchFrom.y + 80, 6, 8);
    drawPath(main, 10 * strength, 0x93c5fd, 0.25);
    drawPath(branch, 6 * strength, 0x93c5fd, 0.2);
    drawPath(main, 3 * strength + 1, 0xf0f9ff, 1);
    drawPath(branch, 2, 0xe0f2fe, 0.9);
    this.airLayer.add(bolt);

    this.scene.tweens.add({
      targets: bolt,
      alpha: { from: 1, to: 0.15 },
      duration: 55,
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        this.scene.tweens.add({ targets: bolt, alpha: 0, duration: 220, onComplete: () => bolt.destroy() });
      },
    });

    // Impact glow lights the ground, then a scorch mark lingers
    const glow = this.scene.add.graphics();
    glow.fillStyle(0xbfdbfe, 0.35);
    glow.fillEllipse(0, 0, 90, 45);
    glow.fillStyle(0xf0f9ff, 0.5);
    glow.fillEllipse(0, 0, 40, 20);
    glow.setPosition(tx, ty);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    this.groundLayer.add(glow);
    this.scene.tweens.add({ targets: glow, alpha: 0, duration: 420, ease: 'Quad.easeOut', onComplete: () => glow.destroy() });

    const scorch = this.scene.add.graphics();
    scorch.fillStyle(0x0f172a, 0.45);
    scorch.fillEllipse(0, 0, 22, 11);
    scorch.fillStyle(0xfef08a, 0.8);
    scorch.fillEllipse(0, 0, 8, 4);
    scorch.setPosition(tx, ty);
    this.groundLayer.add(scorch);
    this.scene.tweens.add({ targets: scorch, alpha: 0, delay: 1200, duration: 2400, onComplete: () => scorch.destroy() });

    for (let i = 0; i < 10; i++) {
      const spark = this.scene.add.graphics();
      spark.fillStyle(i % 2 ? 0xfef08a : 0xe0f2fe, 1);
      this.pixelRect(spark, 0, 0, 1, 1);
      spark.setPosition(tx, ty - 2);
      this.airLayer.add(spark);
      const angle = (i / 10) * Math.PI * 2;
      this.scene.tweens.add({
        targets: spark,
        x: tx + Math.cos(angle) * Phaser.Math.Between(10, 22),
        y: ty - 2 + Math.sin(angle) * Phaser.Math.Between(5, 11) - 6,
        alpha: 0,
        duration: Phaser.Math.Between(300, 520),
        ease: 'Quad.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }
}
