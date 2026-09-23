import React, { useEffect, useRef } from 'react';
import { useGameStore } from '../state/useGameStore';
import { SKILLS, SkillId } from '../state/skillTree';

export const SkillTreeModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { skillPoints, unlockedSkills, unlockSkill, regressionCount } = useGameStore();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return (
    <dialog ref={dialog} onCancel={onClose} onClose={onClose} aria-labelledby="skill-tree-title"
      className="m-auto max-h-[90vh] w-[min(56rem,94vw)] overflow-y-auto rounded-2xl border border-purple-500/40 bg-slate-950 p-5 text-slate-200 shadow-2xl backdrop:bg-black/75">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div><h2 id="skill-tree-title" className="text-xl font-bold text-purple-200">Eternal Skill Tree</h2>
          <p className="mt-1 text-sm" aria-live="polite">{skillPoints} skill points available · +{regressionCount * 100} permanent castle HP</p></div>
        <button autoFocus onClick={onClose} className="rounded-lg bg-slate-800 px-3 py-2">Close</button>
      </header>
      <p className="mb-5 text-sm text-slate-400">Each regression awards 1 point. Every power costs 1 point, works immediately and survives regression. Unlock each branch from top to bottom.</p>
      <div className="grid gap-5 md:grid-cols-3">
        {['Minions', 'Castle', 'Resources'].map(branch => (
          <section key={branch} className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
            <h3 className="mb-3 text-center font-bold text-purple-300">{branch}</h3>
            {(Object.keys(SKILLS) as SkillId[]).filter(id => SKILLS[id].branch === branch).map((id, index) => {
              const skill = SKILLS[id];
              const learned = unlockedSkills.includes(id);
              const prerequisiteMet = !skill.prerequisite || unlockedSkills.includes(skill.prerequisite);
              return <React.Fragment key={id}>
                {index > 0 && <div aria-hidden="true" className="py-2 text-center text-purple-400">↓</div>}
                <div className={`rounded-xl border p-3 ${learned ? 'border-emerald-500 bg-emerald-950/40' : 'border-slate-600 bg-slate-950'}`}>
                  <h4 className="font-bold text-white">{skill.name}</h4>
                  <p className="my-2 min-h-12 text-sm text-slate-300">{skill.description}</p>
                  <button disabled={learned || !prerequisiteMet || skillPoints < 1} onClick={() => unlockSkill(id)}
                    className="w-full rounded-lg bg-purple-600 px-2 py-2 text-xs font-bold text-white hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-400">
                    {learned ? 'Unlocked' : !prerequisiteMet ? `Requires ${SKILLS[skill.prerequisite!].name}` : skillPoints < 1 ? 'Requires 1 skill point' : 'Unlock · 1 point'}
                  </button>
                </div>
              </React.Fragment>;
            })}
          </section>
        ))}
      </div>
    </dialog>
  );
};
