import ACHIEVEMENTS_JSON from '../data/achievements.json';

export interface AchievementDef {
  id: string;
  /** Steamworks API name (Stats & Achievements). */
  steam: string;
  icon: string;
  color: string;
  /** Unlocked when this many waves have been cleared. */
  wave?: number;
  en: { title: string; desc: string };
  tl: { title: string; desc: string };
}

export const ACHIEVEMENTS: readonly AchievementDef[] = ACHIEVEMENTS_JSON.achievements;

export const achievementDef = (id: string): AchievementDef | undefined => ACHIEVEMENTS.find((a) => a.id === id);

/** Wave milestones reached at `wavesCleared`. */
export const waveAchievements = (wavesCleared: number): AchievementDef[] =>
  ACHIEVEMENTS.filter((a) => a.wave !== undefined && wavesCleared >= a.wave);

/** Desktop (Steam) build only: electron/preload.cjs exposes the bridge; the browser build skips it. */
export const unlockSteamAchievement = (id: string): void => {
  const def = achievementDef(id);
  const bridge = (globalThis as { isoDesktop?: { unlockAchievement?: (apiName: string) => Promise<boolean> } }).isoDesktop;
  if (!def || !bridge?.unlockAchievement) return;
  bridge.unlockAchievement(def.steam).catch(() => undefined);
};

/** Re-sends every unlocked achievement (Steam ignores repeats), e.g. for saves made before the Steam build. */
export const syncSteamAchievements = (ids: readonly string[]): void => {
  for (const id of ids) unlockSteamAchievement(id);
};
