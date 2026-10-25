import { clampMusicIndex, MAX_MUSIC_ENTRIES, MAX_MUSIC_NAME, musicLink, normalizeMusicLibrary, parseMusicLink } from '../externalMusic';
import { soundFx } from '../../game/audio/soundFx';
import { canAfford, subtractCost } from '../resources';
import { teamBonuses } from '../skillTree';
import { GOD_BLESSINGS } from '../../types/game';
import type { GodBlessingId } from '../../types/game';
import type {
  ActiveLocation,
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
import { logMessage } from '../activityLog';
import LAIR from '../../data/dragonsLair.json';
import { CHECKPOINTS, CLEARABLE, LAIR_OBSTACLES, MATRIARCH, REWARDS, dragonRewards, freshLairProgress, lairPartyOf, stripExpeditionPower } from '../lairExpedition';
import { rollRuneKind } from '../runes';
import { saveNow } from '../storageAdapter';

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

  travelTo: (location: ActiveLocation) => {
    if (get().activeLocation === location) return;
    // Demon Realm time is paused while away: restarting the save clock on return keeps
    // offline progression from paying out the expedition as idle time
    set({ activeLocation: location, lastSavedTimestamp: Date.now() });
  },

  enterLair: () => {
    const s = get();
    if (s.activeLocation === 'DRAGONS_LAIR') return true;
    if (!s.lairOpen) { logMessage('lairSealed', { every: LAIR.cave.everyWaves }); return false; }
    if (s.invasion.isActive) { logMessage('lairWaitWave'); return false; }
    const party = lairPartyOf(s.roster);
    if (party.length === 0) { logMessage('lairNoParty'); return false; }
    // Entry strips every participant's brawl + for good; blessings and QWERTY powers don't reach the lair
    const stripped = party.filter((u) => (u.brawlLevel ?? 0) > 0 || (u.brawlAttack ?? 0) > 0 || (u.brawlHp ?? 0) > 0).length;
    set({ roster: stripExpeditionPower(s.roster) });
    logMessage('lairEntered', { count: party.length });
    if (stripped > 0) logMessage('lairPowerStripped', { count: stripped });
    get().travelTo('DRAGONS_LAIR');
    return true;
  },

  leaveLair: () => {
    if (get().activeLocation !== 'DRAGONS_LAIR') return;
    // Quitting the raid seals the cave until the next 5th wave
    set({ lairOpen: false, lairProgress: freshLairProgress() });
    logMessage('lairClosed', { every: LAIR.cave.everyWaves });
    get().travelTo('DEMON_REALM');
  },

  reachLairCheckpoint: (index: number) => {
    const prev = get().lairProgress;
    if (index <= prev.checkpoint || index >= CHECKPOINTS.length) return;
    set({ lairProgress: { ...prev, checkpoint: index } });
    const region = LAIR.regions[index];
    logMessage('lairCheckpoint', { region: region.name });
  },

  clearLairObstacle: (id: string) => {
    const prev = get().lairProgress;
    if (!CLEARABLE.has(id) || prev.cleared.includes(id)) return;
    set({ lairProgress: { ...prev, cleared: [...prev.cleared, id] } });
    const o = LAIR_OBSTACLES.find((x) => x.id === id);
    if (o) logMessage(o.type === 'GATE' ? 'lairGateBroken' : 'lairBridgeRepaired', { name: o.name });
  },

  sizeDragon: (maxHp: number) => {
    const d = get().dragon;
    if (d.maxHp > 0 || d.slain || !(maxHp > 0)) return;
    set({ dragon: { ...d, maxHp: Math.round(maxHp), hp: Math.round(maxHp) } });
  },

  damageDragon: (amount: number) => {
    const d = get().dragon;
    if (d.slain || d.maxHp <= 0 || !(amount > 0)) return d.hp;
    const hp = Math.max(0, d.hp - amount);
    set({ dragon: { ...d, hp } });
    return hp;
  },

  slayDragon: (fullCredit: boolean, stars = 1) => {
    const s = get();
    if (s.dragon.slain || s.dragon.maxHp <= 0) return {};
    const reward = dragonRewards(s.dragon.generation, fullCredit, stars);
    s.addResources(reward);
    const rune = s.grantRune(rollRuneKind(), REWARDS.runeTier);
    set((prev) => ({
      dragon: { ...prev.dragon, hp: 0, slain: true },
      dragonsSlain: prev.dragonsSlain + 1,
      dragonBestStars: Math.max(prev.dragonBestStars, stars),
      dragonStarsTotal: prev.dragonStarsTotal + stars,
      lairOpen: false,
      lairProgress: freshLairProgress(),
      lastSavedTimestamp: Date.now(),
    }));
    logMessage('dragonSlain', { name: MATRIARCH.name, coins: reward.coins ?? 0, count: get().dragonsSlain });
    logMessage('dragonStars', { stars: '★'.repeat(stars) + '☆'.repeat(5 - stars) });
    if (!fullCredit) logMessage('dragonHalfCredit');
    if (rune) logMessage('dragonRune', { tier: rune.tier });
    logMessage('magmaStilled');
    get().unlockAchievement('dragon_slayer', 'Dragonslayer', 'Slew Ignara, the Ember Matriarch, in her lair.', '🐉');
    void saveNow();
    return reward;
  },

  returnFromLair: () => {
    if (get().activeLocation === 'DRAGONS_LAIR') get().travelTo('DEMON_REALM');
  },

  setLanguage: (lang: Language) => {
    set({ language: lang, lastSavedTimestamp: Date.now() });
  },

  addMusicLink: (raw: string, name = '') => {
    const src = parseMusicLink(raw);
    if (!src) return false;
    const link = musicLink(src);
    const library = get().musicLibrary;
    const existing = library.findIndex((e) => e.link === link);
    if (existing >= 0) return true;
    if (library.length >= MAX_MUSIC_ENTRIES) return false;
    // Appended without switching entries: whatever is playing keeps playing
    const next = [...library, { link, name: name.trim().slice(0, MAX_MUSIC_NAME) }];
    set({ musicLibrary: next });
    return true;
  },

  importMusicLibrary: (entries: readonly { link: string; name: string }[]) => {
    const { musicLibrary, musicIndex } = get();
    const merged = normalizeMusicLibrary([...musicLibrary, ...entries]);
    const added = merged.length - musicLibrary.length;
    if (added > 0) set({ musicLibrary: merged, musicIndex: clampMusicIndex(musicIndex, merged) });
    return added;
  },

  setMusicAutoPlay: (on: boolean) => set({ musicAutoPlay: on }),
  setMusicLoop: (on: boolean) => set({ musicLoop: on }),

  removeMusicLink: (index: number) => {
    const { musicLibrary, musicIndex } = get();
    if (index < 0 || index >= musicLibrary.length) return;
    const next = musicLibrary.filter((_, i) => i !== index);
    const current = index < musicIndex ? musicIndex - 1 : musicIndex;
    set({ musicLibrary: next, musicIndex: clampMusicIndex(current, next) });
  },

  removeMusicLinks: (indices: number[]) => {
    const { musicLibrary, musicIndex } = get();
    const drop = new Set(indices.filter((i) => i >= 0 && i < musicLibrary.length));
    if (!drop.size) return;
    const next = musicLibrary.filter((_, i) => !drop.has(i));
    // Keep the current track if it survives; otherwise land on whatever slid into its place
    const current = musicIndex - [...drop].filter((i) => i < musicIndex).length;
    set({ musicLibrary: next, musicIndex: clampMusicIndex(current, next) });
  },

  moveMusicLink: (from: number, to: number) => {
    const { musicLibrary, musicIndex } = get();
    if (from === to || from < 0 || to < 0 || from >= musicLibrary.length || to >= musicLibrary.length) return;
    const next = [...musicLibrary];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    // The playing track stays the same entry wherever it ends up
    let current = musicIndex;
    if (musicIndex === from) current = to;
    else if (from < musicIndex && to >= musicIndex) current = musicIndex - 1;
    else if (from > musicIndex && to <= musicIndex) current = musicIndex + 1;
    set({ musicLibrary: next, musicIndex: current });
  },

  selectMusic: (index: number) => {
    const count = get().musicLibrary.length;
    if (!count) return;
    set({ musicIndex: ((index % count) + count) % count });
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
    set({ weather, lastSavedTimestamp: Date.now() });
  },

  setRandomWeatherEnabled: (enabled: boolean) => {
    set({ randomWeatherEnabled: enabled, lastSavedTimestamp: Date.now() });
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
      const random = state.randomWeatherEnabled !== false;
      const nextWeather = random ? (state.weatherForecast ?? rollWeather(season)) : state.weather;
      // Roll tomorrow now so the HUD can show what is coming
      const weatherForecast = random ? rollWeather(getSeasonFromDay(day >= 365 ? 1 : day + 1)) : undefined;
      return { day, year, season, weather: nextWeather, weatherForecast, lastSavedTimestamp: Date.now() };
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

  toggleWallpaper: () => {
    const showWallpaper = !get().showWallpaper;
    set({ showWallpaper });
    return showWallpaper;
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
