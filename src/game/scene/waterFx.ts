import Phaser from 'phaser';
import { Navigation } from '../Navigation';
import { ART_PIXEL, WATER_DROP_WORLD } from '../PixelTileArt';
import { BRIDGE_TILES, GRID_SIZE, isCanalTile, isWaterTile } from '../../state/buildingLayout';

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

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Container) {
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
      });
    }
  }

  update(timeMs: number): void {
    const g = this.falls;
    g.clear();
    const t = timeMs / 1000;
    for (const s of this.streams) {
      // Faint sheet behind the drops
      g.fillStyle(0x60a5fa, 0.16);
      g.fillRect(s.x - ART_PIXEL, s.y, ART_PIXEL * 2, s.length);
      // Lip foam where the water tips over
      g.fillStyle(0xe0f2fe, 0.75);
      g.fillRect(s.x - ART_PIXEL, snap(s.y), ART_PIXEL * 2, ART_PIXEL);
      for (let i = 0; i < DROPS_PER_STREAM; i++) {
        const d = (s.phase + t * s.speed + (i * s.length) / DROPS_PER_STREAM) % s.length;
        const fade = 1 - d / s.length;
        const streak = ART_PIXEL * (2 + Math.floor(d / 22));
        g.fillStyle(s.shade > 0.5 ? 0x93c5fd : 0xbfdbfe, 0.25 + fade * 0.6);
        g.fillRect(s.x - ART_PIXEL / 2, snap(s.y + d), ART_PIXEL, streak);
      }
      // Mist where it breaks up
      const puff = (Math.sin(t * 2 + s.phase) + 1) / 2;
      g.fillStyle(0xe0f2fe, 0.1 + puff * 0.12);
      g.fillRect(s.x - ART_PIXEL * 2, snap(s.y + s.length - 6), ART_PIXEL * 4, ART_PIXEL * 2);
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
    this.bridges.destroy();
  }
}
