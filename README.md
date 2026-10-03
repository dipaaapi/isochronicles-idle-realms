# IsoChronicle: Idle Realms

> Rebuild the ruined citadel. Raise an army. Conquer the four realms.

IsoChronicle: Idle Realms is an offline-first isometric idle strategy game about castle reconstruction, monster summoning, resource automation and wave-based defense. It runs entirely in the browser, with no backend, and can be installed as a PWA. It is fully playable in **English** and **Tagalog**.

You play as a weakened Demon Lord who wakes in the ruins of a former citadel. Your only ally is a Support Slime. The Slime calls forth an Ancient Ent, the Ent rebuilds the castle and summons the realm's Generals, and the Generals raise the establishments and their tenants. Together they have to survive 100 invasion waves across four realms.

Repository: <https://github.com/dipaaapi/isochronicles-idle-realms>

## Game Loop

1. **Day 1:** you start with ruins, no castle and one Support Slime.
2. The Slime summons the **Ancient Ent** for free.
3. The Ent builds the **Citadel Castle**, then the **Crystal Spire**. It waits whenever supplies run short and auto-buys any shortfall with coins.
4. Next, the Ent summons the **thirteen Generals** one by one, in construction order, until every one of them stands.
5. **Each General builds its own establishment.** Once it stands, five **tenants** of the same kind move in and start working.
6. Tenants gather, craft and go on expeditions; Generals scout and lead in battle; the Ent repairs, enriches the soil and forges gear.
7. Defend against human and mecha invasions. Every **5 waves** cleared earns skill points for the Skill Tree.
8. Reach Wave 100 (or regress at any time) to restart with permanent team boosts.

There is no build button. Construction runs on autopilot, and you steer the realm through the market, upgrades, skills and battle actions.

## Establishments, Generals and Tenants

Each realm places the thirteen establishments at random (`layoutSeed`). The castle, gate, Crystal Spire and the four corner rifts stay in fixed positions. Every establishment has one General and five tenants of the General's kind:

| # | Establishment | General | Tenants work… | Expeditions |
| --- | --- | --- | --- | --- |
| 1 | Wood Grove | Thornwood Dryad | grass and the grove: wood, charcoal | — |
| 2 | Stone Quarry | Watchtower Minotaur | roads and the quarry: stone, minerals | — |
| 3 | Metal Mine | Ember Imp | the mine: metal, coal | ✓ |
| 4 | Water Port | Water Merman | the ocean: fish, water | — |
| 5 | Mystic Cave | Lava Gargoyle | rifts and the cave: essence, aether shards | — |
| 6 | Infernal Kennel | Demon Hound | grass: charcoal | ✓ |
| 7 | Brimstone Perch | Harpy | the perch: obsidian | ✓ |
| 8 | Abyssal Trench | Kraken | the ocean: fish, water, abyssal pearls | — |
| 9 | Crypt of Souls | Lich Necromancer | rifts: soul fragments | ✓ |
| 10 | Golem Foundry | Earth Golem | the foundry: metal, minerals | ✓ |
| 11 | Shadow Pavilion | Succubus | the pavilion: coins | ✓ |
| 12 | Void Gate | Void Wraith | rifts: aether shards, essence | ✓ |
| 13 | Bone Crypt | Bone Knight | roads: stone | ✓ |

- **Generals** are unique roster units. They don't gather; they build their home, then guard it and the citadel, scout the island and fight.
- **Tenants** are spawned by the world itself and are never stored in the roster. They garrison their home during waves.
- **Expeditions:** some tenants slip through a rift into the human realm and come back with loot. Every return stirs **vengeance**, which adds extra invaders to the next wave.
- Establishments level up for by-products and stronger output, and each has its own active skills.

Crews, terrains and expedition rules live in `src/data/establishmentCrews.json`.

## Features

- A 20×20 procedural floating island, painted tile by tile as 2.5D pixel art (raised land, sunken water, rocky underside) and rendered at the display's native pixel density.
- Minions, Generals and invaders drawn as 8-direction animated pixel-art sprites, ray-cast from jointed voxel models in background Web Workers.
- Structures rendered from voxel models that follow the Codex art, with construction, idle, firing, hit and destroyed states.
- Autonomous units with movement, gathering, combat, healing, construction and expedition states, plus EasyStar.js pathfinding.
- 100 invasion waves through four corner rifts, with live `remaining / total` counts. **Rushers** ignore everything else and charge the citadel.
- Castle hull and shield, towers, walls and beacon, plus battle items and the Demon Lord's lightning strike.
- Support Slime and Ancient Ent evolution (five forms each), God Blessings, research upgrades and equipment crafting/buying.
- Skill Tree with ranked skills earned by clearing waves, plus a free respec.
- Regression prestige with permanent team-only boosts.
- Easy / Normal / Hard difficulty.
- Day/night cycle, seasons and weather: rain (sometimes stormy, with lightning and camera shake), snow and heat haze.
- Living world: grass sways and water wakes follow units, fish leap, clouds drift, and the sun and moon arc over the island.
- **Activity log tray** that narrates days, weather, waves, construction, roster changes, achievements and skills. There is no floating text over the map.
- **Atlas:** Guide, Lore, and a Structures tab that compares each structure's art with its in-game render.
- Bestiary of discovered minions and invaders, with portraits.
- Procedural Web Audio for battle sounds, fanfares and ambience.
- Local-first IndexedDB persistence, offline progression, and JSON save export/import.
- PWA service worker for offline play.
- Tile Coordinates overlay with chess-style names: columns **A–T** for grid X, rows **1–20** for grid Y, so `(4,5)` is **E6**.

## Skill Tree

Skill points come from clearing waves; you don't need to regress to earn them.

- Every **5 waves** cleared grants **2 skill points** (40 points by Wave 100).
- There are four branches. Each branch is a chain: a skill needs at least one rank in the skill before it.

| Branch | Skills |
| --- | --- |
| ⚔️ Minions | Demon Might (attack), Swift Servants (speed), Hardened Hides (less damage taken), Overwhelming Force (big attack capstone) |
| 🏰 Citadel | Obsidian Walls (less castle damage), Arcane Artillery (tower damage), Rapid Siegecraft (tower cooldown), Mending Stones (heal the citadel after each wave) |
| 🌾 Resources | Rich Foundations (wood & stone), Realm Abundance (all harvests), Plunder Tax (invader bounty) |
| ✨ Mystic | Arcane Attunement (longer God Blessings), Ley Line Surge (cheaper God Blessings) |

- Click a skill to add a rank; it takes effect immediately. **Reset skills** refunds every point for free.
- Skills belong to the current realm. Regression refunds them, and you earn the points again from Wave 1.
- Numbers and EN/TL text live in `src/data/skillTree.json`.

## Regression

Regression resets the active realm and keeps your long-term progression.

- The realm returns to ruins with a new random establishment layout. Only the Support Slime remains.
- The Slime summons the Ent again. The Ent rebuilds the castle and spire and summons the Generals, and each General rebuilds its establishment.
- Regression bonuses, Support Slime evolution and regression history are kept. Skill ranks are refunded.
- Each Regression tier permanently boosts **your team only**; enemies never get stronger from it:
  - +5% minion attack
  - +3% minion speed
  - 3% less damage taken by minions
  - +5% tower damage
  - +5% harvest
  - +100 castle max HP
  - bonus starting coins and shards

To regress, type the current realm name in the confirmation field. To erase your Regression tier and history, type:

```text
RESET REGRESSIONS
```

## Controls

### World

- **Left-click and drag:** pan the camera. The island always stays inside the frame.
- **Mouse wheel:** zoom between 0.65× and 2.2×.
- **Click an invader:** strike it with the Demon Lord's lightning.
- **Click a building:** open its establishment panel. **Hold** an establishment to move it (not during a wave).
- **Click a resource badge:** open quick trade for that resource. To set the amount:
  - turn the **quantity knob** (drag, or scroll with Shift held for ×10, or use the arrow keys),
  - use **− / +**,
  - or pick 25% / 50% / 75% / MAX.

  The total always uses the market's real buy and sell price.

### Keyboard

| Key | Action |
| --- | --- |
| `` ` `` (backtick) | Play / pause |
| `1` | 2× speed (press again for 1×) |
| `2` | 3× speed (press again for 1×) |

Shortcuts are ignored while you type in a text field.

### Game HUD

- **Play / Pause, 2×, 3×:** control simulation speed.
- **Servants:** minion roster and commands.
- **Citadel Command:** reconstruction status, minions, market, forge, research and defenses.
- **Atlas:** Guide, Lore and Structures.
- **Bestiary:** discovered minions and invaders.
- **Skill Tree** and **Regression:** skills, prestige and reset controls.
- **Settings:** language (EN/TL), audio, blood & gore, difficulty, FPS and performance, saves, and the tile coordinate overlay.

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
npm run build     # tsc type-check + Vite production bundle
npm run preview
```

### Tests

```bash
npm test
```

`npm test` runs `scripts/test-construction.cjs` and `scripts/test-invasions.cjs`. The scripts transpile the TypeScript sources inside a Node VM, with Phaser, audio and storage stubbed. They cover:

- construction order: Ent → castle/spire → Generals → establishments
- the economy, purchases and realm reset
- difficulty, regression and the skill tree
- saves and migrations
- crews, expeditions and invasions

### Docker

Docker Compose starts the dev server with volume mounting and polling-based HMR:

```bash
docker compose up --build
docker compose down
```

## Persistence and Saves

- State is stored locally with Zustand and LocalForage (IndexedDB).
- Offline progression is calculated when you return.
- Settings can export a JSON save or import one from another browser or device.
- **Reset Realm** clears the active realm and returns to the title screen.
- Regression reset is separate from Reset Realm and needs typed confirmation.

## Technology

- **React 18** + **TypeScript** for the app and HUD.
- **Phaser 3** for the isometric world canvas.
- **Vite 5** + **vite-plugin-pwa** for bundling and the service worker.
- **Tailwind CSS** + **DaisyUI** for the interface.
- **Zustand** + **LocalForage** for state and IndexedDB persistence.
- **EasyStar.js** for grid pathfinding.
- **Lucide React** for icons.

Phaser owns the world canvas and React owns the HUD and modals. They communicate only through the Zustand store.

## Project Structure

```text
public/
├── backgrounds/           Phase, title, victory/defeat art and bestiary icons
├── portraits/             General portraits rendered from their voxel models
├── structures/            Codex art for every structure (design source for structure models)
└── pwa-*.png, robots.txt
scripts/
├── test-construction.cjs  Construction, economy, reset, difficulty, regression, crew checks
└── test-invasions.cjs     Invasion and wave checks
src/
├── App.tsx                Screen coordinator (Title → Story → Game) and modal state
├── data/                  Lookup tables: economy, establishmentCrews, buildingLayout, skillTree,
│                          seasons, evolutions, blessings, items, wave pool, units, invaders…
├── game/
│   ├── MainScene.ts       World, tiles, camera, lighting
│   ├── PhaserGame.tsx     React ↔ Phaser wrapper (remounts on regression / new layout)
│   ├── PixelTileArt.ts    Pixel-art tile atlas painter
│   ├── WorkerManager.ts   Minion lifecycle, movement, visuals
│   ├── workers/           Per-role behaviour: supportSlime, treant (Ent), generalConstruction,
│   │                      combat, gathering, modifiers, summonRitual
│   ├── DefenderSystem.ts  Establishment tenants: gathering, expeditions, garrisons
│   ├── InvasionManager.ts Waves and enemies (invaders/: movement, targeting, wave pool)
│   ├── StructureManager.ts, TowerSystem.ts, PortalManager.ts, GroundLootManager.ts
│   ├── skills/            Establishment skill system and cast effects
│   ├── sprites/           Voxel models, 8-direction sprite baker (Web Worker), Phaser glue
│   ├── WorldEffects.ts    Sky, weather, lightning, fish, tile reactions
│   ├── PathfindingService.ts, IsometricHelper.ts, FPSController.ts
│   └── audio/soundFx.ts   Procedural Web Audio
├── i18n/                  uiStrings.json, activityMessages.json, atlasGuide.json,
│                          structureAtlas.json, FAQ, useLanguage / useTranslation
├── state/
│   ├── useGameStore.ts    Persistent Zustand store composed from store/ slices
│   ├── store/             world, economy, roster, buildings, defense, progression, persistence
│   ├── constructionProgress.ts  Build order (Ent: castle → spire → summon Generals)
│   ├── buildingLayout.ts  20×20 grid and seeded random establishment layout
│   ├── establishmentCrews.ts, economy.ts, resources.ts, difficulty.ts, skillTree.ts
│   ├── activityLog.ts, activityWatcher.ts  Activity log store and narration
│   └── offlineProgression.ts, storageAdapter.ts
├── types/                 game.ts (shared types), state.ts (store and save shape)
└── ui/                    GameHUD, ActivityLogTray, Atlas (+ StructureAtlas), CitadelCommand,
                           EstablishmentModal, UnitRoster, Merchant, Equipment, Research,
                           Fortifications, SkillTree, Regression, Bestiary, Settings, …
```

## Contributing

- Run `npm run build` and `npm test` before pushing.
- Never hardcode grid bounds; use `GRID_SIZE` from `src/state/buildingLayout.ts`. Verify placement with the Tile Coordinates overlay.
- Every player-visible string needs both **EN** and **TL**:
  - UI strings go in `src/i18n/uiStrings.json`.
  - Log wording goes in `src/i18n/activityMessages.json`.
  - Data tables use `name` / `nameEn` pairs.
- Put repeated text and lookup tables in JSON and reference them by key; don't hardcode them inline.
- Never draw floating text over the map; narrate events in the activity log with `logMessage(key, vars)`.
- Character sprites follow `public/backgrounds/bestiary-icons/`, and structure models follow `public/structures/`.
- When mechanics change, update the Atlas Guide, the FAQ, [LORE.md](LORE.md) and [LORE.tl.md](LORE.tl.md).
- Commit messages use the `ft:` prefix followed by the areas touched.

See [CLAUDE.md](CLAUDE.md) for detailed architecture notes.

## Lore

The setting and four-realm campaign are told in [LORE.md](LORE.md), with a Tagalog version in [LORE.tl.md](LORE.tl.md). Both files are loaded into the in-game Atlas Lore tab through Vite's raw Markdown import.

## License

No license has been chosen yet. Until one is added, all rights are reserved.
