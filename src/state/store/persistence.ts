import { isGeneralOrder } from '../generalOrders';
import { isFallenRunSync } from '../legacy';
import type { PersistOptions } from 'zustand/middleware';
import { BUILDING_IDS, GRID_SIZE, isCoastStyle } from '../buildingLayout';
import { normalizeDifficulty } from '../difficulty';
import { beaconLevelOf } from '../defenseStats';
import { normalizeSkillProgress } from '../skillTree';
import { brawlLevelOf } from '../brawl';
import { normalizeRunes } from '../runes';
import { clampContamination } from '../seaFolk';
import { WILD_FACTIONS, clampMeter } from '../wildFactions';
import { sanitizeSavePayload, isPlainRecord } from '../saveValidation';
import { TASK_CONFIG } from '../../data/tasks';
import { achievementDef } from '../achievements';
import { WAVE_TACTICS } from '../waveTactics';
import { normalizeLairProgress } from '../lairExpedition';

const KEY_RE = /^\d{1,2},\d{1,2}$/;
const MAX_SAFE_VALUE = Number.MAX_SAFE_INTEGER;
const MAX_ROSTER_LENGTH = 128;
const MAX_TERRAIN_TILES = GRID_SIZE * GRID_SIZE;

const finite = (value: unknown, fallback = 0, min = 0, max = MAX_SAFE_VALUE): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

const integer = (value: unknown, fallback = 0, min = 0, max = MAX_SAFE_VALUE): number =>
  Math.floor(finite(value, fallback, min, max));

const text = (value: unknown, fallback: string, maxLength: number): string =>
  typeof value === 'string' ? value.slice(0, maxLength) : fallback;

const validTileKey = (key: string): boolean => {
  if (!KEY_RE.test(key)) return false;
  const [x, y] = key.split(',').map(Number);
  return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE;
};

/** Copies only keys present in a trusted defaults object and enforces their primitive types. */
const sanitizeShape = <T extends Record<string, unknown>>(defaults: T, raw: unknown): T => {
  if (!isPlainRecord(raw)) return { ...defaults };
  const result: Record<string, unknown> = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = raw[key];
    if (typeof fallback === 'boolean') result[key] = typeof value === 'boolean' ? value : fallback;
    else if (typeof fallback === 'number') result[key] = finite(value, fallback);
    else if (typeof fallback === 'string') result[key] = typeof value === 'string' ? value.slice(0, 128) : fallback;
    else result[key] = fallback;
  }
  return result as T;
};
/** Brood meter / truce and the living terrain from a save (tile keys validated). */
const normalizeTerrain = (data: { broodUnrest?: unknown; broodTruceWaves?: unknown; terrainFlooded?: unknown; terrainFlooding?: unknown; terrainSand?: unknown; terrainRaised?: unknown; terrainFilled?: unknown; terrainReclamation?: unknown; terrainReclaimed?: unknown }) => {
  const keys = (v: unknown) => (Array.isArray(v)
    ? Array.from(new Set(v.filter((k): k is string => typeof k === 'string' && validTileKey(k)))).slice(0, MAX_TERRAIN_TILES)
    : []);
  const days = (v: unknown) => {
    const out: Record<string, number> = {};
    if (isPlainRecord(v)) for (const [k, d] of Object.entries(v).slice(0, MAX_TERRAIN_TILES)) {
      if (validTileKey(k) && typeof d === 'number' && Number.isFinite(d)) out[k] = integer(d, 1, 1, 365);
    }
    return out;
  };
  const sand = days(data.terrainSand);
  const rawJob = isPlainRecord(data.terrainReclamation) ? data.terrainReclamation : null;
  const terrainReclamation = rawJob
    && typeof rawJob.source === 'string' && validTileKey(rawJob.source)
    && typeof rawJob.target === 'string' && validTileKey(rawJob.target)
    ? {
        source: rawJob.source,
        target: rawJob.target,
        progress: finite(rawJob.progress, 0, 0, 100000),
        requiredWork: finite(rawJob.requiredWork, 90, 1, 100000),
      }
    : null;
  return {
    broodUnrest: clampMeter(WILD_FACTIONS.BROOD, Number(data.broodUnrest ?? 0)),
    broodTruceWaves: Math.max(0, Math.floor(Number(data.broodTruceWaves ?? 0)) || 0),
    terrainFlooded: keys(data.terrainFlooded),
    terrainFlooding: keys(data.terrainFlooding),
    terrainSand: sand,
    terrainRaised: days(data.terrainRaised),
    terrainFilled: keys(data.terrainFilled),
    terrainReclamation,
    terrainReclaimed: keys(data.terrainReclaimed),
  };
};
import { RESOURCE_KEYS } from '../resources';
import { SAVE_KEY, createThrottledStorage } from '../storageAdapter';
import { clampMusicIndex, hasStoredMusicPrefs, normalizeMusicLibrary } from '../externalMusic';
import { getPhaseFromWave } from './defenseSlice';
import { normalizeResourceBuildings, normalizeSpireTower } from './buildingsSlice';
import {
  INITIAL_AUTO_BUY_BUILDING,
  INITIAL_AUTO_SETTINGS,
  INITIAL_DEFENSE,
  INITIAL_INVASION,
  INITIAL_UPGRADES,
  createInitialResourceNodes,
  applyRealmLayout,
  createSupportSlime,
  perBuilding,
} from './initialState';
import type { GameStoreState, PlatformPhase, ResourceBuildingId, Resources, UnitRosterItem } from '../../types/state';
import { INVADER_CONFIGS, UNIT_CLASSES } from '../../types/game';
import type { InvaderType, UnitClass } from '../../types/game';
import type { SliceArgs } from './types';

/** A saved realm pick (1-4), or null when the save follows the waves / holds junk. */
const validRealm = (v: unknown): PlatformPhase | null => (v === 1 || v === 2 || v === 3 || v === 4 ? v : null);

const SAVE_VERSION = '1.3.0';

/** Beast classes renamed by the 10 vs 10 codex (old save key → new key). */
const RENAMED_BEASTS: Record<string, UnitClass> = { WAYFARER: 'LAVA_GARGOYLE', CHRONO: 'SUCCUBUS' };

const migrateBeast = (id: string): string => RENAMED_BEASTS[id] ?? id;

/** Old saves: renamed beasts get their new class; unknown classes and roster tenants are dropped. */
const migrateRoster = (rawRoster: unknown): UnitRosterItem[] => {
  if (!Array.isArray(rawRoster)) return [];
  const seen = new Set<string>();
  return rawRoster
    .slice(0, MAX_ROSTER_LENGTH)
    .filter(isPlainRecord)
    .map((raw): UnitRosterItem | null => {
      const unitClass = migrateBeast(typeof raw.unitClass === 'string' ? raw.unitClass : '') as UnitClass;
      if (!(unitClass in UNIT_CLASSES)) return null;
      const id = text(raw.id, '', 96);
      if (!id || seen.has(id)) return null;
      seen.add(id);
      const assignedTask = typeof raw.assignedTask === 'string' && raw.assignedTask in TASK_CONFIG
        ? raw.assignedTask as UnitRosterItem['assignedTask']
        : UNIT_CLASSES[unitClass].preferredTask;
      const unit: UnitRosterItem = {
        id,
        name: text(raw.name, UNIT_CLASSES[unitClass].nameEn ?? UNIT_CLASSES[unitClass].name ?? unitClass, 64),
        unitClass,
        assignedTask,
        hp: integer(raw.hp, 100, 0),
        maxHp: integer(raw.maxHp, 100, 1),
      };
      if (typeof raw.parentBuildingId === 'string' && BUILDING_IDS.includes(raw.parentBuildingId as ResourceBuildingId)) {
        unit.parentBuildingId = raw.parentBuildingId as ResourceBuildingId;
      }
      if (unitClass === 'AQUA_SLIME') unit.slimeEvolutionLevel = integer(raw.slimeEvolutionLevel, 1, 1, 5);
      if (unitClass === 'TREANT') unit.treantEvolutionLevel = integer(raw.treantEvolutionLevel, 1, 1, 5);
      unit.brawlLevel = integer(raw.brawlLevel, 0, 0, 10);
      unit.brawlAttack = integer(raw.brawlAttack, 0);
      unit.brawlHp = integer(raw.brawlHp, 0);
      if (isGeneralOrder(raw.order)) unit.order = raw.order;
      return unit;
    })
    .filter((unit): unit is UnitRosterItem => unit !== null)
    // Tenants now live only in the world (DefenderSystem spawns five per establishment), never in the roster
    .filter((unit) => !unit.parentBuildingId && !unit.id.startsWith('tenant_'))
    // Gear was replaced by brawls: drop old equipment and the HP its armour added
    .map((unit) => {
      const { equipment, ...rest } = unit as UnitRosterItem & { equipment?: { armor?: { stats?: { bonusHp?: number } } } };
      const bonusHp = equipment?.armor?.stats?.bonusHp ?? 0;
      if (!bonusHp) return rest;
      const maxHp = Math.max(1, (rest.maxHp || 100) - bonusHp);
      return { ...rest, maxHp, hp: Math.min(rest.hp ?? maxHp, maxHp) };
    })
    // Brawl levels from a save stay within +0 … +10 with non-negative bonuses
    .map((unit) => ({
      ...unit,
      brawlLevel: brawlLevelOf(unit),
      brawlAttack: Math.max(0, Math.round(Number(unit.brawlAttack) || 0)),
      brawlHp: Math.max(0, Math.round(Number(unit.brawlHp) || 0)),
      order: isGeneralOrder(unit.order) ? unit.order : undefined,
    }));
};

/** Brawl tension from a save: only well-formed { count, x, y } entries. */
const normalizeTension = (raw: unknown): GameStoreState['brawlTension'] => {
  const out: GameStoreState['brawlTension'] = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, t] of Object.entries(raw as Record<string, any>)) {
    if (t && Number.isFinite(t.count) && Number.isFinite(t.x) && Number.isFinite(t.y) && key.includes('|')) {
      out[key] = { count: Math.max(0, Math.floor(t.count)), x: t.x, y: t.y };
    }
  }
  return out;
};

/** Codex discoveries limited to entries that still exist (the Deep One left the invaders). */
const migrateDiscovered = <K extends string>(list: unknown, known: Record<K, unknown>, fallback: K[]): K[] =>
  Array.isArray(list)
    ? Array.from(new Set(list.map((id) => migrateBeast(String(id))).filter((id): id is K => id in known)))
    : fallback;

/** Keeps exactly one permanent Support Slime (last in the roster), preserving its evolution. */
const withPermanentSlime = (rawRoster: unknown): UnitRosterItem[] => {
  const roster = migrateRoster(rawRoster);
  const slime = roster.find((unit) => unit.unitClass === 'AQUA_SLIME');
  return [
    ...roster.filter((unit) => unit.unitClass !== 'AQUA_SLIME'),
    createSupportSlime(slime?.slimeEvolutionLevel),
  ];
};

/**
 * Switches to a saved realm's layout. Saves from before random layouts have no
 * seed and keep the one already rolled. Node positions follow the layout;
 * Ent enrichment levels are kept.
 */
const restoreLayout = (seed: unknown, nodes: GameStoreState['dynamicResourceNodes'], positions?: unknown, coast?: unknown) => {
  if (typeof seed !== 'number' || !Number.isFinite(seed) || seed <= 0) return {};
  // Saves from before coastlines keep their square rim, so no building ends up in the sea
  const style = isCoastStyle(coast) ? coast : 'NONE';
  const clean: GameStoreState['buildingPositions'] = {};
  if (isPlainRecord(positions)) {
    const allowed = new Set<string>([...BUILDING_IDS, 'SPIRE']);
    for (const [id, pos] of Object.entries(positions)) {
      if (!allowed.has(id) || !isPlainRecord(pos)) continue;
      if (Number.isInteger(pos.x) && Number.isInteger(pos.y)
        && Number(pos.x) >= 0 && Number(pos.x) < GRID_SIZE
        && Number(pos.y) >= 0 && Number(pos.y) < GRID_SIZE) {
        clean[id as ResourceBuildingId] = { x: Number(pos.x), y: Number(pos.y) };
      }
    }
  }
  return applyRealmLayout(seed, clean, nodes, style);
};


const normalizeEstablishmentSkillCooldowns = (raw?: unknown): GameStoreState['establishmentSkillCooldowns'] => {
  const base = {
    ...perBuilding(() => ({ skill1: 0, skill2: 0, skill3: 0 })),
    CASTLE: { skill1: 0, skill2: 0, skill3: 0 },
    SPIRE: { skill1: 0, skill2: 0, skill3: 0 },
  };
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Record<string, Record<string, unknown>>;
  for (const id of Object.keys(base) as (keyof typeof base)[]) {
    if (obj[id]) {
      base[id] = {
        skill1: Number(obj[id].skill1) || 0,
        skill2: Number(obj[id].skill2) || 0,
        skill3: Number(obj[id].skill3) || 0,
      };
    }
  }
  return base;
};

const toResources = (raw: unknown): Resources => {
  const source = isPlainRecord(raw) ? raw : {};
  return Object.fromEntries(RESOURCE_KEYS.map((key) => [key, finite(source[key])])) as unknown as Resources;
};

const normalizeAchievements = (raw: unknown): GameStoreState['achievements'] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.slice(0, 128).filter(isPlainRecord).flatMap((entry) => {
    const id = text(entry.id, '', 96);
    const definition = achievementDef(id);
    if (!definition || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      title: definition.en.title,
      description: definition.en.desc,
      icon: definition.icon,
      unlockedAt: integer(entry.unlockedAt, Date.now()),
    }];
  });
};

const normalizeAutoBuySummon = (raw: unknown): GameStoreState['autoBuySummon'] => {
  const result: GameStoreState['autoBuySummon'] = {};
  if (!isPlainRecord(raw)) return result;
  for (const unitClass of Object.keys(UNIT_CLASSES) as UnitClass[]) {
    if (typeof raw[unitClass] === 'boolean') result[unitClass] = raw[unitClass];
  }
  return result;
};

const normalizeInvasion = (raw: unknown): GameStoreState['invasion'] => {
  const result = sanitizeShape(INITIAL_INVASION as unknown as Record<string, unknown>, raw) as unknown as GameStoreState['invasion'];
  if (isPlainRecord(raw) && typeof raw.tactic === 'string' && WAVE_TACTICS.some((tactic) => tactic.id === raw.tactic)) {
    result.tactic = raw.tactic;
  }
  result.waveNumber = integer(result.waveNumber, 1, 1, 100);
  result.enemiesRemaining = integer(result.enemiesRemaining);
  result.totalEnemiesInWave = integer(result.totalEnemiesInWave);
  return result;
};

const normalizeDefense = (raw: unknown): GameStoreState['defense'] => {
  const result = sanitizeShape(INITIAL_DEFENSE as unknown as Record<string, unknown>, raw) as unknown as GameStoreState['defense'];
  // beaconLevelOf also understands the legacy turretLevel key.
  result.beaconLevel = beaconLevelOf(isPlainRecord(raw) ? raw : result);
  return result;
};

const normalizeMunitions = (raw: unknown): GameStoreState['munitions'] => sanitizeShape({
  armorPiercing: 0,
  incendiary: 0,
  cryoFrost: 0,
  teslaChain: 0,
  voidFlak: 0,
}, raw) as GameStoreState['munitions'];

/** Unknown or missing locations recover to the Demon Realm (the lair re-enters at its entrance). */
const validLocation = (value: unknown): GameStoreState['activeLocation'] =>
  value === 'DRAGONS_LAIR' ? 'DRAGONS_LAIR' : 'DEMON_REALM';

const isSeason = (value: unknown): value is GameStoreState['season'] =>
  value === 'SPRING' || value === 'SUMMER' || value === 'AUTUMN' || value === 'WINTER';

const isTimeOfDay = (value: unknown): value is GameStoreState['timeOfDay'] =>
  value === 'DAWN' || value === 'DAY' || value === 'DUSK' || value === 'NIGHT';

/** JSON save file export / import from the Settings drawer. */
export const createPersistenceSlice = (...[set, get]: SliceArgs) => ({
  exportSave: (): string => {
    const state = get();
    const exportData = {
      version: SAVE_VERSION,
      difficulty: state.difficulty,
      skillPoints: state.skillPoints,
      skillRanks: state.skillRanks,
      lordName: state.lordName,
      runId: state.runId,
      runStartedAt: state.runStartedAt,
      playSeconds: state.playSeconds,
      layoutSeed: state.layoutSeed,
      coastStyle: state.coastStyle,
      buildingPositions: state.buildingPositions,
      munitions: state.munitions,
      platformPhase: state.platformPhase,
      realmChoice: state.realmChoice,
      activeLocation: state.activeLocation,
      lairOpen: state.lairOpen,
      lairProgress: state.lairProgress,
      year: state.year,
      season: state.season,
      exportedAt: new Date().toISOString(),
      realmName: state.realmName,
      language: state.language,
      hasCompletedIntro: state.hasCompletedIntro,
      resources: state.resources,
      workerCount: state.workerCount,
      roster: state.roster,
      upgrades: state.upgrades,
      castleBuilt: state.castleBuilt,
      spireBuilt: state.spireBuilt,
      spireTower: state.spireTower,
      resourceBuildings: state.resourceBuildings,
  establishmentSkillCooldowns: state.establishmentSkillCooldowns,
      autoBuyBuildingMaterials: state.autoBuyBuildingMaterials,
      autoBuySummon: state.autoBuySummon,
      defense: state.defense,
      invasion: state.invasion,
      achievements: state.achievements,
      autoSettings: state.autoSettings,
      timeOfDay: state.timeOfDay,
      day: state.day,
      ambientDarkness: state.ambientDarkness,
      isAudioMuted: state.isAudioMuted,
      isGoreEnabled: state.isGoreEnabled,
      showWallpaper: state.showWallpaper,
      discoveredBeasts: state.discoveredBeasts,
      brawlTension: state.brawlTension,
      runes: state.runes,
      runeSlots: state.runeSlots,
      seaContamination: state.seaContamination,
      seaTruceWaves: state.seaTruceWaves,
      broodUnrest: state.broodUnrest,
      broodTruceWaves: state.broodTruceWaves,
      terrainFlooded: state.terrainFlooded,
      terrainFlooding: state.terrainFlooding,
      terrainSand: state.terrainSand,
      terrainRaised: state.terrainRaised,
      terrainFilled: state.terrainFilled,
      terrainReclamation: state.terrainReclamation,
      terrainReclaimed: state.terrainReclaimed,
      discoveredInvaders: state.discoveredInvaders,
      promptedUpgrades: state.promptedUpgrades,
      targetFps: state.targetFps,
      lastSavedTimestamp: Date.now(),
    };
    return JSON.stringify(exportData, null, 2);
  },

  importSave: (jsonString: string): boolean => {
    try {
      const data = sanitizeSavePayload(JSON.parse(jsonString), true);
      if (!data) throw new Error('Invalid save payload');
      // Permadeath: a save of a run that already fell can't be brought back
      if (isFallenRunSync(typeof data.runId === 'string' ? data.runId : '')) return false;

      const roster = withPermanentSlime(data.roster);
      const defense = normalizeDefense(data.defense);
      const invasion = normalizeInvasion(data.invasion);
      const hasCompletedIntro = data.hasCompletedIntro === true;

      set({
        realmName: text(data.realmName, 'Aether Haven', 64),
        difficulty: normalizeDifficulty(data.difficulty),
        ...normalizeSkillProgress(data),
        lordName: text(data.lordName, 'Demon Lord', 32),
        runId: text(data.runId, '', 128),
        runStartedAt: integer(data.runStartedAt, Date.now()),
        playSeconds: integer(data.playSeconds),
        realmChoice: validRealm(data.realmChoice),
        activeLocation: validLocation(data.activeLocation),
        lairOpen: data.lairOpen === true || validLocation(data.activeLocation) === 'DRAGONS_LAIR',
        lairProgress: normalizeLairProgress(data.lairProgress),
        platformPhase: validRealm(data.realmChoice) ?? validRealm(data.platformPhase) ?? getPhaseFromWave(invasion.waveNumber),
        year: integer(data.year, 1, 1),
        season: isSeason(data.season) ? data.season : 'SPRING',
        hasCompletedIntro,
        resources: toResources(data.resources),
        castleBuilt: data.castleBuilt === true,
        // Saves from before the spire needed building keep it standing once the citadel is up
        munitions: normalizeMunitions(data.munitions),
        spireBuilt: typeof data.spireBuilt === 'boolean' ? data.spireBuilt : data.castleBuilt === true,
        spireTower: normalizeSpireTower(data.spireTower),
        resourceBuildings: normalizeResourceBuildings(data.resourceBuildings),
        roster,
        workerCount: roster.length,
        autoBuyBuildingMaterials: sanitizeShape(INITIAL_AUTO_BUY_BUILDING as unknown as Record<string, unknown>, data.autoBuyBuildingMaterials) as GameStoreState['autoBuyBuildingMaterials'],
        autoBuySummon: normalizeAutoBuySummon(data.autoBuySummon),
        upgrades: sanitizeShape(INITIAL_UPGRADES as unknown as Record<string, unknown>, data.upgrades) as unknown as GameStoreState['upgrades'],
        language: data.language === 'TL' ? 'TL' : 'EN',
        defense,
        invasion,
        achievements: normalizeAchievements(data.achievements),
        autoSettings: sanitizeShape(INITIAL_AUTO_SETTINGS as unknown as Record<string, unknown>, data.autoSettings) as unknown as GameStoreState['autoSettings'],
        timeOfDay: isTimeOfDay(data.timeOfDay) ? data.timeOfDay : 'DAY',
        day: integer(data.day, 1, 1, 365),
        ambientDarkness: finite(data.ambientDarkness, 0, 0, 1),
        isAudioMuted: data.isAudioMuted === true,
        isGoreEnabled: data.isGoreEnabled === true,
        showWallpaper: data.showWallpaper !== false,
        discoveredBeasts: migrateDiscovered<UnitClass>(data.discoveredBeasts, UNIT_CLASSES, ['DRYAD', 'MINOTAUR']),
        brawlTension: normalizeTension(data.brawlTension),
        ...normalizeRunes(data.runes, data.runeSlots),
        seaContamination: clampContamination(finite(data.seaContamination)),
        seaTruceWaves: integer(data.seaTruceWaves),
        ...normalizeTerrain(data),
        discoveredInvaders: migrateDiscovered<InvaderType>(data.discoveredInvaders, INVADER_CONFIGS, []),
        lastSavedTimestamp: Date.now(),
        screen: hasCompletedIntro ? 'GAME' : 'TITLE',
        ...restoreLayout(data.layoutSeed, get().dynamicResourceNodes, data.buildingPositions, data.coastStyle),
      });
      return true;
    } catch (err) {
      console.error('[IsoChronicle] Import error:', err);
      return false;
    }
  },
}) satisfies Partial<GameStoreState>;

type PersistedState = ReturnType<typeof partialize>;

/** The subset of the store written to IndexedDB. */
const partialize = (state: GameStoreState) => ({
  skillPoints: state.skillPoints,
  skillRanks: state.skillRanks,
  difficulty: state.difficulty,
  hasCompletedIntro: state.hasCompletedIntro,
  realmName: state.realmName,
  resources: state.resources,
  workerCount: state.workerCount,
  roster: state.roster,
  upgrades: state.upgrades,
  castleBuilt: state.castleBuilt,
  spireBuilt: state.spireBuilt,
  spireTower: state.spireTower,
  resourceBuildings: state.resourceBuildings,
  autoBuyBuildingMaterials: state.autoBuyBuildingMaterials,
  autoBuySummon: state.autoBuySummon,
  showTileCoordinates: state.showTileCoordinates,
  isGoreEnabled: state.isGoreEnabled,
  showWallpaper: state.showWallpaper,
  defense: state.defense,
  invasion: state.invasion,
  achievements: state.achievements,
  autoSettings: state.autoSettings,
  discoveredBeasts: state.discoveredBeasts,
  brawlTension: state.brawlTension,
  runes: state.runes,
  runeSlots: state.runeSlots,
  seaContamination: state.seaContamination,
  seaTruceWaves: state.seaTruceWaves,
  broodUnrest: state.broodUnrest,
  broodTruceWaves: state.broodTruceWaves,
  terrainFlooded: state.terrainFlooded,
  terrainFlooding: state.terrainFlooding,
  terrainSand: state.terrainSand,
  terrainRaised: state.terrainRaised,
  terrainFilled: state.terrainFilled,
  terrainReclamation: state.terrainReclamation,
  terrainReclaimed: state.terrainReclaimed,
  discoveredInvaders: state.discoveredInvaders,
  day: state.day,
  year: state.year,
  season: state.season,
  platformPhase: state.platformPhase,
  realmChoice: state.realmChoice,
  activeLocation: state.activeLocation,
  lairOpen: state.lairOpen,
  lairProgress: state.lairProgress,
  lordName: state.lordName,
  runId: state.runId,
  runStartedAt: state.runStartedAt,
  playSeconds: state.playSeconds,
  layoutSeed: state.layoutSeed,
  coastStyle: state.coastStyle,
  buildingPositions: state.buildingPositions,
  munitions: state.munitions,
  lastSavedTimestamp: state.lastSavedTimestamp,
});

/** Upgrades older saves to the current shape when they are rehydrated. */
const merge = (persistedState: unknown, currentState: GameStoreState): GameStoreState => {
  const clean = sanitizeSavePayload(persistedState) ?? {};
  // Saves from before the single-Ent redesign may still carry caretaker links
  // Music now saves apart from the game (externalMusic.ts); an old save's library is adopted once
  const {
    entAssignments: _legacyCaretakers,
    musicLibrary: legacyLibrary, musicIndex: legacyIndex, musicAutoPlay: legacyAutoPlay, musicLoop: legacyLoop,
    ...persisted
  } = clean as Partial<GameStoreState> & { entAssignments?: unknown };
  const roster = withPermanentSlime(persisted.roster ?? currentState.roster);

  const adoptMusic = !hasStoredMusicPrefs() && Array.isArray(legacyLibrary);
  const musicLibrary = adoptMusic ? normalizeMusicLibrary(legacyLibrary) : currentState.musicLibrary;
  const defense = persisted.defense ? normalizeDefense(persisted.defense) : currentState.defense;
  const castleBuilt = typeof persisted.castleBuilt === 'boolean' ? persisted.castleBuilt : defense.castleHp > 0;

  return {
    ...currentState,
    ...persisted,
    hasCompletedIntro: typeof persisted.hasCompletedIntro === 'boolean' ? persisted.hasCompletedIntro : currentState.hasCompletedIntro,
    realmName: text(persisted.realmName, currentState.realmName, 64),
    lordName: text(persisted.lordName, currentState.lordName, 32),
    runId: text(persisted.runId, currentState.runId, 128),
    runStartedAt: integer(persisted.runStartedAt, currentState.runStartedAt),
    playSeconds: integer(persisted.playSeconds, currentState.playSeconds),
    resources: toResources(persisted.resources ?? currentState.resources),
    upgrades: sanitizeShape(INITIAL_UPGRADES as unknown as Record<string, unknown>, persisted.upgrades) as unknown as GameStoreState['upgrades'],
    musicLibrary,
    musicIndex: adoptMusic ? clampMusicIndex(legacyIndex, musicLibrary) : currentState.musicIndex,
    musicAutoPlay: adoptMusic && typeof legacyAutoPlay === 'boolean' ? legacyAutoPlay : currentState.musicAutoPlay,
    musicLoop: adoptMusic && typeof legacyLoop === 'boolean' ? legacyLoop : currentState.musicLoop,
    ...normalizeSkillProgress(persisted),
    difficulty: normalizeDifficulty(persisted.difficulty),
    roster,
    workerCount: roster.length,
    discoveredBeasts: migrateDiscovered<UnitClass>(persisted.discoveredBeasts, UNIT_CLASSES, currentState.discoveredBeasts),
    brawlTension: normalizeTension(persisted.brawlTension),
    ...normalizeRunes(persisted.runes, persisted.runeSlots),
    seaContamination: clampContamination(persisted.seaContamination ?? 0),
    seaTruceWaves: Math.max(0, Math.floor(persisted.seaTruceWaves ?? 0)),
    ...normalizeTerrain(persisted),
    discoveredInvaders: migrateDiscovered<InvaderType>(persisted.discoveredInvaders, INVADER_CONFIGS, currentState.discoveredInvaders),
    castleBuilt,
    munitions: normalizeMunitions(persisted.munitions),
    pendingBattleEffects: [],
    spireBuilt: typeof persisted.spireBuilt === 'boolean' ? persisted.spireBuilt : castleBuilt,
    spireTower: normalizeSpireTower(persisted.spireTower),
    resourceBuildings: normalizeResourceBuildings(persisted.resourceBuildings),
    establishmentSkillCooldowns: normalizeEstablishmentSkillCooldowns(persisted.establishmentSkillCooldowns),
    autoBuyBuildingMaterials: sanitizeShape(INITIAL_AUTO_BUY_BUILDING as unknown as Record<string, unknown>, persisted.autoBuyBuildingMaterials) as GameStoreState['autoBuyBuildingMaterials'],
    autoBuySummon: normalizeAutoBuySummon(persisted.autoBuySummon),
    defense,
    invasion: persisted.invasion ? normalizeInvasion(persisted.invasion) : currentState.invasion,
    achievements: normalizeAchievements(persisted.achievements),
    autoSettings: sanitizeShape(INITIAL_AUTO_SETTINGS as unknown as Record<string, unknown>, persisted.autoSettings) as unknown as GameStoreState['autoSettings'],
    day: integer(persisted.day, currentState.day, 1, 365),
    year: integer(persisted.year, currentState.year, 1),
    season: isSeason(persisted.season) ? persisted.season : currentState.season,
    platformPhase: validRealm(persisted.platformPhase) ?? currentState.platformPhase,
    realmChoice: validRealm(persisted.realmChoice),
    activeLocation: validLocation(persisted.activeLocation),
    lairOpen: persisted.lairOpen === true || validLocation(persisted.activeLocation) === 'DRAGONS_LAIR',
    lairProgress: normalizeLairProgress(persisted.lairProgress),
    lastSavedTimestamp: integer(persisted.lastSavedTimestamp, currentState.lastSavedTimestamp),
    isGoreEnabled: typeof persisted.isGoreEnabled === 'boolean' ? persisted.isGoreEnabled : currentState.isGoreEnabled,
    showWallpaper: typeof persisted.showWallpaper === 'boolean' ? persisted.showWallpaper : currentState.showWallpaper,
    showTileCoordinates: typeof persisted.showTileCoordinates === 'boolean' ? persisted.showTileCoordinates : true,
    layoutSeed: currentState.layoutSeed,
    ...restoreLayout(persisted.layoutSeed, currentState.dynamicResourceNodes, persisted.buildingPositions, persisted.coastStyle),
  };
};

export const persistOptions: PersistOptions<GameStoreState, PersistedState> = {
  name: SAVE_KEY,
  storage: createThrottledStorage<PersistedState>(),
  merge,
  partialize,
};
