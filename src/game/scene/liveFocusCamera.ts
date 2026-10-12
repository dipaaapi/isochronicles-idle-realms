import Phaser from 'phaser';
import { IsometricHelper } from '../IsometricHelper';
import { useGameStore } from '../../state/useGameStore';
import { useLiveFocus } from '../../state/liveFocus';
import CONFIG from '../../data/liveStream.json';

interface Point {
  x: number;
  y: number;
}

const rand = ([lo, hi]: number[]): number => lo + Math.random() * (hi - lo);

/**
 * Live-stream focus: during a wave, finds the hottest clash (invaders and
 * demon-side units bunched together) and now and then pops a second camera
 * out over it, in the top-right frame the React overlay (LiveStreamOverlay)
 * decorates. Positions are island-local; the island container offset is
 * added when centring the camera.
 */
export class LiveFocusCamera {
  private cam: Phaser.Cameras.Scene2D.Camera;
  private checkTimer = 0;
  private liveTimer = 0;
  private calmTimer = 0;
  private cooldown = rand(CONFIG.cooldownSeconds) / 2;
  private focus?: Point;
  private target?: Point;
  private focusTick: number;

  constructor(
    private scene: Phaser.Scene,
    private island: Phaser.GameObjects.Container,
    private invaders: () => Point[],
    private allies: () => Point[],
    private dpr: () => number,
    /** Flies the main camera to a world point (clicking the stream). */
    private flyTo: (x: number, y: number) => void
  ) {
    this.focusTick = useLiveFocus.getState().focusTick;
    this.cam = scene.cameras.add(0, 0, 1, 1, false, 'live-focus');
    this.cam.setBackgroundColor('#0b1020');
    this.cam.setVisible(false);
  }

  /** The hottest spot right now, or undefined when nothing is intense enough. */
  private findHotspot(): { at: Point; heat: number } | undefined {
    const foes = this.invaders();
    const friends = this.allies();
    const r2 = CONFIG.detect.radius ** 2;
    let best: { at: Point; heat: number } | undefined;
    for (const f of foes) {
      let nFoes = 0;
      let nFriends = 0;
      let sx = 0;
      let sy = 0;
      for (const o of foes) {
        if ((o.x - f.x) ** 2 + (o.y - f.y) ** 2 > r2) continue;
        nFoes++;
        sx += o.x;
        sy += o.y;
      }
      for (const a of friends) {
        if ((a.x - f.x) ** 2 + (a.y - f.y) ** 2 > r2) continue;
        nFriends++;
        sx += a.x;
        sy += a.y;
      }
      if (nFoes < CONFIG.detect.minInvaders || nFriends < CONFIG.detect.minAllies) continue;
      const heat = nFoes + nFriends;
      if (!best || heat > best.heat) best = { at: { x: sx / heat, y: sy / heat }, heat };
    }
    return best;
  }

  private setLive(live: boolean, heat = 0): void {
    const state = useLiveFocus.getState();
    const spot = live && this.focus ? (() => {
      const g = IsometricHelper.screenToGrid(this.focus.x, this.focus.y);
      return IsometricHelper.tileName(g.x, g.y);
    })() : state.spot;
    const intensity = Math.min(1, heat / 16);
    if (state.live !== live || state.spot !== spot || Math.abs(state.intensity - intensity) > 0.05) {
      state.set({ live, spot, intensity });
    }
    this.cam.setVisible(live);
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    const tick = useLiveFocus.getState().focusTick;
    if (tick !== this.focusTick) {
      this.focusTick = tick;
      if (this.focus && useLiveFocus.getState().live) this.flyTo(this.island.x + this.focus.x, this.island.y + this.focus.y - 20);
    }
    const store = useGameStore.getState();
    if (!store.invasion.isActive || store.defense.castleHp <= 0) {
      if (this.liveTimer > 0 || useLiveFocus.getState().live) {
        this.liveTimer = 0;
        this.setLive(false);
      }
      return;
    }

    this.checkTimer -= dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    let heat = -1;
    if (this.checkTimer <= 0) {
      this.checkTimer = CONFIG.detect.checkSeconds;
      const hot = this.findHotspot();
      heat = hot?.heat ?? 0;
      if (hot) this.target = hot.at;
      if (this.liveTimer <= 0 && hot && this.cooldown <= 0 && Math.random() < CONFIG.detect.popChance) {
        this.liveTimer = rand(CONFIG.liveSeconds);
        this.calmTimer = 0;
        this.focus = { ...hot.at };
      }
    }

    if (this.liveTimer <= 0) return;
    this.liveTimer -= dt;
    if (heat === 0) this.calmTimer += CONFIG.detect.checkSeconds;
    else if (heat > 0) this.calmTimer = 0;
    if (this.liveTimer <= 0 || this.calmTimer >= CONFIG.calmEndSeconds) {
      this.liveTimer = 0;
      this.cooldown = rand(CONFIG.cooldownSeconds);
      this.setLive(false);
      return;
    }

    // Glide toward the fight
    if (this.focus && this.target) {
      const k = 1 - Math.exp(-dt * 3);
      this.focus.x += (this.target.x - this.focus.x) * k;
      this.focus.y += (this.target.y - this.focus.y) * k;
    }
    const dpr = this.dpr();
    const { width, height, margin, zoom } = CONFIG.frame;
    const w = width * dpr;
    const h = height * dpr;
    this.cam.setViewport(this.scene.scale.width - (width + margin) * dpr, margin * dpr, w, h);
    this.cam.setZoom(zoom * dpr);
    if (this.focus) this.cam.centerOn(this.island.x + this.focus.x, this.island.y + this.focus.y - 20);
    if (heat >= 0) this.setLive(true, heat > 0 ? heat : 0);
  }

  destroy(): void {
    this.scene.cameras.remove(this.cam);
    useLiveFocus.getState().set({ live: false, intensity: 0 });
  }
}
