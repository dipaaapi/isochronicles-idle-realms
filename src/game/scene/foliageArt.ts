import Phaser from 'phaser';

/**
 * Painted wild trees and bushes (Canvas2D, cached in the texture manager),
 * one look per realm: 1 Demon Citadel bloodwood / bramble, 2 Magma Caldera
 * ashwood / fire-fern, 3 Frost Spire snow pine / frost-berry, 4 Astral
 * Sanctum crystal tree / crystal bloom. Trees come as trunk + canopy so the
 * canopy can sway on its own; light falls from the upper left.
 */
export type FoliageKind = 'tree' | 'bush';
export type Realm = 1 | 2 | 3 | 4;

const SS = 2;
export const FOLIAGE_SS = SS;
/** Canvas sizes (world units) and where the ground point sits in them. */
export const TREE_W = 64, TREE_H = 84, TREE_BASE = 78;
export const BUSH_W = 48, BUSH_H = 38, BUSH_BASE = 33;
/** Height above the ground where the canopy joins the trunk (its sway pivot). */
export const CANOPY_PIVOT = 34;

interface Palette { dark: string; mid: string; lit: string; rim: string; bark: string; barkLit: string; accent: string; accentGlow: string }
const PAL: Record<Realm, Palette> = {
  1: { dark: '#0f3b2a', mid: '#1f6b45', lit: '#3fae6a', rim: '#9ef0b4', bark: '#3b2418', barkLit: '#6b4429', accent: '#c026d3', accentGlow: '#f0abfc' },
  2: { dark: '#3a0d06', mid: '#9a3412', lit: '#f97316', rim: '#fde68a', bark: '#1c1210', barkLit: '#3b2a24', accent: '#fbbf24', accentGlow: '#fef3c7' },
  3: { dark: '#0b3340', mid: '#155e75', lit: '#3aa0b8', rim: '#f0f9ff', bark: '#3a2c26', barkLit: '#5f4a40', accent: '#7dd3fc', accentGlow: '#e0f2fe' },
  4: { dark: '#3b2a6b', mid: '#7c5cd6', lit: '#c4b5fd', rim: '#fdf4ff', bark: '#cbd5e1', barkLit: '#f8fafc', accent: '#fde68a', accentGlow: '#fffbeb' },
};

const rng = (seed: number) => () => {
  seed = (seed * 16807 + 11) % 2147483647;
  return (seed % 100000) / 100000;
};

/** A shaded leaf cluster: dark body, lit cap toward the upper left, a rim highlight and leaf flecks. */
function cluster(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, r: number, rand: () => number): void {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r * 1.05);
  g.addColorStop(0, p.lit);
  g.addColorStop(0.55, p.mid);
  g.addColorStop(1, p.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  // A lumpy outline (several bumps) instead of a perfect circle
  const bumps = 9;
  for (let i = 0; i <= bumps; i++) {
    const a = (i / bumps) * Math.PI * 2;
    const rr = r * (0.86 + rand() * 0.22);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.9;
    if (i === 0) ctx.moveTo(px, py);
    else {
      const ca = a - Math.PI / bumps;
      ctx.quadraticCurveTo(x + Math.cos(ca) * r * 1.12, y + Math.sin(ca) * r * 1.0, px, py);
    }
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // Leaf flecks: small lit and dark strokes
  for (let i = 0; i < r * 1.4; i++) {
    const a = rand() * Math.PI * 2, d = rand() * r * 0.85;
    const lx = x + Math.cos(a) * d, ly = y + Math.sin(a) * d * 0.9;
    const up = ly < y;
    ctx.fillStyle = up ? p.rim : 'rgba(0,0,0,0.25)';
    ctx.globalAlpha = up ? 0.35 + rand() * 0.3 : 0.5;
    ctx.beginPath();
    ctx.ellipse(lx, ly, 1.4, 0.8, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function trunk(ctx: CanvasRenderingContext2D, p: Palette, cx: number, base: number, h: number, rand: () => number, twist: number): void {
  // Roots flaring into the ground, a tapering bole and two branches up into the canopy
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, base, 15, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createLinearGradient(cx - 5, 0, cx + 5, 0);
  g.addColorStop(0, p.barkLit);
  g.addColorStop(0.5, p.bark);
  g.addColorStop(1, '#0a0705');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - 9, base);
  ctx.quadraticCurveTo(cx - 4, base - 4, cx - 3.4, base - 10);
  ctx.quadraticCurveTo(cx - 4 + twist, base - h * 0.6, cx - 2.2 + twist * 1.4, base - h);
  ctx.lineTo(cx + 2.2 + twist * 1.4, base - h);
  ctx.quadraticCurveTo(cx + 3.6 + twist, base - h * 0.6, cx + 3.4, base - 10);
  ctx.quadraticCurveTo(cx + 4, base - 4, cx + 10, base);
  ctx.closePath();
  ctx.fill();
  // Bark grooves
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 0.7;
  for (let i = 0; i < 3; i++) {
    const x = cx - 1.5 + i * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, base - 3);
    ctx.quadraticCurveTo(x + twist * 0.5 + (rand() - 0.5) * 2, base - h * 0.5, x + twist, base - h + 2);
    ctx.stroke();
  }
}

function paintTree(ctx: CanvasRenderingContext2D, realm: Realm, variant: number, part: 'trunk' | 'canopy'): void {
  const p = PAL[realm];
  const rand = rng(realm * 101 + variant * 17 + 3);
  const cx = TREE_W / 2, base = TREE_BASE;
  const twist = (variant - 1) * 1.6;
  if (part === 'trunk') {
    trunk(ctx, p, cx, base, realm === 3 ? 24 : 40, rand, twist);
    if (realm === 2) {
      // Ember cracks glowing in the charred bark
      ctx.strokeStyle = '#fb923c';
      ctx.shadowColor = '#f97316';
      ctx.shadowBlur = 4;
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const y = base - 8 - i * 9;
        ctx.beginPath();
        ctx.moveTo(cx - 2, y);
        ctx.lineTo(cx + 1, y - 3);
        ctx.lineTo(cx - 1, y - 6);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }
    return;
  }
  const top = base - CANOPY_PIVOT;
  if (realm === 3) {
    // Snow pine: stacked jagged tiers, snow on each, icicles under the lowest
    const tiers = 4;
    for (let i = 0; i < tiers; i++) {
      const w = 26 - i * 5.5, y = base - 22 - i * 12, h = 20;
      const g = ctx.createLinearGradient(cx - w, 0, cx + w, 0);
      g.addColorStop(0, p.lit);
      g.addColorStop(0.55, p.mid);
      g.addColorStop(1, p.dark);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, y - h);
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        const x = cx - w + t * w * 2;
        ctx.lineTo(x, y + (k % 2 ? -2 : 2));
      }
      ctx.closePath();
      ctx.fill();
      // Snow caps
      ctx.fillStyle = p.rim;
      ctx.beginPath();
      ctx.moveTo(cx, y - h);
      ctx.quadraticCurveTo(cx - w * 0.5, y - h * 0.4, cx - w * 0.75, y - 3);
      ctx.quadraticCurveTo(cx - w * 0.3, y - h * 0.35, cx, y - h * 0.55);
      ctx.quadraticCurveTo(cx + w * 0.25, y - h * 0.45, cx + w * 0.45, y - h * 0.3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = p.accentGlow;
    for (let k = 0; k < 5; k++) {
      const x = cx - 20 + k * 10;
      ctx.beginPath();
      ctx.moveTo(x - 1.2, base - 20);
      ctx.lineTo(x, base - 14 - rand() * 3);
      ctx.lineTo(x + 1.2, base - 20);
      ctx.fill();
    }
    return;
  }
  if (realm === 4) {
    // Crystal tree: faceted shards fanned up from the trunk, glowing star-leaves between them
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.32 + (rand() - 0.5) * 0.1;
      const len = 26 + rand() * 14, wid = 5 + rand() * 3;
      const bx = cx + twist, by = top + 6;
      const tx = bx + Math.cos(a) * len, ty = by + Math.sin(a) * len;
      const nx = -Math.sin(a) * wid, ny = Math.cos(a) * wid;
      const g = ctx.createLinearGradient(bx, by, tx, ty);
      g.addColorStop(0, p.mid);
      g.addColorStop(1, p.rim);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(bx + nx * 0.4, by + ny * 0.4);
      ctx.lineTo(tx, ty);
      ctx.lineTo(bx - nx * 0.4, by - ny * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
    ctx.shadowColor = p.accent;
    ctx.shadowBlur = 6;
    for (let i = 0; i < 9; i++) {
      const x = cx + (rand() - 0.5) * 40, y = top - 6 - rand() * 28;
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2, r = k % 2 ? 1 : 2.6;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    return;
  }
  // Broadleaf canopies (bloodwood / ashwood): back clusters, side clusters, a crown, front clusters
  const crown = top - 14 + twist;
  const spots: Array<[number, number, number]> = [
    [cx - 14, crown + 8, 11], [cx + 14, crown + 6, 12], [cx, crown - 8, 13],
    [cx - 18, crown + 18, 9], [cx + 19, crown + 17, 9], [cx - 6, crown + 14, 12], [cx + 8, crown + 13, 12],
    [cx, crown + 4, 14],
  ];
  // Branches reaching into the canopy
  ctx.strokeStyle = p.bark;
  ctx.lineWidth = 2.2;
  for (const [bx, by] of [[cx - 14, crown + 12], [cx + 15, crown + 10]]) {
    ctx.beginPath();
    ctx.moveTo(cx + twist, top + 8);
    ctx.quadraticCurveTo((cx + bx) / 2, top, bx, by);
    ctx.stroke();
  }
  for (const [x, y, r] of spots) cluster(ctx, p, x + (rand() - 0.5) * 3, y + (rand() - 0.5) * 3, r * (0.92 + variant * 0.05), rand);
  // Fruit / embers among the leaves
  ctx.shadowColor = p.accent;
  ctx.shadowBlur = realm === 2 ? 6 : 3;
  for (let i = 0; i < 7; i++) {
    const x = cx + (rand() - 0.5) * 36, y = crown + rand() * 24 - 8;
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(x, y, 1.6 + rand(), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.accentGlow;
    ctx.beginPath();
    ctx.arc(x - 0.5, y - 0.5, 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function paintBush(ctx: CanvasRenderingContext2D, realm: Realm, variant: number): void {
  const p = PAL[realm];
  const rand = rng(realm * 211 + variant * 29 + 7);
  const cx = BUSH_W / 2, base = BUSH_BASE;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, base, 18, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (realm === 4) {
    // Crystal bloom: a cluster of glowing prisms
    for (let i = 0; i < 6; i++) {
      const x = cx - 13 + i * 5.2 + (rand() - 0.5) * 2, h = 10 + rand() * 12, w = 3 + rand() * 2;
      const g = ctx.createLinearGradient(x, base - h, x, base);
      g.addColorStop(0, p.rim);
      g.addColorStop(1, p.mid);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - w, base - 2);
      ctx.lineTo(x - w * 0.6, base - h + 3);
      ctx.lineTo(x, base - h);
      ctx.lineTo(x + w * 0.6, base - h + 3);
      ctx.lineTo(x + w, base - 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  } else if (realm === 2) {
    // Fire-fern: curling fronds that glow at the tips
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      const len = 14 + rand() * 6;
      const tx = cx + Math.cos(a) * len, ty = base - 4 + Math.sin(a) * len * 0.9;
      const g = ctx.createLinearGradient(cx, base, tx, ty);
      g.addColorStop(0, p.dark);
      g.addColorStop(0.6, p.mid);
      g.addColorStop(1, p.lit);
      ctx.strokeStyle = g;
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, base - 2);
      ctx.quadraticCurveTo((cx + tx) / 2, ty - 4, tx, ty);
      ctx.stroke();
      ctx.shadowColor = p.accent;
      ctx.shadowBlur = 5;
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(tx, ty, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  } else {
    // Bramble (realm 1) / frost-berry (realm 3): leafy mounds, thorns or frost, berries
    const spots: Array<[number, number, number]> = [[cx - 10, base - 9, 9], [cx + 10, base - 9, 9], [cx, base - 14, 10], [cx - 4, base - 7, 9], [cx + 5, base - 6, 8]];
    for (const [x, y, r] of spots) cluster(ctx, p, x + (rand() - 0.5) * 2, y, r * (0.92 + variant * 0.06), rand);
    if (realm === 1) {
      ctx.strokeStyle = '#1a0f0a';
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const x = cx - 14 + rand() * 28, y = base - 6 - rand() * 14;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rand() - 0.5) * 6, y - 3);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = p.rim;
      ctx.globalAlpha = 0.85;
      for (const [x, y, r] of spots) {
        ctx.beginPath();
        ctx.ellipse(x - r * 0.2, y - r * 0.6, r * 0.6, r * 0.28, -0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.shadowColor = p.accent;
    ctx.shadowBlur = 3;
    for (let i = 0; i < 6; i++) {
      const x = cx + (rand() - 0.5) * 26, y = base - 6 - rand() * 14;
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }
}

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w * SS, h * SS);
  if (!tex) return key;
  const ctx = tex.getContext();
  ctx.scale(SS, SS);
  draw(ctx);
  tex.refresh();
  return key;
}

export const treeTrunkTexture = (scene: Phaser.Scene, realm: Realm, variant: number) =>
  make(scene, `foliage-tree-trunk-${realm}-${variant}`, TREE_W, TREE_H, (ctx) => paintTree(ctx, realm, variant, 'trunk'));
export const treeCanopyTexture = (scene: Phaser.Scene, realm: Realm, variant: number) =>
  make(scene, `foliage-tree-canopy-${realm}-${variant}`, TREE_W, TREE_H, (ctx) => paintTree(ctx, realm, variant, 'canopy'));
export const bushTexture = (scene: Phaser.Scene, realm: Realm, variant: number) =>
  make(scene, `foliage-bush-${realm}-${variant}`, BUSH_W, BUSH_H, (ctx) => paintBush(ctx, realm, variant));

/** Colour of the bits a node sheds while idle / bursts into when harvested. */
export const FOLIAGE_PARTICLE: Record<Realm, number[]> = {
  1: [0x3fae6a, 0x1f6b45, 0xc026d3],
  2: [0xf97316, 0xfbbf24, 0x7c2d12],
  3: [0xf0f9ff, 0xbae6fd, 0x3aa0b8],
  4: [0xfde68a, 0xc4b5fd, 0xfdf4ff],
};
