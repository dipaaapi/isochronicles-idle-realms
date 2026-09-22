import React, { useState } from 'react';
import { useGameStore, RESOURCE_PRICES } from '../state/useGameStore';
import { soundFx } from '../game/audio/soundFx';
import {
  X,
  Coins,
  Store,
  ArrowDownUp,
  Clock,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface MerchantModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MerchantModal: React.FC<MerchantModalProps> = ({ isOpen, onClose }) => {
  const {
    resources,
    sellResource,
    buyResource,
    merchantRestockTimer,
  } = useGameStore();

  const [activeTab, setActiveTab] = useState<'SELL' | 'BUY'>('SELL');
  const [lastTradeMsg, setLastTradeMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    soundFx.playClick();
    onClose();
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const resourceKeys = [
    'aetherShards',
    'wood',
    'stone',
    'arcaneEssence',
  ] as const;

  const handleSell = (key: typeof resourceKeys[number], amount: number) => {
    const success = sellResource(key, amount);
    if (success) {
      const cfg = RESOURCE_PRICES[key];
      setLastTradeMsg(`Sold ${amount} ${cfg.label} for +${amount * cfg.sell} Coins!`);
      setTimeout(() => setLastTradeMsg(null), 3000);
    }
  };

  const handleBuy = (key: typeof resourceKeys[number], amount: number) => {
    const success = buyResource(key, amount);
    if (success) {
      const cfg = RESOURCE_PRICES[key];
      setLastTradeMsg(`Purchased ${amount} ${cfg.label} for -${amount * cfg.buy} Coins!`);
      setTimeout(() => setLastTradeMsg(null), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-3xl max-h-[85vh] flex flex-col bg-slate-900/95 border border-amber-500/40 rounded-2xl shadow-2xl shadow-amber-950/40 overflow-hidden glass-panel">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-amber-500/20 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 shadow-md shadow-amber-500/10">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-amber-100 tracking-wide flex items-center gap-2">
                🏪 Tindahan ng Isla (Palitan ng Gamit)
              </h2>
              <p className="text-xs text-slate-400">
                Ibenta ang iyong naipong gamit para kumita ng Gintong Barya, o bumili ng kailangan!
              </p>
            </div>
          </div>

          {/* Gold Coin Balance Badge */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-amber-500/20 border border-amber-400/40 shadow-sm">
              <Coins className="w-4 h-4 text-amber-300" />
              <div className="flex flex-col text-right">
                <span className="text-[9px] uppercase font-bold text-amber-200/80">
                  Iyong Barya
                </span>
                <span className="text-sm font-black font-mono text-amber-300">
                  {resources.coins.toLocaleString()} 🪙
                </span>
              </div>
            </div>

            <button
              onClick={handleClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/40 px-6">
          <div className="flex">
            <button
              onClick={() => {
                soundFx.playClick();
                setActiveTab('SELL');
              }}
              className={`flex items-center gap-2 py-3 px-5 text-xs font-bold tracking-wider border-b-2 transition-all cursor-pointer ${
                activeTab === 'SELL'
                  ? 'border-amber-400 text-amber-300 bg-amber-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <ArrowDownUp className="w-4 h-4" />
              💰 Ibenta (Kumita ng Barya)
            </button>
            <button
              onClick={() => {
                soundFx.playClick();
                setActiveTab('BUY');
              }}
              className={`flex items-center gap-2 py-3 px-5 text-xs font-bold tracking-wider border-b-2 transition-all cursor-pointer ${
                activeTab === 'BUY'
                  ? 'border-sky-400 text-sky-300 bg-sky-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Store className="w-4 h-4" />
              🛒 Bumili ng Materyales
            </button>
          </div>

          {/* Caravan Restock Timer */}
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800">
            <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin-slow" />
            <span>Bagong paninda:</span>
            <span className="text-amber-300 font-bold">{formatTimer(merchantRestockTimer)}</span>
          </div>
        </div>

        {/* Trade Feedback Alert */}
        {lastTradeMsg && (
          <div className="mx-6 mt-3 p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{lastTradeMsg}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {activeTab === 'SELL' ? (
            <div className="space-y-3">
              <div className="text-xs text-slate-300 bg-amber-950/30 border border-amber-500/20 p-2.5 rounded-xl flex items-center justify-between">
                <span>👉 Pindutin para ibenta ang naipon at makatanggap agad ng Gintong Barya:</span>
                <span className="text-[11px] text-amber-400 font-bold">Ligtas & Mabilis na Palitan</span>
              </div>

              {resourceKeys.map((key) => {
                const cfg = RESOURCE_PRICES[key];
                const currentStock = resources[key];
                return (
                  <div
                    key={key}
                    className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-amber-400/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm"
                  >
                    {/* Resource Info */}
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-2xl flex-shrink-0 shadow-inner">
                        {cfg.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-100 text-sm">{cfg.label}</span>
                          <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/30">
                            +{cfg.sell} Barya bawat isa
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Mayroon ka ngayong: <span className="font-mono font-bold text-slate-100 text-sm">{currentStock.toLocaleString()}</span>
                        </p>
                      </div>
                    </div>

                    {/* Sell Action Buttons */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => {
                          soundFx.playCoin();
                          handleSell(key, 10);
                        }}
                        disabled={currentStock < 10}
                        className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm ${
                          currentStock >= 10
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-200 hover:bg-amber-500/25 hover:border-amber-300'
                            : 'bg-slate-900/40 border-slate-800 text-slate-600 cursor-not-allowed'
                        }`}
                      >
                        Ibenta ang 10 (+{10 * cfg.sell}🪙)
                      </button>

                      <button
                        onClick={() => {
                          soundFx.playCoin();
                          handleSell(key, 50);
                        }}
                        disabled={currentStock < 50}
                        className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm ${
                          currentStock >= 50
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-200 hover:bg-amber-500/25 hover:border-amber-300'
                            : 'bg-slate-900/40 border-slate-800 text-slate-600 cursor-not-allowed'
                        }`}
                      >
                        Ibenta ang 50 (+{50 * cfg.sell}🪙)
                      </button>

                      <button
                        onClick={() => {
                          soundFx.playCoin();
                          handleSell(key, currentStock);
                        }}
                        disabled={currentStock <= 0}
                        className={`px-4 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-md ${
                          currentStock > 0
                            ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-amber-500/25 hover:from-amber-400 hover:to-orange-400'
                            : 'bg-slate-800/40 border-slate-800 text-slate-600 cursor-not-allowed'
                        }`}
                      >
                        Ibenta Lahat (+{currentStock * cfg.sell}🪙)
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-slate-300 bg-sky-950/30 border border-sky-500/20 p-2.5 rounded-xl flex items-center justify-between">
                <span>👉 Kailangan mo ba ng karagdagang gamit? Bumili gamit ang iyong barya:</span>
                <span className="text-[11px] text-sky-400 font-bold">🛒 Mabilis na Pagbili</span>
              </div>

              {resourceKeys.map((key) => {
                const cfg = RESOURCE_PRICES[key];
                const cost10 = 10 * cfg.buy;
                const cost50 = 50 * cfg.buy;
                const canAfford10 = resources.coins >= cost10;
                const canAfford50 = resources.coins >= cost50;

                return (
                  <div
                    key={key}
                    className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-sky-400/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm"
                  >
                    {/* Resource Info */}
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-2xl flex-shrink-0 shadow-inner">
                        {cfg.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-100 text-sm">{cfg.label}</span>
                          <span className="text-xs font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/30">
                            {cfg.buy} Barya bawat isa
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Mayroon ka: <span className="font-mono font-bold text-slate-100 text-sm">{resources[key].toLocaleString()}</span>
                        </p>
                      </div>
                    </div>

                    {/* Buy Action Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          soundFx.playCoin();
                          handleBuy(key, 10);
                        }}
                        disabled={!canAfford10}
                        className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm ${
                          canAfford10
                            ? 'bg-sky-500/15 border-sky-500/40 text-sky-200 hover:bg-sky-500/25 hover:border-sky-300'
                            : 'bg-slate-900/40 border-slate-800 text-slate-600 cursor-not-allowed'
                        }`}
                      >
                        Bumili ng 10 ({cost10}🪙)
                      </button>

                      <button
                        onClick={() => {
                          soundFx.playCoin();
                          handleBuy(key, 50);
                        }}
                        disabled={!canAfford50}
                        className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm ${
                          canAfford50
                            ? 'bg-sky-500/15 border-sky-500/40 text-sky-200 hover:bg-sky-500/25 hover:border-sky-300'
                            : 'bg-slate-900/40 border-slate-800 text-slate-600 cursor-not-allowed'
                        }`}
                      >
                        Bumili ng 50 ({cost50}🪙)
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5 text-amber-300">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Gamitin ang mga baryang naipon para palakasin ang iyong Kastilyo at Sandata!
          </span>
          <button
            onClick={handleClose}
            className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all cursor-pointer shadow-md"
          >
            Salamat! 👍
          </button>
        </div>
      </div>
    </div>
  );
};
