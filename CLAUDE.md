# CLAUDE.md

## Working preferences

- Always analyze the whole project first before making changes.
- If already familiar with the project, check what's been updated or added since last time (e.g. `git log`, `git diff`, `git status`) instead of re-reading everything.
- At the start of a session, briefly explain what's in the project and propose what to do next.
- Repetitive, reusable information (message wording, EN/TL text pairs, labels, lookup tables) goes in a `.json` file and is referenced by key from code, not hardcoded inline. Example: `src/i18n/activityMessages.json`.
- No floating text over characters, buildings or enemies on the map — narrate events in the activity log tray instead.
- Character sprites must follow the designs in `public/backgrounds/bestiary-icons/` (silhouette, colours, weapons, props). Compare icon vs rendered frames side by side before shipping model changes.

## Project overview

IsoChronicle: Idle Realms is an offline-first isometric idle strategy game. The player is a weakened Demon Lord rebuilding a ruined citadel with a Support Slime, summoning an Ancient Ent, building resource areas, raising minions, and surviving 100 invasion waves across four realms. After that, Regression (prestige) resets the realm while keeping bonuses. See [README.md](README.md) for gameplay and [LORE.md](LORE.md) for setting (LORE.md is also loaded in-game via Vite raw import).

No backend: state persists locally with Zustand + LocalForage (IndexedDB), with offline progression and JSON save export/import.

## Stack

React 18 + TypeScript, Phaser 3 (world canvas), Vite 5 + vite-plugin-pwa, Tailwind + DaisyUI, Zustand, LocalForage, EasyStar.js, Lucide icons.

## Commands

- `npm run dev` — dev server on <http://localhost:5173>
- `npm run build` — `tsc` type-check + Vite production build (main validation)
- `npx tsc --noEmit` — type-check only
- `node scripts/test-construction.cjs` / `node scripts/test-invasions.cjs` — logic tests (transpile TS in a Node VM with Phaser/audio/storage stubbed)
- `docker compose up --build` — dev server in Docker with polling HMR

## Architecture

- `src/App.tsx` — screen coordinator (`TITLE` → `STORY` → `GAME`) and owner of modal open/close state.
- `src/game/` — Phaser side. `MainScene.ts` (world, tiles, buildings, camera, lighting), `WorkerManager.ts` (minion simulation / task state machine, largest file), `InvasionManager.ts` (waves, enemies), `ProceduralRenderer.ts` (procedural art), `PathfindingService.ts`, `IsometricHelper.ts` (`gridToScreen` / `screenToGrid`), `FPSController.ts`, `audio/soundFx.ts` (procedural Web Audio), `PhaserGame.tsx` (React wrapper, remounted on regression via `key={regressionCount}`).
- `src/state/` — `useGameStore.ts` (persistent Zustand store and all game actions), `difficulty.ts`, `skillTree.ts`, `constructionProgress.ts`, `offlineProgression.ts`, `storageAdapter.ts`.
- `src/types/` — `game.ts` (units, tasks, buildings, waves, configs), `state.ts` (store contracts, save shape).
- `src/ui/` — React HUD (`GameHUD.tsx` right sidebar) and modals (Citadel Command, Regression, Settings, Bestiary, Codex, FAQ, Skill Tree, Merchant, Equipment, Castle Defense/Breached, etc.).
- `src/i18n/` — FAQ translations + `useLanguage` hook.
- `public/backgrounds/` — phase backgrounds, title/victory/defeat art, bestiary icons.

Phaser owns the world canvas; React owns the HUD and modals; they communicate through the Zustand store.

## Conventions

- The platform is 20×20 (`GRID_SIZE` in `src/state/buildingLayout.ts`, from `src/data/buildingLayout.json`); never hardcode grid bounds. The citadel, gate, Crystal Spire and corner portals are fixed (castle at the centre); the five establishments are placed randomly per realm by `generateLayout(seed)`. The seed is `layoutSeed` in the store (new realm / regression rolls one, saves keep it); `applyLayoutSeed` mutates `BUILDING_SITES` / `ROAD_TILES` in place so references stay valid, and `PhaserGame` is keyed on the seed so the scene remounts. Only the site the Ent is currently building shows its scaffold (`StructureManager.animateConstructionSite`, fed by `WorkerManager.getConstructionStatus`).
- Verify structure placement with the in-game Tile Coordinates overlay before changing grid coordinates. Players see chess-style names (`IsometricHelper.tileName`: X → A–T, Y → 1–20, so (4,5) = E6); code keeps 0-based (x,y).
- Tiles are pixel art painted by `PixelTileArt.ts` into one canvas atlas (1 art pixel = `ART_PIXEL` world units, NEAREST filter). Water sits `WATER_DROP_WORLD` below land. Preview tile changes offline by painting to a PNG before touching the game.
- Rendering is high-DPI: `PhaserGame.tsx` sizes the canvas at devicePixelRatio (Scale mode NONE + zoom 1/dpr) and publishes `dpr` in the registry; `MainScene` camera zoom = `userZoom * dpr`, and Text objects get a higher resolution automatically. Don't reintroduce `Scale.RESIZE`.
- Children of `islandContainer` draw in insertion order (container children ignore `setDepth`), so add tiles before structures/units. `airFxLayer` is re-raised every frame so later-spawned units stay beneath it.
- Character sprites (minions + invaders): `src/game/sprites/` — `minionModels.ts` / `enemyModels.ts` define jointed voxel models (+x right, +y forward, +z up) with walk / attack / idle poses (parts support pitch, roll, yaw, offset, scale, hidden); `VoxelSprite.ts` ray-casts them into 8-direction pixel-art sheets (rows = directions, direction 0 faces the viewer, steps 45° clockwise); `spriteBake.worker.ts` bakes sheets off-thread (two workers: minions first, then enemies); `CharacterSprites.ts` turns them into Phaser textures/anims (cached per page load). Units spawned before baking finishes use the legacy vector body; minions are upgraded in place once their sheet arrives. Tests stub `CharacterSprites` with a Proxy (the module uses `import.meta`). Preview model changes offline by rendering sheets to PNG before touching the game.
- Camera is clamped so the island stays inside the frame (`MainScene.clampCamera` / `getIslandBounds`); starting zoom fits the island.
- `WorldEffects.ts` drives the sky (sun/moon arc between the island tips on `skyFxLayer`, behind the tiles, plus stars), tile reactions under moving units, leaping fish, world-space rain/snow/heat haze, drifting clouds, and lightning (RAIN days are randomly stormy: frequent strikes, double strikes, sheet lightning, camera shake). Layer order: `skyFxLayer` → tiles → `groundFxLayer` → structures/units → `airFxLayer`.
- Activity log: `src/state/activityLog.ts` (session store, merging of repeated events into summed ×N entries, floating-text classifier), `src/state/activityWatcher.ts` (narrates store diffs: day, weather, waves, construction, roster, achievements, skills, regression, blessings), `src/ui/ActivityLogTray.tsx` (bottom-left tray over the canvas). Log with `logMessage(key, vars)`; add new wording to `src/i18n/activityMessages.json`. Both managers' `spawnFloatingPopup` now route into the log (the nearest unit names the entry). Tests stub `activityLog` (it imports JSON).
- Commit messages use the `ft:` prefix followed by a list of touched areas.
- Some code comments are in Filipino/Taglish; keep them as-is.

## Current state (as of 2026-09-29)

- `npm run build` and `npm test` both pass.
- Recent work (last 3 commits): HUD redesign, settings drawer, castle breached modal, Citadel Command, difficulty, title screen, sound FX, skill tree, regression, FAQ/i18n, per-phase backgrounds. `src/components/Realmlog.tsx` was added then removed.
- Housekeeping done 2026-09-29: `.vite` cache ignored and untracked, PWA icons (`public/pwa-*.png`, placeholder "IC" crystal design) and `robots.txt` added, `npm test` script added, README structure refreshed, Phaser/React split into vendor chunks.

## Next-step candidates

- Replace the placeholder PWA icons with final art if desired.
- The PWA precache is ~12.6 MB, mostly `public/backgrounds/` JPEGs; compress or convert to WebP to shrink it.
- Large files (`WorkerManager.ts`, `useGameStore.ts`, `InvasionManager.ts`) are candidates for splitting if they keep growing.
