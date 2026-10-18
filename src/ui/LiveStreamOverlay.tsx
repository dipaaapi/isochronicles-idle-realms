import React, { useEffect, useRef, useState } from 'react';
import { useLiveFocus } from '../state/liveFocus';
import { useTranslation } from '../i18n/translations';
import CONFIG from '../data/liveStream.json';

interface Bubble {
  id: number;
  emoji: string;
  /** Horizontal offset from the right edge (px), drift (px) and duration (s). */
  right: number;
  drift: number;
  duration: number;
  size: number;
}

const MAX_BUBBLES = 30;

/**
 * Stream dressing for the live-focus camera (game/scene/liveFocusCamera.ts):
 * a frame with a LIVE badge and viewer count over the picture-in-picture
 * view, plus a flood of reactions rising up the right side while it is live.
 */
export const LiveStreamOverlay: React.FC = () => {
  const live = useLiveFocus((s) => s.live);
  const brawl = useLiveFocus((s) => s.mode === 'brawl');
  const fighters = useLiveFocus((s) => s.fighters);
  const spot = useLiveFocus((s) => s.spot);
  const requestFocus = useLiveFocus((s) => s.requestFocus);
  const { t } = useTranslation();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [viewers, setViewers] = useState(0);
  const serial = useRef(0);

  useEffect(() => {
    if (!live) {
      setBubbles([]);
      return;
    }
    setViewers(800 + Math.floor(Math.random() * 3000));
    let timer: number;
    const spawn = () => {
      const intensity = useLiveFocus.getState().intensity;
      const [lo, hi] = CONFIG.reactionsPerSecond;
      const perSec = lo + (hi - lo) * intensity;
      const burst = Math.random() < 0.15 ? 3 + Math.floor(Math.random() * 4) : 1;
      const fresh: Bubble[] = [];
      for (let i = 0; i < burst; i++) {
        const pool = useLiveFocus.getState().mode === 'brawl' ? CONFIG.brawlReactions : CONFIG.reactions;
        const r = pool[Math.floor(Math.random() * pool.length)];
        fresh.push({
          id: ++serial.current,
          emoji: r.emoji,
          right: 6 + Math.random() * 36,
          drift: (Math.random() - 0.5) * 24,
          duration: 1.8 + Math.random() * 1.2,
          size: 12 + Math.random() * 6,
        });
      }
      setBubbles((prev) => [...prev, ...fresh].slice(-MAX_BUBBLES));
      setViewers((v) => Math.max(100, v + Math.floor((Math.random() - 0.35) * 40 * (1 + intensity))));
      timer = window.setTimeout(spawn, (1000 / perSec) * (0.6 + Math.random() * 0.8));
    };
    spawn();
    return () => window.clearTimeout(timer);
  }, [live, brawl]);

  const remove = (id: number) => setBubbles((prev) => prev.filter((b) => b.id !== id));
  const { width, height, margin } = CONFIG.frame;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden={!live}>
      {live && (
        <button
          type="button"
          onClick={requestFocus}
          title={t('liveFocusHint')}
          aria-label={t('liveFocusHint')}
          className={`live-pop pointer-events-auto absolute cursor-pointer rounded-lg border-2 transition focus-visible:outline focus-visible:outline-2 ${
            brawl
              ? 'border-amber-400/90 shadow-[0_0_24px_rgba(251,191,36,0.5)] hover:border-amber-200 focus-visible:outline-amber-200'
              : 'border-rose-500/80 shadow-[0_0_24px_rgba(244,63,94,0.45)] hover:border-rose-300 hover:shadow-[0_0_32px_rgba(251,113,133,0.7)] focus-visible:outline-rose-300'
          }`}
          style={{ top: margin, right: margin, width, height }}
        >
          <div className="absolute left-2 top-2 flex items-center gap-1.5">
            <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-black tracking-wider ${brawl ? 'bg-amber-400 text-slate-950' : 'bg-rose-600 text-white'}`}>
              {brawl ? '🥊' : <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" />}
              {t(brawl ? 'brawlBadge' : 'liveBadge')}
            </span>
            <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              👁 {viewers.toLocaleString()}
            </span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 rounded-b-md bg-gradient-to-t from-black/80 to-transparent px-2 pb-1 pt-4 text-[11px] font-bold text-white">
            {brawl && fighters
              ? t('brawlTitle').replace('{a}', fighters[0]).replace('{b}', fighters[1])
              : t('liveTitle').replace('{spot}', spot)}
          </div>
          {/* Reactions rise inside the stream window only */}
          <div className="absolute inset-0 overflow-hidden rounded-md">
            {bubbles.map((b) => (
              <div
                key={b.id}
                className="live-reaction absolute bottom-6 flex flex-col items-center"
                style={{
                  right: b.right,
                  ['--drift' as string]: `${b.drift}px`,
                  ['--rise' as string]: `${height - 34}px`,
                  animationDuration: `${b.duration}s`,
                }}
                onAnimationEnd={() => remove(b.id)}
              >
                <span style={{ fontSize: b.size, lineHeight: 1 }} className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
                  {b.emoji}
                </span>
              </div>
            ))}
          </div>
        </button>
      )}
    </div>
  );
};
