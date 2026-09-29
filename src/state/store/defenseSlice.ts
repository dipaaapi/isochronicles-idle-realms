import { soundFx } from '../../game/audio/soundFx';
import { isConstructionReady } from '../constructionProgress';
import { DEFENSE_CONFIG, beaconLevelOf, castleUpgradeCost } from '../defenseStats';
import { ECONOMY_CONFIG, enemiesInWave } from '../economy';
import { lootResources } from '../resources';
import { skillBonuses } from '../skillTree';
import { restoreWreckedBuildings } from './buildingsSlice';
import { INITIAL_UPGRADES, createInitialEntAssignments, createSupportSlime } from './initialState';
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

    soundFx.playFanfare();
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
    soundFx.playClick();
    return true;
  },

  damageCastle: (amount: number) => {
    const state = get();
    let remainingDmg = amount * skillBonuses(state.unlockedSkills).castleDamage;

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
    const totalEnemies = enemiesInWave(state.invasion.waveNumber);
    set((prev) => ({
      invasion: {
        ...prev.invasion,
        isActive: true,
        enemiesRemaining: totalEnemies,
        totalEnemiesInWave: totalEnemies,
        countdown: 0,
      },
    }));
    soundFx.playCastleHit();
  },

  setEnemiesRemaining: (count: number) => {
    set((prev) => ({ invasion: { ...prev.invasion, enemiesRemaining: count } }));
  },

  resolveInvasionVictory: (bountyCoins: number) => {
    soundFx.playFanfare();
    set((prev) => {
      const currentWave = prev.invasion.waveNumber;
      const nextWave = Math.min(INVASION.maxWave, currentWave + 1);
      const completedWave100 = currentWave >= INVASION.maxWave;

      return {
        resources: { ...prev.resources, coins: prev.resources.coins + bountyCoins },
        platformPhase: getPhaseFromWave(nextWave),
        isWave100VictoryCelebration: completedWave100 || prev.isWave100VictoryCelebration,
        isRegressionModalOpen: completedWave100 || prev.isRegressionModalOpen,
        invasion: {
          ...prev.invasion,
          isActive: false,
          waveNumber: nextWave,
          invasionsRepelled: prev.invasion.invasionsRepelled + 1,
          countdown: INVASION.countdownSeconds,
          maxCountdown: INVASION.countdownSeconds,
        },
        defense: { ...prev.defense, shieldHp: prev.defense.shieldMaxHp }, // Recharge shield
        resourceBuildings: restoreWreckedBuildings(prev.resourceBuildings),
        lastSavedTimestamp: Date.now(),
      };
    });

    get().unlockAchievement(
      'first_defense',
      'Sunder Vanguard',
      'Successfully defended Nexus Prime from a Void Incursion.',
      '⚔️'
    );
  },

  resolveCastleBreach: () => {
    soundFx.playBreach();
    set((prev) => {
      // Enemies loot a share of every stockpile when the castle is crushed
      const { looted, remaining } = lootResources(prev.resources, ECONOMY_CONFIG.breachLootFraction);
      const slime = prev.roster.find((unit) => unit.unitClass === 'AQUA_SLIME');
      const roster = [createSupportSlime(slime?.slimeEvolutionLevel)];

      return {
        resources: remaining,
        lootedResources: looted,
        // Reset base structures and restore castle health
        defense: { ...prev.defense, castleHp: prev.defense.castleMaxHp, shieldHp: prev.defense.shieldMaxHp },
        upgrades: { ...INITIAL_UPGRADES },
        roster,
        workerCount: roster.length,
        // The fallen Ents no longer tend their establishments
        entAssignments: createInitialEntAssignments(),
        resourceBuildings: restoreWreckedBuildings(prev.resourceBuildings),
        invasion: {
          ...prev.invasion,
          isActive: false,
          countdown: INVASION.breachCountdownSeconds,
          maxCountdown: INVASION.breachCountdownSeconds,
          enemiesRemaining: 0,
        },
        isCastleBreachedModalOpen: true,
        lastSavedTimestamp: Date.now(),
      };
    });
  },

  closeCastleBreachedModal: () => {
    set({ isCastleBreachedModalOpen: false, lootedResources: null });
  },
}) satisfies Partial<GameStoreState>;
