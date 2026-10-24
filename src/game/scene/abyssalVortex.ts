import Phaser from 'phaser';
import { IsometricHelper, TILE_WIDTH } from '../IsometricHelper';
import { VORTEX_SITE } from '../../state/buildingLayout';
import { WATER_DROP_WORLD } from '../PixelTileArt';

const SIZE = 256;

/** Spiral whirlpool art: a dark eye, deep-blue swirl and curling foam arms. */
function paintVortex(ctx: CanvasRenderingContext2D, arms: number, foam: number, seed: number): void {
  const c = SIZE / 2;
  if (seed === 0) {
    const deep = ctx.createRadialGradient(c, c, 4, c, c, c);
    deep.addColorStop(0, 'rgba(2,6,23,1)');
    deep.addColorStop(0.18, 'rgba(8,47,73,0.95)');
    deep.addColorStop(0.55, 'rgba(14,116,144,0.55)');
    deep.addColorStop(1, 'rgba(14,116,144,0)');
    ctx.fillStyle = deep;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
  // Logarithmic spiral arms of foam, thick at the rim, thinning into the eye
  for (let a = 0; a < arms; a++) {
    const phase = (a / arms) * Math.PI * 2 + seed;
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const t = i / 80;
      const r = c * (0.95 - t * 0.85);
      const ang = phase + t * Math.PI * 3.2;
      const x = c + Math.cos(ang) * r, y = c + Math.sin(ang) * r;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.strokeStyle = `rgba(224,242,254,${foam})`;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = `rgba(125,211,252,${foam * 0.7})`;
    ctx.lineWidth = 11;
    ctx.globalAlpha = 0.35;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // The eye
  const eye = ctx.createRadialGradient(c, c, 0, c, c, c * 0.16);
  eye.addColorStop(0, 'rgba(0,0,0,1)');
  eye.addColorStop(1, 'rgba(2,6,23,0)');
  ctx.fillStyle = eye;
  ctx.fillRect(0, 0, SIZE, SIZE);
}

function texture(scene: Phaser.Scene, key: string, arms: number, foam: number, seed: number): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, SIZE, SIZE);
  if (!tex) return key;
  paintVortex(tex.getContext(), arms, foam, seed);
  tex.refresh();
  return key;
}

/**
 * The Abyssal Vortex: a whirlpool spinning in the 5×5 open sea of the
 * southern corner (where the South Rift stood). The Leviathan surfaces from
 * its eye (WildFactionManager.rise). Two counter-rotating painted layers in a
 * flattened container, plus foam flecks spiralling in.
 */
export class AbyssalVortex {
  private root: Phaser.GameObjects.Container;
  private disc: Phaser.GameObjects.Container;
  private base: Phaser.GameObjects.Image;
  private arms: Phaser.GameObjects.Image;
  private flecks: { img: Phaser.GameObjects.Arc; a: number; r: number }[] = [];
  private t = 0;
  private radius: number;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Container) {
    const c = IsometricHelper.gridToScreen(VORTEX_SITE.center.x, VORTEX_SITE.center.y);
    // Spans about four of the five tiles across, so a ring of calm sea frames it
    this.radius = (VORTEX_SITE.area.w - 1) * TILE_WIDTH * 0.5;
    this.root = scene.add.container(c.x, c.y + WATER_DROP_WORLD);
    this.disc = scene.add.container(0, 0).setScale(1, 0.5);
    const scale = (this.radius * 2) / SIZE;
    this.base = scene.add.image(0, 0, texture(scene, 'vortex-base', 3, 0.55, 0)).setScale(scale);
    this.arms = scene.add.image(0, 0, texture(scene, 'vortex-arms', 5, 0.8, 1.3)).setScale(scale * 0.82).setBlendMode(Phaser.BlendModes.SCREEN);
    this.disc.add([this.base, this.arms]);
    for (let i = 0; i < 18; i++) {
      const f = scene.add.circle(0, 0, 1.6 + Math.random() * 1.4, 0xe0f2fe, 0.85);
      this.flecks.push({ img: f, a: Math.random() * Math.PI * 2, r: this.radius * (0.25 + Math.random() * 0.7) });
      this.disc.add(f);
    }
    this.root.add(this.disc);
    layer.add(this.root);
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.t += dt;
    this.base.rotation += dt * 0.6;
    this.arms.rotation -= dt * 0.25;
    this.arms.setAlpha(0.75 + 0.2 * Math.sin(this.t * 1.7));
    for (const f of this.flecks) {
      // Faster near the eye, drifting inward, reborn at the rim
      f.a += dt * (1.2 + (this.radius / Math.max(8, f.r)) * 0.6);
      f.r -= dt * 6;
      if (f.r < this.radius * 0.12) f.r = this.radius * (0.7 + Math.random() * 0.25);
      f.img.setPosition(Math.cos(f.a) * f.r, Math.sin(f.a) * f.r);
      f.img.setAlpha(Math.min(0.9, f.r / (this.radius * 0.4)));
    }
  }

  destroy(): void {
    this.root.destroy(true);
  }
}
