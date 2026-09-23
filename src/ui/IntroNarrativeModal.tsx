import React, { useEffect, useState } from 'react';
import { soundFx } from '../game/audio/soundFx';
import { ArrowRight, FastForward, Maximize, Minimize } from 'lucide-react';
import { useGameStore } from '../state/useGameStore';
import { DIFFICULTIES, Difficulty } from '../state/difficulty';

interface IntroNarrativeModalProps {
  onBegin: () => void;
  onCancel: () => void;
}

const NARRATIVE_TEXT_TL =
  "Gising na, aming Dakilang Demon Lord! Nabuksan ang lagusan ng Nether Realm at ang iyong lumulutang na Kuta ng Kadiliman ay muling nagising! Utusan ang iyong mga alagad na mababangis na Hellhound at Batong Demonyo. Mag-ipon ng mga yaman at ipagtanggol ang iyong kuta laban sa mga sumusugod na Kawal ng Tao at mga Makinang Mecha!";

const NARRATIVE_TEXT_EN =
  "Awaken, our Great Demon Lord! Centuries after your fall, the gate to the Nether Realm has opened and your floating Citadel of Darkness stirs once more! Command your loyal Slime to gather the beasts and demons. Overcome the relentless crusades of Humanity, conquer the four realms, and claim your vengeance!";

export const IntroNarrativeModal: React.FC<IntroNarrativeModalProps> = ({ onBegin, onCancel }) => {
  const language = useGameStore((state) => state.language);
  const narrativeText = language === 'TL' ? NARRATIVE_TEXT_TL : NARRATIVE_TEXT_EN;

  const [displayedText, setDisplayedText] = useState('');
  const [isFinished, setIsFinished] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>(useGameStore.getState().difficulty);
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [fullscreenError, setFullscreenError] = useState('');

  useEffect(() => {
    const sync = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggleFullscreen = async () => {
    setFullscreenError('');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setFullscreenError('Fullscreen is unavailable in this browser.');
    }
  };

  const begin = () => {
    useGameStore.setState({ difficulty });
    onBegin();
  };

  useEffect(() => {
    setDisplayedText('');
    setIsFinished(false);
    let index = 0;
    const interval = setInterval(() => {
      index++;
      setDisplayedText(narrativeText.slice(0, index));
      if (index >= narrativeText.length) {
        clearInterval(interval);
        setIsFinished(true);
      }
    }, 32);

    return () => clearInterval(interval);
  }, [narrativeText]);

  const handleSkip = () => {
    soundFx.playClick();
    begin();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-4 select-none">
      {/* Blurred Phase 1 Background */}
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-40 blur-md transition-opacity duration-1000"
        style={{ backgroundImage: `url('/backgrounds/phase1.jpg')` }}
      />
      
      <div className="relative max-h-[92dvh] overflow-y-auto max-w-xl w-full p-6 md:p-10 rounded-3xl border border-red-500/40 bg-slate-950/90 shadow-2xl shadow-red-950/80 backdrop-blur-md">
        {/* Arcane corner runes decoration */}
        <div className="absolute top-3 left-3 w-3 h-3 border-t-2 border-l-2 border-red-500/60" />
        <div className="absolute top-3 right-3 w-3 h-3 border-t-2 border-r-2 border-red-500/60" />
        <div className="absolute bottom-3 left-3 w-3 h-3 border-b-2 border-l-2 border-red-500/60" />
        <div className="absolute bottom-3 right-3 w-3 h-3 border-b-2 border-r-2 border-red-500/60" />

        {/* Header */}
        <div className="flex items-center justify-between mb-6 border-b border-red-500/20 pb-4">
          <div className="flex items-center gap-2 text-red-400">
            <span className="text-xl">👑</span>
            <span className="tracking-wider text-sm font-bold uppercase">
              Kwento ng Demon Lord
            </span>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={toggleFullscreen} aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} className="rounded-xl bg-slate-800 px-2.5 py-1 text-slate-200">
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
            <button
              onClick={handleSkip}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-sky-300 transition-colors px-2.5 py-1 rounded-xl bg-slate-800/60 cursor-pointer font-bold"
            >
              <FastForward className="w-3.5 h-3.5" />
              <span>Laktawan (Skip)</span>
            </button>
          </div>
        </div>
        {fullscreenError && <p role="status" className="mb-3 text-xs text-amber-300">{fullscreenError}</p>}

        {/* Narrative Typewriter Body */}
        <div className="min-h-[120px] text-lg md:text-xl text-slate-100 leading-relaxed italic mb-8 drop-shadow font-medium">
          &ldquo;{displayedText}
          {!isFinished && <span className="inline-block w-2 h-5 bg-sky-400 ml-1 animate-pulse" />}
          &rdquo;
        </div>

        <fieldset className="mb-6">
          <legend className="mb-2 text-sm font-bold text-slate-200">{language === 'TL' ? 'Antas ng hirap' : 'Difficulty'}</legend>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(DIFFICULTIES) as Difficulty[]).map((value) => (
              <label key={value} className={`cursor-pointer rounded-xl border p-3 text-center text-sm font-bold ${difficulty === value ? 'border-sky-400 bg-sky-900/60 text-white' : 'border-slate-700 bg-slate-900 text-slate-400'}`}>
                <input type="radio" name="difficulty" value={value} checked={difficulty === value} onChange={() => setDifficulty(value)} className="mr-2 accent-sky-400" />
                {DIFFICULTIES[value].label}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400" aria-live="polite">{DIFFICULTIES[difficulty].description}</p>
        </fieldset>

        {/* Footer Action */}
        <div className="flex flex-wrap justify-between gap-3 items-center pt-2">
          <button onClick={onCancel} className="rounded-xl border border-slate-600 px-4 py-3 font-bold text-slate-300 hover:bg-slate-800">
            {language === 'TL' ? 'Kanselahin' : 'Cancel'}
          </button>
          <button
            onClick={() => {
              soundFx.playFanfare();
              begin();
            }}
            disabled={!isFinished}
            className={`group flex items-center gap-3 px-7 py-4 rounded-2xl font-bold text-base tracking-wide transition-all duration-300 ${
              isFinished
                ? 'bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white shadow-xl shadow-sky-500/30 hover:scale-105 cursor-pointer active:scale-95'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
            }`}
          >
            <span>{language === 'TL' ? 'SIMULAN ANG PAGBUO!' : 'BEGIN RECONSTRUCTION!'} 🚀</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
};
