import { useGameStore } from './useGameStore';
import { canAfford } from './resources';
import { canLearn, rankOf, SKILL_IDS, SKILLS, type SkillId } from './skillTree';
import { MERGE_COUNT, RUNES, RUNE_TARGET_IDS, runeValue, slottedIds, type Rune } from './runes';
import { beaconLevelOf, castleUpgradeCost, towerBuildingOf, towerLevelOf, towerUpgradeCost } from './defenseStats';
import { nextConstruction } from './constructionProgress';
import { BUILDING_IDS } from './buildingLayout';
import { logMessage } from './activityLog';
import type { Resources, TowerId } from '../types/state';

/**
 * The realm's caretakers keep every upgrade moving on their own (Settings in
 * each Laboratory / Runes tab):
 * - the Support Slime: Research (autoUpgrade, workers/supportSlime.ts), Skills
 *   (autoSkills) and Runes (autoRunes: merge, slot the strongest, sell the unusable);
 * - the Ancient Treant: Fortifications (autoFortify: castle walls / beacon /
 *   shield, establishment towers and the spire).
 * One action per call, so the caretakers work steadily rather than in bursts.
 * Nothing runs while the castle or spire is still being raised.
 */

/** Total resource units in a cost (to pick the cheapest upgrade first). */
const costSize = (cost: Partial<Resources>): number => Object.values(cost).reduce((s, v) => s + (v ?? 0), 0);

/** Slime: spend a skill point on the learnable skill with the fewest ranks (spreads points evenly). */
export function slimeAutoSkills(): SkillId | null {
  const s = useGameStore.getState();
  if (!s.autoSettings.autoSkills || s.skillPoints < 1) return null;
  const options = SKILL_IDS.filter((id) => canLearn(id, s.skillRanks, s.skillPoints));
  if (!options.length) return null;
  const pick = options.reduce((a, b) => (rankOf(s.skillRanks, b) < rankOf(s.skillRanks, a) ? b : a));
  if (!s.learnSkill(pick)) return null;
  logMessage('autoSkillLearned', { skill: SKILLS[pick].name });
  return pick;
}

/** Slime: merge a ready triple, else put the strongest runes in the slots, else sell the unusable. */
export function slimeAutoRunes(): boolean {
  const s = useGameStore.getState();
  if (!s.autoSettings.autoRunes) return false;
  // 1) Merge any kind/tier held MERGE_COUNT times
  const counts = new Map<string, Rune[]>();
  for (const r of s.runes) counts.set(`${r.kind}:${r.tier}`, [...(counts.get(`${r.kind}:${r.tier}`) ?? []), r]);
  for (const group of counts.values()) {
    if (group.length < MERGE_COUNT) continue;
    const merged = s.mergeRunes(group[0].kind, group[0].tier);
    if (merged) {
      logMessage('autoRuneMerged', { rune: RUNES[merged.kind].name, tier: merged.tier });
      return true;
    }
  }
  // 2) Fill empty slots with the strongest loose rune; swap out a weaker slotted one
  const slotted = slottedIds(s.runeSlots);
  const byId = new Map(s.runes.map((r) => [r.id, r]));
  for (const target of RUNE_TARGET_IDS) {
    const loose = s.runes.filter((r) => !slotted.has(r.id) && RUNES[r.kind].target === target).sort((a, b) => runeValue(b) - runeValue(a));
    if (!loose.length) continue;
    const best = loose[0];
    const row = s.runeSlots[target];
    if (row.includes(null)) {
      if (s.slotRune(best.id)) {
        logMessage('autoRuneSlotted', { rune: RUNES[best.kind].name, tier: best.tier });
        return true;
      }
      continue;
    }
    const weakest = row.map((id) => (id ? byId.get(id) : undefined)).filter((r): r is Rune => !!r)
      .reduce<Rune | undefined>((a, b) => (!a || runeValue(b) < runeValue(a) ? b : a), undefined);
    if (weakest && runeValue(best) > runeValue(weakest) && s.unslotRune(weakest.id) && useGameStore.getState().slotRune(best.id)) {
      logMessage('autoRuneSlotted', { rune: RUNES[best.kind].name, tier: best.tier });
      return true;
    }
  }
  // 3) Sell what can no longer be used
  const sold = useGameStore.getState().sellObsoleteRunes();
  return sold.count > 0;
}

/** Treant: the cheapest affordable fortification (castle defences, establishment towers, the spire). */
export function treantAutoFortify(): boolean {
  const s = useGameStore.getState();
  if (!s.autoSettings.autoFortify || !s.castleBuilt || nextConstruction(s)) return false;
  type Option = { cost: Partial<Resources>; run: () => boolean; label: string };
  const options: Option[] = [];
  for (const key of ['wallLevel', 'beaconLevel', 'shieldLevel'] as const) {
    const level = key === 'beaconLevel' ? beaconLevelOf(s.defense) : s.defense[key];
    const cost = castleUpgradeCost(key, level);
    if (cost) options.push({ cost, run: () => useGameStore.getState().upgradeDefense(key), label: key });
  }
  const towers: TowerId[] = [...BUILDING_IDS.filter((id) => (s.resourceBuildings[id]?.level ?? 0) >= 1), ...(s.spireBuilt ? (['SPIRE'] as TowerId[]) : [])];
  for (const id of towers) {
    const cost = towerUpgradeCost(id, towerLevelOf(towerBuildingOf(s, id)));
    if (cost) options.push({ cost, run: () => useGameStore.getState().upgradeTower(id), label: id });
  }
  // Only what the stores already cover (never buys a shortfall with coins)
  const pick = options.filter((o) => canAfford(s.resources, o.cost)).sort((a, b) => costSize(a.cost) - costSize(b.cost))[0];
  if (!pick || !pick.run()) return false;
  logMessage('autoFortified', { what: pick.label });
  return true;
}
