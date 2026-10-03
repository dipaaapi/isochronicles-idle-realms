import type { Navigation } from '../Navigation';
import type { StructureManager } from '../StructureManager';
import type { ActiveInvader, InvaderBlocker } from './types';

/** What the movement / targeting helpers need from InvasionManager. */
export interface InvaderContext {
  readonly nav?: Navigation;
  readonly structures?: StructureManager;
  getInvaders(): ActiveInvader[];
  getBlockers(): InvaderBlocker[];
  castleCenter(): { x: number; y: number };
  faceInvader(invader: ActiveInvader, dx: number, dy: number, moving: boolean): void;
  damageInvader(invader: ActiveInvader, rawDamage: number, popupText?: string): void;
  despawnEscaped(invader: ActiveInvader): void;
}
