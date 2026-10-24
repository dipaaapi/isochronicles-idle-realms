import Phaser from 'phaser';

/** Painted at this many pixels per world unit (crisp under camera zoom), like Ignara's parts. */
const SS = 2;
const W = 150;
const BODY_H = 78;
const LID_H = 52;

type Ctx = CanvasRenderingContext2D;

function paint(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx) => void): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w * SS, h * SS);
  if (!tex) return key;
  const ctx = tex.getContext();
  ctx.scale(SS, SS);
  ctx.lineJoin = 'round';
  draw(ctx);
  tex.refresh();
  return key;
}

/** Vertical planks with grain, shaded top-lit. */
function planks(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  const n = 5;
  for (let i = 0; i < n; i++) {
    const px = x + (w / n) * i;
    const g = ctx.createLinearGradient(px, y, px + w / n, y);
    g.addColorStop(0, '#5b2f14');
    g.addColorStop(0.5, i % 2 ? '#7a4220' : '#8a4b24');
    g.addColorStop(1, '#4a250f');
    ctx.fillStyle = g;
    ctx.fillRect(px, y, w / n + 0.5, h);
    ctx.strokeStyle = 'rgba(30,12,4,0.45)';
    ctx.lineWidth = 0.8;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      const gx = px + 4 + k * (w / n - 8) / 2;
      ctx.moveTo(gx, y + 3);
      ctx.bezierCurveTo(gx + 2, y + h * 0.35, gx - 2, y + h * 0.65, gx + 1, y + h - 3);
      ctx.stroke();
    }
  }
  const shade = ctx.createLinearGradient(0, y, 0, y + h);
  shade.addColorStop(0, 'rgba(255,200,140,0.12)');
  shade.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = shade;
  ctx.fillRect(x, y, w, h);
}

/** A riveted iron band. */
function band(ctx: Ctx, x: number, y: number, w: number, h: number, vertical: boolean): void {
  const g = vertical ? ctx.createLinearGradient(x, 0, x + w, 0) : ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#9ca3af');
  g.addColorStop(0.45, '#4b5563');
  g.addColorStop(1, '#1f2937');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#e5e7eb';
  const n = vertical ? Math.max(2, Math.floor(h / 16)) : Math.max(2, Math.floor(w / 18));
  for (let i = 0; i < n; i++) {
    const rx = vertical ? x + w / 2 : x + 6 + ((w - 12) / (n - 1)) * i;
    const ry = vertical ? y + 6 + ((h - 12) / (n - 1)) * i : y + h / 2;
    ctx.beginPath();
    ctx.arc(rx, ry, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintBody(ctx: Ctx): void {
  planks(ctx, 0, 0, W, BODY_H);
  // Glowing gold heaped inside (seen once the lid is up)
  const gold = ctx.createLinearGradient(0, 0, 0, 14);
  gold.addColorStop(0, '#fde68a');
  gold.addColorStop(1, '#b45309');
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.moveTo(6, 10);
  for (let i = 0; i <= 12; i++) ctx.lineTo(6 + ((W - 12) / 12) * i, 4 + Math.sin(i * 1.7) * 3);
  ctx.lineTo(W - 6, 12);
  ctx.closePath();
  ctx.fill();
  band(ctx, 0, 0, W, 9, false);
  band(ctx, 0, BODY_H - 10, W, 10, false);
  band(ctx, 14, 0, 11, BODY_H, true);
  band(ctx, W - 25, 0, 11, BODY_H, true);
  // Gold lock plate with a keyhole
  const lock = ctx.createLinearGradient(W / 2 - 13, 0, W / 2 + 13, 0);
  lock.addColorStop(0, '#fde047');
  lock.addColorStop(0.5, '#f59e0b');
  lock.addColorStop(1, '#92400e');
  ctx.fillStyle = lock;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 13, 8);
  ctx.lineTo(W / 2 + 13, 8);
  ctx.lineTo(W / 2 + 11, 34);
  ctx.quadraticCurveTo(W / 2, 42, W / 2 - 11, 34);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = '#1c0a02';
  ctx.beginPath();
  ctx.arc(W / 2, 20, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(W / 2 - 1.4, 21, 2.8, 8);
  ctx.strokeStyle = '#1a0b03';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, BODY_H - 2);
}

function paintLid(ctx: Ctx): void {
  // Barrel lid: planks clipped to an arch
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, LID_H);
  ctx.lineTo(0, LID_H * 0.5);
  ctx.quadraticCurveTo(W / 2, -LID_H * 0.45, W, LID_H * 0.5);
  ctx.lineTo(W, LID_H);
  ctx.closePath();
  ctx.clip();
  planks(ctx, 0, 0, W, LID_H);
  const hi = ctx.createLinearGradient(0, 0, 0, LID_H);
  hi.addColorStop(0, 'rgba(255,220,170,0.28)');
  hi.addColorStop(0.6, 'rgba(0,0,0,0)');
  ctx.fillStyle = hi;
  ctx.fillRect(0, 0, W, LID_H);
  ctx.restore();
  band(ctx, 14, LID_H * 0.18, 11, LID_H * 0.82, true);
  band(ctx, W - 25, LID_H * 0.18, 11, LID_H * 0.82, true);
  band(ctx, 0, LID_H - 9, W, 9, false);
  ctx.strokeStyle = '#1a0b03';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(1, LID_H);
  ctx.lineTo(1, LID_H * 0.5);
  ctx.quadraticCurveTo(W / 2, -LID_H * 0.43, W - 1, LID_H * 0.5);
  ctx.lineTo(W - 1, LID_H);
  ctx.stroke();
}

function paintGlow(ctx: Ctx): void {
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(253,230,138,0.95)');
  g.addColorStop(0.4, 'rgba(251,191,36,0.45)');
  g.addColorStop(1, 'rgba(251,191,36,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
}

interface Coin { x: number; y: number; vx: number; vy: number; t: number; life: number; gem: number | null; spin: number }

/**
 * The hoard left where Ignara fell: the chest drops in with a bounce, its lid
 * flips open, light pours out and coins and gems fountain over the pile.
 * Purely visual (the reward is credited by slayDragon).
 */
export class TreasureChest {
  readonly container: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Image;
  private lid: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Ellipse;
  private gfx: Phaser.GameObjects.Graphics;
  private beams: Phaser.GameObjects.Graphics;
  private coins: Coin[] = [];
  private t = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    const body = paint(scene, 'lair-chest-body', W, BODY_H, paintBody);
    const lid = paint(scene, 'lair-chest-lid', W, LID_H, paintLid);
    const glow = paint(scene, 'lair-chest-glow', 128, 128, paintGlow);
    this.container = scene.add.container(x, y);
    this.shadow = scene.add.ellipse(0, 4, W * 1.25, 34, 0x000000, 0.5);
    this.beams = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.glow = scene.add.image(0, -BODY_H, glow).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setScale(2.4, 1.6);
    this.body = scene.add.image(0, 0, body).setOrigin(0.5, 1).setScale(1 / SS);
    // The lid hinges on its back edge: origin at its bottom
    this.lid = scene.add.image(0, -BODY_H, lid).setOrigin(0.5, 1).setScale(1 / SS);
    this.gfx = scene.add.graphics();
    this.container.add([this.shadow, this.beams, this.glow, this.body, this.lid, this.gfx]);
    this.container.setAlpha(0);
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    // Drop in from above with a bounce (0–0.7 s)
    const drop = Math.min(1, t / 0.45);
    const bounce = t < 0.45 ? 0 : Math.abs(Math.sin((t - 0.45) * 9)) * Math.max(0, 1 - (t - 0.45) / 0.35) * 18;
    const fall = (1 - drop * drop) * -260 - bounce;
    this.container.setAlpha(Math.min(1, t / 0.25));
    this.body.setY(fall);
    this.shadow.setScale(0.5 + drop * 0.5, 1).setAlpha(0.5 * drop);
    // The lid flips open (0.9–1.4 s): squashes to its hinge, then shows its inside upside-down above
    const open = Phaser.Math.Clamp((t - 0.9) / 0.5, 0, 1);
    const eased = 1 - Math.pow(1 - open, 3);
    this.lid.setY(-BODY_H + fall).setScale(1 / SS, (1 - eased * 1.7) / SS);
    if (open > 0.5) this.lid.setTint(0x8a6a50); else this.lid.clearTint();
    // Light pours out once it is open
    const lit = Phaser.Math.Clamp((t - 1.1) / 0.4, 0, 1);
    this.glow.setY(-BODY_H + fall).setAlpha(lit * (0.75 + 0.25 * Math.sin(t * 4)));
    const b = this.beams;
    b.clear();
    if (lit > 0) {
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.28 + Math.sin(t * 0.8 + i) * 0.05;
        const len = 150 + 30 * Math.sin(t * 2 + i * 1.3);
        const ox = (i - 2) * 16;
        b.fillStyle(0xfde68a, 0.12 * lit);
        b.beginPath();
        b.moveTo(ox - 10, -BODY_H + fall);
        b.lineTo(ox + 10, -BODY_H + fall);
        b.lineTo(ox + Math.cos(a) * len + 26, -BODY_H + fall + Math.sin(a) * len);
        b.lineTo(ox + Math.cos(a) * len - 26, -BODY_H + fall + Math.sin(a) * len);
        b.closePath();
        b.fillPath();
      }
    }
    // Coin and gem fountain, then a gentle trickle
    if (lit > 0) {
      const rate = t < 2.2 ? 40 : 8;
      const n = Math.floor(rate * dt + Math.random());
      for (let i = 0; i < n && this.coins.length < 140; i++) {
        const gem = Math.random() < 0.18 ? [0xef4444, 0x22d3ee, 0xa855f7, 0x34d399][Math.floor(Math.random() * 4)] : null;
        this.coins.push({ x: (Math.random() - 0.5) * 70, y: -BODY_H - 4, vx: (Math.random() - 0.5) * 170, vy: -170 - Math.random() * 170, t: 0, life: 1.3, gem, spin: Math.random() * 6 });
      }
    }
    const g = this.gfx;
    g.clear();
    for (const c of this.coins) {
      c.t += dt;
      c.x += c.vx * dt;
      c.vy += 520 * dt;
      c.y = Math.min(-4 + Math.random(), c.y + c.vy * dt);
      const a = Math.min(1, (c.life - c.t) / 0.4);
      const w = Math.abs(Math.cos(c.spin + t * 9));
      if (c.gem !== null) {
        g.fillStyle(c.gem, a);
        g.fillTriangle(c.x, c.y - 4, c.x + 3, c.y, c.x - 3, c.y);
        g.fillTriangle(c.x, c.y + 4, c.x + 3, c.y, c.x - 3, c.y);
        g.fillStyle(0xffffff, 0.8 * a);
        g.fillRect(c.x - 1, c.y - 2, 1, 1);
      } else {
        g.fillStyle(0xb45309, a);
        g.fillEllipse(c.x, c.y, 7 * w + 1.5, 7);
        g.fillStyle(0xfde047, a);
        g.fillEllipse(c.x, c.y - 0.5, 5 * w + 1, 5);
      }
    }
    this.coins = this.coins.filter((c) => c.t < c.life);
    // Sparkles twinkling over the hoard
    if (lit > 0) {
      for (let i = 0; i < 6; i++) {
        const k = (t * 1.3 + i * 0.37) % 1;
        const sx = Math.sin(i * 12.9) * 60, sy = -BODY_H - 10 - (i * 17) % 60;
        const s = Math.sin(k * Math.PI) * 5;
        g.fillStyle(0xffffff, 0.9 * Math.sin(k * Math.PI) * lit);
        g.fillRect(sx - s, sy - 0.5, s * 2, 1);
        g.fillRect(sx - 0.5, sy - s, 1, s * 2);
      }
    }
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
