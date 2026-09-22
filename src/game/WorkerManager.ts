import Phaser from 'phaser';
import {
  GridPoint,
  WorkerStatus,
  UnitClass,
  UNIT_CLASSES,
  HarvestTask,
  TASK_NODE_LOCATIONS,
  TASK_CONFIG,
  WorkerEquipment,
  SUPPORT_SLIME_EVOLUTION,
  TREANT_EVOLUTION,
} from '../types/game';
import { UnitRosterItem } from '../types/state';
import { IsometricHelper } from './IsometricHelper';
import { PathfindingService } from './PathfindingService';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from './audio/soundFx';
import type { InvasionManager, ActiveInvader } from './InvasionManager';

export interface WorkerInstance {
  id: string;
  name: string;
  unitClass: UnitClass;
  assignedTask: HarvestTask;
  container: Phaser.GameObjects.Container;
  lanternGfx: Phaser.GameObjects.Graphics;
  shadow: Phaser.GameObjects.Ellipse;
  body: Phaser.GameObjects.Graphics;
  cargoIcon: Phaser.GameObjects.Graphics;
  gaugeGfx: Phaser.GameObjects.Graphics; // Dual HP + Stamina floating gauge
  emoteBubble: Phaser.GameObjects.Container;
  emoteBg: Phaser.GameObjects.Graphics;
  emoteText: Phaser.GameObjects.Text;
  gridX: number;
  gridY: number;
  currentPath: GridPoint[];
  pathIndex: number;
  status: WorkerStatus;
  stateTimer: number;
  cargo: number;
  maxCargo: number;
  speed: number;
  bobOffset: number;
  buffTimer: number;
  overrideEmote: string | null;
  overrideEmoteTimer: number;
  // Dual Gauges: HP & Fatigue
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  staminaDrain: number;
  restingZzzTimer: number;
  // Combat stats
  attackPower: number;
  combatCooldown: number;
  supportCooldown: number;
  resurrectionCooldown: number;
  supportEvolutionLevel: number;
  armorShield: number;
  armorShieldTimer: number;
  equipment?: WorkerEquipment;
  timeSinceLastTap: number;
  treantEvolutionLevel?: number;
  treantActionTimer?: number;
  treantMode?: 'REPAIR' | 'REPLENISH';
  treantTargetTile?: GridPoint;
  autoSummonTimer?: number;
  // Dirty-check caches — skip redraw when values haven't changed
  _gaugeHp: number;
  _gaugeMaxHp: number;
  _gaugeStamina: number;
  _gaugeMaxStamina: number;
  _lanternDarkness: number;
}

export class WorkerManager {
  private scene: Phaser.Scene;
  private pathfinder: PathfindingService;
  private workers: WorkerInstance[] = [];
  private parentContainer?: Phaser.GameObjects.Container;
  private nexusGridPos: GridPoint = { x: 5, y: 5 };
  private invasionManager?: InvasionManager;

  constructor(
    scene: Phaser.Scene,
    pathfinder: PathfindingService,
    nexusGridPos: GridPoint = { x: 5, y: 5 },
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
          this.renderWorkerGraphics(existing.body, existing.unitClass, existing.assignedTask, existing.equipment);
          this.renderCargoGraphics(existing.cargoIcon, existing.assignedTask);
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
    this.renderWorkerGraphics(body, item.unitClass, item.assignedTask, item.equipment);

    // Floating cargo icon
    const cargoIcon = this.scene.add.graphics();
    this.renderCargoGraphics(cargoIcon, item.assignedTask);
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

  private renderWorkerGraphics(
    graphics: Phaser.GameObjects.Graphics,
    unitClass: UnitClass,
    task: HarvestTask,
    equipment?: WorkerEquipment
  ): void {
    graphics.clear();

    // 1. BASE DEMON & BEAST CHASSIS
    if (unitClass === 'GOLEM') {
      // Batong Demonyo (Hellrock Brute): Obsidian body, curved horns, glowing red volcanic core
      graphics.fillStyle(0x18181b, 1);
      graphics.fillCircle(0, -12, 10);
      // Demonic curved obsidian horns
      graphics.fillStyle(0xd97706, 1); // Amber horn tips
      graphics.fillTriangle(-7, -18, -12, -26, -3, -18);
      graphics.fillTriangle(7, -18, 12, -26, 3, -18);
      // Glowing fiery demonic eyes
      graphics.fillStyle(0xef4444, 1);
      graphics.fillCircle(-3, -12, 2.5);
      graphics.fillCircle(3, -12, 2.5);
      graphics.fillStyle(0xfef08a, 1);
      graphics.fillCircle(-3, -12, 1);
      graphics.fillCircle(3, -12, 1);
      // Spiked demonic shoulders
      graphics.fillStyle(0x451a03, 1);
      graphics.fillRect(-12, -14, 3, 6);
      graphics.fillRect(9, -14, 3, 6);
    } else if (unitClass === 'WAYFARER') {
      // Mabangis na Hellhound: Quadruped wolf snout, fiery red/orange coat, pointed ears
      graphics.fillStyle(0x431407, 1);
      graphics.fillTriangle(0, -20, -8, -2, 8, -2);
      // Fiery orange mane
      graphics.fillStyle(0xf97316, 1);
      graphics.fillCircle(0, -14, 6.5);
      // Wolf snout
      graphics.fillStyle(0x7c2d12, 1);
      graphics.fillRect(-2.5, -12, 5, 4);
      // Sharp pointed beast ears
      graphics.fillStyle(0xe11d48, 1);
      graphics.fillTriangle(-6, -18, -8, -25, -2, -18);
      graphics.fillTriangle(6, -18, 8, -25, 2, -18);
      // Burning amber eyes
      graphics.fillStyle(0xfacc15, 1);
      graphics.fillCircle(-2.5, -15, 1.5);
      graphics.fillCircle(2.5, -15, 1.5);
    } else if (unitClass === 'CHRONO') {
      // CHRONO: Lumilipad na Arch-Demon with leathery bat wings & purple arcane aura
      // Flying leathery bat wings
      graphics.fillStyle(0x581c87, 0.9);
      graphics.fillTriangle(-14, -20, -5, -12, -8, -4);
      graphics.fillTriangle(14, -20, 5, -12, 8, -4);
      // Arch-demon torso & head
      graphics.fillStyle(0x3b0764, 1);
      graphics.fillCircle(0, -13, 8);
      // Mystic demon horns
      graphics.fillStyle(0xa855f7, 1);
      graphics.fillTriangle(-5, -19, -8, -27, -2, -19);
      graphics.fillTriangle(5, -19, 8, -27, 2, -19);
      // Glowing purple demonic visage
      graphics.fillStyle(0xc084fc, 1);
      graphics.fillCircle(-2.5, -13, 2);
      graphics.fillCircle(2.5, -13, 2);
      graphics.fillCircle(-2.5, -13, 1);
      graphics.fillCircle(2.5, -13, 1);
    } else if (unitClass === 'AQUA_SLIME') {
      // AQUA_SLIME: Soft round blue slime, squishy and amphibious
      graphics.fillStyle(0x0ea5e9, 0.9);
      graphics.fillEllipse(0, -8, 12, 10);
      graphics.fillStyle(0x38bdf8, 1);
      graphics.fillEllipse(0, -9, 10, 8);
      // Large cute black eyes
      graphics.fillStyle(0x0f172a, 1);
      graphics.fillCircle(-4, -9, 1.5);
      graphics.fillCircle(4, -9, 1.5);
      // Cheek blushes
      graphics.fillStyle(0x3b82f6, 0.6);
      graphics.fillCircle(-6, -7, 2);
      graphics.fillCircle(6, -7, 2);
    } else if (unitClass === 'TREANT') {
      // TREANT: Ancient Walking Bark Ent with green leafy crown and glowing emerald nature eyes
      graphics.fillStyle(0x451a03, 1); // Dark rich bark body
      graphics.fillRect(-8, -20, 16, 18);
      graphics.fillCircle(0, -20, 9);
      // Root legs
      graphics.fillStyle(0x3b1d07, 1);
      graphics.fillRect(-9, -2, 5, 6);
      graphics.fillRect(4, -2, 5, 6);
      // Leafy crown canopy
      graphics.fillStyle(0x15803d, 1);
      graphics.fillCircle(0, -28, 8);
      graphics.fillCircle(-7, -25, 6);
      graphics.fillCircle(7, -25, 6);
      graphics.fillStyle(0x22c55e, 0.85);
      graphics.fillCircle(0, -30, 5);
      // Ancient glowing emerald nature eyes
      graphics.fillStyle(0x86efac, 1);
      graphics.fillCircle(-3.5, -19, 2);
      graphics.fillCircle(3.5, -19, 2);
      graphics.fillStyle(0xffffff, 0.9);
      graphics.fillCircle(-3.5, -19, 1);
      graphics.fillCircle(3.5, -19, 1);
      // Wooden branch arm
      graphics.fillStyle(0x78350f, 1);
      graphics.fillRect(8, -18, 3, 12);
    } else if (unitClass === 'MERMAN') {
      graphics.fillStyle(0x075985, 1);
      graphics.fillEllipse(0, -11, 16, 20);
      graphics.fillStyle(0x22d3ee, 1);
      graphics.fillCircle(0, -21, 7);
      graphics.fillStyle(0x0f172a, 1);
      graphics.fillCircle(-2.5, -22, 1.5);
      graphics.fillCircle(2.5, -22, 1.5);
      graphics.fillStyle(0x38bdf8, 1);
      graphics.fillTriangle(-8, -5, -14, 2, -2, -1);
      graphics.fillTriangle(8, -5, 14, 2, 2, -1);
    } else if (unitClass === 'NECROMANCER') {
      graphics.fillStyle(0x312e81, 1);
      graphics.fillTriangle(0, -27, -11, 2, 11, 2);
      graphics.fillStyle(0xe2e8f0, 1);
      graphics.fillCircle(0, -19, 6);
      graphics.fillStyle(0x7c3aed, 1);
      graphics.fillCircle(-2, -19, 1.5);
      graphics.fillCircle(2, -19, 1.5);
      graphics.lineStyle(2, 0xa78bfa, 1);
      graphics.lineBetween(10, -25, 10, 2);
      graphics.fillStyle(0xc084fc, 1);
      graphics.fillCircle(10, -27, 3);
    }

    // 2. DYNAMIC APPOINTED TASK ATTIRE & TOOLS
    if (task === 'BUILD') {
      // Ancient Builder Spanner & Nature Growth Staff
      graphics.fillStyle(0x78350f, 1);
      graphics.fillRect(9, -24, 2.5, 20); // wooden staff
      graphics.fillStyle(0x22c55e, 1);
      graphics.fillCircle(10, -24, 4); // glowing nature orb on staff
      graphics.fillStyle(0xffffff, 0.9);
      graphics.fillCircle(10, -24, 1.5);
      // Builder hammer in other hand
      graphics.fillStyle(0x64748b, 1);
      graphics.fillRect(-12, -18, 4, 6);
    } else if (task === 'AETHER') {
      // Mining hardhat with glowing cyan crystal lamp
      graphics.fillStyle(0x0284c7, 1);
      graphics.fillRect(-6, -21, 12, 3);
      graphics.fillStyle(0x38bdf8, 1);
      graphics.fillCircle(0, -21, 2.5);
      graphics.fillStyle(0xffffff, 0.9);
      graphics.fillCircle(0, -21, 1);

      // Crystalline Mining Pickaxe held in right hand
      graphics.fillStyle(0x78350f, 1);
      graphics.fillRect(9, -18, 2, 14); // wooden haft
      graphics.fillStyle(0x38bdf8, 1);
      graphics.fillTriangle(6, -20, 14, -20, 10, -15); // crystal pick
      graphics.fillStyle(0xffffff, 0.8);
      graphics.fillCircle(6, -20, 1.5);
    } else if (task === 'WOOD') {
      // Forest Lumberjack Broadaxe
      graphics.fillStyle(0x522e11, 1);
      graphics.fillRect(9, -18, 2.5, 14); // wood handle
      graphics.fillStyle(0x10b981, 1);
      graphics.fillRect(5, -21, 8, 6); // axe blade
      graphics.fillStyle(0xe2e8f0, 0.95);
      graphics.fillRect(11, -21, 2, 6); // razor edge

      // Lumberjack harness
      graphics.lineStyle(1.5, 0x10b981, 0.8);
      graphics.lineBetween(-7, -14, 7, -6);
    } else if (task === 'STONE') {
      // Heavy Quarry Sledgehammer
      graphics.fillStyle(0x334155, 1);
      graphics.fillRect(9, -20, 3, 16); // reinforced handle
      graphics.fillStyle(0x64748b, 1);
      graphics.fillRect(5, -23, 10, 7); // heavy stone head
      graphics.lineStyle(1, 0xf59e0b, 0.9);
      graphics.strokeRect(5, -23, 10, 7);

      // Basalt shoulder pauldron
      graphics.fillStyle(0x1e293b, 1);
      graphics.fillRect(-12, -16, 4, 6);
    } else if (task === 'ESSENCE') {
      // Void Aether Broadsword
      graphics.fillStyle(0xc084fc, 1);
      graphics.fillRect(9, -26, 2.5, 18); // glowing blade
      graphics.fillStyle(0xa855f7, 1);
      graphics.fillRect(6, -12, 8, 2.5); // crossguard
      graphics.fillStyle(0xffffff, 0.95);
      graphics.fillCircle(10, -26, 2); // razor tip

      // Glowing battle crest visor
      graphics.fillStyle(0xa855f7, 0.9);
      graphics.fillRect(-4, -13, 8, 2.5);
    } else if (task === 'FISH') {
      // Fishing rod
      graphics.lineStyle(2, 0x78350f, 1);
      graphics.lineBetween(8, -12, 16, -26);
      graphics.lineStyle(1, 0xffffff, 0.5);
      graphics.lineBetween(16, -26, 16, -10); // fishing line
    } else if (task === 'WATER') {
      // Water Bucket
      graphics.fillStyle(0x737373, 1);
      graphics.fillRect(6, -15, 6, 6);
      graphics.lineStyle(1, 0x171717, 1);
      graphics.strokeRect(6, -15, 6, 6);
      // water inside
      graphics.fillStyle(0x3b82f6, 0.9);
      graphics.fillRect(7, -14, 4, 2);
    } else if (task === 'HEAL' || unitClass === 'AQUA_SLIME') {
      // Golden / emerald glowing healing halo
      graphics.lineStyle(1.5, 0x22c55e, 0.9);
      graphics.strokeEllipse(0, -22, 9, 3);
      graphics.fillStyle(0x86efac, 0.8);
      graphics.fillCircle(0, -22, 1.5);
    }

    // 3. EQUIPPED GEAR OVERLAYS
    if (equipment?.armor) {
      graphics.lineStyle(1.5, 0x38bdf8, 0.85);
      graphics.strokeCircle(0, -12, 10.5);
    }
  }

  private renderCargoGraphics(graphics: Phaser.GameObjects.Graphics, task: HarvestTask): void {
    graphics.clear();
    const taskCfg = TASK_CONFIG[task];
    graphics.fillStyle(taskCfg.color, 1);

    if (task === 'AETHER') {
      graphics.fillTriangle(0, -28, -5, -18, 5, -18);
    } else if (task === 'WOOD') {
      graphics.fillRect(-5, -24, 10, 6);
    } else if (task === 'STONE') {
      graphics.fillCircle(0, -22, 5);
    } else if (task === 'ESSENCE') {
      graphics.fillCircle(0, -22, 5.5);
    } else if (task === 'FISH') {
      // Fish shape
      graphics.fillEllipse(0, -22, 6, 4);
      graphics.fillTriangle(-6, -22, -10, -26, -10, -18);
    } else if (task === 'WATER') {
      // Water drop shape
      graphics.fillCircle(0, -22, 4);
      graphics.fillTriangle(-3.5, -23, 3.5, -23, 0, -28);
    }
  }

  public boostLowestWorker(): void {
    // Tapping is strictly disabled for healing minions or regenerating fatigue
    return;
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
    const deltaSec = delta / 1000;
    const storeState = useGameStore.getState();
    const upgradeCapacity = storeState.upgrades.golemCapacityLevel - 1;
    const upgradeSpeedMult = 1 + (storeState.upgrades.golemSpeedLevel - 1) * 0.2;

    for (const worker of [...this.workers]) {
      if (worker.hp <= 0) {
        const supportSlime = this.workers
          .filter((ally) => ally.unitClass === 'AQUA_SLIME')
          .sort((first, second) => first.resurrectionCooldown - second.resurrectionCooldown)
          .find((ally) => ally.resurrectionCooldown <= 0);
        if (supportSlime && worker.unitClass !== 'AQUA_SLIME') {
          const slimeLevel = Phaser.Math.Clamp(supportSlime.supportEvolutionLevel, 1, 5) as 1 | 2 | 3 | 4 | 5;
          const slimeProfile = SUPPORT_SLIME_EVOLUTION[slimeLevel];
          const resurrectionCooldown = slimeProfile.resurrectionCooldownSeconds;
          const cost = slimeProfile.resurrectionCost;
          const state = useGameStore.getState();

          if (
            supportSlime.resurrectionCooldown <= 0 &&
            state.resources.aetherShards >= cost.aetherShards &&
            state.resources.arcaneEssence >= cost.arcaneEssence &&
            state.resources.wood >= cost.wood &&
            state.resources.stone >= cost.stone
          ) {
            state.spendResources({
              aetherShards: cost.aetherShards,
              arcaneEssence: cost.arcaneEssence,
              wood: cost.wood,
              stone: cost.stone,
            });
            worker.hp = Math.max(1, Math.round(worker.maxHp * (0.35 + slimeLevel * 0.13)));
            worker.stamina = Math.max(1, Math.round(worker.maxStamina * (0.40 + slimeLevel * 0.12)));
            worker.status = 'IDLE';
            worker.stateTimer = 500;
            worker.overrideEmote = '✨';
            worker.overrideEmoteTimer = 2500;
            supportSlime.resurrectionCooldown = resurrectionCooldown;
            this.spawnFloatingPopup(
              worker.container.x,
              worker.container.y - 35,
              `✨ Resurrected! (${Math.ceil(resurrectionCooldown)}s cd)`,
              '#22c55e'
            );
            soundFx.playFanfare();
            continue;
          }
        }

        // Servant Permadeath
        const deadX = worker.container.x;
        const deadY = worker.container.y;
        
        this.spawnFloatingPopup(deadX, deadY - 30, '💀 KIA', '#ef4444');

        worker.container.destroy();
        this.workers = this.workers.filter(w => w.id !== worker.id);
        useGameStore.getState().removeUnit(worker.id, true);
        
        continue;
      }

      worker.timeSinceLastTap += delta;

      const config = UNIT_CLASSES[worker.unitClass];
      const taskCfg = TASK_CONFIG[worker.assignedTask];

      // Class-specific cargo bonuses
      let classCapacityBonus = 0;
      if (worker.unitClass === 'CHRONO') classCapacityBonus = 1;
      if (worker.unitClass === 'GOLEM' && (worker.assignedTask === 'STONE' || worker.assignedTask === 'AETHER')) {
        classCapacityBonus = 1;
      }

      // Equipment bonuses
      const equipBonusSpeed =
        (worker.equipment?.tool?.stats.bonusSpeed || 0) +
        (worker.equipment?.armor?.stats.bonusSpeed || 0) +
        (worker.equipment?.relic?.stats.bonusSpeed || 0);
      const equipBonusCargo =
        (worker.equipment?.tool?.stats.bonusCargo || 0) +
        (worker.equipment?.relic?.stats.bonusCargo || 0);
      const equipBonusAttack =
        (worker.equipment?.tool?.stats.bonusAttack || 0) +
        (worker.equipment?.armor?.stats.bonusAttack || 0) +
        (worker.equipment?.relic?.stats.bonusAttack || 0);

      // ── Re-use the top-of-frame store snapshot (no per-worker getState()) ──
      // God Tier Blessings
      const activeBlessings = storeState.activeGodBlessings || { CELESTIAL_HARVEST: 0, AEGIS_WRATH: 0, TITAN_AWAKENING: 0 };
      const isHarvestBlessingActive = (activeBlessings.CELESTIAL_HARVEST || 0) > 0;
      const isTitanBlessingActive = (activeBlessings.TITAN_AWAKENING || 0) > 0;

      // Celestial Abundance: +50% worker speed on gatherers
      const blessingSpeedBonus = isHarvestBlessingActive ? 1.5 : 1.0;

      // Titan Awakening: +150% combat attack power (2.5x)
      const titanAttackBonus = isTitanBlessingActive ? 2.5 : 1.0;
      const effectiveAttack = Math.round(((worker.attackPower || 22) + equipBonusAttack) * titanAttackBonus);

      // Titan Awakening: Radiant Armor Shield to all non-slime minions
      if (isTitanBlessingActive && worker.unitClass !== 'AQUA_SLIME') {
        worker.armorShield = Math.max(worker.armorShield, 60);
        worker.armorShieldTimer = Math.max(worker.armorShieldTimer, 2.0);
      }

      if (worker.armorShieldTimer > 0) {
        worker.armorShieldTimer -= deltaSec;
        if (worker.armorShieldTimer <= 0) {
          worker.armorShield = 0;
        }
      }

      // Titan Awakening eliminates stamina drain completely (0 drain)
      const drainReduction = isTitanBlessingActive
        ? 100
        : Phaser.Math.Clamp(
            (worker.equipment?.armor?.stats.staminaDrainReduction || 0) +
              (worker.equipment?.relic?.stats.staminaDrainReduction || 0),
            0,
            70
          );

      worker.maxCargo = config.cargoCapacity + upgradeCapacity + classCapacityBonus + equipBonusCargo;

      // Speed multipliers
      let motivationMult = 1;
      if (worker.buffTimer > 0) {
        worker.buffTimer -= delta;
        motivationMult = 1.25;
      }

      // Wayfarer speed bonus on woodcutting
      let taskSpecialtySpeed = 1;
      if (worker.unitClass === 'WAYFARER' && worker.assignedTask === 'WOOD') {
        taskSpecialtySpeed = 1.2;
      }

      // Weather modifiers for servants — use pre-read storeState.weather (no extra getState())
      const currentWeather = storeState.weather;
      let weatherSpeedMult = 1;
      let weatherDrainMult = 1;
      if (currentWeather === 'RAIN') {
        weatherSpeedMult = 0.85; // Muddy terrain: 15% slower
      } else if (currentWeather === 'SNOW') {
        weatherDrainMult = 1.25; // Freezing: 25% faster stamina drain
      } else if (currentWeather === 'HEATWAVE') {
        weatherSpeedMult = 0.90; // Exhausting: 10% slower
        weatherDrainMult = 1.15; // Heat: 15% faster stamina drain
      }

      let slimeMovementBonus = 1;
      if (worker.unitClass === 'AQUA_SLIME') {
        const slimeProfile = SUPPORT_SLIME_EVOLUTION[Math.min(5, Math.max(1, worker.supportEvolutionLevel)) as 1 | 2 | 3 | 4 | 5];
        slimeMovementBonus = 1 + slimeProfile.speedBonusPercent / 100;
      }

      // Citadel Majesty: +10% to +35% speed when Castle is in peak condition (>= 90% HP)
      const castleHpRatio = storeState.defense.castleMaxHp > 0 ? storeState.defense.castleHp / storeState.defense.castleMaxHp : 1;
      const treantMinion = this.workers.find((w) => w.unitClass === 'TREANT');
      const treantActiveLvl = ((treantMinion?.treantEvolutionLevel ?? 1) as 1 | 2 | 3 | 4 | 5);
      const treantCfg = TREANT_EVOLUTION[treantActiveLvl];
      const citadelMajestySpeedBonus = (castleHpRatio >= 0.90) ? (1 + (treantCfg?.castleMajestyBonus || 15) / 100) : 1.0;

      const effectiveSpeed =
        (worker.speed + equipBonusSpeed) * upgradeSpeedMult * motivationMult * taskSpecialtySpeed * weatherSpeedMult * slimeMovementBonus * blessingSpeedBonus * citadelMajestySpeedBonus;

      // Gentle floating bobbing effect
      const bob = Math.sin(time / 250 + worker.bobOffset) * 2.5;
      worker.body.y = bob;
      worker.cargoIcon.y = bob;
      worker.gaugeGfx.y = bob;
      worker.emoteBubble.y = -36 + bob;

      // Re-render Dual HP & Fatigue Gauges — only when values actually changed
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

      // Dynamic Lantern Lighting
      this.updateWorkerLantern(worker, config, ambientDarkness);

      // Handle override emote timers
      if (worker.overrideEmoteTimer > 0) {
        worker.overrideEmoteTimer -= delta;
        if (worker.overrideEmoteTimer <= 0) {
          worker.overrideEmote = null;
        }
      }

      if (worker.unitClass === 'AQUA_SLIME') {
        worker.resurrectionCooldown = Math.max(0, worker.resurrectionCooldown - deltaSec);
      }

      // Invasion Combat Mobilization: Golems join the fight during active incursions!
      const isInvasionActive = storeState.invasion.isActive;
      const aliveInvaders = this.invasionManager
        ? this.invasionManager.getInvaders().filter((i) => !i.isDead && !i.isRetreating)
        : [];

      const isSupportSlime = worker.unitClass === 'AQUA_SLIME';
      const isTreant = worker.unitClass === 'TREANT';
      const isHealer = isSupportSlime || worker.unitClass === 'NECROMANCER' || worker.assignedTask === 'HEAL';
      const isNonCombatant = isSupportSlime || isTreant;

      if (isSupportSlime) {
        worker.status = 'HEALING';
        worker.overrideEmote = '💨';
        worker.overrideEmoteTimer = 800;
        worker.cargoIcon.setVisible(false);
      }

      if (isInvasionActive && aliveInvaders.length > 0) {
        // Use a non-narrowed alias so TS doesn't flag impossible checks
        const workerStatus: string = worker.status;
        if (worker.hp < 35 && !isHealer && !isNonCombatant) {
          if (workerStatus !== 'IDLE') {
            // Critically wounded: stay idle and wait for healing
            worker.overrideEmote = '🩹';
            worker.overrideEmoteTimer = 2500;
            this.spawnFloatingPopup(
              worker.container.x,
              worker.container.y - 35,
              'Critically Wounded! 🛡️',
              '#f59e0b'
            );
            worker.status = 'IDLE';
            worker.stateTimer = 1000;
          }
        } else if (!isHealer && !isNonCombatant && workerStatus !== 'COMBAT') {
          // Golem and unit rally to defend the realm!
          worker.status = 'COMBAT';
          worker.overrideEmote = '⚔️';
          worker.overrideEmoteTimer = 2000;
          worker.cargoIcon.setVisible(false);
          this.spawnFloatingPopup(
            worker.container.x,
            worker.container.y - 35,
            'Defending Realm! ⚔️',
            '#38bdf8'
          );
          soundFx.playGolemCheer();
        }
      }

      // --- SUPPORT HEALING SLIME DEDICATED AI ---
      if (isSupportSlime) {
        worker.hp = worker.maxHp; // Absolute invulnerability: immune to damage, cannot be killed
        worker.cargo = 0;
        worker.cargoIcon.setVisible(false);

        // Find candidate unit among gatherers & fighters (all non-slime allies)
        const allies = this.workers.filter((ally) => ally.id !== worker.id && ally.unitClass !== 'AQUA_SLIME' && ally.hp > 0);

        let bestTarget: WorkerInstance | null = null;
        let highestUrgencyScore = -1;

        for (const ally of allies) {
          const hpRatio = ally.hp / ally.maxHp;
          const staminaRatio = ally.stamina / ally.maxStamina;
          const fatigueRatio = 1 - staminaRatio; // 0 (full stamina) to 1 (exhausted)
          const hpDeficit = 1 - hpRatio; // 0 (full hp) to 1 (dead)

          // Urgency score: prioritize critically wounded, then exhausted/fatigued gatherers & fighters
          const urgencyScore = (hpDeficit * 2.0) + (fatigueRatio * 1.5);

          if (urgencyScore > highestUrgencyScore) {
            highestUrgencyScore = urgencyScore;
            bestTarget = ally;
          }
        }

        // Fallback target: nearest ally if all are 100% full
        if (!bestTarget && allies.length > 0) {
          bestTarget = allies.reduce((closest, current) => {
            const distCurrent = Math.hypot(current.container.x - worker.container.x, current.container.y - worker.container.y);
            const distClosest = Math.hypot(closest.container.x - worker.container.x, closest.container.y - worker.container.y);
            return distCurrent < distClosest ? current : closest;
          }, allies[0]);
        }

        if (bestTarget) {
          const dist = Math.hypot(bestTarget.container.x - worker.container.x, bestTarget.container.y - worker.container.y);
          const followRadius = 55;

          if (dist > followRadius) {
            // Move smoothly towards lowest HP / highest fatigue ally
            worker.status = 'MOVING_TO_NODE';
            const dx = bestTarget.container.x - worker.container.x;
            const dy = bestTarget.container.y - worker.container.y;
            const step = effectiveSpeed * 1.35 * deltaSec;
            worker.container.x += (dx / dist) * step;
            worker.container.y += (dy / dist) * step;

            const curGrid = IsometricHelper.screenToGrid(worker.container.x, worker.container.y);
            worker.gridX = Phaser.Math.Clamp(Math.round(curGrid.x), 0, 9);
            worker.gridY = Phaser.Math.Clamp(Math.round(curGrid.y), 0, 9);
            worker.container.setDepth(IsometricHelper.getDepth(worker.gridX, worker.gridY, 6));

            worker.overrideEmote = '💚';
            worker.overrideEmoteTimer = 400;
          } else {
            // In range: hover alongside ally and pulse support healing & stamina restoration
            worker.status = 'HEALING';
            worker.overrideEmote = '✨';
            worker.overrideEmoteTimer = 800;

            worker.supportCooldown -= deltaSec;
            if (worker.supportCooldown <= 0) {
              worker.supportCooldown = 1.0;
              const slimeLevel = Phaser.Math.Clamp(worker.supportEvolutionLevel, 1, 5) as 1 | 2 | 3 | 4 | 5;
              const slimeProfile = SUPPORT_SLIME_EVOLUTION[slimeLevel];

              const targetCount = Math.min(slimeProfile.healTargets, allies.length);
              const sortedTargets = [...allies].sort((a, b) => {
                const scoreA = (1 - a.hp / a.maxHp) * 2 + (1 - a.stamina / a.maxStamina);
                const scoreB = (1 - b.hp / b.maxHp) * 2 + (1 - b.stamina / b.maxStamina);
                return scoreB - scoreA;
              }).slice(0, targetCount);

              for (const ally of sortedTargets) {
                const d = Math.hypot(ally.container.x - worker.container.x, ally.container.y - worker.container.y);
                if (d > 120) continue;

                // Heal HP
                const healAmount = Math.max(2, ally.maxHp * (slimeProfile.healPercent / 100));
                const nextHp = Math.min(ally.maxHp, ally.hp + healAmount);
                const restoredHp = nextHp - ally.hp;
                if (restoredHp > 0) {
                  ally.hp = nextHp;
                  this.spawnFloatingPopup(ally.container.x, ally.container.y - 35, `+${Math.round(restoredHp)} HP`, '#22c55e');
                }

                // Restore Fatigue / Stamina
                const restoredFatigue = Math.max(2, ally.maxStamina * (slimeProfile.fatigueRestorePercent / 100));
                const nextStamina = Math.min(ally.maxStamina, ally.stamina + restoredFatigue);
                const actualRestoredStamina = nextStamina - ally.stamina;
                if (actualRestoredStamina > 0) {
                  ally.stamina = nextStamina;
                  this.spawnFloatingPopup(ally.container.x, ally.container.y - 50, `+${Math.round(actualRestoredStamina)} Fatigue`, '#38bdf8');
                }

                if (slimeProfile.level >= 4 && ally.hp < ally.maxHp) {
                  const armorValue = ally.maxHp * (slimeProfile.armorPercent / 100);
                  if (armorValue > 0) {
                    ally.armorShield = Math.max(ally.armorShield, armorValue);
                    ally.armorShieldTimer = slimeProfile.armorDurationSeconds;
                  }
                }
              }

              this.spawnHarvestBurst(worker.container.x, worker.container.y - 15, 0x22c55e, 5);
              soundFx.playHarvest('crystal');
            }
          }
        } else {
          worker.status = 'IDLE';
          worker.stateTimer = 500;
        }

        // --- SUPPORT SLIME AUTO-SUMMONING WHEN RESOURCES ARE SUFFICIENT ---
        if (worker.autoSummonTimer === undefined) {
          worker.autoSummonTimer = 3.0;
        }
        worker.autoSummonTimer -= deltaSec;
        if (worker.autoSummonTimer <= 0) {
          worker.autoSummonTimer = 4.0 + Math.random() * 2.0;

          // Priority order of minions to summon: Builder Treant first, then diverse combatants & gatherers
          const summonOrder: UnitClass[] = ['TREANT', 'GOLEM', 'WAYFARER', 'CHRONO', 'MERMAN', 'NECROMANCER'];
          const currentStore = useGameStore.getState();

          // Check Auto-Evolve for Support Slime & Treant
          if (currentStore.autoSettings?.autoEvolve) {
            currentStore.upgradeSupportSlime();
            currentStore.upgradeTreant();
          }

          for (const candClass of summonOrder) {
            const curCount = currentStore.roster.filter((u) => u.unitClass === candClass).length;
            const maxCap = candClass === 'TREANT' ? 1 : 2;
            if (curCount < maxCap) {
              const isFree = candClass === 'TREANT';
              const success = currentStore.summonUnit(candClass, undefined, isFree);
              if (success) {
                this.spawnHarvestBurst(worker.container.x, worker.container.y - 20, 0x38bdf8, 12);
                this.spawnHarvestBurst(worker.container.x, worker.container.y - 20, 0xfbbf24, 8);
                const className = UNIT_CLASSES[candClass].name;
                this.spawnFloatingPopup(
                  worker.container.x,
                  worker.container.y - 45,
                  isFree ? `🌱 Slime Summoned: Sprout Ent! (Free) 🌱` : `✨ Slime Summoned: ${className}! ✨`,
                  isFree ? '#22c55e' : '#38bdf8'
                );
                soundFx.playGolemCheer();
                break; // Summon 1 unit per cycle
              }
            }
          }
        }

        continue; // Never run standard gathering FSM for Support Healing Slime!
      }

      // --- TREANT / ENT BUILDER DEDICATED AI ---
      if (isTreant) {
        worker.hp = worker.maxHp; // Builder cannot take damage or be killed
        worker.cargo = 0;
        worker.cargoIcon.setVisible(false);

        const treantLvl = (Math.min(5, Math.max(1, worker.treantEvolutionLevel ?? 1))) as 1 | 2 | 3 | 4 | 5;
        const treantProfile = TREANT_EVOLUTION[treantLvl];

        if (worker.treantActionTimer === undefined) {
          worker.treantActionTimer = 5.0; // Initial check countdown
          worker.treantMode = 'REPAIR';
        }

        worker.treantActionTimer -= deltaSec;

        const defenseState = storeState.defense;
        const isCastleCrushed = defenseState.castleHp <= 0;
        const castleNeedsRepair = defenseState.castleHp < defenseState.castleMaxHp;
        const castleNeedsFortification = defenseState.shieldHp < defenseState.shieldMaxHp;
        const invasionNeedsEnt = storeState.invasion.isActive && (castleNeedsRepair || castleNeedsFortification);

        // During an invasion, the Ent's only job is to keep the castle standing:
        // repair the hull first, then restore its protective shield.
        if (invasionNeedsEnt) {
          worker.treantMode = 'REPAIR';
          worker.treantTargetTile = { x: 5, y: 5 };
          worker.treantActionTimer = Math.min(worker.treantActionTimer, 0.25);
          worker.supportCooldown = Math.min(worker.supportCooldown, 0.25);
        }

        // Determine mode if timer expired or castle is completely crushed
        if (invasionNeedsEnt) {
          // Priority mode above intentionally stays in control during the wave.
        } else if (isCastleCrushed && worker.treantMode !== 'REPAIR') {
          worker.treantMode = 'REPAIR';
          worker.treantActionTimer = 4.0;
          worker.treantTargetTile = { x: 5, y: 5 };
        } else if (worker.treantActionTimer <= 0) {
          if (castleNeedsRepair || castleNeedsFortification) {
            worker.treantMode = 'REPAIR';
            worker.treantActionTimer = isCastleCrushed ? 4.0 : 8.0;
            worker.treantTargetTile = { x: 5, y: 5 };
          } else {
            // Intelligently select resource node with lowest stockpile to replenish & enrich
            worker.treantMode = 'REPLENISH';
            worker.treantActionTimer = treantProfile.replenishCooldownSeconds + Math.random() * 4.0;

            const resStockMap: Record<'AETHER' | 'STONE' | 'WOOD' | 'ESSENCE', number> = {
              AETHER: storeState.resources.aetherShards,
              STONE: storeState.resources.stone,
              WOOD: storeState.resources.wood,
              ESSENCE: storeState.resources.arcaneEssence,
            };

            const candidates: Array<'AETHER' | 'STONE' | 'WOOD' | 'ESSENCE'> = ['AETHER', 'STONE', 'WOOD', 'ESSENCE'];
            // 75% choose lowest resource, 25% random
            let targetType: 'AETHER' | 'STONE' | 'WOOD' | 'ESSENCE' = candidates[0];
            if (Math.random() < 0.75) {
              let lowestAmt = resStockMap[candidates[0]];
              for (const c of candidates) {
                if (resStockMap[c] < lowestAmt) {
                  lowestAmt = resStockMap[c];
                  targetType = c;
                }
              }
            } else {
              targetType = candidates[Math.floor(Math.random() * candidates.length)];
            }

            // Fixed location for resource landmark nodes (no random movement across map!)
            const fixedNodePos = TASK_NODE_LOCATIONS[targetType];
            worker.treantTargetTile = { x: fixedNodePos.x, y: fixedNodePos.y };

            // Dispatch store replenish with Treant's level enrichment multiplier!
            const enrichmentMult = treantProfile.enrichmentMultiplier;
            storeState.replenishResourceNode(targetType, {
              x: fixedNodePos.x,
              y: fixedNodePos.y,
              qualityMultiplier: enrichmentMult,
            });

            this.spawnFloatingPopup(
              IsometricHelper.gridToScreen(fixedNodePos.x, fixedNodePos.y).x,
              IsometricHelper.gridToScreen(fixedNodePos.x, fixedNodePos.y).y - 25,
              `🌱 Lv.${treantProfile.level} Enriched ${targetType} (${enrichmentMult}x)!`,
              '#10b981'
            );
          }
        }

        // Treant movement towards target
        const dest = worker.treantTargetTile || { x: 5, y: 5 };
        const destIso = IsometricHelper.gridToScreen(dest.x, dest.y);
        const dist = Math.hypot(destIso.x - worker.container.x, destIso.y - worker.container.y);

        if (dist > 35) {
          // Walk towards target
          worker.status = 'MOVING_TO_NODE';
          const dx = destIso.x - worker.container.x;
          const dy = destIso.y - worker.container.y;
          const step = effectiveSpeed * 1.1 * deltaSec;
          worker.container.x += (dx / dist) * step;
          worker.container.y += (dy / dist) * step;

          const curGrid = IsometricHelper.screenToGrid(worker.container.x, worker.container.y);
          worker.gridX = Phaser.Math.Clamp(Math.round(curGrid.x), 0, 9);
          worker.gridY = Phaser.Math.Clamp(Math.round(curGrid.y), 0, 9);
          worker.container.setDepth(IsometricHelper.getDepth(worker.gridX, worker.gridY, 6));

          worker.overrideEmote = worker.treantMode === 'REPAIR' ? '🔨' : '🌱';
          worker.overrideEmoteTimer = 400;
        } else {
          // At destination: perform action
          worker.status = 'HARVESTING';
          worker.overrideEmote = worker.treantMode === 'REPAIR' ? '🏰' : '✨';
          worker.overrideEmoteTimer = 1200;

          worker.supportCooldown -= deltaSec;
          if (worker.supportCooldown <= 0) {
            worker.supportCooldown = treantProfile.castleRepairCooldownSeconds;
            if (worker.treantMode === 'REPAIR') {
              if (castleNeedsRepair) {
                const repairAmount = treantProfile.repairAmount;
                const nextHp = Math.min(defenseState.castleMaxHp, defenseState.castleHp + repairAmount);
                useGameStore.setState((s) => ({
                  defense: {
                    ...s.defense,
                    castleHp: nextHp,
                  },
                }));
                this.spawnHarvestBurst(worker.container.x, worker.container.y - 15, 0x15803d, 6);
                this.spawnFloatingPopup(worker.container.x, worker.container.y - 40, `+${repairAmount} Castle HP 🏰 (Lv.${treantProfile.level})`, '#22c55e');
                soundFx.playHarvest('stone');
              } else {
                // Castle at 100% HP: Treant applies Ironbark Shield Fortification
                const shieldBonus = Math.round(treantProfile.repairAmount * 0.75);
                const nextShield = Math.min(defenseState.shieldMaxHp, defenseState.shieldHp + shieldBonus);
                if (nextShield > defenseState.shieldHp) {
                  useGameStore.setState((s) => ({
                    defense: {
                      ...s.defense,
                      shieldHp: nextShield,
                    },
                  }));
                  this.spawnHarvestBurst(worker.container.x, worker.container.y - 15, 0x38bdf8, 8);
                  this.spawnFloatingPopup(worker.container.x, worker.container.y - 40, `🛡️ Ironbark Shield +${shieldBonus} (Lv.${treantProfile.level})`, '#38bdf8');
                  soundFx.playHarvest('crystal');
                } else {
                  // Passive Citadel majesty coin tribute
                  useGameStore.setState((s) => ({
                    resources: {
                      ...s.resources,
                      coins: s.resources.coins + Math.round(treantProfile.level * 2),
                    },
                  }));
                  this.spawnHarvestBurst(worker.container.x, worker.container.y - 15, 0xfbbf24, 6);
                  this.spawnFloatingPopup(worker.container.x, worker.container.y - 40, `👑 Citadel Majesty Tribute (+${treantProfile.level * 2}🪙)`, '#fbbf24');
                }
              }
            } else {
              // Nature regrowth bloom on resource node
              this.spawnHarvestBurst(worker.container.x, worker.container.y - 15, 0x10b981, 10);
              this.spawnFloatingPopup(worker.container.x, worker.container.y - 40, `✨ Soil Enriched (${treantProfile.enrichmentMultiplier}x Yields)`, '#10b981');
              soundFx.playHarvest('wood');
            }
          }
        }

        continue; // Skip standard gathering FSM for Treant
      }

      // --- OTHER HEALER OVERRIDE LOGIC (Necromancer, etc.) ---
      if (isHealer) {
        let targetAlly: WorkerInstance | null = null;
        let lowestHpRatio = 1.0;
        let selfNeedsHeal = (worker.hp / worker.maxHp) < 1.0;
        
        for (const ally of this.workers) {
          const ratio = ally.hp / ally.maxHp;
          if (ratio < 1.0 && ratio < lowestHpRatio) {
            lowestHpRatio = ratio;
            targetAlly = ally;
          }
        }

        if (targetAlly || selfNeedsHeal) {
          const target = targetAlly || worker;
          const dist = Math.hypot(target.container.x - worker.container.x, target.container.y - worker.container.y);
          
          if (dist > 60 && target !== worker) {
            // Move towards ally
            worker.status = 'MOVING_TO_NODE'; 
            const dx = target.container.x - worker.container.x;
            const dy = target.container.y - worker.container.y;
            const step = effectiveSpeed * 1.35 * deltaSec;
            worker.container.x += (dx / dist) * step;
            worker.container.y += (dy / dist) * step;
            
            const curGrid = IsometricHelper.screenToGrid(worker.container.x, worker.container.y);
            worker.gridX = Phaser.Math.Clamp(Math.round(curGrid.x), 0, 9);
            worker.gridY = Phaser.Math.Clamp(Math.round(curGrid.y), 0, 9);
            worker.container.setDepth(IsometricHelper.getDepth(worker.gridX, worker.gridY, 6));
            
            worker.overrideEmote = '💚';
            worker.overrideEmoteTimer = 500;
            
            // Skip the normal FSM to prevent conflicts
            continue;
          } else {
            // In range! Heal!
            worker.status = 'HEALING';
            worker.overrideEmote = '✨';
            worker.overrideEmoteTimer = 1000;
            worker.combatCooldown -= deltaSec;
            if (worker.combatCooldown <= 0) {
              worker.combatCooldown = 1.0; // 1 heal per second
              const healAmt = effectiveAttack * 1.5; 
              target.hp = Math.min(target.maxHp, target.hp + healAmt);
              
              this.spawnHarvestBurst(target.container.x, target.container.y - 20, 0x22c55e, 5);
              this.spawnFloatingPopup(target.container.x, target.container.y - 45, `+${Math.floor(healAmt)} HP`, '#22c55e');
              
              soundFx.playHarvest('crystal'); // Fallback heal sound
            }
            continue; // Skip normal FSM
          }
        } else {
           // No one to heal, fall back to normal FSM (IDLE or harvest if forced)
           if (worker.status === 'HEALING') {
             worker.status = 'IDLE';
             worker.stateTimer = 500;
           }
        }
      }
      // ---------------------------------

      const requiredBuilding = worker.assignedTask === 'WOOD'
        ? 'WOOD'
        : worker.assignedTask === 'STONE'
        ? 'QUARRY'
        : worker.assignedTask === 'METAL'
        ? 'MINE'
        : worker.assignedTask === 'FISH' || worker.assignedTask === 'WATER'
        ? 'PORT'
        : null;
      if (worker.assignedTask === 'ESSENCE') {
        worker.assignedTask = storeState.castleBuilt && (storeState.resourceBuildings?.MINE?.level ?? 0) >= 1 ? 'METAL' : 'AETHER';
      }
      if (requiredBuilding && (!storeState.castleBuilt || (storeState.resourceBuildings?.[requiredBuilding]?.level ?? 0) < 1)) {
        worker.status = 'IDLE';
        worker.overrideEmote = '🔒';
        worker.overrideEmoteTimer = 1200;
        continue;
      }

      // Emote icon updates
      if (!worker.overrideEmote) {
        switch (worker.status) {
          case 'IDLE':
            worker.emoteText.setText('...');
            break;
          case 'MOVING_TO_NODE':
            worker.emoteText.setText(taskCfg.icon);
            break;
          case 'HARVESTING':
            if (worker.assignedTask === 'AETHER') worker.emoteText.setText('⛏️');
            else if (worker.assignedTask === 'WOOD') worker.emoteText.setText('🪓');
            else if (worker.assignedTask === 'STONE') worker.emoteText.setText('🔨');
            else worker.emoteText.setText('⚔️');
            break;
          case 'RETURNING_TO_NEXUS':
            worker.emoteText.setText(taskCfg.icon);
            break;

          case 'COMBAT':
            worker.emoteText.setText('⚔️');
            break;
          case 'HEALING':
            worker.emoteText.setText('💚');
            break;
        }
      }

      // FSM States
      switch (worker.status) {
        case 'COMBAT':
          if (!isInvasionActive || aliveInvaders.length === 0) {
            // Threat eliminated: celebrate and return to peaceful routine
            worker.status = 'IDLE';
            worker.stateTimer = 400;
            worker.overrideEmote = '✨';
            worker.overrideEmoteTimer = 2000;
            this.spawnFloatingPopup(
              worker.container.x,
              worker.container.y - 32,
              'Incursion Repelled! 🛡️',
              '#34d399'
            );
            break;
          }

          if (worker.hp < 35) {
            // Wounded in melee: retreat
            worker.overrideEmote = '🩹';
            worker.overrideEmoteTimer = 2500;
            this.spawnFloatingPopup(
              worker.container.x,
              worker.container.y - 35,
              'Critically Wounded! 🛡️',
              '#f59e0b'
            );
            worker.status = 'IDLE';
            worker.stateTimer = 1000;
            break;
          }

          // Golem actively hunts and charges at closest invading shade
          let targetInvader: ActiveInvader | null = null;
          let minDistanceToInvader = 999999;

          for (const inv of aliveInvaders) {
            const dist = Math.hypot(
              inv.container.x - worker.container.x,
              inv.container.y - worker.container.y
            );
            if (dist < minDistanceToInvader) {
              minDistanceToInvader = dist;
              targetInvader = inv;
            }
          }

          if (targetInvader) {
            // Check containers still exist before accessing coordinates
            if (
              targetInvader.container &&
              targetInvader.container.active &&
              worker.container &&
              worker.container.active &&
              !targetInvader.isDead
            ) {
              const targetX = targetInvader.container.x;
                const targetY = targetInvader.container.y;
                const workerX = worker.container.x;
                const workerY = worker.container.y;

                if (minDistanceToInvader > config.attackRange) {
                  // Golem charges forward into combat!
                  const safeDist = Math.max(1, minDistanceToInvader);
                  const dx = targetX - workerX;
                  const dy = targetY - workerY;
                  const step = effectiveSpeed * 1.35 * deltaSec;
                  worker.container.x += (dx / safeDist) * step;
                  worker.container.y += (dy / safeDist) * step;

                  const curGrid = IsometricHelper.screenToGrid(worker.container.x, worker.container.y);
                  worker.gridX = Phaser.Math.Clamp(Math.round(curGrid.x), 0, 9);
                  worker.gridY = Phaser.Math.Clamp(Math.round(curGrid.y), 0, 9);
                  worker.container.setDepth(IsometricHelper.getDepth(worker.gridX, worker.gridY, 6));
                } else {
                  // Within attack range: clash and strike!
                  worker.combatCooldown -= deltaSec;
                  if (worker.combatCooldown <= 0) {
                    worker.combatCooldown = 0.85;
                    worker.overrideEmote = '⚔️';
                    worker.overrideEmoteTimer = 900;

                    const attackDmg = effectiveAttack;
                    this.invasionManager?.damageInvader(targetInvader, attackDmg, `-${attackDmg} ⚔️`);
                    
                    // Display projectile or slash depending on range
                    if (config.attackRange > 60) {
                      // Projectile logic
                      soundFx.playLaser(); // Use hover sound for magic/ranged attack
                      this.spawnHarvestBurst(workerX, workerY - 10, config.lanternColor, 3);
                      this.spawnHarvestBurst(targetX, targetY - 10, config.lanternColor, 6);
                    } else {
                      // Melee logic
                      this.spawnHarvestBurst(targetX, targetY - 10, 0x38bdf8, 6);
                      soundFx.playHarvest('stone');
                    }
                    // Visual punch lunge animation with safe completion (only if melee)
                    if (config.attackRange <= 60) {
                      const lungeX = (targetX - workerX) * 0.25;
                      const lungeY = (targetY - workerY) * 0.25;
                      this.scene.tweens.add({
                        targets: worker.body,
                        x: lungeX,
                        y: lungeY,
                        yoyo: true,
                        duration: 80,
                        onComplete: () => {
                          if (worker.body && worker.body.active) {
                            worker.body.x = 0;
                            worker.body.y = 0;
                          }
                        },
                      });
                    }
                  }
                }
              }
            }
          break;
        case 'IDLE':
          // If the Castle is ruined, workers pause production until the Ent repairs it
          if (storeState.defense.castleHp <= 0) {
            worker.overrideEmote = '🏚️';
            worker.overrideEmoteTimer = 1000;
            worker.stateTimer = 1000;
            break;
          }

          worker.stateTimer -= delta;
          if (worker.stateTimer <= 0) {
            const atNexus = worker.gridX === this.nexusGridPos.x && worker.gridY === this.nexusGridPos.y;
            const fullyDepleted = worker.stamina <= 0 || worker.hp < 35;

            // Only return to castle if fully depleted (0% stamina or critically wounded)
            if (fullyDepleted && !atNexus) {
              this.dispatchToNexus(worker);
              break;
            }

            // At Nexus and fully depleted: replenish before going back to work
            if (fullyDepleted && atNexus) {
              // Heal HP first
              if (worker.hp < 35) {
                const storeState = useGameStore.getState();
                if (storeState.resources.fish > 0) {
                  storeState.spendResources({ fish: 1 });
                  worker.hp = worker.maxHp;
                  this.spawnFloatingPopup(worker.container.x, worker.container.y - 45, '🐟 Healed!', '#0ea5e9');
                  worker.stateTimer = 500;
                } else {
                  worker.hp = Math.min(worker.maxHp, worker.hp + 5);
                  worker.overrideEmote = '💤';
                  worker.overrideEmoteTimer = 1000;
                  this.spawnFloatingPopup(worker.container.x, worker.container.y - 35, '+5 HP', '#22c55e');
                  worker.stateTimer = 1000;
                }
              } else if (worker.stamina <= 0) {
                // Restore stamina
                const storeState = useGameStore.getState();
                if (storeState.resources.water > 0) {
                  storeState.spendResources({ water: 1 });
                  worker.stamina = worker.maxStamina;
                  this.spawnFloatingPopup(worker.container.x, worker.container.y - 55, '💧 Energized!', '#3b82f6');
                  worker.stateTimer = 500;
                } else {
                  worker.stamina = Math.min(worker.maxStamina, worker.stamina + 10);
                  worker.overrideEmote = '💤';
                  worker.overrideEmoteTimer = 1000;
                  this.spawnFloatingPopup(worker.container.x, worker.container.y - 35, '+10 Stamina', '#3b82f6');
                  worker.stateTimer = 1000;
                }
              } else {
                // Fully recovered, go back to work!
                this.dispatchToTaskNode(worker);
              }
            } else {
              // Not depleted — go straight back to work
              this.dispatchToTaskNode(worker);
            }
          }
          break;

        case 'MOVING_TO_NODE':
          if (storeState.defense.castleHp <= 0) {
            worker.status = 'IDLE';
            worker.overrideEmote = '🏚️';
            worker.overrideEmoteTimer = 1000;
            break;
          }
          this.handleMovement(worker, deltaSec, effectiveSpeed, () => {
            worker.status = 'HARVESTING';
            // Harvest duration
            worker.stateTimer = 2200;
            this.spawnHarvestBurst(worker.container.x, worker.container.y - 12, taskCfg.color, 4);
          });
          break;

        case 'HARVESTING':
          if (storeState.defense.castleHp <= 0) {
            worker.status = 'IDLE';
            worker.overrideEmote = '🏚️';
            worker.overrideEmoteTimer = 1000;
            break;
          }
          worker.stateTimer -= delta;
          if (Math.random() < 0.08) {
            this.spawnHarvestBurst(worker.container.x, worker.container.y - 12, taskCfg.color, 2);
          }
          if (worker.stateTimer <= 0) {
            worker.cargo = worker.maxCargo;
            this.renderCargoGraphics(worker.cargoIcon, worker.assignedTask);
            worker.cargoIcon.setVisible(true);

            // Audio & burst matching task
            if (worker.assignedTask === 'WOOD') {
              soundFx.playHarvest('wood');
            } else if (worker.assignedTask === 'STONE') {
              soundFx.playHarvest('stone');
            } else {
              soundFx.playHarvest('crystal');
            }

            this.spawnHarvestBurst(worker.container.x, worker.container.y - 12, taskCfg.color, 8);
            this.spawnFloatingPopup(
              worker.container.x,
              worker.container.y - 20,
              `+${worker.cargo} ${taskCfg.label}`,
              taskCfg.hexColor
            );

            this.dispatchToNexus(worker);
          }
          break;

        case 'RETURNING_TO_NEXUS':
          if (storeState.defense.castleHp <= 0) {
            worker.overrideEmote = '🏚️';
            worker.overrideEmoteTimer = 1000;
            // Cannot deposit into a ruined castle; wait until repaired
            break;
          }
          this.handleMovement(worker, deltaSec, effectiveSpeed, () => {
            // Deposit at Nexus Prime
            const isHarvestBlessing = (useGameStore.getState().activeGodBlessings?.CELESTIAL_HARVEST || 0) > 0;
            const harvestYieldMultiplier = isHarvestBlessing ? 3 : 1;

            // Check Treant node quality enrichment multiplier
            const dynamicNodes = useGameStore.getState().dynamicResourceNodes;
            const nodeQualityMultiplier = (
              worker.assignedTask === 'AETHER' ||
              worker.assignedTask === 'STONE' ||
              worker.assignedTask === 'WOOD' ||
              worker.assignedTask === 'ESSENCE'
            ) ? (dynamicNodes?.[worker.assignedTask]?.qualityMultiplier ?? 1.0) : 1.0;

            const totalHarvestMultiplier = harvestYieldMultiplier * nodeQualityMultiplier;
            const harvested = Math.max(1, Math.round(worker.cargo * totalHarvestMultiplier));
            worker.cargo = 0;
            worker.cargoIcon.setVisible(false);

            if (nodeQualityMultiplier > 1.0) {
              this.spawnFloatingPopup(
                worker.container.x,
                worker.container.y - 35,
                `🌿 Enriched Harvest! (${nodeQualityMultiplier.toFixed(2)}x)`,
                '#10b981'
              );
            }

            if (isHarvestBlessing) {
              this.spawnFloatingPopup(
                worker.container.x,
                worker.container.y - 48,
                `✨ 3x Celestial Harvest Yield!`,
                '#fbbf24'
              );
            }

            // Deposit strictly to the harvested resource!
            const depositDelta = {
              [taskCfg.resourceKey]: harvested,
            };

            const buildings = useGameStore.getState().resourceBuildings;
            if (worker.assignedTask === 'WOOD' && (buildings?.WOOD?.level ?? 0) >= 2) {
              depositDelta.charcoal = harvested;
            }
            if (worker.assignedTask === 'STONE' && (buildings?.QUARRY?.level ?? 0) >= 2) {
              depositDelta.minerals = harvested;
            }
            if (worker.assignedTask === 'METAL' && (buildings?.MINE?.level ?? 0) >= 2) {
              depositDelta.coal = harvested;
            }
            if (worker.assignedTask === 'FISH' && (buildings?.PORT?.level ?? 0) >= 2) {
              depositDelta.water = harvested;
            }

            // Chrono-Automaton bonus Arcane Essence
            if (worker.unitClass === 'CHRONO' && worker.assignedTask === 'ESSENCE') {
              depositDelta.arcaneEssence = (depositDelta.arcaneEssence || 0) + (1 * Math.round(totalHarvestMultiplier));
            }

            useGameStore.getState().addResources(depositDelta);
            soundFx.playDeposit();

            // Auto-Sell subroutine if enabled
            const storeState = useGameStore.getState();
            if (storeState.autoSettings.autoSell) {
              const currentAmt = storeState.resources[taskCfg.resourceKey] || 0;
              if (currentAmt > 120) {
                storeState.sellResource(taskCfg.resourceKey, 10);
                this.spawnFloatingPopup(
                  worker.container.x,
                  worker.container.y - 36,
                  '⚡ Auto-Sold 10 ⇄ Coins',
                  '#fbbf24'
                );
              }
            }

            this.spawnFloatingPopup(
              worker.container.x,
              worker.container.y - 20,
              `+${harvested} ${taskCfg.label} Delivered`,
              taskCfg.hexColor
            );

            // Drain stamina for this expedition (reduced by armor/relic, increased by weather)
            const effectiveDrain = worker.staminaDrain * (1 - drainReduction / 100) * weatherDrainMult;
            worker.stamina = Math.max(0, worker.stamina - effectiveDrain);

            worker.status = 'IDLE';
            worker.stateTimer = worker.stamina <= 0 || worker.hp < 35 ? 200 : 600 + Math.random() * 400;
          });
          break;
      }
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

  private dispatchToTaskNode(worker: WorkerInstance): void {
    if (worker.status === 'MOVING_TO_NODE') return;
    worker.gridX = Phaser.Math.Clamp(Math.round(worker.gridX ?? 5), 0, 9);
    worker.gridY = Phaser.Math.Clamp(Math.round(worker.gridY ?? 5), 0, 9);

    // Minions are not locked into one resource: they freely roam and gather different needed/random resources
    const isGathererUnit =
      worker.unitClass === 'GOLEM' ||
      worker.unitClass === 'WAYFARER' ||
      worker.unitClass === 'CHRONO' ||
      worker.unitClass === 'MERMAN' ||
      worker.unitClass === 'NECROMANCER';

    if (isGathererUnit) {
      const gatherTasks: HarvestTask[] = ['AETHER', 'WOOD', 'STONE', 'METAL', 'FISH', 'WATER'];
      const storeState = useGameStore.getState();

      // Check which resource has the lowest count to balance the realm's inventory
      const resCountMap: Record<HarvestTask, number> = {
        AETHER: storeState.resources.aetherShards,
        WOOD: storeState.resources.wood,
        STONE: storeState.resources.stone,
        METAL: storeState.resources.metal || 0,
        ESSENCE: 999999,
        FISH: storeState.resources.fish,
        WATER: storeState.resources.water,
        HEAL: 999999,
        BUILD: 999999,
      };

      // 60% chance to pick the lowest resource needed, 40% chance completely random
      let chosenTask: HarvestTask;
      if (Math.random() < 0.6) {
        let lowestTask = gatherTasks[0];
        let lowestAmt = resCountMap[lowestTask];
        for (const t of gatherTasks) {
          if (resCountMap[t] < lowestAmt) {
            lowestAmt = resCountMap[t];
            lowestTask = t;
          }
        }
        chosenTask = lowestTask;
      } else {
        chosenTask = gatherTasks[Math.floor(Math.random() * gatherTasks.length)];
      }

      if (worker.assignedTask !== chosenTask) {
        worker.assignedTask = chosenTask;
        this.renderWorkerGraphics(worker.body, worker.unitClass, chosenTask, worker.equipment);
        this.renderCargoGraphics(worker.cargoIcon, chosenTask);
        worker.emoteText.setText(TASK_CONFIG[chosenTask].icon);
      }
    }

    const dynamicNodes = useGameStore.getState().dynamicResourceNodes;
    let targetNode = TASK_NODE_LOCATIONS[worker.assignedTask];
    if (
      worker.assignedTask === 'AETHER' ||
      worker.assignedTask === 'STONE' ||
      worker.assignedTask === 'WOOD' ||
      worker.assignedTask === 'ESSENCE'
    ) {
      targetNode = dynamicNodes?.[worker.assignedTask] || targetNode;
    }

    const allowedTiles = this.getAllowedTiles(worker.unitClass);
    const path = this.pathfinder.findPath(worker.gridX, worker.gridY, targetNode.x, targetNode.y, allowedTiles);
    worker.currentPath = (path && path.length > 0)
      ? path
      : [{ x: worker.gridX, y: worker.gridY }, { x: targetNode.x, y: targetNode.y }];
    worker.pathIndex = 0;
    worker.status = 'MOVING_TO_NODE';
  }

  private dispatchToNexus(worker: WorkerInstance): void {
    if (worker.status === 'RETURNING_TO_NEXUS') return;
    worker.gridX = Phaser.Math.Clamp(Math.round(worker.gridX ?? 5), 0, 9);
    worker.gridY = Phaser.Math.Clamp(Math.round(worker.gridY ?? 5), 0, 9);
    const allowedTiles = this.getAllowedTiles(worker.unitClass);
    const path = this.pathfinder.findPath(worker.gridX, worker.gridY, this.nexusGridPos.x, this.nexusGridPos.y, allowedTiles);
    worker.currentPath = (path && path.length > 0)
      ? path
      : [{ x: worker.gridX, y: worker.gridY }, { x: this.nexusGridPos.x, y: this.nexusGridPos.y }];
    worker.pathIndex = 0;
    worker.status = 'RETURNING_TO_NEXUS';
  }

  public getWorkers(): WorkerInstance[] {
    return this.workers;
  }

  private handleMovement(
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

  public spawnFloatingPopup(x: number, y: number, text: string, color: string = '#38bdf8'): void {
    const label = this.scene.add.text(x, y, text, {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: '13px',
      fontStyle: 'bold',
      color,
      stroke: '#020617',
      strokeThickness: 3,
    });
    label.setOrigin(0.5);
    label.setDepth(9999);

    if (this.parentContainer) {
      this.parentContainer.add(label);
    }

    this.scene.tweens.add({
      targets: label,
      y: y - 30,
      scaleX: 1.1,
      scaleY: 1.1,
      alpha: 0,
      duration: 1100,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
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
