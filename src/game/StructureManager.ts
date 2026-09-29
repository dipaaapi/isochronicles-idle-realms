import Phaser from 'phaser';
import { IsometricHelper } from './IsometricHelper';
import { Navigation, SolidArea } from './Navigation';
import { useGameStore, RESOURCE_BUILDING_CONFIG } from '../state/useGameStore';
import {
  BUILDING_IDS,
  BUILDING_SITES,
  CASTLE_FOOTPRINT,
  PORTAL_SITES,
  SPIRE_FOOTPRINT,
  TileRect,
  expandRect,
  rectCenter,
  rectContainsTile,
} from '../state/buildingLayout';
import { ZONE_MARGIN, TOWER_MAX_LEVEL, beaconLevelOf, beaconStats, buildingHpOf, buildingMaxHp, towerLevelOf } from '../state/defenseStats';
import type { ResourceBuildingId } from '../types/state';
import type { ConstructionStatus } from '../state/constructionProgress';
import { logMessage } from '../state/activityLog';
import { soundFx } from './audio/soundFx';
import { BUILDING_SPRITE, StructureKey } from './sprites/structureModels';
import { createStructureSprite, playStructureAnim, structureHeadroom } from './sprites/StructureSprites';

export type StructureId = 'CASTLE' | ResourceBuildingId;

/** Something invaders can walk up to and hit. */
export interface StructureTarget {
  id: StructureId;
  rect: TileRect;
  /** World position of the footprint centre (sprite anchor). */
  x: number;
  y: number;
}

/** What the beacon needs to know about an invader (implemented by ActiveInvader). */
export interface Provokable {
  container: { x: number; y: number; active: boolean };
  sprite?: Phaser.GameObjects.Sprite;
  isDead: boolean;
  isRetreating?: boolean;
  isScout?: boolean;
  provokedTimer?: number;
}

type ViewState = 'site' | 'idle' | 'ruined';

interface StructureView {
  id: StructureId | 'SPIRE';
  key: StructureKey;
  rect: TileRect;
  x: number;
  y: number;
  container: Phaser.GameObjects.Container;
  sprite?: Phaser.GameObjects.Sprite;
  fallback: Phaser.GameObjects.Graphics;
  hpBar: Phaser.GameObjects.Graphics;
  state?: ViewState;
  attacking: boolean;
  smokeTimer: number;
  lastHpKey: string;
}

const FALLBACK_COLORS: Record<StructureKey, number> = {
  castle: 0x4b4468, quarry: 0x8b93a1, mine: 0x6b6b75, grove: 0x2f8f3a, port: 0xa87b4f, cave: 0x4a3d52, spire: 0x22d3ee, portal: 0x78716c,
};

/**
 * Owns the citadel, establishment and Crystal Spire views: baked voxel sprites
 * (with a simple block until the bake lands), construction plots, HP bars,
 * wreck smoke and hit flashes. It also keeps Navigation's solid footprints in
 * sync with what is built, and runs the citadel's Provoke Beacon.
 */
export class StructureManager {
  private views = new Map<StructureId | 'SPIRE', StructureView>();
  private zoneGfx: Phaser.GameObjects.Graphics;
  private invaderProvider: () => Provokable[] = () => [];
  private constructionProvider: () => ConstructionStatus | null = () => null;
  private elapsed = 0;
  private beaconTimer = 4;
  private beaconActive = 0;
  private beaconRadius = 2.5;

  constructor(
    private scene: Phaser.Scene,
    private layer: Phaser.GameObjects.Container,
    private groundLayer: Phaser.GameObjects.Container,
    private nav: Navigation
  ) {
    this.zoneGfx = scene.add.graphics();
    groundLayer.add(this.zoneGfx);

    this.addView('CASTLE', 'castle', CASTLE_FOOTPRINT);
    this.addView('SPIRE', 'spire', SPIRE_FOOTPRINT);
    for (const id of BUILDING_IDS) this.addView(id, BUILDING_SPRITE[id], BUILDING_SITES[id].footprint);
    this.syncSolids();
  }

  setInvaderProvider(provider: () => Provokable[]): void {
    this.invaderProvider = provider;
  }

  /** Where the Ent is building, so only that site shows its construction animation. */
  setConstructionProvider(provider: () => ConstructionStatus | null): void {
    this.constructionProvider = provider;
  }

  private addView(id: StructureId | 'SPIRE', key: StructureKey, rect: TileRect): void {
    const c = rectCenter(rect);
    const pos = IsometricHelper.gridToScreen(c.x, c.y);
    const container = this.scene.add.container(pos.x, pos.y);
    const fallback = this.scene.add.graphics();
    const hpBar = this.scene.add.graphics();
    container.add([fallback, hpBar]);
    this.layer.add(container);
    const view: StructureView = { id, key, rect, x: pos.x, y: pos.y, container, fallback, hpBar, attacking: false, smokeTimer: 0, lastHpKey: '' };
    this.drawFallback(view);
    this.views.set(id, view);
    this.attachSprite(view);
  }

  /** Simple extruded block shown until the voxel strip has baked. */
  private drawFallback(view: StructureView): void {
    const g = view.fallback;
    g.clear();
    const hw = (view.rect.w * 72) / 2 * 0.8;
    const hh = (view.rect.h * 36) / 2 * 0.8;
    const height = view.key === 'castle' ? 70 : view.key === 'spire' ? 60 : 34;
    const color = FALLBACK_COLORS[view.key];
    const shade = (f: number) => Phaser.Display.Color.ValueToColor(color).darken(f).color;
    g.fillStyle(shade(30), 1);
    g.fillPoints([{ x: -hw, y: 0 }, { x: 0, y: hh }, { x: 0, y: hh - height }, { x: -hw, y: -height }], true);
    g.fillStyle(shade(45), 1);
    g.fillPoints([{ x: hw, y: 0 }, { x: 0, y: hh }, { x: 0, y: hh - height }, { x: hw, y: -height }], true);
    g.fillStyle(color, 1);
    g.fillPoints([{ x: 0, y: -hh - height }, { x: hw, y: -height }, { x: 0, y: hh - height }, { x: -hw, y: -height }], true);
  }

  private attachSprite(view: StructureView): void {
    if (view.sprite) return;
    const sprite = createStructureSprite(this.scene, view.key, 'idle');
    if (!sprite) return;
    view.sprite = sprite;
    view.container.addAt(sprite, 0);
    view.fallback.setVisible(false);
    view.state = undefined; // force the state animation to re-apply
    sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (anim: Phaser.Animations.Animation) => {
      if (anim.key.endsWith('-attack') || anim.key.endsWith('-pulse')) {
        view.attacking = false;
        if (view.state === 'idle') playStructureAnim(sprite, 'idle');
      }
    });
  }

  /** Called when a structure strip finishes baking. */
  onStripReady(): void {
    for (const view of this.views.values()) this.attachSprite(view);
  }

  // ── Queries ─────────────────────────────────────────────────────────────────

  /** Alive, built structures invaders may attack. */
  getTargets(): StructureTarget[] {
    const store = useGameStore.getState();
    const out: StructureTarget[] = [];
    const castle = this.views.get('CASTLE')!;
    if (store.castleBuilt && store.defense.castleHp > 0) out.push({ id: 'CASTLE', rect: castle.rect, x: castle.x, y: castle.y });
    for (const id of BUILDING_IDS) {
      const b = store.resourceBuildings[id];
      const view = this.views.get(id)!;
      if (b && b.level >= 1 && buildingHpOf(b) > 0) out.push({ id, rect: view.rect, x: view.x, y: view.y });
    }
    return out;
  }

  getCastleTarget(): StructureTarget | undefined {
    return this.getTargets().find((t) => t.id === 'CASTLE');
  }

  /** Operational establishments with their 4×4 defense zones. */
  getTowers(): Array<{ id: ResourceBuildingId; rect: TileRect; zone: TileRect; x: number; y: number; muzzleX: number; muzzleY: number; towerLevel: number }> {
    const store = useGameStore.getState();
    return BUILDING_IDS.filter((id) => {
      const b = store.resourceBuildings[id];
      return store.castleBuilt && b && b.level >= 1 && buildingHpOf(b) > 0;
    }).map((id) => {
      const view = this.views.get(id)!;
      return {
        id,
        rect: view.rect,
        zone: expandRect(view.rect, ZONE_MARGIN),
        x: view.x,
        y: view.y,
        muzzleX: view.x + MUZZLES[id].x,
        muzzleY: view.y + MUZZLES[id].y,
        towerLevel: towerLevelOf(store.resourceBuildings[id]),
      };
    });
  }

  /** World position of the beacon crystal on top of the keep. */
  getBeaconPoint(): { x: number; y: number } {
    const castle = this.views.get('CASTLE')!;
    // The crystal crowns the keep: its centre sits ~12 units under the sprite's top
    return { x: castle.x, y: castle.y - ((structureHeadroom('castle') ?? 125) - 12) };
  }

  displayName(id: StructureId): string {
    const tl = useGameStore.getState().language === 'TL';
    if (id === 'CASTLE') return tl ? 'Kuta' : 'Citadel';
    const cfg = RESOURCE_BUILDING_CONFIG[id];
    return tl ? cfg.label : cfg.labelEn;
  }

  // ── Damage ──────────────────────────────────────────────────────────────────

  /** Applies invader damage to a structure; returns false if it was already down. */
  damage(target: StructureTarget, amount: number): boolean {
    const store = useGameStore.getState();
    const view = this.views.get(target.id);
    if (target.id === 'CASTLE') {
      if (store.defense.castleHp <= 0) return false;
      store.damageCastle(amount);
      logMessage('castleDamage', {}, { mergeKey: 'castle-dmg', amount });
      this.scene.cameras.main.shake(140, 0.004);
    } else {
      const wrecked = store.damageBuilding(target.id, amount);
      const name = this.displayName(target.id);
      logMessage('buildingHit', { building: name }, { mergeKey: `bhit:${target.id}`, amount, icon: RESOURCE_BUILDING_CONFIG[target.id].icon });
      if (wrecked) {
        logMessage('buildingWrecked', { building: name }, { icon: RESOURCE_BUILDING_CONFIG[target.id].icon });
        soundFx.playExplosion();
        this.scene.cameras.main.shake(260, 0.008);
        if (view) this.debris(view, 18);
      }
    }
    if (view) {
      this.flash(view);
      if (Math.random() < 0.5) this.debris(view, 4);
    }
    return true;
  }

  private flash(view: StructureView): void {
    const sprite = view.sprite;
    if (!sprite) return;
    sprite.setTint(0xff9a9a);
    this.scene.time.delayedCall(90, () => sprite.active && sprite.clearTint());
  }

  private debris(view: StructureView, count: number): void {
    const color = FALLBACK_COLORS[view.key];
    for (let i = 0; i < count; i++) {
      const p = this.scene.add.rectangle(view.x + Phaser.Math.Between(-30, 30), view.y - Phaser.Math.Between(10, 50), 4, 4, i % 2 ? color : 0x57534e);
      p.setDepth(9990);
      this.layer.add(p);
      this.scene.tweens.add({
        targets: p,
        x: p.x + Phaser.Math.Between(-40, 40),
        y: p.y + Phaser.Math.Between(10, 40),
        angle: Phaser.Math.Between(-180, 180),
        alpha: 0,
        duration: 600 + Math.random() * 300,
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  /** Returns a looping attack animation (the Hellfire Maw) to idle. */
  stopAttack(id: ResourceBuildingId): void {
    const view = this.views.get(id);
    if (!view?.sprite || view.state !== 'idle') return;
    view.attacking = false;
    playStructureAnim(view.sprite, 'idle', true);
  }

  /** Plays a building's attack animation (towers call this when they fire). */
  playAttack(id: ResourceBuildingId): void {
    const view = this.views.get(id);
    if (!view?.sprite || view.state !== 'idle') return;
    view.attacking = true;
    playStructureAnim(view.sprite, 'attack', true);
  }

  // ── Frame update ────────────────────────────────────────────────────────────

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.elapsed += dt;
    const store = useGameStore.getState();
    const construction = this.constructionProvider();

    for (const view of this.views.values()) {
      let state: ViewState;
      let hp = 1;
      let maxHp = 1;
      if (view.id === 'SPIRE') {
        state = 'idle';
      } else if (view.id === 'CASTLE') {
        hp = store.defense.castleHp;
        maxHp = store.defense.castleMaxHp;
        state = !store.castleBuilt ? 'site' : hp <= 0 ? 'ruined' : 'idle';
      } else {
        const b = store.resourceBuildings[view.id];
        hp = buildingHpOf(b);
        maxHp = buildingMaxHp(towerLevelOf(b));
        state = !store.castleBuilt || !b || b.level < 1 ? 'site' : hp <= 0 ? 'ruined' : 'idle';
      }

      if (state !== view.state) {
        const finished = view.state === 'site' && state === 'idle';
        view.state = state;
        view.attacking = false;
        view.container.setAlpha(1);
        view.container.setScale(1);
        view.fallback.setAlpha(state === 'site' ? 0.35 : state === 'ruined' ? 0.6 : 1);
        if (view.sprite) playStructureAnim(view.sprite, state, true);
        if (finished) this.playBuiltFlourish(view);
      }

      // Pre-construction: only the site the Ent is working on shows its scaffold;
      // later plots stay bare paved foundations until their turn comes.
      if (state === 'site') {
        const active = construction?.siteId === view.id ? construction : null;
        view.container.setVisible(!!active);
        if (!active) continue;
        this.animateConstructionSite(view, active, dt);
        continue;
      }
      if (!view.container.visible) view.container.setVisible(true);

      // HP bar: shown whenever damaged (the castle's also shows its shield during waves)
      const shield = view.id === 'CASTLE' ? store.defense.shieldHp / Math.max(1, store.defense.shieldMaxHp) : 0;
      const showBar = view.id !== 'SPIRE' && (hp < maxHp || (view.id === 'CASTLE' && store.invasion.isActive));
      // Include skill cooldown states so bar redraws when skills become ready
      const skillKey = (view.id !== 'CASTLE' && view.id !== 'SPIRE')
        ? (() => {
            const cd = store.establishmentSkillCooldowns?.[view.id as ResourceBuildingId];
            return cd ? `${cd.skill1 <= 0 ? 1 : 0}${cd.skill2 <= 0 ? 1 : 0}` : '00';
          })()
        : '';
      const hpKey = showBar ? `${Math.round((hp / Math.max(1, maxHp)) * 60)}|${Math.round(shield * 60)}${skillKey}` : 'off';
      if (hpKey !== view.lastHpKey) {
        view.lastHpKey = hpKey;
        this.drawHpBar(view, showBar, hp / Math.max(1, maxHp), shield);
      }

      if (state === 'ruined') {
        view.smokeTimer -= dt;
        if (view.smokeTimer <= 0) {
          view.smokeTimer = 0.35 + Math.random() * 0.3;
          this.puffSmoke(view);
        }
      }
    }

    this.syncSolids();
    this.updateBeacon(dt, store);
    this.drawZones(store.invasion.isActive);
  }

  /**
   * Returns the StructureId at the given local scene coordinates (relative to the
   * game world), or undefined if no structure occupies that tile.
   * Uses the IsometricHelper to convert from screen → grid then checks footprints.
   */
  getStructureAt(localX: number, localY: number): StructureId | undefined {
    const grid = IsometricHelper.screenToGrid(localX, localY);
    const gx = Math.floor(grid.x + 0.5);
    const gy = Math.floor(grid.y + 0.5);
    const store = useGameStore.getState();
    if (store.castleBuilt && rectContainsTile(CASTLE_FOOTPRINT, gx, gy)) return 'CASTLE';
    for (const id of BUILDING_IDS) {
      const b = store.resourceBuildings[id];
      if (b && b.level >= 1 && rectContainsTile(BUILDING_SITES[id].footprint, gx, gy)) return id;
    }
    return undefined;
  }

  private drawHpBar(view: StructureView, visible: boolean, pct: number, shieldPct: number): void {
    const g = view.hpBar;
    g.clear();
    if (!visible) return;

    const store = useGameStore.getState();
    const width = view.rect.w * 22;
    const top = -(structureHeadroom(view.key) ?? (view.key === 'castle' ? 190 : 100)) - 6;
    const x = -width / 2;

    // Background track
    g.fillStyle(0x000000, 0.7);
    g.fillRect(x - 1, top - 1, width + 2, shieldPct > 0 ? 9 : 6);

    // HP bar fill
    const color = pct > 0.5 ? 0x22c55e : pct > 0.25 ? 0xf59e0b : 0xef4444;
    g.fillStyle(color, 1);
    g.fillRect(x, top, width * Phaser.Math.Clamp(pct, 0, 1), 4);

    // Shield bar (castle only during invasion)
    if (shieldPct > 0) {
      g.fillStyle(0x38bdf8, 1);
      g.fillRect(x, top + 5, width * Phaser.Math.Clamp(shieldPct, 0, 1), 2);
    }

    // ── +Level indicator (for non-castle establishments) ──────────────────
    if (view.id !== 'CASTLE' && view.id !== 'SPIRE') {
      const b = store.resourceBuildings[view.id as ResourceBuildingId];
      if (b && b.level >= 1) {
        const tLevel = towerLevelOf(b);
        const labelX = x + width + 4;
        const labelY = top - 1;
        // Upgrade level badge: "+N" in gold
        g.fillStyle(0xfbbf24, 0.85);
        g.fillRect(labelX, labelY, 16, 7);
        g.fillStyle(0x000000, 0.5);
        g.fillRect(labelX, labelY, 16, 7);
        // We use text objects to render "+1"…"+5"; stored on view.hpBar as child texts
        // (We use Graphics primitives only — text rendering done via scene.add.text in addView)
        // Instead draw simple pixel-art bars representing tower level dots
        const dotSpacing = 4;
        for (let i = 0; i < TOWER_MAX_LEVEL; i++) {
          const dotColor = i < tLevel ? 0xfbbf24 : 0x374151;
          g.fillStyle(dotColor, 1);
          g.fillRect(labelX + i * dotSpacing, labelY + 2, 3, 3);
        }
      }
    }

    // ── Skill status dots ──────────────────────────────────────────────────
    if (view.id !== 'CASTLE' && view.id !== 'SPIRE') {
      const bid = view.id as ResourceBuildingId;
      const cooldowns = store.establishmentSkillCooldowns?.[bid] ?? { skill1: 0, skill2: 0 };
      const skill1Ready = cooldowns.skill1 <= 0;
      const skill2Ready = cooldowns.skill2 <= 0;
      const dotsX = x + width + 22; // to the right of level dots
      const dotsY = top + 1;
      const dotR = 2.5;

      // Skill 1 dot
      g.fillStyle(skill1Ready ? 0x22d3ee : 0xef4444, 1);
      g.fillCircle(dotsX, dotsY, dotR);

      // Skill 2 dot
      g.fillStyle(skill2Ready ? 0xa855f7 : 0xef4444, 1);
      g.fillCircle(dotsX + dotR * 2 + 2, dotsY, dotR);
    }
  }

  /**
   * The Ent's active job: scaffold fades in as it arrives, sways and kicks up
   * dust while being built, and waits dimmed when supplies are short. A
   * progress bar above the site shows how far the build has come.
   */
  private animateConstructionSite(view: StructureView, status: ConstructionStatus, dt: number): void {
    const building = status.phase === 'building';
    view.container.setAlpha(status.phase === 'waiting' ? 0.55 + Math.sin(this.elapsed * 3) * 0.1 : building ? 1 : 0.8);
    view.container.setScale(1, building ? 1 + Math.sin(this.elapsed * 14) * 0.015 : 1);

    if (building) {
      view.smokeTimer -= dt;
      if (view.smokeTimer <= 0) {
        view.smokeTimer = 0.25 + Math.random() * 0.2;
        this.puffDust(view);
      }
    }

    const key = `site|${status.phase}|${Math.round(status.progress * 40)}`;
    if (key === view.lastHpKey) return;
    view.lastHpKey = key;
    this.drawConstructionBar(view, status);
  }

  private drawConstructionBar(view: StructureView, status: ConstructionStatus): void {
    const g = view.hpBar;
    g.clear();
    const width = view.rect.w * 22;
    const top = -(structureHeadroom(view.key) ?? (view.key === 'castle' ? 190 : 100)) - 6;
    const x = -width / 2;

    g.fillStyle(0x000000, 0.7);
    g.fillRect(x - 1, top - 1, width + 2, 6);
    if (status.phase === 'waiting') {
      // Hazard stripes: the Ent is waiting for supplies
      for (let i = 0; i < width; i += 6) {
        g.fillStyle(i % 12 === 0 ? 0xf59e0b : 0x3f3f46, 1);
        g.fillRect(x + i, top, Math.min(4, width - i), 4);
      }
      return;
    }
    g.fillStyle(0x78350f, 1);
    g.fillRect(x, top, width, 4);
    g.fillStyle(0xfbbf24, 1);
    g.fillRect(x, top, width * Phaser.Math.Clamp(status.progress, 0, 1), 4);
  }

  private puffDust(view: StructureView): void {
    const puff = this.scene.add.circle(
      view.x + Phaser.Math.Between(-view.rect.w * 18, view.rect.w * 18),
      view.y + Phaser.Math.Between(-6, 8),
      Phaser.Math.Between(3, 6),
      Math.random() < 0.5 ? 0xd6b98c : 0xa8a29e,
      0.6
    );
    puff.setDepth(9980);
    this.layer.add(puff);
    this.scene.tweens.add({
      targets: puff,
      y: puff.y - Phaser.Math.Between(12, 26),
      x: puff.x + Phaser.Math.Between(-12, 12),
      scale: 1.8,
      alpha: 0,
      duration: 900,
      ease: 'Sine.easeOut',
      onComplete: () => puff.destroy(),
    });
  }

  /** A finished structure pops into place with a burst of dust. */
  private playBuiltFlourish(view: StructureView): void {
    view.container.setScale(0.85);
    this.scene.tweens.add({ targets: view.container, scaleX: 1, scaleY: 1, duration: 450, ease: 'Back.easeOut' });
    for (let i = 0; i < 10; i++) this.puffDust(view);
  }

  private puffSmoke(view: StructureView): void {
    const puff = this.scene.add.circle(
      view.x + Phaser.Math.Between(-view.rect.w * 16, view.rect.w * 16),
      view.y - Phaser.Math.Between(10, 40),
      Phaser.Math.Between(5, 9),
      Math.random() < 0.3 ? 0xf97316 : 0x3f3f46,
      0.55
    );
    puff.setDepth(9980);
    this.layer.add(puff);
    this.scene.tweens.add({
      targets: puff,
      y: puff.y - Phaser.Math.Between(40, 70),
      x: puff.x + Phaser.Math.Between(-10, 18),
      scale: 2.2,
      alpha: 0,
      duration: 1600,
      ease: 'Sine.easeOut',
      onComplete: () => puff.destroy(),
    });
  }

  /** Built structures (plus the spire and portal pads) are solid for every walker. */
  private syncSolids(): void {
    const store = useGameStore.getState();
    const solids: SolidArea[] = [{ id: 'SPIRE', rect: SPIRE_FOOTPRINT }];
    for (const portal of PORTAL_SITES) solids.push({ id: `PORTAL_${portal.id}`, rect: { ...portal.tile, w: 1, h: 1 } });
    if (store.castleBuilt) {
      solids.push({ id: 'CASTLE', rect: CASTLE_FOOTPRINT });
      for (const id of BUILDING_IDS) {
        if ((store.resourceBuildings[id]?.level ?? 0) >= 1) solids.push({ id, rect: BUILDING_SITES[id].footprint });
      }
    }
    this.nav.setSolids(solids);
  }

  // ── Provoke Beacon ──────────────────────────────────────────────────────────

  /**
   * The citadel no longer shoots. Instead its beacon pulses: every invader
   * within range is provoked for a while and must attack the citadel,
   * sparing the establishments.
   */
  private updateBeacon(dt: number, store: ReturnType<typeof useGameStore.getState>): void {
    const castle = this.views.get('CASTLE')!;
    const invaders = this.invaderProvider();
    for (const inv of invaders) {
      if (inv.provokedTimer && inv.provokedTimer > 0) {
        inv.provokedTimer -= dt;
        if (inv.sprite?.active) inv.sprite.setTint(inv.provokedTimer > 0 ? 0xffb4b4 : 0xffffff);
        if (inv.provokedTimer <= 0 && inv.sprite?.active) inv.sprite.clearTint();
      }
    }

    const alive = store.castleBuilt && store.defense.castleHp > 0;
    if (!alive || !store.invasion.isActive) {
      this.beaconTimer = 3;
      this.beaconActive = 0;
      return;
    }
    const stats = beaconStats(beaconLevelOf(store.defense));
    this.beaconRadius = stats.radiusTiles;

    if (this.beaconActive > 0) this.beaconActive -= dt;
    this.beaconTimer -= dt;
    if (this.beaconTimer > 0) return;
    this.beaconTimer = stats.interval;
    this.beaconActive = stats.duration;

    const beacon = this.getBeaconPoint();
    let provoked = 0;
    for (const inv of invaders) {
      if (inv.isDead || inv.isRetreating || inv.isScout || !inv.container.active) continue;
      if (this.nav.distanceToRect(inv.container.x, inv.container.y, CASTLE_FOOTPRINT) > stats.radiusTiles) continue;
      inv.provokedTimer = stats.duration;
      provoked++;
      this.tether(beacon.x, beacon.y, inv.container.x, inv.container.y - 14);
    }
    if (castle.sprite && castle.state === 'idle') {
      castle.attacking = true;
      playStructureAnim(castle.sprite, 'pulse', true);
      this.scene.time.delayedCall(Math.min(stats.duration, 2.5) * 1000, () => {
        if (castle.sprite?.active && castle.state === 'idle') playStructureAnim(castle.sprite, 'idle', true);
        castle.attacking = false;
      });
    }
    this.beaconRing(stats.radiusTiles);
    soundFx.playCastleHit();
    if (provoked > 0) logMessage('provokePulse', { count: provoked }, { mergeKey: 'provoke', amount: provoked });
  }

  /** Expanding red-gold ring on the ground marking the beacon's reach. */
  private beaconRing(radiusTiles: number): void {
    const r = rectCenter(CASTLE_FOOTPRINT);
    const center = IsometricHelper.gridToScreen(r.x, r.y);
    const ring = this.scene.add.graphics();
    ring.setPosition(center.x, center.y);
    this.groundLayer.add(ring);
    const reach = (CASTLE_FOOTPRINT.w / 2 + radiusTiles) * 72;
    ring.lineStyle(3, 0xef4444, 0.9);
    ring.strokeEllipse(0, 0, reach, reach / 2);
    ring.lineStyle(6, 0xfbbf24, 0.35);
    ring.strokeEllipse(0, 0, reach * 0.96, reach * 0.48);
    ring.setScale(0.25);
    this.scene.tweens.add({
      targets: ring,
      scale: 1,
      alpha: { from: 1, to: 0 },
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  private tether(x0: number, y0: number, x1: number, y1: number): void {
    const gfx = this.scene.add.graphics();
    gfx.setDepth(9985);
    this.layer.add(gfx);
    gfx.lineStyle(2, 0xef4444, 0.85);
    gfx.lineBetween(x0, y0, x1, y1);
    gfx.lineStyle(5, 0xfbbf24, 0.25);
    gfx.lineBetween(x0, y0, x1, y1);
    this.scene.tweens.add({ targets: gfx, alpha: 0, duration: 700, onComplete: () => gfx.destroy() });
  }

  /** Faint diamond outlines of every operational tower's 4×4 zone while a wave is on. */
  private drawZones(active: boolean): void {
    const g = this.zoneGfx;
    g.clear();
    if (!active) return;
    const pulse = 0.25 + Math.sin(this.scene.time.now / 400) * 0.08;
    for (const tower of this.getTowers()) {
      const z = tower.zone;
      const corners = [
        IsometricHelper.gridToScreen(z.x - 0.5, z.y - 0.5),
        IsometricHelper.gridToScreen(z.x + z.w - 0.5, z.y - 0.5),
        IsometricHelper.gridToScreen(z.x + z.w - 0.5, z.y + z.h - 0.5),
        IsometricHelper.gridToScreen(z.x - 0.5, z.y + z.h - 0.5),
      ];
      const color = ZONE_COLORS[tower.id];
      g.fillStyle(color, pulse * 0.25);
      g.fillPoints(corners, true);
      g.lineStyle(1.5, color, pulse + 0.2);
      g.strokePoints([...corners, corners[0]], false);
    }
    // Beacon reach while it is provoking
    if (this.beaconActive > 0) {
      const r = rectCenter(CASTLE_FOOTPRINT);
      const c = IsometricHelper.gridToScreen(r.x, r.y);
      const reach = (CASTLE_FOOTPRINT.w / 2 + this.beaconRadius) * 72;
      g.lineStyle(2, 0xef4444, 0.35 + Math.sin(this.scene.time.now / 120) * 0.15);
      g.strokeEllipse(c.x, c.y, reach, reach / 2);
    }
  }

  destroy(): void {
    for (const view of this.views.values()) view.container.destroy();
    this.views.clear();
    this.zoneGfx.destroy();
  }
}

/**
 * Where each establishment's weapon sits, as a world offset from the sprite
 * anchor (projected from the voxel models: catapult bucket, obelisk crystal,
 * grove canopy, spike launcher, Hellfire Maw).
 */
const MUZZLES: Record<ResourceBuildingId, { x: number; y: number }> = {
  QUARRY: { x: 19, y: -72 },
  PORT: { x: 4, y: -77 },
  WOOD: { x: 0, y: -80 },
  MINE: { x: 4, y: -16 },
  CAVE: { x: 23, y: -18 },
};

const ZONE_COLORS: Record<ResourceBuildingId, number> = {
  QUARRY: 0xf59e0b,
  PORT: 0x67e8f9,
  WOOD: 0x4ade80,
  MINE: 0xcbd5e1,
  CAVE: 0xf97316,
};
