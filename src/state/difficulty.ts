export type Difficulty = 'EASY' | 'NORMAL' | 'HARD';

export const DIFFICULTIES = {
  EASY: { label: 'Easy', enemyMultiplier: 0.7, description: 'Enemies have 30% less health and damage.' },
  NORMAL: { label: 'Normal', enemyMultiplier: 1, description: 'Standard enemy health and damage.' },
  HARD: { label: 'Hard', enemyMultiplier: 1.4, description: 'Enemies have 40% more health and damage.' },
} as const;

export const normalizeDifficulty = (value: unknown): Difficulty =>
  value === 'EASY' || value === 'HARD' ? value : 'NORMAL';
