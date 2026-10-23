import Phaser from 'phaser';

/** Art pixel for the boss (chunkier than the tiles so she reads at a distance). */
const PX = 4;
const C = {
  scale: 0x7f1d1d, scaleMid: 0x991b1b, scaleLit: 0xb91c1c, scaleDark: 0x450a0a,
  belly: 0xd97706, bellyLit: 0xfbbf24, horn: 0x1c1917, hornLit: 0x44403c,
  wing: 0x5b1414, wingLit: 0x7c2d12, bone: 0x292524, eye: 0xfde047, ember: 0xf97316, maw: 0x1c0a05,
};

export type MatriarchPose = 'idle' | 'claw' | 'bite' | 'gust' | 'breath' | 'summon' | 'roar' | 'dead';

/**
 * Ignara, the Ember Matriarch: an arena-scale renderer built from parts
 * (tail, hind legs, body, wings, neck, head, jaw) redrawn each frame from a
 * few pose parameters, rather than a character sheet scaled up. About ten
 * times the Leviathan's mass on screen; she faces the party (+x mirrored).
 */
export class MatriarchRenderer {
  readonly container: Phaser.GameObjects.Container;
  private back: Phaser.GameObjects.Graphics;
  private front: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Graphics;
  private t = 0;
  private pose: MatriarchPose = 'idle';
  private poseT = 0;
  private flash = 0;
  private lastFlashAt = -1;
  private deathT = 0;
  /** -1 faces left, 1 faces right (toward the party by default). */
  private facing = 1;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.container = scene.add.container(x, y);
    this.back = scene.add.graphics();
    this.front = scene.add.graphics();
    this.glow = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.container.add([this.back, this.front, this.glow]);
  }

  setPose(pose: MatriarchPose): void {
    if (this.pose === 'dead') return;
    this.pose = pose;
    this.poseT = 0;
  }

  face(dx: number): void {
    if (Math.abs(dx) > 8) this.facing = dx < 0 ? -1 : 1;
  }

  /** Brief red wash; a crowd hitting her every frame flashes at most every 0.6 s so she stays readable. */
  hit(): void {
    if (this.t - this.lastFlashAt < 0.6) return;
    this.lastFlashAt = this.t;
    this.flash = 0.14;
  }

  get dead(): boolean {
    return this.pose === 'dead';
  }

  update(dt: number): void {
    this.t += dt;
    this.poseT += dt;
    this.flash = Math.max(0, this.flash - dt);
    if (this.pose === 'dead') this.deathT = Math.min(1, this.deathT + dt / 2.6);
    else if (this.pose !== 'idle' && this.poseT > 1.2) this.pose = 'idle';
    this.draw();
  }

  /** A chunky pixel-art blob: an ellipse sampled on the art grid. */
  private blob(g: Phaser.GameObjects.Graphics, cx: number, cy: number, rx: number, ry: number, color: number, lit?: number): void {
    for (let y = -ry; y <= ry; y += PX) {
      const w = Math.round((rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)))) / PX) * PX;
      if (w <= 0) continue;
      g.fillStyle(color, 1);
      g.fillRect(Math.round((cx - w) / PX) * PX, Math.round((cy + y) / PX) * PX, w * 2, PX);
      if (lit !== undefined && y < -ry * 0.2) {
        g.fillStyle(lit, 1);
        g.fillRect(Math.round((cx - w * 0.7) / PX) * PX, Math.round((cy + y) / PX) * PX, Math.round(w * 0.6 / PX) * PX, PX);
      }
    }
  }

  private seg(g: Phaser.GameObjects.Graphics, pts: [number, number][], r0: number, r1: number, color: number, lit?: number): void {
    const n = pts.length - 1;
    for (let i = 0; i <= n * 4; i++) {
      const k = i / (n * 4);
      const j = Math.min(n - 1, Math.floor(k * n));
      const u = k * n - j;
      const x = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * u;
      const y = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * u;
      const r = r0 + (r1 - r0) * k;
      this.blob(g, x, y, r, r * 0.8, color, lit);
    }
  }

  private wing(g: Phaser.GameObjects.Graphics, side: number, lift: number): void {
    // Shoulder → elbow → fingertips; membrane polygons between the bones
    const s = side * this.facing;
    const sx = -20 * s, sy = -150;
    const ex = sx - 150 * s, ey = sy - 120 - lift * 90;
    const tips: [number, number][] = [
      [ex - 170 * s, ey + 40 - lift * 40], [ex - 120 * s, ey + 140 - lift * 20], [ex - 40 * s, ey + 190], [ex + 40 * s, ey + 170],
    ];
    g.fillStyle(C.wing, 0.96);
    g.fillPoints([new Phaser.Geom.Point(sx, sy), new Phaser.Geom.Point(ex, ey), ...tips.map(([x, y]) => new Phaser.Geom.Point(x, y)), new Phaser.Geom.Point(sx + 30 * s, sy + 90)], true);
    g.fillStyle(C.wingLit, 0.5);
    g.fillPoints([new Phaser.Geom.Point(ex, ey), new Phaser.Geom.Point(tips[0][0], tips[0][1]), new Phaser.Geom.Point(tips[1][0], tips[1][1])], true);
    g.lineStyle(PX, C.bone, 1);
    g.lineBetween(sx, sy, ex, ey);
    for (const [x, y] of tips) g.lineBetween(ex, ey, x, y);
    g.fillStyle(C.horn, 1);
    g.fillRect(ex - PX * 2, ey - PX * 3, PX * 3, PX * 3);
  }

  private draw(): void {
    const back = this.back, front = this.front, glow = this.glow;
    back.clear(); front.clear(); glow.clear();
    const f = this.facing;
    const breathe = Math.sin(this.t * 1.6);
    const p = Math.min(1, this.poseT / 0.5);
    const strike = this.pose === 'claw' || this.pose === 'bite' ? Math.sin(Math.min(1, this.poseT / 0.7) * Math.PI) : 0;
    const flap = this.pose === 'gust' ? Math.sin(this.poseT * 12) : Math.sin(this.t * 1.1) * 0.25;
    const sink = this.deathT * 70;
    const tilt = this.deathT;

    // Shadow under her
    back.fillStyle(0x000000, 0.4);
    back.fillEllipse(0, 20, 520, 150);

    // Tail sweeping behind
    const sway = Math.sin(this.t * 0.9) * 30;
    this.seg(back, [[-80 * f, -40 + sink], [-210 * f, 0 + sink], [-330 * f, -20 + sway + sink], [-420 * f, 30 + sway * 1.4 + sink]], 46, 10, C.scaleMid, C.scaleLit);

    // Wings (far wing behind the body)
    if (this.deathT < 0.6) this.wing(back, -1, flap * (1 - tilt));

    // Hind legs and body
    this.blob(back, -90 * f, -20 + sink, 60, 70, C.scaleDark);
    this.blob(back, 40 * f, -10 + sink, 55, 65, C.scaleDark);
    this.blob(back, 0, -110 + breathe * 4 + sink, 170, 110 + breathe * 3, C.scale, C.scaleLit);
    this.blob(back, 20 * f, -80 + breathe * 4 + sink, 110, 60, C.belly, C.bellyLit);
    // Dorsal spines
    for (let i = 0; i < 7; i++) {
      const x = (-130 + i * 40) * f;
      back.fillStyle(C.horn, 1);
      back.fillRect(x - PX, -215 + Math.abs(i - 3) * 8 + sink, PX * 3, PX * 6);
    }
    // Belly glow: the furnace inside
    glow.fillStyle(C.ember, 0.08 + 0.06 * (breathe + 1) / 2 + (this.pose === 'breath' ? 0.18 : 0));
    glow.fillEllipse(20 * f, -80 + sink, 150, 60);

    // Near wing
    if (this.deathT < 0.6) this.wing(front, 1, flap * (1 - tilt));

    // Fore claws: swipe forward on a claw strike
    const claw = this.pose === 'claw' ? strike : 0;
    this.blob(front, (110 + claw * 70) * f, -30 - claw * 30 + sink, 34, 44, C.scaleDark);
    for (let i = 0; i < 3; i++) {
      front.fillStyle(C.horn, 1);
      front.fillRect((120 + claw * 70 + i * 12) * f - PX, -2 - claw * 30 + sink, PX * 2, PX * 4);
    }

    // Neck and head: reared back for breath / roar, lunging for a bite
    const lunge = this.pose === 'bite' ? strike : 0;
    const rear = this.pose === 'breath' || this.pose === 'roar' || this.pose === 'summon' ? p : 0;
    const hx = (230 + lunge * 90 - rear * 40) * f;
    const hy = -260 + lunge * 90 - rear * 40 + Math.sin(this.t * 1.3) * 10 + sink * 1.4 + tilt * 120;
    this.seg(front, [[90 * f, -170 + sink], [150 * f, -240 + sink], [hx - 40 * f, hy + 10]], 52, 34, C.scale, C.scaleLit);
    // Head
    this.blob(front, hx, hy, 62, 40, C.scale, C.scaleLit);
    this.blob(front, hx + 50 * f, hy + 14, 44, 22, C.scaleMid);
    // Jaw opens for bite / breath / roar
    const jaw = this.pose === 'breath' || this.pose === 'roar' ? 0.6 + 0.4 * p : lunge;
    this.blob(front, hx + 44 * f, hy + 34 + jaw * 22, 40, 14, C.scaleDark);
    if (jaw > 0.1) {
      front.fillStyle(C.maw, 1);
      front.fillRect(Math.min(hx + 20 * f, hx + 80 * f), hy + 24, 60, jaw * 20);
      glow.fillStyle(C.ember, 0.4 + 0.4 * jaw);
      glow.fillEllipse(hx + 60 * f, hy + 30, 50, 16 * jaw + 4);
    }
    // Horns, crest and eyes
    for (const [dx, dy, len] of [[-30, -30, 70], [-5, -38, 55], [-55, -15, 45]] as const) {
      front.lineStyle(PX * 2, C.horn, 1);
      front.lineBetween(hx + dx * f, hy + dy, hx + (dx - len) * f, hy + dy - len * 0.7);
      front.lineStyle(PX, C.hornLit, 1);
      front.lineBetween(hx + dx * f, hy + dy - PX, hx + (dx - len * 0.6) * f, hy + dy - len * 0.45);
    }
    if (this.deathT < 0.5) {
      front.fillStyle(C.eye, 1);
      front.fillRect(hx + 18 * f - PX, hy - 12, PX * 3, PX * 2);
      glow.fillStyle(C.eye, 0.5);
      glow.fillEllipse(hx + 18 * f, hy - 10, 26, 12);
    }

    // Summon / roar: a heat ring pulses outward from her
    if (this.pose === 'summon' || this.pose === 'roar') {
      glow.lineStyle(PX, C.ember, Math.max(0, 0.7 - this.poseT * 0.6));
      glow.strokeEllipse(0, 0, 200 + this.poseT * 500, 80 + this.poseT * 200);
    }

    // Hit flash: a brief hot-red wash over her (no movement)
    if (this.flash > 0) {
      glow.fillStyle(0xff4d4d, (this.flash / 0.14) * 0.18);
      glow.fillEllipse(0, -120 + sink, 420, 260);
    }
    this.container.setAlpha(1 - Math.max(0, this.deathT - 0.85) * 2);
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
