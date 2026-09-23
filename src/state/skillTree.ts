export const SKILLS = {
  // West branch — Minions (offense & mobility)
  MINION_MIGHT: {
    branch: 'Minions',
    direction: 'west',
    tier: 1,
    name: 'Demon Might',
    description: '+20% minion attack damage.',
    prerequisite: null,
  },
  MINION_HASTE: {
    branch: 'Minions',
    direction: 'west',
    tier: 2,
    name: 'Swift Servants',
    description: '+15% minion movement speed.',
    prerequisite: 'MINION_MIGHT',
  },
  MINION_FEROCITY: {
    branch: 'Minions',
    direction: 'west',
    tier: 3,
    name: 'Overwhelming Force',
    description: '+12.5% additional minion attack damage, stacking with Demon Might.',
    prerequisite: 'MINION_HASTE',
  },

  // North branch — Castle (defense)
  CASTLE_ARMOR: {
    branch: 'Castle',
    direction: 'north',
    tier: 1,
    name: 'Obsidian Walls',
    description: 'Castle takes 10% less damage, before shields.',
    prerequisite: null,
  },
  CASTLE_TURRETS: {
    branch: 'Castle',
    direction: 'north',
    tier: 2,
    name: 'Arcane Artillery',
    description: '+25% automated turret damage.',
    prerequisite: 'CASTLE_ARMOR',
  },
  CASTLE_BASTION: {
    branch: 'Castle',
    direction: 'north',
    tier: 3,
    name: 'Aegis Bastion',
    description: 'Castle shield regenerates 50% faster.',
    prerequisite: 'CASTLE_TURRETS',
  },

  // East branch — Resources (economy)
  RESOURCE_GROVES: {
    branch: 'Resources',
    direction: 'east',
    tier: 1,
    name: 'Rich Foundations',
    description: '+25% wood and stone harvested from buildings.',
    prerequisite: null,
  },
  RESOURCE_ABUNDANCE: {
    branch: 'Resources',
    direction: 'east',
    tier: 2,
    name: 'Realm Abundance',
    description: '+20% to all harvested resources. Stacks with Rich Foundations.',
    prerequisite: 'RESOURCE_GROVES',
  },

  // South branch — Mystic (new: god blessing utility)
  MYSTIC_FOCUS: {
    branch: 'Mystic',
    direction: 'south',
    tier: 1,
    name: 'Arcane Attunement',
    description: '+20% longer God Blessing duration.',
    prerequisite: null,
  },
  MYSTIC_SURGE: {
    branch: 'Mystic',
    direction: 'south',
    tier: 2,
    name: 'Ley Line Surge',
    description: '-20% resource cost for God Blessings.',
    prerequisite: 'MYSTIC_FOCUS',
  },
} as const;

export type SkillId = keyof typeof SKILLS;

export const skillBonuses = (unlocked: readonly SkillId[] = []) => ({
  attack:
    (unlocked.includes('MINION_MIGHT') ? 1.2 : 1) *
    (unlocked.includes('MINION_FEROCITY') ? 1.125 : 1),
  speed: unlocked.includes('MINION_HASTE') ? 1.15 : 1,
  castleDamage: unlocked.includes('CASTLE_ARMOR') ? 0.9 : 1,
  turret: unlocked.includes('CASTLE_TURRETS') ? 1.25 : 1,
  shieldRegen: unlocked.includes('CASTLE_BASTION') ? 1.5 : 1,
  foundations: unlocked.includes('RESOURCE_GROVES') ? 1.25 : 1,
  harvest: unlocked.includes('RESOURCE_ABUNDANCE') ? 1.2 : 1,
  blessingDuration: unlocked.includes('MYSTIC_FOCUS') ? 1.2 : 1,
  blessingCost: unlocked.includes('MYSTIC_SURGE') ? 0.8 : 1,
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