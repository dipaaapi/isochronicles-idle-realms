# CLAUDE.md

## Working preferences

- Before making changes, get the project overview from `.claude/skills/codemap/CODEMAP.md` (every file's purpose and exports) and read only the code the task needs (`/codemap`: `outline <file>`, `where <symbol>`). Don't read the whole project unless the task truly needs it.
- If already familiar with the project, check what's been updated or added since last time (`git log`, `node .claude/skills/codemap/codemap.mjs changed <ref>`, `git status`) instead of re-reading everything.
- When adding, removing or renaming source files, update `.claude/skills/codemap/purposes.json` and run `codemap.mjs build`.
- At the start of a session, briefly explain what's in the project and propose what to do next.
- Repetitive, reusable information (message wording, EN/TL text pairs, labels, lookup tables) goes in a `.json` file and is referenced by key from code, not hardcoded inline. Example: `src/i18n/activityMessages.json`.
- No floating text over characters, buildings or enemies on the map — narrate events in the activity log tray instead.
- Character sprites must follow the designs in `public/portraits/` (structures: `public/structures/`) (silhouette, colours, weapons, props). Compare icon vs rendered frames side by side before shipping model changes.
- Structure models (`src/game/sprites/structureModels.ts`) must follow the Codex art in `public/structures/` (mapping in `STRUCTURE_ART`). The art is the design source, not the old models. Check changes in the Atlas → Structures tab, which shows the art next to the in-game render in every state (construction, idle, firing, hit, destroyed).

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
- `/security-audit` — project skill (`.claude/skills/security-audit/`) for auditing save import, persisted state, PWA config, dependencies and Docker
- `/voxel-model` — project skill for editing minion/enemy/structure voxel models cheaply: `node .claude/skills/voxel-model/model-tool.mjs list|show|stats|render <key>` prints one model or renders only the frames you need (with `--ref` art beside it)
- `/codemap` — project map: `.claude/skills/codemap/CODEMAP.md` plus `node .claude/skills/codemap/codemap.mjs outline|where|changed|check|build` to find code and read only the line ranges you need
- `/lore` — project skill for story/lore/flavour text: canon sheet in `.claude/skills/lore/SKILL.md` plus `node .claude/skills/lore/lore-tool.mjs sections|section|entity|find|check` to pull only the text you need and verify EN/TL pairs

## Architecture

- `src/App.tsx` — screen coordinator (`TITLE` → `STORY` → `GAME`) and owner of modal open/close state.
- `src/game/` — Phaser side. `MainScene.ts` (world, tiles, buildings, camera, lighting; paving FX in `scene/pavementFx.ts`), `WorkerManager.ts` (minion lifecycle, visuals, movement; per-role behaviour in `workers/`: `supportSlime.ts`, `treant.ts` (construction, repairs, enrichment), `combat.ts`, `gathering.ts`, `modifiers.ts` (per-frame speed/attack/stamina), `summonRitual.ts` (summon entrance table), `legacyWorkerArt.ts`), `InvasionManager.ts` (waves, enemies; in `invaders/`: types + weather table, `movement.ts` / `targeting.ts` (fed an `InvaderContext`), `wavePool.ts` (from `data/wavePool.json`), legacy art), `ProceduralRenderer.ts` (procedural art), `PathfindingService.ts`, `IsometricHelper.ts` (`gridToScreen` / `screenToGrid`), `FPSController.ts`, `audio/soundFx.ts` (procedural Web Audio), `PhaserGame.tsx` (React wrapper, remounted on regression or a new layout via `key={`${regressionCount}-${layoutSeed}`}`).
- `src/state/` — `useGameStore.ts` (composes the persistent Zustand store from slices in `store/`: `worldSlice`, `economySlice`, `rosterSlice`, `buildingsSlice`, `defenseSlice`, `progressionSlice`, `persistence` (save export/import, persist merge/partialize); new-game values in `store/initialState.ts` (`createInitialProgress`, shared by the initial state and `resetRealm`)), `economy.ts` (typed access to `src/data/economy.json`: prices, costs, formulas), `resources.ts` (`canAfford` / `subtractCost` / `addResourceDelta`), `buildingLayout.ts` (20×20 grid, seeded random establishment layout), `difficulty.ts`, `skillTree.ts`, `constructionProgress.ts`, `offlineProgression.ts`, `storageAdapter.ts`.
- `src/types/` — `game.ts` (shared types; re-exports the lookup tables), `state.ts` (store contracts, save shape).
- `src/data/` — lookup tables: JSON for text-heavy ones (`economy`, `seasons`, `slimeEvolution`, `treantEvolution`, `godBlessings`, `craftableItems`, `buildingLayout`, `defenseConfig`, `skillTree` (ranked skills, wave-set points, regression team boosts), `establishmentCrews` (each establishment's General, its tenants' gather jobs by terrain and human-realm expeditions; typed access in `src/state/establishmentCrews.ts`)), TS modules where hex colors must stay readable (`platforms`, `tasks`, `units`, `invaders`, `establishmentSkills`).
- `src/ui/` — React HUD (`GameHUD.tsx` right sidebar) and modals (Citadel Command, Regression, Settings, Bestiary, Codex, FAQ, Skill Tree, Merchant, Equipment, Castle Defense/Breached, etc.).
- `src/i18n/` — FAQ translations, `useLanguage` hook, UI strings (`uiStrings.json` + `translations.ts` `useTranslation`), activity log wording.
- `public/backgrounds/` — phase backgrounds, title/victory/defeat art, bestiary icons.

Phaser owns the world canvas; React owns the HUD and modals; they communicate through the Zustand store.

## Conventions

- The platform is 20×20 (`GRID_SIZE` in `src/state/buildingLayout.ts`, from `src/data/buildingLayout.json`); never hardcode grid bounds. The citadel, gate and corner portals are fixed (castle at the centre, ringed by a paved road); the Crystal Spire (`randomSpireSpot`) and the thirteen establishments are placed randomly, and all of them follow the same move rules (`canPlaceEstablishment`); roads are BFS paths from the castle ring around every footprint per realm by `generateLayout(seed)` (failed seeds re-roll only the unplaced sites, so earlier buildings never move). The seed is `layoutSeed` in the store (new realm / regression rolls one, saves keep it); `applyLayoutSeed` mutates `BUILDING_SITES` / `ROAD_TILES` in place so references stay valid, and `PhaserGame` is keyed on the seed so the scene remounts. Build order: the Ent builds only the castle and Crystal Spire, then summons every General for free in `constructionOrder`, one at a time — the next only after the last summoned General has built its establishment (`nextGeneralToSummon`, `workers/treant.ts` `updateGeneralSummoning`) before its other duties; each General builds its own establishment (`workers/generalConstruction.ts`). Only sites being built show a scaffold (`StructureManager.animateConstructionSite`, fed by `WorkerManager.getConstructionStatus`, one entry per active builder).
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
- Generals & tenants: every establishment has one General (a roster fighter, `UNIT_CLASSES[c].requiredBuilding`) and five tenants of the same kind, spawned in the world by `DefenderSystem` (never stored in the roster; old roster tenants are dropped on load). `src/data/establishmentCrews.json` is the single source for who belongs where; the test asserts the General ↔ establishment pairing. Tenants gather on their crew's terrain (`OCEAN` = wade into the ocean ring, `GRASS`, `PAVEMENT` = road tiles, `ESTABLISHMENT`, `PORTAL` = around the nearest rift) and some go on expeditions through a rift (hidden, off the blocker list, wait out waves); each return calls `stirVengeance`, and `startInvasion` adds `vengeanceExtraInvaders` to the wave. New General models get a portrait rendered from their voxel model into `public/portraits/`.
- Hover cards use `src/ui/HoverTooltip.tsx` (portal + fixed position, flips and clamps to the viewport) so `overflow-hidden` / scrolling parents can't clip them.
- Commit messages use the `ft:` prefix followed by a list of touched areas.
- Some code comments are in Filipino/Taglish; keep them as-is.

## Current state (as of 2026-10-03)

- `npm run build` and `npm test` both pass; the game runs in the browser without console errors.
- 2026-09-30 refactor: store split into slices, `WorkerManager` / `InvasionManager` / `types/game.ts` split into modules, economy tables moved to JSON. Fixes: `require` in the store (crashed establishment skills in the browser), `resetRealm` drifting from new-game state, spending below zero on metal/charcoal/coal/minerals, bestiary/auto-buy not persisted, breach resetting the Slime's evolution, a pathfinding key that broke grids wider than 10, and a new-game soft-lock (Slime auto-evolve spent the castle supplies).
- 2026-10-03: thirteen Generals, one per establishment (new: Thornwood Dryad / Wood Grove, Watchtower Minotaur / Quarry, Ember Imp / Mine, Void Wraith / Void Gate, Bone Knight / Bone Crypt; Golem → Foundry, Lava Gargoyle → Cave, Succubus → Pavilion). The duplicate tenant system (Ent-summoned roster tenants alongside DefenderSystem's mismatched guards) was merged into DefenderSystem.
- Design changes: single Ent (caretaker system removed, Treant cap 1); 20×20 platform with random establishment placement; only the Ent's current construction site shows a scaffold (progress bar / dust / hazard stripes when waiting for supplies).

- 2026-10-04: wave balance moved to `src/data/waveBalance.json` (wave 1–100 × day 1–365 × difficulty, elites, boss ranks, spawn pacing, skill power; typed in `src/state/waveBalance.ts`); random per-wave formations in `src/data/waveTactics.json` (`src/state/waveTactics.ts`, rolled in `startInvasion`, stored as `invasion.tactic`, laid out by `game/invaders/wavePlan.ts`, portal patterns in `PortalManager.open`); structure-skill damage scales with the wave; platform tiles themed per difficulty (`src/data/platformThemes.json`, `PixelTileArt`); scouts are random humans/Mecha that drop ground coins/supplies and sometimes equipment (`src/data/scoutLoot.json`, `src/state/scoutLoot.ts`, `grantEquipmentDrop`). Invader models (Mecha Scout, Titan, Drone rebuilt; Valkyrie, Assassin, Chrono Mage, Siege Tank, High Priest, Knight reworked) and the portal follow their portraits/Codex art.

## Next-step candidates

- Balance: `node scripts/balance-sim.cjs [EASY|NORMAL|HARD]` measures tenant income headless and models waves 1-100 (writes `reports/balance-report.md`). It uses the game's own wave curves and tactic mix, reports load on day 1 and day 365, and includes a skill-DPS estimate; it leaves out Generals, Slime/Ent and battle items. Re-run it after changing economy, invader or waveBalance numbers.
- Replace the placeholder PWA icons with final art if desired.
- The PWA precache is ~12.9 MB, mostly `public/backgrounds/` JPEGs; compress or convert to WebP to shrink it.
