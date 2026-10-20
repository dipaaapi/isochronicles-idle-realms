import Phaser from 'phaser';
import { MIST_TEX, paintMistTextures } from '../mistTextures';
import { Navigation } from '../Navigation';
import { ART_PIXEL, WATER_DROP_WORLD } from '../PixelTileArt';
import { BRIDGE_TILES, GRID_SIZE, isCanalTile, isWaterTile } from '../../state/buildingLayout';
import { logMessage } from '../../state/activityLog';
import CFG from '../../data/waterfalls.json';

type MoodId = keyof typeof CFG.moods;
interface MoodParams { flow: number; width: number; sway: number; chunks: number; mist: number; reverse: number; frozen: number }
interface BiomeStyle { sheet: string; drops: string[]; lip: string; mist: string; chunk: string; speed: number; streak: number; mistRises: boolean; sparkle: boolean; icicle?: string }
const hex = (v: string) => parseInt(v, 16);
const paramsOf = (id: MoodId): MoodParams => {
  const m = CFG.moods[id] as Partial<MoodParams> & { flow: number };
  return { flow: m.flow, width: m.width ?? 1, sway: m.sway ?? 0, chunks: m.chunks ?? 0, mist: m.mist ?? 1, reverse: m.reverse ?? 0, frozen: m.frozen ?? 0 };
};
/** Realm-only moods the activity log narrates. */
const SPECIAL_LOG = { ERUPTION: 'fallsEruption', FREEZE: 'fallsFreeze', ASCENT: 'fallsAscent' } as const;

/** How far the falls drop below the water's edge (the cliff under the island's front rim). */
const FALL = 84;
const STREAMS_PER_TILE = 5;
const DROPS_PER_STREAM = 4;
const snap = (v: number) => Math.round(v / ART_PIXEL) * ART_PIXEL;

interface Stream {
  x: number;
  y: number;
  speed: number;
  phase: number;
  length: number;
  shade: number;
  /** Seconds left sputtered out (dry). */
  dry: number;
}

/** A bit tumbling down the falls: lava glob, ice shard, spray or star spark. */
interface Chunk {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
}

/**
 * Water that moves: the ocean ring spills off the island's two front rims as
 * pixel-art waterfalls (streaks sliding down the cliff, white lip foam, mist
 * at the bottom), and wooden bridges span the canals wherever a road crosses.
 */
export class WaterFx {
  private falls: Phaser.GameObjects.Graphics;
  private bridges: Phaser.GameObjects.Graphics;
  private streams: Stream[] = [];
  private chunks: Chunk[] = [];
  private mood: MoodId = 'STEADY';
  private moodTimer = 4;
  private cur: MoodParams = paramsOf('STEADY');
  private lastMs = 0;
  /** Accumulated fall distance, so flow speed can change without drops jumping. */
  private travel = 0;
  private sway = 0;

  /** Random drifting mist clouds below the falls; how many depends on the FPS tier (setDensity). */
  private fallClouds: Array<{ img: Phaser.GameObjects.Image; vx: number; vy: number; life: number; max: number; peak: number }> = [];
  private cloudTimer = 1;
  private density = 1;

  /** 0.2–1 from the FPS controller: LOW quality keeps only a few clouds. */
  setDensity(density: number): void {
    this.density = Math.max(0.2, Math.min(1, density));
  }

  /** Soft spray clouds (the same mist as the rift fog and sky clouds) at the foot of each rim tile. */
  private sprays: Array<{ img: Phaser.GameObjects.Image; x: number; y: number; phase: number; ox: number; oy: number; life: number; max: number; wait: number }> = [];

  constructor(private scene: Phaser.Scene, private layer: Phaser.GameObjects.Container) {
    paintMistTextures(scene);
    this.falls = scene.add.graphics();
    this.bridges = scene.add.graphics();
    layer.add([this.falls, this.bridges]);
    const last = GRID_SIZE - 1;
    // Only the two rims facing the camera are visible: x = last and y = last
    for (let i = 0; i < GRID_SIZE; i++) {
      if (isWaterTile(i, last)) this.addRim(i, last + 0.5, true);
      if (isWaterTile(last, i)) this.addRim(last + 0.5, i, false);
    }
    this.drawBridges();
  }

  /** Streams spread along one tile's outer edge. */
  private addRim(gx: number, gy: number, alongX: boolean): void {
    const foot = Navigation.toWorld(gx, gy);
    const spray = this.scene.add.image(foot.x, foot.y + WATER_DROP_WORLD + FALL, MIST_TEX.puff).setScale(0.55).setAlpha(0);
    this.layer.add(spray);
    this.sprays.push({ img: spray, x: foot.x, y: foot.y + WATER_DROP_WORLD + FALL - 6, phase: Math.random() * 6.28, ox: 0, oy: 0, life: 0, max: 1, wait: Math.random() * 6 });
    for (let s = 0; s < STREAMS_PER_TILE; s++) {
      const t = (s + 0.5) / STREAMS_PER_TILE - 0.5;
      const p = Navigation.toWorld(alongX ? gx + t : gx, alongX ? gy : gy + t);
      this.streams.push({
        x: snap(p.x),
        y: p.y + WATER_DROP_WORLD,
        speed: 55 + Math.random() * 35,
        phase: Math.random() * FALL,
        length: FALL * (0.75 + Math.random() * 0.35),
        shade: Math.random(),
        dry: 0,
      });
    }
  }

  /**
   * What the water tiles should do to match the falls: `flow` scales the
   * surface animation speed (realm speed × mood), `frozen` 0–1 when the
   * Frost falls freeze.
   */
  surfaceState(phase: number): { flow: number; frozen: number } {
    const biomes = CFG.biomes as Record<string, BiomeStyle>;
    const style = biomes[String(phase)] ?? biomes['1'];
    return { flow: style.speed * this.cur.flow, frozen: this.cur.frozen };
  }

  /** Rolls the falls into a new random mood (realm-only moods only in their realm). */
  private pickMood(phase: number): void {
    const pool = (Object.keys(CFG.moods) as MoodId[]).filter((id) => {
      const biome = (CFG.moods[id] as { biome?: number }).biome;
      return id !== this.mood && (biome === undefined || biome === phase);
    });
    let roll = Math.random() * pool.reduce((sum, id) => sum + CFG.moods[id].weight, 0);
    let next = pool[0];
    for (const id of pool) {
      roll -= CFG.moods[id].weight;
      if (roll <= 0) {
        next = id;
        break;
      }
    }
    this.mood = next;
    const [lo, hi] = CFG.moodSeconds;
    this.moodTimer = lo + Math.random() * (hi - lo);
    if (next in SPECIAL_LOG) logMessage(SPECIAL_LOG[next as keyof typeof SPECIAL_LOG]);
  }

  update(timeMs: number, phase = 1): void {
    const dt = this.lastMs ? Math.min(0.1, (timeMs - this.lastMs) / 1000) : 0;
    this.lastMs = timeMs;
    const biomes = CFG.biomes as Record<string, BiomeStyle>;
    const style = biomes[String(phase)] ?? biomes['1'];

    // Random moods, blended smoothly
    this.moodTimer -= dt;
    const special = (CFG.moods[this.mood] as { biome?: number }).biome;
    if (this.moodTimer <= 0 || (special !== undefined && special !== phase)) this.pickMood(phase);
    const target = paramsOf(this.mood);
    const k = Math.min(1, dt * CFG.blendPerSecond);
    for (const key of Object.keys(target) as (keyof MoodParams)[]) this.cur[key] += (target[key] - this.cur[key]) * k;
    const m = this.cur;
    const flowing = Math.max(0, 1 - m.frozen);
    this.travel += dt * style.speed * m.flow * flowing;
    this.sway = Math.sin(timeMs / 700) * m.sway * 6 + Math.sin(timeMs / 230) * m.sway * 2;

    const g = this.falls;
    g.clear();
    const t = timeMs / 1000;
    // Random mist clouds roll out below the falls: more with a stronger flow and on higher FPS tiers
    this.cloudTimer -= dt;
    const cap = Math.round(14 * this.density * Math.min(1.6, 0.5 + m.mist * 0.5));
    if (this.cloudTimer <= 0 && this.sprays.length && this.fallClouds.length < cap && !style.sparkle) {
      this.cloudTimer = (0.5 + Math.random() * 1.6) / (this.density * Math.max(0.4, m.mist));
      const at = this.sprays[Math.floor(Math.random() * this.sprays.length)];
      const big = Math.random() < 0.35;
      const img = this.scene.add.image(at.x + (Math.random() - 0.5) * 30, at.y + 10 + Math.random() * 40, big ? MIST_TEX.bank : MIST_TEX.puff)
        .setScale(big ? 0.5 + Math.random() * 0.5 : 0.3 + Math.random() * 0.4).setAlpha(0).setTint(hex(style.mist));
      this.layer.add(img);
      const max = 4 + Math.random() * 5;
      this.fallClouds.push({ img, vx: (Math.random() - 0.5) * 14, vy: style.mistRises ? -6 - Math.random() * 6 : 2 + Math.random() * 4, life: max, max, peak: 0.25 + Math.random() * 0.3 });
    }
    for (const c of [...this.fallClouds]) {
      c.life -= dt;
      if (c.life <= 0) { c.img.destroy(); this.fallClouds.splice(this.fallClouds.indexOf(c), 1); continue; }
      const t = 1 - c.life / c.max;
      c.img.x += (c.vx + this.sway * 0.4) * dt;
      c.img.y += c.vy * dt;
      c.img.setAlpha(c.peak * Math.min(1, t * 4, (1 - t) * 3)).setScale(c.img.scaleX * (1 + dt * 0.04), c.img.scaleY * (1 + dt * 0.04));
    }

    // Spray clouds billow at the bottom; rise like smoke on magma, sparkle-realms keep them thin
    const mistTint = hex(style.mist);
    // Each spray puffs up at a random spot near its rim tile, lives a few seconds, fades, rests, then
    // returns somewhere else — only some are out at once (fewer on lower FPS tiers)
    for (const sp of this.sprays) {
      if (sp.wait > 0) {
        sp.wait -= dt;
        sp.img.setAlpha(0);
        if (sp.wait <= 0) {
          sp.ox = (Math.random() - 0.5) * 34;
          sp.oy = Math.random() * 46;
          sp.max = sp.life = 2.5 + Math.random() * 4;
        }
        continue;
      }
      sp.life -= dt;
      if (sp.life <= 0) {
        sp.wait = (1 + Math.random() * 5) / Math.max(0.25, this.density * Math.max(0.4, m.mist));
        sp.img.setAlpha(0);
        continue;
      }
      const k = 1 - sp.life / sp.max;
      const env = Math.min(1, k * 4, (1 - k) * 3);
      const rise = style.mistRises ? -k * 26 : k * 6;
      sp.img
        .setTint(mistTint)
        .setPosition(sp.x + sp.ox + this.sway + Math.sin(t * 0.5 + sp.phase) * 5, sp.y + sp.oy + rise)
        .setScale((0.35 + k * 0.3) * Math.min(1.6, 0.6 + m.mist * 0.4))
        .setAlpha(env * Math.min(0.7, (style.sparkle ? 0.18 : 0.42) * m.mist * flowing + 0.05));
    }
    const dropCount = Math.max(1, Math.min(8, Math.round(DROPS_PER_STREAM * (0.4 + 0.6 * m.flow))));
    const [dropA, dropB] = style.drops.map(hex);
    for (const s of this.streams) {
      // Streams sputter out now and then and come back
      if (s.dry > 0) s.dry -= dt;
      else if (Math.random() < CFG.sputterChance * dt * (m.flow < 0.6 ? 3 : 1)) s.dry = 1 + Math.random() * 3;
      const dry = s.dry > 0;
      const w = ART_PIXEL * Math.max(1, Math.round(m.width * style.streak));

      // Frozen: icicles hang from the lip instead of falling water
      if (m.frozen > 0.05) {
        const len = snap(s.length * 0.35 * m.frozen * (0.6 + s.shade * 0.6));
        g.fillStyle(hex(style.icicle ?? style.sheet), 0.5 + 0.4 * m.frozen);
        g.fillTriangle(s.x - w, s.y, s.x + w, s.y, s.x, s.y + len);
        g.fillStyle(0xffffff, 0.7 * m.frozen);
        g.fillRect(s.x - ART_PIXEL / 2, s.y + ART_PIXEL, ART_PIXEL / 2, len * 0.4);
      }
      if (!dry && flowing > 0.05) {
        // Faint sheet behind the drops
        g.fillStyle(hex(style.sheet), 0.16 * flowing * Math.min(1.6, m.width));
        g.fillRect(s.x - w + this.sway * 0.5, s.y, w * 2, s.length);
        for (let i = 0; i < dropCount; i++) {
          let d = (s.phase + this.travel * s.speed + (i * s.length) / dropCount) % s.length;
          if (m.reverse > 0.5) d = s.length - d; // Astral ascent: the falls run upward
          const fade = 1 - d / s.length;
          const streak = ART_PIXEL * (style.streak + 1 + Math.floor(d / 22));
          const dx = this.sway * (d / s.length);
          g.fillStyle(s.shade > 0.5 ? dropA : dropB, (0.25 + fade * 0.6) * flowing);
          g.fillRect(snap(s.x + dx) - ART_PIXEL / 2, snap(s.y + d), ART_PIXEL * style.streak, streak);
        }
      }
      // Lip foam where it tips over (dimmer while dry)
      g.fillStyle(hex(style.lip), dry ? 0.35 : 0.75);
      g.fillRect(s.x - w, snap(s.y), w * 2, ART_PIXEL);

      // Mist, smoke (rises) or sparkles where it breaks up
      const puff = (Math.sin(t * 2 + s.phase) + 1) / 2;
      const mistAmt = (0.1 + puff * 0.12) * m.mist * (dry ? 0.3 : 1);
      if (style.sparkle) {
        if (Math.sin(t * 5 + s.phase * 3) > 0.6) {
          g.fillStyle(hex(style.mist), Math.min(1, mistAmt * 4));
          g.fillRect(snap(s.x + Math.sin(t + s.phase) * 8), snap(s.y + s.length - 10 - puff * 12), ART_PIXEL, ART_PIXEL);
        }
      } else {
        const rise = style.mistRises ? -puff * 18 : 0;
        g.fillStyle(hex(style.mist), Math.min(0.6, mistAmt));
        g.fillRect(s.x - ART_PIXEL * 2 + this.sway, snap(s.y + s.length - 6 + rise), ART_PIXEL * 4, ART_PIXEL * 2);
      }

      // Bits tumbling down: lava globs, ice shards, spray, star sparks
      if (!dry && m.chunks > 0 && Math.random() < (m.chunks / STREAMS_PER_TILE) * dt * 0.5) {
        this.chunks.push({
          x: s.x,
          y: s.y,
          vx: (Math.random() - 0.5) * 20 + this.sway * 2,
          vy: (m.reverse > 0.5 ? -20 : 15) * style.speed,
          life: 1.6,
          size: ART_PIXEL * (1 + Math.round(Math.random() * style.streak)),
        });
      }
    }

    const grav = m.reverse > 0.5 ? -60 : 160 * style.speed;
    const chunkColor = hex(style.chunk);
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.chunks.splice(i, 1);
        continue;
      }
      c.vy += grav * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      g.fillStyle(chunkColor, Math.min(1, c.life));
      g.fillRect(snap(c.x), snap(c.y), c.size, c.size);
    }
  }

  /** Plank decks with side rails over every road tile on a canal. */
  drawBridges(): void {
    const g = this.bridges;
    g.clear();
    for (const { x, y } of BRIDGE_TILES) {
      // The canal flows along x when its neighbours on x are water too
      const flowAlongX = isCanalTile(x - 1, y) || isCanalTile(x + 1, y) || isWaterTile(x - 1, y) && isWaterTile(x + 1, y);
      const corner = (dx: number, dy: number) => Navigation.toWorld(x + dx, y + dy);
      const a = corner(-0.5, -0.5);
      const b = corner(0.5, -0.5);
      const c = corner(0.5, 0.5);
      const d = corner(-0.5, 0.5);
      g.fillStyle(0x3f2a1d, 0.55);
      g.fillPoints([{ x: a.x, y: a.y + 6 }, { x: b.x, y: b.y + 6 }, { x: c.x, y: c.y + 6 }, { x: d.x, y: d.y + 6 }], true);
      g.fillStyle(0x8b5a2b, 1);
      g.fillPoints([a, b, c, d], true);
      // Planks run across the flow
      g.lineStyle(1, 0x5b3a1e, 0.9);
      for (let i = 1; i < 6; i++) {
        const f = i / 6 - 0.5;
        const p = flowAlongX ? corner(f, -0.5) : corner(-0.5, f);
        const q = flowAlongX ? corner(f, 0.5) : corner(0.5, f);
        g.lineBetween(p.x, p.y, q.x, q.y);
      }
      // Rails on the two edges over the water
      g.lineStyle(2, 0x4a2f17, 1);
      const rails = flowAlongX ? [[a, b], [d, c]] : [[a, d], [b, c]];
      for (const [p, q] of rails) {
        g.lineBetween(p.x, p.y - 5, q.x, q.y - 5);
        g.lineBetween(p.x, p.y, p.x, p.y - 5);
        g.lineBetween(q.x, q.y, q.x, q.y - 5);
      }
    }
  }

  destroy(): void {
    this.falls.destroy();
    this.sprays.forEach((s) => s.img.destroy());
    this.fallClouds.forEach((c) => c.img.destroy());
    this.bridges.destroy();
  }
}
