import { teamBonuses } from '../state/skillTree';
import Phaser from 'phaser';
import { TILE_WIDTH } from './IsometricHelper';
import type { StructureManager, StructureId } from './StructureManager';
import type { PortalManager, PortalState } from './PortalManager';
import { useGameStore } from '../state/useGameStore';
import { buildingMaxHp, towerBuildingOf, towerLevelOf } from '../state/defenseStats';
import { logMessage } from '../state/activityLog';
import { soundFx } from './audio/soundFx';
import CONFIG from '../data/forceFields.json';
import type { TowerId } from '../types/state';

const color = (hex: string): number => parseInt(hex, 16);
const EST_COLOR = color(CONFIG.establishment.color);
const PORTAL_COLOR = color(CONFIG.portal.color);
const CASTLE_COLOR = color(CONFIG.castle.color);

interface Dome {
  hp: number;
  max: number;
  /** Seconds until a broken dome flickers back on (0 = up). */
  reboot: number;
  /** Seconds of hit glow left. */
  flash: number;
}

/**
 * Wave-time force fields: a rotating lattice dome over the castle, every
 * built establishment and every open rift. Each dome has its own gauge that
 * soaks hits from either side (invaders on buildings, minions on rifts)
 * until it breaks; a broken dome reboots at partial charge after a while.
 * Domes show only while a battle is on — a wave, or a random fight with
 * raiding scouts between waves — rising fresh when it starts and fading
 * when it ends.
 * The castle dome mirrors the castle's own shield (defense.shieldHp).
 */
export class ForceFieldSystem {
  private gfx: Phaser.GameObjects.Graphics;
  private domes = new Map<string, Dome>();
  private wasActive = false;
  private phase = 0;

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Container,
    private structures: StructureManager,
    private portals: PortalManager,
    /** True while hostile raiders (scouts) are alive outside a wave. */
    private raiders: () => boolean
  ) {
    this.gfx = scene.add.graphics();
    layer.add(this.gfx);
  }

  /** A wave or a random scout fight is on, and the citadel still stands. */
  private inBattle(): boolean {
    const store = useGameStore.getState();
    return (store.invasion.isActive || this.raiders()) && store.defense.castleHp > 0;
  }

  private static portalKey(p: PortalState): string {
    return `portal:${p.site.id}`;
  }

  private establishmentMax(id: TowerId): number {
    const store = useGameStore.getState();
    const b = towerBuildingOf(store, id);
    const wave = store.invasion.waveNumber || 1;
    return Math.round(buildingMaxHp(towerLevelOf(b)) * CONFIG.establishment.maxHpFraction * (1 + wave * CONFIG.establishment.perWave) *
      teamBonuses(store).forceFieldHp); // Rune Wards skill
  }

  /** Lazily raises a dome the first time it is needed this wave (new rifts, freshly built establishments). */
  private domeFor(key: string, max: () => number): Dome {
    let dome = this.domes.get(key);
    if (!dome) {
      const m = Math.max(1, max());
      dome = { hp: m, max: m, reboot: 0, flash: 0 };
      this.domes.set(key, dome);
    }
    return dome;
  }

  /** Soaks a hit; returns the damage left over for the structure itself. */
  private soak(dome: Dome, amount: number, name: string): number {
    if (dome.reboot > 0 || dome.hp <= 0) return amount;
    const absorbed = Math.min(dome.hp, amount);
    dome.hp -= absorbed;
    dome.flash = 0.25;
    if (dome.hp <= 0) {
      dome.reboot = CONFIG.rebootSeconds;
      logMessage('forceFieldBroken', { building: name });
      soundFx.playCastleHit();
    }
    return amount - absorbed;
  }

  /** Invader damage on an establishment (the castle uses its shieldHp instead). */
  absorbStructureHit(id: StructureId, amount: number): number {
    if (id === 'CASTLE' || !this.wasActive) return amount;
    const dome = this.domeFor(id, () => this.establishmentMax(id));
    return this.soak(dome, amount, this.structures.displayName(id));
  }

  /** Minion damage on an open rift. */
  absorbPortalHit(p: PortalState, amount: number): number {
    if (!this.wasActive) return amount;
    const dome = this.domeFor(ForceFieldSystem.portalKey(p), () => p.maxHp * CONFIG.portal.maxHpFraction);
    const store = useGameStore.getState();
    return this.soak(dome, amount, store.language === 'TL' ? p.site.name.tl : p.site.name.en);
  }

  update(deltaMs: number): void {
    const store = useGameStore.getState();
    const active = this.inBattle();
    if (active && !this.wasActive) {
      this.domes.clear();
      logMessage('forceFieldsRaised');
    }
    this.wasActive = active;
    this.gfx.clear();
    if (!active) {
      this.domes.clear();
      return;
    }

    const dt = deltaMs / 1000;
    this.phase = (this.phase + dt * CONFIG.rotationSpeed) % (Math.PI * 2);
    for (const dome of this.domes.values()) {
      if (dome.flash > 0) dome.flash -= dt;
      if (dome.reboot > 0) {
        dome.reboot -= dt;
        if (dome.reboot <= 0) dome.hp = dome.max * CONFIG.rebootFraction;
      }
    }

    for (const t of this.structures.getTargets()) {
      const radius = (Math.max(t.rect.w, t.rect.h) * TILE_WIDTH) / 2 + 6;
      if (t.id === 'CASTLE') {
        const { shieldHp, shieldMaxHp } = store.defense;
        this.drawDome(t.x, t.y, radius, shieldMaxHp > 0 ? shieldHp / shieldMaxHp : 0, CASTLE_COLOR, 0);
      } else {
        const dome = this.domeFor(t.id, () => this.establishmentMax(t.id as TowerId));
        this.drawDome(t.x, t.y, radius, dome.reboot > 0 ? 0 : dome.hp / dome.max, EST_COLOR, dome.flash, dome.reboot);
      }
    }
    for (const p of this.portals.getOpen()) {
      const dome = this.domeFor(ForceFieldSystem.portalKey(p), () => p.maxHp * CONFIG.portal.maxHpFraction);
      this.drawDome(p.x, p.y, TILE_WIDTH * 0.9, dome.reboot > 0 ? 0 : dome.hp / dome.max, PORTAL_COLOR, dome.flash, dome.reboot);
    }
  }

  /** An iso dome: base ring, rotating meridians, two latitude rings and a gauge bar on top. */
  private drawDome(x: number, y: number, rx: number, pct: number, tint: number, flash: number, reboot = 0): void {
    const g = this.gfx;
    const ry = rx / 2;
    const h = rx * 1.05;
    if (pct <= 0) {
      // Broken: a faint flickering ring while it reboots
      if (reboot > 0 && Math.random() < 0.5) {
        g.lineStyle(1, tint, 0.35);
        g.strokeEllipse(x, y, rx * 2, ry * 2);
      }
      return;
    }
    const strength = 0.25 + 0.55 * pct + (flash > 0 ? 0.4 : 0);
    const c = flash > 0 ? 0xffffff : tint;

    g.fillStyle(tint, 0.06 + 0.08 * pct);
    g.beginPath();
    for (let i = 0; i <= 24; i++) {
      const t = (Math.PI * i) / 24;
      const px = x - rx * Math.cos(t);
      const py = y - h * Math.sin(t);
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fillPath();

    g.lineStyle(1.5, c, Math.min(1, strength));
    g.strokeEllipse(x, y, rx * 2, ry * 2);

    // Meridians: vertical great circles turning about the dome's axis
    const n = CONFIG.meridians;
    for (let m = 0; m < n; m++) {
      const theta = this.phase + (Math.PI * m) / n;
      const front = Math.sin(theta);
      g.lineStyle(1, c, Math.min(1, strength * (front > 0 ? 0.9 : 0.35)));
      g.beginPath();
      for (let i = 0; i <= 16; i++) {
        const t = (Math.PI * i) / 16;
        const px = x + rx * Math.cos(t) * Math.cos(theta);
        const py = y + ry * Math.cos(t) * front - h * Math.sin(t);
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.strokePath();
    }

    for (const a of [0.45, 0.9]) {
      g.lineStyle(1, c, Math.min(1, strength * 0.6));
      g.strokeEllipse(x, y - h * Math.sin(a), rx * 2 * Math.cos(a), ry * 2 * Math.cos(a));
    }

    // Gauge
    const top = y - h - 8;
    g.fillStyle(0x000000, 0.6);
    g.fillRect(x - 17, top - 1, 34, 5);
    g.fillStyle(tint, 1);
    g.fillRect(x - 16, top, 32 * pct, 3);
  }

  destroy(): void {
    this.gfx.destroy();
    this.domes.clear();
  }
}
