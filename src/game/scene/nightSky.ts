import Phaser from 'phaser';
import { MIST_TEX } from '../mistTextures';
import SKY from '../../data/nightSky.json';

interface Star { x: number; y: number; size: number; color: number; phase: number; speed: number }
interface Streak { x: number; y: number; vx: number; vy: number; life: number; max: number; comet: boolean; head: Phaser.GameObjects.Image }

/**
 * The night sky behind the island (on the sky layer, so the tiles hide it at
 * the horizon): a deep starfield that twinkles, the realm's constellations
 * traced faintly at deep night, a soft milky band painted with the cloud mist,
 * shooting stars and now and then a slow comet. Fades with the daylight.
 * Constellations and timings live in src/data/nightSky.json.
 */
export class NightSky {
  private stars: Star[] = [];
  private gfx: Phaser.GameObjects.Graphics;
  private band: Phaser.GameObjects.Image[] = [];
  private glows: Phaser.GameObjects.Image[] = [];
  private streaks: Streak[] = [];
  private nextStreak = 3;
  private constellations: Array<{ points: Array<{ x: number; y: number }>; lines: number[][] }>;

  constructor(private scene: Phaser.Scene, private layer: Phaser.GameObjects.Container, private area: Phaser.Geom.Rectangle) {
    this.gfx = scene.add.graphics();
    // Milky band: long, faint mist banks tilted across the sky
    for (let i = 0; i < SKY.band.count; i++) {
      const t = i / (SKY.band.count - 1);
      const img = scene.add.image(
        Phaser.Math.Linear(area.left, area.right, t),
        Phaser.Math.Linear(area.top + area.height * 0.15, area.top + area.height * 0.55, t) + Phaser.Math.Between(-30, 30),
        MIST_TEX.bank
      ).setScale(Phaser.Math.FloatBetween(1.8, 2.6), Phaser.Math.FloatBetween(0.9, 1.3)).setRotation(0.32).setTint(0xa78bfa).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
      this.band.push(img);
    }
    layer.add(this.band);
    layer.add(this.gfx);

    const colors = SKY.starColors.map((c) => Number(c));
    for (let i = 0; i < SKY.stars; i++) {
      const r = Math.random();
      this.stars.push({
        x: Phaser.Math.Between(area.left, area.right),
        y: Phaser.Math.Between(area.top, area.bottom),
        size: r > 0.97 ? 3 : r > 0.82 ? 2 : 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 1.8,
      });
    }
    // Brightest stars get a soft glow sprite
    for (const s of this.stars.filter((s) => s.size === 3)) {
      const g = scene.add.image(s.x, s.y, MIST_TEX.starGlow).setScale(0.35).setTint(s.color).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      this.glows.push(g);
      layer.add(g);
    }
    // Constellations placed across the upper sky, scaled to the area
    this.constellations = SKY.constellations.map((c, i) => {
      const cx = area.left + area.width * (0.15 + 0.7 * ((i + 0.5) / SKY.constellations.length));
      const cy = area.top + area.height * (0.18 + 0.16 * (i % 2));
      const scale = area.width / 1400;
      return { points: c.points.map(([x, y]) => ({ x: cx + x * scale, y: cy + y * scale })), lines: c.lines };
    });
  }

  /** `night` 0 (day) – 1 (deep night); `dimmed` 0–1 by clouds/rain. */
  update(dt: number, timeMs: number, night: number, dimmed: number): void {
    const g = this.gfx;
    g.clear();
    const vis = Phaser.Math.Clamp(night, 0, 1) * (1 - dimmed);
    for (const b of this.band) b.setAlpha(vis * SKY.band.alpha);
    if (vis <= 0.01) {
      for (const gl of this.glows) gl.setAlpha(0);
      for (const s of this.streaks) s.head.destroy();
      this.streaks = [];
      return;
    }
    const t = timeMs / 1000;
    for (const s of this.stars) {
      const tw = 0.55 + 0.45 * Math.sin(t * s.speed + s.phase);
      g.fillStyle(s.color, vis * tw * (s.size === 1 ? 0.7 : 1));
      g.fillRect(s.x, s.y, s.size, s.size);
      if (s.size === 3 && tw > 0.8) {
        g.fillRect(s.x - 2, s.y + 1, 7, 1);
        g.fillRect(s.x + 1, s.y - 2, 1, 7);
      }
    }
    let gi = 0;
    for (const s of this.stars) if (s.size === 3) this.glows[gi++]?.setAlpha(vis * (0.5 + 0.3 * Math.sin(t * s.speed + s.phase)));

    // Constellations only at deep night: faint lines, brighter nodes
    const deep = Phaser.Math.Clamp((night - SKY.constellationFrom) / (1 - SKY.constellationFrom), 0, 1) * (1 - dimmed);
    if (deep > 0) {
      for (const c of this.constellations) {
        g.lineStyle(1, 0xc7d2fe, deep * 0.28);
        for (const [a, b] of c.lines) g.lineBetween(c.points[a].x, c.points[a].y, c.points[b].x, c.points[b].y);
        for (const p of c.points) {
          g.fillStyle(0xf8fafc, deep * 0.95);
          g.fillRect(p.x - 1, p.y - 1, 3, 3);
        }
      }
    }

    // Shooting stars and the occasional comet
    this.nextStreak -= dt;
    if (this.nextStreak <= 0 && vis > 0.4) {
      const [lo, hi] = SKY.streakSeconds;
      this.nextStreak = lo + Math.random() * (hi - lo);
      this.spawnStreak(Math.random() < SKY.cometChance);
    }
    for (const s of [...this.streaks]) {
      s.life -= dt;
      if (s.life <= 0) {
        s.head.destroy();
        this.streaks.splice(this.streaks.indexOf(s), 1);
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const fade = Math.min(1, s.life / (s.max * 0.4), (s.max - s.life) / 0.15) * vis;
      const len = s.comet ? 0.9 : 0.12;
      for (let k = 0; k < (s.comet ? 22 : 10); k++) {
        const f = k / (s.comet ? 22 : 10);
        g.fillStyle(s.comet ? (k < 4 ? 0xe0f2fe : 0x93c5fd) : 0xffffff, fade * (1 - f) * (s.comet ? 0.55 : 0.9));
        const w = s.comet ? Math.max(1, 3 - f * 3) : Math.max(1, 2 - f * 2);
        g.fillRect(s.x - s.vx * len * f, s.y - s.vy * len * f, w, w);
      }
      s.head.setPosition(s.x, s.y).setAlpha(fade);
    }
  }

  private spawnStreak(comet: boolean): void {
    const a = this.area;
    const fromLeft = Math.random() < 0.5;
    const speed = comet ? Phaser.Math.Between(40, 70) : Phaser.Math.Between(420, 620);
    const angle = Phaser.Math.FloatBetween(0.25, 0.6);
    const head = this.scene.add.image(0, 0, MIST_TEX.starGlow).setScale(comet ? 0.7 : 0.3).setBlendMode(Phaser.BlendModes.ADD).setTint(comet ? 0xbae6fd : 0xffffff);
    this.layer.add(head);
    const life = comet ? Phaser.Math.FloatBetween(9, 14) : Phaser.Math.FloatBetween(0.6, 1.1);
    this.streaks.push({
      x: Phaser.Math.Between(a.left + a.width * 0.1, a.right - a.width * 0.1),
      y: Phaser.Math.Between(a.top, a.top + a.height * 0.45),
      vx: (fromLeft ? 1 : -1) * Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life, max: life, comet, head,
    });
  }

  destroy(): void {
    this.gfx.destroy();
    this.band.forEach((b) => b.destroy());
    this.glows.forEach((g) => g.destroy());
    this.streaks.forEach((s) => s.head.destroy());
  }
}
