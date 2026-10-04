import React, { useEffect, useRef, useState } from 'react';
import { RESOURCE_BUILDING_CONFIG } from '../state/useGameStore';
import { DEFENSE_TEXT } from '../state/defenseStats';
import { BUILDING_SITES, CASTLE_FOOTPRINT, SPIRE_FOOTPRINT } from '../state/buildingLayout';
import { FALLBACK_COLORS } from '../game/StructureManager';
import { STRUCTURE_PIXEL, subscribeStructureStrips } from '../game/sprites/StructureSprites';
import type { BakedStrip } from '../game/sprites/structureBake.worker';
import { STRUCTURE_ART, type StructureKey } from '../game/sprites/structureModels';
import type { ResourceBuildingId } from '../types/state';
import { soundFx } from '../game/audio/soundFx';
import TEXT from '../i18n/structureAtlas.json';

/**
 * Atlas "Structures" tab: every structure drawn from the same baked strip the
 * game uses, in each state (construction, idle, firing, hit, destroyed). The
 * effects copy StructureManager's (same colours, timings and particle ranges)
 * so this page is the design reference for the in-game buildings.
 */

type Localized = { en: string; tl: string };
type PreviewState = 'build' | 'idle' | 'attack' | 'hit' | 'destroyed';

const STATES: PreviewState[] = ['build', 'idle', 'attack', 'hit', 'destroyed'];

interface Entry {
  key: StructureKey;
  name: Localized;
  icon: string;
  /** Footprint edge in tiles (HP bar width). */
  tiles: number;
}

const building = (key: StructureKey, id: ResourceBuildingId): Entry => ({
  key,
  name: { en: RESOURCE_BUILDING_CONFIG[id].labelEn, tl: RESOURCE_BUILDING_CONFIG[id].label },
  icon: RESOURCE_BUILDING_CONFIG[id].icon,
  tiles: BUILDING_SITES[id].footprint.w,
});

const ENTRIES: Entry[] = [
  { key: 'castle', name: { en: 'Citadel', tl: 'Kuta' }, icon: '🏰', tiles: CASTLE_FOOTPRINT.w },
  { key: 'spire', name: DEFENSE_TEXT.spireName, icon: '💎', tiles: SPIRE_FOOTPRINT.w },
  { key: 'portal', name: TEXT.portalName, icon: '🌀', tiles: 1 },
  { key: 'sentinel', name: TEXT.sentinelName, icon: '🗼', tiles: 1 },
  building('quarry', 'QUARRY'),
  building('mine', 'MINE'),
  building('grove', 'WOOD'),
  building('port', 'PORT'),
  building('cave', 'CAVE'),
  building('trench', 'TRENCH'),
  building('crypt', 'CRYPT'),
  building('perch', 'PERCH'),
  building('kennel', 'KENNEL'),
  building('foundry', 'FOUNDRY'),
  building('pavilion', 'PAVILION'),
  building('voidgate', 'VOIDGATE'),
  building('ossuary', 'OSSUARY'),
];

const artUrl = (key: StructureKey) => `${import.meta.env.BASE_URL}structures/${STRUCTURE_ART[key]}.jpg`;

/** Which strip animation each preview state plays. */
const animFor = (key: StructureKey, state: PreviewState): string => {
  if (key === 'portal') return { build: 'dormant', idle: 'idle', attack: 'spawn', hit: 'idle', destroyed: 'destroyed' }[state];
  if (key === 'sentinel') return { build: 'idle', idle: 'idle', attack: 'attack', hit: 'idle', destroyed: 'destroyed' }[state];
  return { build: 'site', idle: 'idle', attack: key === 'castle' ? 'pulse' : 'attack', hit: 'idle', destroyed: 'ruined' }[state];
};

// ── Strip images ──────────────────────────────────────────────────────────────

interface StripImages {
  plain: HTMLCanvasElement;
  /** Whole strip multiplied by the game's hit tint (0xff9a9a). */
  tinted: HTMLCanvasElement;
  /** Solid white silhouette (the portal's hit flash, setTintFill). */
  white: HTMLCanvasElement;
}

const imageCache = new WeakMap<BakedStrip, StripImages>();

function stripImages(strip: BakedStrip): StripImages {
  const cached = imageCache.get(strip);
  if (cached) return cached;
  const plain = document.createElement('canvas');
  plain.width = strip.width;
  plain.height = strip.height;
  plain.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(strip.data), strip.width, strip.height), 0, 0);
  const tinted = document.createElement('canvas');
  tinted.width = strip.width;
  tinted.height = strip.height;
  const t = tinted.getContext('2d')!;
  t.drawImage(plain, 0, 0);
  t.globalCompositeOperation = 'multiply';
  t.fillStyle = '#ff9a9a';
  t.fillRect(0, 0, strip.width, strip.height);
  t.globalCompositeOperation = 'destination-in';
  t.drawImage(plain, 0, 0);
  const white = document.createElement('canvas');
  white.width = strip.width;
  white.height = strip.height;
  const w = white.getContext('2d')!;
  w.drawImage(plain, 0, 0);
  w.globalCompositeOperation = 'source-in';
  w.fillStyle = '#ffffff';
  w.fillRect(0, 0, strip.width, strip.height);
  const images = { plain, tinted, white };
  imageCache.set(strip, images);
  return images;
}

// ── Effect simulation (mirrors StructureManager) ──────────────────────────────

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const easeQuadOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeSineOut = (t: number) => Math.sin((t * Math.PI) / 2);
const easeCubicOut = (t: number) => 1 - (1 - t) ** 3;

interface Particle {
  shape: 'circle' | 'rect';
  x0: number; y0: number; x1: number; y1: number;
  size: number; scale1: number; angle1: number;
  color: string; alpha0: number;
  age: number; life: number;
  ease: (t: number) => number;
}

class Sim {
  time = 0;
  animTime = 0;
  anim: string;
  particles: Particle[] = [];
  tintLeft = 0;
  tintWhite = false;
  shakeLeft = 0;
  shakeTotal = 0.28;
  shakeStep = 0.035;
  shakeIntensity = 0;
  shakeDir = { x: 1, y: 1 };
  timer = 0;
  hp = 1;
  wrecked = false;

  constructor(readonly entry: Entry, readonly state: PreviewState) {
    this.anim = animFor(entry.key, state);
  }

  get isPortal(): boolean {
    return this.entry.key === 'portal';
  }

  setAnim(anim: string): void {
    if (anim === this.anim) return;
    this.anim = anim;
    this.animTime = 0;
  }

  private shake(intensity: number, step: number, repeats: number, dir?: { x: number; y: number }): void {
    this.shakeStep = step;
    this.shakeTotal = this.shakeLeft = step * 2 * (repeats + 1);
    this.shakeIntensity = intensity;
    this.shakeDir = dir ?? { x: Math.random() > 0.5 ? 1 : -1, y: Math.random() > 0.5 ? 1 : -1 };
  }

  private burst(count: number, x0: number, y0: number, to: (i: number) => { x: number; y: number }, colors: (i: number) => string,
    size: number, life: number, ease: (t: number) => number, spin: boolean): void {
    for (let i = 0; i < count; i++) {
      const end = to(i);
      this.particles.push({
        shape: 'rect', x0, y0, x1: end.x, y1: end.y, size, scale1: 1, angle1: spin ? rand(-Math.PI, Math.PI) : 0,
        color: colors(i), alpha0: 1, age: 0, life, ease,
      });
    }
  }

  /** PortalManager.damage: white flash; the killing blow shakes and scatters blue/gold shards. */
  portalHit(final: boolean): void {
    this.tintLeft = 0.06;
    this.tintWhite = true;
    if (!final) return;
    this.shake(4, 0.04, 4, { x: 1, y: -1 });
    this.burst(16, 0, -26, () => ({ x: rand(-50, 50), y: -26 + rand(-40, 40) }), (i) => (i % 2 ? '#3b82f6' : '#fbbf24'), 4, 0.7, easeCubicOut, true);
  }

  /** PortalManager.sparkle: eight dots flung out of the rift. */
  sparkle(color: string): void {
    this.burst(8, 0, -26, (i) => {
      const a = (i / 8) * Math.PI * 2;
      return { x: Math.cos(a) * 26, y: -26 + Math.sin(a) * 30 };
    }, () => color, 3, 0.42, easeQuadOut, false);
  }

  /** StructureManager.damage: red flash, shudder, debris. */
  hit(intensity: number, debris: number): void {
    this.tintLeft = 0.09;
    this.tintWhite = false;
    this.shake(intensity, 0.035, 3);
    const color = hex(FALLBACK_COLORS[this.entry.key]);
    for (let i = 0; i < debris; i++) {
      const x0 = rand(-30, 30);
      const y0 = -rand(10, 50);
      this.particles.push({
        shape: 'rect', x0, y0, x1: x0 + rand(-40, 40), y1: y0 + rand(10, 40), size: 4, scale1: 1,
        angle1: rand(-Math.PI, Math.PI), color: i % 2 ? color : '#57534e', alpha0: 1, age: 0, life: rand(0.6, 0.9), ease: easeQuadOut,
      });
    }
  }

  dust(): void {
    const w = this.entry.tiles;
    const x0 = rand(-w * 18, w * 18);
    const y0 = rand(-6, 8);
    this.particles.push({
      shape: 'circle', x0, y0, x1: x0 + rand(-12, 12), y1: y0 - rand(12, 26), size: rand(3, 6), scale1: 1.8, angle1: 0,
      color: Math.random() < 0.5 ? '#d6b98c' : '#a8a29e', alpha0: 0.6, age: 0, life: 0.9, ease: easeSineOut,
    });
  }

  smoke(): void {
    const w = this.entry.tiles;
    const x0 = rand(-w * 16, w * 16);
    const y0 = -rand(10, 40);
    this.particles.push({
      shape: 'circle', x0, y0, x1: x0 + rand(-10, 18), y1: y0 - rand(40, 70), size: rand(5, 9), scale1: 2.2, angle1: 0,
      color: Math.random() < 0.3 ? '#f97316' : '#3f3f46', alpha0: 0.55, age: 0, life: 1.6, ease: easeSineOut,
    });
  }

  update(dt: number, strip: BakedStrip): void {
    this.time += dt;
    this.animTime += dt;
    this.tintLeft -= dt;
    this.shakeLeft -= dt;
    this.timer -= dt;
    for (const p of this.particles) p.age += dt;
    this.particles = this.particles.filter((p) => p.age < p.life);

    const base = animFor(this.entry.key, this.state);
    if (this.state === 'build' && !this.isPortal && this.timer <= 0) {
      this.timer = rand(0.25, 0.45);
      this.dust();
    } else if (this.state === 'attack') {
      // Fire, hold a moment, fire again (the citadel's pulse runs ~2.5 s)
      const { count } = strip.layout.animations[base] ?? { count: 1 };
      const busy = strip.loops.includes(base) ? 2.5 : count / (strip.rates[base] ?? 4);
      const cycle = this.time % (busy + 1.2);
      const anim = cycle < busy ? base : 'idle';
      if (anim !== this.anim) {
        this.setAnim(anim);
        if (anim === base && this.isPortal) this.sparkle('#93c5fd');
      }
    } else if (this.state === 'hit' && this.timer <= 0) {
      this.timer = this.isPortal ? 0.6 : 1.1;
      this.hp = this.hp - 0.12 < 0.2 ? 1 : this.hp - 0.12;
      if (this.isPortal) this.portalHit(false);
      else this.hit(3, Math.random() < 0.5 ? 4 : 0);
    } else if (this.state === 'destroyed') {
      const cycle = this.time % 6;
      if (cycle < dt) {
        this.wrecked = false;
        this.hp = 1;
        this.timer = 0;
        this.particles = [];
        this.setAnim('idle');
      }
      if (!this.wrecked && cycle >= 1.5) {
        this.wrecked = true;
        this.hp = 0;
        this.setAnim(base);
        if (this.isPortal) this.portalHit(true);
        else this.hit(6, 18);
      } else if (!this.wrecked && this.timer <= 0) {
        this.timer = 0.5;
        this.hp = Math.max(0.1, this.hp - 0.3);
        if (this.isPortal) this.portalHit(false);
        else this.hit(3, Math.random() < 0.5 ? 4 : 0);
      } else if (this.wrecked && !this.isPortal && this.timer <= 0) {
        this.timer = rand(0.35, 0.65);
        this.smoke();
      }
    }
  }

  frameIndex(strip: BakedStrip): number {
    const a = strip.layout.animations[this.anim] ?? strip.layout.animations.idle ?? { start: 0, count: 1 };
    const n = Math.floor(this.animTime * (strip.rates[this.anim] ?? 4));
    return a.start + (strip.loops.includes(this.anim) ? n % a.count : Math.min(n, a.count - 1));
  }

  /** HP shown like the game: only while damaged. */
  get barPct(): number | null {
    if (this.state !== 'hit' && this.state !== 'destroyed') return null;
    // A destroyed portal drops its bar; a wrecked building keeps an empty one
    return this.isPortal && this.wrecked ? null : this.hp;
  }
}

interface Geometry {
  /** CSS pixels per world unit. */
  u: number;
  cx: number;
  cy: number;
}

const CANVAS_W = 220;
const CANVAS_H = 230;

function geometryFor(strip: BakedStrip): Geometry {
  const fw = strip.layout.frameWidth * STRUCTURE_PIXEL;
  const above = strip.headroom * STRUCTURE_PIXEL + 34; // room for the HP / progress bar and smoke
  const below = (strip.layout.frameHeight - strip.layout.anchorY) * STRUCTURE_PIXEL + 14;
  const u = Math.min((CANVAS_W - 16) / fw, (CANVAS_H - 8) / (above + below));
  return { u, cx: CANVAS_W / 2, cy: 4 + above * u };
}

function drawSim(ctx: CanvasRenderingContext2D, sim: Sim, strip: BakedStrip, images: StripImages, g: Geometry): void {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  const { u, cx, cy } = g;
  const L = strip.layout;

  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, sim.entry.tiles * 30 * u, sim.entry.tiles * 15 * u, 0, 0, Math.PI * 2);
  ctx.fill();

  let sx = 0;
  let sy = 0;
  if (sim.shakeLeft > 0) {
    const phase = ((sim.shakeTotal - sim.shakeLeft) / sim.shakeStep) % 2;
    const tri = phase < 1 ? phase : 2 - phase;
    sx = sim.shakeDir.x * sim.shakeIntensity * tri;
    sy = sim.shakeDir.y * sim.shakeIntensity * tri;
  }
  const isSite = sim.state === 'build' && !sim.isPortal;
  const scaleY = isSite ? 1 + Math.sin(sim.time * 14) * 0.015 : 1;

  const frame = sim.frameIndex(strip);
  const src = sim.tintLeft > 0 ? (sim.tintWhite ? images.white : images.tinted) : images.plain;
  // Dormant portals sit at 75% alpha
  ctx.globalAlpha = sim.isPortal && sim.anim === 'dormant' ? 0.75 : 1;
  const px = STRUCTURE_PIXEL * u;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    src,
    frame * L.frameWidth, 0, L.frameWidth, L.frameHeight,
    cx + (sx - L.anchorX * STRUCTURE_PIXEL) * u,
    cy + (sy - L.anchorY * STRUCTURE_PIXEL * scaleY) * u,
    L.frameWidth * px,
    L.frameHeight * px * scaleY
  );
  ctx.globalAlpha = 1;

  for (const p of sim.particles) {
    const t = p.ease(Math.min(1, p.age / p.life));
    const x = cx + (p.x0 + (p.x1 - p.x0) * t) * u;
    const y = cy + (p.y0 + (p.y1 - p.y0) * t) * u;
    const s = 1 + (p.scale1 - 1) * t;
    ctx.globalAlpha = p.alpha0 * (1 - t);
    ctx.fillStyle = p.color;
    if (p.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(x, y, p.size * s * u, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.angle1 * t);
      ctx.fillRect((-p.size / 2) * u, (-p.size / 2) * u, p.size * u, p.size * u);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;

  // Bars sit where the game draws them: headroom + 6 above the anchor, footprint × 22 wide
  const width = sim.entry.tiles * 22 * u;
  const top = cy - (strip.headroom * STRUCTURE_PIXEL + 6) * u;
  const x = cx - width / 2;
  const h = Math.max(3, 4 * u);
  if (isSite) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - 1, top - 1, width + 2, h + 2);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(x, top, width, h);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(x, top, width * ((sim.time % 6) / 6), h);
  }
  const pct = sim.barPct;
  if (pct !== null && sim.isPortal) {
    // PortalManager: purple 36-wide bar at headroom + 4
    const ptop = cy - (strip.headroom * STRUCTURE_PIXEL + 4) * u;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(cx - 19 * u, ptop - u, 38 * u, 6 * u);
    ctx.fillStyle = '#a855f7';
    ctx.fillRect(cx - 18 * u, ptop, 36 * u * pct, 4 * u);
  } else if (pct !== null) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - 1, top - 1, width + 2, h + 2);
    ctx.fillStyle = pct > 0.5 ? '#22c55e' : pct > 0.25 ? '#f59e0b' : '#ef4444';
    ctx.fillRect(x, top, width * Math.max(0, Math.min(1, pct)), h);
  }
}

// ── Components ────────────────────────────────────────────────────────────────

const setupCanvas = (canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D => {
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(w * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
};

/** Static first idle frame, for the side-by-side picker. */
const Thumb: React.FC<{ strip?: BakedStrip }> = ({ strip }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!strip || !ref.current) return;
    const size = 64;
    const ctx = setupCanvas(ref.current, size, size);
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    const L = strip.layout;
    const { start } = L.animations.idle ?? { start: 0 };
    const scale = Math.min((size - 4) / L.frameWidth, (size - 4) / L.frameHeight);
    ctx.drawImage(
      stripImages(strip).plain,
      start * L.frameWidth, 0, L.frameWidth, L.frameHeight,
      (size - L.frameWidth * scale) / 2, (size - L.frameHeight * scale) / 2, L.frameWidth * scale, L.frameHeight * scale
    );
  }, [strip]);
  return <canvas ref={ref} style={{ width: 64, height: 64 }} className="block" />;
};

export const StructureAtlas: React.FC<{ isTL: boolean; searchQuery: string }> = ({ isTL, searchQuery }) => {
  const t = (text: Localized) => (isTL ? text.tl : text.en);
  const [strips, setStrips] = useState<Partial<Record<StructureKey, BakedStrip>>>({});
  const [selected, setSelected] = useState<StructureKey>('castle');
  const canvases = useRef<Array<HTMLCanvasElement | null>>([]);

  useEffect(
    () => subscribeStructureStrips((strip) => setStrips((prev) => ({ ...prev, [strip.key]: strip }))),
    []
  );

  const entry = ENTRIES.find((e) => e.key === selected)!;
  const strip = strips[selected];

  useEffect(() => {
    if (!strip) return;
    const images = stripImages(strip);
    const geom = geometryFor(strip);
    const sims = STATES.map((state) => new Sim(entry, state));
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      sims.forEach((sim, i) => {
        const canvas = canvases.current[i];
        if (!canvas) return;
        sim.update(dt, strip);
        drawSim(setupCanvas(canvas, CANVAS_W, CANVAS_H), sim, strip, images, geom);
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [strip, entry]);

  const q = searchQuery.toLowerCase();
  const visible = ENTRIES.filter((e) => !q || e.name.en.toLowerCase().includes(q) || e.name.tl.toLowerCase().includes(q));
  const stateText = entry.key === 'portal' ? TEXT.portalStates : TEXT.states;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400 leading-relaxed">{t(TEXT.intro)}</p>

      {/* Side-by-side picker: every structure's idle frame */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {visible.map((e) => (
          <button
            key={e.key}
            onClick={() => {
              soundFx.playClick();
              setSelected(e.key);
            }}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition cursor-pointer ${
              selected === e.key ? 'border-amber-400 bg-amber-950/30' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'
            }`}
          >
            {strips[e.key] ? <Thumb strip={strips[e.key]} /> : <div className="w-16 h-16 rounded-lg bg-slate-800/60 animate-pulse" />}
            <span className="text-[10px] font-bold text-slate-200 text-center leading-tight">
              {e.icon} {t(e.name)}
            </span>
          </button>
        ))}
      </div>

      {/* Selected structure */}
      <div className="p-4 rounded-2xl border border-amber-500/30 bg-slate-900/60 space-y-3">
        <div>
          <h3 className="text-sm font-black text-amber-200">
            {entry.icon} {t(entry.name)}
            <span className="ml-2 text-[10px] font-mono text-slate-500">
              {t(TEXT.footprint)} {entry.tiles}×{entry.tiles} · {entry.key}
            </span>
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed mt-1">{t(TEXT.structures[entry.key])}</p>
        </div>

        <figure className="rounded-xl border border-slate-800 bg-slate-950/70 p-2">
          <figcaption className="text-[11px] font-bold text-slate-200 mb-1">{t(TEXT.reference)}</figcaption>
          <img src={artUrl(entry.key)} alt={t(entry.name)} className="w-full max-w-md rounded-lg [image-rendering:pixelated]" />
        </figure>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {STATES.map((state, i) => (
            <div key={state} className="rounded-xl border border-slate-800 bg-slate-950/70 p-2 flex flex-col items-center">
              <div className="w-full flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-slate-200">{t(stateText[state])}</span>
                <span className="text-[9px] font-mono text-slate-500">{animFor(entry.key, state)}</span>
              </div>
              <div
                className="rounded-lg"
                style={{ background: 'radial-gradient(ellipse at 50% 70%, #1e293b 0%, #0b1120 75%)' }}
              >
                {strip ? (
                  <canvas
                    ref={(el) => (canvases.current[i] = el)}
                    style={{ width: CANVAS_W, height: CANVAS_H }}
                    className="block"
                  />
                ) : (
                  <div style={{ width: CANVAS_W, height: CANVAS_H }} className="flex items-center justify-center text-[11px] text-slate-500">
                    {t(TEXT.baking)}
                  </div>
                )}
              </div>
              <p className="text-[10px] text-slate-400 mt-1 text-center leading-snug">
                {t((entry.key === 'portal' ? TEXT.portalStateNotes : TEXT.stateNotes)[state])}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
