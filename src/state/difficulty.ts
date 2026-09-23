export type Difficulty = 'EASY' | 'NORMAL' | 'HARD';

export interface DifficultyConfig {
  label: string;
  labelTl: string;
  enemyMultiplier: number;
  description: string;
  descriptionTl: string;
  unitDownRules: {
    canBeRevivedBySlime: boolean; // EASY: Magiging incapacitated/downed lang at hindi makakagalaw hangga't hindi napa-heal ng slime
    permadeath: boolean;          // NORMAL & HARD: Mabubura/mamamatay na talaga
    resourceRefundRatio: number;  // 1.0 = 100% refund (NORMAL), 0.5 = 50% bawas / nawala ang 50% (HARD), 0 = walang refund
  };
}

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  EASY: {
    label: 'Easy',
    labelTl: 'Madali',
    enemyMultiplier: 0.7,
    description:
      'Enemies have 30% less health and damage. When a fighter falls, they become incapacitated and immobile until revived by an Aqua Slime.',
    descriptionTl:
      '30% mas mahina ang mga kalaban. Kapag naubusan ng buhay ang fighter, hindi na ito makakagalaw hangga\'t hindi pinapagaling ng Slime.',
    unitDownRules: {
      canBeRevivedBySlime: true,
      permadeath: false,
      resourceRefundRatio: 0,
    },
  },
  NORMAL: {
    label: 'Normal',
    labelTl: 'Katamtaman',
    enemyMultiplier: 1.0,
    description:
      'Standard enemy stats. Fallen fighters suffer permadeath, but 100% of their summon resources are refunded.',
    descriptionTl:
      'Karaniwang lakas ng kalaban. Kapag namatay ang fighter ay tuluyan itong mabubura, ngunit maibabalik ang 100% ng ginastos na yaman sa pag-summon.',
    unitDownRules: {
      canBeRevivedBySlime: false,
      permadeath: true,
      resourceRefundRatio: 1.0, // 100% refund ng summon cost
    },
  },
  HARD: {
    label: 'Hard',
    labelTl: 'Mahirap',
    enemyMultiplier: 1.4,
    description:
      'Enemies deal 40% more damage with 40% more health. Fallen fighters die permanently and lose 50% of their summon cost (only 50% refunded).',
    descriptionTl:
      '40% mas malakas ang mga kalaban. Tuluyang mabubura ang namatay na fighter at mawawala ang 50% ng ginastos na yaman (50% na lang ang maibabalik).',
    unitDownRules: {
      canBeRevivedBySlime: false,
      permadeath: true,
      resourceRefundRatio: 0.5, // 50% na lang ang babalik
    },
  },
} as const;

export const normalizeDifficulty = (value: unknown): Difficulty =>
  value === 'EASY' || value === 'HARD' ? value : 'NORMAL';

/**
 * Helper utility para sa battle logic kapag naging zero ang health ng isang unit:
 */
export const handleFighterDefeat = (
  difficulty: Difficulty,
  unitCost: { crystal: number; wood?: number; stone?: number }
) => {
  const rules = DIFFICULTIES[difficulty].unitDownRules;

  if (rules.canBeRevivedBySlime) {
    return {
      status: 'INCAPACITATED' as const, // Hindi mamamatay, pero hindi makakagalaw (speed = 0)
      refund: { crystal: 0, wood: 0, stone: 0 },
    };
  }

  // Permadeath sa Normal at Hard:
  return {
    status: 'DEAD' as const, // Burahin ang unit sa game loop / canvas
    refund: {
      crystal: Math.floor((unitCost.crystal || 0) * rules.resourceRefundRatio),
      wood: Math.floor((unitCost.wood || 0) * rules.resourceRefundRatio),
      stone: Math.floor((unitCost.stone || 0) * rules.resourceRefundRatio),
    },
  };
};