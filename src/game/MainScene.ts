import { GraphicsFx } from './graphicsFx';
import { battleTargets } from './battleTargets';
import { devBridge } from './devBridge';
import Phaser from 'phaser';
import { normalizeDifficulty, type Difficulty } from '../state/difficulty';
import { TileInfo, TileType } from '../types/game';
import { TimeOfDayPhase, WeatherType } from '../types/state';
import { IsometricHelper } from './IsometricHelper';
import { ProceduralRenderer, getTileColors } from './ProceduralRenderer';
import { WildFactionManager } from './WildFactionManager';
import { KirovAirship } from './KirovAirship';
import { useFocusGeneral } from '../state/focusGeneral';
import { spawnSmoke } from './battleFx';
import { WILD_FACTIONS } from '../state/wildFactions';
import type { WorkerInstance } from './workers/types';
import { UNIT_CLASSES } from '../types/game';
import { coastDistance, isCoastalTile, makeCoastField, makeRoadField, makeSetField, type CoastField } from './scene/coastField';
import {
  paintTile,
  paintCoast,
  isTopPixel,
  COAST_LAND,
  COAST_BANK,
  type PixelBuffer,
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
import { renderProfile, type FpsPreset } from '../state/graphicsSettings';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from './audio/soundFx';
import { pickPavementFxStyle, spawnPavementBurst, spawnPavementTileFx } from './scene/pavementFx';
import { prepareCharacterSprites } from './sprites/CharacterSprites';
import { prepareStructureSprites } from './sprites/StructureSprites';
import { useLoadProgress } from './loadProgress';
import { WorldEffects } from './WorldEffects';
import { DefenderSystem } from './DefenderSystem';
import { SkillSystem } from './skills/SkillSystem';
import { Navigation, WALK_BRIDGE, WALK_LAND, WALK_CLIFF, WALK_WATER } from './Navigation';
import { StructureManager } from './StructureManager';
import { PortalManager } from './PortalManager';
import { ForceFieldSystem } from './ForceFieldSystem';
import { LiveFocusCamera } from './scene/liveFocusCamera';
import { CastleAlarm } from './scene/castleAlarm';
import { FireSystem } from './FireSystem';
import { logMessage } from '../state/activityLog';
import { TowerSystem } from './TowerSystem';
import { PortalDefenseSystem } from './PortalDefenseSystem';
import { WaterFx } from './scene/waterFx';
import { WaterLife } from './scene/waterLife';
import { RoadsideFlora, type RoadFloraTile } from './scene/roadsideFlora';
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
  isWaterTile,
  isProtectedTile,
  isLandTile,
  isSandTile,
  isRaisedTile,
  isFillableTile,
  isWetTile,
  setTerrainEdits,
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
  /** Frame counter / summed delta for the FPS-calibrated ambient layers. */
  private _ambientFrame = 0;
  private _ambientDelta = 0;
  private _ambientTier: 'LOW' | 'MEDIUM' | 'HIGH' = 'HIGH';
  private _ambientTierHold = 0;
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
  private forceFields?: ForceFieldSystem;
  private liveFocus?: LiveFocusCamera;
  private castleAlarm?: CastleAlarm;
  private fires?: FireSystem;
  private worldEffects?: WorldEffects;
  /** Buildings, portals, units and combat effects — depth-sorted by feet position every frame. */
  private entityLayer!: Phaser.GameObjects.Container;
  private nav!: Navigation;
  private structures!: StructureManager;
  private portals!: PortalManager;
  private towers!: TowerSystem;
  private portalDefense!: PortalDefenseSystem;
  private waterFx?: WaterFx;
  private waterLife?: WaterLife;
  private roadsideFlora?: RoadsideFlora;
  private defenders!: DefenderSystem;
  private kirov?: KirovAirship;
  /** The ancient wild factions: the Sea Folk (water) and the Sand Brood (land). */
  private wild: WildFactionManager[] = [];
  private terrainUnsub?: () => void;
  private terrainTimer?: Phaser.Time.TimerEvent;
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
  // Depth sorting the whole entity layer is O(n log n); graphics presets tune its cadence.
  private _sortTimer: number = 0;

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
    this.invasionManager.setDefenderProvider(() => this.defenders.getDefenders());
    this.workerManager.setDefenderSystem(this.defenders);
    this.defenders.setWorkerProvider(() => this.workerManager.getWorkers());
    this.defenders.setBrawlProvider(() => this.workerManager.getBrawlers());
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
    this.structures.setConstructionProvider(() => [...this.workerManager.getConstructionStatus(), ...this.defenders.getConstructionStatus()]);
    this.structures.setRepairProvider(() => this.defenders.getRepairStatus());

    this.airFxLayer = this.add.container(0, 0);
    this.islandContainer.add(this.airFxLayer);
    // Kirov airship: leads every Kirov Invasion Battle (the raids between waves), never a wave
    this.kirov = new KirovAirship(this, this.airFxLayer, this.groundFxLayer, this.structures, this.invasionManager,
      () => this.workerManager.getWorkers(), () => this.defenders.getDefenders());
    this.invasionManager.onScoutRaid = () => this.kirov?.maybeLaunch();
    devBridge.kirov = this.kirov;
    battleTargets.kirov = () => this.kirov?.groundPoint() ?? null;
    const raiders = () => !!this.kirov?.isActive() || this.invasionManager.getInvaders().some((i) => i.isScout && !i.isDead && !i.isRetreating);
    battleTargets.kirovInvasion = raiders;
    battleTargets.brawl = () => this.workerManager.isBrawlActive();
    this.forceFields = new ForceFieldSystem(this, this.airFxLayer, this.structures, this.portals, raiders);
    this.castleAlarm = new CastleAlarm(this, this.airFxLayer, this.structures, raiders);
    this.fires = new FireSystem(this, this.airFxLayer, this.structures, this.invasionManager, (x, y) => this.nav.allows(x, y, 'land'));
    this.defenders.setFireSystem(this.fires);
    // Sea Folk: silhouettes swim under the curved shore, risen creatures stand with the units
    const underwater = this.add.container(0, 0);
    this.groundFxLayer.addAt(underwater, 1);
    // Burrow mounds of the Sand Brood move over the ground (above the shore, under the units)
    const burrows = this.add.container(0, 0);
    this.groundFxLayer.add(burrows);
    this.createWildFactions(underwater, burrows);
    this.workerManager.setFireSystem(this.fires);
    this.structures.setForceFields(this.forceFields);
    this.portals.setForceFields(this.forceFields);
    this.liveFocus = new LiveFocusCamera(
      this,
      this.islandContainer,
      () => this.invasionManager.getInvaders().filter((i) => !i.isDead && !i.isRetreating && i.container.active).map((i) => i.container),
      () => [
        ...this.workerManager.getWorkers().filter((w) => w.container.active).map((w) => w.container),
        ...this.defenders.getDefenders().filter((d) => !d.dead && d.container.active).map((d) => d.container),
      ],
      () => this.dpr,
      (target) => this.glideTo(target, Math.max(this.userZoom, 1.4), 750),
      () => {
        const pair = this.workerManager.getBrawlers();
        if (!pair) return null;
        const [a, b] = pair;
        return { a: { x: a.container.x, y: a.container.y, name: a.name }, b: { x: b.container.x, y: b.container.y, name: b.name } };
      }
    );
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
    devBridge.invasion = this.invasionManager;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { if (devBridge.invasion === this.invasionManager) devBridge.invasion = undefined; });
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
    // Living terrain first: flooded shore is water, dug sand / eaten shore stays land
    const t = useGameStore.getState();
    setTerrainEdits(t.terrainFlooded, Object.keys(t.terrainSand), t.terrainFlooding, Object.keys(t.terrainRaised), t.terrainFilled);
    this.buildTerrainFields();
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
        } else if (isWaterTile(x, y)) { // ocean ring, canals and this realm's coves
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
    this.buildRoadField();
  }

  /** Paved road tiles (not a building pad): drawn as grass with a curved strip of road through them. */
  private roadField?: CoastField;
  private roadKeys?: Set<string>;
  private isRoadStrip(x: number, y: number): boolean {
    if (this.tiles[y]?.[x]?.type !== 'ANCIENT_STONE') return false;
    this.roadKeys ??= new Set(ROAD_TILES.map((r) => `${r.x},${r.y}`));
    if (!this.roadKeys.has(`${x},${y}`) || isRiftTowerTile(x, y)) return false;
    const pads = [CASTLE_FOOTPRINT, SPIRE_FOOTPRINT, ...Object.values(BUILDING_SITES).map((s) => s.footprint)];
    return !pads.some((f) => rectContainsTile(f, x, y));
  }

  private buildRoadField(): void {
    this.roadKeys = undefined; // a new layout or a moved establishment moves the roads
    const strip = new Set<string>();
    for (let y = 0; y < this.mapHeight; y++) for (let x = 0; x < this.mapWidth; x++) if (this.isRoadStrip(x, y)) strip.add(`${x},${y}`);
    const pad = (x: number, y: number) => {
      const t = this.tiles[y]?.[x]?.type;
      return (t === 'ANCIENT_STONE' || t === 'NEXUS_BASE') && !strip.has(`${x},${y}`);
    };
    this.roadField = makeRoadField((x, y) => strip.has(`${x},${y}`), pad);
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
    this.waterLife = new WaterLife(this, this.groundFxLayer, useGameStore.getState().platformPhase || 1);
    this.roadsideFlora = new RoadsideFlora(this, this.groundFxLayer);
    this.refreshRoadsideFlora();
    this.createShoreLayer();

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
    const shoreKey = MainScene.SHORE_ATLAS_KEY;
    if (this.textures.exists(shoreKey)) this.textures.remove(shoreKey);
    this.shoreAtlas = this.textures.createCanvas(shoreKey, atlas.width, atlas.height) ?? undefined;
    this.shoreAtlas?.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.coastField = makeCoastField(useGameStore.getState().layoutSeed);

    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        atlas.add(`${x},${y}`, 0, x * TILE_ART_W, y * TILE_ART_H, TILE_ART_W, TILE_ART_H);
        this.shoreAtlas?.add(`${x},${y}`, 0, x * TILE_ART_W, y * TILE_ART_H, TILE_ART_W, TILE_ART_H);
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

  /** Curved living-terrain fields (sand / soaked shore / raised rock), rebuilt when the terrain changes. */
  private terrainFields?: { sand: CoastField; wet: CoastField; raised: CoastField };

  private buildTerrainFields(): void {
    const seed = useGameStore.getState().layoutSeed;
    this.terrainFields = {
      sand: makeSetField(isSandTile, seed),
      wet: makeSetField(isWetTile, seed + 7),
      raised: makeSetField(isRaisedTile, seed + 13, 0.2),
    };
  }

  /** The curved coastline field for this layout (rebuilt with the scene). */
  private coastField?: CoastField;
  private shoreAtlas?: Phaser.Textures.CanvasTexture;
  private shoreLayer?: Phaser.GameObjects.Container;
  private static readonly SHORE_ATLAS_KEY = 'iso-shore-tiles';

  /** Tiles drawn again over the animated water: the coast passes through them or right next to them. */
  private inShoreSet(x: number, y: number): boolean {
    return isCoastalTile(x, y) || (!isWaterTile(x, y) && coastDistance(x, y, 2) <= 2);
  }

  /**
   * Paints one tile (and, near the coast, its curved shoreline) into `buffer`.
   * When `shore` is given, the pixels that must sit above the animated water
   * (land, beach, bank) are copied into it.
   */
  private paintTileInto(buffer: PixelBuffer, ox: number, oy: number, x: number, y: number, shore?: PixelBuffer, sx = ox, sy = oy): void {
    const real = this.tiles[y][x];
    const tile = this.isRoadStrip(x, y) ? { ...real, type: 'AETHER_GRASS' as TileType } : real;
    // Grass takes one colour (its shading varies smoothly in PixelTileArt); others keep the checker
    const colors = getTileColors(tile.type, tile.type !== 'AETHER_GRASS' && (x + y) % 2 === 0, this.currentPlatformPhase);
    if (!colors) return;
    const spec = {
      type: tile.type,
      colors,
      gridX: x,
      gridY: y,
      cliffLeft: y === this.mapHeight - 1,
      cliffRight: x === this.mapWidth - 1,
      platformPhase: this.currentPlatformPhase,
      difficulty: this.currentDifficulty,
      shore: this.shoreOf(x, y),
      seed: useGameStore.getState().layoutSeed,
      terrain: {
        ...this.terrainFields,
        road: this.roadField,
        roadColor: getTileColors('ANCIENT_STONE', false, this.currentPlatformPhase)?.topColor,
      },
    };
    paintTile(buffer, ox, oy, spec);
    this.coastField ??= makeCoastField(useGameStore.getState().layoutSeed);
    let mask: Uint8Array | null = null;
    if (isCoastalTile(x, y) && tile.type !== 'SPAWN_BLOCK') {
      const water = getTileColors('OCEAN_BLOCK', (x + y) % 2 === 0, this.currentPlatformPhase)!;
      const grass = getTileColors('AETHER_GRASS', false, this.currentPlatformPhase)!;
      mask = paintCoast(buffer, ox, oy, spec, this.coastField, { water, grass });
    }
    if (!shore || !this.inShoreSet(x, y)) return;
    for (let j = 0; j < TILE_ART_H; j++) {
      for (let i = 0; i < TILE_ART_W; i++) {
        const keep = mask ? mask[j * TILE_ART_W + i] === COAST_LAND || mask[j * TILE_ART_W + i] === COAST_BANK : tile.type !== 'OCEAN_BLOCK' && isTopPixel(i, j);
        const src = ((oy + j) * buffer.width + ox + i) * 4;
        const dst = ((sy + j) * shore.width + sx + i) * 4;
        const alpha = keep ? buffer.data[src + 3] : 0;
        shore.data[dst] = buffer.data[src];
        shore.data[dst + 1] = buffer.data[src + 1];
        shore.data[dst + 2] = buffer.data[src + 2];
        shore.data[dst + 3] = alpha;
      }
    }
  }

  /** Repaints every tile into the atlas (on creation and whenever the realm phase changes). */
  private renderPlatformTiles(): void {
    const atlas = this.tileAtlas;
    if (!atlas) return;
    const imageData = atlas.context.createImageData(atlas.width, atlas.height);
    const buffer = { data: imageData.data, width: atlas.width };
    const shoreData = this.shoreAtlas ? this.shoreAtlas.context.createImageData(atlas.width, atlas.height) : null;
    const shore = shoreData ? { data: shoreData.data, width: atlas.width } : undefined;

    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) this.paintTileInto(buffer, x * TILE_ART_W, y * TILE_ART_H, x, y, shore);
    }

    atlas.context.putImageData(imageData, 0, 0);
    atlas.refresh();
    if (this.shoreAtlas && shoreData) {
      this.shoreAtlas.context.putImageData(shoreData, 0, 0);
      this.shoreAtlas.refresh();
    }
  }

  /** A tile was just paved: the curved road strip also bends through its neighbours. */
  private repaintPaved(x: number, y: number): void {
    this.buildRoadField();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (this.tiles[y + dy]?.[x + dx]) this.repaintSingleTile(x + dx, y + dy, false);
    }
    this.tileAtlas?.refresh();
    this.shoreAtlas?.refresh();
  }

  /** Repaints a single tile frame in the atlas canvas dynamically without refreshing the page or scene. */
  public repaintSingleTile(x: number, y: number, upload = true): void {
    const atlas = this.tileAtlas;
    if (!atlas?.context || !this.tiles[y]?.[x]) return;
    const imgData = atlas.context.createImageData(TILE_ART_W, TILE_ART_H);
    const buffer = { data: imgData.data, width: TILE_ART_W };
    const shoreData = this.shoreAtlas ? this.shoreAtlas.context.createImageData(TILE_ART_W, TILE_ART_H) : null;
    const shore = shoreData ? { data: shoreData.data, width: TILE_ART_W } : undefined;
    this.paintTileInto(buffer, 0, 0, x, y, shore, 0, 0);
    atlas.context.putImageData(imgData, x * TILE_ART_W, y * TILE_ART_H);
    if (upload) atlas.refresh();
    if (this.shoreAtlas && shoreData && this.inShoreSet(x, y)) {
      this.shoreAtlas.context.putImageData(shoreData, x * TILE_ART_W, y * TILE_ART_H);
      if (upload) this.shoreAtlas.refresh();
    }
  }

  /**
   * The Sea Folk and the Sand Brood, rivals of each other and of everyone else.
   * Their bosses carve the land: the Leviathan eats the shore it fights on
   * (wet sand that becomes sea when it is gone), the Ancient Caterpillar churns
   * the land it burrows under into sand that later settles back.
   */
  private createWildFactions(underwater: Phaser.GameObjects.Container, burrows: Phaser.GameObjects.Container): void {
    const store = () => useGameStore.getState();
    const lang = () => (store().language === 'TL' ? 'tl' : 'en');
    void lang;
    const sea = WILD_FACTIONS.SEA;
    const brood = WILD_FACTIONS.BROOD;
    let floodClock = 0;
    const key = (t: { x: number; y: number }) => `${t.x},${t.y}`;
    const carvable = (x: number, y: number) => isLandTile(x, y) && !isProtectedTile(x, y);
    const seaFolk = new WildFactionManager({
      id: 'SEA', data: sea, habitat: 'water',
      meter: () => store().seaContamination, truce: () => store().seaTruceWaves,
      stir: (n) => store().stirSea(n), spendTruce: () => store().spendSeaTruceWave(),
      color: 0x22d3ee, bossColor: 0xa78bfa, silhouetteTint: 0x031a2e,
      logs: { emerge: 'seaEmerge', boss: 'seaBoss', retreat: 'seaRetreat', level: 'seaLevel', slain: 'seaSlain', skill: 'seaSkill', restless: 'seaRestless', bodyguards: 'seaBodyguards' },
      // The Leviathan eats the shore around it, a tile at a time
      onBossTick: (tile, dt) => {
        floodClock -= dt;
        if (floodClock > 0) return;
        floodClock = sea.terrain?.floodEverySeconds ?? 5;
        const r = sea.terrain?.floodRadius ?? 2;
        const pending = new Set(store().terrainFlooding);
        const options: string[] = [];
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const x = tile.x + dx, y = tile.y + dy;
          if (!carvable(x, y) || pending.has(`${x},${y}`)) continue;
          if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ax, ay]) => isWaterTile(x + ax, y + ay))) options.push(`${x},${y}`);
        }
        if (options.length) store().markFlooding([options[Math.floor(Math.random() * options.length)]]);
      },
      onBossGone: () => {
        const count = store().terrainFlooding.length;
        if (!count) return;
        store().floodPending();
        logMessage('terrainFlooded', { count });
      },
    }, this, underwater, this.entityLayer, this.invasionManager, this.workerManager, this.defenders, this.groundLoot);
    const sandBrood = new WildFactionManager({
      id: 'BROOD', data: brood, habitat: 'land',
      meter: () => store().broodUnrest, truce: () => store().broodTruceWaves,
      stir: (n) => store().stirBrood(n), spendTruce: () => store().spendBroodTruceWave(),
      color: 0xd6a35c, bossColor: 0xc084fc, silhouetteTint: 0x5b3a1a,
      logs: { emerge: 'broodEmerge', boss: 'broodBoss', retreat: 'broodRetreat', level: 'broodLevel', slain: 'broodSlain', skill: 'broodSkill', restless: 'broodRestless', bodyguards: 'broodBodyguards' },
      // Where the Caterpillar surfaces it heaves a rounded patch of ground:
      // sea -> sand, sand -> land, land -> raised rock (only flyers cross it until the next day)
      onCarve: (tile, radius) => this.carveAround(tile, radius),
      onDayChange: () => { store().settleSand(); store().liftRaised(); },
    }, this, burrows, this.entityLayer, this.invasionManager, this.workerManager, this.defenders, this.groundLoot);
    this.wild = [seaFolk, sandBrood];
    battleTargets.wild = { SEA: () => seaFolk.orderTargets(), BROOD: () => sandBrood.orderTargets() };
    // Stop listening to the store as soon as this scene goes away (a new realm remounts the scene)
    const stop = () => { this.terrainUnsub?.(); this.terrainUnsub = undefined; this.terrainTimer?.remove(); };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
    this.events.once(Phaser.Scenes.Events.DESTROY, stop);
    for (const w of this.wild) w.setRivals(this.wild);

    // Repaint the land as it changes: sand / wet shore per tile, flooding re-lays the island
    this.terrainUnsub = useGameStore.subscribe((now, prev) => {
      if (!this.tileAtlas?.context || !this.sys.isActive()) return; // a scene that is shutting down
      // Sea <-> land changes re-lay the whole island; everything else repaints only the tiles around it
      if (now.terrainFlooded !== prev.terrainFlooded || now.terrainFilled !== prev.terrainFilled) {
        // Only the tiles that flipped (and their curved shore) are repainted, a few per frame
        for (const k of [...now.terrainFlooded, ...prev.terrainFlooded, ...now.terrainFilled, ...prev.terrainFilled]) this.seaLandChanged.add(k);
        this.terrainTimer?.remove();
        this.terrainTimer = this.time.delayedCall(400, () => this.refreshTerrain());
        return;
      }
      if (now.terrainSand === prev.terrainSand && now.terrainFlooding === prev.terrainFlooding && now.terrainRaised === prev.terrainRaised) return;
      setTerrainEdits(now.terrainFlooded, Object.keys(now.terrainSand), now.terrainFlooding, Object.keys(now.terrainRaised), now.terrainFilled);
      this.buildTerrainFields();
      const changed = new Set<string>();
      for (const k of new Set([...Object.keys(now.terrainSand), ...Object.keys(prev.terrainSand)])) if ((now.terrainSand[k] === undefined) !== (prev.terrainSand[k] === undefined)) changed.add(k);
      for (const k of new Set([...now.terrainFlooding, ...prev.terrainFlooding])) if (now.terrainFlooding.includes(k) !== prev.terrainFlooding.includes(k)) changed.add(k);
      const raisedChanged = now.terrainRaised !== prev.terrainRaised;
      for (const k of new Set([...Object.keys(now.terrainRaised), ...Object.keys(prev.terrainRaised)])) if ((now.terrainRaised[k] === undefined) !== (prev.terrainRaised[k] === undefined)) changed.add(k);
      // Raised rock blocks walkers: update the walk grid (cheap) without re-laying tiles
      if (raisedChanged) this.nav.setBaseGrid(this.buildWalkGrid());
      // The patches are curved and spill into neighbours: repaint the ring around every change
      const ring = new Set<string>();
      for (const k of changed) {
        const [cx, cy] = k.split(',').map(Number);
        for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) ring.add(`${cx + dx},${cy + dy}`);
      }
      for (const k of ring) {
        const [x, y] = k.split(',').map(Number);
        if (x < 0 || y < 0 || x >= this.mapWidth || y >= this.mapHeight) continue;
        this.repaintSingleTile(x, y, false); // one texture upload after the batch
        if (!changed.has(k)) continue;
        if (isLandTile(x, y)) spawnSmoke(IsometricHelper.gridToScreen(x, y).x, IsometricHelper.gridToScreen(x, y).y - 4, 0.8, 0);
      }
      this.tileAtlas?.refresh();
      this.shoreAtlas?.refresh();
    });
  }

  /**
   * The Ancient Caterpillar surfaced: every unprotected tile in a wobbly circle
   * around it changes one step — fillable sea to sand, sand to land, land to
   * raised rock. Roads, buildings, the citadel and the rifts are never touched.
   */
  private carveAround(center: { x: number; y: number }, radius: number): void {
    const s = useGameStore.getState();
    const carve = { filled: [] as string[], toSand: [] as string[], toLand: [] as string[], raised: [] as string[] };
    const seed = Math.random() * 10;
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = center.x + dx, y = center.y + dy;
      const a = Math.atan2(dy, dx);
      const edge = radius * (0.75 + 0.25 * Math.sin(a * 3 + seed) + 0.12 * Math.sin(a * 5 - seed * 2));
      if (Math.hypot(dx, dy) > edge || isProtectedTile(x, y) || isPortalTile(x, y)) continue;
      const k = `${x},${y}`;
      if (isFillableTile(x, y)) carve.filled.push(k);
      else if (!isLandTile(x, y) || s.terrainRaised[k] !== undefined || s.terrainFlooding.includes(k)) continue;
      else if (s.terrainSand[k] !== undefined) carve.toLand.push(k);
      else carve.raised.push(k);
    }
    if (carve.filled.length + carve.toLand.length + carve.raised.length === 0) return;
    s.applyCarve(carve);
    this.cameras.main.shake(350, 0.004);
    logMessage('terrainHeaved', { raised: carve.raised.length, filled: carve.filled.length });
  }

  /** Tiles whose sea/land state may have flipped since the last terrain refresh. */
  private seaLandChanged = new Set<string>();
  private repaintQueue = new Set<string>();

  /**
   * The sea claimed shore (or sand filled it): re-lay the tile data, walkways
   * and the factions' terrain at once, then repaint only the tiles around the
   * change, a batch per frame. Repainting the whole island in one go froze the
   * game for a moment whenever a wild boss rose at the start of a battle.
   */
  private refreshTerrain(): void {
    if (!this.tileAtlas?.context || !this.sys.isActive()) return;
    this.generateIslandData();
    this.coastField = makeCoastField(useGameStore.getState().layoutSeed);
    this.nav.setBaseGrid(this.buildWalkGrid());
    for (const w of this.wild) w.refreshTiles();
    for (const k of this.seaLandChanged) {
      const [cx, cy] = k.split(',').map(Number);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && y >= 0 && x < this.mapWidth && y < this.mapHeight) this.repaintQueue.add(`${x},${y}`);
      }
    }
    this.seaLandChanged.clear();
    this.drainRepaintQueue();
  }

  /** Repaints queued tiles 16 at a time (one texture upload per batch), then re-lays the water and shore. */
  private drainRepaintQueue(): void {
    if (!this.tileAtlas?.context || !this.sys.isActive()) { this.repaintQueue.clear(); return; }
    const batch = [...this.repaintQueue].slice(0, 16);
    for (const k of batch) {
      this.repaintQueue.delete(k);
      const [x, y] = k.split(',').map(Number);
      this.repaintSingleTile(x, y, false);
    }
    this.tileAtlas.refresh();
    this.shoreAtlas?.refresh();
    if (this.repaintQueue.size) { this.terrainTimer = this.time.delayedCall(16, () => this.drainRepaintQueue()); return; }
    this.waterLife?.rebuild();
    this.createShoreLayer();
  }

  /** Coastal tiles drawn again above the animated water, so the curved shore stays on top of it. */
  private createShoreLayer(): void {
    if (!this.groundFxLayer || !this.shoreAtlas) return;
    if (this.shoreLayer) this.shoreLayer.removeAll(true); // rebuilt in place after the terrain changes
    else {
      this.shoreLayer = this.add.container(0, 0);
      this.groundFxLayer.addAt(this.shoreLayer, 1); // just above the water surface (index 0)
    }
    const order: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < this.mapHeight; y++) for (let x = 0; x < this.mapWidth; x++) if (this.inShoreSet(x, y)) order.push({ x, y });
    order.sort((a, b) => a.x + a.y - (b.x + b.y) || a.x - b.x);
    for (const { x, y } of order) {
      const p = IsometricHelper.gridToScreen(x, y);
      const img = this.add.image(p.x + TILE_FRAME_OFFSET_X, p.y + TILE_FRAME_OFFSET_Y, MainScene.SHORE_ATLAS_KEY, `${x},${y}`);
      img.setOrigin(0, 0).setScale(ART_PIXEL);
      this.shoreLayer!.add(img);
    }
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
        this.repaintPaved(x, y);
      }
      this.refreshRoadsideFlora();
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
        this.repaintPaved(x, y);

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
    this.time.delayedCall(tilesToPave.length * 40 + 100, () => {
      if (this.scene.isActive()) this.refreshRoadsideFlora();
    });
  }

  /** Plants can only grow on the paved road owned by a built establishment. */
  private refreshRoadsideFlora(): void {
    if (!this.roadsideFlora) return;
    const roads: RoadFloraTile[] = [];
    for (const id of BUILDING_IDS) {
      if (!this.pavedStructures.has(id)) continue;
      const connectedRoad = (ROADS_BY_BUILDING[id] ?? []).filter((tile) =>
        this.tiles[tile.y]?.[tile.x]?.type === 'ANCIENT_STONE' && this.isRoadStrip(tile.x, tile.y));
      const featuredIndex = connectedRoad.length
        ? Math.abs(id.split('').reduce((hash, char) => hash * 31 + char.charCodeAt(0), 0)) % connectedRoad.length
        : -1;
      connectedRoad.forEach((tile, index) => {
        roads.push({ x: tile.x, y: tile.y, featured: index === featuredIndex });
      });
    }
    this.roadsideFlora.refresh(roads, useGameStore.getState().layoutSeed);
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
        row.push(this.tiles[y][x].type !== 'OCEAN_BLOCK' ? (isRaisedTile(x, y) ? WALK_CLIFF : WALK_LAND) : isBridgeTile(x, y) ? WALK_BRIDGE : WALK_WATER);
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
    this.refreshRoadsideFlora();
    this.nav.setBaseGrid(this.buildWalkGrid());
    this.structures.relayout();
    this.waterFx?.drawBridges();
    this.waterLife?.rebuild();
    this.lastBloomKey = '';
  }

  private initPathfinding(): void {
    this.pathfinder = new PathfindingService();
    const walkableGrid: number[][] = [];

    for (let y = 0; y < this.mapHeight; y++) {
      const row: number[] = [];
      for (let x = 0; x < this.mapWidth; x++) {
        row.push(this.tiles[y][x].type !== 'OCEAN_BLOCK' ? (isRaisedTile(x, y) ? WALK_CLIFF : WALK_LAND) : isBridgeTile(x, y) ? WALK_BRIDGE : WALK_WATER);
      }
      walkableGrid.push(row);
    }

    // Navigation stamps solid footprints (citadel, establishments, spire, portals) over this grid
    this.nav = new Navigation(this.pathfinder, walkableGrid);
  }

  /**
   * Draw order inside the entity layer follows each object's feet (y), so a
   * minion walking behind the citadel is hidden by it and one in front is not.
   * Effects with depth >= 9000 (bursts, projectiles) always stay on top; depth <= -9000 stays under everything.
   */
  private sortEntities(): void {
    const key = (obj: Phaser.GameObjects.GameObject) => {
      const o = obj as unknown as { depth: number; y: number };
      if (o.depth <= -9000) return -100000 + o.depth; // ground decals (laser burn scars)
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

  /** Index into the power ranking of the General the camera last jumped to. */
  private generalFocusIndex = -1;

  /**
   * Generals on the field, strongest first. Overall power = attack (base +
   * brawl gains) weighted ×3 plus max HP, so brawl winners climb the list.
   */
  private generalsByPower(): WorkerInstance[] {
    return this.workerManager
      .getWorkers()
      .filter((w) => !!UNIT_CLASSES[w.unitClass]?.requiredBuilding && w.hp > 0 && w.container.active && w.container.visible)
      .sort((a, b) => (b.attackPower * 3 + b.maxHp) - (a.attackPower * 3 + a.maxHp));
  }

  /** → next (weaker) General, ← previous (stronger); wraps around the list. */
  private cycleGeneralFocus(step: 1 | -1): void {
    const ranked = this.generalsByPower();
    if (!ranked.length) return;
    this.generalFocusIndex = (((this.generalFocusIndex + step) % ranked.length) + ranked.length) % ranked.length;
    const g = ranked[this.generalFocusIndex];
    this.followGeneral = undefined;
    this.glideTo(() => ({ x: this.islandContainer.x + g.container.x, y: this.islandContainer.y + g.container.y }), Math.max(this.userZoom, 1.6));
    // Once there, keep following it (until a drag, Esc, or it falls)
    this.glideTween?.once(Phaser.Tweens.Events.TWEEN_COMPLETE, () => this.setFollow(g));
  }

  /** The General the camera keeps centred (← / →); drag or Esc lets go. */
  private followGeneral?: WorkerInstance;
  private focusPublishTimer = 0;

  private setFollow(g: WorkerInstance | undefined): void {
    this.followGeneral = g;
    useFocusGeneral.getState().setFocus(g?.id ?? null, g ? String(g.unitClass) : null);
    this.focusPublishTimer = 0;
  }

  /** Eases the camera after the followed General each frame and publishes its skill cooldowns to the HUD. */
  private updateFollow(delta: number): void {
    const g = this.followGeneral;
    if (!g) return;
    if (g.hp <= 0 || !g.container.active || !g.container.visible) { this.setFollow(undefined); return; }
    if (!this.glideTween?.isPlaying()) {
      const cam = this.cameras.main;
      const cx = cam.scrollX + cam.width / 2, cy = cam.scrollY + cam.height / 2;
      const k = Math.min(1, delta / 180); // gentle catch-up, no jitter
      cam.centerOn(cx + (this.islandContainer.x + g.container.x - cx) * k, cy + (this.islandContainer.y + g.container.y - cy) * k);
      this.clampCamera();
    }
    this.focusPublishTimer -= delta;
    if (this.focusPublishTimer <= 0) {
      this.focusPublishTimer = 200;
      useFocusGeneral.getState().setCooldowns(this.workerManager.skillCooldowns(g.id));
    }
  }

  // ── Off-screen culling ─────────────────────────────────────────────────────
  private cullTimer = 0;

  /**
   * Units, structures and tiles outside the main camera's view (plus a margin)
   * skip the main camera's render via cameraFilter — their logic keeps running
   * and their own visibility is untouched, and the live-stream / brawl split
   * camera still draws them.
   */
  private cullOffscreen(delta: number): void {
    this.cullTimer -= delta;
    if (this.cullTimer > 0) return;
    this.cullTimer = 150;
    const cam = this.cameras.main;
    const view = cam.worldView;
    const ox = this.islandContainer.x, oy = this.islandContainer.y;
    const m = 160;
    const left = view.x - ox - m, right = view.right - ox + m, top = view.y - oy - m, bottom = view.bottom - oy + m * 1.5;
    const bit = cam.id;
    const apply = (o: Phaser.GameObjects.GameObject & { x: number; y: number; cameraFilter: number }, pad = 0) => {
      const inside = o.x >= left - pad && o.x <= right + pad && o.y >= top - pad && o.y <= bottom + pad;
      o.cameraFilter = inside ? o.cameraFilter & ~bit : o.cameraFilter | bit;
    };
    for (const o of this.entityLayer?.list ?? []) apply(o as never);
    for (const img of this.tileImages) apply(img as never, 80);
    for (const img of this.shoreLayer?.list ?? []) apply(img as never, 80);
  }

  private glideTween?: Phaser.Tweens.Tween;

  /**
   * Eased camera glide (Sine in-out): pans to a target that may keep moving
   * (re-read every frame) while easing the zoom to `zoom`. A new glide
   * replaces one still running, so quick key presses chain smoothly.
   */
  private glideTo(target: () => { x: number; y: number }, zoom = this.userZoom, duration = 700): void {
    const cam = this.cameras.main;
    this.glideTween?.stop();
    const fromX = cam.scrollX + cam.width / 2;
    const fromY = cam.scrollY + cam.height / 2;
    const fromZoom = this.userZoom;
    this.glideTween = this.tweens.addCounter({
      from: 0,
      to: 1,
      duration,
      ease: 'Sine.easeInOut',
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 1;
        const to = target();
        this.userZoom = fromZoom + (zoom - fromZoom) * t;
        this.applyZoom();
        cam.centerOn(fromX + (to.x - fromX) * t, fromY + (to.y - fromY) * t);
        this.clampCamera();
      },
    });
    soundFx.playClick();
  }

  /** Eased zoom about the current view centre (↑ / ↓). */
  private easeZoom(delta: number): void {
    const cam = this.cameras.main;
    const cx = cam.scrollX + cam.width / 2;
    const cy = cam.scrollY + cam.height / 2;
    this.glideTween?.stop();
    const fromZoom = this.userZoom;
    const toZoom = fromZoom + delta;
    this.glideTween = this.tweens.addCounter({
      from: 0, to: 1, duration: 260, ease: 'Sine.easeInOut',
      onUpdate: (tween) => {
        this.userZoom = fromZoom + (toZoom - fromZoom) * (tween.getValue() ?? 1);
        this.applyZoom();
        cam.centerOn(cx, cy);
        this.clampCamera();
      },
    });
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
    this.input.keyboard?.on('keydown-ESC', () => { this.cancelMove(); this.setFollow(undefined); });
    // The HUD's General skill panel (button or F / G / H) asks for a cast
    const unsubCast = useFocusGeneral.subscribe((now, prev) => {
      if (now.castTick === prev.castTick || !now.castSlot || !this.followGeneral || !this.sys.isActive()) return;
      if (!this.workerManager.manualCast(this.followGeneral.id, now.castSlot)) soundFx.playClick();
      useFocusGeneral.getState().setCooldowns(this.workerManager.skillCooldowns(this.followGeneral.id));
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { unsubCast(); useFocusGeneral.getState().setFocus(null, null); });
    this.events.once(Phaser.Scenes.Events.DESTROY, () => unsubCast());
    // Arrow keys: ←/→ cycle the camera through the Generals by overall power, ↑/↓ zoom
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      const el = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        this.cycleGeneralFocus(event.key === 'ArrowRight' ? 1 : -1);
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        this.easeZoom(event.key === 'ArrowUp' ? 0.2 : -0.2);
      }
    });

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

      if (pointer.leftButtonDown() && useGameStore.getState().invasion.isActive && this.structures) {
        const id = this.structures.getMovableAt(pointer.worldX - this.islandContainer.x, pointer.worldY - this.islandContainer.y);
        if (id) {
          this.holdTimer?.remove();
          this.holdTimer = this.time.delayedCall(450, () => {
            if (this.input.activePointer.isDown) logMessage('moveLockedWave');
          });
        }
      }

      if (useGameStore.getState().invasion.isActive && this.invasionManager) {
        this.invasionManager.handleStrikeClick(pointer);
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
        if (this.followGeneral && Math.hypot(pointer.x - this.dragStartX, pointer.y - this.dragStartY) > 12) this.setFollow(undefined);
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
      void pos;
      logMessage('moveLockedWave');
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

    // FPS calibration: on slower machines the ambient layers (sky, clouds, rain/snow,
    // grass/water reactions, ocean surface, fish) update every 2nd/3rd frame with the
    // summed delta, and weather particles thin out. Gameplay is never throttled.
    // The FPS setting caps the tier (30 FPS → LOW, ≤45 → MEDIUM); a slow machine can lower it further
    const rank = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;
    const settingTier = this._cachedTargetFps <= 30 ? 'LOW' : this._cachedTargetFps <= 45 ? 'MEDIUM' : 'HIGH';
    const fpsTier = this.fpsController.getQualityTier();
    const wantedTier = rank[fpsTier] < rank[settingTier] ? fpsTier : settingTier;
    // A new setting applies at once; a measured drop must hold 2 s so throttling doesn't flip it back and forth
    if (wantedTier !== this._ambientTier) {
      this._ambientTierHold += delta;
      if (wantedTier === settingTier || this._ambientTierHold >= 2000) {
        this._ambientTier = wantedTier;
        this._ambientTierHold = 0;
      }
    } else this._ambientTierHold = 0;
    const tier = this._ambientTier;
    const profile = renderProfile(this._cachedTargetFps as FpsPreset);
    const adaptiveStride = tier === 'HIGH' ? 1 : tier === 'MEDIUM' ? 2 : 4;
    const stride = Math.max(profile.ambientStride, adaptiveStride);
    this._ambientFrame = (this._ambientFrame + 1) % stride;
    this._ambientDelta += effectiveDelta;
    const ambientTick = this._ambientFrame === 0;
    const ambientDelta = this._ambientDelta;
    if (ambientTick) this._ambientDelta = 0;
    const adaptiveWorldDensity = tier === 'HIGH' ? 1 : tier === 'MEDIUM' ? 0.6 : 0.2;
    const adaptiveWaterDensity = tier === 'HIGH' ? 1 : tier === 'MEDIUM' ? 0.55 : 0.2;
    this.worldEffects?.setDensity(Math.min(profile.worldDensity, adaptiveWorldDensity));
    this.waterFx?.setDensity(Math.min(profile.waterDensity, adaptiveWaterDensity));
    this.waterLife?.setLite(tier === 'LOW');

    if (ambientTick) this.worldEffects?.update(
      ambientDelta,
      store.weather,
      this.cycleTimer / DAY_NIGHT_CYCLE_DURATION_MS,
      Math.max(0, this._lastDarknessWritten)
    );
    // Units spawned after create() are appended to the container; keep clouds/fish/lightning on top
    if (this.airFxLayer) this.islandContainer.bringToTop(this.airFxLayer);

    this.islandContainer.y = Math.sin(time / 2200) * 4.5;

    this.structures.update(effectiveDelta);
    this.portals.update(effectiveDelta);
    this.forceFields?.update(effectiveDelta);
    this.liveFocus?.update(effectiveDelta);
    this.castleAlarm?.update(effectiveDelta);
    this.fires?.update(effectiveDelta);
    // Establishments are locked in place once a wave starts
    if (this.moving && store.invasion.isActive) {
      this.cancelMove();
      logMessage('moveLockedWave');
    }
    if (ambientTick) {
      this.waterFx?.update(time, store.platformPhase || 1);
      this.waterLife?.update(ambientDelta, store.platformPhase || 1, this.waterFx?.surfaceState(store.platformPhase || 1));
    }

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
    for (const w of this.wild) w.update(effectiveDelta);
    this.kirov?.update(effectiveDelta);
    this.updateFollow(delta);
    this.cullOffscreen(delta);
    this.skills.update(effectiveDelta);
    this.groundLoot?.update(effectiveDelta / 1000);
    this._sortTimer += delta;
    if (this._sortTimer >= profile.sortIntervalMs) {
      this._sortTimer = 0;
      this.sortEntities();
    }

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
          for (const ally of this.workerManager.getWorkers()) {
            if (ally.hp > 0 && !ally.isBrawling) ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * 0.02 * seconds);
          }
          for (const ally of this.defenders.getDefenders()) {
            if (!ally.dead) ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * 0.02 * seconds);
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
    this.waterLife?.destroy();
    this.roadsideFlora?.destroy();
    this.defenders?.destroy();
    this.skills?.destroy();
    this.forceFields?.destroy();
    this.liveFocus?.destroy();
    this.castleAlarm?.destroy();
    this.fires?.destroy();
    for (const w of this.wild) w.destroy();
    this.kirov?.destroy();
    this.terrainUnsub?.();
    this.terrainTimer?.remove();
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
