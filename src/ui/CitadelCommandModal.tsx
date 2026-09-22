import React, { useState } from 'react';
import { useGameStore, RESOURCE_PRICES, RESOURCE_BUILDING_CONFIG } from '../state/useGameStore';
import { soundFx } from '../game/audio/soundFx';
import {
  UnitClass,
  UNIT_CLASSES,
  HarvestTask,
  TASK_CONFIG,
  CRAFTABLE_ITEMS,
  EquipmentItem,
  EquipmentSlot,
  GOD_BLESSINGS,
  GodBlessingId,
  TREANT_EVOLUTION,
} from '../types/game';
import { ResourceBuildingId, UpgradesState } from '../types/state';
import {
  X,
  Castle,
  Users,
  Store,
  Hammer,
  Zap,
  Shield,
  Plus,
  Coins,
  Gem,
  Trees,
  Check,
  ChevronRight,
  Sparkles,
  ArrowDownUp,
  Cpu,
  Compass,
  Wrench,
  Crosshair,
  TrendingUp,
} from 'lucide-react';

export type CitadelTab = 'MINIONS' | 'MARKET' | 'FORGE' | 'RESEARCH' | 'CASTLE';

interface CitadelCommandModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: CitadelTab;
}

export const CitadelCommandModal: React.FC<CitadelCommandModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'MINIONS',
}) => {
  const {
    resources,
    roster,
    upgrades,
    defense,
    inventory,
    language,
    assignUnitTask,
    summonUnit,
    upgradeSupportSlime,
    sellResource,
    buyResource,
    merchantRestockTimer,
    craftEquipment,
    purchaseEquipment,
    equipItem,
    unequipItem,
    upgradeTech,
    upgradeDefense,
    repairCastle,
    activeGodBlessings,
    activateGodBlessing,
    upgradeTreant,
    castleBuilt,
    resourceBuildings,
    buildCastle,
    upgradeResourceBuilding,
  } = useGameStore();

  const [activeTab, setActiveTab] = useState<CitadelTab>(initialTab);
  const [armorySubTab, setArmorySubTab] = useState<'FORGE' | 'RESEARCH' | 'CASTLE' | 'BLESSINGS'>('FORGE');
  const [selectedUnitId, setSelectedUnitId] = useState<string>(roster[0]?.id || '');
  const [slotFilter, setSlotFilter] = useState<'ALL' | EquipmentSlot>('ALL');
  const [marketMode, setMarketMode] = useState<'SELL' | 'BUY'>('SELL');
  const [lastTradeMsg, setLastTradeMsg] = useState<string | null>(null);

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

  const handleEvolution = (upgrade: () => boolean) => {
    soundFx.playClick();
    if (upgrade()) onClose();
  };

  const selectedUnit = roster.find((u) => u.id === selectedUnitId) || roster[0];

  // --- TAB 1: MINIONS DATA ---
  const tasksList: HarvestTask[] = [
    'AETHER',
    ...(castleBuilt && resourceBuildings.QUARRY.level >= 1 ? ['STONE' as HarvestTask] : []),
    ...(castleBuilt && resourceBuildings.WOOD.level >= 1 ? ['WOOD' as HarvestTask] : []),
    ...(castleBuilt && resourceBuildings.MINE.level >= 1 ? ['METAL' as HarvestTask] : []),
    ...(castleBuilt && resourceBuildings.PORT.level >= 1 ? ['FISH' as HarvestTask, 'WATER' as HarvestTask] : []),
    ...(castleBuilt ? ['HEAL' as HarvestTask, 'BUILD' as HarvestTask] : []),
  ];

  const summonableClasses: UnitClass[] = ['GOLEM', 'WAYFARER', 'CHRONO', 'MERMAN', 'NECROMANCER'];

  const getUnitSummonCost = (unitClass: UnitClass, countOfClass: number) => {
    let aetherShards = 0;
    let wood = 0;
    let stone = 0;
    switch (unitClass) {
      case 'GOLEM':
        aetherShards = 30 + countOfClass * 20;
        stone = 20 + countOfClass * 15;
        break;
      case 'WAYFARER':
        aetherShards = 40 + countOfClass * 25;
        wood = 30 + countOfClass * 20;
        break;
      case 'CHRONO':
        aetherShards = 70 + countOfClass * 40;
        stone = 45 + countOfClass * 25;
        wood = 35 + countOfClass * 20;
        break;
      case 'MERMAN':
        aetherShards = 35 + countOfClass * 20;
        wood = 25 + countOfClass * 15;
        break;
      case 'NECROMANCER':
        aetherShards = 60 + countOfClass * 30;
        stone = 30 + countOfClass * 20;
        break;
      case 'TREANT':
        aetherShards = 45;
        wood = 40;
        stone = 30;
        break;
    }
    return { aetherShards, wood, stone };
  };

  // --- TAB 2: MARKET DATA ---
  const marketResources = ['aetherShards', 'wood', 'stone', 'arcaneEssence', 'fish', 'water'] as const;

  const handleSell = (key: typeof marketResources[number], amount: number) => {
    const success = sellResource(key, amount);
    if (success) {
      const cfg = RESOURCE_PRICES[key];
      setLastTradeMsg(
        language === 'TL'
          ? `Naibenta ang ${amount} ${cfg.label} para sa +${amount * cfg.sell} Barya!`
          : `Sold ${amount} ${cfg.label} for +${amount * cfg.sell} Coins!`
      );
      setTimeout(() => setLastTradeMsg(null), 3000);
    }
  };

  const handleBuy = (key: typeof marketResources[number], amount: number) => {
    const success = buyResource(key, amount);
    if (success) {
      const cfg = RESOURCE_PRICES[key];
      setLastTradeMsg(
        language === 'TL'
          ? `Nabili ang ${amount} ${cfg.label} para sa -${amount * cfg.buy} Barya!`
          : `Purchased ${amount} ${cfg.label} for -${amount * cfg.buy} Coins!`
      );
      setTimeout(() => setLastTradeMsg(null), 3000);
    }
  };

  // --- TAB 3: FORGE DATA ---
  const filteredCraftItems = CRAFTABLE_ITEMS.filter(
    (item) => slotFilter === 'ALL' || item.slot === slotFilter
  );

  const canAffordCraft = (item: EquipmentItem) => {
    if (!item.costResources) return false;
    const { shards, wood, stone, essence } = item.costResources;
    if (shards && resources.aetherShards < shards) return false;
    if (wood && resources.wood < wood) return false;
    if (stone && resources.stone < stone) return false;
    if (essence && resources.arcaneEssence < essence) return false;
    return true;
  };

  const canAffordBuy = (item: EquipmentItem) => {
    if (!item.costCoins) return false;
    return resources.coins >= item.costCoins;
  };

  // --- TAB 4: RESEARCH TECH DATA ---
  const techItems: Array<{
    key: keyof UpgradesState;
    title: string;
    titleEn: string;
    desc: string;
    descEn: string;
    icon: React.ReactNode;
  }> = [
    {
      key: 'golemSpeedLevel',
      title: 'Bilis Tumakbo (Speed)',
      titleEn: 'Movement Speed',
      desc: 'Mas mabilis na tatakbo at kikilos ang lahat ng alagad (+20% Bilis).',
      descEn: 'All servants move and gather much faster (+20% Speed).',
      icon: <Cpu className="w-6 h-6 text-sky-400" />,
    },
    {
      key: 'golemCapacityLevel',
      title: 'Kapasidad ng Dala (Cargo)',
      titleEn: 'Cargo Capacity',
      desc: 'Mas maraming madadalang kristal at kagamitan kada hakbang (+1 Dala).',
      descEn: 'Servants haul more resources per trip (+1 Cargo).',
      icon: <Zap className="w-6 h-6 text-amber-400" />,
    },
    {
      key: 'nexusLevel',
      title: 'Puso ng Isla (Nexus)',
      titleEn: 'Citadel Nexus Core',
      desc: 'Palakasin ang buong kuta upang magbukas ng mga bagong halimaw at yaman.',
      descEn: 'Empowers the citadel to unlock higher tier beasts and gathering nodes.',
      icon: <Compass className="w-6 h-6 text-purple-400" />,
    },
    {
      key: 'refineryLevel',
      title: 'Sinaunang Kagubatan (Wood)',
      titleEn: 'Ancient Grove Refinery',
      desc: 'Kusang nagbibigay ng karagdagang kahoy sa kaban habang naglalaro.',
      descEn: 'Passively yields continuous timber for the realm treasury.',
      icon: <Trees className="w-6 h-6 text-emerald-400" />,
    },
    {
      key: 'quarryLevel',
      title: 'Minahan ng Bato (Quarry)',
      titleEn: 'Basalt Stone Quarry',
      desc: 'Kusang nagbibigay ng karagdagang bato mula sa mga sinaunang batong haligi.',
      descEn: 'Passively produces runic stone foundation materials.',
      icon: <Hammer className="w-6 h-6 text-orange-400" />,
    },
  ];

  // --- TAB 5: CASTLE DEFENSE DATA ---
  const getDefenseCost = (key: 'wallLevel' | 'turretLevel' | 'shieldLevel') => {
    const lvl = defense[key];
    const base = key === 'wallLevel' ? 70 : key === 'turretLevel' ? 90 : 110;
    return Math.floor(base * Math.pow(1.5, lvl - 1));
  };
  const wallCost = getDefenseCost('wallLevel');
  const turretCost = getDefenseCost('turretLevel');
  const shieldCost = getDefenseCost('shieldLevel');
  const canRepair = resources.coins >= 40 && defense.castleHp < defense.castleMaxHp;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-5xl h-[92vh] flex flex-col rounded-3xl bg-slate-950/95 border border-purple-500/40 shadow-2xl overflow-hidden glass-panel">
        {/* Header with Navigation Tabs */}
        <div className="border-b border-purple-500/20 bg-slate-900/80 p-4 pb-0">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-600 via-red-600 to-amber-600 flex items-center justify-center text-white shadow-lg shadow-purple-600/30 text-xl">
                🏰
              </div>
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  <span>{language === 'TL' ? 'Pangasiwaan ng Kuta (Citadel Command)' : 'Demon Citadel Command Sanctum'}</span>
                </h2>
                <p className="text-xs text-purple-300/80">
                  {language === 'TL'
                    ? 'Lahat ng Pamamahala: Alagad, Palengke, Pandayan, Kaalaman, at Kastilyo sa iisang lugar.'
                    : 'Unified Nexus: Minions, Market, Armory, Research & Fortifications.'}
                </p>
              </div>
            </div>

            {/* Quick Currency Bar & Close */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold">
                <Coins className="w-4 h-4 text-amber-400" />
                <span>{resources.coins.toLocaleString()}</span>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Unified Navigation Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pt-1">
            {[
              { id: 'MINIONS' as CitadelTab, label: language === 'TL' ? 'Mga Alagad' : 'Minions', icon: <Users className="w-4 h-4" /> },
              { id: 'MARKET' as CitadelTab, label: language === 'TL' ? 'Pamilihan' : 'Market', icon: <Store className="w-4 h-4" /> },
              {
                id: 'FORGE' as CitadelTab,
                label: language === 'TL' ? 'Pandayan, Tanggulan & Biyaya' : 'Armory, Fortifications & Tech',
                icon: <Hammer className="w-4 h-4 text-purple-400" />,
              },
            ].filter((tab) => castleBuilt || tab.id === 'MINIONS').map((tab) => {
              const isActive = activeTab === tab.id || (tab.id === 'FORGE' && (activeTab === 'FORGE' || activeTab === 'RESEARCH' || activeTab === 'CASTLE'));
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    soundFx.playClick();
                    setActiveTab(tab.id);
                  }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-t-2xl text-xs font-bold transition-all border-t border-x cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-slate-900 text-purple-300 border-purple-500/50 shadow-inner'
                      : 'bg-slate-950/50 text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Modal Main Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar bg-slate-900/90 text-slate-200">
          {/* ========================================================= */}
          {/* TAB 1: MINIONS (SUMMON & COMMAND)                          */}
          {/* ========================================================= */}
          {activeTab === 'MINIONS' && (
            <div className="space-y-6">
              {/* Day-one construction and resource-area progression */}
              <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 shadow-md">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-200">
                      <Hammer className="h-4 w-4" />
                      {language === 'TL' ? 'Pagbawi ng Kuta at mga Lugar ng Yaman' : 'Rebuild the Citadel & Resource Areas'}
                    </h3>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {castleBuilt
                        ? (language === 'TL' ? 'I-upgrade ang bawat lugar para magbukas ng mas mataas na materyales.' : 'Upgrade each area to unlock better crafting and summon materials.')
                        : (language === 'TL' ? 'Wala pang kastilyo sa Araw 1. Kailangan muna ng Ent at sapat na yaman.' : 'Day 1 begins in ruins. The Ent and enough gathered resources are required first.')}
                    </p>
                  </div>
                  <span className={`rounded-xl border px-2.5 py-1 text-[10px] font-bold ${castleBuilt ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300' : 'border-rose-500/40 bg-rose-950/40 text-rose-300'}`}>
                    {castleBuilt ? '🏰 BUILT' : '🏚️ RUINS'}
                  </span>
                </div>

                {!castleBuilt && (
                  <button
                    disabled={!roster.some((unit) => unit.unitClass === 'TREANT') || resources.aetherShards < 25 || resources.wood < 35 || resources.stone < 30 || resources.coins < 50}
                    onClick={() => handleEvolution(buildCastle)}
                    className="mb-3 w-full rounded-xl border border-emerald-500/40 bg-emerald-900/40 px-3 py-2 text-xs font-bold text-emerald-200 transition-colors hover:bg-emerald-800/50 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-500"
                  >
                    🌲 {roster.some((unit) => unit.unitClass === 'TREANT') ? 'Ent: Build Castle (💎25 🌲35 🪨30 🪙50)' : 'Summon the Ent first to unlock construction'}
                  </button>
                )}

                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {(Object.keys(RESOURCE_BUILDING_CONFIG) as ResourceBuildingId[]).map((buildingId) => {
                    const config = RESOURCE_BUILDING_CONFIG[buildingId];
                    const state = resourceBuildings?.[buildingId] ?? { level: 0, unlockedOutputs: [] };
                    const nextCost = config.costs[state.level];
                    const canAfford = !!nextCost && Object.entries(nextCost).every(([key, amount]) => (resources[key as keyof typeof resources] ?? 0) >= (amount || 0));
                    return (
                      <div key={buildingId} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs font-bold text-white">{config.icon} {language === 'TL' ? config.label : config.labelEn}</div>
                            <div className="mt-1 text-[10px] text-slate-400">Lv.{state.level}/2 · {state.unlockedOutputs.length ? state.unlockedOutputs.join(' · ') : 'Locked'}</div>
                          </div>
                          <button
                            disabled={!roster.some((unit) => unit.unitClass === 'TREANT') || !nextCost || !canAfford}
                            onClick={() => handleEvolution(() => upgradeResourceBuilding(buildingId))}
                            className="rounded-lg bg-sky-700/70 px-2 py-1 text-[10px] font-bold text-sky-100 transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                          >
                            {!roster.some((unit) => unit.unitClass === 'TREANT') ? 'Ent required' : nextCost ? `Build Lv.${state.level + 1}` : 'MAX'}
                          </button>
                        </div>
                        {nextCost && <div className="mt-2 text-[10px] font-mono text-slate-500">🌲{nextCost.wood || 0} · 🪨{nextCost.stone || 0} · 🪙{nextCost.coins || 0}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Ancient Support Entities: Slime & Treant Showcase & Evolutions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                {/* 1. Support Healing Slime */}
                {(() => {
                  const slime = roster.find((u) => u.unitClass === 'AQUA_SLIME');
                  const slimeLevel = (slime?.slimeEvolutionLevel ?? 1) as 1 | 2 | 3 | 4 | 5;
                  const canEvolveSlime = slimeLevel < 5;

                  return (
                    <div className="p-3.5 rounded-2xl bg-gradient-to-br from-cyan-950/40 via-blue-950/30 to-slate-950/70 border border-cyan-500/30 flex flex-col justify-between gap-2 shadow-md">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="text-2xl">💧</span>
                          <div>
                            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                              <span>Support Healing Slime</span>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300">
                                Lv.{slimeLevel}/5
                              </span>
                            </h4>
                            <p className="text-[11px] text-cyan-200/80">
                              {language === 'TL'
                                ? 'Hindi sinasaktan ng kalaban. Kusang nagpapagaling at nagpapanumbalik ng buhay.'
                                : 'Immune to damage. Passively heals allies, restores stamina, and resurrects.'}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-cyan-950/60 flex items-center justify-between text-xs">
                        <span className="text-[11px] text-slate-400 font-mono">
                          {slimeLevel >= 5 ? 'Max Level Reached 🌟' : `Next: Lv.${slimeLevel + 1}`}
                        </span>
                        {canEvolveSlime && (
                          <button
                            onClick={() => handleEvolution(upgradeSupportSlime)}
                            className="px-3 py-1 rounded-xl font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors cursor-pointer shadow-sm text-xs"
                          >
                            Evolve Slime
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* 2. Ancient Builder Treant */}
                {(() => {
                  const treant = roster.find((u) => u.unitClass === 'TREANT');
                  const treantLevel = (treant?.treantEvolutionLevel ?? 1) as 1 | 2 | 3 | 4 | 5;
                  const treantProfile = TREANT_EVOLUTION[treantLevel];
                  const nextProfile = treantLevel < 5 ? TREANT_EVOLUTION[(treantLevel + 1) as 1 | 2 | 3 | 4 | 5] : null;
                  const canEvolveTreant = treantLevel < 5 && treant !== undefined;
                  const cost = nextProfile?.upgradeCost;
                  const canAfford = cost
                    ? resources.aetherShards >= cost.aetherShards &&
                      resources.wood >= cost.wood &&
                      resources.stone >= cost.stone &&
                      resources.coins >= cost.coins
                    : false;

                  return (
                    <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-green-950/30 to-slate-950/70 border border-emerald-500/30 flex flex-col justify-between gap-2 shadow-md">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="text-2xl">🌲</span>
                          <div>
                            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                              <span>{treantProfile.labelEn}</span>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-300">
                                Lv.{treantLevel}/5
                              </span>
                            </h4>
                            <p className="text-[11px] text-emerald-200/80">
                              {treant
                                ? (language === 'TL'
                                    ? `Hindi inaatake. Kumpuni: +${treantProfile.repairAmount} HP/Shield. Pinapayaman ang bukal (${treantProfile.enrichmentMultiplier}x ani) at nagbibigay ng +${treantProfile.castleMajestyBonus}% bilis kapag matatag ang kuta.`
                                    : `Immune to damage. Repairs Castle/Shield (+${treantProfile.repairAmount} HP). Enriches nodes (${treantProfile.enrichmentMultiplier}x yield) & grants +${treantProfile.castleMajestyBonus}% speed during Citadel Majesty.`)
                                : (language === 'TL'
                                    ? 'Kusang ipapatawag ng Slime Support nang libre sa simula o kapag sapat ang yaman.'
                                    : 'Summoned free of charge by Support Slime as starting builder minion.')}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-emerald-950/60 flex items-center justify-between text-xs">
                        {cost && (
                          <div className="text-[10px] font-mono text-slate-300 flex items-center gap-1.5">
                            <span>💎{cost.aetherShards}</span>
                            <span>🌲{cost.wood}</span>
                            <span>🪙{cost.coins}</span>
                          </div>
                        )}
                        {!treant ? (
                          <span className="text-[10px] text-amber-300/90 font-mono italic">
                            Waiting for Slime Summon...
                          </span>
                        ) : treantLevel >= 5 ? (
                          <span className="text-[11px] text-slate-400 font-mono ml-auto">
                            Max Level Reached 🌟
                          </span>
                        ) : (
                          <button
                            disabled={!canAfford}
                            onClick={() => handleEvolution(upgradeTreant)}
                            className={`px-3 py-1 rounded-xl font-bold transition-all cursor-pointer text-xs ml-auto ${
                              canAfford
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            }`}
                          >
                            Evolve Ent (Lv.{treantLevel + 1})
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Ordinary minions remain sealed until the rebuilt castle is online. */}
              {castleBuilt && <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-red-300 mb-3 flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  <span>{language === 'TL' ? 'Magpatawag ng Bagong Alagad (Shop Minions)' : 'Summon Minions (Combat & Gathering)'}</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {summonableClasses.map((cls) => {
                    const cfg = UNIT_CLASSES[cls];
                    const countOfClass = roster.filter((u) => u.unitClass === cls).length;
                    const maxCap = cls === 'TREANT' ? 1 : 2;
                    const isMaxReached = countOfClass >= maxCap;
                    const cost = getUnitSummonCost(cls, countOfClass);
                    const canAfford =
                      resources.aetherShards >= cost.aetherShards &&
                      resources.wood >= cost.wood &&
                      resources.stone >= cost.stone;
                    const isLocked = upgrades.nexusLevel < cfg.requiredNexusLevel;

                    return (
                      <div
                        key={cls}
                        className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between gap-3 shadow-md"
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <span className="text-2xl">{cfg.iconEmoji}</span>
                              <div>
                                <h4 className="text-sm font-bold text-white">{cfg.nameEn || cfg.name}</h4>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  Count: {countOfClass}/{maxCap}
                                </span>
                              </div>
                            </div>
                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-rose-300">
                              ⚔️ {cfg.baseAttack} | 💚 {cfg.baseHp}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                            {language === 'TL' ? cfg.description : cfg.descriptionEn}
                          </p>
                        </div>

                        {/* Resources Required & Comparison */}
                        <div className="pt-2 border-t border-slate-800/80 space-y-2">
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                            {cost.aetherShards > 0 && (
                              <span
                                className={`px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                                  resources.aetherShards >= cost.aetherShards
                                    ? 'bg-sky-950/40 border-sky-500/30 text-sky-300'
                                    : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                                }`}
                                title={`Gems: Have ${resources.aetherShards} / Need ${cost.aetherShards}`}
                              >
                                💎 {resources.aetherShards}/{cost.aetherShards}
                              </span>
                            )}
                            {cost.wood > 0 && (
                              <span
                                className={`px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                                  resources.wood >= cost.wood
                                    ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                                    : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                                }`}
                                title={`Wood: Have ${resources.wood} / Need ${cost.wood}`}
                              >
                                🌲 {resources.wood}/{cost.wood}
                              </span>
                            )}
                            {cost.stone > 0 && (
                              <span
                                className={`px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                                  resources.stone >= cost.stone
                                    ? 'bg-amber-950/40 border-amber-500/30 text-amber-300'
                                    : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                                }`}
                                title={`Stone: Have ${resources.stone} / Need ${cost.stone}`}
                              >
                                🪨 {resources.stone}/{cost.stone}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            {/* If player lacks resources and is unlocked and not maxed, provide shortcut to buy via Shop */}
                            {!isLocked && !canAfford && !isMaxReached && (
                              <button
                                onClick={() => {
                                  soundFx.playClick();
                                  setActiveTab('MARKET');
                                  setMarketMode('BUY');
                                }}
                                className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-indigo-950/80 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-900/90 hover:text-white transition-all cursor-pointer flex items-center gap-1"
                                title={language === 'TL' ? 'Kulang sa materyales? Bumili sa Tindahan gamit ang barya' : 'Lacking resources? Buy needed goods at the Shop'}
                              >
                                <span>🛒 {language === 'TL' ? 'Bumili sa Tindahan' : 'Buy at Shop'}</span>
                              </button>
                            )}

                            <div className="ml-auto">
                              <button
                                disabled={!canAfford || isLocked || isMaxReached}
                                onClick={() => {
                                  handleSummon(cls);
                                }}
                                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                  isMaxReached
                                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                                    : isLocked
                                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                    : canAfford
                                    ? 'bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white shadow-md shadow-red-600/30 active:scale-95'
                                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                }`}
                              >
                                {isMaxReached
                                  ? (language === 'TL' ? 'Puno na (Max)' : 'Max Reached')
                                  : isLocked
                                  ? `Nexus Lv.${cfg.requiredNexusLevel}`
                                  : language === 'TL'
                                  ? 'Patawagin'
                                  : 'Summon'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>}

              {/* Roster Tasks Distribution */}
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-purple-300 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span>{language === 'TL' ? 'Pamamahala ng mga Gawain ng Alagad' : 'Minion Roster & Task Assignment'}</span>
                </h3>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                  {roster.map((unit) => {
                    const cfg = UNIT_CLASSES[unit.unitClass];
                    const isSlime = unit.unitClass === 'AQUA_SLIME';

                    return (
                      <div
                        key={unit.id}
                        className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{cfg.iconEmoji}</span>
                          <div>
                            <div className="text-xs font-bold text-white flex items-center gap-2">
                              <span>{unit.name}</span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-700/40">
                                {unit.unitClass}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
                              <span>💚 {unit.hp ?? cfg.baseHp}/{unit.maxHp ?? cfg.baseHp}</span>
                              <span>•</span>
                              <span>⚔️ {cfg.baseAttack} ATK</span>
                              {unit.equipment?.armor && <span>• 🛡️ {unit.equipment.armor.name}</span>}
                              {unit.equipment?.tool && <span>• 🗡️ {unit.equipment.tool.name}</span>}
                            </div>
                          </div>
                        </div>

                        {/* Task Select Buttons */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isSlime ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-emerald-400 bg-emerald-950/40 px-3 py-1 rounded-xl border border-emerald-500/30">
                                ✨ Lv.{unit.slimeEvolutionLevel ?? 1} Support Healer & Resurrector
                              </span>
                              {(unit.slimeEvolutionLevel ?? 1) < 5 && (
                                <button
                                  onClick={() => handleEvolution(upgradeSupportSlime)}
                                  className="px-3 py-1 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer shadow-md"
                                >
                                  Evolve (Lv.{(unit.slimeEvolutionLevel ?? 1) + 1})
                                </button>
                              )}
                            </div>
                          ) : unit.unitClass === 'TREANT' ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-emerald-300 bg-emerald-950/40 px-3 py-1 rounded-xl border border-emerald-500/30">
                                🌲 Lv.{unit.treantEvolutionLevel ?? 1} {TREANT_EVOLUTION[(unit.treantEvolutionLevel ?? 1) as 1|2|3|4|5]?.labelEn || 'Ent'} (Builder/Repair)
                              </span>
                              {(unit.treantEvolutionLevel ?? 1) < 5 && (
                                <button
                                  onClick={() => handleEvolution(upgradeTreant)}
                                  className="px-3 py-1 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer shadow-md"
                                >
                                  Evolve (Lv.{(unit.treantEvolutionLevel ?? 1) + 1})
                                </button>
                              )}
                            </div>
                          ) : (
                            tasksList.map((task) => {
                              const tCfg = TASK_CONFIG[task];
                              const isCurrent = unit.assignedTask === task;
                              return (
                                <button
                                  key={task}
                                  onClick={() => {
                                    soundFx.playClick();
                                    assignUnitTask(unit.id, task);
                                  }}
                                  className={`px-2.5 py-1 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer ${
                                    isCurrent
                                      ? 'bg-purple-600 text-white border border-purple-400 shadow-sm'
                                      : 'bg-slate-900 border border-slate-700/60 text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  {tCfg.icon} {tCfg.label.split(' ')[0]}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: MARKET (BUY & SELL RESOURCES)                      */}
          {/* ========================================================= */}
          {activeTab === 'MARKET' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30">
                <div className="flex items-center gap-2">
                  <Store className="w-5 h-5 text-amber-400" />
                  <div>
                    <h3 className="text-sm font-bold text-amber-200">
                      {language === 'TL' ? 'Pamilihan ng Kuta (Citadel Trade)' : 'Citadel Merchant Outpost'}
                    </h3>
                    <p className="text-xs text-amber-300/70">
                      {language === 'TL' ? 'Palitan ang labis na materyales para sa mga barya.' : 'Exchange surplus raw goods into cold gold coins.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex rounded-xl bg-slate-900 p-1 border border-slate-800">
                    <button
                      onClick={() => setMarketMode('SELL')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                        marketMode === 'SELL' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {language === 'TL' ? 'Magbenta (Sell)' : 'Sell Resources'}
                    </button>
                    <button
                      onClick={() => setMarketMode('BUY')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                        marketMode === 'BUY' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {language === 'TL' ? 'Bumili (Buy)' : 'Buy Resources'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Summoning Guide in Shop */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-red-950/40 via-purple-950/40 to-slate-900/60 border border-purple-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">💡</span>
                  <div>
                    <span className="font-bold text-amber-200">
                      {language === 'TL' ? 'Kailangan ng Yaman para Magpatawag ng Alagad?' : 'Need Resources to Summon Minions?'}
                    </span>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      {language === 'TL'
                        ? 'Bumili ng Kristal 💎 (25🪙), Kahoy 🌲 (15🪙), o Bato 🪨 (20🪙) dito gamit ang barya upang agad makatawag ng Golem, Wayvern, Arch-Demon, o Necromancer!'
                        : 'Buy Gems 💎 (25🪙), Wood 🌲 (15🪙), or Stone 🪨 (20🪙) here with coins to quickly afford Golems, Wayverns, Arch-Demons, or Necromancers!'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    soundFx.playClick();
                    setActiveTab('MINIONS');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs whitespace-nowrap cursor-pointer transition-colors shadow-sm"
                >
                  👹 {language === 'TL' ? 'Tingnan ang mga Alagad' : 'View Minions'}
                </button>
              </div>

              {lastTradeMsg && (
                <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs text-center font-bold animate-fade-in">
                  {lastTradeMsg}
                </div>
              )}

              {/* Resource Trading Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {marketResources.map((key) => {
                  const cfg = RESOURCE_PRICES[key];
                  const currentStock = resources[key];
                  const canSell10 = currentStock >= 10;
                  const canSellAll = currentStock > 0;
                  const canBuy10 = resources.coins >= cfg.buy * 10;

                  return (
                    <div
                      key={key}
                      className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between gap-3 shadow-md"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="text-2xl">{cfg.icon}</span>
                          <div>
                            <h4 className="text-sm font-bold text-white">{cfg.label}</h4>
                            <span className="text-xs font-mono text-slate-400">
                              Stock: <b className="text-slate-200">{currentStock.toLocaleString()}</b>
                            </span>
                          </div>
                        </div>

                        <div className="text-right text-xs font-mono font-bold">
                          <div className="text-amber-400">Sell: {cfg.sell}🪙</div>
                          <div className="text-indigo-400">Buy: {cfg.buy}🪙</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                        {marketMode === 'SELL' ? (
                          <>
                            <button
                              disabled={!canSell10}
                              onClick={() => handleSell(key, 10)}
                              className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                canSell10
                                  ? 'bg-amber-600 hover:bg-amber-500 text-white active:scale-95 shadow-sm'
                                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              }`}
                            >
                              Sell 10 (+{10 * cfg.sell}🪙)
                            </button>
                            <button
                              disabled={!canSellAll}
                              onClick={() => handleSell(key, currentStock)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                canSellAll
                                  ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30'
                                  : 'bg-slate-900 text-slate-600 cursor-not-allowed'
                              }`}
                            >
                              All
                            </button>
                          </>
                        ) : (
                          <button
                            disabled={!canBuy10}
                            onClick={() => handleBuy(key, 10)}
                            className={`w-full py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              canBuy10
                                ? 'bg-indigo-600 hover:bg-indigo-500 text-white active:scale-95 shadow-sm'
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            }`}
                          >
                            Buy 10 (-{10 * cfg.buy}🪙)
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 3: UNIFIED ARMORY, FORTIFICATIONS & GOD BLESSINGS     */}
          {/* ========================================================= */}
          {(activeTab === 'FORGE' || activeTab === 'RESEARCH' || activeTab === 'CASTLE') && (
            <div className="space-y-6">
              {/* Unified Sub-Navigation Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-2xl bg-slate-950/80 border border-purple-500/30 shadow-inner">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { id: 'FORGE' as const, label: language === 'TL' ? '⚔️ Pandayan (Forge)' : '⚔️ Forge & Gear', icon: <Hammer className="w-3.5 h-3.5" /> },
                    { id: 'RESEARCH' as const, label: language === 'TL' ? '⚡ Agham (Tech)' : '⚡ Citadel Research', icon: <Zap className="w-3.5 h-3.5" /> },
                    { id: 'CASTLE' as const, label: language === 'TL' ? '🛡️ Tanggulan (Castle)' : '🛡️ Fortifications', icon: <Shield className="w-3.5 h-3.5" /> },
                    { id: 'BLESSINGS' as const, label: language === 'TL' ? '👑 Biyaya ng Maykapal' : '👑 God Tier Blessings', icon: <Sparkles className="w-3.5 h-3.5 text-amber-400" /> },
                  ].map((sub) => {
                    const isSubActive = armorySubTab === sub.id;
                    return (
                      <button
                        key={sub.id}
                        onClick={() => {
                          soundFx.playClick();
                          setArmorySubTab(sub.id);
                        }}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isSubActive
                            ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                            : 'bg-slate-900/90 text-slate-400 hover:text-slate-200 border border-slate-800'
                        }`}
                      >
                        {sub.icon}
                        <span>{sub.label}</span>
                      </button>
                    );
                  })}
                </div>

                <span className="text-[11px] font-mono text-purple-300/80 px-2 hidden sm:inline">
                  {language === 'TL' ? 'Pinag-isang Kuta & Pandayan' : 'Unified Armory & Sanctum'}
                </span>
              </div>

              {/* SUB-PANEL 1: FORGE & GEAR */}
              {armorySubTab === 'FORGE' && (
                <div className="space-y-5 animate-fade-in">
                  {/* Filter Row */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(['ALL', 'TOOL', 'ARMOR', 'RELIC'] as const).map((slot) => (
                        <button
                          key={slot}
                          onClick={() => {
                            soundFx.playClick();
                            setSlotFilter(slot);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            slotFilter === slot
                              ? 'bg-purple-600 text-white border border-purple-400 shadow-sm'
                              : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-slate-700/60'
                          }`}
                        >
                          {slot === 'ALL'
                            ? 'Lahat'
                            : slot === 'TOOL'
                            ? '⚔️ Sandata (Weapons)'
                            : slot === 'ARMOR'
                            ? '🛡️ Armor'
                            : '✨ Relic'}
                        </button>
                      ))}
                    </div>

                    {/* Minion Loadout Selector */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Equip to:</span>
                      <select
                        value={selectedUnitId}
                        onChange={(e) => setSelectedUnitId(e.target.value)}
                        className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-bold cursor-pointer"
                      >
                        {roster.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.unitClass})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Craftable Gear Items */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {filteredCraftItems.map((item) => {
                      const canCraft = canAffordCraft(item);
                      const canBuy = canAffordBuy(item);
                      const isEquippedOnSelected =
                        selectedUnit?.equipment?.tool?.id === item.id ||
                        selectedUnit?.equipment?.armor?.id === item.id ||
                        selectedUnit?.equipment?.relic?.id === item.id;

                      return (
                        <div
                          key={item.id}
                          className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between gap-3 shadow-md"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5">
                                <span className="text-2xl">{item.icon}</span>
                                <div>
                                  <div className="text-sm font-bold text-white flex items-center gap-2">
                                    <span>{item.name}</span>
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                                      {item.slot}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-400 mt-0.5">{item.description}</p>
                                </div>
                              </div>
                            </div>

                            {/* Stats Badges */}
                            <div className="flex flex-wrap gap-1.5 my-2.5 text-[11px] font-mono">
                              {item.stats.bonusAttack && (
                                <span className="px-2 py-0.5 rounded bg-rose-950/60 border border-rose-500/30 text-rose-300 font-bold">
                                  +{item.stats.bonusAttack} ATK ⚔️
                                </span>
                              )}
                              {item.stats.bonusHp && (
                                <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 font-bold">
                                  +{item.stats.bonusHp} Max HP 💚
                                </span>
                              )}
                              {item.stats.bonusSpeed && (
                                <span className="px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 font-bold">
                                  +{item.stats.bonusSpeed}% Spd ⚡
                                </span>
                              )}
                              {item.stats.staminaDrainReduction && (
                                <span className="px-2 py-0.5 rounded bg-purple-950/60 border border-purple-500/30 text-purple-300 font-bold">
                                  -{item.stats.staminaDrainReduction}% Fatigue 💤
                                </span>
                              )}
                              {item.stats.bonusCargo && (
                                <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/30 text-amber-300 font-bold">
                                  +{item.stats.bonusCargo} Cargo 🎒
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons: Craft, Buy, Equip */}
                          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                            {/* Materials Needed */}
                            <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                              {item.costResources?.shards && <span>💎{item.costResources.shards}</span>}
                              {item.costResources?.wood && <span>🌲{item.costResources.wood}</span>}
                              {item.costResources?.stone && <span>🪨{item.costResources.stone}</span>}
                              {item.costResources?.essence && <span>🧪{item.costResources.essence}</span>}
                            </div>

                            <div className="flex items-center gap-1.5">
                              {/* Craft Button */}
                              {item.costResources && (
                                <button
                                  disabled={!canCraft}
                                  onClick={() => craftEquipment(item)}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                    canCraft
                                      ? 'bg-purple-600 hover:bg-purple-500 text-white active:scale-95 shadow-sm'
                                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                  }`}
                                >
                                  {language === 'TL' ? 'Pandayin' : 'Forge'}
                                </button>
                              )}

                              {/* Buy with Coins Button */}
                              {item.costCoins && (
                                <button
                                  disabled={!canBuy}
                                  onClick={() => purchaseEquipment(item)}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                    canBuy
                                      ? 'bg-amber-600 hover:bg-amber-500 text-white active:scale-95 shadow-sm'
                                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                  }`}
                                >
                                  {item.costCoins}🪙
                                </button>
                              )}

                              {/* Equip directly to selected minion if already in inventory */}
                              {inventory.some((inv) => inv.id === item.id) && selectedUnit && (
                                <button
                                  onClick={() => {
                                    if (isEquippedOnSelected) {
                                      unequipItem(selectedUnit.id, item.slot);
                                    } else {
                                      equipItem(selectedUnit.id, item);
                                    }
                                  }}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                    isEquippedOnSelected
                                      ? 'bg-rose-600/80 hover:bg-rose-500 text-white'
                                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                  }`}
                                >
                                  {isEquippedOnSelected ? 'Unequip' : 'Equip'}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SUB-PANEL 2: CITADEL TECH RESEARCH */}
              {armorySubTab === 'RESEARCH' && (
                <div className="space-y-4 animate-fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {techItems.map((tech) => {
                      const currentLevel = upgrades[tech.key];
                      const costShards = Math.floor(40 * Math.pow(1.6, currentLevel - 1));
                      const costWood = Math.floor(30 * Math.pow(1.5, currentLevel - 1));
                      const costStone = Math.floor(25 * Math.pow(1.5, currentLevel - 1));
                      const canAfford =
                        resources.aetherShards >= costShards &&
                        resources.wood >= costWood &&
                        resources.stone >= costStone;

                      return (
                        <div
                          key={tech.key}
                          className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between gap-3 shadow-md"
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-2.5 rounded-2xl bg-slate-900 border border-slate-800 shrink-0">
                              {tech.icon}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold text-white">
                                  {language === 'TL' ? tech.title : tech.titleEn}
                                </h4>
                                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-purple-950/80 border border-purple-600/40 text-purple-300">
                                  Lv.{currentLevel}
                                </span>
                              </div>
                              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                                {language === 'TL' ? tech.desc : tech.descEn}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                            <div className="text-[11px] font-mono font-bold flex items-center gap-2">
                              <span className="text-sky-300">💎{costShards}</span>
                              <span className="text-emerald-300">🌲{costWood}</span>
                              <span className="text-amber-300">🪨{costStone}</span>
                            </div>

                            <button
                              disabled={!canAfford}
                              onClick={() => upgradeTech(tech.key)}
                              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                canAfford
                                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md active:scale-95'
                                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              }`}
                            >
                              {language === 'TL' ? 'Pataasin' : 'Upgrade'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SUB-PANEL 3: FORTIFICATIONS & DEFENSE */}
              {armorySubTab === 'CASTLE' && (
                <div className="space-y-5 animate-fade-in">
                  {/* Castle HP & Shield Status Overview */}
                  <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3 shadow-md">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Castle HP Bar */}
                      <div>
                        <div className="flex items-center justify-between text-xs font-bold mb-1">
                          <span className="text-rose-400 flex items-center gap-1.5">
                            <Shield className="w-4 h-4" /> Castle Fortification HP
                          </span>
                          <span className="font-mono text-slate-200">
                            {defense.castleHp} / {defense.castleMaxHp}
                          </span>
                        </div>
                        <div className="w-full h-3 rounded-full bg-slate-900 overflow-hidden border border-slate-800">
                          <div
                            className="h-full bg-gradient-to-r from-rose-600 to-emerald-500 transition-all duration-300"
                            style={{ width: `${Math.round((defense.castleHp / defense.castleMaxHp) * 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* Shield Energy Bar */}
                      <div>
                        <div className="flex items-center justify-between text-xs font-bold mb-1">
                          <span className="text-cyan-400 flex items-center gap-1.5">
                            <Zap className="w-4 h-4" /> Kinetic Shield Barrier
                          </span>
                          <span className="font-mono text-slate-200">
                            {defense.shieldHp} / {defense.shieldMaxHp}
                          </span>
                        </div>
                        <div className="w-full h-3 rounded-full bg-slate-900 overflow-hidden border border-slate-800">
                          <div
                            className="h-full bg-gradient-to-r from-cyan-600 to-blue-400 transition-all duration-300"
                            style={{ width: `${Math.round((defense.shieldHp / defense.shieldMaxHp) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Manual Castle Repair Option */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                      <span className="text-xs text-slate-400">
                        {language === 'TL'
                          ? 'Kumpunihin ang Kastilyo (+150 HP sa halagang 40 Barya)'
                          : 'Emergency Repair (+150 Castle HP for 40 Coins)'}
                      </span>
                      <button
                        disabled={!canRepair}
                        onClick={() => repairCastle()}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          canRepair
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm active:scale-95'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {language === 'TL' ? 'Kumpunihin (40🪙)' : 'Repair (40🪙)'}
                      </button>
                    </div>
                  </div>

                  {/* Upgrades: Wall, Turret, Shield */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Wall Upgrade */}
                    <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between gap-3 shadow-md">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-white flex items-center gap-2">
                            🧱 Wall Reinforcement
                          </span>
                          <span className="text-xs font-mono font-bold text-purple-400">
                            Lv.{defense.wallLevel}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          Grants +200 Max HP and reduces damage taken from crusader hordes by 4% per level.
                        </p>
                      </div>
                      <button
                        disabled={resources.coins < wallCost}
                        onClick={() => upgradeDefense('wallLevel')}
                        className={`w-full py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          resources.coins >= wallCost
                            ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-md active:scale-95'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        Upgrade ({wallCost}🪙)
                      </button>
                    </div>

                    {/* Turret Upgrade */}
                    <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between gap-3 shadow-md">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-white flex items-center gap-2">
                            🎯 Citadel Sentry Turret
                          </span>
                          <span className="text-xs font-mono font-bold text-purple-400">
                            Lv.{defense.turretLevel}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          Fires high-velocity arcane plasma bolts targeting the nearest invaders automatically.
                        </p>
                      </div>
                      <button
                        disabled={resources.coins < turretCost}
                        onClick={() => upgradeDefense('turretLevel')}
                        className={`w-full py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          resources.coins >= turretCost
                            ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-md active:scale-95'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        Upgrade ({turretCost}🪙)
                      </button>
                    </div>

                    {/* Shield Upgrade */}
                    <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between gap-3 shadow-md">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-white flex items-center gap-2">
                            💠 Kinetic Barrier
                          </span>
                          <span className="text-xs font-mono font-bold text-purple-400">
                            Lv.{defense.shieldLevel}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          Expands barrier capacity by +100 and automatically recharges fully after surviving waves.
                        </p>
                      </div>
                      <button
                        disabled={resources.coins < shieldCost}
                        onClick={() => upgradeDefense('shieldLevel')}
                        className={`w-full py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          resources.coins >= shieldCost
                            ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-md active:scale-95'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        Upgrade ({shieldCost}🪙)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* SUB-PANEL 4: GOD TIER BLESSINGS (GATHERING, INVASION, MINION BUFFS) */}
              {armorySubTab === 'BLESSINGS' && (
                <div className="space-y-4 animate-fade-in">
                  <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-950/40 via-purple-950/40 to-slate-900/60 border border-amber-500/30 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-amber-200 flex items-center gap-2">
                        <span>👑 Biyaya ng Maykapal (God Tier Power-ups)</span>
                      </h4>
                      <p className="text-xs text-slate-300 mt-0.5">
                        {language === 'TL'
                          ? 'Mataas na kapangyarihan mula sa langit: Nagbibigay ng pansamantalang pambihirang lakas sa Pag-ani, Depensa, o mga Alagad!'
                          : 'Divine transcendent miracles: Bestows temporary God-tier advantages to Gathering, Invasions, or Minions!'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    {(['CELESTIAL_HARVEST', 'AEGIS_WRATH', 'TITAN_AWAKENING'] as GodBlessingId[]).map((blessingId) => {
                      const cfg = GOD_BLESSINGS[blessingId];
                      const activeTime = activeGodBlessings?.[blessingId] || 0;
                      const isActive = activeTime > 0;
                      const cost = cfg.costResources;
                      const canAfford =
                        resources.aetherShards >= cost.aetherShards &&
                        resources.arcaneEssence >= cost.arcaneEssence &&
                        resources.coins >= cost.coins;

                      return (
                        <div
                          key={blessingId}
                          className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 shadow-lg transition-all ${
                            isActive
                              ? 'bg-slate-900 border-amber-400/80 ring-1 ring-amber-400/40'
                              : 'bg-slate-950/70 border-slate-800'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-3xl">{cfg.icon}</span>
                              {isActive ? (
                                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                                  ⏳ {Math.ceil(activeTime)}s Left
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                                  {cfg.durationSeconds}s Duration
                                </span>
                              )}
                            </div>

                            <h4 className="text-sm font-bold text-white mt-2">
                              {language === 'TL' ? cfg.name : cfg.nameEn}
                            </h4>
                            <span className="text-[10px] font-bold text-amber-400 font-mono tracking-wide uppercase">
                              [{cfg.category}]
                            </span>

                            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                              {language === 'TL' ? cfg.description : cfg.descriptionEn}
                            </p>
                          </div>

                          <div className="pt-3 border-t border-slate-800/80 space-y-2">
                            {/* Cost display */}
                            <div className="flex items-center justify-between text-[11px] font-mono">
                              <span className="text-slate-400">Cost:</span>
                              <div className="flex items-center gap-1.5">
                                <span className={resources.aetherShards >= cost.aetherShards ? 'text-sky-300' : 'text-rose-400 font-bold'}>
                                  💎{cost.aetherShards}
                                </span>
                                <span className={resources.arcaneEssence >= cost.arcaneEssence ? 'text-purple-300' : 'text-rose-400 font-bold'}>
                                  🧪{cost.arcaneEssence}
                                </span>
                                <span className={resources.coins >= cost.coins ? 'text-amber-300' : 'text-rose-400 font-bold'}>
                                  🪙{cost.coins}
                                </span>
                              </div>
                            </div>

                            <button
                              disabled={!canAfford || isActive}
                              onClick={() => activateGodBlessing(blessingId)}
                              className={`w-full py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md ${
                                isActive
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 cursor-default'
                                  : canAfford
                                  ? 'bg-gradient-to-r from-amber-600 to-purple-600 hover:from-amber-500 hover:to-purple-500 text-white active:scale-95'
                                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              }`}
                            >
                              {isActive
                                ? (language === 'TL' ? 'Bukas ang Biyaya ✨' : 'Blessing Active ✨')
                                : (language === 'TL' ? 'Paganahin ang Biyaya' : 'Invoke Blessing')}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
