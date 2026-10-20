// Renders Codex-style portraits (public/portraits/*.png, 160x160) for characters that have no
// painted art, straight from their voxel models: 3/4 front idle frame, cropped, upscaled with
// nearest-neighbour, outlined and set on an opaque themed backdrop (so locked silhouettes show).
// Usage: node scripts/render-portraits.mjs [key ...]   (needs the voxel-model tool's bundle: run
// `node .claude/skills/voxel-model/model-tool.mjs list` once, or this script builds it itself)
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const SPRITES = path.join(ROOT, 'src/game/sprites');
const SIZE = 160;

// key → [file name, backdrop inner colour, backdrop outer colour, rim/glow colour]
const TARGETS = {
  dryad: ['dryad', [34, 70, 40], [8, 16, 12], [140, 220, 120]],
  minotaur: ['minotaur', [78, 52, 34], [16, 10, 8], [240, 180, 110]],
  emberImp: ['ember-imp', [96, 36, 18], [18, 6, 6], [255, 150, 60]],
  voidWraith: ['void-wraith', [52, 28, 88], [10, 6, 20], [190, 130, 255]],
  boneKnight: ['bone-knight', [54, 58, 66], [10, 10, 14], [200, 230, 255]],
  prismWarden: ['prism-warden', [30, 60, 90], [6, 10, 20], [150, 230, 255]],
  technician: ['technician', [46, 54, 66], [10, 12, 16], [255, 210, 90]],
  v4Launcher: ['mecha-v4-launcher', [44, 56, 50], [8, 12, 10], [255, 120, 80]],
  mermaid: ['sea-mermaid', [14, 70, 80], [4, 14, 22], [120, 240, 230]],
  piranha: ['sea-piranha', [70, 24, 30], [14, 6, 8], [255, 110, 110]],
  kappa: ['sea-kappa', [40, 66, 26], [8, 14, 6], [190, 240, 120]],
  leviathan: ['sea-leviathan', [14, 50, 80], [4, 8, 20], [170, 140, 255]],
  arachnid: ['brood-arachnid', [70, 40, 30], [14, 8, 6], [255, 200, 90]],
  scorpion: ['brood-scorpion', [90, 60, 20], [18, 10, 4], [250, 220, 120]],
  caterpillar: ['brood-caterpillar', [80, 56, 24], [16, 10, 4], [200, 140, 255]],
};

async function loadModels() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portraits-'));
  const entry = path.join(dir, 'entry.ts');
  fs.writeFileSync(entry, `
export * as VS from ${JSON.stringify(path.join(SPRITES, 'VoxelSprite.ts'))};
export { MINION_MODELS } from ${JSON.stringify(path.join(SPRITES, 'minionModels.ts'))};
export { ENEMY_MODELS } from ${JSON.stringify(path.join(SPRITES, 'enemyModels.ts'))};
export { SEA_MODELS } from ${JSON.stringify(path.join(SPRITES, 'seaModels.ts'))};
`);
  const outfile = path.join(dir, 'bundle.mjs');
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'error' });
  return import(pathToFileURL(outfile).href);
}

function writePng(file, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

function portrait(VS, model, [, inner, outer, rim]) {
  const sheet = VS.renderSheet(model);
  const { frameWidth: fw, frameHeight: fh } = sheet.layout;
  const idle = sheet.layout.animations.idle ?? sheet.layout.animations.walk;
  const col = idle.start, row = Number(process.env.PORTRAIT_DIR ?? 1); // direction 1 = 3/4 front view
  const at = (x, y) => ((row * fh + y) * sheet.width + col * fw + x) * 4;
  let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) if (sheet.data[at(x, y) + 3] > 0) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const scale = Math.max(1, Math.floor(Math.min(136 / cw, 140 / ch)));
  const ox = Math.floor((SIZE - cw * scale) / 2), oy = SIZE - 8 - ch * scale;
  const alpha = (sx, sy) => (sx < 0 || sy < 0 || sx >= cw || sy >= ch ? 0 : sheet.data[at(x0 + sx, y0 + sy) + 3]);

  const out = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    // radial backdrop centred behind the chest, plus a floor glow and a dark frame
    const d = Math.min(1, Math.hypot(x - SIZE / 2, y - SIZE * 0.45) / (SIZE * 0.72));
    const floor = Math.max(0, 1 - Math.hypot((x - SIZE / 2) / 60, (y - (SIZE - 12)) / 10)) * 0.35;
    for (let c = 0; c < 3; c++) out[i + c] = inner[c] * (1 - d) + outer[c] * d + rim[c] * floor;
    out[i + 3] = 255;
    const sx = Math.floor((x - ox) / scale), sy = Math.floor((y - oy) / scale);
    const inside = x >= ox && y >= oy && alpha(sx, sy) > 0;
    if (inside) {
      const si = at(x0 + sx, y0 + sy), a = sheet.data[si + 3] / 255;
      for (let c = 0; c < 3; c++) out[i + c] = sheet.data[si + c] * a + out[i + c] * (1 - a);
    } else {
      // 2px dark outline + soft rim glow around the silhouette
      let near = 0;
      for (let r = 1; r <= 6 && !near; r++) {
        for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
          const px = x + dx, py = y + dy;
          if (px >= ox && py >= oy && alpha(Math.floor((px - ox) / scale), Math.floor((py - oy) / scale)) > 0) { near = r; break; }
        }
      }
      if (near && near <= 2) for (let c = 0; c < 3; c++) out[i + c] = outer[c] * 0.5;
      else if (near) for (let c = 0; c < 3; c++) out[i + c] = out[i + c] * 0.75 + rim[c] * 0.25 * (1 - (near - 2) / 5);
    }
    if (x < 3 || y < 3 || x >= SIZE - 3 || y >= SIZE - 3) for (let c = 0; c < 3; c++) out[i + c] = outer[c] * 0.6;
  }
  return out;
}

const mods = await loadModels();
const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TARGETS);
for (const key of keys) {
  const t = TARGETS[key];
  const make = mods.MINION_MODELS[key] ?? mods.ENEMY_MODELS[key] ?? mods.SEA_MODELS[key];
  if (!t || !make) { console.error(`Unknown portrait key "${key}"`); process.exitCode = 1; continue; }
  const file = path.join(ROOT, 'public/portraits', `${t[0]}.png`);
  writePng(file, SIZE, SIZE, portrait(mods.VS, make(), t));
  console.log(`wrote ${path.relative(ROOT, file)}`);
}
