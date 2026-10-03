#!/usr/bin/env node
/**
 * model-tool — token-cheap helper for editing the voxel models in src/game/sprites/.
 *
 *   node .claude/skills/voxel-model/model-tool.mjs list
 *   node .claude/skills/voxel-model/model-tool.mjs show <key>
 *   node .claude/skills/voxel-model/model-tool.mjs stats <key>
 *   node .claude/skills/voxel-model/model-tool.mjs render <key> [options]
 *
 * render options:
 *   --anim walk|attack|idle|<structure anim>|all   (default: idle)
 *   --frames 0,2          frame indices inside the animation (default: all)
 *   --dirs 0,2,4,6        directions for characters (default: 0,2,4,6; structures ignore it)
 *   --scale 3             nearest-neighbour upscale (default 3)
 *   --ref                 put the reference art next to the render (needs python3 + Pillow)
 *   --out <file.png>      output path (default: <scratch>/<key>-<anim>.png)
 *
 * Bundles the model modules with the repo's esbuild, so no new dependencies.
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SPRITES = path.join(ROOT, 'src/game/sprites');
const SCRATCH = process.env.MODEL_TOOL_OUT || path.join(os.tmpdir(), 'iso-model-tool');
fs.mkdirSync(SCRATCH, { recursive: true });

const FILES = {
  minion: 'minionModels.ts',
  enemy: 'enemyModels.ts',
  structure: 'structureModels.ts',
};

// Reference art for models whose file name isn't the kebab-case of the key
const PORTRAIT_OVERRIDES = {
  treant: 'ancient-ent', knight: 'human-knight', archer: 'human-archer', valkyrie: 'mecha-valkyrie',
  drone: 'mecha-drone', siegeTank: 'mecha-siege-tank', chronoMage: 'chrono-time-mage',
};
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

// ── Load models ──────────────────────────────────────────────────────────────

async function loadModules() {
  const entry = path.join(SCRATCH, 'entry.ts');
  fs.writeFileSync(entry, `
export * as VS from ${JSON.stringify(path.join(SPRITES, 'VoxelSprite.ts'))};
export { MINION_MODELS } from ${JSON.stringify(path.join(SPRITES, FILES.minion))};
export { ENEMY_MODELS } from ${JSON.stringify(path.join(SPRITES, FILES.enemy))};
export { STRUCTURE_MODELS, STRUCTURE_ART } from ${JSON.stringify(path.join(SPRITES, FILES.structure))};
`);
  const outfile = path.join(SCRATCH, 'models.bundle.mjs');
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'error' });
  return import(pathToFileURL(outfile).href + `?t=${Date.now()}`);
}

function findModel(mods, key) {
  if (mods.MINION_MODELS[key]) return { kind: 'minion', make: mods.MINION_MODELS[key] };
  if (mods.ENEMY_MODELS[key]) return { kind: 'enemy', make: mods.ENEMY_MODELS[key] };
  if (mods.STRUCTURE_MODELS[key]) return { kind: 'structure', make: mods.STRUCTURE_MODELS[key] };
  const all = [...Object.keys(mods.MINION_MODELS), ...Object.keys(mods.ENEMY_MODELS), ...Object.keys(mods.STRUCTURE_MODELS)];
  fail(`Unknown model "${key}". Known: ${all.join(', ')}`);
}

function referenceArt(mods, kind, key) {
  const file = kind === 'structure'
    ? `public/structures/${mods.STRUCTURE_ART[key]}.jpg`
    : `public/portraits/${PORTRAIT_OVERRIDES[key] ?? kebab(key)}.png`;
  return fs.existsSync(path.join(ROOT, file)) ? file : null;
}

// ── Source index (no bundling needed) ────────────────────────────────────────

/** Line range of every `const name = (): VoxelModel|StructureModel => {` in a models file. */
function sourceIndex(file) {
  const lines = fs.readFileSync(path.join(SPRITES, file), 'utf8').split('\n');
  const starts = [];
  lines.forEach((l, i) => {
    const m = l.match(/^const (\w+) = \(\): (?:VoxelModel|StructureModel)/);
    if (m) starts.push({ name: m[1], line: i + 1 });
  });
  return starts.map((s, i) => {
    // End = the closing `};` before the next model / export block
    const limit = i + 1 < starts.length ? starts[i + 1].line - 1 : lines.length;
    let end = s.line;
    for (let j = s.line; j <= limit; j++) if (/^};?\s*$/.test(lines[j - 1])) { end = j; break; }
    return { ...s, end, file };
  });
}

const allIndex = () => Object.values(FILES).flatMap(sourceIndex);

// ── PNG ──────────────────────────────────────────────────────────────────────

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function writePng(file, width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]));
}

// ── Frame picking & compositing ──────────────────────────────────────────────

/** Copies frame (fx,fy) of a sheet into a grid cell of `dst`, checker background, upscaled. */
function blit(src, srcW, fw, fh, fx, fy, dst, dstW, cx, cy, scale) {
  for (let y = 0; y < fh * scale; y++) {
    for (let x = 0; x < fw * scale; x++) {
      const sx = fx * fw + Math.floor(x / scale), sy = fy * fh + Math.floor(y / scale);
      const si = (sy * srcW + sx) * 4;
      const di = ((cy + y) * dstW + cx + x) * 4;
      const checker = ((Math.floor(x / 8) + Math.floor(y / 8)) & 1) ? 58 : 46;
      const a = src[si + 3] / 255;
      for (let c = 0; c < 3; c++) dst[di + c] = Math.round(src[si + c] * a + checker * (1 - a));
      dst[di + 3] = 255;
    }
  }
}

function parseList(v, fallback) {
  if (v === undefined) return fallback;
  return String(v).split(',').map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n));
}

async function render(key, opts) {
  const mods = await loadModules();
  const { kind, make } = findModel(mods, key);
  const model = make();
  const scale = Math.max(1, parseInt(opts.scale ?? '3', 10));
  const pad = 4;
  let cells = []; // { col, row } in source frames
  let sheet;

  if (kind === 'structure') {
    sheet = mods.VS.renderStrip(model, model.animations);
    const names = opts.anim === 'all' ? Object.keys(model.animations)
      : [opts.anim && model.animations[opts.anim] ? opts.anim : Object.keys(model.animations)[0]];
    for (const name of names) {
      const { start, count } = sheet.layout.animations[name];
      for (const f of parseList(opts.frames, [...Array(count).keys()])) if (f < count) cells.push({ col: start + f, row: 0 });
    }
  } else {
    sheet = mods.VS.renderSheet(model);
    const names = opts.anim === 'all' ? mods.VS.ANIMATION_ORDER : [opts.anim ?? 'idle'];
    const dirs = parseList(opts.dirs, [0, 2, 4, 6]);
    for (const d of dirs) for (const name of names) {
      const a = sheet.layout.animations[name];
      if (!a) fail(`Unknown animation "${name}" (walk, attack, idle, all)`);
      for (const f of parseList(opts.frames, [...Array(a.count).keys()])) if (f < a.count) cells.push({ col: a.start + f, row: d, dir: d });
    }
  }
  if (!cells.length) fail('Nothing to render — check --anim / --frames / --dirs');

  const { frameWidth: fw, frameHeight: fh } = sheet.layout;
  // Characters: one row per direction; structures: one row of frames
  const rows = kind === 'structure' ? [cells] : [...new Set(cells.map((c) => c.dir))].map((d) => cells.filter((c) => c.dir === d));
  const cols = Math.max(...rows.map((r) => r.length));
  const W0 = cols * (fw * scale + pad) + pad, H0 = rows.length * (fh * scale + pad) + pad;
  let W = W0, H = H0;
  const out = new Uint8ClampedArray(W0 * H0 * 4);
  for (let i = 0; i < W0 * H0; i++) { out[i * 4] = 24; out[i * 4 + 1] = 24; out[i * 4 + 2] = 30; out[i * 4 + 3] = 255; }
  rows.forEach((row, r) => row.forEach((c, k) =>
    blit(sheet.data, sheet.width, fw, fh, c.col, c.row, out, W0, pad + k * (fw * scale + pad), pad + r * (fh * scale + pad), scale)));

  const file = path.resolve(opts.out ?? path.join(SCRATCH, `${key}-${opts.anim ?? 'idle'}.png`));
  writePng(file, W0, H0, out);

  const ref = opts.ref ? referenceArt(mods, kind, key) : null;
  if (opts.ref && ref) {
    try {
      const size = execFileSync('python3', ['-c', `
import sys
from PIL import Image
r, a = Image.open(sys.argv[1]).convert('RGB'), Image.open(sys.argv[2]).convert('RGB')
h = min(a.height, 256)  # small reference keeps the image (and its token cost) small
r = r.resize((max(1, round(r.width * h / r.height)), h))
o = Image.new('RGB', (r.width + a.width + 8, max(h, a.height)), (24, 24, 30))
o.paste(r, (0, 0)); o.paste(a, (r.width + 8, 0)); o.save(sys.argv[2])
print(o.width, o.height)
`, path.join(ROOT, ref), file]).toString().trim().split(' ');
      [W, H] = size.map(Number);
    } catch {
      console.log(`(reference not composited — python3 + Pillow unavailable; view ${ref} separately)`);
    }
  }
  console.log(`${file}  ${W}x${H}  ${kind} "${key}"  frame ${fw}x${fh}  cells ${cells.length}${ref ? `  ref ${ref}` : ''}`);
}

// ── Stats ────────────────────────────────────────────────────────────────────

async function stats(key) {
  const mods = await loadModules();
  const { kind, make } = findModel(mods, key);
  const m = make();
  const [W, D, H] = m.size;
  const idle = (m.animations.idle ?? Object.values(m.animations)[0])[0] ?? {};
  const grid = mods.VS.voxelize(m, idle);
  let filled = 0;
  const perMat = new Map();
  let minZ = H, maxZ = -1;
  for (let z = 0; z < H; z++) for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
    const v = grid[(z * D + y) * W + x];
    if (!v) continue;
    filled++; perMat.set(v - 1, (perMat.get(v - 1) ?? 0) + 1);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  const loc = allIndex().find((e) => e.name === key || e.name === make.name);
  console.log(`${kind} "${key}"  ${loc ? `${FILES[kind]}:${loc.line}-${loc.end}` : ''}`);
  console.log(`size ${W}x${D}x${H}  foot [${m.foot}]  px/voxel ${m.pixelsPerVoxel ?? 1}  filled ${filled} voxels (z ${minZ}..${maxZ})`);
  console.log('materials:');
  m.materials.forEach((mat, i) => console.log(`  ${i}: #${mat.color.toString(16).padStart(6, '0')}${mat.emissive ? ' emissive' : ''}  ${perMat.get(i) ?? 0} vox`));
  console.log('parts:');
  for (const p of m.parts) console.log(`  ${p.name}${p.parent ? ` < ${p.parent}` : ''}  pivot [${p.pivot}]  ${p.shapes.length} shapes`);
  console.log('animations: ' + Object.entries(m.animations).map(([n, f]) => `${n}×${f.length}`).join('  '));
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function fail(msg) { console.error(msg); process.exit(1); }

const [cmd, key, ...rest] = process.argv.slice(2);
const opts = {};
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (!a.startsWith('--')) continue;
  const name = a.slice(2);
  if (name === 'ref') opts.ref = true;
  else opts[name] = rest[++i];
}

if (cmd === 'list') {
  for (const [kind, file] of Object.entries(FILES)) {
    console.log(`${kind} (${file})`);
    for (const e of sourceIndex(file)) console.log(`  ${e.name.padEnd(16)} ${e.line}-${e.end}`);
  }
} else if (cmd === 'show') {
  if (!key) fail('usage: show <key>');
  const e = allIndex().find((x) => x.name === key || (key === 'voidgate' && x.name === 'voidGate'));
  if (!e) fail(`No model function named "${key}" — run "list"`);
  const lines = fs.readFileSync(path.join(SPRITES, e.file), 'utf8').split('\n');
  console.log(`// ${e.file}:${e.line}-${e.end}`);
  for (let i = e.line; i <= e.end; i++) console.log(`${i}\t${lines[i - 1]}`);
} else if (cmd === 'stats') {
  if (!key) fail('usage: stats <key>');
  await stats(key);
} else if (cmd === 'render') {
  if (!key) fail('usage: render <key> [--anim idle] [--frames 0] [--dirs 0,2,4,6] [--scale 3] [--ref] [--out f.png]');
  await render(key, opts);
} else {
  fail('commands: list | show <key> | stats <key> | render <key> [options]');
}
