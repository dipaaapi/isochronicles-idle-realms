import Phaser from 'phaser';
import { IsometricHelper, TILE_HEIGHT, TILE_WIDTH } from '../IsometricHelper';
import { useLoadProgress } from '../loadProgress';
import LAIR from '../../data/dragonsLair.json';
import { prepareCharacterSprites } from '../sprites/CharacterSprites';
import { LairExpedition } from './LairExpedition';

const W = LAIR.map.width;
const L = LAIR.map.length;
const hex = (v: string) => Number(v);

/** Deterministic per-tile noise so the cavern floor looks the same on every load. */
const noise = (x: number, y: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

const regionAt = (y: number) => LAIR.regions.find((r) => y >= r.from && y <= r.to) ?? LAIR.regions[0];

/**
 * The Dragon's Lair location: a dark 10×80 volcanic route with its own
 * camera bounds and lighting, no sky, weather or Demon Realm systems. The
 * expedition (LairExpedition) walks it once the character sheets are ready;
 * the camera follows the party until the player drags it.
 */
export class DragonsLairScene extends Phaser.Scene {
  private world!: Phaser.GameObjects.Container;
  private userZoom = LAIR.camera.startZoom;
  private dpr = 1;
  private expedition?: LairExpedition;
  /** Scene time of the last manual pan; the camera follows the party again after a pause. */
  private lastPanAt = -Infinity;

  constructor() {
    super('DragonsLairScene');
  }

  create(): void {
    this.dpr = (this.registry.get('dpr') as number | undefined) ?? 1;
    this.world = this.add.container(0, 0);
    this.drawFloor();
    this.drawEmbers();
    this.setupCamera();
    prepareCharacterSprites(this);

    useLoadProgress.getState().setSceneReady(true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => useLoadProgress.getState().setSceneReady(false));
  }

  private tile(x: number, y: number) {
    return IsometricHelper.gridToScreen(x, y);
  }

  private diamond(g: Phaser.GameObjects.Graphics, x: number, y: number, lift = 0): void {
    const c = this.tile(x, y);
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 2;
    g.fillPoints([
      new Phaser.Geom.Point(c.x, c.y - hh - lift),
      new Phaser.Geom.Point(c.x + hw, c.y - lift),
      new Phaser.Geom.Point(c.x, c.y + hh - lift),
      new Phaser.Geom.Point(c.x - hw, c.y - lift),
    ], true);
  }

  private drawFloor(): void {
    const g = this.add.graphics();
    this.world.add(g);
    // Walls: one raised rock rim on both long sides and behind the entrance / arena
    for (let y = -1; y <= L; y++) {
      for (const x of [-1, W]) {
        g.fillStyle(0x0c0a09, 1);
        this.diamond(g, x, y, -6);
        g.fillStyle(0x1c1917, 1);
        this.diamond(g, x, y, 14);
      }
    }
    for (let x = 0; x < W; x++) {
      for (const y of [-1, L]) {
        g.fillStyle(0x1c1917, 1);
        this.diamond(g, x, y, 14);
      }
    }
    // Floor, tinted per region with a little rock grain
    for (let y = 0; y < L; y++) {
      const region = regionAt(y);
      const floor = Phaser.Display.Color.ValueToColor(hex(region.floor));
      const accent = hex(region.accent);
      for (let x = 0; x < W; x++) {
        const n = noise(x, y);
        const shade = floor.clone().darken(Math.round(n * 12));
        g.fillStyle(shade.color, 1);
        this.diamond(g, x, y);
        if (n > 0.82) {
          const c = this.tile(x, y);
          g.fillStyle(accent, 0.8);
          g.fillRect(c.x - 6 + n * 8, c.y - 2, 6, 2);
        }
      }
    }
    // Region seams: a faint darker band where one cavern opens into the next
    for (const region of LAIR.regions.slice(1)) {
      g.fillStyle(0x000000, 0.25);
      for (let x = 0; x < W; x++) this.diamond(g, x, region.from);
    }
    // Entrance glow (Demon side) and the arena's ember-lit floor (dragon side)
    const ent = this.tile(LAIR.entrance.x, LAIR.entrance.y);
    const glow = this.add.graphics();
    glow.setBlendMode(Phaser.BlendModes.ADD);
    glow.fillStyle(0x7c3aed, 0.25);
    glow.fillEllipse(ent.x, ent.y, TILE_WIDTH * 4, TILE_HEIGHT * 4);
    const arena = this.tile(W / 2 - 0.5, L - 6);
    glow.fillStyle(0xf97316, 0.18);
    glow.fillEllipse(arena.x, arena.y, TILE_WIDTH * 9, TILE_HEIGHT * 9);
    this.world.add(glow);
  }

  /** Drifting embers: the lair's only ambient light. */
  private drawEmbers(): void {
    const colors = LAIR.embers.colors.map(hex);
    for (let i = 0; i < LAIR.embers.count; i++) {
      const p = this.tile(Math.random() * W, Math.random() * L);
      const ember = this.add.rectangle(p.x, p.y, 2, 2, colors[i % colors.length]).setBlendMode(Phaser.BlendModes.ADD);
      this.world.add(ember);
      this.tweens.add({
        targets: ember,
        y: p.y - 30 - Math.random() * 40,
        alpha: { from: 0.9, to: 0 },
        duration: 2200 + Math.random() * 2500,
        delay: Math.random() * 3000,
        repeat: -1,
      });
    }
  }

  private setupCamera(): void {
    const cam = this.cameras.main;
    // Bounds hug the route (plus its rock rim) so no empty space beyond the cavern shows
    const corners = [this.tile(-1, -1), this.tile(W, -1), this.tile(-1, L), this.tile(W, L)];
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    const pad = TILE_WIDTH;
    cam.setBounds(Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2);
    cam.setZoom(this.userZoom * this.dpr);
    const start = this.tile(LAIR.entrance.x, LAIR.entrance.y + 3);
    cam.centerOn(start.x, start.y);

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      this.lastPanAt = this.time.now;
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      this.userZoom = Phaser.Math.Clamp(this.userZoom * (dy > 0 ? 0.9 : 1.1), LAIR.camera.minZoom, LAIR.camera.maxZoom);
      cam.setZoom(this.userZoom * this.dpr);
    });
    const onResize = () => {
      this.dpr = (this.registry.get('dpr') as number | undefined) ?? this.dpr;
      cam.setZoom(this.userZoom * this.dpr);
    };
    this.scale.on('resize', onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', onResize));
  }

  update(_time: number, delta: number): void {
    // The party waits for its sprite sheets (a reload inside the lair bakes them first)
    if (!this.expedition) {
      const c = useLoadProgress.getState().tasks.characters;
      if (c.total > 0 && c.done >= c.total) this.expedition = new LairExpedition(this);
      return;
    }
    this.expedition.update(delta);
    if (this.time.now - this.lastPanAt > 3000) {
      const g = this.expedition.centroid();
      const p = this.tile(g.x, g.y);
      const cam = this.cameras.main;
      const mid = cam.midPoint;
      cam.centerOn(mid.x + (p.x - mid.x) * 0.05, mid.y + (p.y - mid.y) * 0.05);
    }
  }
}
