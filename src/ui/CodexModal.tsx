import React from 'react';
import { soundFx } from '../game/audio/soundFx';
import { X, BookOpen, Sparkles, Compass, ShieldCheck } from 'lucide-react';

interface CodexModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CodexModal: React.FC<CodexModalProps> = ({ isOpen, onClose }) => {
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
                📖 Paano Laruin (Gabay sa Laro)
              </h2>
              <p className="text-xs text-slate-400">
                Napakadali lang! Sundin ang 4 na simpleng hakbang na ito:
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

        {/* Step-by-Step Kid-Friendly Cards */}
        <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 text-sm text-slate-300 custom-scrollbar">
          {/* Step 1 */}
          <div className="glass-panel p-4 rounded-2xl border-sky-500/30 bg-sky-950/20">
            <div className="flex items-center gap-2.5 text-sky-300 font-bold mb-1.5 text-sm">
              <span className="w-6 h-6 rounded-full bg-sky-500/30 border border-sky-400 flex items-center justify-center text-xs text-white">1</span>
              <span>🤖 Panoorin ang Iyong mga Katulong</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed pl-8">
              Kusa silang naglalakad sa buong lumilipad na isla para mangalap ng 💎 Kristal, 🌲 Kahoy, at 🪨 Bato. 
              <br /><strong className="text-amber-300">Sikreto:</strong> Pindutin ang mga Golem para tumalon at bumilis magtrabaho! ⚡
            </p>
          </div>

          {/* Step 2 */}
          <div className="glass-panel p-4 rounded-2xl border-amber-500/30 bg-amber-950/20">
            <div className="flex items-center gap-2.5 text-amber-300 font-bold mb-1.5 text-sm">
              <span className="w-6 h-6 rounded-full bg-amber-500/30 border border-amber-400 flex items-center justify-center text-xs text-white">2</span>
              <span>🏪 Magpalit ng Barya sa Tindahan</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed pl-8">
              Pindutin ang pindutan ng <strong>Tindahan</strong> para ibenta ang naipon mong materyales at makakuha ng kumikinang na 🪙 <strong>Gintong Barya</strong>.
            </p>
          </div>

          {/* Step 3 */}
          <div className="glass-panel p-4 rounded-2xl border-emerald-500/30 bg-emerald-950/20">
            <div className="flex items-center gap-2.5 text-emerald-300 font-bold mb-1.5 text-sm">
              <span className="w-6 h-6 rounded-full bg-emerald-500/30 border border-emerald-400 flex items-center justify-center text-xs text-white">3</span>
              <span>⭐ Mag-Level Up at Kumuha ng Sandata</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed pl-8">
              Gamitin ang mga barya at materyales para pabilisin ang mga Golem sa <strong>Pampalakas</strong> o gawan sila ng matatalim na espada sa <strong>Gamit</strong>!
            </p>
          </div>

          {/* Step 4 */}
          <div className="glass-panel p-4 rounded-2xl border-rose-500/30 bg-rose-950/20">
            <div className="flex items-center gap-2.5 text-rose-300 font-bold mb-1.5 text-sm">
              <span className="w-6 h-6 rounded-full bg-rose-500/30 border border-rose-400 flex items-center justify-center text-xs text-white">4</span>
              <span>🏰 Ipagtanggol ang Kastilyo sa mga Halimaw</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed pl-8">
              Kapag may sumugod na halimaw mula sa dilim, i-click o i-tap sila kahit saan sa screen para tamaan ng kidlat! ⚡ Huwag hayaang masira ang iyong Kastilyo!
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
            Naintindihan Ko Na! 🚀
          </button>
        </div>
      </div>
    </div>
  );
};
