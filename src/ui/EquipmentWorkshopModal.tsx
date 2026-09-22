import React, { useState } from 'react';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from '../game/audio/soundFx';
import {
  X,
  Hammer,
  Shield,
  Sparkles,
  Sword,
  Coins,
  ChevronRight,
} from 'lucide-react';
import { CRAFTABLE_ITEMS, EquipmentItem, EquipmentSlot } from '../types/game';

interface EquipmentWorkshopModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EquipmentWorkshopModal: React.FC<EquipmentWorkshopModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    resources,
    roster,
    inventory,
    craftEquipment,
    purchaseEquipment,
    equipItem,
    unequipItem,
  } = useGameStore();

  const [activeTab, setActiveTab] = useState<'CRAFT' | 'LOADOUT'>('CRAFT');
  const [selectedUnitId, setSelectedUnitId] = useState<string>(roster[0]?.id || '');
  const [slotFilter, setSlotFilter] = useState<'ALL' | EquipmentSlot>('ALL');

  if (!isOpen) return null;

  const selectedUnit = roster.find((u) => u.id === selectedUnitId) || roster[0];

  const handleCraft = (item: EquipmentItem) => {
    craftEquipment(item);
  };

  const handlePurchase = (item: EquipmentItem) => {
    purchaseEquipment(item);
  };

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
    return (resources.coins || 0) >= (item.costCoins || 9999);
  };

  const filteredCraftItems = slotFilter === 'ALL'
    ? CRAFTABLE_ITEMS
    : CRAFTABLE_ITEMS.filter((i) => i.slot === slotFilter);

  const filteredInventory = slotFilter === 'ALL'
    ? inventory
    : inventory.filter((i) => i.slot === slotFilter);

  const getSlotIcon = (slot: EquipmentSlot) => {
    switch (slot) {
      case 'TOOL':
        return <Sword className="w-4 h-4 text-rose-400" />;
      case 'ARMOR':
        return <Shield className="w-4 h-4 text-emerald-400" />;
      case 'RELIC':
        return <Sparkles className="w-4 h-4 text-purple-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md pointer-events-auto select-none animate-in fade-in duration-200">
      <div
        className="w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 shadow-md">
              <Hammer className="w-6 h-6" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                Gawaan ng Sandata at Armor ⚔️
              </div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span>Mga Gamit at Sandata</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {inventory.length} hawak mo
                </span>
              </h2>
            </div>
          </div>

          {/* Tab buttons */}
          <div className="flex items-center gap-2">
            <div className="flex p-1 rounded-2xl bg-slate-800/80 border border-slate-700">
              <button
                onClick={() => {
                  soundFx.playClick();
                  setActiveTab('CRAFT');
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'CRAFT'
                    ? 'bg-indigo-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Gawin & Bumili 🔨
              </button>
              <button
                onClick={() => {
                  soundFx.playClick();
                  setActiveTab('LOADOUT');
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'LOADOUT'
                    ? 'bg-indigo-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Isuot sa Katulong 🛡️
              </button>
            </div>

            <button
              onClick={() => {
                soundFx.playClick();
                onClose();
              }}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {/* Sub-Filter by Slot */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-800/80">
            <div className="flex items-center gap-2 flex-wrap">
              {(['ALL', 'TOOL', 'ARMOR', 'RELIC'] as const).map((slot) => (
                <button
                  key={slot}
                  onClick={() => {
                    soundFx.playClick();
                    setSlotFilter(slot);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    slotFilter === slot
                      ? 'bg-indigo-600 text-white border border-indigo-400 shadow-sm'
                      : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-slate-700'
                  }`}
                >
                  {slot === 'ALL'
                    ? 'Lahat ng Gamit'
                    : slot === 'TOOL'
                    ? '⚔️ Sandata & Espada'
                    : slot === 'ARMOR'
                    ? '🛡️ Armor & Kalasag'
                    : '✨ Agimat & Magic'}
                </button>
              ))}
            </div>

            {/* Current Gold Coins */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold">
              <Coins className="w-4 h-4 text-amber-400" />
              <span>{resources.coins.toLocaleString()} Barya</span>
            </div>
          </div>

          {activeTab === 'CRAFT' ? (
            /* Forge & Shop Tab */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredCraftItems.map((item) => {
                const canCraft = canAffordCraft(item);
                const canBuy = canAffordBuy(item);

                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60 hover:border-slate-600 transition-all flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2.5">
                          <span className="text-2xl">{item.icon}</span>
                          <div>
                            <div className="text-sm font-fantasy font-bold text-white flex items-center gap-2">
                              <span>{item.name}</span>
                              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                                {item.slot}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {item.description}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Stat Bonuses */}
                      <div className="flex flex-wrap gap-1.5 my-2.5 text-[11px] font-mono">
                        {item.stats.bonusAttack && (
                          <span className="px-2 py-0.5 rounded bg-rose-950/60 border border-rose-500/30 text-rose-300">
                            +{item.stats.bonusAttack} ATK ⚔️
                          </span>
                        )}
                        {item.stats.bonusHp && (
                          <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/30 text-emerald-300">
                            +{item.stats.bonusHp} Max HP 💚
                          </span>
                        )}
                        {item.stats.bonusGatherPercent && (
                          <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/30 text-amber-300">
                            +{item.stats.bonusGatherPercent}% Yield 💎
                          </span>
                        )}
                        {item.stats.bonusSpeed && (
                          <span className="px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30 text-cyan-300">
                            +{item.stats.bonusSpeed}% Speed ⚡
                          </span>
                        )}
                        {item.stats.bonusCargo && (
                          <span className="px-2 py-0.5 rounded bg-sky-950/60 border border-sky-500/30 text-sky-300">
                            +{item.stats.bonusCargo} Cargo 🎒
                          </span>
                        )}
                        {item.stats.staminaDrainReduction && (
                          <span className="px-2 py-0.5 rounded bg-purple-950/60 border border-purple-500/30 text-purple-300">
                            -{item.stats.staminaDrainReduction}% Fatigue 💤
                          </span>
                        )}
                      </div>

                      {/* Craft Cost */}
                      <div className="text-xs font-bold text-slate-300 mb-2 flex items-center flex-wrap gap-2">
                        <span className="text-slate-400">Kailangan:</span>
                        {item.costResources && (
                          <>
                            {item.costResources.shards && (
                              <span className={`px-2 py-0.5 rounded-lg border text-xs font-bold ${resources.aetherShards >= item.costResources.shards ? 'bg-sky-500/15 border-sky-500/30 text-sky-300' : 'bg-rose-500/15 border-rose-500/30 text-rose-300'}`}>
                                💎 {item.costResources.shards} Kristal
                              </span>
                            )}
                            {item.costResources.wood && (
                              <span className={`px-2 py-0.5 rounded-lg border text-xs font-bold ${resources.wood >= item.costResources.wood ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/15 border-rose-500/30 text-rose-300'}`}>
                                🌲 {item.costResources.wood} Kahoy
                              </span>
                            )}
                            {item.costResources.stone && (
                              <span className={`px-2 py-0.5 rounded-lg border text-xs font-bold ${resources.stone >= item.costResources.stone ? 'bg-amber-500/15 border-amber-500/30 text-amber-300' : 'bg-rose-500/15 border-rose-500/30 text-rose-300'}`}>
                                🪨 {item.costResources.stone} Bato
                              </span>
                            )}
                            {item.costResources.essence && (
                              <span className={`px-2 py-0.5 rounded-lg border text-xs font-bold ${resources.arcaneEssence >= item.costResources.essence ? 'bg-purple-500/15 border-purple-500/30 text-purple-300' : 'bg-rose-500/15 border-rose-500/30 text-rose-300'}`}>
                                🔮 {item.costResources.essence} Magic
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-700/40">
                      <button
                        onClick={() => {
                          soundFx.playClick();
                          handleCraft(item);
                        }}
                        disabled={!canCraft}
                        className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md ${
                          canCraft
                            ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white cursor-pointer active:scale-95 shadow-indigo-500/25'
                            : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                        }`}
                      >
                        <Hammer className="w-4 h-4" />
                        <span>Gawin Ito 🔨</span>
                      </button>

                      <button
                        onClick={() => {
                          soundFx.playCoin();
                          handlePurchase(item);
                        }}
                        disabled={!canBuy}
                        className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md ${
                          canBuy
                            ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 cursor-pointer active:scale-95 shadow-amber-500/25'
                            : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                        }`}
                      >
                        <Coins className="w-4 h-4 text-amber-950" />
                        <span>Bumili ({item.costCoins} 🪙)</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Unit Loadout Tab */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Unit Selector */}
              <div className="lg:col-span-4 flex flex-col gap-2">
                <div className="text-xs uppercase font-bold text-slate-300 tracking-wider mb-1">
                  Piliin ang Katulong:
                </div>
                {roster.map((unit) => (
                  <button
                    key={unit.id}
                    onClick={() => {
                      soundFx.playClick();
                      setSelectedUnitId(unit.id);
                    }}
                    className={`p-3 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      selectedUnit?.id === unit.id
                        ? 'bg-indigo-950/60 border-indigo-400 shadow-md'
                        : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-lg">
                        {unit.assignedTask === 'AETHER' ? '💎' : unit.assignedTask === 'WOOD' ? '🌲' : unit.assignedTask === 'STONE' ? '🪨' : '🔮'}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white">
                          {unit.name}
                        </div>
                        <div className="text-xs text-slate-400">
                          Buhay: {Math.round(unit.hp ?? 100)}/{unit.maxHp ?? 100} HP
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                ))}
              </div>

              {/* Right Column: 3 Equipment Slots & Armory Bag */}
              <div className="lg:col-span-8 flex flex-col gap-4">
                {selectedUnit && (
                  <div className="p-5 rounded-2xl bg-slate-800/40 border border-slate-700/80 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-base font-bold text-white">
                          Gamit ni {selectedUnit.name}
                        </div>
                        <div className="text-xs text-slate-400">
                          Piliin ang sandata, kalasag, at agimat para lalong lumakas ang katulong!
                        </div>
                      </div>
                    </div>

                    {/* 3 Equipment Slots */}
                    <div className="grid grid-cols-3 gap-3">
                      {/* Slot 1: Tool / Weapon */}
                      <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col items-center text-center gap-2">
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold">
                          {getSlotIcon('TOOL')}
                          <span>Sandata / Espada</span>
                        </div>
                        {selectedUnit.equipment?.tool ? (
                          <div className="w-full flex flex-col items-center">
                            <span className="text-3xl mb-1">{selectedUnit.equipment.tool.icon}</span>
                            <span className="text-xs font-bold text-white">{selectedUnit.equipment.tool.name}</span>
                            <button
                              onClick={() => unequipItem(selectedUnit.id, 'TOOL')}
                              className="mt-2 text-xs text-rose-400 hover:text-rose-300 font-bold"
                            >
                              [ Tanggalin ]
                            </button>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500 py-4 italic">Walang Suot</div>
                        )}
                      </div>

                      {/* Slot 2: Armor / Plating */}
                      <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col items-center text-center gap-2">
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold">
                          {getSlotIcon('ARMOR')}
                          <span>Armor / Kalasag</span>
                        </div>
                        {selectedUnit.equipment?.armor ? (
                          <div className="w-full flex flex-col items-center">
                            <span className="text-3xl mb-1">{selectedUnit.equipment.armor.icon}</span>
                            <span className="text-xs font-bold text-white">{selectedUnit.equipment.armor.name}</span>
                            <button
                              onClick={() => unequipItem(selectedUnit.id, 'ARMOR')}
                              className="mt-2 text-xs text-rose-400 hover:text-rose-300 font-bold"
                            >
                              [ Tanggalin ]
                            </button>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500 py-4 italic">Walang Suot</div>
                        )}
                      </div>

                      {/* Slot 3: Relic / Accessory */}
                      <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col items-center text-center gap-2">
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold">
                          {getSlotIcon('RELIC')}
                          <span>Agimat / Relikya</span>
                        </div>
                        {selectedUnit.equipment?.relic ? (
                          <div className="w-full flex flex-col items-center">
                            <span className="text-3xl mb-1">{selectedUnit.equipment.relic.icon}</span>
                            <span className="text-xs font-bold text-white">{selectedUnit.equipment.relic.name}</span>
                            <button
                              onClick={() => unequipItem(selectedUnit.id, 'RELIC')}
                              className="mt-2 text-xs text-rose-400 hover:text-rose-300 font-bold"
                            >
                              [ Tanggalin ]
                            </button>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500 py-4 italic">Walang Suot</div>
                        )}
                      </div>
                    </div>

                    {/* Inventory drawer to equip onto this unit */}
                    <div className="mt-2 pt-4 border-t border-slate-800">
                      <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center justify-between">
                        <span>Lalagyan ng mga Gamit (Armory)</span>
                        <span className="text-indigo-400 font-bold">{filteredInventory.length} gamit</span>
                      </div>

                      {filteredInventory.length === 0 ? (
                        <div className="text-xs text-slate-400 py-6 text-center italic bg-slate-900/40 rounded-2xl border border-slate-800/60">
                          Walang gamit sa imbakan. Gumawa o bumili sa tab na "Gawin & Bumili"!
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-52 overflow-y-auto pr-1">
                          {filteredInventory.map((item) => (
                            <div
                              key={item.id}
                              className="p-2.5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-2"
                            >
                              <div className="flex items-center gap-2 overflow-hidden">
                                <span className="text-xl">{item.icon}</span>
                                <div className="truncate">
                                  <div className="text-xs font-bold text-white truncate">
                                    {item.name}
                                  </div>
                                  <div className="text-[10px] font-bold text-indigo-400">
                                    {item.slot}
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  soundFx.playClick();
                                  equipItem(selectedUnit.id, item);
                                }}
                                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer transition-all shadow-sm"
                              >
                                Isuot 👍
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
