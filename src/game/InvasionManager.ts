import { markShadow } from './graphicsFx';
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
import type { GroundLootManager } from './GroundLootManager';
import { logFloatingText, logMessage, nearestName } from '../state/activityLog';
import type { WorkerInstance } from './WorkerManager';
import { DIFFICULTIES, normalizeDifficulty } from '../state/difficulty';
import { DEFENSE_CONFIG } from '../state/defenseStats';
import { ECONOMY_CONFIG } from '../state/economy';
import { auras, isModActive } from './skills/combatMods';
import { teamBonuses } from '../state/skillTree';
import { createEnemySprite, enemySpriteHeadroom, faceEnemySprite, playEnemyAttack } from './sprites/CharacterSprites';
import { Navigation } from './Navigation';
import type { StructureManager, StructureTarget } from './StructureManager';
import type { PortalManager, PortalState } from './PortalManager';
import { CASTLE_FOOTPRINT, PORTAL_SITES, rectCenter } from '../state/buildingLayout';
import { invaderWeather, type ActiveInvader, type InvaderBlocker, type InvaderTarget } from './invaders/types';
import { renderInvaderBody } from './invaders/legacyInvaderArt';
import type { InvaderContext } from './invaders/context';
import { approachStructure, chase, EMERGE_SECONDS, ENTER_SECONDS, followPath, stepToward, updatePortalTransit } from './invaders/movement';
import { chooseTarget, isTargetValid } from './invaders/targeting';
import { pickWaveInvader } from './invaders/wavePool';

export type { ActiveInvader, InvaderBlocker } from './invaders/types';
export class InvasionManager {
  private scene: Phaser.Scene;
  private pathfinder: PathfindingService;
  private parentContainer?: Phaser.GameObjects.Container;
  private invaders: ActiveInvader[] = [];
  public groundLoot?: GroundLootManager;

  /** Invader name for the activity log in both languages ("BOSS " prefix kept). */
  private logName(invader: ActiveInvader): { en: string; tl: string } {
    const cfg = INVADER_CONFIGS[invader.type];
    if (invader.isScout) return { en: invader.name, tl: 'Palaboy na Espiya' };
    if (!cfg) return { en: invader.name, tl: invader.name };
    const boss = invader.name.startsWith('BOSS ') ? 'BOSS ' : '';
    return { en: invader.name, tl: `${boss}${cfg.name}` };
  }

  public setGroundLoot(loot: GroundLootManager): void {
    this.groundLoot = loot;
  }
  private spawnTimer: number = 0;
  private totalEnemiesToSpawn: number = 0;
  private enemiesSpawnedCount: number = 0;
  private workerProvider?: () => WorkerInstance[];
  private blockerProvider: () => InvaderBlocker[] = () => [];
  private nav?: Navigation;
  private structures?: StructureManager;
  private portals?: PortalManager;
  private autoSmiteTimer: number = 0;
  private lastSmiteTime: number = 0;
  private wasInvasionActive: boolean = false;

  /** Hands the movement / targeting helpers (invaders/) access to this manager. */
  private readonly ctx: InvaderContext = (() => {
    const m = this;
    return {
      get nav() { return m.nav; },
      get structures() { return m.structures; },
      getInvaders: () => m.invaders,
      getBlockers: () => m.blockerProvider(),
      castleCenter: () => m.castleCenter(),
      faceInvader: (invader, dx, dy, moving) => m.faceInvader(invader, dx, dy, moving),
      damageInvader: (invader, rawDamage, popupText) => m.damageInvader(invader, rawDamage, popupText),
      despawnEscaped: (invader) => m.despawnEscaped(invader),
    };
  })();

  constructor(
    scene: Phaser.Scene,
    pathfinder: PathfindingService,
    parentContainer?: Phaser.GameObjects.Container
  ) {
    this.scene = scene;
    this.pathfinder = pathfinder;
    this.parentContainer = parentContainer;
  }

  public setWorkerProvider(provider: () => WorkerInstance[]): void {
    this.workerProvider = provider;
  }

  /** Obstacles, attackable structures, portals and sapling blockers. */
  public setWorld(world: {
    nav: Navigation;
    structures: StructureManager;
    portals: PortalManager;
    blockers: () => InvaderBlocker[];
  }): void {
    this.nav = world.nav;
    this.structures = world.structures;
    this.portals = world.portals;
    this.blockerProvider = world.blockers;
  }

  public getInvaders(): ActiveInvader[] {
    return this.invaders;
  }

  /** World position of the citadel's centre (smite fallback, victory anchor). */
  private castleCenter(): { x: number; y: number } {
    const c = rectCenter(CASTLE_FOOTPRINT);
    return IsometricHelper.gridToScreen(c.x, c.y);
  }

  public update(delta: number): void {
    const deltaSec = delta / 1000;
    const store = useGameStore.getState();

    // Clean up when a wave closes, while allowing peacetime scouts to survive.
    if (!store.invasion.isActive && this.wasInvasionActive) {
      this.wipeAllInvaders();
      this.portals?.close();
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

    // AEGIS_WRATH God Blessing: Continuous celestial lightning smiting invaders
    if (store.defense.castleHp > 0) {
      const isAegisWrath = (store.activeGodBlessings?.AEGIS_WRATH || 0) > 0;
      if (isAegisWrath && this.invaders.some((i) => !i.isDead)) {
        this.autoSmiteTimer -= delta;
        if (this.autoSmiteTimer <= 0) {
          this.autoSmiteTimer = 850; // Lightning strike every 850ms
          this.smiteClosestInvader(undefined, undefined, true);
        }
      }
    }

    // Battle items fired from the Armory
    for (const effect of store.takeBattleEffects()) this.playBattleEffect(effect);

    // 3. Update living invaders movement and attacks
    this.updateInvaders(deltaSec);
  }

  private handleActiveIncursion(delta: number, _deltaSec: number): void {
    const store = useGameStore.getState();

    // Initialize wave spawning: tear the portals open
    if (this.totalEnemiesToSpawn === 0 && store.invasion.totalEnemiesInWave > 0) {
      this.totalEnemiesToSpawn = store.invasion.totalEnemiesInWave;
      this.enemiesSpawnedCount = 0;
      this.spawnTimer = 900;
      const enemyMultiplier = DIFFICULTIES[normalizeDifficulty(store.difficulty)].enemyMultiplier;
      this.portals?.open(store.invasion.waveNumber, enemyMultiplier);
    }

    // Every portal smashed: the rest of the wave never arrives
    if (this.portals?.allSealed() && this.enemiesSpawnedCount < this.totalEnemiesToSpawn) {
      this.totalEnemiesToSpawn = this.enemiesSpawnedCount;
      useGameStore.getState().setEnemiesRemaining(this.invaders.filter((i) => !i.isDead).length);
    }

    // Spawn staggered enemies
    if (this.enemiesSpawnedCount < this.totalEnemiesToSpawn) {
      this.spawnTimer -= delta;
      if (this.spawnTimer <= 0 && useGameStore.getState().invasion.isActive) {
        this.spawnTimer = 1800 + Math.random() * 800; // Spawn every ~2 seconds
        if (this.spawnSingleInvader(store.invasion.waveNumber)) this.enemiesSpawnedCount++;
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

      const nexusScreen = this.castleCenter();
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

  /** Lava Bomb: heavy damage to every invader. Death Curse: everyone withers (burn). */
  private playBattleEffect(effect: import('../types/state').BattleEffect): void {
      soundFx.playExplosion();
      this.scene.cameras.main.flash(180, 255, 255, 255, true);
    }

  /** The High Priest mends nearby soldiers every few seconds. */
  private priestHeal(priest: ActiveInvader, deltaSec: number): void {
    priest.healTimer = (priest.healTimer ?? 3) - deltaSec;
    if (priest.healTimer > 0) return;
    priest.healTimer = 3;
    for (const ally of this.invaders) {
      if (ally.isDead || ally === priest || ally.hp >= ally.maxHp) continue;
      if (Math.hypot(ally.container.x - priest.container.x, ally.container.y - priest.container.y) > 130) continue;
      ally.hp = Math.min(ally.maxHp, ally.hp + 14);
      this.renderHpBar(ally.hpBarGfx, ally.hp, ally.maxHp);
      this.spawnFloatingPopup(ally.container.x, ally.container.y - 30, '+14 ✝️', '#fde68a');
    }
  }

  public spawnLootScouts(): void {
    // Spawns 1 to 3 non-threatening wandering scouts
    const numScouts = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < numScouts; i++) {
      this.spawnSingleScout();
    }
  }

  /** Portal exit tiles, used as spawn/leave points when no PortalManager is attached (tests). */
  private static readonly EXITS: GridPoint[] = PORTAL_SITES.map((p) => p.exit);

  private spawnSingleScout(): void {
    const fromPortal = this.portals?.pickAny();
    const spawnGrid = fromPortal
      ? fromPortal.site.exit
      : InvasionManager.EXITS[Math.floor(Math.random() * InvasionManager.EXITS.length)];

    const type: InvaderType = 'HUMAN_ARCHER'; // re-use archer sprite for now, but weak stats

    // Weak raiders: they march on the citadel, but towers and establishments cut them down
    const finalMaxHp = 25;
    const finalDamage = 4;
    const finalBounty = 0; // custom drop is handled in strike function
    const startIso = IsometricHelper.gridToScreen(spawnGrid.x, spawnGrid.y);

    const container = this.scene.add.container(startIso.x, startIso.y);
    container.setSize(24, 24);

    const shadow = markShadow(this.scene.add.ellipse(0, 4, 14, 7, 0x000000, 0.45));
    const bodyGfx = this.scene.add.graphics();
    const hpBarGfx = this.scene.add.graphics(); // Hidden hp bar for scouts

    const sprite = this.attachInvaderBody(container, shadow, bodyGfx, hpBarGfx, type);
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
      sprite,
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
      isRetreating: false,
      spawnGrid: { x: spawnGrid.x, y: spawnGrid.y },
      baseScale: 1,
      portal: fromPortal,
      retargetTimer: 0,
    };

    // Interactive Clicking: Smite for Loot
    container.setInteractive({ useHandCursor: true });
    container.on('pointerdown', (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      if (pointer.leftButtonDown() && !invader.isDead) {
        event.stopPropagation();
        this.tapInvader(invader);
      }
    });

    if (fromPortal) this.beginEmerge(invader, fromPortal);
    this.invaders.push(invader);
  }

  /** Returns false when no portal is left to spawn from. */
  private spawnSingleInvader(waveNumber: number): boolean {
    if (!useGameStore.getState().invasion.isActive) return false;

    let portal: PortalState | null = null;
    if (this.portals) {
      portal = this.portals.pickSpawn();
      if (!portal) return false;
    }
    const spawnGrid = portal
      ? portal.site.exit
      : InvasionManager.EXITS[Math.floor(Math.random() * InvasionManager.EXITS.length)];

    // Boss waves every 5 waves, and massive Phase Climax Bosses at 25, 50, 75, 100
    const isPhaseClimaxBoss = waveNumber === 25 || waveNumber === 50 || waveNumber === 75 || waveNumber === 100;
    const isBossWave = (waveNumber % 5 === 0) || isPhaseClimaxBoss;
    const isLastEnemyOfWave = this.enemiesSpawnedCount === this.totalEnemiesToSpawn - 1;

    // The alliance's rulers lead the boss waves; everyone else is drawn from the unlocked pool
    const type: InvaderType = (isPhaseClimaxBoss || isBossWave) && isLastEnemyOfWave
      ? (Math.floor(waveNumber / 5) % 2 === 1 ? 'HIGH_PRIEST' : 'MECHA_VALKYRIE')
      : pickWaveInvader(waveNumber);

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
    // A random few ignore everything else and charge the citadel
    const rush = DEFENSE_CONFIG?.rushers;
    const isRusher = !!rush && !isBoss && waveNumber >= rush.fromWave && Math.random() < rush.chance;
    const startIso = IsometricHelper.gridToScreen(spawnGrid.x, spawnGrid.y);

    const container = this.scene.add.container(startIso.x, startIso.y);
    container.setSize(32, 32);

    const shadow = markShadow(this.scene.add.ellipse(0, 4, 18, 9, 0x000000, 0.45));
    const bodyGfx = this.scene.add.graphics();
    const hpBarGfx = this.scene.add.graphics();

    const sprite = this.attachInvaderBody(container, shadow, bodyGfx, hpBarGfx, type);
    this.renderHpBar(hpBarGfx, finalMaxHp, finalMaxHp);
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
      name: isBoss ? `BOSS ${cfg.nameEn ?? cfg.name}` : (cfg.nameEn ?? cfg.name),
      container,
      shadow,
      bodyGfx,
      sprite,
      hpBarGfx,
      gridX: spawnGrid.x,
      gridY: spawnGrid.y,
      currentPath: [],
      pathIndex: 0,
      hp: finalMaxHp,
      maxHp: finalMaxHp,
      speed: isRusher ? cfg.speed * rush.speedMultiplier : cfg.speed,
      damage: finalDamage,
      bountyCoins: finalBounty,
      attackTimer: 0,
      isDead: false,
      isRetreating: false,
      spawnGrid: { x: spawnGrid.x, y: spawnGrid.y },
      baseScale: isBoss ? 1.5 : 1,
      portal: portal ?? undefined,
      retargetTimer: 0,
      isRusher,
    };

    // Interactive Clicking: Demon Lord Lightning Smite! ⚡
    container.setInteractive({ useHandCursor: true });
    container.on('pointerdown', (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      if (pointer.leftButtonDown() && !invader.isDead) {
        event.stopPropagation();
        this.tapInvader(invader);
      }
    });

    if (portal) this.beginEmerge(invader, portal);
    this.invaders.push(invader);
    soundFx.playCastleHit();
    if (isBoss) logMessage('bossArrives', { name: this.logName(invader) });
    if (isRusher) logMessage('rusherCharges', { name: this.logName(invader) });
    return true;
  }

  /** Starts an invader small and faded at the portal's heart; it grows as it steps onto the exit tile. */
  private beginEmerge(invader: ActiveInvader, portal: PortalState): void {
    invader.emerge = EMERGE_SECONDS;
    invader.container.setPosition(portal.x, portal.y);
    invader.container.setScale(invader.baseScale * 0.3);
    invader.container.setAlpha(0);
    this.portals?.playSpawn(portal);
  }

  /**
   * Adds the invader's visuals to its container: the 8-direction pixel sprite
   * when its sheet is baked, otherwise the legacy vector drawing.
   */
  private attachInvaderBody(
    container: Phaser.GameObjects.Container,
    shadow: Phaser.GameObjects.Ellipse,
    bodyGfx: Phaser.GameObjects.Graphics,
    hpBarGfx: Phaser.GameObjects.Graphics,
    type: InvaderType
  ): Phaser.GameObjects.Sprite | undefined {
    const sprite = createEnemySprite(this.scene, type);
    if (!sprite) {
      this.renderInvaderBody(bodyGfx, type);
      container.add([shadow, bodyGfx, hpBarGfx]);
      return undefined;
    }
    container.add([shadow, bodyGfx, sprite, hpBarGfx]);
    // renderHpBar draws at y = -26; lift it just above the sprite's head
    const headroom = enemySpriteHeadroom(type) ?? 26;
    hpBarGfx.setY(26 - headroom - 4);
    return sprite;
  }

  /** Points the invader's sprite along a screen-space vector (walk cycle while moving). */
  private faceInvader(invader: ActiveInvader, dx: number, dy: number, moving: boolean): void {
    if (invader.sprite) faceEnemySprite(invader.sprite, dx, dy, moving);
  }

  /** Legacy vector body, drawn until the enemy's pixel sprite sheet has baked. */
  private renderInvaderBody(graphics: Phaser.GameObjects.Graphics, type: InvaderType): void {
    renderInvaderBody(graphics, type);
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

    // If no invader near specific coordinate or general tap, target the most threatening (closest to the citadel)
    if (!closest) {
      const nexusIso = this.castleCenter();
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

    // [Camera shake removed]
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
    if (invader.sprite) {
      const sprite = invader.sprite;
      sprite.setTintFill(0xffffff);
      this.scene.time.delayedCall(90, () => sprite.active && sprite.clearTint());
    }
    this.scene.tweens.add({
      targets: invader.sprite ?? invader.bodyGfx,
      alpha: 0.2,
      yoyo: true,
      duration: 60,
      repeat: 2,
    });
  }

  /**
   * Deals damage to an invader. `quiet` skips the hit burst (for rapid ticks
   * like flamethrower and burn damage).
   */
  public damageInvader(invader: ActiveInvader, rawDamage: number, popupText?: string, quiet: boolean = false): void {
    if (invader.isDead) return;
    if ((invader.invulnTimer ?? 0) > 0) {
      if (popupText) this.spawnFloatingPopup(invader.container.x, invader.container.y - 24, '🛡️ Immune', '#fde68a');
      return;
    }
    const damage = this.modifiedDamage(invader, rawDamage);

    invader.hp -= damage;
    this.renderHpBar(invader.hpBarGfx, invader.hp, invader.maxHp);
    if (invader.sprite) {
      const sprite = invader.sprite;
      sprite.setTintFill(0xffffff);
      this.scene.time.delayedCall(80, () => {
        if (sprite.active) sprite.clearTint();
      });
    }

    if (popupText) {
      this.spawnFloatingPopup(
        invader.container.x,
        invader.container.y - 24,
        popupText,
        '#f43f5e'
      );
    }

    if (!quiet && invader.container && invader.container.active) {
      const isGore = useGameStore.getState().isGoreEnabled;
      const isBio = INVADER_CONFIGS[invader.type].category === 'HUMAN';
      const hitColor = (isGore && isBio) ? 0x991b1b : 0x38bdf8;
      this.spawnDeathBurst(invader.container.x, invader.container.y - 8, hitColor, isGore && isBio);
    }

    if (invader.hp <= 0) {
      this.eliminateInvader(invader);
    }
  }

  /** Armor shred (+30%) and the High Priest's Divine Aura (-20% for nearby humans). */
  private modifiedDamage(invader: ActiveInvader, damage: number): number {
    let mult = (invader.vulnTimer ?? 0) > 0 ? 1.3 : 1;
    if (INVADER_CONFIGS[invader.type].category === 'HUMAN') {
      const blessed = this.invaders.some((p) => p.type === 'HIGH_PRIEST' && !p.isDead &&
        Math.hypot(p.container.x - invader.container.x, p.container.y - invader.container.y) <= 130);
      if (blessed) mult *= 0.8;
    }
    return Math.max(1, Math.round(damage * mult));
  }

  /** Called whenever an invader dies (Necromancer reanimation, Corpse Explosion). */
  public onInvaderKilled?: (invader: ActiveInvader) => void;

  /** Pushes an invader `distance` px away from a point, staying off solid tiles. */
  public knockback(invader: ActiveInvader, fromX: number, fromY: number, distance: number): void {
    if (invader.isDead || !invader.container.active) return;
    const dx = invader.container.x - fromX;
    const dy = invader.container.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    const nx = invader.container.x + (dx / len) * distance;
    const ny = invader.container.y + (dy / len) * distance;
    const pos = this.nav ? this.nav.pushOut(nx, ny, 0.2) : { x: nx, y: ny };
    this.scene.tweens.add({ targets: invader.container, x: pos.x, y: pos.y, duration: 260, ease: 'Quad.easeOut' });
    invader.structPath = undefined;
    invader.retargetTimer = 0;
  }

  /** Invader skill hit on a minion (goes through armor, shields and death handling). */
  public strikeWorker(invader: ActiveInvader, worker: WorkerInstance, damage: number): void {
    if (worker.hp <= 0 || !worker.container?.active) return;
    this.hitWorker(invader, worker, damage);
  }

  /** Target Lock: structures marked by a Mecha Scout take 20% more damage until this scene time. */
  private markedStructures = new Map<string, number>();
  public markStructure(id: string, seconds: number): void {
    this.markedStructures.set(id, this.scene.time.now + seconds * 1000);
  }

  /** Cyber Command: mecha attack 25% faster while a Mecha Valkyrie lives. */
  private attackRate(invader: ActiveInvader): number {
    return auras.cyberCommand && INVADER_CONFIGS[invader.type].category === 'MECHA' ? 0.8 : 1;
  }

  /** Ice storms slow invaders (the strongest active slow wins). */
  public applySlow(invader: ActiveInvader, factor: number, seconds: number): void {
    if (invader.isDead) return;
    if ((invader.slowTimer ?? 0) <= 0 || factor < (invader.slowFactor ?? 1)) invader.slowFactor = factor;
    invader.slowTimer = Math.max(invader.slowTimer ?? 0, seconds);
    if (invader.sprite?.active) invader.sprite.setTint(0xa5f3fc);
  }

  /** Hellfire sets invaders burning (refreshes, keeps the hotter burn). */
  public applyBurn(invader: ActiveInvader, dps: number, seconds: number): void {
    if (invader.isDead) return;
    invader.burnDps = Math.max(invader.burnDps ?? 0, dps);
    invader.burnTimer = Math.max(invader.burnTimer ?? 0, seconds);
    invader.burnTick = invader.burnTick ?? 0;
  }

  /** Mecha leave scrap metal; souls are harvested while a Necromancer or the Crypt of Souls stands. */
  private advancedDrops(invader: ActiveInvader): void {
    const store = useGameStore.getState();
    const drops: Array<[string, number, string]> = [];
    if (INVADER_CONFIGS[invader.type].category === 'MECHA') drops.push(['scrapMetal', Phaser.Math.Between(1, 3), '⚙️']);
    const reaper = store.roster.some((u) => u.unitClass === 'NECROMANCER') || (store.resourceBuildings.CRYPT?.level ?? 0) >= 1;
    if (reaper) drops.push(['soulFragments', 1, '💀']);
    if (drops.length === 0) return;
    store.addResources(Object.fromEntries(drops.map(([key, amount]) => [key, amount])));
    this.spawnFloatingPopup(invader.container.x, invader.container.y - 62, drops.map(([, n, icon]) => `+${n} ${icon}`).join(' '), '#cbd5e1');
  }

  private tickStatus(invader: ActiveInvader, deltaSec: number): void {
    if ((invader.slowTimer ?? 0) > 0) {
      invader.slowTimer = (invader.slowTimer ?? 0) - deltaSec;
      if ((invader.slowTimer ?? 0) <= 0) {
        invader.slowFactor = 1;
        if (invader.sprite?.active && !((invader.provokedTimer ?? 0) > 0)) invader.sprite.clearTint();
      }
    }
    if ((invader.burnTimer ?? 0) > 0) {
      invader.burnTimer = (invader.burnTimer ?? 0) - deltaSec;
      invader.burnTick = (invader.burnTick ?? 0) + deltaSec;
      while ((invader.burnTick ?? 0) >= 0.5 && !invader.isDead) {
        invader.burnTick = (invader.burnTick ?? 0) - 0.5;
        this.emberPuff(invader);
        this.damageInvader(invader, Math.max(1, Math.round((invader.burnDps ?? 0) * 0.5)), undefined, true);
      }
      if ((invader.burnTimer ?? 0) <= 0) invader.burnDps = 0;
    }
  }

  private emberPuff(invader: ActiveInvader): void {
    if (!invader.container.active) return;
    const ember = this.scene.add.circle(invader.container.x + Phaser.Math.Between(-6, 6), invader.container.y - 14, 3, 0xf97316, 0.9);
    ember.setDepth(9990);
    this.parentContainer?.add(ember);
    this.scene.tweens.add({ targets: ember, y: ember.y - 18, alpha: 0, scale: 0.3, duration: 500, onComplete: () => ember.destroy() });
  }

  private eliminateInvader(invader: ActiveInvader): void {
    if (invader.isDead) return;
    if (!invader.isScout) this.onInvaderKilled?.(invader);
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
    if (invader.name.startsWith('BOSS')) soundFx.playExplosion();
    else soundFx.playEnemyDeath();
    logMessage(invader.name.startsWith('BOSS') ? 'bossSlain' : 'invaderSlain', { name: this.logName(invader) }, { mergeKey: `kill:${invader.name}` });

    // Reward bounty (Plunder Tax skill)
    const bounty = Math.round(invader.bountyCoins * teamBonuses(useGameStore.getState()).bounty);
    useGameStore.getState().addResources({ coins: bounty });
    useGameStore.setState((state) => ({
      invasion: {
        ...state.invasion,
        invaderKills: state.invasion.invaderKills + 1,
      },
    }));
    this.spawnFloatingPopup(
      invader.container.x,
      invader.container.y - 28,
      `+${bounty} 🪙`,
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
    this.advancedDrops(invader);
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
    const workers = this.workerProvider ? this.workerProvider() : [];
    // Active defenders: only workers that have actively rallied to COMBAT
    const availableDefenders = workers.filter(
      (w) => w.status === 'COMBAT' && w.hp >= 35 && w.unitClass !== 'AQUA_SLIME' && w.unitClass !== 'MERMAN'
    );
    const currentWeather = useGameStore.getState().weather;

    for (const invader of [...this.invaders]) {
      if (invader.isDead) continue;
      if (updatePortalTransit(this.ctx, invader, deltaSec)) continue;

      this.tickStatus(invader, deltaSec);
      if (invader.isDead) continue;
      if (invader.type === 'HIGH_PRIEST') this.priestHeal(invader, deltaSec);
      for (const key of ['frozenTimer', 'vulnTimer', 'invulnTimer', 'charmTimer', 'tauntTimer'] as const) {
        if ((invader[key] ?? 0) > 0) invader[key] = Math.max(0, (invader[key] ?? 0) - deltaSec);
      }
      if ((invader.frozenTimer ?? 0) > 0) continue; // Frozen or rooted solid: no moving, no attacking
      const slow = (invader.slowTimer ?? 0) > 0 ? invader.slowFactor ?? 1 : 1;

      // When castle is crushed (HP = 0) or invader is in retreat mode, they march off the platform with their loot
      if (invader.isRetreating) {
        const done = followPath(this.ctx, invader, invader.speed * (invader.isScout ? 1 : 1.5) * slow * deltaSec);
        if (done) this.leavePlatform(invader);
        continue;
      }

      const weather = invaderWeather(currentWeather, INVADER_CONFIGS[invader.type].category);
      const speed = invader.speed * weather.speed * slow;

      // Pick (or re-pick) a target a few times per second
      invader.retargetTimer = (invader.retargetTimer ?? 0) - deltaSec;
      const provoked = (invader.provokedTimer ?? 0) > 0 || !!invader.isRusher;
      const lockedOnCastle = invader.target?.kind === 'structure' && invader.target.structure.id === 'CASTLE';
      if (invader.retargetTimer <= 0 || !isTargetValid(this.ctx, invader.target) || (provoked && !lockedOnCastle)) {
        invader.retargetTimer = 0.45 + Math.random() * 0.2;
        invader.target = chooseTarget(this.ctx, invader, availableDefenders);
      }
      const target = invader.target;
      if (!target) continue;

      if (target.kind !== 'structure') {
        this.fightUnit(invader, target, speed, weather.damage, deltaSec);
      } else if (this.batterStructure(invader, target.structure, speed, weather.damage, deltaSec)) {
        // The citadel fell: every invader grabs loot and retreats
        this.triggerEnemiesRetreatWithLoot();
        break;
      }
    }
  }

  /** Chase a defender or sapling into range, then strike it every 1.1s. */
  private fightUnit(
    invader: ActiveInvader,
    target: Exclude<InvaderTarget, { kind: 'structure' }>,
    speed: number,
    damageMult: number,
    deltaSec: number
  ): void {
    const tc = target.kind === 'worker' ? target.worker.container : target.blocker.container;
    const dist = Math.hypot(tc.x - invader.container.x, tc.y - invader.container.y);
    if (dist > INVADER_CONFIGS[invader.type].attackRange) {
      chase(this.ctx, invader, tc.x, tc.y, speed * 1.15 * deltaSec, deltaSec);
      return;
    }
    this.faceInvader(invader, tc.x - invader.container.x, tc.y - invader.container.y, false);
    invader.attackTimer -= deltaSec;
    if (invader.attackTimer > 0) return;
    invader.attackTimer = 1.1 * this.attackRate(invader);
    if (invader.sprite) playEnemyAttack(invader.sprite);
    const damage = Math.round(invader.damage * damageMult);
    if (target.kind === 'blocker') {
      target.blocker.takeHit(damage);
      this.attackVisual(invader, tc.x, tc.y);
    } else {
      this.hitWorker(invader, target.worker, damage);
    }
  }

  /**
   * Walk to a tile touching the structure's footprint, then batter it every
   * 1.4s. Returns true when the citadel has been crushed.
   */
  private batterStructure(
    invader: ActiveInvader,
    structure: StructureTarget,
    speed: number,
    damageMult: number,
    deltaSec: number
  ): boolean {
    const { attackRange } = INVADER_CONFIGS[invader.type];
    const reachTiles = attackRange > 60 ? attackRange / 45 : 0.8;
    const distTiles = this.nav
      ? this.nav.distanceToRect(invader.container.x, invader.container.y, structure.rect)
      : Math.hypot(structure.x - invader.container.x, structure.y - invader.container.y) / 36 - 1;
    if (distTiles > reachTiles) {
      approachStructure(this.ctx, invader, structure, speed * deltaSec, deltaSec);
      return false;
    }

    this.faceInvader(invader, structure.x - invader.container.x, structure.y - 20 - invader.container.y, false);
    invader.attackTimer -= deltaSec;
    if (invader.attackTimer > 0) return false;
    invader.attackTimer = 1.4 * this.attackRate(invader);
    if (invader.sprite) playEnemyAttack(invader.sprite);
    let damage = Math.round(invader.damage * damageMult);
    if (structure.id === 'CASTLE') {
      // Wrath of Aegis halves damage to the citadel
      const isAegisWrath = (useGameStore.getState().activeGodBlessings?.AEGIS_WRATH || 0) > 0;
      damage = Math.max(1, Math.round(damage * (isAegisWrath ? 0.5 : 1)));
    }
    if (structure.id !== 'CASTLE' && isModActive('fortress')) damage = Math.max(1, Math.round(damage * 0.5));
    if ((this.markedStructures.get(structure.id) ?? 0) > this.scene.time.now) damage = Math.round(damage * 1.2);
    this.attackVisual(invader, structure.x, structure.y - 24, true);
    if (this.structures) this.structures.damage(structure, damage);
    else useGameStore.getState().damageCastle(damage);
    return useGameStore.getState().defense.castleHp <= 0;
  }

  /** Human blades clang; mecha weapons slam. */
  private meleeSound(invader: ActiveInvader): void {
    if (INVADER_CONFIGS[invader.type].category === 'MECHA') soundFx.playWallBang();
    else soundFx.playSwordClang();
  }

  private attackVisual(invader: ActiveInvader, tx: number, ty: number, onStructure = false): void {
    const invaderConfig = INVADER_CONFIGS[invader.type];
    if (invaderConfig.attackRange > 60) {
      // Ranged attack visual: a quick bolt from the invader to the target
      const bolt = this.scene.add.graphics();
      bolt.setDepth(9990);
      this.parentContainer?.add(bolt);
      bolt.lineStyle(2, invaderConfig.color, 0.9);
      bolt.lineBetween(invader.container.x, invader.container.y - 16, tx, ty);
      this.scene.tweens.add({ targets: bolt, alpha: 0, duration: 180, onComplete: () => bolt.destroy() });
      this.spawnDeathBurst(tx, ty, invaderConfig.color, true);
      soundFx.playLaser();
    } else {
      // Melee slash visual
      this.spawnDeathBurst(tx, ty, 0xf59e0b, false);
      if (onStructure) soundFx.playWallBang();
      else this.meleeSound(invader);
    }
  }

  /** Invader strike on a defending minion (armor, shields, gore, death / retreat). */
  private hitWorker(invader: ActiveInvader, closestDefender: WorkerInstance, baseDmg: number): void {
    const invaderConfig = INVADER_CONFIGS[invader.type];
    // Seismic Taunt halves damage; Target Lock adds 20%
    const weatherDmg = Math.round(baseDmg *
      ((closestDefender.armorBuffTimer ?? 0) > 0 ? 0.5 : 1) *
      ((closestDefender.markedTimer ?? 0) > 0 ? 1.2 : 1));
    const defenderX = closestDefender.container.x;
    const defenderY = closestDefender.container.y;

    // Calculate armor damage mitigation from equipped armor/relic
    const armorMitigationPercent = closestDefender.equipment?.armor?.id === 'ironstone_plating' ? 0.15 : 0;
    // Hardened Hides skill + regression tiers
    const teamMitigation = teamBonuses(useGameStore.getState()).minionDamageTaken;
    const mitigatedDamage = Math.max(1, Math.round(weatherDmg * (1 - armorMitigationPercent) * teamMitigation));

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
      this.spawnDeathBurst(invader.container.x, invader.container.y - 15, invaderConfig.color, true);
      this.spawnDeathBurst(defenderX, defenderY - 15, invaderConfig.color, true);
      soundFx.playLaser();
    } else {
      this.meleeSound(invader);
    }

    const bloodColor = closestDefender.unitClass === 'GOLEM' || closestDefender.unitClass === 'SUCCUBUS'
      ? 0x38bdf8
      : closestDefender.unitClass === 'AQUA_SLIME' ? 0x0ea5e9 : 0x991b1b;
    if (useGameStore.getState().isGoreEnabled) this.spawnDeathBurst(defenderX, defenderY - 15, bloodColor, true);

    // If HP reaches 0, the servant DIES!
    if (closestDefender.hp <= 0) {
      const isTl = useGameStore.getState().language === 'TL';
      this.spawnFloatingPopup(defenderX, defenderY - 35, isTl ? 'Namatay ang Alagad! ☠️' : 'Servant Died! ☠️', '#991b1b');
      if (useGameStore.getState().isGoreEnabled) {
        this.spawnDeathBurst(defenderX, defenderY - 15, bloodColor, true);
        this.spawnDeathBurst(defenderX, defenderY - 15, bloodColor, true);
      }
      soundFx.playExplosion();
      useGameStore.getState().removeUnit(closestDefender.id, true);
      closestDefender.status = 'IDLE'; // Prevents further interaction this frame
    } else if (closestDefender.hp < 35 && closestDefender.status !== 'IDLE') {
      // If low HP but not dead, the minion disengages
      closestDefender.overrideEmote = '🩹';
      closestDefender.overrideEmoteTimer = 2500;
      const isTl = useGameStore.getState().language === 'TL';
      this.spawnFloatingPopup(defenderX, defenderY - 35, isTl ? 'Malubhang Sugatan! 🛡️' : 'Critically Wounded! 🛡️', '#f59e0b');
      closestDefender.status = 'IDLE';
      closestDefender.stateTimer = 1000;
    }
  }

  /** Reached the exit tile: dive into the portal (or simply vanish when there is none). */
  private leavePlatform(invader: ActiveInvader): void {
    if (invader.exitPortal && invader.exitPortal.mode !== 'destroyed') {
      invader.enter = ENTER_SECONDS;
      this.portals?.playAbsorb(invader.exitPortal);
      return;
    }
    this.despawnEscaped(invader);
  }

  private despawnEscaped(invader: ActiveInvader): void {
    if (!invader.isScout) {
      this.spawnFloatingPopup(
        invader.container.x,
        invader.container.y - 20,
        '🏃 Left Platform with Loot! (-50%)',
        '#ef4444'
      );
    }
    invader.isDead = true;
    invader.container.destroy();
    this.invaders = this.invaders.filter((i) => i.id !== invader.id);
    useGameStore.getState().setEnemiesRemaining(this.invaders.length);
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

  /**
   * Former floating text above units — now narrated in the activity log tray.
   * The nearest minion or invader to the popup's anchor names the entry.
   */
  private spawnFloatingPopup(x: number, y: number, text: string, color: string = '#f59e0b'): void {
    const workers = this.workerProvider ? this.workerProvider() : [];
    logFloatingText(text, color, nearestName([...workers, ...this.invaders], x, y));
  }

  public triggerEnemiesRetreatWithLoot(): void {
    // Every living invader runs back to a rift with its loot
    for (const invader of this.invaders) {
      if (invader.isDead || invader.isRetreating) continue;
      invader.isRetreating = true;
      invader.attackTimer = 9999; // Stop attacking
      invader.emerge = 0;

      const curGrid = Navigation.tileOf(invader.container.x, invader.container.y);
      const portal = invader.portal && invader.portal.mode !== 'destroyed'
        ? invader.portal
        : this.portals?.nearest(invader.container.x, invader.container.y) ?? undefined;
      invader.exitPortal = portal;
      const exitEdge: GridPoint = portal ? portal.site.exit : invader.spawnGrid || { x: 1, y: 1 };
      const allowedTiles = INVADER_CONFIGS[invader.type].flying ? [0, 1] : [0];
      const returnPath = this.pathfinder.findPath(curGrid.x, curGrid.y, exitEdge.x, exitEdge.y, allowedTiles);

      invader.currentPath = (returnPath && returnPath.length > 0)
        ? returnPath
        : [{ x: curGrid.x, y: curGrid.y }, { x: exitEdge.x, y: exitEdge.y }];
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
  }
}
