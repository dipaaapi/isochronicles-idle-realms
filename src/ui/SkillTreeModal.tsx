import React, { useEffect, useRef } from 'react';
import { useGameStore } from '../state/useGameStore';
import { SKILLS, SkillId } from '../state/skillTree';

type Direction = 'north' | 'south' | 'east' | 'west';

const DIRECTION_ARROW: Record<Direction, string> = {
  north: '↑',
  south: '↓',
  east: '→',
  west: '←',
};

const DIRECTION_LABEL: Record<Direction, string> = {
  north: 'Castle',
  south: 'Mystic',
  east: 'Resources',
  west: 'Minions',
};

interface SkillNodeProps {
  id: SkillId;
  learned: boolean;
  prerequisiteMet: boolean;
  skillPoints: number;
  onUnlock: (id: SkillId) => void;
}

const SkillNode: React.FC<SkillNodeProps> = ({ id, learned, prerequisiteMet, skillPoints, onUnlock }) => {
  const skill = SKILLS[id];
  return (
    <div
      className={`w-40 shrink-0 rounded-xl border p-2.5 text-left shadow-md transition-all ${
        learned
          ? 'border-emerald-500 bg-emerald-950/50 shadow-emerald-500/10'
          : prerequisiteMet
          ? 'border-purple-500/50 bg-slate-900'
          : 'border-slate-700 bg-slate-950/80 opacity-70'
      }`}
    >
      <h4 className={`text-xs font-bold ${learned ? 'text-emerald-200' : 'text-white'}`}>{skill.name}</h4>
      <p className="my-1.5 min-h-9 text-[10.5px] leading-snug text-slate-400">{skill.description}</p>
      <button
        disabled={learned || !prerequisiteMet || skillPoints < 1}
        onClick={() => onUnlock(id)}
        className="w-full rounded-lg bg-purple-600 px-2 py-1.5 text-[10px] font-bold text-white hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-500"
      >
        {learned
          ? 'Unlocked ✓'
          : !prerequisiteMet
          ? `Requires ${SKILLS[skill.prerequisite!].name}`
          : skillPoints < 1
          ? 'Requires 1 point'
          : 'Unlock · 1 point'}
      </button>
    </div>
  );
};

interface BranchProps {
  direction: Direction;
  unlockedSkills: SkillId[];
  skillPoints: number;
  onUnlock: (id: SkillId) => void;
}

const Branch: React.FC<BranchProps> = ({ direction, unlockedSkills, skillPoints, onUnlock }) => {
  const ids = (Object.keys(SKILLS) as SkillId[])
    .filter((id) => SKILLS[id].direction === direction)
    .sort((a, b) => SKILLS[a].tier - SKILLS[b].tier);

  // Tiers closest to the hub sit nearest the center; north/west read outward-first, east/south read inward-first.
  const orderedIds = direction === 'north' || direction === 'west' ? [...ids].reverse() : ids;
  const isVertical = direction === 'north' || direction === 'south';
  const arrow = DIRECTION_ARROW[direction];

  return (
    <div className={`flex items-center gap-1.5 ${isVertical ? 'flex-col' : 'flex-row'}`}>
      {orderedIds.map((id, index) => {
        const skill = SKILLS[id];
        const learned = unlockedSkills.includes(id);
        const prerequisiteMet = !skill.prerequisite || unlockedSkills.includes(skill.prerequisite);
        return (
          <React.Fragment key={id}>
            <SkillNode id={id} learned={learned} prerequisiteMet={prerequisiteMet} skillPoints={skillPoints} onUnlock={onUnlock} />
            {index < orderedIds.length - 1 && (
              <span aria-hidden="true" className="text-lg font-bold text-purple-400/70">
                {arrow}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export const SkillTreeModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { skillPoints, unlockedSkills, unlockSkill, regressionCount } = useGameStore();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);

  const allIds = Object.keys(SKILLS) as SkillId[];
  const totalSkills = allIds.length;
  const unlockedCount = unlockedSkills.length;

  const handleUnlock = (id: SkillId) => unlockSkill(id);

  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      onClose={onClose}
      aria-labelledby="skill-tree-title"
      className="m-auto max-h-[92vh] w-[min(64rem,96vw)] overflow-y-auto rounded-2xl border border-purple-500/40 bg-slate-950 p-5 text-slate-200 shadow-2xl backdrop:bg-black/75"
    >
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 id="skill-tree-title" className="text-xl font-bold text-purple-200">Eternal Skill Tree</h2>
          <p className="mt-1 text-sm" aria-live="polite">
            {skillPoints} skill points available · +{regressionCount * 100} permanent castle HP
          </p>
        </div>
        <button autoFocus onClick={onClose} className="rounded-lg bg-slate-800 px-3 py-2">Close</button>
      </header>

      <p className="mb-5 text-sm text-slate-400">
        Each regression awards 1 point. Every power costs 1 point, works immediately and survives regression. Unlock each branch outward from the Eternal Core.
      </p>

      {/* Compass roadmap layout — visible on md+ screens */}
      <div className="hidden md:flex min-w-max flex-col items-center gap-3 overflow-x-auto pb-2">
        {/* North branch */}
        <Branch direction="north" unlockedSkills={unlockedSkills} skillPoints={skillPoints} onUnlock={handleUnlock} />

        <div className="flex items-center gap-3">
          {/* West branch */}
          <Branch direction="west" unlockedSkills={unlockedSkills} skillPoints={skillPoints} onUnlock={handleUnlock} />

          {/* Hub */}
          <div className="flex w-28 shrink-0 flex-col items-center justify-center gap-1 rounded-full border-2 border-purple-400/60 bg-gradient-to-br from-purple-900/80 to-slate-950 p-4 text-center shadow-lg shadow-purple-500/20">
            <span className="text-2xl">✨</span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-purple-200">Eternal Core</span>
            <span className="text-[10px] text-slate-400">{unlockedCount}/{totalSkills}</span>
          </div>

          {/* East branch */}
          <Branch direction="east" unlockedSkills={unlockedSkills} skillPoints={skillPoints} onUnlock={handleUnlock} />
        </div>

        {/* South branch */}
        <Branch direction="south" unlockedSkills={unlockedSkills} skillPoints={skillPoints} onUnlock={handleUnlock} />
      </div>

      {/* Stacked fallback layout — mobile screens */}
      <div className="flex flex-col gap-4 md:hidden">
        {(['north', 'west', 'east', 'south'] as Direction[]).map((direction) => {
          const ids = (Object.keys(SKILLS) as SkillId[])
            .filter((id) => SKILLS[id].direction === direction)
            .sort((a, b) => SKILLS[a].tier - SKILLS[b].tier);
          return (
            <section key={direction} className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
              <h3 className="mb-3 text-center font-bold text-purple-300">{DIRECTION_LABEL[direction]}</h3>
              <div className="flex flex-col items-center gap-1.5">
                {ids.map((id, index) => {
                  const skill = SKILLS[id];
                  const learned = unlockedSkills.includes(id);
                  const prerequisiteMet = !skill.prerequisite || unlockedSkills.includes(skill.prerequisite);
                  return (
                    <React.Fragment key={id}>
                      {index > 0 && <span aria-hidden="true" className="text-purple-400">↓</span>}
                      <SkillNode id={id} learned={learned} prerequisiteMet={prerequisiteMet} skillPoints={skillPoints} onUnlock={handleUnlock} />
                    </React.Fragment>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </dialog>
  );
};