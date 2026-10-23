# Dragon's Lair Expedition Patch Plan

## Implementation Status (2026-10-24)

All eight phases are implemented. Decisions taken with the owner:

- The North Rift (top corner) became the volcano; waves use the three remaining rifts. Wave tactics needed no logic change (PAIR picks the farthest partner).
- The cave opens after every 5th repelled wave, has no timer or cooldown, and closes only when the player leaves the raid or Ignara dies. After a kill it reopens on the next 5th wave with a new Ignara (the kill is counted in the save and the Hall of Legacy).
- Every General goes with its minions; the Treant and Slime stay. Research and runes stay active inside; blessings, timed buffs and QWERTY powers do not; the brawl + is wiped for good on entry.
- Demon Realm time pauses while inside (only one location simulates).
- The Matriarch is **Ignara, the Ember Matriarch** (she).
- Humans: as many as the party's living members, drawn from the wave pool, sized to 85% of the party's average member and escalated gently by wave (capped).
- Credit: full hoard if a demon struck her in the last 10 s, otherwise half.
- Magma burns every unit (not buildings); existing magma cools normally after her death.
- Checkpoints at every region start; the fallen respawn at the last one after 8 s.

Everything below is the original plan, kept for reference.

## Purpose and Scope

This document defines the next major patch for IsoChronicle: Idle Realms. It is a design and implementation plan only; no Dragon's Lair gameplay code is part of this planning patch.

The patch has three connected goals:

1. Stop permanent visual displacement of fixed Demon Realm structures during combat.
2. Replace the northern/top invasion portal with a timed mountain entrance to a separate Dragon's Lair location.
3. Add a strategic choice: leave the dragon alive and endure dangerous but restorative magma, or kill it for major rewards and permanently stop that magma source for the current realm.

## Player-Facing Summary

A volcanic mountain rises at the northern edge of the Demon Realm where the top portal once stood. For limited periods, its cave entrance opens and allows the player to launch a dangerous expedition into a separate 10×80-tile Dragon's Lair.

The expedition party fights through rocky caverns, magma, stone bridges, large bats, dragon kin, and a Magma Golem before reaching an enormous Dragon Matriarch. At the final chamber, humans arrive from the far entrance and the encounter becomes a continuing three-way battle between demons, humans, and dragons.

Killing the dragon awards substantial loot, records the victory permanently in the save, and returns the party to the Demon Realm through a loading transition. It also stops future volcanic magma spawning in the Demon Realm. Leaving the dragon alive allows magma to keep flowing: this threatens units and wild factions but can gradually restore water-damaged land.

## Demon Realm Stability Fixes

Fixed structures must never be moved, scaled, rotated, or detached from their authoritative tile coordinates by hit reactions.

Applies to:

- Citadel castle.
- All establishments.
- Establishment defence towers and portal/rift sentinels.
- Remaining invasion portals.
- The northern mountain and cave entrance.

Required hit feedback:

- Remove positional knockback, shake tweens, squash/stretch, scale recoil, and container movement from structure hit reactions.
- Do not use camera shake for routine structure, portal, tower, or castle damage.
- Briefly tint the struck sprite light red, then restore its correct prior tint.
- A hacked structure must return to its hacked tint after the red flash.
- Destroyed, construction, firing, and other animation states must continue without their anchors moving.
- Every fixed object's container position and scale should be derived from its tile anchor, not accumulated from its current transformed value.

Suggested feedback timing: 100–180 ms red flash with a short fade, plus existing impact particles and sound.

## Northern Mountain and Timed Lair Entrance

- Remove the top/northern portal from the normal invasion-portal pool.
- Keep the other invasion portals operating under adjusted wave patterns.
- Place an HD volcanic mountain over the former northern portal zone.
- The mountain is a permanent Demon Realm landmark; its cave entrance is the timed gateway.
- The gateway is available only during configured windows and clearly shows closed, opening, available, warning, closing, and sealed states.
- Entering must require explicit player confirmation because it changes the active location and expedition rules.
- A closing warning must never strand an active expedition. Once entered, the run continues until retreat, party failure, or dragon victory.

Recommended availability model:

- Unlock after a configurable wave milestone.
- Open for a configurable number of in-game days.
- Close for a configurable cooldown.
- Reopen until the Dragon Matriarch is slain in the current realm.
- Exact milestone, duration, and cooldown must live in JSON rather than code.

## Location Transition and Loading Flow

Introduce an explicit saved location state, tentatively `activeLocation: "DEMON_REALM" | "DRAGONS_LAIR"`.

Entering the lair:

1. Validate that the cave window is open and an eligible expedition party exists.
2. Save the Demon Realm simulation state.
3. Freeze and dispose Demon Realm-only Phaser systems.
4. Set the active location to the Dragon's Lair.
5. Show the existing loading screen again with lair-specific preparation tasks and tips.
6. Bake/load lair tiles, obstacle art, creatures, animations, navigation, lighting, and audio.
7. Start the party at the near cave entrance only after the lair scene reports ready.

Leaving the lair follows the same process in reverse. Killing the dragon automatically triggers the return transition. A manual retreat option should be considered during preparation.

Only the active location simulates. Demon Realm weather, waves, wild factions, workers, effects, magma, camera, and audio must not keep updating invisibly while the lair is active. Decide separately whether Demon Realm time is paused or receives bounded offline-style progression on return.

## Dragon's Lair Map

- Logical size: 10 tiles wide × 80 tiles long.
- Orientation: a narrow expedition route from the Demon entrance to the far Dragon chamber.
- Biome: dark rocky volcanic mountain interior.
- No sun, moon, stars, clouds, normal day/night arc, rain, snow, or Demon Realm sky effects.
- Lighting comes from magma, embers, crystals, torches, dragon fire, and skill effects.
- Use a dedicated navigation grid, camera bounds, tile atlas, obstacle layer, ambient effects, and encounter director.

Suggested regions:

1. Entrance Shelf — party spawn, tutorial prompt, safe staging area.
2. Bat Galleries — vertical hazards and swarming large bats.
3. Magma Channels — intermittent flows and safe timing windows.
4. Broken Stone Bridges — narrow crossings and repair/activation objectives.
5. Dragon-Kin Roosts — defended chambers and ambushes.
6. Magma Golem Gate — guardian encounter blocking the final route.
7. Hoard Antechamber — treasure hazards and elite dragon kin.
8. Matriarch Chamber — large arena with the human entrance at the opposite end.

The route should contain authored obstacle beats rather than a purely random corridor. Limited seeded variation may change enemy groups, hazards, rewards, or bridge conditions without making the run unwinnable.

## Expedition Party Rules

- The expedition requires Generals and tenant minions.
- Define minimum, recommended, and maximum party sizes in configuration.
- The player selects participating Generals; tenant minions are drawn from their establishments or selected through a dedicated expedition panel.
- Participants are removed from Demon Realm duties while inside the lair.
- The Ancient Treant remains a special design decision: the request requires Generals and minions, but does not explicitly require the Treant to enter.
- Demon Realm faction truces do not make dragon creatures allied to the player.

On entry, all expedition participants lose:

- Temporary global blessings and timed buffs.
- Brawl/kill `+` levels and their stored attack/HP bonuses.
- Any temporary shield, morale, surge, weather, or aura effects.
- Access to global QWERTY power skills.

Participants retain:

- Their innate class identity and base stats.
- Their own unique class skills and cooldown system.
- Permanent research/equipment only if preparation confirms those systems should apply inside the lair.

The `+` loss is permanent for the affected expedition participants, including after respawn and after returning home.

## Encounter Progression and Obstacles

The expedition advances toward the dragon through sequential encounter gates. Proposed obstacle vocabulary:

- Rockfalls that temporarily block lanes.
- Magma pulses requiring movement to safe tiles.
- Collapsing or broken stone bridges.
- Large-bat swarms that can bypass front-line units.
- Dragon-kin patrols, nests, ranged fire, and aerial attacks.
- Magma vents and heated tiles.
- A Magma Golem guardian with area denial and bridge-control abilities.
- Optional hoard rooms that trade time/risk for rewards.

Each major obstacle needs a readable telegraph, active state, resolution state, and failure recovery. Progress checkpoints should prevent an unlucky wipe from replaying all 80 tiles unless that harsher rule is explicitly chosen.

## Three-Way Dragon Battle

Reaching the Matriarch starts a persistent three-way battle:

- Demon expedition party.
- Human expedition force entering from the far side of the volcano.
- Dragon faction: Matriarch, dragon kin, bats, and summoned Magma Golems.

Rules:

- All three sides are mutually hostile.
- Humans target demons and dragons according to threat/proximity; they are never temporary allies.
- Dragon units target both invading factions.
- Demon units follow expedition orders and retain their unique skills.
- Human reinforcements should be bounded so the final battle cannot become endless.
- The Matriarch encounter does not reset when humans arrive.
- Dragon health lost during the expedition is persistent and cannot regenerate or reset upward.

## Dragon Matriarch Rules and Abilities

- Rendered size target: approximately ten times the visual mass/footprint of the Abyssal Leviathan or Ancient Caterpillar, subject to camera and performance validation.
- The dragon must be an arena-scale boss, not a normal character sprite scaled blindly.
- It cannot heal, regenerate, life-steal, reset HP between phases, or regain health after party wipes.
- Its saved HP must survive location reloads and game reloads during an active expedition.

Proposed phases and abilities:

1. Hoard Guardian — claw sweeps, bite, wing gust, directed fire breath.
2. Brood Mother — summons dragon kin and marks nest zones.
3. Cavern Sovereign — calls bat swarms, rockfalls, and magma eruptions.
4. Last Stand — summons a Magma Golem protector and uses wider arena attacks.

All attacks require clear telegraphs and must respect the narrow-map camera. Summons use caps and cooldowns.

## Defeat, Respawn, and Power-Loss Rules

- Slain expedition Generals and minions respawn at the cave entrance automatically.
- Respawn has a configurable delay and must not duplicate units.
- Respawned units return at base expedition strength without lost `+` power or cleared buffs.
- Unique skills remain usable after respawn; global QWERTY power skills remain disabled.
- Consider a temporary injury/fatigue cost or increasing respawn delay to prevent brute-force victory without making the run permanently fail.
- If every expedition member is waiting to respawn, the dragon and human battle may continue, but the dragon still cannot heal.
- Define whether humans can kill the dragon without a living demon participant. Recommended: humans may damage it, but the player must contribute within a recent window to receive full slayer rewards.

## Victory, Rewards, and Saved Records

On Dragon Matriarch death:

- Stop dragon attacks and new dragon summons.
- Resolve or despawn surviving human and dragon combatants safely.
- Award a substantial configurable reward bundle.
- Increment a persistent `dragonsSlain` lifetime/save record.
- Record the current realm/run victory separately if repeat kills across regressions are allowed.
- Mark the current realm's dragon as slain.
- Permanently stop new Demon Realm volcanic magma spawning for that realm.
- Show a victory/hoard presentation, then automatically start the loading screen and return to the Demon Realm.

Suggested reward categories:

- Large coins and core resources.
- Rare minerals, obsidian, and dragon materials.
- High-tier rune with a configured cap.
- Guaranteed equipment or unique dragon equipment.
- Permanent record/achievement and Atlas discovery.
- Optional cosmetic mountain/hoard trophy.

The exact quantities and loot pools must be balance data, not hardcoded values.

## Volcano and Demon Realm Magma Tradeoff

While the Dragon Matriarch lives, the northern volcano periodically emits magma into the Demon Realm.

Negative effect:

- Magma travels/spawns only on valid configured tiles.
- Units and applicable wild-faction creatures touching active magma take continuous damage.
- Damage is time-based, capped per second, and never tied to frame rate.
- Magma must not spawn under protected structures, portals, the castle, or unavoidable spawn points.
- Clear visual warning precedes harmful contact.

Positive effect:

- Cooling magma gradually fills eligible water-damaged land and helps restore the original island footprint.
- It should cooperate with, not overwrite, Sand God reclamation state.
- Define conversion stages such as active magma → cooling basalt → stable land.
- Restored land must update navigation, tile art, shore edges, effects, and placement validity.

After the dragon is slain:

- No new volcanic magma spawns.
- Existing magma finishes its configured cooling lifecycle or is resolved during return; preparation must choose one rule.
- Previously restored land remains.

This is the central choice: keeping the dragon alive preserves a dangerous natural land-restoration source; killing it removes the danger and grants the hoard, but ends future volcanic restoration.

## Visual and Animation Requirements

All new art must be HD pixel art consistent with the game's existing high-DPI and NEAREST-filter pipeline.

Required assets and states:

- Northern mountain: dormant, smoking, entrance opening, available, warning, closing, sealed after dragon death, hit/eruption states if interactable.
- Cave gateway: idle, transition pulse, party entering, party returning.
- Lair tiles: multiple rocky floors, walls, cliffs, magma, cooling basalt, bridge pieces, chasms, hoard floor, entrance and boss arena variants.
- Obstacles: idle, telegraph, active, damaged/resolving, cleared/destroyed.
- Dragon kin, large bats, humans, and Magma Golem: idle, movement, attack variants, hit, skill, death, and state-specific animations with more frames than legacy placeholders.
- Dragon Matriarch: dedicated multi-part/arena renderer with idle breathing, locomotion/turning, claw, bite, wing gust, fire breath, summon, hit reactions, phase transitions, stagger, death, and corpse/hoard states.
- Magma: spawn, flow, contact splash, cooling, crust, and stable-land transition.

Before implementation, create concept sheets and size comparisons beside the Leviathan, Caterpillar, Generals, tiles, and final arena camera. Do not ship by simply multiplying a normal sprite scale by ten.

## Audio, UI, Activity Log, and Localization

Audio requirements:

- Separate dark lair ambience and boss music.
- Cave wind, rockfall, bat swarm, magma, bridge, dragon vocal, wing, fire, summon, death, hoard, and transition sounds.
- Demon Realm music and ambience stop cleanly during location transition.

UI requirements:

- Timed entrance badge/countdown on the mountain.
- Expedition confirmation and party-selection panel.
- Lair route/progress indicator for 80 tiles.
- Dragon persistent HP and phase display.
- Respawn timers and entrance status.
- Clear banner explaining disabled QWERTY powers and removed buffs/`+` power.
- Saved dragon-slay count in an appropriate profile/legacy/Atlas view.
- Strategic-choice explanation before first entry.

All player-visible wording requires English and Tagalog. Activity-log events should cover entrance opening/closing, expedition departure, obstacles, deaths/respawns, human arrival, dragon phases, victory, rewards, magma damage, magma cooling, and land restoration. No floating text should be added over map entities.

## Persistence and Save Migration

Proposed persisted fields:

- `activeLocation`.
- Lair availability window/cooldown and unlock state.
- Expedition party IDs and participant snapshot rules.
- Cleared checkpoints and obstacle states.
- Dragon current/max HP, phase, and slain state.
- Expedition respawn timers.
- `dragonsSlain` lifetime count and per-realm kill marker.
- Demon Realm magma tiles, cooling stages, and restoration results.
- Any claimed one-time hoard rewards.

Import/hydration must validate tile coordinates against the correct map dimensions: 20×20 Demon Realm versus 10×80 Dragon's Lair. Invalid locations, party IDs, progress, HP, timers, rewards, and counts must be clamped or safely discarded. An interrupted load must recover to a valid entrance/checkpoint without duplicating rewards.

## Proposed Technical Architecture

Recommended separation:

- A location coordinator above Phaser decides which scene/location is active and owns loading transitions.
- Keep the current Demon Realm scene rather than forcing both maps into one world container.
- Add a dedicated Dragon's Lair scene with its own map, navigation, camera, lighting, effects, encounter director, and cleanup lifecycle.
- Use a shared combat interface only where it reduces duplication; do not couple lair boss logic into `InvasionManager`.
- Add a Dragon Expedition state slice and JSON-backed tuning modules.
- Extend the existing sprite-bake pipeline for lair creatures; use a specialized large-boss renderer if sheet limits or memory make the Matriarch impractical.
- Give every fixed Demon Realm structure an immutable anchor helper and tint-only hit-feedback helper.

Likely existing integration points:

- `src/App.tsx` and `src/game/PhaserGame.tsx` — active-location scene selection and remount keys.
- `src/ui/LoadingScreen.tsx` and `src/game/loadProgress.ts` — second loading lifecycle and lair task labels.
- `src/game/MainScene.ts` — northern mountain, magma lifecycle, Demon Realm suspension/return.
- `src/game/StructureManager.ts`, `PortalManager.ts`, `PortalDefenseSystem.ts`, and `hitReaction.ts` — remove structure displacement and use tint-only feedback.
- `src/state/buildingLayout.ts` and `src/data/buildingLayout.json` — remove the northern portal from invasion routing and reserve its mountain footprint.
- `src/state/store/persistence.ts` and `initialState.ts` — new saved fields, migrations, and validation.
- `src/game/sprites/` — HD animated creatures, mountain, obstacles, and boss assets.
- `src/i18n/` — all EN/TL text and activity messages.

## Data and Configuration

Create JSON/typed data for:

- Lair availability and unlock schedule.
- 10×80 map layout, regions, checkpoints, obstacle placements, safe tiles, entrances, and arena bounds.
- Expedition party limits and respawn rules.
- Dragon base stats, phase thresholds, attacks, summon caps, cooldowns, and no-heal rule.
- Dragon kin, large bats, Magma Golem, and human expedition composition.
- Obstacle health/timing/damage.
- Reward tables and first-kill/repeat-kill rules.
- Demon Realm magma spawn, damage, pathing, cooling, and terrain restoration.
- Loading tasks/tips, UI text, and activity-log wording.

Avoid hardcoded text, balance values, map dimensions, rewards, or encounter timings in scene classes.

## Preparation Required Before Implementation

The next patch should not begin coding until these items are furnished:

1. Confirm whether “top portal” means the single northern corner portal and identify its exact tile/zone using the Tile Coordinates overlay.
2. Decide how four-portal wave tactics behave with only three invasion portals; audit ALL, PAIR, SINGLE, and ROTATE patterns.
3. Produce a 10×80 map diagram with entrance, checkpoints, bridges, hazards, human entrance, and Matriarch arena.
4. Decide whether the lair is a one-time kill per realm, repeatable per realm, or repeatable only after Regression.
5. Choose the availability milestone, open duration, cooldown, and player warning behavior.
6. Choose what happens to Demon Realm time and waves while the player is inside.
7. Define expedition party selection, minimum party, tenant sourcing, and whether the Ancient Treant participates.
8. Define exactly which permanent equipment/research/runes remain active after buffs and `+` power are stripped.
9. Decide checkpoint and retreat rules, respawn delay/cost, and whether repeated wipes add penalties.
10. Decide credit/reward rules if humans land the final blow.
11. Balance dragon HP around persistent damage and automatic respawning so victory remains meaningful.
12. Produce concept art and animation budgets for the mountain, lair biome, obstacles, bats, dragon kin, Magma Golem, humans, and ten-times-larger Matriarch.
13. Prototype the Matriarch renderer and memory footprint before producing final animation frames.
14. Define magma's valid Demon Realm routes, affected factions, damage rate, telegraph, cooling duration, and land-restoration eligibility.
15. Decide whether already-spawned magma cools normally or vanishes when the dragon dies.
16. Define reward quantities, unique drops, achievements, Atlas entries, and lifetime/per-realm records.
17. Add save-migration and crash-recovery fixtures before enabling location switching.
18. Add performance budgets for a long map, large boss, three-way combat, summons, magma, and high-DPI rendering.
19. Update Atlas Guide, FAQ, lore, and both English/Tagalog narrative documents after mechanics are finalized.
20. Plan an explicit accessibility pass for flashes, dark-biome visibility, camera motion, and hazard telegraphs.

## Recommended Delivery Phases

### Phase 1 — Anchor Safety

- Remove displacement-based hit reactions from every fixed structure.
- Add tint-only hit feedback and anchor regression tests.

### Phase 2 — Location Framework

- Add active-location state, loading re-entry, scene disposal/recreation, save recovery, and a blank 10×80 test scene.

### Phase 3 — Northern Mountain

- Replace the northern portal, update wave tactics, add timed access UI, and implement entrance/return transitions.

### Phase 4 — Lair Traversal

- Build tiles, navigation, camera, obstacles, checkpoints, party rules, respawn, and disabled-power restrictions.

### Phase 5 — Creatures and Three-Way Combat

- Add bats, dragon kin, Magma Golem, human expedition, and faction targeting.

### Phase 6 — Dragon Matriarch

- Add persistent HP, phases, summons, no-heal enforcement, death sequence, rewards, records, and automatic return.

### Phase 7 — Demon Realm Magma Choice

- Add volcanic spawning, contact damage, cooling, terrain restoration, and post-dragon shutdown.

### Phase 8 — Polish and Release Hardening

- Final HD art/frames, audio, EN/TL text, Atlas/FAQ/lore, save migration, performance profiling, balance simulations, and full regression testing.

## Testing and Acceptance Criteria

Anchor stability:

- After thousands of hits and repeated scene updates, every castle, establishment, defence tower, portal, and mountain remains exactly on its configured tile anchor and scale.
- Hit feedback flashes red without changing world position.

Location lifecycle:

- Entering and leaving always shows loading and never leaves both worlds simulating.
- Reloading a save inside the lair restores a valid checkpoint and dragon HP.
- Repeated transitions do not leak scenes, audio, subscriptions, workers, or textures.

Map and expedition:

- The lair is exactly 10×80 logical tiles and camera bounds cannot expose invalid space.
- QWERTY power skills and temporary buffs are unavailable inside.
- Entry permanently clears expedition participants' `+` power.
- Dead party members respawn once at the entrance without duplication.
- Obstacles cannot create an impossible route.

Final battle:

- Demons, humans, and dragons attack one another correctly.
- Summon caps are enforced.
- Dragon HP never increases and persists across wipes/reloads.
- The dragon cannot award victory twice.
- Kill count and rewards survive export/import.

Magma tradeoff:

- Contact damage is continuous, frame-rate independent, and affects only configured factions.
- Magma cannot overwrite protected tiles or corrupt navigation.
- Cooling magma restores only eligible damaged land.
- No new magma spawns after the dragon is slain.

Validation gates:

- `npm run build`.
- `npm test` plus new location, dragon, anchor, migration, and magma regression suites.
- Save import/export and hydration security tests.
- Long-running headless simulations for structure anchors, three-way battle, respawn, and magma restoration.
- Browser visual QA at supported DPR, FPS, zoom, language, graphics, and gore settings.

## Open Design Decisions

- Is the Matriarch female (“her children”) and what is her canonical name?
- Does the Dragon's Lair unlock once per realm, per year, or at a specific wave?
- Can the player retreat voluntarily, and what is the cost?
- Does Demon Realm time pause during the expedition?
- Can humans receive the killing blow, and how does player reward credit work?
- Are rune/equipment bonuses considered forbidden global power or retained permanent character progression?
- Does the Ancient Treant join the expedition?
- How many checkpoints exist across 80 tiles?
- Is the dragon kill permanent until Regression, or can another dragon eventually claim the lair?
- What exact “substantial rewards” and unique items are appropriate?
- Should existing magma immediately cool when the dragon dies or complete its normal lifecycle?
- Which factions are immune, resistant, or vulnerable to Demon Realm magma?

## Explicitly Out of Scope for This Planning Patch

- No gameplay systems are implemented.
- No portal is removed from the live map yet.
- No structure hit reaction is changed yet.
- No save schema is changed yet.
- No Dragon's Lair art, models, sounds, map, enemies, rewards, or UI are added yet.
- No balance values in this document are final until the preparation decisions are resolved.
