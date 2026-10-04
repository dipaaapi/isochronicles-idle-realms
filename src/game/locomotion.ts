import type Phaser from 'phaser';
import config from '../data/locomotion.json';
import { isWaterTile } from '../state/buildingLayout';
import { IsometricHelper } from './IsometricHelper';

/**
 * How a unit carries itself (src/data/locomotion.json): winged and floating
 * units fly above their shadow, water-type units swim waist-deep in the ocean
 * and canals, everyone else walks. Shared by minions, tenants and invaders.
 */
export type Locomotion = 'fly' | 'swim' | 'walk';

const FLY = new Set<string>(config.fly);
const SWIM = new Set<string>(config.swim);

export const locomotionOf = (kind: string): Locomotion => (FLY.has(kind) ? 'fly' : SWIM.has(kind) ? 'swim' : 'walk');

/** True when a world-space point (island container coords) lies on ocean or canal water. */
export const isOnWater = (x: number, y: number): boolean => {
  const g = IsometricHelper.screenToGrid(x, y);
  return isWaterTile(Math.round(g.x), Math.round(g.y));
};

/**
 * Vertical sprite offset for this frame, and the matching shadow / waterline
 * treatment. `x`, `y` are the unit's world position (for the water check).
 */
export function applyLocomotion(
  sprite: Phaser.GameObjects.Sprite,
  shadow: Phaser.GameObjects.Ellipse | undefined,
  kind: Locomotion,
  time: number,
  phase: number,
  x: number,
  y: number
): number {
  if (kind === 'fly') {
    if (sprite.isCropped) sprite.setCrop();
    if (shadow) {
      if (shadow.getData('baseScaleX') === undefined) shadow.setData('baseScaleX', shadow.scaleX);
      const base = shadow.getData('baseScaleX') as number;
      shadow.setVisible(true).setScale(base * config.flyShadowScale);
    }
    return -(config.flyHeight + Math.sin(time / 220 + phase) * config.flyHover);
  }

  if (kind === 'swim' && isOnWater(x, y)) {
    // Hide everything below the waterline and sink the sprite so the cut sits at its feet
    const fh = sprite.frame.height;
    const keep = fh * (1 - config.swimDepth);
    sprite.setCrop(0, 0, sprite.frame.width, keep);
    shadow?.setVisible(false);
    const sink = (sprite.originY * fh - keep) * sprite.scaleY;
    return Math.max(0, sink) + Math.sin(time / 300 + phase) * config.swimBob;
  }

  if (sprite.isCropped) sprite.setCrop();
  shadow?.setVisible(true);
  return 0;
}
