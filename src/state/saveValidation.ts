/** Maximum manual save import size. Current exports are far smaller than this. */
export const MAX_SAVE_FILE_BYTES = 1024 * 1024;

const MAX_DEPTH = 8;
const MAX_OBJECT_KEYS = 256;
const MAX_STRING_LENGTH = 4096;
const MAX_ARRAY_LENGTH = 512;
const MAX_ROSTER_LENGTH = 128;
const MAX_TERRAIN_LENGTH = 400;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const TOP_LEVEL_KEYS = new Set([
  'version', 'difficulty', 'skillPoints', 'skillRanks', 'lordName', 'runId', 'runStartedAt',
  'playSeconds', 'layoutSeed', 'coastStyle', 'buildingPositions', 'munitions', 'platformPhase',
  'realmChoice', 'activeLocation', 'lairOpen', 'lairProgress', 'dragon', 'dragonsSlain', 'dragonBestStars', 'dragonStarsTotal', 'volcanicMagma', 'year', 'season', 'exportedAt', 'realmName', 'language', 'hasCompletedIntro',
  'resources', 'workerCount', 'roster', 'upgrades', 'castleBuilt', 'spireBuilt', 'spireTower',
  'resourceBuildings', 'establishmentSkillCooldowns', 'autoBuyBuildingMaterials', 'autoBuySummon',
  'defense', 'invasion', 'achievements', 'autoSettings', 'timeOfDay', 'day', 'ambientDarkness',
  'isAudioMuted', 'isGoreEnabled', 'showWallpaper', 'showTileCoordinates', 'discoveredBeasts',
  'brawlTension', 'runes', 'runeSlots', 'seaContamination', 'seaTruceWaves', 'broodUnrest',
  'broodTruceWaves', 'terrainFlooded', 'terrainFlooding', 'terrainSand', 'terrainRaised',
  'terrainFilled', 'discoveredInvaders', 'promptedUpgrades', 'targetFps', 'lastSavedTimestamp',
  // Legacy persisted music fields are adopted once, then saved separately.
  'musicLibrary', 'musicIndex', 'musicAutoPlay', 'musicLoop', 'entAssignments',
]);

export type SanitizedSave = Record<string, unknown>;

export const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.prototype.toString.call(value) === '[object Object]';
};

const arrayLimit = (key: string): number => {
  if (key === 'roster') return MAX_ROSTER_LENGTH;
  if (key.startsWith('terrain')) return MAX_TERRAIN_LENGTH;
  return MAX_ARRAY_LENGTH;
};

const sanitizeValue = (value: unknown, depth: number, key: string): unknown => {
  if (depth > MAX_DEPTH || value === null) return value === null ? null : undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.slice(0, MAX_STRING_LENGTH);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    return Math.max(-Number.MAX_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER, value));
  }
  if (Array.isArray(value)) {
    const result: unknown[] = [];
    for (const item of value.slice(0, arrayLimit(key))) {
      const clean = sanitizeValue(item, depth + 1, key);
      if (clean !== undefined) result.push(clean);
    }
    return result;
  }
  if (!isPlainRecord(value)) return undefined;

  const result: Record<string, unknown> = Object.create(null);
  let count = 0;
  for (const [childKey, childValue] of Object.entries(value)) {
    if (count >= MAX_OBJECT_KEYS) break;
    if (UNSAFE_KEYS.has(childKey)) continue;
    const clean = sanitizeValue(childValue, depth + 1, childKey);
    if (clean !== undefined) {
      result[childKey] = clean;
      count += 1;
    }
  }
  return result;
};

/**
 * Removes unknown top-level fields and bounds all nested input before gameplay
 * code sees an imported or persisted save. Field-specific migration follows in
 * persistence.ts.
 */
export const sanitizeSavePayload = (raw: unknown, requireResources = false): SanitizedSave | null => {
  if (!isPlainRecord(raw)) return null;
  if (requireResources && !isPlainRecord(raw.resources)) return null;

  const result: SanitizedSave = Object.create(null);
  for (const key of TOP_LEVEL_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const clean = sanitizeValue(raw[key], 1, key);
    if (clean !== undefined) result[key] = clean;
  }
  return result;
};

export const isSaveFileSizeAllowed = (file: Pick<File, 'size'>): boolean =>
  Number.isFinite(file.size) && file.size > 0 && file.size <= MAX_SAVE_FILE_BYTES;
