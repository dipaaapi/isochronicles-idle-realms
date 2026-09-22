import React, { useState } from 'react';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from '../game/audio/soundFx';
import { X, ArrowLeftRight, Gem, Trees, Hammer, Sparkles, Coins, Check } from 'lucide-react';

interface QuickTradePopoverProps {
  resourceKey: 'aetherShards' | 'wood' | 'stone' | 'arcaneEssence' | 'fish' | 'water';
  onClose: () => void;
}

const RESOURCE_META = {
  aetherShards: {
    label: 'Aether Shards',
    icon: Gem,
    color: 'text-sky-400',
    border: 'border-sky-500/40',
    bg: 'bg-sky-950/90',
    sellPrice: 3,
    buyPrice: 5,
  },
  wood: {
    label: 'Grove Wood',
    icon: Trees,
    color: 'text-emerald-400',
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-950/90',
    sellPrice: 2,
    buyPrice: 3,
  },
  stone: {
    label: 'Quarry Stone',
    icon: Hammer,
    color: 'text-amber-400',
    border: 'border-amber-500/40',
    bg: 'bg-amber-950/90',
    sellPrice: 3,
    buyPrice: 4,
  },
  arcaneEssence: {
    label: 'Arcane Essence',
    icon: Sparkles,
    color: 'text-purple-400',
    border: 'border-purple-500/40',
    bg: 'bg-purple-950/90',
    sellPrice: 7,
    buyPrice: 10,
  },
  fish: {
    label: 'Fish',
    icon: undefined, // Will handle dynamically
    color: 'text-cyan-400',
    border: 'border-cyan-500/40',
    bg: 'bg-cyan-950/90',
    sellPrice: 4,
    buyPrice: 6,
  },
  water: {
    label: 'Water',
    icon: undefined, // Will handle dynamically
    color: 'text-blue-400',
    border: 'border-blue-500/40',
    bg: 'bg-blue-950/90',
    sellPrice: 1,
    buyPrice: 2,
  },
};

export const QuickTradePopover: React.FC<QuickTradePopoverProps> = ({
  resourceKey,
  onClose,
}) => {
  const { resources, sellResource, buyResource, language } = useGameStore();
  const [tradeMode, setTradeMode] = useState<'SELL' | 'BUY'>('SELL');
  const [amount, setAmount] = useState<number>(10);

  const meta = RESOURCE_META[resourceKey];
  const Icon = meta.icon; // might be undefined, handle gracefully below

  const currentStock = resources[resourceKey] || 0;
  const currentCoins = resources.coins || 0;

  const unitPrice = tradeMode === 'SELL' ? meta.sellPrice : meta.buyPrice;
  const totalCoins = amount * unitPrice;

  // Max trade calculation
  const maxSell = currentStock;
  const maxBuy = Math.floor(currentCoins / meta.buyPrice);
  const maxPossible = tradeMode === 'SELL' ? maxSell : maxBuy;

  const canExecute = tradeMode === 'SELL' 
    ? amount > 0 && currentStock >= amount 
    : amount > 0 && currentCoins >= totalCoins;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canExecute) return;

    if (tradeMode === 'SELL') {
      sellResource(resourceKey, amount);
    } else {
      buyResource(resourceKey, amount);
    }

    soundFx.playCoin();
    // Auto-hide immediately upon submit as requested!
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm pointer-events-auto select-none"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-sm rounded-2xl ${meta.bg} border ${meta.border} shadow-2xl p-5 text-slate-100 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700/50 pb-3">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl border ${meta.border} bg-slate-900/50`}>
              {Icon ? <Icon className={`w-6 h-6 ${meta.color}`} /> : <span className={`text-xl ${meta.color}`}>{resourceKey === 'fish' ? '🐟' : '💧'}</span>}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                {language === 'TL' ? 'Mabilisang Palitan ⚡' : 'Quick Trade ⚡'}
              </div>
              <div className="text-base font-bold text-white">
                {language === 'TL' ? (
                  resourceKey === 'aetherShards' ? 'Kristal' :
                  resourceKey === 'wood' ? 'Kahoy' :
                  resourceKey === 'stone' ? 'Bato' :
                  resourceKey === 'arcaneEssence' ? 'Magic' :
                  resourceKey === 'fish' ? 'Isda' : 'Tubig'
                ) : meta.label}
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              soundFx.playClick();
              onClose();
            }}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sell ⇄ Buy Toggle */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-slate-900/90 border border-slate-800">
          <button
            type="button"
            onClick={() => {
              soundFx.playClick();
              setTradeMode('SELL');
              setAmount(Math.min(10, Math.max(1, maxSell)));
            }}
            className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              tradeMode === 'SELL'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>{language === 'TL' ? 'Ibenta (+Barya 🪙)' : 'Sell (+Coins 🪙)'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              soundFx.playClick();
              setTradeMode('BUY');
              setAmount(Math.min(10, Math.max(1, maxBuy)));
            }}
            className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              tradeMode === 'BUY'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>{language === 'TL' ? 'Bumili (-Barya 🪙)' : 'Buy (-Coins 🪙)'}</span>
          </button>
        </div>

        {/* Current Balances */}
        <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 text-xs font-mono">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase font-bold">{language === 'TL' ? 'Hawak mo:' : 'You hold:'}</span>
            <span className={`font-bold text-sm ${meta.color}`}>
              {currentStock.toLocaleString()}
            </span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-[10px] text-slate-400 uppercase font-bold">{language === 'TL' ? 'Iyong Barya:' : 'Your Coins:'}</span>
            <span className="font-bold text-sm text-amber-300">
              {currentCoins.toLocaleString()} 🪙
            </span>
          </div>
        </div>

        {/* Quantity Controls */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-slate-300 font-bold">
            <span>{language === 'TL' ? 'Dami ng Ipapalit:' : 'Trade Amount:'}</span>
            <span className="font-mono font-black text-white text-base bg-slate-800/80 px-2.5 py-0.5 rounded-lg border border-slate-700">{amount}</span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {[5, 10, 25, maxPossible].map((qty, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  soundFx.playClick();
                  setAmount(Math.max(1, Math.min(qty, maxPossible || 1)));
                }}
                className="py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 transition-all active:scale-95"
              >
                {idx === 3 ? (language === 'TL' ? 'LAHAT' : 'ALL') : `+${qty}`}
              </button>
            ))}
          </div>
        </div>

        {/* Trade Summary & Submit Button */}
        <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-300 font-bold">
            {tradeMode === 'SELL' 
              ? (language === 'TL' ? 'Makatatanggap ka ng:' : 'You will receive:') 
              : (language === 'TL' ? 'Kabuuang Bayad:' : 'Total Cost:')}
          </div>
          <div className="text-base font-black font-mono text-amber-300 flex items-center gap-1.5">
            <Coins className="w-4 h-4 text-amber-400" />
            <span>{totalCoins.toLocaleString()} {language === 'TL' ? 'Barya' : 'Coins'}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canExecute}
          className={`w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg transition-all ${
            canExecute
              ? tradeMode === 'SELL'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 cursor-pointer active:scale-98 shadow-amber-500/25'
                : 'bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white cursor-pointer active:scale-98 shadow-sky-500/25'
              : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
          }`}
        >
          <Check className="w-4 h-4 stroke-[3]" />
          <span>
            {tradeMode === 'SELL' 
              ? (language === 'TL' ? `Ibenta ang ${amount} para sa +${totalCoins} 🪙` : `Sell ${amount} for +${totalCoins} 🪙`) 
              : (language === 'TL' ? `Bumili ng ${amount} sa halagang ${totalCoins} 🪙` : `Buy ${amount} for ${totalCoins} 🪙`)}
          </span>
        </button>
      </div>
    </div>
  );
};
