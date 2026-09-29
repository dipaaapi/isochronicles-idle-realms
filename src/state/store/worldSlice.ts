import { soundFx } from '../../game/audio/soundFx';
import { canAfford, subtractCost } from '../resources';
import { teamBonuses } from '../skillTree';
import { GOD_BLESSINGS } from '../../types/game';
import type { GodBlessingId } from '../../types/game';
import type {
  AutoSettings,
  GameSpeed,
  GameStoreState,
  Language,
  ScreenState,
  Season,
  TimeOfDayPhase,
  WeatherType,
} from '../../types/state';
import type { SliceArgs } from './types';

export const TARGET_FPS_STORAGE_KEY = 'isochronicle_target_fps';

export const getSeasonFromDay = (day: number): Season => {
  const dayInYear = ((day - 1) % 365) + 1;
  if (dayInYear <= 91) return 'SPRING';
  if (dayInYear <= 182) return 'SUMMER';
  if (dayInYear <= 273) return 'AUTUMN';
  return 'WINTER';
};

/** Season-weighted weather roll: [weather, cumulative probability] pairs. */
const WEATHER_ODDS: Record<Season, Array<[WeatherType, number]>> = {
  WINTER: [['SNOW', 0.55], ['CLEAR', 0.85], ['RAIN', 1]],
  SUMMER: [['HEATWAVE', 0.5], ['CLEAR', 0.85], ['RAIN', 1]],
  AUTUMN: [['RAIN', 0.5], ['CLEAR', 0.85], ['HEATWAVE', 1]],
  SPRING: [['CLEAR', 0.6], ['RAIN', 0.9], ['HEATWAVE', 1]],
};

const rollWeather = (season: Season): WeatherType => {
  const rand = Math.random();
  return WEATHER_ODDS[season].find(([, upTo]) => rand < upTo)?.[0] ?? 'CLEAR';
};

/** Navigation, the day/season/weather clock, god blessings and player settings. */
export const createWorldSlice = (...[set, get]: SliceArgs) => ({
  setScreen: (screen: ScreenState) => {
    set({ screen, lastSavedTimestamp: Date.now() });
  },

  setLanguage: (lang: Language) => {
    set({ language: lang, lastSavedTimestamp: Date.now() });
  },

  completeIntro: () => {
    set({ hasCompletedIntro: true, screen: 'GAME', lastSavedTimestamp: Date.now() });
  },

  setTimeOfDay: (phase: TimeOfDayPhase, darkness?: number) => {
    set((state) => ({
      timeOfDay: phase,
      ambientDarkness: darkness !== undefined ? darkness : state.ambientDarkness,
    }));
  },

  setWeather: (weather: WeatherType) => {
    set({ weather });
  },

  setDayProgress: (progress: number) => {
    set({ dayProgress: progress });
  },

  incrementDay: () => {
    set((state) => {
      // Day cycle 1 to 365 days
      let day = (state.day || 1) + 1;
      let year = state.year || 1;
      if (day > 365) {
        day = 1;
        year += 1;
      }
      const season = getSeasonFromDay(day);
      return { day, year, season, weather: rollWeather(season), lastSavedTimestamp: Date.now() };
    });
  },

  activateGodBlessing: (blessingId: GodBlessingId): boolean => {
    const cfg = GOD_BLESSINGS[blessingId];
    if (!cfg) return false;
    const skills = teamBonuses(get());
    // Mystic skills: cheaper and longer blessings
    const cost = Object.fromEntries(
      Object.entries(cfg.costResources).map(([key, amount]) => [key, Math.ceil(Number(amount) * skills.blessingCost)])
    ) as typeof cfg.costResources;
    if (!canAfford(get().resources, cost)) return false;

    set((prev) => ({
      resources: subtractCost(prev.resources, cost),
      activeGodBlessings: { ...prev.activeGodBlessings, [blessingId]: cfg.durationSeconds * skills.blessingDuration },
      lastSavedTimestamp: Date.now(),
    }));
    soundFx.playFanfare();
    return true;
  },

  tickGodBlessings: (deltaSeconds: number) => {
    set((prev) => {
      let changed = false;
      const nextBlessings = { ...prev.activeGodBlessings };
      for (const key of Object.keys(nextBlessings) as GodBlessingId[]) {
        if (nextBlessings[key] > 0) {
          nextBlessings[key] = Math.max(0, nextBlessings[key] - deltaSeconds);
          changed = true;
        }
      }
      return changed ? { activeGodBlessings: nextBlessings } : prev;
    });
  },

  // ── Settings ──────────────────────────────────────────────────────────────
  toggleAudioMute: () => {
    const isAudioMuted = soundFx.toggleMute();
    set({ isAudioMuted });
    return isAudioMuted;
  },

  toggleGore: () => {
    const isGoreEnabled = !get().isGoreEnabled;
    set({ isGoreEnabled });
    return isGoreEnabled;
  },

  toggleAutoSetting: (key: keyof AutoSettings) => {
    set((prev) => ({ autoSettings: { ...prev.autoSettings, [key]: !prev.autoSettings[key] } }));
    soundFx.playClick();
  },

  setPromptedUpgrade: (key: string, level: number) => {
    set((prev) => ({
      promptedUpgrades: { ...prev.promptedUpgrades, [key]: Math.max(prev.promptedUpgrades[key] || 0, level) },
    }));
  },

  setTargetFps: (fps: 30 | 60 | 90) => {
    localStorage.setItem(TARGET_FPS_STORAGE_KEY, String(fps));
    set({ targetFps: fps, lastSavedTimestamp: Date.now() });
  },

  setMeasuredFps: (fps: number) => {
    // Lightweight update — no persist timestamp to avoid save churn
    set({ measuredFps: fps });
  },

  toggleFpsDebug: () => {
    set((state) => ({ showFpsDebug: !state.showFpsDebug }));
  },

  toggleTileCoordinates: () => {
    set((state) => ({ showTileCoordinates: !state.showTileCoordinates }));
  },

  setGameSpeed: (speed: GameSpeed) => {
    set({ gameSpeed: speed });
  },

  togglePause: () => {
    set((state) => ({ gameSpeed: state.gameSpeed === 0 ? 1 : 0 }));
  },

  toggleFastSpeed: (speed: 2 | 3) => {
    set((state) => ({ gameSpeed: state.gameSpeed === speed ? 1 : speed }));
  },
}) satisfies Partial<GameStoreState>;
