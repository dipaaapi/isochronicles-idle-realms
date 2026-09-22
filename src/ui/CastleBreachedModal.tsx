import React from 'react';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from '../game/audio/soundFx';
import {
  RotateCcw,
  ShieldAlert,
  Coins,
  Gem,
  Trees,
  Hammer,
  Sparkles,
  Trophy,
  CheckCircle2,
} from 'lucide-react';

export const CastleBreachedModal: React.FC = () => {
  const {
    isCastleBreachedModalOpen,
    closeCastleBreachedModal,
    resources,
    lootedResources,
    achievements,
    defense,
    language,
  } = useGameStore();

  if (!isCastleBreachedModalOpen) return null;

  const handleReconstruct = () => {
    soundFx.playFanfare();
    closeCastleBreachedModal();
  };

  const isTl = language === 'TL';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-lg animate-fade-in select-none">
      <div className="relative w-full max-w-xl flex flex-col bg-slate-900/95 border-2 border-rose-500/60 rounded-3xl shadow-2xl shadow-rose-950/80 overflow-hidden glass-panel">
        {/* Banner */}
        <div className="p-6 bg-gradient-to-b from-rose-950/80 to-slate-950/80 border-b border-rose-500/30 text-center">
          <div className="w-16 h-16 mx-auto mb-3 rounded-3xl bg-rose-500/20 border border-rose-400/50 flex items-center justify-center text-rose-400 shadow-xl shadow-rose-500/20 text-3xl animate-bounce">
            🏰💥
          </div>
          <h2 className="text-2xl font-bold text-rose-100 tracking-wide">
            {isTl ? 'Nawasak ang Kastilyo!' : 'Castle Crushed!'}
          </h2>
          <p className="text-xs text-rose-300 mt-1.5 max-w-md mx-auto leading-relaxed">
            {isTl
              ? 'Napasok ng mga kaaway ang kuta! Ninakaw nila ang 50% ng iyong mga yaman bago tumakas palayo sa platform!'
              : 'The enemies successfully crushed the castle! They plundered 50% of your resources before fleeing the platform!'}
          </p>
        </div>

        {/* Resources Plundered & Retained */}
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              {isTl ? '50% Ninakaw ng Kaaway' : '50% Plundered by Invaders'}
            </span>
            <span className="text-[11px] text-emerald-400 font-bold">
              {isTl ? '50% Naitabi / Natira' : '50% Preserved & Kept'}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
            {/* Gold Coins */}
            <div className="p-3 rounded-2xl bg-slate-950/80 border border-amber-500/30 flex items-center gap-2.5">
              <Coins className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">{isTl ? 'Barya' : 'Coins'}</span>
                <span className="text-sm font-mono font-black text-amber-300">
                  {resources.coins.toLocaleString()} 🪙
                </span>
                {lootedResources?.coins ? (
                  <span className="text-[10px] text-rose-400 font-mono block">-{lootedResources.coins.toLocaleString()}</span>
                ) : null}
              </div>
            </div>

            {/* Shards */}
            <div className="p-3 rounded-2xl bg-slate-950/80 border border-sky-500/30 flex items-center gap-2.5">
              <Gem className="w-5 h-5 text-sky-400 flex-shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">{isTl ? 'Kristal' : 'Gems'}</span>
                <span className="text-sm font-mono font-black text-sky-300">
                  {resources.aetherShards.toLocaleString()} 💎
                </span>
                {lootedResources?.aetherShards ? (
                  <span className="text-[10px] text-rose-400 font-mono block">-{lootedResources.aetherShards.toLocaleString()}</span>
                ) : null}
              </div>
            </div>

            {/* Wood */}
            <div className="p-3 rounded-2xl bg-slate-950/80 border border-emerald-500/30 flex items-center gap-2.5">
              <Trees className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">{isTl ? 'Kahoy' : 'Wood'}</span>
                <span className="text-sm font-mono font-black text-emerald-300">
                  {resources.wood.toLocaleString()} 🌲
                </span>
                {lootedResources?.wood ? (
                  <span className="text-[10px] text-rose-400 font-mono block">-{lootedResources.wood.toLocaleString()}</span>
                ) : null}
              </div>
            </div>

            {/* Stone */}
            <div className="p-3 rounded-2xl bg-slate-950/80 border border-amber-500/30 flex items-center gap-2.5">
              <Hammer className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">{isTl ? 'Bato' : 'Stone'}</span>
                <span className="text-sm font-mono font-black text-amber-300">
                  {resources.stone.toLocaleString()} 🪨
                </span>
                {lootedResources?.stone ? (
                  <span className="text-[10px] text-rose-400 font-mono block">-{lootedResources.stone.toLocaleString()}</span>
                ) : null}
              </div>
            </div>

            {/* Essence */}
            <div className="p-3 rounded-2xl bg-slate-950/80 border border-purple-500/30 flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-purple-400 flex-shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">{isTl ? 'Magic' : 'Essence'}</span>
                <span className="text-sm font-mono font-black text-purple-300">
                  {resources.arcaneEssence.toLocaleString()} 🔮
                </span>
                {lootedResources?.arcaneEssence ? (
                  <span className="text-[10px] text-rose-400 font-mono block">-{lootedResources.arcaneEssence.toLocaleString()}</span>
                ) : null}
              </div>
            </div>

            {/* Achievements */}
            <div className="p-3 rounded-2xl bg-slate-950/80 border border-yellow-500/30 flex items-center gap-2.5">
              <Trophy className="w-5 h-5 text-yellow-400 flex-shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">{isTl ? 'Mga Gantimpala' : 'Achievements'}</span>
                <span className="text-sm font-mono font-black text-yellow-300">
                  {achievements.length} {isTl ? 'Nakuha 🏆' : 'Earned 🏆'}
                </span>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 space-y-1.5 leading-relaxed">
            <p className="text-amber-300 font-bold">{isTl ? 'Ano ang nangyari?' : 'What happened?'}</p>
            <p>
              • {isTl ? 'Umalis na ang mga kaaway sa platform dala ang 50% ng iyong mga yaman.' : 'Enemies have vacated the platform after taking 50% of your resources.'}
            </p>
            <p>
              • {isTl ? `Awtomatikong naisaayos ang Kastilyo sa buong ${defense.castleMaxHp} HP!` : `The castle has been rebuilt with full ${defense.castleMaxHp} HP!`}
            </p>
            <p>
              • {isTl ? 'Gamitin ang natirang yaman at barya upang palakasin ang mga depensa at hukbo para sa susunod na laban!' : 'Utilize remaining resources and defense upgrades to fortify your realm for future waves!'}
            </p>
          </div>
        </div>

        {/* Footer Button */}
        <div className="p-6 pt-0">
          <button
            onClick={handleReconstruct}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold text-base shadow-xl shadow-emerald-500/30 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-5 h-5" />
            <span>{isTl ? 'ITULOY ANG LABAN AT PAGBUO! 🏰' : 'CONTINUE DEFENDING & REBUILD! 🏰'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
