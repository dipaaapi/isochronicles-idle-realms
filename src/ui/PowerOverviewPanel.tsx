import React from 'react';
import { ArrowUpCircle, ChevronRight } from 'lucide-react';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from '../game/audio/soundFx';
import { useTranslation, type TranslationKey } from '../i18n/translations';
import { formatCost } from './costDisplay';
import type { CitadelTab } from './CitadelCommandModal';
import { CATEGORY_STYLE, buildUpgradeSuggestions, type Category, type Suggestion } from './upgradeSuggestions';

const CATEGORY_ORDER: Category[] = ['summon', 'evolution', 'research', 'defense', 'building', 'tower'];

// Where each part of the realm gets stronger; one card per Citadel tab
const GUIDE: Array<{ tab: CitadelTab; icon: string; title: TranslationKey; body: TranslationKey }> = [
  { tab: 'MINIONS', icon: '👥', title: 'hubGuideMinionsTitle', body: 'hubGuideMinionsBody' },
  { tab: 'SKILLS', icon: '🌟', title: 'hubGuideSkillsTitle', body: 'hubGuideSkillsBody' },
  { tab: 'RESEARCH', icon: '🔬', title: 'hubGuideResearchTitle', body: 'hubGuideResearchBody' },
  { tab: 'CASTLE', icon: '🛡️', title: 'hubGuideCastleTitle', body: 'hubGuideCastleBody' },
  { tab: 'FORGE', icon: '⚒️', title: 'hubGuideForgeTitle', body: 'hubGuideForgeBody' },
  { tab: 'MARKET', icon: '🪙', title: 'hubGuideMarketTitle', body: 'hubGuideMarketBody' },
];

export const PowerOverviewPanel: React.FC<{ onNavigate: (tab: CitadelTab) => void }> = ({ onNavigate }) => {
  const state = useGameStore();
  const { t: tr } = useTranslation();
  const suggestions = buildUpgradeSuggestions(state, true);

  const go = (tab: CitadelTab) => {
    soundFx.playClick();
    onNavigate(tab);
  };

  const apply = (s: Suggestion) => {
    if (!s.apply()) soundFx.playError();
  };

  const grouped = CATEGORY_ORDER.map((c) => ({ c, items: suggestions.filter((s) => s.category === c) })).filter(
    (g) => g.items.length > 0
  );

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <button
          onClick={() => go('SKILLS')}
          className={`p-3 text-left border-2 cursor-pointer transition-colors ${
            state.skillPoints > 0 ? 'border-amber-400/70 bg-amber-950/40 hover:bg-amber-900/40' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'
          }`}
        >
          <div className="text-[10px] uppercase text-slate-400">{tr('hubSkillPoints')}</div>
          <div className="text-xl font-black font-mono text-amber-300">{state.skillPoints}</div>
        </button>
        <div className="p-3 border-2 border-emerald-700/60 bg-emerald-950/30">
          <div className="text-[10px] uppercase text-slate-400">{tr('hubReadyCount')}</div>
          <div className="text-xl font-black font-mono text-emerald-300">{suggestions.length}</div>
        </div>
        <div className="p-3 border-2 border-slate-800 bg-slate-900/60">
          <div className="text-[10px] uppercase text-slate-400">{tr('hubWave')}</div>
          <div className="text-xl font-black font-mono text-rose-300">{state.invasion.waveNumber}</div>
        </div>
        <div className="p-3 border-2 border-slate-800 bg-slate-900/60">
          <div className="text-[10px] uppercase text-slate-400">{tr('hubCastleHp')}</div>
          <div className="text-xl font-black font-mono text-sky-300">
            {Math.round((state.defense.castleHp / Math.max(1, state.defense.castleMaxHp)) * 100)}%
          </div>
        </div>
      </div>

      {/* Ready now */}
      <section className="p-3 border-2 border-emerald-800/60 bg-slate-900/40">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-300">{tr('hubReadyTitle')}</h3>
        {grouped.length === 0 ? (
          <p className="text-[11px] text-slate-400">{tr('hubNothingReady')}</p>
        ) : (
          <div className="space-y-3">
            {grouped.map(({ c, items }) => (
              <div key={c}>
                <div className={`inline-block mb-1.5 px-1.5 text-[9px] font-bold uppercase border ${CATEGORY_STYLE[c].chip}`}>
                  {tr(CATEGORY_STYLE[c].label)} · {items.length}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                  {items.map((s) => (
                    <div key={s.key} className="flex items-center gap-2 p-1.5 bg-slate-950/80 border border-slate-800">
                      <span className="w-8 h-8 shrink-0 flex items-center justify-center text-base bg-slate-900 border border-slate-800">{s.icon}</span>
                      <button onClick={() => go(s.tab)} className="flex-1 min-w-0 text-left cursor-pointer" title={tr('enhanceOpenHint')}>
                        <p className="text-[11px] text-slate-100 truncate">{s.title}</p>
                        <p className="text-[9px] font-mono text-emerald-300/90 truncate">{formatCost(s.cost)}</p>
                      </button>
                      <button
                        onClick={() => apply(s)}
                        className="shrink-0 flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold cursor-pointer"
                      >
                        <ArrowUpCircle className="w-3 h-3" />
                        {tr('enhanceUpgradeNow')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Where to grow stronger */}
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-purple-300">{tr('hubGuideTitle')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {GUIDE.map((g) => (
            <button
              key={g.tab}
              onClick={() => go(g.tab)}
              className="group flex items-start gap-2.5 p-2.5 text-left border border-slate-800 bg-slate-900/60 hover:border-purple-500/60 cursor-pointer transition-colors"
            >
              <span className="text-xl leading-none">{g.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-white">{tr(g.title)}</div>
                <p className="text-[10px] leading-snug text-slate-400">{tr(g.body)}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-purple-300 shrink-0" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
