export const SKILLS = {
  MINION_MIGHT: { branch: 'Minions', name: 'Demon Might', description: '+20% minion attack damage.', prerequisite: null },
  MINION_HASTE: { branch: 'Minions', name: 'Swift Servants', description: '+15% minion movement speed.', prerequisite: 'MINION_MIGHT' },
  CASTLE_ARMOR: { branch: 'Castle', name: 'Obsidian Walls', description: 'Castle takes 10% less damage, before shields.', prerequisite: null },
  CASTLE_TURRETS: { branch: 'Castle', name: 'Arcane Artillery', description: '+25% automated turret damage.', prerequisite: 'CASTLE_ARMOR' },
  RESOURCE_GROVES: { branch: 'Resources', name: 'Rich Foundations', description: '+25% wood and stone harvested from buildings.', prerequisite: null },
  RESOURCE_ABUNDANCE: { branch: 'Resources', name: 'Realm Abundance', description: '+20% to all harvested resources. Stacks with Rich Foundations.', prerequisite: 'RESOURCE_GROVES' },
} as const;
export type SkillId = keyof typeof SKILLS;

export const skillBonuses = (unlocked: readonly SkillId[] = []) => ({
  attack: unlocked.includes('MINION_MIGHT') ? 1.2 : 1,
  speed: unlocked.includes('MINION_HASTE') ? 1.15 : 1,
  castleDamage: unlocked.includes('CASTLE_ARMOR') ? 0.9 : 1,
  turret: unlocked.includes('CASTLE_TURRETS') ? 1.25 : 1,
  foundations: unlocked.includes('RESOURCE_GROVES') ? 1.25 : 1,
  harvest: unlocked.includes('RESOURCE_ABUNDANCE') ? 1.2 : 1,
});

// One earned point per regression, including saves from before the skill tree.
export const normalizeSkillProgress = (data: { regressionCount?: unknown; unlockedSkills?: unknown }) => {
  const regressionCount = Number.isSafeInteger(data.regressionCount) && Number(data.regressionCount) >= 0 ? Number(data.regressionCount) : 0;
  const saved = Array.isArray(data.unlockedSkills) ? data.unlockedSkills : [];
  const unlockedSkills: SkillId[] = [];
  for (const id of Object.keys(SKILLS) as SkillId[]) {
    const prerequisite = SKILLS[id].prerequisite;
    if (saved.includes(id) && unlockedSkills.length < regressionCount && (!prerequisite || unlockedSkills.includes(prerequisite))) unlockedSkills.push(id);
  }
  return { regressionCount, unlockedSkills, skillPoints: regressionCount - unlockedSkills.length };
};
