import Phaser from 'phaser';
import { GridPoint, UnitClass, UNIT_CLASSES, TASK_NODE_LOCATIONS, TASK_CONFIG } from '../types/game';
import { UnitRosterItem } from '../types/state';
import { IsometricHelper } from './IsometricHelper';
import { PathfindingService } from './PathfindingService';
import { useGameStore } from '../state/useGameStore';
import { isModActive } from './skills/combatMods';
import { ConstructionStatus, CONSTRUCTION_SECONDS, nextConstruction } from '../state/constructionProgress';
import { soundFx } from './audio/soundFx';
import { logFloatingText, nearestName } from '../state/activityLog';
import type { InvasionManager } from './InvasionManager';
import { createMinionSprite, faceCharacterSprite, minionSpriteHeadroom, playCharacterAttack, playCharacterWork } from './sprites/CharacterSprites';
import { Navigation } from './Navigation';
import type { PortalManager } from './PortalManager';
import { CASTLE_GATE, GRID_CENTER, GRID_SIZE } from '../state/buildingLayout';
import { isEnrichableTask, type WorkerContext, type WorkerInstance } from './workers/types';
import { renderCargoGraphics, renderWorkerGraphics } from './workers/legacyWorkerArt';
import { computeWorkerFrame } from './workers/modifiers';
import { tryResurrect, updateSupportSlime } from './workers/supportSlime';
import { updateConstruction, updateTreant } from './workers/treant';
import { rallyForInvasion, updateCombat, updateHealer } from './workers/combat';
import { abandonUnavailableTask, chooseGatherTask, isGatherer, updateGatherState, updateStatusEmote } from './workers/gathering';

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
    const startIso = IsometricHelper.gridToScreen(this.nexusGridPos.x, this.nexusGridPos.y);

    const container = this.scene.add.container(startIso.x, startIso.y);
    container.setSize(36, 36);

    // Dynamic Night Lantern Ground Light (drawn below shadow)
    const lanternGfx = this.scene.add.graphics();

    // Ground shadow
    const shadow = this.scene.add.ellipse(0, 4, 20, 10, 0x000000, 0.4);

    // Unit body graphics (dynamically tailored to unitClass AND appointed task!)
    const body = this.scene.add.graphics();
    renderWorkerGraphics(body, item.unitClass, item.assignedTask, item.equipment);

    // Floating cargo icon
    const cargoIcon = this.scene.add.graphics();
    renderCargoGraphics(cargoIcon, item.assignedTask);
    cargoIcon.setVisible(false);

    // Dual HP and Fatigue / Stamina floating gauges
    const gaugeGfx = this.scene.add.graphics();

    // Slice-of-Life Emote Bubble
    const emoteBubble = this.scene.add.container(0, -36);
    const emoteBg = this.scene.add.graphics();
    emoteBg.fillStyle(0x0f172a, 0.85);
    emoteBg.lineStyle(1, config.lanternColor, 0.8);
    emoteBg.fillRoundedRect(-14, -10, 28, 18, 6);
    emoteBg.strokeRoundedRect(-14, -10, 28, 18, 6);

    const emoteText = this.scene.add.text(0, -2, TASK_CONFIG[item.assignedTask].icon, {
      fontSize: '11px',
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#f8fafc',
    });
    emoteText.setOrigin(0.5);
    emoteBubble.add([emoteBg, emoteText]);

    container.add([lanternGfx, shadow, body, cargoIcon, gaugeGfx, emoteBubble]);
    container.setDepth(IsometricHelper.getDepth(this.nexusGridPos.x, this.nexusGridPos.y, 6));

    if (this.parentContainer) {
      this.parentContainer.add(container);
    }

    const worker: WorkerInstance = {
      id: item.id,
      name: item.name,
      unitClass: item.unitClass,
      assignedTask: item.assignedTask,
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
      gridX: this.nexusGridPos.x,
      gridY: this.nexusGridPos.y,
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

    // Support Healing Slime Heavenly Descent & Genesis Summon
    if (item.unitClass === 'AQUA_SLIME') {
      const targetY = startIso.y;
      const ritualGfx = this.scene.add.graphics();
      ritualGfx.setPosition(startIso.x, targetY + 8);
      ritualGfx.setDepth(IsometricHelper.getDepth(this.nexusGridPos.x, this.nexusGridPos.y, 5));
      ritualGfx.lineStyle(3, 0x67e8f9, 0.9);
      ritualGfx.strokeEllipse(0, 0, 82, 28);
      ritualGfx.lineStyle(2, 0x22d3ee, 0.65);
      ritualGfx.strokeEllipse(0, 0, 120, 42);
      ritualGfx.lineStyle(1, 0x38bdf8, 0.5);
      ritualGfx.strokeEllipse(0, 0, 160, 56);
      if (this.parentContainer) {
        this.parentContainer.add(ritualGfx);
      }

      container.y = targetY - 450;
      container.alpha = 0.2;
      container.setScale(0.4);
      ritualGfx.alpha = 0;
      ritualGfx.scaleX = 0.35;
      ritualGfx.scaleY = 0.35;

      this.scene.tweens.add({
        targets: container,
        y: targetY,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        duration: 1300,
        ease: 'Bounce.easeOut',
        onComplete: () => {
          soundFx.playFanfare();
          this.spawnHarvestBurst(startIso.x, targetY, 0x38bdf8, 14);
          this.spawnHarvestBurst(startIso.x, targetY, 0x22c55e, 10);
          this.spawnFloatingPopup(startIso.x, targetY - 45, '✨ Heavenly Descent! ✨', '#38bdf8');

          // If no Treant / Ent exists on the platform, Support Slime performs Genesis Summon for Sprout Ent at no cost!
          const store = useGameStore.getState();
          const hasTreant = store.roster.some((u) => u.unitClass === 'TREANT');
          if (!hasTreant) {
            this.scene.time.delayedCall(600, () => {
              this.spawnHarvestBurst(startIso.x, targetY - 12, 0x22d3ee, 20);
              this.spawnFloatingPopup(startIso.x, targetY - 55, '🌟 Slime Summoned: Sprout Ent! (Free) 🌟', '#22c55e');
              soundFx.playGolemCheer();
              store.summonUnit('TREANT', 'BUILD', true);
            });
          }
        },
      });

      this.scene.tweens.add({
        targets: ritualGfx,
        alpha: 0.9,
        scaleX: 1,
        scaleY: 1,
        duration: 700,
        yoyo: true,
        repeat: 1,
        ease: 'Sine.easeInOut',
        onComplete: () => ritualGfx.destroy(),
      });
    } else if (item.unitClass === 'TREANT') {
      const ritualGfx = this.scene.add.graphics();
      ritualGfx.setPosition(startIso.x, startIso.y + 8);
      ritualGfx.setDepth(IsometricHelper.getDepth(this.nexusGridPos.x, this.nexusGridPos.y, 5));
      ritualGfx.lineStyle(3, 0x86efac, 0.9);
      ritualGfx.strokeEllipse(0, 0, 96, 34);
      ritualGfx.lineStyle(2, 0x22c55e, 0.65);
      ritualGfx.strokeEllipse(0, 0, 144, 50);
      if (this.parentContainer) this.parentContainer.add(ritualGfx);

      container.y = startIso.y - 360;
      container.alpha = 0;
      container.setScale(0.35);
      ritualGfx.alpha = 0;
      ritualGfx.scaleX = 0.25;
      ritualGfx.scaleY = 0.25;

      this.scene.tweens.add({
        targets: container,
        y: startIso.y,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        duration: 1600,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          soundFx.playFanfare();
          this.scene.cameras.main.shake(320, 0.01);
          this.spawnHarvestBurst(startIso.x, startIso.y - 12, 0x86efac, 34);
          this.spawnHarvestBurst(startIso.x, startIso.y - 12, 0x22c55e, 24);
          this.spawnFloatingPopup(startIso.x, startIso.y - 58, '🌳 ANCIENT ENT AWAKENS! 🌳', '#86efac');
        },
      });
      this.scene.tweens.add({
        targets: ritualGfx,
        alpha: 0.95,
        scaleX: 1,
        scaleY: 1,
        duration: 900,
        yoyo: true,
        repeat: 1,
        ease: 'Sine.easeInOut',
        onComplete: () => ritualGfx.destroy(),
      });
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
    this.scene.cameras.main.shake(260, 0.008);
    this.spawnHarvestBurst(burstX, burstY, color, 36);
    this.spawnFloatingPopup(burstX, burstY - 52, `${icon} ${title} EVOLVED! Lv.${previousLevel} -> Lv.${nextLevel} ${icon}`, `#${color.toString(16).padStart(6, '0')}`);
    soundFx.playFanfare();
  }

  private renderDualGauges(worker: WorkerInstance): void {
    worker.gaugeGfx.clear();
    const barW = 24;
    const x = -barW / 2;

    // 1. HP Gauge (Top Bar at y = -28)
    worker.gaugeGfx.fillStyle(0x000000, 0.75);
    worker.gaugeGfx.fillRect(x - 1, -29, barW + 2, 4);

    const hpPct = Phaser.Math.Clamp(worker.hp / worker.maxHp, 0, 1);
    const hpColor = hpPct > 0.5 ? 0x22c55e : hpPct > 0.25 ? 0xf59e0b : 0xef4444;
    worker.gaugeGfx.fillStyle(hpColor, 1);
    worker.gaugeGfx.fillRect(x, -28, barW * hpPct, 2);

    // 2. Fatigue / Stamina Gauge (Bottom Bar at y = -25)
    worker.gaugeGfx.fillStyle(0x000000, 0.75);
    worker.gaugeGfx.fillRect(x - 1, -25, barW + 2, 4);

    const stamPct = Phaser.Math.Clamp(worker.stamina / worker.maxStamina, 0, 1);
    const stamColor = stamPct > 0.3 ? 0x38bdf8 : 0xf59e0b;
    worker.gaugeGfx.fillStyle(stamColor, 1);
    worker.gaugeGfx.fillRect(x, -24, barW * stamPct, 2);
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
   * moving, idle loop while standing) and swings tools while harvesting.
   */
  private syncMinionSprite(worker: WorkerInstance, delta: number): void {
    if (!worker.container.active) return;

    if (!worker.sprite) {
      const created = createMinionSprite(this.scene, worker.unitClass);
      if (!created) return;
      worker.container.addAt(created, worker.container.getIndex(worker.body) + 1);
      worker.sprite = created;
      worker.body.clear();
      const headroom = minionSpriteHeadroom(worker.unitClass) ?? 24;
      worker.emoteBaseY = -(headroom + 12);
      worker._prevX = worker.container.x;
      worker._prevY = worker.container.y;
    }
    const sprite = worker.sprite;

    // Follow the body's tweens (cheer squash, melee lunge)
    sprite.setPosition(worker.body.x, worker.body.y);
    sprite.setScale(worker.body.scaleX, worker.body.scaleY);

    const dx = worker.container.x - (worker._prevX ?? worker.container.x);
    const dy = worker.container.y - (worker._prevY ?? worker.container.y);
    worker._prevX = worker.container.x;
    worker._prevY = worker.container.y;
    const moving = Math.hypot(dx, dy) > 0.02;
    faceCharacterSprite(sprite, dx, dy, moving);

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
    for (const worker of this.workers) this.syncMinionSprite(worker, delta);
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
      if (isHealer && updateHealer(this, worker, frame)) continue;

      abandonUnavailableTask(worker, store);
      updateStatusEmote(worker, frame);
      if (worker.status === 'COMBAT') updateCombat(this, worker, frame);
      else updateGatherState(this, worker, frame);
    }
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
    // Sprites animate their own bounce/hover; only legacy vector bodies bob here
    const bob = worker.sprite ? 0 : Math.sin(time / 250 + worker.bobOffset) * 2.5;
    worker.body.y = bob;
    worker.cargoIcon.y = bob;
    // Gauges sit above the head: emoteBaseY is -36 for vector bodies, lower for taller sprites
    worker.gaugeGfx.y = bob + worker.emoteBaseY + 36;
    worker.emoteBubble.y = worker.emoteBaseY + bob;

    // Re-render Dual HP & Fatigue Gauges only when values actually changed
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

    this.updateWorkerLantern(worker, config, ambientDarkness);

    if (worker.overrideEmoteTimer > 0) {
      worker.overrideEmoteTimer -= delta;
      if (worker.overrideEmoteTimer <= 0) worker.overrideEmote = null;
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

    // Minions are not locked into one resource: they roam to whatever the realm needs
    if (isGatherer(worker.unitClass)) {
      const chosenTask = chooseGatherTask(store);
      if (worker.assignedTask !== chosenTask) {
        worker.assignedTask = chosenTask;
        this.redrawBody(worker);
        renderCargoGraphics(worker.cargoIcon, chosenTask);
        worker.emoteText.setText(TASK_CONFIG[chosenTask].icon);
      }
    }

    // Enrichable nodes are tracked in the store; the others are fixed work spots
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

  /** The Ent's current construction job (null once everything is built). */
  public getConstructionStatus(): ConstructionStatus | null {
    const site = nextConstruction(useGameStore.getState());
    if (!site) return null;
    const ent = this.workers.find((w) => w.unitClass === 'TREANT');
    const progress = Phaser.Math.Clamp((ent?.constructionTimer ?? 0) / CONSTRUCTION_SECONDS, 0, 1);
    const phase = !ent ? 'waiting' : ent.status === 'MOVING_TO_NODE' ? 'arriving' : ent.status === 'HARVESTING' ? 'building' : 'waiting';
    return { siteId: site.id, phase, progress };
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
