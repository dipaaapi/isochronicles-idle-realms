import { useEffect, useMemo, useState } from 'react';
import { isLoadComplete, loadFraction, useLoadProgress } from '../game/loadProgress';
import { useTranslation } from '../i18n/translations';

/** Longest the screen may hold the realm back, in case a bake worker never answers. */
const FAILSAFE_MS = 45000;
/** Stay a moment after everything is ready so the first frames settle before the reveal. */
const SETTLE_MS = 500;
const TIP_KEYS = ['loadingTip1', 'loadingTip2', 'loadingTip3', 'loadingTip4'] as const;

/**
 * Covers the game while the world scene, the character sheets and the
 * structure art load in the background, then fades out. The canvas and HUD
 * mount underneath so their work happens behind this screen, not in play.
 */
export function LoadingScreen() {
  const { t } = useTranslation();
  const progress = useLoadProgress();
  const complete = isLoadComplete(progress);
  const fraction = complete ? 1 : loadFraction(progress);
  const [hidden, setHidden] = useState(false);
  const [fading, setFading] = useState(false);
  const [tip] = useState(() => TIP_KEYS[Math.floor(Math.random() * TIP_KEYS.length)]);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setTimedOut(true), FAILSAFE_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!complete && !timedOut) return;
    const settle = window.setTimeout(() => setFading(true), SETTLE_MS);
    const done = window.setTimeout(() => setHidden(true), SETTLE_MS + 450);
    return () => {
      window.clearTimeout(settle);
      window.clearTimeout(done);
    };
  }, [complete, timedOut]);

  const step = useMemo(() => {
    if (!progress.sceneReady) return t('loadingStepWorld');
    if (progress.tasks.structures.done < progress.tasks.structures.total) return t('loadingStepStructures');
    if (progress.tasks.characters.done < progress.tasks.characters.total) return t('loadingStepCharacters');
    return t('loadingStepReady');
  }, [progress, t]);

  if (hidden) return null;
  const pct = Math.round(fraction * 100);

  return (
    <div
      className={`absolute inset-0 z-[200] flex flex-col items-center justify-end bg-slate-950 bg-cover bg-center transition-opacity duration-500 ${fading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      style={{ backgroundImage: `linear-gradient(to bottom, rgba(2,6,23,0.55), rgba(2,6,23,0.95)), url('/backgrounds/title-screen.jpeg')` }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={t('loadingTitle')}
    >
      <div className="w-full max-w-md px-4 pb-16 flex flex-col items-center gap-3 text-center">
        <h2 className="text-lg font-bold tracking-widest uppercase text-purple-200">{t('loadingTitle')}</h2>
        <div className="w-full h-3 rounded-full bg-slate-800 border border-slate-700 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-purple-600 to-cyan-400 transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex w-full justify-between text-xs text-slate-300 font-mono">
          <span>{step}</span>
          <span>{pct}%</span>
        </div>
        <p className="text-xs text-slate-400 italic mt-2">{t(tip)}</p>
      </div>
    </div>
  );
}
