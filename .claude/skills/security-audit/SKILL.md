---
name: security-audit
description: Security audit for IsoChronicle — save import/export and persisted-state hydration, untrusted strings rendered in React/Phaser, PWA/service worker and build config, dependencies, Docker dev setup. Use when the user asks to audit, harden or "secure" the game, before a release, or when a change touches persistence, save import, the PWA config, index.html, package.json or Docker files.
---

# IsoChronicle security audit

IsoChronicle is an offline-first browser game: no backend, no accounts, no network calls at runtime. Its attack surface is therefore small but real:

1. **Save files are untrusted input.** Players share `.json` saves; a crafted save goes through `importSave` and then into every system that reads the store.
2. **IndexedDB state is untrusted on load.** LocalForage data can be edited in devtools or left over from an old version; the persist `merge` must treat it like an imported save.
3. **Anything rendered from a save** (realm name, inventory item names, achievement ids) can reach React or Phaser Text.
4. **The shipped bundle**: PWA/service worker caching, `index.html` headers, dependencies.
5. **The dev setup**: `vite` server binds `0.0.0.0`, Docker mounts the repo.

Cheating in a single-player offline game (editing your own resources) is **not** a vulnerability. Focus on: script execution, crashes / soft-locks from malformed data, prototype pollution, denial of service (huge numbers, huge arrays, NaN/Infinity), and supply chain.

## Workflow

Work through each section below. For each finding record: file:line, what input triggers it, what happens (crash, XSS, soft-lock, corrupted save), severity (critical / high / medium / low), and a minimal fix. Then present findings ranked by severity and ask before fixing anything non-trivial. Never weaken a check to make a test pass.

### 1. Save import & persisted-state hydration

Files: `src/state/store/persistence.ts` (`importSave`, `exportSave`, `partialize`, `merge`), the `normalize*` / `migrate*` / `to*` helpers it calls, `src/ui/TitleScreen.tsx` and `src/ui/SettingsDrawer.tsx` (file input → `importSave`).

Check that:
- File size is capped before `FileReader` / `JSON.parse` (a 500 MB save freezes the tab).
- Every field is type-checked, not just truthy-checked. Patterns like `data.x || default` and `{ ...INITIAL, ...(data.x || {}) }` accept wrong types (a string `day`, an array `upgrades`, `resources.wood = "1e999"`).
- Numbers are finite and clamped (`Number.isFinite`, ≥ 0, sane upper bounds). `NaN`/`Infinity` in resources, wave number, levels or cooldowns can break economy formulas, loops sized by a level, and rendering.
- Arrays (`roster`, `inventory`, `achievements`, `regressionHistory`, `discovered*`) have a max length and each element is validated (unknown unit class / item id / invader type → dropped). An oversized roster spawns thousands of Phaser units.
- Enum fields (`season`, `timeOfDay`, `language`, `difficulty`, unit classes, building ids) are checked against the lookup tables in `src/data/`.
- Spreading untrusted objects cannot pollute prototypes: reject or strip `__proto__`, `constructor`, `prototype` keys; prefer copying only known keys over `...data.x`.
- `layoutSeed` / `buildingPositions` from `restoreLayout` stay inside `GRID_SIZE` and cannot place two sites on one tile or on water.
- `merge` (persist hydration) applies the same validation as `importSave` — ideally both call one shared `sanitizeSave(data)` function.
- `exportSave` does not include anything that should not leave the device.

Probe by writing malformed saves to the scratchpad and feeding them through the store in a Node test (same VM approach as `scripts/test-*.cjs`): wrong types, negative/NaN/huge numbers, 1e6-element arrays, unknown enum values, `{"__proto__": {"polluted": true}}`, missing required fields. A good fix comes with a `scripts/test-save-import.cjs` that keeps these cases passing.

### 2. Untrusted strings in the UI and canvas

- Grep `src/` for `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(`, `new Function`, `setTimeout(` with a string, `href={` / `src={` built from state. Any hit fed by save data is high severity.
- `realmName` and other free-text fields: length limit, rendered as text (React escapes by default — confirm no bypass). Phaser `Text` is canvas-only, but very long strings still hurt layout and performance.
- `LORE.md` / `LORE.tl.md` are imported raw — confirm they are rendered as text or through a renderer that does not allow raw HTML.
- Activity log (`src/state/activityLog.ts`, `src/i18n/activityMessages.json`): `logMessage(key, vars)` interpolation must not treat vars as markup; unknown keys should not throw.

### 3. PWA, service worker and page config

Files: `vite.config.ts`, `index.html`, `public/`.
- `workbox.globPatterns` precaches only first-party build output; `maximumFileSizeToCacheInBytes` is deliberate; `registerType: 'autoUpdate'` means a bad build propagates to every player — note it, don't change it without asking.
- `index.html` has no Content-Security-Policy. Recommend a CSP meta tag that fits the app (`default-src 'self'`; `worker-src 'self' blob:` for the sprite bake workers; `img-src 'self' data: blob:`; `style-src 'self' 'unsafe-inline'` only if Tailwind/DaisyUI or Phaser need it). Verify in the browser that the game still loads, workers still bake sprites, and the console is clean before recommending a final policy.
- No secrets, API keys or tokens anywhere in `src/`, `public/`, `.env*`, or git history (`git log -p -S` for suspicious strings).
- `public/` contains nothing private (source art, notes, backups).

### 4. Dependencies

- `npm audit --omit=dev` (runtime) and `npm audit` (full). Report advisories by package and whether the vulnerable code path is reachable in this app (e.g. a dev-server-only issue in Vite is low for players but matters for the Docker dev server).
- `npm outdated` for `phaser`, `react`, `vite`, `vite-plugin-pwa`, `localforage`, `easystarjs`.
- `package-lock.json` is committed and consistent (`npm ci` succeeds).
- Flag any dependency with install scripts or that is unmaintained.

### 5. Dev server & Docker

Files: `vite.config.ts` (`server.host: '0.0.0.0'`), `Dockerfile.dev`, `docker-compose*.yml`.
- `0.0.0.0` exposes the dev server (and source files) to the LAN — fine inside Docker, risky when someone runs `npm run dev` on a café Wi-Fi. Recommend binding to localhost outside Docker (e.g. `host: process.env.DOCKER ? '0.0.0.0' : 'localhost'`) or document the risk.
- Docker image runs as non-root, pins a base image version, and does not copy `.env` files into the image.

### 6. Robustness checks that double as security

- Offline progression (`src/state/offlineProgression.ts`): a tampered `lastSavedTimestamp` far in the past or future must be clamped (max offline window, no negative elapsed time).
- Pathfinding / layout: malformed positions must not hang EasyStar.
- Any loop whose bound comes from state (levels, wave number, roster size) has a hard cap.

## Validation

After any fix:
- `npm run build` and `npm test` pass.
- Run the game in the browser (see the `run` skill): new game, export, import the exported save, import a malformed save (should show the error, not crash), reload the page (IndexedDB hydration). Console must be clean.
- Commit with the repo's `ft:` prefix and list touched areas.

## Report format

Start with a one-paragraph summary of overall posture, then a table: severity · area · file:line · issue · fix. End with what was not checked and why.
