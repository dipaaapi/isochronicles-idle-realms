import { markShadow } from './graphicsFx';
import Phaser from 'phaser';
import { GridPoint, UnitClass, UNIT_CLASSES, TASK_NODE_LOCATIONS, TASK_CONFIG } from '../types/game';
import { ResourceBuildingId, UnitRosterItem } from '../types/state';
import { IsometricHelper } from './IsometricHelper';
import { PathfindingService } from './PathfindingService';
import { useGameStore } from '../state/useGameStore';
import { isModActive } from './skills/combatMods';
import { ConstructionStatus, CONSTRUCTION_SECONDS, nextConstruction, nextChampionConstruction, nextMinionSpireConstruction } from '../state/constructionProgress';
import { soundFx } from './audio/soundFx';
import { logFloatingText, nearestName } from '../state/activityLog';
import type { InvasionManager } from './InvasionManager';
import { createMinionSprite, faceCharacterSprite, minionSpriteHeadroom, playCharacterAttack, playCharacterWork } from './sprites/CharacterSprites';
import { Navigation } from './Navigation';
import type { PortalManager } from './PortalManager';
import { BUILDING_IDS, BUILDING_SITES, CASTLE_GATE, GRID_CENTER, GRID_SIZE, PORTAL_SITES, SPIRE_WORK_SPOT } from '../state/buildingLayout';
import type { GroundLootItem, GroundLootManager, LootSeeker } from './GroundLootManager';
import { isEnrichableTask, type WorkerContext, type WorkerFrame, type WorkerInstance } from './workers/types';
import { renderCargoGraphics, renderWorkerGraphics } from './workers/legacyWorkerArt';
import { computeWorkerFrame } from './workers/modifiers';
import { tryResurrect, updateSupportSlime } from './workers/supportSlime';
import { updateConstruction, updateTreant } from './workers/treant';
import { generalHomeSite, updateGeneralConstruction } from './workers/generalConstruction';
import { updateGeneralLooting } from './workers/generalLooting';
import { playSummonRitual, SUMMON_RITUALS } from './workers/summonRitual';
import { rallyForInvasion, updateCombat, updateHealer } from './workers/combat';
import { abandonUnavailableTask, chooseGatherTask, isGatherer, updateGatherState, updateStatusEmote } from './workers/gathering';
import { buildingHpOf, buildingMaxHp, towerBuildingOf, towerLevelOf } from '../state/defenseStats';

export type { WorkerInstance } from './workers/types';

/**
 * Owns the minions on the map: spawning / syncing them with the roster,
 * their visuals (sprite, gauges, lantern, emotes) and movement helpers. The
 * per-role behaviour lives in ./workers/ (Support Slime, Ancient Ent,
 * combat & healing, the gathering loop) and calls back through the
 * WorkerContext this class implements.
 */
export class WorkerManager implements WorkerContext {
  public readonly scene: Phaser.Scene;
  private pathfinder: PathfindingService;
  private workers: WorkerInstance[] = [];
  private parentContainer?: Phaser.GameObjects.Container;
  public readonly nexusGridPos: GridPoint = CASTLE_GATE;
  public invasionManager?: InvasionManager;
  private nav?: Navigation;
  public portals?: PortalManager;
  public groundLoot?: GroundLootManager;
  public defenders?: import('./DefenderSystem').DefenderSystem;

  public setDefenderSystem(defenders: import('./DefenderSystem').DefenderSystem): void {
    this.defenders = defenders;
  }

  public getDefenders(): import('./DefenderSystem').Defender[] {
    return this.defenders ? this.defenders.getDefenders() : [];
  }

  public setGroundLoot(loot: GroundLootManager): void {
    this.groundLoot = loot;
  }

  public getNearestGroundLoot(x: number, y: number, maxDist: number = 320, seeker: LootSeeker = 'tenant'): GroundLootItem | null {
    return this.groundLoot ? this.groundLoot.getNearestLoot(x, y, maxDist, seeker) : null;
  }

  public collectGroundLoot(item: GroundLootItem, collectorName?: string): void {
    this.groundLoot?.collectLoot(item, collectorName);
  }

  constructor(
    scene: Phaser.Scene,
    pathfinder: PathfindingService,
    nexusGridPos: GridPoint = CASTLE_GATE,
    parentContainer?: Phaser.GameObjects.Container
  ) {
    this.scene = scene;
    this.pathfinder = pathfinder;
    this.nexusGridPos = nexusGridPos;
    this.parentContainer = parentContainer;
  }

  public setParentContainer(container: Phaser.GameObjects.Container): void {
    this.parentContainer = container;
  }

  public setInvasionManager(manager: InvasionManager): void {
    this.invasionManager = manager;
  }

  /** Obstacles (building footprints) and the invader portals minions can assault. */
  public setWorld(world: { nav: Navigation; portals: PortalManager }): void {
    this.nav = world.nav;
    this.portals = world.portals;
  }

  /**
   * Straight-line movement for free-roaming minions (chasing, following,
   * walking to a site) that detours around solid footprints and never ends
   * up inside one. Returns the remaining distance to the target.
   */
  public moveToward(worker: WorkerInstance, tx: number, ty: number, step: number, deltaSec: number): number {
    const c = worker.container;
    const dist = Math.hypot(tx - c.x, ty - c.y);
    if (dist < 0.001) return 0;
    const next = this.nav ? this.nav.steer(worker, c.x, c.y, tx, ty, deltaSec) : { x: tx, y: ty };
    const dx = next.x - c.x;
    const dy = next.y - c.y;
    const d = Math.hypot(dx, dy) || 1;
    const move = Math.min(step, d);
    let nx = c.x + (dx / d) * move;
    let ny = c.y + (dy / d) * move;
    if (this.nav) ({ x: nx, y: ny } = this.nav.pushOut(nx, ny));
    c.x = nx;
    c.y = ny;
    const grid = Navigation.tileOf(c.x, c.y);
    worker.gridX = Phaser.Math.Clamp(grid.x, 0, GRID_SIZE - 1);
    worker.gridY = Phaser.Math.Clamp(grid.y, 0, GRID_SIZE - 1);
    c.setDepth(IsometricHelper.getDepth(worker.gridX, worker.gridY, 6));
    return Math.hypot(tx - c.x, ty - c.y);
  }

  public syncWithRoster(roster: UnitRosterItem[]): void {
    const existingMap = new Map<string, WorkerInstance>();
    for (const w of this.workers) {
      existingMap.set(w.id, w);
    }

    // Add new workers or update tasks of existing ones
    for (const item of roster) {
      const existing = existingMap.get(item.id);
      if (existing) {
        let needsVisualRefresh = false;
        if (existing.assignedTask !== item.assignedTask) {
          existing.assignedTask = item.assignedTask;
          needsVisualRefresh = true;
          // Retarget if currently moving or idle
          if (existing.status === 'MOVING_TO_NODE' || existing.status === 'IDLE') {
            this.dispatchToTaskNode(existing);
          }
        }
        if (JSON.stringify(existing.equipment) !== JSON.stringify(item.equipment)) {
          existing.equipment = item.equipment;
          needsVisualRefresh = true;
        }
        if ((item.slimeEvolutionLevel ?? 1) !== existing.supportEvolutionLevel) {
          const previousLevel = existing.supportEvolutionLevel;
          existing.supportEvolutionLevel = item.slimeEvolutionLevel ?? 1;
          this.playEvolutionEffect(existing, 'Support Slime', previousLevel, existing.supportEvolutionLevel, 0x22d3ee, '💧');
        }
        if ((item.treantEvolutionLevel ?? 1) !== (existing.treantEvolutionLevel ?? 1)) {
          const previousLevel = existing.treantEvolutionLevel ?? 1;
          existing.treantEvolutionLevel = item.treantEvolutionLevel ?? 1;
          this.playEvolutionEffect(existing, 'Ancient Ent', previousLevel, existing.treantEvolutionLevel, 0x22c55e, '🌲');
        }

        if (item.parentBuildingId !== undefined) {
          existing.parentBuildingId = item.parentBuildingId;
        }

        if (needsVisualRefresh) {
          this.redrawBody(existing);
          renderCargoGraphics(existing.cargoIcon, existing.assignedTask);
          existing.emoteText.setText(TASK_CONFIG[existing.assignedTask].icon);
        }
      } else {
        this.createWorker(item);
      }
    }

    // Remove any decommissioned workers
    const activeIds = new Set(roster.map((r) => r.id));
    this.workers = this.workers.filter((w) => {
      if (!activeIds.has(w.id)) {
        w.container.destroy();
        return false;
      }
      return true;
    });
  }

  private createWorker(item: UnitRosterItem): void {
    const config = UNIT_CLASSES[item.unitClass];
    const isTenant = item.parentBuildingId !== undefined || item.id.startsWith('tenant_');
    const parentBuildingId = item.parentBuildingId || (item.id.startsWith('tenant_') ? (item.id.split('_')[1]?.toUpperCase() as ResourceBuildingId) : undefined);
    const isGeneral = !isTenant && item.unitClass !== 'TREANT' && item.unitClass !== 'AQUA_SLIME';

    // Spawn location calculation
    let startX = this.nexusGridPos.x;
    let startY = this.nexusGridPos.y;

    if (isTenant && parentBuildingId && BUILDING_SITES[parentBuildingId]) {
      startX = BUILDING_SITES[parentBuildingId].workSpot.x;
      startY = BUILDING_SITES[parentBuildingId].workSpot.y;
    } else if (isGeneral) {
      const ent = this.workers.find((w) => w.unitClass === 'TREANT');
      if (ent) {
        startX = ent.gridX;
        startY = ent.gridY;
      }
    }

    const startIso = IsometricHelper.gridToScreen(startX, startY);

    const container = this.scene.add.container(startIso.x, startIso.y);
    container.setSize(36, 36);

    // Dynamic Night Lantern Ground Light (drawn below shadow)
    const lanternGfx = this.scene.add.graphics();

    // Ground shadow
    const shadow = markShadow(this.scene.add.ellipse(0, 4, 20, 10, 0x000000, 0.4));

    // Unit body graphics (dynamically tailored to unitClass AND appointed task!)
    const body = this.scene.add.graphics();
    renderWorkerGraphics(body, item.unitClass, item.assignedTask, item.equipment);

    // Floating cargo icon
    const cargoIcon = this.scene.add.graphics();
    renderCargoGraphics(cargoIcon, item.assignedTask);
    cargoIcon.setVisible(false);

    // Dual HP and Fatigue / Stamina floating gauges
    const gaugeGfx = this.scene.add.graphics();
    gaugeGfx.setVisible(false);

    // Slice-of-Life Emote Bubble (sleek, compact, only shown during active reactions)
    // Kept small: it sits over the unit's head and must not hide the sprite
    const emoteBubble = this.scene.add.container(0, -30);
    const emoteBg = this.scene.add.graphics();
    emoteBg.fillStyle(0x0f172a, 0.82);
    emoteBg.lineStyle(1, config.lanternColor, 0.75);
    emoteBg.fillRect(-6, -5, 12, 10);
    emoteBg.strokeRect(-6, -5, 12, 10);

    const emoteText = this.scene.add.text(0, 0, TASK_CONFIG[item.assignedTask].icon, {
      fontSize: '7px',
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#f8fafc',
    });
    emoteText.setOrigin(0.5);
    emoteBubble.add([emoteBg, emoteText]);
    emoteBubble.setVisible(false);

    container.add([lanternGfx, shadow, body, cargoIcon, gaugeGfx, emoteBubble]);
    container.setDepth(IsometricHelper.getDepth(startX, startY, 6));

    if (this.parentContainer) {
      this.parentContainer.add(container);
    }

    const worker: WorkerInstance = {
      id: item.id,
      name: item.name,
      unitClass: item.unitClass,
      assignedTask: item.assignedTask,
      parentBuildingId,
      container,
      lanternGfx,
      shadow,
      body,
      cargoIcon,
      gaugeGfx,
      emoteBubble,
      emoteBg,
      emoteText,
      emoteBaseY: -36,
      gridX: startX,
      gridY: startY,
      currentPath: [],
      pathIndex: 0,
      status: 'IDLE',
      stateTimer: Math.random() * 400,
      cargo: 0,
      maxCargo: config.cargoCapacity,
      speed: config.baseSpeed,
      bobOffset: Math.random() * 100,
      buffTimer: 0,
      overrideEmote: null,
      overrideEmoteTimer: 0,
      hp: item.hp || config.baseHp,
      maxHp: item.maxHp || config.baseHp,
      stamina: 100,
      maxStamina: 100,
      staminaDrain: config.staminaDrainRate,
      restingZzzTimer: 0,
      attackPower: config.baseAttack,
      combatCooldown: 0,
      supportCooldown: 0,
      resurrectionCooldown: 0,
      supportEvolutionLevel: item.slimeEvolutionLevel ?? 1,
      treantEvolutionLevel: item.treantEvolutionLevel ?? 1,
      armorShield: 0,
      armorShieldTimer: 0,
      equipment: item.equipment,
      timeSinceLastTap: 0,
      // Dirty-check initial sentinel values
      _gaugeHp: -1,
      _gaugeMaxHp: -1,
      _gaugeStamina: -1,
      _gaugeMaxStamina: -1,
      _lanternDarkness: -1,
    };

    this.renderDualGauges(worker);

    // Interactive Clicking: motivate worker, play chirp, jump, restore stamina
    container.setInteractive({ useHandCursor: true });
    container.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        this.motivateWorker(worker);
      }
    });

    this.workers.push(worker);

    const nexusDepth = IsometricHelper.getDepth(this.nexusGridPos.x, this.nexusGridPos.y, 5);
    if (item.unitClass === 'AQUA_SLIME') {
      playSummonRitual(this.scene, this.parentContainer, container, startIso, nexusDepth, SUMMON_RITUALS.AQUA_SLIME, () => {
        soundFx.playFanfare();
        this.spawnHarvestBurst(startIso.x, startIso.y, 0x38bdf8, 14);
        this.spawnHarvestBurst(startIso.x, startIso.y, 0x22c55e, 10);
        this.spawnFloatingPopup(startIso.x, startIso.y - 45, '✨ Heavenly Descent! ✨', '#38bdf8');

        // If no Treant / Ent exists on the platform, Support Slime performs Genesis Summon for Sprout Ent at no cost!
        const store = useGameStore.getState();
        const hasTreant = store.roster.some((u) => u.unitClass === 'TREANT');
        if (!hasTreant) {
          this.scene.time.delayedCall(600, () => {
            this.spawnHarvestBurst(startIso.x, startIso.y - 12, 0x22d3ee, 20);
            this.spawnFloatingPopup(startIso.x, startIso.y - 55, '🌟 Slime Summoned: Sprout Ent! (Free) 🌟', '#22c55e');
            soundFx.playGolemCheer();
            store.summonUnit('TREANT', 'BUILD', true);
          });
        }
      });
    } else if (item.unitClass === 'TREANT') {
      playSummonRitual(this.scene, this.parentContainer, container, startIso, nexusDepth, SUMMON_RITUALS.TREANT, () => {
        soundFx.playFanfare();
        this.spawnHarvestBurst(startIso.x, startIso.y - 12, 0x86efac, 34);
        this.spawnHarvestBurst(startIso.x, startIso.y - 12, 0x22c55e, 24);
        this.spawnFloatingPopup(startIso.x, startIso.y - 58, '🌳 ANCIENT ENT AWAKENS! 🌳', '#86efac');
      });
    } else if (isGeneral) {
      const spawnDepth = IsometricHelper.getDepth(startX, startY, 5);
      playSummonRitual(this.scene, this.parentContainer, container, startIso, spawnDepth, SUMMON_RITUALS.GENERAL, () => {
        this.spawnHarvestBurst(startIso.x, startIso.y - 12, 0x22c55e, 18);
        this.spawnHarvestBurst(startIso.x, startIso.y - 12, 0xfbbf24, 14);
        this.spawnFloatingPopup(startIso.x, startIso.y - 48, `🌳 Mother Ent summoned ${config.name}! 🌟`, '#86efac');
        soundFx.playGolemCheer();
        soundFx.playFanfare();
      });
    } else if (isTenant) {
      this.spawnHarvestBurst(startIso.x, startIso.y - 10, 0x10b981, 10);
      this.spawnFloatingPopup(startIso.x, startIso.y - 36, `🏡 ${item.name} Reporting for Duty!`, '#6ee7b7');
    }
  }

  private playEvolutionEffect(
    worker: WorkerInstance,
    title: string,
    previousLevel: number,
    nextLevel: number,
    color: number,
    icon: string
  ): void {
    const burstX = worker.container.x;
    const burstY = worker.container.y - 12;
    const evolutionGfx = this.scene.add.graphics();
    evolutionGfx.setPosition(burstX, burstY);
    evolutionGfx.setDepth(10000);
    evolutionGfx.lineStyle(4, color, 0.95);
    evolutionGfx.strokeCircle(0, 0, 26);
    evolutionGfx.lineStyle(2, color, 0.6);
    evolutionGfx.strokeCircle(0, 0, 52);
    if (this.parentContainer) this.parentContainer.add(evolutionGfx);

    this.scene.tweens.add({
      targets: evolutionGfx,
      scaleX: 2.4,
      scaleY: 2.4,
      alpha: 0,
      duration: 1100,
      ease: 'Cubic.easeOut',
      onComplete: () => evolutionGfx.destroy(),
    });
    this.scene.tweens.add({
      targets: worker.container,
      scaleX: 1.3,
      scaleY: 1.3,
      yoyo: true,
      repeat: 2,
      duration: 180,
      ease: 'Sine.easeInOut',
    });
    // [Camera shake removed]
    this.spawnHarvestBurst(burstX, burstY, color, 36);
    this.spawnFloatingPopup(burstX, burstY - 52, `${icon} ${title} EVOLVED! Lv.${previousLevel} -> Lv.${nextLevel} ${icon}`, `#${color.toString(16).padStart(6, '0')}`);
    soundFx.playFanfare();
  }

  private renderDualGauges(worker: WorkerInstance): void {
    worker.gaugeGfx.clear();
    const barW = 18;
    const x = -barW / 2;

    // 1. HP Gauge (Top Bar)
    worker.gaugeGfx.fillStyle(0x020617, 0.65);
    worker.gaugeGfx.fillRoundedRect(x - 1, -26, barW + 2, 3, 1);

    const hpPct = Phaser.Math.Clamp(worker.hp / worker.maxHp, 0, 1);
    const hpColor = hpPct > 0.5 ? 0x22c55e : hpPct > 0.25 ? 0xf59e0b : 0xef4444;
    worker.gaugeGfx.fillStyle(hpColor, 0.95);
    worker.gaugeGfx.fillRect(x, -25.5, barW * hpPct, 2);

    // 2. Fatigue / Stamina Gauge (Bottom Bar)
    worker.gaugeGfx.fillStyle(0x020617, 0.65);
    worker.gaugeGfx.fillRoundedRect(x - 1, -22, barW + 2, 3, 1);

    const stamPct = Phaser.Math.Clamp(worker.stamina / worker.maxStamina, 0, 1);
    const stamColor = stamPct > 0.3 ? 0x38bdf8 : 0xf59e0b;
    worker.gaugeGfx.fillStyle(stamColor, 0.95);
    worker.gaugeGfx.fillRect(x, -21.5, barW * stamPct, 2);
  }

  /** Redraws the legacy vector body — skipped once the pixel sprite has taken over. */
  private redrawBody(worker: WorkerInstance): void {
    if (worker.sprite) {
      worker.body.clear();
      return;
    }
    renderWorkerGraphics(worker.body, worker.unitClass, worker.assignedTask, worker.equipment);
  }

  /**
   * Keeps a minion's 8-direction sprite in step with the simulation: attaches
   * it once the sheet is baked, faces the direction of travel (walk while
   * moving, idle loop while standing) with dynamic character motion physics.
   */
  private syncMinionSprite(worker: WorkerInstance, delta: number, time: number): void {
    if (!worker.container.active) return;

    if (!worker.sprite) {
      const created = createMinionSprite(this.scene, worker.unitClass);
      if (!created) return;
      worker.container.addAt(created, worker.container.getIndex(worker.body) + 1);
      worker.sprite = created;
      worker.body.clear();
      const headroom = minionSpriteHeadroom(worker.unitClass) ?? 24;
      worker.emoteBaseY = -(headroom + 10);
      worker._prevX = worker.container.x;
      worker._prevY = worker.container.y;
    }
    const sprite = worker.sprite;

    const dx = worker.container.x - (worker._prevX ?? worker.container.x);
    const dy = worker.container.y - (worker._prevY ?? worker.container.y);
    worker._prevX = worker.container.x;
    worker._prevY = worker.container.y;
    const moving = Math.hypot(dx, dy) > 0.02;
    faceCharacterSprite(sprite, dx, dy, moving);

    // Dynamic Organic Character Motion & Physics
    // Tenants are a smaller copy of their General so the General stays the one standout
    const baseScale = (UNIT_CLASSES[worker.unitClass]?.scale ?? 1.0) * (worker.parentBuildingId ? 0.72 : 1);
    const offset = worker.bobOffset ?? 0;

    if (worker.unitClass === 'AQUA_SLIME') {
      if (moving) {
        // Bouncy gelatinous hop
        const hopCycle = (time / 140 + offset) % Math.PI;
        const hopHeight = Math.sin(hopCycle) * 5;
        sprite.setPosition(worker.body.x, worker.body.y - hopHeight);
        const stretch = Math.sin(hopCycle) * 0.16;
        sprite.setScale(baseScale * (1 - stretch), baseScale * (1 + stretch));
      } else {
        // Gentle breathing gelatin pulse
        const breathe = Math.sin(time / 320 + offset) * 0.04;
        sprite.setPosition(worker.body.x, worker.body.y);
        sprite.setScale(baseScale * (1 + breathe), baseScale * (1 - breathe));
      }
    } else if (worker.unitClass === 'LAVA_GARGOYLE' || worker.unitClass === 'SUCCUBUS' || worker.unitClass === 'HARPY' || worker.unitClass === 'VOID_WRAITH') {
      // Floating aerial elevation hover
      const hover = Math.sin(time / 220 + offset) * 3.5;
      sprite.setPosition(worker.body.x, worker.body.y - hover);
      const sway = Math.sin(time / 300 + offset) * 0.02;
      sprite.setScale(baseScale * (1 + sway), baseScale * (1 - sway));
    } else if (worker.unitClass === 'TREANT' || worker.unitClass === 'GOLEM' || worker.unitClass === 'MINOTAUR') {
      // Heavy impactful grounded cadence
      if (moving) {
        const stepCycle = (time / 150 + offset) % Math.PI;
        const bob = Math.sin(stepCycle) * 2.0;
        sprite.setPosition(worker.body.x, worker.body.y - bob);
        sprite.setScale(baseScale, baseScale);
      } else {
        sprite.setPosition(worker.body.x, worker.body.y);
        sprite.setScale(baseScale, baseScale);
      }
    } else {
      // Ground beasts (Merman, Necromancer, Demon Hound, etc.): Natural gait
      if (moving) {
        const gait = Math.sin(time / 130 + offset) * 1.8;
        sprite.setPosition(worker.body.x, worker.body.y - Math.abs(gait));
        sprite.setScale(baseScale, baseScale);
      } else {
        const idleBreathe = Math.sin(time / 400 + offset) * 0.02;
        sprite.setPosition(worker.body.x, worker.body.y);
        sprite.setScale(baseScale * (1 + idleBreathe), baseScale * (1 - idleBreathe));
      }
    }

    if (!moving && worker.status === 'HARVESTING') {
      worker._workTimer = (worker._workTimer ?? 0) - delta;
      if (worker._workTimer <= 0) {
        worker._workTimer = 1100 + Math.random() * 400;
        playCharacterWork(sprite);
      }
    }
  }

  /** Turns a minion toward a target and plays its attack / cast. */
  public playMinionAttack(worker: WorkerInstance, targetX: number, targetY: number): void {
    if (!worker.sprite) return;
    faceCharacterSprite(worker.sprite, targetX - worker.container.x, targetY - worker.container.y, false);
    playCharacterAttack(worker.sprite);
  }

  public motivateWorker(worker: WorkerInstance): void {
    // Tapping no longer heals HP or restores stamina/fatigue
    worker.buffTimer = 8000;
    worker.overrideEmote = '✨';
    worker.overrideEmoteTimer = 2000;
    worker.emoteText.setText('✨');
    worker.timeSinceLastTap = 0;

    soundFx.playGolemCheer();

    // Cheerful jump & squish bounce tween
    this.scene.tweens.add({
      targets: worker.body,
      scaleY: 1.3,
      scaleX: 0.8,
      y: -8,
      yoyo: true,
      duration: 160,
      ease: 'Back.easeOut',
    });

    this.spawnFloatingPopup(
      worker.container.x,
      worker.container.y - 36,
      'Cheered On! ⚡ (+25% Spd)',
      '#f59e0b'
    );
  }

  public update(time: number, delta: number, ambientDarkness: number = 0): void {
    for (const worker of this.workers) this.syncMinionSprite(worker, delta, time);
    const store = useGameStore.getState();
    const treantLevel = this.workers.find((w) => w.unitClass === 'TREANT')?.treantEvolutionLevel ?? 1;

    for (const worker of [...this.workers]) {
      if (worker.hp <= 0) {
        // A Support Slime may revive the fallen; otherwise it is permadeath
        if (!tryResurrect(this, worker)) this.killWorker(worker);
        continue;
      }

      worker.timeSinceLastTap += delta;
      const aliveInvaders = this.invasionManager
        ? this.invasionManager.getInvaders().filter((i) => !i.isDead && !i.isRetreating)
        : [];
      const frame = computeWorkerFrame(worker, store, treantLevel, delta, aliveInvaders);
      this.updateOverhead(worker, frame.config, time, delta, ambientDarkness);

      // Skill status effects: stuns skip the frame, Temporal Stasis slows, surges speed up
      for (const key of ['stunTimer', 'slowTimer', 'armorBuffTimer', 'markedTimer'] as const) {
        if ((worker[key] ?? 0) > 0) worker[key] = Math.max(0, (worker[key] ?? 0) - frame.deltaSec);
      }
      if ((worker.stunTimer ?? 0) > 0) {
        worker.overrideEmote = '💫';
        worker.overrideEmoteTimer = 300;
        continue;
      }
      if ((worker.slowTimer ?? 0) > 0) frame.effectiveSpeed *= worker.slowFactor ?? 1;
      if (isModActive('beastSurge')) frame.effectiveSpeed *= 1.3;

      const isSupportSlime = worker.unitClass === 'AQUA_SLIME';
      const isTreant = worker.unitClass === 'TREANT';
      const isHealer = isSupportSlime || worker.unitClass === 'NECROMANCER' || worker.assignedTask === 'HEAL';

      if (isSupportSlime) {
        worker.resurrectionCooldown = Math.max(0, worker.resurrectionCooldown - frame.deltaSec);
        worker.status = 'HEALING';
        worker.overrideEmote = '💨';
        worker.overrideEmoteTimer = 800;
        worker.cargoIcon.setVisible(false);
      }

      // Invasion mobilization: fighters join the defence during active incursions
      rallyForInvasion(this, worker, frame, !isHealer && !isTreant);

      if (isSupportSlime) {
        updateSupportSlime(this, worker, frame);
        continue; // Never run the gathering FSM for the Support Slime
      }
      if (isTreant) {
        updateTreant(this, worker, frame);
        continue; // The Ent builds, repairs and enriches instead of gathering
      }
      const isTenant = !!worker.parentBuildingId || worker.id.startsWith('tenant_');
      const isGeneral = !isTenant && !isSupportSlime && !isTreant && !isHealer;
      if (isGeneral) {
        // Generals loot the platform's drops and haul them to the castle (credited on delivery)
        if (worker.status === 'COMBAT') {
          updateCombat(this, worker, frame);
          for (const [i, id] of (worker.carriedLoot ?? []).entries()) this.groundLoot?.carry(id, worker.container.x, worker.container.y, i);
        } else if (updateGeneralLooting(this, this.groundLoot, worker, frame.deltaSec, frame.effectiveSpeed)) {
          // busy looting / hauling
        } else if (!updateGeneralConstruction(this, worker, store, frame.deltaSec, frame.effectiveSpeed)) {
          // Each General raises its own establishment first, then guards and scouts
          this.updateGeneralScouting(worker, frame);
        }
        continue;
      }

      if (worker.parentBuildingId && worker.status !== 'COMBAT') {
        const closeLoot = this.getNearestGroundLoot(worker.container.x, worker.container.y, 32);
        if (closeLoot) {
          this.collectGroundLoot(closeLoot, worker.name);
          worker.overrideEmote = '✨';
          worker.overrideEmoteTimer = 1000;
        }
      }

      abandonUnavailableTask(worker, store);
      updateStatusEmote(worker, frame);
      if (worker.status === 'COMBAT') updateCombat(this, worker, frame);
      else updateGatherState(this, worker, frame);
    }
  }

  public updateGeneralScouting(worker: WorkerInstance, frame: WorkerFrame): void {
    worker.cargo = 0;
    worker.cargoIcon.setVisible(false);

    const { store, deltaSec, effectiveSpeed } = frame;
    const homeBuilding = frame.config.requiredBuilding;

    // 1. If damaged home establishment exists, head there to guard and assist
    if (homeBuilding) {
      const b = towerBuildingOf(store, homeBuilding);
      if (b && b.level >= 1 && buildingHpOf(b) < buildingMaxHp(towerLevelOf(b))) {
        const spot = homeBuilding === 'SPIRE' ? SPIRE_WORK_SPOT : BUILDING_SITES[homeBuilding]?.workSpot;
        if (spot) {
          const target = IsometricHelper.gridToScreen(spot.x, spot.y);
          const dist = Math.hypot(target.x - worker.container.x, target.y - worker.container.y);
          if (dist > 20) {
            worker.status = 'MOVING_TO_NODE';
            worker.overrideEmote = '🔨';
            worker.overrideEmoteTimer = 400;
            this.moveToward(worker, target.x, target.y, effectiveSpeed * 1.1 * deltaSec, deltaSec);
            return;
          }
          // At home establishment: guard and assist repair
          worker.status = 'HARVESTING';
          worker.stateTimer = (worker.stateTimer ?? 0) - frame.delta;
          worker.overrideEmote = '🔨';
          worker.overrideEmoteTimer = 400;
          if (worker.stateTimer <= 0) {
            const restored = useGameStore.getState().restoreBuildingHp(homeBuilding, 25);
            if (restored > 0) {
              this.spawnFloatingPopup(worker.container.x, worker.container.y - 35, `🔨 General Repaired +${restored} HP!`, '#86efac');
              soundFx.playHarvest('wood');
            }
            worker.stateTimer = 1500;
          }
          return;
        }
      }
    }

    // 2. Active Scouting & Realm Patrol
    if (worker.status === 'MOVING_TO_NODE' && worker.targetTile) {
      const target = IsometricHelper.gridToScreen(worker.targetTile.x, worker.targetTile.y);
      const dist = Math.hypot(target.x - worker.container.x, target.y - worker.container.y);
      worker.overrideEmote = '🧭';
      worker.overrideEmoteTimer = 400;
      if (dist > 18) {
        this.moveToward(worker, target.x, target.y, effectiveSpeed * deltaSec, deltaSec);
        return;
      }
      // Arrived at patrol waypoint!
      worker.status = 'IDLE';
      worker.stateTimer = 1200 + Math.random() * 800; // Stand watch for ~1.5s
      worker.overrideEmote = '🛡️';
      worker.overrideEmoteTimer = 1200;
      if (Math.random() < 0.40) {
        this.spawnFloatingPopup(worker.container.x, worker.container.y - 25, `🧭 Sector Clear`, '#38bdf8');
      }
      return;
    }

    // If standing watch (IDLE state timer counting down)
    if (worker.status === 'IDLE' && (worker.stateTimer ?? 0) > 0) {
      worker.stateTimer -= frame.delta;
      worker.overrideEmote = '🛡️';
      worker.overrideEmoteTimer = 400;
      return;
    }

    // 3. Choose next scout / patrol destination
    const roll = Math.random();
    let nextWaypoint: GridPoint;

    if (roll < 0.50 && PORTAL_SITES.length > 0) {
      // Scout invader rift portals to watch for invasions
      const portal = PORTAL_SITES[Math.floor(Math.random() * PORTAL_SITES.length)];
      nextWaypoint = portal.exit;
    } else if (roll < 0.80 && homeBuilding) {
      // Patrol parent establishment perimeter
      nextWaypoint = homeBuilding === 'SPIRE' ? SPIRE_WORK_SPOT : (BUILDING_SITES[homeBuilding]?.workSpot ?? CASTLE_GATE);
    } else if (BUILDING_IDS.length > 0) {
      // Patrol around other realm establishments
      const randBuilding = BUILDING_IDS[Math.floor(Math.random() * BUILDING_IDS.length)];
      nextWaypoint = BUILDING_SITES[randBuilding]?.workSpot ?? CASTLE_GATE;
    } else {
      // Patrol open realm terrain
      nextWaypoint = {
        x: Phaser.Math.Between(3, GRID_SIZE - 4),
        y: Phaser.Math.Between(3, GRID_SIZE - 4),
      };
    }

    worker.targetTile = nextWaypoint;
    worker.status = 'MOVING_TO_NODE';
    worker.overrideEmote = '🧭';
    worker.overrideEmoteTimer = 1500;
  }

  /** Permadeath: remove the minion from the map and the roster (with a partial refund). */
  private killWorker(worker: WorkerInstance): void {
    this.spawnFloatingPopup(worker.container.x, worker.container.y - 30, '💀 KIA', '#ef4444');
    worker.container.destroy();
    this.workers = this.workers.filter((w) => w.id !== worker.id);
    useGameStore.getState().removeUnit(worker.id, true);
  }

  /** Bobbing, HP/stamina gauges, night lantern and emote timers. */
  private updateOverhead(
    worker: WorkerInstance,
    config: typeof UNIT_CLASSES[UnitClass],
    time: number,
    delta: number,
    ambientDarkness: number
  ): void {
    const bob = worker.sprite ? 0 : Math.sin(time / 250 + worker.bobOffset) * 2.5;
    worker.body.y = bob;
    worker.cargoIcon.y = bob;
    worker.gaugeGfx.y = bob + worker.emoteBaseY + 36;
    worker.emoteBubble.y = worker.emoteBaseY + bob - 4;

    // Show gauges only when in combat or when HP/stamina is depleted
    const needsGauges = worker.status === 'COMBAT' || worker.hp < worker.maxHp || worker.stamina < worker.maxStamina * 0.85;
    worker.gaugeGfx.setVisible(needsGauges);

    if (needsGauges) {
      const hpFloor = Math.floor(worker.hp);
      const stFloor = Math.floor(worker.stamina);
      if (
        hpFloor !== worker._gaugeHp ||
        worker.maxHp !== worker._gaugeMaxHp ||
        stFloor !== worker._gaugeStamina ||
        worker.maxStamina !== worker._gaugeMaxStamina
      ) {
        worker._gaugeHp = hpFloor;
        worker._gaugeMaxHp = worker.maxHp;
        worker._gaugeStamina = stFloor;
        worker._gaugeMaxStamina = worker.maxStamina;
        this.renderDualGauges(worker);
      }
    }

    this.updateWorkerLantern(worker, config, ambientDarkness);

    // Emote bubble only shown during active reaction/emote timers
    if (worker.overrideEmoteTimer > 0) {
      worker.overrideEmoteTimer -= delta;
      if (worker.overrideEmote) {
        worker.emoteText.setText(worker.overrideEmote);
        worker.emoteBubble.setVisible(true);
        const alpha = Math.min(1, worker.overrideEmoteTimer / 250);
        worker.emoteBubble.setAlpha(alpha);
        worker.emoteBubble.setScale(0.85 + Math.sin(time / 140) * 0.04);
      }
      if (worker.overrideEmoteTimer <= 0) {
        worker.overrideEmote = null;
        worker.emoteBubble.setVisible(false);
      }
    } else {
      worker.emoteBubble.setVisible(false);
    }
  }

  private updateWorkerLantern(
    worker: WorkerInstance,
    config: typeof UNIT_CLASSES[UnitClass],
    ambientDarkness: number
  ): void {
    // Dirty-check: skip expensive clear+redraw when darkness hasn't changed materially
    const darknessRounded = Math.round(ambientDarkness * 50) / 50; // quantize to 0.02 steps
    if (Math.abs(darknessRounded - worker._lanternDarkness) < 0.02) return;
    worker._lanternDarkness = darknessRounded;

    worker.lanternGfx.clear();

    if (ambientDarkness > 0.08) {
      const alpha = Phaser.Math.Clamp(ambientDarkness * 0.75, 0, 0.72);
      const radius = config.lanternRadius;

      // Soft ground pool
      worker.lanternGfx.fillStyle(config.lanternColor, alpha * 0.26);
      worker.lanternGfx.fillCircle(0, 4, radius);

      // Mid aura
      worker.lanternGfx.fillStyle(config.lanternColor, alpha * 0.52);
      worker.lanternGfx.fillCircle(0, 4, radius * 0.55);

      // Bright center core
      worker.lanternGfx.fillStyle(0xffffff, alpha * 0.85);
      worker.lanternGfx.fillCircle(0, 4, 3);
    }
  }

  private getAllowedTiles(unitClass: UnitClass): number[] {
    return unitClass === 'AQUA_SLIME' ? [0, 1] : [0];
  }

  public dispatchToTaskNode(worker: WorkerInstance): void {
    if (worker.status === 'MOVING_TO_NODE') return;
    worker.gridX = Phaser.Math.Clamp(Math.round(worker.gridX ?? GRID_CENTER.x), 0, GRID_SIZE - 1);
    worker.gridY = Phaser.Math.Clamp(Math.round(worker.gridY ?? GRID_CENTER.y), 0, GRID_SIZE - 1);
    const store = useGameStore.getState();

    // 1. Dedicated Tenant AI: strictly harvest from & repair their parent establishment!
    if (worker.parentBuildingId) {
      const loot = this.getNearestGroundLoot(worker.container.x, worker.container.y, 350);
      if (loot) {
        this.followPathTo(worker, { x: loot.gridX, y: loot.gridY });
        worker.status = 'MOVING_TO_NODE';
        worker.overrideEmote = '🎒';
        worker.overrideEmoteTimer = 2000;
        return;
      }
      const site = BUILDING_SITES[worker.parentBuildingId];
      const targetNode = site ? site.workSpot : (TASK_NODE_LOCATIONS[worker.assignedTask] || this.nexusGridPos);
      this.followPathTo(worker, targetNode);
      worker.status = 'MOVING_TO_NODE';
      return;
    }

    // 2. General / Champion Defense & Scouting Patrol:
    // Generals prioritize repairing their damaged home establishment and Citadel Castle, then scout/patrol
    const isGeneral = isGatherer(worker.unitClass) && !worker.id.startsWith('tenant_') && !worker.parentBuildingId;
    if (isGeneral) {
      // Scout spoils on the ground: only Generals collect them
      const spoils = this.getNearestGroundLoot(worker.container.x, worker.container.y, 480, 'general');
      if (spoils) {
        this.followPathTo(worker, { x: spoils.gridX, y: spoils.gridY });
        worker.status = 'MOVING_TO_NODE';
        worker.overrideEmote = '🎒';
        worker.overrideEmoteTimer = 2000;
        return;
      }
      const homeBuilding = UNIT_CLASSES[worker.unitClass]?.requiredBuilding;
      if (homeBuilding) {
        const b = towerBuildingOf(store, homeBuilding);
        if (b && b.level >= 1 && buildingHpOf(b) < buildingMaxHp(towerLevelOf(b))) {
          const spot = homeBuilding === 'SPIRE' ? SPIRE_WORK_SPOT : BUILDING_SITES[homeBuilding]?.workSpot;
          if (spot) {
            this.followPathTo(worker, spot);
            worker.status = 'MOVING_TO_NODE';
            worker.overrideEmote = '🔨';
            worker.overrideEmoteTimer = 2000;
            return;
          }
        }
      }

      if (store.defense.castleHp < store.defense.castleMaxHp) {
        this.followPathTo(worker, this.nexusGridPos);
        worker.status = 'MOVING_TO_NODE';
        worker.overrideEmote = '🛡️';
        worker.overrideEmoteTimer = 2000;
        return;
      }

      let scoutTarget: GridPoint;
      const roll = Math.random();
      if (roll < 0.40 && PORTAL_SITES.length > 0) {
        // Scout near invader portals to guard against incursions
        const portal = PORTAL_SITES[Math.floor(Math.random() * PORTAL_SITES.length)];
        scoutTarget = portal.exit;
      } else if (roll < 0.70 && homeBuilding) {
        // Patrol around their parent establishment to protect it
        scoutTarget = homeBuilding === 'SPIRE' ? SPIRE_WORK_SPOT : (BUILDING_SITES[homeBuilding]?.workSpot ?? this.nexusGridPos);
      } else if (BUILDING_IDS.length > 0) {
        const buildingId = BUILDING_IDS[Math.floor(Math.random() * BUILDING_IDS.length)];
        scoutTarget = BUILDING_SITES[buildingId].workSpot;
      } else {
        // Free roam platform territory
        scoutTarget = {
          x: Phaser.Math.Between(2, GRID_SIZE - 3),
          y: Phaser.Math.Between(2, GRID_SIZE - 3),
        };
      }
      this.followPathTo(worker, scoutTarget);
      worker.status = 'MOVING_TO_NODE';
      worker.overrideEmote = '🧭';
      worker.overrideEmoteTimer = 1500;
      return;
    }

    // Standard Minions:
    const task = worker.assignedTask;
    const targetNode = (isEnrichableTask(task) && store.dynamicResourceNodes?.[task]) || TASK_NODE_LOCATIONS[task];
    this.followPathTo(worker, targetNode);
    worker.status = 'MOVING_TO_NODE';
  }

  public dispatchToNexus(worker: WorkerInstance): void {
    if (worker.status === 'RETURNING_TO_NEXUS') return;
    worker.gridX = Phaser.Math.Clamp(Math.round(worker.gridX ?? GRID_CENTER.x), 0, GRID_SIZE - 1);
    worker.gridY = Phaser.Math.Clamp(Math.round(worker.gridY ?? GRID_CENTER.y), 0, GRID_SIZE - 1);
    this.followPathTo(worker, this.nexusGridPos);
    worker.status = 'RETURNING_TO_NEXUS';
  }

  /** Plans a tile path (straight line if none is found) for handleMovement to follow. */
  private followPathTo(worker: WorkerInstance, target: GridPoint): void {
    const path = this.pathfinder.findPath(worker.gridX, worker.gridY, target.x, target.y, this.getAllowedTiles(worker.unitClass));
    worker.currentPath = path && path.length > 0
      ? path
      : [{ x: worker.gridX, y: worker.gridY }, { x: target.x, y: target.y }];
    worker.pathIndex = 0;
  }

  /** Active construction jobs: the Ent's castle/spire site and every General building its home. */
  public getConstructionStatus(): ConstructionStatus[] {
    const store = useGameStore.getState();
    const jobs: ConstructionStatus[] = [];
    const statusOf = (w: WorkerInstance | undefined, siteId: ConstructionStatus['siteId']): ConstructionStatus => ({
      siteId,
      phase: !w ? 'waiting' : w.status === 'MOVING_TO_NODE' ? 'arriving' : w.status === 'HARVESTING' ? 'building' : 'waiting',
      progress: Phaser.Math.Clamp((w?.constructionTimer ?? 0) / CONSTRUCTION_SECONDS, 0, 1),
    });
    const entSite = nextConstruction(store);
    if (entSite) jobs.push(statusOf(this.workers.find((w) => w.unitClass === 'TREANT'), entSite.id));
    for (const w of this.workers) {
      if (w.parentBuildingId || w.id.startsWith('tenant_') || w.unitClass === 'TREANT') continue;
      const site = generalHomeSite(w, store);
      if (site) jobs.push(statusOf(w, site.id));
    }
    return jobs;
  }

  public getWorkers(): WorkerInstance[] {
    return this.workers;
  }

  public handleMovement(
    worker: WorkerInstance,
    deltaSec: number,
    speed: number,
    onComplete: () => void
  ): void {
    if (worker.pathIndex >= worker.currentPath.length) {
      onComplete();
      return;
    }

    const targetGrid = worker.currentPath[worker.pathIndex];
    const targetIso = IsometricHelper.gridToScreen(targetGrid.x, targetGrid.y);

    const dx = targetIso.x - worker.container.x;
    const dy = targetIso.y - worker.container.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const step = speed * deltaSec;

    if (dist <= step) {
      worker.container.x = targetIso.x;
      worker.container.y = targetIso.y;
      worker.gridX = targetGrid.x;
      worker.gridY = targetGrid.y;
      worker.container.setDepth(IsometricHelper.getDepth(worker.gridX, worker.gridY, 6));

      worker.pathIndex++;
      if (worker.pathIndex >= worker.currentPath.length) {
        onComplete();
      }
    } else {
      worker.container.x += (dx / dist) * step;
      worker.container.y += (dy / dist) * step;

      const currentGrid = IsometricHelper.screenToGrid(worker.container.x, worker.container.y);
      worker.container.setDepth(IsometricHelper.getDepth(currentGrid.x, currentGrid.y, 6));
    }
  }

  /** The Ent's construction routine (workers/treant.ts); true while there is still building to do. */
  updateConstruction(worker: WorkerInstance, storeState: ReturnType<typeof useGameStore.getState>, deltaSec: number, effectiveSpeed: number): boolean {
    return updateConstruction(this, worker, storeState, deltaSec, effectiveSpeed);
  }

  /**
   * Former floating text above units and buildings — now narrated in the
   * activity log tray instead of being drawn on the map. The minion nearest
   * the popup's anchor names the entry.
   */
  public spawnFloatingPopup(x: number, y: number, text: string, color: string = '#38bdf8'): void {
    logFloatingText(text, color, nearestName(this.workers, x, y));
  }

  public spawnHarvestBurst(
    x: number,
    y: number,
    color: number = 0x38bdf8,
    count: number = 7
  ): void {
    for (let i = 0; i < count; i++) {
      const p = this.scene.add.graphics();
      p.fillStyle(color, 1);
      p.fillRect(-2.5, -2.5, 5, 5);
      p.setPosition(x, y);
      p.setDepth(9998);

      if (this.parentContainer) {
        this.parentContainer.add(p);
      }

      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 20 + Math.random() * 22;
      const destX = x + Math.cos(angle) * speed;
      const destY = y + Math.sin(angle) * speed;

      this.scene.tweens.add({
        targets: p,
        x: destX,
        y: destY,
        angle: Math.random() * 180,
        alpha: 0,
        scale: 0.1,
        duration: 650 + Math.random() * 250,
        ease: 'Power2.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  public destroy(): void {
    for (const worker of this.workers) {
      worker.container.destroy();
    }
    this.workers = [];
  }
}
