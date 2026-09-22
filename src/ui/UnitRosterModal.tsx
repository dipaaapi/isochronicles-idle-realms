import React, { useState } from 'react';
import { useGameStore } from '../state/useGameStore';
import {
  UnitClass,
  UNIT_CLASSES,
  HarvestTask,
  TASK_CONFIG,
} from '../types/game';
import { soundFx } from '../game/audio/soundFx';
import {
  X,
  Bot,
  Gem,
  Trees,
  Hammer,
  Sparkles,
  Plus,
  Lock,
  Compass,
  Users,
  Check,
  Shield,
  Zap,
} from 'lucide-react';

interface UnitRosterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UnitRosterModal: React.FC<UnitRosterModalProps> = ({ isOpen, onClose }) => {
  const {
    roster,
    resources,
    upgrades,
    castleBuilt,
    resourceBuildings,
    assignUnitTask,
    summonUnit,
    language,
  } = useGameStore();

  const [activeTab, setActiveTab] = useState<'COMMAND' | 'SUMMON'>('COMMAND');

  if (!isOpen) return null;

  const handleClose = () => {
    soundFx.playClick();
    onClose();
  };

  const handleSummon = (unitClass: UnitClass) => {
    soundFx.playClick();
    onClose();
    window.setTimeout(() => {
      summonUnit(unitClass);
    }, 0);
  };

  const tasksList: HarvestTask[] = [
    'AETHER',
    ...(castleBuilt && resourceBuildings.QUARRY.level >= 1 ? ['STONE' as HarvestTask] : []),
    ...(castleBuilt && resourceBuildings.WOOD.level >= 1 ? ['WOOD' as HarvestTask] : []),
    ...(castleBuilt && resourceBuildings.MINE.level >= 1 ? ['METAL' as HarvestTask] : []),
    ...(castleBuilt && resourceBuildings.PORT.level >= 1 ? ['FISH' as HarvestTask, 'WATER' as HarvestTask] : []),
    ...(castleBuilt ? ['HEAL' as HarvestTask] : []),
  ];

  const getTaskButtonStyles = (task: HarvestTask, isSelected: boolean) => {
    if (!isSelected) {
      return 'bg-slate-900/60 border-slate-700/60 text-slate-400 hover:border-slate-500 hover:text-slate-200';
    }
    switch (task) {
      case 'AETHER':
        return 'bg-sky-500/20 border-sky-400 text-sky-300 shadow-md shadow-sky-500/20';
      case 'STONE':
        return 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md shadow-amber-500/20';
      case 'WOOD':
        return 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-md shadow-emerald-500/20';
      case 'ESSENCE':
        return 'bg-purple-500/20 border-purple-400 text-purple-300 shadow-md shadow-purple-500/20';
      case 'FISH':
        return 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-md shadow-cyan-500/20';
      case 'WATER':
        return 'bg-blue-500/20 border-blue-400 text-blue-300 shadow-md shadow-blue-500/20';
      case 'HEAL':
        return 'bg-green-500/20 border-green-400 text-green-300 shadow-md shadow-green-500/20';
    }
  };

  const getUnitClassIcon = (unitClass: UnitClass) => {
    switch (unitClass) {
      case 'GOLEM':
        return <Hammer className="w-4 h-4 text-amber-400" />;
      case 'WAYFARER':
        return <Compass className="w-4 h-4 text-emerald-400" />;
      case 'CHRONO':
        return <Sparkles className="w-4 h-4 text-purple-400" />;
      case 'AQUA_SLIME':
        return <span className="text-cyan-400 text-xs">�</span>;
      case 'MERMAN':
        return <span className="text-blue-400 text-xs">🧜</span>;
      case 'NECROMANCER':
        return <span className="text-green-400 text-xs">💀</span>;
    }
  };

  const getUnitBadgeColor = (unitClass: UnitClass) => {
    switch (unitClass) {
      case 'GOLEM':
        return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
      case 'WAYFARER':
        return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
      case 'CHRONO':
        return 'border-purple-500/30 bg-purple-500/10 text-purple-300';
      case 'AQUA_SLIME':
        return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300';
      case 'MERMAN':
        return 'border-blue-500/30 bg-blue-500/10 text-blue-300';
      case 'NECROMANCER':
        return 'border-green-500/30 bg-green-500/10 text-green-300';
    }
  };

  // Calculate summon cost for a class
  const getSummonCost = (cls: UnitClass) => {
    const count = roster.filter((u) => u.unitClass === cls).length;
    switch (cls) {
      case 'GOLEM':
        return {
          shards: 30 + count * 20,
          stone: 20 + count * 15,
          wood: 0,
        };
      case 'WAYFARER':
        return {
          shards: 40 + count * 25,
          wood: 30 + count * 20,
          stone: 0,
        };
      case 'CHRONO':
        return {
          shards: 70 + count * 40,
          stone: 45 + count * 25,
          wood: 35 + count * 20,
        };
      case 'MERMAN':
        return {
          shards: 30 + count * 18,
          wood: 20 + count * 12,
          stone: 0,
        };
      case 'NECROMANCER':
        return {
          shards: 60 + count * 30,
          stone: 30 + count * 20,
          wood: 0,
        };
      default:
        return { shards: 0, stone: 0, wood: 0 };
    }
  };

  const canAfford = (cost: { shards: number; stone: number; wood: number }) => {
    return (
      resources.aetherShards >= cost.shards &&
      resources.stone >= cost.stone &&
      resources.wood >= cost.wood
    );
  };

  const isUnlocked = (cls: UnitClass) => {
    const cfg = UNIT_CLASSES[cls];
    return (
      upgrades.nexusLevel >= cfg.requiredNexusLevel &&
      upgrades.refineryLevel >= cfg.requiredRefineryLevel
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-3xl max-h-[85vh] flex flex-col bg-slate-900/90 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden glass-panel">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/70 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-500/20 border border-red-400/40 flex items-center justify-center text-red-400 shadow-md shadow-red-500/10 text-xl">
              👹
            </div>
            <div>
              <h2 className="text-xl font-bold text-red-100 tracking-wide flex items-center gap-2">
                {language === 'TL' ? '👹 Mga Alagad na Demonyo at Halimaw' : '👹 Demon Servants & Monsters'}
              </h2>
              <p className="text-xs text-slate-400">
                {language === 'TL' 
                  ? 'Utusan ang iyong mga mababangis na halimaw at demonyo kung anong yaman ang titipunin para sa Demon Lord!'
                  : 'Command your fierce monsters and demons on what resources to gather for the Demon Lord!'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6">
          <button
            onClick={() => {
              soundFx.playClick();
              setActiveTab('COMMAND');
            }}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-bold tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'COMMAND'
                ? 'border-red-400 text-red-300 bg-red-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            {language === 'TL' ? `Utusan ang mga Alagad (${roster.length})` : `Command Servants (${roster.length})`}
          </button>
          <button
            onClick={() => {
              soundFx.playClick();
              setActiveTab('SUMMON');
            }}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-bold tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'SUMMON'
                ? 'border-amber-400 text-amber-300 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Plus className="w-4 h-4" />
            {language === 'TL' ? 'Tawagin ang Bagong Halimaw / Demonyo (+1)' : 'Summon New Monster / Demon (+1)'}
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {activeTab === 'COMMAND' ? (
            <div className="space-y-3">
              <div className="text-xs text-slate-300 bg-red-950/40 border border-red-500/20 p-2.5 rounded-xl flex items-center justify-between">
                <span>{language === 'TL' ? '👉 Pindutin ang yaman na nais mong ipakalap sa iyong alagad:' : '👉 Click the resource you want your servant to gather:'}</span>
                <span className="text-[11px] text-amber-400 font-bold">
                  {language === 'TL' ? '💎 Kristal • 🪨 Bato • 🌲 Kahoy • 🔮 Magic' : '💎 Gems • 🪨 Stone • 🌲 Wood • 🔮 Magic'}
                </span>
              </div>

              {roster.map((unit) => {
                const classCfg = UNIT_CLASSES[unit.unitClass];
                return (
                  <div
                    key={unit.id}
                    className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-sky-500/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm"
                  >
                    {/* Unit Info */}
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-slate-900 border border-slate-700/80 flex items-center justify-center flex-shrink-0 text-sky-400">
                        {getUnitClassIcon(unit.unitClass)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-100 text-sm">{unit.name}</span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${getUnitBadgeColor(
                              unit.unitClass
                            )}`}
                          >
                            {language === 'TL' ? classCfg.name : (classCfg.nameEn || classCfg.name)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {language === 'TL' ? classCfg.description : (classCfg.descriptionEn || classCfg.description)}
                        </p>
                      </div>
                    </div>

                    {/* Task Selector Buttons or Support Slime Lock */}
                    {unit.unitClass === 'AQUA_SLIME' ? (
                      <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-cyan-500/40 bg-cyan-950/40 text-cyan-300 text-xs font-bold shadow-sm">
                        <span className="text-base">💚</span>
                        <span>{language === 'TL' ? 'Permanenteng Healer & Resurrector (Bawal Mangalap)' : 'Dedicated Healer & Resurrector (No Gathering)'}</span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                        {tasksList.map((t) => {
                          const tCfg = TASK_CONFIG[t];
                          const isSelected = unit.assignedTask === t;
                          return (
                            <button
                              key={t}
                              onClick={() => {
                                soundFx.playClick();
                                assignUnitTask(unit.id, t);
                              }}
                              className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-sm ${getTaskButtonStyles(
                                t,
                                isSelected
                              )}`}
                              title={language === 'TL' ? `Ipatrabaho: ${tCfg.description}` : `Assign Task: ${tCfg.description}`}
                            >
                              <span className="text-sm">{tCfg.icon}</span>
                              <span>{tCfg.label.split(' ')[0]}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 ml-0.5 stroke-[3]" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {(['GOLEM', 'WAYFARER', 'CHRONO', 'MERMAN', 'NECROMANCER'] as UnitClass[]).map((cls) => {
                const cfg = UNIT_CLASSES[cls];
                const cost = getSummonCost(cls);
                const affordable = canAfford(cost);
                const unlocked = isUnlocked(cls);
                const countOfClass = roster.filter((u) => u.unitClass === cls).length;
                const isMaxed = countOfClass >= (cls === 'AQUA_SLIME' ? 1 : 8);

                return (
                  <div
                    key={cls}
                    className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
                      !unlocked
                        ? 'bg-slate-950/40 border-slate-800/50 opacity-65'
                        : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-lg bg-slate-900 border border-slate-700/80">
                            {getUnitClassIcon(cls)}
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-100">
                              {language === 'TL' ? cfg.name : (cfg.nameEn || cfg.name)}
                            </h3>
                            <span className="text-[10px] text-slate-400">
                              Active: {countOfClass}
                            </span>
                          </div>
                        </div>

                        {!unlocked && (
                          <div className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400">
                            <Lock className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>

                      <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                        {language === 'TL' ? cfg.description : (cfg.descriptionEn || cfg.description)}
                      </p>

                      {/* Class Stats */}
                      <div className="space-y-1 text-xs text-slate-300 mb-4 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                        <div className="flex justify-between">
                          <span className="text-slate-400">{language === 'TL' ? 'Bilis Maglakad:' : 'Movement Speed:'}</span>
                          <span className="font-bold text-sky-300">{cfg.baseSpeed > 100 ? (language === 'TL' ? '🚀 Napakabilis' : '🚀 Very Fast') : (language === 'TL' ? '⚡ Mabilis' : '⚡ Fast')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">{language === 'TL' ? 'Kargang Dala:' : 'Cargo Capacity:'}</span>
                          <span className="font-bold text-amber-300">
                            🎒 {cfg.cargoCapacity} {language === 'TL' ? 'kada biyahe' : 'per trip'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">{language === 'TL' ? 'Paboritong Trabaho:' : 'Preferred Task:'}</span>
                          <span className="font-bold text-emerald-300">
                            {TASK_CONFIG[cfg.preferredTask].icon}{' '}
                            {TASK_CONFIG[cfg.preferredTask].label.split(' ')[0]}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      {/* Cost & Requirements */}
                      {!unlocked ? (
                        <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 p-2.5 rounded-xl text-center mb-3">
                          {language === 'TL' ? `Kailangan ng Level ${cfg.requiredNexusLevel} Puso ng Isla` : `Requires Nexus Level ${cfg.requiredNexusLevel}`}
                        </div>
                      ) : isMaxed ? (
                        <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-xl text-center mb-3 font-bold">
                          {language === 'TL'
                            ? `Naabot na ang Limit (${cls === 'AQUA_SLIME' ? '1/1' : '8/8'})`
                            : `Maximum Limit Reached (${cls === 'AQUA_SLIME' ? '1/1' : '8/8'})`}
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-center gap-2.5 text-xs font-bold mb-3 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                          <span className="text-slate-400">{language === 'TL' ? 'Halaga:' : 'Cost:'}</span>
                          {cost.shards > 0 && (
                            <span
                              className={
                                resources.aetherShards >= cost.shards
                                  ? 'text-sky-300'
                                  : 'text-rose-400'
                              }
                            >
                              💎 {cost.shards}
                            </span>
                          )}
                          {cost.stone > 0 && (
                            <span
                              className={
                                resources.stone >= cost.stone ? 'text-amber-300' : 'text-rose-400'
                              }
                            >
                              🪨 {cost.stone}
                            </span>
                          )}
                          {cost.wood > 0 && (
                            <span
                              className={
                                resources.wood >= cost.wood ? 'text-emerald-300' : 'text-rose-400'
                              }
                            >
                              🌲 {cost.wood}
                            </span>
                          )}
                        </div>
                      )}

                      <button
                        onClick={() => {
                          handleSummon(cls);
                        }}
                        disabled={!unlocked || !affordable || isMaxed}
                        className={`w-full py-2.5 px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md ${
                          unlocked && affordable && !isMaxed
                            ? 'bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white shadow-red-600/30 active:scale-95'
                            : 'bg-slate-800/50 border border-slate-700 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {!unlocked ? (
                          <>{language === 'TL' ? `Kailangan: Puso ng Isla Lvl ${cfg.requiredNexusLevel}` : `Req: Nexus Lvl ${cfg.requiredNexusLevel}`}</>
                        ) : isMaxed ? (
                          <>{language === 'TL' ? `Puno na ang Alagad` : `Roster Full`}</>
                        ) : (
                          <>
                            <Plus className="w-4 h-4" />
                            {language === 'TL' 
                              ? `Tawagin ang ${cfg.name.split(' ')[0] || cfg.name}` 
                              : `Summon ${(cfg.nameEn || cfg.name).split(' ')[0] || cfg.nameEn}`}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between text-xs text-slate-400">
          <span>💡 Tip: Pindutin ang iyong mga Halimaw at Demonyo sa mapa para sumigla at bumilis! ⚡</span>
          <button
            onClick={handleClose}
            className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold transition-all cursor-pointer shadow-md"
          >
            Sige, Ayos Na! 👍
          </button>
        </div>
      </div>
    </div>
  );
};
