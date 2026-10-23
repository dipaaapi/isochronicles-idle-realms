import Phaser from 'phaser';

/**
 * Hit feedback without the white-out flash: a short knock (sprite jitters a
 * couple of pixels) and a soft warm tint that keeps the art readable.
 * Safe to call on every hit — overlapping calls reuse the original position.
 */
export function hitReaction(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image,
  opts: { tint?: number; ms?: number; knock?: number; restoreTint?: () => void } = {}
): void {
  if (!sprite.active) return;
  const ms = opts.ms ?? 110;
  const baseX = (sprite.getData('hitBaseX') as number | undefined) ?? sprite.x;
  sprite.setData('hitBaseX', baseX);
  // Remember the unit's own tint once, so overlapping hits restore it rather than clearing it
  if (sprite.getData('hitTint') === undefined) sprite.setData('hitTint', sprite.isTinted ? sprite.tintTopLeft : null);
  sprite.setTint(opts.tint ?? 0xffb3a7);
  const knock = opts.knock ?? 2;
  if (knock !== 0) scene.tweens.add({
    targets: sprite,
    x: { from: baseX + knock, to: baseX },
    duration: ms,
    ease: 'Sine.easeOut',
    onComplete: () => {
      if (!sprite.active) return;
      sprite.x = baseX;
      sprite.setData('hitBaseX', undefined);
    },
  });
  scene.time.delayedCall(ms, () => {
    if (!sprite.active) return;
    const own = sprite.getData('hitTint') as number | null | undefined;
    sprite.setData('hitTint', undefined);
    if (opts.restoreTint) opts.restoreTint();
    else if (typeof own === 'number') sprite.setTint(own);
    else sprite.clearTint();
  });
}

/**
 * Hit feedback for map fixtures (castle, establishments, towers, portals, sentinels):
 * a brief light-red tint only. Never moves, scales or rotates the sprite, so fixed
 * structures stay exactly on their tile anchor no matter how many hits land.
 */
export function fixedHitFlash(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image,
  restoreTint?: () => void
): void {
  hitReaction(scene, sprite, { knock: 0, ms: 150, tint: 0xff9a9a, restoreTint });
}
