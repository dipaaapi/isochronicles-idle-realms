# Next Patch Plan

Running list of things to update in the next patch. Add items as they come up; tick them off (and delete the file once the patch ships, like the old Dragon's Lair plan).

## 1. Wild bushes follow the biome

**Problem:** when the biome changes, the wild trees change look but the bushes still look like the first biome's, so they don't fit the other biomes.

**What the code does now:** `scene/ForageNodeManager.ts` does re-skin every node on a biome change (`reskin`, keyed on `platformPhase`), and `scene/foliageArt.ts` `paintBush` takes the realm. But only realm 4 (crystal bloom) has its own bush shape; realms 1–3 paint the same round leafy clump and only swap the palette (`PAL[realm]`), while `treeCanopyTexture` / `treeTrunkTexture` have a distinct silhouette per realm.

**To do:**
- [ ] Give each realm its own bush silhouette in `paintBush`, matching that realm's tree (e.g. ember/thorn scrub, frost-crusted shrub, crystal bloom), with shaded Canvas2D parts (no blobby shapes).
- [ ] Match the harvest burst / shed particles to the new shapes (`FOLIAGE_PARTICLE`, the `fall` / ADD blend checks in `ForageNodeManager`).
- [ ] Check that `reskin` also runs when the biome is changed in Settings (`realmChoice`), not only through `platformPhase`; re-skin from whichever drives the tile theme.
- [ ] Preview all four realms (tree + bush, idle / hover / harvest) offline to PNG before shipping.

## 2. BGM and SFX update

- [ ] New background music and sound effects (with help from a collaborator). SFX are procedural Web Audio in `src/game/audio/soundFx.ts`; music is the YouTube player (`MusicPlayer`).

## Notes

- After changing anything: `npm run build`, `node scripts/test-construction.cjs`, `node scripts/test-invasions.cjs`.
