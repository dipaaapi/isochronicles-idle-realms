import React from 'react';
import { useGameStore } from '../state/useGameStore';
import { formatDuration } from '../state/offlineProgression';
import { soundFx } from '../game/audio/soundFx';
import { Clock, Gem, Trees, Hammer, Sparkles, Check } from 'lucide-react';

export const WelcomeBackModal: React.FC = () => {
  const { offlineGains, isOfflineModalOpen, closeOfflineModal } = useGameStore();

  if (!isOfflineModalOpen || !offlineGains) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4 select-none">
      <div className="relative max-w-md w-full p-6 md:p-8 rounded-2xl border border-sky-400/40 bg-slate-950/95 shadow-2xl shadow-sky-950/80 animate-float">
        {/* Header Icon */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-16 h-16 rounded-3xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-400 mb-3 shadow-xl shadow-sky-500/20">
            <Sparkles className="w-8 h-8 animate-pulse text-sky-300" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-wide">
            Maligayang Pagbabalik! 🎉
          </h2>
          <div className="flex items-center gap-1.5 text-xs text-sky-300/90 mt-1 font-bold">
            <Clock className="w-3.5 h-3.5" />
            <span>Nawala ka nang: {formatDuration(offlineGains.elapsedSeconds)}</span>
          </div>
        </div>

        <p className="text-xs text-slate-300 text-center mb-6 leading-relaxed">
          Habang wala ka, patuloy na nagtrabaho at nag-ipon ang iyong mga masisipag na Golem:
        </p>

        {/* Gains Breakdown Grid */}
        <div className="grid grid-cols-3 gap-2.5 mb-8">
          {/* Shards */}
          <div className="glass-panel p-3 rounded-2xl flex flex-col items-center text-center border-sky-500/40 shadow-sm">
            <Gem className="w-6 h-6 text-sky-400 mb-1" />
            <span className="text-[10px] uppercase font-bold text-sky-200">Kristal</span>
            <span className="text-sm font-black font-mono text-sky-300 mt-0.5">
              +{offlineGains.aetherShardsEarned.toLocaleString()}
            </span>
          </div>

          {/* Wood */}
          <div className="glass-panel-emerald p-3 rounded-2xl flex flex-col items-center text-center border-emerald-500/40 shadow-sm">
            <Trees className="w-6 h-6 text-emerald-400 mb-1" />
            <span className="text-[10px] uppercase font-bold text-emerald-200">Kahoy</span>
            <span className="text-sm font-black font-mono text-emerald-300 mt-0.5">
              +{offlineGains.woodEarned.toLocaleString()}
            </span>
          </div>

          {/* Stone */}
          <div className="glass-panel-amber p-3 rounded-2xl flex flex-col items-center text-center border-amber-500/40 shadow-sm">
            <Hammer className="w-6 h-6 text-amber-400 mb-1" />
            <span className="text-[10px] uppercase font-bold text-amber-200">Bato</span>
            <span className="text-sm font-black font-mono text-amber-300 mt-0.5">
              +{offlineGains.stoneEarned.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Claim Action */}
        <button
          onClick={() => {
            soundFx.playDeposit();
            closeOfflineModal();
          }}
          className="w-full py-4 px-4 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 transition-all shadow-xl shadow-sky-500/30 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
        >
          <Check className="w-5 h-5 stroke-[3]" />
          <span>KUNIN LAHAT NG NAIPON! 🎁</span>
        </button>
      </div>
    </div>
  );
};
