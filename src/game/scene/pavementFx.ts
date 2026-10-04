import Phaser from 'phaser';

export type PavementFxStyle = 'FLASH' | 'RUNE' | 'DUST' | 'SHARDS';
export const PAVEMENT_FX_STYLES: PavementFxStyle[] = ['FLASH', 'RUNE', 'DUST', 'SHARDS'];

/** One random style per paving, so foundations don't all look the same. */
export const pickPavementFxStyle = (): PavementFxStyle => Phaser.Utils.Array.GetRandom(PAVEMENT_FX_STYLES);

const fade = (scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, props: Record<string, unknown>, duration: number) => {
  scene.tweens.add({ targets: target, ...props, duration, ease: 'Cubic.easeOut', onComplete: () => target.destroy() });
};

const diamondPath = (g: Phaser.GameObjects.Graphics, x: number, y: number, hw: number, hh: number) => {
  g.beginPath();
  g.moveTo(x, y - hh);
  g.lineTo(x + hw, y);
  g.lineTo(x, y + hh);
  g.lineTo(x - hw, y);
  g.closePath();
};

/** Effect on a freshly paved tile, in one of four styles. */
export const spawnPavementTileFx = (
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  x: number,
  y: number,
  color: number,
  style: PavementFxStyle = 'FLASH'
): void => {
  if (style === 'RUNE') {
    // Glowing rune outline that tightens, with a cross glyph inside
    const rune = scene.add.graphics();
    rune.lineStyle(1.5, color, 0.95);
    diamondPath(rune, 0, 0, 16, 8);
    rune.strokePath();
    rune.lineStyle(1, color, 0.8);
    rune.lineBetween(-6, 0, 6, 0);
    rune.lineBetween(0, -3, 0, 3);
    rune.setPosition(x, y).setScale(1.4);
    layer.add(rune);
    fade(scene, rune, { scaleX: 0.7, scaleY: 0.7, alpha: 0 }, 480);
    return;
  }

  if (style === 'DUST') {
    // Stone dust puffs settling outward
    for (let i = 0; i < 4; i++) {
      const puff = scene.add.circle(x + Phaser.Math.Between(-6, 6), y + Phaser.Math.Between(-3, 3), Phaser.Math.FloatBetween(2.5, 4), 0xd6cfc4, 0.55);
      layer.add(puff);
      fade(scene, puff, {
        x: puff.x + Phaser.Math.Between(-14, 14),
        y: puff.y + Phaser.Math.Between(-6, 4),
        scale: 2,
        alpha: 0,
      }, Phaser.Math.Between(420, 620));
    }
    return;
  }

  if (style === 'SHARDS') {
    // Small crystal shards popping up and falling back
    for (let i = 0; i < 3; i++) {
      const shard = scene.add.triangle(x + Phaser.Math.Between(-9, 9), y + Phaser.Math.Between(-4, 4), 0, 6, 2, 0, 4, 6, color, 0.9);
      layer.add(shard);
      scene.tweens.add({
        targets: shard,
        y: shard.y - Phaser.Math.Between(8, 16),
        angle: Phaser.Math.Between(-90, 90),
        duration: 220,
        ease: 'Quad.easeOut',
        yoyo: true,
        onComplete: () => shard.destroy(),
      });
    }
    return;
  }

  const flash = scene.add.graphics();
  flash.lineStyle(2, color, 0.9);
  flash.fillStyle(color, 0.45);
  diamondPath(flash, x, y, 18, 9);
  flash.fillPath();
  flash.strokePath();
  layer.add(flash);
  fade(scene, flash, { alpha: 0, scaleX: 1.15, scaleY: 1.15 }, 350);

  // Rise sparkles
  for (let i = 0; i < 3; i++) {
    const spark = scene.add.circle(
      x + Phaser.Math.Between(-10, 10),
      y + Phaser.Math.Between(-5, 5),
      Phaser.Math.FloatBetween(1.2, 2.4),
      color,
      0.9
    );
    layer.add(spark);
    fade(scene, spark, { y: spark.y - Phaser.Math.Between(12, 24), alpha: 0, scale: 0.2 }, Phaser.Math.Between(300, 500));
  }
};

/** Ring + spark burst when a whole foundation finishes paving. */
export const spawnPavementBurst = (scene: Phaser.Scene, layer: Phaser.GameObjects.Container, x: number, y: number): void => {
  const burst = scene.add.graphics();
  burst.lineStyle(2.5, 0x67e8f9, 0.85);
  burst.strokeCircle(x, y, 12);
  layer.add(burst);

  scene.tweens.add({
    targets: burst,
    scaleX: 2.6,
    scaleY: 2.6,
    alpha: 0,
    duration: 500,
    ease: 'Cubic.easeOut',
    onComplete: () => burst.destroy(),
  });

  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const spark = scene.add.circle(x, y, 2.2, 0xfacc15, 0.95);
    layer.add(spark);
    scene.tweens.add({
      targets: spark,
      x: x + Math.cos(angle) * 32,
      y: y + Math.sin(angle) * 20 - 8,
      alpha: 0,
      duration: 450,
      ease: 'Cubic.easeOut',
      onComplete: () => spark.destroy(),
    });
  }
};
