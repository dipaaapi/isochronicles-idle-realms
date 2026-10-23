import Phaser from 'phaser';
import { IsometricHelper, TILE_HEIGHT, TILE_WIDTH } from '../IsometricHelper';
import { VOLCANO_SITE, rectCenter } from '../../state/buildingLayout';
import { useGameStore } from '../../state/useGameStore';
import { createStructureSprite, isStructureReady, playStructureAnim } from '../sprites/StructureSprites';
import LAIR from '../../data/dragonsLair.json';

/** One art pixel in world units (chunky pixel art like the tiles). */
const PX = 3;
const ROCK = { lit: 0x57534e, mid: 0x44403c, shade: 0x292524, deep: 0x1c1917, ash: 0x78716c };

/**
 * The northern volcano that replaced the North Rift: a permanent landmark
 * on its corner footprint, drawn from the baked HD voxel strip ('volcano' in
 * structureModels.ts) once it is ready (the vector drawing below stands in
 * until then). Its state counts the waves to the next cave opening
 * (stage1…stage4), roars 'open' while the cave is open, 'erupt's before a
 * magma flow and goes 'dormant' while Ignara is slain. Its cave mouth faces the
 * island; while the cave is open (every 5th repelled wave, until the dragon
 * raid ends) the crater and mouth glow and smoke pours out. Fixed in place:
 * nothing here ever moves the container.
 */
export class VolcanoLandmark {
  private container: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Graphics;
  private smoke: { x: number; y: number; r: number; life: number; max: number }[] = [];
  private smokeGfx: Phaser.GameObjects.Graphics;
  private sprite?: Phaser.GameObjects.Sprite;
  private open: boolean | null = null;
  private elapsed = 0;
  private puffTimer = 0;
  /** Seconds left of a magma rumble: heavy smoke, a brighter crater. */
  private rumbleLeft = 0;
  /** Cone size in world units (base sits on the footprint's front edge). */
  private readonly baseW = TILE_WIDTH * 3.1;
  private readonly height = TILE_HEIGHT * 4.3;
  private readonly baseY = TILE_HEIGHT * 0.9;

  constructor(private scene: Phaser.Scene, layer: Phaser.GameObjects.Container) {
    const c = rectCenter(VOLCANO_SITE.footprint);
    const pos = IsometricHelper.gridToScreen(c.x, c.y);
    this.container = scene.add.container(pos.x, pos.y);
    this.body = scene.add.graphics();
    this.glow = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.smokeGfx = scene.add.graphics();
    this.container.add([this.body, this.glow, this.smokeGfx]);
    layer.add(this.container);
    this.drawBody();
  }

  /** Cone half-width at a height above the base (0 = base). */
  private halfWidthAt(h: number): number {
    const t = h / this.height;
    const top = this.baseW * 0.16;
    return top + (this.baseW / 2 - top) * Math.pow(1 - t, 0.85);
  }

  private drawBody(): void {
    const g = this.body;
    g.clear();
    // Ground shadow over the footprint
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(0, this.baseY - 4, this.baseW * 1.05, TILE_HEIGHT * 1.6);
    // Stepped cone, one art pixel row at a time: lit left flank, shaded right flank, ash bands
    for (let h = 0; h < this.height; h += PX) {
      const y = this.baseY - h;
      const hw = Math.round(this.halfWidthAt(h) / PX) * PX;
      // Each flank has its own crags (a lumpy shoulder low on the left), so the cone never reads as a triangle
      const left = Math.round((Math.sin(h * 0.19) * 5 + Math.sin(h * 0.053) * 7 + (h < this.height * 0.45 ? 10 * Math.sin((h / (this.height * 0.45)) * Math.PI) : 0)) / PX) * PX;
      const right = Math.round((Math.sin(h * 0.23 + 2) * 5 + Math.sin(h * 0.041 + 1) * 6) / PX) * PX;
      const x0 = -hw - left, x1 = hw + right;
      // Strata wander instead of running in straight stripes
      const band = Math.floor((h + Math.sin(h * 0.06) * 10) / (PX * 10)) % 2 === 0;
      g.fillStyle(band ? ROCK.mid : ROCK.shade, 1);
      g.fillRect(x0, y - PX, x1 - x0, PX);
      g.fillStyle(band ? ROCK.lit : ROCK.mid, 1);
      g.fillRect(x0, y - PX, Math.round(((x1 - x0) * 0.32) / PX) * PX, PX);
      g.fillStyle(ROCK.deep, 1);
      g.fillRect(x1 - Math.round(((x1 - x0) * 0.16) / PX) * PX, y - PX, Math.round(((x1 - x0) * 0.16) / PX) * PX, PX);
      // Snow-pale ash near the rim
      if (h > this.height * 0.82) {
        g.fillStyle(ROCK.ash, 1);
        g.fillRect(x0, y - PX, PX * 2, PX);
      }
    }
    // Boulders around the foot
    for (const [bx, by, bw] of [[-0.46, -2, 7], [-0.36, 2, 5], [0.42, -1, 6], [0.3, 3, 4], [-0.15, 4, 4]] as const) {
      const x = Math.round((bx * this.baseW) / PX) * PX;
      g.fillStyle(ROCK.shade, 1);
      g.fillRect(x, this.baseY + by * PX - bw * PX, bw * PX, bw * PX * 0.7);
      g.fillStyle(ROCK.lit, 1);
      g.fillRect(x, this.baseY + by * PX - bw * PX, bw * PX * 0.6, PX);
    }
    // Crater rim
    const topY = this.baseY - this.height;
    const rimW = this.halfWidthAt(this.height) * 2;
    g.fillStyle(ROCK.deep, 1);
    g.fillEllipse(0, topY + PX, rimW, PX * 4);
    // Ridges running down the face
    g.fillStyle(ROCK.shade, 1);
    for (const sx of [-0.45, 0.2, 0.62]) {
      for (let h = this.height * 0.15; h < this.height * 0.85; h += PX) {
        const hw = this.halfWidthAt(h);
        g.fillRect(Math.round((sx * hw) / PX) * PX, this.baseY - h, PX, PX);
      }
    }
    // Cave mouth: a dark arch at the foot, facing the island
    const mouthW = PX * 10;
    const mouthH = PX * 9;
    g.fillStyle(ROCK.deep, 1);
    g.fillRect(-mouthW / 2 - PX, this.baseY - mouthH - PX, mouthW + PX * 2, mouthH + PX);
    g.fillStyle(0x0c0a09, 1);
    g.fillRect(-mouthW / 2, this.baseY - mouthH, mouthW, mouthH);
    g.fillRect(-mouthW / 2 + PX * 2, this.baseY - mouthH - PX * 2, mouthW - PX * 4, PX * 2);
    // Stone lintel blocks
    g.fillStyle(ROCK.ash, 1);
    for (let i = -2; i <= 2; i++) g.fillRect(i * PX * 2 - PX, this.baseY - mouthH - PX * 3, PX * 2 - 1, PX);
  }

  /** Crater, lava seams and the cave mouth: dim embers when sealed, roaring orange when open. */
  private drawGlow(open: boolean): void {
    const g = this.glow;
    g.clear();
    const t = this.elapsed;
    const pulse = 0.5 + 0.5 * Math.sin(t * (open ? 3.2 : 1.2));
    const topY = this.baseY - this.height;
    const rimW = this.halfWidthAt(this.height) * 2;
    g.fillStyle(open ? 0xf97316 : 0x7f1d1d, open ? 0.55 + 0.3 * pulse : 0.25 + 0.15 * pulse);
    g.fillEllipse(0, topY + PX, rimW * 0.8, PX * 3);
    if (open) {
      g.fillStyle(0xfde047, 0.35 + 0.35 * pulse);
      g.fillEllipse(0, topY + PX, rimW * 0.4, PX * 2);
      // Lava seams trickling down the front
      for (const [sx, len] of [[-0.18, 0.35], [0.12, 0.5], [0.34, 0.22]] as const) {
        for (let h = this.height * (1 - len); h < this.height; h += PX) {
          const hw = this.halfWidthAt(h);
          const a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 4 + h * 0.15));
          g.fillStyle(0xf97316, a);
          g.fillRect(Math.round((sx * hw) / PX) * PX, this.baseY - h, PX, PX);
        }
      }
      // The mouth breathes firelight
      g.fillStyle(0xea580c, 0.45 + 0.4 * pulse);
      g.fillRect(-PX * 4, this.baseY - PX * 7, PX * 8, PX * 7);
      g.fillStyle(0xfbbf24, 0.25 + 0.35 * pulse);
      g.fillRect(-PX * 2, this.baseY - PX * 5, PX * 4, PX * 5);
      g.fillStyle(0xf97316, 0.12 + 0.1 * pulse);
      g.fillEllipse(0, this.baseY + PX * 2, PX * 26, PX * 8);
    } else {
      // Sealed: rubble plugs the mouth, a faint red seam shows between the stones
      g.fillStyle(0x7f1d1d, 0.2 + 0.15 * pulse);
      g.fillRect(-PX * 3, this.baseY - PX * 2, PX * 6, PX);
    }
  }

  /** Rubble over the sealed mouth (redrawn only when the state flips). */
  private drawSeal(open: boolean): void {
    if (open) return;
    const g = this.body;
    g.fillStyle(ROCK.mid, 1);
    for (const [x, y, w, h] of [[-5, -3, 4, 3], [-1, -4, 5, 4], [3, -3, 3, 3], [-4, -7, 3, 3], [0, -8, 4, 4], [-2, -6, 3, 2]]) {
      g.fillRect(x * PX, this.baseY + y * PX, w * PX, h * PX);
    }
    g.fillStyle(ROCK.lit, 1);
    g.fillRect(-PX * 4, this.baseY - PX * 7, PX * 2, PX);
    g.fillRect(PX, this.baseY - PX * 8, PX * 2, PX);
  }

  private updateSmoke(dt: number, open: boolean): void {
    this.puffTimer -= dt;
    if (this.puffTimer <= 0) {
      this.puffTimer = open ? 0.25 : 1.1;
      this.smoke.push({ x: (Math.random() - 0.5) * 14, y: this.baseY - this.height, r: PX * 2, life: 0, max: open ? 3.2 : 4.5 });
    }
    const g = this.smokeGfx;
    g.clear();
    for (const p of this.smoke) {
      p.life += dt;
      p.y -= dt * (open ? 22 : 10);
      p.x += dt * 6;
      p.r += dt * 4;
      const k = 1 - p.life / p.max;
      g.fillStyle(open ? 0x57534e : 0x78716c, Math.max(0, k) * 0.55);
      g.fillCircle(Math.round(p.x / PX) * PX, Math.round(p.y / PX) * PX, p.r);
    }
    this.smoke = this.smoke.filter((p) => p.life < p.max);
  }

  /** The volcano heaves before a magma flow (scene/volcanicMagma.ts). */
  erupt(seconds: number): void {
    this.rumbleLeft = Math.max(this.rumbleLeft, seconds + 2);
  }

  /** The baked state for the realm right now. */
  private stateName(): string {
    const s = useGameStore.getState();
    if (this.rumbleLeft > 0) return 'erupt';
    if (s.lairOpen) return 'open';
    if (s.dragon.slain) return 'dormant';
    // Waves cleared since the last opening: 1 → stage1 … 4 → stage4
    const since = Math.max(0, s.invasion.waveNumber - 1) % LAIR.cave.everyWaves;
    return `stage${Math.max(1, Math.min(4, since))}`;
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.elapsed += dt;
    this.rumbleLeft = Math.max(0, this.rumbleLeft - dt);
    // The HD strip takes over from the vector stand-in as soon as it is baked
    if (!this.sprite && isStructureReady(this.scene, 'volcano')) {
      this.sprite = createStructureSprite(this.scene, 'volcano', this.stateName()) ?? undefined;
      if (this.sprite) {
        // The mountain towers over its corner: a little larger than a building of its footprint
        this.sprite.setScale(this.sprite.scaleX * 1.3);
        this.container.add(this.sprite);
        this.body.setVisible(false);
        this.glow.setVisible(false);
        this.smokeGfx.setVisible(false);
      }
    }
    if (this.sprite) {
      playStructureAnim(this.sprite, this.stateName());
      return;
    }
    const open = useGameStore.getState().lairOpen;
    if (open !== this.open) {
      this.open = open;
      this.drawBody();
      this.drawSeal(open);
    }
    // A rumble roars like an open cave even while it is sealed
    this.drawGlow(open || this.rumbleLeft > 0);
    this.updateSmoke(dt, open || this.rumbleLeft > 0);
  }

  /** True when an island-local point falls on the mountain (clicks enter the cave). */
  contains(localX: number, localY: number): boolean {
    const x = localX - this.container.x;
    const y = localY - this.container.y;
    const h = this.baseY - y;
    if (h < -PX * 4 || h > this.height) return false;
    return Math.abs(x) <= this.halfWidthAt(Math.max(0, h));
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
