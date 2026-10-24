import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useWorldHold } from '../state/worldHold';
import { isTutorialDone, useTutorial } from '../state/tutorial';
import { soundFx } from '../game/audio/soundFx';
import { isLoadComplete, loadFraction, useLoadProgress } from '../game/loadProgress';
import { useTranslation, type TranslationKey } from '../i18n/translations';
import type { ActiveLocation } from '../types/state';
import LAIR from '../data/dragonsLair.json';

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
export function LoadingScreen({ location = 'DEMON_REALM', returning = false }: { location?: ActiveLocation; returning?: boolean }) {
  const { t } = useTranslation();
  const progress = useLoadProgress();
  const inLair = location === 'DRAGONS_LAIR';
  // The lair needs its scene and the character sheets (no structure art)
  const chars = progress.tasks.characters;
  const complete = inLair ? progress.sceneReady && chars.total > 0 && chars.done >= chars.total : isLoadComplete(progress);
  const fraction = complete ? 1 : inLair
    ? (progress.sceneReady ? 0.1 : 0) + 0.9 * (chars.total > 0 ? chars.done / chars.total : 0)
    : loadFraction(progress);
  const [hidden, setHidden] = useState(false);
  const [fading, setFading] = useState(false);
  const [tip] = useState(() => {
    const keys: readonly string[] = inLair ? LAIR.loadingTips : TIP_KEYS;
    return keys[Math.floor(Math.random() * keys.length)];
  });
  const title = inLair ? t('lairLoadingTitle') : returning ? t('realmReturnLoadingTitle') : t('loadingTitle');
  const [timedOut, setTimedOut] = useState(false);

  // Freeze the world (and mute its effects) until the screen is gone, so nothing plays out unseen
  useLayoutEffect(() => {
    if (hidden) return;
    useWorldHold.getState().setLoading(true);
    soundFx.setSfxHeld(true);
    return () => {
      useWorldHold.getState().setLoading(false);
      soundFx.setSfxHeld(false);
    };
  }, [hidden]);

  // First time in the realm: the tutorial takes over once the screen is gone
  useEffect(() => {
    if (hidden && !inLair && !isTutorialDone() && !useTutorial.getState().active) useTutorial.getState().start();
  }, [hidden, inLair]);

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
    if (!progress.sceneReady) return t(inLair ? 'lairLoadingStepCavern' : 'loadingStepWorld');
    if (inLair) return chars.done < chars.total ? t('loadingStepCharacters') : t('loadingStepReady');
    if (progress.tasks.structures.done < progress.tasks.structures.total) return t('loadingStepStructures');
    if (progress.tasks.characters.done < progress.tasks.characters.total) return t('loadingStepCharacters');
    return t('loadingStepReady');
  }, [progress, t, inLair, chars]);

  if (hidden) return null;
  const pct = Math.round(fraction * 100);

  return (
    <div
      data-cursor="wait"
      className={`absolute inset-0 z-[200] flex flex-col items-center justify-end bg-slate-950 bg-cover bg-center transition-opacity duration-500 ${fading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      style={{ backgroundImage: `linear-gradient(to bottom, rgba(2,6,23,0.55), rgba(2,6,23,0.95)), url('/backgrounds/title-screen.jpeg')` }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={title}
    >
      <div className="w-full max-w-md px-4 pb-16 flex flex-col items-center gap-3 text-center">
        <h2 className="text-lg font-bold tracking-widest uppercase text-purple-200">{title}</h2>
        <div className="w-full h-3 rounded-full bg-slate-800 border border-slate-700 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-purple-600 to-cyan-400 transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex w-full justify-between text-xs text-slate-300 font-mono">
          <span>{step}</span>
          <span>{pct}%</span>
        </div>
        <p className="text-xs text-slate-400 italic mt-2">{t(tip as TranslationKey)}</p>
      </div>
    </div>
  );
}
