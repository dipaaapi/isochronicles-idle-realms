import Phaser from 'phaser';
import {
  GridPoint,
  InvaderType,
  INVADER_CONFIGS,
} from '../types/game';
import { IsometricHelper } from './IsometricHelper';
import { PathfindingService } from './PathfindingService';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from './audio/soundFx';
import { WorkerInstance } from './WorkerManager';
import { DIFFICULTIES, normalizeDifficulty } from '../state/difficulty';
import { skillBonuses } from '../state/skillTree';

export interface ActiveInvader {
  id: string;
  type: InvaderType;
  name: string;
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  bodyGfx: Phaser.GameObjects.Graphics;
  hpBarGfx: Phaser.GameObjects.Graphics;
  gridX: number;
  gridY: number;
  currentPath: GridPoint[];
  pathIndex: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  bountyCoins: number;
  attackTimer: number;
  isDead: boolean;
  isScout?: boolean;
  isRetreating?: boolean;
  spawnGrid: GridPoint;
}

export class InvasionManager {
  private scene: Phaser.Scene;
  private pathfinder: PathfindingService;
  private parentContainer?: Phaser.GameObjects.Container;
  private invaders: ActiveInvader[] = [];
  private turretGfx: Phaser.GameObjects.Graphics;
  private turretShootTimer: number = 0;
  private spawnTimer: number = 0;
  private totalEnemiesToSpawn: number = 0;
  private enemiesSpawnedCount: number = 0;
  private nexusGridPos: GridPoint = { x: 5, y: 5 };
  private workerProvider?: () => WorkerInstance[];
  private autoSmiteTimer: number = 0;
  private lastSmiteTime: number = 0;
  private wasInvasionActive: boolean = false;

  constructor(
    scene: Phaser.Scene,
    pathfinder: PathfindingService,
    parentContainer?: Phaser.GameObjects.Container
  ) {
    this.scene = scene;
    this.pathfinder = pathfinder;
    this.parentContainer = parentContainer;

    // Turret projectile graphics layer
    this.turretGfx = this.scene.add.graphics();
    this.turretGfx.setDepth(9995);
    if (this.parentContainer) {
      this.parentContainer.add(this.turretGfx);
    }
  }

  public setWorkerProvider(provider: () => WorkerInstance[]): void {
    this.workerProvider = provider;
  }

  public getInvaders(): ActiveInvader[] {
    return this.invaders;
  }

  public update(delta: number): void {
    const deltaSec = delta / 1000;
    const store = useGameStore.getState();

    // Clean up when a wave closes, while allowing peacetime scouts to survive.
    if (!store.invasion.isActive && this.wasInvasionActive) {
      this.wipeAllInvaders();
    }
    this.wasInvasionActive = store.invasion.isActive;

    // 1. Tick incursion countdown when peacetime
    if (!store.invasion.isActive) {
      store.tickInvasionCountdown(deltaSec);
    } else {
      // 2. Active incursion handling
      this.handleActiveIncursion(delta, deltaSec);
    }

    // Check if Castle was crushed: ensure all enemies immediately cease attacking and leave the platform with loot
    if (store.defense.castleHp <= 0 && this.invaders.some((i) => !i.isDead && !i.isRetreating)) {
      this.triggerEnemiesRetreatWithLoot();
    }

    // 3. Automated Turret Attacks (disabled if castle breached or invaders retreating)
    if (store.defense.castleHp > 0) {
      this.handleTurretAttacks(delta);

      // AEGIS_WRATH God Blessing: Continuous celestial lightning smiting invaders
      const isAegisWrath = (store.activeGodBlessings?.AEGIS_WRATH || 0) > 0;
      if (isAegisWrath && this.invaders.some((i) => !i.isDead)) {
        this.autoSmiteTimer -= delta;
        if (this.autoSmiteTimer <= 0) {
          this.autoSmiteTimer = 850; // Lightning strike every 850ms
          this.smiteClosestInvader(undefined, undefined, true);
        }
      }
    }

    // 4. Update living invaders movement and attacks
    this.updateInvaders(deltaSec);
  }

  private handleActiveIncursion(delta: number, _deltaSec: number): void {
    const store = useGameStore.getState();

    // Initialize wave spawning
    if (this.totalEnemiesToSpawn === 0 && store.invasion.totalEnemiesInWave > 0) {
      this.totalEnemiesToSpawn = store.invasion.totalEnemiesInWave;
      this.enemiesSpawnedCount = 0;
      this.spawnTimer = 500;
    }

    // Spawn staggered enemies
    if (this.enemiesSpawnedCount < this.totalEnemiesToSpawn) {
      this.spawnTimer -= delta;
      if (this.spawnTimer <= 0 && useGameStore.getState().invasion.isActive) {
        this.spawnTimer = 1800 + Math.random() * 800; // Spawn every ~2 seconds
        this.spawnSingleInvader(store.invasion.waveNumber);
        this.enemiesSpawnedCount++;
      }
    }

    // Check Victory
    if (
      this.enemiesSpawnedCount >= this.totalEnemiesToSpawn &&
      this.invaders.length === 0 &&
      store.invasion.isActive
    ) {
      this.totalEnemiesToSpawn = 0;
      this.enemiesSpawnedCount = 0;
      const victoryBounty = 80 + store.invasion.waveNumber * 45;
      store.resolveInvasionVictory(victoryBounty);

      const nexusScreen = IsometricHelper.gridToScreen(5, 5);
      this.spawnFloatingPopup(
        nexusScreen.x,
        nexusScreen.y - 45,
        `⚔️ VICTORY! +${victoryBounty} 🪙 Bounty`,
        '#f59e0b'
      );
    }

  // Auto-Tap / Auto-Smite Subroutine
    if (store.autoSettings.autoTap && this.invaders.some((i) => !i.isDead)) {
      this.autoSmiteTimer -= delta;
      if (this.autoSmiteTimer <= 0) {
        this.autoSmiteTimer = 950 + Math.random() * 300;
        this.smiteClosestInvader(undefined, undefined, true);
      }
    }
  }

  public spawnLootScouts(): void {
    // Spawns 1 to 3 non-threatening wandering scouts
    const numScouts = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < numScouts; i++) {
      this.spawnSingleScout();
    }
  }

  private spawnSingleScout(): void {
    // Choose a random spawn edge
    const spawnPoints: GridPoint[] = [
      { x: 0, y: 0 },
      { x: 9, y: 0 },
      { x: 0, y: 9 },
      { x: 9, y: 9 },
    ];
    const spawnGrid = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];

    const type: InvaderType = 'HUMAN_ARCHER'; // re-use archer sprite for now, but weak stats
    
    // Low HP, low damage so they aren't a threat
    const finalMaxHp = 10;
    const finalDamage = 0; // they don't attack
    const finalBounty = 0; // custom drop is handled in strike function
    const startIso = IsometricHelper.gridToScreen(spawnGrid.x, spawnGrid.y);

    const container = this.scene.add.container(startIso.x, startIso.y);
    container.setSize(24, 24);

    const shadow = this.scene.add.ellipse(0, 4, 14, 7, 0x000000, 0.45);
    const bodyGfx = this.scene.add.graphics();
    const hpBarGfx = this.scene.add.graphics(); // Hidden hp bar for scouts

    this.renderInvaderBody(bodyGfx, type);

    container.add([shadow, bodyGfx, hpBarGfx]);
    container.setDepth(IsometricHelper.getDepth(spawnGrid.x, spawnGrid.y, 7));

    if (this.parentContainer) {
      this.parentContainer.add(container);
    }

    const invader: ActiveInvader = {
      id: `scout_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      type,
      name: 'Wandering Scout',
      isScout: true,
      container,
      shadow,
      bodyGfx,
      hpBarGfx,
      gridX: spawnGrid.x,
      gridY: spawnGrid.y,
      currentPath: [],
      pathIndex: 0,
      hp: finalMaxHp,
      maxHp: finalMaxHp,
      speed: 65, // Movement uses pixels per second, like regular invaders.
      damage: finalDamage,
      bountyCoins: finalBounty,
      attackTimer: 0,
      isDead: false,
      isRetreating: true, // trick it into wandering off
      spawnGrid: { x: spawnGrid.x, y: spawnGrid.y },
    };

    // Interactive Clicking: Smite for Loot
    container.setInteractive({ useHandCursor: true });
    container.on('pointerdown', (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      if (pointer.leftButtonDown() && !invader.isDead) {
        event.stopPropagation();
        this.tapInvader(invader);
      }
    });

    // Make them wander to a random edge to leave
    const exitPoints = spawnPoints.filter((point) => point.x !== spawnGrid.x || point.y !== spawnGrid.y);
    const leaveGrid = exitPoints[Math.floor(Math.random() * exitPoints.length)];
    const spawnPath = this.pathfinder.findPath(spawnGrid.x, spawnGrid.y, leaveGrid.x, leaveGrid.y, [0]);
    invader.currentPath = (spawnPath && spawnPath.length > 0) ? spawnPath : [spawnGrid, leaveGrid];
    invader.pathIndex = 0;

    this.invaders.push(invader);
  }

  private spawnSingleInvader(waveNumber: number): void {
    if (!useGameStore.getState().invasion.isActive) return;

    // Choose spawn edge
    const spawnPoints: GridPoint[] = [
      { x: 0, y: 0 },
      { x: 9, y: 0 },
      { x: 0, y: 9 },
      { x: 9, y: 9 },
      { x: 1, y: 8 }, // Void Cave entrance
    ];
    const spawnGrid = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
    
    // Choose enemy type based on wave (Humans & Mechas & Deep One) AND nexusLevel
    const nexusLevel = useGameStore.getState().upgrades.nexusLevel;
    let type: InvaderType = 'HUMAN_KNIGHT';
    const rand = Math.random();
    
    // Boss waves every 5 waves, and massive Phase Climax Bosses at 25, 50, 75, 100
    const isPhaseClimaxBoss = waveNumber === 25 || waveNumber === 50 || waveNumber === 75 || waveNumber === 100;
    const isBossWave = (waveNumber % 5 === 0) || isPhaseClimaxBoss;
    const isLastEnemyOfWave = this.enemiesSpawnedCount === this.totalEnemiesToSpawn - 1;

    if ((isPhaseClimaxBoss || isBossWave) && isLastEnemyOfWave) {
      type = 'MECHA_TITAN';
    } else if (waveNumber >= 15 && rand < 0.35) {
      type = 'MECHA_TITAN';
    } else if (waveNumber >= 8 && rand < 0.55) {
      type = 'MECHA_SCOUT';
    } else if (waveNumber >= 4 && rand < 0.70) {
      type = 'HUMAN_ARCHER';
    } else if (rand < 0.85) {
      type = 'DEEP_ONE';
    } else {
      type = 'HUMAN_KNIGHT';
    }

    // Auto-discover invader in Demon Lord Bestiary!
    useGameStore.getState().discoverEntry('invader', type);

    const cfg = INVADER_CONFIGS[type];
    // Smooth difficulty multiplier from 1.0 at Wave 1 up to ~6.0 at Wave 100
    const enemyMultiplier = DIFFICULTIES[normalizeDifficulty(useGameStore.getState().difficulty)].enemyMultiplier;
    const difficultyMultiplier = (1 + (waveNumber - 1) * 0.05) * enemyMultiplier;
    const isBoss = (isBossWave || isPhaseClimaxBoss) && isLastEnemyOfWave;
    const bossHpMultiplier = isPhaseClimaxBoss ? 4.5 : isBoss ? 2.5 : 1;
    const bossDmgMultiplier = isPhaseClimaxBoss ? 2.0 : isBoss ? 1.4 : 1;
    const bossBountyMultiplier = isPhaseClimaxBoss ? 8.0 : isBoss ? 3.5 : 1;
    
    const finalMaxHp = Math.round((cfg.hp + (waveNumber - 1) * 18) * difficultyMultiplier * bossHpMultiplier);
    const finalDamage = Math.round(cfg.damage * (1 + (waveNumber - 1) * 0.035) * bossDmgMultiplier * enemyMultiplier);
    const finalBounty = Math.round(cfg.bountyCoins * (1 + (waveNumber - 1) * 0.04) * bossBountyMultiplier);
    const startIso = IsometricHelper.gridToScreen(spawnGrid.x, spawnGrid.y);

    const container = this.scene.add.container(startIso.x, startIso.y);
    container.setSize(32, 32);

    const shadow = this.scene.add.ellipse(0, 4, 18, 9, 0x000000, 0.45);
    const bodyGfx = this.scene.add.graphics();
    const hpBarGfx = this.scene.add.graphics();

    this.renderInvaderBody(bodyGfx, type);
    this.renderHpBar(hpBarGfx, finalMaxHp, finalMaxHp);

    container.add([shadow, bodyGfx, hpBarGfx]);
    container.setDepth(IsometricHelper.getDepth(spawnGrid.x, spawnGrid.y, 7));

    if (isBoss) {
      container.setScale(1.5);
      shadow.setScale(1.5);
    }

    if (this.parentContainer) {
      this.parentContainer.add(container);
    }

    const invader: ActiveInvader = {
      id: `invader_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      type,
      name: isBoss ? `BOSS ${cfg.name}` : cfg.name,
      container,
      shadow,
      bodyGfx,
      hpBarGfx,
      gridX: spawnGrid.x,
      gridY: spawnGrid.y,
      currentPath: [],
      pathIndex: 0,
      hp: finalMaxHp,
      maxHp: finalMaxHp,
      speed: cfg.speed,
      damage: finalDamage,
      bountyCoins: finalBounty,
      attackTimer: 0,
      isDead: false,
      isRetreating: false,
      spawnGrid: { x: spawnGrid.x, y: spawnGrid.y },
    };

    // Interactive Clicking: Demon Lord Lightning Smite! ⚡
    container.setInteractive({ useHandCursor: true });
    container.on('pointerdown', (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      if (pointer.leftButtonDown() && !invader.isDead) {
        event.stopPropagation();
        this.tapInvader(invader);
      }
    });

    // Pathfind to Demon Lord's Citadel (synchronous)
    const allowedTiles = type === 'DEEP_ONE' ? [0, 1] : [0];
    const spawnPath = this.pathfinder.findPath(spawnGrid.x, spawnGrid.y, this.nexusGridPos.x, this.nexusGridPos.y, allowedTiles);
    invader.currentPath = (spawnPath && spawnPath.length > 0)
      ? spawnPath
      : [{ x: spawnGrid.x, y: spawnGrid.y }, { x: this.nexusGridPos.x, y: this.nexusGridPos.y }];
    invader.pathIndex = 0;

    this.invaders.push(invader);
    soundFx.playCastleHit();
  }

  private renderInvaderBody(graphics: Phaser.GameObjects.Graphics, type: InvaderType): void {
    graphics.clear();
    const cfg = INVADER_CONFIGS[type];

    if (type === 'HUMAN_KNIGHT' || type === 'VOID_SHADE') {
      // Human Crusader Knight: Shining silver armor, blue cape, iron helmet & sword
      // Cape
      graphics.fillStyle(0x2563eb, 0.9);
      graphics.fillTriangle(0, -18, -9, 0, 9, 0);
      // Silver Torso & Helmet
      graphics.fillStyle(0x94a3b8, 1);
      graphics.fillCircle(0, -14, 6.5);
      // Helmet visor slit
      graphics.fillStyle(0x0f172a, 1);
      graphics.fillRect(-3.5, -15, 7, 2);
      // Gold Crusader Cross
      graphics.fillStyle(0xfbbf24, 1);
      graphics.fillRect(-1, -12, 2, 6);
      graphics.fillRect(-3, -10, 6, 2);
      // Steel Broadsword in hand
      graphics.fillStyle(0xe2e8f0, 1);
      graphics.fillRect(8, -20, 2, 14);
      graphics.fillStyle(0x64748b, 1);
      graphics.fillRect(6, -10, 6, 2);
    } else if (type === 'HUMAN_ARCHER') {
      // Human Ranger / Archer: Green cloak, leather vest, curved wooden bow
      graphics.fillStyle(0x166534, 1);
      graphics.fillTriangle(0, -20, -7, -2, 7, -2);
      graphics.fillStyle(0x15803d, 1);
      graphics.fillCircle(0, -14, 5.5);
      // Face & Archer Hood
      graphics.fillStyle(0xfde047, 1);
      graphics.fillCircle(0, -14, 3);
      // Curved Wooden Bow
      graphics.lineStyle(2, 0x854d0e, 1);
      graphics.strokeCircle(8, -12, 6);
      // Arrow
      graphics.lineStyle(1, 0xffffff, 0.9);
      graphics.lineBetween(4, -12, 12, -12);
    } else if (type === 'MECHA_SCOUT' || type === 'RIFT_STALKER') {
      // Cybernetic Mecha Walker Drone: Dual hydraulic metal legs, glowing neon scanning visor
      // Walker Legs
      graphics.fillStyle(0x475569, 1);
      graphics.fillRect(-8, -4, 4, 7);
      graphics.fillRect(4, -4, 4, 7);
      // Cockpit Chassis
      graphics.fillStyle(0x334155, 1);
      graphics.fillRoundedRect(-9, -20, 18, 14, 4);
      // Cybernetic Neon Scanning Eye (Yellow/Cyan)
      graphics.fillStyle(cfg.color, 1);
      graphics.fillRect(-6, -15, 12, 3);
      graphics.fillStyle(0xffffff, 0.9);
      graphics.fillCircle(0, -13.5, 1.5);
      // Sensor Antenna
      graphics.fillStyle(0x64748b, 1);
      graphics.fillRect(4, -26, 2, 7);
      graphics.fillStyle(0xef4444, 1);
      graphics.fillCircle(5, -26, 2);
    } else if (type === 'DEEP_ONE') {
      // DEEP_ONE: Squid-like sea monster with tentacles
      graphics.fillStyle(0x0284c7, 1); // Dark blue body
      graphics.fillEllipse(0, -14, 12, 16);
      graphics.fillStyle(0x0c4a6e, 1); // Darker shading
      graphics.fillEllipse(0, -15, 10, 14);
      // Giant glowing yellow eye
      graphics.fillStyle(0xfacc15, 1);
      graphics.fillCircle(0, -14, 4);
      graphics.fillStyle(0x000000, 1);
      graphics.fillRect(-1, -16, 2, 4); // Slit pupil
      // Tentacles
      graphics.lineStyle(3, 0x0284c7, 1);
      graphics.beginPath();
      graphics.moveTo(-4, -6);
      graphics.lineTo(-8, 2);
      graphics.lineTo(-12, 0);
      graphics.strokePath();
      graphics.beginPath();
      graphics.moveTo(4, -6);
      graphics.lineTo(8, 2);
      graphics.lineTo(12, 0);
      graphics.strokePath();
      graphics.beginPath();
      graphics.moveTo(0, -4);
      graphics.lineTo(0, 4);
      graphics.lineTo(3, 6);
      graphics.strokePath();
    } else {
      // MECHA_TITAN / CORRUPTED_GOLEM: Heavy Heavy Combat Mecha
      // Heavy Hydraulic Tread Legs
      graphics.fillStyle(0x1e293b, 1);
      graphics.fillRect(-12, -6, 7, 9);
      graphics.fillRect(5, -6, 7, 9);
      // Armored Chestplate Chassis
      graphics.fillStyle(0x334155, 1);
      graphics.fillRoundedRect(-14, -26, 28, 20, 5);
      // Hazard Stripes & Power Core
      graphics.fillStyle(0xf59e0b, 1);
      graphics.fillRect(-8, -23, 16, 3);
      graphics.fillStyle(0xef4444, 1);
      graphics.fillCircle(0, -16, 5);
      graphics.fillStyle(0xffffff, 1);
      graphics.fillCircle(0, -16, 2);
      // Dual Gatling Arm Cannons
      graphics.fillStyle(0x0f172a, 1);
      graphics.fillRect(-17, -22, 4, 15);
      graphics.fillRect(13, -22, 4, 15);
    }
  }

  private renderHpBar(graphics: Phaser.GameObjects.Graphics, current: number, max: number): void {
    graphics.clear();
    const width = 24;
    const height = 4;
    const x = -width / 2;
    const y = -26;

    // Background
    graphics.fillStyle(0x000000, 0.7);
    graphics.fillRect(x - 1, y - 1, width + 2, height + 2);

    // HP Fill
    const pct = Phaser.Math.Clamp(current / max, 0, 1);
    const color = pct > 0.5 ? 0x22c55e : pct > 0.25 ? 0xf59e0b : 0xef4444;
    graphics.fillStyle(color, 1);
    graphics.fillRect(x, y, width * pct, height);
  }

  public smiteClosestInvader(worldX?: number, worldY?: number, isAutoTap: boolean = false): boolean {
    const aliveInvaders = this.invaders.filter((i) => !i.isDead);
    if (aliveInvaders.length === 0) return false;

    const now = Date.now();
    if (!isAutoTap && now - this.lastSmiteTime < 80) {
      return false;
    }
    if (!isAutoTap) {
      this.lastSmiteTime = now;
    }

    let closest: ActiveInvader | null = null;
    let minDistance = 999999;

    if (worldX !== undefined && worldY !== undefined) {
      for (const invader of aliveInvaders) {
        const dx = invader.container.x - worldX;
        const dy = invader.container.y - worldY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDistance) {
          minDistance = dist;
          closest = invader;
        }
      }
    }

    // If no invader near specific coordinate or general tap, target the most threatening (closest to Nexus)
    if (!closest) {
      const nexusIso = IsometricHelper.gridToScreen(this.nexusGridPos.x, this.nexusGridPos.y);
      minDistance = 999999;
      for (const invader of aliveInvaders) {
        const dist = Math.hypot(invader.container.x - nexusIso.x, invader.container.y - nexusIso.y);
        if (dist < minDistance) {
          minDistance = dist;
          closest = invader;
        }
      }
    }

    if (!closest) return false;

    // Draw dramatic jagged lightning bolt from sky to target
    const boltGfx = this.scene.add.graphics();
    boltGfx.setDepth(9999);
    if (this.parentContainer) {
      this.parentContainer.add(boltGfx);
    }

    const startX = closest.container.x + Phaser.Math.Between(-20, 20);
    const startY = closest.container.y - 180;
    const endX = closest.container.x;
    const endY = closest.container.y - 12;

    // Core bright electric bolt
    boltGfx.lineStyle(3, 0x67e8f9, 1);
    boltGfx.beginPath();
    boltGfx.moveTo(startX, startY);
    const segments = 5;
    for (let s = 1; s < segments; s++) {
      const frac = s / segments;
      const midX = startX + (endX - startX) * frac + Phaser.Math.Between(-14, 14);
      const midY = startY + (endY - startY) * frac;
      boltGfx.lineTo(midX, midY);
    }
    boltGfx.lineTo(endX, endY);
    boltGfx.strokePath();

    // Outer cyan electric glow
    boltGfx.lineStyle(7, 0x06b6d4, 0.45);
    boltGfx.beginPath();
    boltGfx.moveTo(startX, startY);
    boltGfx.lineTo(endX, endY);
    boltGfx.strokePath();

    this.scene.cameras.main.shake(120, 0.005);
    soundFx.playLaser();

    const smiteDmg = 35;
    this.damageInvader(closest, smiteDmg, isAutoTap ? '⚡ -35 AUTO' : '⚡ -35 SMITE');

    this.scene.tweens.add({
      targets: boltGfx,
      alpha: 0,
      duration: 200,
      ease: 'Linear',
      onComplete: () => boltGfx.destroy(),
    });

    return true;
  }

  public tapInvader(invader: ActiveInvader): void {
    if (invader.isDead) return;
    if (invader.isScout && !useGameStore.getState().invasion.isActive) {
      this.eliminateInvader(invader);
    } else {
      this.strikeInvaderWithLightning(invader);
    }
  }

  public strikeInvaderWithLightning(invader: ActiveInvader): void {
    const smiteDmg = 35;
    this.damageInvader(invader, smiteDmg, '⚡ Smite');
    soundFx.playLaser();

    // Visual electric flash
    this.scene.tweens.add({
      targets: invader.bodyGfx,
      alpha: 0.2,
      yoyo: true,
      duration: 60,
      repeat: 2,
    });
  }

  private handleTurretAttacks(delta: number): void {
    const storeState = useGameStore.getState();
    const turretLevel = storeState.defense.turretLevel;
    if (turretLevel <= 0 || this.invaders.length === 0) return;

    const isAegisWrath = (storeState.activeGodBlessings?.AEGIS_WRATH || 0) > 0;
    // Turret fires twice as fast during Aegis Wrath
    this.turretShootTimer -= isAegisWrath ? delta * 2 : delta;
    const interval = Math.max(500, 1300 - turretLevel * 90);

    if (this.turretShootTimer <= 0) {
      this.turretShootTimer = interval;

      // Find closest alive invader
      const nexusIso = IsometricHelper.gridToScreen(this.nexusGridPos.x, this.nexusGridPos.y);
      let closest: ActiveInvader | null = null;
      let minDistance = 9999;

      for (const invader of this.invaders) {
        if (invader.isDead) continue;
        const dx = invader.container.x - nexusIso.x;
        const dy = invader.container.y - nexusIso.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDistance && dist < 320) {
          minDistance = dist;
          closest = invader;
        }
      }

      if (closest) {
        // Fire laser bolt
        const damage = Math.round((22 + turretLevel * 10) * skillBonuses(useGameStore.getState().unlockedSkills).turret);
        this.fireTurretBeam(nexusIso.x, nexusIso.y - 20, closest.container.x, closest.container.y - 12);
        this.damageInvader(closest, damage, `-${damage}`);
        soundFx.playLaser();
      }
    }
  }

  private fireTurretBeam(startX: number, startY: number, endX: number, endY: number): void {
    this.turretGfx.clear();
    // Core beam
    this.turretGfx.lineStyle(3, 0x38bdf8, 0.9);
    this.turretGfx.lineBetween(startX, startY, endX, endY);
    // Outer glow
    this.turretGfx.lineStyle(6, 0x0284c7, 0.4);
    this.turretGfx.lineBetween(startX, startY, endX, endY);

    this.scene.time.delayedCall(120, () => {
      this.turretGfx.clear();
    });
  }

  public damageInvader(invader: ActiveInvader, damage: number, popupText?: string): void {
    if (invader.isDead) return;

    invader.hp -= damage;
    this.renderHpBar(invader.hpBarGfx, invader.hp, invader.maxHp);

    if (popupText) {
      this.spawnFloatingPopup(
        invader.container.x,
        invader.container.y - 24,
        popupText,
        '#f43f5e'
      );
    }
    
    if (invader.container && invader.container.active) {
      const isGore = useGameStore.getState().isGoreEnabled;
      const isBio = INVADER_CONFIGS[invader.type].category === 'HUMAN';
      const hitColor = (isGore && isBio) ? 0x991b1b : 0x38bdf8;
      this.spawnDeathBurst(invader.container.x, invader.container.y - 8, hitColor, isGore && isBio);
    }

    if (invader.hp <= 0) {
      this.eliminateInvader(invader);
    }
  }

  private eliminateInvader(invader: ActiveInvader): void {
    if (invader.isDead) return;
    if (invader.isScout) {
      invader.isDead = true;
      invader.hp = 0;
      soundFx.playExplosion();
      useGameStore.getState().grantRandomLoot();
      this.spawnFloatingPopup(invader.container.x, invader.container.y - 30,
        'Castle supplies: +Wood, +Stone, +Shards, +Coins', '#fbbf24');
      invader.container.destroy();
      this.invaders = this.invaders.filter((i) => i.id !== invader.id);
      return;
    }
    if (!useGameStore.getState().invasion.isActive) {
      invader.isDead = true;
      if (invader.container.active) invader.container.destroy();
      this.invaders = this.invaders.filter((i) => i.id !== invader.id);
      useGameStore.getState().setEnemiesRemaining(this.invaders.length);
      return;
    }

    invader.isDead = true;
    soundFx.playExplosion();

    // Reward bounty
    useGameStore.getState().addResources({ coins: invader.bountyCoins });
    useGameStore.setState((state) => ({
      invasion: {
        ...state.invasion,
        invaderKills: state.invasion.invaderKills + 1,
      },
    }));
    this.spawnFloatingPopup(
      invader.container.x,
      invader.container.y - 28,
      `+${invader.bountyCoins} 🪙`,
      '#fbbf24'
    );

    // Random resource drop from defeated enemy
    const dropPool: Array<{ key: 'aetherShards' | 'wood' | 'stone' | 'arcaneEssence' | 'fish' | 'water'; icon: string; name: string; color: string }> = [
      { key: 'aetherShards', icon: '💎', name: 'Shards', color: '#38bdf8' },
      { key: 'wood', icon: '🪵', name: 'Wood', color: '#10b981' },
      { key: 'stone', icon: '🪨', name: 'Stone', color: '#cbd5e1' },
      { key: 'arcaneEssence', icon: '🔮', name: 'Essence', color: '#c084fc' },
      { key: 'fish', icon: '🐟', name: 'Fish', color: '#0ea5e9' },
      { key: 'water', icon: '💧', name: 'Water', color: '#60a5fa' },
    ];
    const pickedDrop = dropPool[Phaser.Math.Between(0, dropPool.length - 1)];
    const waveFactor = Math.max(1, Math.ceil(useGameStore.getState().invasion.waveNumber / 15));
    const dropCount = Phaser.Math.Between(1, 4) * waveFactor;
    useGameStore.getState().addResources({ [pickedDrop.key]: dropCount });
    this.spawnFloatingPopup(
      invader.container.x,
      invader.container.y - 48,
      `+${dropCount} ${pickedDrop.icon} ${pickedDrop.name}`,
      pickedDrop.color
    );

    // Particle explosion
    const isGore = useGameStore.getState().isGoreEnabled;
    const isBiological = INVADER_CONFIGS[invader.type].category === 'HUMAN';
    const effectColor = (isGore && isBiological) ? 0x991b1b : INVADER_CONFIGS[invader.type].color;
    
    this.spawnDeathBurst(invader.container.x, invader.container.y - 10, effectColor, isGore && isBiological);

    // Clean up container
    invader.container.destroy();
    this.invaders = this.invaders.filter((i) => i.id !== invader.id);

    useGameStore.getState().setEnemiesRemaining(this.invaders.length);
  }

  private updateInvaders(deltaSec: number): void {
    const nexusIso = IsometricHelper.gridToScreen(this.nexusGridPos.x, this.nexusGridPos.y);
    const workers = this.workerProvider ? this.workerProvider() : [];
    // Active defenders: only workers that have actively rallied to COMBAT
    // (IDLE/harvesting workers near the nexus would otherwise instantly lock invaders
    //  into melee from frame 1, preventing any visible movement)
    const availableDefenders = workers.filter(
      (w) => w.status === 'COMBAT' && w.hp >= 35 && w.unitClass !== 'AQUA_SLIME' && w.unitClass !== 'MERMAN'
    );

    const currentWeather = useGameStore.getState().weather;

    for (const invader of [...this.invaders]) {
      if (invader.isDead) continue;

      // When castle is crushed (HP = 0) or invader is in retreat mode, they march off the platform with their loot
      if (invader.isRetreating) {
        if (invader.pathIndex < invader.currentPath.length) {
          const targetGrid = invader.currentPath[invader.pathIndex];
          const targetIso = IsometricHelper.gridToScreen(targetGrid.x, targetGrid.y);

          const dx = targetIso.x - invader.container.x;
          const dy = targetIso.y - invader.container.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const step = invader.speed * 1.5 * deltaSec; // Hurry away with 50% loot!

          const safeDist = Math.max(0.001, dist);
          if (dist <= step) {
            invader.container.x = targetIso.x;
            invader.container.y = targetIso.y;
            invader.gridX = targetGrid.x;
            invader.gridY = targetGrid.y;
            invader.pathIndex++;
            invader.container.setDepth(IsometricHelper.getDepth(invader.gridX, invader.gridY, 7));
          } else {
            invader.container.x += (dx / safeDist) * step;
            invader.container.y += (dy / safeDist) * step;
            const curGrid = IsometricHelper.screenToGrid(invader.container.x, invader.container.y);
            invader.container.setDepth(IsometricHelper.getDepth(curGrid.x, curGrid.y, 7));
          }
        } else {
          // Reached edge of platform: despawn cleanly!
          this.spawnFloatingPopup(
            invader.container.x,
            invader.container.y - 20,
            '🏃 Left Platform with Loot! (-50%)',
            '#ef4444'
          );
          invader.isDead = true;
          invader.container.destroy();
          this.invaders = this.invaders.filter((i) => i.id !== invader.id);
          useGameStore.getState().setEnemiesRemaining(this.invaders.length);
        }
        continue;
      }

      // Weather modifiers for invaders
      const invaderCategory = INVADER_CONFIGS[invader.type].category;
      let weatherSpeedMult = 1;
      let weatherDamageMult = 1;
      if (currentWeather === 'RAIN' && invaderCategory === 'MECHA') {
        weatherSpeedMult = 0.85; // Rusted joints: 15% slower
      } else if (currentWeather === 'SNOW' && invaderCategory === 'HUMAN') {
        weatherSpeedMult = 0.85; // Freezing cold: 15% slower
      }
      if (currentWeather === 'HEATWAVE') {
        weatherDamageMult = 1.10; // Agitated: +10% damage
      }

      // 1. Invaders FIGHT DEFENDING GOLEMS FIRST before proceeding to the Castle!
      if (availableDefenders.length > 0) {
        let closestDefender: WorkerInstance | null = null;
        let minDefenderDist = 99999;

        for (const def of availableDefenders) {
          if (!def.container || !def.container.active || !invader.container || !invader.container.active) {
            continue;
          }
          const dist = Math.hypot(
            invader.container.x - def.container.x,
            invader.container.y - def.container.y
          );
          if (dist < minDefenderDist) {
            minDefenderDist = dist;
            closestDefender = def;
          }
        }

        if (closestDefender && closestDefender.container && closestDefender.container.active && invader.container && invader.container.active) {
          const defenderX = closestDefender.container.x;
          const defenderY = closestDefender.container.y;

          const invaderConfig = INVADER_CONFIGS[invader.type];
          if (minDefenderDist > invaderConfig.attackRange) {
            // Invader charges directly at defending golem!
            const safeDist = Math.max(1, minDefenderDist);
            const dx = defenderX - invader.container.x;
            const dy = defenderY - invader.container.y;
            const step = invader.speed * 1.15 * weatherSpeedMult * deltaSec;
            invader.container.x += (dx / safeDist) * step;
            invader.container.y += (dy / safeDist) * step;
            const curGrid = IsometricHelper.screenToGrid(invader.container.x, invader.container.y);
            invader.container.setDepth(IsometricHelper.getDepth(curGrid.x, curGrid.y, 7));
          } else {
            // Invader attacks defending golem!
            invader.attackTimer -= deltaSec;
            if (invader.attackTimer <= 0) {
              invader.attackTimer = 1.1;
              const weatherDmg = Math.round(invader.damage * weatherDamageMult);

              // Calculate armor damage mitigation from equipped armor/relic
              const armorBonusHp = closestDefender.equipment?.armor?.stats.bonusHp || 0;
              const armorMitigationPercent = closestDefender.equipment?.armor?.id === 'ironstone_plating' ? 0.15 : 0;
              const mitigatedDamage = Math.max(1, Math.round(weatherDmg * (1 - armorMitigationPercent)));

              let armorAbsorb = 0;
              if (closestDefender.armorShield > 0) {
                armorAbsorb = Math.min(closestDefender.armorShield, mitigatedDamage);
                closestDefender.armorShield = Math.max(0, closestDefender.armorShield - armorAbsorb);
              }

              const actualDamage = Math.max(1, mitigatedDamage - armorAbsorb);
              closestDefender.hp = Math.max(0, closestDefender.hp - actualDamage);
              this.spawnFloatingPopup(
                defenderX,
                defenderY - 25,
                `-${actualDamage} HP ${armorMitigationPercent > 0 ? '🛡️(-15%)' : ''} ${armorAbsorb > 0 ? '(shielded)' : '💔'}`,
                '#ef4444'
              );

              // Visual projectile / slash from Invader
              if (invaderConfig.attackRange > 60) {
                // Ranged attack visual
                this.spawnDeathBurst(invader.container.x, invader.container.y - 15, invaderConfig.color, true);
                this.spawnDeathBurst(defenderX, defenderY - 15, invaderConfig.color, true);
                soundFx.playLaser();
              } else {
                // Melee slash visual
                soundFx.playHarvest('stone'); // Or sword slice sound
              }
              
              if (useGameStore.getState().isGoreEnabled) {
                // Determine worker "blood" color based on their class
                let bloodColor = 0x991b1b; // default red
                if (closestDefender.unitClass === 'GOLEM' || closestDefender.unitClass === 'CHRONO') bloodColor = 0x38bdf8; // sparks/blue
                else if (closestDefender.unitClass === 'AQUA_SLIME') bloodColor = 0x0ea5e9; // blue liquid
                
                this.spawnDeathBurst(defenderX, defenderY - 15, bloodColor, true);
              }

              // If HP reaches 0, the servant DIES!
              if (closestDefender.hp <= 0) {
                const isTl = useGameStore.getState().language === 'TL';
                this.spawnFloatingPopup(
                  defenderX,
                  defenderY - 35,
                  isTl ? 'Namatay ang Alagad! ☠️' : 'Servant Died! ☠️',
                  '#991b1b'
                );
                
                if (useGameStore.getState().isGoreEnabled) {
                  let bloodColor = 0x991b1b;
                  if (closestDefender.unitClass === 'GOLEM' || closestDefender.unitClass === 'CHRONO') bloodColor = 0x38bdf8;
                  else if (closestDefender.unitClass === 'AQUA_SLIME') bloodColor = 0x0ea5e9;
                  // Extra big burst for death
                  this.spawnDeathBurst(defenderX, defenderY - 15, bloodColor, true);
                  this.spawnDeathBurst(defenderX, defenderY - 15, bloodColor, true);
                }
                
                soundFx.playExplosion();
                useGameStore.getState().removeUnit(closestDefender.id, true);
                closestDefender.status = 'IDLE'; // Prevents further interaction this frame
              } else if (closestDefender.hp < 35 && closestDefender.status !== 'IDLE') {
                // If low HP but not dead, golem disengages
                closestDefender.overrideEmote = '🩹';
                closestDefender.overrideEmoteTimer = 2500;
                const isTl = useGameStore.getState().language === 'TL';
                this.spawnFloatingPopup(
                  defenderX,
                  defenderY - 35,
                  isTl ? 'Malubhang Sugatan! 🛡️' : 'Critically Wounded! 🛡️',
                  '#f59e0b'
                );
                closestDefender.status = 'IDLE';
                closestDefender.stateTimer = 1000;
              }
            }
          }

          // Invader does NOT advance to the Castle while engaging the golem!
          continue;
        }
      }

      // 2. Only if ALL golems are down/resting at Barracks, proceed to Nexus Castle!
      if (invader.pathIndex < invader.currentPath.length) {
        const targetGrid = invader.currentPath[invader.pathIndex];
        const targetIso = IsometricHelper.gridToScreen(targetGrid.x, targetGrid.y);

        const dx = targetIso.x - invader.container.x;
        const dy = targetIso.y - invader.container.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const step = invader.speed * weatherSpeedMult * deltaSec;

        const safeDist = Math.max(0.001, dist);
        if (dist <= step) {
          invader.container.x = targetIso.x;
          invader.container.y = targetIso.y;
          invader.gridX = targetGrid.x;
          invader.gridY = targetGrid.y;
          invader.pathIndex++;
          invader.container.setDepth(IsometricHelper.getDepth(invader.gridX, invader.gridY, 7));
        } else {
          invader.container.x += (dx / safeDist) * step;
          invader.container.y += (dy / safeDist) * step;
          const curGrid = IsometricHelper.screenToGrid(invader.container.x, invader.container.y);
          invader.container.setDepth(IsometricHelper.getDepth(curGrid.x, curGrid.y, 7));
        }
      }

      // Check distance to Nexus Castle
      const distToNexus = Math.sqrt(
        Math.pow(invader.container.x - nexusIso.x, 2) + Math.pow(invader.container.y - nexusIso.y, 2)
      );

      if (distToNexus <= 36) {
        // Attack Nexus Castle!
        invader.attackTimer -= deltaSec;
        if (invader.attackTimer <= 0) {
          invader.attackTimer = 1.4; // Attack every 1.4s
          const isAegisWrath = (useGameStore.getState().activeGodBlessings?.AEGIS_WRATH || 0) > 0;
          const aegisMitigation = isAegisWrath ? 0.5 : 1.0;
          const rawDmg = Math.round(invader.damage * weatherDamageMult);
          const weatherDmg = Math.max(1, Math.round(rawDmg * aegisMitigation));

          useGameStore.getState().damageCastle(weatherDmg);
          this.scene.cameras.main.shake(180, 0.007);

          this.spawnFloatingPopup(
            nexusIso.x + Phaser.Math.Between(-10, 10),
            nexusIso.y - 30,
            `-${weatherDmg} Castle HP ${isAegisWrath ? '🛡️(Aegis -50%)' : ''}`,
            '#ef4444'
          );
          
          if (useGameStore.getState().isGoreEnabled) {
            this.spawnDeathBurst(nexusIso.x, nexusIso.y - 20, 0xf59e0b, false); // sparks
          }

          // Check if this attack crushed the castle!
          if (useGameStore.getState().defense.castleHp <= 0) {
            this.triggerEnemiesRetreatWithLoot();
            break;
          }
        }
      }
    }
  }

  private spawnDeathBurst(x: number, y: number, color: number, isGore: boolean = false): void {
    const particleCount = isGore ? 18 : 9;
    for (let i = 0; i < particleCount; i++) {
      const p = this.scene.add.graphics();
      p.fillStyle(color, 1);
      const size = isGore ? (Math.random() * 3 + 2) : 4;
      p.fillRect(-size / 2, -size / 2, size, size);
      p.setPosition(x, y);
      p.setDepth(9999);

      if (this.parentContainer) {
        this.parentContainer.add(p);
      }

      const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.3;
      const speed = isGore ? (40 + Math.random() * 40) : (25 + Math.random() * 25);
      const destX = x + Math.cos(angle) * speed;
      const destY = y + Math.sin(angle) * speed + (isGore ? 20 : 0); // Gore splatters downwards due to gravity

      this.scene.tweens.add({
        targets: p,
        x: destX,
        y: destY,
        alpha: 0,
        scale: 0.1,
        duration: isGore ? 700 : 500,
        ease: isGore ? 'Cubic.easeOut' : 'Power2.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  private spawnFloatingPopup(x: number, y: number, text: string, color: string = '#f59e0b'): void {
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
      y: y - 28,
      alpha: 0,
      scale: 1.1,
      duration: 1000,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  public triggerEnemiesRetreatWithLoot(): void {
    // Reverse all living invaders to leave the platform towards their spawn edge
    for (const invader of this.invaders) {
      if (invader.isDead) continue;
      invader.isRetreating = true;
      invader.attackTimer = 9999; // Stop attacking

      // Find path from current position back to spawn boundary/edge
      const exitEdge: GridPoint = invader.spawnGrid || { x: 0, y: 0 };
      const curGrid = IsometricHelper.screenToGrid(invader.container.x, invader.container.y);
      const allowedTiles = invader.type === 'DEEP_ONE' ? [0, 1] : [0];
      const returnPath = this.pathfinder.findPath(
        Math.round(curGrid.x),
        Math.round(curGrid.y),
        exitEdge.x,
        exitEdge.y,
        allowedTiles
      );

      invader.currentPath = (returnPath && returnPath.length > 0)
        ? returnPath
        : [{ x: Math.round(curGrid.x), y: Math.round(curGrid.y) }, { x: exitEdge.x, y: exitEdge.y }];
      invader.pathIndex = 0;

      this.spawnFloatingPopup(
        invader.container.x,
        invader.container.y - 30,
        '💰 Looted 50%! Leaving Platform...',
        '#ef4444'
      );
    }
  }

  public wipeAllInvaders(): void {
    for (const invader of this.invaders) {
      if (invader.container.active) {
        invader.container.destroy();
      }
    }
    this.invaders = [];
    this.totalEnemiesToSpawn = 0;
    this.enemiesSpawnedCount = 0;
    this.spawnTimer = 0;
    useGameStore.getState().setEnemiesRemaining(0);
  }

  public destroy(): void {
    for (const invader of this.invaders) {
      invader.container.destroy();
    }
    this.invaders = [];
    this.turretGfx.destroy();
  }
}
