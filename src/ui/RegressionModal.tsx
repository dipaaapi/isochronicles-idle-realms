import React, { useState } from 'react';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from '../game/audio/soundFx';
import { PLATFORM_CONFIGS, SEASON_CONFIGS } from '../types/game';
import { X, RotateCcw, Award, History, Sparkles, ShieldCheck, Zap, AlertTriangle } from 'lucide-react';

interface RegressionModalProps {
  onClose: () => void;
}

export const RegressionModal: React.FC<RegressionModalProps> = ({ onClose }) => {
  const {
    invasion,
    platformPhase,
    regressionCount,
    regressionHistory,
    performRegression,
    language,
    day,
    year,
    season,
    isWave100VictoryCelebration,
    dismissWave100Celebration,
    realmName,
    resetRegressionProgress,
  } = useGameStore();

  const [regressionName, setRegressionName] = useState('');
  const [resetConfirmation, setResetConfirmation] = useState('');

  const currentPlatform = PLATFORM_CONFIGS[platformPhase || 1];
  const isRecommended = invasion.waveNumber >= 100;

  const handlePerformRegression = () => {
    if (regressionName.trim() !== realmName.trim()) return;
    soundFx.playFanfare();
    const promptMsg =
      language === 'TL'
        ? `Gusto mo bang mag-Regress ngayon?\n\n• Itatala ang iyong narating (Wave ${invasion.waveNumber}, Phase ${platformPhase}, Day ${day}).\n• Babalik ang wave sa Wave 1 (Demon Citadel).\n• Makatatanggap ng bonus starting coins at dagdag na castle HP!`
        : `Undergo Regression now?\n\n• Your achievement will be recorded (Wave ${invasion.waveNumber}, Phase ${platformPhase}, Day ${day}).\n• Waves will restart at Wave 1 (Demon Citadel).\n• You will receive bonus starting coins and permanent castle HP boosts!`;

    if (window.confirm(promptMsg)) {
      performRegression();
      onClose();
    }
  };

  const handleResetRegressionProgress = () => {
    if (!window.confirm(language === 'TL' ? 'Mabubura ang Regression tier at lahat ng history. Ituloy?' : 'This will erase the Regression tier and all history. Continue?')) return;
    if (resetRegressionProgress(resetConfirmation)) setResetConfirmation('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl bg-slate-900/95 border border-purple-500/40 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-purple-500/20 bg-purple-950/30">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-purple-600/30">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white flex items-center gap-2">
                <span>{language === 'TL' ? 'Muling Pagkabuhay (Regression)' : 'Demon Lord Regression'}</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/40 text-purple-300 font-mono">
                  Tier {regressionCount}
                </span>
              </h2>
              <p className="text-xs text-purple-300/80">
                {language === 'TL'
                  ? 'Ibalik ang panahon gamit ang mga alaala ng labanan upang maging mas malakas!'
                  : 'Turn back the wheel of time with your battle memories to grow ever stronger!'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              soundFx.playClick();
              if (isWave100VictoryCelebration) dismissWave100Celebration();
              onClose();
            }}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-slate-200">
          {/* Wave 100 Victory Banner if completed */}
          {isWave100VictoryCelebration && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-purple-500/20 to-red-500/20 border border-amber-400/60 shadow-lg text-center animate-bounce-short">
              <div className="text-3xl mb-1">👑 🏆 ⚡</div>
              <h3 className="text-lg font-black text-amber-300">
                {language === 'TL' ? 'KUMPLETO ANG WAVE 100! TAGUMPAY NG DEMON LORD!' : 'WAVE 100 CONQUERED! SUPREME DEMON LORD VICTORY!'}
              </h3>
              <p className="text-xs text-amber-200/90 mt-1 max-w-md mx-auto">
                {language === 'TL'
                  ? 'Nalampasan mo ang lahat ng 4 na platform at 100 waves ng paglusob ng mga tao! Inirerekomenda na ngayon ang REGRESSION para sa susunod na antas ng kapangyarihan.'
                  : 'You have survived all 4 platforms and 100 waves of crusaders and mechas! Regression is now strongly recommended for eternal transcendence.'}
              </p>
            </div>
          )}

          {/* Current Status Overview Card */}
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {language === 'TL' ? 'Kasalukuyang Takbo ng Panahon' : 'Current Timeline Progress'}
              </span>
              <span className="text-xs font-mono font-bold text-indigo-400">
                Phase {platformPhase} of 4
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400">{language === 'TL' ? 'Kasalukuyang Wave' : 'Current Wave'}</div>
                <div className="text-xl font-black text-red-400 font-mono mt-0.5">{invasion.waveNumber} / 100</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400">{language === 'TL' ? 'Plataporma' : 'Platform'}</div>
                <div className="text-sm font-black text-purple-300 mt-1 truncate" title={currentPlatform.nameEn}>
                  {currentPlatform.nameEn}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400">{language === 'TL' ? 'Panahon at Araw' : 'Season & Day'}</div>
                <div className="text-sm font-black text-emerald-300 mt-1 font-mono">
                  {SEASON_CONFIGS[season].icon} D{day} / Y{year}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400">{language === 'TL' ? 'Napatalsik na Paglusob' : 'Repelled Waves'}</div>
                <div className="text-xl font-black text-amber-400 font-mono mt-0.5">{invasion.invasionsRepelled}</div>
              </div>
            </div>
          </div>

          {/* 4 Phases Overview Map */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {language === 'TL' ? 'Mga Yugto ng Plataporma (Phases 1 - 4)' : 'Platform Phases (Waves 1 - 100)'}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {([1, 2, 3, 4] as const).map((pIndex) => {
                const pCfg = PLATFORM_CONFIGS[pIndex];
                const isActive = platformPhase === pIndex;
                const isPassed = platformPhase > pIndex;
                return (
                  <div
                    key={pIndex}
                    className={`p-3 rounded-xl border transition-all ${
                      isActive
                        ? 'bg-purple-950/40 border-purple-500 shadow-md ring-1 ring-purple-500/50'
                        : isPassed
                        ? 'bg-slate-950/40 border-emerald-500/40 opacity-80'
                        : 'bg-slate-950/30 border-slate-800 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold" style={{ color: pCfg.accentColor }}>
                        Phase {pIndex}: {pCfg.nameEn}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                        {pCfg.waveRange}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-tight line-clamp-2">
                      {language === 'TL' ? pCfg.description : pCfg.descriptionEn}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Regression Legacy Perks Card */}
          <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-500/30 space-y-2">
            <div className="flex items-center gap-2 text-indigo-300 font-bold text-xs uppercase tracking-wider">
              <Sparkles className="w-4 h-4" />
              <span>{language === 'TL' ? 'Bentahe ng Regression' : 'Regression Legacy Bonuses'}</span>
            </div>
            <ul className="text-xs text-slate-300 space-y-1.5 pl-1">
              <li className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  {language === 'TL'
                    ? `+${(regressionCount + 1) * 100} Permanenteng Max Castle HP sa pagsisimula muli`
                    : `+${(regressionCount + 1) * 100} Permanent Castle Max HP on restart`}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  {language === 'TL'
                    ? `+${100 + (regressionCount + 1) * 75} Simulang Barya & +${50 + (regressionCount + 1) * 25} Kristal`
                    : `+${100 + (regressionCount + 1) * 75} Bonus Starting Coins & +${50 + (regressionCount + 1) * 25} Shards`}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Award className="w-4 h-4 text-purple-400 shrink-0" />
                <span>
                  {language === 'TL'
                    ? 'Mananatili ang antas ng iyong Support Healing Slime at kagamitan sa imbentaryo'
                    : 'Your Support Healing Slime evolution level and crafted equipment are preserved'}
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-rose-500/40 bg-rose-950/20 p-4 space-y-3">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-300">Reset Regression Records</h4>
              <p className="mt-1 text-[11px] text-slate-400">Type <span className="font-mono font-bold text-rose-200">RESET REGRESSIONS</span> to erase the Regression tier and history.</p>
            </div>
            <div className="flex gap-2">
              <input
                value={resetConfirmation}
                onChange={(event) => setResetConfirmation(event.target.value)}
                placeholder="RESET REGRESSIONS"
                className="min-w-0 flex-1 rounded-xl border border-rose-500/30 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-rose-400"
              />
              <button
                onClick={handleResetRegressionProgress}
                disabled={resetConfirmation.trim().toUpperCase() !== 'RESET REGRESSIONS'}
                className="rounded-xl border border-rose-500/40 bg-rose-900/50 px-3 py-2 text-[11px] font-bold text-rose-200 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-600"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Regression History Records Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                <span>{language === 'TL' ? 'Talaan ng Tagumpay sa Regression' : 'Regression History Records'}</span>
              </h4>
              <span className="text-[11px] font-mono text-slate-500">
                {regressionHistory.length} {language === 'TL' ? 'na tala' : 'records'}
              </span>
            </div>

            {regressionHistory.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950/40 border border-dashed border-slate-800 text-center text-xs text-slate-500">
                {language === 'TL'
                  ? 'Wala pang naitalang Regression. Makatapos ng Wave 100 o mag-regress anumang oras para magtala!'
                  : 'No regressions recorded yet. Reach Wave 100 or regress at any point to forge your chronicle!'}
              </div>
            ) : (
              <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                {regressionHistory.map((rec, index) => {
                  const recPlatform = PLATFORM_CONFIGS[rec.phaseReached || 1];
                  const recSeason = SEASON_CONFIGS[rec.seasonReached || 'SPRING'];
                  return (
                    <div
                      key={rec.id || index}
                      className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-bold text-purple-400 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/40">
                          #{rec.regressionIndex}
                        </span>
                        <div>
                          <div className="font-bold text-slate-200 flex items-center gap-1.5">
                            <span className="text-red-400">Wave {rec.waveReached}</span>
                            <span className="text-slate-500">•</span>
                            <span style={{ color: recPlatform.accentColor }}>
                              Phase {rec.phaseReached} ({recPlatform.nameEn})
                            </span>
                            {rec.completedWave100 && <span title="Conquered Wave 100!">👑</span>}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-2">
                            <span>{recSeason.icon} Day {rec.dayReached} (Year {rec.yearReached || 1})</span>
                            <span>•</span>
                            <span>{rec.invasionsRepelled} repelled</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right text-[10px] text-slate-500 font-mono">
                        {new Date(rec.timestamp).toLocaleDateString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col gap-3 border-t border-purple-500/20 bg-slate-950 p-5">
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            {isRecommended ? (
              <span className="text-amber-400 font-bold flex items-center gap-1 animate-pulse">
                <Sparkles className="w-4 h-4" />
                {language === 'TL' ? 'Lubos na inirerekomenda ang Regression!' : 'Regression strongly recommended!'}
              </span>
            ) : (
              <span className="text-slate-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-slate-500" />
                {language === 'TL' ? 'Maaaring mag-regress anumang oras.' : 'Can regress at any wave to record progress.'}
              </span>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => {
                soundFx.playClick();
                if (isWave100VictoryCelebration) dismissWave100Celebration();
                onClose();
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
            >
              {language === 'TL' ? 'Isara' : 'Close'}
            </button>
            <button
              onClick={handlePerformRegression}
              disabled={regressionName.trim() !== realmName.trim()}
              className={`px-5 py-2 rounded-xl text-xs font-bold text-white shadow-lg active:scale-95 transition-all flex items-center gap-2 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 ${
                isRecommended
                  ? 'bg-gradient-to-r from-amber-600 via-purple-600 to-indigo-600 hover:brightness-110 shadow-purple-600/40 animate-pulse'
                  : 'bg-gradient-to-r from-purple-700 to-indigo-600 hover:from-purple-600 hover:to-indigo-500 shadow-purple-900/30'
              }`}
            >
              <RotateCcw className="w-4 h-4" />
              <span>
                {isRecommended
                  ? (language === 'TL' ? 'Magsagawa ng Regression (Wave 100)' : 'Execute Regression (Wave 100)')
                  : (language === 'TL' ? 'Magsagawa ng Regression' : 'Execute Regression')}
              </span>
            </button>
          </div>
          <div className="mt-3 w-full border-t border-slate-800 pt-3">
            <label className="mb-1 block text-[11px] font-bold text-slate-400">
              Type realm name to confirm: <span className="font-mono text-purple-300">{realmName}</span>
            </label>
            <input
              value={regressionName}
              onChange={(event) => setRegressionName(event.target.value)}
              placeholder={realmName}
              className="w-full rounded-xl border border-purple-500/30 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-purple-400"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
