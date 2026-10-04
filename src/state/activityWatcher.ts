import { tacticOf } from './waveTactics';
import { GOD_BLESSINGS, GodBlessingId, PLATFORM_CONFIGS, UNIT_CLASSES } from '../types/game';
import { GameStoreState } from '../types/state';
import { useGameStore, RESOURCE_BUILDING_CONFIG } from './useGameStore';
import { SKILLS, SKILL_IDS, rankOf } from './skillTree';
import { logMessage, logWeather } from './activityLog';
import { DEFENSE_CONFIG, TOWERS } from './defenseStats';

/**
 * Narrates realm-level changes into the activity log by diffing store state,
 * so store actions stay free of logging code. Moment-to-moment events
 * (kills, damage, deliveries, lightning) are logged by the game objects.
 * Wording comes from src/i18n/activityMessages.json.
 */
function diff(state: GameStoreState, prev: GameStoreState): void {
  const tl = state.language === 'TL';

  if (state.day !== prev.day) logMessage('dayDawns', { day: state.day });
  if (state.weather !== prev.weather) logWeather(state.weather);
  if (state.platformPhase > prev.platformPhase) {
    const realm = PLATFORM_CONFIGS[state.platformPhase as keyof typeof PLATFORM_CONFIGS];
    logMessage('realmShift', { realm: realm ? (tl ? realm.name : realm.nameEn) : `Phase ${state.platformPhase}` });
  }

  // Invasions
  if (state.invasion.isActive && !prev.invasion.isActive) {
    logMessage('waveAttack', { wave: state.invasion.waveNumber });
    if (state.invasion.tactic && state.invasion.tactic !== 'SKIRMISH') {
      const tactic = tacticOf(state.invasion.tactic);
      logMessage('waveTactic', { wave: state.invasion.waveNumber, tactic: tactic.name, desc: tactic.desc });
    }
    if ((state.invasion.vengeanceExtra ?? 0) > 0) {
      logMessage('waveVengeance', { wave: state.invasion.waveNumber, extra: state.invasion.vengeanceExtra ?? 0 });
    }
  } else if (!state.invasion.isActive && prev.invasion.isActive) {
    if (state.invasion.invasionsRepelled > prev.invasion.invasionsRepelled) {
      logMessage('waveRepelled', { wave: prev.invasion.waveNumber });
    } else {
      logMessage('citadelBreached');
    }
  }

  // Construction
  if (state.castleBuilt && !prev.castleBuilt) logMessage('citadelRebuilt');
  for (const id of Object.keys(state.resourceBuildings) as Array<keyof typeof state.resourceBuildings>) {
    const level = state.resourceBuildings[id]?.level ?? 0;
    const before = prev.resourceBuildings?.[id]?.level ?? 0;
    const cfg = RESOURCE_BUILDING_CONFIG[id];
    const building = tl ? cfg.label : cfg.labelEn;
    if (level > before) {
      logMessage(level === 1 ? 'buildingBuilt' : 'buildingUpgraded', { building, level }, { icon: cfg.icon });
    }
    const tower = state.resourceBuildings[id]?.towerLevel ?? 1;
    const towerBefore = prev.resourceBuildings?.[id]?.towerLevel ?? 1;
    if (before >= 1 && tower > towerBefore) {
      logMessage('towerUpgraded', { tower: tl ? TOWERS[id].name.tl : TOWERS[id].name.en, level: tower }, { icon: TOWERS[id].icon });
    }
    if (before >= 1 && (prev.resourceBuildings?.[id]?.hp ?? 1) <= 0 && (state.resourceBuildings[id]?.hp ?? 1) > 0) {
      logMessage('buildingRestored', { building }, { icon: cfg.icon });
    }
  }
  for (const key of ['wallLevel', 'shieldLevel', 'beaconLevel'] as const) {
    if ((state.defense[key] ?? 1) > (prev.defense?.[key] ?? 1)) {
      const def = DEFENSE_CONFIG.castle[key];
      logMessage('castleUpgraded', { upgrade: tl ? def.name.tl : def.name.en, level: state.defense[key] }, { icon: def.icon });
    }
  }

  // Minions joining the roster (summons, purchases, free Ent)
  if (state.roster.length > prev.roster.length) {
    const known = new Set(prev.roster.map((u) => u.id));
    for (const unit of state.roster) {
      if (known.has(unit.id)) continue;
      const cfg = UNIT_CLASSES[unit.unitClass];
      logMessage('unitJoins', { name: unit.name, unitClass: tl ? cfg.name : cfg.nameEn ?? cfg.name }, { mergeKey: `join:${unit.id}` });
    }
  }

  // Progression
  for (const a of state.achievements.slice(prev.achievements.length)) {
    logMessage('achievement', { title: a.title }, { icon: a.icon || undefined });
  }
  for (const id of SKILL_IDS) {
    const rank = rankOf(state.skillRanks, id);
    if (rank > rankOf(prev.skillRanks, id)) {
      logMessage('skillLearned', { skill: tl ? SKILLS[id].name.tl : SKILLS[id].name.en, rank, max: SKILLS[id].maxRank });
    }
  }
  if (state.invasion.invasionsRepelled > prev.invasion.invasionsRepelled && state.skillPoints > prev.skillPoints) {
    logMessage('skillPointsEarned', { count: state.skillPoints - prev.skillPoints, total: state.skillPoints });
  }
  if (state.regressionCount > prev.regressionCount) logMessage('regression', { tier: state.regressionCount });
  for (const id of Object.keys(state.activeGodBlessings ?? {}) as GodBlessingId[]) {
    if ((state.activeGodBlessings[id] ?? 0) > 0 && !((prev.activeGodBlessings?.[id] ?? 0) > 0)) {
      const b = GOD_BLESSINGS[id];
      logMessage('blessing', { blessing: tl ? b.name : b.nameEn }, { icon: b.icon });
    }
  }
}

/** Starts narrating store changes; returns the unsubscribe function. */
export function startActivityWatcher(): () => void {
  return useGameStore.subscribe((state, prev) => {
    try {
      diff(state, prev);
    } catch {
      // Logging must never break the game loop
    }
  });
}
