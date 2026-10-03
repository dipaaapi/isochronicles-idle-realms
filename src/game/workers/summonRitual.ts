import Phaser from 'phaser';

/** [width, height, lineWidth, color, alpha] of one glowing ground ring. */
type RitualRing = [number, number, number, number, number];

interface SummonRitual {
  rings: RitualRing[];
  ringOffsetY: number;
  ringStartScale: number;
  ringAlpha: number;
  ringDuration: number;
  /** Where the unit starts relative to its landing spot (negative = above). */
  dropY: number;
  startAlpha: number;
  startScale: number;
  duration: number;
  ease: string;
}

export const SUMMON_RITUALS = {
  // Support Healing Slime: Heavenly Descent
  AQUA_SLIME: {
    rings: [[82, 28, 3, 0x67e8f9, 0.9], [120, 42, 2, 0x22d3ee, 0.65], [160, 56, 1, 0x38bdf8, 0.5]],
    ringOffsetY: 8, ringStartScale: 0.35, ringAlpha: 0.9, ringDuration: 700,
    dropY: -450, startAlpha: 0.2, startScale: 0.4, duration: 1300, ease: 'Bounce.easeOut',
  },
  TREANT: {
    rings: [[96, 34, 3, 0x86efac, 0.9], [144, 50, 2, 0x22c55e, 0.65]],
    ringOffsetY: 8, ringStartScale: 0.25, ringAlpha: 0.95, ringDuration: 900,
    dropY: -360, startAlpha: 0, startScale: 0.35, duration: 1600, ease: 'Cubic.easeOut',
  },
  // Mother Ancient Ent General Summoning Emergence
  GENERAL: {
    rings: [[72, 26, 3, 0x22c55e, 0.95], [108, 38, 2, 0x86efac, 0.7], [140, 48, 1, 0xfbbf24, 0.6]],
    ringOffsetY: 6, ringStartScale: 0.25, ringAlpha: 0.95, ringDuration: 850,
    dropY: 8, startAlpha: 0, startScale: 0.15, duration: 1300, ease: 'Back.easeOut',
  },
} satisfies Record<string, SummonRitual>;

/** Glowing rings on the ground while the unit drops / grows into place, then `onLanded`. */
export const playSummonRitual = (
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container | undefined,
  container: Phaser.GameObjects.Container,
  at: { x: number; y: number },
  ringDepth: number,
  ritual: SummonRitual,
  onLanded: () => void
): void => {
  const ritualGfx = scene.add.graphics();
  ritualGfx.setPosition(at.x, at.y + ritual.ringOffsetY);
  ritualGfx.setDepth(ringDepth);
  for (const [w, h, lineWidth, color, alpha] of ritual.rings) {
    ritualGfx.lineStyle(lineWidth, color, alpha);
    ritualGfx.strokeEllipse(0, 0, w, h);
  }
  parent?.add(ritualGfx);

  container.y = at.y + ritual.dropY;
  container.alpha = ritual.startAlpha;
  container.setScale(ritual.startScale);
  ritualGfx.alpha = 0;
  ritualGfx.setScale(ritual.ringStartScale);

  scene.tweens.add({
    targets: container,
    y: at.y,
    alpha: 1,
    scaleX: 1,
    scaleY: 1,
    duration: ritual.duration,
    ease: ritual.ease,
    onComplete: onLanded,
  });
  scene.tweens.add({
    targets: ritualGfx,
    alpha: ritual.ringAlpha,
    scaleX: 1,
    scaleY: 1,
    duration: ritual.ringDuration,
    yoyo: true,
    repeat: 1,
    ease: 'Sine.easeInOut',
    onComplete: () => ritualGfx.destroy(),
  });
};
