import Phaser from 'phaser';
import { MIST_TEX, paintMistTextures } from './mistTextures';
import { NightSky } from './scene/nightSky';
import { TileInfo } from '../types/game';
import { WeatherType } from '../types/state';
import { IsometricHelper, TILE_WIDTH, TILE_HEIGHT } from './IsometricHelper';
import { ART_PIXEL, WATER_DROP_WORLD } from './PixelTileArt';
import { soundFx } from './audio/soundFx';
import { logMessage } from '../state/activityLog';
import { isBridgeTile } from '../state/buildingLayout';
import FISH from '../data/leapingFish.json';
import { useGameStore } from '../state/useGameStore';

interface FishSpecies { body: string; fin: string; weight: number; long?: boolean }
interface FishBiome {
  species: FishSpecies[];
  rare: FishSpecies & { chance: number; logKey: string; name?: { en: string; tl: string } };
  jump: { height: number[]; ms: number; hops: number; school: number };
  splash: string;
  drops: string;
  trail: 'none' | 'ember' | 'snow' | 'sparkle';
}

/**
 * Living-world effects on, above and behind the island:
 *  - sky: a pixel sun and moon travel an arc from one edge of the platform to
 *    the other, sinking behind it at dusk/dawn; stars twinkle at night,
 *  - tiles react to anyone walking on them (grass sways, water wakes travel
 *    with the walker, stone kicks up dust); fish leap out of the water,
 *  - weather in world space: slanted rain with splashes, swaying snow that
 *    settles, heat shimmer; mist clouds (the rift-fog layers, lit by the sun or moon) drift over the island,
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
const WIND = { x: 9, y: 4.5 }; // world px / s, along the iso X axis

// Day cycle windows (progress 0 = midnight, 0.5 = noon)
const SUN_RISE = 0.22;
const MOON_RISE = 0.72;
const ARC_SPAN = 0.56;

interface ActorTrack { x: number; y: number; cooldown: number }
/** A sky cloud built from the rift-fog layers: a bank under billowing puffs. */
interface Cloud {
  body: Phaser.GameObjects.Container;
  parts: Array<{ img: Phaser.GameObjects.Image; hx: number; hy: number; scale: number; phase: number }>;
  shadow: Phaser.GameObjects.Image;
  speed: number;
  width: number;
  phase: number;
}
interface Drop { x: number; y: number; vx: number; vy: number; groundY: number; onWater: boolean; onIsland: boolean }
interface Flake { x: number; y: number; groundY: number; speed: number; phase: number; size: number; onIsland: boolean }
interface Mark { x: number; y: number; age: number; life: number; kind: 'ring' | 'bounce' | 'snow' | 'haze' }

export class WorldEffects {
  private readonly actors = new Map<Phaser.GameObjects.Container, ActorTrack>();
  private readonly waterTiles: TileInfo[];
  private readonly landTiles: TileInfo[];
  private clouds: Cloud[] = [];
  private cloudTintTimer = 0;
  private cloudsLit = false;
  private fishTimer = Phaser.Math.Between(2500, 6000);
  private lightningTimer = Phaser.Math.Between(4000, 9000);
  private cloudWeather: WeatherType | null = null;
  private weather: WeatherType = 'CLEAR';
  private stormy = false;
  private strikeHandler?: (x: number, y: number, strength: number) => void;

  // Weather particles are pooled as plain data and drawn into two Graphics per frame
  private drops: Drop[] = [];
  private flakes: Flake[] = [];
  private marks: Mark[] = [];
  private spawnAccum = 0;
  /** 0–1 particle/cloud density from the FPS controller (1 = full detail). */
  private density = 1;
  private readonly weatherAir: Phaser.GameObjects.Graphics;
  private readonly weatherGround: Phaser.GameObjects.Graphics;

  // Sky
  private readonly sun: Phaser.GameObjects.Container;
  private readonly moon: Phaser.GameObjects.Container;
  private readonly nightSky: NightSky;
  private lastSkyMs = 0;
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

    paintMistTextures(scene);
    // Night sky first (behind the sun and moon), spread wide above the island
    const skyTop = bounds.top - 520;
    this.nightSky = new NightSky(scene, skyLayer, new Phaser.Geom.Rectangle(bounds.left - 320, skyTop, bounds.width + 640, this.arc.horizonY - skyTop));
    // Soft painted discs, in the same airbrushed style as the clouds
    this.sun = this.createCelestial(MIST_TEX.sunDisc, 0.82, MIST_TEX.sunHalo, 0.9, MIST_TEX.sunRays);
    this.moon = this.createCelestial(MIST_TEX.moonDisc, 0.75, MIST_TEX.moonHalo, 0.75);
    skyLayer.add([this.sun, this.moon]);
  }

  setDensity(density: number): void {
    this.density = Phaser.Math.Clamp(density, 0.2, 1);
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

    // LOW quality (density < 0.5): no grass/water footstep reactions or leaping fish
    const lite = this.density < 0.5;
    this.updateSky(dayProgress, darkness, lite);
    if (!lite) this.updateActors(delta);

    this.fishTimer -= delta;
    if (this.fishTimer <= 0 && !lite) {
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
    this.skyGfx?.destroy();
    this.nightSky.destroy();
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

  /**
   * Sky body: soft halo (same mist style as the clouds) behind the pixel disc,
   * plus slowly turning rays for the sun. Children: [halo, body, rays?].
   */
  private createCelestial(key: string, bodyScale: number, halo: string, haloScale: number, rays?: string): Phaser.GameObjects.Container {
    const glow = this.scene.add.image(0, 0, halo).setScale(haloScale).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.8);
    const body = this.scene.add.image(0, 0, key).setScale(bodyScale).setData('disc', true);
    const children: Phaser.GameObjects.GameObject[] = [glow, body];
    if (rays) children.push(this.scene.add.image(0, 0, rays).setScale(0.75).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.45));
    const container = this.scene.add.container(0, 0, children);
    if (rays) container.bringToTop(body);
    container.setVisible(false);
    return container;
  }

  /** Point on the sky arc for t (also off-arc, for aiming the moon's lit side at a hidden sun). */
  private arcPoint(t: number): { x: number; y: number } {
    const theta = t * Math.PI;
    return { x: this.arc.cx - this.arc.radiusX * Math.cos(theta), y: this.arc.horizonY - this.arc.height * Math.sin(theta) };
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
    const image = body.list.find((o) => (o as Phaser.GameObjects.Image).getData?.('disc')) as Phaser.GameObjects.Image;
    if (horizonTint !== null && lift < 0.35) image.setTint(horizonTint);
    else image.clearTint();
  }

  /**
   * Sky behind the island when the wallpaper is off: a vertical gradient that
   * follows the sun and moon — deep night, warm dawn, blue day, orange-violet
   * dusk — greyed by rain and paled by snow. Drawn fixed to the camera.
   */
  private skyGfx?: Phaser.GameObjects.Graphics;
  private lastSkyKey = '';

  private static readonly SKY_KEYS: Array<[number, number, number]> = [
    // progress, top colour, horizon colour (0 = midnight, 0.5 = noon)
    [0.0, 0x03050f, 0x0b1029],
    [0.18, 0x070b22, 0x1e1b4b],
    [0.24, 0x3b2a6b, 0xf59e0b],
    [0.3, 0x3b82f6, 0xfcd9a8],
    [0.4, 0x2563eb, 0x93c5fd],
    [0.5, 0x1d4ed8, 0xbfdbfe],
    [0.62, 0x2563eb, 0x93c5fd],
    [0.7, 0x4338ca, 0xfdba74],
    [0.76, 0x3b0764, 0xea580c],
    [0.82, 0x0f0a2e, 0x312e81],
    [1.0, 0x03050f, 0x0b1029],
  ];

  private skyColors(progress: number): [number, number] {
    const keys = WorldEffects.SKY_KEYS;
    const p = ((progress % 1) + 1) % 1;
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1][0] <= p) i++;
    const [p0, t0, h0] = keys[i];
    const [p1, t1, h1] = keys[i + 1];
    const k = Phaser.Math.Clamp((p - p0) / Math.max(1e-6, p1 - p0), 0, 1);
    const lerpC = (a: number, b: number, t: number) => {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(a), Phaser.Display.Color.ValueToColor(b), 1000, Math.round(t * 1000));
      return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
    };
    let top = lerpC(t0, t1, k), horizon = lerpC(h0, h1, k);
    if (this.weather === 'RAIN') { top = lerpC(top, this.stormy ? 0x1f2937 : 0x374151, 0.65); horizon = lerpC(horizon, 0x4b5563, 0.6); }
    else if (this.weather === 'SNOW') { top = lerpC(top, 0x94a3b8, 0.35); horizon = lerpC(horizon, 0xe2e8f0, 0.4); }
    return [top, horizon];
  }

  private drawSkyBackdrop(progress: number): void {
    const show = !useGameStore.getState().showWallpaper;
    if (!show) {
      this.skyGfx?.setVisible(false);
      return;
    }
    const cam = this.scene.cameras.main;
    if (!this.skyGfx) {
      this.skyGfx = this.scene.add.graphics().setScrollFactor(0).setDepth(-1e9);
      this.scene.children.sendToBack(this.skyGfx);
    }
    const [top, horizon] = this.skyColors(progress);
    const key = `${top}|${horizon}|${cam.width}|${cam.height}|${cam.zoom.toFixed(3)}`;
    this.skyGfx.setVisible(true);
    if (key === this.lastSkyKey) return;
    this.lastSkyKey = key;
    // Scroll-factor-0 objects still scale with zoom around the centre, so oversize the rect
    const w = cam.width / cam.zoom, h = cam.height / cam.zoom;
    const x = cam.width / 2 - w, y = cam.height / 2 - h;
    this.skyGfx.clear();
    this.skyGfx.fillGradientStyle(top, top, horizon, horizon, 1);
    this.skyGfx.fillRect(x, y, w * 2, h * 2);
  }

  private updateSky(progress: number, darkness: number, lite = false): void {
    this.drawSkyBackdrop(progress);
    const sunT = (progress - SUN_RISE) / ARC_SPAN;
    const moonT = (((progress - MOON_RISE) % 1) + 1) % 1 / ARC_SPAN;
    this.placeOnArc(this.sun, sunT, 0xfb923c);
    this.placeOnArc(this.moon, moonT, null);

    // Sun and moon answer each other: the halo breathes, the rays turn, and the
    // moon's lit side always faces where the sun is (even below the horizon)
    const t = this.elapsed / 1000;
    const byTex = (c: Phaser.GameObjects.Container, key: string) => (c.list as Phaser.GameObjects.Image[]).find((o) => o.texture?.key === key);
    const sunHalo = byTex(this.sun, MIST_TEX.sunHalo)!;
    const sunRays = byTex(this.sun, MIST_TEX.sunRays);
    const lowSun = Phaser.Math.Clamp(Math.sin(Math.max(0, Math.min(Math.PI, sunT * Math.PI))) / 0.4, 0, 1);
    sunHalo.setScale(0.9 + Math.sin(t * 0.8) * 0.05).setTint(lowSun < 1 ? 0xfdba74 : 0xffffff);
    sunRays?.setRotation(t * 0.06).setAlpha(0.3 + 0.15 * Math.sin(t * 1.3));
    const moonHalo = byTex(this.moon, MIST_TEX.moonHalo)!;
    const moonBody = byTex(this.moon, MIST_TEX.moonDisc)!;
    moonHalo.setScale(0.75 + Math.sin(t * 0.6 + 1.5) * 0.04);
    const sunAt = this.arcPoint(sunT);
    moonBody.setFlipX(sunAt.x > this.moon.x); // texture is lit on its left
    // Twilight: when both are up, the moon picks up a faint warm rim from the sun
    moonHalo.setTint(this.sun.visible && this.moon.visible ? 0xfde2c4 : 0xffffff);
    this.skyWarmth = this.sun.visible ? 1 - lowSun : 0;
    this.moonlight = this.moon.visible ? this.moon.alpha : 0;

    // Clouds dim the sky bodies
    const overcast = this.weather === 'RAIN' ? 0.35 : this.weather === 'SNOW' ? 0.6 : 1;
    this.sun.setAlpha(this.sun.alpha * overcast);
    this.moon.setAlpha(this.moon.alpha * overcast);

    // Stars, constellations, the milky band, shooting stars and comets
    const now = this.elapsed;
    const dt = this.lastSkyMs ? Math.min(0.2, (now - this.lastSkyMs) / 1000) : 0;
    this.lastSkyMs = now;
    const night = Phaser.Math.Clamp((darkness - 0.3) / 0.5, 0, 1);
    const dimmed = this.weather === 'RAIN' ? (this.stormy ? 0.9 : 0.75) : this.weather === 'SNOW' ? 0.4 : 0;
    if (!lite || Math.floor(now / 100) % 2 === 0) this.nightSky.update(dt, now, night, dimmed);
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
      const gx = Math.round((container.x / HALF_W + container.y / HALF_H) / 2);
      const gy = Math.round((container.y / HALF_H - container.x / HALF_W) / 2);
      const dirX = dx / moved;
      const dirY = dy / moved;

      if (GRASS_TYPES.has(tile.type)) {
        this.rustleGrass(container.x, container.y, dirX, dirY);
        track.cooldown = 320;
      } else if (tile.type === 'OCEAN_BLOCK' && isBridgeTile(gx, gy)) {
        // Walking a bridge deck: footfall dust on the planks, never a wake
        this.kickDust(container.x, container.y, dirX, dirY);
        track.cooldown = 420;
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

  /** Soft rings spreading from the swimmer and a few foam flecks behind it (no hard V lines). */
  private waterWake(x: number, y: number, dirX: number, dirY: number): void {
    const ring = this.scene.add.graphics();
    ring.lineStyle(1, 0xe0f2fe, 0.55);
    ring.strokeEllipse(0, 0, 12, 6);
    ring.lineStyle(1, 0xbae6fd, 0.3);
    ring.strokeEllipse(0, 0, 20, 10);
    ring.setPosition(x - dirX * 3, y - dirY * 1.5);
    this.groundLayer.add(ring);
    this.scene.tweens.add({
      targets: ring,
      scaleX: 1.9,
      scaleY: 1.9,
      alpha: 0,
      duration: 900,
      ease: 'Sine.easeOut',
      onComplete: () => ring.destroy(),
    });

    for (let i = 0; i < 3; i++) {
      const fleck = this.scene.add.graphics();
      fleck.fillStyle(0xf0f9ff, 0.8);
      this.pixelRect(fleck, 0, 0, 1, 1);
      fleck.setPosition(x - dirX * (6 + i * 3) + Phaser.Math.Between(-4, 4), y - dirY * (3 + i * 1.5) + Phaser.Math.Between(-2, 2));
      this.groundLayer.add(fleck);
      this.scene.tweens.add({ targets: fleck, alpha: 0, duration: Phaser.Math.Between(400, 700), onComplete: () => fleck.destroy() });
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

  /** This realm's leaping-fish set (leapingFish.json). */
  private fishBiome(): FishBiome {
    const biomes = FISH.biomes as unknown as Record<string, FishBiome>;
    return biomes[String(useGameStore.getState().platformPhase || 1)] ?? biomes['1'];
  }

  private splash(x: number, y: number, ringColor = 0xf0f9ff, dropColor = 0xe0f2fe): void {
    const ring = this.scene.add.graphics();
    ring.lineStyle(P, ringColor, 0.9);
    ring.strokeEllipse(0, 0, 10, 5);
    ring.setPosition(x, y);
    this.groundLayer.add(ring);
    this.scene.tweens.add({ targets: ring, scaleX: 2.4, scaleY: 2.4, alpha: 0, duration: 600, onComplete: () => ring.destroy() });

    for (let i = 0; i < 4; i++) {
      const drop = this.scene.add.graphics();
      drop.fillStyle(dropColor, 1);
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

  /** A tiny ember / snowflake / sparkle left behind a leaping fish. */
  private trailBit(x: number, y: number, kind: FishBiome['trail']): void {
    if (kind === 'none') return;
    const bit = this.scene.add.graphics();
    bit.fillStyle(kind === 'ember' ? 0xfb923c : kind === 'snow' ? 0xf8fafc : 0xfef9c3, 1);
    this.pixelRect(bit, 0, 0, 1, 1);
    bit.setPosition(x, y);
    this.airLayer.add(bit);
    const drift = kind === 'ember' ? -10 : kind === 'snow' ? 6 : -4;
    this.scene.tweens.add({ targets: bit, y: y + drift, alpha: 0, duration: kind === 'sparkle' ? 700 : 500, onComplete: () => bit.destroy() });
  }

  private leapFish(): void {
    const tile = Phaser.Utils.Array.GetRandom(this.waterTiles);
    if (!tile) return;
    const biome = this.fishBiome();
    const rare = Math.random() < biome.rare.chance;
    if (rare) {
      const name = biome.rare.name ?? { en: 'Golden Carp', tl: 'Gintong Karpa' };
      logMessage(biome.rare.logKey as 'goldenFish', { tile: IsometricHelper.tileName(tile.x, tile.y), fish: name });
    }
    const school = !rare && Math.random() < biome.jump.school ? 3 : 1;
    for (let i = 0; i < school; i++) {
      this.scene.time.delayedCall(i * 140, () => this.leapOne(tile, biome, rare));
    }
  }

  private leapOne(tile: { x: number; y: number }, biome: FishBiome, rare: boolean): void {
    const species = rare ? biome.rare : this.pickSpecies(biome);
    const base = IsometricHelper.gridToScreen(tile.x, tile.y);
    const dir = Phaser.Math.RND.sign();
    let startX = base.x + Phaser.Math.Between(-10, 10);
    let startY = base.y + WATER_DROP_WORLD + Phaser.Math.Between(-3, 3);

    const body = parseInt(species.body, 16);
    const fin = parseInt(species.fin, 16);
    const len = species.long ? 2 : 0;
    const fish = this.scene.add.graphics();
    fish.fillStyle(body, 1);
    fish.fillRect((-3 - len) * P, -P, (5 + len) * P, 2 * P);
    fish.fillRect(-2 * P, -1.5 * P, 3 * P, 3 * P);
    fish.fillStyle(fin, 1);
    fish.fillRect((-5 - len) * P, -1.5 * P, 2 * P, 3 * P);
    fish.fillRect(-1 * P, -2 * P, 2 * P, P / 2);
    fish.fillStyle(0x0f172a, 1);
    fish.fillRect(1 * P, -P, P, P);
    fish.setScale(dir, 1);
    fish.setVisible(false);
    this.airLayer.add(fish);

    // One or more hops (frost fish skip across the surface)
    const hop = (n: number) => {
      const endX = startX + dir * Phaser.Math.Between(10, 18);
      const endY = startY + Phaser.Math.Between(-4, 4);
      const scale = n === 0 ? 1 : 0.7;
      const height = Phaser.Math.Between(biome.jump.height[0], biome.jump.height[1]) * scale;
      const sx = startX;
      const sy = startY;
      fish.setPosition(sx, sy).setVisible(true);
      this.splash(sx, sy, parseInt(biome.splash, 16), parseInt(biome.drops, 16));
      const arc = { t: 0 };
      let trailTimer = 0;
      this.scene.tweens.add({
        targets: arc,
        t: 1,
        duration: biome.jump.ms * scale,
        ease: 'Linear',
        onUpdate: (tween) => {
          const t = arc.t;
          fish.x = Phaser.Math.Linear(sx, endX, t);
          fish.y = Phaser.Math.Linear(sy, endY, t) - 4 * height * t * (1 - t);
          const slope = (endY - sy) - 4 * height * (1 - 2 * t);
          fish.rotation = Math.atan2(slope, Math.abs(endX - sx)) * dir;
          trailTimer += tween.elapsed > 0 ? 1 : 0;
          if (trailTimer % 4 === 0) this.trailBit(fish.x - dir * 4, fish.y, biome.trail);
        },
        onComplete: () => {
          startX = endX;
          startY = endY;
          if (n + 1 < biome.jump.hops) {
            hop(n + 1);
            return;
          }
          fish.destroy();
          this.splash(endX, endY, parseInt(biome.splash, 16), parseInt(biome.drops, 16));
          soundFx.playSplash();
        },
      });
    };
    hop(0);
  }

  private pickSpecies(biome: FishBiome): FishSpecies {
    let roll = Math.random() * biome.species.reduce((sum, sp) => sum + sp.weight, 0);
    for (const sp of biome.species) {
      roll -= sp.weight;
      if (roll <= 0) return sp;
    }
    return biome.species[0];
  }

  // ── Weather particles ──────────────────────────────────────────────────────

  private updateWeather(delta: number, weather: WeatherType): void {
    const dt = delta / 1000;
    const rate = weather === 'RAIN' ? (this.stormy ? 110 : 55) : weather === 'SNOW' ? 22 : weather === 'HEATWAVE' ? 6 : 0;
    this.spawnAccum += rate * this.density * dt;
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

  /** 0–1: how much the low sun warms the clouds (dawn / dusk). */
  private skyWarmth = 0;
  /** 0–1: moon brightness, cooling the clouds at night. */
  private moonlight = 0;

  /** Clouds take the weather and the light of the sky: gold at dawn/dusk, silver-violet under the moon. */
  private cloudTint(): number {
    if (this.weather === 'RAIN') return this.stormy ? 0x4b5563 : 0x6b7280;
    let tint = this.weather === 'SNOW' ? 0xe2e8f0 : 0xffffff;
    const mix = (to: number, k: number) => {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(tint), Phaser.Display.Color.ValueToColor(to), 100, Math.round(k * 100));
      tint = Phaser.Display.Color.GetColor(c.r, c.g, c.b);
    };
    if (this.skyWarmth > 0) mix(0xfdba74, this.skyWarmth * 0.6);
    if (this.moonlight > 0) mix(0xa5b4fc, this.moonlight * 0.45);
    return tint;
  }

  private tintCloud(cloud: Cloud, tint: number): void {
    for (const p of cloud.parts) p.img.setTint(tint);
  }

  private updateClouds(delta: number, weather: WeatherType): void {
    const wanted = Math.max(2, Math.round((weather === 'RAIN' ? (this.stormy ? 9 : 7) : weather === 'SNOW' ? 5 : 3) * this.density));

    if (weather !== this.cloudWeather) {
      this.cloudWeather = weather;
      for (const cloud of this.clouds) cloud.body.setAlpha(weather === 'RAIN' ? 0.95 : 0.8);
    }
    // Sky light changes slowly; re-tint a few times a second
    this.cloudTintTimer -= delta;
    if (this.cloudTintTimer <= 0 && !this.cloudsLit) {
      this.cloudTintTimer = 400;
      const tint = this.cloudTint();
      for (const cloud of this.clouds) this.tintCloud(cloud, tint);
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
    const t = this.elapsed / 1000;
    for (const cloud of this.clouds) {
      cloud.body.x += WIND.x * cloud.speed * gust * dt;
      cloud.body.y += WIND.y * cloud.speed * gust * dt;
      // Same motion as the rift fog: each lobe drifts and breathes around its home
      for (const p of cloud.parts) {
        p.img.setPosition(p.hx + Math.sin(t * 0.4 + p.phase) * 5, p.hy + Math.cos(t * 0.3 + p.phase) * 2);
        p.img.setScale(p.scale * (1 + Math.sin(t * 0.7 + p.phase * 2) * 0.05));
      }
      cloud.shadow.setPosition(cloud.body.x + 26, cloud.body.y + 70);
      if (cloud.body.x - cloud.width / 2 > this.bounds.right || cloud.body.y > this.bounds.bottom) {
        this.placeCloudUpwind(cloud);
      }
    }
  }

  private spawnCloud(anywhere: boolean): void {
    const size = Phaser.Math.FloatBetween(0.8, 1.3) * (this.weather === 'RAIN' ? 1.25 : 1);
    const parts: Cloud['parts'] = [];
    const add = (tex: string, hx: number, hy: number, scale: number) => {
      const img = this.scene.add.image(hx, hy, tex).setScale(scale);
      parts.push({ img, hx, hy, scale, phase: Math.random() * 6.28 });
    };
    // Bank underneath, 3–5 billowing puffs on top
    add(MIST_TEX.bank, 0, 14 * size, 1.1 * size);
    const puffs = Phaser.Math.Between(3, 5);
    for (let i = 0; i < puffs; i++) {
      const u = puffs === 1 ? 0 : i / (puffs - 1) - 0.5;
      add(MIST_TEX.puff, u * 110 * size, -Math.cos(u * Math.PI) * 14 * size + Phaser.Math.Between(-4, 4), Phaser.Math.FloatBetween(0.55, 0.8) * size);
    }
    const body = this.scene.add.container(0, 0, parts.map((p) => p.img)).setAlpha(this.weather === 'RAIN' ? 0.95 : 0.8);
    const shadow = this.scene.add.image(0, 0, MIST_TEX.bank).setScale(1.4 * size, 1.1 * size).setTintFill(0x000000).setAlpha(0.08);
    this.airLayer.add(body);
    this.groundLayer.add(shadow);
    const cloud: Cloud = { body, parts, shadow, speed: Phaser.Math.FloatBetween(0.7, 1.4), width: 200 * size, phase: Math.random() * 6.28 };
    this.tintCloud(cloud, this.cloudTint());
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
    this.cloudsLit = true;
    for (const cloud of this.clouds) this.tintCloud(cloud, 0xe0e7ff);
    this.scene.time.delayedCall(duration, () => {
      this.cloudsLit = false;
      for (const cloud of this.clouds) if (cloud.body.active) this.tintCloud(cloud, this.cloudTint());
    });
  }

  /** Called wherever a bolt lands so the scene can damage whatever it hit. */
  public setStrikeHandler(handler: (x: number, y: number, strength: number) => void): void {
    this.strikeHandler = handler;
  }

  // ── Lightning ──────────────────────────────────────────────────────────────

  /** Flicker inside the clouds with no bolt — distant rumble. */
  private sheetLightning(): void {
    this.lightClouds(140);
    this.scene.cameras.main.flash(120, 90, 100, 140, true);
    this.scene.time.delayedCall(Phaser.Math.Between(600, 1400), () => soundFx.playThunder(0.45));
  }

  private strikeLightning(): void {
    // Storm bolts are drawn to whoever is out in the open
    const actors = this.getActors().filter((a) => a.active);
    const drawn = this.stormy && actors.length > 0 && Math.random() < 0.35 ? Phaser.Utils.Array.GetRandom(actors) : null;
    const tile = drawn
      ? (({ x, y }) => ({ x: Math.round(x), y: Math.round(y) }))(IsometricHelper.screenToGrid(drawn.x, drawn.y))
      : Phaser.Utils.Array.GetRandom(this.landTiles);
    if (!tile) return;
    const ground = drawn ? { x: drawn.x, y: drawn.y } : IsometricHelper.gridToScreen(tile.x, tile.y);
    const tx = ground.x + Phaser.Math.Between(-8, 8);
    const ty = ground.y + Phaser.Math.Between(-4, 4);
    this.drawBolt(tx, ty, 1);
    this.strikeHandler?.(tx, ty, 1);
    logMessage('lightning', { tile: IsometricHelper.tileName(tile.x, tile.y) });

    // A storm sometimes forks into a second strike nearby
    if (this.stormy && Math.random() < 0.3) {
      this.scene.time.delayedCall(Phaser.Math.Between(140, 260), () => {
        const fx = tx + Phaser.Math.Between(-60, 60);
        const fy = ty + Phaser.Math.Between(-30, 30);
        this.drawBolt(fx, fy, 0.7);
        this.strikeHandler?.(fx, fy, 0.7);
      });
    }

    this.lightClouds(180);
    this.scene.cameras.main.flash(160, 190, 215, 255, true);
    // [Camera shake removed], this.stormy ? 0.008 : 0.005, true);
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
