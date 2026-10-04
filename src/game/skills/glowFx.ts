import Phaser from 'phaser';
import { useGraphicsSettings } from '../../state/graphicsSettings';

type Point = { x: number; y: number };
type Layer = Phaser.GameObjects.Container;

/** Additive blend: bright where layers overlap, transparent elsewhere — a real glow, not a screen-wide brightness lift. */
const ADD = Phaser.BlendModes?.ADD ?? 1;

export const glowEnabled = (): boolean => useGraphicsSettings.getState().glow;

function additive(g: Phaser.GameObjects.Graphics): Phaser.GameObjects.Graphics {
  // Optional call: the headless logic tests pass bare stub objects
  g.setBlendMode?.(ADD);
  return g;
}

/**
 * Soft radial halo: stacked low-alpha ellipses drawn additively so the centre
 * burns bright and the edge fades out. No-op when the Glow setting is off.
 */
export function halo(scene: Phaser.Scene, layer: Layer, at: Point, radiusPx: number, color: number, duration = 500, lift = 0): void {
  if (!glowEnabled()) return;
  const g = additive(scene.add.graphics());
  const steps = 6;
  for (let i = steps; i >= 1; i--) {
    const r = (radiusPx * i) / steps;
    g.fillStyle(color, 0.09);
    g.fillEllipse(0, 0, r * 2, r);
  }
  g.fillStyle(0xffffff, 0.12);
  g.fillEllipse(0, 0, radiusPx * 0.5, radiusPx * 0.25);
  g.setPosition(at.x, at.y - lift);
  layer.add(g);
  scene.tweens.add({ targets: g, alpha: 0, scale: 1.15, duration, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
}

/** Radial spark burst that flies outward on the ground plane (iso-squashed). */
export function sparkBurst(scene: Phaser.Scene, layer: Layer, at: Point, color: number, count: number, reachPx: number, lift = 10): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const d = reachPx * (0.6 + Math.random() * 0.5);
    const g = scene.add.graphics();
    if (glowEnabled()) additive(g);
    const s = 2 + Math.random() * 2.5;
    g.fillStyle(i % 4 === 0 ? 0xffffff : color, 1);
    g.fillRect(-s / 2, -s / 2, s, s);
    g.setPosition(at.x, at.y - lift);
    layer.add(g);
    scene.tweens.add({
      targets: g,
      x: at.x + Math.cos(a) * d,
      y: at.y - lift + Math.sin(a) * d * 0.5 - Math.random() * 12,
      alpha: 0,
      scale: 0.3,
      duration: 380 + Math.random() * 260,
      ease: 'Cubic.easeOut',
      onComplete: () => g.destroy(),
    });
  }
}

/** Spinning rune circle under a caster while it channels a skill. */
export function runeCircle(scene: Phaser.Scene, layer: Layer, at: Point, radiusPx: number, color: number): void {
  const g = scene.add.graphics();
  const w = radiusPx * 2;
  const h = radiusPx;
  g.lineStyle(2, color, 0.95);
  g.strokeEllipse(0, 0, w, h);
  g.lineStyle(1, color, 0.7);
  g.strokeEllipse(0, 0, w * 0.72, h * 0.72);
  // Six rune ticks between the rings
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    g.lineBetween(c * w * 0.36, s * h * 0.36, c * w * 0.5, s * h * 0.5);
  }
  g.fillStyle(color, 0.16);
  g.fillEllipse(0, 0, w, h);
  g.setPosition(at.x, at.y);
  g.setScale(0.3);
  layer.add(g);
  scene.tweens.add({
    targets: g,
    scale: 1,
    angle: 0,
    duration: 260,
    ease: 'Back.easeOut',
    onComplete: () => scene.tweens.add({ targets: g, alpha: 0, scaleX: 1.2, scaleY: 1.2, duration: 520, delay: 240, onComplete: () => g.destroy() }),
  });
  halo(scene, layer, at, radiusPx * 1.3, color, 800);
}

/** Caster wind-up: a quick crouch-and-spring squash on the unit's container. */
export function castPop(scene: Phaser.Scene, target: Phaser.GameObjects.Container): void {
  if (!target?.active || target.getData?.('castPop')) return;
  target.setData?.('castPop', true);
  const sx = target.scaleX, sy = target.scaleY;
  scene.tweens.add({
    targets: target,
    scaleX: sx * 1.18,
    scaleY: sy * 0.82,
    duration: 90,
    yoyo: true,
    ease: 'Quad.easeOut',
    onComplete: () => {
      scene.tweens.add({
        targets: target,
        scaleX: sx * 0.92,
        scaleY: sy * 1.12,
        duration: 110,
        yoyo: true,
        ease: 'Sine.easeOut',
        onComplete: () => { target.setScale(sx, sy); target.setData?.('castPop', false); },
      });
    },
  });
}
