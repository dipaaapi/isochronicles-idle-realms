import Phaser from 'phaser';
import { IsometricHelper, TILE_HEIGHT, TILE_WIDTH } from '../IsometricHelper';
import { Navigation } from '../Navigation';
import { useGameStore } from '../../state/useGameStore';
import { logMessage } from '../../state/activityLog';
import { unitName } from '../../i18n/translations';
import { soundFx } from '../audio/soundFx';
import { GRID_SIZE, PORTAL_SITES, VOLCANO_SITE, isFloodedTile, isLandTile, isProtectedTile, isVolcanoTile } from '../../state/buildingLayout';
import { MAGMA_FLOW, dragonAwake } from '../../state/lairExpedition';
import { INVADER_CONFIGS } from '../../types/game';
import type { InvasionManager } from '../InvasionManager';
import type { WorkerManager } from '../WorkerManager';
import type { DefenderSystem } from '../DefenderSystem';
import type { WildFactionManager } from '../WildFactionManager';
import type { VolcanoLandmark } from './volcano';

const key = (x: number, y: number) => `${x},${y}`;
const between = ([lo, hi]: number[]) => lo + Math.random() * (hi - lo);

/**
 * Ignara's volcano feeding the Demon Realm (Phase 7): while she is awake and
 * alive, the volcano rumbles (the path to come glows red), then magma spills
 * from its mouth over land and flooded shore, never onto protected tiles.
 * ACTIVE magma burns every unit standing on it, ticked on game time; the
 * store cools it to crust and basalt, and basalt on flooded shore becomes
 * land again. Once she is slain no new flow starts and what is out cools.
 */
export class VolcanicMagma {
  private gfx: Phaser.GameObjects.Graphics;
  private nextFlowIn = between(MAGMA_FLOW.everySeconds);
  private rumble: { path: string[]; left: number } | null = null;
  private tick = 0;
  private coolTimer = 0;
  private t = 0;

  constructor(
    private scene: Phaser.Scene,
    layer: Phaser.GameObjects.Container,
    private volcano: VolcanoLandmark,
    private invasion: InvasionManager,
    private workers: WorkerManager,
    private defenders: DefenderSystem,
    private wild: () => WildFactionManager[],
  ) {
    this.gfx = scene.add.graphics();
    layer.add(this.gfx);
  }

  /** Land or flooded shore that magma may cover: never protected tiles, rift exits or the volcano itself. */
  private canFlow(x: number, y: number): boolean {
    if (x < 1 || y < 1 || x >= GRID_SIZE - 1 || y >= GRID_SIZE - 1) return false;
    if (isVolcanoTile(x, y) || isProtectedTile(x, y)) return false;
    if (PORTAL_SITES.some((p) => p.exit.x === x && p.exit.y === y)) return false;
    return isLandTile(x, y) || isFloodedTile(x, y);
  }

  /** The flow's path: the nearest open tile to the mouth, then a downhill walk away from the volcano. */
  private planFlow(): string[] {
    const mouth = VOLCANO_SITE.mouth;
    let start: { x: number; y: number } | null = null;
    for (let r = 0; r < 8 && !start; r++) {
      for (let dy = -r; dy <= r && !start; dy++) for (let dx = -r; dx <= r && !start; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r && this.canFlow(mouth.x + dx, mouth.y + dy)) start = { x: mouth.x + dx, y: mouth.y + dy };
      }
    }
    if (!start) return [];
    const existing = useGameStore.getState().volcanicMagma;
    const want = Math.round(between(MAGMA_FLOW.tilesPerFlow));
    const path = [key(start.x, start.y)];
    let cur = start;
    for (let i = 1; i < want; i++) {
      const options = [[1, 0], [0, 1], [-1, 0], [0, -1]]
        .map(([dx, dy]) => ({ x: cur.x + dx, y: cur.y + dy }))
        .filter((p) => this.canFlow(p.x, p.y) && !path.includes(key(p.x, p.y)) && !existing[key(p.x, p.y)]);
      if (!options.length) break;
      // Away from the volcano, with some wander
      options.sort((a, b) => (b.x + b.y + Math.random() * 2) - (a.x + a.y + Math.random() * 2));
      cur = options[0];
      path.push(key(cur.x, cur.y));
    }
    return path;
  }

  update(gameDeltaMs: number): void {
    const dt = gameDeltaMs / 1000;
    if (dt <= 0) { this.draw(); return; }
    this.t += dt;
    const store = useGameStore.getState();
    const magma = store.volcanicMagma;

    // New flows only while Ignara lives (and the cap leaves room)
    if (dragonAwake(store.dragon) && store.activeLocation === 'DEMON_REALM') {
      if (this.rumble) {
        this.rumble.left -= dt;
        if (this.rumble.left <= 0) {
          const path = this.rumble.path.filter((k) => { const [x, y] = k.split(',').map(Number); return this.canFlow(x, y); });
          this.rumble = null;
          if (path.length) {
            store.spillMagma(path);
            soundFx.playExplosion();
            logMessage('magmaFlow', { tiles: path.length });
          }
        }
      } else if ((this.nextFlowIn -= dt) <= 0) {
        this.nextFlowIn = between(MAGMA_FLOW.everySeconds);
        if (Object.keys(magma).length < MAGMA_FLOW.maxTiles) {
          const path = this.planFlow();
          if (path.length) {
            this.rumble = { path, left: MAGMA_FLOW.rumbleSeconds };
            this.volcano.erupt(MAGMA_FLOW.rumbleSeconds);
            soundFx.playRumble();
            logMessage('magmaRumble');
          }
        }
      }
    } else {
      this.rumble = null;
    }

    // Cooling runs on game time; the store is written about once a second
    this.coolTimer += dt;
    if (this.coolTimer >= 1) {
      store.coolVolcanicMagma(this.coolTimer);
      this.coolTimer = 0;
    }

    // Burning: every unit standing on ACTIVE magma, ticked so the damage is frame-rate independent
    this.tick += dt;
    if (this.tick >= MAGMA_FLOW.tickSeconds) {
      const amount = MAGMA_FLOW.dps * this.tick;
      this.tick = 0;
      this.burn(amount);
    }
    this.draw();
  }

  private activeAt(wx: number, wy: number): boolean {
    const g = Navigation.toGrid(wx, wy);
    const t = useGameStore.getState().volcanicMagma[key(Math.round(g.x), Math.round(g.y))];
    return t?.stage === 'ACTIVE';
  }

  private burn(amount: number): void {
    const magma = useGameStore.getState().volcanicMagma;
    if (!Object.values(magma).some((t) => t.stage === 'ACTIVE')) return;
    const lang = useGameStore.getState().language;
    let victim: { en: string; tl: string } | null = null;
    for (const w of this.workers.getWorkers()) {
      if (w.hp <= 0 || !w.container?.active || !this.activeAt(w.container.x, w.container.y)) continue;
      this.invasion.hurtWorkerFromRift(w, amount);
      victim ??= { en: unitName(w.name, w.unitClass, 'EN'), tl: unitName(w.name, w.unitClass, 'TL') };
    }
    for (const d of this.defenders.getDefenders()) {
      if (d.dead || !d.container?.active || !this.activeAt(d.container.x, d.container.y)) continue;
      this.defenders.hurtFromHazard(d, amount);
    }
    for (const inv of this.invasion.getInvaders()) {
      if (inv.isDead || !inv.container.active || INVADER_CONFIGS[inv.type]?.flying || !this.activeAt(inv.container.x, inv.container.y)) continue;
      this.invasion.damageInvader(inv, amount, undefined, true);
      victim ??= { en: INVADER_CONFIGS[inv.type].nameEn ?? INVADER_CONFIGS[inv.type].name, tl: INVADER_CONFIGS[inv.type].name };
    }
    for (const faction of this.wild()) {
      for (const c of faction.hazardTargets()) {
        if (!this.activeAt(c.x, c.y)) continue;
        c.hurt(amount);
        victim ??= c.name;
      }
    }
    void lang;
    if (victim) logMessage('magmaBurn', { name: victim }, { mergeKey: 'magma-burn' });
  }

  /** Rumble path in red, then glowing ACTIVE magma, dark crust with embers, grey basalt. */
  private draw(): void {
    const g = this.gfx;
    g.clear();
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
    const diamond = (x: number, y: number, color: number, alpha: number, inset = 0) => {
      const c = IsometricHelper.gridToScreen(x, y);
      const hw = TILE_WIDTH / 2 - inset * 2, hh = TILE_HEIGHT / 2 - inset;
      g.fillStyle(color, alpha);
      g.fillPoints([
        new Phaser.Geom.Point(c.x, c.y - hh), new Phaser.Geom.Point(c.x + hw, c.y),
        new Phaser.Geom.Point(c.x, c.y + hh), new Phaser.Geom.Point(c.x - hw, c.y),
      ], true);
    };
    if (this.rumble) {
      for (const k of this.rumble.path) {
        const [x, y] = k.split(',').map(Number);
        diamond(x, y, 0xdc2626, 0.15 + 0.3 * pulse, 4);
      }
    }
    for (const [k, t] of Object.entries(useGameStore.getState().volcanicMagma)) {
      const [x, y] = k.split(',').map(Number);
      if (t.stage === 'ACTIVE') {
        diamond(x, y, 0xea580c, 0.95);
        diamond(x, y, 0xfbbf24, 0.35 + 0.35 * Math.sin(this.t * 3 + x * 1.7 + y), 7);
      } else if (t.stage === 'CRUST') {
        diamond(x, y, 0x3f1d12, 0.95);
        diamond(x, y, 0xc2410c, 0.25 + 0.2 * pulse, 10);
      } else {
        diamond(x, y, 0x3f3f46, 0.85, 1);
        diamond(x, y, 0x52525b, 0.6, 9);
      }
    }
  }
}
