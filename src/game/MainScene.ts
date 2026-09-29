import Phaser from 'phaser';
import { TileInfo, TileType } from '../types/game';
import { TimeOfDayPhase, WeatherType } from '../types/state';
import { IsometricHelper } from './IsometricHelper';
import { ProceduralRenderer, getTileColors } from './ProceduralRenderer';
import {
  paintTile,
  ART_PIXEL,
  TILE_ART_W,
  TILE_ART_H,
  TILE_FRAME_OFFSET_X,
  TILE_FRAME_OFFSET_Y,
  WATER_DROP_WORLD,
} from './PixelTileArt';
import { PathfindingService } from './PathfindingService';
import { WorkerManager } from './WorkerManager';
import { InvasionManager } from './InvasionManager';
import { FPSController } from './FPSController';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from './audio/soundFx';
import { prepareCharacterSprites } from './sprites/CharacterSprites';
import { prepareStructureSprites } from './sprites/StructureSprites';
import { WorldEffects } from './WorldEffects';
import { Navigation } from './Navigation';
import { StructureManager } from './StructureManager';
import { PortalManager } from './PortalManager';
import { TowerSystem } from './TowerSystem';
import {
  BUILDING_IDS,
  BUILDING_SITES,
  CASTLE_FOOTPRINT,
  CASTLE_GATE,
  ROAD_TILES,
  SPIRE_FOOTPRINT,
  TileRect,
  rectCenter,
  rectContainsTile,
} from '../state/buildingLayout';

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
  private tileAtlas?: Phaser.Textures.CanvasTexture;
  private tileImages: Phaser.GameObjects.Image[] = [];
  // Living-world effects: ground layer sits right above the tiles, air layer above every unit
  private skyFxLayer!: Phaser.GameObjects.Container;
  private groundFxLayer!: Phaser.GameObjects.Container;
  private airFxLayer!: Phaser.GameObjects.Container;
  private worldEffects?: WorldEffects;
  /** Buildings, portals, units and combat effects — depth-sorted by feet position every frame. */
  private entityLayer!: Phaser.GameObjects.Container;
  private nav!: Navigation;
  private structures!: StructureManager;
  private portals!: PortalManager;
  private towers!: TowerSystem;
  private bloomGfx?: Phaser.GameObjects.Graphics;
  private lastBloomKey: string = '';
  private tileCoordinateLabels: Phaser.GameObjects.Text[] = [];
  private static readonly TILE_ATLAS_KEY = 'iso-pixel-tiles';
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

  // High-DPI: the canvas renders at devicePixelRatio, so camera zoom = userZoom * dpr
  private dpr: number = 1;
  private userZoom: number = 1.15;

  constructor() {
    super({ key: 'MainScene' });
  }

  create(): void {
    // Tiyaking laging 100% transparent ang camera clear color
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    this.cameras.main.transparent = true;

    // High-DPI: PhaserGame publishes devicePixelRatio; every Text renders at matching resolution
    this.dpr = (this.registry.get('dpr') as number | undefined) ?? 1;
    this.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, (obj: Phaser.GameObjects.GameObject) => {
      if (obj instanceof Phaser.GameObjects.Text) {
        obj.setResolution(this.getTextResolution());
      }
    });
    const onDprChange = (_parent: unknown, value: number) => {
      this.dpr = value;
      this.applyZoom();
    };
    this.registry.events.on('changedata-dpr', onDprChange);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.registry.events.off('changedata-dpr', onDprChange);
    });

    // Cache initial FPS target
    const initialState = useGameStore.getState();
    this._cachedTargetFps = initialState.targetFps;

    // Bake building/portal strips and 8-direction minion + enemy sheets off-thread (cached for the page lifetime)
    prepareStructureSprites(this, () => {
      this.structures?.onStripReady();
      this.portals?.onStripReady();
    });
    prepareCharacterSprites(this);

    // Create FPS controller
    this.fpsController = new FPSController(this._cachedTargetFps);

    // 1. Atmospheric floating motes (Inalis ang madilim na gradient rectangle)
    this.createAtmosphere();

    // 2. Island Root Container (bobbing motion)
    this.islandContainer = this.add.container(0, 0);

    // 3. Generate Map Data with all 4 work nodes + Nexus
    this.generateIslandData();

    // 4. Render Procedural Island into islandContainer (tiles, labels, then the entity layer)
    this.renderIsland(initialState.showTileCoordinates);

    // 5. Initialize Pathfinding + solid footprints, structures and portals
    this.initPathfinding();
    this.structures = new StructureManager(this, this.entityLayer, this.groundFxLayer, this.nav);
    this.portals = new PortalManager(this, this.entityLayer);

    // 6. Initialize Worker Automaton Manager (minions live in the entity layer)
    this.workerManager = new WorkerManager(
      this,
      this.pathfinder,
      CASTLE_GATE, // Deposits and spawns happen at the citadel gate
      this.entityLayer
    );
    this.workerManager.setWorld({ nav: this.nav, portals: this.portals });

    // Sync workers with the Zustand roster (initial, forced)
    const initialRoster = initialState.roster;
    this.workerManager.syncWithRoster(initialRoster);

    // 7. Initialize Void Invasion & Castle Defense Manager
    this.invasionManager = new InvasionManager(
      this,
      this.pathfinder,
      this.entityLayer
    );
    this.invasionManager.setWorkerProvider(() => this.workerManager.getWorkers());
    this.towers = new TowerSystem(this, this.entityLayer, this.groundFxLayer, this.structures, this.invasionManager, this.nav);
    this.invasionManager.setWorld({
      nav: this.nav,
      structures: this.structures,
      portals: this.portals,
      blockers: () => this.towers.getBlockers(),
    });
    this.structures.setInvaderProvider(() => this.invasionManager.getInvaders());

    this.airFxLayer = this.add.container(0, 0);
    this.islandContainer.add(this.airFxLayer);
    this.worldEffects = new WorldEffects(
      this,
      this.skyFxLayer,
      this.groundFxLayer,
      this.airFxLayer,
      this.tiles,
      () => [
        ...this.workerManager.getWorkers().map((w) => w.container),
        ...this.invasionManager.getInvaders().map((i) => i.container),
      ],
      this.getIslandBounds()
    );
    this.workerManager.setInvasionManager(this.invasionManager);

    // 8. Day/Night Lighting Overlay & Glow Layer
    this.setupDayNightLighting();

    // 9. Weather Overlay (screen-space, fixed to camera viewport)
    this.weatherOverlay = this.add.graphics();
    this.weatherOverlay.setDepth(4500);
    this.weatherOverlay.setScrollFactor(0);

    // 10. Setup Camera Controls
    this.setupCamera();

    // 11. FPS debug overlay text
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
    this._fpsDebugText.setScrollFactor(0);
    this._fpsDebugText.setVisible(initialState.showFpsDebug ?? false);
  }

  private createAtmosphere(): void {
    // TINANGGAL: bgGraphics.fillGradientStyle at fillRect na nagiging dim box kapag nag-zoom out

    // Deep Aether Dust Motes
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

  /** Text resolution high enough to stay sharp at max zoom on this display. */
  private getTextResolution(): number {
    return Math.min(4, Math.ceil(this.dpr * 2));
  }

  /**
   * Chess-style tile names: letters A–J run along X, numbers 1–10 along Y.
   * Each tile shows its name at the centre of its top face, and the island's
   * front edges carry large rank/file markers like a chessboard border.
   */
  private createTileCoordinateLabels(visible: boolean): void {
    const tileStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: '"Fira Code", monospace',
      fontSize: '10px',
      fontStyle: 'bold',
      color: '#f8fafc',
      stroke: '#0f0a1e',
      strokeThickness: 3,
    };
    const edgeStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'Cinzel, serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#fbbf24',
      stroke: '#1c0a14',
      strokeThickness: 4,
    };

    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const position = IsometricHelper.gridToScreen(x, y);
        const surfaceY = position.y + (this.tiles[y][x].type === 'OCEAN_BLOCK' ? WATER_DROP_WORLD : 0);
        const label = this.add.text(position.x, surfaceY, IsometricHelper.tileName(x, y), tileStyle);
        label.setOrigin(0.5);
        label.setAlpha(0.8);
        this.addCoordinateLabel(label, visible);
      }
    }

    // File letters along the front-left edge (X axis), rank numbers along the front-right edge (Y axis)
    for (let x = 0; x < this.mapWidth; x++) {
      const position = IsometricHelper.gridToScreen(x, this.mapHeight);
      const label = this.add.text(position.x - 10, position.y + 4, IsometricHelper.fileLetter(x), edgeStyle);
      label.setOrigin(0.5);
      this.addCoordinateLabel(label, visible);
    }
    for (let y = 0; y < this.mapHeight; y++) {
      const position = IsometricHelper.gridToScreen(this.mapWidth, y);
      const label = this.add.text(position.x + 10, position.y + 4, `${y + 1}`, edgeStyle);
      label.setOrigin(0.5);
      this.addCoordinateLabel(label, visible);
    }
  }

  private addCoordinateLabel(label: Phaser.GameObjects.Text, visible: boolean): void {
    label.setDepth(10001);
    label.setVisible(visible);
    this.islandContainer.add(label);
    this.tileCoordinateLabels.push(label);
  }

  private generateIslandData(): void {
    const matrix: TileInfo[][] = [];
    const footprints: TileRect[] = [CASTLE_FOOTPRINT, ...BUILDING_IDS.map((id) => BUILDING_SITES[id].footprint)];
    const roads = new Set(ROAD_TILES.map((t) => `${t.x},${t.y}`));

    for (let y = 0; y < this.mapHeight; y++) {
      const row: TileInfo[] = [];
      for (let x = 0; x < this.mapWidth; x++) {
        let type: TileType = 'AETHER_GRASS';
        let walkable = true;

        if ((x === 0 && y === 0) || (x === 9 && y === 0) || (x === 0 && y === 9) || (x === 9 && y === 9)) {
          type = 'SPAWN_BLOCK'; // invader portals stand here
        } else if (x === 0 || y === 0 || x === this.mapWidth - 1 || y === this.mapHeight - 1) {
          type = 'OCEAN_BLOCK';
          walkable = false;
        } else if (rectContainsTile(CASTLE_FOOTPRINT, x, y)) {
          type = 'NEXUS_BASE';
        } else if (rectContainsTile(SPIRE_FOOTPRINT, x, y)) {
          type = 'AETHER_GRASS';
        } else if (footprints.some((f) => rectContainsTile(f, x, y)) || roads.has(`${x},${y}`)) {
          type = 'ANCIENT_STONE'; // paved foundations and roads
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

  private renderIsland(showTileCoordinates: boolean): void {
    this.currentPlatformPhase = useGameStore.getState().platformPhase || 1;

    // Sun, moon and stars sit behind the tiles so the island hides them at the horizon
    this.skyFxLayer = this.add.container(0, 0);
    this.islandContainer.add(this.skyFxLayer);
    this.createTileSprites();
    this.groundFxLayer = this.add.container(0, 0);
    this.islandContainer.add(this.groundFxLayer);

    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const tile = this.tiles[y][x];
        if (tile.type !== 'OCEAN_BLOCK' || Math.random() >= 0.35) continue;
        const screenPos = IsometricHelper.gridToScreen(x, y);
        const waveGfx = this.add.graphics();
        ProceduralRenderer.drawOceanWaves(waveGfx, screenPos.x, screenPos.y - 4 + WATER_DROP_WORLD);
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
    }

    // Enriched-node blooms lie on the ground; tile names above them
    this.bloomGfx = this.add.graphics();
    this.groundFxLayer.add(this.bloomGfx);
    this.createTileCoordinateLabels(showTileCoordinates);

    // Everything that stands on the island is y-sorted in this layer
    this.entityLayer = this.add.container(0, 0);
    this.islandContainer.add(this.entityLayer);
  }

  /** Label visibility + green blooms under nodes the Ent has enriched. */
  private updateDynamicLandmarks(): void {
    const store = useGameStore.getState();
    for (const label of this.tileCoordinateLabels) {
      if (label.visible !== store.showTileCoordinates) label.setVisible(store.showTileCoordinates);
    }

    const nodes = store.dynamicResourceNodes;
    const spots: Array<[TileRect, number | undefined]> = [
      [SPIRE_FOOTPRINT, nodes?.AETHER?.qualityMultiplier],
      [BUILDING_SITES.QUARRY.footprint, nodes?.STONE?.qualityMultiplier],
      [BUILDING_SITES.WOOD.footprint, nodes?.WOOD?.qualityMultiplier],
      [BUILDING_SITES.CAVE.footprint, nodes?.ESSENCE?.qualityMultiplier],
    ];
    const key = spots.map(([, q]) => (q ?? 1).toFixed(2)).join('|');
    if (key === this.lastBloomKey || !this.bloomGfx) return;
    this.lastBloomKey = key;
    const g = this.bloomGfx;
    g.clear();
    for (const [rect, quality] of spots) {
      if ((quality ?? 1) <= 1) continue;
      const c = rectCenter(rect);
      const p = IsometricHelper.gridToScreen(c.x, c.y);
      g.fillStyle(0x10b981, 0.2);
      g.fillEllipse(p.x, p.y, rect.w * 66, rect.h * 33);
      g.lineStyle(1.5, 0x34d399, 0.7);
      g.strokeEllipse(p.x, p.y, rect.w * 66, rect.h * 33);
    }
  }

  /**
   * Creates one pixel-art Image per tile, all sharing a single atlas texture
   * (one GPU batch). Container children draw in insertion order, so tiles are
   * added back-to-front before any structures or units.
   */
  private createTileSprites(): void {
    const key = MainScene.TILE_ATLAS_KEY;
    if (this.textures.exists(key)) this.textures.remove(key);
    const atlas = this.textures.createCanvas(key, TILE_ART_W * this.mapWidth, TILE_ART_H * this.mapHeight);
    if (!atlas) return;
    atlas.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.tileAtlas = atlas;

    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        atlas.add(`${x},${y}`, 0, x * TILE_ART_W, y * TILE_ART_H, TILE_ART_W, TILE_ART_H);
      }
    }
    this.renderPlatformTiles();

    const drawOrder: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) drawOrder.push({ x, y });
    }
    drawOrder.sort((a, b) => a.x + a.y - (b.x + b.y) || a.x - b.x);

    for (const { x, y } of drawOrder) {
      const screenPos = IsometricHelper.gridToScreen(x, y);
      const image = this.add.image(
        screenPos.x + TILE_FRAME_OFFSET_X,
        screenPos.y + TILE_FRAME_OFFSET_Y,
        key,
        `${x},${y}`
      );
      image.setOrigin(0, 0);
      image.setScale(ART_PIXEL);
      this.islandContainer.add(image);
      this.tileImages.push(image);
    }
  }

  /** Repaints every tile into the atlas (on creation and whenever the realm phase changes). */
  private renderPlatformTiles(): void {
    const atlas = this.tileAtlas;
    if (!atlas) return;
    const imageData = atlas.context.createImageData(atlas.width, atlas.height);
    const buffer = { data: imageData.data, width: atlas.width };

    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const tile = this.tiles[y][x];
        const colors = getTileColors(tile.type, (x + y) % 2 === 0, this.currentPlatformPhase);
        if (!colors) continue;
        paintTile(buffer, x * TILE_ART_W, y * TILE_ART_H, {
          type: tile.type,
          colors,
          gridX: x,
          gridY: y,
          cliffLeft: y === this.mapHeight - 1,
          cliffRight: x === this.mapWidth - 1,
          platformPhase: this.currentPlatformPhase,
        });
      }
    }

    atlas.context.putImageData(imageData, 0, 0);
    atlas.refresh();
  }

  private setupDayNightLighting(): void {
    // Night glow layer for landmarks
    this.nightGlowGraphics = this.add.graphics();
    this.nightGlowGraphics.setDepth(3000);
    this.islandContainer.add(this.nightGlowGraphics);

    // Global ambient tint overlay
    this.dayNightOverlay = this.add.graphics();
    this.dayNightOverlay.setDepth(4000);
    this.dayNightOverlay.setScrollFactor(0);
  }

  private updateDayNightCycle(delta: number): number {
    this.cycleTimer = (this.cycleTimer + delta) % DAY_NIGHT_CYCLE_DURATION_MS;
    const progress = this.cycleTimer / DAY_NIGHT_CYCLE_DURATION_MS;

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

    let span = k2.progress - k1.progress;
    if (span <= 0) span += 1.0;
    let offset = progress - k1.progress;
    if (offset < 0) offset += 1.0;
    const t = Phaser.Math.Clamp(offset / span, 0, 1);

    const r = Math.round(Phaser.Math.Linear(k1.r, k2.r, t));
    const g = Math.round(Phaser.Math.Linear(k1.g, k2.g, t));
    const b = Math.round(Phaser.Math.Linear(k1.b, k2.b, t));
    const overlayAlpha = Phaser.Math.Linear(k1.alpha, k2.alpha, t);
    const ambientDarkness = Phaser.Math.Linear(k1.darkness, k2.darkness, t);

    const colorHex = (r << 16) | (g << 8) | b;
    const phase = t < 0.5 ? k1.phase : k2.phase;

    const darknessRounded = Math.round(ambientDarkness * 100) / 100;
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

    this._dayProgressWriteTimer += delta;
    if (this._dayProgressWriteTimer >= MainScene.DAY_PROGRESS_WRITE_INTERVAL_MS) {
      this._dayProgressWriteTimer = 0;
      useGameStore.getState().setDayProgress(progress);
    }

    // Sakupin ang buong resolution kahit mag-resize o mag-zoom
    this.dayNightOverlay.clear();

    this.nightGlowGraphics.clear();
    if (ambientDarkness > 0.12) {
      const at = (rect: TileRect) => {
        const c = rectCenter(rect);
        return IsometricHelper.gridToScreen(c.x, c.y);
      };
      const nexusPos = at(CASTLE_FOOTPRINT);
      const crystalPos = at(SPIRE_FOOTPRINT);
      const quarryPos = at(BUILDING_SITES.QUARRY.footprint);
      const grovePos = at(BUILDING_SITES.WOOD.footprint);
      const cavePos = at(BUILDING_SITES.CAVE.footprint);

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
        row.push(this.tiles[y][x].type === 'OCEAN_BLOCK' ? 1 : 0);
      }
      walkableGrid.push(row);
    }

    // Navigation stamps solid footprints (citadel, establishments, spire, portals) over this grid
    this.nav = new Navigation(this.pathfinder, walkableGrid);
  }

  /**
   * Draw order inside the entity layer follows each object's feet (y), so a
   * minion walking behind the citadel is hidden by it and one in front is not.
   * Effects with depth >= 9000 (bursts, projectiles) always stay on top.
   */
  private sortEntities(): void {
    const key = (obj: Phaser.GameObjects.GameObject) => {
      const o = obj as unknown as { depth: number; y: number };
      return o.depth >= 9000 ? 100000 + o.depth : o.y;
    };
    this.entityLayer.sort('y', (a: Phaser.GameObjects.GameObject, b: Phaser.GameObjects.GameObject) => key(a) - key(b));
  }

  /** World-space rectangle the camera must keep in view: tiles, cliffs, edge labels, units on the back row and the sky arc. */
  private getIslandBounds(): Phaser.Geom.Rectangle {
    const left = IsometricHelper.gridToScreen(0, this.mapHeight - 1).x + TILE_FRAME_OFFSET_X;
    const right = IsometricHelper.gridToScreen(this.mapWidth - 1, 0).x - TILE_FRAME_OFFSET_X;
    const top = IsometricHelper.gridToScreen(0, 0).y + TILE_FRAME_OFFSET_Y - 95; // room for the sun/moon at noon
    const bottom = IsometricHelper.gridToScreen(this.mapWidth - 1, this.mapHeight - 1).y + TILE_FRAME_OFFSET_Y + TILE_ART_H * ART_PIXEL + 12;
    const margin = 16;
    return new Phaser.Geom.Rectangle(left - margin, top - margin, right - left + margin * 2, bottom - top + margin * 2);
  }

  /** userZoom at which the whole island exactly fits the viewport. */
  private getFitZoom(): number {
    const cam = this.cameras.main;
    const bounds = this.getIslandBounds();
    return Math.min(cam.width / this.dpr / bounds.width, cam.height / this.dpr / bounds.height);
  }

  private applyZoom(): void {
    const minZoom = Math.min(0.65, this.getFitZoom());
    this.userZoom = Phaser.Math.Clamp(this.userZoom, minZoom, 2.2);
    this.cameras.main.setZoom(this.userZoom * this.dpr);
    this.clampCamera();
  }

  /**
   * Keeps the island inside the frame: while it fits, it can't be dragged past
   * any viewport edge; when zoomed in past the frame, panning stops at the island's edges.
   */
  private clampCamera(): void {
    const cam = this.cameras.main;
    const bounds = this.getIslandBounds();
    const viewW = cam.width / cam.zoom;
    const viewH = cam.height / cam.zoom;
    const clampAxis = (center: number, min: number, max: number, view: number) => {
      const a = min + view / 2;
      const b = max - view / 2;
      return Phaser.Math.Clamp(center, Math.min(a, b), Math.max(a, b));
    };
    const centerX = cam.scrollX + cam.width / 2;
    const centerY = cam.scrollY + cam.height / 2;
    cam.centerOn(
      clampAxis(centerX, bounds.left, bounds.right, viewW),
      clampAxis(centerY, bounds.top, bounds.bottom, viewH)
    );
  }

  private setupCamera(): void {
    const bounds = this.getIslandBounds();
    this.cameras.main.centerOn(bounds.centerX, bounds.centerY);
    this.userZoom = Math.min(this.userZoom, this.getFitZoom() * 0.96);
    this.applyZoom();
    const onResize = () => this.applyZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, onResize));

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
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
        this.clampCamera();
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const dragDist = Math.hypot(pointer.x - this.dragStartX, pointer.y - this.dragStartY);
      this.isDragging = false;

      // Short tap (< 10 px) = click on a structure → open establishment modal
      if (dragDist < 10 && this.structures) {
        const localX = pointer.worldX - this.islandContainer.x;
        const localY = pointer.worldY - this.islandContainer.y;
        const structureId = this.structures.getStructureAt(localX, localY);
        if (structureId) {
          useGameStore.getState().openEstablishmentModal(structureId);
        }
      }
    });

    this.input.on(
      'wheel',
      (
        _pointer: Phaser.Input.Pointer,
        _gameObjects: unknown[],
        _deltaX: number,
        deltaY: number
      ) => {
        this.userZoom -= deltaY * 0.001;
        this.applyZoom();
      }
    );
  }

  update(time: number, delta: number): void {
    this.fpsController.tick(delta, this._cachedTargetFps);

    const store = useGameStore.getState();

    const gameSpeed = store.gameSpeed ?? 1;
    if (gameSpeed === 0) {
      this.islandContainer.y = Math.sin(time / 2200) * 4.5;
      return;
    }
    const effectiveDelta = delta * gameSpeed;

    this.worldEffects?.update(
      effectiveDelta,
      store.weather,
      this.cycleTimer / DAY_NIGHT_CYCLE_DURATION_MS,
      Math.max(0, this._lastDarknessWritten)
    );
    // Units spawned after create() are appended to the container; keep clouds/fish/lightning on top
    if (this.airFxLayer) this.islandContainer.bringToTop(this.airFxLayer);

    this.islandContainer.y = Math.sin(time / 2200) * 4.5;

    this.structures.update(effectiveDelta);
    this.portals.update(effectiveDelta);

    const ambientDarkness = this.updateDayNightCycle(effectiveDelta);

    const storePhase = store.platformPhase || 1;
    if (storePhase !== this.currentPlatformPhase) {
      this.currentPlatformPhase = storePhase;
      this.renderPlatformTiles();
    }

    this.updateDynamicLandmarks();

    this._rosterSyncTimer += effectiveDelta;
    if (this._rosterSyncTimer >= MainScene.ROSTER_SYNC_INTERVAL_MS) {
      this._rosterSyncTimer = 0;
      this.workerManager.syncWithRoster(store.roster);
    }

    if (store.targetFps !== this._cachedTargetFps) {
      this._cachedTargetFps = store.targetFps;
      this.fpsController.setTargetFps(this._cachedTargetFps);
    }

    this.workerManager.update(time, effectiveDelta, ambientDarkness);

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
    this.towers.update(effectiveDelta);
    this.sortEntities();

    this.updateWeatherParticles(effectiveDelta, store.targetFps, weather);


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
          store.setMeasuredFps(stats.measured);
        }
      }
    }

    if (!isInvading) {
      this._scoutSpawnAccum += effectiveDelta;
      if (this._scoutSpawnAccum >= this._nextScoutInterval) {
        this._scoutSpawnAccum = 0;
        this._nextScoutInterval = (30 + Math.random() * 35) * 1000;
        this.invasionManager?.spawnLootScouts();
      }
    } else {
      this._scoutSpawnAccum = 0;
    }
  }

  destroy(): void {
    this.workerManager?.destroy();
    this.invasionManager?.destroy();
    this.towers?.destroy();
    this.portals?.destroy();
    this.structures?.destroy();
    this.worldEffects?.destroy();
  }

  private randomizeWeather(): void {
    const weathers: WeatherType[] = ['CLEAR', 'CLEAR', 'RAIN', 'SNOW', 'HEATWAVE'];
    const pick = weathers[Math.floor(Math.random() * weathers.length)];
    this.currentWeather = pick;
    useGameStore.getState().setWeather(pick);
    this.weatherParticles.forEach(p => p.destroy());
    this.weatherParticles = [];
  }

  private updateWeatherParticles(delta: number, targetFps: number, weather: WeatherType): void {
    this.weatherTimer += delta;
    this.weatherOverlay.clear();

    if (weather === 'CLEAR') {
      this.currentWeather = 'CLEAR';
      this.weatherParticles.forEach(p => p.destroy());
      this.weatherParticles = [];
      return;
    }

    this.currentWeather = weather;

    const cam = this.cameras.main;
    const viewW = Math.max(cam.width, window.innerWidth * 2);
    const viewH = Math.max(cam.height, window.innerHeight * 2);

    const isUltra = targetFps >= 90;
    const isSaver = targetFps <= 30;

    if (weather === 'RAIN') {
      const rainAlpha = isSaver ? 0.05 : isUltra ? 0.12 : 0.08;
      this.weatherOverlay.fillStyle(0x1e3a5f, rainAlpha);
      this.weatherOverlay.fillRect(0, 0, viewW, viewH);
    } else if (weather === 'SNOW') {
      const snowAlpha = isSaver ? 0.03 : isUltra ? 0.08 : 0.05;
      this.weatherOverlay.fillStyle(0xffffff, snowAlpha);
      this.weatherOverlay.fillRect(0, 0, viewW, viewH);
    } else if (weather === 'HEATWAVE') {
      const heatAlpha = isSaver ? 0.04 : isUltra ? 0.12 : 0.08;
      this.weatherOverlay.fillStyle(0xf97316, heatAlpha);
      this.weatherOverlay.fillRect(0, 0, viewW, viewH);
    }

    const deltaSec = delta / 1000;
    for (let i = this.weatherParticles.length - 1; i >= 0; i--) {
      const p = this.weatherParticles[i] as unknown as Phaser.GameObjects.Graphics & { _vy: number; _vx?: number; _life: number };
      p.y += p._vy * deltaSec;
      if (p._vx) p.x += p._vx * deltaSec;
      p._life += delta;
      if (p._life > 3000 || p.y > viewH + 50) {
        p.destroy();
        this.weatherParticles.splice(i, 1);
      }
    }
  }
}