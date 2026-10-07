import React, { useState } from 'react';
import { useGameStore, RESOURCE_PRICES } from '../state/useGameStore';
import { ECONOMY_CONFIG } from '../state/economy';
import { UpgradesState, Resources } from '../types/state';
import { ResearchPanel } from './ResearchPanel';
import { soundFx } from '../game/audio/soundFx';
import {
  X,
  Zap,
  Cpu,
  Compass,
  Trees,
  Hammer,
  Shield,
  Radio,
  Sparkles,
  Flame,
  Target,
  Store,
  Coins,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

interface UpgradesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ShopTab = 'TECH' | 'DEFENSE' | 'EVOLUTION' | 'MARKET';

interface TechUpgradeConfig {
  key: keyof UpgradesState;
  icon: React.ReactNode;
  titleEn: string;
  titleTl: string;
  descEn: string;
  descTl: string;
  statNameEn: string;
  statNameTl: string;
  calcStat: (lvl: number) => string;
}

const TECH_ITEMS: TechUpgradeConfig[] = [
  {
    key: 'golemSpeedLevel',
    icon: <Cpu className="w-5 h-5 text-sky-400" />,
    titleEn: 'Movement Speed (Speed)',
    titleTl: 'Bilis Tumakbo (Speed)',
    descEn: 'Minions run and march much faster across the entire floating realm.',
    descTl: 'Mas mabilis na tatakbo at maglalakad ang mga alagad sa buong isla.',
    statNameEn: 'Movement Speed',
    statNameTl: 'Bilis ng Paggalaw',
    calcStat: (lvl) => `+${(lvl - 1) * 20}%`,
  },
  {
    key: 'golemCapacityLevel',
    icon: <Zap className="w-5 h-5 text-amber-400" />,
    titleEn: 'Cargo Storage (Capacity)',
    titleTl: 'Mas Malaking Bag (Capacity)',
    descEn: 'Servants can haul more raw crystals and resources per trip.',
    descTl: 'Mas maraming madadalang kristal at materyales kada biyahe.',
    statNameEn: 'Carry Capacity',
    statNameTl: 'Dami ng Dala',
    calcStat: (lvl) => `${lvl} items/trip`,
  },
  {
    key: 'nexusLevel',
    icon: <Compass className="w-5 h-5 text-purple-400" />,
    titleEn: 'Island Heart (Nexus)',
    titleTl: 'Puso ng Isla (Nexus)',
    descEn: 'Strengthens the floating realm core to unlock new minion classes and higher tier buildings.',
    descTl: 'Palakasin ang buong lumilipad na isla upang magbukas ng mga bagong katulong at gusali.',
    statNameEn: 'Realm Tier',
    statNameTl: 'Antas ng Isla',
    calcStat: (lvl) => `Tier ${lvl}`,
  },
  {
    key: 'refineryLevel',
    icon: <Trees className="w-5 h-5 text-emerald-400" />,
    titleEn: 'Forest Canopy (Wood Yield)',
    titleTl: 'Puno ng Kagubatan (Trees)',
    descEn: 'Enhances wood harvesting efficiency and passive charcoal production.',
    descTl: 'Kusang nagbibigay ng karagdagang kahoy at uling habang naglalaro.',
    statNameEn: 'Wood Extraction',
    statNameTl: 'Ani ng Kahoy',
    calcStat: (lvl) => `+${(lvl - 1) * 25}%`,
  },
  {
    key: 'quarryLevel',
    icon: <Hammer className="w-5 h-5 text-orange-400" />,
    titleEn: 'Stone Extraction (Quarry)',
    titleTl: 'Minahan ng Bato (Quarry)',
    descEn: 'Increases stone harvest rate and extracts rare minerals from ancient monoliths.',
    descTl: 'Kusang nagbibigay ng karagdagang bato at mineral mula sa mga sinaunang haligi.',
    statNameEn: 'Stone Extraction',
    statNameTl: 'Ani ng Bato',
    calcStat: (lvl) => `+${(lvl - 1) * 25}%`,
  },
];

export const UpgradesModal: React.FC<UpgradesModalProps> = ({ isOpen, onClose }) => {
  const {
    resources,
    upgrades,
    defense,
    munitions,
    upgradeTech,
    upgradeDefense,
    upgradeSupportSlime,
    upgradeTreant,
    researchMunition,
    sellResource,
    buyResource,
    roster,
    language,
  } = useGameStore();

  const [activeTab, setActiveTab] = useState<ShopTab>('TECH');
  const [marketAmount, setMarketAmount] = useState<number>(10);
  const tl = language === 'TL';

  if (!isOpen) return null;

  // Slime evolution stats
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

  // Treant evolution stats
  const treant = roster.find((unit) => unit.unitClass === 'TREANT');
  const treantLevel = treant?.treantEvolutionLevel ?? 1;
  const treantCostWood = 40 + treantLevel * 30;
  const treantCostStone = 35 + treantLevel * 25;
  const treantCostCoins = 50 + treantLevel * 40;
  const canUpgradeTreant =
    treantLevel < 5 &&
    resources.wood >= treantCostWood &&
    resources.stone >= treantCostStone &&
    resources.coins >= treantCostCoins;

  // Defense upgrade costs
  const wallCostStone = Math.floor(40 * Math.pow(1.5, defense.wallLevel - 1));
  const wallCostWood = Math.floor(30 * Math.pow(1.4, defense.wallLevel - 1));
  const canUpgradeWall = resources.stone >= wallCostStone && resources.wood >= wallCostWood;

  const beaconCostShards = Math.floor(25 * Math.pow(1.6, defense.beaconLevel - 1));
  const beaconCostCoins = Math.floor(35 * Math.pow(1.5, defense.beaconLevel - 1));
  const canUpgradeBeacon = resources.aetherShards >= beaconCostShards && resources.coins >= beaconCostCoins;

  const shieldCostShards = Math.floor(35 * Math.pow(1.6, defense.shieldLevel - 1));
  const shieldCostCoins = Math.floor(50 * Math.pow(1.5, defense.shieldLevel - 1));
  const canUpgradeShield = resources.aetherShards >= shieldCostShards && resources.coins >= shieldCostCoins;

  const marketResources = ['aetherShards', 'wood', 'stone', 'arcaneEssence'] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[88vh] flex flex-col rounded-3xl border border-sky-500/40 bg-slate-950/95 shadow-2xl shadow-black/80 overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-500/30 to-violet-500/30 border border-sky-400/50 flex items-center justify-center text-sky-300 shadow-md">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-fantasy font-bold text-white tracking-wide flex items-center gap-2">
                {tl ? '⭐ Pamilihan at Pagpapalakas ng Kuta' : '⭐ Realm Emporium & Engineering'}
              </h2>
              <p className="text-xs text-slate-400">
                {tl ? 'Palakasin ang ekonomiya, depensa, at ang inyong mga alagad!' : 'Empower your economy, citadel fortifications, and beast rulers!'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Gold Coin Ticker */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 font-mono text-xs font-bold shadow-sm">
              <Coins className="w-4 h-4 text-amber-400" />
              <span>{resources.coins.toLocaleString()} 🪙</span>
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
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800/80 bg-slate-950/90 px-6 pt-2 gap-2 overflow-x-auto">
          {[
            { id: 'TECH', icon: <Zap className="w-4 h-4" />, labelEn: '5 Focus Research', labelTl: '5 Pokus Saliksik' },
            { id: 'DEFENSE', icon: <Shield className="w-4 h-4" />, labelEn: 'Fortifications', labelTl: 'Depensa ng Kuta' },
            { id: 'EVOLUTION', icon: <Sparkles className="w-4 h-4" />, labelEn: 'Evolutions', labelTl: 'Ebolusyon' },
            { id: 'MARKET', icon: <Store className="w-4 h-4" />, labelEn: 'Resource Market', labelTl: 'Pamilihan' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                soundFx.playClick();
                setActiveTab(tab.id as ShopTab);
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer border-b-2 ${
                activeTab === tab.id
                  ? 'border-sky-400 bg-slate-900/80 text-sky-300 shadow-sm'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
              }`}
            >
              {tab.icon}
              <span>{tl ? tab.labelTl : tab.labelEn}</span>
            </button>
          ))}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3.5 custom-scrollbar bg-slate-950/40">
          {/* TAB 1: REALM TECH */}
          {activeTab === 'TECH' && <ResearchPanel />}

          {/* TAB 2: CITADEL DEFENSES */}
          {activeTab === 'DEFENSE' && (
            <div className="space-y-3">
              {/* Stone Ramparts */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-amber-500/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                <div className="flex items-start gap-3.5">
                  <div className="p-3 rounded-2xl bg-slate-950 border border-amber-700/60 mt-0.5 text-amber-400 flex-shrink-0">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-slate-100">
                        {tl ? 'Kuta Ramparts (Wall Fortification)' : 'Citadel Ramparts (Wall Fortification)'}
                      </h4>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-500/30">
                        Lv. {defense.wallLevel}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm">
                      {tl ? 'Bumabawas ng 4% pinsala sa bawat antas ng kuta.' : 'Grants 4% incoming damage reduction per level to the entire citadel.'}
                    </p>
                    <div className="mt-2 text-[11px] font-mono text-slate-300 bg-slate-950/60 px-2.5 py-1 rounded-lg w-max border border-slate-800">
                      <span className="text-slate-400">{tl ? 'Bawas Pinsala:' : 'Damage Reduction:'} </span>
                      <span className="text-amber-300 font-bold">{Math.min(40, (defense.wallLevel - 1) * 4)}%</span>
                      <ArrowRight className="inline w-3 h-3 mx-1 text-slate-500" />
                      <span className="text-emerald-400 font-bold">{Math.min(40, defense.wallLevel * 4)}%</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    soundFx.playFanfare();
                    upgradeDefense('wallLevel');
                  }}
                  disabled={!canUpgradeWall}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex flex-col items-center justify-center transition-all shadow-md flex-shrink-0 ${
                    canUpgradeWall
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-amber-500/25 cursor-pointer active:scale-95'
                      : 'bg-slate-800/40 text-slate-500 border border-slate-700/30 cursor-not-allowed'
                  }`}
                >
                  <span>{tl ? 'Palakasin Pader' : 'Upgrade Walls'}</span>
                  <span className="text-[10px] opacity-90 mt-0.5 font-mono">
                    {wallCostStone}🪨 {wallCostWood}🌲
                  </span>
                </button>
              </div>

              {/* Energy Barrier */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-sky-500/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                <div className="flex items-start gap-3.5">
                  <div className="p-3 rounded-2xl bg-slate-950 border border-sky-700/60 mt-0.5 text-sky-400 flex-shrink-0">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-slate-100">
                        {tl ? 'Aegis Energy Shield' : 'Aegis Energy Shield'}
                      </h4>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-sky-950 text-sky-300 border border-sky-500/30">
                        Lv. {defense.shieldLevel}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm">
                      {tl ? 'Pinapataas ang maximum shield capacity at bilis ng shield recharge.' : 'Increases maximum shield HP and barrier recharge rate.'}
                    </p>
                    <div className="mt-2 text-[11px] font-mono text-slate-300 bg-slate-950/60 px-2.5 py-1 rounded-lg w-max border border-slate-800">
                      <span className="text-slate-400">Max Shield: </span>
                      <span className="text-sky-300 font-bold">{200 + (defense.shieldLevel - 1) * 75}</span>
                      <ArrowRight className="inline w-3 h-3 mx-1 text-slate-500" />
                      <span className="text-emerald-400 font-bold">{200 + defense.shieldLevel * 75}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    soundFx.playFanfare();
                    upgradeDefense('shieldLevel');
                  }}
                  disabled={!canUpgradeShield}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex flex-col items-center justify-center transition-all shadow-md flex-shrink-0 ${
                    canUpgradeShield
                      ? 'bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 text-white shadow-sky-500/25 cursor-pointer active:scale-95'
                      : 'bg-slate-800/40 text-slate-500 border border-slate-700/30 cursor-not-allowed'
                  }`}
                >
                  <span>{tl ? 'Palakasin Shield' : 'Upgrade Shield'}</span>
                  <span className="text-[10px] opacity-90 mt-0.5 font-mono">
                    {shieldCostShards}💎 {shieldCostCoins}🪙
                  </span>
                </button>
              </div>

              {/* Provoke Beacon */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-purple-500/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                <div className="flex items-start gap-3.5">
                  <div className="p-3 rounded-2xl bg-slate-950 border border-purple-700/60 mt-0.5 text-purple-400 flex-shrink-0">
                    <Radio className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-slate-100">
                        {tl ? 'Provoke Beacon' : 'Provoke Beacon'}
                      </h4>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-500/30">
                        Lv. {defense.beaconLevel}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm">
                      {tl ? 'Humihikayat at nagpapabagal sa mga papalapit na invaders papalayo sa mga gusali.' : 'Taunts invaders toward the citadel and slows down advancing raiders.'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    soundFx.playFanfare();
                    upgradeDefense('beaconLevel');
                  }}
                  disabled={!canUpgradeBeacon}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex flex-col items-center justify-center transition-all shadow-md flex-shrink-0 ${
                    canUpgradeBeacon
                      ? 'bg-gradient-to-r from-purple-500 to-violet-500 hover:from-purple-400 hover:to-violet-400 text-white shadow-purple-500/25 cursor-pointer active:scale-95'
                      : 'bg-slate-800/40 text-slate-500 border border-slate-700/30 cursor-not-allowed'
                  }`}
                >
                  <span>{tl ? 'Palakasin Beacon' : 'Upgrade Beacon'}</span>
                  <span className="text-[10px] opacity-90 mt-0.5 font-mono">
                    {beaconCostShards}💎 {beaconCostCoins}🪙
                  </span>
                </button>
              </div>

              {/* Munitions Tech */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                {([
                  {
                    id: 'armorPiercing' as const,
                    icon: '⚙️',
                    name: tl ? 'Armor-Piercing Rounds' : 'Armor-Piercing Ammo',
                    desc: tl ? '+25% pinsala sa Mecha at Bosses bawat level.' : '+25% extra damage vs. Mecha & Bosses per level.',
                  },
                  {
                    id: 'incendiary' as const,
                    icon: '🌋',
                    name: tl ? 'Incendiary Blast Shells' : 'Incendiary Blast Shells',
                    desc: tl ? 'Sinusunog ang mga kalaban sa bawat tama ng tore.' : 'Causes continuous burning fire damage on tower hits.',
                  },
                  {
                    id: 'cryoFrost' as const,
                    icon: '❄️',
                    name: tl ? 'Cryo-Frost Shards' : 'Cryo-Frost Shards',
                    desc: tl ? 'Pinapabagal ang bilis at pinapalutong ang armor.' : 'Slows invader movement speed and shatters armor.',
                  },
                  {
                    id: 'teslaChain' as const,
                    icon: '⚡',
                    name: tl ? 'Tesla Chain Overcharge' : 'Tesla Chain Overcharge',
                    desc: tl ? 'Tumatalon ang kuryente sa hanggang 4 kalapit na kalaban.' : 'Arcs lightning chain bolts to up to 4 nearby invaders.',
                  },
                  {
                    id: 'voidFlak' as const,
                    icon: '🔮',
                    name: tl ? 'Void Flak Cannonade' : 'Void Flak Cannonade',
                    desc: tl ? '+30% Anti-Air damage at may AoE explosive blast.' : '+30% Anti-Air damage and AoE explosive area blast.',
                  },
                ]).map((m) => {
                  const level = munitions?.[m.id] ?? 0;
                  const maxLevel = (ECONOMY_CONFIG.munitions as any).maxLevel ?? 5;
                  const cfgCost = (ECONOMY_CONFIG.munitions as any)[m.id]?.cost ?? {};
                  const cost = Object.fromEntries(
                    Object.entries(cfgCost).map(([k, n]) => [k, Number(n) * (level + 1)])
                  ) as Partial<Record<string, number>>;
                  const canAfford = level < maxLevel && Object.entries(cost).every(
                    ([k, v]) => ((resources[k as keyof typeof resources] ?? 0) as number) >= (v as number)
                  );

                  return (
                    <div key={m.id} className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                            <span className="text-base">{m.icon}</span>
                            <span>{m.name}</span>
                          </span>
                          <span className="text-[10px] font-mono font-bold text-purple-300 bg-purple-950/80 px-2 py-0.5 rounded-full border border-purple-800/40">
                            Lv. {level}/{maxLevel}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">{m.desc}</p>
                      </div>
                      <button
                        onClick={() => {
                          soundFx.playFanfare();
                          researchMunition(m.id);
                        }}
                        disabled={!canAfford || level >= maxLevel}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                          canAfford && level < maxLevel
                            ? 'bg-purple-600 hover:bg-purple-500 text-white cursor-pointer shadow-md'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/30'
                        }`}
                      >
                        {level >= maxLevel ? 'MAX' : `${tl ? 'Magsaliksik' : 'Research'} (${Object.entries(cost).map(([k, n]) => `${n}${k === 'coins' ? '🪙' : (RESOURCE_PRICES as any)[k]?.icon ?? ''}`).join(' ')})`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: EVOLUTIONS */}
          {activeTab === 'EVOLUTION' && (
            <div className="space-y-3">
              {/* Slime Lord Evolution */}
              {slime && (
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-cyan-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                  <div className="flex items-start gap-3.5">
                    <div className="p-3 rounded-2xl bg-slate-950 border border-cyan-500/40 text-2xl flex-shrink-0">
                      💚
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm text-slate-100">
                          {tl ? 'Slime Lord Evolution' : 'Slime Lord Evolution'}
                        </h4>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                          Level {slimeLevel}/5
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 max-w-sm">
                        {tl
                          ? 'Pinapabilis ang paggaling ng mga minion, binabawasan ang resurrection cooldown, at pinabababa ang revival cost.'
                          : 'Boosts healing aura, grants faster resurrection cooldown, and reduces minion revival compensation costs.'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      soundFx.playFanfare();
                      upgradeSupportSlime();
                    }}
                    disabled={slimeLevel >= 5 || !canUpgradeSlime}
                    className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex flex-col items-center justify-center transition-all shadow-md flex-shrink-0 ${
                      canUpgradeSlime && slimeLevel < 5
                        ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white shadow-emerald-500/25 cursor-pointer active:scale-95'
                        : 'bg-slate-800/40 text-slate-500 border border-slate-700/30 cursor-not-allowed'
                    }`}
                  >
                    <span>{slimeLevel >= 5 ? 'MAX LEVEL' : (tl ? 'Evolve Slime (+1)' : 'Evolve Slime (+1)')}</span>
                    {slimeLevel < 5 && (
                      <span className="text-[10px] opacity-90 mt-0.5 font-mono">
                        {slimeCostShards}💎 {slimeCostWood}🌲 {slimeCostStone}🪨 {slimeCostCoins}🪙
                      </span>
                    )}
                  </button>
                </div>
              )}

              {/* Ancient Treant Evolution */}
              {treant && (
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                  <div className="flex items-start gap-3.5">
                    <div className="p-3 rounded-2xl bg-slate-950 border border-emerald-500/40 text-2xl flex-shrink-0">
                      🌲
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm text-slate-100">
                          {tl ? 'Ancient Treant Forest Warden Evolution' : 'Ancient Treant Forest Warden Evolution'}
                        </h4>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                          Level {treantLevel}/5
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 max-w-sm">
                        {tl
                          ? 'Pinapabilis ang pag-aayos ng kastilyo at nagpapatubo ng mga enhanced resource nodes sa platform.'
                          : 'Accelerates citadel repairs and regrows high-yield enriched resource nodes across the realm.'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      soundFx.playFanfare();
                      upgradeTreant();
                    }}
                    disabled={treantLevel >= 5 || !canUpgradeTreant}
                    className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex flex-col items-center justify-center transition-all shadow-md flex-shrink-0 ${
                      canUpgradeTreant && treantLevel < 5
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-emerald-500/25 cursor-pointer active:scale-95'
                        : 'bg-slate-800/40 text-slate-500 border border-slate-700/30 cursor-not-allowed'
                    }`}
                  >
                    <span>{treantLevel >= 5 ? 'MAX LEVEL' : (tl ? 'Evolve Treant (+1)' : 'Evolve Treant (+1)')}</span>
                    {treantLevel < 5 && (
                      <span className="text-[10px] opacity-90 mt-0.5 font-mono">
                        {treantCostWood}🌲 {treantCostStone}🪨 {treantCostCoins}🪙
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: RESOURCE MARKET */}
          {activeTab === 'MARKET' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
                <span className="text-xs font-bold text-slate-300">
                  {tl ? 'Dami ng Bibilhin / Ibenebenta:' : 'Trade Quantity:'}
                </span>
                <div className="flex gap-1.5">
                  {[5, 10, 25, 50].map((qty) => (
                    <button
                      key={qty}
                      onClick={() => setMarketAmount(qty)}
                      className={`px-3 py-1 rounded-xl font-mono text-xs font-bold transition-all ${
                        marketAmount === qty
                          ? 'bg-sky-500 text-white shadow-md'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {qty}x
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {marketResources.map((key) => {
                  const cfg = RESOURCE_PRICES[key];
                  const userStock = resources[key] ?? 0;
                  const sellTotal = marketAmount * cfg.sell;
                  const buyTotal = marketAmount * cfg.buy;
                  const canSell = userStock >= marketAmount;
                  const canBuy = resources.coins >= buyTotal;

                  return (
                    <div key={key} className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between gap-3 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl drop-shadow">{cfg.icon}</span>
                          <div>
                            <h4 className="font-bold text-xs text-white">
                              {cfg.label}
                            </h4>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {tl ? 'Mayroon:' : 'Stock:'} {userStock.toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <div className="text-right text-[10px] font-mono text-slate-400">
                          <div>Buy: <span className="text-amber-300 font-bold">{cfg.buy}🪙</span></div>
                          <div>Sell: <span className="text-emerald-300 font-bold">{cfg.sell}🪙</span></div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
                        <button
                          onClick={() => {
                            soundFx.playClick();
                            sellResource(key, marketAmount);
                          }}
                          disabled={!canSell}
                          className={`py-1.5 rounded-xl font-mono text-xs font-bold transition-all ${
                            canSell
                              ? 'bg-emerald-600/80 hover:bg-emerald-500 text-white cursor-pointer shadow'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
                          }`}
                        >
                          {tl ? 'Ibenta' : 'Sell'} (+{sellTotal}🪙)
                        </button>

                        <button
                          onClick={() => {
                            soundFx.playClick();
                            buyResource(key, marketAmount);
                          }}
                          disabled={!canBuy}
                          className={`py-1.5 rounded-xl font-mono text-xs font-bold transition-all ${
                            canBuy
                              ? 'bg-sky-600/80 hover:bg-sky-500 text-white cursor-pointer shadow'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
                          }`}
                        >
                          {tl ? 'Bumili' : 'Buy'} (-{buyTotal}🪙)
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
