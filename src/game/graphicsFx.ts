import Phaser from 'phaser';
import { useGraphicsSettings } from '../state/graphicsSettings';

/**
 * Applies the device graphics options to the world:
 *  • shadows — every ground shadow is tagged `fx-shadow` and shown/hidden together
 *  • glow    — a soft camera bloom (WebGL only; Canvas renderer just skips it)
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
  private bloom: Phaser.FX.Bloom | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private scene: Phaser.Scene) {
    this.apply();
    this.unsubscribe = useGraphicsSettings.subscribe((s, prev) => {
      if (s.shadows !== prev.shadows || s.glow !== prev.glow) this.apply();
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private apply(): void {
    const { shadows, glow } = useGraphicsSettings.getState();
    eachShadow(this.scene.children.list, (o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(shadows));

    const cam = this.scene.cameras.main;
    const webgl = this.scene.game.renderer.type === Phaser.WEBGL;
    if (!webgl || !cam.postFX) return;
    if (glow && !this.bloom) {
      // Gentle bloom: lifts bright magic, lava and lights without washing out the tiles
      this.bloom = cam.postFX.addBloom(0xffffff, 1, 1, 0.9, 0.55, 2);
    } else if (!glow && this.bloom) {
      cam.postFX.remove(this.bloom);
      this.bloom = null;
    }
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
