import { GraphicsFx } from './graphicsFx';
import Phaser from 'phaser';
import { normalizeDifficulty, type Difficulty } from '../state/difficulty';
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
import { GroundLootManager } from './GroundLootManager';
import { FPSController } from './FPSController';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from './audio/soundFx';
import { pickPavementFxStyle, spawnPavementBurst, spawnPavementTileFx } from './scene/pavementFx';
import { prepareCharacterSprites } from './sprites/CharacterSprites';
import { prepareStructureSprites } from './sprites/StructureSprites';
import { useLoadProgress } from './loadProgress';
import { WorldEffects } from './WorldEffects';
import { DefenderSystem } from './DefenderSystem';
import { SkillSystem } from './skills/SkillSystem';
import { Navigation, WALK_BRIDGE, WALK_LAND, WALK_WATER } from './Navigation';
import { StructureManager } from './StructureManager';
import { PortalManager } from './PortalManager';
import { TowerSystem } from './TowerSystem';
import { PortalDefenseSystem } from './PortalDefenseSystem';
import { WaterFx } from './scene/waterFx';
import {
  BUILDING_IDS,
  BUILDING_SITES,
  GRID_SIZE,
  PORTAL_SITES,
  CASTLE_FOOTPRINT,
  CASTLE_GATE,
  ROAD_TILES,
  isBridgeTile,
  isPortalTile,
  isRiftTowerTile,
  isCanalTile,
  ROADS_BY_BUILDING,
  SPIRE_FOOTPRINT,
  TileRect,
  rectCenter,
  canPlaceEstablishment,
  footprintOf,
  type MovableId,
  rectContainsTile,
} from '../state/buildingLayout';
import type { ResourceBuildingId } from '../types/state';

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
  private mapWidth: number = GRID_SIZE;
  private mapHeight: number = GRID_SIZE;
  private tiles: TileInfo[][] = [];
  private pathfinder!: PathfindingService;
  private workerManager!: WorkerManager;
  private invasionManager!: InvasionManager;
  private groundLoot!: GroundLootManager;
  private fpsController!: FPSController;
  private graphicsFx!: GraphicsFx;
  private pavedStructures: Set<string> = new Set();

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
  private portalDefense!: PortalDefenseSystem;
  private waterFx?: WaterFx;
  private defenders!: DefenderSystem;
  private skills!: SkillSystem;
  private bloomGfx?: Phaser.GameObjects.Graphics;
  private lastBloomKey: string = '';
  private tileCoordinateLabels: Phaser.GameObjects.Text[] = [];
  private static readonly TILE_ATLAS_KEY = 'iso-pixel-tiles';
  private currentPlatformPhase: 1 | 2 | 3 | 4 = 1;
  /** Platform theme follows the difficulty (platformThemes.json). */
  private currentDifficulty: Difficulty = 'NORMAL';

  // Continuous Day / Night System
  private cycleTimer: number = 120000; // Start at Day (0.5 progress)
  private currentPhase: TimeOfDayPhase = 'DAY';
  private dayNightOverlay!: Phaser.GameObjects.Graphics;

  // Dirty-check caches for day/night store writes (avoid every-frame React re-renders)
  private _lastPhaseWritten: TimeOfDayPhase = 'DAY';
  private _lastDarknessWritten: number = -1;
  private _dayProgressWriteTimer: number = 0;
  private static readonly DAY_PROGRESS_WRITE_INTERVAL_MS = 500; // write every 500ms

  // Camera Drag State
  private isDragging: boolean = false;
  // Establishment relocation: hold to lift, click a tile to place
  private holdTimer?: Phaser.Time.TimerEvent;
  private ignoreNextUp = false;
  private moving?: {
    id: MovableId;
    ghost: Phaser.GameObjects.Container;
    footprint: Phaser.GameObjects.Graphics;
    tile: { x: number; y: number };
    valid: boolean;
  };
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
    this.graphicsFx = new GraphicsFx(this);

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
    this.groundLoot = new GroundLootManager(this, this.islandContainer);
    this.workerManager.setGroundLoot(this.groundLoot);
    // Drops land only where a land walker can stand (nav grid, live as buildings go up)
    this.groundLoot.setTerrain(
      (x, y) => this.nav.allows(x, y, 'land'),
      (x, y) => this.nav.nearestAllowedTile({ x, y }, 'land')
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
    this.invasionManager.setGroundLoot(this.groundLoot);
    this.invasionManager.setWorkerProvider(() => this.workerManager.getWorkers());
    this.towers = new TowerSystem(this, this.entityLayer, this.groundFxLayer, this.structures, this.invasionManager, this.nav);
    this.defenders = new DefenderSystem(this, this.entityLayer, this.structures, this.invasionManager, this.nav);
    this.workerManager.setDefenderSystem(this.defenders);
    this.structures.setDefenderSystem(this.defenders);
    this.towers.setDefenderSystem(this.defenders);
    this.towers.setWorkerProvider(() => this.workerManager.getWorkers());
    this.invasionManager.setWorld({
      nav: this.nav,
      structures: this.structures,
      portals: this.portals,
      blockers: () => [...this.towers.getBlockers(), ...this.defenders.getBlockers()],
    });
    this.portalDefense = new PortalDefenseSystem(
      this, this.entityLayer, this.portals, this.invasionManager, this.defenders, () => this.workerManager.getWorkers(), this.nav
    );
    this.structures.setInvaderProvider(() => this.invasionManager.getInvaders());
    this.structures.setConstructionProvider(() => this.workerManager.getConstructionStatus());

    this.airFxLayer = this.add.container(0, 0);
    this.islandContainer.add(this.airFxLayer);
    // Rift mist sits above units; it parts under the mouse (island space)
    this.portalDefense.attachMist(this.airFxLayer, () => {
      const p = this.input.activePointer;
      if (!p || !p.active) return null;
      const w = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      return { x: w.x - this.islandContainer.x, y: w.y - this.islandContainer.y };
    });
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
    this.skills = new SkillSystem(this, this.entityLayer, this.workerManager, this.invasionManager, this.structures, this.defenders);
    this.worldEffects.setStrikeHandler((x, y, strength) => this.lightningStrike(x, y, strength));

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

    // The loading screen lifts once the world is up and the bakes have landed
    useLoadProgress.getState().setSceneReady(true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => useLoadProgress.getState().setSceneReady(false));
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
   * Chess-style tile names: letters (A…Z, AA…) run along X, numbers from 1 along Y.
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
    const store = useGameStore.getState();

    // Track initial built structures so only their pavement is visible
    this.pavedStructures.clear();
    const builtFootprints: TileRect[] = [];
    const builtRoads = new Set<string>();

    if (store.castleBuilt) {
      this.pavedStructures.add('CASTLE');
      builtFootprints.push(CASTLE_FOOTPRINT);
      for (const r of ROADS_BY_BUILDING.CASTLE ?? []) builtRoads.add(`${r.x},${r.y}`);
    }
    if (store.spireBuilt) {
      this.pavedStructures.add('SPIRE');
      builtFootprints.push(SPIRE_FOOTPRINT);
      const spireRoad = ROADS_BY_BUILDING.SPIRE ?? [];
      for (const r of spireRoad) builtRoads.add(`${r.x},${r.y}`);
    }
    for (const id of BUILDING_IDS) {
      const b = store.resourceBuildings?.[id];
      if (b && b.level >= 1) {
        this.pavedStructures.add(id);
        builtFootprints.push(BUILDING_SITES[id].footprint);
        const bRoads = ROADS_BY_BUILDING[id] ?? [];
        for (const r of bRoads) builtRoads.add(`${r.x},${r.y}`);
      }
    }

    for (let y = 0; y < this.mapHeight; y++) {
      const row: TileInfo[] = [];
      for (let x = 0; x < this.mapWidth; x++) {
        let type: TileType = 'AETHER_GRASS';
        let walkable = true;

        if (isPortalTile(x, y)) {
          type = 'SPAWN_BLOCK'; // the 2×2 rift dais
        } else if (isRiftTowerTile(x, y)) {
          type = 'ANCIENT_STONE'; // Rift Sentinel plinths
        } else if (x === 0 || y === 0 || x === this.mapWidth - 1 || y === this.mapHeight - 1 || isCanalTile(x, y)) {
          type = 'OCEAN_BLOCK';
          walkable = false;
        } else if (rectContainsTile(CASTLE_FOOTPRINT, x, y)) {
          type = store.castleBuilt ? 'NEXUS_BASE' : 'AETHER_GRASS';
        } else if (rectContainsTile(SPIRE_FOOTPRINT, x, y)) {
          type = store.spireBuilt ? 'ANCIENT_STONE' : 'AETHER_GRASS';
        } else if (builtFootprints.some((f) => rectContainsTile(f, x, y)) || builtRoads.has(`${x},${y}`)) {
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
    this.currentDifficulty = normalizeDifficulty(useGameStore.getState().difficulty);

    // Sun, moon and stars sit behind the tiles so the island hides them at the horizon
    this.skyFxLayer = this.add.container(0, 0);
    this.islandContainer.add(this.skyFxLayer);
    this.createTileSprites();
    this.groundFxLayer = this.add.container(0, 0);
    this.islandContainer.add(this.groundFxLayer);
    // Waterfalls off the front rims + bridges over the canals
    this.waterFx = new WaterFx(this, this.groundFxLayer);

    // Ocean swell, foam and crests are painted into the tiles (PixelTileArt paintWater)

    // Enriched-node blooms lie on the ground; tile names above them
    this.bloomGfx = this.add.graphics();
    this.groundFxLayer.add(this.bloomGfx);
    this.createTileCoordinateLabels(showTileCoordinates);

    // Everything that stands on the island is y-sorted in this layer
    this.entityLayer = this.add.container(0, 0);
    this.islandContainer.add(this.entityLayer);
  }

  /** Label visibility + green blooms under nodes the Treant has enriched. */
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

  /** Which neighbours of a water tile are land (off the map counts as open sea). */
  private shoreOf(x: number, y: number) {
    const land = (nx: number, ny: number) => {
      const t = this.tiles[ny]?.[nx];
      return !!t && t.type !== 'OCEAN_BLOCK';
    };
    return { px: land(x + 1, y), nx: land(x - 1, y), py: land(x, y + 1), ny: land(x, y - 1) };
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
          difficulty: this.currentDifficulty,
          shore: this.shoreOf(x, y),
        });
      }
    }

    atlas.context.putImageData(imageData, 0, 0);
    atlas.refresh();
  }

  /** Repaints a single tile frame in the atlas canvas dynamically without refreshing the page or scene. */
  public repaintSingleTile(x: number, y: number): void {
    const atlas = this.tileAtlas;
    if (!atlas) return;
    const tile = this.tiles[y]?.[x];
    if (!tile) return;
    const colors = getTileColors(tile.type, (x + y) % 2 === 0, this.currentPlatformPhase);
    if (!colors) return;
    const imgData = atlas.context.createImageData(TILE_ART_W, TILE_ART_H);
    const buffer = { data: imgData.data, width: TILE_ART_W };
    paintTile(buffer, 0, 0, {
      type: tile.type,
      colors,
      gridX: x,
      gridY: y,
      cliffLeft: y === this.mapHeight - 1,
      cliffRight: x === this.mapWidth - 1,
      platformPhase: this.currentPlatformPhase,
      difficulty: this.currentDifficulty,
      shore: this.shoreOf(x, y),
    });
    atlas.context.putImageData(imgData, x * TILE_ART_W, y * TILE_ART_H);
    atlas.refresh();
  }

  /**
   * Automatically and animatedly draws the pavement (roads and foundation)
   * on the platform when an establishment or spire or castle is successfully built.
   */
  public paveEstablishment(id: ResourceBuildingId | 'SPIRE' | 'CASTLE', animated: boolean = true): void {
    this.pavedStructures.add(id);

    const tilesToPave: Array<{ x: number; y: number }> = [];
    const footprint = id === 'CASTLE' ? CASTLE_FOOTPRINT : id === 'SPIRE' ? SPIRE_FOOTPRINT : BUILDING_SITES[id]?.footprint;
    const roads = ROADS_BY_BUILDING[id] ?? [];

    // 1. Road tiles: paved in sequence from castle gate towards establishment workSpot
    for (const r of roads) {
      const t = this.tiles[r.y]?.[r.x];
      if (t && t.type !== 'ANCIENT_STONE' && t.type !== 'NEXUS_BASE' && t.type !== 'OCEAN_BLOCK') {
        tilesToPave.push({ x: r.x, y: r.y });
      }
    }

    // 2. Footprint tiles: foundation
    if (footprint) {
      for (let y = footprint.y; y < footprint.y + footprint.h; y++) {
        for (let x = footprint.x; x < footprint.x + footprint.w; x++) {
          if (this.tiles[y]?.[x]) {
            const targetType = id === 'CASTLE' ? 'NEXUS_BASE' : 'ANCIENT_STONE';
            if (this.tiles[y][x].type !== targetType) {
              tilesToPave.push({ x, y });
            }
          }
        }
      }
    }

    if (tilesToPave.length === 0) return;
    // Castle floor inside its footprint; roads (incl. the castle ring) are plain paving
    const typeFor = (x: number, y: number) =>
      id === 'CASTLE' && footprint && rectContainsTile(footprint, x, y) ? 'NEXUS_BASE' as const : 'ANCIENT_STONE' as const;

    if (!animated) {
      for (const { x, y } of tilesToPave) {
        this.tiles[y][x].type = typeFor(x, y);
        this.repaintSingleTile(x, y);
      }
      return;
    }

    // Animate the road and foundation tiles dynamically drawing onto the platform.
    // One random effect style per paving; only some tiles show it.
    const fxStyle = pickPavementFxStyle();
    const fxChance = Phaser.Math.FloatBetween(0.35, 0.75);
    tilesToPave.forEach(({ x, y }, index) => {
      const delay = index * 40;
      this.time.delayedCall(delay, () => {
        if (!this.scene.isActive()) return;
        this.tiles[y][x].type = typeFor(x, y);
        this.repaintSingleTile(x, y);

        if (Math.random() > fxChance) return;
        const screenPos = IsometricHelper.gridToScreen(x, y);
        spawnPavementTileFx(this, this.groundFxLayer, screenPos.x, screenPos.y, id === 'CASTLE' ? 0xc084fc : 0x38bdf8, fxStyle);
      });
    });

    soundFx.playHarvest('stone');

    if (footprint) {
      this.time.delayedCall(tilesToPave.length * 40 + 80, () => {
        if (!this.scene.isActive()) return;
        const center = rectCenter(footprint);
        const pos = IsometricHelper.gridToScreen(center.x, center.y);
        spawnPavementBurst(this, this.groundFxLayer, pos.x, pos.y);
      });
    }
  }

  private setupDayNightLighting(): void {
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
        // Weather updated via store
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

    return ambientDarkness;
  }

  /** Terrain costs: land, bridges over canals, open water. */
  private buildWalkGrid(): number[][] {
    const walkableGrid: number[][] = [];
    for (let y = 0; y < this.mapHeight; y++) {
      const row: number[] = [];
      for (let x = 0; x < this.mapWidth; x++) {
        row.push(this.tiles[y][x].type !== 'OCEAN_BLOCK' ? WALK_LAND : isBridgeTile(x, y) ? WALK_BRIDGE : WALK_WATER);
      }
      walkableGrid.push(row);
    }
    return walkableGrid;
  }

  /**
   * An establishment was moved: re-lay tiles, roads, bridges, navigation and
   * the building views in place, so the realm keeps running (tenants, Generals,
   * timers) instead of the whole scene restarting.
   */
  private applyRelayout(): void {
    this.generateIslandData();
    this.renderPlatformTiles();
    this.nav.setBaseGrid(this.buildWalkGrid());
    this.structures.relayout();
    this.waterFx?.drawBridges();
    this.lastBloomKey = '';
  }

  private initPathfinding(): void {
    this.pathfinder = new PathfindingService();
    const walkableGrid: number[][] = [];

    for (let y = 0; y < this.mapHeight; y++) {
      const row: number[] = [];
      for (let x = 0; x < this.mapWidth; x++) {
        row.push(this.tiles[y][x].type !== 'OCEAN_BLOCK' ? WALK_LAND : isBridgeTile(x, y) ? WALK_BRIDGE : WALK_WATER);
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
  /** A lightning bolt scorches every invader and minion standing where it lands. */
  private lightningStrike(x: number, y: number, strength: number): void {
    const radius = 42 * strength;
    for (const invader of [...this.invasionManager.getInvaders()]) {
      if (invader.isDead || !invader.container.active) continue;
      if (Math.hypot(invader.container.x - x, invader.container.y - y) > radius) continue;
      this.invasionManager.damageInvader(invader, Math.round(40 * strength), '⚡ Struck!');
    }
    for (const worker of this.workerManager.getWorkers()) {
      if (worker.hp <= 0 || !worker.container?.active) continue;
      if (Math.hypot(worker.container.x - x, worker.container.y - y) > radius) continue;
      const damage = Math.round(18 * strength);
      worker.hp = Math.max(0, worker.hp - damage);
      this.workerManager.spawnFloatingPopup(worker.container.x, worker.container.y - 40, `⚡ -${damage} HP`, '#fde047');
    }
  }

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

    this.input.mouse?.disableContextMenu();
    this.input.keyboard?.on('keydown-ESC', () => this.cancelMove());

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.moving) {
        if (pointer.rightButtonDown()) {
          this.cancelMove();
          this.ignoreNextUp = true;
          return;
        }
        this.dragStartX = pointer.x;
        this.dragStartY = pointer.y;
        return;
      }

      // Holding the left button on an establishment lifts it for relocation
      if (pointer.leftButtonDown() && !useGameStore.getState().invasion.isActive && this.structures) {
        const id = this.structures.getMovableAt(pointer.worldX - this.islandContainer.x, pointer.worldY - this.islandContainer.y);
        if (id) {
          this.holdTimer?.remove();
          this.holdTimer = this.time.delayedCall(450, () => {
            const p = this.input.activePointer;
            if (p.isDown && Math.hypot(p.x - this.dragStartX, p.y - this.dragStartY) < 10) this.startMove(id, p);
          });
        }
      }

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
      if (this.moving) {
        this.updateGhost(pointer);
        return;
      }
      if (this.holdTimer && Math.hypot(pointer.x - this.dragStartX, pointer.y - this.dragStartY) >= 10) {
        this.holdTimer.remove();
        this.holdTimer = undefined;
      }
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
      this.holdTimer?.remove();
      this.holdTimer = undefined;
      if (this.ignoreNextUp) {
        // The release that ends the lift (or a cancel) is not a click
        this.ignoreNextUp = false;
        return;
      }
      if (this.moving) {
        if (dragDist < 10) this.placeMove();
        return;
      }

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

  // ── Establishment relocation ────────────────────────────────────────────────

  private startMove(id: MovableId, pointer: Phaser.Input.Pointer): void {
    this.isDragging = false;
    this.ignoreNextUp = true;
    const ghost = this.structures.createGhost(id);
    const footprint = ghost.getAt(0) as Phaser.GameObjects.Graphics;
    this.moving = { id, ghost, footprint, tile: { ...footprintOf(id) }, valid: false };
    this.updateGhost(pointer);
    soundFx.playClick();
    this.workerManager.spawnFloatingPopup(ghost.x, ghost.y - 70, 'Click a new spot · Right-click / Esc to cancel', '#fde68a');
  }

  /** Snaps the ghost to the tile under the pointer and tints its footprint green or red. */
  private updateGhost(pointer: Phaser.Input.Pointer): void {
    const move = this.moving;
    if (!move) return;
    const { w, h } = footprintOf(move.id);
    const grid = IsometricHelper.screenToGrid(pointer.worldX - this.islandContainer.x, pointer.worldY - this.islandContainer.y);
    const tx = Math.round(grid.x - (w - 1) / 2);
    const ty = Math.round(grid.y - (h - 1) / 2);
    move.tile = { x: tx, y: ty };
    move.valid = canPlaceEstablishment(move.id, tx, ty);

    const c = rectCenter({ x: tx, y: ty, w, h });
    const pos = IsometricHelper.gridToScreen(c.x, c.y);
    move.ghost.setPosition(pos.x, pos.y);

    const corner = (gx: number, gy: number) => {
      const p = IsometricHelper.gridToScreen(gx, gy);
      return new Phaser.Math.Vector2(p.x - pos.x, p.y - pos.y);
    };
    const pts = [corner(tx - 0.5, ty - 0.5), corner(tx + w - 0.5, ty - 0.5), corner(tx + w - 0.5, ty + h - 0.5), corner(tx - 0.5, ty + h - 0.5)];
    const color = move.valid ? 0x4ade80 : 0xf87171;
    move.footprint.clear();
    move.footprint.fillStyle(color, 0.45);
    move.footprint.fillPoints(pts, true);
    move.footprint.lineStyle(2, color, 1);
    move.footprint.strokePoints([...pts, pts[0]], false);
  }

  private placeMove(): void {
    const move = this.moving;
    if (!move) return;
    if (!move.valid) {
      soundFx.playCastleHit();
      this.workerManager.spawnFloatingPopup(move.ghost.x, move.ghost.y - 60, "Can't build there", '#f87171');
      return;
    }
    const { id, tile } = move;
    this.cancelMove();
    // Success re-lays the island in place: the realm keeps running, nobody respawns
    if (useGameStore.getState().relocateEstablishment(id, tile.x, tile.y)) {
      this.applyRelayout();
    } else {
      const pos = IsometricHelper.gridToScreen(tile.x, tile.y);
      this.workerManager.spawnFloatingPopup(pos.x, pos.y - 60, 'Cannot move during an invasion', '#f87171');
    }
  }

  private cancelMove(): void {
    const move = this.moving;
    if (!move) return;
    this.moving = undefined;
    move.ghost.destroy();
    this.structures.endGhost(move.id);
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
    this.waterFx?.update(time);

    const ambientDarkness = this.updateDayNightCycle(effectiveDelta);

    const storePhase = store.platformPhase || 1;
    const storeDifficulty = normalizeDifficulty(store.difficulty);
    if (storePhase !== this.currentPlatformPhase || storeDifficulty !== this.currentDifficulty) {
      this.currentPlatformPhase = storePhase;
      this.currentDifficulty = storeDifficulty;
      this.renderPlatformTiles();
    }

    this.updateDynamicLandmarks();

    // Automatically trigger animated pavement drawing when a new structure is built
    if (store.castleBuilt && !this.pavedStructures.has('CASTLE')) {
      this.paveEstablishment('CASTLE', true);
    }
    if (store.spireBuilt && !this.pavedStructures.has('SPIRE')) {
      this.paveEstablishment('SPIRE', true);
    }
    for (const id of BUILDING_IDS) {
      if ((store.resourceBuildings?.[id]?.level ?? 0) >= 1 && !this.pavedStructures.has(id)) {
        this.paveEstablishment(id, true);
      }
    }

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
      // Every 5th wave brings a boss: heavier battle theme
      soundFx.playBackgroundMusic(store.invasion.waveNumber % 5 === 0 ? 'BOSS' : 'BATTLE');
    } else if (weather !== 'CLEAR') {
      soundFx.playBackgroundMusic(weather);
    } else if (store.timeOfDay === 'NIGHT') {
      soundFx.playBackgroundMusic('NIGHT');
    } else {
      soundFx.playBackgroundMusic('LIVELY');
    }

    this.invasionManager?.update(effectiveDelta);
    this.towers.update(effectiveDelta);
    this.portalDefense.update(effectiveDelta);
    this.defenders.update(effectiveDelta);
    this.skills.update(effectiveDelta);
    this.groundLoot?.update(effectiveDelta / 1000);
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
        store.tickLandmarks(seconds);
        store.tickEstablishmentSkills(seconds);
        store.tickDefenseTimers(seconds);
        if (store.defense.massRegenTimer > 0) {
          for (const key of Object.keys(store.resourceBuildings)) {
            store.restoreBuildingHp(key as any, 25 * seconds);
          }
          if (store.spireBuilt) {
            store.restoreBuildingHp('SPIRE', 25 * seconds);
          }
        }
    }

    if (this._fpsDebugText) {
      const showDebug = store.showFpsDebug ?? false;
      if (this._fpsDebugText.visible !== showDebug) {
        this._fpsDebugText.setVisible(showDebug);
      }
      if (showDebug) {
        // scrollFactor 0 still inherits camera zoom (userZoom * dpr); counter it so the overlay stays 11 CSS px
        const cam = this.cameras.main;
        const inv = 1 / cam.zoom;
        this._fpsDebugText.setScale(this.dpr * inv);
        this._fpsDebugText.setPosition(
          cam.width / 2 + (8 * this.dpr - cam.width / 2) * inv,
          cam.height / 2 + (8 * this.dpr - cam.height / 2) * inv
        );
        this._fpsDebugUpdateTimer += delta;
        if (this._fpsDebugUpdateTimer >= MainScene.FPS_DEBUG_UPDATE_MS) {
          this._fpsDebugUpdateTimer = 0;
          const stats = this.fpsController.getDebugStats();
          const tier = stats.qualityTier;
          const tierColor = tier === 'HIGH' ? '🟢' : tier === 'MEDIUM' ? '🟡' : '🔴';
          this._fpsDebugText.setText(
            `FPS: ${stats.measured} / ${stats.target} ${tierColor}
` +
            `Frame: ${stats.frameTimeMs.toFixed(1)}ms  Jank: ${stats.jankCount}
` +
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
    this.portalDefense?.destroy();
    this.waterFx?.destroy();
    this.defenders?.destroy();
    this.skills?.destroy();
    this.portals?.destroy();
    this.structures?.destroy();
    this.worldEffects?.destroy();
    this.groundLoot?.destroy();
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
    // Screen-space graphics still scale with camera zoom around the view centre, so a
    // rect from (0,0) shrinks toward the lower right. Cover a generous area around the
    // centre instead, enough for any zoom level.
    const viewW = Math.max(cam.width, window.innerWidth) * 12;
    const viewH = Math.max(cam.height, window.innerHeight) * 12;
    const originX = cam.width / 2 - viewW / 2;
    const originY = cam.height / 2 - viewH / 2;

    const isUltra = targetFps >= 90;
    const isSaver = targetFps <= 30;

    if (weather === 'RAIN') {
      const rainAlpha = isSaver ? 0.05 : isUltra ? 0.12 : 0.08;
      this.weatherOverlay.fillStyle(0x1e3a5f, rainAlpha);
      this.weatherOverlay.fillRect(originX, originY, viewW, viewH);
    } else if (weather === 'SNOW') {
      const snowAlpha = isSaver ? 0.03 : isUltra ? 0.08 : 0.05;
      this.weatherOverlay.fillStyle(0xffffff, snowAlpha);
      this.weatherOverlay.fillRect(originX, originY, viewW, viewH);
    } else if (weather === 'HEATWAVE') {
      const heatAlpha = isSaver ? 0.04 : isUltra ? 0.12 : 0.08;
      this.weatherOverlay.fillStyle(0xf97316, heatAlpha);
      this.weatherOverlay.fillRect(originX, originY, viewW, viewH);
    }

    const deltaSec = delta / 1000;
    for (let i = this.weatherParticles.length - 1; i >= 0; i--) {
      const p = this.weatherParticles[i] as unknown as Phaser.GameObjects.Graphics & { _vy: number; _vx?: number; _life: number };
      p.y += p._vy * deltaSec;
      if (p._vx) p.x += p._vx * deltaSec;
      p._life += delta;
      if (p._life > 3000 || p.y > Math.max(cam.height, window.innerHeight) * 2 + 50) {
        p.destroy();
        this.weatherParticles.splice(i, 1);
      }
    }
  }
}