import React, { useEffect, useState, useRef } from 'react';
import { useGameStore } from '../state/useGameStore';
import { hasSavedRealm } from '../state/storageAdapter';
import { soundFx } from '../game/audio/soundFx';
import { Play, RotateCcw, Sliders, Shield, Compass } from 'lucide-react';

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
  const [clickedBtn, setClickedBtn] = useState<'NEW' | 'CONTINUE' | 'SETTINGS' | null>(null);

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

    // Simulan ang Title BGM
    soundFx.playBackgroundMusic('TITLE');

    // Browser audio autoplay policy handler: mag-uunlock pagka-click kahit saan
    const handleUnlockAudio = () => {
      soundFx.playBackgroundMusic('TITLE');
      window.removeEventListener('pointerdown', handleUnlockAudio);
    };
    window.addEventListener('pointerdown', handleUnlockAudio);

    return () => {
      window.removeEventListener('pointerdown', handleUnlockAudio);
    };
  }, []);

  const handleLanguageChange = (newLang: 'EN' | 'TL') => {
    if (language !== newLang) {
      soundFx.playClick();
      setLanguage(newLang);
    }
  };

  const handleStartGame = (action: () => void) => {
    soundFx.playGameStart();
    setClickedBtn('NEW');

    setTimeout(() => {
      soundFx.stopBackgroundMusic();
      action();
      setClickedBtn(null);
    }, 250);
  };

  const handleContinueGame = (action: () => void) => {
    soundFx.playGameStart();
    setClickedBtn('CONTINUE');

    setTimeout(() => {
      soundFx.stopBackgroundMusic();
      action();
      setClickedBtn(null);
    }, 250);
  };

  const handleSettingsClick = () => {
    soundFx.playClick();
    setClickedBtn('SETTINGS');

    setTimeout(() => {
      onOpenSettings?.();
      setClickedBtn(null);
    }, 150);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const success = importSave(content);
        if (success) {
          soundFx.stopBackgroundMusic();
          onContinueRealm();
        } else {
          alert('Failed to load save file. Please check if the JSON is valid.');
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="relative w-full h-full min-h-screen flex flex-col items-center justify-between bg-slate-950 select-none overflow-hidden font-sans">
      
      {/* --- MALIWANAG NA PIXEL ART BACKGROUND --- */}
      <div 
        className="absolute inset-0 bg-cover bg-center pointer-events-none z-0"
        style={{ backgroundImage: `url('/backgrounds/title-screen.jpeg')` }}
      />

      {/* Banayad na bottom gradient para readable ang buttons nang hindi dumidilim ang visual title */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none z-0" />

      {/* --- TOP BAR: EN / TL TOGGLE SWITCH --- */}
      <div className="relative z-20 w-full flex justify-end p-6">
        <div className="relative inline-flex items-center p-1 bg-slate-950/80 backdrop-blur-md rounded-full border border-red-500/40 shadow-lg shadow-black/60">
          <span 
            className={`absolute top-1 bottom-1 w-10 rounded-full bg-gradient-to-r from-red-600 to-amber-600 transition-transform duration-200 ease-out shadow-md shadow-red-600/40 ${
              language === 'TL' ? 'translate-x-10' : 'translate-x-0'
            }`}
          />

          <button 
            type="button"
            onClick={() => handleLanguageChange('EN')}
            className={`relative z-10 w-10 h-7 text-xs font-black tracking-wider rounded-full transition-colors duration-200 flex items-center justify-center cursor-pointer ${
              language === 'EN' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            EN
          </button>

          <button 
            type="button"
            onClick={() => handleLanguageChange('TL')}
            className={`relative z-10 w-10 h-7 text-xs font-black tracking-wider rounded-full transition-colors duration-200 flex items-center justify-center cursor-pointer ${
              language === 'TL' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            TL
          </button>
        </div>
      </div>

      {/* Gitnang espasyo (Lugar para sa pamagat na nasa background artwork) */}
      <div className="flex-1" />

      {/* --- ACTION BUTTONS MENU --- */}
      <div className="relative z-20 flex flex-col items-center gap-3.5 w-full max-w-sm px-4 mb-8">
        
        {/* START NEW REALM BUTTON */}
        <button
          type="button"
          onClick={() => handleStartGame(onStartNewRealm)}
          className={`w-full group relative overflow-hidden flex items-center justify-center gap-3 px-6 py-4 rounded-2xl font-black tracking-wider uppercase transition-all duration-150 cursor-pointer border-2 ${
            clickedBtn === 'NEW'
              ? 'scale-95 bg-cyan-300 border-white text-slate-950 shadow-[0_0_35px_rgba(34,211,238,0.9)] brightness-125'
              : 'bg-gradient-to-r from-sky-500 via-cyan-500 to-sky-600 border-cyan-300/80 text-white shadow-[0_6px_0_#0284c7,0_10px_20px_rgba(6,182,212,0.4)] hover:-translate-y-1 hover:shadow-[0_8px_0_#0284c7,0_15px_30px_rgba(6,182,212,0.6)] active:translate-y-1 active:shadow-none'
          }`}
        >
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />
          
          <Play className="w-5 h-5 fill-current transition-transform group-hover:scale-125" />
          <span className="text-base drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
            {language === 'TL' ? 'MAGSIMULA NG LARO ▶' : 'START NEW REALM ▶'}
          </span>
        </button>

        {/* CONTINUE REALM BUTTON */}
        <button
          type="button"
          disabled={!canContinue || checkingSave}
          onClick={() => handleContinueGame(onContinueRealm)}
          className={`w-full group relative overflow-hidden flex items-center justify-center gap-3 px-6 py-3.5 rounded-2xl font-bold tracking-wide transition-all duration-150 border-2 ${
            canContinue && !checkingSave
              ? clickedBtn === 'CONTINUE'
                ? 'scale-95 bg-sky-400 border-white text-slate-950 shadow-[0_0_25px_rgba(56,189,248,0.9)]'
                : 'bg-slate-900/90 border-sky-500/50 text-sky-200 shadow-[0_5px_0_#0f172a,0_8px_16px_rgba(0,0,0,0.6)] hover:-translate-y-0.5 hover:border-sky-300 hover:text-white active:translate-y-1 active:shadow-none cursor-pointer'
              : 'bg-slate-950/70 border-slate-800 text-slate-600 cursor-not-allowed shadow-none'
          }`}
        >
          <RotateCcw className={`w-4 h-4 ${canContinue ? 'text-sky-400 group-hover:rotate-180 transition-transform duration-500' : 'text-slate-600'}`} />
          <span className="text-sm">
            {language === 'TL' ? 'ITULOY ANG LARO 🔄' : 'CONTINUE REALM 🔄'}
          </span>
        </button>

        {/* SETTINGS BUTTON */}
        {onOpenSettings && (
          <button
            type="button"
            onClick={handleSettingsClick}
            className={`w-full group flex items-center justify-center gap-2.5 px-6 py-3 rounded-2xl text-xs font-bold tracking-wider uppercase transition-all duration-150 border ${
              clickedBtn === 'SETTINGS'
                ? 'scale-95 bg-slate-700 text-white border-amber-400'
                : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-red-500/50 hover:text-white hover:bg-slate-900 shadow-[0_4px_0_#050811] active:translate-y-0.5 active:shadow-none cursor-pointer'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-red-400 group-hover:rotate-45 transition-transform" />
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

      {/* --- FOOTER STATUS BADGES --- */}
      <div className="relative z-20 pb-5 flex items-center gap-6 text-[11px] text-slate-400 font-mono tracking-widest">
        <div className="flex items-center gap-1.5 bg-black/60 px-3 py-1 rounded-full border border-slate-800 backdrop-blur-sm">
          <Shield className="w-3 h-3 text-emerald-400" />
          <span>100% Offline IndexedDB</span>
        </div>
        <div className="flex items-center gap-1.5 bg-black/60 px-3 py-1 rounded-full border border-slate-800 backdrop-blur-sm">
          <Compass className="w-3 h-3 text-sky-400" />
          <span>Phaser 3 &bull; EasyStar.js</span>
        </div>
      </div>
    </div>
  );
};