import React, { useEffect, useState, useRef } from 'react';
import { useGameStore } from '../state/useGameStore';
import { hasSavedRealm } from '../state/storageAdapter';
import { soundFx } from '../game/audio/soundFx';
import { Sparkles, Play, RotateCcw, Upload, Shield, Compass, Sliders } from 'lucide-react';

interface TitleScreenProps {
  onStartNewRealm: () => void;
  onContinueRealm: () => void;
  onOpenSettings?: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  onStartNewRealm,
  onContinueRealm,
  onOpenSettings,
}) => {
  const [canContinue, setCanContinue] = useState(false);
  const [checkingSave, setCheckingSave] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importSave = useGameStore((state) => state.importSave);
  const language = useGameStore((state) => state.language);
  const setLanguage = useGameStore((state) => state.setLanguage);

  useEffect(() => {
    async function verifyExistingSave() {
      const exists = await hasSavedRealm();
      setCanContinue(exists);
      setCheckingSave(false);
    }
    verifyExistingSave();
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const success = importSave(content);
        if (success) {
          onContinueRealm();
        } else {
          alert('Failed to load save file. Please check if the JSON is valid.');
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-radial-gradient from-slate-900 via-slate-950 to-black z-30 select-none overflow-hidden px-4">
      {/* Ambient background particles / glow */}
      <div className="absolute w-[600px] h-[600px] bg-sky-500/10 rounded-full blur-3xl pointer-events-none -top-40 -left-40 animate-pulse-slow" />
      <div className="absolute w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-3xl pointer-events-none -bottom-32 -right-32 animate-pulse-slow" />

      {/* Main Hero Title Box */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-2xl mb-12 animate-float">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-red-500/40 bg-red-950/40 backdrop-blur-md mb-6 shadow-lg shadow-red-950/50">
          <span className="text-sm">👑</span>
          <span className="text-xs uppercase tracking-widest font-semibold text-red-300">
            {language === 'TL' ? 'Panginoon ng Kadiliman \u2022 Demon Lord Realm' : 'Demon Lord Realm \u2022 Dark Ascendancy'}
          </span>
        </div>

        <h1 className="text-5xl md:text-7xl font-fantasy font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-b from-white via-red-100 to-red-500 drop-shadow-[0_10px_20px_rgba(239,68,68,0.35)]">
          IsoChronicle
        </h1>
        <div className="text-2xl md:text-3xl font-fantasy font-bold tracking-widest text-red-400/90 mt-1 mb-3 glow-blue">
          {language === 'TL' ? 'DEMON LORD REALMS 😈' : 'DEMON LORD REALMS 😈'}
        </div>

        <p className="text-sm md:text-base text-slate-300 italic max-w-md font-sans">
          {language === 'TL' 
            ? '\u201cPamunuan ang mga Demonyo at Halimaw laban sa mga Tao at Mecha!\u201d'
            : '\u201cCommand Demons and Monsters against Humans and Mechas!\u201d'}
        </p>
      </div>

      {/* Language Toggle */}
      <div className="absolute top-6 right-6 z-20">
        <button
          onClick={() => {
            soundFx.playClick();
            setLanguage(language === 'EN' ? 'TL' : 'EN');
          }}
          className="px-3 py-1.5 rounded-full text-xs font-bold text-slate-300 border border-slate-700 bg-slate-800/80 hover:bg-slate-700 transition-colors cursor-pointer"
        >
          {language === 'TL' ? 'Switch to English' : 'I-switch sa Tagalog'}
        </button>
      </div>

      {/* Action Buttons Menu */}
      <div className="relative z-10 flex flex-col gap-4 w-full max-w-xs">
        {/* New Realm */}
        <button
          onClick={() => {
            soundFx.playClick();
            onStartNewRealm();
          }}
          className="group relative flex items-center justify-center gap-3 px-6 py-4 rounded-2xl font-bold text-lg text-white bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 transition-all duration-200 shadow-xl shadow-sky-500/30 hover:scale-105 active:scale-95 cursor-pointer"
        >
          <Play className="w-6 h-6 fill-current text-white/90 group-hover:scale-110 transition-transform" />
          <span>{language === 'TL' ? 'MAGSIMULA NG LARO ▶' : 'START NEW REALM ▶'}</span>
        </button>

        {/* Continue */}
        <button
          onClick={() => {
            soundFx.playClick();
            onContinueRealm();
          }}
          disabled={!canContinue || checkingSave}
          className={`group flex items-center justify-center gap-3 px-6 py-3.5 rounded-2xl font-bold text-base border transition-all duration-200 ${
            canContinue && !checkingSave
              ? 'border-sky-500/40 bg-slate-900/90 hover:bg-slate-800 text-sky-200 hover:border-sky-300 hover:scale-102 shadow-lg shadow-sky-950 cursor-pointer'
              : 'border-slate-800 bg-slate-950/50 text-slate-600 cursor-not-allowed'
          }`}
        >
          <RotateCcw className={`w-5 h-5 ${canContinue ? 'text-sky-400' : 'text-slate-600'}`} />
          <span>{language === 'TL' ? 'ITULOY ANG LARO 🔄' : 'CONTINUE REALM 🔄'}</span>
        </button>

        {/* Settings Button */}
        {onOpenSettings && (
          <button
            onClick={() => {
              soundFx.playClick();
              onOpenSettings();
            }}
            className="flex items-center justify-center gap-2.5 px-6 py-3 rounded-2xl text-sm font-bold text-slate-300 border border-slate-800/80 bg-slate-900/60 hover:bg-slate-800/80 hover:text-white transition-all cursor-pointer hover:scale-102"
          >
            <Sliders className="w-4 h-4 text-sky-400" />
            <span>{language === 'TL' ? 'Mga Setting at Tunog ⚙️' : 'Settings & Audio ⚙️'}</span>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      {/* Footer System Badges */}
      <div className="absolute bottom-6 flex items-center gap-6 text-xs text-slate-500 tracking-wider">
        <div className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-emerald-400/80" />
          <span>100% Offline IndexedDB</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Compass className="w-3.5 h-3.5 text-sky-400/80" />
          <span>Phaser 3 &bull; EasyStar.js</span>
        </div>
      </div>
    </div>
  );
};
