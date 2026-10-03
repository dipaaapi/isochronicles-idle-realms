import React from 'react';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from '../game/audio/soundFx';
import { X, BookOpen } from 'lucide-react';

interface CodexModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CodexModal: React.FC<CodexModalProps> = ({ isOpen, onClose }) => {
  const language = useGameStore((state) => state.language);
  const isTL = language === 'TL';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none">
      <div className="relative max-w-xl w-full max-h-[85vh] flex flex-col p-6 rounded-3xl border border-purple-500/40 bg-slate-950/95 shadow-2xl shadow-purple-950/80">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-purple-400 shadow-md">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-wide">
                📖 {isTL ? 'Paano Laruin (Gabay sa Laro)' : 'How to Play (Beginner Guide)'}
              </h2>
              <p className="text-xs text-slate-400">
                {isTL
                  ? 'Napakadali lang! Sundin ang 4 na simpleng hakbang na ito:'
                  : 'Very easy! Follow these 4 simple steps to conquer:'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              soundFx.playClick();
              onClose();
            }}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step-by-Step Cards */}
        <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 text-sm text-slate-300 custom-scrollbar">
          {/* Step 1 */}
          <div className="glass-panel p-4 rounded-2xl border-sky-500/30 bg-sky-950/20">
            <div className="flex items-center gap-2.5 text-sky-300 font-bold mb-1.5 text-sm">
              <span className="w-6 h-6 rounded-full bg-sky-500/30 border border-sky-400 flex items-center justify-center text-xs text-white">1</span>
              <span>🤖 {isTL ? 'Panoorin ang Iyong mga Katulong' : 'Watch Your Minions Gather'}</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed pl-8">
              {isTL ? (
                <>
                  Kusa silang naglalakad sa buong lumilipad na isla para mangalap ng 💎 Kristal, 🌲 Kahoy, at 🪨 Bato. 
                  <br /><strong className="text-amber-300">Sikreto:</strong> Pindutin ang mga Golem para tumalon at bumilis magtrabaho! ⚡
                </>
              ) : (
                <>
                  They automatically roam your floating realm collecting 💎 Crystals, 🌲 Wood, and 🪨 Stone.
                  <br /><strong className="text-amber-300">Tip:</strong> Click on your Golems to make them bounce and gather faster! ⚡
                </>
              )}
            </p>
          </div>

          {/* Step 2 */}
          <div className="glass-panel p-4 rounded-2xl border-amber-500/30 bg-amber-950/20">
            <div className="flex items-center gap-2.5 text-amber-300 font-bold mb-1.5 text-sm">
              <span className="w-6 h-6 rounded-full bg-amber-500/30 border border-amber-400 flex items-center justify-center text-xs text-white">2</span>
              <span>🏪 {isTL ? 'Magpalit ng Barya sa Tindahan' : 'Trade Resources in the Market'}</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed pl-8">
              {isTL ? (
                <>
                  Pindutin ang pindutan ng <strong>Tindahan</strong> para ibenta ang naipon mong materyales at makakuha ng kumikinang na 🪙 <strong>Gintong Barya</strong>.
                </>
              ) : (
                <>
                  Open the <strong>Market</strong> tab to exchange gathered resources for shiny 🪙 <strong>Gold Coins</strong> anytime.
                </>
              )}
            </p>
          </div>

          {/* Step 3 */}
          <div className="glass-panel p-4 rounded-2xl border-emerald-500/30 bg-emerald-950/20">
            <div className="flex items-center gap-2.5 text-emerald-300 font-bold mb-1.5 text-sm">
              <span className="w-6 h-6 rounded-full bg-emerald-500/30 border border-emerald-400 flex items-center justify-center text-xs text-white">3</span>
              <span>⭐ {isTL ? 'Mag-Level Up at Kumuha ng Sandata' : 'Level Up & Craft Equipment'}</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed pl-8">
              {isTL ? (
                <>
                  Gamitin ang mga barya at materyales para pabilisin ang mga Golem sa <strong>Pampalakas</strong> o gawan sila ng matatalim na espada sa <strong>Gamit</strong>!
                </>
              ) : (
                <>
                  Use coins and materials to boost servant stats in <strong>Research</strong> or craft powerful tools and weapons in the <strong>Armory</strong>!
                </>
              )}
            </p>
          </div>

          {/* Step 4 */}
          <div className="glass-panel p-4 rounded-2xl border-rose-500/30 bg-rose-950/20">
            <div className="flex items-center gap-2.5 text-rose-300 font-bold mb-1.5 text-sm">
              <span className="w-6 h-6 rounded-full bg-rose-500/30 border border-rose-400 flex items-center justify-center text-xs text-white">4</span>
              <span>🏰 {isTL ? 'Ipagtanggol ang Kastilyo sa mga Halimaw' : 'Defend Against Invaders'}</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed pl-8">
              {isTL ? (
                <>
                  Kapag may sumugod na halimaw mula sa dilim, i-click o i-tap sila kahit saan sa screen para tamaan ng kidlat! ⚡ Huwag hayaang masira ang iyong Kastilyo!
                </>
              ) : (
                <>
                  When invaders assault the realm, click or tap them anywhere on the map to smite with lightning! ⚡ Defend your Castle at all costs!
                </>
              )}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={() => {
              soundFx.playClick();
              onClose();
            }}
            className="px-6 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-white font-bold text-xs transition-all cursor-pointer shadow-md"
          >
            {isTL ? 'Naintindihan Ko Na! 🚀' : 'Got it! Let\'s Play 🚀'}
          </button>
        </div>
      </div>
    </div>
  );
};
