import { BEAST_PORTRAITS } from '../game/bestiaryPortraits';
import { FIGHTER_CLASSES, summonLock } from '../state/store/rosterSlice';
import { ECONOMY_CONFIG, type TradeableResource } from '../state/economy';
import type { BattleItemId } from '../types/state';
import { getUnitSummonCost } from '../state/economy';
import { canAfford as canAffordCost } from '../state/resources';
import React, { useEffect, useState } from 'react';
import { FortificationsPanel } from './FortificationsPanel';
import { ResearchPanel } from './ResearchPanel';
import { PowerOverviewPanel } from './PowerOverviewPanel';
import { SkillTreePanel } from './SkillTreeModal';
import { RunePanel } from './RunePanel';
import { buildUpgradeSuggestions } from './upgradeSuggestions';
import { useGameStore, RESOURCE_PRICES, RESOURCE_BUILDING_CONFIG } from '../state/useGameStore';
import { soundFx } from '../game/audio/soundFx';
import { useTranslation, unitName } from '../i18n/translations';
import { useTenantCounts } from '../state/tenantCounts';
import { BUILDING_IDS } from '../state/buildingLayout';
import { ESTABLISHMENT_CREWS, crewSourceLabels } from '../state/establishmentCrews';
import {
  UnitClass,
  UNIT_CLASSES,
  HarvestTask,
  TASK_CONFIG,
  TREANT_EVOLUTION,
} from '../types/game';
import { UpgradesState } from '../types/state';
import {
  X,
  Users,
  Store,
  Hammer,
  Zap, FlaskConical,
  Shield,
  Coins,
  Trees,
  Cpu,
  Compass,
  ChevronRight,
  LayoutDashboard,
  Sparkles,
  Gem,
} from 'lucide-react';

/** Sub-tabs of the Laboratory (one sidebar entry). */
const LAB_TABS: CitadelTab[] = ['RESEARCH', 'SKILLS', 'CASTLE', 'RUNES'];

export type CitadelTab = 'OVERVIEW' | 'MINIONS' | 'SKILLS' | 'RUNES' | 'MARKET' | 'FORGE' | 'RESEARCH' | 'CASTLE';

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
    upgradeTreant,
    castleBuilt,
    resourceBuildings,
    summonUnit,
    skillPoints,
  } = useGameStore();

  const isTL = language === 'TL';
  const { t: tr } = useTranslation();
  const tenantCounts = useTenantCounts((s) => s.counts);

  const [activeTab, setActiveTabRaw] = useState<CitadelTab>(initialTab);
  // The Laboratory tab reopens on whichever of its sub-tabs was used last
  const [lastLabTab, setLastLabTab] = useState<CitadelTab>(LAB_TABS.includes(initialTab) ? initialTab : 'RESEARCH');
  const setActiveTab = (tab: CitadelTab) => {
    if (LAB_TABS.includes(tab)) setLastLabTab(tab);
    setActiveTabRaw(tab);
  };
  const [marketMode, setMarketMode] = useState<'SELL' | 'BUY'>('BUY');
  const [lastTradeMsg, setLastTradeMsg] = useState<{ text: string; id: number } | null>(null);
  const [tradeAmounts, setTradeAmounts] = useState<Partial<Record<TradeableResource, number>>>({});

  useEffect(() => {
    if (isOpen) {
      soundFx.playPanel(true);
      setActiveTab(!castleBuilt && initialTab === 'CASTLE' ? 'MINIONS' : initialTab);
    }
  }, [isOpen, initialTab, castleBuilt]);

  if (!isOpen) return null;

  // Badge counts: what the stockpile covers per tab (skill points count toward Skills)
  const readyByTab: Partial<Record<CitadelTab, number>> = {};
  buildUpgradeSuggestions(useGameStore.getState(), true).forEach((s) => {
    readyByTab[s.tab] = (readyByTab[s.tab] ?? 0) + 1;
  });
  if (skillPoints > 0) readyByTab.SKILLS = skillPoints;

  const handleClose = () => {
    soundFx.playPanel(false);
    onClose();
  };

  const handleEvolution = (upgradeFn: () => boolean) => {
    soundFx.playClick();
    upgradeFn();
  };


  const tasksList: HarvestTask[] = [
    'AETHER',
    ...(castleBuilt && resourceBuildings?.QUARRY?.level >= 1 ? (['STONE'] as HarvestTask[]) : []),
    ...(castleBuilt && resourceBuildings?.WOOD?.level >= 1 ? (['WOOD'] as HarvestTask[]) : []),
    ...(castleBuilt && resourceBuildings?.MINE?.level >= 1 ? (['METAL'] as HarvestTask[]) : []),
    ...(castleBuilt && resourceBuildings?.PORT?.level >= 1 ? (['FISH', 'WATER'] as HarvestTask[]) : []),
    ...(castleBuilt ? (['HEAL', 'BUILD'] as HarvestTask[]) : []),
  ];

  const summonableClasses: UnitClass[] = FIGHTER_CLASSES;

  // Every tradeable material trades both ways
  const marketResources = Object.keys(RESOURCE_PRICES) as TradeableResource[];

  const handleTrade = (key: TradeableResource, amount: number, mode: 'BUY' | 'SELL') => {
    soundFx.playClick();
    const cfg = RESOURCE_PRICES[key];
    const label = isTL ? cfg.label : (cfg.labelEn || cfg.label);
    if (mode === 'BUY') {
      const ok = buyResource(key, amount);
      if (ok) {
        setLastTradeMsg({ text: `+${amount} ${label} (-${amount * cfg.buy} 🪙)`, id: Date.now() });
      }
    } else {
      const ok = sellResource(key, amount);
      if (ok) {
        setLastTradeMsg({ text: `-${amount} ${label} (+${amount * cfg.sell} 🪙)`, id: Date.now() });
      }
    }
    setTradeAmounts((prev) => ({ ...prev, [key]: 0 }));
    const stamp = Date.now();
    setTimeout(() => setLastTradeMsg((m) => (m && m.id <= stamp ? null : m)), 2500);
  };

  const costLabel = (cost: Partial<Record<string, number>>) =>
    Object.entries(cost)
      .filter(([, n]) => n)
      .map(
        ([key, n]) =>
          `${key === 'coins' ? '🪙' : RESOURCE_PRICES[key as keyof typeof RESOURCE_PRICES]?.icon ?? ''}${n}`
      )
      .join(' ');

  const battleItems: Array<{ id: BattleItemId; icon: string; name: string; desc: string }> = [
    {
      id: 'MINION_FRENZY',
      icon: '🔥',
      name: isTL ? 'Siklab ng Minion' : 'Minion Frenzy',
      desc: isTL ? 'Karagdagang pinsala para sa mga alagad.' : 'Additional damage boost for minions.',
    },
    {
      id: 'FORCE_FIELD',
      icon: '🛡️',
      name: isTL ? 'Kalasag ng Kuta' : 'Aegis Barrier',
      desc: isTL ? 'Kalasag para sa lahat ng pasilidad at kastilyo, pinupuno ang shield at inaayos ang mga gusali.' : 'Force field for all establishments and the castle; refills the shield and repairs structures.',
    },
    {
      id: 'MASS_REGEN',
      icon: '💖',
      name: isTL ? 'Malawakang Lunas' : 'Mass Restoration',
      desc: isTL ? 'Pinapabilis ang pagbabalik ng HP ng lahat ng pasilidad.' : 'Boosts HP regeneration of all establishments.',
    },
    {
      id: 'LASER_STORM',
      icon: '🔴',
      name: isTL ? 'Bagyo ng Laser' : 'Laser Storm',
      desc: isTL ? 'Kusang tinututukan ng laser ang hanggang 10 kalaban (20s).' : 'Sky lasers lock onto up to 10 invaders automatically (20s).',
    },
    {
      id: 'CHRONO_SURGE',
      icon: '⏱️',
      name: isTL ? 'Pampabilis ng Oras' : 'Chrono Surge',
      desc: isTL ? 'Pinapabilis ang cooldown ng skills.' : 'Boosts cooldown skills of all establishments and castle.',
    },
  ];

  const munitionItems: Array<{ id: 'armorPiercing' | 'incendiary' | 'cryoFrost' | 'teslaChain' | 'voidFlak'; icon: string; name: string; desc: string }> = [
    {
      id: 'armorPiercing',
      icon: '⚙️',
      name: isTL ? 'Balang Tumatagos sa Baluti' : 'Armor-Piercing Ammo',
      desc: isTL ? '+25% pinsala sa Mecha & Bosses bawat level.' : '+25% tower damage vs Mecha & Bosses per level.',
    },
    {
      id: 'incendiary',
      icon: '🌋',
      name: isTL ? 'Nagliliyab na Bala' : 'Incendiary Blast Shells',
      desc: isTL ? 'Sinusunog ang mga kaaway para sa 12 DPS bawat level.' : 'Ignites invaders with burning DoT per level.',
    },
    {
      id: 'cryoFrost',
      icon: '❄️',
      name: isTL ? 'Bala ng Yelo' : 'Cryo-Frost Shards',
      desc: isTL ? 'Pinapabagal ang bilis ng kaaway ng hanggang 40%.' : 'Slows invader movement speed and shatters armor.',
    },
    {
      id: 'teslaChain',
      icon: '⚡',
      name: isTL ? 'Kadena ng Kidlat' : 'Tesla Chain Overcharge',
      desc: isTL ? 'Tumatalon ang kuryente sa katabing mga kalaban.' : 'Arcs lightning to up to 4 nearby invaders.',
    },
    {
      id: 'voidFlak',
      icon: '🔮',
      name: isTL ? 'Kanyon ng Void' : 'Void Flak Cannonade',
      desc: isTL ? '+30% pinsala sa lumilipad at may Area Splash.' : '+30% Anti-Air damage and AoE splash explosions.',
    },
  ];

  return (
    <div className="game-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
      <div className="game-modal relative w-full max-w-5xl h-[88vh] flex flex-col rounded-3xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden">
        {lastTradeMsg && (
          <div
            key={lastTradeMsg.id}
            className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-xl bg-emerald-950/95 border border-emerald-500/50 text-emerald-300 text-xs font-mono font-bold shadow-lg shadow-emerald-900/40 animate-fade-in whitespace-nowrap"
          >
            ✓ {lastTradeMsg.text}
          </div>
        )}
        
        {/* TOP COMPACT HEADER */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/90 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-lg">
              🏰
            </div>
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                {isTL ? 'Sentro ng Pangasiwaan' : 'Citadel Command'}
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

        {/* MAIN BODY: 2-COLUMN VIEW */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          
          {/* LEFT SUB-NAVIGATION PANEL */}
          <div className="w-44 md:w-52 border-r border-slate-800/80 bg-slate-900/30 p-2.5 flex flex-col justify-between shrink-0">
            <div className="space-y-1">
              {[
                { id: 'OVERVIEW' as CitadelTab, label: tr('hubTabOverview'), icon: <LayoutDashboard className="w-4 h-4" /> },
                { id: 'LAB' as const, label: tr('hubTabLab'), icon: <FlaskConical className="w-4 h-4" /> },
                { id: 'MINIONS' as CitadelTab, label: isTL ? 'Mga Heneral' : 'Generals', icon: <Users className="w-4 h-4" /> },
                { id: 'MARKET' as CitadelTab, label: isTL ? 'Pamilihan' : 'Market', icon: <Store className="w-4 h-4" /> },
                { id: 'FORGE' as CitadelTab, label: isTL ? 'Arsenal' : 'Arsenal', icon: <Hammer className="w-4 h-4" /> },
              ].map((tab) => {
                // Laboratory = Research + Skills + Fortifications + Runes (sub-tabs inside, each with its auto switch)
                const isLab = tab.id === 'LAB';
                const isActive = isLab ? LAB_TABS.includes(activeTab) : activeTab === tab.id;
                const badge = isLab ? LAB_TABS.reduce((n, id) => n + (readyByTab[id] ?? 0), 0) : readyByTab[tab.id as CitadelTab];
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      soundFx.playTab();
                      setActiveTab(isLab ? lastLabTab : (tab.id as CitadelTab));
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
                    {badge ? (
                      <span className="min-w-[1.25rem] px-1 text-center text-[10px] font-mono font-bold bg-emerald-500 text-slate-950">
                        {badge}
                      </span>
                    ) : (
                      isActive && <ChevronRight className="w-3.5 h-3.5 text-purple-400" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Quick Helper Tip */}
            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-[10px] text-slate-400">
              💡 {isTL ? 'Malayang magpalit ng Barya at Yaman anumang oras.' : 'Trade resources and coins freely at any time.'}
            </div>
          </div>

          {/* RIGHT WORKSPACE CONTENT */}
          <div className="flex-1 overflow-y-auto p-4 md:p-5 custom-scrollbar bg-slate-950/40 space-y-4">

            {/* ================= TAB 1: MINIONS ================= */}
            {activeTab === 'MINIONS' && (
              <div className="space-y-4">
                {/* Treant & Slime Support Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Slime Card */}
                  {(() => {
                    const slime = roster.find((u) => u.unitClass === 'AQUA_SLIME');
                    const lvl = (slime?.slimeEvolutionLevel ?? 1) as 1 | 2 | 3 | 4 | 5;
                    return (
                      <div className="p-3 rounded-2xl bg-slate-900/60 border border-cyan-500/30 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {BEAST_PORTRAITS.AQUA_SLIME ? (
                            <img
                              src={BEAST_PORTRAITS.AQUA_SLIME}
                              alt={isTL ? UNIT_CLASSES.AQUA_SLIME.name : UNIT_CLASSES.AQUA_SLIME.nameEn}
                              className="h-10 w-10 rounded-xl border border-cyan-500/40 object-cover [image-rendering:pixelated] bg-slate-950/60"
                            />
                          ) : (
                            <span className="text-2xl">💧</span>
                          )}
                          <div>
                            <div className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span>{isTL ? UNIT_CLASSES.AQUA_SLIME.name : UNIT_CLASSES.AQUA_SLIME.nameEn}</span>
                              <span className="text-[10px] font-mono px-1.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30">Lv.{lvl}/5</span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {isTL ? 'Kusang nagpapagaling ng kakampi' : 'Auto-heals and revives allies'}
                            </div>
                          </div>
                        </div>
                        {lvl < 5 && (
                          <button
                            onClick={() => handleEvolution(upgradeSupportSlime)}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition cursor-pointer"
                          >
                            {tr('evolve')}
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {/* Treant Card */}
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
                        <div className="flex items-center gap-3">
                          {BEAST_PORTRAITS.TREANT ? (
                            <img
                              src={BEAST_PORTRAITS.TREANT}
                              alt={isTL ? UNIT_CLASSES.TREANT.name : UNIT_CLASSES.TREANT.nameEn}
                              className="h-10 w-10 rounded-xl border border-emerald-500/40 object-cover [image-rendering:pixelated] bg-slate-950/60"
                            />
                          ) : (
                            <span className="text-2xl">🌲</span>
                          )}
                          <div>
                            <div className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span>{isTL ? UNIT_CLASSES.TREANT.name : UNIT_CLASSES.TREANT.nameEn}</span>
                              <span className="text-[10px] font-mono px-1.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30">Lv.{lvl}/5</span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {cost ? `💎${cost.aetherShards} 🌲${cost.wood} 🪙${cost.coins}` : tr('maxLevelShort')}
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
                            {tr('evolve')}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Establishment Champions & Minions Directory */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      {isTL ? 'Mga Kampeon & Alagad ng mga Pasilidad' : 'Establishment Champions & Minions'}
                    </h3>
                    <span className="text-[10px] text-purple-400 font-mono">
                      {isTL ? 'Pinamamahalaan sa Pasilidad' : 'Managed via Establishments'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {(['SPIRE', ...BUILDING_IDS] as const).map((estabId) => ({ estabId, cls: ESTABLISHMENT_CREWS[estabId].general, icon: (RESOURCE_BUILDING_CONFIG as Record<string, { icon: string } | undefined>)[estabId]?.icon ?? '💎' })).map(({ estabId, cls, icon }) => {
                      const cfg = UNIT_CLASSES[cls];
                      const estab = (RESOURCE_BUILDING_CONFIG as Record<string, { label: string; labelEn: string } | undefined>)[estabId];
                      const estabLabel = estab ? (isTL ? estab.label : estab.labelEn) : estabId;
                      const activeUnits = roster.filter((u) => u.unitClass === cls && !u.parentBuildingId && !u.id.startsWith('tenant_'));
                      const isSummoned = activeUnits.length > 0;

                      return (
                        <div
                          key={cls}
                          className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between gap-2.5 shadow-sm hover:border-purple-500/40 transition"
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {BEAST_PORTRAITS[cls] ? (
                                  <img
                                    src={BEAST_PORTRAITS[cls]}
                                    alt=""
                                    className="h-9 w-9 rounded-lg border border-slate-700 object-cover [image-rendering:pixelated]"
                                  />
                                ) : (
                                  <span className="text-2xl">{cfg.iconEmoji}</span>
                                )}
                                <div>
                                  <h4 className="text-xs font-bold text-white">
                                    {isTL ? cfg.name : (cfg.nameEn || cfg.name)}
                                  </h4>
                                  <span className="text-[10px] text-purple-300 font-mono font-bold flex items-center gap-1">
                                    <span>{icon}</span>
                                    <span>{estabLabel}</span>
                                  </span>
                                </div>
                              </div>
                              <span className="text-[10px] font-mono text-right leading-tight shrink-0">
                                <span className={`block font-bold ${isSummoned ? 'text-emerald-400' : 'text-slate-500'}`}>
                                  👑 {isSummoned ? tr('generalActive') : tr('generalNotSummoned')}
                                </span>
                                <span className="block text-cyan-300" title={tr('tenantsHint')}>
                                  🛡️ {tr('tenantsLabel')} {tenantCounts[estabId]?.living ?? 0}/{tenantCounts[estabId]?.max ?? 5}
                                </span>
                              </span>
                            </div>

                            <p className="mt-2 text-[10px] text-slate-400 leading-snug">
                              {isTL ? cfg.subtitle : (cfg.subtitleEn || cfg.subtitle)}
                            </p>
                            <p className="mt-1 text-[10px] text-emerald-300/80 leading-snug">
                              {crewSourceLabels(estabId, isTL)}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              soundFx.playClick();
                              onClose();
                              useGameStore.getState().openEstablishmentModal(estabId);
                            }}
                            className="w-full py-1.5 rounded-xl font-bold text-xs bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/40 transition cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <span>🏛️</span>
                            <span>{isTL ? 'Pamahalaan sa Pasilidad' : 'Manage at Establishment'}</span>
                          </button>
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
                      <h3 className="text-xs font-bold text-white">
                        {isTL ? 'Pamilihan ng Kuta (Quick Trade)' : 'Citadel Market (Quick Trade)'}
                      </h3>
                      <p className="text-[10px] text-slate-400">
                        {isTL ? 'Bumili o magbenta ng kahit anong dami ng materyales gamit ang ginto.' : 'Buy or sell resources freely with gold coins.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                    <button
                      onClick={() => setMarketMode('BUY')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        marketMode === 'BUY' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {isTL ? 'Bumili' : 'Buy'}
                    </button>
                    <button
                      onClick={() => setMarketMode('SELL')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        marketMode === 'SELL' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {isTL ? 'Magbenta' : 'Sell'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {marketResources.map((key) => {
                    const cfg = RESOURCE_PRICES[key];
                    const stock = resources[key] ?? 0;
                    const isBuy = marketMode === 'BUY';
                    const unitPrice = isBuy ? cfg.buy : cfg.sell;
                    const maxAmount = isBuy ? Math.floor(resources.coins / Math.max(1, cfg.buy)) : Math.floor(stock);
                    const amount = Math.min(tradeAmounts[key] ?? 0, maxAmount);
                    const resourceName = isTL ? cfg.label : (cfg.labelEn || cfg.label);

                    return (
                      <div key={key} className="p-3.5 rounded-2xl bg-slate-900/50 border border-slate-800 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{cfg.icon}</span>
                          <div>
                            <h4 className="text-xs font-bold text-white">{resourceName}</h4>
                            <div className="text-[11px] font-mono text-slate-400">
                              {isTL ? 'Imbak' : 'Stock'}: <b className="text-slate-200">{stock.toLocaleString()}</b>
                            </div>
                            <div className="text-[10px] font-mono text-amber-400">
                              {isTL ? 'Presyo' : 'Price'}: {marketMode === 'BUY' ? `${cfg.buy}🪙 ${isTL ? 'Bili' : 'Buy'}` : `${cfg.sell}🪙 ${isTL ? 'Benta' : 'Sell'}`}
                            </div>
                          </div>
                        </div>

                        {/* Trade slider */}
                        <div className="flex flex-col items-end gap-1.5 w-40 shrink-0">
                          <div className="flex items-center gap-2 w-full">
                            <input
                              type="range"
                              min={0}
                              max={Math.max(0, maxAmount)}
                              step={1}
                              value={amount}
                              disabled={maxAmount <= 0}
                              onChange={(e) => setTradeAmounts((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                              className={`range range-xs flex-1 ${isBuy ? 'range-primary' : 'range-warning'}`}
                              aria-label={resourceName}
                            />
                            <span className="w-9 text-right text-[11px] font-mono font-bold text-slate-200">{amount}</span>
                          </div>
                          <button
                            disabled={amount <= 0}
                            onClick={() => handleTrade(key, amount, marketMode)}
                            className={`w-full px-2.5 py-1 rounded-xl text-white text-[11px] font-bold cursor-pointer transition disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed ${
                              isBuy ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-amber-600 hover:bg-amber-500'
                            }`}
                          >
                            {tr(isBuy ? 'marketBuyFor' : 'marketSellFor')
                              .replace('{amount}', String(amount))
                              .replace('{coins}', String(amount * unitPrice))}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ================= TAB 3: ARSENAL (battle items & munitions) ================= */}
            {activeTab === 'FORGE' && (
              <div className="space-y-4">
                {/* Battle items & munitions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded-2xl bg-orange-950/20 border border-orange-500/30 space-y-2">
                    <h4 className="text-xs font-bold text-orange-200">{isTL ? 'Mga Gamit sa Labanan' : 'Battle Items'}</h4>
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
                    <h4 className="text-xs font-bold text-slate-200">{isTL ? 'Bala ng mga Tower' : 'Tower Munitions'}</h4>
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

              </div>
            )}

            {/* ================= TAB 4: RESEARCH TECH ================= */}
            {activeTab === 'OVERVIEW' && <PowerOverviewPanel onNavigate={setActiveTab} />}

            {LAB_TABS.includes(activeTab) && (
              <div className="flex gap-1.5 border-b border-slate-800 pb-2">
                {LAB_TABS.map((id) => (
                  <button key={id}
                    onClick={() => { soundFx.playTab(); setActiveTab(id); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border ${
                      activeTab === id ? 'bg-purple-600/20 text-purple-300 border-purple-500/40' : 'text-slate-400 border-slate-800 hover:bg-slate-800/50'
                    }`}>
                    {id === 'RESEARCH' ? <Zap className="w-3.5 h-3.5" /> : id === 'SKILLS' ? <Sparkles className="w-3.5 h-3.5" /> : id === 'RUNES' ? <Gem className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                    <span>{id === 'RESEARCH' ? tr('labResearch') : id === 'SKILLS' ? tr('hubTabSkills') : id === 'RUNES' ? (isTL ? 'Mga Runa' : 'Runes') : tr('labFortifications')}</span>
                    {readyByTab[id] ? <span className="px-1 text-[10px] font-mono bg-emerald-500 text-slate-950">{readyByTab[id]}</span> : null}
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'SKILLS' && <SkillTreePanel />}

            {activeTab === 'RUNES' && <RunePanel />}

            {activeTab === 'RESEARCH' && <ResearchPanel />}

            {/* ================= TAB 5: CASTLE FORTIFICATIONS ================= */}
            {activeTab === 'CASTLE' && <FortificationsPanel />}
          </div>
        </div>
      </div>
    </div>
  );
};