#!/usr/bin/env node
/**
 * codemap — navigate IsoChronicle's source without reading whole files.
 *
 *   node .claude/skills/codemap/codemap.mjs build              # regenerate CODEMAP.md (run after adding/removing files)
 *   node .claude/skills/codemap/codemap.mjs check              # files missing from purposes.json / stale entries
 *   node .claude/skills/codemap/codemap.mjs outline <file>     # top-level declarations + class members with line ranges
 *   node .claude/skills/codemap/codemap.mjs where <symbol>     # where it is defined and which files import it
 *   node .claude/skills/codemap/codemap.mjs changed [ref]      # files changed since ref (default: last commit) with their purpose
 *
 * Purposes are one line each in purposes.json (hand-written, keyed by path).
 * Exports and sizes are read from the source on every run. Plain Node, no dependencies.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PURPOSES = path.join(HERE, 'purposes.json');
const OUT = path.join(HERE, 'CODEMAP.md');
const SCAN = ['src', 'scripts'];
const EXT = /\.(ts|tsx|json|cjs|mjs|css)$/;

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const read = (p) => fs.readFileSync(p, 'utf8');
const loadPurposes = () => (fs.existsSync(PURPOSES) ? JSON.parse(read(PURPOSES)) : {});

function walk(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return EXT.test(e.name) && !e.name.endsWith('.d.ts') ? [p.split(path.sep).join('/')] : [];
  });
}
const allFiles = () => SCAN.flatMap(walk).sort();

// ── Exports & outline ────────────────────────────────────────────────────────

function exportsOf(file) {
  if (!/\.(ts|tsx)$/.test(file)) return [];
  const names = [];
  for (const l of read(path.join(ROOT, file)).split('\n')) {
    let m = l.match(/^export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?|class|const|let|interface|type|enum)\s+([A-Za-z_$][\w$]*)/);
    if (m) { names.push(m[1]); continue; }
    m = l.match(/^export\s+default\s+([A-Za-z_$][\w$]*)/);
    if (m) names.push(`default ${m[1]}`);
    m = l.match(/^export\s*\{([^}]*)\}/);
    if (m) names.push(...m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()).filter(Boolean));
  }
  return [...new Set(names)];
}

/** Declarations at column 0 plus class members at 2 spaces, each with its line range. */
function outline(file) {
  const lines = read(path.join(ROOT, file)).split('\n');
  const decl = /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(function\*?|class|const|let|interface|type|enum)\s+([A-Za-z_$][\w$]*)/;
  const member = /^  (?:(?:private|public|protected|static|readonly|async|override|get|set)\s+)*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/;
  const items = [];
  lines.forEach((l, i) => {
    const m = l.match(decl);
    if (m) items.push({ line: i + 1, depth: 0, kind: m[1], name: m[2] });
    else {
      const k = l.match(member);
      if (k && !['if', 'for', 'while', 'switch', 'return', 'catch', 'constructor'].includes(k[1])) items.push({ line: i + 1, depth: 1, kind: 'method', name: k[1] });
      else if (/^  constructor\s*\(/.test(l)) items.push({ line: i + 1, depth: 1, kind: 'method', name: 'constructor' });
      else {
        // Handlers inside a React component, and banner comments that mark JSX sections / tabs
        const fn = l.match(/^  (?:const|function)\s+([A-Za-z_$][\w$]*)\s*(?:=\s*(?:useCallback\(\s*)?(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=>|\()/);
        const banner = l.match(/^\s*(?:\{\/\*|\/\/)\s*[=─━-]{3,}\s*(.+?)\s*[=─━-]{3,}/);
        if (fn) items.push({ line: i + 1, depth: 1, kind: 'fn', name: fn[1] });
        else if (banner) items.push({ line: i + 1, depth: 1, kind: 'section', name: banner[1] });
        else if (/^\s+\{\s*\w*[tT]ab\s*===\s*['"]\w+['"]\s*&&/.test(l)) items.push({ line: i + 1, depth: 2, kind: 'tab', name: l.match(/['"](\w+)['"]/)[1] });
        else if (/^  return\s*\(\s*$/.test(l)) items.push({ line: i + 1, depth: 1, kind: 'jsx', name: 'return (…)' });
      }
    }
  });
  // A range ends right before the next item of the same or lower depth
  items.forEach((it, i) => {
    const next = items.slice(i + 1).find((n) => n.depth <= it.depth);
    let end = (next ? next.line : lines.length + 1) - 1;
    while (end > it.line && !lines[end - 1].trim()) end--;
    it.end = end;
  });
  return { items, total: lines.length };
}

// ── Commands ─────────────────────────────────────────────────────────────────

function cmdBuild() {
  const purposes = loadPurposes();
  const files = allFiles();
  const byDir = new Map();
  for (const f of files) {
    const dir = path.posix.dirname(f);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(f);
  }
  const out = [
    '# CODEMAP',
    '',
    'Generated by `node .claude/skills/codemap/codemap.mjs build` — do not edit by hand; edit `purposes.json` and rebuild.',
    'Format: `file` (KB, lines) — purpose · exports. Read this instead of opening files to find where something lives;',
    'then `outline <file>` and read only the line range you need.',
    '',
  ];
  let missing = 0;
  for (const [dir, list] of byDir) {
    out.push(`## ${dir}/`, '');
    for (const f of list) {
      const text = read(path.join(ROOT, f));
      const kb = (text.length / 1024).toFixed(text.length < 10240 ? 1 : 0);
      const lines = text.split('\n').length;
      const purpose = purposes[f] ?? (missing++, '(no purpose yet)');
      const ex = exportsOf(f);
      const exText = ex.length ? ` · ${ex.slice(0, 8).join(', ')}${ex.length > 8 ? ` +${ex.length - 8}` : ''}` : '';
      out.push(`- \`${path.posix.basename(f)}\` (${kb} KB, ${lines}) — ${purpose}${exText}`);
    }
    out.push('');
  }
  fs.writeFileSync(OUT, out.join('\n'));
  console.log(`${rel(OUT)}: ${files.length} files${missing ? `, ${missing} without a purpose (run "check")` : ''}`);
}

function cmdCheck() {
  const purposes = loadPurposes();
  const files = new Set(allFiles());
  const missing = [...files].filter((f) => !purposes[f]);
  const stale = Object.keys(purposes).filter((f) => !files.has(f));
  for (const f of missing) console.log(`missing purpose: ${f}`);
  for (const f of stale) console.log(`stale entry:     ${f}`);
  console.log(missing.length || stale.length ? 'Fix purposes.json, then run "build".' : 'purposes.json covers every file');
  if (missing.length || stale.length) process.exitCode = 1;
}

function resolveFile(arg) {
  if (fs.existsSync(path.join(ROOT, arg))) return arg;
  const hits = allFiles().filter((f) => f.endsWith(`/${arg}`) || path.posix.basename(f, path.posix.extname(f)) === arg);
  if (hits.length === 1) return hits[0];
  fail(hits.length ? `Ambiguous: ${hits.join(', ')}` : `No file "${arg}"`);
}

function cmdOutline(arg) {
  const file = resolveFile(arg);
  const { items, total } = outline(file);
  const purpose = loadPurposes()[file];
  console.log(`${file} (${total} lines)${purpose ? ` — ${purpose}` : ''}`);
  for (const it of items) {
    const size = it.end - it.line + 1;
    console.log(`${'  '.repeat(it.depth)}${String(it.line).padStart(5)}-${String(it.end).padEnd(5)} ${it.kind.padEnd(9)} ${it.name}${size > 80 ? `  (${size} lines)` : ''}`);
  }
}

function cmdWhere(symbol) {
  const re = new RegExp(`\\b${symbol.replace(/[$]/g, '\\$')}\\b`);
  const defs = [], importers = [];
  for (const f of allFiles().filter((x) => /\.(ts|tsx)$/.test(x))) {
    const lines = read(path.join(ROOT, f)).split('\n');
    lines.forEach((l, i) => {
      if (!re.test(l)) return;
      if (new RegExp(`^(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?(?:function\\*?|class|const|let|interface|type|enum)\\s+${symbol}\\b`).test(l)
        || new RegExp(`^  (?:(?:private|public|protected|static|readonly|async)\\s+)*${symbol}\\s*[(<:=]`).test(l)) defs.push(`${f}:${i + 1}  ${l.trim().slice(0, 140)}`);
    });
    const text = lines.join('\n');
    if (new RegExp(`import[^;]*\\b${symbol}\\b[^;]*from`, 's').test(text)) importers.push(f);
  }
  console.log(defs.length ? `defined:\n  ${defs.join('\n  ')}` : 'defined: (not found as a declaration)');
  console.log(importers.length ? `imported by (${importers.length}):\n  ${importers.join('\n  ')}` : 'imported by: none');
}

function cmdChanged(ref) {
  const purposes = loadPurposes();
  let out;
  try {
    out = execFileSync('git', ['diff', '--stat=200', ref || 'HEAD~1', '--', ...SCAN], { cwd: ROOT }).toString();
  } catch (e) { fail(`git diff failed: ${e.message}`); }
  for (const l of out.split('\n')) {
    const m = l.match(/^\s*(\S+)\s*\|\s*(.*)$/);
    if (m) console.log(`${m[1]}  ${m[2]}${purposes[m[1]] ? `\n    ${purposes[m[1]]}` : ''}`);
    else if (l.trim()) console.log(l.trim());
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function fail(msg) { console.error(msg); process.exit(1); }

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'build') cmdBuild();
else if (cmd === 'check') cmdCheck();
else if (cmd === 'outline') { if (!arg) fail('usage: outline <file>'); cmdOutline(arg); }
else if (cmd === 'where') { if (!arg) fail('usage: where <symbol>'); cmdWhere(arg); }
else if (cmd === 'changed') cmdChanged(arg);
else fail('commands: build | check | outline <file> | where <symbol> | changed [ref]');
