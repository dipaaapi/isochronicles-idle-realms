import Phaser from 'phaser';
import type { StructureManager } from '../StructureManager';
import { useGameStore } from '../../state/useGameStore';
import { logMessage } from '../../state/activityLog';
import { soundFx } from '../audio/soundFx';

/** Turns per second of the rotating light. */
const SPIN = 0.55;
const BEAM_LENGTH = 230;
const BEAM_SPREAD = 0.22;
/** The siren wails again every this many seconds while the fight lasts. */
const SIREN_REPEAT = 20;

/**
 * Red alert: while a battle is on (a wave, or raiding scouts between waves)
 * a siren lamp on the castle roof spins a pair of opposite red beams — one
 * sweeping in front of the citadel, one behind — and the alarm wails at the
 * start of the fight and now and then while it lasts.
 */
export class CastleAlarm {
  private back: Phaser.GameObjects.Graphics;
  private front: Phaser.GameObjects.Graphics;
  private angle = 0;
  private wasActive = false;
  private sirenTimer = 0;

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Container,
    private structures: StructureManager,
    private raiders: () => boolean
  ) {
    // Back beam under the lamp, front beam over it
    this.back = scene.add.graphics();
    this.front = scene.add.graphics();
    layer.add(this.back);
    layer.add(this.front);
  }

  update(deltaMs: number): void {
    const store = useGameStore.getState();
    const castle = this.structures.getCastleTarget();
    const active = !!castle && (store.invasion.isActive || this.raiders()) && store.defense.castleHp > 0;
    const dt = deltaMs / 1000;

    if (active && !this.wasActive) {
      soundFx.playAlarm(3);
      logMessage('battleAlarm');
      this.sirenTimer = SIREN_REPEAT;
    }
    this.wasActive = active;
    this.back.clear();
    this.front.clear();
    if (!active || !castle) return;

    this.sirenTimer -= dt;
    if (this.sirenTimer <= 0) {
      soundFx.playAlarm(1);
      this.sirenTimer = SIREN_REPEAT;
    }

    this.angle = (this.angle + dt * SPIN * Math.PI * 2) % (Math.PI * 2);
    // The castle's own siren lamp (the beacon dome in its voxel model, structureModels 'castle'):
    // its glowing pixels are found in the baked sprite
    const roof = this.structures.getCastleRoof() ?? { x: castle.x, y: castle.y - 100 };
    const lampX = roof.x;
    const lampY = roof.y;

    for (const beamAngle of [this.angle, this.angle + Math.PI]) {
      // Facing the viewer (+y on screen) = front
      const facing = Math.sin(beamAngle);
      const g = facing > 0 ? this.front : this.back;
      this.drawBeam(g, lampX, lampY, beamAngle, 0.12 + 0.18 * Math.max(0, facing));
    }

    // The model's lamp lights up: a pulsing red glow over the dome, no second lamp drawn
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(this.angle * 2));
    const g = this.front;
    g.fillStyle(0xff1a1a, 0.2 * pulse);
    g.fillCircle(lampX, lampY, 16);
    g.fillStyle(0xff4d4d, 0.35 * pulse);
    g.fillCircle(lampX, lampY, 7);
  }

  /** A beam cone squashed to the iso ground plane (y halved). */
  private drawBeam(g: Phaser.GameObjects.Graphics, x: number, y: number, a: number, alpha: number): void {
    const point = (ang: number, len: number) => ({
      x: x + Math.cos(ang) * len,
      y: y + Math.sin(ang) * len * 0.5,
    });
    const steps = [1, 0.66, 0.33];
    for (const k of steps) {
      const l = point(a - BEAM_SPREAD * k, BEAM_LENGTH);
      const r = point(a + BEAM_SPREAD * k, BEAM_LENGTH);
      g.fillStyle(0xff2020, alpha * (1.2 - k));
      g.fillTriangle(x, y, l.x, l.y, r.x, r.y);
    }
  }

  destroy(): void {
    this.back.destroy();
    this.front.destroy();
  }
}
