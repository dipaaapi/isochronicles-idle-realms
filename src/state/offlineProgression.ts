import { OfflineGainsData, UpgradesState } from '../types/state';
import { SkillId, skillBonuses } from './skillTree';

const MAX_OFFLINE_SECONDS = 8 * 60 * 60; // 8 hours cap
const MIN_OFFLINE_SECONDS_FOR_MODAL = 15; // 15 seconds threshold

export function calculateOfflineGains(
  lastSavedTimestamp: number,
  workerCount: number,
  upgrades: UpgradesState,
  unlockedSkills: SkillId[] = []
): OfflineGainsData | null {
  if (!lastSavedTimestamp || lastSavedTimestamp <= 0) return null;

  const now = Date.now();
  const rawElapsed = (now - lastSavedTimestamp) / 1000;

  if (rawElapsed < MIN_OFFLINE_SECONDS_FOR_MODAL) {
    return null;
  }

  const elapsedSeconds = Math.min(rawElapsed, MAX_OFFLINE_SECONDS);

  // Autonomous rate calculations:
  // Base rate per worker per second with capacity & speed scaling
  const speedMult = 1 + (upgrades.golemSpeedLevel - 1) * 0.15;
  const capacityMult = 1 + (upgrades.golemCapacityLevel - 1) * 0.25;
  const shardsPerSecond = workerCount * 0.3 * speedMult * capacityMult;

  // Background grove & quarry ambient passive generation
  const woodPerSecond = 0.2 * (1 + (upgrades.refineryLevel - 1) * 0.25);
  const stonePerSecond = 0.15 * (1 + (upgrades.quarryLevel - 1) * 0.25);

  const skills = skillBonuses(unlockedSkills);
  const aetherShardsEarned = Math.floor(elapsedSeconds * shardsPerSecond * skills.harvest * skills.speed);
  const woodEarned = Math.floor(elapsedSeconds * woodPerSecond * skills.harvest * skills.foundations);
  const stoneEarned = Math.floor(elapsedSeconds * stonePerSecond * skills.harvest * skills.foundations);

  return {
    elapsedSeconds: Math.floor(elapsedSeconds),
    aetherShardsEarned,
    woodEarned,
    stoneEarned,
  };
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const remSec = seconds % 60;
    return `${minutes}m ${remSec}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return `${hours}h ${remMin}m`;
}
