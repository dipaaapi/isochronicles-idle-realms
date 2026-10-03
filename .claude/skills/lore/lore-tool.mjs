#!/usr/bin/env node
/**
 * lore-tool — find and check IsoChronicle's story text without reading whole files.
 *
 *   node .claude/skills/lore/lore-tool.mjs sources                 # where narrative text lives (+ sizes)
 *   node .claude/skills/lore/lore-tool.mjs sections                # LORE.md / LORE.tl.md headings side by side
 *   node .claude/skills/lore/lore-tool.mjs section <n|heading>     # one LORE section, EN + TL
 *   node .claude/skills/lore/lore-tool.mjs find <term> [--max 40]  # narrative strings mentioning <term>, file:line
 *   node .claude/skills/lore/lore-tool.mjs entity <name>           # one entity's text fields only (units, invaders, items…)
 *   node .claude/skills/lore/lore-tool.mjs check                   # EN/TL gaps and section mismatches
 *
 * Plain Node, no dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const rel = (p) => path.relative(ROOT, p);
const read = (p) => fs.readFileSync(p, 'utf8');

// Files that carry player-facing story / flavour text
const LORE_EN = path.join(ROOT, 'LORE.md');
const LORE_TL = path.join(ROOT, 'LORE.tl.md');
const listDir = (dir, re) =>
  fs.existsSync(path.join(ROOT, dir))
    ? fs.readdirSync(path.join(ROOT, dir)).filter((f) => re.test(f)).map((f) => path.join(ROOT, dir, f))
    : [];
const SOURCES = [
  LORE_EN,
  LORE_TL,
  path.join(ROOT, 'src/ui/IntroNarrativeModal.tsx'),
  ...listDir('src/data', /\.(ts|json)$/),
  ...listDir('src/i18n', /\.(ts|json)$/),
].filter((f) => fs.existsSync(f));

/** Keys whose values are prose (names, descriptions, flavour, translations). */
const TEXT_KEY = /["']?\b(name|nameEn|nameTl|title|titleEn|titleTl|description|descriptionEn|descriptionTl|descriptionEnglish|descriptionTagalog|desc|descEn|descTl|label|labelEn|labelTl|subtitle|subtitleEn|subtitleTl|role|lore|flavor|flavour|question|answer|en|tl|text)["']?\s*:\s*["'`]/;
const NARRATIVE_CONST = /NARRATIVE_TEXT_\w+\s*=/;

const isMarkdown = (f) => f.endsWith('.md');
const clip = (s, n = 220) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// ── LORE sections ────────────────────────────────────────────────────────────

function sections(file) {
  const lines = read(file).split('\n');
  const out = [];
  lines.forEach((l, i) => {
    if (l.startsWith('## ')) out.push({ title: l.slice(3).trim(), start: i + 1 });
  });
  out.forEach((s, i) => (s.end = i + 1 < out.length ? out[i + 1].start - 1 : lines.length));
  return { lines, list: out };
}

function printSection(file, s, lines) {
  console.log(`── ${rel(file)}:${s.start}-${s.end}`);
  console.log(lines.slice(s.start - 1, s.end).join('\n').trim());
}

// ── Commands ─────────────────────────────────────────────────────────────────

function cmdSources() {
  for (const f of SOURCES) {
    const text = read(f);
    const hits = isMarkdown(f) ? text.split('\n').filter((l) => l.trim()).length
      : text.split('\n').filter((l) => TEXT_KEY.test(l) || NARRATIVE_CONST.test(l)).length;
    console.log(`${rel(f).padEnd(40)} ${String(Math.round(text.length / 1024)).padStart(3)} KB  ${hits} text lines`);
  }
}

function cmdSections() {
  const en = sections(LORE_EN).list, tl = sections(LORE_TL).list;
  const n = Math.max(en.length, tl.length);
  for (let i = 0; i < n; i++) {
    console.log(`${String(i + 1).padStart(2)}. ${(en[i] ? `${en[i].title} (${en[i].start}-${en[i].end})` : '—').padEnd(44)} │ ${tl[i] ? `${tl[i].title} (${tl[i].start}-${tl[i].end})` : '—'}`);
  }
}

function cmdSection(q) {
  const en = sections(LORE_EN), tl = sections(LORE_TL);
  let idx = /^\d+$/.test(q) ? parseInt(q, 10) - 1 : -1;
  if (idx < 0) {
    const ql = q.toLowerCase();
    idx = en.list.findIndex((s) => s.title.toLowerCase().includes(ql));
    if (idx < 0) idx = tl.list.findIndex((s) => s.title.toLowerCase().includes(ql));
  }
  if (idx < 0 || !en.list[idx]) fail(`No section "${q}" — run "sections"`);
  printSection(LORE_EN, en.list[idx], en.lines);
  if (tl.list[idx]) printSection(LORE_TL, tl.list[idx], tl.lines);
}

function cmdFind(term, max) {
  const t = term.toLowerCase();
  let shown = 0, total = 0;
  for (const f of SOURCES) {
    const lines = read(f).split('\n');
    lines.forEach((l, i) => {
      if (!l.toLowerCase().includes(t)) return;
      if (!isMarkdown(f) && !TEXT_KEY.test(l) && !NARRATIVE_CONST.test(l) && !NARRATIVE_CONST.test(lines[i - 1] ?? '')) return;
      total++;
      if (shown < max) { console.log(`${rel(f)}:${i + 1}  ${clip(l.trim())}`); shown++; }
    });
  }
  if (total > shown) console.log(`… ${total - shown} more (raise --max or narrow the term)`);
  if (!total) console.log('no narrative text matches');
}

/**
 * Every object block (TS or JSON) that mentions <term> in a text field, printed
 * with only its text fields: one entity's EN + TL name, subtitle, description, skills.
 */
function cmdEntity(term, max) {
  const t = term.toLowerCase();
  const indent = (l) => l.match(/^\s*/)[0].length;
  const seen = new Set();
  let shown = 0;
  for (const f of SOURCES.filter((x) => !isMarkdown(x))) {
    const lines = read(f).split('\n');
    for (let i = 0; i < lines.length && shown < max; i++) {
      const l = lines[i];
      if (!l.toLowerCase().includes(t) || !TEXT_KEY.test(l)) continue;
      // Walk up by brace depth to the enclosing block, then on to its entry at the top of the table (indent ≤ 4)
      const strip = (x) => x.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '');
      let start = i, depth = 0;
      for (let j = i; j >= 0; j--) {
        const code = strip(lines[j]);
        for (let c = code.length - 1; c >= 0; c--) {
          if (code[c] === '}' || code[c] === ']') depth++;
          else if (code[c] === '{' || code[c] === '[') depth--;
        }
        if (depth < 0) {
          start = j;
          depth = 0;
          if (indent(lines[j]) <= 4) break;
        }
      }
      const key = `${f}:${start}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const base = indent(lines[start]);
      let end = start + 1;
      while (end < lines.length && !(indent(lines[end]) <= base && /^\s*[}\]]/.test(lines[end]))) end++;
      console.log(`── ${rel(f)}:${start + 1}-${end + 1}  ${lines[start].trim()}`);
      for (let k = start + 1; k < end; k++) {
        if (TEXT_KEY.test(lines[k]) || /^\s*["']?[\w.-]+["']?\s*:\s*\{\s*$/.test(lines[k]) && indent(lines[k]) === base + 2)
          console.log(`${String(k + 1).padStart(5)}  ${clip(lines[k].trim(), 260)}`);
      }
      shown++;
      i = end;
    }
  }
  if (!shown) console.log('no entity found — try "find"');
}

function cmdCheck() {
  let issues = 0;
  const warn = (m) => { issues++; console.log(m); };

  // 1. LORE.md vs LORE.tl.md structure
  const en = sections(LORE_EN), tl = sections(LORE_TL);
  if (en.list.length !== tl.list.length) warn(`LORE: ${en.list.length} EN sections vs ${tl.list.length} TL sections`);
  en.list.forEach((s, i) => {
    const o = tl.list[i];
    if (!o) return;
    const count = (sec, lines, re) => lines.slice(sec.start - 1, sec.end).filter((l) => re.test(l)).length;
    const bE = count(s, en.lines, /^\s*[-*] /), bT = count(o, tl.lines, /^\s*[-*] /);
    const pE = count(s, en.lines, /^[^-*#\s]/), pT = count(o, tl.lines, /^[^-*#\s]/);
    if (bE !== bT || pE !== pT) warn(`LORE §${i + 1} "${s.title}": EN ${pE}¶/${bE} bullets vs TL ${pT}¶/${bT} bullets`);
  });

  // 2. JSON {en, tl} pairs with a missing or empty side
  for (const f of SOURCES.filter((x) => x.endsWith('.json'))) {
    let data;
    try { data = JSON.parse(read(f)); } catch { warn(`${rel(f)}: invalid JSON`); continue; }
    const walk = (node, p) => {
      if (!node || typeof node !== 'object') return;
      const keys = Object.keys(node);
      if (keys.includes('en') || keys.includes('tl')) {
        if (!node.en || !node.tl) warn(`${rel(f)}: ${p || '(root)'} missing ${!node.en ? 'en' : 'tl'}`);
      }
      // name/nameEn and description/descriptionEn pairs
      for (const [a, b] of [['name', 'nameEn'], ['description', 'descriptionEn']]) {
        if (keys.includes(a) !== keys.includes(b) && (keys.includes('nameEn') || keys.includes('descriptionEn')))
          warn(`${rel(f)}: ${p} has ${keys.includes(a) ? a : b} without ${keys.includes(a) ? b : a}`);
      }
      for (const k of keys) walk(node[k], p ? `${p}.${k}` : k);
    };
    walk(data, '');
  }

  // 3. TS tables: a description without descriptionEn nearby (or vice versa)
  for (const f of SOURCES.filter((x) => x.endsWith('.ts'))) {
    const lines = read(f).split('\n');
    lines.forEach((l, i) => {
      if (/^\s*description:\s*['"`]/.test(l)) {
        const near = lines.slice(Math.max(0, i - 3), i + 4).join('\n');
        if (!/descriptionEn\s*:/.test(near)) warn(`${rel(f)}:${i + 1} description without descriptionEn`);
      }
      if (/^\s*name:\s*['"`]/.test(l) && /nameTl\s*:/.test(read(f))) {
        const near = lines.slice(Math.max(0, i - 3), i + 4).join('\n');
        if (!/nameTl\s*:/.test(near) && /descTl\s*:/.test(near)) warn(`${rel(f)}:${i + 1} name without nameTl`);
      }
    });
  }

  console.log(issues ? `${issues} issue(s)` : 'EN/TL text looks consistent');
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function fail(msg) { console.error(msg); process.exit(1); }

const [cmd, ...args] = process.argv.slice(2);
const maxIdx = args.indexOf('--max');
const max = maxIdx >= 0 ? parseInt(args[maxIdx + 1], 10) || 40 : 40;
const term = args.filter((_, i) => maxIdx < 0 || (i !== maxIdx && i !== maxIdx + 1)).join(' ');

if (cmd === 'sources') cmdSources();
else if (cmd === 'sections') cmdSections();
else if (cmd === 'section') { if (!term) fail('usage: section <n|heading>'); cmdSection(term); }
else if (cmd === 'find') { if (!term) fail('usage: find <term> [--max 40]'); cmdFind(term, max); }
else if (cmd === 'entity') { if (!term) fail('usage: entity <name> [--max 40]'); cmdEntity(term, max); }
else if (cmd === 'check') cmdCheck();
else fail('commands: sources | sections | section <n|heading> | find <term> [--max 40] | entity <name> | check');
