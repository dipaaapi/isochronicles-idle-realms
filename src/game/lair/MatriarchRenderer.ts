import Phaser from 'phaser';
import LAIR from '../../data/dragonsLair.json';

/**
 * She is posed in a large rig space and shown at ART.scale. Parts are painted
 * at that same density (one texel per world unit, like the voxel sheets of the
 * units she fights), posterized, outlined and drawn with NEAREST so she reads
 * as pixel art beside them instead of a smooth painting.
 */
const ART = LAIR.matriarch.art;
const SS = ART.scale;
/** Glows stay smooth: painted at a fixed density, LINEAR filtered. */
const GLOW_SS = 2;
const C = {
  scaleHi: '#c2261f', scale: '#8a1c17', scaleLo: '#4a0b0a', scaleDeep: '#230505', rim: 'rgba(255,150,120,0.55)',
  bellyHi: '#fcd34d', belly: '#d97706', bellyLo: '#7c3a0a',
  hornLo: '#171210', horn: '#3b302a', hornHi: '#e7dccb',
  membrane: 'rgba(70,9,9,0.96)', membraneLit: 'rgba(150,32,20,0.9)', vein: 'rgba(255,120,60,0.28)',
  bone: '#2b0d0b', boneHi: '#8f3426', tooth: '#f5efe2', eye: '#fde047', outline: '#160303',
};

export type MatriarchPose = 'idle' | 'claw' | 'tailwhip' | 'breath' | 'summon' | 'roar' | 'hurt' | 'dead';

type Ctx = CanvasRenderingContext2D;

/** Paints a part once per page load (cached in the texture manager across scenes). */
function paint(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx) => void, glow = false): string {
  key = `${key}-${glow ? 'g' : SS}`;
  if (scene.textures.exists(key)) return key;
  const ss = glow ? GLOW_SS : SS;
  const tex = scene.textures.createCanvas(key, Math.ceil(w * ss) + 2, Math.ceil(h * ss) + 2);
  if (!tex) return key;
  const ctx = tex.getContext();
  ctx.translate(1, 1);
  ctx.scale(ss, ss);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  if (!glow) {
    pixelate(ctx, tex.width, tex.height);
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
  tex.refresh();
  return key;
}

/** Hard alpha, posterized colour bands and a one-texel dark outline: the look of the voxel sheets. */
function pixelate(ctx: Ctx, w: number, h: number): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const step = ART.colorStep;
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (d[o + 3] < ART.alphaCut) {
      d[o + 3] = 0;
      continue;
    }
    // Un-premultiply soft edges, then band each channel
    const a = d[o + 3] / 255;
    for (let c = 0; c < 3; c++) d[o + c] = Math.min(255, Math.round(d[o + c] / a / step) * step);
    d[o + 3] = 255;
    solid[i] = 1;
  }
  const [or, og, ob] = [0x16, 0x03, 0x03];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (solid[i]) continue;
      if ((x > 0 && solid[i - 1]) || (x < w - 1 && solid[i + 1]) || (y > 0 && solid[i - w]) || (y < h - 1 && solid[i + w])) {
        const o = i * 4;
        d[o] = or; d[o + 1] = og; d[o + 2] = ob; d[o + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

const grad = (ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) => {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [k, c] of stops) g.addColorStop(k, c);
  return g;
};

/** Overlapping scale rows inside the current clip: dark crescents with a lit upper rim. */
function scales(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, size: number): void {
  let row = 0;
  for (let y = y0; y < y1; y += size * 0.62, row++) {
    for (let x = x0 + (row % 2) * size * 0.5; x < x1; x += size) {
      ctx.beginPath();
      ctx.arc(x, y, size * 0.52, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.strokeStyle = 'rgba(20,0,0,0.42)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y - 1.4, size * 0.44, 1.15 * Math.PI, 1.85 * Math.PI);
      ctx.strokeStyle = 'rgba(255,140,110,0.16)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
}

/** A curved horn / spike: filled wedge from a wide base to a pale tip. */
function horn(ctx: Ctx, bx: number, by: number, cx: number, cy: number, tx: number, ty: number, width: number): void {
  const nx = -(ty - by), ny = tx - bx;
  const nl = Math.hypot(nx, ny) || 1;
  const ox = (nx / nl) * width * 0.5, oy = (ny / nl) * width * 0.5;
  ctx.beginPath();
  ctx.moveTo(bx + ox, by + oy);
  ctx.quadraticCurveTo(cx + ox * 0.5, cy + oy * 0.5, tx, ty);
  ctx.quadraticCurveTo(cx - ox * 0.5, cy - oy * 0.5, bx - ox, by - oy);
  ctx.closePath();
  ctx.fillStyle = grad(ctx, bx, by, tx, ty, [[0, C.hornLo], [0.55, C.horn], [1, C.hornHi]]);
  ctx.fill();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function outline(ctx: Ctx, width = 2.4): void {
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = width;
  ctx.stroke();
}

/** Upper rim light along the current path, clipped to its top part. */
function rimLight(ctx: Ctx, path: () => void, y: number, w: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, y);
  ctx.clip();
  path();
  ctx.strokeStyle = C.rim;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.restore();
}

// ── Parts (all drawn facing right, +x toward the head) ──────────────────────

function paintBody(ctx: Ctx): void {
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(26, 150);
    ctx.bezierCurveTo(34, 66, 150, 26, 258, 42);
    ctx.bezierCurveTo(352, 56, 412, 112, 402, 162);
    ctx.bezierCurveTo(392, 214, 302, 246, 200, 242);
    ctx.bezierCurveTo(98, 240, 20, 214, 26, 150);
    ctx.closePath();
  };
  // Dorsal spikes behind the silhouette
  const ridge: [number, number][] = [[70, 92], [108, 66], [150, 48], [196, 38], [242, 38], [288, 46], [330, 62], [366, 86]];
  ridge.forEach(([x, y], i) => {
    const h = 30 + Math.sin((i / (ridge.length - 1)) * Math.PI) * 22;
    horn(ctx, x + 8, y + 10, x - 4, y - h * 0.5, x - 18, y - h, 20);
  });
  path();
  ctx.fillStyle = grad(ctx, 0, 30, 0, 245, [[0, C.scaleHi], [0.35, C.scale], [0.75, C.scaleLo], [1, C.scaleDeep]]);
  ctx.fill();
  ctx.save();
  path();
  ctx.clip();
  scales(ctx, 20, 40, 410, 230, 17);
  // Belly plates: amber bands along the underside, lit by the furnace inside
  ctx.beginPath();
  ctx.moveTo(84, 214);
  ctx.bezierCurveTo(170, 196, 300, 186, 396, 150);
  ctx.lineTo(410, 260);
  ctx.lineTo(70, 260);
  ctx.closePath();
  ctx.fillStyle = grad(ctx, 0, 160, 0, 246, [[0, C.bellyHi], [0.5, C.belly], [1, C.bellyLo]]);
  ctx.fill();
  for (let x = 104; x < 400; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 260);
    ctx.quadraticCurveTo(x + 8, 220, x + 2, 190 - (x - 100) * 0.12);
    ctx.strokeStyle = 'rgba(90,30,5,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // Ambient occlusion where the legs join, and a broad specular sheen on the back
  const ao = ctx.createRadialGradient(120, 210, 10, 120, 210, 110);
  ao.addColorStop(0, 'rgba(0,0,0,0.35)');
  ao.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ao;
  ctx.fillRect(0, 0, 420, 260);
  const sheen = ctx.createRadialGradient(230, 70, 4, 230, 70, 120);
  sheen.addColorStop(0, 'rgba(255,170,140,0.28)');
  sheen.addColorStop(1, 'rgba(255,170,140,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, 420, 260);
  // Old battle scars
  ctx.strokeStyle = 'rgba(30,0,0,0.6)';
  ctx.lineWidth = 2;
  for (const [x, y] of [[180, 110], [196, 104], [300, 96]]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 26, y + 30);
    ctx.stroke();
  }
  ctx.restore();
  path();
  outline(ctx, 3);
  rimLight(ctx, path, 110, 420);
}

function paintNeck(ctx: Ctx): void {
  const path = () => {
    ctx.beginPath();
    ctx.ellipse(66, 56, 60, 46, 0, 0, Math.PI * 2);
  };
  horn(ctx, 60, 18, 48, -4, 36, -18, 16);
  path();
  ctx.fillStyle = grad(ctx, 0, 10, 0, 102, [[0, C.scaleHi], [0.45, C.scale], [1, C.scaleLo]]);
  ctx.fill();
  ctx.save();
  path();
  ctx.clip();
  scales(ctx, 0, 14, 130, 100, 14);
  ctx.beginPath();
  ctx.ellipse(70, 104, 56, 30, 0, Math.PI, Math.PI * 2);
  ctx.fillStyle = grad(ctx, 0, 74, 0, 104, [[0, C.bellyHi], [1, C.belly]]);
  ctx.fill();
  for (let x = 30; x < 120; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, 78);
    ctx.lineTo(x + 4, 104);
    ctx.strokeStyle = 'rgba(90,30,5,0.55)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  ctx.restore();
  path();
  ctx.strokeStyle = 'rgba(22,3,3,0.55)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  rimLight(ctx, path, 40, 132);
}

function paintHead(ctx: Ctx): void {
  // Swept-back horns first (behind the skull)
  horn(ctx, 96, 52, 58, 6, 6, 8, 22);
  horn(ctx, 124, 44, 104, 10, 72, 2, 14);
  horn(ctx, 70, 92, 40, 104, 12, 128, 14);
  horn(ctx, 92, 102, 70, 122, 52, 144, 10);
  const skull = () => {
    ctx.beginPath();
    ctx.moveTo(34, 82);
    ctx.bezierCurveTo(56, 40, 128, 30, 186, 54);
    ctx.lineTo(236, 76);
    ctx.bezierCurveTo(244, 84, 240, 98, 228, 100);
    ctx.lineTo(122, 108);
    ctx.bezierCurveTo(70, 114, 36, 104, 34, 82);
    ctx.closePath();
  };
  skull();
  ctx.fillStyle = grad(ctx, 0, 34, 0, 110, [[0, C.scaleHi], [0.5, C.scale], [1, C.scaleLo]]);
  ctx.fill();
  ctx.save();
  skull();
  ctx.clip();
  scales(ctx, 30, 40, 200, 110, 12);
  // Brow ridge shading over the eye and the snout's bony plates
  ctx.fillStyle = 'rgba(25,2,2,0.55)';
  ctx.beginPath();
  ctx.moveTo(104, 50);
  ctx.quadraticCurveTo(140, 44, 176, 60);
  ctx.quadraticCurveTo(142, 58, 110, 64);
  ctx.closePath();
  ctx.fill();
  for (let x = 170; x < 232; x += 14) {
    ctx.beginPath();
    ctx.ellipse(x, 66 + (x - 170) * 0.16, 7, 4, 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,150,120,0.18)';
    ctx.fill();
  }
  ctx.restore();
  skull();
  outline(ctx);
  rimLight(ctx, skull, 64, 250);
  // Upper teeth
  for (let x = 132; x < 226; x += 9) {
    ctx.beginPath();
    ctx.moveTo(x, 104);
    ctx.lineTo(x + 3.5, 113 + ((x / 9) % 2) * 3);
    ctx.lineTo(x + 7, 103.5);
    ctx.closePath();
    ctx.fillStyle = C.tooth;
    ctx.fill();
  }
  // Eye: molten gold with a slit pupil, nostril with a coal inside
  ctx.beginPath();
  ctx.ellipse(146, 66, 10, 5.5, -0.15, 0, Math.PI * 2);
  ctx.fillStyle = C.eye;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(147, 66, 1.8, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#1c0a05';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(226, 80, 5, 3, 0.4, 0, Math.PI * 2);
  ctx.fillStyle = '#2a0505';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(226, 80.5, 2, 1.2, 0.4, 0, Math.PI * 2);
  ctx.fillStyle = '#fb923c';
  ctx.fill();
}

function paintJaw(ctx: Ctx): void {
  // Molten maw inside, then the jaw over it
  ctx.beginPath();
  ctx.moveTo(26, 14);
  ctx.lineTo(176, 16);
  ctx.lineTo(150, 30);
  ctx.lineTo(40, 30);
  ctx.closePath();
  ctx.fillStyle = grad(ctx, 26, 0, 176, 0, [[0, '#3b0505'], [1, '#c2410c']]);
  ctx.fill();
  for (let x = 58; x < 176; x += 9) {
    ctx.beginPath();
    ctx.moveTo(x, 22);
    ctx.lineTo(x + 3.5, 12 - ((x / 9) % 2) * 3);
    ctx.lineTo(x + 7, 22);
    ctx.closePath();
    ctx.fillStyle = C.tooth;
    ctx.fill();
  }
  const jaw = () => {
    ctx.beginPath();
    ctx.moveTo(10, 16);
    ctx.lineTo(182, 22);
    ctx.bezierCurveTo(188, 32, 180, 40, 168, 40);
    ctx.lineTo(44, 54);
    ctx.bezierCurveTo(18, 54, 6, 36, 10, 16);
    ctx.closePath();
  };
  jaw();
  ctx.fillStyle = grad(ctx, 0, 16, 0, 56, [[0, C.scale], [1, C.scaleDeep]]);
  ctx.fill();
  ctx.save();
  jaw();
  ctx.clip();
  ctx.fillStyle = grad(ctx, 0, 40, 0, 56, [[0, C.belly], [1, C.bellyLo]]);
  ctx.fillRect(30, 40, 160, 20);
  ctx.restore();
  jaw();
  outline(ctx);
  horn(ctx, 30, 44, 18, 58, 4, 66, 9);
}

function paintWing(ctx: Ctx): void {
  // Shoulder at the bottom-right; the wing reaches up and back
  const sh: [number, number] = [522, 404];
  const el: [number, number] = [372, 160];
  const wr: [number, number] = [236, 40];
  const tips: [number, number][] = [[18, 74], [36, 216], [114, 326], [250, 384], [400, 430]];
  ctx.beginPath();
  ctx.moveTo(...sh);
  ctx.lineTo(...el);
  ctx.lineTo(...wr);
  ctx.lineTo(...tips[0]);
  for (let i = 1; i < tips.length; i++) {
    const [ax, ay] = tips[i - 1];
    const [bx, by] = tips[i];
    // Scalloped trailing edge, bowing in toward the wrist
    const mx = (ax + bx) / 2 + (wr[0] - (ax + bx) / 2) * 0.34;
    const my = (ay + by) / 2 + (wr[1] - (ay + by) / 2) * 0.34;
    ctx.quadraticCurveTo(mx, my, bx, by);
  }
  ctx.lineTo(...sh);
  ctx.closePath();
  ctx.fillStyle = grad(ctx, wr[0], wr[1], sh[0], sh[1], [[0, C.membrane], [0.55, 'rgba(110,18,14,0.95)'], [1, C.membraneLit]]);
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Veins fanning from each bone, and an ember back-light near the edge
  ctx.strokeStyle = C.vein;
  ctx.lineWidth = 1.2;
  for (let i = 0; i < tips.length - 1; i++) {
    for (let k = 0.5; k < 1; k += 1) {
      const tx = tips[i][0] + (tips[i + 1][0] - tips[i][0]) * k;
      const ty = tips[i][1] + (tips[i + 1][1] - tips[i][1]) * k;
      ctx.beginPath();
      ctx.moveTo(wr[0], wr[1]);
      ctx.quadraticCurveTo((wr[0] + tx) / 2 + 10, (wr[1] + ty) / 2 - 6, tx, ty);
      ctx.stroke();
    }
  }
  const edge = ctx.createRadialGradient(wr[0], wr[1], 120, wr[0], wr[1], 380);
  edge.addColorStop(0, 'rgba(249,115,22,0)');
  edge.addColorStop(1, 'rgba(249,115,22,0.22)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, 560, 440);
  ctx.restore();
  ctx.strokeStyle = 'rgba(30,2,2,0.9)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Bones: arm, forearm and the finger spars
  const bone = (a: [number, number], b: [number, number], w: number) => {
    ctx.beginPath();
    ctx.moveTo(...a);
    ctx.lineTo(...b);
    ctx.strokeStyle = C.bone;
    ctx.lineWidth = w;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(a[0], a[1] - w * 0.25);
    ctx.lineTo(b[0], b[1] - w * 0.25);
    ctx.strokeStyle = C.boneHi;
    ctx.lineWidth = Math.max(1, w * 0.28);
    ctx.stroke();
  };
  bone(sh, el, 18);
  bone(el, wr, 13);
  for (const t of tips.slice(0, 4)) bone(wr, t, 6);
  for (const p of [el, wr]) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], 9, 0, Math.PI * 2);
    ctx.fillStyle = C.bone;
    ctx.fill();
  }
  horn(ctx, wr[0], wr[1] - 4, wr[0] + 10, wr[1] - 26, wr[0] + 30, wr[1] - 34, 10);
  horn(ctx, el[0], el[1] - 6, el[0] + 6, el[1] - 22, el[0] + 22, el[1] - 30, 9);
}

function paintLeg(ctx: Ctx, w: number, h: number, fore: boolean): void {
  // One muscled silhouette: haunch, knee, shin and a clawed foot (digitigrade hind legs)
  const sx = w / 150, sy = h / 200;
  const P = (x: number, y: number): [number, number] => [x * sx, y * sy];
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(...P(16, 46));
    ctx.bezierCurveTo(...P(8, -4), ...P(142, -6), ...P(138, 50));
    if (fore) {
      ctx.bezierCurveTo(...P(136, 96), ...P(112, 118), ...P(104, 132));
      ctx.lineTo(...P(110, 170));
    } else {
      ctx.bezierCurveTo(...P(136, 92), ...P(118, 112), ...P(98, 124));
      ctx.lineTo(...P(84, 166));
    }
    ctx.lineTo(...P(132, 180));
    ctx.bezierCurveTo(...P(140, 186), ...P(136, 194), ...P(124, 194));
    ctx.lineTo(...P(44, 194));
    ctx.bezierCurveTo(...P(36, 186), ...P(40, 174), ...P(50, 172));
    ctx.lineTo(...P(fore ? 56 : 46, 150));
    ctx.bezierCurveTo(...P(30, 118), ...P(14, 90), ...P(16, 46));
    ctx.closePath();
  };
  path();
  // Top fades into the body colour so the haunch joins the torso without a seam
  ctx.fillStyle = grad(ctx, 0, 0, 0, h, [[0, C.scale], [0.3, C.scaleHi], [0.65, C.scaleLo], [1, C.scaleDeep]]);
  ctx.fill();
  ctx.save();
  path();
  ctx.clip();
  scales(ctx, 0, 6, w, h, 12);
  // Muscle shading: a lit haunch and a shadowed back of the leg
  const lit = ctx.createRadialGradient(w * 0.62, h * 0.22, 2, w * 0.62, h * 0.22, w * 0.5);
  lit.addColorStop(0, 'rgba(255,160,130,0.28)');
  lit.addColorStop(1, 'rgba(255,160,130,0)');
  ctx.fillStyle = lit;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = grad(ctx, 0, 0, w, 0, [[0, 'rgba(0,0,0,0.4)'], [0.4, 'rgba(0,0,0,0)']]);
  ctx.fillRect(0, 0, w, h);
  // Scaled toes
  ctx.strokeStyle = 'rgba(20,0,0,0.6)';
  ctx.lineWidth = 1.4;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(...P(44 + i * 22, 176));
    ctx.lineTo(...P(48 + i * 22, 194));
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, h * 0.22, w, h);
  ctx.clip();
  path();
  outline(ctx, 2);
  ctx.restore();
  // Talons curling into the ground
  for (let i = 0; i < 4; i++) {
    const [tx, ty] = P(56 + i * 24, 192);
    horn(ctx, tx, ty - 4 * sy, tx + 8 * sx, ty + 2 * sy, tx + 14 * sx, ty + 8 * sy, 7);
  }
}

function paintTail(ctx: Ctx, tip: boolean): void {
  if (tip) {
    // Spade tip with a bony blade
    horn(ctx, 70, 44, 40, 10, 4, 6, 26);
    horn(ctx, 70, 48, 40, 78, 4, 86, 26);
  }
  const path = () => {
    ctx.beginPath();
    if (tip) {
      ctx.moveTo(118, 22);
      ctx.quadraticCurveTo(60, 26, 40, 45);
      ctx.quadraticCurveTo(60, 66, 118, 70);
      ctx.closePath();
    } else {
      ctx.ellipse(60, 46, 56, 36, 0, 0, Math.PI * 2);
    }
  };
  if (!tip) horn(ctx, 64, 14, 54, -2, 40, -10, 14);
  path();
  ctx.fillStyle = grad(ctx, 0, 8, 0, 84, [[0, C.scaleHi], [0.5, C.scale], [1, C.scaleDeep]]);
  ctx.fill();
  ctx.save();
  path();
  ctx.clip();
  scales(ctx, 0, 10, 120, 84, 13);
  ctx.fillStyle = grad(ctx, 0, 60, 0, 84, [[0, 'rgba(217,119,6,0)'], [1, 'rgba(217,119,6,0.6)']]);
  ctx.fillRect(0, 56, 120, 30);
  ctx.restore();
  path();
  outline(ctx);
}

function paintGlow(ctx: Ctx, rgb: string): void {
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, `rgba(${rgb},1)`);
  g.addColorStop(0.35, `rgba(${rgb},0.45)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
}

interface Part { img: Phaser.GameObjects.Image; base: number }
interface Ember { x: number; y: number; vx: number; vy: number; t: number; life: number; r: number }

const easeOut = (k: number) => 1 - (1 - k) * (1 - k);
const easeIn = (k: number) => k * k;
const clamp01 = (k: number) => Math.min(1, Math.max(0, k));
/** Default length of each pose (s); breath is timed by the caller (charge + blast). */
const POSE_LEN: Record<MatriarchPose, number> = { idle: 0, claw: 1.05, tailwhip: 1.25, breath: 3.5, summon: 1.3, roar: 1.5, hurt: 0.35, dead: 0 };
/** Attack poses lock her facing until they finish (no mid-swing mirror). */
const LOCKED: MatriarchPose[] = ['claw', 'tailwhip', 'breath'];
const COLLAPSE_S = LAIR.matriarch.death.collapseSeconds;
const DISSOLVE_S = LAIR.matriarch.death.dissolveSeconds;
const CHAR = { r: 0x2a, g: 0x1a, b: 0x16 };

const lerpTint = (base: number, k: number) => {
  const r = (base >> 16) & 0xff, g = (base >> 8) & 0xff, b = base & 0xff;
  return (Math.round(r + (CHAR.r - r) * k) << 16) | (Math.round(g + (CHAR.g - g) * k) << 8) | Math.round(b + (CHAR.b - b) * k);
};

/**
 * Ignara, the Ember Matriarch: an arena-scale rig of canvas-painted parts
 * (gradient-shaded scales, belly plates, horns, veined wing membranes),
 * painted once and posed every frame by rotating and placing the parts
 * (tail chain, legs, body, wings, neck chain, head, jaw) instead of a
 * character sheet scaled up. About ten times the Leviathan's mass on screen.
 * Poses: idle, claw (wind-up, rake, recover), tailwhip (coil, lash, follow-through),
 * breath (inhale with the furnace glowing, then a lunging blast), summon, roar,
 * hurt (flinch), dead (collapse, then a 5 s dissolve into embers). She turns
 * through a quick squash with a cooldown, never mirroring frame to frame.
 */
export class MatriarchRenderer {
  readonly container: Phaser.GameObjects.Container;
  private rig: Phaser.GameObjects.Container;
  private shadow: Phaser.GameObjects.Ellipse;
  private parts: Part[] = [];
  private body: Phaser.GameObjects.Image;
  private head: Phaser.GameObjects.Image;
  private jaw: Phaser.GameObjects.Image;
  private neck: Phaser.GameObjects.Image[] = [];
  private tail: Phaser.GameObjects.Image[] = [];
  private wingFar: Phaser.GameObjects.Image;
  private wingNear: Phaser.GameObjects.Image;
  private legs: { img: Phaser.GameObjects.Image; x: number; y: number; fore: boolean; near: boolean }[] = [];
  private bellyGlow: Phaser.GameObjects.Image;
  private eyeGlow: Phaser.GameObjects.Image;
  private mawGlow: Phaser.GameObjects.Image;
  private heatRing: Phaser.GameObjects.Graphics;
  private emberGfx: Phaser.GameObjects.Graphics;
  private embers: Ember[] = [];
  private t = 0;
  private pose: MatriarchPose = 'idle';
  private poseT = 0;
  private poseLen = 0;
  private charge = 1.5;
  private flash = 0;
  private lastFlashAt = -1;
  private lastHurtAt = -9;
  private tinted = false;
  private deathT = 0;
  private dissolveT = 0;
  private rage = 0;
  /** Facing: the side she turns to (-1 left / 1 right) and the live mirror scale easing toward it. */
  private facing = 1;
  private facingK = 1;
  private lastTurnAt = -9;
  // Rig-space anchor points the battle's effects attach to
  private mouthLocal = { x: 400, y: -264 };
  private tailTipLocal = { x: -560, y: -60 };
  private clawLocal = { x: 120, y: 60 };

  constructor(scene: Phaser.Scene, x: number, y: number) {
    const k = {
      body: paint(scene, 'ignara-body', 420, 260, paintBody),
      neck: paint(scene, 'ignara-neck', 132, 110, paintNeck),
      head: paint(scene, 'ignara-head', 250, 160, paintHead),
      jaw: paint(scene, 'ignara-jaw', 192, 72, paintJaw),
      wing: paint(scene, 'ignara-wing', 560, 440, paintWing),
      hind: paint(scene, 'ignara-hind', 150, 200, (c) => paintLeg(c, 150, 200, false)),
      fore: paint(scene, 'ignara-fore', 112, 170, (c) => paintLeg(c, 112, 170, true)),
      tail: paint(scene, 'ignara-tail', 120, 90, (c) => paintTail(c, false)),
      tip: paint(scene, 'ignara-tail-tip', 120, 90, (c) => paintTail(c, true)),
      ember: paint(scene, 'ignara-glow-ember', 128, 128, (c) => paintGlow(c, '249,115,22'), true),
      maw: paint(scene, 'ignara-glow-maw', 128, 128, (c) => paintGlow(c, '253,186,116'), true),
      eye: paint(scene, 'ignara-glow-eye', 128, 128, (c) => paintGlow(c, '253,224,71'), true),
    };
    this.container = scene.add.container(x, y).setScale(ART.scale);
    this.shadow = scene.add.ellipse(0, 12, 620, 170, 0x000000, 0.45);
    this.rig = scene.add.container(0, 0);
    this.container.add([this.shadow, this.rig]);
    const img = (key: string, ox: number, oy: number, base = 0xffffff) => {
      const i = scene.add.image(0, 0, key).setOrigin(ox, oy).setScale(1 / SS);
      this.parts.push({ img: i, base });
      if (base !== 0xffffff) i.setTint(base);
      return i;
    };
    const far = 0x8c7a7a;
    // Back to front: tail, far wing, far legs, body, near wing, near hind leg, neck, jaw, head, near foreleg
    for (let i = 0; i < 9; i++) this.tail.push(img(i === 8 ? k.tip : k.tail, 0.92, 0.5));
    this.rig.add([...this.tail].reverse());
    this.wingFar = img(k.wing, 522 / 560, 404 / 440, far);
    this.rig.add(this.wingFar);
    const leg = (key: string, x0: number, y0: number, fore: boolean, near: boolean) => {
      const l = img(key, 0.5, 0.18, near ? 0xffffff : far);
      this.legs.push({ img: l, x: x0, y: y0, fore, near });
      this.rig.add(l);
    };
    leg(k.hind, -70, -110, false, false);
    leg(k.fore, 150, -110, true, false);
    this.body = img(k.body, 0.5, 0.55);
    this.rig.add(this.body);
    this.bellyGlow = scene.add.image(30, -80, k.ember).setBlendMode(Phaser.BlendModes.ADD);
    this.rig.add(this.bellyGlow);
    this.wingNear = img(k.wing, 522 / 560, 404 / 440);
    this.rig.add(this.wingNear);
    leg(k.hind, -120, -96, false, true);
    for (let i = 0; i < 7; i++) {
      const n = img(k.neck, 0.5, 0.5);
      this.neck.push(n);
      this.rig.add(n);
    }
    this.jaw = img(k.jaw, 20 / 192, 16 / 72);
    this.head = img(k.head, 40 / 250, 86 / 160);
    this.rig.add([this.jaw, this.head]);
    leg(k.fore, 120, -96, true, true);
    this.mawGlow = scene.add.image(0, 0, k.maw).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.eyeGlow = scene.add.image(0, 0, k.eye).setBlendMode(Phaser.BlendModes.ADD).setScale(0.3);
    this.heatRing = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.emberGfx = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.rig.add([this.mawGlow, this.eyeGlow]);
    this.container.add([this.heatRing, this.emberGfx]);
  }

  /** Starts a pose; `len` overrides its default length, `charge` is the breath's inhale before the blast. */
  setPose(pose: MatriarchPose, len?: number, charge?: number): void {
    if (this.pose === 'dead') return;
    this.pose = pose;
    this.poseT = 0;
    this.poseLen = len ?? POSE_LEN[pose];
    if (charge !== undefined) this.charge = charge;
  }

  /** Turns toward a screen-x offset, only for a clear side, with a cooldown, never mid-attack. */
  face(dx: number): void {
    if (this.pose === 'dead' || LOCKED.includes(this.pose)) return;
    const want = dx < 0 ? -1 : 1;
    if (want === this.facing || Math.abs(dx) < 90 || this.t - this.lastTurnAt < 1.8) return;
    this.facing = want;
    this.lastTurnAt = this.t;
  }

  /** 0 calm … 1 enraged (low HP): faster breathing, hotter furnace, red eyes. */
  setRage(k: number): void {
    this.rage = clamp01(k);
  }

  /** Brief hot-red flash; a crowd hitting her every frame flashes at most every 0.6 s so she stays readable. */
  hit(): void {
    if (this.t - this.lastFlashAt < 0.6) return;
    this.lastFlashAt = this.t;
    this.flash = 0.14;
    // An occasional flinch while she is not mid-attack
    if (this.pose === 'idle' && this.t - this.lastHurtAt > 2.5) {
      this.lastHurtAt = this.t;
      this.setPose('hurt');
    }
  }

  get dead(): boolean {
    return this.pose === 'dead';
  }

  /** The collapse and dissolve have run their course: nothing of her is left on screen. */
  get gone(): boolean {
    return this.dissolveT >= 1;
  }

  /** Scene points the battle's effects attach to. */
  mouth(): { x: number; y: number } { return this.toScene(this.mouthLocal); }
  tailTip(): { x: number; y: number } { return this.toScene(this.tailTipLocal); }
  claw(): { x: number; y: number } { return this.toScene(this.clawLocal); }
  get facingSign(): number { return this.facing; }

  private toScene(p: { x: number; y: number }) {
    return { x: this.container.x + p.x * this.facingK * ART.scale, y: this.container.y + p.y * ART.scale };
  }

  update(dt: number): void {
    this.t += dt;
    this.poseT += dt;
    this.flash = Math.max(0, this.flash - dt);
    if (this.pose === 'dead') {
      this.deathT = Math.min(1, this.deathT + dt / COLLAPSE_S);
      if (this.deathT >= 1) this.dissolveT = Math.min(1, this.dissolveT + dt / DISSOLVE_S);
    } else if (this.pose !== 'idle' && this.poseT > this.poseLen) {
      this.pose = 'idle';
    }
    // Turning: a quick squash through the middle instead of an instant mirror
    const step = dt * 7;
    if (this.facingK !== this.facing) {
      const next = this.facingK + Math.sign(this.facing - this.facingK) * step;
      this.facingK = Math.abs(next - this.facing) < step ? this.facing : Math.abs(next) < 0.12 ? 0.12 * this.facing : next;
    }
    this.applyTint();
    this.draw();
    this.updateEmbers(dt);
  }

  private applyTint(): void {
    const dissolving = this.deathT > 0;
    if (dissolving) {
      const k = clamp01(this.deathT * 0.25 + this.dissolveT * 0.9);
      for (const p of this.parts) p.img.setTint(lerpTint(p.base, k));
      this.tinted = true;
      return;
    }
    if (this.flash > 0) {
      for (const p of this.parts) p.img.setTint(0xffb0a0);
      this.tinted = true;
    } else if (this.tinted) {
      for (const p of this.parts) {
        if (p.base !== 0xffffff) p.img.setTint(p.base);
        else p.img.clearTint();
      }
      this.tinted = false;
    }
  }

  /** Dissolve: embers lift off her outline while she darkens to ash. */
  private updateEmbers(dt: number): void {
    const g = this.emberGfx;
    g.clear();
    if (this.dissolveT > 0 && this.dissolveT < 1) {
      const n = Math.round((90 * (1 - this.dissolveT * 0.6)) * dt + Math.random());
      for (let i = 0; i < n && this.embers.length < 260; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random());
        this.embers.push({
          x: Math.cos(a) * 300 * r + 40 * this.facingK, y: -150 + Math.sin(a) * 110 * r + 60 * this.deathT,
          vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 70, t: 0, life: 1.1 + Math.random() * 1.2, r: 1.5 + Math.random() * 2.5,
        });
      }
    }
    for (const e of this.embers) {
      e.t += dt;
      e.x += (e.vx + Math.sin(this.t * 3 + e.y * 0.05) * 14) * dt;
      e.y += e.vy * dt;
      const a = 1 - e.t / e.life;
      const hot = a > 0.5;
      g.fillStyle(hot ? 0xfbbf24 : 0xf97316, 0.85 * a);
      g.fillCircle(e.x, e.y, e.r * (0.5 + a * 0.5));
    }
    this.embers = this.embers.filter((e) => e.t < e.life);
  }

  private draw(): void {
    const t = this.t;
    const pt = this.poseT;
    const len = Math.max(0.01, this.poseLen);
    const rage = this.rage;
    const breathe = Math.sin(t * (1.6 + rage * 1.6));
    const collapse = easeOut(this.deathT);
    const sink = collapse * 70;
    const tilt = collapse;
    this.rig.setScale(this.facingK, 1);

    // Pose drivers (each 0..1)
    let clawLift = 0, clawSwipe = 0, lean = 0;
    let coil = 0, whip = 0, twist = 0;
    let rear = 0, lunge = 0, jawOpen = 0, shake = 0, spread = 0;
    let recoil = 0, furnace = 0;
    const settle = (from: number, over: number) => (pt > from ? clamp01(1 - (pt - from) / over) : 1);
    switch (this.pose) {
      case 'claw': {
        const wind = clamp01(pt / 0.38);
        const rake = clamp01((pt - 0.38) / 0.16);
        const back = clamp01((pt - 0.62) / 0.4);
        clawLift = (pt < 0.38 ? easeOut(wind) : 1 - rake) * (1 - back);
        clawSwipe = rake * (1 - back);
        lean = -0.6 * clawLift + clawSwipe * (1 - back);
        jawOpen = 0.45 * clawSwipe;
        spread = 0.3 * clawLift;
        break;
      }
      case 'tailwhip': {
        coil = pt < 0.33 ? easeOut(pt / 0.33) : clamp01(1 - (pt - 0.33) / 0.1);
        whip = pt < 0.33 ? 0 : pt < 0.5 ? easeIn((pt - 0.33) / 0.17) : clamp01(1 - (pt - 0.5) / 0.7);
        twist = coil * 0.6 - whip * 0.9;
        spread = 0.25 * whip;
        break;
      }
      case 'breath': {
        const charge = Math.min(this.charge, len - 0.2);
        if (pt < charge) {
          rear = easeOut(pt / charge);
          jawOpen = 0.2 * rear;
          furnace = pt / charge;
          spread = 0.5 * rear;
        } else {
          const b = clamp01((pt - charge) / 0.18);
          const end = settle(len - 0.35, 0.35);
          rear = (1 - b) * end;
          lunge = b * end;
          jawOpen = (0.95 * lunge + 0.2 * (1 - b)) * end;
          furnace = end;
          shake = lunge;
          spread = 0.35 * end;
        }
        break;
      }
      case 'roar':
      case 'summon': {
        rear = easeOut(clamp01(pt / 0.4)) * settle(len - 0.35, 0.35);
        jawOpen = (this.pose === 'roar' ? 1 : 0.55) * rear;
        shake = this.pose === 'roar' ? rear * 0.6 : 0;
        spread = rear;
        break;
      }
      case 'hurt':
        recoil = Math.sin(clamp01(pt / len) * Math.PI);
        break;
    }
    const jx = shake ? (Math.random() - 0.5) * 4 * shake : 0;
    const jy = shake ? (Math.random() - 0.5) * 3 * shake : 0;

    // Body breathes; the furnace in her belly pulses with it, builds before a breath and burns hotter in rage
    this.body.setPosition(lean * 18 - recoil * 14 + twist * 12 + jx, -120 + breathe * 3 + sink + jy)
      .setScale(1 / SS, (1 + breathe * 0.012 - recoil * 0.02) / SS)
      .setRotation(tilt * 0.12 + lean * 0.05 + twist * 0.06 - recoil * 0.04);
    const pulse = (breathe + 1) / 2;
    this.bellyGlow.setPosition(40 + lean * 18, -78 + sink).setScale(2.6 + furnace * 0.6, 1.1 + furnace * 0.3)
      .setAlpha(Math.max(0, 0.18 + 0.08 * pulse + furnace * 0.45 + rage * 0.15 * pulse - this.deathT * 0.5));

    // Tail: a chain swaying behind her; it coils up, then lashes forward under her and follows through
    let tx = -170 + twist * 20, ty = -118 + sink, ang = Math.PI * 0.94 + twist * 0.15;
    this.tail.forEach((seg, i) => {
      const s = 1.05 - i * 0.075;
      const lash = clamp01(whip * 1.5 - i * 0.07);
      ang += Math.sin(t * 0.9 - i * 0.55) * 0.08 * (1 - whip) + (i === 0 ? 0 : -0.035) + coil * 0.11 - lash * 0.17;
      seg.setPosition(tx, ty).setScale(s / SS).setRotation(ang - Math.PI);
      const segLen = 50 * s;
      tx += Math.cos(ang) * segLen;
      ty += Math.sin(ang) * segLen * 0.7 + 4;
    });
    this.tailTipLocal = { x: tx, y: ty };

    // Wings: far wing behind, near wing in front; they spread on attacks and beat when she roars, fold as she dies
    const beat = this.pose === 'roar' ? Math.sin(pt * 11) * 0.5 * rear : Math.sin(t * 1.1) * 0.25;
    const wingLift = (beat + spread * 0.45) * (1 - tilt);
    const fold = collapse * 0.9;
    const wingAlpha = 1 - Math.max(0, this.deathT - 0.5);
    // In death the wings droop and fold flat onto her back instead of standing up
    this.wingFar.setPosition(70 + lean * 10, -206 + sink + fold * 40).setRotation(-0.1 - wingLift * 0.3 - fold * 0.25)
      .setScale(0.74 / SS, (0.74 - Math.abs(wingLift) * 0.2) * (1 - fold * 0.7) / SS).setAlpha(wingAlpha);
    this.wingNear.setPosition(20 + lean * 10, -190 + sink + fold * 40).setRotation(0.06 - wingLift * 0.38 - fold * 0.2)
      .setScale(0.8 / SS, (0.8 - Math.abs(wingLift) * 0.24) * (1 - fold * 0.7) / SS).setAlpha(wingAlpha);

    // Legs; the near foreleg rears back, then rakes forward and down on a claw
    for (const l of this.legs) {
      if (l.fore && l.near) {
        const x = l.x - clawLift * 24 + clawSwipe * 105 + lean * 10;
        const y = l.y - clawLift * 78 - clawSwipe * 6 + sink * 0.6;
        l.img.setPosition(x, y).setRotation(clawLift * 0.85 - clawSwipe * 1.15 + 0.05 * breathe);
        this.clawLocal = { x: x + 40 + clawSwipe * 50, y: y + 120 };
      } else {
        const brace = l.fore ? 0 : whip * 0.12;
        l.img.setPosition(l.x + (l.fore ? lean * 8 : 0), l.y + sink * 0.6).setRotation((l.fore ? 0.05 : -0.05) * breathe - brace);
      }
    }

    // Neck and head: rear back to inhale / roar, lunge low for the blast, jerk on a flinch
    const hx = 250 + lunge * 80 - rear * 60 + lean * 36 - recoil * 30 - twist * 44 + jx;
    const hy = -290 + lunge * 95 - rear * 55 + Math.sin(t * (1.3 + rage)) * 10 + sink * 1.4 + tilt * 140 + clawSwipe * 34 + jy;
    const bx = 150 + lean * 14, by = -170 + sink;
    const cx = bx + 70, cy = by - 120 + lunge * 50;
    this.neck.forEach((n, i) => {
      const k = 0.06 + i * 0.14;
      const x = (1 - k) * (1 - k) * bx + 2 * (1 - k) * k * cx + k * k * hx;
      const y = (1 - k) * (1 - k) * by + 2 * (1 - k) * k * cy + k * k * hy;
      const dx = 2 * (1 - k) * (cx - bx) + 2 * k * (hx - cx);
      const dy = 2 * (1 - k) * (cy - by) + 2 * k * (hy - cy);
      n.setPosition(x, y).setRotation(Math.atan2(dy, dx)).setScale((1.12 - i * 0.05 + furnace * 0.04) / SS);
    });
    const headRot = -0.08 - rear * 0.3 + lunge * 0.38 + tilt * 0.6 + clawSwipe * 0.15 - recoil * 0.22 - twist * 0.1;
    this.head.setPosition(hx, hy).setRotation(headRot);
    const hinge = { x: 34, y: 14 };
    const c = Math.cos(headRot), s = Math.sin(headRot);
    this.jaw.setPosition(hx + hinge.x * c - hinge.y * s, hy + hinge.x * s + hinge.y * c).setRotation(headRot + jawOpen * 0.6);
    // Eye and maw glow ride the head
    const eye = { x: 106, y: -20 };
    this.eyeGlow.setPosition(hx + eye.x * c - eye.y * s, hy + eye.x * s + eye.y * c)
      .setScale(0.3 + rage * 0.12)
      .setTint(rage > 0.5 ? 0xff6a3d : 0xffffff)
      .setAlpha(this.deathT < 0.5 ? 0.75 + 0.2 * Math.sin(t * (3 + rage * 4)) : 0);
    const maw = { x: 150, y: 26 };
    const mx = hx + maw.x * c - maw.y * s, my = hy + maw.x * s + maw.y * c;
    this.mouthLocal = { x: mx, y: my };
    const mawHeat = Math.max(jawOpen, furnace * 0.5);
    this.mawGlow.setPosition(mx, my)
      .setScale(0.9 + mawHeat * 0.9, 0.4 + mawHeat * 0.7).setAlpha(mawHeat > 0.1 ? 0.35 + 0.6 * mawHeat : 0);

    // Summon / roar: heat rings pulse outward from her
    const ring = this.heatRing;
    ring.clear();
    if (this.pose === 'summon' || this.pose === 'roar') {
      for (let i = 0; i < 3; i++) {
        const k = pt - i * 0.22;
        if (k <= 0) continue;
        ring.lineStyle(6 - i * 2, i === 1 ? 0xfbbf24 : 0xf97316, Math.max(0, 0.7 - k * 0.55));
        ring.strokeEllipse(0, 0, 240 + k * 600, 90 + k * 230);
      }
    }
    this.shadow.setScale(1 - collapse * 0.1 - this.dissolveT * 0.4, 1).setAlpha(0.45 * (1 - this.dissolveT));
    this.rig.setAlpha(1 - Math.pow(this.dissolveT, 1.3));
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
