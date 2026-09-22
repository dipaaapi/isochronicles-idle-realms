import React, { useEffect, useState } from 'react';
import { soundFx } from '../game/audio/soundFx';
import { Sparkles, ArrowRight, FastForward } from 'lucide-react';
import { useGameStore } from '../state/useGameStore';

interface IntroNarrativeModalProps {
  onBegin: () => void;
}

const NARRATIVE_TEXT_TL =
  "Gising na, aming Dakilang Demon Lord! Nabuksan ang lagusan ng Nether Realm at ang iyong lumulutang na Kuta ng Kadiliman ay muling nagising! Utusan ang iyong mga alagad na mababangis na Hellhound at Batong Demonyo. Mag-ipon ng mga yaman at ipagtanggol ang iyong kuta laban sa mga sumusugod na Kawal ng Tao at mga Makinang Mecha!";

const NARRATIVE_TEXT_EN =
  "Awaken, our Great Demon Lord! Centuries after your fall, the gate to the Nether Realm has opened and your floating Citadel of Darkness stirs once more! Command your loyal Slime to gather the beasts and demons. Overcome the relentless crusades of Humanity, conquer the four realms, and claim your vengeance!";

export const IntroNarrativeModal: React.FC<IntroNarrativeModalProps> = ({ onBegin }) => {
  const language = useGameStore((state) => state.language);
  const narrativeText = language === 'TL' ? NARRATIVE_TEXT_TL : NARRATIVE_TEXT_EN;

  const [displayedText, setDisplayedText] = useState('');
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
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
  }, []);

  const handleSkip = () => {
    soundFx.playClick();
    setDisplayedText(narrativeText);
    setIsFinished(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-4 select-none">
      {/* Blurred Phase 1 Background */}
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-40 blur-md transition-opacity duration-1000"
        style={{ backgroundImage: `url('/backgrounds/phase1.jpg')` }}
      />
      
      <div className="relative max-w-xl w-full p-8 md:p-10 rounded-3xl border border-red-500/40 bg-slate-950/90 shadow-2xl shadow-red-950/80 overflow-hidden backdrop-blur-md">
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

          {!isFinished && (
            <button
              onClick={handleSkip}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-sky-300 transition-colors px-2.5 py-1 rounded-xl bg-slate-800/60 cursor-pointer font-bold"
            >
              <FastForward className="w-3.5 h-3.5" />
              <span>Laktawan (Skip)</span>
            </button>
          )}
        </div>

        {/* Narrative Typewriter Body */}
        <div className="min-h-[120px] text-lg md:text-xl text-slate-100 leading-relaxed italic mb-8 drop-shadow font-medium">
          &ldquo;{displayedText}
          {!isFinished && <span className="inline-block w-2 h-5 bg-sky-400 ml-1 animate-pulse" />}
          &rdquo;
        </div>

        {/* Footer Action */}
        <div className="flex justify-end items-center pt-2">
          <button
            onClick={() => {
              soundFx.playFanfare();
              onBegin();
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
