import Phaser from 'phaser';
import type { GridPoint, HarvestTask, TASK_CONFIG, UNIT_CLASSES, UnitClass, WorkerEquipment, WorkerStatus } from '../../types/game';
import type { GameStoreState, ResourceBuildingId, TowerId } from '../../types/state';
import type { NavAgent } from '../Navigation';
import type { ActiveInvader, InvasionManager } from '../InvasionManager';
import type { PortalManager } from '../PortalManager';

export interface SlimeMoraleBuffDef {
  id: string;
  name: string;
  nameTl: string;
  icon: string;
  color: string;
  hexColor: number;
  duration: number;
  maxDuration: number;
  speedMultiplier?: number;
  attackMultiplier?: number;
  armorShield?: number;
  regenPerSec?: number;
  critChance?: number;
  cooldownReduction?: number;
  cargoBonus?: number;
  infiniteStamina?: boolean;
  evasionChance?: number;
  buildRepairBonus?: number;
  deathDefiance?: boolean;
}

export interface WorkerInstance extends NavAgent {
  id: string;
  name: string;
  unitClass: UnitClass;
  assignedTask: HarvestTask;
  parentBuildingId?: ResourceBuildingId;
  container: Phaser.GameObjects.Container;
  lanternGfx: Phaser.GameObjects.Graphics;
  shadow: Phaser.GameObjects.Ellipse;
  body: Phaser.GameObjects.Graphics;
  /** 8-direction pixel sprite, attached once its sheet is baked (then `body` stays empty). */
  sprite?: Phaser.GameObjects.Sprite;
  /** Emote bubble / gauge anchor height; depends on the rendered body's height. */
  emoteBaseY: number;
  _prevX?: number;
  _prevY?: number;
  _workTimer?: number;
  cargoIcon: Phaser.GameObjects.Graphics;
  gaugeGfx: Phaser.GameObjects.Graphics; // Dual HP + Stamina floating gauge
  emoteBubble: Phaser.GameObjects.Container;
  emoteBg: Phaser.GameObjects.Graphics;
  emoteText: Phaser.GameObjects.Text;
  gridX: number;
  gridY: number;
  currentPath: GridPoint[];
  pathIndex: number;
  targetTile?: GridPoint;
  status: WorkerStatus;
  stateTimer: number;
  cargo: number;
  maxCargo: number;
  speed: number;
  bobOffset: number;
  buffTimer: number;
  activeSlimeBuff?: SlimeMoraleBuffDef;
  moraleBoostTimer?: number;
  overrideEmote: string | null;
  overrideEmoteTimer: number;
  // HP & Stamina
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  staminaDrain: number;
  restingZzzTimer: number;
  // Combat & support
  attackPower: number;
  combatCooldown: number;
  supportCooldown: number;
  resurrectionCooldown: number;
  supportEvolutionLevel: number;
  armorShield: number;
  armorShieldTimer: number;
  equipment?: WorkerEquipment;
  timeSinceLastTap: number;
  treantEvolutionLevel?: number;
  treantActionTimer?: number;
  constructionTimer?: number;
  treantMode?: 'REPAIR' | 'REPLENISH';
  treantTargetTile?: GridPoint;
  /** Establishment the Ent is currently patching up (undefined = castle / none). */
  treantRepairId?: TowerId;
  entGearTimer?: number;
  autoSummonTimer?: number;
  /** General looting: drop it is walking to, and drops it carries to the castle. */
  lootTargetId?: string;
  carriedLoot?: string[];
  skill1Cooldown?: number;
  skill2Cooldown?: number;
  ultimateCooldown?: number;
  // Skill status effects (seconds left)
  /** Stunned (Siege Stomp): cannot act. */
  stunTimer?: number;
  /** Temporal Stasis: moves and fights slower. */
  slowTimer?: number;
  slowFactor?: number;
  /** Seismic Taunt: takes 50% less damage. */
  armorBuffTimer?: number;
  /** Target Lock: takes 20% more damage. */
  markedTimer?: number;
  // Dirty-check cache: skip gauge / lantern redraws when nothing changed
  _gaugeHp: number;
  _gaugeMaxHp: number;
  _gaugeStamina: number;
  _gaugeMaxStamina: number;
  _lanternDarkness: number;
}

/** Establishment that must stand before a gathering task can be worked. */
export const TASK_BUILDING: Partial<Record<HarvestTask, ResourceBuildingId>> = {
  WOOD: 'WOOD',
  STONE: 'QUARRY',
  METAL: 'MINE',
  ESSENCE: 'CAVE',
  FISH: 'PORT',
  WATER: 'PORT',
};

/** Resource nodes the Ent can enrich (and whose position lives in the store). */
export type EnrichableNode = 'AETHER' | 'STONE' | 'WOOD' | 'ESSENCE';
export const isEnrichableTask = (task: HarvestTask): task is EnrichableNode =>
  task === 'AETHER' || task === 'STONE' || task === 'WOOD' || task === 'ESSENCE';

/** HP below which a minion stops fighting / working and waits for healing. */
export const CRITICAL_HP = 35;

/** Everything a behavior needs to know about one worker for the current frame. */
export interface WorkerFrame {
  store: GameStoreState;
  delta: number;
  deltaSec: number;
  config: typeof UNIT_CLASSES[UnitClass];
  taskCfg: typeof TASK_CONFIG[HarvestTask];
  effectiveSpeed: number;
  effectiveAttack: number;
  /** Stamina drain reduction in percent (0–100). */
  drainReduction: number;
  weatherDrainMult: number;
  isInvasionActive: boolean;
  aliveInvaders: ActiveInvader[];
}

/** The WorkerManager services the per-role behavior modules call back into. */
export interface WorkerContext {
  readonly scene: Phaser.Scene;
  readonly nexusGridPos: GridPoint;
  readonly invasionManager?: InvasionManager;
  readonly portals?: PortalManager;
  readonly groundLoot?: import('../GroundLootManager').GroundLootManager;
  readonly defenders?: import('../DefenderSystem').DefenderSystem;
  getNearestGroundLoot?(x: number, y: number, maxDist?: number, seeker?: import('../GroundLootManager').LootSeeker): import('../GroundLootManager').GroundLootItem | null;
  collectGroundLoot?(item: import('../GroundLootManager').GroundLootItem, name?: string): void;
  getWorkers(): WorkerInstance[];
  getDefenders?(): import('../DefenderSystem').Defender[];
  /** Free-roaming step toward a screen point; returns the remaining distance. */
  moveToward(worker: WorkerInstance, tx: number, ty: number, step: number, deltaSec: number): number;
  /** Follows `worker.currentPath`; calls onComplete on arrival. */
  handleMovement(worker: WorkerInstance, deltaSec: number, speed: number, onComplete: () => void): void;
  dispatchToNexus(worker: WorkerInstance): void;
  dispatchToTaskNode(worker: WorkerInstance): void;
  playMinionAttack(worker: WorkerInstance, targetX: number, targetY: number): void;
  spawnFloatingPopup(x: number, y: number, text: string, color?: string): void;
  spawnHarvestBurst(x: number, y: number, color?: number, count?: number): void;
}

