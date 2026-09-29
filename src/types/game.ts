import seasons from '../data/seasons.json';
import slimeEvolution from '../data/slimeEvolution.json';
import treantEvolution from '../data/treantEvolution.json';
import godBlessings from '../data/godBlessings.json';
import craftableItems from '../data/craftableItems.json';

/**
 * Shared game types. The lookup tables live in src/data/ (JSON for text-heavy
 * tables, TS modules where hex colors keep them readable) and are re-exported
 * here so callers keep importing from one place.
 */
export { PLATFORM_CONFIGS } from '../data/platforms';
export { TASK_NODE_LOCATIONS, TASK_CONFIG } from '../data/tasks';
export { UNIT_CLASSES } from '../data/units';
export { INVADER_CONFIGS } from '../data/invaders';

export interface GridPoint {
  x: number;
  y: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export type TileType =
  | 'VOID'
  | 'AETHER_GRASS'
  | 'ANCIENT_STONE'
  | 'NEXUS_BASE'
  | 'AETHER_CRYSTAL'
  | 'ANCIENT_GROVE'
  | 'RUNIC_PILLAR'
  | 'MYSTIC_CAVE'
  | 'OCEAN_BLOCK'
  | 'SPAWN_BLOCK'
  | 'BARRACKS';

export const SEASON_CONFIGS = seasons;

export type EquipmentSlot = 'TOOL' | 'ARMOR' | 'RELIC';

export interface EquipmentStats {
  bonusSpeed?: number;
  bonusCargo?: number;
  bonusAttack?: number;
  bonusHp?: number;
  bonusGatherPercent?: number;
  staminaDrainReduction?: number;
}

export interface EquipmentItem {
  id: string;
  name: string;
  slot: EquipmentSlot;
  description: string;
  icon: string;
  stats: EquipmentStats;
  costResources: {
    shards?: number;
    wood?: number;
    stone?: number;
    essence?: number;
  };
  costCoins?: number;
}

export interface WorkerEquipment {
  tool?: EquipmentItem;
  armor?: EquipmentItem;
  relic?: EquipmentItem;
}

export interface TileInfo {
  x: number;
  y: number;
  type: TileType;
  walkable: boolean;
  elevation: number;
}

export type WorkerStatus =
  | 'IDLE'
  | 'MOVING_TO_NODE'
  | 'HARVESTING'
  | 'RETURNING_TO_NEXUS'
  | 'COMBAT'
  | 'HEALING';

export type HarvestTask = 'AETHER' | 'WOOD' | 'STONE' | 'METAL' | 'ESSENCE' | 'FISH' | 'WATER' | 'HEAL' | 'BUILD';

export type UnitClass = 'GOLEM' | 'WAYFARER' | 'CHRONO' | 'AQUA_SLIME' | 'MERMAN' | 'NECROMANCER' | 'TREANT';

export interface SlimeSupportProfile {
  level: 1 | 2 | 3 | 4 | 5;
  healTargets: number;
  healPercent: number;
  fatigueRestorePercent: number;
  speedBonusPercent: number;
  armorPercent: number;
  armorDurationSeconds: number;
  resurrectionCooldownSeconds: number;
  resurrectionCost: {
    aetherShards: number;
    arcaneEssence: number;
    wood: number;
    stone: number;
  };
  label: string;
}

export const SUPPORT_SLIME_EVOLUTION = slimeEvolution as unknown as Record<1 | 2 | 3 | 4 | 5, SlimeSupportProfile>;

export interface TreantEvolutionProfile {
  level: 1 | 2 | 3 | 4 | 5;
  label: string;
  labelEn: string;
  repairAmount: number;
  replenishCooldownSeconds: number;
  castleRepairCooldownSeconds: number;
  enrichmentMultiplier: number;
  castleMajestyBonus: number; // Percent bonus to global realm productivity when castle is at peak condition
  upgradeCost: {
    aetherShards: number;
    wood: number;
    stone: number;
    coins: number;
  };
}

export const TREANT_EVOLUTION = treantEvolution as unknown as Record<1 | 2 | 3 | 4 | 5, TreantEvolutionProfile>;

export type GodBlessingId = 'CELESTIAL_HARVEST' | 'AEGIS_WRATH' | 'TITAN_AWAKENING';

export interface GodBlessingConfig {
  id: GodBlessingId;
  name: string;
  nameEn: string;
  category: 'GATHERING' | 'INVASION' | 'MINIONS';
  icon: string;
  color: string;
  description: string;
  descriptionEn: string;
  durationSeconds: number;
  costResources: {
    aetherShards: number;
    arcaneEssence: number;
    coins: number;
  };
}

export const GOD_BLESSINGS = godBlessings as unknown as Record<GodBlessingId, GodBlessingConfig>;

export interface UnitClassConfig {
  classType: UnitClass;
  name: string;
  nameEn?: string;
  subtitle: string;
  subtitleEn?: string;
  description: string;
  descriptionEn?: string;
  baseSpeed: number;
  cargoCapacity: number;
  staminaDrainRate: number;
  lanternRadius: number;
  lanternColor: number;
  lanternHex: string;
  preferredTask: HarvestTask;
  requiredNexusLevel: number;
  requiredRefineryLevel: number;
  iconEmoji: string;
  baseHp: number;
  baseAttack: number;
  attackRange: number;
}

export interface WorkerData {
  id: string;
  name: string;
  unitClass: UnitClass;
  assignedTask: HarvestTask;
  gridX: number;
  gridY: number;
  screenX: number;
  screenY: number;
  status: WorkerStatus;
  cargo: number;
  maxCargo: number;
  stamina: number;
  maxStamina: number;
  harvestProgress: number;
}

export type InvaderType = 'HUMAN_KNIGHT' | 'HUMAN_ARCHER' | 'MECHA_SCOUT' | 'MECHA_TITAN' | 'VOID_SHADE' | 'RIFT_STALKER' | 'CORRUPTED_GOLEM' | 'DEEP_ONE';

export interface InvaderConfig {
  type: InvaderType;
  name: string;
  nameEn?: string;
  category: 'HUMAN' | 'MECHA';
  subtitle: string;
  subtitleEn?: string;
  description: string;
  descriptionEn?: string;
  hp: number;
  speed: number;
  damage: number;
  attackRange: number;
  color: number;
  hexColor: string;
  bountyCoins: number;
  iconEmoji: string;
  requiredNexusLevel: number;
}

export interface TurretBolt {
  id: string;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  progress: number;
  damage: number;
}

export const CRAFTABLE_ITEMS = craftableItems as unknown as EquipmentItem[];
