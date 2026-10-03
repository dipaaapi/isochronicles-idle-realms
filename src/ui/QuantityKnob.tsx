import React, { useRef } from 'react';

/**
 * Rotary quantity knob. The dial sweeps 270° (from 7:30 to 4:30 o'clock).
 * Dial position t ∈ [0, 1] maps to a value in [min, max]; for big ranges the
 * curve is quadratic (value = min + span·t²) so small amounts stay easy to hit
 * while a full turn still reaches the maximum. Drag, scroll (Shift = ×10),
 * or use the arrow / PageUp / PageDown / Home / End keys for exact steps.
 */

const SWEEP = 270;
const HALF = SWEEP / 2;

interface QuantityKnobProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  color?: string;
  label: string;
  disabled?: boolean;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const QuantityKnob: React.FC<QuantityKnobProps> = ({ value, min, max, onChange, color = '#f59e0b', label, disabled }) => {
  const dial = useRef<HTMLDivElement>(null);
  const span = Math.max(0, max - min);
  const exponent = span > 40 ? 2 : 1;
  const lastT = useRef(0);

  const toValue = (t: number) => clamp(min + Math.round(span * Math.pow(clamp(t, 0, 1), exponent)), min, max);
  const toT = (v: number) => (span === 0 ? 0 : Math.pow(clamp((v - min) / span, 0, 1), 1 / exponent));
  const t = toT(value);
  const angle = -HALF + t * SWEEP;

  const set = (v: number) => {
    const next = clamp(Math.round(v), min, max);
    if (next !== value) onChange(next);
  };

  const fromPointer = (event: React.PointerEvent) => {
    const rect = dial.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    // Degrees clockwise from 12 o'clock, in (-180, 180]
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    let next: number;
    if (Math.abs(deg) > HALF) {
      // Dead zone at the bottom: stick to whichever end we were nearer
      next = lastT.current > 0.5 ? 1 : 0;
    } else {
      next = (deg + HALF) / SWEEP;
    }
    lastT.current = next;
    set(toValue(next));
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (disabled) return;
    lastT.current = t;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    fromPointer(event);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (disabled || !(event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) return;
    fromPointer(event);
  };

  const onWheel = (event: React.WheelEvent) => {
    if (disabled) return;
    const step = event.shiftKey ? 10 : 1;
    set(value + (event.deltaY < 0 ? step : -step));
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const big = Math.max(10, Math.round(span / 10));
    const moves: Record<string, number> = {
      ArrowUp: value + 1, ArrowRight: value + 1, ArrowDown: value - 1, ArrowLeft: value - 1,
      PageUp: value + big, PageDown: value - big, Home: min, End: max,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    event.stopPropagation();
    set(moves[event.key]);
  };

  // Arc geometry (SVG units, centre 50,50)
  const r = 40;
  const polar = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: 50 + r * Math.cos(rad), y: 50 + r * Math.sin(rad) };
  };
  const arc = (from: number, to: number) => {
    const a = polar(from);
    const b = polar(to);
    const large = to - from > 180 ? 1 : 0;
    return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={dial}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        className={`keep-round relative h-32 w-32 touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
          disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'
        }`}
      >
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
          <path d={arc(-HALF, HALF)} fill="none" stroke="rgb(30 41 59)" strokeWidth="8" strokeLinecap="round" />
          {t > 0.001 && (
            <path d={arc(-HALF, angle)} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" />
          )}
        </svg>
        {/* Knob cap with a pointer notch */}
        <div
          className="keep-round absolute inset-[18%] rounded-full border border-slate-600 bg-gradient-to-b from-slate-700 to-slate-900 shadow-lg"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          <span className="absolute left-1/2 top-1.5 keep-round h-3 w-1 -translate-x-1/2 rounded-full" style={{ background: color }} />
        </div>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-xl font-black text-white">{value}</span>
          <span className="text-[9px] text-slate-400">/ {max}</span>
        </div>
      </div>
    </div>
  );
};
