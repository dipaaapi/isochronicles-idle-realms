# CLAUDE.md

## Working preferences

- Always analyze the whole project first before making changes.
- If already familiar with the project, check what's been updated or added since last time (e.g. `git log`, `git diff`, `git status`) instead of re-reading everything.
- At the start of a session, briefly explain what's in the project and propose what to do next.
- Repetitive, reusable information (message wording, EN/TL text pairs, labels, lookup tables) goes in a `.json` file and is referenced by key from code, not hardcoded inline. Example: `src/i18n/activityMessages.json`.
- No floating text over characters, buildings or enemies on the map — narrate events in the activity log tray instead.
- Character sprites must follow the designs in `public/backgrounds/bestiary-icons/` (silhouette, colours, weapons, props). Compare icon vs rendered frames side by side before shipping model changes.

## Project overview

IsoChronicle: Idle Realms is an offline-first isometric idle strategy game. The player is a weakened Demon Lord rebuilding a ruined citadel with a Support Slime, summoning an Ancient Ent, building resource areas, raising minions, and surviving 100 invasion waves across four realms. After that, Regression (prestige) resets the realm while keeping bonuses. See [README.md](README.md) for gameplay and [LORE.md](LORE.md) for setting. LORE.md and its Tagalog twin [LORE.tl.md](LORE.tl.md) are loaded into the Atlas Lore tab via Vite raw import (`##` sections, blank-line paragraphs, `- ` bullet lists); keep both in sync with the mechanics.

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
- `src/game/` — Phaser side. `MainScene.ts` (world, tiles, buildings, camera, lighting; paving FX in `scene/pavementFx.ts`), `WorkerManager.ts` (minion lifecycle, visuals, movement; per-role behaviour in `workers/`: `supportSlime.ts`, `treant.ts` (construction, repairs, enrichment), `combat.ts`, `gathering.ts`, `modifiers.ts` (per-frame speed/attack/stamina), `summonRitual.ts` (summon entrance table), `legacyWorkerArt.ts`), `InvasionManager.ts` (waves, enemies; in `invaders/`: types + weather table, `movement.ts` / `targeting.ts` (fed an `InvaderContext`), `wavePool.ts` (from `data/wavePool.json`), legacy art), `ProceduralRenderer.ts` (procedural art), `PathfindingService.ts`, `IsometricHelper.ts` (`gridToScreen` / `screenToGrid`), `FPSController.ts`, `audio/soundFx.ts` (procedural Web Audio), `PhaserGame.tsx` (React wrapper, remounted on regression or a new layout via `key={`${regressionCount}-${layoutSeed}`}`).
- `src/state/` — `useGameStore.ts` (composes the persistent Zustand store from slices in `store/`: `worldSlice`, `economySlice`, `rosterSlice`, `buildingsSlice`, `defenseSlice`, `progressionSlice`, `persistence` (save export/import, persist merge/partialize); new-game values in `store/initialState.ts` (`createInitialProgress`, shared by the initial state and `resetRealm`)), `economy.ts` (typed access to `src/data/economy.json`: prices, costs, formulas), `resources.ts` (`canAfford` / `subtractCost` / `addResourceDelta`), `buildingLayout.ts` (20×20 grid, seeded random establishment layout), `difficulty.ts`, `skillTree.ts`, `constructionProgress.ts`, `offlineProgression.ts`, `storageAdapter.ts`.
- `src/types/` — `game.ts` (shared types; re-exports the lookup tables), `state.ts` (store contracts, save shape).
- `src/data/` — lookup tables: JSON for text-heavy ones (`economy`, `seasons`, `slimeEvolution`, `treantEvolution`, `godBlessings`, `craftableItems`, `buildingLayout`, `defenseConfig`, `skillTree` (ranked skills, wave-set points, regression team boosts)), TS modules where hex colors must stay readable (`platforms`, `tasks`, `units`, `invaders`, `establishmentSkills`).
- `src/ui/` — React HUD (`GameHUD.tsx` right sidebar) and modals (Citadel Command, Regression, Settings, Bestiary, Codex, FAQ, Skill Tree, Merchant, Equipment, Castle Defense/Breached, etc.).
- `src/i18n/` — FAQ translations, `useLanguage` hook, UI strings (`uiStrings.json` + `translations.ts` `useTranslation`), activity log wording.
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
- Language: one setting, the store's `language` (`EN` default / `TL`); `useLanguage` and `useTranslation` both read it. Every player-visible string needs both languages — UI strings in `src/i18n/uiStrings.json` (`t(key)`), data tables as `name`/`nameEn`-style pairs, log wording in `activityMessages.json` (free-form popup text is translated through its `phrases` table, resource names through `resourceNames`). Roster units are named with the English class name; display them with `unitName()`.
- Atlas Guide steps live in `src/i18n/atlasGuide.json` (`**bold**` supported); FAQ in `src/i18n/faqTranslations.ts`. Update them when mechanics change.
- Hover cards use `src/ui/HoverTooltip.tsx` (portal + fixed position, flips and clamps to the viewport) so `overflow-hidden` / scrolling parents can't clip them.
- Commit messages use the `ft:` prefix followed by a list of touched areas.
- Some code comments are in Filipino/Taglish; keep them as-is.

## Current state (as of 2026-09-30)

- `npm run build` and `npm test` both pass; the game runs in the browser without console errors.
- 2026-09-30 refactor: store split into slices, `WorkerManager` / `InvasionManager` / `types/game.ts` split into modules, economy tables moved to JSON. Fixes: `require` in the store (crashed establishment skills in the browser), `resetRealm` drifting from new-game state, spending below zero on metal/charcoal/coal/minerals, bestiary/auto-buy not persisted, breach resetting the Slime's evolution, a pathfinding key that broke grids wider than 10, and a new-game soft-lock (Slime auto-evolve spent the castle supplies).
- Design changes: single Ent (caretaker system removed, Treant cap 1); 20×20 platform with random establishment placement; only the Ent's current construction site shows a scaffold (progress bar / dust / hazard stripes when waiting for supplies).

## Next-step candidates

- Early-game economy: the starting supplies don't cover the castle plus the four core establishments (~120 wood / 105 stone / 160 coins needed vs 65 / 60 / 100), and minions can't be recruited until those stand, so early progress relies on tapping scouts and selling. Consider rebalancing.
- Replace the placeholder PWA icons with final art if desired.
- The PWA precache is ~12.9 MB, mostly `public/backgrounds/` JPEGs; compress or convert to WebP to shrink it.
