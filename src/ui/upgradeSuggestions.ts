import { useGameStore } from '../state/useGameStore';
import { CastleUpgradeKey, TOWERS, beaconLevelOf, castleUpgradeCost, towerLevelOf, towerUpgradeCost } from '../state/defenseStats';
import type { CitadelTab } from './CitadelCommandModal';
import { FIGHTER_CLASSES, summonLock } from '../state/store/rosterSlice';
import {
  ECONOMY_CONFIG,
  RESOURCE_BUILDING_CONFIG,
  getUnitSummonCost,
  maxUnitsOfClass,
  slimeEvolutionCost,
  slimeEvolutionKillsRequired,
  techUpgradeCost,
} from '../state/economy';
import { canAfford } from '../state/resources';
import { RESEARCH_CATEGORIES } from '../data/researchConfig';
import { UNIT_CLASSES, TREANT_EVOLUTION, type UnitClass } from '../types/game';
import type { ResourceBuildingId, Resources, TowerId, UpgradesState } from '../types/state';
import type { TranslationKey } from '../i18n/translations';

type GameState = ReturnType<typeof useGameStore.getState>;

export type Category = 'summon' | 'research' | 'defense' | 'tower' | 'building' | 'evolution';

export interface Suggestion {
  key: string;
  level: number;
  category: Category;
  icon: string;
  title: string;
  cost: Partial<Resources>;
  tab: CitadelTab;
  apply: () => boolean;
}

export const CATEGORY_STYLE: Record<Category, { label: TranslationKey; chip: string }> = {
  summon: { label: 'enhanceCatSummon', chip: 'text-fuchsia-300 border-fuchsia-500/40 bg-fuchsia-950/40' },
  research: { label: 'enhanceCatResearch', chip: 'text-cyan-300 border-cyan-500/40 bg-cyan-950/40' },
  defense: { label: 'enhanceCatDefense', chip: 'text-amber-300 border-amber-500/40 bg-amber-950/40' },
  tower: { label: 'enhanceCatTower', chip: 'text-rose-300 border-rose-500/40 bg-rose-950/40' },
  building: { label: 'enhanceCatBuilding', chip: 'text-emerald-300 border-emerald-500/40 bg-emerald-950/40' },
  evolution: { label: 'enhanceCatEvolution', chip: 'text-sky-300 border-sky-500/40 bg-sky-950/40' },
};

const DEFENSES: Array<{ key: CastleUpgradeKey; icon: string; en: string; tl: string }> = [
  { key: 'wallLevel', icon: '🧱', en: 'Castle Wall', tl: 'Pader ng Kastilyo' },
  { key: 'beaconLevel', icon: '🗼', en: 'Provoke Beacon', tl: 'Tore ng Beacon' },
  { key: 'shieldLevel', icon: '🛡️', en: 'Arcane Shield', tl: 'Kalasag ng Kuta' },
];

/**
 * Every upgrade, summon and evolution the stockpile covers right now.
 * `includeDismissed` keeps the ones the player hid from the HUD (the Citadel overview shows all).
 */
export function buildUpgradeSuggestions(state: GameState, includeDismissed = false): Suggestion[] {
  const isTL = state.language === 'TL';
  const suggestions: Suggestion[] = [];
  // Only what the stockpile already covers, and not dismissed at this level
  const push = (s: Suggestion) => {
    if (!includeDismissed && (state.promptedUpgrades[s.key] || 0) >= s.level) return;
    if (!canAfford(state.resources, s.cost)) return;
    suggestions.push(s);
  };

  // Generals (one per standing establishment)
  FIGHTER_CLASSES.forEach((cls: UnitClass) => {
    const count = state.roster.filter((u) => u.unitClass === cls && !u.parentBuildingId && !u.id.startsWith('tenant_')).length;
    const max = maxUnitsOfClass(cls);
    if (count >= max || summonLock(state, cls)) return;
    const cfg = UNIT_CLASSES[cls];
    push({
      key: `summon_${cls}`,
      level: count + 1,
      category: 'summon',
      icon: '⚔️',
      title: `${isTL ? cfg.name : (cfg.nameEn ?? cfg.name)} (${count + 1}/${max})`,
      cost: getUnitSummonCost(cls, count),
      tab: 'MINIONS',
      apply: () => state.summonUnit(cls),
    });
  });

  // Slime & Treant evolution
  const slime = state.roster.find((u) => u.unitClass === 'AQUA_SLIME');
  if (slime) {
    const lvl = slime.slimeEvolutionLevel ?? 1;
    if (lvl < ECONOMY_CONFIG.slimeEvolution.maxLevel && state.invasion.invaderKills >= slimeEvolutionKillsRequired(lvl)) {
      push({
        key: 'evo_slime', level: lvl + 1, category: 'evolution', icon: '💧',
        title: `${isTL ? 'Ebolusyon ng Slime' : 'Slime Evolution'} Lv.${lvl + 1}`,
        cost: slimeEvolutionCost(lvl), tab: 'MINIONS', apply: state.upgradeSupportSlime,
      });
    }
  }
  const ent = state.roster.find((u) => u.unitClass === 'TREANT');
  if (ent) {
    const lvl = (ent.treantEvolutionLevel ?? 1) as 1 | 2 | 3 | 4 | 5;
    if (lvl < 5) {
      push({
        key: 'evo_ent', level: lvl + 1, category: 'evolution', icon: '🌳',
        title: `${isTL ? 'Ebolusyon ng Treant' : 'Treant Evolution'} Lv.${lvl + 1}`,
        cost: TREANT_EVOLUTION[lvl].upgradeCost, tab: 'MINIONS', apply: state.upgradeTreant,
      });
    }
  }

  // Research (every node plus the minion techs)
  const techNodes: Array<{ key: keyof UpgradesState; icon: string; en: string; tl: string; max: number }> = [
    { key: 'golemSpeedLevel', icon: '⚡', en: 'Minion Speed', tl: 'Bilis ng Alagad', max: Infinity },
    { key: 'golemCapacityLevel', icon: '🎒', en: 'Minion Capacity', tl: 'Kapasidad ng Alagad', max: Infinity },
    ...RESEARCH_CATEGORIES.flatMap((c) =>
      c.nodes.map((n) => ({ key: n.key, icon: n.icon, en: n.nameEnglish, tl: n.nameTagalog, max: n.maxLevel }))
    ),
  ];
  techNodes.forEach((n) => {
    const lvl = (state.upgrades[n.key] as number) ?? 1;
    if (lvl >= n.max) return;
    push({
      key: n.key, level: lvl + 1, category: 'research', icon: n.icon,
      title: `${isTL ? n.tl : n.en} Lv.${lvl + 1}`,
      cost: techUpgradeCost(n.key, lvl), tab: 'RESEARCH', apply: () => state.upgradeTech(n.key),
    });
  });

  // Castle defenses
  DEFENSES.forEach((d) => {
    const lvl = d.key === 'beaconLevel' ? beaconLevelOf(state.defense) : state.defense[d.key];
    const cost = castleUpgradeCost(d.key, lvl);
    if (!cost) return;
    push({
      key: d.key, level: lvl + 1, category: 'defense', icon: d.icon,
      title: `${isTL ? d.tl : d.en} Lv.${lvl + 1}`,
      cost, tab: 'CASTLE', apply: () => state.upgradeDefense(d.key),
    });
  });

  // Establishments: production level and tower level (only standing ones; Generals build new ones)
  (Object.keys(RESOURCE_BUILDING_CONFIG) as ResourceBuildingId[]).forEach((id) => {
    const cfg = RESOURCE_BUILDING_CONFIG[id];
    const name = isTL ? cfg.label : cfg.labelEn;
    const isSpire = (id as string) === 'SPIRE';
    const building = isSpire ? undefined : state.resourceBuildings[id];
    const built = isSpire ? state.spireBuilt : (building?.level ?? 0) >= 1;
    if (!built) return;

    if (!isSpire && building) {
      const cost = cfg.costs[building.level];
      if (cost) {
        push({
          key: `bld_${id}`, level: building.level + 1, category: 'building', icon: cfg.icon,
          title: `${name} Lv.${building.level + 1}`,
          cost, tab: 'CASTLE', apply: () => state.upgradeResourceBuilding(id),
        });
      }
    }

    const towerId = id as TowerId;
    if (!TOWERS[towerId]) return;
    const tLvl = isSpire ? state.spireTower?.towerLevel ?? 1 : towerLevelOf(building);
    const tCost = towerUpgradeCost(towerId, tLvl);
    if (!tCost) return;
    push({
      key: `tower_${id}`, level: tLvl + 1, category: 'tower', icon: cfg.icon,
      title: `${name} ${isTL ? 'Tore' : 'Tower'} Lv.${tLvl + 1}`,
      cost: tCost, tab: 'CASTLE', apply: () => state.upgradeTower(towerId),
    });
  });

  return suggestions;
}
