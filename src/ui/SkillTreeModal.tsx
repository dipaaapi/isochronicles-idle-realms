import React, { useEffect, useRef } from 'react';
import { useGameStore } from '../state/useGameStore';
import {
  POINTS_PER_SET,
  SKILLS,
  SKILL_BRANCHES,
  SKILL_TEXT,
  TEAM_STATS,
  WAVES_PER_SET,
  branchSkills,
  canLearn,
  fillText,
  formatStat,
  nextRewardWave,
  rankOf,
  teamStatTotals,
  type Localized,
  type SkillBranch,
  type SkillId,
  type SkillRanks,
  type TeamStat,
} from '../state/skillTree';

interface SkillCardProps {
  id: SkillId;
  ranks: SkillRanks;
  points: number;
  color: string;
  t: (text: Localized) => string;
  onLearn: (id: SkillId) => void;
}

const SkillCard: React.FC<SkillCardProps> = ({ id, ranks, points, color, t, onLearn }) => {
  const skill = SKILLS[id];
  const rank = rankOf(ranks, id);
  const maxed = rank >= skill.maxRank;
  const locked = !!skill.requires && rankOf(ranks, skill.requires) === 0;
  const learnable = canLearn(id, ranks, points);
  const status = maxed
    ? t(SKILL_TEXT.maxed)
    : locked
    ? fillText(t(SKILL_TEXT.requires), { skill: t(SKILLS[skill.requires!].name) })
    : points < 1
    ? t(SKILL_TEXT.noPoints)
    : `+ ${t(SKILL_TEXT.learn)}`;

  return (
    <button
      type="button"
      disabled={!learnable}
      onClick={() => onLearn(id)}
      title={t(skill.desc)}
      style={{ borderColor: rank > 0 || learnable ? color : undefined }}
      className={`group w-full rounded-xl border p-2.5 text-left transition-all ${
        maxed
          ? 'bg-slate-900/90'
          : learnable
          ? 'bg-slate-900 hover:-translate-y-0.5 hover:bg-slate-800 cursor-pointer shadow-md'
          : locked
          ? 'border-slate-800 bg-slate-950/70 opacity-55 cursor-not-allowed'
          : 'border-slate-700 bg-slate-900/70 cursor-not-allowed'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-xl leading-none" aria-hidden="true">{skill.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-bold text-white">{t(skill.name)}</div>
          <div className="mt-1 flex gap-1" aria-label={`${rank}/${skill.maxRank}`}>
            {Array.from({ length: skill.maxRank }, (_, i) => (
              <span
                key={i}
                className="h-1.5 flex-1 rounded-full"
                style={{ background: i < rank ? color : 'rgb(51 65 85)' }}
              />
            ))}
          </div>
        </div>
        <span className="font-mono text-[10px] text-slate-400">{rank}/{skill.maxRank}</span>
      </div>
      <p className="mt-1.5 text-[10.5px] leading-snug text-slate-400">{t(skill.desc)}</p>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10.5px]">
        <span className="font-mono text-slate-300">
          {rank > 0 && <>{formatStat(skill.stat, rank * skill.perRank)}</>}
          {rank > 0 && !maxed && <span className="text-slate-500"> → </span>}
          {!maxed && <span style={{ color }}>{formatStat(skill.stat, (rank + 1) * skill.perRank)}</span>}
        </span>
        <span
          className={`shrink-0 rounded-md px-1.5 py-0.5 font-bold ${
            learnable ? 'text-white' : maxed ? 'text-emerald-300' : 'text-slate-500'
          }`}
          style={learnable ? { background: color } : undefined}
        >
          {maxed ? `✓ ${status}` : status}
        </span>
      </div>
    </button>
  );
};

export const SkillTreeModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { skillPoints, skillRanks, learnSkill, resetSkills, regressionCount, invasion, language } = useGameStore();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);

  const t = (text: Localized) => (language === 'TL' ? text.tl : text.en);
  const wavesCleared = invasion.invasionsRepelled;
  const nextWave = nextRewardWave(wavesCleared);
  const setProgress = wavesCleared % WAVES_PER_SET;
  const totals = teamStatTotals(skillRanks, regressionCount);
  const activeStats = (Object.keys(totals) as TeamStat[]).filter((s) => totals[s] > 0);
  const spent = Object.values(skillRanks).some((r) => (r ?? 0) > 0);

  const handleReset = () => {
    if (window.confirm(t(SKILL_TEXT.resetConfirm))) resetSkills();
  };

  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      onClose={onClose}
      aria-labelledby="skill-tree-title"
      className="m-auto max-h-[92vh] w-[min(64rem,96vw)] overflow-y-auto rounded-2xl border border-purple-500/40 bg-slate-950 p-4 text-slate-200 shadow-2xl backdrop:bg-black/75 sm:p-5"
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="skill-tree-title" className="text-xl font-bold text-purple-200">{t(SKILL_TEXT.title)}</h2>
          <p className="mt-1 text-xs text-slate-400">
            {fillText(t(SKILL_TEXT.howTo), { waves: WAVES_PER_SET, points: POINTS_PER_SET })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-amber-400/50 bg-amber-500/10 px-3 py-1.5 text-center" aria-live="polite">
            <div className="font-mono text-2xl font-black leading-none text-amber-300">{skillPoints}</div>
            <div className="text-[10px] uppercase tracking-wide text-amber-200/80">{t(SKILL_TEXT.points)}</div>
          </div>
          <button autoFocus onClick={onClose} className="rounded-lg bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700">
            {t(SKILL_TEXT.close)}
          </button>
        </div>
      </header>

      {/* Progress toward the next wave-set reward */}
      <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="text-slate-300">
            {nextWave
              ? fillText(t(SKILL_TEXT.nextPoints), { points: POINTS_PER_SET, wave: nextWave, left: nextWave - wavesCleared })
              : t(SKILL_TEXT.allEarned)}
          </span>
          <span className="font-mono text-slate-500">{nextWave ? `${setProgress}/${WAVES_PER_SET}` : '✓'}</span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: WAVES_PER_SET }, (_, i) => (
            <span
              key={i}
              className={`h-2 flex-1 rounded-full ${!nextWave || i < setProgress ? 'bg-amber-400' : 'bg-slate-800'}`}
            />
          ))}
        </div>
      </div>

      {/* Four branches, each a chain from top to bottom */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(SKILL_BRANCHES) as SkillBranch[]).map((branch) => {
          const b = SKILL_BRANCHES[branch];
          return (
            <section key={branch} className="rounded-xl border border-slate-800 bg-slate-900/40 p-2.5">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold" style={{ color: b.color }}>
                <span aria-hidden="true">{b.icon}</span> {t(b.name)}
              </h3>
              <div className="flex flex-col items-stretch">
                {branchSkills(branch).map((id, index) => (
                  <React.Fragment key={id}>
                    {index > 0 && (
                      <span
                        aria-hidden="true"
                        className="mx-auto h-3 w-0.5"
                        style={{ background: rankOf(skillRanks, SKILLS[id].requires!) > 0 ? b.color : 'rgb(51 65 85)' }}
                      />
                    )}
                    <SkillCard id={id} ranks={skillRanks} points={skillPoints} color={b.color} t={t} onLearn={learnSkill} />
                  </React.Fragment>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* Combined team bonuses */}
      <div className="mt-4 rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-3">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-indigo-300">{t(SKILL_TEXT.teamBonuses)}</h3>
        {activeStats.length === 0 ? (
          <p className="text-[11px] text-slate-500">{t(SKILL_TEXT.noBonuses)}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {activeStats.map((stat) => (
              <span key={stat} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px]">
                <span className="text-slate-400">{t(TEAM_STATS[stat].name)} </span>
                <span className="font-mono font-bold text-emerald-300">{formatStat(stat, totals[stat])}</span>
              </span>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-500">{t(SKILL_TEXT.perRealm)}</p>
      </div>

      <footer className="mt-4 flex justify-end">
        <button
          onClick={handleReset}
          disabled={!spent}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ↺ {t(SKILL_TEXT.reset)}
        </button>
      </footer>
    </dialog>
  );
};
