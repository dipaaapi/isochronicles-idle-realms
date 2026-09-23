import Phaser from 'phaser';
import { TileInfo, TileType } from '../types/game';
import { TimeOfDayPhase, WeatherType } from '../types/state';
import { IsometricHelper } from './IsometricHelper';
import { ProceduralRenderer } from './ProceduralRenderer';
import { PathfindingService } from './PathfindingService';
import { WorkerManager } from './WorkerManager';
import { InvasionManager } from './InvasionManager';
import { FPSController } from './FPSController';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from './audio/soundFx';

const DAY_NIGHT_CYCLE_DURATION_MS = 240000; // 4 minutes full cycle

interface DayNightKeyframe {
  progress: number; // 0.0 to 1.0
  phase: TimeOfDayPhase;
  r: number;
  g: number;
  b: number;
  alpha: number;
  darkness: number; // 0.0 (high noon) to 1.0 (deep midnight)
}

// 8 continuous ambient lighting keyframes across the 240-second cycle
const DAY_NIGHT_KEYFRAMES: DayNightKeyframe[] = [
  { progress: 0.00, phase: 'NIGHT', r: 8,   g: 13,  b: 32,  alpha: 0.44, darkness: 1.0 },  // Deep Midnight
  { progress: 0.18, phase: 'DAWN',  r: 26,  g: 16,  b: 60,  alpha: 0.32, darkness: 0.75 }, // Pre-dawn Twilight
  { progress: 0.28, phase: 'DAWN',  r: 217, g: 119, b: 6,   alpha: 0.15, darkness: 0.40 }, // Sunrise Golden Peach
  { progress: 0.40, phase: 'DAY',   r: 186, g: 230, b: 253, alpha: 0.04, darkness: 0.08 }, // Morning Soft Sky
  { progress: 0.50, phase: 'DAY',   r: 56,  g: 189, b: 248, alpha: 0.00, darkness: 0.00 }, // High Noon Crisp
  { progress: 0.65, phase: 'DAY',   r: 245, g: 158, b: 11,  alpha: 0.06, darkness: 0.12 }, // Late Afternoon Sun
  { progress: 0.76, phase: 'DUSK',  r: 124, g: 58,  b: 237, alpha: 0.22, darkness: 0.55 }, // Sunset Purple/Amber
  { progress: 0.88, phase: 'NIGHT', r: 15,  g: 23,  b: 42,  alpha: 0.36, darkness: 0.85 }, // Evening Indigo
];

export class MainScene extends Phaser.Scene {
  private mapWidth: number = 10;
  private mapHeight: number = 10;
  private tiles: TileInfo[][] = [];
  private pathfinder!: PathfindingService;
  private workerManager!: WorkerManager;
  private invasionManager!: InvasionManager;
  private fpsController!: FPSController;

  // Island Root Container for gentle floating bobbing
  private islandContainer!: Phaser.GameObjects.Container;
  private tileGraphics!: Phaser.GameObjects.Graphics;
  private castleContainer?: Phaser.GameObjects.Container;
  private portContainer?: Phaser.GameObjects.Container;
  private mineContainer?: Phaser.GameObjects.Container;
  private tileCoordinateLabels: Phaser.GameObjects.Text[] = [];
  private currentPlatformPhase: 1 | 2 | 3 | 4 = 1;

  // Continuous Day / Night System
  private cycleTimer: number = 120000; // Start at Day (0.5 progress)
  private currentPhase: TimeOfDayPhase = 'DAY';
  private dayNightOverlay!: Phaser.GameObjects.Graphics;
  private nightGlowGraphics!: Phaser.GameObjects.Graphics;

  // Dirty-check caches for day/night store writes (avoid every-frame React re-renders)
  private _lastPhaseWritten: TimeOfDayPhase = 'DAY';
  private _lastDarknessWritten: number = -1;
  private _dayProgressWriteTimer: number = 0;
  private static readonly DAY_PROGRESS_WRITE_INTERVAL_MS = 500; // write every 500ms

  // Dynamic Resource Landmarks
  private landmarkContainers: Map<'AETHER' | 'STONE' | 'WOOD' | 'ESSENCE', Phaser.GameObjects.Container> = new Map();
  private lastDynamicNodesKey: string = '';

  // Camera Drag State
  private isDragging: boolean = false;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private cameraStartX: number = 0;
  private cameraStartY: number = 0;

  // Weather System
  private currentWeather: WeatherType = 'CLEAR';
  private weatherParticles: Phaser.GameObjects.Graphics[] = [];
  private weatherOverlay!: Phaser.GameObjects.Graphics;
  private weatherTimer: number = 0;

  // Throttle roster sync (avoid JSON.stringify every frame)
  private _rosterSyncTimer: number = 0;
  private static readonly ROSTER_SYNC_INTERVAL_MS = 250;

  // Cached targetFps from store (avoid per-frame getState())
  private _cachedTargetFps: number = 60;

  // FPS debug overlay text
  private _fpsDebugText: Phaser.GameObjects.Text | null = null;
  private _fpsDebugUpdateTimer: number = 0;
  private static readonly FPS_DEBUG_UPDATE_MS = 200; // refresh every 200ms

  // Merchant/blessing tick accumulator so we only call store every 100ms
  private _merchantTickAccum: number = 0;
  private _blessingTickAccum: number = 0;
  private static readonly TICK_ACCUMULATE_MS = 100;

  // Scout spawn accumulator (random loot drops during non-wave periods)
  private _scoutSpawnAccum: number = 0;
  private _nextScoutInterval: number = 35000; // ms until next scout wave

  constructor() {
    super({ key: 'MainScene' });
  }

  create(): void {
    // Cache initial FPS target
    const initialState = useGameStore.getState();
    this._cachedTargetFps = initialState.targetFps;

    // Create FPS controller
    this.fpsController = new FPSController(this._cachedTargetFps);

    // 1. Atmospheric void background & drifting motes
    this.createAtmosphere();

    // 2. Island Root Container (bobbing motion)
    this.islandContainer = this.add.container(0, 0);

    // 3. Generate Map Data with all 4 work nodes + Nexus
    this.generateIslandData();

    // 4. Render Procedural Island into islandContainer
    this.renderIsland();
    this.createTileCoordinateLabels(initialState.showTileCoordinates);

    // 5. Initialize Pathfinding
    this.initPathfinding();

    // 6. Initialize Worker Automaton Manager inside islandContainer
    this.workerManager = new WorkerManager(
      this,
      this.pathfinder,
      { x: 5, y: 5 }, // Nexus Prime base location
      this.islandContainer
    );

    // Sync workers with the Zustand roster (initial, forced)
    const initialRoster = initialState.roster;
    this.workerManager.syncWithRoster(initialRoster);

    // 7. Initialize Void Invasion & Castle Defense Manager
    this.invasionManager = new InvasionManager(
      this,
      this.pathfinder,
      this.islandContainer
    );
    this.invasionManager.setWorkerProvider(() => this.workerManager.getWorkers());
    this.workerManager.setInvasionManager(this.invasionManager);

    // 8. Day/Night Lighting Overlay & Glow Layer
    this.setupDayNightLighting();

    // 9. Weather Overlay (above day/night but below UI)
    this.weatherOverlay = this.add.graphics();
    this.weatherOverlay.setDepth(4500);

    // 10. Setup Camera Controls
    this.setupCamera();

    // 11. FPS debug overlay text (hidden by default)
    this._fpsDebugText = this.add.text(8, 8, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#00ff88',
      stroke: '#000000',
      strokeThickness: 3,
      backgroundColor: '#00000066',
      padding: { x: 4, y: 2 },
    });
    this._fpsDebugText.setDepth(99999);
    this._fpsDebugText.setScrollFactor(0); // fixed to camera
    this._fpsDebugText.setVisible(initialState.showFpsDebug ?? false);
  }

  private createAtmosphere(): void {
    const bgGraphics = this.add.graphics();
    bgGraphics.fillGradientStyle(0x020617, 0x020617, 0x090d16, 0x0f172a, 0.25);
    bgGraphics.fillRect(-3000, -3000, 6000, 6000);
    bgGraphics.setDepth(-1000);

    // Deep Aether Dust Motes — count scales with quality tier
    const moteCount = 45;
    for (let i = 0; i < moteCount; i++) {
      const px = Phaser.Math.Between(-500, 500);
      const py = Phaser.Math.Between(-400, 400);
      const radius = Phaser.Math.FloatBetween(1, 2.8);
      const color = i % 3 === 0 ? 0x38bdf8 : i % 3 === 1 ? 0xa855f7 : 0xe0f2fe;

      const speck = this.add.circle(px, py, radius, color, 0.3);
      speck.setDepth(-500);

      this.tweens.add({
        targets: speck,
        y: py - Phaser.Math.Between(30, 60),
        x: px + Phaser.Math.Between(-20, 20),
        alpha: Phaser.Math.FloatBetween(0.5, 0.8),
        duration: Phaser.Math.Between(5000, 9000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private createTileCoordinateLabels(visible: boolean): void {
    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const position = IsometricHelper.gridToScreen(x, y);
        const label = this.add.text(position.x, position.y + 12, `${x},${y}`, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#e0f2fe',
          backgroundColor: '#020617aa',
          padding: { x: 2, y: 1 },
        });
        label.setOrigin(0.5);
        label.setDepth(10001);
        label.setAlpha(0.75);
        label.setVisible(visible);
        this.islandContainer.add(label);
        this.tileCoordinateLabels.push(label);
      }
    }
  }

  private generateIslandData(): void {
    const matrix: TileInfo[][] = [];

    for (let y = 0; y < this.mapHeight; y++) {
      const row: TileInfo[] = [];
      for (let x = 0; x < this.mapWidth; x++) {
        let type: TileType = 'AETHER_GRASS';
        let walkable = true;

        if ((x === 0 && y === 0) || (x === 9 && y === 0) || (x === 0 && y === 9) || (x === 9 && y === 9)) {
          type = 'SPAWN_BLOCK';
        } else if (x === 0 || y === 0 || x === this.mapWidth - 1 || y === this.mapHeight - 1) {
          type = 'OCEAN_BLOCK';
          walkable = false;
        } else if (x === 5 && y === 5) {
          type = 'NEXUS_BASE'; // Nexus Prime
        } else if (x === 1 && y === 1) {
          type = 'AETHER_CRYSTAL'; // Aether Shard Spire
        } else if (x === 8 && y === 2) {
          type = 'RUNIC_PILLAR'; // Quarry Stone Node
        } else if (x === 8 && y === 8) {
          type = 'ANCIENT_GROVE'; // Grove Wood Node
        } else if (x === 1 && y === 8) {
          type = 'MYSTIC_CAVE'; // Mystic Void Cave for Essence
        } else if (
          // Stone pathways connecting nodes to Nexus (5,5)
          (x === 5 && y >= 1 && y <= 8) ||
          (y === 5 && x >= 1 && x <= 8) ||
          (x === 2 && y === 2) || (x === 3 && y === 3) || (x === 4 && y === 4) ||
          (x === 7 && y === 3) || (x === 6 && y === 4) ||
          (x === 7 && y === 7) || (x === 6 && y === 6) ||
          (x === 2 && y === 7) || (x === 3 && y === 6) || (x === 4 && y === 5)
        ) {
          type = 'ANCIENT_STONE';
        }

        row.push({
          x,
          y,
          type,
          walkable,
          elevation: 0,
        });
      }
      matrix.push(row);
    }

    this.tiles = matrix;
  }

  private renderIsland(): void {
    this.tileGraphics = this.add.graphics();
    this.islandContainer.add(this.tileGraphics);
    this.currentPlatformPhase = useGameStore.getState().platformPhase || 1;

    this.renderPlatformTiles();

    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const tile = this.tiles[y][x];
        const screenPos = IsometricHelper.gridToScreen(x, y);
        const depth = IsometricHelper.getDepth(x, y, 0);

        // Static Nexus Prime structure
        if (tile.type === 'NEXUS_BASE') {
          const structContainer = this.add.container(screenPos.x, screenPos.y);
          const structGfx = this.add.graphics();
          ProceduralRenderer.drawNexusStructure(structGfx, 0, 0);
          structContainer.add(structGfx);
          structContainer.setDepth(depth + 8);
          structContainer.setVisible(useGameStore.getState().castleBuilt);
          this.castleContainer = structContainer;
          this.islandContainer.add(structContainer);

          this.tweens.add({
            targets: structGfx,
            alpha: 0.85,
            duration: 1600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });

          // Interactive Castle Center
          const hitArea = new Phaser.Geom.Polygon([
            -32, 0,
            0, -38,
            32, 0,
            0, 32,
          ]);
          structContainer.setInteractive(hitArea, Phaser.Geom.Polygon.Contains);
          structContainer.input?.cursor && (structContainer.input.cursor = 'pointer');

          structContainer.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (pointer.leftButtonDown()) {
              const def = useGameStore.getState().defense;
              const isFull = def.castleHp >= def.castleMaxHp;
              soundFx.playGolemCheer();
              this.workerManager.spawnHarvestBurst(screenPos.x, screenPos.y - 15, isFull ? 0xfbbf24 : 0x38bdf8, 8);
              this.workerManager.spawnFloatingPopup(
                screenPos.x,
                screenPos.y - 50,
                isFull ? '👑 Citadel Majesty Active!' : `🏰 Castle HP: ${def.castleHp}/${def.castleMaxHp}`,
                isFull ? '#fbbf24' : '#38bdf8'
              );

              this.tweens.add({
                targets: structContainer,
                scaleX: 1.08,
                scaleY: 1.08,
                duration: 120,
                yoyo: true,
                ease: 'Back.easeOut',
              });
            }
          });
        } else if (tile.type === 'OCEAN_BLOCK') {
          if (Math.random() < 0.35) {
            const waveGfx = this.add.graphics();
            ProceduralRenderer.drawOceanWaves(waveGfx, screenPos.x, screenPos.y - 4);
            waveGfx.setDepth(depth + 1);
            this.islandContainer.add(waveGfx);

            this.tweens.add({
              targets: waveGfx,
              y: waveGfx.y - 3,
              alpha: 0.5,
              duration: 2000 + Math.random() * 1000,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut',
            });
          }
        } else if (tile.type === 'AETHER_GRASS') {
          if (Math.random() < 0.4) {
            const grassGfx = this.add.graphics();
            ProceduralRenderer.drawGrassTuft(grassGfx, screenPos.x + (Math.random() * 10 - 5), screenPos.y - 8 + (Math.random() * 6 - 3));
            grassGfx.setDepth(depth + 1);
            this.islandContainer.add(grassGfx);

            this.tweens.add({
              targets: grassGfx,
              scaleX: 1.1,
              skewX: 0.05,
              duration: 1500 + Math.random() * 800,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut',
            });
          }
        }
      }
    }

    const portPosition = IsometricHelper.gridToScreen(1, 8);
    this.portContainer = this.add.container(portPosition.x, portPosition.y);
    const portGfx = this.add.graphics();
    ProceduralRenderer.drawWaterPort(portGfx, 0, 0);
    this.portContainer.add(portGfx);
    this.portContainer.setDepth(IsometricHelper.getDepth(1, 8, 7));
    this.portContainer.setVisible(useGameStore.getState().castleBuilt && useGameStore.getState().resourceBuildings.PORT.level >= 1);
    this.islandContainer.add(this.portContainer);

    const minePosition = IsometricHelper.gridToScreen(2, 5);
    this.mineContainer = this.add.container(minePosition.x, minePosition.y);
    const mineGfx = this.add.graphics();
    ProceduralRenderer.drawMetalMine(mineGfx, 0, 0);
    this.mineContainer.add(mineGfx);
    this.mineContainer.setDepth(IsometricHelper.getDepth(2, 5, 7));
    this.mineContainer.setVisible(useGameStore.getState().castleBuilt && useGameStore.getState().resourceBuildings.MINE.level >= 1);
    this.islandContainer.add(this.mineContainer);

    this.updateDynamicLandmarks(true);
  }

  private updateDynamicLandmarks(force: boolean = false): void {
    const dynamicNodes = useGameStore.getState().dynamicResourceNodes || {
      AETHER: { x: 1, y: 1 },
      STONE: { x: 8, y: 2 },
      WOOD: { x: 8, y: 8 },
      ESSENCE: { x: 1, y: 8 },
    };
    const store = useGameStore.getState();

    for (const label of this.tileCoordinateLabels) {
      label.setVisible(store.showTileCoordinates);
    }

    const key = `${store.castleBuilt}|${JSON.stringify(store.resourceBuildings)}|${dynamicNodes.AETHER.x},${dynamicNodes.AETHER.y},${dynamicNodes.AETHER.qualityMultiplier ?? 1}|${dynamicNodes.STONE.x},${dynamicNodes.STONE.y},${dynamicNodes.STONE.qualityMultiplier ?? 1}|${dynamicNodes.WOOD.x},${dynamicNodes.WOOD.y},${dynamicNodes.WOOD.qualityMultiplier ?? 1}|${dynamicNodes.ESSENCE.x},${dynamicNodes.ESSENCE.y},${dynamicNodes.ESSENCE.qualityMultiplier ?? 1}`;
    if (!force && key === this.lastDynamicNodesKey) return;
    this.lastDynamicNodesKey = key;

    const definitions = ([
      {
        type: 'AETHER',
        point: dynamicNodes.AETHER,
        render: (gfx, x, y) => ProceduralRenderer.drawAetherCrystalCluster(gfx, x, y),
        tween: (gfx) => {
          this.tweens.add({
            targets: gfx,
            scaleY: 1.06,
            duration: 2200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        },
      },
      {
        type: 'STONE',
        point: dynamicNodes.STONE,
        render: (gfx, x, y) => ProceduralRenderer.drawRunicPillar(gfx, x, y),
      },
      {
        type: 'WOOD',
        point: dynamicNodes.WOOD,
        render: (gfx, x, y) => ProceduralRenderer.drawGroveTree(gfx, x, y),
      },
    ] as Array<{
      type: 'AETHER' | 'STONE' | 'WOOD';
      point: { x: number; y: number; qualityMultiplier?: number };
      render: (gfx: Phaser.GameObjects.Graphics, x: number, y: number) => void;
      tween?: (gfx: Phaser.GameObjects.Graphics) => void;
    }>).filter((definition) => {
      if (definition.type === 'AETHER') return store.castleBuilt;
      const buildingId = definition.type === 'WOOD' ? 'WOOD' : 'QUARRY';
      return store.castleBuilt && (store.resourceBuildings?.[buildingId]?.level ?? 0) >= 1;
    });

    // Remove landmarks that no longer exist after a reset or regression.
    for (const [type, container] of this.landmarkContainers) {
      if (!definitions.some(def => def.type === type)) {
        container.destroy();
        this.landmarkContainers.delete(type);
      }
    }

    for (const def of definitions) {
      let container = this.landmarkContainers.get(def.type);
      if (container) {
        container.destroy();
      }

      const screenPos = IsometricHelper.gridToScreen(def.point.x, def.point.y);
      const depth = IsometricHelper.getDepth(def.point.x, def.point.y, 0);

      container = this.add.container(0, 0);

      // If enriched by Treant (qualityMultiplier > 1), draw a soft radiant nature bloom halo
      const quality = def.point.qualityMultiplier ?? 1.0;
      if (quality > 1.0) {
        const bloomGfx = this.add.graphics();
        bloomGfx.fillStyle(0x10b981, 0.22);
        bloomGfx.fillEllipse(screenPos.x, screenPos.y, 44, 22);
        bloomGfx.lineStyle(1.5, 0x34d399, 0.7);
        bloomGfx.strokeEllipse(screenPos.x, screenPos.y, 44, 22);
        container.add(bloomGfx);

        this.tweens.add({
          targets: bloomGfx,
          alpha: 0.45,
          scaleX: 1.15,
          scaleY: 1.15,
          duration: 1500,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }

      const gfx = this.add.graphics();
      def.render(gfx, screenPos.x, screenPos.y);
      container.add(gfx);
      container.setDepth(depth + 7);

      this.islandContainer.add(container);
      this.landmarkContainers.set(def.type, container);

      if (def.tween) {
        def.tween(gfx);
      }
    }
  }

  private renderPlatformTiles(): void {
    if (!this.tileGraphics) return;
    this.tileGraphics.clear();
    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const tile = this.tiles[y][x];
        const screenPos = IsometricHelper.gridToScreen(x, y);
        const isAlternate = (x + y) % 2 === 0;
        ProceduralRenderer.drawIsoBlock(
          this.tileGraphics,
          screenPos.x,
          screenPos.y,
          tile.type,
          24,
          isAlternate,
          this.currentPlatformPhase
        );
      }
    }
  }

  private setupDayNightLighting(): void {
    // Night glow layer for landmarks
    this.nightGlowGraphics = this.add.graphics();
    this.nightGlowGraphics.setDepth(3000);
    this.islandContainer.add(this.nightGlowGraphics);

    // Global ambient tint overlay
    this.dayNightOverlay = this.add.graphics();
    this.dayNightOverlay.setDepth(4000);
  }

  /**
   * Smooth continuous RGB and Alpha linear interpolation across the 240s cycle.
   * Optimised: only writes to Zustand when phase or darkness actually change.
   */
  private updateDayNightCycle(delta: number): number {
    this.cycleTimer = (this.cycleTimer + delta) % DAY_NIGHT_CYCLE_DURATION_MS;
    const progress = this.cycleTimer / DAY_NIGHT_CYCLE_DURATION_MS; // 0.0 to 1.0

    // Find surrounding keyframes
    let k1 = DAY_NIGHT_KEYFRAMES[DAY_NIGHT_KEYFRAMES.length - 1];
    let k2 = DAY_NIGHT_KEYFRAMES[0];

    for (let i = 0; i < DAY_NIGHT_KEYFRAMES.length; i++) {
      const cur = DAY_NIGHT_KEYFRAMES[i];
      const nxt = DAY_NIGHT_KEYFRAMES[(i + 1) % DAY_NIGHT_KEYFRAMES.length];

      if (i === DAY_NIGHT_KEYFRAMES.length - 1) {
        if (progress >= cur.progress || progress < nxt.progress) {
          k1 = cur;
          k2 = nxt;
          break;
        }
      } else if (progress >= cur.progress && progress < nxt.progress) {
        k1 = cur;
        k2 = nxt;
        break;
      }
    }

    // Normalized blend factor t between k1 and k2
    let span = k2.progress - k1.progress;
    if (span <= 0) span += 1.0;
    let offset = progress - k1.progress;
    if (offset < 0) offset += 1.0;
    const t = Phaser.Math.Clamp(offset / span, 0, 1);

    // Interpolate RGB
    const r = Math.round(Phaser.Math.Linear(k1.r, k2.r, t));
    const g = Math.round(Phaser.Math.Linear(k1.g, k2.g, t));
    const b = Math.round(Phaser.Math.Linear(k1.b, k2.b, t));
    const overlayAlpha = Phaser.Math.Linear(k1.alpha, k2.alpha, t);
    const ambientDarkness = Phaser.Math.Linear(k1.darkness, k2.darkness, t);

    // Pack RGB
    const colorHex = (r << 16) | (g << 8) | b;
    const phase = t < 0.5 ? k1.phase : k2.phase;

    // ── Dirty-check: only write phase/darkness to Zustand when they change ──
    const darknessRounded = Math.round(ambientDarkness * 100) / 100; // 2dp
    const phaseChanged = phase !== this._lastPhaseWritten;
    const darknessChanged = Math.abs(darknessRounded - this._lastDarknessWritten) >= 0.01;

    if (phaseChanged || darknessChanged) {
      if (phaseChanged && this.currentPhase === 'NIGHT' && phase === 'DAWN') {
        useGameStore.getState().incrementDay();
        this.randomizeWeather();
      }
      if (phaseChanged) {
        this.currentPhase = phase;
        this._lastPhaseWritten = phase;
      }
      if (phaseChanged || darknessChanged) {
        this._lastDarknessWritten = darknessRounded;
        useGameStore.getState().setTimeOfDay(phase, ambientDarkness);
      }
    }

    // ── Throttled dayProgress write (every 500ms) ──
    this._dayProgressWriteTimer += delta;
    if (this._dayProgressWriteTimer >= MainScene.DAY_PROGRESS_WRITE_INTERVAL_MS) {
      this._dayProgressWriteTimer = 0;
      useGameStore.getState().setDayProgress(progress);
    }

    // Render smooth overlay
    this.dayNightOverlay.clear();
    if (overlayAlpha > 0.005) {
      this.dayNightOverlay.fillStyle(colorHex, overlayAlpha);
      this.dayNightOverlay.fillRect(-2500, -2500, 5000, 5000);
    }

    // Render landmark glows at night/dusk
    this.nightGlowGraphics.clear();
    if (ambientDarkness > 0.12) {
      const dynamicNodes = useGameStore.getState().dynamicResourceNodes || {
        AETHER: { x: 1, y: 1 },
        STONE: { x: 8, y: 2 },
        WOOD: { x: 8, y: 8 },
        ESSENCE: { x: 1, y: 8 },
      };
      const nexusPos = IsometricHelper.gridToScreen(5, 5);
      const crystalPos = IsometricHelper.gridToScreen(dynamicNodes.AETHER.x, dynamicNodes.AETHER.y);
      const quarryPos = IsometricHelper.gridToScreen(dynamicNodes.STONE.x, dynamicNodes.STONE.y);
      const grovePos = IsometricHelper.gridToScreen(dynamicNodes.WOOD.x, dynamicNodes.WOOD.y);
      const cavePos = IsometricHelper.gridToScreen(dynamicNodes.ESSENCE.x, dynamicNodes.ESSENCE.y);

      ProceduralRenderer.drawNightGlow(this.nightGlowGraphics, nexusPos.x, nexusPos.y - 12, 44, 0x38bdf8, ambientDarkness * 0.4);
      ProceduralRenderer.drawNightGlow(this.nightGlowGraphics, crystalPos.x, crystalPos.y - 8, 38, 0x06b6d4, ambientDarkness * 0.5);
      ProceduralRenderer.drawNightGlow(this.nightGlowGraphics, quarryPos.x, quarryPos.y - 8, 34, 0xf59e0b, ambientDarkness * 0.35);
      ProceduralRenderer.drawNightGlow(this.nightGlowGraphics, grovePos.x, grovePos.y - 8, 36, 0x10b981, ambientDarkness * 0.35);
      ProceduralRenderer.drawNightGlow(this.nightGlowGraphics, cavePos.x, cavePos.y - 8, 36, 0xa855f7, ambientDarkness * 0.55);
    }

    return ambientDarkness;
  }

  private initPathfinding(): void {
    this.pathfinder = new PathfindingService();
    const walkableGrid: number[][] = [];

    for (let y = 0; y < this.mapHeight; y++) {
      const row: number[] = [];
      for (let x = 0; x < this.mapWidth; x++) {
        // 0 = Land, 1 = Ocean
        row.push(this.tiles[y][x].type === 'OCEAN_BLOCK' ? 1 : 0);
      }
      walkableGrid.push(row);
    }

    this.pathfinder.initGrid(walkableGrid);
  }

  private setupCamera(): void {
    const nexusScreen = IsometricHelper.gridToScreen(5, 5);
    this.cameras.main.centerOn(nexusScreen.x, nexusScreen.y);
    this.cameras.main.setZoom(1.15);

    // Mouse Drag (Pan) & Canvas Tap-to-Smite
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // If an invasion incursion is active, tap anywhere on canvas to Smite nearest invader!
      if (useGameStore.getState().invasion.isActive && this.invasionManager) {
        const localX = pointer.worldX - this.islandContainer.x;
        const localY = pointer.worldY - this.islandContainer.y;
        this.invasionManager.smiteClosestInvader(localX, localY);
      }

      this.isDragging = true;
      this.dragStartX = pointer.x;
      this.dragStartY = pointer.y;
      this.cameraStartX = this.cameras.main.scrollX;
      this.cameraStartY = this.cameras.main.scrollY;
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isDragging) {
        const dx = (pointer.x - this.dragStartX) / this.cameras.main.zoom;
        const dy = (pointer.y - this.dragStartY) / this.cameras.main.zoom;
        this.cameras.main.scrollX = this.cameraStartX - dx;
        this.cameras.main.scrollY = this.cameraStartY - dy;
      }
    });

    this.input.on('pointerup', () => {
      this.isDragging = false;
    });

    // Scroll Wheel Zoom
    this.input.on(
      'wheel',
      (
        _pointer: Phaser.Input.Pointer,
        _gameObjects: unknown[],
        _deltaX: number,
        deltaY: number
      ) => {
        const currentZoom = this.cameras.main.zoom;
        const targetZoom = Phaser.Math.Clamp(currentZoom - deltaY * 0.001, 0.65, 2.2);
        this.cameras.main.setZoom(targetZoom);
      }
    );
  }

  update(time: number, delta: number): void {
    // ── Tick FPS controller first (before any logic) ──────────────────────
    this.fpsController.tick(delta, this._cachedTargetFps);

    // ── Cache the full store state once per frame ─────────────────────────
    const store = useGameStore.getState();

    // ── Game Speed: pause or fast-forward ─────────────────────────────────
    const gameSpeed = store.gameSpeed ?? 1;
    if (gameSpeed === 0) {
      // PAUSED — only animate the island bob, skip all game logic
      this.islandContainer.y = Math.sin(time / 2200) * 4.5;
      return;
    }
    // Apply speed multiplier: 1× or 2×
    const effectiveDelta = delta * gameSpeed;

    // 1. Floating Island Bobbing Motion
    this.islandContainer.y = Math.sin(time / 2200) * 4.5;

    if (this.castleContainer) {
      this.castleContainer.setVisible(store.castleBuilt);
    }
    if (this.portContainer) {
      this.portContainer.setVisible(store.castleBuilt && (store.resourceBuildings?.PORT?.level ?? 0) >= 1);
    }
    if (this.mineContainer) {
      this.mineContainer.setVisible(store.castleBuilt && (store.resourceBuildings?.MINE?.level ?? 0) >= 1);
    }

    // 2. Smooth Continuous Day / Night Cycle
    const ambientDarkness = this.updateDayNightCycle(effectiveDelta);

    // Dynamic Platform Phase Re-skinning (Waves 1-25: Citadel, 26-50: Magma, 51-75: Frost, 76-100: Astral)
    const storePhase = store.platformPhase || 1;
    if (storePhase !== this.currentPlatformPhase) {
      this.currentPlatformPhase = storePhase;
      this.renderPlatformTiles();
    }

    // Refresh dynamic resource nodes (when Treant shifts/replenishes nodes)
    this.updateDynamicLandmarks();

    // 3. Sync workers with Zustand roster — throttled (every 250ms)
    this._rosterSyncTimer += effectiveDelta;
    if (this._rosterSyncTimer >= MainScene.ROSTER_SYNC_INTERVAL_MS) {
      this._rosterSyncTimer = 0;
      this.workerManager.syncWithRoster(store.roster);
    }

    // Update cached targetFps (cheap value comparison, no Zustand call)
    if (store.targetFps !== this._cachedTargetFps) {
      this._cachedTargetFps = store.targetFps;
      this.fpsController.setTargetFps(this._cachedTargetFps);
    }

    this.workerManager.update(time, effectiveDelta, ambientDarkness);

    // 4. Update Invasion Incursions & Automated Castle Turrets
    const isInvading = store.invasion.isActive;
    const weather = store.weather;
    if (isInvading) {
      soundFx.playBackgroundMusic('BATTLE');
    } else if (weather !== 'CLEAR') {
      soundFx.playBackgroundMusic(weather);
    } else {
      soundFx.playBackgroundMusic('LIVELY');
    }

    this.invasionManager?.update(effectiveDelta);

    // 5. Update Weather Particles
    this.updateWeatherParticles(effectiveDelta, store.targetFps, weather);

    // 6. Tick EasyStar pathfinder queue — MUST be called every frame
    this.pathfinder.calculate();

    // 7. Merchant + Blessing ticks — batched (every 100ms) to reduce store writes
    this._merchantTickAccum += effectiveDelta;
    this._blessingTickAccum += effectiveDelta;
    if (this._merchantTickAccum >= MainScene.TICK_ACCUMULATE_MS) {
      const seconds = this._merchantTickAccum / 1000;
      this._merchantTickAccum = 0;
      store.tickMerchantTimer(seconds);
    }
    if (this._blessingTickAccum >= MainScene.TICK_ACCUMULATE_MS) {
      const seconds = this._blessingTickAccum / 1000;
      this._blessingTickAccum = 0;
      store.tickGodBlessings(seconds);
    }

    // 8. FPS debug overlay update (every 200ms)
    if (this._fpsDebugText) {
      const showDebug = store.showFpsDebug ?? false;
      if (this._fpsDebugText.visible !== showDebug) {
        this._fpsDebugText.setVisible(showDebug);
      }
      if (showDebug) {
        this._fpsDebugUpdateTimer += delta;
        if (this._fpsDebugUpdateTimer >= MainScene.FPS_DEBUG_UPDATE_MS) {
          this._fpsDebugUpdateTimer = 0;
          const stats = this.fpsController.getDebugStats();
          const tier = stats.qualityTier;
          const tierColor = tier === 'HIGH' ? '🟢' : tier === 'MEDIUM' ? '🟡' : '🔴';
          this._fpsDebugText.setText(
            `FPS: ${stats.measured} / ${stats.target} ${tierColor}\n` +
            `Frame: ${stats.frameTimeMs.toFixed(1)}ms  Jank: ${stats.jankCount}\n` +
            `Quality: ${tier}${stats.performanceWarning ? '  ⚠️ PERF WARN' : ''}`
          );
          // Report measured FPS to store (throttled, cheap)
          store.setMeasuredFps(stats.measured);
        }
      }
    }

    // 9. Random Scout spawns during non-wave periods (loot drops)
    if (!isInvading) {
      this._scoutSpawnAccum += effectiveDelta;
      if (this._scoutSpawnAccum >= this._nextScoutInterval) {
        this._scoutSpawnAccum = 0;
        // Next interval: 30–65 seconds
        this._nextScoutInterval = (30 + Math.random() * 35) * 1000;
        this.invasionManager?.spawnLootScouts();
      }
    } else {
      // Reset accumulator when invasion starts so scouts don't pile up
      this._scoutSpawnAccum = 0;
    }
  }

  destroy(): void {
    this.workerManager?.destroy();
    this.invasionManager?.destroy();
  }

  private randomizeWeather(): void {
    const weathers: WeatherType[] = ['CLEAR', 'CLEAR', 'RAIN', 'SNOW', 'HEATWAVE'];
    const pick = weathers[Math.floor(Math.random() * weathers.length)];
    this.currentWeather = pick;
    useGameStore.getState().setWeather(pick);
    // Clear old particles
    this.weatherParticles.forEach(p => p.destroy());
    this.weatherParticles = [];
  }

  /**
   * Weather particle system — uses pre-resolved targetFps and weather passed
   * from the update() cache to avoid per-frame getState() calls.
   */
  private updateWeatherParticles(delta: number, targetFps: number, weather: WeatherType): void {
    this.weatherTimer += delta;
    this.weatherOverlay.clear();

    // Early-out for clear weather — no overlay, no particles
    if (weather === 'CLEAR') {
      this.currentWeather = 'CLEAR';
      return;
    }

    // Sync currentWeather (changes handled by randomizeWeather, but keep in sync)
    this.currentWeather = weather;

    const cam = this.cameras.main;
    const camX = cam.scrollX - cam.width / 2;
    const camY = cam.scrollY - cam.height / 2;
    const camW = cam.width / cam.zoom;
    const camH = cam.height / cam.zoom;

    const scaleFactor = this.fpsController.getScaleFactor();
    const isUltra = targetFps >= 90;
    const isSaver = targetFps <= 30;

    if (weather === 'RAIN') {
      // Spawn rain drops — count scales with FPS quality
      const rainThreshold = isSaver ? 60 : isUltra ? 20 : 30;
      if (this.weatherTimer > rainThreshold) {
        this.weatherTimer = 0;
        const baseCount = isSaver ? 2 : isUltra ? 6 : 4;
        const spawnCount = Math.max(1, Math.round(baseCount * scaleFactor));
        for (let i = 0; i < spawnCount; i++) {
          const drop = this.add.graphics();
          const x = camX + Math.random() * camW;
          const y = camY - 20;
          drop.fillStyle(0x60a5fa, 0.5);
          drop.fillRect(0, 0, 1.5, 8);
          drop.setPosition(x, y);
          drop.setDepth(4200);
          (drop as unknown as { _vy: number })._vy = 280 + Math.random() * 120;
          (drop as unknown as { _life: number })._life = 0;
          this.weatherParticles.push(drop);
        }
      }
      const rainAlpha = isSaver ? 0.05 : isUltra ? 0.12 : 0.08;
      this.weatherOverlay.fillStyle(0x1e3a5f, rainAlpha);
      this.weatherOverlay.fillRect(-2500, -2500, 5000, 5000);
    } else if (weather === 'SNOW') {
      const snowThreshold = isSaver ? 120 : isUltra ? 50 : 80;
      if (this.weatherTimer > snowThreshold) {
        this.weatherTimer = 0;
        const baseCount = isSaver ? 1 : isUltra ? 3 : 2;
        const spawnCount = Math.max(1, Math.round(baseCount * scaleFactor));
        for (let i = 0; i < spawnCount; i++) {
          const flake = this.add.graphics();
          const x = camX + Math.random() * camW;
          const y = camY - 10;
          flake.fillStyle(0xe2e8f0, 0.7);
          flake.fillCircle(0, 0, 2 + Math.random() * 1.5);
          flake.setPosition(x, y);
          flake.setDepth(4200);
          (flake as unknown as { _vy: number })._vy = 40 + Math.random() * 30;
          (flake as unknown as { _vx: number })._vx = (Math.random() - 0.5) * 20;
          (flake as unknown as { _life: number })._life = 0;
          this.weatherParticles.push(flake);
        }
      }
      const snowAlpha = isSaver ? 0.03 : isUltra ? 0.08 : 0.05;
      this.weatherOverlay.fillStyle(0xffffff, snowAlpha);
      this.weatherOverlay.fillRect(-2500, -2500, 5000, 5000);
    } else if (weather === 'HEATWAVE') {
      const heatAlpha = isSaver ? 0.04 : isUltra ? 0.12 : 0.08;
      this.weatherOverlay.fillStyle(0xf97316, heatAlpha);
      this.weatherOverlay.fillRect(-2500, -2500, 5000, 5000);
    }

    // Update particles
    const deltaSec = delta / 1000;
    for (let i = this.weatherParticles.length - 1; i >= 0; i--) {
      const p = this.weatherParticles[i] as unknown as Phaser.GameObjects.Graphics & { _vy: number; _vx?: number; _life: number };
      p.y += p._vy * deltaSec;
      if (p._vx) p.x += p._vx * deltaSec;
      p._life += delta;
      if (p._life > 3000 || p.y > camY + camH + 50) {
        p.destroy();
        this.weatherParticles.splice(i, 1);
      }
    }
  }
}
