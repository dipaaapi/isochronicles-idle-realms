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
  "Gising na, aming Dakilang Demon Lord! Nabuksan ang lagusan ng Nether Realm at ang iyong lumulutang na Kuta ng Kadiliman ay muling nagising! Utusan ang iyong mga alagad na mababangis na Halimaw at Batong Demonyo. Mag-ipon ng mga yaman at ipagtanggol ang iyong kuta laban sa mga sumusugod na Kawal ng Tao at mga Makinang Mecha!";

const NARRATIVE_TEXT_EN =
  "Awaken, our Great Demon Lord! Centuries after your fall, the gate to the Nether Realm has opened and your floating Citadel of Darkness stirs once more! Command your loyal monsters and stone guardians. Gather vital resources and defend your citadel against relentless waves of invading Humans and Mechas!";

export const IntroNarrativeModal: React.FC<IntroNarrativeModalProps> = ({ onBegin, onCancel }) => {
  const language = useGameStore((state) => state.language);
  const narrativeText = language === 'TL' ? NARRATIVE_TEXT_TL : NARRATIVE_TEXT_EN;

  const [displayedText, setDisplayedText] = useState('');
  const [isFinished, setIsFinished] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>(useGameStore.getState().difficulty);
  const [isFullscreen, setIsFullscreen] = useState(
    typeof document !== 'undefined' ? !!document.fullscreenElement : false
  );
  const [fullscreenError, setFullscreenError] = useState('');

  // Panatilihin ang parehong Title BGM
  useEffect(() => {
    soundFx.playBackgroundMusic('TITLE');
  }, []);

  useEffect(() => {
    const sync = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggleFullscreen = async () => {
    soundFx.playClick();
    setFullscreenError('');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setFullscreenError(
        language === 'TL'
          ? 'Hindi suportado ang fullscreen sa browser na ito.'
          : 'Fullscreen is unavailable in this browser.'
      );
    }
  };

  const begin = () => {
    useGameStore.setState({ difficulty });
    onBegin();
  };

  // Typewriter effect para sa kuwento
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
    }, 28);

    return () => clearInterval(interval);
  }, [narrativeText]);

  const handleSkip = () => {
    soundFx.playClick();
    setIsFinished(true);
    setDisplayedText(narrativeText);
  };

  const handleDifficultySelect = (val: Difficulty) => {
    soundFx.playClick();
    setDifficulty(val);
  };

  const handleCancelClick = () => {
    soundFx.playClick();
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-4 select-none animate-fade-in">
      {/* Parehong background image tulad ng Title Screen */}
      <div 
        className="absolute inset-0 bg-cover bg-center pointer-events-none opacity-50 blur-[2px]"
        style={{ backgroundImage: `url('/backgrounds/title-screen.jpeg')` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/80 pointer-events-none" />

      {/* Modal Dialog Box */}
      <div className="relative max-h-[92dvh] overflow-y-auto max-w-xl w-full p-6 md:p-8 rounded-3xl border border-red-500/40 bg-slate-950/95 shadow-2xl shadow-red-950/90 backdrop-blur-md z-10 custom-scrollbar">
        {/* Arcane corner runes */}
        <div className="absolute top-3 left-3 w-3 h-3 border-t-2 border-l-2 border-red-500/60 pointer-events-none" />
        <div className="absolute top-3 right-3 w-3 h-3 border-t-2 border-r-2 border-red-500/60 pointer-events-none" />
        <div className="absolute bottom-3 left-3 w-3 h-3 border-b-2 border-l-2 border-red-500/60 pointer-events-none" />
        <div className="absolute bottom-3 right-3 w-3 h-3 border-b-2 border-r-2 border-red-500/60 pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between mb-5 border-b border-red-500/20 pb-3">
          <div className="flex items-center gap-2 text-red-400">
            <span className="text-xl">👑</span>
            <span className="tracking-wider text-sm font-bold uppercase font-fantasy">
              {language === 'TL' ? 'Kwento ng Demon Lord' : 'Demon Lord Chronicle'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button 
              type="button"
              onClick={toggleFullscreen} 
              aria-label="Toggle Fullscreen"
              className="p-1.5 rounded-xl bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={handleSkip}
              className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-sky-300 transition-colors px-3 py-1.5 rounded-xl bg-slate-800/70 border border-slate-700/60 cursor-pointer font-bold"
            >
              <FastForward className="w-3.5 h-3.5" />
              <span>{language === 'TL' ? 'Ipakita Lahat' : 'Reveal All'}</span>
            </button>
          </div>
        </div>

        {fullscreenError && (
          <p role="status" className="mb-3 text-xs text-amber-300">{fullscreenError}</p>
        )}

        {/* Narrative Typewriter Body */}
        <div className="min-h-[120px] text-base md:text-lg text-slate-100 leading-relaxed italic mb-6 drop-shadow font-medium bg-black/40 p-4 rounded-2xl border border-red-950/50">
          &ldquo;{displayedText}
          {!isFinished && <span className="inline-block w-2 h-4 bg-red-400 ml-1 animate-pulse" />}
          &rdquo;
        </div>

        {/* Difficulty Selection */}
        <fieldset className="mb-6">
          <legend className="mb-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
            {language === 'TL' ? 'Antas ng Hirap' : 'Difficulty Level'}
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(DIFFICULTIES) as Difficulty[]).map((value) => {
              const item = DIFFICULTIES[value];
              const isSelected = difficulty === value;
              return (
                <button
                  type="button"
                  key={value}
                  onClick={() => handleDifficultySelect(value)}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                    isSelected
                      ? 'border-red-500 bg-red-950/70 text-white shadow-md shadow-red-900/40 scale-[1.02]'
                      : 'border-slate-800 bg-slate-900/80 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-amber-300/80 font-medium" aria-live="polite">
            {DIFFICULTIES[difficulty].description}
          </p>
        </fieldset>

        {/* Footer Actions */}
        <div className="flex flex-wrap justify-between gap-3 items-center pt-3 border-t border-slate-800">
          <button 
            type="button"
            onClick={handleCancelClick} 
            className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-900 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
          >
            {language === 'TL' ? 'Bumalik sa Title' : 'Back to Title'}
          </button>

          <button
            type="button"
            onClick={() => {
              soundFx.playFanfare();
              begin();
            }}
            disabled={!isFinished}
            className={`group flex items-center gap-2.5 px-6 py-3 rounded-xl font-bold text-sm tracking-wide transition-all duration-200 ${
              isFinished
                ? 'bg-gradient-to-r from-red-600 via-amber-600 to-red-600 hover:brightness-110 text-white shadow-lg shadow-red-600/30 hover:scale-[1.03] cursor-pointer active:scale-95'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
            }`}
          >
            <span>{language === 'TL' ? 'SIMULAN ANG PAGBANGON!' : 'BEGIN ASCENDANCY!'} ⚔️</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
};