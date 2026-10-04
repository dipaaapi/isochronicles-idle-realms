import Phaser from 'phaser';
import { Navigation } from './Navigation';
import type { PortalState } from './PortalManager';
import { PORTAL_DEFENSE } from '../state/portalDefense';
import { rectContainsTile } from '../state/buildingLayout';

const CFG = PORTAL_DEFENSE.mist;

interface Puff {
  x: number;
  y: number;
  r: number;
  phase: number;
  drift: number;
}

interface MistZone {
  portal: PortalState;
  density: number;
  revealTimer: number;
  puffs: Puff[];
}

/**
 * Fog over each rift's 4×4 zone: it hides the rift, its Rift Sentinels and
 * the Technicians working there. It lifts while a wave is on, for a few
 * seconds when a scout comes through, and thins under the mouse so the player
 * can peek; then it rolls back in.
 */
export class RiftMist {
  private zones: MistZone[];
  private g: Phaser.GameObjects.Graphics;
  private elapsed = 0;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, portals: readonly PortalState[]) {
    this.g = scene.add.graphics();
    layer.add(this.g);
    this.zones = portals.map((portal) => {
      const z = portal.site.zone;
      const puffs: Puff[] = [];
      for (let i = 0; i < CFG.puffs; i++) {
        // Spread over the zone's diamond and up to the top of the rift
        const p = Navigation.toWorld(z.x - 0.3 + Math.random() * (z.w - 0.4), z.y - 0.3 + Math.random() * (z.h - 0.4));
        puffs.push({ x: p.x, y: p.y - Math.random() * 120, r: 16 + Math.random() * 18, phase: Math.random() * 6.28, drift: 4 + Math.random() * 6 });
      }
      return { portal, density: 1, revealTimer: 0, puffs };
    });
  }

  /** A scout came through this rift: the fog parts for a moment. */
  reveal(portal: PortalState): void {
    const zone = this.zones.find((z) => z.portal === portal);
    if (zone) zone.revealTimer = CFG.revealSeconds;
  }

  /** True while the zone around this rift is fogged in (its works can't be seen). */
  isConcealed(portal: PortalState): boolean {
    return (this.zones.find((z) => z.portal === portal)?.density ?? 0) > 0.5;
  }

  /**
   * `pointer` is the mouse in island space (null when off-canvas); `walkers`
   * are invader positions — a scout inside a zone reveals it.
   */
  update(dt: number, waveActive: boolean, pointer: { x: number; y: number } | null, walkers: Array<{ x: number; y: number }>): void {
    this.elapsed += dt;
    const pointerTile = pointer ? Navigation.tileOf(pointer.x, pointer.y) : null;
    for (const zone of this.zones) {
      const rect = zone.portal.site.zone;
      if (walkers.some((w) => {
        const t = Navigation.tileOf(w.x, w.y);
        return rectContainsTile(rect, t.x, t.y);
      })) zone.revealTimer = Math.max(zone.revealTimer, CFG.revealSeconds);
      zone.revealTimer = Math.max(0, zone.revealTimer - dt);
      const hovered = !!pointerTile && rectContainsTile(rect, pointerTile.x, pointerTile.y);
      const target = waveActive || zone.revealTimer > 0 ? 0 : hovered ? CFG.peekDensity : 1;
      const step = CFG.fadePerSecond * dt;
      zone.density = zone.density < target ? Math.min(target, zone.density + step) : Math.max(target, zone.density - step);
    }
    this.draw();
  }

  /** Soft layered cloud puffs drifting in place. */
  private draw(): void {
    const g = this.g;
    g.clear();
    const t = this.elapsed;
    for (const zone of this.zones) {
      if (zone.density <= 0.01) continue;
      for (const p of zone.puffs) {
        const x = p.x + Math.sin(t * 0.4 + p.phase) * p.drift;
        const y = p.y + Math.cos(t * 0.3 + p.phase) * p.drift * 0.4;
        g.fillStyle(0x94a3b8, 0.35 * zone.density);
        g.fillEllipse(x, y + p.r * 0.25, p.r * 2.4, p.r * 1.2);
        g.fillStyle(0xe2e8f0, 0.55 * zone.density);
        g.fillEllipse(x, y, p.r * 2, p.r * 1.1);
        g.fillStyle(0xffffff, 0.35 * zone.density);
        g.fillEllipse(x - p.r * 0.3, y - p.r * 0.2, p.r * 1.1, p.r * 0.6);
      }
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}
