# IsoChronicle: Idle Realms

> Rebuild the ruined citadel. Raise an army. Conquer the four realms.

IsoChronicle: Idle Realms is an offline-first isometric idle strategy game about resource automation, castle reconstruction, monster summoning, and wave-based defense.

You play as a weakened Demon Lord awakening in the ruins of a former citadel. Your only starting ally is a Support Slime. Gather enough resources to summon an Ancient Ent, rebuild the castle, establish resource areas, and grow an army capable of surviving 100 invasion waves.

## Game Loop

1. Start on Day 1 with ruins, no active castle, and one Support Slime.
2. Let the Slime summon the Ancient Ent when the required resources are available.
3. Use the Ent to construct the castle and resource areas.
4. Upgrade each area to unlock better materials.
5. Assign minions, gather resources, craft equipment, and defend against human and mecha invasions.
6. Reach Wave 100, then use Regression to restart stronger and rebuild again.

## Resource Areas

Resource buildings begin at level 0 and are constructed through Citadel Command.

| Area | Level 1 | Level 2 |
| --- | --- | --- |
| Wood Grove | Wood | Charcoal |
| Metal Mine | Metal | Coal |
| Stone Quarry | Stone | Minerals |
| Water Port | Water | Fish |

The Water Port and Metal Mine use explicit isometric grid coordinates. Enable **Tile Coordinates** in Settings to see `(x,y)` labels on every tile and verify structure placement.

## Features

- Procedural Phaser isometric 10x10 floating island.
- Autonomous minions with movement, gathering, combat, healing, and task states.
- EasyStar.js grid pathfinding.
- Day 1 reconstruction phase with Slime-led Ent and building progression.
- Four resource areas with upgradeable output chains.
- 100 invasion waves with live counts displayed as `remaining / total`.
- Castle, shield, turret, and wall upgrades.
- Equipment crafting, purchasing, and unit equipment management.
- Support Slime and Ent evolution systems.
- Day/night cycle, weather, procedural effects, audio, and camera pan/zoom.
- Local-first IndexedDB persistence and offline progression.
- JSON save export and import.
- PWA service-worker generation for offline-ready deployment.
- Regression prestige system with retained legacy bonuses.
- Default-on tile coordinate overlay for placement debugging.

## Regression Rebuild

Regression resets the active realm while preserving long-term progression.

After Regression:

- Only the Support Slime remains available.
- Existing minions, castle, and resource buildings reset.
- The world returns to ruins and resource areas return to level 0.
- The Slime can summon the Ent.
- The Ent can construct available resource areas and the castle.
- Normal minion summons, Market, and Forge access return after the castle is rebuilt.
- Regression bonuses, Support Slime evolution, and regression history are retained.

To execute a Regression, type the current realm name in the confirmation field. To erase Regression tier and history, type:

```text
RESET REGRESSIONS
```

## Controls

### World

- **Left-click and drag:** Pan the island camera.
- **Mouse wheel:** Zoom the island between 0.65x and 2.2x.
- **Click an active invader:** Strike it with the Demon Lord's lightning.
- **Click a resource badge:** Open quick trade for that resource.

### Game HUD

- **Pause / Play / Fast Forward:** Set simulation speed to 0x, 1x, or 2x.
- **Servants:** Open the minion roster and command panel.
- **Citadel Command:** Manage reconstruction, minions, market, forge, research, and defenses.
- **Guide / Codex:** Open gameplay help and world information.
- **Bestiary:** Review discovered minions and invaders.
- **Regression:** Open prestige progression and reset controls.
- **Settings:** Configure audio, performance, saves, lore, and tile coordinates.

## Run Locally

### Requirements

- Node.js 20 or newer
- npm

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Production Build

```bash
npm run build
npm run preview
```

The build runs TypeScript checking followed by the Vite production bundle.

## Run with Docker

Docker Compose starts the development server with volume mounting and polling-based HMR:

```bash
docker compose up --build
```

Open [http://localhost:5173](http://localhost:5173), then stop the container with:

```bash
docker compose down
```

## Persistence and Saves

- Browser state is stored locally using Zustand and LocalForage/IndexedDB.
- The game calculates offline progression when you return.
- Settings can export a JSON save or import one from another browser/device.
- Reset Realm clears the active realm and returns to the title screen.
- Regression reset is separate from Reset Realm and requires typed confirmation.

## Technology

- **React 18** and **TypeScript** for the application and reactive UI.
- **Phaser 3** for the isometric game world and simulation rendering.
- **Vite** for development and production bundling.
- **Tailwind CSS** and **DaisyUI** for the interface.
- **Zustand** for game state and actions.
- **LocalForage** for IndexedDB persistence.
- **EasyStar.js** for grid pathfinding.
- **Lucide React** for interface icons.
- **vite-plugin-pwa** for service-worker generation.

## Project Structure

```text
src/
├── App.tsx                         Screen coordinator
├── index.css                       Global styles and visual effects
├── game/
│   ├── MainScene.ts                Phaser world, tiles, buildings, camera, lighting
│   ├── PhaserGame.tsx              React-to-Phaser wrapper
│   ├── ProceduralRenderer.ts       Isometric tiles and structure artwork
│   ├── WorkerManager.ts            Minion simulation and task state machine
│   ├── InvasionManager.ts          Invasion waves and enemy behavior
│   ├── PathfindingService.ts       EasyStar pathfinding adapter
│   ├── IsometricHelper.ts          Grid and screen coordinate conversion
│   └── audio/soundFx.ts            Procedural Web Audio effects
├── state/
│   ├── useGameStore.ts             Persistent Zustand store and game actions
│   ├── offlineProgression.ts       Return-from-away progression calculation
│   └── storageAdapter.ts            LocalForage storage adapter
├── types/
│   ├── game.ts                     Tasks, units, buildings, waves, and configs
│   └── state.ts                    Store contracts and save state types
└── ui/
    ├── GameHUD.tsx                 In-game HUD and controls
    ├── CitadelCommandModal.tsx     Reconstruction and command center
    ├── RegressionModal.tsx         Prestige and typed reset controls
    ├── SettingsDrawer.tsx          Settings, saves, lore, and tile overlay
    ├── InvasionBanner.tsx          Active wave status
    └── ...                         Codex, market, forge, and defense modals
```

## Development Notes

- The game is local-first and does not require a backend.
- Phaser owns the world canvas; React owns HUD and modal interfaces.
- Grid positions use `IsometricHelper.gridToScreen()` and `screenToGrid()`.
- Verify structure placement with Tile Coordinates before changing coordinates.
- The main validation command is `npm run build`.

## Lore

The full setting and four-realm campaign background are documented in [LORE.md](LORE.md). The same file is loaded into the in-game Lore tab through Vite's raw Markdown import.
