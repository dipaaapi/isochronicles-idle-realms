# Next Patch Plan

Running list of things to update in the next patch. Add items as they come up; tick them off (and delete the file once the patch ships, like the old Dragon's Lair plan).

## 1. Wild bushes follow the biome (done)

**Problem:** when the biome changes, the wild trees change look but the bushes still look like the first biome's, so they don't fit the other biomes.

**What the code does now:** `scene/ForageNodeManager.ts` does re-skin every node on a biome change (`reskin`, keyed on `platformPhase`), and `scene/foliageArt.ts` `paintBush` takes the realm. But only realm 4 (crystal bloom) has its own bush shape; realms 1–3 paint the same round leafy clump and only swap the palette (`PAL[realm]`), while `treeCanopyTexture` / `treeTrunkTexture` have a distinct silhouette per realm.

**To do:**
- [x] Give each realm its own bush silhouette in `paintBush`, matching that realm's tree (e.g. ember/thorn scrub, frost-crusted shrub, crystal bloom), with shaded Canvas2D parts (no blobby shapes).
- [x] Match the harvest burst / shed particles to the new shapes (`FOLIAGE_PARTICLE`, the `fall` / ADD blend checks in `ForageNodeManager`).
- [x] Check that `reskin` also runs when the biome is changed in Settings (`realmChoice`), not only through `platformPhase`; re-skin from whichever drives the tile theme. (it does: `setRealmChoice` sets `platformPhase` too.)
- [ ] Preview all four realms (tree + bush, idle / hover / harvest) offline to PNG before shipping.

## 2. Volcanic magma spreads across the island

**Problem:** the magma only ever spawns on one side of the volcano (the same few tiles near its mouth) and never really spreads; the flow just appears as a static patch.

**How it works now** (`scene/volcanicMagma.ts`, tuning in `dragonsLair.json` `volcanicMagma`): while Ignara is awake, every `everySeconds` the volcano rumbles (`rumbleSeconds`), then `planFlow` lays a path of `tilesPerFlow` tiles at once. Tiles go ACTIVE (burns units) → CRUST → BASALT → gone; no new flow past `maxTiles`.

**Why it stays on one side:**
- `planFlow` scans rings around `VOLCANO_SITE.mouth` in a fixed order (dy, then dx from −r), so the start is always the same first open tile.
- The walk always prefers `+x +y` (`b.x + b.y` sort) with only ±2 random wander, so every flow heads the same direction.
- Tiles already covered are skipped, so later flows stall against the earlier ones and come out short, piling up in the same spot.

**To do:**
- [ ] Pick a random start among all open tiles around the mouth (or a random rim direction each eruption) so flows leave on every side.
- [ ] Downhill walk away from the volcano centre in the start's direction (distance from the volcano, not `x + y`), with real branching (a flow may fork into 2 streams).
- [ ] Let a new flow run over / extend older crust instead of stalling against it.
- [ ] Animate the spread: tiles turn to magma one by one along the path (a glowing front creeping out from the mouth, `secondsPerTile`), not all at once; the head glows brightest, with heat shimmer / sparks at the front and a darkening crust behind.
- [ ] Better surface animation in `scene/magmaArt.ts`: flowing lava texture (scrolling cracks, pulsing glow) and smooth edges joining neighbouring tiles; cooling visibly fades the glow.
- [ ] Preview offline (several eruptions in a row) to check flows go in every direction before shipping.

## 3. Right sidebar revamp (less clutter, no scrolling)

**Problem:** the Demon Realm sidebar (`ui/GameHUD.tsx`) is too crowded: the header, the day / battle / weather timeline card, the General carousel, the Generals / Music tabs, the 14-portrait grid with quick-pick filters, battle priorities, Brawl / Fortify all stack in one column, so parts (e.g. the timeline's bottom, the action buttons) fall off-screen and need scrolling.

**To do:**
- [ ] Fit everything in one screen height at common sizes (768 / 900 / 1080 px tall) with no page scroll; only long lists scroll inside their own box.
- [ ] Collapsible sections (timeline card, General carousel), remembered per player (localStorage), with a compact one-line summary when collapsed (e.g. "Dusk · W68 in 11s · Clear").
- [ ] Generals panel (`ui/GeneralsPanel.tsx`): smaller portrait tiles (5–7 per row) or a compact list mode; filters + priorities in one row of icon buttons with hover tooltips (`HoverTooltip`); the hint text only until the first pick; Brawl / Fortify stay pinned at the bottom.
- [ ] Merge the General carousel into the panel (the selected General's card shows above the grid) instead of a separate block.
- [ ] Move rarely used info (season / days survived, weather details) into hover cards or the Atlas.
- [ ] Keep `data-tutorial` targets working and update the tutorial steps if anything moves.
- [ ] Check at phone/tablet width and with TL text (longer labels).

## 4. Leviathan brings its Sea Folk, with a proper entrance

**Problem:** only the Leviathan (water dragon) surfaces from the Abyssal Vortex; its sea creatures (the Sea Folk minions) don't come with it. And it just appears: unlike the Dragon's Lair opening (earthquake), there is no warning that it has arrived.

**How it works now** (`game/WildFactionManager.ts` `onBattleStart` → `rise`, tuning `data/seaFolk.json`): the group size comes from `wildGroupSize(meter)` (the contamination meter), so a low meter means 0 minions while the boss is still guaranteed every wave; the boss always rises at the vortex centre, the minions at random shore tiles (`spawnTiles`).

**To do:**
- [ ] Always bring an escort with the Leviathan (`boss.escort` min/max in `seaFolk.json`), rising around the vortex rim, not only random shore tiles; check `spawnTiles` still has shore tiles after the vortex change.
- [ ] Entrance sequence (game time, before it surfaces): the vortex spins faster and glows, the sea ring darkens, water bubbles / churns, a low roar + camera shake (like the lair-opening quake but watery), then the Leviathan bursts up with a big splash and spray; escorts pop up one by one around it.
- [ ] Alert: a BattleStatusHud entry / banner "The Leviathan stirs!" a few seconds ahead, an activity-log line (EN/TL in `activityMessages.json`), and a sound cue in `soundFx.ts`.
- [ ] Matching exit (it dives back into the vortex) when the battle ends.
- [ ] Do the same check for the Ancient Caterpillar (Sand Brood) so both island gods arrive with their minions and a warning.

## 5. BGM and SFX update

- [ ] New background music and sound effects (with help from a collaborator). SFX are procedural Web Audio in `src/game/audio/soundFx.ts`; music is the YouTube player (`MusicPlayer`).

## Notes

- After changing anything: `npm run build`, `node scripts/test-construction.cjs`, `node scripts/test-invasions.cjs`.
