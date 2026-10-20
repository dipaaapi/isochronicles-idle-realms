// Offline island preview: paints every tile with PixelTileArt into an iso PNG.
// usage: node island-preview.mjs <repo> <seed> <style> <out.png>
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

const [repo, seedArg, style, out] = process.argv.slice(2);
const scratch = path.dirname(out);
const entry = path.join(scratch, 'island-entry.ts');
fs.writeFileSync(entry, `
export * as L from ${JSON.stringify(path.join(repo, 'src/state/buildingLayout.ts'))};
export * as C from ${JSON.stringify(path.join(repo, 'src/game/scene/coastField.ts'))};
export * as T from ${JSON.stringify(path.join(repo, 'src/game/PixelTileArt.ts'))};
`);
const bundle = path.join(scratch, 'island.bundle.mjs');
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'error' });
const { L, T, C } = await import(pathToFileURL(bundle).href + `?t=${Date.now()}`);

L.setCoastStyle(style);
L.applyLayoutSeed(Number(seedArg));
const N = L.GRID_SIZE;
const field = C.makeCoastField(Number(seedArg));
// PREVIEW_TERRAIN: a sample raised plateau and a sand patch near the centre, to check the living-terrain look
const cxp = Math.floor(N / 2) + 6, cyp = Math.floor(N / 2) - 6;
const RAISED = new Set(), SANDS = new Set();
for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { if (Math.hypot(dx, dy) <= 2.2) RAISED.add(`${cxp + dx},${cyp + dy}`); if (Math.hypot(dx, dy) <= 2.4) SANDS.add(`${cxp - 7 + dx},${cyp + 9 + dy}`); }
const terrain = { raised: C.makeSetField((x, y) => RAISED.has(`${x},${y}`), 5, 0.2), sand: C.makeSetField((x, y) => SANDS.has(`${x},${y}`), 9) };
const type = (x, y) => (L.isPortalTile(x, y) ? 'SPAWN_BLOCK' : L.isWaterTile(x, y) ? 'OCEAN_BLOCK' : 'AETHER_GRASS');
const pal = {
  AETHER_GRASS: { topColor: 0x4d8a3a, leftColor: 0x6b4f2e, rightColor: 0x553d22, strokeColor: 0x86c25a },
  OCEAN_BLOCK: { topColor: 0x1d6fa3, leftColor: 0x155a85, rightColor: 0x114a6e, strokeColor: 0x7dd3fc },
  SPAWN_BLOCK: { topColor: 0x2a1f3d, leftColor: 0x1a1426, rightColor: 0x140f1e, strokeColor: 0xc084fc },
};
const W = T.TILE_ART_W, H = T.TILE_ART_H;
const imgW = (N * 2) * (W / 2) + W, imgH = N * (W / 4) * 2 + H + 20;
const data = new Uint8ClampedArray(imgW * imgH * 4);
const tile = new Uint8ClampedArray(W * H * 4);
const order = [];
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) order.push({ x, y });
order.sort((a, b) => a.x + a.y - (b.x + b.y) || a.x - b.x);
for (const { x, y } of order) {
  tile.fill(0);
  const t = type(x, y);
  const nb = (dx, dy, want) => { const tt = x + dx >= 0 && y + dy >= 0 && x + dx < N && y + dy < N ? type(x + dx, y + dy) : 'OCEAN_BLOCK'; return want ? tt === 'OCEAN_BLOCK' : tt !== 'OCEAN_BLOCK'; };
  const shore = { px: nb(1, 0, false), nx: nb(-1, 0, false), py: nb(0, 1, false), ny: nb(0, -1, false) };
  T.paintTile({ data: tile, width: W }, 0, 0, { type: t, colors: pal[t], gridX: x, gridY: y, cliffLeft: y === N - 1, cliffRight: x === N - 1, platformPhase: 1, shore, seed: Number(seedArg), terrain });
  if (C.isCoastalTile(x, y) && t !== 'SPAWN_BLOCK') T.paintCoast({ data: tile, width: W }, 0, 0, { type: t, colors: pal[t], gridX: x, gridY: y, cliffLeft: false, cliffRight: false, platformPhase: 1 }, field, { water: pal.OCEAN_BLOCK, grass: pal.AETHER_GRASS });
  const ox = (x - y) * (W / 2) + N * (W / 2), oy = (x + y) * (W / 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const s = (j * W + i) * 4; if (!tile[s + 3]) continue;
    const X = ox + i, Y = oy + j; if (X < 0 || Y < 0 || X >= imgW || Y >= imgH) continue;
    const d = (Y * imgW + X) * 4; data[d] = tile[s]; data[d + 1] = tile[s + 1]; data[d + 2] = tile[s + 2]; data[d + 3] = 255;
  }
}
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(ty), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const raw = Buffer.alloc((imgW * 4 + 1) * imgH);
for (let y = 0; y < imgH; y++) Buffer.from(data.buffer, y * imgW * 4, imgW * 4).copy(raw, y * (imgW * 4 + 1) + 1);
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(imgW, 0); ihdr.writeUInt32BE(imgH, 4); ihdr[8] = 8; ihdr[9] = 6;
fs.writeFileSync(out, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(out, imgW, imgH);
