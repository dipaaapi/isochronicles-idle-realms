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
6. Every 5 waves you clear earns skill points — spend them in the Skill Tree right away.
7. Reach Wave 100 (or regress any time) to restart with permanent team boosts and rebuild again.

## Resource Areas

Resource buildings begin at level 0 and are constructed through Citadel Command.

| Area | Level 1 | Level 2 |
| --- | --- | --- |
| Wood Grove | Wood | Charcoal |
| Metal Mine | Metal | Coal |
| Stone Quarry | Stone | Minerals |
| Water Port | Water | Fish |

The Water Port and Metal Mine use explicit isometric grid coordinates. Enable **Tile Coordinates** in Settings to see chessboard-style tile names on every tile: letters **A–T** run along the grid X axis and numbers **1–20** along the Y axis, so grid `(4,5)` is **E6**. Large rank and file markers line the island's front edges.

## Features

- Procedural Phaser isometric 20x20 floating island, painted per tile as 2.5D pixel art (raised land, sunken water, rocky underside) and rendered at the display's native pixel density.
- Autonomous minions with movement, gathering, combat, healing, and task states.
- Invaders drawn as 8-direction animated pixel-art sprites (walk and attack cycles) rendered from voxel models in a background Web Worker.
- Living tiles: grass sways and water wakes follow whoever walks through, fish leap from the water, pixel clouds drift overhead, and lightning strikes at random during rain.
- EasyStar.js grid pathfinding.
- Day 1 reconstruction phase with Slime-led Ent and building progression.
- Four resource areas with upgradeable output chains.
- 100 invasion waves with live counts displayed as `remaining / total`. Some invaders are **rushers** that ignore everything else and charge the citadel.
- Procedural battle audio: sword clangs, monster bashes, and walls being battered.
- Castle, shield, turret, and wall upgrades.
- Equipment crafting, purchasing, and unit equipment management.
- Support Slime and Ent evolution systems.
- Day/night cycle, weather, procedural effects, audio, and camera pan/zoom.
- Local-first IndexedDB persistence and offline progression.
- JSON save export and import.
- PWA service-worker generation for offline-ready deployment.
- Skill Tree with ranked skills earned by clearing waves, plus a free respec.
- Regression prestige system with permanent team-only stat boosts.
- Default-on tile coordinate overlay for placement debugging.

## Skill Tree

Skill points come from clearing waves — no Regression needed.

- Every **5 waves** cleared grants **2 skill points** (40 points by Wave 100).
- Four branches, each a chain where a skill needs at least one rank in the one before it:

| Branch | Skills |
| --- | --- |
| ⚔️ Minions | Demon Might (attack), Swift Servants (speed), Hardened Hides (less damage taken), Overwhelming Force (big attack capstone) |
| 🏰 Citadel | Obsidian Walls (less castle damage), Arcane Artillery (tower damage), Rapid Siegecraft (tower cooldown), Mending Stones (heal the citadel after each wave) |
| 🌾 Resources | Rich Foundations (wood & stone), Realm Abundance (all harvests), Plunder Tax (invader bounty) |
| ✨ Mystic | Arcane Attunement (longer God Blessings), Ley Line Surge (cheaper God Blessings) |

- Click a skill to add a rank; it takes effect immediately. **Reset skills** refunds every point for free.
- Skills belong to the current realm: Regression refunds them and you earn points again from Wave 1.
- Numbers and EN/TL text live in `src/data/skillTree.json`.

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
- Each Regression tier permanently boosts **your team only** — enemies never get stronger from it: +5% minion attack, +3% minion speed, 3% less minion damage taken, +5% tower damage, +5% harvest, and +100 castle max HP, plus bonus starting coins and shards.
- Skill ranks are refunded; clear waves again to re-earn the points.

To execute a Regression, type the current realm name in the confirmation field. To erase Regression tier and history, type:

```text
RESET REGRESSIONS
```

## Controls

### World

- **Left-click and drag:** Pan the island camera (the island always stays inside the frame).
- **Mouse wheel:** Zoom the island between 0.65x and 2.2x.
- **Click an active invader:** Strike it with the Demon Lord's lightning.
- **Click a resource badge:** Open quick trade for that resource. Turn the **quantity knob** (drag, scroll — hold Shift for ×10 — or arrow keys), use **− / +**, or pick 25% / 50% / 75% / MAX. The total always uses the market's real buy/sell price.

### Game HUD

- **Play / Pause (one button), 2×, 3×:** Control simulation speed.

### Keyboard

| Key | Action |
| --- | --- |
| `` ` `` (backtick) | Play / pause |
| `1` | 2× speed (press again for 1×) |
| `2` | 3× speed (press again for 1×) |

Shortcuts are ignored while typing in a text field.
- **Servants:** Open the minion roster and command panel.
- **Citadel Command:** Manage reconstruction, minions, market, forge, research, and defenses.
- **Guide / Codex:** Open gameplay help and world information.
- **Bestiary:** Review discovered minions and invaders.
- **Regression:** Open prestige progression and reset controls.
- **Settings:** Configure audio, blood & gore effects (saved with your realm), performance, saves, lore, and tile coordinates.

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
public/
├── backgrounds/                    Phase, title, victory/defeat art and bestiary icons
├── pwa-192x192.png, pwa-512x512.png  PWA app icons
└── robots.txt
scripts/
├── test-construction.cjs           Construction, purchasing, reset, difficulty, regression checks
└── test-invasions.cjs              Invasion and regression wave checks
src/
├── App.tsx                         Screen coordinator (Title → Story → Game) and modal state
├── main.tsx                        React entry point
├── index.css                       Global styles and visual effects
├── game/
│   ├── MainScene.ts                Phaser world, tiles, buildings, camera, lighting
│   ├── PhaserGame.tsx              React-to-Phaser wrapper
│   ├── PixelTileArt.ts             Per-tile 2.5D pixel-art painter
│   ├── ProceduralRenderer.ts       Tile palettes and structure artwork
│   ├── WorkerManager.ts            Minion simulation and task state machine
│   ├── InvasionManager.ts          Invasion waves and enemy behavior
│   ├── WorldEffects.ts             Tile reactions, fish, clouds, lightning
│   ├── sprites/                    Voxel models, 8-direction sprite baker (Web Worker), Phaser glue
│   ├── PathfindingService.ts       EasyStar pathfinding adapter
│   ├── IsometricHelper.ts          Grid and screen coordinate conversion
│   ├── FPSController.ts            FPS tracking and quality tiers
│   ├── bestiaryPortraits.ts        Embedded bestiary portrait images
│   └── audio/soundFx.ts            Procedural Web Audio effects
├── i18n/
│   ├── faqTranslations.ts          FAQ text per language
│   └── useLanguage.ts              Language selection hook
├── state/
│   ├── useGameStore.ts             Persistent Zustand store and game actions
│   ├── constructionProgress.ts     Reconstruction order (castle, then resource areas)
│   ├── difficulty.ts               Easy / Normal / Hard configuration
│   ├── skillTree.ts                Skill tree logic (ranks, wave-set points, team bonuses)
│   ├── offlineProgression.ts       Return-from-away progression calculation
│   └── storageAdapter.ts           LocalForage storage adapter
├── types/
│   ├── game.ts                     Tasks, units, buildings, waves, and configs
│   └── state.ts                    Store contracts and save state types
└── ui/
    ├── TitleScreen.tsx             Title screen
    ├── IntroNarrativeModal.tsx     New realm story and game creation
    ├── GameHUD.tsx                 In-game sidebar HUD and controls
    ├── CitadelCommandModal.tsx     Reconstruction and command center
    ├── UnitRosterModal.tsx         Minion roster
    ├── EquipmentWorkshopModal.tsx  Equipment crafting (Forge)
    ├── MerchantModal.tsx           Market
    ├── QuickTradePopover.tsx       Quick resource trade
    ├── QuantityKnob.tsx            Rotary quantity knob for trading
    ├── UpgradesModal.tsx           Research upgrades
    ├── CastleDefenseModal.tsx      Castle, shield, turret, and wall upgrades
    ├── CastleBreachedModal.tsx     Victory / defeat screen
    ├── InvasionBanner.tsx          Active wave status
    ├── SkillTreeModal.tsx          Skill tree
    ├── RegressionModal.tsx         Prestige and typed reset controls
    ├── BestiaryModal.tsx           Discovered minions and invaders
    ├── CodexModal.tsx              World information
    ├── FAQModal.tsx                Gameplay FAQ
    ├── AutoEnhancePrompt.tsx       Construction / enhancement prompt
    ├── WelcomeBackModal.tsx        Offline progress summary
    └── SettingsDrawer.tsx          Settings, saves, lore, and tile overlay
```

## Development Notes

- The game is local-first and does not require a backend.
- Phaser owns the world canvas; React owns HUD and modal interfaces.
- Grid positions use `IsometricHelper.gridToScreen()` and `screenToGrid()`.
- Verify structure placement with Tile Coordinates before changing coordinates.
- The main validation commands are `npm run build` and `npm test`.

## Lore

The full setting and four-realm campaign background are documented in [LORE.md](LORE.md). The same file is loaded into the in-game Lore tab through Vite's raw Markdown import.
