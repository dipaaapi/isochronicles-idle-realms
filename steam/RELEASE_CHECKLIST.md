# Steam release checklist

Work top to bottom. ✅ = done in the repo, ☐ = you do it in Steamworks.

> ## ⛔ PAYMENT HALT
> Nothing in this checklist pays money, sets a price or enters bank/tax details. **Stop at section 7.** The Steam Direct fee, pricing, tax interview and banking are **on hold until you decide you're ready**. Without them you can still prepare the build, the store page and the achievements; Valve just won't let the page or the game go public.

## 1. Partner account (no payment yet)
- ☐ Create the Steamworks partner account and fill in the **company/legal name and contact info**.
- ⛔ **Do not** pay the Steam Direct app fee yet ($100 per app, recoupable). It is what creates the real App ID. **Halted.**
- ⛔ **Do not** start the tax interview or banking info yet. **Halted.**

## 2. Build (works now with the Spacewar test ID 480)
- ✅ Electron desktop build: `npm run build:steam`, `npm run desktop`, `npm run dist:steam` (see STEAM.md).
- ✅ Saves in AppData, atomic writes, Steam Auto-Cloud paths documented.
- ✅ Steam achievements wired: `src/data/achievements.json` → `src/state/achievements.ts` → `electron/main.cjs`.
- ✅ Dev tools compiled out of every build (`__DEV_TOOLS__`).
- ✅ Depot scripts: `steam/app_build.vdf`, `depot_windows.vdf`, `depot_linux.vdf` (still on placeholder IDs 480/481/482).
- ☐ Fix the failing brawl unit test (`scripts/test-construction.cjs`: "absorbs the loser base attack") to match the new 10% absorb rule, then `npm run build && npm test`.
- ☐ Play a full session in `npm run desktop`: save, quit, relaunch, and check that the save loads.

## 3. Store assets
- ✅ Capsules, library art, icons: `steam/store-assets/` (`npm run steam:art`).
- ✅ Achievement icons and event art: `steam/store-assets/achievements/`, `steam/store-assets/events/` (`npm run steam:capture -- art`).
- ✅ Six live gameplay screenshots, 1920×1080: `steam/screenshots/` (`npm run steam:capture -- shots`). Add 2–4 hand-taken close-ups (zoomed in on a brawl, a boss, the sky laser) for variety.
- ✅ Trailer draft: `steam/trailer/` (see trailer/README.md: add music and re-encode to MP4 before uploading).
- ☐ Resolve the logo subtitle ("Demon Lord Realms") vs. product name ("Idle Realms").
- ☐ Replace the placeholder PWA icons if you want them to match the Steam icon.

## 4. Store page text
- ✅ Short + long description, tags, genres, system requirements, content survey answers: `steam/STORE_PAGE.md`.
- ✅ Privacy policy: `steam/PRIVACY.md` (publish it at a URL, e.g. GitHub Pages, and paste the link in Steamworks).
- ✅ Press kit: `steam/PRESS_KIT.md`.
- ☐ Fill in the AI-content disclosure honestly.
- ☐ Music licensing: YouTube embeds can't be redistributed in a paid product. Ship only the player (players paste their own links), or license tracks.

## 5. Once the real App ID exists (after the fee, so currently blocked)
- ☐ Put the App ID in `steam/steam_appid.txt` and `steam/app_build.vdf`; put the depot IDs in `depot_*.vdf` and in the `Depots` block.
- ☐ Installation → General: launch options (Windows `IsoChronicle Idle Realms.exe`, Linux `isochronicle-idle-realms`).
- ☐ Steam Cloud settings (STEAM.md, quota 50 MB / 20 files).
- ☐ Stats & Achievements: enter the 9 achievements (`steam/ACHIEVEMENTS.md`) and **Publish**.
- ☐ Upload all store assets and text; submit the store page for review ("Coming soon" needs ~2 weeks of visibility before release).
- ☐ `steamcmd +login <builder> +run_app_build <path>\steam\app_build.vdf +quit`, then test the build from the **beta** branch on a clean PC (`SetLive` is left out on purpose, so uploads never go live automatically).
- ☐ Submit the build for review.

## 6. Marketing (free)
- ☐ Announce "Coming soon" with the event cover/header art (`store-assets/events/`).
- ☐ Share the trailer and screenshots; link the wishlist button.
- ☐ Optional: Steam Next Fest (needs a demo build).

## 7. ⛔ Payment, pricing and release: HALTED
Do these only when you decide to go ahead:
- ⛔ Pay the Steam Direct fee.
- ⛔ Tax interview (W-8BEN for a non-US individual) and bank account.
- ⛔ Set the base price and regional pricing; launch discount.
- ⛔ Set the release date and press **Release**.
