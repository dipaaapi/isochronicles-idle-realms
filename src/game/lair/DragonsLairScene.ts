import Phaser from 'phaser';
import { IsometricHelper, TILE_HEIGHT, TILE_WIDTH } from '../IsometricHelper';
import { useLoadProgress } from '../loadProgress';
import { isWorldHeld } from '../../state/worldHold';
import LAIR from '../../data/dragonsLair.json';
import { prepareCharacterSprites } from '../sprites/CharacterSprites';
import { LairExpedition } from './LairExpedition';
import { soundFx } from '../audio/soundFx';
import { crispen, paintSpeleothem, roughen } from './caveArt';

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
  /** Screen points of the stalactite tips painted on the walls; water drips fall from them. */
  private drips: { x: number; y: number; floor: number }[] = [];

  constructor() {
    super('DragonsLairScene');
  }

  create(): void {
    this.dpr = (this.registry.get('dpr') as number | undefined) ?? 1;
    this.world = this.add.container(0, 0);
    this.drawFloor();
    this.drawSpeleothems();
    this.drawEmbers();
    this.startDrips();
    this.setupCamera();
    prepareCharacterSprites(this);
    // Demon Realm music stops; the lair has its own dark ambience (the battle switches to the boss theme)
    soundFx.playBackgroundMusic('NIGHT');
    soundFx.startCaveAmbience();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => soundFx.stopCaveAmbience());

    useLoadProgress.getState().setSceneReady(true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => useLoadProgress.getState().setSceneReady(false));
  }

  private tile(x: number, y: number) {
    return IsometricHelper.gridToScreen(x, y);
  }

  /** Region flavour painted onto its floor. */
  private static readonly DECOR: Record<string, 'bones' | 'crystals' | 'veins' | 'rubble' | 'roost' | 'gold'> = {
    ENTRANCE_SHELF: 'bones', BAT_GALLERIES: 'crystals', MAGMA_CHANNELS: 'veins', BROKEN_BRIDGES: 'rubble',
    KIN_ROOSTS: 'roost', GOLEM_GATE: 'veins', HOARD_ANTECHAMBER: 'gold', MATRIARCH_CHAMBER: 'gold',
  };

  /**
   * The cavern is painted once into a canvas texture: bevelled rock tiles
   * with cracks and pebbles, per-region decor (bones, crystals, glowing
   * fissures, rubble, nests, the hoard's gold), and tall jagged back walls
   * with stalactites. Light comes from additive glows on top.
   */
  private drawFloor(): void {
    const corners = [this.tile(-2, -2), this.tile(W + 1, -2), this.tile(-2, L + 1), this.tile(W + 1, L + 1)];
    const minX = Math.min(...corners.map((c) => c.x));
    const minY = Math.min(...corners.map((c) => c.y)) - 200;
    const w = Math.ceil(Math.max(...corners.map((c) => c.x)) - minX);
    const h = Math.ceil(Math.max(...corners.map((c) => c.y)) - minY);
    const key = 'lair-floor-rough';
    if (!this.textures.exists(key)) {
      const tex = this.textures.createCanvas(key, w, h);
      if (tex) {
        const ctx = tex.getContext();
        ctx.translate(-minX, -minY);
        this.paintCavern(ctx);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        roughen(ctx, w, h);
        tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
        tex.refresh();
      }
    }
    const img = this.add.image(minX, minY, key).setOrigin(0, 0);
    this.world.add(img);

    // Light: the Demon portal behind the party, the hoard and her furnace ahead, lava along the fissures
    const glowKey = (color: number) => {
      const key = `lair-glow-${color.toString(16)}`;
      if (this.textures.exists(key)) return key;
      const t = this.textures.createCanvas(key, 128, 128);
      if (t) {
        const c = t.getContext();
        const rgb = `${(color >> 16) & 255},${(color >> 8) & 255},${color & 255}`;
        const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, `rgba(${rgb},1)`);
        g.addColorStop(0.4, `rgba(${rgb},0.35)`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        c.fillStyle = g;
        c.fillRect(0, 0, 128, 128);
        t.refresh();
      }
      return key;
    };
    const glow = (gx: number, gy: number, color: number, sx: number, alpha: number, pulse = 0) => {
      const p = this.tile(gx, gy);
      const g = this.add.image(p.x, p.y, glowKey(color)).setBlendMode(Phaser.BlendModes.ADD).setScale(sx, sx * 0.5).setAlpha(alpha);
      this.world.add(g);
      if (pulse) this.tweens.add({ targets: g, alpha: alpha * (1 - pulse), duration: 1400 + Math.random() * 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    };
    glow(LAIR.entrance.x, LAIR.entrance.y, 0x7c3aed, 5, 0.5, 0.3);
    for (const region of LAIR.regions) {
      const decor = DragonsLairScene.DECOR[region.id];
      if (decor === 'veins') for (let y = region.from + 1; y <= region.to; y += 3) glow(1 + noise(y, 3) * 8, y, 0xf97316, 2.2, 0.28, 0.5);
      if (decor === 'crystals') for (let y = region.from + 1; y <= region.to; y += 4) glow(noise(y, 9) < 0.5 ? 0 : W - 1, y, 0xa855f7, 1.6, 0.3, 0.4);
      if (decor === 'gold') for (let y = region.from + 1; y <= region.to; y += 3) glow(1 + noise(y, 5) * 8, y, 0xfbbf24, 2, 0.18, 0.3);
    }
    glow(W / 2 - 0.5, L - 5, 0xf97316, 11, 0.32, 0.25);
  }

  private paintCavern(ctx: CanvasRenderingContext2D): void {
    const hw = TILE_WIDTH / 2, hh = TILE_HEIGHT / 2;
    const diamondPath = (x: number, y: number) => {
      const c = this.tile(x, y);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y - hh);
      ctx.lineTo(c.x + hw, c.y);
      ctx.lineTo(c.x, c.y + hh);
      ctx.lineTo(c.x - hw, c.y);
      ctx.closePath();
      return c;
    };
    const css = (v: number, k = 1) => {
      const r = Math.min(255, ((v >> 16) & 255) * k), g = Math.min(255, ((v >> 8) & 255) * k), b = Math.min(255, (v & 255) * k);
      return `rgb(${r | 0},${g | 0},${b | 0})`;
    };

    // Abyss under everything
    ctx.fillStyle = '#060404';
    ctx.fillRect(-1e4, -1e4, 2e4, 2e4);

    // Floor tiles: bevelled stone, each slightly different
    for (let y = 0; y < L; y++) {
      const region = regionAt(y);
      const floor = hex(region.floor);
      const accent = hex(region.accent);
      const decor = DragonsLairScene.DECOR[region.id];
      for (let x = 0; x < W; x++) {
        const n = noise(x, y), m = noise(y + 7, x + 3);
        const c = diamondPath(x, y);
        const k = 0.8 + n * 0.35;
        const g = ctx.createLinearGradient(c.x, c.y - hh, c.x, c.y + hh);
        g.addColorStop(0, css(floor, k * (1.05 + m * 0.2)));
        g.addColorStop(1, css(floor, k * (0.95 - m * 0.15)));
        ctx.fillStyle = g;
        ctx.fill();
        // Cracks
        if (n > 0.3) {
          ctx.strokeStyle = 'rgba(0,0,0,0.55)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(c.x - 30 + n * 14, c.y - 8 + m * 4);
          ctx.lineTo(c.x - 8 + m * 10, c.y + 2 - n * 3);
          ctx.lineTo(c.x + 6 - m * 6, c.y - 3 + n * 7);
          ctx.lineTo(c.x + 28 - n * 8, c.y + 4 - m * 6);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(255,214,180,0.07)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(c.x - 29 + n * 14, c.y - 9 + m * 4);
          ctx.lineTo(c.x - 7 + m * 10, c.y + 1 - n * 3);
          ctx.stroke();
        }
        // Raised rock lumps: lit crown, shadow under
        if (m > 0.62) {
          const lx = c.x + (n - 0.5) * hw, ly = c.y + (m - 0.8) * hh, r = 5 + n * 7;
          ctx.fillStyle = 'rgba(0,0,0,0.4)';
          ctx.beginPath();
          ctx.ellipse(lx + 2, ly + 2, r, r * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
          const lg = ctx.createRadialGradient(lx - r * 0.4, ly - r * 0.3, 0, lx, ly, r);
          lg.addColorStop(0, css(floor, 1.6));
          lg.addColorStop(1, css(floor, 0.7));
          ctx.fillStyle = lg;
          ctx.beginPath();
          ctx.ellipse(lx, ly, r, r * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // Seep puddles reflecting the ember light
        if (n < 0.07) {
          ctx.fillStyle = 'rgba(8,10,14,0.85)';
          ctx.beginPath();
          ctx.ellipse(c.x, c.y, 14, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(251,146,60,0.25)';
          ctx.beginPath();
          ctx.ellipse(c.x - 2, c.y - 1, 9, 2.5, 0, Math.PI * 1.1, Math.PI * 1.7);
          ctx.stroke();
        }
        // Pebbles
        for (let i = 0; i < 3; i++) {
          const px = c.x + (noise(x * 3 + i, y) - 0.5) * hw * 1.1, py = c.y + (noise(x, y * 3 + i) - 0.5) * hh * 1.0;
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.beginPath();
          ctx.ellipse(px + 1, py + 1, 2.4, 1.3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = css(accent, 1.1);
          ctx.beginPath();
          ctx.ellipse(px, py, 2.2, 1.2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        this.paintDecor(ctx, decor, c.x, c.y, n, m);
      }
    }
    // Large-scale variation so the route reads as one cavern floor, not a tile grid: soft light and dark patches,
    // darker toward the walls
    for (let y = -1; y <= L; y += 1.5) {
      for (let x = 0; x < W; x += 2.5) {
        const n = noise(x * 0.7 + 11, y * 0.7 + 5);
        const c = this.tile(x + noise(y, x) * 2, y);
        const r = 60 + n * 70;
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
        const tone = n > 0.5 ? '255,200,160' : '0,0,0';
        const a = n > 0.5 ? 0.05 : 0.22;
        g.addColorStop(0, `rgba(${tone},${a})`);
        g.addColorStop(1, `rgba(${tone},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2);
      }
    }
    for (let y = 0; y < L; y++) {
      for (const [x, a] of [[0, 0.35], [1, 0.15], [W - 1, 0.3], [W - 2, 0.12]] as const) {
        diamondPath(x, y);
        ctx.fillStyle = `rgba(0,0,0,${a})`;
        ctx.fill();
      }
    }
    // Region seams: a soft dark band where one cavern opens into the next
    for (const region of LAIR.regions.slice(1)) {
      for (let x = 0; x < W; x++) {
        diamondPath(x, region.from);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fill();
      }
    }
    this.paintWalls(ctx);
  }

  private paintDecor(ctx: CanvasRenderingContext2D, decor: string, cx: number, cy: number, n: number, m: number): void {
    if (decor === 'veins' && n > 0.35) {
      // Glowing fissure: dark crack with a molten core
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(cx - 22, cy - 3 + m * 4);
        ctx.quadraticCurveTo(cx - 4, cy + 6 * (n - 0.5), cx + 6, cy - 2);
        ctx.quadraticCurveTo(cx + 14, cy + 4, cx + 22, cy - 1 - m * 4);
      };
      path();
      ctx.strokeStyle = '#1a0503';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.save();
      ctx.shadowColor = '#f97316';
      ctx.shadowBlur = 8;
      path();
      ctx.strokeStyle = '#fb923c';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();
    } else if (decor === 'crystals' && n > 0.72) {
      // A cluster of violet shards
      for (let i = 0; i < 3; i++) {
        const x = cx - 8 + i * 7, hgt = 10 + noise(i, n * 99) * 12;
        ctx.beginPath();
        ctx.moveTo(x - 3, cy);
        ctx.lineTo(x + (i - 1) * 2, cy - hgt);
        ctx.lineTo(x + 3, cy);
        ctx.closePath();
        const g = ctx.createLinearGradient(x, cy - hgt, x, cy);
        g.addColorStop(0, '#f0abfc');
        g.addColorStop(1, '#6b21a8');
        ctx.fillStyle = g;
        ctx.fill();
      }
    } else if (decor === 'bones' && n > 0.8) {
      ctx.strokeStyle = '#d6cfc4';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(cx - 9, cy - 2);
      ctx.lineTo(cx + 9, cy + 3);
      ctx.stroke();
      for (const [x, y] of [[cx - 9, cy - 2], [cx + 9, cy + 3]]) {
        ctx.fillStyle = '#e7e0d4';
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (m > 0.6) {
        // A skull
        ctx.fillStyle = '#e7e0d4';
        ctx.beginPath();
        ctx.ellipse(cx + 12, cy - 6, 5, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1c1917';
        ctx.fillRect(cx + 9, cy - 7, 2, 2);
        ctx.fillRect(cx + 13, cy - 7, 2, 2);
      }
    } else if (decor === 'rubble' && n > 0.6) {
      for (let i = 0; i < 3; i++) {
        const x = cx - 10 + i * 9, y = cy - 2 + (i % 2) * 4, r = 3 + noise(i, m * 50) * 4;
        const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, 0, x, y, r);
        g.addColorStop(0, '#8a817a');
        g.addColorStop(1, '#2a2522');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (decor === 'roost' && n > 0.7) {
      // Scorched nest of twigs with an ember-red egg
      ctx.strokeStyle = '#3f2a1c';
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 12, cy + Math.sin(a) * 4);
        ctx.lineTo(cx - Math.cos(a) * 12, cy - Math.sin(a) * 4);
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(cx - 1, cy - 6, 0, cx, cy - 4, 5);
      g.addColorStop(0, '#fca5a5');
      g.addColorStop(1, '#7f1d1d');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy - 4, 4, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (decor === 'gold' && n > 0.3) {
      // Coins and the odd gem
      const count = 3 + Math.floor(n * 6);
      for (let i = 0; i < count; i++) {
        const x = cx + (noise(i, n * 37) - 0.5) * 34, y = cy + (noise(n * 53, i) - 0.5) * 14;
        ctx.fillStyle = '#7c4a03';
        ctx.beginPath();
        ctx.ellipse(x, y + 0.8, 3, 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = noise(i, m) > 0.5 ? '#fbbf24' : '#f59e0b';
        ctx.beginPath();
        ctx.ellipse(x, y, 3, 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (m > 0.75) {
        ctx.fillStyle = m > 0.88 ? '#ef4444' : '#22d3ee';
        ctx.beginPath();
        ctx.moveTo(cx + 6, cy - 7);
        ctx.lineTo(cx + 10, cy - 3);
        ctx.lineTo(cx + 6, cy + 1);
        ctx.lineTo(cx + 2, cy - 3);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  /** Tall back walls (upper-left and upper-right edges) with stalactite teeth; a low lip on the near edges. */
  private paintWalls(ctx: CanvasRenderingContext2D): void {
    const face = (ax: number, ay: number, bx: number, by: number, height: number, lit: boolean, seed: number) => {
      // Jagged top line from a to b
      const steps = 12;
      const top: [number, number][] = [];
      for (let i = 0; i <= steps; i++) {
        const k = i / steps;
        const jag = (noise(seed * 13 + i, seed) - 0.5) * height * 0.45 + (i % 2 ? 6 : -4) * noise(i, seed * 3);
        top.push([ax + (bx - ax) * k, ay + (by - ay) * k - height - jag]);
      }
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      for (const [x, y] of top) ctx.lineTo(x, y);
      ctx.lineTo(bx, by);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, ay - height, 0, ay);
      g.addColorStop(0, lit ? '#4a3c35' : '#3a2f2a');
      g.addColorStop(0.6, lit ? '#2a201c' : '#201814');
      g.addColorStop(1, '#0b0807');
      ctx.fillStyle = g;
      ctx.fill();
      // Strata lines and a rim of light on the jagged crest
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      for (let s = 0.3; s < 1; s += 0.25) {
        ctx.beginPath();
        ctx.moveTo(ax, ay - height * s);
        ctx.lineTo(bx, by - height * s + (noise(seed, s * 10) - 0.5) * 6);
        ctx.stroke();
      }
      ctx.beginPath();
      for (const [i, [x, y]] of top.entries()) (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.strokeStyle = 'rgba(251,146,60,0.22)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };
    // Back walls: along x = -1 (upper-left) and y = -1 (upper-right)
    for (let y = -1; y <= L; y++) {
      const a = this.tile(-0.5, y - 0.5), b = this.tile(-0.5, y + 0.5);
      face(a.x, a.y, b.x, b.y, 120 + noise(y, 1) * 50, false, y + 100);
    }
    for (let x = -1; x <= W; x++) {
      const a = this.tile(x - 0.5, -0.5), b = this.tile(x + 0.5, -0.5);
      face(a.x, a.y, b.x, b.y, 135 + noise(x, 5) * 40, true, x + 300);
    }
    // Stalactites: the cavern roof meets the walls and hangs down over them in long dripping teeth
    const hang = (gx: number, gy: number, crest: number, seed: number) => {
      const p = this.tile(gx, gy);
      const len = 50 + noise(seed, 4) * 80, wid = 14 + noise(seed, 6) * 14;
      const top = p.y - crest;
      ctx.save();
      ctx.translate(p.x - wid / 2, top - 4);
      paintSpeleothem(ctx, wid, len, 'tite', seed);
      ctx.restore();
      this.drips.push({ x: p.x, y: top - 4 + len, floor: p.y });
    };
    for (let y = -1; y <= L; y += 0.5) if (noise(y * 2, 2) > 0.35) hang(-0.5, y, 125 + noise(y, 1) * 30, y * 2 + 500);
    for (let x = -1; x <= W; x += 0.5) if (noise(x * 2, 7) > 0.35) hang(x, -0.5, 140 + noise(x, 5) * 30, x * 2 + 800);
    // Near edges: a low broken lip so units in front stay visible
    const lip = (ax: number, ay: number, bx: number, by: number) => {
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx, by + 18);
      ctx.lineTo(ax, ay + 18);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, ay, 0, ay + 18);
      g.addColorStop(0, '#2b2320');
      g.addColorStop(1, '#070505');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,200,160,0.12)';
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    };
    for (let y = 0; y < L; y++) {
      const a = this.tile(W - 0.5, y - 0.5), b = this.tile(W - 0.5, y + 0.5);
      lip(a.x, a.y, b.x, b.y);
    }
    for (let x = 0; x < W; x++) {
      const a = this.tile(x - 0.5, L - 0.5), b = this.tile(x + 0.5, L - 0.5);
      lip(a.x, a.y, b.x, b.y);
    }
    // Side tunnels into the chamber, where the human expedition breaks in
    for (const b of LAIR.threeWay.breaches) {
      const p = this.tile(b.x < W / 2 ? -0.5 : W - 0.5, b.y);
      const g = ctx.createRadialGradient(p.x, p.y - 20, 2, p.x, p.y - 20, 34);
      g.addColorStop(0, 'rgba(0,0,0,0.95)');
      g.addColorStop(0.7, 'rgba(10,6,5,0.8)');
      g.addColorStop(1, 'rgba(10,6,5,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 20, 24, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(125,211,252,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 20, 22, 28, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
  }

  /**
   * Stalagmites rise along both walls and the back of the cavern, depth-sorted
   * with the units so the party walks behind the near ones. They stand only
   * off the route (wall bases and the near lip), never on a walkable tile.
   */
  private drawSpeleothems(): void {
    const variants = 6;
    const key = (i: number) => 'lair-mite-' + i;
    for (let i = 0; i < variants; i++) {
      if (this.textures.exists(key(i))) continue;
      // A main column with smaller spires grown against it
      const w = 18 + i * 6, h = 30 + i * 13;
      const tex = this.textures.createCanvas(key(i), w * 2, h);
      if (!tex) continue;
      const ctx = tex.getContext();
      const kids = i < 2 ? 1 : 2;
      for (let j = 0; j < kids; j++) {
        const kw = w * (0.45 + noise(i, j) * 0.2), kh = h * (0.3 + noise(j, i) * 0.3);
        ctx.save();
        ctx.translate(j ? w * 1.15 : w * 0.05, h - kh);
        paintSpeleothem(ctx, kw, kh, 'mite', i * 31 + j * 7 + 11);
        ctx.restore();
      }
      ctx.save();
      ctx.translate(w * 0.5, 0);
      paintSpeleothem(ctx, w, h, 'mite', i * 17 + 3);
      ctx.restore();
      crispen(ctx, w * 2, h);
      tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
      tex.refresh();
    }
    const breachRows = LAIR.threeWay.breaches.map((b) => b.y);
    const stand = (gx: number, gy: number, size: number, seed: number) => {
      if (breachRows.some((by) => Math.abs(by - gy) < 2.5) && (gx < 0 || gx > W - 1)) return;
      const p = this.tile(gx, gy);
      const v = Math.max(0, Math.min(variants - 1, Math.round(size)));
      this.add.ellipse(p.x, p.y, 16 + v * 6, 6 + v * 2, 0x000000, 0.45).setDepth(5);
      this.add.image(p.x, p.y + 2, key(v)).setOrigin(0.5, 1).setFlipX(noise(seed, 1) > 0.5).setDepth(10 + p.y);
    };
    for (let y = 0; y < L; y += 1) {
      // Back-left wall base: tall columns; near-right lip: short ones so units stay visible
      if (noise(y, 21) > 0.5) stand(-0.55 - noise(y, 22) * 0.3, y + noise(y, 23) - 0.5, 2 + noise(y, 24) * 4, y);
      if (noise(y, 25) > 0.7) stand(W - 0.35 + noise(y, 26) * 0.3, y + noise(y, 27) - 0.5, noise(y, 28) * 2, y + 900);
    }
    for (let x = 0; x < W; x += 1) {
      if (noise(x, 31) > 0.45) stand(x + noise(x, 32) - 0.5, -0.6 - noise(x, 33) * 0.3, 2 + noise(x, 34) * 4, x + 400);
    }
  }

  /** Water drips fall from the stalactite tips and splash at the wall's foot. */
  private startDrips(): void {
    if (!this.drips.length) return;
    this.time.addEvent({
      delay: 420,
      loop: true,
      callback: () => {
        if (isWorldHeld()) return;
        const d = this.drips[Math.floor(Math.random() * this.drips.length)];
        const drop = this.add.ellipse(d.x, d.y, 2, 3, 0xbfdbfe, 0.85).setDepth(10 + d.floor - 1);
        this.tweens.add({
          targets: drop, y: d.floor - 2, duration: 260 + (d.floor - d.y) * 2.2, ease: 'Quad.easeIn',
          onComplete: () => {
            drop.destroy();
            const ring = this.add.ellipse(d.x, d.floor - 2, 3, 1.5).setStrokeStyle(1, 0xbfdbfe, 0.7).setDepth(5);
            this.tweens.add({ targets: ring, scaleX: 4, scaleY: 4, alpha: 0, duration: 520, onComplete: () => ring.destroy() });
          },
        });
      },
    });
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
    if (isWorldHeld()) return;
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
