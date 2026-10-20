import { markShadow } from './graphicsFx';
import Phaser from 'phaser';
import { hitReaction } from './hitReaction';
import { initBattleFx, projectileFor, queueBattleFxSheets, shootProjectile, spawnSmoke } from './battleFx';
import {
  GridPoint,
  InvaderType,
  INVADER_CONFIGS,
} from '../types/game';

/** Seconds scout spoils wait on the ground for a General (they roam farther than tenants). */
const SCOUT_SPOILS_LIFE = 120;
import { IsometricHelper } from './IsometricHelper';
import { PathfindingService } from './PathfindingService';
import { useGameStore } from '../state/useGameStore';
import { devFlag } from '../state/devMode';
import { soundFx } from './audio/soundFx';
import type { GroundLootManager } from './GroundLootManager';
import { logFloatingText, logMessage, nearestName } from '../state/activityLog';
import type { WorkerInstance } from './WorkerManager';
import { normalizeDifficulty } from '../state/difficulty';
import { DEFENSE_CONFIG } from '../state/defenseStats';
import { ECONOMY_CONFIG } from '../state/economy';
import { auras, isModActive } from './skills/combatMods';
import { teamBonuses } from '../state/skillTree';
import { UNIT_CLASSES } from '../types/game';
import { RUNES, bossRuneTier, rollRuneKind, tierColor, tierName } from '../state/runes';
import { BRAWL_CONFIG, MIRROR_TINT, brawlLevelOf, generalStatsOf, mirrorChance } from '../state/brawl';
import type { UnitRosterItem } from '../types/state';
import { createEnemySprite, enemySpriteHeadroom, faceEnemySprite, playEnemyAttack } from './sprites/CharacterSprites';
import { applyLocomotion, locomotionOf } from './locomotion';
import { Navigation, TILES_FOR } from './Navigation';
import { invaderMoveMode } from './terrain';
import { TECHNICIANS, chooseHackTarget, escortType, escortsFor, hackSeconds, hackersForWave } from './invaders/hacking';
import { clearHacks, hackedIds, setHacked } from './hackState';
import { LAUNCHERS, aimSeconds, chooseRocketTarget, launcherEscortType, launcherEscortsFor, launchersForWave, reloadSeconds } from './invaders/rocketLauncher';
import { COMMANDER_FROM_WAVE, SQUADS, pickByShare, rollSquads, squadBias, type SquadId } from './invaders/riftSquads';
import type { TowerId } from '../types/state';
import type { StructureManager, StructureTarget } from './StructureManager';
import type { PortalManager, PortalState } from './PortalManager';
import { CASTLE_FOOTPRINT, GRID_SIZE, PORTAL_SITES, rectCenter } from '../state/buildingLayout';
import { invaderWeather, type ActiveInvader, type InvaderBlocker, type InvaderTarget } from './invaders/types';
import { renderInvaderBody } from './invaders/legacyInvaderArt';
import type { InvaderContext } from './invaders/context';
import { approachStructure, chase, EMERGE_SECONDS, ENTER_SECONDS, followPath, stepToward, updatePortalTransit } from './invaders/movement';
import { chooseTarget, isTargetValid } from './invaders/targeting';
import { pickWaveInvader, pickWaveInvaderOfCategory } from './invaders/wavePool';
import type { Resources } from '../types/state';
import { pickScout, rollScoutDrops } from '../state/scoutLoot';
import { buildWavePlan, type PlannedSpawn } from './invaders/wavePlan';
import { WAVE_BALANCE, aircraftCount, aircraftDropCount, invaderStats, portalHpMultiplier, realmIntensity, skillPower, spawnIntervalMs, victoryBounty as waveVictoryBounty, type InvaderRank } from '../state/waveBalance';
import { TACTIC_EFFECTS, tacticOf, type WaveTactic } from '../state/waveTactics';
import { SCOUT_DEFENCE_CAP, SCOUT_ROLES, pickScoutRole, rollStolen, scoutCount, scoutScaling, scoutWave } from '../state/scoutRaid';

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
    if (invader.isScout) return { en: invader.name, tl: invader.scoutKind === 'MECHA' ? 'Mekanikong Espiya' : 'Palaboy na Espiya' };
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
  /** This wave's formation, spawn order and the invaders left in the current burst. */
  private tactic: WaveTactic = tacticOf(undefined);
  private spawnPlan: PlannedSpawn[] = [];
  private burstLeft = 0;
  private workerProvider?: () => WorkerInstance[];
  private defenderProvider?: () => import('./DefenderSystem').Defender[];
  private blockerProvider: () => InvaderBlocker[] = () => [];
  private nav?: Navigation;
  private structures?: StructureManager;
  private portals?: PortalManager;
  private autoSmiteTimer: number = 0;
  private lastSmiteTime: number = 0;
  /** Sky lasers locked by double-click: each keeps burning its target (and building focus) until it dies. */
  private beams: { target: ActiveInvader; aimMs: number; focusMs: number; tickMs: number; scarMs: number; gfx: Phaser.GameObjects.Graphics }[] = [];
  /** Last click, to detect a double-click. */
  private lastClick = { time: 0, x: 0, y: 0 };
  /** Burn scars the sky laser leaves on the ground; they hurt invaders that step on them. */
  private scars: { x: number; y: number; life: number; tick: number }[] = [];
  private poisonZones: { x: number; y: number; radius: number; dps: number; life: number; tick: number }[] = [];
  private scarGfx?: Phaser.GameObjects.Graphics;
  private wasInvasionActive: boolean = false;
  private battleFxReady = false;
  private pendingBattleFx: Array<'POISON_SMOKE' | 'BONE_CAGE'> = [];
  private aircraftRemaining = 0;
  private aircraftTimer = 0;
  private activeAircraft = new Set<Phaser.GameObjects.Sprite>();

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
    this.loadBattleFx();
  }

  private loadBattleFx(): void {
    if (!this.scene.load) return; // headless tests stub the scene without a loader
    const base = import.meta.env.BASE_URL;
    this.scene.load.aseprite('battle-poison-smoke', `${base}skills/poison-smoke.png`, `${base}skills/poison-smoke.json`);
    this.scene.load.aseprite('battle-bone-cage', `${base}skills/bone-cage.png`, `${base}skills/bone-cage.json`);
    queueBattleFxSheets(this.scene, base);
    this.scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
      for (const key of ['battle-poison-smoke', 'battle-bone-cage']) {
        if (this.scene.textures.exists(key)) this.scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
      this.createBattleAnim('battle-poison-smoke:poof', 'battle-poison-smoke', 'poof-', 0, 11, 9, -1);
      this.createBattleAnim('battle-bone-cage:rise', 'battle-bone-cage', 'rise-', 0, 2, 8, 0);
      this.createBattleAnim('battle-bone-cage:hold', 'battle-bone-cage', 'hold-', 0, 2, 6, -1);
      this.createBattleAnim('battle-bone-cage:sink', 'battle-bone-cage', 'sink-', 0, 7, 8, 0);
      initBattleFx(this.scene, this.parentContainer ?? null);
      this.battleFxReady = true;
      for (const effect of this.pendingBattleFx.splice(0)) this.playBattleEffect(effect);
    });
    this.scene.load.start();
  }

  private createBattleAnim(key: string, texture: string, prefix: string, start: number, end: number, frameRate: number, repeat: number): void {
    if (this.scene.anims.exists(key) || !this.scene.textures.exists(texture)) return;
    this.scene.anims.create({ key, frames: this.scene.anims.generateFrameNames(texture, { prefix, start, end }), frameRate, repeat });
  }

  public setWorkerProvider(provider: () => WorkerInstance[]): void {
    this.workerProvider = provider;
  }

  public setDefenderProvider(provider: () => import('./DefenderSystem').Defender[]): void {
    this.defenderProvider = provider;
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

  /** Dev mode: defeat every invader on the island (normal rewards). */
  public devKillAll(): number {
    const alive = this.invaders.filter((i) => !i.isDead);
    for (const invader of alive) this.eliminateInvader(invader);
    return alive.length;
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
    this.beams = this.beams.filter((beam) => {
      if (beam.target.isDead || !beam.target.container.active) {
        beam.gfx.destroy();
        return false;
      }
      return true;
    });
    if ((store.defense.laserStormTimer ?? 0) > 0) this.autoLockBeams();
    for (const beam of this.beams) this.updateBeam(beam, delta);
    this.updateScars(delta);

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
    this.updatePoisonZones(deltaSec);

    // 3. Update living invaders movement and attacks
    this.updateInvaders(deltaSec);
    this.tidyHacks();
    this.tidyReticles();
  }

  private handleActiveIncursion(delta: number, _deltaSec: number): void {
    const store = useGameStore.getState();

    // Initialize wave spawning: tear the portals open
    if (this.totalEnemiesToSpawn === 0 && store.invasion.totalEnemiesInWave > 0) {
      this.totalEnemiesToSpawn = store.invasion.totalEnemiesInWave;
      this.enemiesSpawnedCount = 0;
      const difficulty = normalizeDifficulty(store.difficulty);
      const wave = store.invasion.waveNumber;
      this.tactic = tacticOf(store.invasion.tactic);
      this.spawnPlan = buildWavePlan(wave, this.totalEnemiesToSpawn, this.tactic, difficulty);
      this.burstLeft = Math.max(1, this.tactic.burst);
      this.spawnTimer = WAVE_BALANCE.spawn.firstDelayMs;
      this.portals?.open(wave, portalHpMultiplier(wave, difficulty, (this.tactic.portalHp ?? 1) * realmIntensity(wave, store.platformPhase).portalHp), this.tactic.portals, this.tactic.rotateEvery);
      this.assignSquads(wave);
      // Technician raid part-way through the wave
      this.raidsLeft = hackersForWave(wave);
      this.raidAt = Math.max(1, Math.floor(this.totalEnemiesToSpawn * TECHNICIANS.spawnAtFraction));
      // V4 Rocket Launcher raid (a random few waves)
      this.launchersLeft = launchersForWave(wave, difficulty);
      this.launcherAt = Math.max(1, Math.floor(this.totalEnemiesToSpawn * LAUNCHERS.spawnAtFraction));
      this.aircraftRemaining = aircraftCount(wave);
      this.aircraftTimer = Phaser.Math.Between(WAVE_BALANCE.airlift.firstDelayMinMs, WAVE_BALANCE.airlift.firstDelayMaxMs);
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
        // Bursts step out back-to-back, then the formation pauses
        this.burstLeft--;
        if (this.burstLeft > 0) {
          this.spawnTimer = 260;
        } else {
          this.burstLeft = Math.max(1, this.tactic.burst);
          const burstGap = Math.max(1, this.tactic.burst) * 0.75 + 0.25;
          this.spawnTimer = spawnIntervalMs(store.invasion.waveNumber, normalizeDifficulty(store.difficulty), (this.tactic.interval ?? 1) * burstGap * realmIntensity(store.invasion.waveNumber, store.platformPhase).interval);
        }
        if (this.spawnSingleInvader(store.invasion.waveNumber)) this.enemiesSpawnedCount++;
        if (this.raidsLeft > 0 && this.enemiesSpawnedCount >= this.raidAt) this.spawnTechnicianRaid(store.invasion.waveNumber);
        if (this.launchersLeft > 0 && this.enemiesSpawnedCount >= this.launcherAt) this.spawnLauncherRaid(store.invasion.waveNumber);
      }
    }

    this.updateAircraft(delta, store.invasion.waveNumber);

    // Check Victory
    if (
      this.enemiesSpawnedCount >= this.totalEnemiesToSpawn &&
      this.invaders.length === 0 &&
      this.aircraftRemaining === 0 &&
      this.activeAircraft.size === 0 &&
      store.invasion.isActive
    ) {
      this.totalEnemiesToSpawn = 0;
      this.enemiesSpawnedCount = 0;
      this.aircraftRemaining = 0;
      const victoryBounty = waveVictoryBounty(store.invasion.waveNumber);
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

  /** Wave-only transport raids. The plane crosses the island and drops a wave-scaled mixed squad. */
  private updateAircraft(delta: number, wave: number): void {
    if (!this.aircraftRemaining || !useGameStore.getState().invasion.isActive) return;
    this.aircraftTimer -= delta;
    if (this.aircraftTimer > 0) return;
    this.aircraftRemaining--;
    this.aircraftTimer = Phaser.Math.Between(WAVE_BALANCE.airlift.nextDelayMinMs, WAVE_BALANCE.airlift.nextDelayMaxMs);
    this.sendAircraft(wave);
  }

  private sendAircraft(wave: number): void {
    if (!this.scene.textures.exists('battle-transport')) return;
    const plane = this.scene.add.sprite(-820, 215, 'battle-transport');
    // Some transports limp in already hit by the citadel's flak: burning engine and a heavy smoke trail
    const damaged = Math.random() < 0.3;
    plane.setScale(2.5).setDepth(100000).play(damaged ? 'battle-transport:damaged' : 'battle-transport:fly');
    const trail = this.scene.time.addEvent({
      delay: damaged ? 70 : 160,
      loop: true,
      callback: () => {
        if (plane.active) spawnSmoke(plane.x - 46, plane.y + (damaged ? 22 : 6), damaged ? 1.5 : 0.8, -14);
      },
    });
    this.parentContainer?.add(plane);
    this.activeAircraft.add(plane);

    const duration = WAVE_BALANCE.airlift.flightMs;
    const dropCount = aircraftDropCount(wave);
    const groups: Array<{ category: 'HUMAN' | 'MECHA'; type: InvaderType }> = [];
    for (let i = 0; i < dropCount; i++) {
      const category = i % 2 === 0 ? 'HUMAN' : 'MECHA';
      groups.push({ category, type: pickWaveInvaderOfCategory(wave, category) });
    }
    const force = `${groups.filter((g) => g.category === 'HUMAN').length} Humans / ${groups.filter((g) => g.category === 'MECHA').length} Mechas`;
    const forceTl = `${groups.filter((g) => g.category === 'HUMAN').length} tao / ${groups.filter((g) => g.category === 'MECHA').length} mecha`;
    logMessage('aircraftDrop', { count: dropCount, force: { en: force, tl: forceTl }, wave });

    // Ramp opens over the drop zone and closes after the last jumper
    if (!damaged) {
      this.scene.time.delayedCall(duration * 0.22, () => plane.active && plane.play('battle-transport:drop'));
      this.scene.time.delayedCall(duration * 0.8, () => plane.active && plane.play('battle-transport:fly'));
    }
    groups.forEach((group, i) => {
      const fraction = 0.24 + (0.52 * (i + 1)) / (groups.length + 1);
      this.scene.time.delayedCall(duration * fraction, () => {
        const invasion = useGameStore.getState().invasion;
        if (!invasion.isActive || invasion.waveNumber !== wave || !this.nav) return;
        const tile = this.airdropTile(fraction);
        if (tile) this.spawnSingleInvader(wave, { type: group.type, grid: tile, airborne: true });
      });
    });
    this.scene.tweens.add({
      targets: plane,
      x: 960,
      duration,
      ease: 'Linear',
      onComplete: () => {
        trail.remove();
        this.activeAircraft.delete(plane);
        plane.destroy();
      },
    });
  }

  private airdropTile(fraction: number): GridPoint | null {
    if (!this.nav) return null;
    const along = Math.max(1, Math.min(17, Math.round(18 * fraction)));
    const base = { x: along, y: 17 - along };
    for (let radius = 0; radius <= 4; radius++) {
      const candidates: GridPoint[] = [];
      for (let dx = -radius; dx <= radius; dx++) for (let dy = -radius; dy <= radius; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = base.x + dx, y = base.y + dy;
        if (x >= 0 && y >= 0 && x < GRID_SIZE && y < GRID_SIZE && this.nav.allows(x, y, 'land')) candidates.push({ x, y });
      }
      if (candidates.length) return Phaser.Utils.Array.GetRandom(candidates);
    }
    return null;
  }

  private attachParachute(invader: ActiveInvader): void {
    if (!this.scene.textures.exists('battle-parachute')) return;
    // deploy -> swaying fall -> canopy collapses on touchdown
    const parachute = this.scene.add.sprite(0, -70, 'battle-parachute').setScale(1.5).play('battle-parachute:deploy');
    parachute.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => parachute.active && parachute.play('battle-parachute:fall'));
    invader.container.add(parachute);
    invader.dropTimer = WAVE_BALANCE.airlift.descentMs / 1000;
    this.scene.tweens.add({
      targets: parachute,
      y: -22,
      duration: WAVE_BALANCE.airlift.descentMs,
      ease: 'Sine.easeIn',
      onComplete: () => {
        if (!parachute.active) return;
        parachute.play('battle-parachute:land');
        parachute.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => parachute.destroy());
      },
    });
  }

  /** Realm-wide consumables are resolved here so the UI can queue them without owning Phaser. */
  private playBattleEffect(effect: import('../types/state').BattleEffect): void {
    if ((effect === 'POISON_SMOKE' || effect === 'BONE_CAGE') && !this.battleFxReady) {
      this.pendingBattleFx.push(effect);
      return;
    }
    const store = useGameStore.getState();
    const foes = this.invaders.filter((i) => !i.isDead && !i.isRetreating && i.container.active);
    if (effect === 'MASS_REGEN') {
      for (const w of this.workerProvider?.() ?? []) if (w.hp > 0 && !w.isBrawling) w.hp = w.maxHp;
      for (const d of this.defenderProvider?.() ?? []) if (!d.dead) d.hp = d.maxHp;
      soundFx.playHeal();
      return;
    }
    if (effect === 'POISON_SMOKE') {
      const towers = this.structures?.getTowers().filter((t) => t.id !== 'SPIRE') ?? [];
      const picked = Phaser.Utils.Array.Shuffle([...towers]).slice(0, 3);
      const centers = [this.castleCenter(), ...picked.map((t) => ({ x: t.x, y: t.y }))];
      const radius = 112;
      const dps = Math.round((24 + store.invasion.waveNumber * 0.7) * skillPower(store.invasion.waveNumber));
      for (const p of centers) {
        const cloud = this.scene.add.sprite(p.x, p.y - 10, 'battle-poison-smoke')
          .setOrigin(0.5, 0.55).setAlpha(0.9).setScale(2.8).setDepth(9997);
        this.parentContainer?.add(cloud);
        cloud.play('battle-poison-smoke:poof');
        this.scene.tweens.add({ targets: cloud, alpha: 0, scale: 1.2, duration: 8000, ease: 'Sine.easeInOut', onComplete: () => cloud.destroy() });
        this.poisonZones.push({ x: p.x, y: p.y, radius, dps, life: 8, tick: 0 });
      }
      soundFx.playExplosion();
      return;
    }
    if (effect === 'BONE_CAGE') {
      const center = this.castleCenter();
      const target = foes.sort((a, b) => Math.hypot(a.container.x - center.x, a.container.y - center.y) - Math.hypot(b.container.x - center.x, b.container.y - center.y))[0];
      if (!target) return;
      target.frozenTimer = Math.max(target.frozenTimer ?? 0, 6);
      const cage = this.scene.add.sprite(target.container.x, target.container.y, 'battle-bone-cage')
        .setOrigin(0.5, 0.84).setScale(2).setDepth(target.container.depth + 1);
      this.parentContainer?.add(cage);
      cage.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (animation: Phaser.Animations.Animation) => {
        if (!cage.active) return;
        if (animation.key === 'battle-bone-cage:rise') cage.play('battle-bone-cage:hold');
        else if (animation.key === 'battle-bone-cage:sink') cage.destroy();
      });
      cage.play('battle-bone-cage:rise');
      this.scene.time.delayedCall(4700, () => { if (cage.active) cage.play('battle-bone-cage:sink'); });
      this.applyBurn(target, Math.max(1, Math.round(target.maxHp * 0.175)), 6);
      soundFx.playExplosion();
      return;
    }
    if (effect === 'LASER_STORM') {
      soundFx.playExplosion();
      this.scene.cameras.main.flash(180, 255, 255, 255, true);
    }
  }

  private updatePoisonZones(deltaSec: number): void {
    this.poisonZones = this.poisonZones.filter((zone) => {
      zone.life -= deltaSec;
      zone.tick -= deltaSec;
      if (zone.tick <= 0) {
        zone.tick = 1;
        for (const foe of this.invaders) {
          if (foe.isDead || foe.isRetreating || !foe.container.active) continue;
          if (Math.hypot(foe.container.x - zone.x, foe.container.y - zone.y) <= zone.radius) this.applyBurn(foe, zone.dps, 1.5);
        }
      }
      return zone.life > 0;
    });
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
    // A random fight: more scouts the further the realm has come (scoutRaid.json)
    const wave = scoutWave();
    const numScouts = scoutCount(wave);
    logMessage('scoutRaid', { count: numScouts, wave });
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

    // A random human or mecha scout (scoutLoot.json)
    const scout = pickScout();
    const type: InvaderType = scout.type;

    // Raiders scale with the last wave reached and take a role: runner, looter or raider
    const scaling = scoutScaling(scoutWave());
    const role = pickScoutRole();
    const roleCfg = SCOUT_ROLES[role];
    const finalMaxHp = Math.round(scout.hp * scaling.hp * roleCfg.hp);
    const finalDamage = Math.round(scout.damage * scaling.damage);
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
      name: scout.kind === 'MECHA' ? 'Mecha Scout Drone' : 'Wandering Scout',
      scoutKind: scout.kind,
      isScout: true,
      scoutRole: role,
      defence: scaling.defence,
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
      speed: scout.speed * roleCfg.speed, // Movement uses pixels per second, like regular invaders.
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

    // HP + defence gauges show from the start; looters sneak in half-hidden
    this.renderHpBar(hpBarGfx, finalMaxHp, finalMaxHp, scaling.defence);
    if (roleCfg.alpha) (sprite ?? bodyGfx).setAlpha(roleCfg.alpha);

    // Interactive Clicking: Smite for Loot
    container.setInteractive({ useHandCursor: true });
    container.on('pointerdown', (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      if (pointer.leftButtonDown() && !invader.isDead) {
        event.stopPropagation();
        this.handleStrikeClick(pointer, invader);
      }
    });

    if (fromPortal) this.beginEmerge(invader, fromPortal);
    this.invaders.push(invader);
  }

  /** Returns false when no portal is left to spawn from. */
  private spawnSingleInvader(
    waveNumber: number,
    extra?: { type: InvaderType; portal?: PortalState; escortOf?: ActiveInvader; hacker?: boolean; launcher?: boolean; grid?: GridPoint; airborne?: boolean }
  ): ActiveInvader | null {
    if (!useGameStore.getState().invasion.isActive) return null;

    // Next invader of the formation (boss last, escort mid-wave); tests spawn without a plan
    let planned: PlannedSpawn = extra
      ? { type: extra.type, rank: 'normal' as InvaderRank, escort: true }
      : this.spawnPlan[this.enemiesSpawnedCount] ?? { type: pickWaveInvader(waveNumber, this.tactic.bias), rank: 'normal' as InvaderRank };

    let portal: PortalState | null = extra?.portal ?? null;
    if (this.portals && !portal && !extra?.grid) {
      portal = this.pickSquadPortal(planned);
      if (!portal) return null;
    }
    // The rift's squad shapes ordinary fighters: its General first, then its favoured kinds
    const squad = portal ? this.squads.get(portal) : undefined;
    if (!extra && squad && planned.rank !== 'boss' && planned.rank !== 'climax' && !planned.escort) {
      const due = this.commandersDue.indexOf(portal!);
      if (due >= 0 && SQUADS[squad].commander) {
        this.commandersDue.splice(due, 1);
        planned = { type: SQUADS[squad].commander!, rank: 'elite', escort: true };
      } else {
        planned = { ...planned, type: pickWaveInvader(waveNumber, squadBias(this.tactic.bias, squad)) };
      }
    }
    const mods = squad && !extra ? SQUADS[squad].mods : { hp: 1, speed: 1, damage: 1 };
    const spawnGrid = extra?.grid ?? (portal
      ? portal.site.exit
      : InvasionManager.EXITS[Math.floor(Math.random() * InvasionManager.EXITS.length)]);

    const type = planned.type;
    const rank = planned.rank;

    // Auto-discover invader in Demon Lord Bestiary!
    useGameStore.getState().discoverEntry('invader', type);

    const cfg = INVADER_CONFIGS[type];
    const store = useGameStore.getState();
    const stats = invaderStats(
      cfg,
      { wave: waveNumber, difficulty: normalizeDifficulty(store.difficulty), day: store.day, year: store.year, season: store.season, phase: store.platformPhase },
      rank,
      { hp: this.tactic.hp, damage: this.tactic.damage },
    );
    const isBoss = rank === 'boss' || rank === 'climax';
    const isElite = rank === 'elite';
    let finalMaxHp = Math.max(1, Math.round(stats.hp * mods.hp));
    let finalDamage = Math.max(1, Math.round(stats.damage * mods.damage));
    // Brawl balance: some invaders copy an upgraded General's attack and HP
    const mirror = !isBoss && !extra ? this.rollMirror(waveNumber) : null;
    if (mirror) {
      finalMaxHp = mirror.hp;
      finalDamage = mirror.attack;
    }
    const finalBounty = stats.bounty;
    // A random few ignore everything else and charge the citadel
    const rush = DEFENSE_CONFIG?.rushers;
    const rushChance = (rush?.chance ?? 0) + (this.tactic.rusherBonus ?? 0);
    const isRusher = !!rush && !isBoss && !planned.escort && waveNumber >= rush.fromWave && Math.random() < rushChance;
    let speed = cfg.speed * (this.tactic.speed ?? 1) * mods.speed * (isRusher ? rush.speedMultiplier : 1);
    if (this.tactic.effect === 'OVERCLOCK' && cfg.category === 'MECHA') speed *= TACTIC_EFFECTS.OVERCLOCK.mechaSpeed;
    const startIso = IsometricHelper.gridToScreen(spawnGrid.x, spawnGrid.y);

    const container = this.scene.add.container(startIso.x, startIso.y);
    container.setSize(32, 32);

    const shadow = markShadow(this.scene.add.ellipse(0, 4, 18, 9, 0x000000, 0.45));
    const bodyGfx = this.scene.add.graphics();
    const hpBarGfx = this.scene.add.graphics();

    const sprite = this.attachInvaderBody(container, shadow, bodyGfx, hpBarGfx, type);
    this.renderHpBar(hpBarGfx, finalMaxHp, finalMaxHp);
    container.setDepth(IsometricHelper.getDepth(spawnGrid.x, spawnGrid.y, 7));

    if (stats.scale !== 1) {
      container.setScale(stats.scale);
      shadow.setScale(stats.scale);
    }
    if (isElite && sprite) sprite.setTint(0xfde68a);
    if (mirror && sprite) sprite.setTint(MIRROR_TINT);

    if (this.parentContainer) {
      this.parentContainer.add(container);
    }

    const invader: ActiveInvader = {
      id: `invader_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      type,
      name: isBoss ? `BOSS ${cfg.nameEn ?? cfg.name}` : mirror ? BRAWL_CONFIG.text.mirrorName.en.replace('{name}', cfg.nameEn ?? cfg.name)
        : isElite ? `Elite ${cfg.nameEn ?? cfg.name}` : (cfg.nameEn ?? cfg.name),
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
      speed,
      damage: finalDamage,
      bountyCoins: finalBounty,
      attackTimer: 0,
      isDead: false,
      isRetreating: false,
      spawnGrid: { x: spawnGrid.x, y: spawnGrid.y },
      baseScale: stats.scale,
      isElite,
      portal: portal ?? undefined,
      retargetTimer: 0,
      isRusher,
      isHacker: extra?.hacker,
      isLauncher: extra?.launcher,
      escortOf: extra?.escortOf,
      // Every wave boss carries a rune, stronger later in the realm
      runeDrop: isBoss ? { kind: rollRuneKind(), tier: bossRuneTier(waveNumber, rank === 'climax') } : undefined,
    };

    // Interactive Clicking: Demon Lord Lightning Smite! ⚡
    container.setInteractive({ useHandCursor: true });
    container.on('pointerdown', (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      if (pointer.leftButtonDown() && !invader.isDead) {
        event.stopPropagation();
        this.handleStrikeClick(pointer, invader);
      }
    });

    if (portal) this.beginEmerge(invader, portal);
    this.invaders.push(invader);
    if (extra?.airborne) this.attachParachute(invader);
    soundFx.playCastleHit();
    if (this.tactic.effect === 'PHASE_VEIL') invader.invulnTimer = Math.max(invader.invulnTimer ?? 0, TACTIC_EFFECTS.PHASE_VEIL.veilSeconds);
    if (extra) {
      // Raid members are narrated by spawnTechnicianRaid
    } else if (isBoss) {
      logMessage('bossArrives', { name: this.logName(invader) });
      if (invader.runeDrop) logMessage('bossCarriesRune', { name: this.logName(invader), rune: this.runeLabel(invader.runeDrop) });
    }
    else if (planned.escort) logMessage('escortArrives', { name: this.logName(invader) });
    else if (isElite) logMessage('eliteArrives', { name: this.logName(invader) });
    if (isRusher) logMessage('rusherCharges', { name: this.logName(invader) });
    if (mirror) logMessage('mirrorArrives', { name: this.logName(invader), general: mirror.unit.name });
    return invader;
  }

  /** "Tier III Fury Rune" in both languages, for the activity log. */
  private runeLabel(drop: { kind: keyof typeof RUNES; tier: number }) {
    const def = RUNES[drop.kind];
    return { en: `${def.icon} ${def.name.en} ${tierName(drop.tier)}`, tl: `${def.icon} ${def.name.tl} ${tierName(drop.tier)}` };
  }

  /** A slain boss drops its rune: it flies up in its tier colour and lands in the Rune Vault. */
  private dropRune(invader: ActiveInvader): void {
    const drop = invader.runeDrop!;
    invader.runeDrop = undefined;
    useGameStore.getState().grantRune(drop.kind, drop.tier);
    logMessage('runeDropped', { name: this.logName(invader), rune: this.runeLabel(drop) });
    soundFx.playFanfare();
    const color = parseInt(tierColor(drop.tier).replace('#', ''), 16);
    const gem = this.scene.add.star(invader.container.x, invader.container.y - 20, 4, 4, 9, color, 1);
    gem.setStrokeStyle(1.5, 0xffffff, 0.9);
    gem.setDepth(9995);
    this.parentContainer?.add(gem);
    this.scene.tweens.add({ targets: gem, y: gem.y - 46, angle: 360, scale: 1.6, alpha: 0, duration: 1400, ease: 'Cubic.easeOut', onComplete: () => gem.destroy() });
  }

  /** Upgraded Generals already mirrored this wave (at most one mirror each). */
  private mirrored = new Set<string>();
  private mirrorWave = -1;

  /** Rolls whether a new invader copies an upgraded General (brawl.json mirror). */
  private rollMirror(wave: number): { unit: UnitRosterItem; attack: number; hp: number } | null {
    if (wave !== this.mirrorWave) {
      this.mirrorWave = wave;
      this.mirrored.clear();
    }
    for (const unit of useGameStore.getState().roster) {
      const level = brawlLevelOf(unit);
      if (level <= 0 || this.mirrored.has(unit.id) || Math.random() >= mirrorChance(level)) continue;
      this.mirrored.add(unit.id);
      return { unit, ...generalStatsOf(unit) };
    }
    return null;
  }

  /** Each open rift rolls its own squad (riftSquads.json); command squads queue their General. */
  private assignSquads(wave: number): void {
    this.squads.clear();
    const open = this.portals?.getOpen() ?? [];
    const ids = rollSquads(open.length, wave);
    const lang = useGameStore.getState().language;
    open.forEach((p, i) => {
      this.squads.set(p, ids[i]);
      const def = SQUADS[ids[i]];
      logMessage('riftSquad', {
        portal: lang === 'TL' ? p.site.name.tl : p.site.name.en,
        squad: `${def.icon} ${lang === 'TL' ? def.name.tl : def.name.en}`,
        desc: lang === 'TL' ? def.desc.tl : def.desc.en,
      });
    });
    this.commandersDue = wave >= COMMANDER_FROM_WAVE ? open.filter((p) => SQUADS[this.squads.get(p)!].commander) : [];
  }

  /**
   * Which rift the next invader uses: rotating formations keep their order;
   * otherwise the squads' shares decide (a Probe rift sends only a few). The
   * boss marches from the command rift of its own side when there is one.
   */
  private pickSquadPortal(planned: PlannedSpawn): PortalState | null {
    const open = (this.portals?.getOpen() ?? []).filter((p) => this.squads.has(p));
    if (!open.length || this.tactic.portals === 'ROTATE') return this.portals?.pickSpawn() ?? null;
    if (planned.rank === 'boss' || planned.rank === 'climax') {
      const home = open.find((p) => SQUADS[this.squads.get(p)!].commander === planned.type);
      if (home) return home;
    }
    return open[pickByShare(open.map((p) => this.squads.get(p)!))];
  }

  /** A Technician (or more, late on) steps out of one rift with its escort; extra invaders on top of the wave. */
  private spawnTechnicianRaid(wave: number): void {
    const difficulty = normalizeDifficulty(useGameStore.getState().difficulty);
    while (this.raidsLeft > 0) {
      this.raidsLeft--;
      const portal = this.portals?.pickSpawn() ?? undefined;
      const hacker = this.spawnSingleInvader(wave, { type: 'TECHNICIAN', portal, hacker: true });
      if (!hacker) return;
      const escorts = escortsFor(wave, difficulty);
      for (let i = 0; i < escorts; i++) this.spawnSingleInvader(wave, { type: escortType(i), portal, escortOf: hacker });
      const rift = portal ? (useGameStore.getState().language === 'TL' ? portal.site.name.tl : portal.site.name.en) : '';
      logMessage('technicianRaid', { portal: rift, escorts });
    }
    useGameStore.getState().setEnemiesRemaining(this.invaders.filter((i) => !i.isDead).length);
  }

  /** A V4 Rocket Launcher rolls out of one rift with its Mecha guards; extra invaders on top of the wave. */
  private spawnLauncherRaid(wave: number): void {
    const difficulty = normalizeDifficulty(useGameStore.getState().difficulty);
    while (this.launchersLeft > 0) {
      this.launchersLeft--;
      const portal = this.portals?.pickSpawn() ?? undefined;
      const launcher = this.spawnSingleInvader(wave, { type: 'MECHA_V4_LAUNCHER', portal, launcher: true });
      if (!launcher) return;
      launcher.reloadTimer = 0;
      const escorts = launcherEscortsFor(wave, difficulty);
      for (let i = 0; i < escorts; i++) this.spawnSingleInvader(wave, { type: launcherEscortType(i), portal, escortOf: launcher });
      const rift = portal ? (useGameStore.getState().language === 'TL' ? portal.site.name.tl : portal.site.name.en) : '';
      logMessage('launcherRaid', { portal: rift, escorts });
    }
    useGameStore.getState().setEnemiesRemaining(this.invaders.filter((i) => !i.isDead).length);
  }

  /**
   * V4 Rocket Launcher: drives within range of an establishment, locks on
   * (reticle on the target) and launches a rocket that lands as a direct hit,
   * then reloads and picks a new target. Returns false when no establishment
   * is left (it then fights normally).
   */
  private updateLauncher(invader: ActiveInvader, speed: number, deltaSec: number): boolean {
    if (!this.structures) return false;
    const targets = this.structures.getTargets();
    const tiles = (t: StructureTarget) => (this.nav ? this.nav.distanceToRect(invader.container.x, invader.container.y, t.rect) : Math.hypot(t.x - invader.container.x, t.y - invader.container.y) / 40);
    let target = targets.find((t) => t.id === invader.rocketTargetId && t.id !== 'CASTLE');
    if (!target) {
      target = chooseRocketTarget(targets, tiles);
      if (!target) return false;
      invader.rocketTargetId = target.id;
      invader.aimProgress = 0;
    }
    if (tiles(target) > LAUNCHERS.rangeTiles) {
      invader.aimProgress = 0;
      approachStructure(this.ctx, invader, target, speed * deltaSec, deltaSec);
      return true;
    }
    this.faceInvader(invader, target.x - invader.container.x, target.y - invader.container.y, false);
    if ((invader.reloadTimer ?? 0) > 0) {
      invader.reloadTimer = Math.max(0, (invader.reloadTimer ?? 0) - deltaSec);
      return true;
    }
    const difficulty = normalizeDifficulty(useGameStore.getState().difficulty);
    const total = aimSeconds(difficulty);
    const before = invader.aimProgress ?? 0;
    invader.aimProgress = before + deltaSec;
    if (before === 0) {
      logMessage('rocketLockOn', { building: this.structures.displayName(target.id) });
      if (invader.sprite) playEnemyAttack(invader.sprite);
    }
    this.drawRocketReticle(invader, target, invader.aimProgress / total);
    if (invader.aimProgress >= total) {
      this.launchRocket(invader, target);
      invader.aimProgress = 0;
      invader.reloadTimer = reloadSeconds(difficulty);
      invader.rocketTargetId = undefined; // next salvo picks a new target
    }
    return true;
  }

  /** Red lock-on reticle tightening around the target establishment. */
  private drawRocketReticle(invader: ActiveInvader, target: StructureTarget, progress: number): void {
    let g = this.rocketReticles.get(invader.id);
    if (!g) {
      g = this.scene.add.graphics();
      g.setDepth(9995);
      this.parentContainer?.add(g);
      this.rocketReticles.set(invader.id, g);
    }
    g.clear();
    const p = Math.min(1, progress);
    const r = 46 - 26 * p;
    const blink = p > 0.7 && Math.floor(this.scene.time.now / 120) % 2 === 0;
    g.lineStyle(2, blink ? 0xffffff : 0xef4444, 0.9);
    g.strokeEllipse(target.x, target.y, r * 2, r);
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i + p * Math.PI;
      g.lineBetween(target.x + Math.cos(a) * r, target.y + Math.sin(a) * r * 0.5, target.x + Math.cos(a) * (r + 10), target.y + Math.sin(a) * (r + 10) * 0.5);
    }
    g.lineStyle(1, 0xef4444, 0.35);
    g.lineBetween(invader.container.x, invader.container.y - 20, target.x, target.y);
  }

  /** Lock-on reticles of dead / idle launchers go away. */
  private tidyReticles(): void {
    for (const [id, g] of this.rocketReticles) {
      const inv = this.invaders.find((i) => i.id === id);
      if (inv && !inv.isDead && (inv.aimProgress ?? 0) > 0) continue;
      g.destroy();
      this.rocketReticles.delete(id);
    }
  }

  /** The rocket arcs over the island and lands as a direct hit on the establishment. */
  private launchRocket(invader: ActiveInvader, target: StructureTarget): void {
    const damage = Math.round(invader.damage * LAUNCHERS.damageMultiplier);
    const from = { x: invader.container.x, y: invader.container.y - 22 };
    const rocket = this.scene.add.graphics();
    rocket.setDepth(9996);
    this.parentContainer?.add(rocket);
    soundFx.playLaser();
    const trail: { x: number; y: number }[] = [];
    const point = (t: number) => ({
      x: from.x + (target.x - from.x) * t,
      y: from.y + (target.y - 20 - from.y) * t - Math.sin(Math.PI * t) * LAUNCHERS.arcHeight,
    });
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: LAUNCHERS.flightMs,
      ease: 'Sine.easeIn',
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        const p = point(t);
        const ahead = point(Math.min(1, t + 0.02));
        trail.push(p);
        if (trail.length > 14) trail.shift();
        rocket.clear();
        trail.forEach((q, i) => {
          rocket.fillStyle(i > trail.length - 4 ? 0xf97316 : 0x9ca3af, (i / trail.length) * 0.7);
          rocket.fillCircle(q.x, q.y, 1.5 + (i / trail.length) * 2.5);
        });
        const ang = Math.atan2(ahead.y - p.y, ahead.x - p.x);
        const dx = Math.cos(ang) * 7;
        const dy = Math.sin(ang) * 7;
        rocket.lineStyle(4, 0xe5e7eb, 1);
        rocket.lineBetween(p.x - dx, p.y - dy, p.x + dx, p.y + dy);
        rocket.fillStyle(0xdc2626, 1);
        rocket.fillCircle(p.x + dx, p.y + dy, 2);
      },
      onComplete: () => {
        rocket.destroy();
        const live = this.structures?.getTargets().find((t) => t.id === target.id);
        if (!live || !this.structures) return;
        this.structures.damage(live, damage);
        logMessage('rocketHit', { building: this.structures.displayName(live.id) }, { mergeKey: `rocket:${live.id}`, amount: damage });
        soundFx.playExplosion();
        this.scene.cameras.main.shake(180, 0.004);
        const blast = this.scene.add.graphics();
        blast.setDepth(9996);
        this.parentContainer?.add(blast);
        this.scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 450,
          onUpdate: (tw) => {
            const t = tw.getValue() ?? 0;
            blast.clear();
            blast.fillStyle(0xf97316, 0.6 * (1 - t));
            blast.fillEllipse(live.x, live.y - 10, 20 + 70 * t, 10 + 35 * t);
            blast.fillStyle(0xfde68a, 0.8 * (1 - t));
            blast.fillCircle(live.x, live.y - 18, 14 * (1 - t) + 3);
          },
          onComplete: () => blast.destroy(),
        });
      },
    });
  }

  /**
   * Technician: walks to the nearest establishment still on the player's side
   * and channels a hack; when it completes the establishment turns hostile
   * until the wave ends and the Technician moves on to the next one.
   * Returns false when there is nothing left to hack (it then fights normally).
   */
  private updateHacker(invader: ActiveInvader, speed: number, deltaSec: number): boolean {
    const target = chooseHackTarget(this.ctx, invader);
    if (!target) return false;
    if (invader.hackTargetId !== target.id) {
      invader.hackTargetId = target.id;
      invader.hackProgress = 0;
    }
    const dist = this.nav ? this.nav.distanceToRect(invader.container.x, invader.container.y, target.rect) : 0;
    if (dist > TECHNICIANS.hackReachTiles) {
      approachStructure(this.ctx, invader, target, speed * deltaSec, deltaSec);
      return true;
    }
    this.faceInvader(invader, target.x - invader.container.x, target.y - invader.container.y, false);
    const total = hackSeconds(normalizeDifficulty(useGameStore.getState().difficulty));
    const before = invader.hackProgress ?? 0;
    invader.hackProgress = before + deltaSec;
    const name = this.structures?.displayName(target.id) ?? target.id;
    if (before === 0) logMessage('hackStarted', { building: name });
    this.drawHackBar(invader, target, invader.hackProgress / total);
    if (invader.hackProgress >= total) {
      setHacked(target.id as TowerId);
      invader.hackProgress = 0;
      invader.hackTargetId = undefined;
      logMessage('establishmentHacked', { building: name });
      soundFx.playCastleHit();
    }
    return true;
  }

  /** Progress bar + code sparks above the establishment being hacked. */
  private drawHackBar(invader: ActiveInvader, target: StructureTarget, progress: number): void {
    let g = this.hackBars.get(invader.id);
    if (!g) {
      g = this.scene.add.graphics();
      g.setDepth(9995);
      this.parentContainer?.add(g);
      this.hackBars.set(invader.id, g);
    }
    g.clear();
    const x = target.x;
    const y = target.y - 96;
    g.fillStyle(0x000000, 0.75);
    g.fillRect(x - 25, y - 1, 50, 7);
    g.fillStyle(0xe879f9, 1);
    g.fillRect(x - 24, y, 48 * Math.min(1, progress), 5);
    g.lineStyle(1, 0x22d3ee, 0.8);
    g.lineBetween(invader.container.x, invader.container.y - 18, x, y + 6);
    g.fillStyle(0x4ade80, 0.9);
    for (let i = 0; i < 3; i++) g.fillRect(x - 20 + Math.random() * 40, y - 6 - Math.random() * 10, 2, 2);
  }

  /** Drops hack bars of dead / retargeted hackers; hacks lapse when the wave ends. */
  private tidyHacks(): void {
    for (const [id, g] of this.hackBars) {
      const inv = this.invaders.find((i) => i.id === id);
      if (inv && !inv.isDead && (inv.hackProgress ?? 0) > 0) continue;
      if (inv?.isDead && (inv.hackProgress ?? 0) > 0) logMessage('hackStopped', {});
      g.destroy();
      this.hackBars.delete(id);
    }
    if (!useGameStore.getState().invasion.isActive && hackedIds().length) {
      for (const id of clearHacks()) logMessage('establishmentRestored', { building: this.structures?.displayName(id) ?? id });
    }
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

  private renderHpBar(graphics: Phaser.GameObjects.Graphics, current: number, max: number, defence = 0): void {
    graphics.clear();
    const width = 24;
    const height = 4;
    const x = -width / 2;
    const y = -26;

    // Background
    graphics.fillStyle(0x000000, 0.7);
    graphics.fillRect(x - 1, y - 1, width + 2, height + 2);

    // HP Fill
    const pct = Math.max(0, Math.min(1, current / max));
    const color = pct > 0.5 ? 0x22c55e : pct > 0.25 ? 0xf59e0b : 0xef4444;
    graphics.fillStyle(color, 1);
    graphics.fillRect(x, y, width * pct, height);

    // Defence gauge (scouts): a thin blue bar under the HP
    if (defence > 0) {
      graphics.fillStyle(0x000000, 0.7);
      graphics.fillRect(x - 1, y + height + 1, width + 2, 4);
      graphics.fillStyle(0x60a5fa, 1);
      graphics.fillRect(x, y + height + 2, width * Math.min(1, defence / SCOUT_DEFENCE_CAP), 2);
    }
  }

  /**
   * Double-click an invader (or near one) to lock a laser from the sky on it.
   * Up to maxBeams burn at once, no button holding needed; the longer a beam
   * stays on the same target, the higher its crit chance. Double-clicking a
   * locked target releases its beam.
   */
  public handleStrikeClick(pointer: Phaser.Input.Pointer, target?: ActiveInvader): void {
    const cfg = DEFENSE_CONFIG.holdStrike;
    const isActive = useGameStore.getState().invasion.isActive;
    // Peacetime scouts still fall to a single tap
    if (target?.isScout && !isActive) {
      this.tapInvader(target);
      return;
    }
    const now = this.scene.time.now;
    const isDouble = now - this.lastClick.time <= cfg.doubleClickMs
      && Math.hypot(pointer.x - this.lastClick.x, pointer.y - this.lastClick.y) <= cfg.doubleClickPx;
    this.lastClick = isDouble ? { time: 0, x: 0, y: 0 } : { time: now, x: pointer.x, y: pointer.y };
    if (!isDouble || (!target && !isActive)) return;

    const locked = target ?? this.nearestInvader(this.pointerLocal(pointer));
    if (!locked || locked.isDead) return;
    const existing = this.beams.find((b) => b.target === locked);
    if (existing) {
      existing.gfx.destroy();
      this.beams = this.beams.filter((b) => b !== existing);
      return;
    }
    while (this.beams.length >= cfg.maxBeams) this.beams.shift()?.gfx.destroy();
    const gfx = this.scene.add.graphics().setDepth(9500);
    this.parentContainer?.add(gfx);
    this.beams.push({ target: locked, aimMs: 0, focusMs: 0, tickMs: 0, scarMs: 0, gfx });
    soundFx.playClick();
  }

  /**
   * Ground lock-on reticle (isometric ellipse): an outer ring that shrinks as
   * open goes 1 → 0, four corner brackets spinning in, and a centre cross.
   */
  private drawReticle(g: Phaser.GameObjects.Graphics, x: number, y: number, open: number, t: number, color: number, alpha: number): void {
    const r = 12 + open * 30;
    g.lineStyle(1.5, color, alpha * (0.4 + 0.6 * (1 - open)));
    g.strokeEllipse(x, y, r * 2, r);
    const spin = t / 220 + open * 3;
    g.lineStyle(2, color, alpha);
    for (let i = 0; i < 4; i++) {
      const a = spin + (i * Math.PI) / 2;
      const ax = x + Math.cos(a) * (r + 5);
      const ay = y + Math.sin(a) * (r + 5) * 0.5;
      const tx = -Math.sin(a) * 5;
      const ty = Math.cos(a) * 5 * 0.5;
      g.lineBetween(ax - tx, ay - ty, ax + tx, ay + ty);
      g.lineBetween(ax, ay, x + Math.cos(a) * (r - 2), y + Math.sin(a) * (r - 2) * 0.5);
    }
    g.lineStyle(1, 0xffffff, alpha * 0.9);
    g.lineBetween(x - 4, y, x + 4, y);
    g.lineBetween(x, y - 2, x, y + 2);
  }

  /**
   * Laser Storm (R): fill every free beam slot with the unlocked invaders
   * closest to the citadel, so lasers keep firing without any clicking.
   */
  private autoLockBeams(): void {
    const cfg = DEFENSE_CONFIG.holdStrike;
    if (this.beams.length >= cfg.maxBeams) return;
    const castle = this.castleCenter();
    const locked = new Set(this.beams.map((b) => b.target));
    const free = this.invaders
      .filter((i) => !i.isDead && i.container.visible && !locked.has(i))
      .sort((a, b) => Math.hypot(a.container.x - castle.x, a.container.y - castle.y) - Math.hypot(b.container.x - castle.x, b.container.y - castle.y));
    for (const target of free.slice(0, cfg.maxBeams - this.beams.length)) {
      const gfx = this.scene.add.graphics().setDepth(9500);
      this.parentContainer?.add(gfx);
      this.beams.push({ target, aimMs: 0, focusMs: 0, tickMs: 0, scarMs: 0, gfx });
    }
  }

  private nearestInvader(at: { x: number; y: number }): ActiveInvader | undefined {
    let best: ActiveInvader | undefined;
    let bestDist = Infinity;
    for (const inv of this.invaders) {
      if (inv.isDead) continue;
      const d = Math.hypot(inv.container.x - at.x, inv.container.y - at.y);
      if (d < bestDist) { bestDist = d; best = inv; }
    }
    return best;
  }

  /** Pointer position in the invaders' container space. */
  private pointerLocal(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    if (!this.parentContainer) return { x: pointer.worldX, y: pointer.worldY };
    const p = this.parentContainer.getWorldTransformMatrix().applyInverse(pointer.worldX, pointer.worldY);
    return { x: p.x, y: p.y };
  }

  /** Laser damage number over the target: white hit, big orange CRIT, grey MISS. */
  private popBeamNumber(target: ActiveInvader, kind: 'hit' | 'crit' | 'miss', amount = 0): void {
    const labels = DEFENSE_CONFIG.holdStrike.labels;
    const tl = useGameStore.getState().language === 'TL';
    const text = kind === 'miss' ? (tl ? labels.miss.tl : labels.miss.en)
      : kind === 'crit' ? `${tl ? labels.crit.tl : labels.crit.en} ${amount}!` : String(amount);
    const head = (target.container.height || 40) * 0.5 + 24;
    const label = this.scene.add.text(
      target.container.x + Phaser.Math.Between(-10, 10),
      target.container.y - head,
      text,
      {
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: kind === 'crit' ? '15px' : '10px',
        color: kind === 'crit' ? '#fb923c' : kind === 'miss' ? '#94a3b8' : '#f8fafc',
        stroke: '#000000',
        strokeThickness: kind === 'crit' ? 4 : 3,
      },
    ).setOrigin(0.5).setDepth(9600);
    this.parentContainer?.add(label);
    if (kind === 'crit') label.setScale(0.4);
    this.scene.tweens.add({
      targets: label,
      y: label.y - (kind === 'crit' ? 26 : 18),
      alpha: 0,
      scale: kind === 'crit' ? 1.15 : 1,
      duration: kind === 'crit' ? 750 : 520,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  /** Smouldering scars: burn invaders standing on them, then fade out. */
  private updateScars(delta: number): void {
    if (this.scars.length === 0) {
      if (this.scarGfx) { this.scarGfx.destroy(); this.scarGfx = undefined; }
      return;
    }
    const sc = DEFENSE_CONFIG.holdStrike.scars;
    if (!this.scarGfx || !this.scarGfx.active) {
      this.scarGfx = this.scene.add.graphics().setDepth(-9500);
      // Beneath every unit in the layer
      this.parentContainer?.addAt(this.scarGfx, 0);
    }
    const g = this.scarGfx;
    g.clear();
    const t = this.scene.time.now;
    for (const s of this.scars) {
      s.life -= delta;
      s.tick += delta;
      if (s.tick >= 500) {
        s.tick -= 500;
        for (const inv of this.invaders) {
          if (inv.isDead || !inv.container.visible) continue;
          if (Math.hypot(inv.container.x - s.x, (inv.container.y - s.y) * 2) < sc.radius) {
            this.damageInvader(inv, Math.max(1, Math.round(sc.dps * 0.5)), undefined, true);
            this.applySlow(inv, sc.slow, 0.6);
          }
        }
      }
      const fade = Math.max(0, Math.min(1, s.life / 1500));
      const r = sc.radius;
      // Charred patch, glowing embers, flickering heat
      g.fillStyle(0x1c1917, 0.75 * fade);
      g.fillEllipse(s.x, s.y, r * 2.2, r * 1.1);
      g.fillStyle(0x7c2d12, 0.6 * fade);
      g.fillEllipse(s.x, s.y, r * 1.5, r * 0.75);
      const glow = 0.5 + 0.5 * Math.sin(t / 120 + s.x);
      g.fillStyle(0xf97316, (0.35 + 0.35 * glow) * fade);
      g.fillEllipse(s.x, s.y, r * 0.8, r * 0.4);
      g.fillStyle(0xfde047, 0.8 * glow * fade);
      g.fillRect(s.x - 3 + Math.sin(s.y) * 4, s.y - 1, 2, 2);
      g.fillRect(s.x + 2 + Math.cos(s.x) * 4, s.y + 1, 2, 2);
    }
    this.scars = this.scars.filter((s) => s.life > 0);
  }

  private updateBeam(beam: (typeof this.beams)[number], delta: number): void {
    const cfg = DEFENSE_CONFIG.holdStrike;
    const target = beam.target;
    beam.gfx.clear();

    // Aiming: a lock-on reticle closes in on the ground under the target, then the beam fires
    const t = this.scene.time.now;
    const fx = target.container.x;
    const fy = target.container.y + 2;
    if (beam.aimMs < cfg.aimMs) {
      beam.aimMs += delta;
      const k = Math.min(1, beam.aimMs / cfg.aimMs);
      this.drawReticle(beam.gfx, fx, fy, 1 - k, t, 0xf43f5e, 0.35 + 0.65 * k);
      if (beam.aimMs >= cfg.aimMs) soundFx.playLaser();
      if (this.parentContainer) this.parentContainer.bringToTop(beam.gfx);
      return;
    }
    // Burning slows the target (refreshed every frame while the beam holds)
    this.applySlow(target, cfg.slow, 0.4);
    // Locked: a small spinning reticle stays under the target while it burns
    this.drawReticle(beam.gfx, fx, fy, 0, t, 0xf43f5e, 0.55);

    beam.focusMs += delta;
    beam.tickMs += delta;
    const focus = Math.min(1, beam.focusMs / cfg.focusMs);
    let crit = false;
    while (beam.tickMs >= cfg.tickMs && !target.isDead) {
      beam.tickMs -= cfg.tickMs;
      if (Math.random() < cfg.missChance * (1 - focus)) {
        this.popBeamNumber(target, 'miss');
      } else if (Math.random() < cfg.baseCrit + (cfg.maxCrit - cfg.baseCrit) * focus) {
        crit = true;
        const dmg = Math.round(cfg.damage * cfg.critMultiplier);
        this.damageInvader(target, dmg, '⚡ Critical Smite!');
        this.popBeamNumber(target, 'crit', dmg);
      } else {
        this.damageInvader(target, cfg.damage, undefined, true);
        this.popBeamNumber(target, 'hit', cfg.damage);
      }
    }
    if (crit) soundFx.playLaser();

    // Scorch the ground under the target
    beam.scarMs += delta;
    const sc = cfg.scars;
    if (beam.scarMs >= sc.everyMs) {
      beam.scarMs = 0;
      const sx = target.container.x;
      const sy = target.container.y;
      if (!this.scars.some((s) => Math.hypot(s.x - sx, (s.y - sy) * 2) < sc.radius)) {
        if (this.scars.length >= sc.max) this.scars.shift();
        this.scars.push({ x: sx, y: sy, life: sc.seconds * 1000, tick: 0 });
      }
    }
    if (target.isDead) return;

    // Keep the beam above the units drawn after it
    if (this.parentContainer) this.parentContainer.bringToTop(beam.gfx);
    const x = target.container.x;
    const y = target.container.y - 12;
    const top = y - 320;
    const flicker = 0.75 + 0.25 * Math.sin(t / 30);
    // Hotter colour and wider beam as the focus (crit chance) builds
    const color = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0x22d3ee), Phaser.Display.Color.ValueToColor(0xf43f5e), 100, Math.round(focus * 100));
    const hot = Phaser.Display.Color.GetColor(color.r, color.g, color.b);
    const width = 4 + focus * 6 + (crit ? 8 : 0);
    const g = beam.gfx;
    g.fillStyle(hot, 0.18 * flicker);
    g.fillTriangle(x - width * 2.2, top, x + width * 2.2, top, x, y);
    g.lineStyle(width * 2, hot, 0.35 * flicker);
    g.lineBetween(x, top, x, y);
    g.lineStyle(width, hot, 0.8);
    g.lineBetween(x, top, x, y);
    g.lineStyle(Math.max(1.5, width * 0.35), 0xffffff, 1);
    g.lineBetween(x, top, x, y);
    // Impact: pulsing ring + scorch glow, a focus ring that closes in as crit chance builds
    const pulse = 6 + 3 * Math.sin(t / 45) + (crit ? 10 : 0);
    g.fillStyle(0xffffff, 0.9);
    g.fillEllipse(x, y + 10, pulse * 1.4, pulse * 0.6);
    g.fillStyle(hot, 0.4 * flicker);
    g.fillEllipse(x, y + 10, pulse * 3, pulse * 1.3);
    const ring = 26 - focus * 14;
    g.lineStyle(1.5, hot, 0.5 + focus * 0.5);
    g.strokeEllipse(x, y + 10, ring * 2, ring);
    // Sparks thrown off the impact
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * (10 + focus * 12);
      g.fillStyle(i % 2 ? 0xffffff : hot, 0.9);
      g.fillRect(x + Math.cos(a) * r, y + 10 + Math.sin(a) * r * 0.5 - Math.random() * 8, 2, 2);
    }
    // Hit flash on the target itself
    if (crit && target.sprite) {
      const sprite = target.sprite;
      hitReaction(this.scene, sprite);
    }
  }

  public smiteClosestInvader(worldX?: number, worldY?: number, isAutoTap: boolean = false, power: number = 1): boolean {
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

    const smiteDmg = Math.round(35 * power);
    this.damageInvader(closest, smiteDmg, power > 1 ? '⚡ Critical Smite!' : isAutoTap ? `⚡ -${smiteDmg} AUTO` : `⚡ -${smiteDmg} SMITE`);

    this.scene.tweens.add({
      targets: boltGfx,
      alpha: 0,
      duration: 200,
      ease: 'Linear',
      onComplete: () => boltGfx.destroy(),
    });

    return true;
  }

  public tapInvader(invader: ActiveInvader, power: number = 1): void {
    if (invader.isDead) return;
    if (invader.isScout && !useGameStore.getState().invasion.isActive) {
      this.eliminateInvader(invader);
    } else {
      this.strikeInvaderWithLightning(invader, power);
    }
  }

  public strikeInvaderWithLightning(invader: ActiveInvader, power: number = 1): void {
    const smiteDmg = Math.round(35 * power);
    this.damageInvader(invader, smiteDmg, power > 1 ? '⚡ Critical Smite!' : '⚡ Smite');
    soundFx.playLaser();

    // Visual electric flash
    if (invader.sprite) {
      const sprite = invader.sprite;
      hitReaction(this.scene, sprite);
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
    if (devFlag('oneHitKill')) rawDamage = Math.max(rawDamage, 1e7);
    if ((invader.invulnTimer ?? 0) > 0) {
      if (popupText) this.spawnFloatingPopup(invader.container.x, invader.container.y - 24, '🛡️ Immune', '#fde68a');
      return;
    }
    let damage = this.modifiedDamage(invader, rawDamage);
    if (invader.defence) damage = Math.max(1, Math.round(damage * (1 - invader.defence)));

    invader.hp -= damage;
    this.renderHpBar(invader.hpBarGfx, invader.hp, invader.maxHp, invader.defence);
    if (invader.sprite) {
      const sprite = invader.sprite;
      hitReaction(this.scene, sprite);
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
    // Shield Wall: the melee front line shrugs off part of every hit
    if (this.tactic.effect === 'SHIELD_WALL' && (INVADER_CONFIGS[invader.type].attackRange ?? 50) <= TACTIC_EFFECTS.SHIELD_WALL.meleeRange) {
      mult *= TACTIC_EFFECTS.SHIELD_WALL.meleeDamageTaken;
    }
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
    const pos = this.nav ? this.nav.pushOut(nx, ny, 0.2, invaderMoveMode(invader.type)) : { x: nx, y: ny };
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
  /** Technician raid: hackers still to send this wave and the spawn count that triggers them. */
  private raidsLeft = 0;
  /** This wave's squad at each open rift, and the rifts whose General has yet to step out. */
  private squads = new Map<PortalState, SquadId>();
  private commandersDue: PortalState[] = [];
  private raidAt = 0;
  /** V4 Rocket Launcher raid: launchers still to send this wave and the spawn count that triggers them. */
  private launchersLeft = 0;
  private launcherAt = 0;
  private rocketReticles = new Map<string, Phaser.GameObjects.Graphics>();
  private hackBars = new Map<string, Phaser.GameObjects.Graphics>();
  public markStructure(id: string, seconds: number): void {
    this.markedStructures.set(id, this.scene.time.now + seconds * 1000);
  }

  /** Cyber Command: mecha attack 25% faster while a Mecha Valkyrie lives. */
  private attackRate(invader: ActiveInvader): number {
    const mecha = INVADER_CONFIGS[invader.type].category === 'MECHA';
    const overclock = this.tactic.effect === 'OVERCLOCK' && mecha && !invader.isScout ? TACTIC_EFFECTS.OVERCLOCK.mechaAttackRate : 1;
    return (auras.cyberCommand && mecha ? 0.8 : 1) * overclock;
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
    if (!invader.isScout) this.tickTacticEffect(invader, deltaSec);
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

  /** Wave-wide tactic effects: Sanctuary mends humans, War Cry enrages the wounded. */
  private tickTacticEffect(invader: ActiveInvader, deltaSec: number): void {
    const effect = this.tactic.effect;
    if (!effect || invader.isDead || !useGameStore.getState().invasion.isActive) return;
    if (effect === 'SANCTUARY' && INVADER_CONFIGS[invader.type].category === 'HUMAN' && invader.hp < invader.maxHp) {
      invader.hp = Math.min(invader.maxHp, invader.hp + invader.maxHp * TACTIC_EFFECTS.SANCTUARY.humanRegenPctPerSec * deltaSec);
      this.renderHpBar(invader.hpBarGfx, invader.hp, invader.maxHp);
    } else if (effect === 'WAR_CRY' && !invader.enraged && invader.hp < invader.maxHp * TACTIC_EFFECTS.WAR_CRY.lowHpThreshold) {
      invader.enraged = true;
      invader.damage = Math.round(invader.damage * TACTIC_EFFECTS.WAR_CRY.lowHpDamage);
      if (invader.sprite?.active) invader.sprite.setTint(0xfca5a5);
    }
  }

  /** Scouts scatter coins and supplies on the ground for minions to pick up. */
  private dropScoutLoot(invader: ActiveInvader): void {
    const store = useGameStore.getState();
    const drops = rollScoutDrops(invader.scoutKind ?? 'HUMAN', store.invasion.waveNumber);
    const { x, y } = invader.container;
    const coins = drops.coinPiles.reduce((sum, n) => sum + n, 0);
    if (this.groundLoot) {
      // Scout spoils wait on the ground for a General to collect them (gold glow)
      const spoils = { generalsOnly: true, life: SCOUT_SPOILS_LIFE };
      for (const pile of drops.coinPiles) this.groundLoot.dropLoot(x, y, 'coins', pile, undefined, spoils);
      for (const [key, amount] of drops.resources) this.groundLoot.dropLoot(x, y, key, amount, undefined, spoils);
    } else {
      // No ground loot layer (tests): credit the drops directly
      const bundle: Partial<Resources> = { coins };
      for (const [key, amount] of drops.resources) bundle[key] = (bundle[key] ?? 0) + amount;
      store.addResources(bundle);
    }
    logMessage('scoutLoot', { name: this.logName(invader), coins }, { mergeKey: 'scoutLoot' });
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
      if (invader.stolen) {
        useGameStore.getState().addResources(invader.stolen);
        logMessage('scoutLootRecovered', { coins: invader.stolen.coins ?? 0 });
      }
      invader.isDead = true;
      invader.hp = 0;
      soundFx.playExplosion();
      this.dropScoutLoot(invader);
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
    if (invader.runeDrop) this.dropRune(invader);

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
      (w) => w.status === 'COMBAT' && !w.isBrawling && w.hp >= 35 && w.unitClass !== 'AQUA_SLIME' && w.unitClass !== 'MERMAN'
    );
    const currentWeather = useGameStore.getState().weather;

    for (const invader of [...this.invaders]) {
      if (invader.isDead) continue;
      // Winged / rotor invaders fly above their shadow
      if (invader.sprite) {
        const loco = locomotionOf(invader.type);
        if (loco !== 'walk') invader.sprite.setY(applyLocomotion(invader.sprite, invader.shadow, loco, this.scene.time.now, invader.container.x * 0.07, invader.container.x, invader.container.y));
      }
      if (updatePortalTransit(this.ctx, invader, deltaSec)) continue;

      this.tickStatus(invader, deltaSec);
      if (invader.isDead) continue;
      if ((invader.dropTimer ?? 0) > 0) {
        invader.dropTimer = Math.max(0, invader.dropTimer! - deltaSec);
        continue;
      }
      if (invader.type === 'HIGH_PRIEST') this.priestHeal(invader, deltaSec);
      for (const key of ['frozenTimer', 'vulnTimer', 'invulnTimer', 'charmTimer', 'tauntTimer'] as const) {
        if ((invader[key] ?? 0) > 0) invader[key] = Math.max(0, (invader[key] ?? 0) - deltaSec);
      }
      if ((invader.frozenTimer ?? 0) > 0) continue; // Frozen or rooted solid: no moving, no attacking
      if (invader.seaEngaged) continue; // fighting back against a wild faction (WildFactionManager drives it)
      const slow = (invader.slowTimer ?? 0) > 0 ? invader.slowFactor ?? 1 : 1;

      // When castle is crushed (HP = 0) or invader is in retreat mode, they march off the platform with their loot
      if (invader.isRetreating) {
        const done = followPath(this.ctx, invader, invader.speed * (invader.isScout ? 1 : 1.5) * slow * deltaSec);
        if (done) this.leavePlatform(invader);
        continue;
      }

      const weather = invaderWeather(currentWeather, INVADER_CONFIGS[invader.type].category);
      const speed = invader.speed * weather.speed * slow;

      // Technician: hack establishments instead of fighting
      if (invader.isHacker && (invader.charmTimer ?? 0) <= 0 && this.updateHacker(invader, speed, deltaSec)) continue;
      // V4 Rocket Launcher: park at range and shell establishments
      if (invader.isLauncher && (invader.charmTimer ?? 0) <= 0 && this.updateLauncher(invader, speed, deltaSec)) continue;
      // Escort: guard the Technician — only engage minions near it, otherwise stay at its side
      const ward = invader.escortOf;
      if (ward && !ward.isDead && (invader.charmTimer ?? 0) <= 0 && (invader.tauntTimer ?? 0) <= 0) {
        const near = availableDefenders.filter((w) => w.container?.active &&
          Math.hypot(w.container.x - ward.container.x, w.container.y - ward.container.y) <= TECHNICIANS.guardRadius);
        const foe = near.sort((a, b) => Math.hypot(a.container.x - invader.container.x, a.container.y - invader.container.y)
          - Math.hypot(b.container.x - invader.container.x, b.container.y - invader.container.y))[0];
        if (foe) {
          this.fightUnit(invader, { kind: 'worker', worker: foe }, speed, weather.damage, deltaSec);
        } else if (Math.hypot(ward.container.x - invader.container.x, ward.container.y - invader.container.y) > TECHNICIANS.leash) {
          chase(this.ctx, invader, ward.container.x, ward.container.y, speed * 1.1 * deltaSec, deltaSec);
        }
        continue;
      }

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

    // Looters don't fight: they grab what they can from the citadel and run for a rift
    if (invader.isScout && invader.scoutRole === 'LOOTER' && structure.id === 'CASTLE') {
      this.lootCitadel(invader);
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

  /** Sea Folk strike on a minion (same armor, shield and death handling as an invader's). */
  public hurtWorkerFromSea(worker: WorkerInstance, damage: number): void {
    if (worker.isBrawling || worker.hp <= 0 || !worker.container?.active) return;
    this.hitWorker(null, worker, damage);
  }

  /** Rift / Rift Sentinel strike on a minion (same armor, shield and death handling, no invader source). */
  public hurtWorkerFromRift(worker: WorkerInstance, damage: number): void {
    if (worker.isBrawling || worker.hp <= 0 || !worker.container?.active) return;
    this.hitWorker(null, worker, damage);
  }

  /** Invader strike on a defending minion (armor, shields, gore, death / retreat). */
  private hitWorker(invader: ActiveInvader | null, closestDefender: WorkerInstance, baseDmg: number): void {
    if (closestDefender.isBrawling) return;
    const invaderConfig = invader ? INVADER_CONFIGS[invader.type] : null;
    // Seismic Taunt halves damage; Target Lock adds 20%
    const weatherDmg = Math.round(baseDmg *
      ((closestDefender.armorBuffTimer ?? 0) > 0 ? 0.5 : 1) *
      ((closestDefender.markedTimer ?? 0) > 0 ? 1.2 : 1) *
      (useGameStore.getState().defense.forceFieldTimer > 0 ? 0.4 : 1));
    const defenderX = closestDefender.container.x;
    const defenderY = closestDefender.container.y;

    // Hardened Hides skill + regression tiers
    const team = teamBonuses(useGameStore.getState());
    // Iron Resolve skill: Generals (fighters) take less on top
    const teamMitigation = team.minionDamageTaken * (UNIT_CLASSES[closestDefender.unitClass]?.role === 'FIGHTER' ? team.generalDamageTaken : 1);
    const mitigatedDamage = Math.max(1, Math.round(weatherDmg * teamMitigation));

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
      `-${actualDamage} HP ${armorAbsorb > 0 ? '(shielded)' : '💔'}`,
      '#ef4444'
    );

    // Visual projectile / slash from Invader
    if (invader && invaderConfig && invaderConfig.attackRange > 60) {
      shootProjectile(
        { x: invader.container.x, y: invader.container.y - 18 },
        { x: defenderX, y: defenderY - 15 },
        projectileFor(invader.type, invaderConfig.category === 'HUMAN'),
        { tint: invaderConfig.color }
      );
      soundFx.playLaser();
    } else if (invader) {
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
    if (invader.stolen) logMessage('scoutEscapedLoot', { coins: invader.stolen.coins ?? 0 });
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

  /** A looter scout reached the citadel: steal and flee. */
  private lootCitadel(invader: ActiveInvader): void {
    const store = useGameStore.getState();
    const stolen = rollStolen(scoutWave(), store.resources);
    if (Object.keys(stolen).length && store.spendResources(stolen)) {
      invader.stolen = stolen;
      logMessage('scoutStole', { name: this.logName(invader), coins: stolen.coins ?? 0 });
    }
    this.sendHome(invader);
  }

  /** Turns one invader around toward a rift (or its spawn edge). */
  private sendHome(invader: ActiveInvader): void {
    invader.isRetreating = true;
    invader.attackTimer = 9999; // Stop attacking
    invader.emerge = 0;

    const curGrid = Navigation.tileOf(invader.container.x, invader.container.y);
    const portal = invader.portal && invader.portal.mode !== 'destroyed'
      ? invader.portal
      : this.portals?.nearest(invader.container.x, invader.container.y) ?? undefined;
    invader.exitPortal = portal;
    const exitEdge: GridPoint = portal ? portal.site.exit : invader.spawnGrid || { x: 1, y: 1 };
    const allowedTiles = TILES_FOR[invaderMoveMode(invader.type)];
    const returnPath = this.pathfinder.findPath(curGrid.x, curGrid.y, exitEdge.x, exitEdge.y, allowedTiles);

    invader.currentPath = (returnPath && returnPath.length > 0)
      ? returnPath
      : [{ x: curGrid.x, y: curGrid.y }, { x: exitEdge.x, y: exitEdge.y }];
    invader.pathIndex = 0;
  }

  public triggerEnemiesRetreatWithLoot(): void {
    // Every living invader runs back to a rift with its loot
    for (const invader of this.invaders) {
      if (invader.isDead || invader.isRetreating) continue;
      this.sendHome(invader);

      this.spawnFloatingPopup(
        invader.container.x,
        invader.container.y - 30,
        '💰 Looted 50%! Leaving Platform...',
        '#ef4444'
      );
    }
  }

  public wipeAllInvaders(): void {
    for (const plane of this.activeAircraft) plane.destroy();
    this.activeAircraft.clear();
    this.aircraftRemaining = 0;
    for (const beam of this.beams) beam.gfx.destroy();
    this.beams = [];
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
    for (const plane of this.activeAircraft) plane.destroy();
    this.activeAircraft.clear();
    for (const invader of this.invaders) {
      invader.container.destroy();
    }
    this.invaders = [];
  }
}
