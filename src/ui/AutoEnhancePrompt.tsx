import { isConstructionReady } from '../state/constructionProgress';
import React, { useState } from 'react';
import { useGameStore } from '../state/useGameStore';
import { formatCost } from './costDisplay';
import { soundFx } from '../game/audio/soundFx';
import { ArrowUpCircle, ChevronRight, Sparkles, X } from 'lucide-react';
import type { CitadelTab } from './CitadelCommandModal';
import { useTranslation } from '../i18n/translations';
import { CATEGORY_STYLE, buildUpgradeSuggestions, type Suggestion } from './upgradeSuggestions';

interface AutoEnhancePromptProps {
  onOpenCitadel: (tab: CitadelTab) => void;
  embedded?: boolean;
}

export const AutoEnhancePrompt: React.FC<AutoEnhancePromptProps> = ({
  onOpenCitadel,
  embedded = false,
}) => {
  const state = useGameStore();
  const { t: tr } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  if (!isConstructionReady(state)) return null;

  const suggestions = buildUpgradeSuggestions(state);

  if (suggestions.length === 0) return null;

  const dismiss = (e: React.MouseEvent, s: Suggestion) => {
    e.stopPropagation();
    soundFx.playClick();
    state.setPromptedUpgrade(s.key, s.level);
  };

  const dismissAll = () => {
    soundFx.playClick();
    suggestions.forEach((s) => state.setPromptedUpgrade(s.key, s.level));
  };

  const applyNow = (e: React.MouseEvent, s: Suggestion) => {
    e.stopPropagation();
    if (!s.apply()) soundFx.playError();
  };

  const open = (s: Suggestion) => {
    soundFx.playClick();
    onOpenCitadel(s.tab);
  };

  return (
    <div
      className={
        embedded
          ? 'flex flex-col gap-1.5'
          : 'absolute top-20 right-3 md:right-5 z-[9999] flex max-h-[calc(100vh-12rem)] w-[min(18rem,calc(100vw-1.5rem))] flex-col gap-1.5 overflow-y-auto'
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-emerald-950/60 border border-emerald-500/40">
        <button
          onClick={() => { soundFx.playClick(); setCollapsed((c) => !c); }}
          className="flex items-center gap-1.5 min-w-0 cursor-pointer text-left"
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-300 truncate">
            {tr('enhanceReadyTitle')}
          </span>
          <span className="px-1.5 text-[10px] font-mono font-bold bg-emerald-500 text-slate-950">{suggestions.length}</span>
          <ChevronRight className={`w-3 h-3 text-emerald-400 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
        </button>
        <button
          onClick={dismissAll}
          className="text-[9px] text-slate-400 hover:text-white cursor-pointer shrink-0"
        >
          {tr('enhanceDismissAll')}
        </button>
      </div>

      {!collapsed && (
        <div className="flex flex-col gap-1 max-h-80 overflow-y-auto pr-0.5">
          {suggestions.map((s) => {
            const style = CATEGORY_STYLE[s.category];
            return (
              <div
                key={s.key}
                onClick={() => open(s)}
                title={tr('enhanceOpenHint')}
                className="group flex items-center gap-2 p-1.5 bg-slate-900/90 border border-slate-700/60 hover:border-emerald-500/60 cursor-pointer transition-colors animate-in fade-in duration-200"
              >
                <span className="w-7 h-7 shrink-0 flex items-center justify-center text-base bg-slate-950 border border-slate-800">
                  {s.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className={`px-1 text-[8px] font-bold uppercase border ${style.chip}`}>{tr(style.label)}</span>
                  </div>
                  <p className="text-[11px] text-slate-100 leading-tight truncate">{s.title}</p>
                  <p className="text-[9px] font-mono text-emerald-300/90 truncate">{formatCost(s.cost)}</p>
                </div>
                <button
                  onClick={(e) => applyNow(e, s)}
                  title={tr('enhanceUpgradeNow')}
                  className="shrink-0 flex items-center gap-1 px-1.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold cursor-pointer"
                >
                  <ArrowUpCircle className="w-3 h-3" />
                  {tr('enhanceUpgradeNow')}
                </button>
                <button
                  onClick={(e) => dismiss(e, s)}
                  title={tr('enhanceDismiss')}
                  className="shrink-0 p-0.5 text-slate-500 hover:text-white cursor-pointer"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
