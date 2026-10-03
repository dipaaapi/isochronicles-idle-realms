import React, { useCallback, useEffect, useRef, useState } from 'react';
import { soundFx } from '../game/audio/soundFx';
import { ArrowRight, ChevronRight, FastForward, Maximize, Minimize } from 'lucide-react';
import { useGameStore } from '../state/useGameStore';
import { DIFFICULTIES, Difficulty } from '../state/difficulty';
import { useTranslation } from '../i18n/translations';
import INTRO from '../i18n/introDialogue.json';
import type { Resources } from '../types/state';
import { INITIAL_RESOURCES } from '../state/store/initialState';

interface IntroNarrativeModalProps {
  onBegin: () => void;
  onCancel: () => void;
}

type SpeakerId = keyof typeof INTRO.speakers;
const LINES = INTRO.lines as Array<{ speaker: SpeakerId; en: string; tl: string }>;
const TYPE_MS = 24;

const pct = (m: number) => `${m >= 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`;

export const IntroNarrativeModal: React.FC<IntroNarrativeModalProps> = ({ onBegin, onCancel }) => {
  const language = useGameStore((state) => state.language);
  const isTL = language === 'TL';
  const { t: tr } = useTranslation();

  const [lineIndex, setLineIndex] = useState(0);
  const [typed, setTyped] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>(useGameStore.getState().difficulty);
  const [isFullscreen, setIsFullscreen] = useState(
    typeof document !== 'undefined' ? !!document.fullscreenElement : false
  );
  const [fullscreenError, setFullscreenError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const line = LINES[lineIndex];
  const text = isTL ? line.tl : line.en;
  const lineDone = typed >= text.length;
  const isFinished = skipped || (lineIndex === LINES.length - 1 && lineDone);

  const stopTyping = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => {
    soundFx.playBackgroundMusic('TITLE');
  }, []);

  useEffect(() => {
    const sync = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  // Typewriter for the current line; the interval lives in a ref so skipping stops it for good
  useEffect(() => {
    stopTyping();
    if (skipped) return;
    setTyped(0);
    timerRef.current = setInterval(() => {
      setTyped((n) => {
        if (n + 1 >= text.length) stopTyping();
        return n + 1;
      });
    }, TYPE_MS);
    return stopTyping;
  }, [lineIndex, text, skipped]);

  const advance = useCallback(() => {
    if (skipped) return;
    soundFx.playClick();
    if (!lineDone) {
      stopTyping();
      setTyped(text.length);
    } else if (lineIndex < LINES.length - 1) {
      setLineIndex((i) => i + 1);
    }
  }, [skipped, lineDone, text.length, lineIndex]);

  const skipDialogue = () => {
    soundFx.playClick();
    stopTyping();
    setSkipped(true);
    setLineIndex(LINES.length - 1);
    setTyped(Number.MAX_SAFE_INTEGER);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        if ((e.target as HTMLElement)?.tagName === 'BUTTON') return;
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance]);

  const toggleFullscreen = async () => {
    soundFx.playClick();
    setFullscreenError(false);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setFullscreenError(true);
    }
  };

  const begin = () => {
    soundFx.playFanfare();
    // Scale the new-game stockpile, but only on a fresh realm (Start New Realm keeps an existing save)
    const supplies = DIFFICULTIES[difficulty].startingSupplies;
    useGameStore.setState((s) => {
      const untouched = (Object.keys(INITIAL_RESOURCES) as (keyof Resources)[]).every(
        (k) => (s.resources[k] ?? 0) === (INITIAL_RESOURCES[k] ?? 0)
      );
      if (s.castleBuilt || !untouched) return { difficulty };
      const resources = { ...s.resources };
      (Object.keys(INITIAL_RESOURCES) as (keyof Resources)[]).forEach((k) => {
        const base = INITIAL_RESOURCES[k] ?? 0;
        resources[k] = Math.max(0, (resources[k] ?? 0) + Math.round(base * (supplies - 1)));
      });
      return { difficulty, resources };
    });
    onBegin();
  };

  const speakerOf = (id: SpeakerId) => INTRO.speakers[id];

  // Shown lines: everything up to the current one (all of them once skipped)
  const visible = skipped ? LINES : LINES.slice(0, lineIndex + 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-4 select-none animate-fade-in">
      <div
        className="absolute inset-0 bg-cover bg-center pointer-events-none opacity-50 blur-[2px]"
        style={{ backgroundImage: `url('/backgrounds/title-screen.jpeg')` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/85 pointer-events-none" />

      <div className="relative max-h-[94dvh] overflow-y-auto max-w-2xl w-full p-5 md:p-7 border-2 border-red-900/80 bg-gradient-to-b from-stone-950/95 to-red-950/80 shadow-2xl z-10 custom-scrollbar">
        <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-amber-500/70 pointer-events-none" />
        <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-amber-500/70 pointer-events-none" />
        <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-amber-500/70 pointer-events-none" />
        <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-amber-500/70 pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between mb-4 border-b border-red-900/60 pb-3">
          <div className="flex items-center gap-2 text-amber-300">
            <span className="text-xl">👑</span>
            <span className="tracking-wider text-sm font-bold uppercase font-fantasy">{tr('introTitle')}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={tr('introFullscreen')}
              className="p-1.5 border border-red-900/70 bg-stone-950/80 text-amber-200/80 hover:text-amber-100 hover:border-amber-500/60 cursor-pointer"
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
            {!isFinished && (
              <button
                type="button"
                onClick={skipDialogue}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-amber-600/60 bg-red-950/70 text-amber-200 hover:text-white hover:border-amber-400 cursor-pointer font-bold"
              >
                <FastForward className="w-3.5 h-3.5" />
                <span>{tr('introSkip')}</span>
              </button>
            )}
          </div>
        </div>

        {fullscreenError && (
          <p role="status" className="mb-3 text-xs text-amber-300">{tr('introFullscreenError')}</p>
        )}

        {/* Dialogue */}
        <div
          onClick={advance}
          className={`mb-5 space-y-3 bg-black/50 p-4 border border-red-950 max-h-[42dvh] overflow-y-auto custom-scrollbar ${
            skipped ? '' : 'cursor-pointer'
          }`}
        >
          {visible.map((l, i) => {
            const sp = speakerOf(l.speaker);
            const isCurrent = !skipped && i === visible.length - 1;
            const full = isTL ? l.tl : l.en;
            const shown = isCurrent ? full.slice(0, typed) : full;
            return (
              <div key={i} className={`flex gap-3 ${isCurrent ? 'animate-fade-in' : 'opacity-70'}`}>
                <div className="w-12 h-12 shrink-0 border-2 bg-stone-900 flex items-center justify-center overflow-hidden" style={{ borderColor: sp.color }}>
                  {sp.portrait ? (
                    <img src={sp.portrait} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl">📜</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: sp.color }}>
                    {isTL ? sp.tl : sp.en}
                  </div>
                  <p className={`text-sm md:text-base leading-relaxed text-slate-100 ${l.speaker === 'NARRATOR' ? 'italic' : ''}`}>
                    {shown}
                    {isCurrent && !lineDone && <span className="inline-block w-2 h-4 bg-amber-400 ml-1 align-middle animate-pulse" />}
                  </p>
                </div>
              </div>
            );
          })}

          {!isFinished && (
            <div className="flex items-center justify-between pt-1">
              <div className="flex gap-1">
                {LINES.map((_, i) => (
                  <span key={i} className={`w-4 h-1 ${i <= lineIndex ? 'bg-amber-400' : 'bg-stone-700'}`} />
                ))}
              </div>
              <span className="flex items-center gap-1 text-[10px] text-amber-200/70 animate-pulse">
                {tr('introContinueHint')}
                <ChevronRight className="w-3 h-3" />
              </span>
            </div>
          )}
        </div>

        {/* Difficulty — shown once the dialogue reaches the question */}
        {isFinished && (
          <fieldset className="mb-5 animate-fade-in">
            <legend className="mb-2 text-xs font-bold text-amber-200/90 uppercase tracking-wider">{tr('introDifficulty')}</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(Object.keys(DIFFICULTIES) as Difficulty[]).map((value) => {
                const d = DIFFICULTIES[value];
                const sel = difficulty === value;
                const stats: Array<{ label: string; m: number; goodWhenHigh: boolean }> = [
                  { label: tr('introStatEnemy'), m: d.enemyMultiplier, goodWhenHigh: false },
                  { label: tr('introStatSupplies'), m: d.startingSupplies, goodWhenHigh: true },
                  { label: tr('introStatBounty'), m: d.bountyMultiplier, goodWhenHigh: true },
                ];
                return (
                  <button
                    type="button"
                    key={value}
                    onClick={() => { soundFx.playClick(); setDifficulty(value); }}
                    className={`text-left p-3 border-2 transition-all cursor-pointer ${
                      sel
                        ? 'border-amber-400 bg-red-950/80 shadow-lg shadow-red-900/40'
                        : 'border-red-950 bg-stone-950/80 hover:border-red-800'
                    }`}
                  >
                    <div className={`flex items-center gap-1.5 text-sm font-bold ${sel ? 'text-amber-200' : 'text-stone-300'}`}>
                      <span>{d.icon}</span>
                      {isTL ? d.labelTl : d.label}
                    </div>
                    <p className="mt-1 text-[10px] leading-snug text-stone-400 min-h-[2.5em]">{isTL ? d.taglineTl : d.tagline}</p>
                    <div className="mt-2 space-y-0.5">
                      {stats.map((s) => {
                        const neutral = s.m === 1;
                        const good = s.goodWhenHigh ? s.m > 1 : s.m < 1;
                        return (
                          <div key={s.label} className="flex justify-between gap-2 text-[10px]">
                            <span className="text-stone-400 truncate">{s.label}</span>
                            <span className={`font-mono font-bold ${neutral ? 'text-stone-300' : good ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {neutral ? '100%' : pct(s.m)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {/* Footer */}
        <div className="flex flex-wrap justify-between gap-3 items-center pt-3 border-t border-red-900/60">
          <button
            type="button"
            onClick={() => { soundFx.playClick(); onCancel(); }}
            className="px-4 py-2.5 border border-red-900/70 bg-stone-950 text-xs font-bold text-amber-200/80 hover:text-amber-100 hover:border-amber-500/60 cursor-pointer"
          >
            {tr('introBack')}
          </button>

          {isFinished ? (
            <button
              type="button"
              onClick={begin}
              className="group flex items-center gap-2.5 px-6 py-3 font-bold text-sm tracking-wide uppercase border-2 border-amber-400/80 bg-gradient-to-b from-red-600 via-red-700 to-red-900 text-amber-50 shadow-[0_5px_0_#450a0a] hover:-translate-y-0.5 hover:border-amber-300 active:translate-y-1 active:shadow-none cursor-pointer"
            >
              <span>{tr('introBegin')}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          ) : (
            <button
              type="button"
              onClick={advance}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase border border-amber-600/60 bg-red-950/70 text-amber-200 hover:text-white hover:border-amber-400 cursor-pointer"
            >
              {tr('introNext')}
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
