import Phaser from 'phaser';
import type { PortalState } from './PortalManager';
import { createEnemySprite, faceCharacterSprite, playCharacterWork } from './sprites/CharacterSprites';
import { PORTAL_DEFENSE } from '../state/portalDefense';
import { useGameStore } from '../state/useGameStore';
import { logMessage } from '../state/activityLog';

const CFG = PORTAL_DEFENSE.builders;

/** A piece of work at a rift: build / mend a Rift Sentinel or repair the rift. */
export interface RiftJob {
  id: string;
  portal: PortalState;
  /** World spot the Technician stands on while working. */
  x: number;
  y: number;
  /** Where the scaffold and progress bar sit (the tower tile), when there is one. */
  siteX: number;
  siteY: number;
  scaffold: boolean;
  /** Applies `dt` seconds of work; true once finished. */
  work(dt: number): boolean;
  /** 0–1 for the progress bar. */
  progress(): number;
}

interface Crewman {
  portal: PortalState;
  container: Phaser.GameObjects.Container;
  sprite?: Phaser.GameObjects.Sprite;
  job?: RiftJob;
  homing: boolean;
  lastX: number;
  lastY: number;
}

/**
 * Human Technicians at work in the rift mist between waves: they step out of
 * a dormant rift, walk to a job, hammer at it (scaffold + progress bar, like a
 * General raising an establishment) and go back in when nothing is left or a
 * wave begins. They are never targets — the mist hides them from the demons.
 */
export class RiftWorks {
  private crew: Crewman[] = [];
  private scaffolds: Phaser.GameObjects.Graphics;
  private announced = new Set<PortalState>();
  private elapsed = 0;

  constructor(private scene: Phaser.Scene, private layer: Phaser.GameObjects.Container) {
    this.scaffolds = scene.add.graphics();
    layer.add(this.scaffolds);
  }

  update(dt: number, peace: boolean, portals: readonly PortalState[], jobsAt: (p: PortalState) => RiftJob[]): void {
    this.elapsed += dt;
    if (!peace) this.announced.clear();
    const taken = new Set(this.crew.map((c) => c.job?.id).filter(Boolean));

    // Send crews out of dormant rifts that have work waiting
    if (peace) {
      for (const p of portals) {
        if (p.mode === 'open') continue;
        const jobs = jobsAt(p);
        const here = this.crew.filter((c) => c.portal === p && !c.homing).length;
        if (jobs.length > here && here < CFG.perPortal) {
          this.spawn(p);
          if (!this.announced.has(p)) {
            this.announced.add(p);
            logMessage('riftWorks', { portal: this.portalName(p) });
          }
        }
      }
    }

    for (const c of [...this.crew]) {
      if (!peace || c.portal.mode === 'open') c.homing = true;
      if (!c.homing && (!c.job || c.job.progress() >= 1)) {
        c.job = jobsAt(c.portal).find((j) => !taken.has(j.id));
        if (c.job) taken.add(c.job.id);
        else c.homing = true;
      }
      if (c.homing) {
        if (this.walk(c, c.portal.x, c.portal.y, dt, 2)) this.vanish(c);
        continue;
      }
      const job = c.job!;
      if (!this.walk(c, job.x, job.y, dt)) continue;
      // At the site: hammer away
      if (c.sprite) {
        faceCharacterSprite(c.sprite, job.siteX - c.container.x, job.siteY - c.container.y, false);
        if (Math.floor(this.elapsed * 3) % 2 === 0) playCharacterWork(c.sprite);
      }
      if (job.work(dt)) {
        c.job = undefined;
        this.sparks(job.siteX, job.siteY - 20, 12);
      } else if (Math.random() < dt * 2) this.sparks(job.siteX, job.siteY - 16, 2);
    }

    this.drawScaffolds(portals, jobsAt);
  }

  private portalName(p: PortalState): string {
    return useGameStore.getState().language === 'TL' ? p.site.name.tl : p.site.name.en;
  }

  private spawn(p: PortalState): void {
    const container = this.scene.add.container(p.x, p.y);
    const sprite = createEnemySprite(this.scene, 'TECHNICIAN') ?? undefined;
    if (sprite) container.add(sprite);
    else {
      // Sheet still baking: a small orange figure with a hard hat
      const g = this.scene.add.graphics();
      g.fillStyle(0x2563eb, 1).fillRect(-4, -14, 8, 10);
      g.fillStyle(0xf97316, 1).fillRect(-4, -12, 8, 5);
      g.fillStyle(0xfacc15, 1).fillRect(-4, -19, 8, 4);
      container.add(g);
    }
    container.setScale(0.75).setAlpha(0);
    this.layer.add(container);
    this.scene.tweens.add({ targets: container, alpha: 1, duration: 400 });
    this.crew.push({ portal: p, container, sprite, homing: false, lastX: p.x, lastY: p.y });
  }

  /** Steps toward a point; true once there. */
  private walk(c: Crewman, x: number, y: number, dt: number, speedMult = 1): boolean {
    const dx = x - c.container.x;
    const dy = y - c.container.y;
    const d = Math.hypot(dx, dy);
    if (d < 3) return true;
    const step = Math.min(d, CFG.speed * speedMult * dt);
    c.container.x += (dx / d) * step;
    c.container.y += (dy / d) * step;
    if (c.sprite) faceCharacterSprite(c.sprite, dx, dy, true);
    return false;
  }

  private vanish(c: Crewman): void {
    this.crew = this.crew.filter((o) => o !== c);
    this.scene.tweens.add({ targets: c.container, alpha: 0, scale: 0.2, duration: 300, onComplete: () => c.container.destroy() });
  }

  /** Wooden scaffold + progress bar over every unfinished tower job (only when work has started). */
  private drawScaffolds(portals: readonly PortalState[], jobsAt: (p: PortalState) => RiftJob[]): void {
    const g = this.scaffolds;
    g.clear();
    for (const p of portals) {
      for (const job of jobsAt(p)) {
        const t = job.progress();
        if (t <= 0 || t >= 1) continue;
        const { siteX: x, siteY: y } = job;
        if (job.scaffold) {
          // Poles and cross-braces, rising with progress
          const h = 18 + 40 * t;
          g.lineStyle(2, 0x8b5a2b, 1);
          for (const px of [-12, 12]) g.lineBetween(x + px, y + 2, x + px, y - h);
          g.lineBetween(x - 12, y - h, x + 12, y - h);
          g.lineStyle(1, 0xa16207, 0.9);
          for (let k = 1; k < 4; k++) g.lineBetween(x - 12, y - (h * k) / 4, x + 12, y - (h * (k - 1)) / 4);
          // The pillar going up inside
          g.fillStyle(0x44403c, 1);
          g.fillRect(x - 6, y - 30 * t, 12, 30 * t);
        }
        const top = y - (job.scaffold ? 72 : 110);
        g.fillStyle(0x000000, 0.7);
        g.fillRect(x - 19, top - 1, 38, 6);
        g.fillStyle(0xfacc15, 1);
        g.fillRect(x - 18, top, 36 * t, 4);
      }
    }
  }

  private sparks(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const s = this.scene.add.rectangle(x, y, 2, 2, i % 2 ? 0xfde047 : 0xffffff);
      s.setDepth(9990);
      this.layer.add(s);
      this.scene.tweens.add({
        targets: s, x: x + Phaser.Math.Between(-14, 14), y: y - Phaser.Math.Between(4, 18), alpha: 0,
        duration: 350, onComplete: () => s.destroy(),
      });
    }
  }

  destroy(): void {
    for (const c of this.crew) c.container.destroy();
    this.crew = [];
    this.scaffolds.destroy();
  }
}
