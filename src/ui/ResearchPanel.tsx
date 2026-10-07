import React, { useState } from 'react';
import { useGameStore } from '../state/useGameStore';
import { RESEARCH_CATEGORIES, ResearchCategoryConfig, ResearchNodeConfig } from '../data/researchConfig';
import { RESOURCE_PRICES, techUpgradeCost } from '../state/economy';
import { canAfford } from '../state/resources';
import { soundFx } from '../game/audio/soundFx';

interface ResearchPanelProps {
  onClose?: () => void;
}

export const ResearchPanel: React.FC<ResearchPanelProps> = ({ onClose }) => {
  const isTagalog = useGameStore((s) => s.language === 'TL');
  const resources = useGameStore((s) => s.resources);
  const upgrades = useGameStore((s) => s.upgrades);
  const autoSettings = useGameStore((s) => s.autoSettings);
  const toggleAutoSetting = useGameStore((s) => s.toggleAutoSetting);
  const upgradeTech = useGameStore((s) => s.upgradeTech);

  const [activeTab, setActiveTab] = useState<'SLIME' | 'ENT' | 'CASTLE' | 'ESTABLISHMENTS' | 'TENANTS'>('SLIME');

  const currentCategory = RESEARCH_CATEGORIES.find((c) => c.id === activeTab) || RESEARCH_CATEGORIES[0];

  const resLabel = (key: string): string => {
    if (key === 'coins') return isTagalog ? 'Barya' : 'Coins';
    const cfg = RESOURCE_PRICES[key as keyof typeof RESOURCE_PRICES];
    return cfg ? (isTagalog ? cfg.label : cfg.labelEn ?? cfg.label) : key;
  };

  const handleUpgrade = (node: ResearchNodeConfig) => {
    const currentLevel = (upgrades[node.key] as number) ?? 1;
    if (currentLevel >= node.maxLevel) return;

    const cost = techUpgradeCost(node.key, currentLevel);
    if (!canAfford(resources, cost)) {
      soundFx.playError();
      return;
    }

    const success = upgradeTech(node.key);
    if (success) {
      soundFx.playFanfare();
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/95 text-slate-100 p-4 md:p-6 overflow-hidden rounded-2xl border border-indigo-500/30 shadow-2xl backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🔬</span>
          <div>
            <h2 className="text-xl md:text-2xl font-black bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-400 bg-clip-text text-transparent">
              {isTagalog ? 'Sentro ng Pagsasaliksik & Ebolusyon' : 'Research & Evolution Matrix'}
            </h2>
            <p className="text-xs text-slate-400">
              {isTagalog
                ? '5 Kategorya ng Kaalaman: Slime, Treant, Muog, Gusali, at Umuupa'
                : '5 Core Domains: Slime, Treant, Citadel, Establishments, & Tenants'}
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-sm font-semibold transition"
          >
            ✕ {isTagalog ? 'Isara' : 'Close'}
          </button>
        )}
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2 py-3 border-b border-slate-800/80">
        {RESEARCH_CATEGORIES.map((cat) => {
          const isActive = activeTab === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => {
                setActiveTab(cat.id);
                soundFx.playClick();
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs md:text-sm font-bold transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-lg shadow-cyan-500/25 border border-cyan-400/40 scale-105'
                  : 'bg-slate-800/70 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-700/50'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{isTagalog ? cat.titleTagalog : cat.titleEnglish}</span>
            </button>
          );
        })}
      </div>

      {/* Category Info Header & Automation Toggles */}
      <div className="my-3 p-3.5 bg-slate-800/50 rounded-xl border border-slate-700/60 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl p-2 bg-slate-700/60 rounded-xl border border-slate-600/40">
            {currentCategory.icon}
          </span>
          <div>
            <h3 className="text-base font-bold text-cyan-300">
              {isTagalog ? currentCategory.titleTagalog : currentCategory.titleEnglish}
            </h3>
            <p className="text-xs text-slate-300">
              {isTagalog ? currentCategory.descriptionTagalog : currentCategory.descriptionEnglish}
            </p>
          </div>
        </div>

        {/* Dynamic Automation Controls based on Selected Category */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Slime Category Automations */}
          {activeTab === 'SLIME' && (
            <>
              <button
                onClick={() => toggleAutoSetting('autoBuy')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border ${
                  autoSettings?.autoBuy
                    ? 'bg-cyan-900/60 border-cyan-500 text-cyan-200 shadow-sm'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                <span>🛒</span>
                <span>{isTagalog ? 'Auto-Buy (Bili)' : 'Auto-Buy'}</span>
                <span className={`w-2 h-2 rounded-full ${autoSettings?.autoBuy ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'}`} />
              </button>

              <button
                onClick={() => toggleAutoSetting('autoSell')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border ${
                  autoSettings?.autoSell
                    ? 'bg-amber-900/60 border-amber-500 text-amber-200 shadow-sm'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                <span>💰</span>
                <span>{isTagalog ? 'Auto-Sell (Tinda)' : 'Auto-Sell'}</span>
                <span className={`w-2 h-2 rounded-full ${autoSettings?.autoSell ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'}`} />
              </button>

              <button
                onClick={() => toggleAutoSetting('autoUpgrade')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border ${
                  autoSettings?.autoUpgrade
                    ? 'bg-purple-900/60 border-purple-500 text-purple-200 shadow-sm'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                <span>🔬</span>
                <span>{isTagalog ? 'Auto-Upgrade' : 'Auto-Research'}</span>
                <span className={`w-2 h-2 rounded-full ${autoSettings?.autoUpgrade ? 'bg-purple-400 animate-pulse' : 'bg-slate-600'}`} />
              </button>
            </>
          )}

          {/* Treant Category Automations (QWERT Survival Skills) */}
          {activeTab === 'ENT' && (
            <button
              onClick={() => toggleAutoSetting('autoSurvivalSkills')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition border ${
                autoSettings?.autoSurvivalSkills !== false
                  ? 'bg-emerald-900/60 border-emerald-500 text-emerald-200 shadow-sm'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              <span>🌿</span>
              <span>{isTagalog ? 'QWERT Auto-Survival Skills' : 'Auto QWERT Survival'}</span>
              <span className={`w-2 h-2 rounded-full ${autoSettings?.autoSurvivalSkills !== false ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
            </button>
          )}

          {/* Tenants Category Explanatory Badge */}
          {activeTab === 'TENANTS' && (
            <div className="text-[11px] bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-700 text-amber-300 flex items-center gap-1.5">
              <span>🛡️</span>
              <span>
                {isTagalog
                  ? 'Bawat Umuupa = 20% Katatagan ng Gusali. Kapag nasira, lalaban sila nang kusa!'
                  : 'Each Tenant = 20% Tether Defense. When broken, they detach and counter-attack!'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 3 Columns Grid for Research Nodes */}
      <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-1 md:grid-cols-3 gap-4">
        {currentCategory.nodes.map((node) => {
          const currentLevel = (upgrades[node.key] as number) ?? 1;
          const isMax = currentLevel >= node.maxLevel;
          const cost = techUpgradeCost(node.key, currentLevel);
          const affordable = canAfford(resources, cost);

          return (
            <div
              key={node.key}
              className="flex flex-col justify-between bg-slate-800/70 border border-slate-700/80 rounded-xl p-4 transition-all hover:border-cyan-500/50 shadow-md"
            >
              {/* Column Header & Badge */}
              <div>
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-700/50">
                  <span>{isTagalog ? 'Hanay' : 'Col'} {node.column}: {isTagalog ? node.columnTitleTagalog : node.columnTitleEnglish}</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-900 text-cyan-300 border border-slate-700 text-xs font-black">
                    Lv. {currentLevel} / {node.maxLevel}
                  </span>
                </div>

                {/* Node Title & Icon */}
                <div className="flex items-center gap-2.5 my-3">
                  <span className="text-2xl p-2 bg-slate-900 rounded-lg border border-slate-700/60">
                    {node.icon}
                  </span>
                  <div>
                    <h4 className="text-sm font-bold text-slate-100">
                      {isTagalog ? node.nameTagalog : node.nameEnglish}
                    </h4>
                    <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                      {isTagalog ? node.descriptionTagalog : node.descriptionEnglish}
                    </p>
                  </div>
                </div>
              </div>

              {/* Cost & Upgrade Action */}
              <div className="mt-3 pt-3 border-t border-slate-700/60">
                {!isMax ? (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
                      <span>{isTagalog ? 'Kailangan sa Pagsasaliksik:' : 'Research Cost:'}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(cost).map(([resKey, amount]) => {
                        const currentAmount = (resources[resKey as keyof typeof resources] ?? 0) as number;
                        const hasEnough = currentAmount >= (amount ?? 0);
                        return (
                          <span
                            key={resKey}
                            title={resLabel(resKey)}
                            className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border flex items-center gap-1 ${
                              hasEnough
                                ? 'bg-slate-900/90 text-emerald-300 border-emerald-500/40'
                                : 'bg-red-950/40 text-red-300 border-red-500/40'
                            }`}
                          >
                            <span>{RESOURCE_PRICES[resKey as keyof typeof RESOURCE_PRICES]?.icon ?? (resKey === 'coins' ? '🪙' : resLabel(resKey))}</span>
                            <span>{amount}</span>
                            <span className="text-[9px] opacity-75">({Math.floor(currentAmount)})</span>
                          </span>
                        );
                      })}
                    </div>

                    <button
                      onClick={() => handleUpgrade(node)}
                      disabled={!affordable}
                      className={`w-full py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-md ${
                        affordable
                          ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white shadow-cyan-500/20 active:scale-95'
                          : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                      }`}
                    >
                      <span>🔬</span>
                      <span>{isTagalog ? 'Magsaliksik (Mag-upgrade)' : 'Research Upgrade'}</span>
                    </button>
                  </div>
                ) : (
                  <div className="py-2 text-center text-xs font-bold text-emerald-400 bg-emerald-950/30 border border-emerald-500/30 rounded-xl">
                    ✓ {isTagalog ? 'Nakamit ang Pinakamataas na Antas' : 'Maximum Level Reached'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
