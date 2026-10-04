import Phaser from 'phaser';
import { useGraphicsSettings } from '../state/graphicsSettings';

/**
 * Applies the device graphics options to the world:
 *  • shadows — every ground shadow is tagged `fx-shadow` and shown/hidden together
 *  • glow    — additive halos on skill/combat effects (skills/glowFx.ts reads the setting per effect)
 * Brightness is a CSS filter on the canvas wrapper (PhaserGame.tsx), so it costs nothing here.
 */
export const SHADOW_NAME = 'fx-shadow';

/** Tag a freshly created ground shadow so the toggle can find it. */
export function markShadow<T extends Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible>(obj: T): T {
  // Optional calls: the headless logic tests pass bare stub objects
  obj.setName?.(SHADOW_NAME);
  obj.setVisible?.(useGraphicsSettings.getState().shadows);
  return obj;
}

function eachShadow(list: Phaser.GameObjects.GameObject[], fn: (o: Phaser.GameObjects.GameObject) => void): void {
  for (const obj of list) {
    if (obj.name === SHADOW_NAME) fn(obj);
    if (obj instanceof Phaser.GameObjects.Container) eachShadow(obj.list, fn);
  }
}

export class GraphicsFx {
  private unsubscribe: (() => void) | null = null;

  constructor(private scene: Phaser.Scene) {
    this.apply();
    this.unsubscribe = useGraphicsSettings.subscribe((s, prev) => {
      if (s.shadows !== prev.shadows) this.apply();
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private apply(): void {
    const { shadows } = useGraphicsSettings.getState();
    eachShadow(this.scene.children.list, (o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(shadows));
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
