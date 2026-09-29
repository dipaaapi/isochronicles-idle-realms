import Phaser from 'phaser';
import type { GridPoint, InvaderType } from '../../types/game';
import type { WeatherType } from '../../types/state';
import type { NavAgent } from '../Navigation';
import type { StructureTarget } from '../StructureManager';
import type { PortalState } from '../PortalManager';
import type { WorkerInstance } from '../workers/types';

/** Something small that blocks invaders and can be hit (Sapling Grove summons). */
export interface InvaderBlocker {
  container: { x: number; y: number; active: boolean };
  hp: number;
  dead: boolean;
  takeHit: (damage: number) => void;
}

export type InvaderTarget =
  | { kind: 'worker'; worker: WorkerInstance }
  | { kind: 'blocker'; blocker: InvaderBlocker }
  | { kind: 'structure'; structure: StructureTarget };

export interface ActiveInvader extends NavAgent {
  id: string;
  type: InvaderType;
  name: string;
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  bodyGfx: Phaser.GameObjects.Graphics;
  /** 8-direction pixel-art sprite; absent when the sheet was still baking at spawn (bodyGfx is drawn instead). */
  sprite?: Phaser.GameObjects.Sprite;
  hpBarGfx: Phaser.GameObjects.Graphics;
  gridX: number;
  gridY: number;
  currentPath: GridPoint[];
  pathIndex: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  bountyCoins: number;
  attackTimer: number;
  isDead: boolean;
  isScout?: boolean;
  isRetreating?: boolean;
  spawnGrid: GridPoint;
  /** Full-size scale (bosses are bigger). */
  baseScale: number;
  /** Portal it came out of / will leave through. */
  portal?: PortalState;
  exitPortal?: PortalState;
  /** Seconds left stepping out of (emerge) or into (enter) a portal. */
  emerge?: number;
  enter?: number;
  /** Seconds left under the citadel's Provoke Beacon — must attack the citadel. */
  provokedTimer?: number;
  /** Rushers ignore defenders and establishments and charge straight at the citadel. */
  isRusher?: boolean;
  slowTimer?: number;
  slowFactor?: number;
  burnTimer?: number;
  burnDps?: number;
  burnTick?: number;
  target?: InvaderTarget;
  retargetTimer?: number;
  structPath?: GridPoint[];
  structGoal?: string;
  structTimer?: number;
}

/** Weather effects on invaders by category: rain rusts mecha, snow chills humans, heat enrages everyone. */
export const invaderWeather = (weather: WeatherType, category: string): { speed: number; damage: number } => ({
  speed: (weather === 'RAIN' && category === 'MECHA') || (weather === 'SNOW' && category === 'HUMAN') ? 0.85 : 1,
  damage: weather === 'HEATWAVE' ? 1.1 : 1,
});
