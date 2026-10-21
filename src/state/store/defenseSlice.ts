import { waveAchievements } from '../achievements';
import { DIFFICULTIES, normalizeDifficulty } from '../difficulty';
import { soundFx } from '../../game/audio/soundFx';
import { isConstructionReady } from '../constructionProgress';
import { DEFENSE_CONFIG, beaconLevelOf, castleUpgradeCost } from '../defenseStats';
import { ECONOMY_CONFIG, enemiesInWave } from '../economy';
import { vengeanceExtraInvaders } from '../establishmentCrews';
import { realmIntensity, scaledEnemyCount } from '../waveBalance';
import { devFlag } from '../devMode';
import { rollWaveTactic, tacticOf } from '../waveTactics';
import { logMessage } from '../activityLog';
import { newRunId, recordLegacy, type LegacyEntry } from '../legacy';
import { getProfile } from '../playerProfile';
import { endRunSave, saveNow } from '../storageAdapter';
import { createInitialProgress } from './initialState';
import { availableSkillPoints, teamBonuses } from '../skillTree';
import { restoreWreckedBuildings, restoreWreckedSpire } from './buildingsSlice';
import type { GameStoreState, PlatformPhase } from '../../types/state';
import type { SliceArgs } from './types';

export const getPhaseFromWave = (wave: number): PlatformPhase => {
  if (wave <= 25) return 1;
  if (wave <= 50) return 2;
  if (wave <= 75) return 3;
  return 4;
};

const { invasion: INVASION, castleRepair: CASTLE_REPAIR } = ECONOMY_CONFIG;

/** Castle fortifications, invasion waves, victories and breaches. */
export const createDefenseSlice = (...[set, get]: SliceArgs) => ({
  /** Pick the realm the waves are fought in (null = follow the waves). Harder realms bring tougher waves. */
  setRealmChoice: (phase: PlatformPhase | null) => {
    set((prev) => ({
      // The biome is the player's choice (New Game / Settings); null keeps the current one
      realmChoice: phase ?? prev.platformPhase,
      platformPhase: phase ?? prev.platformPhase,
    }));
  },

  upgradeDefense: (defenseKey: 'wallLevel' | 'beaconLevel' | 'shieldLevel') => {
    const state = get();
    const currentLevel = defenseKey === 'beaconLevel' ? beaconLevelOf(state.defense) : state.defense[defenseKey];
    const cost = castleUpgradeCost(defenseKey, currentLevel);
    if (!cost || !get().spendResources(cost)) return false;

    set((prev) => {
      const nextDef = { ...prev.defense, [defenseKey]: currentLevel + 1 };
      if (defenseKey === 'wallLevel') {
        const gain = DEFENSE_CONFIG.castle.wallLevel.hpPerLevel;
        nextDef.castleMaxHp += gain;
        nextDef.castleHp = Math.min(nextDef.castleMaxHp, nextDef.castleHp + gain);
      } else if (defenseKey === 'shieldLevel') {
        nextDef.shieldMaxHp += DEFENSE_CONFIG.castle.shieldLevel.shieldPerLevel;
        nextDef.shieldHp = nextDef.shieldMaxHp;
      }
      return { defense: nextDef, lastSavedTimestamp: Date.now() };
    });

    soundFx.playUpgrade();
    get().unlockAchievement(
      'citadel_fortified',
      'Citadel of Iron',
      'Upgraded Castle Fortifications to repel void invaders.',
      '🏰'
    );
    return true;
  },

  repairCastle: () => {
    const { resources, defense } = get();
    if (resources.coins < CASTLE_REPAIR.coins || defense.castleHp >= defense.castleMaxHp) return false;

    set((prev) => ({
      resources: { ...prev.resources, coins: prev.resources.coins - CASTLE_REPAIR.coins },
      defense: {
        ...prev.defense,
        castleHp: Math.min(prev.defense.castleMaxHp, prev.defense.castleHp + CASTLE_REPAIR.amount),
      },
      lastSavedTimestamp: Date.now(),
    }));
    soundFx.playHeal();
    return true;
  },

  damageCastle: (amount: number) => {
      const state = get();
      if (state.defense.forceFieldTimer > 0 || devFlag('godMode')) return;
    let remainingDmg = amount * teamBonuses(state).castleDamage;

    // Damage reduction from wall level (4% per level)
    const dmgReduction = Math.min(0.4, (state.defense.wallLevel - 1) * 0.04);
    remainingDmg = Math.max(1, Math.round(remainingDmg * (1 - dmgReduction)));

    // The shield soaks damage first
    const absorbed = Math.min(state.defense.shieldHp, remainingDmg);
    const nextShield = state.defense.shieldHp - absorbed;
    const nextHp = Math.max(0, state.defense.castleHp - (remainingDmg - absorbed));

    soundFx.playCastleHit();
    set((prev) => ({ defense: { ...prev.defense, shieldHp: nextShield, castleHp: nextHp } }));

    if (nextHp <= 0) get().resolveCastleBreach();
  },

  // Invasion Actions
  tickDefenseTimers: (deltaSec: number) => {
    set((prev) => ({
      defense: {
        ...prev.defense,
        forceFieldTimer: Math.max(0, prev.defense.forceFieldTimer - deltaSec),
        minionFrenzyTimer: Math.max(0, prev.defense.minionFrenzyTimer - deltaSec),
        massRegenTimer: Math.max(0, prev.defense.massRegenTimer - deltaSec),
        laserStormTimer: Math.max(0, (prev.defense.laserStormTimer ?? 0) - deltaSec),
        castleHp: prev.defense.massRegenTimer > 0 ? Math.min(prev.defense.castleMaxHp, prev.defense.castleHp + 25 * deltaSec) : prev.defense.castleHp,
      }
    }));
  },

  tickInvasionCountdown: (deltaSec: number) => {
    const state = get();
    if (!isConstructionReady(state) || state.invasion.isActive) return;

    const nextCountdown = state.invasion.countdown - deltaSec;
    if (nextCountdown <= 0) {
      get().startInvasion();
    } else {
      set((prev) => ({ invasion: { ...prev.invasion, countdown: nextCountdown } }));
    }
  },

  startInvasion: () => {
    const state = get();
    if (!isConstructionReady(state) || state.invasion.isActive) return;
    // Human gatherers come along to avenge the demons' raids into their realm
    const vengeanceExtra = vengeanceExtraInvaders(state.invasion.vengeance ?? 0);
    // Each wave marches in a random formation (waveTactics.json)
    const difficulty = normalizeDifficulty(state.difficulty);
    const tactic = tacticOf(rollWaveTactic(state.invasion.waveNumber, difficulty, state.invasion.tactic));
    const totalEnemies = scaledEnemyCount(enemiesInWave(state.invasion.waveNumber), difficulty, (tactic.count ?? 1) * realmIntensity(state.invasion.waveNumber, state.platformPhase).count, state.invasion.waveNumber) + vengeanceExtra;
    set((prev) => ({
      invasion: {
        ...prev.invasion,
        isActive: true,
        tactic: tactic.id,
        enemiesRemaining: totalEnemies,
        totalEnemiesInWave: totalEnemies,
        countdown: 0,
        vengeance: 0,
        vengeanceExtra,
      },
    }));
    soundFx.playWaveHorn();
  },

  stirVengeance: (amount: number) => {
    set((prev) => ({ invasion: { ...prev.invasion, vengeance: (prev.invasion.vengeance ?? 0) + amount } }));
  },

  setEnemiesRemaining: (count: number) => {
    set((prev) => ({ invasion: { ...prev.invasion, enemiesRemaining: count } }));
  },

  resolveInvasionVictory: (bountyCoins: number) => {
    soundFx.playVictory();
    set((prev) => {
      const currentWave = prev.invasion.waveNumber;
      const nextWave = currentWave + 1; // endless waves
      const wavesCleared = prev.invasion.invasionsRepelled + 1;
      // Mending Stones: the citadel recovers part of its max HP after each wave
      const repair = Math.round(prev.defense.castleMaxHp * teamBonuses(prev).waveRepair);
      const castleHp = prev.castleBuilt && prev.defense.castleHp > 0
        ? Math.min(prev.defense.castleMaxHp, prev.defense.castleHp + repair)
        : prev.defense.castleHp;

      return {
        // The Crypt of Souls gathers the fallen's souls after every repelled wave
        resources: {
          ...prev.resources,
          coins: prev.resources.coins + Math.round(bountyCoins * DIFFICULTIES[normalizeDifficulty(prev.difficulty)].bountyMultiplier),
          soulFragments: (prev.resources.soulFragments ?? 0) +
            (prev.resourceBuildings.CRYPT?.level ?? 0) * ECONOMY_CONFIG.landmarkYields.CRYPT.soulFragmentsPerWave,
        },
        invasion: {
          ...prev.invasion,
          isActive: false,
          waveNumber: nextWave,
          invasionsRepelled: wavesCleared,
          countdown: INVASION.countdownSeconds,
          maxCountdown: INVASION.countdownSeconds,
        },
        defense: { ...prev.defense, castleHp, shieldHp: prev.defense.shieldMaxHp }, // Recharge shield
        // Every cleared wave set (see skillTree.json) grants skill points
        skillPoints: availableSkillPoints(wavesCleared, prev.skillRanks),
        resourceBuildings: restoreWreckedBuildings(prev.resourceBuildings),
        spireTower: restoreWreckedSpire(prev.spireTower),
        lastSavedTimestamp: Date.now(),
      };
    });

    get().unlockAchievement(
      'first_defense',
      'Sunder Vanguard',
      'Successfully defended Nexus Prime from a Void Incursion.',
      '⚔️'
    );
    for (const a of waveAchievements(get().invasion.invasionsRepelled)) {
      get().unlockAchievement(a.id, a.en.title, a.en.desc, a.icon);
    }
    // Autosave: the save is overwritten after every repelled wave
    void saveNow().then(() => logMessage('autoSaved', { wave: get().invasion.invasionsRepelled }));
  },

  resolveCastleBreach: () => {
    const s = get();
    if (s.gameOverRun) return;
    soundFx.playBreach();
    // Permadeath: the run is written into the Hall of Legacy and the realm save is deleted
    const entry: LegacyEntry = {
      id: `legacy_${Date.now().toString(36)}`,
      runId: s.runId || newRunId(),
      lord: s.lordName || getProfile().name || 'Demon Lord',
      avatar: getProfile().avatar,
      realmName: s.realmName,
      difficulty: normalizeDifficulty(s.difficulty),
      biome: s.platformPhase,
      waveReached: s.invasion.waveNumber,
      wavesCleared: s.invasion.invasionsRepelled,
      days: (Math.max(1, s.year) - 1) * 365 + Math.max(1, s.day),
      playSeconds: Math.round(s.playSeconds),
      startedAt: s.runStartedAt || s.lastSavedTimestamp,
      endedAt: Date.now(),
    };
    logMessage('runFallen', { wave: entry.waveReached });
    void endRunSave().then(() => recordLegacy(entry));
    // Back to a ruined, unsaved realm; the Game Over screen shows over the title
    set({ ...createInitialProgress(), gameOverRun: entry, lastSavedTimestamp: Date.now() });
  },
}) satisfies Partial<GameStoreState>;
