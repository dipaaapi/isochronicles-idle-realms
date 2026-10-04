import Phaser from 'phaser';
import { halo, sparkBurst } from './glowFx';
import { ESTABLISHMENT_SKILLS, type EstablishmentSkillDef } from '../../data/establishmentSkills';

type Point = { x: number; y: number };

/** Skills that buff every minion: their aura follows each minion. */
const MINION_BUFFS = new Set([
  'MINE_IRON_SKIN',
  'WOOD_NATURE_SURGE',
  'KENNEL_BLOOD_FRENZY',
  'KENNEL_CERBERUS_UNLEASHED',
  'SPIRE_TEMPORAL_SUPERNOVA',
]);
/** Skills that harden every structure: their aura sits on every building. */
const STRUCTURE_BUFFS = new Set(['QUARRY_STONE_FORTRESS']);

/** Fallback aura length for buffs whose data has no effectDuration. */
const BUFF_SECONDS: Record<string, number> = {
  QUARRY_STONE_FORTRESS: 20,
  MINE_IRON_SKIN: 15,
  WOOD_NATURE_SURGE: 12,
  KENNEL_BLOOD_FRENZY: 12,
  KENNEL_CERBERUS_UNLEASHED: 15,
  PERCH_EAGLE_EYE: 10,
  CRYPT_CORPSE_EXPLOSION: 15,
  SPIRE_ARCANE_OVERCHARGE: 10,
  SPIRE_OVERCHARGE: 10,
  TRENCH_TIDAL_SURGE: 8,
};

const SKILL_DEFS: Record<string, EstablishmentSkillDef> = Object.fromEntries(
  Object.values(ESTABLISHMENT_SKILLS).flatMap((trio) => [trio.skill1, trio.skill2, trio.skill3].map((s) => [s.id, s]))
);

export const skillDef = (id: string): EstablishmentSkillDef | undefined => SKILL_DEFS[id];

interface Aura {
  color: number;
  left: number;
  tick: number;
  /** Where the aura pulses each tick (re-read so it follows moving minions). */
  anchors: () => Point[];
}

/**
 * Visuals for establishment / citadel skill casts: a burst at the caster,
 * sparks on every invader the skill touched, and a pulsing aura for the
 * length of timed buffs. Shapes only — no floating text over the map.
 */
export class SkillCastFx {
  private auras: Aura[] = [];

  constructor(
    private scene: Phaser.Scene,
    private layer: Phaser.GameObjects.Container,
    private tilePx: number
  ) {}

  /** Plays the cast burst and starts the skill's aura, if it has one. */
  cast(id: string, origin: Point, extra: { minions: () => Point[]; structures: () => Point[] }): void {
    const def = skillDef(id);
    const color = Phaser.Display.Color.HexStringToColor(def?.activeColor ?? '#a855f7').color;
    const ult = !!def?.isUltimate;

    this.groundFlash(origin, ult ? 4 : 2.2, color);
    this.shockwave(origin, ult ? 7 : 3.5, color, 0);
    this.shockwave(origin, ult ? 5 : 2.4, 0xffffff, 140);
    if (ult) this.shockwave(origin, 9, color, 280);
    this.sparkColumn(origin, color, ult ? 22 : 12);
    halo(this.scene, this.layer, origin, this.tilePx * (ult ? 5 : 3), color, ult ? 1100 : 750);
    sparkBurst(this.scene, this.layer, origin, color, ult ? 24 : 12, this.tilePx * (ult ? 4 : 2.2));
    if (ult) this.scene.cameras.main.shake(260, 0.004);

    const seconds = def?.effectDuration || BUFF_SECONDS[id] || 0;
    if (seconds > 0) {
      const anchors = MINION_BUFFS.has(id)
        ? extra.minions
        : STRUCTURE_BUFFS.has(id)
        ? extra.structures
        : () => [origin];
      this.auras.push({ color, left: seconds, tick: 0, anchors });
    }
  }

  /** Small burst on an invader the skill damaged, froze or slowed. */
  hit(at: Point, colorHex: string | undefined): void {
    const color = Phaser.Display.Color.HexStringToColor(colorHex ?? '#ffffff').color;
    const g = this.scene.add.graphics();
    g.fillStyle(color, 0.85);
    g.fillCircle(0, 0, 7);
    g.lineStyle(2, 0xffffff, 0.9);
    g.strokeCircle(0, 0, 9);
    g.setPosition(at.x, at.y - 14);
    this.layer.add(g);
    this.scene.tweens.add({ targets: g, scale: 2.2, alpha: 0, duration: 380, ease: 'Cubic.easeOut', onComplete: () => g.destroy() });
    halo(this.scene, this.layer, at, this.tilePx * 0.9, color, 380, 14);
    sparkBurst(this.scene, this.layer, at, color, 6, this.tilePx * 0.7, 14);
  }

  update(dt: number): void {
    for (const aura of [...this.auras]) {
      aura.left -= dt;
      if (aura.left <= 0) {
        this.auras = this.auras.filter((a) => a !== aura);
        continue;
      }
      aura.tick -= dt;
      if (aura.tick > 0) continue;
      aura.tick = 0.7;
      for (const p of aura.anchors()) this.pulse(p, aura.color);
    }
  }

  destroy(): void {
    this.auras = [];
  }

  // ── Shapes ──────────────────────────────────────────────────────────────────

  private ellipse(g: Phaser.GameObjects.Graphics, radiusTiles: number, fill: boolean): void {
    const w = radiusTiles * this.tilePx * 2.2;
    const h = radiusTiles * this.tilePx * 1.1;
    if (fill) g.fillEllipse(0, 0, w, h);
    else g.strokeEllipse(0, 0, w, h);
  }

  private groundFlash(at: Point, radiusTiles: number, color: number): void {
    const g = this.scene.add.graphics();
    g.fillStyle(color, 0.35);
    this.ellipse(g, radiusTiles, true);
    g.setPosition(at.x, at.y);
    this.layer.add(g);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 900, ease: 'Quad.easeIn', onComplete: () => g.destroy() });
  }

  private shockwave(at: Point, radiusTiles: number, color: number, delay: number): void {
    const g = this.scene.add.graphics();
    g.lineStyle(4, color, 0.95);
    this.ellipse(g, radiusTiles, false);
    g.setPosition(at.x, at.y);
    g.setScale(0.15);
    g.setAlpha(delay > 0 ? 0 : 1);
    this.layer.add(g);
    this.scene.tweens.add({
      targets: g,
      scale: 1,
      alpha: { from: 1, to: 0 },
      delay,
      duration: 750,
      ease: 'Cubic.easeOut',
      onComplete: () => g.destroy(),
    });
  }

  private sparkColumn(at: Point, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const g = this.scene.add.graphics();
      const size = 2 + Math.random() * 3;
      g.fillStyle(i % 3 === 0 ? 0xffffff : color, 1);
      g.fillRect(-size / 2, -size / 2, size, size);
      g.setPosition(at.x + (Math.random() - 0.5) * this.tilePx * 1.6, at.y - 6);
      this.layer.add(g);
      this.scene.tweens.add({
        targets: g,
        y: at.y - 50 - Math.random() * 60,
        alpha: 0,
        delay: Math.random() * 250,
        duration: 700 + Math.random() * 500,
        ease: 'Quad.easeOut',
        onComplete: () => g.destroy(),
      });
    }
  }

  private pulse(at: Point, color: number): void {
    const g = this.scene.add.graphics();
    g.fillStyle(color, 0.18);
    this.ellipse(g, 0.7, true);
    g.lineStyle(2, color, 0.85);
    this.ellipse(g, 0.7, false);
    g.setPosition(at.x, at.y);
    g.setScale(0.6);
    this.layer.add(g);
    this.scene.tweens.add({ targets: g, scale: 1.25, alpha: 0, duration: 650, ease: 'Sine.easeOut', onComplete: () => g.destroy() });
  }
}
