import React from 'react';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from '../game/audio/soundFx';
import {
  X,
  Shield,
  Zap,
  Hammer,
  Wrench,
  Swords,
  Coins,
  Crosshair,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';

interface CastleDefenseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CastleDefenseModal: React.FC<CastleDefenseModalProps> = ({ isOpen, onClose }) => {
  const {
    resources,
    defense,
    invasion,
    upgradeDefense,
    repairCastle,
    startInvasion,
  } = useGameStore();

  if (!isOpen) return null;

  const handleClose = () => {
    soundFx.playClick();
    onClose();
  };

  const getUpgradeCost = (key: 'wallLevel' | 'turretLevel' | 'shieldLevel') => {
    const lvl = defense[key];
    const base = key === 'wallLevel' ? 70 : key === 'turretLevel' ? 90 : 110;
    return Math.floor(base * Math.pow(1.5, lvl - 1));
  };

  const wallCost = getUpgradeCost('wallLevel');
  const turretCost = getUpgradeCost('turretLevel');
  const shieldCost = getUpgradeCost('shieldLevel');

  const canAffordWall = resources.coins >= wallCost;
  const canAffordTurret = resources.coins >= turretCost;
  const canAffordShield = resources.coins >= shieldCost;
  const canRepair = resources.coins >= 40 && defense.castleHp < defense.castleMaxHp;

  const hpPct = Math.round((defense.castleHp / defense.castleMaxHp) * 100);
  const shieldPct = Math.round((defense.shieldHp / defense.shieldMaxHp) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-slate-900/95 border border-sky-500/40 rounded-2xl shadow-2xl shadow-sky-950/50 overflow-hidden glass-panel">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-sky-500/20 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-500/20 border border-red-400/40 flex items-center justify-center text-red-400 shadow-md shadow-red-500/10 text-xl">
              🏰
            </div>
            <div>
              <h2 className="text-xl font-bold text-red-100 tracking-wide flex items-center gap-2">
                🏰 Kuta ng Demon Lord at Depensa
              </h2>
              <p className="text-xs text-slate-400">
                Depensahan ang iyong kuta laban sa mga sumusugod na Kawal ng Tao at mga Makinang Mecha!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-amber-500/20 border border-amber-400/40">
              <Coins className="w-4 h-4 text-amber-300" />
              <span className="text-sm font-black font-mono text-amber-300">
                {resources.coins.toLocaleString()} 🪙
              </span>
            </div>

            <button
              onClick={handleClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          {/* Castle Integrity & Shield Gauges */}
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3 shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-emerald-400" />
                Buhay ng Kastilyo (Castle Health)
              </span>
              <span className="text-xs font-mono font-bold text-emerald-300">
                {defense.castleHp} / {defense.castleMaxHp} HP ({hpPct}%)
              </span>
            </div>
            <div className="w-full h-3.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800 p-0.5">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-300 shadow-sm"
                style={{ width: `${hpPct}%` }}
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-sky-400" />
                Nagliliwanag na Kalasag (Shield)
              </span>
              <span className="text-xs font-mono font-bold text-sky-300">
                {defense.shieldHp} / {defense.shieldMaxHp} SP ({shieldPct}%)
              </span>
            </div>
            <div className="w-full h-3.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800 p-0.5">
              <div
                className="h-full bg-gradient-to-r from-sky-500 to-cyan-400 rounded-full transition-all duration-300 shadow-sm"
                style={{ width: `${shieldPct}%` }}
              />
            </div>

            {/* Repair Button */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-slate-800/80">
              <span className="text-xs text-slate-300">
                Nasira ba sa laban? Gamutin ang kastilyo (+120 Buhay):
              </span>
              <button
                onClick={() => {
                  soundFx.playClick();
                  repairCastle();
                }}
                disabled={!canRepair}
                className={`px-4 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 shadow-sm ${
                  canRepair
                    ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200 hover:bg-emerald-500/30'
                    : 'bg-slate-900/40 border-slate-800 text-slate-600 cursor-not-allowed'
                }`}
              >
                <Wrench className="w-4 h-4" />
                Ayusin ang Kastilyo (40 🪙)
              </button>
            </div>
          </div>

          {/* Fortification Upgrades List */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Palakasin ang mga Depensa
            </h3>

            {/* 1. Fortified Walls */}
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-amber-400/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 text-xl flex-shrink-0">
                  🧱
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-100 text-sm">Matibay na Bakod (Walls)</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-amber-300 border border-amber-500/20">
                      Level {defense.wallLevel}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    +200 Karagdagang Buhay sa Kastilyo upang hindi mawasak agad.
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  soundFx.playClick();
                  upgradeDefense('wallLevel');
                }}
                disabled={!canAffordWall}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold flex-shrink-0 transition-all cursor-pointer active:scale-95 shadow-md ${
                  canAffordWall
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-amber-500/25'
                    : 'bg-slate-800/50 border border-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                Tibayan ({wallCost} 🪙)
              </button>
            </div>

            {/* 2. Arcane Ballista / Turrets */}
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-sky-400/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 text-xl flex-shrink-0">
                  🏹
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-100 text-sm">Kusang Tagabaril (Turret)</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-sky-300 border border-sky-500/20">
                      Level {defense.turretLevel}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Kusang pumupuksa at bumabaril ng laser sa mga lumalapit na halimaw.
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  soundFx.playClick();
                  upgradeDefense('turretLevel');
                }}
                disabled={!canAffordTurret}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold flex-shrink-0 transition-all cursor-pointer active:scale-95 shadow-md ${
                  canAffordTurret
                    ? 'bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white shadow-sky-500/25'
                    : 'bg-slate-800/50 border border-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                Palakasin ({turretCost} 🪙)
              </button>
            </div>

            {/* 3. Radiant Aegis Shield */}
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-purple-400/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 text-xl flex-shrink-0">
                  🛡️
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-100 text-sm">Proteksyong Kalasag (Shield)</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-purple-300 border border-purple-500/20">
                      Level {defense.shieldLevel}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    +100 Shield! Sumasalo muna sa bawat atake bago mabawasan ang kastilyo.
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  soundFx.playClick();
                  upgradeDefense('shieldLevel');
                }}
                disabled={!canAffordShield}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold flex-shrink-0 transition-all cursor-pointer active:scale-95 shadow-md ${
                  canAffordShield
                    ? 'bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white shadow-purple-500/25'
                    : 'bg-slate-800/50 border border-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                Palakasin ({shieldCost} 🪙)
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            Click approaching invaders during incursions to strike them with Lightning Smite! ⚡
          </span>
          <button
            onClick={handleClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
