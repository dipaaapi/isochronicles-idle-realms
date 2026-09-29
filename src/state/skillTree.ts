import config from '../data/skillTree.json';
import economy from '../data/economy.json';

/**
 * Skill tree: ranked skills bought with points earned by clearing wave sets
 * (every `wavesPerSet` waves). Skills belong to the current realm — Regression
 * refunds them — while Regression tiers add permanent team boosts on top.
 * Text and numbers live in src/data/skillTree.json.
 */

export type Localized = { en: string; tl: string };
export type SkillBranch = keyof typeof config.branches;
export type SkillId = keyof typeof config.skills;
export type TeamStat = keyof typeof config.stats;
export type SkillRanks = Partial<Record<SkillId, number>>;

export interface SkillDef {
  branch: SkillBranch;
  icon: string;
  maxRank: number;
  stat: TeamStat;
  perRank: number;
  requires: SkillId | null;
  name: Localized;
  desc: Localized;
}

export interface StatDef {
  sign: '+' | '-';
  cap?: number;
  name: Localized;
}

export const SKILL_CONFIG = config;
export const SKILL_TEXT = config.text;
export const REGRESSION_TEXT = config.regressionText;
export const REGRESSION_BOOST_PER_TIER = config.regressionBoostPerTier as Partial<Record<TeamStat, number>>;
export const SKILLS = config.skills as unknown as Record<SkillId, SkillDef>;
export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];
export const SKILL_BRANCHES = config.branches as Record<SkillBranch, { icon: string; color: string; name: Localized }>;
export const TEAM_STATS = config.stats as unknown as Record<TeamStat, StatDef>;

export const WAVES_PER_SET = config.wavesPerSet;
export const POINTS_PER_SET = config.pointsPerSet;
const MAX_WAVE = economy.invasion.maxWave;

/** Skills of a branch in unlock order (each requires the one before it). */
export const branchSkills = (branch: SkillBranch): SkillId[] => {
  const ids = SKILL_IDS.filter((id) => SKILLS[id].branch === branch);
  const ordered: SkillId[] = [];
  let next = ids.find((id) => !SKILLS[id].requires);
  while (next) {
    ordered.push(next);
    const current: SkillId = next;
    next = ids.find((id) => SKILLS[id].requires === current);
  }
  return ordered;
};

export const rankOf = (ranks: SkillRanks | undefined, id: SkillId): number => ranks?.[id] ?? 0;

export const spentPoints = (ranks: SkillRanks | undefined): number =>
  SKILL_IDS.reduce((sum, id) => sum + rankOf(ranks, id), 0);

/** Points earned from the waves cleared in this realm. */
export const earnedSkillPoints = (wavesCleared: number): number =>
  Math.floor(Math.min(Math.max(0, wavesCleared), MAX_WAVE) / WAVES_PER_SET) * POINTS_PER_SET;

export const availableSkillPoints = (wavesCleared: number, ranks: SkillRanks | undefined): number =>
  Math.max(0, earnedSkillPoints(wavesCleared) - spentPoints(ranks));

/** Wave number whose clear grants the next batch of points (null once all are earned). */
export const nextRewardWave = (wavesCleared: number): number | null => {
  const next = (Math.floor(Math.max(0, wavesCleared) / WAVES_PER_SET) + 1) * WAVES_PER_SET;
  return next > MAX_WAVE ? null : next;
};

export const canLearn = (id: SkillId, ranks: SkillRanks | undefined, points: number): boolean => {
  const skill = SKILLS[id];
  if (!skill || points < 1 || rankOf(ranks, id) >= skill.maxRank) return false;
  return !skill.requires || rankOf(ranks, skill.requires) > 0;
};

/** Raw summed bonus per stat from skill ranks and regression tiers. */
export const teamStatTotals = (ranks: SkillRanks | undefined, regressionCount = 0): Record<TeamStat, number> => {
  const totals = Object.fromEntries(Object.keys(TEAM_STATS).map((k) => [k, 0])) as Record<TeamStat, number>;
  for (const id of SKILL_IDS) totals[SKILLS[id].stat] += rankOf(ranks, id) * SKILLS[id].perRank;
  const tiers = Math.max(0, regressionCount || 0);
  for (const [stat, per] of Object.entries(REGRESSION_BOOST_PER_TIER) as Array<[TeamStat, number]>) totals[stat] += tiers * per;
  for (const stat of Object.keys(totals) as TeamStat[]) {
    const cap = TEAM_STATS[stat].cap;
    if (cap !== undefined) totals[stat] = Math.min(cap, totals[stat]);
  }
  return totals;
};

/** Multipliers the game applies. Everything here helps the Demon Lord's side only. */
export const teamBonuses = (state: { skillRanks?: SkillRanks; regressionCount?: number } = {}) => {
  const t = teamStatTotals(state.skillRanks, state.regressionCount);
  return {
    attack: 1 + t.minionAttack,
    speed: 1 + t.minionSpeed,
    minionDamageTaken: 1 - t.minionDefense,
    castleDamage: 1 - t.castleArmor,
    turret: 1 + t.towerDamage,
    towerCooldown: 1 - t.towerRate,
    waveRepair: t.waveRepair,
    foundations: 1 + t.foundations,
    harvest: 1 + t.harvest,
    bounty: 1 + t.bounty,
    blessingDuration: 1 + t.blessingDuration,
    blessingCost: 1 - t.blessingCost,
  };
};

/**
 * Validates saved ranks against the waves cleared this realm. Old saves
 * (`unlockedSkills` list from the regression-point tree) are refunded.
 */
export const normalizeSkillProgress = (data: {
  regressionCount?: unknown;
  skillRanks?: unknown;
  invasion?: { invasionsRepelled?: unknown };
}) => {
  const regressionCount = Number.isSafeInteger(data.regressionCount) && Number(data.regressionCount) >= 0 ? Number(data.regressionCount) : 0;
  const wavesCleared = Number(data.invasion?.invasionsRepelled) || 0;
  const saved = (data.skillRanks && typeof data.skillRanks === 'object' ? data.skillRanks : {}) as Record<string, unknown>;
  let skillRanks: SkillRanks = {};
  for (const id of SKILL_IDS) {
    const rank = Math.floor(Number(saved[id]) || 0);
    if (rank <= 0) continue;
    const req = SKILLS[id].requires;
    if (req && !skillRanks[req]) continue;
    skillRanks[id] = Math.min(rank, SKILLS[id].maxRank);
  }
  if (spentPoints(skillRanks) > earnedSkillPoints(wavesCleared)) skillRanks = {};
  return { regressionCount, skillRanks, skillPoints: availableSkillPoints(wavesCleared, skillRanks) };
};

/** Formats a stat total, e.g. "+16%" or "-12%". */
export const formatStat = (stat: TeamStat, value: number): string =>
  `${TEAM_STATS[stat].sign}${Math.round(value * 100)}%`;

/** Replaces {key} placeholders in a localized string. */
export const fillText = (text: string, vars: Record<string, string | number>): string =>
  text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
