# Shipping IsoChronicle on Steam

The web game ships on Steam as an Electron desktop app. The browser and PWA build is unchanged.

## Builds

| Command | What it does |
| --- | --- |
| `npm run build:steam` | Type-checks, then builds `dist-steam/`: no service worker, no dev tools |
| `npm run desktop` | Builds and runs the desktop app locally |
| `npm run desktop:dev-tools` | Same, with Chromium DevTools (unpackaged runs only) |
| `npm run dist:steam` | Packages `release/win-unpacked` and `release/linux-unpacked` |
| `npm run steam:art` | Regenerates the store and library images in `steam/store-assets/` |

## Before the first upload

1. Get an App ID and depot IDs in Steamworks. Put the App ID in `steam/steam_appid.txt` and in `steam/app_build.vdf`. Put the depot IDs in the `depot_*.vdf` files. They are placeholders now: 480 / 481 / 482 belong to Valve's Spacewar test app.
2. Set the launch options in **Installation → General**:
   - Windows: `IsoChronicle Idle Realms.exe`
   - Linux: `isochronicle-idle-realms`
3. Set up **Steam Cloud** under **Application → Steam Cloud**:
   - Byte quota `50 MB`, number of files `20`.
   - Auto-Cloud root paths:
     - Windows: root `WinAppDataRoaming`, subdirectory `IsoChronicle/saves`, pattern `*.json`.
     - Linux: root `LinuxXdgConfigHome`, subdirectory `IsoChronicle/saves`, pattern `*.json`.
   - The `.json.tmp` files are excluded by the pattern, so a half-written save is never synced.
4. Upload the images in `steam/store-assets/` (sizes are in the file names). Also add **at least 5 real gameplay screenshots at 1920×1080**. Valve rejects mock-ups, so these have to be captured in game.
5. Upload with SteamCMD: `steamcmd +login <builder> +run_app_build <path>\steam\app_build.vdf +quit`.

## Saves and Valve's rules

- Desktop saves are one plain JSON file per store key in `%APPDATA%/IsoChronicle/saves/` (Linux: `~/.config/IsoChronicle/saves/`). They are never written inside the install folder, which Steam can replace on update.
- Writes are atomic (tmp + rename), debounced to one every 3 s, and flushed when the window closes. Cloud sync therefore always sees a complete file, and the disk isn't hammered.
- The first desktop launch copies an existing browser (IndexedDB) save into the file.
- JSON export/import in Settings still works, and import still goes through the existing validation in `src/state/store/persistence.ts`.
- No account, telemetry or network is needed to play. Offline play is fully supported.

## Anti-exploit

- Developer Mode, the DevPanel, god mode and one-hit kill are gated on the compile-time constant `__DEV_TOOLS__`, which is true only under `npm run dev`. Every build drops that code, and `devFlag()` returns false even if someone pokes the store from a console.
- The packaged app has no menu and no DevTools, blocks navigation and new windows (external `https` links open in the system browser), and runs with `contextIsolation`, `sandbox` and no Node in the page. The page reaches the main process only through the five calls in `electron/preload.cjs`. Save keys are checked against a whitelist pattern, and saves are capped at 8 MB.

## Before release

- Check the licence of every music track the in-game music player can play. YouTube embeds are not licensed for redistribution inside a paid product.
- The title art's subtitle reads "Demon Lord Realms" while the store name is "Idle Realms". Pick one before the store page goes up.
- Fill in the store page's content survey (mature content: demons, fantasy violence).
