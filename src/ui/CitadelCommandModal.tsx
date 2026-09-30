import { BEAST_PORTRAITS } from '../game/bestiaryPortraits';
import { FIGHTER_CLASSES, craftingCost, summonLock } from '../state/store/rosterSlice';
import { ECONOMY_CONFIG, type TradeableResource } from '../state/economy';
import type { BattleItemId } from '../types/state';
import { getUnitSummonCost } from '../state/economy';
import { canAfford as canAffordCost } from '../state/resources';
import React, { useEffect, useState } from 'react';
import { FortificationsPanel } from './FortificationsPanel';
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
  Coins,
  Trees,
  Cpu,
  Compass,
  Sparkles,
  ArrowRightLeft,
  ChevronRight,
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
    autoBuySummon,
    munitions,
    useBattleItem,
    researchMunition,
    toggleAutoBuySummon,
    upgradeSupportSlime,
    sellResource,
    buyResource,
    craftEquipment,
    purchaseEquipment,
    equipItem,
    unequipItem,
    upgradeTech,
    activeGodBlessings,
    activateGodBlessing,
    upgradeTreant,
    castleBuilt,
    resourceBuildings,
    upgradeResourceBuilding,
  } = useGameStore();

  const [activeTab, setActiveTab] = useState<CitadelTab>(initialTab);
  const [armorySubTab, setArmorySubTab] = useState<'FORGE' | 'RESEARCH' | 'CASTLE' | 'BLESSINGS'>('FORGE');
  const [selectedUnitId, setSelectedUnitId] = useState<string>(roster[0]?.id || '');
  const [slotFilter, setSlotFilter] = useState<'ALL' | EquipmentSlot>('ALL');
  const [marketMode, setMarketMode] = useState<'SELL' | 'BUY'>('BUY');
  const [lastTradeMsg, setLastTradeMsg] = useState<string | null>(null);


  useEffect(() => {
    if (isOpen) {
      setActiveTab(!castleBuilt && initialTab === 'CASTLE' ? 'MINIONS' : initialTab);
    }
  }, [isOpen, initialTab, castleBuilt]);

  if (!isOpen) return null;

  const handleClose = () => {
    soundFx.playClick();
    onClose();
  };

  const handleEvolution = (upgradeFn: () => boolean) => {
    soundFx.playClick();
    upgradeFn();
  };

  const selectedUnit = roster.find((u) => u.id === selectedUnitId) || roster[0];

  const tasksList: HarvestTask[] = [
    'AETHER',
    ...(castleBuilt && resourceBuildings?.QUARRY?.level >= 1 ? (['STONE'] as HarvestTask[]) : []),
    ...(castleBuilt && resourceBuildings?.WOOD?.level >= 1 ? (['WOOD'] as HarvestTask[]) : []),
    ...(castleBuilt && resourceBuildings?.MINE?.level >= 1 ? (['METAL'] as HarvestTask[]) : []),
    ...(castleBuilt && resourceBuildings?.PORT?.level >= 1 ? (['FISH', 'WATER'] as HarvestTask[]) : []),
    ...(castleBuilt ? (['HEAL', 'BUILD'] as HarvestTask[]) : []),
  ];

  const summonableClasses: UnitClass[] = FIGHTER_CLASSES;

  // Every tradeable material, including the advanced drops, trades both ways
  const marketResources = Object.keys(RESOURCE_PRICES) as TradeableResource[];

  const handleTrade = (key: TradeableResource, amount: number, mode: 'BUY' | 'SELL') => {
    soundFx.playClick();
    const cfg = RESOURCE_PRICES[key];
    if (mode === 'BUY') {
      const ok = buyResource(key, amount);
      if (ok) {
        setLastTradeMsg(`+${amount} ${cfg.label} (-${amount * cfg.buy} 🪙)`);
      }
    } else {
      const ok = sellResource(key, amount);
      if (ok) {
        setLastTradeMsg(`-${amount} ${cfg.label} (+${amount * cfg.sell} 🪙)`);
      }
    }
    setTimeout(() => setLastTradeMsg(null), 2500);
  };

  const filteredCraftItems = CRAFTABLE_ITEMS.filter(
    (item) => slotFilter === 'ALL' || item.slot === slotFilter
  );

  const canAffordCraft = (item: EquipmentItem) => !!item.costResources && canAffordCost(resources, craftingCost(item));

  const costLabel = (cost: Partial<Record<string, number>>) =>
    Object.entries(cost).filter(([, n]) => n).map(([key, n]) => `${key === 'coins' ? '🪙' : RESOURCE_PRICES[key as keyof typeof RESOURCE_PRICES]?.icon ?? ''}${n}`).join(' ');

  const battleItems: Array<{ id: BattleItemId; icon: string; name: string; desc: string }> = [
    { id: 'LAVA_BOMB', icon: '🌋', name: 'Lava Bomb', desc: language === 'TL' ? 'Tinatamaan ang lahat ng kalaban ng 60 pinsala.' : 'Deals 60 damage to every invader on the field.' },
    { id: 'DEATH_CURSE', icon: '💀', name: 'Death Curse', desc: language === 'TL' ? 'Nanghihina ang lahat ng kalaban (8/s nang 8s).' : 'Every invader withers for 8 damage/s over 8s.' },
    { id: 'KINETIC_RESTORE', icon: '🔮', name: 'Kinetic Barrier', desc: language === 'TL' ? 'Ibinabalik ang 50% ng kalasag ng kuta.' : 'Instantly restores 50% of the citadel shield.' },
  ];

  const munitionItems: Array<{ id: 'armorPiercing' | 'incendiary'; icon: string; name: string; desc: string }> = [
    { id: 'armorPiercing', icon: '⚙️', name: 'Armor-Piercing Rounds', desc: language === 'TL' ? '+20% pinsala ng tower sa Mecha bawat antas.' : '+20% tower damage against Mecha per level.' },
    { id: 'incendiary', icon: '🌋', name: 'Incendiary Rounds', desc: language === 'TL' ? 'Sinusunog ng mga tower ang tinatamaan nila.' : 'Tower hits set invaders burning.' },
  ];

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
      title: 'Bilis Tumakbo',
      titleEn: 'Movement Speed',
      desc: '+20% Bilis sa pagkilos ng alagad.',
      descEn: '+20% movement speed for minions.',
      icon: <Cpu className="w-5 h-5 text-sky-400" />,
    },
    {
      key: 'golemCapacityLevel',
      title: 'Kapasidad ng Dala',
      titleEn: 'Cargo Capacity',
      desc: '+1 kargada kada hakbang.',
      descEn: '+1 cargo capacity per trip.',
      icon: <Zap className="w-5 h-5 text-amber-400" />,
    },
    {
      key: 'nexusLevel',
      title: 'Puso ng Isla',
      titleEn: 'Citadel Nexus',
      desc: 'Nagbubukas ng mas mataas na antas ng alagad.',
      descEn: 'Unlocks higher tier servitors.',
      icon: <Compass className="w-5 h-5 text-purple-400" />,
    },
    {
      key: 'refineryLevel',
      title: 'Gubat Refinery',
      titleEn: 'Ancient Grove',
      desc: 'Kusang nagbibigay ng karagdagang kahoy.',
      descEn: 'Passively yields continuous timber.',
      icon: <Trees className="w-5 h-5 text-emerald-400" />,
    },
    {
      key: 'quarryLevel',
      title: 'Minahan ng Bato',
      titleEn: 'Basalt Quarry',
      desc: 'Kusang nagbibigay ng karagdagang bato.',
      descEn: 'Passively produces stone blocks.',
      icon: <Hammer className="w-5 h-5 text-orange-400" />,
    },
  ];


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
      <div className="relative w-full max-w-5xl h-[88vh] flex flex-col rounded-3xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden">
        
        {/* TOP COMPACT HEADER */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/90 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-lg">
              🏰
            </div>
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                {language === 'TL' ? 'Sentro ng Pangasiwaan' : 'Citadel Command'}
              </h2>
              <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                <span>🏰 HP: {defense.castleHp}/{defense.castleMaxHp}</span>
                <span>•</span>
                <span>🛡️ {defense.shieldHp}/{defense.shieldMaxHp}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold">
              <Coins className="w-4 h-4 text-amber-400" />
              <span>{resources.coins.toLocaleString()}</span>
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MAIN BODY: 2-COLUMN VIEW (TABS SA KALIWA, CONTENT SA KANAN) */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          
          {/* LEFT SUB-NAVIGATION PANEL */}
          <div className="w-44 md:w-52 border-r border-slate-800/80 bg-slate-900/30 p-2.5 flex flex-col justify-between shrink-0">
            <div className="space-y-1">
              {[
                { id: 'MINIONS' as CitadelTab, label: language === 'TL' ? 'Mga Alagad' : 'Minions', icon: <Users className="w-4 h-4" /> },
                { id: 'MARKET' as CitadelTab, label: language === 'TL' ? 'Pamilihan' : 'Market', icon: <Store className="w-4 h-4" /> },
                { id: 'FORGE' as CitadelTab, label: language === 'TL' ? 'Pandayan & Sandata' : 'Armory & Gear', icon: <Hammer className="w-4 h-4" /> },
                { id: 'RESEARCH' as CitadelTab, label: language === 'TL' ? 'Agham (Research)' : 'Research', icon: <Zap className="w-4 h-4" /> },
                { id: 'CASTLE' as CitadelTab, label: language === 'TL' ? 'Tanggulan' : 'Fortifications', icon: <Shield className="w-4 h-4" /> },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      soundFx.playClick();
                      setActiveTab(tab.id);
                      if (tab.id === 'FORGE' || tab.id === 'RESEARCH' || tab.id === 'CASTLE') {
                        setArmorySubTab(tab.id as any);
                      }
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      isActive
                        ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {tab.icon}
                      <span>{tab.label}</span>
                    </div>
                    {isActive && <ChevronRight className="w-3.5 h-3.5 text-purple-400" />}
                  </button>
                );
              })}
            </div>

            {/* Quick Helper Tip */}
            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-[10px] text-slate-400">
              💡 {language === 'TL' ? 'Malayang magpalit ng Barya at Yaman anumang oras.' : 'Trade resources and coins freely at any time.'}
            </div>
          </div>

          {/* RIGHT WORKSPACE CONTENT */}
          <div className="flex-1 overflow-y-auto p-4 md:p-5 custom-scrollbar bg-slate-950/40 space-y-4">

            {/* ================= TAB 1: MINIONS ================= */}
            {activeTab === 'MINIONS' && (
              <div className="space-y-4">
                {/* Ent & Slime Support Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Slime Card */}
                  {(() => {
                    const slime = roster.find((u) => u.unitClass === 'AQUA_SLIME');
                    const lvl = (slime?.slimeEvolutionLevel ?? 1) as 1 | 2 | 3 | 4 | 5;
                    return (
                      <div className="p-3 rounded-2xl bg-slate-900/60 border border-cyan-500/30 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span className="text-2xl">💧</span>
                          <div>
                            <div className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span>Aqua Slime</span>
                              <span className="text-[10px] font-mono px-1.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30">Lv.{lvl}/5</span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">Auto-heals, revives allies</div>
                          </div>
                        </div>
                        {lvl < 5 && (
                          <button
                            onClick={() => handleEvolution(upgradeSupportSlime)}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition cursor-pointer"
                          >
                            Evolve
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {/* Ent Card */}
                  {(() => {
                    const treant = roster.find((u) => u.unitClass === 'TREANT');
                    const lvl = (treant?.treantEvolutionLevel ?? 1) as 1 | 2 | 3 | 4 | 5;
                    const nextProfile = lvl < 5 ? TREANT_EVOLUTION[(lvl + 1) as 1 | 2 | 3 | 4 | 5] : null;
                    const cost = nextProfile?.upgradeCost;
                    const canAfford = cost
                      ? resources.aetherShards >= cost.aetherShards &&
                        resources.wood >= cost.wood &&
                        resources.stone >= cost.stone &&
                        resources.coins >= cost.coins
                      : false;

                    return (
                      <div className="p-3 rounded-2xl bg-slate-900/60 border border-emerald-500/30 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span className="text-2xl">🌲</span>
                          <div>
                            <div className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span>Ancient Ent</span>
                              <span className="text-[10px] font-mono px-1.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30">Lv.{lvl}/5</span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {cost ? `💎${cost.aetherShards} 🌲${cost.wood} 🪙${cost.coins}` : 'Max Level'}
                            </div>
                          </div>
                        </div>
                        {treant && lvl < 5 && (
                          <button
                            disabled={!canAfford}
                            onClick={() => handleEvolution(upgradeTreant)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                              canAfford ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            }`}
                          >
                            Evolve
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Summonable Minions */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    {language === 'TL' ? 'Patawagin ang mga Alagad' : 'Summon Minions'}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {summonableClasses.map((cls) => {
                      const cfg = UNIT_CLASSES[cls];
                      const count = roster.filter((u) => u.unitClass === cls).length;
                      const maxCap = 2;
                      const cost = getUnitSummonCost(cls, count);
                      const canAfford = canAffordCost(resources, cost);
                      const isMax = count >= maxCap;
                      const lock = summonLock({ upgrades, resourceBuildings }, cls);
                      const autoBuy = !!autoBuySummon[cls];

                      return (
                        <div key={cls} className="p-3 rounded-2xl bg-slate-900/50 border border-slate-800 flex flex-col justify-between gap-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {BEAST_PORTRAITS[cls] ? <img src={BEAST_PORTRAITS[cls]} alt="" className="h-10 w-10 rounded-lg border border-slate-700 object-cover [image-rendering:pixelated]" /> : <span className="text-2xl">{cfg.iconEmoji}</span>}
                              <div>
                                <h4 className="text-xs font-bold text-white">{cfg.nameEn || cfg.name}</h4>
                                <span className="text-[10px] text-slate-500 font-mono">Dami: {count}/{maxCap}</span>
                              </div>
                            </div>
                            <span className="text-[10px] font-mono text-slate-300">⚔️{cfg.baseAttack} 💚{cfg.baseHp}</span>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[10px] font-mono">
                            <span className="text-slate-400">
                              {Object.entries(cost).map(([key, amount]) => `${key === 'coins' ? '🪙' : RESOURCE_PRICES[key as keyof typeof RESOURCE_PRICES]?.icon ?? ''}${amount}`).join(' ')}
                            </span>
                            {isMax ? (
                              <span className="px-3 py-1 rounded-xl font-bold bg-slate-800 text-slate-600">Max</span>
                            ) : lock ? (
                              <span className="px-2 py-1 rounded-xl font-bold bg-slate-800 text-amber-400/80" title={lock.building ? (language === 'TL' ? 'Itayo muna ang tahanan nito' : 'Build its home establishment first') : (language === 'TL' ? 'I-upgrade muna ang Kastilyo' : 'Upgrade the Castle first')}>
                                🔒 {lock.building
                                  ? (language === 'TL' ? RESOURCE_BUILDING_CONFIG[lock.building].label : RESOURCE_BUILDING_CONFIG[lock.building].labelEn)
                                  : <>Nexus Lv{lock.nexus}{lock.refinery > 1 ? ` · Ref Lv${lock.refinery}` : ''}</>}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => toggleAutoBuySummon(cls)}
                                title={language === 'TL'
                                  ? 'Kusang magpapatawag ang Slime. Kapag ON, bibilhin nito gamit ang coins ang kulang na materyales.'
                                  : 'The Slime summons automatically. When ON, it buys missing materials with coins.'}
                                className={`px-2.5 py-1 rounded-xl font-bold transition cursor-pointer border ${
                                  autoBuy
                                    ? 'border-amber-500/40 bg-amber-500/20 text-amber-300'
                                    : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700'
                                }`}
                              >
                                🪙 Auto-buy {autoBuy ? 'ON' : 'OFF'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Minion Task Assignment */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    {language === 'TL' ? 'Pamamahala ng mga Alagad' : 'Assign Minion Tasks'}
                  </h3>
                  <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                    {roster.map((unit) => {
                      const cfg = UNIT_CLASSES[unit.unitClass];
                      if (unit.unitClass === 'AQUA_SLIME' || unit.unitClass === 'TREANT') return null;

                      return (
                        <div key={unit.id} className="p-2.5 rounded-xl bg-slate-900/40 border border-slate-800/80 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {BEAST_PORTRAITS[unit.unitClass] ? <img src={BEAST_PORTRAITS[unit.unitClass]} alt="" className="h-7 w-7 rounded-md border border-slate-700 object-cover [image-rendering:pixelated]" /> : <span className="text-xl">{cfg.iconEmoji}</span>}
                            <span className="text-xs font-bold text-white truncate">{unit.name}</span>
                          </div>

                          <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar py-0.5">
                            {tasksList.map((task) => {
                              const isCurrent = unit.assignedTask === task;
                              const tCfg = TASK_CONFIG[task];
                              return (
                                <button
                                  key={task}
                                  onClick={() => {
                                    soundFx.playClick();
                                    assignUnitTask(unit.id, task);
                                  }}
                                  className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold whitespace-nowrap cursor-pointer transition ${
                                    isCurrent ? 'bg-purple-600 text-white' : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  {tCfg.icon} {tCfg.label.split(' ')[0]}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ================= TAB 2: MARKET (VICE-VERSA TRADING) ================= */}
            {activeTab === 'MARKET' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-2xl bg-amber-950/20 border border-amber-500/30">
                  <div className="flex items-center gap-2">
                    <Store className="w-5 h-5 text-amber-400" />
                    <div>
                      <h3 className="text-xs font-bold text-white">Pamilihan ng Kuta (Quick Trade)</h3>
                      <p className="text-[10px] text-slate-400">Bumili o magbenta ng kahit anong dami ng materyales.</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                    <button
                      onClick={() => setMarketMode('BUY')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        marketMode === 'BUY' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Bumili (Buy)
                    </button>
                    <button
                      onClick={() => setMarketMode('SELL')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        marketMode === 'SELL' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Magbenta (Sell)
                    </button>
                  </div>
                </div>

                {lastTradeMsg && (
                  <div className="p-2 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold text-center animate-fade-in">
                    {lastTradeMsg}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {marketResources.map((key) => {
                    const cfg = RESOURCE_PRICES[key];
                    const stock = resources[key] ?? 0;
                    const canAffordBuy1 = resources.coins >= cfg.buy;
                    const canAffordBuy10 = resources.coins >= cfg.buy * 10;
                    const canSell1 = stock >= 1;
                    const canSell10 = stock >= 10;

                    return (
                      <div key={key} className="p-3.5 rounded-2xl bg-slate-900/50 border border-slate-800 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{cfg.icon}</span>
                          <div>
                            <h4 className="text-xs font-bold text-white">{cfg.label}</h4>
                            <div className="text-[11px] font-mono text-slate-400">
                              Stock: <b className="text-slate-200">{stock.toLocaleString()}</b>
                            </div>
                            <div className="text-[10px] font-mono text-amber-400">
                              Presyo: {marketMode === 'BUY' ? `${cfg.buy}🪙 Bili` : `${cfg.sell}🪙 Benta`}
                            </div>
                          </div>
                        </div>

                        {/* Direct Trade Buttons */}
                        <div className="flex items-center gap-1.5">
                          {marketMode === 'BUY' ? (
                            <>
                              <button
                                disabled={!canAffordBuy1}
                                onClick={() => handleTrade(key, 1, 'BUY')}
                                className="px-2.5 py-1 rounded-xl bg-indigo-600/80 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-bold cursor-pointer transition"
                              >
                                +1
                              </button>
                              <button
                                disabled={!canAffordBuy10}
                                onClick={() => handleTrade(key, 10, 'BUY')}
                                className="px-2.5 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-bold cursor-pointer transition"
                              >
                                +10
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                disabled={!canSell1}
                                onClick={() => handleTrade(key, 1, 'SELL')}
                                className="px-2.5 py-1 rounded-xl bg-amber-600/80 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-bold cursor-pointer transition"
                              >
                                -1
                              </button>
                              <button
                                disabled={!canSell10}
                                onClick={() => handleTrade(key, 10, 'SELL')}
                                className="px-2.5 py-1 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-bold cursor-pointer transition"
                              >
                                -10
                              </button>
                              <button
                                disabled={stock <= 0}
                                onClick={() => handleTrade(key, stock, 'SELL')}
                                className="px-2 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:text-slate-600 text-amber-300 text-xs font-bold cursor-pointer border border-amber-500/30 transition"
                              >
                                Lahat
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ================= TAB 3: ARMORY & GEAR ================= */}
            {activeTab === 'FORGE' && (
              <div className="space-y-4">
                {/* Battle items & munitions made from the advanced drops */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded-2xl bg-orange-950/20 border border-orange-500/30 space-y-2">
                    <h4 className="text-xs font-bold text-orange-200">{language === 'TL' ? 'Mga Gamit sa Labanan' : 'Battle Items'}</h4>
                    {battleItems.map((b) => {
                      const cost = ECONOMY_CONFIG.battleItems[b.id].cost as Partial<Record<string, number>>;
                      const affordable = canAffordCost(resources, cost);
                      return (
                        <div key={b.id} className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[11px] font-bold text-white">{b.icon} {b.name}</div>
                            <div className="text-[10px] text-slate-400">{b.desc}</div>
                          </div>
                          <button
                            type="button"
                            disabled={!affordable}
                            onClick={() => { soundFx.playClick(); useBattleItem(b.id); }}
                            className={`shrink-0 px-2.5 py-1 rounded-xl text-[10px] font-bold font-mono transition cursor-pointer ${affordable ? 'bg-orange-600 hover:bg-orange-500 text-white' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                          >
                            {costLabel(cost)}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-700 space-y-2">
                    <h4 className="text-xs font-bold text-slate-200">{language === 'TL' ? 'Bala ng mga Tower' : 'Tower Munitions'}</h4>
                    {munitionItems.map((m) => {
                      const level = munitions[m.id];
                      const maxed = level >= ECONOMY_CONFIG.munitions.maxLevel;
                      const cost = Object.fromEntries(
                        Object.entries(ECONOMY_CONFIG.munitions[m.id].cost).map(([k, n]) => [k, Number(n) * (level + 1)])
                      );
                      const affordable = !maxed && canAffordCost(resources, cost);
                      return (
                        <div key={m.id} className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[11px] font-bold text-white">{m.icon} {m.name} <span className="font-mono text-purple-300">Lv.{level}</span></div>
                            <div className="text-[10px] text-slate-400">{m.desc}</div>
                          </div>
                          <button
                            type="button"
                            disabled={!affordable}
                            onClick={() => { soundFx.playClick(); researchMunition(m.id); }}
                            className={`shrink-0 px-2.5 py-1 rounded-xl text-[10px] font-bold font-mono transition cursor-pointer ${affordable ? 'bg-purple-600 hover:bg-purple-500 text-white' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                          >
                            {maxed ? 'MAX' : costLabel(cost)}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-1">
                    {(['ALL', 'TOOL', 'ARMOR', 'RELIC'] as const).map((slot) => (
                      <button
                        key={slot}
                        onClick={() => {
                          soundFx.playClick();
                          setSlotFilter(slot);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                          slotFilter === slot ? 'bg-purple-600 text-white' : 'text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>

                  <select
                    value={selectedUnitId}
                    onChange={(e) => setSelectedUnitId(e.target.value)}
                    aria-label="Piliin ang alagad na magsusuot ng gamit"
                    className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-bold cursor-pointer"
                  >
                    {roster.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.unitClass})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredCraftItems.map((item) => {
                    const canCraft = canAffordCraft(item);
                    const isEquipped =
                      selectedUnit?.equipment?.tool?.id === item.id ||
                      selectedUnit?.equipment?.armor?.id === item.id ||
                      selectedUnit?.equipment?.relic?.id === item.id;

                    return (
                      <div key={item.id} className="p-3 rounded-2xl bg-slate-900/50 border border-slate-800 flex flex-col justify-between gap-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{item.icon}</span>
                            <div>
                              <div className="text-xs font-bold text-white">{item.name}</div>
                              <div className="text-[10px] text-slate-400">{item.description}</div>
                            </div>
                          </div>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{item.slot}</span>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                          <div className="text-[10px] font-mono text-slate-400">
                            {costLabel(craftingCost(item))}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {item.costResources && (
                              <button
                                disabled={!canCraft}
                                onClick={() => craftEquipment(item)}
                                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                                  canCraft ? 'bg-purple-600 hover:bg-purple-500 text-white' : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                }`}
                              >
                                Pandayin
                              </button>
                            )}

                            {inventory.some((inv) => inv.id === item.id) && selectedUnit && (
                              <button
                                onClick={() => {
                                  if (isEquipped) unequipItem(selectedUnit.id, item.slot);
                                  else equipItem(selectedUnit.id, item);
                                }}
                                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                                  isEquipped ? 'bg-rose-600 hover:bg-rose-500 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                }`}
                              >
                                {isEquipped ? 'I-hubad' : 'I-suot'}
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

            {/* ================= TAB 4: RESEARCH TECH ================= */}
            {activeTab === 'RESEARCH' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                    <div key={tech.key} className="p-3.5 rounded-2xl bg-slate-900/50 border border-slate-800 flex flex-col justify-between gap-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">{tech.icon}</div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-xs font-bold text-white">{tech.title}</h4>
                            <span className="text-[10px] font-mono px-1 rounded bg-purple-950 text-purple-300">Lv.{currentLevel}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">{tech.desc}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[10px] font-mono">
                        <span className="text-slate-400">💎{costShards} 🌲{costWood} 🪨{costStone}</span>
                        <button
                          disabled={!canAfford}
                          onClick={() => upgradeTech(tech.key)}
                          className={`px-3 py-1 rounded-xl font-bold transition cursor-pointer ${
                            canAfford ? 'bg-purple-600 hover:bg-purple-500 text-white' : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          I-upgrade
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ================= TAB 5: CASTLE FORTIFICATIONS ================= */}
            {activeTab === 'CASTLE' && <FortificationsPanel />}
          </div>
        </div>
      </div>
    </div>
  );
};