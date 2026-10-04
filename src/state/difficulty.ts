export type Difficulty = 'EASY' | 'NORMAL' | 'HARD';

export interface DifficultyConfig {
  label: string;
  labelTl: string;
  icon: string;
  /** Enemy HP multiplier shown in the intro; mirrors waveBalance.json difficulty.hp (the curves live there) */
  enemyMultiplier: number;
  /** Multiplier on the new-realm starting stockpile (applied when the intro begins) */
  startingSupplies: number;
  /** Multiplier on the coin bounty for clearing a wave */
  bountyMultiplier: number;
  tagline: string;
  taglineTl: string;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  EASY: {
    label: 'Easy',
    labelTl: 'Madali',
    icon: '🌙',
    enemyMultiplier: 0.72,
    startingSupplies: 1.5,
    bountyMultiplier: 1,
    tagline: 'A gentle return. Learn the realm at your own pace.',
    taglineTl: 'Maluwag na pagbabalik. Pag-aralan ang kaharian nang dahan-dahan.',
  },
  NORMAL: {
    label: 'Normal',
    labelTl: 'Katamtaman',
    icon: '⚔️',
    enemyMultiplier: 1,
    startingSupplies: 1,
    bountyMultiplier: 1,
    tagline: 'The intended challenge. Plan your economy and defenses.',
    taglineTl: 'Ang tamang hamon. Planuhin ang ekonomiya at depensa.',
  },
  HARD: {
    label: 'Hard',
    labelTl: 'Mahirap',
    icon: '🔥',
    enemyMultiplier: 1.2,
    startingSupplies: 0.9,
    bountyMultiplier: 1.4,
    tagline: 'Tougher invaders and thin supplies, but richer bounties.',
    taglineTl: 'Mas malalakas na mananakop at kulang na supply, pero mas malaking gantimpala.',
  },
} as const;

export const normalizeDifficulty = (value: unknown): Difficulty =>
  value === 'EASY' || value === 'HARD' ? value : 'NORMAL';
