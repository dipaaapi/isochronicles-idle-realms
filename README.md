# IsoChronicle: Idle Realms

> Rebuild the ruined citadel. Raise an army. Conquer the four realms.

IsoChronicle: Idle Realms is an offline-first isometric idle strategy game about castle reconstruction, monster summoning, resource automation and wave-based defense. It runs entirely in the browser, with no backend, and can be installed as a PWA. It is fully playable in **English** and **Tagalog**.

You play as a weakened Demon Lord who wakes in the ruins of a former citadel. Your only ally is a Support Slime. The Slime calls forth an Ancient Treant, the Treant rebuilds the castle and summons the realm's Generals, and the Generals raise the establishments and their minions. Together they have to survive 100 invasion waves across four realms.

Repository: <https://github.com/dipaaapi/isochronicles-idle-realms>

## Game Loop

1. **Day 1:** you start with ruins, no castle and one Support Slime.
2. The Slime summons the **Ancient Treant** for free.
3. The Treant builds the **Citadel Castle**, then the **Crystal Spire**. It waits whenever supplies run short and auto-buys any shortfall with coins.
4. Next, the Treant summons the **thirteen Generals** one by one, in construction order, until every one of them stands.
5. **Each General summons its minions one at a time** (the first free, the rest paid from the castle). The **minions build** the establishment, taking its cost from the castle step by step while a gauge above the site fills, and later **repair** it the same way.
6. Minions gather, craft and go on expeditions; Generals scout, lead in battle and **brawl** rival Generals; the Treant tends the castle and enriches the soil.
7. Defend against human and mecha invasions. Every **5 waves** cleared earns skill points for the Skill Tree.
8. Survive as long as you can: waves never end, and if the castle falls the run is over for good (permadeath) and is engraved in the **Hall of Legacy**.

There is no build button. Construction runs on autopilot, and you steer the realm through the market, upgrades, skills and battle actions.

## Establishments, Generals and Minions

Each realm places the thirteen establishments at random (`layoutSeed`). The castle, gate, Crystal Spire, the three corner rifts and the northern volcano stay in fixed positions. Every establishment has one General and two minions of the General's kind:

| # | Establishment | General | Minions work… | Expeditions |
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
- **Minions** are spawned by the world itself and are never stored in the roster. They garrison their home during waves.
- **Promotion:** when a General is slain, its healthiest minion on the island is promoted on the spot and becomes the new General (free); the minion slot refills through the normal respawn.
- **Expeditions:** some minions slip through a rift into the human realm and come back with loot. Every return stirs **vengeance**, which adds extra invaders to the next wave.
- Establishments level up for by-products and stronger output, and each has its own active skills.

Crews, terrains and expedition rules live in `src/data/establishmentCrews.json`.

## Features

- A 20×20 procedural floating island, painted tile by tile as 2.5D pixel art (raised land, sunken water, rocky underside) and rendered at the display's native pixel density.
- Minions, Generals and invaders drawn as 8-direction animated pixel-art sprites, ray-cast from jointed voxel models in background Web Workers.
- Structures rendered from voxel models that follow the Codex art, with construction, idle, firing, hit and destroyed states.
- Autonomous units with movement, gathering, combat, healing, construction and expedition states, plus EasyStar.js pathfinding.
- 100 invasion waves through three corner rifts (east, west, south), with live `remaining / total` counts. **Rushers** ignore everything else and charge the citadel. Each rift is guarded by two **Rift Sentinel** towers and fights back with its own skills and ultimate.
- **Biome:** choose the realm (Demon Citadel, Magma Caldera, Frost Spire, Astral Sanctum) at New Game or anytime in Settings. It changes the island's look, water life and music; waves keep the same strength in every biome.
- Castle hull and shield, towers, walls and beacon, plus battle items and the Demon Lord's **sky lasers**: double-click invaders to lock up to 10 beams that burn and slow them; crit chance grows (and misses fade) the longer a beam stays on one target, and they leave burn scars that hurt and slow invaders walking over them (`holdStrike` in `src/data/defenseConfig.json`).
- Support Slime and Ancient Treant evolution (five forms each), God Blessings and research upgrades. There is no gear: Generals grow by winning brawls.
- Skill Tree with ranked skills earned by clearing waves, plus a free respec.
- Endless waves and permadeath, with a local Hall of Legacy leaderboard (Steam leaderboard planned).
- Easy / Normal / Hard difficulty.
- Day/night cycle, seasons and weather: rain (sometimes stormy, with lightning and camera shake), snow and heat haze.
- Living world: grass sways and water wakes follow units, fish leap, clouds drift, and the sun and moon arc over the island.
- **Activity log tray** that narrates days, weather, waves, construction, roster changes, achievements and skills. There is no floating text over the map, except the sky laser's damage / CRIT / MISS numbers.
- **Atlas:** Guide, Lore, and a Structures tab that compares each structure's art with its in-game render.
- Bestiary (Demon Lord Codex) of discovered minions and invaders, with portraits, plus a **Rifts & Sentinels** tab with the rift's and sentinels' stats, skills and ultimate, and a **Dragon's Lair** tab (Ignara, her brood and the volcano's magma).
- Animated title screen (drifting camera, rising embers, mist and glow; off with reduced motion).
- In-game music player for your own **YouTube** links (Spotify support was removed).
- Procedural Web Audio for battle sounds, fanfares and ambience.
- Local-first IndexedDB persistence, offline progression, and JSON save export/import.
- PWA service worker for offline play.
- Tile Coordinates overlay with chess-style names: columns **A–T** for grid X, rows **1–20** for grid Y, so `(4,5)` is **E6**.

## General Brawls

Brawls replaced gear and armour (tuned in `src/data/brawl.json`, logic in `src/state/brawl.ts` and `src/game/workers/brawl.ts`).

- Two Generals **clash** whenever they bump into each other. Each clash at the same spot fills that pair's tension gauge; more than **10** clashes and they **brawl**. Clashes only count, and brawls only happen, between waves. Their minions gather round to cheer, and the fight pops up in the live-stream split screen with a **🥊 BRAWL** badge. During waves that frame shows the LIVE battle, so the two never overlap.
- The **winner** absorbs the loser's base attack and HP and gains **+1** (up to **+10**), shown beside its status icon. Only Generals with a + glow (the Treant and Slime always glow). The **loser** is knocked down to a sliver of HP and back to +0.
- **Mirror invaders:** while any General has a +, some invaders each wave copy that General's attack and HP (at most one per upgraded General each wave, never bosses), so upgraded Generals never trivialise the waves.

## Skill Tree

Skill points come from clearing waves, without limit.

- Every **5 waves** cleared grants **3 skill points** (no limit: waves never end).
- There are seven branches. Each branch is a chain: a skill needs at least one rank in the skill before it. Every skill is a ranked **passive**; enhancements come from **Runes** (below).

| Branch | Skills |
| --- | --- |
| ⚔️ Legion | Demon Might (attack), Swift Servants (speed), Hardened Hides (less damage taken), Overwhelming Force (big attack capstone) |
| 🏰 Citadel | Obsidian Walls (less castle damage), Arcane Artillery (tower damage), Rapid Siegecraft (tower cooldown), Mending Stones (heal the citadel after each wave) |
| 🌾 Resources | Rich Foundations (wood & stone), Realm Abundance (all harvests), Plunder Tax (invader bounty) |
| ✨ Mystic | Arcane Attunement (longer God Blessings), Ley Line Surge (cheaper God Blessings) |
| 🏛️ Establishments | Demon Masonry (less establishment damage), Landmark Rites (skill power), Quickened Sigils (skill cooldowns) |
| 👑 Generals | Warlord's Command (General attack), Iron Resolve (less General damage), Battle Focus (General skill cooldowns) |
| 🧑‍🌾 Minions | Bountiful Toil (bigger hauls), Master Builders (faster build/repair), Hardy Stock (minion HP & damage) |

- Click a skill to add a rank; it takes effect immediately. **Reset skills** refunds every point for free.
- Skills belong to the current run; points keep coming every 5 waves without limit.
- Numbers and EN/TL text live in `src/data/skillTree.json`.

## Runes

Runes replaced the skill tree's unlock enhancements (`src/data/runes.json`, `src/state/runes.ts`, Citadel Command → **Runes**).

- Every **wave boss carries a rune** (announced in the activity log) and drops it into the Rune Vault when slain. Tier grows with the wave (I at waves 1–25 … IV by wave 76; the realm climax adds one), up to **V**.
- Four targets with **3 slots** each; a rune only fits its own target:

| Target | Runes |
| --- | --- |
| 🏰 Citadel | Obsidian (less castle damage), Mending (heal after each wave), Artillery (tower damage) |
| 🏛️ Establishments | Bastion (less establishment damage), Ward (force-field HP), Sigil (establishment skill power) |
| 👑 Generals | Fury (attack), Aegis (less damage taken), Focus (skill cooldowns) |
| 🧑‍🌾 Minions | Banner (stronger while their General lives), Vigor (HP & damage), Spoils (expedition loot), Muster (cheaper summons; 100% = free) |

- **Escalation:** merge 3 unslotted runes of the same kind and tier into one of the next tier (power ×1, ×2, ×3.5, ×5.5, ×8).
- Rune bonuses add to the skill tree totals (a new realm starts with an empty vault).
- Minions are only ever summoned by their own General (two per establishment).

## Caretaker automation

Every upgrade can run on its own. Each switch sits in its own tab:

- **Research** (Slime): Laboratory → Research, *Auto-Research*.
- **Skills** (Slime): Laboratory → Skills, *Auto-Skills*. Spends skill points as they arrive, evening out the ranks.
- **Runes** (Slime): Runes, *Auto-Runes*. Merges triples, slots the strongest runes and sells the unusable ones.
- **Fortifications** (Treant): Laboratory → Fortifications, *Auto-Fortify*. Raises the castle walls, beacon and shield, the establishment towers and the spire, using only what the stores hold.

Runes are rare (wave bosses, the Leviathan, the Ancient Caterpillar), so any vault rune can be sold for a high price: 4,000 coins at tier I, ×2.2 per tier. **Sell unusable** clears every rune that is weaker than everything in its slots and has no merge partners.

## The Dragon's Lair

The north corner of the island is a volcano. Inside sleeps **Ignara, the Ember Matriarch**.

- **Cave:** opens after every 5th repelled wave and stays open (no timer) until you leave the raid or Ignara dies. Click the volcano between waves; the Demon Realm pauses while you are away and only one location ever simulates.
- **Expedition:** every General and its minions go in (the Treant and Slime stay home). Inside there are no blessings, timed buffs or QWERTY powers, and the brawl **+** is wiped for good on entry; research and runes still count.
- **Route (10×80 tiles):** rockfalls, magma channels, broken bridges the party repairs, Giant Bats, Dragon Kin and a Magma Golem whose death opens the last gate. Checkpoints save progress; the fallen respawn at the last one.
- **Ignara:** a three-way battle with a human expedition (as many raiders as your living party, from the wave pool). Her HP never heals or resets. Slaying her pays a hoard and a rune (half if the humans struck last with no demon hit in the last 10 s), is saved in your record and the Hall of Legacy, and a new Ignara wakes when the cave reopens.
- **Magma:** while she lives the volcano spills magma onto the island. It burns every unit standing on it (never buildings), cools to crust and basalt, and turns flooded shore back into land. No new magma while she is slain.

Tuning lives in `src/data/dragonsLair.json`.

## Endless waves and permadeath

- Waves never end. After wave 100 they keep growing stronger; every 25th wave is a climax, and enemy counts are capped (`endless` in `src/data/waveBalance.json`).
- The game saves itself after every repelled wave (💾 in the activity log).
- If the castle falls it is **game over for good**: the run (Demon Lord name, waves cleared, days, time played, difficulty, biome) is engraved in the **Hall of Legacy** (Atlas tab, kept on this device), the realm save is deleted, and an exported save of a fallen run can no longer be imported.
- There is no Regression any more. How far you get depends on spreading upgrades, runes and loot well.

## Controls

### World

- **Left-click and drag:** pan the camera. The island always stays inside the frame.
- **Mouse wheel:** zoom between 0.65× and 2.2×.
- **Double-click an invader** (or near one during a wave): lock a sky laser on it. A ground reticle closes in, then the beam burns and slows the target until it dies. Up to 10 beams at once; double-click a locked invader to release it. Tapping a scout between waves still kills it at once.
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
- **Bestiary:** discovered minions and invaders, plus the rifts and their Rift Sentinels.
- **Skill Tree** and **Hall of Legacy:** skills and the leaderboard of fallen runs.
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

- construction order: Treant → castle/spire → Generals → establishments
- the economy, purchases and realm reset
- difficulty, endless waves, permadeath and the skill tree
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
└── pwa-*.png, robots.txt
scripts/
├── test-construction.cjs  Construction, economy, reset, difficulty, permadeath, crew checks
└── test-invasions.cjs     Invasion and wave checks
src/
├── App.tsx                Screen coordinator (Title → Story → Game) and modal state
├── data/                  Lookup tables: economy, establishmentCrews, buildingLayout, skillTree,
│                          seasons, evolutions, blessings, items, wave pool, units, invaders…
├── game/
│   ├── MainScene.ts       World, tiles, camera, lighting
│   ├── PhaserGame.tsx     React ↔ Phaser wrapper (remounts on a new layout)
│   ├── PixelTileArt.ts    Pixel-art tile atlas painter
│   ├── WorkerManager.ts   Minion lifecycle, movement, visuals
│   ├── workers/           Per-role behaviour: supportSlime, treant, generalConstruction,
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
│   ├── constructionProgress.ts  Build order (Treant: castle → spire → summon Generals)
│   ├── buildingLayout.ts  20×20 grid and seeded random establishment layout
│   ├── establishmentCrews.ts, economy.ts, resources.ts, difficulty.ts, skillTree.ts
│   ├── activityLog.ts, activityWatcher.ts  Activity log store and narration
│   └── offlineProgression.ts, storageAdapter.ts
├── types/                 game.ts (shared types), state.ts (store and save shape)
└── ui/                    GameHUD, ActivityLogTray, Atlas (+ StructureAtlas), CitadelCommand,
                           EstablishmentModal, UnitRoster, Merchant, Research,
                           Fortifications, SkillTree, HallOfLegacy, GameOver, Bestiary, Settings, …
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
- Character sprites follow `public/backgrounds/bestiary-icons/`, and structure models are their own design source.
- When mechanics change, update the Atlas Guide, the FAQ, [LORE.md](LORE.md) and [LORE.tl.md](LORE.tl.md).
- Commit messages use the `ft:` prefix followed by the areas touched.

See [CLAUDE.md](CLAUDE.md) for detailed architecture notes.

## Lore

The setting and four-realm campaign are told in [LORE.md](LORE.md), with a Tagalog version in [LORE.tl.md](LORE.tl.md). Both files are loaded into the in-game Atlas Lore tab through Vite's raw Markdown import.

## License

No license has been chosen yet. Until one is added, all rights are reserved.
