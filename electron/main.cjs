/**
 * Electron shell for the Steam build.
 *
 * - Serves dist-steam/ from a private app:// scheme (module workers and fetch()
 *   don't work reliably from file://).
 * - Saves: one JSON file per store key in <AppData>/IsoChronicle/saves/, written
 *   atomically (tmp file + rename) so a crash or Steam Cloud sync never sees a
 *   half-written save. Steam Auto-Cloud syncs that folder (see STEAM.md).
 * - Release builds: no menu, no DevTools, no navigation away from the game, no
 *   new windows. `--dev-tools` on an unpackaged run re-enables DevTools.
 * - Steam: steamworks.js is optional; the game runs normally without Steam.
 */
const { app, BrowserWindow, ipcMain, protocol, net, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const STEAM_APP_ID = Number(process.env.STEAM_APP_ID || readAppId() || 480); // 480 = Spacewar test app
const DIST = path.join(__dirname, '..', 'dist-steam');
const ALLOW_DEVTOOLS = !app.isPackaged && process.argv.includes('--dev-tools');

app.setName('IsoChronicle');

// Performance: rasterise on the GPU, don't fall back to software on blocklisted
// (often just old-driver) GPUs, and prefer the discrete GPU on laptops
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('force_high_performance_gpu');
const SAVE_DIR = path.join(app.getPath('appData'), 'IsoChronicle', 'saves');

function readAppId() {
  try {
    return fs.readFileSync(path.join(process.resourcesPath || __dirname, 'steam_appid.txt'), 'utf8').trim();
  } catch {
    return null;
  }
}

// ── Steam ────────────────────────────────────────────────────────────────────
let steam = null;
try {
  steam = require('steamworks.js').init(STEAM_APP_ID);
  require('steamworks.js').electronEnableSteamOverlay();
} catch (err) {
  console.warn('[steam] not available, running without Steam:', err.message);
}

// ── Saves ────────────────────────────────────────────────────────────────────
const SAFE_KEY = /^[a-z0-9_-]{1,64}$/i;
const fileFor = (key) => {
  if (!SAFE_KEY.test(key)) throw new Error('bad save key');
  return path.join(SAVE_DIR, `${key}.json`);
};
const MAX_SAVE_BYTES = 8 * 1024 * 1024;

ipcMain.handle('save:read', (_e, key) => {
  try {
    return fs.readFileSync(fileFor(key), 'utf8');
  } catch {
    return null;
  }
});
ipcMain.handle('save:write', (_e, key, value) => {
  if (typeof value !== 'string' || value.length > MAX_SAVE_BYTES) return false;
  fs.mkdirSync(SAVE_DIR, { recursive: true });
  const file = fileFor(key);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, value, 'utf8');
  fs.renameSync(tmp, file);
  return true;
});
ipcMain.handle('save:remove', (_e, key) => {
  try {
    fs.rmSync(fileFor(key), { force: true });
  } catch {
    /* already gone */
  }
  return true;
});
ipcMain.handle('steam:achievement', (_e, id) => {
  if (!steam || typeof id !== 'string') return false;
  try {
    return steam.achievement.activate(id);
  } catch {
    return false;
  }
});
ipcMain.handle('app:quit', () => app.quit());

// ── Window ───────────────────────────────────────────────────────────────────
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#020617',
    title: 'IsoChronicle: Idle Realms',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: ALLOW_DEVTOOLS,
      // The Steam overlay needs the frame to keep painting
      backgroundThrottling: false,
    },
  });
  if (!ALLOW_DEVTOOLS) win.setMenu(null);
  win.once('ready-to-show', () => win.show());

  // Stay inside the game: external links open in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) e.preventDefault();
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') win.setFullScreen(!win.isFullScreen());
  });

  win.loadURL('app://game/index.html');
}

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    const file = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
    if (!file.startsWith(DIST)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
});

app.on('window-all-closed', () => app.quit());
