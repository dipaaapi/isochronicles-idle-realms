import Phaser from 'phaser';

/** Flash + rising sparks on a freshly paved tile. */
export const spawnPavementTileFx = (scene: Phaser.Scene, layer: Phaser.GameObjects.Container, x: number, y: number, color: number): void => {
  const flash = scene.add.graphics();
  flash.lineStyle(2, color, 0.9);
  flash.fillStyle(color, 0.45);
  const hw = 18;
  const hh = 9;
  flash.beginPath();
  flash.moveTo(x, y - hh);
  flash.lineTo(x + hw, y);
  flash.lineTo(x, y + hh);
  flash.lineTo(x - hw, y);
  flash.closePath();
  flash.fillPath();
  flash.strokePath();
  layer.add(flash);

  scene.tweens.add({
    targets: flash,
    alpha: 0,
    scaleX: 1.15,
    scaleY: 1.15,
    duration: 350,
    ease: 'Quad.easeOut',
    onComplete: () => flash.destroy(),
  });

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
    scene.tweens.add({
      targets: spark,
      y: spark.y - Phaser.Math.Between(12, 24),
      alpha: 0,
      scale: 0.2,
      duration: Phaser.Math.Between(300, 500),
      ease: 'Cubic.easeOut',
      onComplete: () => spark.destroy(),
    });
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
