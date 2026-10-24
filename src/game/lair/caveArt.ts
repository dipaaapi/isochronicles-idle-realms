/**
 * Canvas2D painting for the Dragon's Lair cavern: a rough-rock pass that
 * breaks the floor and walls into grainy, pitted stone (no polished tiles),
 * and speleothems (stalagmites rising from the floor, stalactites hanging
 * from the wall crests) with flowstone rings, ember rim light and wet streaks.
 */

type Ctx = CanvasRenderingContext2D;

const hash = (x: number, y: number, s = 0) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return n - Math.floor(n);
};

/** Smooth value noise in 0..1. */
export const valueNoise = (x: number, y: number, s = 0): number => {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
};

/** Three octaves: big slabs, fist-sized lumps, grit. */
const rock = (x: number, y: number) =>
  valueNoise(x / 46, y / 23) * 0.5 + valueNoise(x / 13, y / 6.5, 3) * 0.32 + valueNoise(x / 3.5, y / 1.8, 7) * 0.18;

/**
 * Roughens everything already painted (floor and walls) in `block`-pixel
 * cells: mottled light/dark stone, pits, grit speckles and ridge highlights.
 * The abyss (near-black) is left alone.
 */
export function roughen(ctx: Ctx, w: number, h: number, block = 2): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let by = 0; by < h; by += block) {
    for (let bx = 0; bx < w; bx += block) {
      const o0 = (by * w + bx) * 4;
      if (d[o0] + d[o0 + 1] + d[o0 + 2] < 30) continue;
      const r = rock(bx, by);
      // Light falls from up-left: a ridge facing it is brighter, the far side darker
      const slope = rock(bx - 3, by - 2) - rock(bx + 3, by + 2);
      const grit = hash(bx, by, 11);
      let k = 0.62 + r * 0.62 + slope * 1.6;
      if (grit > 0.93) k *= 1.28;
      else if (grit < 0.06) k *= 0.55;
      if (r < 0.3) k *= 0.7; // pits and hollows
      for (let yy = by; yy < Math.min(h, by + block); yy++) {
        for (let xx = bx; xx < Math.min(w, bx + block); xx++) {
          const o = (yy * w + xx) * 4;
          // Band the result so the stone reads as pixel art, not a smooth gradient
          for (let c = 0; c < 3; c++) d[o + c] = Math.min(255, Math.round((d[o + c] * k) / 6) * 6);
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

export type Speleothem = 'mite' | 'tite';

/**
 * A stalagmite (point up, base at the bottom of the canvas) or a stalactite
 * (point down, root at the top), `w`×`h` px. Lumpy silhouette, flowstone
 * rings, cool shadow side, ember rim on the lit side and a wet glint.
 */
export function paintSpeleothem(ctx: Ctx, w: number, h: number, kind: Speleothem, seed: number): void {
  const up = kind === 'mite';
  const cx = w / 2 + (hash(seed, 1) - 0.5) * w * 0.12;
  // Silhouette: half-widths from root to tip, bulging where drips pooled
  const rows = 24;
  const profile: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const k = i / rows; // 0 root .. 1 tip
    // Each one tapers differently: squat mounds, needles, blunt drip-fed columns
    const taper = Math.pow(1 - k * (0.92 + hash(seed, 9) * 0.08), (up ? 0.55 : 0.9) + hash(seed, 5) * 0.8);
    const bulge = 1 + Math.sin(k * (6 + hash(seed, 3) * 8) + seed) * 0.12 + (valueNoise(k * 7, seed) - 0.5) * 0.4;
    profile.push(Math.max(0.6, (w / 2 - 2) * taper * bulge));
  }
  const yAt = (k: number) => (up ? h - 4 - k * (h - 6) : 2 + k * (h - 6));
  const tipLean = (hash(seed, 2) - 0.5) * w * 0.25;
  const xAt = (k: number) => cx + tipLean * k * k;
  const outline = () => {
    ctx.beginPath();
    for (let i = 0; i <= rows; i++) {
      const k = i / rows;
      const x = xAt(k) - profile[i], y = yAt(k);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    for (let i = rows; i >= 0; i--) {
      const k = i / rows;
      ctx.lineTo(xAt(k) + profile[i], yAt(k));
    }
    ctx.closePath();
  };

  outline();
  const body = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
  body.addColorStop(0, '#6b5a50');
  body.addColorStop(0.35, '#4a3d36');
  body.addColorStop(0.75, '#261d19');
  body.addColorStop(1, '#120d0b');
  ctx.fillStyle = body;
  ctx.fill();
  ctx.save();
  outline();
  ctx.clip();
  // Vertical darkening toward the root (less light reaches it)
  const v = ctx.createLinearGradient(0, up ? h : 0, 0, up ? 0 : h);
  v.addColorStop(0, 'rgba(0,0,0,0.45)');
  v.addColorStop(0.5, 'rgba(0,0,0,0.1)');
  v.addColorStop(1, 'rgba(255,230,200,0.08)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  // Flowstone rings: dark grooves with a pale lip
  for (let i = 2; i < rows - 1; i += 2 + Math.floor(hash(seed, i) * 2)) {
    const k = i / rows, y = yAt(k), r = profile[i];
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(xAt(k), y, r, Math.max(0.8, r * 0.28), 0, 0, Math.PI);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(214,196,176,0.22)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(xAt(k), y - (up ? 1 : -1), r * 0.92, Math.max(0.6, r * 0.25), 0, Math.PI * 0.1, Math.PI * 0.7);
    ctx.stroke();
  }
  // Ember rim on the lit (left) side
  ctx.strokeStyle = 'rgba(251,146,60,0.35)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 0; i <= rows; i++) {
    const k = i / rows;
    const x = xAt(k) - profile[i] + 1, y = yAt(k);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.stroke();
  // Wet glint streak
  ctx.strokeStyle = 'rgba(220,235,255,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 3; i < rows - 2; i++) {
    const k = i / rows;
    const x = xAt(k) - profile[i] * 0.45, y = yAt(k);
    if (i > 3) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
  // A clinging drop at a stalactite's tip
  if (!up) {
    ctx.fillStyle = 'rgba(190,220,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(xAt(1), yAt(1) + 1.5, 1.3, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Pebbles around the foot
    for (let i = 0; i < 5; i++) {
      const x = cx + (hash(seed, i + 20) - 0.5) * w * 1.0, y = h - 3 - hash(seed, i + 30) * 3, r = 1.2 + hash(seed, i + 40) * 2;
      ctx.fillStyle = '#1a1310';
      ctx.beginPath();
      ctx.ellipse(x + 0.6, y + 0.6, r, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a4a40';
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Hard alpha + a one-pixel dark outline, so speleothems sit in the same pixel style as the units. */
export function crispen(ctx: Ctx, w: number, h: number): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = d[i * 4 + 3];
    if (a < 90) d[i * 4 + 3] = 0;
    else {
      d[i * 4 + 3] = 255;
      solid[i] = 1;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (solid[i]) continue;
      if ((x > 0 && solid[i - 1]) || (x < w - 1 && solid[i + 1]) || (y > 0 && solid[i - w]) || (y < h - 1 && solid[i + w])) {
        d[i * 4] = 8; d[i * 4 + 1] = 5; d[i * 4 + 2] = 4; d[i * 4 + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}
