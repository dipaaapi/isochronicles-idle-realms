import React, { useEffect, useRef, useState } from 'react';
import TUTORIAL from '../data/tutorial.json';
import { TUTORIAL_STEPS, useTutorial } from '../state/tutorial';
import { useLanguage } from '../i18n/useLanguage';
import { soundFx } from '../game/audio/soundFx';

type UiKey = keyof typeof TUTORIAL.ui;
type Rect = { x: number; y: number; w: number; h: number };

const PAD = 6;
const CARD_W = 320;
const DIM = 'rgba(2, 6, 23, 0.78)';

/** `**bold**` → <strong> */
const renderBody = (text: string) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') ? <strong key={i} className="text-amber-200">{part.slice(2, -2)}</strong> : <React.Fragment key={i}>{part}</React.Fragment>);

const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

/**
 * Dims everything but the current step's target (`data-tutorial="..."`), with a
 * card explaining it. "click" steps wait for the player to press the target;
 * the rest advance with Next. The world stays frozen until it ends.
 */
export function TutorialOverlay() {
  const { active, step, next, back, end } = useTutorial();
  const [lang] = useLanguage();
  const isTL = lang === 'TL';
  const ui = (k: UiKey) => (isTL ? TUTORIAL.ui[k].tl : TUTORIAL.ui[k].en);
  const current = active ? TUTORIAL_STEPS[step] : null;
  const target = current?.target ?? null;
  const [rect, setRect] = useState<Rect | null>(null);
  const rectRef = useRef<Rect | null>(null);
  rectRef.current = rect;

  // Show the sidebar tab the step points at
  useEffect(() => {
    if (!current) return;
    window.dispatchEvent(new CustomEvent('isochronicle:tutorial-focus', { detail: { tab: 'tab' in current ? current.tab : undefined } }));
  }, [current]);

  // Track the target's box every frame (layout shifts as tabs open and the sidebar animates)
  useEffect(() => {
    if (!target) { setRect(null); return; }
    let raf = 0;
    const tick = () => {
      const el = document.querySelector(`[data-tutorial="${target}"]`);
      const r = el?.getBoundingClientRect();
      const nextRect = r && r.width > 0 ? { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 } : null;
      setRect((prev) => (sameRect(prev, nextRect) ? prev : nextRect));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [target]);

  // "click" steps: advance once the player presses the highlighted control
  useEffect(() => {
    if (!current || current.advance !== 'click' || !target) return;
    // Judged by position, so nothing the HUD does with the event can swallow it
    const inside = (e: PointerEvent) => {
      const r = rectRef.current;
      return !!r && e.clientX >= r.x && e.clientX <= r.x + r.w && e.clientY >= r.y && e.clientY <= r.y + r.h;
    };
    let pressed = false;
    const onDown = (e: PointerEvent) => { pressed = inside(e); };
    const onUp = (e: PointerEvent) => {
      if (pressed && inside(e)) window.setTimeout(next, 0);
      pressed = false;
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUp, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
    };
  }, [current, target, next]);

  // Presses the highlighted control for the player, so a click step can never strand them
  const pressTarget = () => {
    const el = target ? document.querySelector<HTMLElement>(`[data-tutorial="${target}"]`) : null;
    el?.click();
    next();
  };

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      // Keep the HUD's shortcuts from firing behind the guide
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); if (current?.advance === 'click') pressTarget(); else next(); }
      if (e.key === 'Escape') { e.preventDefault(); end(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active, current, next, end, target]);

  if (!current) return null;

  const isLast = step === TUTORIAL_STEPS.length - 1;
  const waitsForClick = current.advance === 'click';
  // The hole lets clicks through only where the step asks for them (and on the map, to try panning)
  const holeOpen = waitsForClick || target === 'map';
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Card beside the spotlight: left of it when there is room (the sidebar is on the right), else below / above
  let cardStyle: React.CSSProperties = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: CARD_W };
  if (rect) {
    const big = rect.w > vw * 0.5;
    let left: number;
    let top: number;
    if (big) { left = rect.x + rect.w / 2 - CARD_W / 2; top = rect.y + rect.h - 220; }
    else if (rect.x > CARD_W + 24) { left = rect.x - CARD_W - 16; top = rect.y; }
    else if (vw - (rect.x + rect.w) > CARD_W + 24) { left = rect.x + rect.w + 16; top = rect.y; }
    else { left = rect.x + rect.w / 2 - CARD_W / 2; top = rect.y + rect.h + 12 > vh - 220 ? rect.y - 232 : rect.y + rect.h + 12; }
    cardStyle = {
      left: Math.max(16, Math.min(vw - CARD_W - 16, left)),
      top: Math.max(16, Math.min(vh - 240, top)),
      width: Math.min(CARD_W, vw - 32),
    };
  }

  const blocker = (style: React.CSSProperties) => <div className="fixed" style={{ background: DIM, ...style }} />;

  return (
    <div className="fixed inset-0 z-[250]" role="dialog" aria-modal="true" aria-label={isTL ? current.titleTl : current.titleEn}>
      {rect ? <>
        {blocker({ left: 0, top: 0, width: vw, height: Math.max(0, rect.y) })}
        {blocker({ left: 0, top: rect.y + rect.h, width: vw, height: Math.max(0, vh - rect.y - rect.h) })}
        {blocker({ left: 0, top: rect.y, width: Math.max(0, rect.x), height: rect.h })}
        {blocker({ left: rect.x + rect.w, top: rect.y, width: Math.max(0, vw - rect.x - rect.w), height: rect.h })}
        <div
          className={`fixed rounded-xl border-2 border-amber-300 shadow-[0_0_24px_rgba(252,211,77,0.55)] ${waitsForClick ? 'animate-pulse' : ''} ${holeOpen ? 'pointer-events-none' : ''}`}
          style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
        />
      </> : blocker({ inset: 0 })}

      <div className="game-modal fixed rounded-2xl border border-purple-500/50 bg-slate-950/95 p-4 shadow-2xl animate-fade-in" style={cardStyle}>
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider mb-1.5">
          <span className="text-purple-300">{ui('step').replace('{n}', String(step + 1)).replace('{total}', String(TUTORIAL_STEPS.length))}</span>
          <span className="text-sky-300">❄ {ui('frozen')}</span>
        </div>
        <h3 className="text-sm font-bold text-white mb-1.5">{isTL ? current.titleTl : current.titleEn}</h3>
        <p className="text-xs leading-relaxed text-slate-300">{renderBody(isTL ? current.bodyTl : current.bodyEn)}</p>
        {waitsForClick && <p className="mt-2 text-[10px] italic text-amber-300">👆 {ui('clickHint')}</p>}
        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" onClick={() => { soundFx.playClick(); end(); }} className="no-bevel text-[10px] text-slate-400 hover:text-slate-200 underline cursor-pointer">
            {ui('skip')}
          </button>
          <div className="flex gap-1.5">
            {step > 0 && (
              <button type="button" onClick={() => { soundFx.playClick(); back(); }} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-xs font-bold cursor-pointer">
                {ui('back')}
              </button>
            )}
            {waitsForClick && (
              <button type="button" onClick={pressTarget} className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer">
                {ui('doIt')}
              </button>
            )}
            {!waitsForClick && (
              <button type="button" onClick={() => { soundFx.playClick(); next(); }} className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold cursor-pointer">
                {isLast ? ui('finish') : ui('next')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
