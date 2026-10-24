import React, { useEffect, useRef, useState } from 'react';
import type { StructureKey } from '../game/sprites/structureModels';
import type { BakedStrip } from '../game/sprites/structureBake.worker';
import { stripFrameOrigin, subscribeStructureStrips } from '../game/sprites/StructureSprites';

/** Pixels per strip, decoded once and shared by every thumbnail. */
const decoded = new WeakMap<BakedStrip, HTMLCanvasElement>();
const pixels = (strip: BakedStrip): HTMLCanvasElement => {
  let c = decoded.get(strip);
  if (!c) {
    c = document.createElement('canvas');
    c.width = strip.width;
    c.height = strip.height;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(strip.data), strip.width, strip.height), 0, 0);
    decoded.set(strip, c);
  }
  return c;
};

/**
 * A structure as it actually looks in the game: the first frame of its baked
 * idle state (or `anim`), fitted into the box. Shows `fallback` while the
 * strip is still baking. Replaces the old Codex pictures (removed 2026-10-24).
 */
export const StructureThumb: React.FC<{ structure: StructureKey; width: number; height: number; anim?: string; fallback?: React.ReactNode; className?: string }> = ({
  structure, width, height, anim = 'idle', fallback, className,
}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const [strip, setStrip] = useState<BakedStrip | undefined>();
  useEffect(() => subscribeStructureStrips((s) => { if (s.key === structure) setStrip(s); }), [structure]);
  useEffect(() => {
    const canvas = ref.current;
    if (!strip || !canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;
    const L = strip.layout;
    const start = (L.animations[anim] ?? L.animations.idle ?? { start: 0 }).start;
    const scale = Math.min((width - 2) / L.frameWidth, (height - 2) / L.frameHeight);
    const at = stripFrameOrigin(strip, start);
    ctx.drawImage(pixels(strip), at.x, at.y, L.frameWidth, L.frameHeight,
      (width - L.frameWidth * scale) / 2, (height - L.frameHeight * scale) / 2, L.frameWidth * scale, L.frameHeight * scale);
  }, [strip, width, height, anim]);
  if (!strip) return <>{fallback}</>;
  return <canvas ref={ref} style={{ width, height }} className={className} />;
};
