import Phaser from 'phaser';
import { Navigation } from './Navigation';
import type { PortalState } from './PortalManager';
import { PORTAL_DEFENSE } from '../state/portalDefense';
import { rectContainsTile } from '../state/buildingLayout';
import { MIST_TEX, paintMistTextures } from './mistTextures';

const CFG = PORTAL_DEFENSE.mist;

const TEX = MIST_TEX;

type Layer = 'bank' | 'puff';

interface Cloud {
  img: Phaser.GameObjects.Image;
  layer: Layer;
  /** Home position (world) and the drift it wanders around it. */
  hx: number;
  hy: number;
  phase: number;
  drift: number;
  baseScale: number;
  baseAlpha: number;
  spin: number;
}

interface MistZone {
  portal: PortalState;
  density: number;
  revealTimer: number;
  cx: number;
  cy: number;
  clouds: Cloud[];
  /** Lantern glints from the human den, glowing through the fog. */
  glints: Array<{ img: Phaser.GameObjects.Image; phase: number }>;
}

/**
 * Fog over each rift's 4×4 zone (the human den): it hides the rift, its Rift
 * Sentinels and the Technicians working there. Layered sprites — a ground bank,
 * billowing puffs — drift, breathe and slowly turn, with lantern
 * glints from the den glowing through. It lifts while a wave is on (the clouds
 * part outward from the rift), for a few seconds when a scout comes through,
 * and thins and pushes away under the mouse so the player can peek.
 */
export class RiftMist {
  private zones: MistZone[];
  private elapsed = 0;

  constructor(private scene: Phaser.Scene, layer: Phaser.GameObjects.Container, portals: readonly PortalState[]) {
    paintMistTextures(scene);
    this.zones = portals.map((portal) => {
      const z = portal.site.zone;
      const centre = Navigation.toWorld(z.x + z.w / 2 - 0.5, z.y + z.h / 2 - 0.5);
      const clouds: Cloud[] = [];
      const add = (layerName: Layer, tex: string, gx: number, gy: number, lift: number, scale: number, alpha: number) => {
        const p = Navigation.toWorld(gx, gy);
        const img = scene.add.image(p.x, p.y - lift, tex).setScale(scale).setAlpha(0);
        layer.add(img);
        clouds.push({
          img, layer: layerName, hx: p.x, hy: p.y - lift, phase: Math.random() * 6.28,
          drift: layerName === 'bank' ? 6 : 8 + Math.random() * 6,
          baseScale: scale, baseAlpha: alpha, spin: layerName === 'puff' ? (Math.random() - 0.5) * 0.08 : 0,
        });
      };
      const rand = (a: number, b: number) => a + Math.random() * (b - a);
      for (let i = 0; i < 6; i++) add('bank', TEX.bank, rand(z.x - 0.2, z.x + z.w - 0.6), rand(z.y - 0.2, z.y + z.h - 0.6), rand(0, 8), rand(0.8, 1.1), 0.75);
      for (let i = 0; i < CFG.puffs; i++) add('puff', TEX.puff, rand(z.x - 0.3, z.x + z.w - 0.5), rand(z.y - 0.3, z.y + z.h - 0.5), rand(10, 120), rand(0.45, 0.8), rand(0.7, 0.95));
      const glints = Array.from({ length: 3 }, () => {
        const p = Navigation.toWorld(rand(z.x, z.x + z.w - 1), rand(z.y, z.y + z.h - 1));
        const img = scene.add.image(p.x, p.y - rand(6, 30), TEX.glint).setScale(rand(0.5, 0.8)).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
        layer.add(img);
        return { img, phase: Math.random() * 6.28 };
      });
      // Draw order: ground bank, glints, puffs on top
      for (const c of clouds) if (c.layer === 'bank') layer.bringToTop(c.img);
      for (const g of glints) layer.bringToTop(g.img);
      for (const c of clouds) if (c.layer === 'puff') layer.bringToTop(c.img);
      return { portal, density: 1, revealTimer: 0, cx: centre.x, cy: centre.y - 40, clouds, glints };
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
      this.drawZone(zone, hovered ? pointer : null);
    }
  }

  private drawZone(zone: MistZone, pointer: { x: number; y: number } | null): void {
    const t = this.elapsed;
    const d = zone.density;
    const part = 1 - d; // 0 = closed in, 1 = fully parted
    for (const c of zone.clouds) {
      const visible = d > 0.01;
      c.img.setVisible(visible);
      if (!visible) continue;
      const speed = 0.4;
      let x = c.hx + Math.sin(t * speed + c.phase) * c.drift;
      let y = c.hy + Math.cos(t * speed * 0.75 + c.phase) * c.drift * 0.35;
      // Parting: clouds slide outward from the rift as the fog lifts
      const ox = x - zone.cx, oy = y - zone.cy;
      const len = Math.hypot(ox, oy) || 1;
      x += (ox / len) * part * 70;
      y += (oy / len) * part * 30;
      // Peeking: puffs near the cursor are pushed aside
      if (pointer && c.layer !== 'bank') {
        const px = x - pointer.x, py = y - pointer.y;
        const dist = Math.hypot(px, py);
        if (dist < 90) {
          const push = (1 - dist / 90) * 40;
          x += (px / (dist || 1)) * push;
          y += (py / (dist || 1)) * push * 0.5;
        }
      }
      const breathe = 1 + Math.sin(t * 0.7 + c.phase * 2) * 0.06;
      c.img.setPosition(x, y).setScale(c.baseScale * breathe * (1 + part * 0.35)).setAlpha(c.baseAlpha * d);
      if (c.spin) c.img.setRotation(Math.sin(t * c.spin * 4 + c.phase) * 0.12);
    }
    for (const g of zone.glints) {
      const flicker = 0.55 + 0.25 * Math.sin(t * 7 + g.phase) + 0.2 * Math.sin(t * 13 + g.phase * 3);
      g.img.setVisible(d > 0.3).setAlpha(flicker * Math.min(1, (d - 0.3) * 2));
    }
  }

  destroy(): void {
    for (const zone of this.zones) {
      zone.clouds.forEach((c) => c.img.destroy());
      zone.glints.forEach((g) => g.img.destroy());
    }
  }
}
