import Phaser from 'phaser';
import { TILE_HEIGHT, TILE_WIDTH } from '../IsometricHelper';

/**
 * Painted magma tiles (Canvas2D, cached in the texture manager). A tile's
 * edge toward a neighbouring magma tile runs straight into it, an open edge
 * is pulled in with lobes, so a flow reads as one river instead of square
 * planks. ACTIVE magma has two shimmer variants that the scene crossfades.
 */
export type MagmaLook = 'ACTIVE' | 'CRUST' | 'BASALT';

/** Neighbour bits: 1 = (x, y-1), 2 = (x+1, y), 4 = (x, y+1), 8 = (x-1, y). */
export const magmaMask = (has: (dx: number, dy: number) => boolean): number =>
  (has(0, -1) ? 1 : 0) | (has(1, 0) ? 2 : 0) | (has(0, 1) ? 4 : 0) | (has(-1, 0) ? 8 : 0);

const SS = 2;
const PAD = 4;
export const MAGMA_TEX_W = TILE_WIDTH + PAD * 2;
export const MAGMA_TEX_H = TILE_HEIGHT + PAD * 2;

const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

/** Outline of the tile: corners top, right, bottom, left (local, centre at the middle of the canvas). */
function outline(ctx: CanvasRenderingContext2D, mask: number, rand: () => number, inset: number): void {
  const cx = MAGMA_TEX_W / 2, cy = MAGMA_TEX_H / 2;
  const hw = TILE_WIDTH / 2, hh = TILE_HEIGHT / 2;
  const corners: [number, number][] = [[cx, cy - hh], [cx + hw, cy], [cx, cy + hh], [cx - hw, cy]];
  // Edge i joins corner i → i+1; bit 1 << i says a magma neighbour lies across it
  const pull = (p: [number, number], k: number): [number, number] => [p[0] + (cx - p[0]) * k, p[1] + (cy - p[1]) * k];
  // A corner is pulled in unless both its edges are joined
  const cornerAt = (i: number): [number, number] => {
    const joinedA = mask & (1 << i), joinedB = mask & (1 << ((i + 3) % 4));
    const k = joinedA && joinedB ? -0.05 : joinedA || joinedB ? -0.03 : 0.3 + inset;
    return pull(corners[i], k);
  };
  const pts = [0, 1, 2, 3].map(cornerAt);
  ctx.beginPath();
  ctx.moveTo(...pts[0]);
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4];
    if (mask & (1 << i)) {
      // Joined: run straight (a touch past the edge so neighbours overlap without seams)
      const [ox, oy] = [(a[0] + b[0]) / 2 - cx, (a[1] + b[1]) / 2 - cy];
      ctx.quadraticCurveTo((a[0] + b[0]) / 2 + ox * 0.06, (a[1] + b[1]) / 2 + oy * 0.06, ...b);
    } else {
      // Open: two lobes bowing in toward the centre
      const lobes = 2;
      for (let j = 0; j < lobes; j++) {
        const t0 = j / lobes, t1 = (j + 1) / lobes, tm = (t0 + t1) / 2;
        const ex = a[0] + (b[0] - a[0]) * t1, ey = a[1] + (b[1] - a[1]) * t1;
        const mx = a[0] + (b[0] - a[0]) * tm, my = a[1] + (b[1] - a[1]) * tm;
        const bow = 0.05 + rand() * 0.12;
        ctx.quadraticCurveTo(mx + (cx - mx) * -bow * 0.6, my + (cy - my) * -bow * 0.6 + (rand() - 0.5) * 2, ex, ey);
      }
    }
  }
  ctx.closePath();
}

function paintActive(ctx: CanvasRenderingContext2D, mask: number, variant: number): void {
  const cx = MAGMA_TEX_W / 2, cy = MAGMA_TEX_H / 2;
  const rand = rng(mask * 97 + 13);
  // Dark cooled rim first (only shows where the edge is open), then the molten body inset in it
  outline(ctx, mask, rand, 0);
  ctx.fillStyle = '#5a1407';
  ctx.fill();
  const r2 = rng(mask * 97 + 13);
  outline(ctx, mask, r2, 0.06);
  // Mostly deep orange (no hot spot per tile, so a flow reads as one river); heat shows in the veins
  ctx.fillStyle = '#ea580c';
  ctx.fill();
  const g = ctx.createLinearGradient(0, cy - TILE_HEIGHT / 2, 0, cy + TILE_HEIGHT / 2);
  g.addColorStop(0, 'rgba(251,146,60,0.55)');
  g.addColorStop(1, 'rgba(185,28,28,0.45)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Floating crust plates with glowing seams, placed differently per variant so the crossfade reads as flow
  const pr = rng(31 + variant * 7 + mask * 3);
  for (let i = 0; i < 4; i++) {
    const px = cx + (pr() - 0.5) * TILE_WIDTH * 0.8, py = cy + (pr() - 0.5) * TILE_HEIGHT * 0.7;
    const r = 3 + pr() * 5;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + pr() * 0.4;
      const rr = r * (0.7 + pr() * 0.5);
      const x = px + Math.cos(a) * rr, y = py + Math.sin(a) * rr * 0.55;
      if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(60,14,6,0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(253,224,71,0.9)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  // Hot yellow veins running across the tile (edge to edge, so they continue into the neighbours)
  ctx.shadowColor = '#fde047';
  ctx.shadowBlur = 5;
  for (let i = 0; i < 3; i++) {
    const y0 = cy + (pr() - 0.5) * TILE_HEIGHT * 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - TILE_WIDTH / 2, y0);
    ctx.bezierCurveTo(cx - 12, y0 - 5 + variant * 8 * pr(), cx + 12, y0 + 5 - variant * 8 * pr(), cx + TILE_WIDTH / 2, y0 + (pr() - 0.5) * 6);
    ctx.strokeStyle = i ? 'rgba(253,224,71,0.75)' : 'rgba(255,247,200,0.9)';
    ctx.lineWidth = i ? 1.2 : 1.8;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}

function paintCrust(ctx: CanvasRenderingContext2D, mask: number): void {
  const cx = MAGMA_TEX_W / 2, cy = MAGMA_TEX_H / 2;
  const rand = rng(mask * 53 + 7);
  outline(ctx, mask, rand, 0);
  const g = ctx.createLinearGradient(0, cy - TILE_HEIGHT / 2, 0, cy + TILE_HEIGHT / 2);
  g.addColorStop(0, '#4a2418');
  g.addColorStop(1, '#22100b');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Crack network still glowing underneath
  const pr = rng(mask * 11 + 5);
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 1.2;
  ctx.shadowColor = '#f97316';
  ctx.shadowBlur = 4;
  for (let i = 0; i < 5; i++) {
    let x = cx + (pr() - 0.5) * TILE_WIDTH * 0.7, y = cy + (pr() - 0.5) * TILE_HEIGHT * 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 3; k++) {
      x += (pr() - 0.5) * 16;
      y += (pr() - 0.5) * 7;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function paintBasalt(ctx: CanvasRenderingContext2D, mask: number): void {
  const cx = MAGMA_TEX_W / 2, cy = MAGMA_TEX_H / 2;
  const rand = rng(mask * 29 + 3);
  outline(ctx, mask, rand, 0);
  const g = ctx.createLinearGradient(0, cy - TILE_HEIGHT / 2, 0, cy + TILE_HEIGHT / 2);
  g.addColorStop(0, '#5b5b63');
  g.addColorStop(1, '#2e2e34');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Columnar joints: a loose hexagon pattern, lit on top
  ctx.strokeStyle = 'rgba(15,15,18,0.6)';
  ctx.lineWidth = 1;
  for (let row = -2; row <= 2; row++) {
    for (let col = -4; col <= 4; col++) {
      const x = cx + col * 9 + (row % 2) * 4.5, y = cy + row * 6;
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const px = x + Math.cos(a) * 5, py = y + Math.sin(a) * 2.8;
        if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Texture key for a look + neighbour mask (+ shimmer variant for ACTIVE), painted on first use. */
export function magmaTexture(scene: Phaser.Scene, look: MagmaLook, mask: number, variant = 0): string {
  const key = `magma-${look}-${mask}-${variant}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, MAGMA_TEX_W * SS, MAGMA_TEX_H * SS);
  if (!tex) return key;
  const ctx = tex.getContext();
  ctx.scale(SS, SS);
  if (look === 'ACTIVE') paintActive(ctx, mask, variant);
  else if (look === 'CRUST') paintCrust(ctx, mask);
  else paintBasalt(ctx, mask);
  tex.refresh();
  return key;
}

/** Soft additive glow above active magma. */
export function magmaGlowTexture(scene: Phaser.Scene): string {
  const key = 'magma-glow';
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, 64, 64);
  if (!tex) return key;
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(251,146,60,0.9)');
  g.addColorStop(0.5, 'rgba(249,115,22,0.3)');
  g.addColorStop(1, 'rgba(249,115,22,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  tex.refresh();
  return key;
}

export const MAGMA_SS = SS;
