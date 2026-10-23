# Steam achievements

Enter these under **Steamworks → Technical Tools → Edit Steamworks Settings → Stats & Achievements → Achievements**, then **Publish** (the Publish tab).

The source is `src/data/achievements.json`: the game unlocks them through `src/state/achievements.ts` → `window.isoDesktop.unlockAchievement(apiName)` → `electron/main.cjs` (`steamworks.js`). Saves made before the Steam build re-send their achievements on load, and Steam ignores the ones it already has. The API name must match exactly.

| API name | Display name | Description | Hidden | Icon (achieved / unachieved) |
| --- | --- | --- | --- | --- |
| ACH_FIRST_TRADE | Aether Merchant | Completed your first resource trade at the merchant outpost. | No | `ACH_FIRST_TRADE.jpg` / `ACH_FIRST_TRADE_locked.jpg` |
| ACH_CITADEL_FORTIFIED | Citadel of Iron | Upgraded Castle Fortifications to repel void invaders. | No | `ACH_CITADEL_FORTIFIED.jpg` / `…_locked.jpg` |
| ACH_FIRST_DEFENSE | Sunder Vanguard | Repelled your first invasion wave. | No | `ACH_FIRST_DEFENSE.jpg` / `…_locked.jpg` |
| ACH_WAVE_10 | Ten Tides Broken | Cleared 10 invasion waves. | No | `ACH_WAVE_10.jpg` / `…_locked.jpg` |
| ACH_WAVE_25 | Ember Throne | Cleared 25 invasion waves. | No | `ACH_WAVE_25.jpg` / `…_locked.jpg` |
| ACH_WAVE_50 | Halfway to Ruin | Cleared 50 invasion waves. | No | `ACH_WAVE_50.jpg` / `…_locked.jpg` |
| ACH_WAVE_100 | Demon Lord Ascendant | Cleared all 100 invasion waves. | No | `ACH_WAVE_100.jpg` / `…_locked.jpg` |
| ACH_FIRST_BRAWL | Pecking Order | Two Generals settled a quarrel in a brawl. | No | `ACH_FIRST_BRAWL.jpg` / `…_locked.jpg` |
| ACH_DRAGON_SLAYER | Dragonslayer | Slew Ignara, the Ember Matriarch, in her lair. | No | `ACH_DRAGON_SLAYER.jpg` / `…_locked.jpg` |
| ACH_FIRST_REGRESSION | Eternal Regression | Conquered the mortal world and regressed with the memories of the Demon Citadel. | Yes (late-game) | `ACH_FIRST_REGRESSION.jpg` / `…_locked.jpg` |

Icons are in `steam/store-assets/achievements/` (256×256 JPG; Steam scales them down). They're rendered from the in-game emoji on the achievement's colour; for nicer art, replace the files and keep the names.

Localisation: Steam lets you add a Filipino ("Tagalog" isn't in its list) title and description per achievement; the TL text is in `achievements.json` → `tl`.

To add one: add an entry to `achievements.json` (with a unique `steam` API name), call `unlockAchievement(id, …)` where it happens (or give it a `wave` to make it a wave milestone), run `npm run steam:capture -- art` for its icons and add it in Steamworks.
