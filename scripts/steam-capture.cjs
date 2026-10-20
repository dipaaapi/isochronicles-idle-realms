/**
 * Steam marketing capture, run with Electron (no Python or Playwright needed):
 *
 *   npx electron scripts/steam-capture.cjs art       -> achievement icons + event art
 *   npx electron scripts/steam-capture.cjs shots     -> 1920x1080 gameplay screenshots
 *   npx electron scripts/steam-capture.cjs trailer   -> 1920x1080 gameplay trailer draft (.webm)
 *   npx electron scripts/steam-capture.cjs all
 *
 * Output: steam/store-assets/achievements/, steam/store-assets/events/,
 * steam/screenshots/, steam/trailer/.
 *
 * `shots` and `trailer` start the Vite dev server on port 5199 and stage a
 * realm through `window.__isoStore` (exposed only when __DEV_TOOLS__, so never
 * in a shipped build). Everything on screen is the real game rendering live,
 * which is what Valve requires for screenshots. A throwaway in-memory session
 * is used, so your own save is never touched.
 */
const { app, BrowserWindow, nativeImage } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'steam');
const ACHIEVEMENTS = require(path.join(ROOT, 'src/data/achievements.json')).achievements;
const PORT = 5199;
const W = 1920;
const H = 1080;
const mode = process.argv.find((a) => ['art', 'shots', 'trailer', 'all'].includes(a)) || 'all';

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('mute-audio');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mkdir = (p) => fs.mkdirSync(p, { recursive: true });

function makeWindow(width, height) {
  return new BrowserWindow({
    width,
    height,
    useContentSize: true,
    show: false,
    frame: false,
    paintWhenInitiallyHidden: true,
    webPreferences: { backgroundThrottling: false, partition: 'steam-capture', offscreen: false },
  });
}

async function snap(win, file, { jpeg } = {}) {
  const img = await win.webContents.capturePage();
  const size = win.getContentSize();
  const fixed = img.getSize().width === size[0] ? img : img.resize({ width: size[0], height: size[1], quality: 'best' });
  fs.writeFileSync(file, jpeg ? fixed.toJPEG(92) : fixed.toPNG());
  console.log('  wrote', path.relative(ROOT, file));
}

// ── Art: achievement icons and event images ─────────────────────────────────
const titleArt = () => 'file:///' + path.join(ROOT, 'public/backgrounds/title-screen.jpeg').split(path.sep).join('/');

function achievementHtml(a, locked) {
  return `<html><body style="margin:0;width:256px;height:256px;overflow:hidden;background:#0b0614">
  <div style="width:256px;height:256px;box-sizing:border-box;border:10px solid ${locked ? '#3f3f46' : a.color};
    background:radial-gradient(circle at 50% 40%, ${locked ? '#27272a' : a.color + '66'}, #0b0614 72%);
    display:flex;align-items:center;justify-content:center;${locked ? 'filter:grayscale(1) brightness(.55);' : ''}">
    <div style="font-size:132px;line-height:1;font-family:'Segoe UI Emoji','Noto Color Emoji',sans-serif;
      filter:drop-shadow(0 6px 10px #000a)">${a.icon}</div>
  </div></body></html>`;
}

// Event cover (800x450) and header (1920x622): the title painting, logo kept, no extra copy
function eventHtml(w, h, focusY) {
  return `<html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;background:#000">
  <div style="width:100%;height:100%;background:url(${titleArt()}) center ${focusY}% / cover no-repeat"></div></body></html>`;
}

// One reusable window per size (opening and destroying windows back to back aborts loads)
const artWindows = new Map();
let artCount = 0;
async function renderHtml(html, w, h, file, opts) {
  const key = `${w}x${h}`;
  if (!artWindows.has(key)) artWindows.set(key, makeWindow(w, h));
  const win = artWindows.get(key);
  const tmp = path.join(os.tmpdir(), `iso-steam-capture-${artCount++}.html`);
  fs.writeFileSync(tmp, '<meta charset="utf-8">' + html);
  await win.loadFile(tmp).catch(() => undefined);
  await sleep(300);
  await snap(win, file, opts);
  fs.rmSync(tmp, { force: true });
}

async function art() {
  console.log('art: achievement icons + event images');
  const dir = path.join(OUT, 'store-assets', 'achievements');
  mkdir(dir);
  for (const a of ACHIEVEMENTS) {
    await renderHtml(achievementHtml(a, false), 256, 256, path.join(dir, `${a.steam}.jpg`), { jpeg: true });
    await renderHtml(achievementHtml(a, true), 256, 256, path.join(dir, `${a.steam}_locked.jpg`), { jpeg: true });
  }
  const ev = path.join(OUT, 'store-assets', 'events');
  mkdir(ev);
  await renderHtml(eventHtml(800, 450, 30), 800, 450, path.join(ev, 'event_cover_800x450.jpg'), { jpeg: true });
  await renderHtml(eventHtml(1920, 622, 28), 1920, 622, path.join(ev, 'event_header_1920x622.jpg'), { jpeg: true });
  for (const win of artWindows.values()) win.destroy();
  artWindows.clear();
}

// ── Live game ────────────────────────────────────────────────────────────────
let devServer = null;
async function startDevServer() {
  const vite = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  devServer = spawn(process.platform === 'win32' ? 'node.exe' : 'node', [vite, '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
    env: { ...process.env, BROWSER: 'none' },
  });
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('Vite dev server did not start');
}

const GENERALS = ['GOLEM', 'LAVA_GARGOYLE', 'SUCCUBUS', 'MERMAN', 'NECROMANCER', 'KRAKEN', 'DEMON_HOUND', 'HARPY', 'DRYAD', 'MINOTAUR', 'EMBER_IMP', 'VOID_WRAITH', 'BONE_KNIGHT', 'PRISM_WARDEN'];

/** A mid-game realm: every structure standing, every General summoned, stock to spare. */
const STAGE = `(() => {
  const s = window.__isoStore; if (!s) return 'no store (is this the dev server?)';
  const st = s.getState();
  st.resetRealm();
  const fresh = s.getState();
  const resources = Object.fromEntries(Object.keys(fresh.resources).map((k) => [k, 50000]));
  const resourceBuildings = Object.fromEntries(Object.entries(fresh.resourceBuildings)
    .map(([id, b]) => [id, { ...b, level: 3, towerLevel: 3, hp: undefined, buildStep: undefined }]));
  s.setState({
    castleBuilt: true, spireBuilt: true, resources, resourceBuildings,
    defense: { ...fresh.defense, castleHp: fresh.defense.castleMaxHp, shieldHp: fresh.defense.shieldMaxHp },
    language: 'EN', isAudioMuted: true, showFpsDebug: false, showTileCoordinates: false,
  });
  fresh.completeIntro && fresh.completeIntro();
  for (const c of ['TREANT', ...${JSON.stringify(GENERALS)}]) s.getState().summonUnit(c, undefined, true);
  s.getState().setScreen('GAME');
  s.getState().setGameSpeed(2);
  return 'ok';
})()`;

const js = (win, code) => win.webContents.executeJavaScript(code, true);
const store = (win, body) => js(win, `(() => { const s = window.__isoStore; const st = s.getState(); ${body} })()`);
const command = (win, name) =>
  js(win, `window.dispatchEvent(new CustomEvent('isochronicle:activity-command', { detail: { command: '${name}', respond: () => {} } }))`);

/** Each scene: set it up, let it play, then shoot. */
const SCENES = [
  { name: '01_citadel_day', wait: 14000, setup: (w) => store(w, `st.setWeather('CLEAR'); st.setTimeOfDay('DAY', 0);`) },
  { name: '02_wave_battle', wait: 16000, setup: (w) => store(w, `st.setWeather('CLEAR'); st.startInvasion();`) },
  { name: '03_storm_night', wait: 12000, setup: (w) => store(w, `st.setWeather('RAIN'); st.setTimeOfDay('NIGHT', 0.85);`) },
  { name: '04_general_brawl', wait: 9000, setup: async (w) => { await store(w, `st.setWeather('CLEAR'); st.setTimeOfDay('DUSK', 0.4);`); await command(w, 'brawl'); } },
  { name: '05_snow_realm', wait: 12000, setup: (w) => store(w, `st.setRealmChoice && st.setRealmChoice(3); st.setWeather('SNOW'); st.setTimeOfDay('DAY', 0.1);`) },
  { name: '06_heatwave_siege', wait: 16000, setup: (w) => store(w, `st.setRealmChoice && st.setRealmChoice(2); st.setWeather('HEATWAVE'); st.startInvasion();`) },
];

async function openGame() {
  const win = makeWindow(W, H);
  await win.loadURL(`http://localhost:${PORT}/`);
  await sleep(4000);
  const staged = await js(win, STAGE);
  if (staged !== 'ok') throw new Error('Staging failed: ' + staged);
  console.log('  realm staged; letting sprites bake…');
  await sleep(20000);
  return win;
}

async function shots() {
  console.log('shots: live gameplay screenshots at 1920x1080');
  const dir = path.join(OUT, 'screenshots');
  mkdir(dir);
  const win = await openGame();
  for (const scene of SCENES) {
    await scene.setup(win);
    await sleep(scene.wait);
    await snap(win, path.join(dir, `${scene.name}.png`));
  }
  win.destroy();
}

function findFfmpeg() {
  const candidates = [process.env.FFMPEG];
  const pw = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
  if (fs.existsSync(pw)) {
    for (const d of fs.readdirSync(pw).filter((n) => n.startsWith('ffmpeg'))) {
      candidates.push(path.join(pw, d, 'ffmpeg-win64.exe'), path.join(pw, d, 'ffmpeg-linux'), path.join(pw, d, 'ffmpeg-mac'));
    }
  }
  return candidates.find((c) => c && fs.existsSync(c)) || 'ffmpeg'; // system ffmpeg last
}

async function trailer() {
  console.log('trailer: recording gameplay draft');
  const dir = path.join(OUT, 'trailer');
  mkdir(dir);
  const FPS = 24;
  const SECONDS_PER_SCENE = 7;
  const ffmpeg = findFfmpeg();
  const file = path.join(dir, 'trailer_draft_1920x1080.webm');
  // Frames go to one MJPEG stream file, encoded afterwards (some ffmpeg builds, e.g. Playwright's, have no pipe: input)
  const frames = path.join(os.tmpdir(), 'iso-trailer-frames.mjpeg');
  const enc = fs.createWriteStream(frames);

  const win = await openGame();
  // Title card: the title screen itself (logo and painting), held for 3 s
  await store(win, `st.setScreen('TITLE')`);
  await sleep(2500);
  await record(win, enc, FPS, 3);
  await store(win, `st.setScreen('GAME')`);
  await sleep(4000);
  for (const scene of SCENES) {
    await scene.setup(win);
    await sleep(Math.min(scene.wait, 6000));
    await record(win, enc, FPS, SECONDS_PER_SCENE);
  }
  await store(win, `st.setScreen('TITLE')`);
  await sleep(2500);
  await record(win, enc, FPS, 3);
  win.destroy();
  await new Promise((r) => enc.end(r));
  await new Promise((resolve, reject) => {
    const ff = spawn(ffmpeg, ['-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', frames,
      '-c:v', 'libvpx', '-b:v', '8M', '-crf', '8', '-pix_fmt', 'yuv420p', '-s', `${W}x${H}`, file], { stdio: ['ignore', 'ignore', 'inherit'] });
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg exited ' + code))));
  });
  fs.rmSync(frames, { force: true });
  console.log('  wrote', path.relative(ROOT, file));
}

/** Captures `seconds` of frames at `fps` (frames are duplicated when capture falls behind, so timing stays true). */
async function record(win, enc, fps, seconds) {
  const total = fps * seconds;
  const start = Date.now();
  let written = 0;
  let last = null;
  while (written < total) {
    const img = await win.webContents.capturePage();
    last = (img.getSize().width === W ? img : img.resize({ width: W, height: H })).toJPEG(90);
    const due = Math.min(total, Math.floor(((Date.now() - start) / 1000) * fps) + 1);
    while (written < due) {
      if (!enc.write(last)) await new Promise((r) => enc.once('drain', r));
      written++;
    }
  }
}

app.whenReady().then(async () => {
  try {
    if (mode === 'art' || mode === 'all') await art();
    if (mode === 'shots' || mode === 'trailer' || mode === 'all') await startDevServer();
    if (mode === 'shots' || mode === 'all') await shots();
    if (mode === 'trailer' || mode === 'all') await trailer();
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    devServer?.kill();
    app.quit();
  }
});
