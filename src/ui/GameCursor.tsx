import { useEffect, useRef } from 'react';
import { CURSOR_SCALE, cursorAnimations, type CursorState } from '../game/cursor/cursorArt';
import { useGameStore } from '../state/useGameStore';

/** Per-viewer toggle (Settings → Game); fine pointers only. */
const KEY = 'isochronicle_custom_cursor';
export const customCursorEnabled = (): boolean => {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
};
export const setCustomCursorEnabled = (on: boolean): void => {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event('isochronicle:cursor-toggle'));
};

const CLICKABLE = 'button, a[href], [role="button"], [role="tab"], select, summary, label[for], input[type="checkbox"], input[type="radio"], input[type="range"], input[type="file"], .cursor-pointer';
const TEXTUAL = 'input:not([type]), input[type="text"], input[type="search"], input[type="number"], input[type="email"], input[type="password"], textarea, [contenteditable="true"]';

/** Is a battle on (wave, invaders or open rifts)? Then the map shows the sky-laser reticle. */
const battleOn = () => {
  const s = useGameStore.getState();
  return s.invasion.isActive || (s.invasion.enemiesRemaining ?? 0) > 0;
};

/**
 * The Demon Lord's cursor: an animated pixel overlay that follows the pointer
 * (the native cursor is hidden by `body.game-cursor`). States: idle (ember
 * flicker), hover (aether glow on anything clickable), press, grab (dragging the
 * map), disabled, target (sky-laser reticle over the map in battle) and wait
 * (loading, any element with data-cursor="wait"). Text fields keep the native
 * caret. Frames are painted in src/game/cursor/cursorArt.ts.
 */
export function GameCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const fine = window.matchMedia?.('(pointer: fine)').matches ?? true;
    const anims = cursorAnimations();
    // Each frame as an ImageData once
    const images = Object.fromEntries(Object.entries(anims).map(([k, a]) => [k, a.frames.map((f) => new ImageData(new Uint8ClampedArray(f.data), f.w, f.h))])) as Record<CursorState, ImageData[]>;
    const size = anims.idle.frames[0].w;
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = `${size * CURSOR_SCALE}px`;
    canvas.style.height = `${size * CURSOR_SCALE}px`;

    let on = false;
    let state: CursorState = 'idle';
    let frame = 0;
    let last = 0;
    let x = -100, y = -100;
    let down = false;
    let downAt = { x: 0, y: 0 };
    let dragging = false;
    let over: Element | null = null;
    let raf = 0;

    const place = () => {
      const a = anims[state];
      canvas.style.transform = `translate(${x - a.hotX * CURSOR_SCALE}px, ${y - a.hotY * CURSOR_SCALE}px)`;
    };
    const draw = () => {
      const list = images[state];
      ctx.clearRect(0, 0, size, size);
      ctx.putImageData(list[frame % list.length], 0, 0);
    };

    const pick = (): CursorState | 'native' => {
      const el = over;
      if (!el) return 'idle';
      const tagged = el.closest('[data-cursor]')?.getAttribute('data-cursor');
      if (tagged === 'wait' || tagged === 'target') return tagged;
      if (el.closest(TEXTUAL)) return 'native';
      const btn = el.closest(CLICKABLE);
      if (btn && (btn as HTMLButtonElement).disabled) return 'disabled';
      if (el.closest('[aria-disabled="true"], .cursor-not-allowed')) return 'disabled';
      if (el instanceof HTMLCanvasElement) {
        if (dragging) return 'grab';
        if (down) return 'press';
        // Phaser sets the canvas's inline cursor to pointer over interactive objects
        if (el.style.cursor === 'pointer') return 'hover';
        return battleOn() ? 'target' : 'idle';
      }
      if (down) return 'press';
      return btn ? 'hover' : 'idle';
    };

    const update = () => {
      const next = pick();
      canvas.style.visibility = next === 'native' ? 'hidden' : 'visible';
      if (next === 'native') return;
      if (next !== state) { state = next; frame = 0; last = performance.now(); draw(); }
      place();
    };

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const a = anims[state];
      if (a.frames.length > 1 && t - last >= 1000 / a.fps) {
        last = t;
        frame = (frame + 1) % a.frames.length;
        // A press plays its sparks once, then holds
        if (state === 'press' && frame === 0) frame = a.frames.length - 1;
        draw();
      }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      x = e.clientX; y = e.clientY;
      over = e.target as Element;
      if (down && !dragging && Math.hypot(x - downAt.x, y - downAt.y) > 6 && over instanceof HTMLCanvasElement) dragging = true;
      update();
    };
    const onDown = (e: PointerEvent) => { if (e.pointerType !== 'mouse') return; down = true; downAt = { x: e.clientX, y: e.clientY }; update(); };
    const onUp = () => { down = false; dragging = false; update(); };
    const onLeave = () => { canvas.style.visibility = 'hidden'; };

    const enable = () => {
      const want = fine && customCursorEnabled();
      if (want === on) return;
      on = want;
      document.body.classList.toggle('game-cursor', on);
      canvas.style.display = on ? 'block' : 'none';
      if (on) {
        window.addEventListener('pointermove', onMove, { passive: true });
        window.addEventListener('pointerdown', onDown, { passive: true });
        window.addEventListener('pointerup', onUp, { passive: true });
        document.addEventListener('mouseleave', onLeave);
        // Stays hidden until the pointer first moves (no stray cursor in the corner)
        canvas.style.visibility = 'hidden';
        draw();
        raf = requestAnimationFrame(tick);
      } else {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointerup', onUp);
        document.removeEventListener('mouseleave', onLeave);
        cancelAnimationFrame(raf);
      }
    };
    enable();
    window.addEventListener('isochronicle:cursor-toggle', enable);
    // Battles start and end without the pointer moving: refresh the map state now and then
    const poll = window.setInterval(() => { if (on && over instanceof HTMLCanvasElement) update(); }, 400);
    return () => {
      window.removeEventListener('isochronicle:cursor-toggle', enable);
      window.clearInterval(poll);
      document.body.classList.remove('game-cursor');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[2147483647]"
      style={{ imageRendering: 'pixelated', display: 'none', willChange: 'transform' }}
    />
  );
}
