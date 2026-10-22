import Phaser from 'phaser';
import { IsometricHelper } from '../IsometricHelper';
import { ART_PIXEL } from '../PixelTileArt';

type FloraKind = 'moss' | 'sprout' | 'bloom';

export interface RoadFloraTile {
  x: number;
  y: number;
  featured?: boolean;
}

const FRAME_W = 20;
const FRAME_H = 20;
const FRAME_COUNT = 8;
const TEXTURE_KEY = 'roadside-flora-pixels';

const PALETTES: Record<FloraKind, { dark: string; mid: string; light: string; accent: string }> = {
  moss: { dark: '#075b4b', mid: '#078665', light: '#20b987', accent: '#8de7a7' },
  sprout: { dark: '#075845', mid: '#0b8b5e', light: '#45c86f', accent: '#b3e76f' },
  bloom: { dark: '#075b4b', mid: '#0a9365', light: '#38c780', accent: '#f2cf73' },
};

/** Seeded, animated pixel plants that live on establishment-owned road tiles. */
export class RoadsideFlora {
  private readonly sprites: Phaser.GameObjects.Sprite[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Container,
  ) {
    this.prepareTexture();
  }

  refresh(roads: RoadFloraTile[], seed: number): void {
    this.sprites.forEach((sprite) => sprite.destroy());
    this.sprites.length = 0;

    const unique = new Map<string, RoadFloraTile>();
    for (const tile of roads) {
      const key = `${tile.x},${tile.y}`;
      const prior = unique.get(key);
      unique.set(key, { ...tile, featured: tile.featured || prior?.featured });
    }
    for (const tile of unique.values()) {
      const roll = this.hash(seed, tile.x, tile.y);
      // Sparse groups leave the stone path readable and keep the little plants decorative.
      if (!tile.featured && roll % 7 > 1) continue;
      const kinds: FloraKind[] = ['moss', 'sprout', 'bloom'];
      const kind = kinds[(roll >>> 8) % kinds.length];
      const pos = IsometricHelper.gridToScreen(tile.x, tile.y);
      const sprite = this.scene.add.sprite(pos.x, pos.y - 2, TEXTURE_KEY, `${kind}-0`);
      sprite.setOrigin(0.5, 0.85).setScale(ART_PIXEL).setDepth(-100);
      sprite.play(`roadside-${kind}`);
      this.layer.add(sprite);
      this.sprites.push(sprite);
    }
  }

  destroy(): void {
    this.sprites.forEach((sprite) => sprite.destroy());
    this.sprites.length = 0;
    for (const kind of ['moss', 'sprout', 'bloom'] as const) {
      const key = `roadside-${kind}`;
      if (this.scene.anims.exists(key)) this.scene.anims.remove(key);
    }
    if (this.scene.textures.exists(TEXTURE_KEY)) this.scene.textures.remove(TEXTURE_KEY);
  }

  private prepareTexture(): void {
    if (this.scene.textures.exists(TEXTURE_KEY)) this.scene.textures.remove(TEXTURE_KEY);
    const texture = this.scene.textures.createCanvas(TEXTURE_KEY, FRAME_W * FRAME_COUNT * 3, FRAME_H);
    if (!texture) return;
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    const kinds: FloraKind[] = ['moss', 'sprout', 'bloom'];
    kinds.forEach((kind, variant) => {
      for (let frame = 0; frame < FRAME_COUNT; frame++) {
        const ox = (variant * FRAME_COUNT + frame) * FRAME_W;
        texture.add(`${kind}-${frame}`, 0, ox, 0, FRAME_W, FRAME_H);
        this.paintFrame(texture.context, ox, kind, frame);
      }
      const animKey = `roadside-${kind}`;
      if (this.scene.anims.exists(animKey)) this.scene.anims.remove(animKey);
      this.scene.anims.create({
        key: animKey,
        frames: Array.from({ length: FRAME_COUNT }, (_, frame) => ({ key: TEXTURE_KEY, frame: `${kind}-${frame}` })),
        frameRate: 5,
        repeat: -1,
        yoyo: true,
      });
    });
    texture.refresh();
  }

  private paintFrame(context: CanvasRenderingContext2D, ox: number, kind: FloraKind, frame: number): void {
    const p = PALETTES[kind];
    const ctx = context;
    const sway = Math.round(Math.sin((frame / (FRAME_COUNT - 1)) * Math.PI * 2) * 1.2);
    const pixel = (x: number, y: number, color: string, w = 1, h = 1) => {
      ctx.fillStyle = color;
      ctx.fillRect(ox + x, y, w, h);
    };

    // Soft ground shadow, then layered rounded leaves with a gentle eight-frame sway.
    pixel(4, 15, '#123c35', 12, 2);
    pixel(5, 14, '#17483a', 10, 1);
    if (kind === 'sprout') {
      pixel(9, 11, p.dark, 3, 5);
      pixel(6 + sway, 9, p.mid, 6, 3);
      pixel(8 + sway, 6, p.light, 4, 4);
      pixel(9 + sway, 5, p.accent, 1, 1);
      pixel(5, 12, p.mid, 3, 2);
      pixel(12, 12, p.dark, 3, 2);
      return;
    }

    const swayLeft = Math.max(0, sway);
    const swayRight = Math.max(0, -sway);
    pixel(3 + swayLeft, 10, p.dark, 6, 4);
    pixel(7 + sway, 7, p.dark, 7, 7);
    pixel(12 - swayRight, 10, p.dark, 5, 4);
    pixel(4 + swayLeft, 9, p.mid, 6, 4);
    pixel(8 + sway, 6, p.mid, 7, 6);
    pixel(12 - swayRight, 9, p.mid, 4, 4);
    pixel(7 + sway, 5, p.light, 5, 4);
    pixel(9 + sway, 4, p.light, 3, 3);
    pixel(7 + sway, 5, p.accent, 2, 1);
    if (kind === 'bloom') {
      pixel(5 + swayLeft, 8, p.accent, 1, 1);
      pixel(13 - swayRight, 10, p.accent, 1, 1);
      pixel(10 + sway, 6, p.accent, 1, 1);
    } else {
      pixel(5 + swayLeft, 9, p.accent, 1, 1);
      pixel(13 - swayRight, 11, p.light, 1, 1);
    }
  }

  private hash(seed: number, x: number, y: number): number {
    let h = (seed ^ Math.imul(x + 1, 0x45d9f3b) ^ Math.imul(y + 1, 0x119de1f3)) | 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    return (h ^ (h >>> 16)) >>> 0;
  }
}
