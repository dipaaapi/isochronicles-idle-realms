import ART from '../../data/cursorArt.json';

/**
 * Paints the custom cursor's frames as raw RGBA (no DOM, so a Node script can
 * preview them as PNG). Every state is built from the obsidian claw-arrow in
 * src/data/cursorArt.json; the battle reticle and loading rune are drawn here.
 */

export type CursorState = 'idle' | 'hover' | 'press' | 'grab' | 'disabled' | 'target' | 'wait';
export const CURSOR_STATES: CursorState[] = ['idle', 'hover', 'press', 'grab', 'disabled', 'target', 'wait'];

export interface CursorFrame { w: number; h: number; data: Uint8ClampedArray }
export interface CursorAnim { frames: CursorFrame[]; hotX: number; hotY: number; fps: number }

const SIZE = 22;
/** The arrow sits this far in, leaving room for its glow and sparks. */
const PAD = 3;

type RGBA = [number, number, number, number];
const hex = (h: string, a = 255): RGBA => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
};
const PALETTE: Record<string, RGBA> = Object.fromEntries(Object.entries(ART.palette).map(([k, v]) => [k, hex(v)]));
const C = Object.fromEntries(Object.entries(ART.colors).map(([k, v]) => [k, hex(v)])) as Record<keyof typeof ART.colors, RGBA>;

const blank = (): CursorFrame => ({ w: SIZE, h: SIZE, data: new Uint8ClampedArray(SIZE * SIZE * 4) });
const put = (f: CursorFrame, x: number, y: number, c: RGBA) => {
  if (x < 0 || y < 0 || x >= f.w || y >= f.h) return;
  const i = (y * f.w + x) * 4;
  f.data[i] = c[0]; f.data[i + 1] = c[1]; f.data[i + 2] = c[2]; f.data[i + 3] = c[3];
};
const alphaAt = (f: CursorFrame, x: number, y: number) => (x < 0 || y < 0 || x >= f.w || y >= f.h ? 0 : f.data[(y * f.w + x) * 4 + 3]);
const mix = (a: RGBA, b: RGBA, t: number): RGBA => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)).concat(Math.round(a[3] + (b[3] - a[3]) * t)) as RGBA;
const grey = (c: RGBA): RGBA => { const g = Math.round(c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11); return [g, g, Math.min(255, g + 12), c[3]]; };

/** The arrow with ember frame `ember`, offset by (dx, dy), colours mapped through `tint`. */
function arrow(f: CursorFrame, ember: number, dx = 0, dy = 0, tint: (c: RGBA, key: string) => RGBA = (c) => c): void {
  const swaps = ART.emberFrames[ember % ART.emberFrames.length] as Record<string, string>;
  ART.arrow.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const key = swaps[`${y},${x}`] ?? ch;
      put(f, PAD + x + dx, PAD + y + dy, tint(PALETTE[key], key));
    });
  });
}

/** 1-px halo around whatever is already painted. */
function halo(f: CursorFrame, c: RGBA): void {
  const spots: Array<[number, number]> = [];
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    if (alphaAt(f, x, y)) continue;
    if (alphaAt(f, x - 1, y) || alphaAt(f, x + 1, y) || alphaAt(f, x, y - 1) || alphaAt(f, x, y + 1)) spots.push([x, y]);
  }
  for (const [x, y] of spots) put(f, x, y, c);
}

const ring = (f: CursorFrame, cx: number, cy: number, r: number, c: RGBA, skip?: (deg: number) => boolean) => {
  for (let d = 0; d < 360; d += 4) {
    if (skip?.(d)) continue;
    const a = (d * Math.PI) / 180;
    put(f, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), c);
  }
};

function build(state: CursorState): CursorAnim {
  const fps = (ART.fps as Record<string, number>)[state] ?? 8;
  const tip = { hotX: PAD, hotY: PAD };
  const frames: CursorFrame[] = [];
  switch (state) {
    case 'idle':
      for (let i = 0; i < 4; i++) { const f = blank(); arrow(f, i); frames.push(f); }
      return { frames, ...tip, fps };
    case 'hover':
      // Aether glow breathes around the claw, the ember burns bright
      for (let i = 0; i < 4; i++) {
        const f = blank();
        arrow(f, i % 2 ? 2 : 0);
        const t = [0.35, 0.65, 1, 0.65][i];
        halo(f, mix(hex(ART.colors.glow, 90), C.glowHot, t));
        frames.push(f);
      }
      return { frames, ...tip, fps };
    case 'press': {
      // Pressed in by one pixel, sparks fly off the tip
      const sparks: Array<Array<[number, number]>> = [
        [[-1, -1], [1, -2], [-2, 1]],
        [[-2, -2], [2, -3], [-3, 2], [1, 1]],
        [[-3, -3], [3, -4], [-4, 3], [2, 2]],
      ];
      for (let i = 0; i < 3; i++) {
        const f = blank();
        arrow(f, 2, 1, 1, (c, k) => (k === 'O' ? mix(c, [0, 0, 0, 255], 0.35) : c));
        for (const [sx, sy] of sparks[i]) put(f, PAD + 1 + sx, PAD + 1 + sy, i === 0 ? C.sparkHot : C.spark);
        frames.push(f);
      }
      return { frames, hotX: PAD, hotY: PAD, fps };
    }
    case 'grab':
      // Dragging the map: claw tilted in, a crimson trail behind it
      for (let i = 0; i < 2; i++) {
        const f = blank();
        arrow(f, i * 2, 1, 1);
        put(f, PAD + 12, PAD + 15, hex('#dc2626', i ? 200 : 120));
        put(f, PAD + 13, PAD + 16, hex('#7f1d1d', i ? 120 : 200));
        frames.push(f);
      }
      return { frames, hotX: PAD, hotY: PAD, fps };
    case 'disabled': {
      const f = blank();
      arrow(f, 0, 0, 0, (c) => grey(c));
      // small no-sign at the arrow's tail
      ring(f, PAD + 12, PAD + 13, 3, C.no);
      for (let k = -2; k <= 2; k++) put(f, PAD + 12 + k, PAD + 13 - k, C.no);
      frames.push(f);
      return { frames, ...tip, fps };
    }
    case 'target': {
      // The Demon Lord's sky-laser lock-on: rotating crimson reticle, pulsing core
      const cx = Math.floor(SIZE / 2), cy = Math.floor(SIZE / 2);
      for (let i = 0; i < 6; i++) {
        const f = blank();
        const rot = i * 15;
        ring(f, cx, cy, 8, C.reticle, (d) => ((d - rot + 360) % 90) < 22);
        ring(f, cx, cy, 5, hex(ART.colors.reticle, 140));
        for (let q = 0; q < 4; q++) {
          const a = ((rot + q * 90 + 45) * Math.PI) / 180;
          for (let r = 9; r <= 10; r++) put(f, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), C.reticleHot);
        }
        const hot = i % 3 === 0 ? C.sparkHot : C.reticleHot;
        put(f, cx, cy, hot);
        if (i % 2 === 0) { put(f, cx - 1, cy, C.reticle); put(f, cx + 1, cy, C.reticle); put(f, cx, cy - 1, C.reticle); put(f, cx, cy + 1, C.reticle); }
        frames.push(f);
      }
      return { frames, hotX: Math.floor(SIZE / 2), hotY: Math.floor(SIZE / 2), fps };
    }
    case 'wait': {
      // Summoning circle: eight rune dots, one bright one spinning
      const cx = Math.floor(SIZE / 2), cy = Math.floor(SIZE / 2);
      for (let i = 0; i < 8; i++) {
        const f = blank();
        ring(f, cx, cy, 8, hex(ART.colors.rune, 110));
        for (let k = 0; k < 8; k++) {
          const a = ((k * 45 - 90) * Math.PI) / 180;
          const x = Math.round(cx + Math.cos(a) * 6), y = Math.round(cy + Math.sin(a) * 6);
          const lit = k === i, near = (k + 1) % 8 === i;
          const c = lit ? C.runeHot : near ? mix(C.rune, C.runeHot, 0.5) : C.rune;
          put(f, x, y, c);
          if (lit) { put(f, x + 1, y, c); put(f, x, y + 1, c); put(f, x + 1, y + 1, c); }
        }
        put(f, cx, cy, C.glowHot);
        frames.push(f);
      }
      return { frames, hotX: Math.floor(SIZE / 2), hotY: Math.floor(SIZE / 2), fps };
    }
  }
}

let cache: Record<CursorState, CursorAnim> | null = null;
export function cursorAnimations(): Record<CursorState, CursorAnim> {
  cache ??= Object.fromEntries(CURSOR_STATES.map((s) => [s, build(s)])) as Record<CursorState, CursorAnim>;
  return cache;
}
export const CURSOR_SCALE = ART.scale;
