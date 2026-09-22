import React from 'react';
import { useGameStore } from '../state/useGameStore';
import { UpgradesState } from '../types/state';
import { soundFx } from '../game/audio/soundFx';
import { X, Zap, Cpu, Compass, Trees, Hammer } from 'lucide-react';

interface UpgradesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface UpgradeItemConfig {
  key: keyof UpgradesState;
  title: string;
  titleEn?: string;
  description: string;
  descriptionEn?: string;
  icon: React.ReactNode;
}

const UPGRADE_ITEMS: UpgradeItemConfig[] = [
  {
    key: 'golemSpeedLevel',
    title: 'Bilis Tumakbo (Speed)',
    titleEn: 'Movement Speed',
    description: 'Mas mabilis na tatakbo at maglalakad ang mga Golem sa buong isla (+20% Bilis).',
    descriptionEn: 'Golems will run and walk much faster across the island (+20% Speed).',
    icon: <Cpu className="w-6 h-6 text-sky-400" />,
  },
  {
    key: 'golemCapacityLevel',
    title: 'Mas Malaking Bag (Capacity)',
    titleEn: 'Cargo Capacity',
    description: 'Mas maraming madadalang kristal at materyales kada biyahe (+1 Dala).',
    descriptionEn: 'Servants can carry more gems and materials per trip (+1 Cargo).',
    icon: <Zap className="w-6 h-6 text-amber-400" />,
  },
  {
    key: 'nexusLevel',
    title: 'Puso ng Isla (Nexus)',
    titleEn: 'Island Heart (Nexus)',
    description: 'Palakasin ang buong lumilipad na isla upang magbukas ng mga bagong katulong.',
    descriptionEn: 'Strengthen the entire floating island to unlock new units and resources.',
    icon: <Compass className="w-6 h-6 text-purple-400" />,
  },
  {
    key: 'refineryLevel',
    title: 'Puno ng Kagubatan (Trees)',
    titleEn: 'Forest Trees',
    description: 'Kusang nagbibigay ng karagdagang kahoy habang naglalaro.',
    descriptionEn: 'Automatically generates additional wood while playing.',
    icon: <Trees className="w-6 h-6 text-emerald-400" />,
  },
  {
    key: 'quarryLevel',
    title: 'Minahan ng Bato (Quarry)',
    titleEn: 'Stone Quarry',
    description: 'Kusang nagbibigay ng karagdagang bato mula sa mga sinaunang haligi.',
    descriptionEn: 'Automatically generates additional stone from ancient pillars.',
    icon: <Hammer className="w-6 h-6 text-orange-400" />,
  },
];

export const UpgradesModal: React.FC<UpgradesModalProps> = ({ isOpen, onClose }) => {
  const { resources, upgrades, upgradeTech, upgradeSupportSlime, roster, language } = useGameStore();

  const slime = roster.find((unit) => unit.unitClass === 'AQUA_SLIME');
  const slimeLevel = slime?.slimeEvolutionLevel ?? 1;
  const slimeRequiredKills = slimeLevel * 12;
  const slimeCostShards = 30 + slimeLevel * 25;
  const slimeCostWood = 20 + slimeLevel * 18;
  const slimeCostStone = 15 + slimeLevel * 12;
  const slimeCostCoins = 40 + slimeLevel * 35;
  const canUpgradeSlime =
    slimeLevel < 5 &&
    resources.aetherShards >= slimeCostShards &&
    resources.wood >= slimeCostWood &&
    resources.stone >= slimeCostStone &&
    resources.coins >= slimeCostCoins &&
    useGameStore.getState().invasion.invaderKills >= slimeRequiredKills;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none">
      <div className="relative max-w-xl w-full max-h-[85vh] flex flex-col p-6 rounded-2xl border border-sky-500/30 bg-slate-950/95 shadow-2xl shadow-sky-950/80">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-400 shadow-md">
              <Zap className="w-6 h-6 text-sky-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-wide">
                {language === 'TL' ? '⭐ Mga Pampalakas (Upgrades)' : '⭐ Kingdom Upgrades'}
              </h2>
              <p className="text-xs text-slate-400">
                {language === 'TL' ? 'Palakasin ang bilis ng mga katulong at dami ng materyales na naipon!' : 'Upgrade the speed and resource gathering efficiency of your servants!'}
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

        {/* Upgrade Cards List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
          {slime && (
            <div className="glass-panel p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-cyan-500/40 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="p-3 rounded-2xl bg-slate-900 border border-cyan-500/40 mt-0.5 flex-shrink-0 text-cyan-300">
                  💚
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-100">
                      {language === 'TL' ? 'Support Healing Slime Evolution' : 'Support Healing Slime Evolution'}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                      Level {slimeLevel}/5
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">
                    {language === 'TL'
                      ? `Palakasin ang pagpapagaling, pabilisin ang cooldown ng resurrection, at bawasang presyo ng ressurect compensation sa bawat level.`
                      : `Boosts healing/fatigue recovery, grants shorter resurrection cooldown and lowers revival resource costs per level.`}
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  soundFx.playFanfare();
                  upgradeSupportSlime();
                }}
                disabled={slimeLevel >= 5 || !canUpgradeSlime}
                className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex flex-col items-center justify-center transition-all shadow-md ${
                  canUpgradeSlime && slimeLevel < 5
                    ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white shadow-emerald-500/25 cursor-pointer active:scale-95'
                    : 'bg-slate-800/50 text-slate-500 border border-slate-700/40 cursor-not-allowed'
                }`}
              >
                <span className="text-xs font-bold">
                  {slimeLevel >= 5 ? (language === 'TL' ? 'Pinakamataas na Antas (Max Level 5)' : 'Maximum Level 5 Reached') : (language === 'TL' ? 'Evolve Slime (+1)' : 'Evolve Slime (+1)')}
                </span>
                {slimeLevel < 5 && (
                  <span className="text-[10px] opacity-90 mt-0.5 font-mono">
                    {slimeCostShards}💎 {slimeCostWood}🌲 {slimeCostStone}🪨 {slimeCostCoins}🪙
                  </span>
                )}
              </button>
            </div>
          )}
          {UPGRADE_ITEMS.map((item) => {
            const currentLevel = upgrades[item.key];
            const costShards = Math.floor(40 * Math.pow(1.6, currentLevel - 1));
            const costWood = Math.floor(30 * Math.pow(1.5, currentLevel - 1));
            const costStone = Math.floor(25 * Math.pow(1.5, currentLevel - 1));

            const canAfford =
              resources.aetherShards >= costShards &&
              resources.wood >= costWood &&
              resources.stone >= costStone;

            return (
              <div
                key={item.key}
                className="glass-panel p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-slate-800 hover:border-sky-500/40 transition-colors shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="p-3 rounded-2xl bg-slate-900 border border-slate-700/60 mt-0.5 flex-shrink-0">
                    {item.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-100">
                        {language === 'TL' ? item.title : (item.titleEn || item.title)}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-950 text-sky-300 border border-sky-500/30">
                        Level {currentLevel}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm">
                      {language === 'TL' ? item.description : (item.descriptionEn || item.description)}
                    </p>
                  </div>
                </div>

                {/* Upgrade Button */}
                <button
                  onClick={() => {
                    soundFx.playFanfare();
                    upgradeTech(item.key);
                  }}
                  disabled={!canAfford}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex flex-col items-center justify-center transition-all shadow-md ${
                    canAfford
                      ? 'bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white shadow-sky-500/25 cursor-pointer active:scale-95'
                      : 'bg-slate-800/50 text-slate-500 border border-slate-700/40 cursor-not-allowed'
                  }`}
                >
                  <span className="text-xs font-bold">{language === 'TL' ? 'Palakasin (+1 Level)' : 'Upgrade (+1 Level)'}</span>
                  <span className="text-[10px] opacity-90 mt-0.5 font-mono">
                    {costShards}💎 {costWood}🌲 {costStone}🪨
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
