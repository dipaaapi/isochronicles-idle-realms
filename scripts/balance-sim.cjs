// Balance simulation: measures real tenant income with a headless DefenderSystem (same harness as the
// logic tests), then models waves 1-100 against it: income per wave vs upgrade costs, and enemy wave
// strength vs establishment tower damage. Prints a Markdown report.
//
//   node scripts/balance-sim.cjs            (all difficulties)
//   node scripts/balance-sim.cjs HARD       (one difficulty)
//
// It is a model, not a replay: combat is reduced to "wave HP vs tower DPS", tenants fighting and
// the Slime/Ent support are left out, and the player is assumed to keep towers levelled on a schedule.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    exports, console, localStorage: { getItem: () => null, setItem() {} }, navigator: undefined,
    require(name) {
      if (name === 'phaser') return { default: { Math: { Clamp: (n, min, max) => Math.max(min, Math.min(max, n)) } } };
      if (name === 'zustand/middleware') return { persist: (fn) => fn, createJSONStorage() {} };
      if (name.includes('soundFx')) return { soundFx: new Proxy({}, { get: () => () => {} }) };
      if (name.includes('storageAdapter')) return {};
      if (name.includes('graphicsFx')) return { markShadow: (o) => o };
      if (name.includes('activityLog')) return new Proxy({}, { get: (_, fn) => (fn === 'resourceName' ? (k) => ({ en: k, tl: k }) : () => undefined) });
      if (name.includes('CharacterSprites')) return new Proxy({}, {
        get: (_, fn) => (/^create|Headroom$/.test(String(fn)) ? () => null : () => {}),
      });
      if (name.startsWith('.') && name.endsWith('.json')) {
        const json = JSON.parse(fs.readFileSync(path.resolve(path.dirname(file), name), 'utf8'));
        return { ...json, default: json };
      }
      return name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : require(name);
    },
  });
  return exports;
}

const { useGameStore: store } = load('src/state/useGameStore.ts');
const { INITIAL_RESOURCES } = load('src/state/store/initialState.ts');
const { DIFFICULTIES } = load('src/state/difficulty.ts');
const { INVADER_CONFIGS } = load('src/types/game.ts');
const defense = load('src/state/defenseStats.ts');
const economy = load('src/state/economy.ts');
const layout = load('src/state/buildingLayout.ts');
const iso = load('src/game/IsometricHelper.ts').IsometricHelper;
const { DefenderSystem } = load('src/game/DefenderSystem.ts');
const ECON = JSON.parse(fs.readFileSync('src/data/economy.json', 'utf8'));
const WAVE_POOL = JSON.parse(fs.readFileSync('src/data/wavePool.json', 'utf8'));
const DEF = JSON.parse(fs.readFileSync('src/data/defenseConfig.json', 'utf8'));
const state = () => store.getState();

const CORE = ['WOOD', 'QUARRY', 'MINE', 'PORT'];
const FIGHT_SECONDS = 60; // assumed fight length for the income cycle
const SPAWN_SECONDS = 2.2; // InvasionManager spawns one invader every 1.8-2.6 s
const CLEANUP_SECONDS = 30; // grace after the last spawn
const WAVE_SECONDS = ECON.invasion.countdownSeconds + FIGHT_SECONDS;
const fmt = (n) => (Math.abs(n) >= 100 ? Math.round(n).toLocaleString('en') : (Math.round(n * 10) / 10).toString());
const costStr = (c) => Object.entries(c).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(', ');

// ── 1. Measured income ────────────────────────────────────────────────────
/** Run the real tenant AI headless for `seconds` with the given establishments standing. */
function measureIncome(built, seconds) {
  state().resetRealm();
  store.setState({
    castleBuilt: true, spireBuilt: true,
    defense: { ...state().defense, castleHp: state().defense.castleMaxHp },
    resourceBuildings: Object.fromEntries(Object.entries(state().resourceBuildings).map(([k, b]) => [k, { ...b, level: built.includes(k) ? 1 : 0 }])),
  });
  const gfx = () => new Proxy({}, { get: () => () => {} });
  const container = (x, y) => ({ x, y, active: true, visible: true, scale: 1,
    setPosition(nx, ny) { this.x = nx; this.y = ny; return this; }, setVisible(v) { this.visible = v; return this; },
    setScale() { return this; }, add() { return this; }, destroy() { this.active = false; } });
  const scene = { add: { container, ellipse: gfx, graphics: gfx }, tweens: { add() {} }, time: { delayedCall() {} } };
  const towers = layout.BUILDING_IDS.filter((id) => built.includes(id)).map((id) => {
    const rect = layout.BUILDING_SITES[id].footprint;
    const c = iso.gridToScreen(rect.x + rect.w / 2, rect.y + rect.h / 2);
    return { id, rect, x: c.x, y: c.y };
  });
  const structures = { getTowers: () => towers, getCastleTarget: () => null };
  const invasion = { getInvaders: () => [], damageInvader() {} };
  const nav = { steer: (_a, _x, _y, tx, ty) => ({ x: tx, y: ty }), pushOut: (x, y) => ({ x, y }), isSolidTile: () => false };
  const sys = new DefenderSystem(scene, { add() {} }, structures, invasion, nav);
  const before = { ...state().resources };
  for (let t = 0; t < seconds * 10; t++) {
    sys.update(100);
    if (t % 10 === 0) state().tickLandmarks(1);
  }
  const perMin = {};
  for (const [k, v] of Object.entries(state().resources)) {
    const d = v - (before[k] ?? 0);
    if (d > 0) perMin[k] = (d / seconds) * 60;
  }
  return perMin;
}

// Warm-up skipped (tenants spawn one every spawnIntervalSeconds), so measure long enough to settle
const incomeCore = measureIncome(CORE, 900);
const incomeAll = measureIncome(layout.BUILDING_IDS, 900);

// ── 2. Wave model ──────────────────────────────────────────────────────────
function avgInvader(wave) {
  const pool = WAVE_POOL.filter((p) => p.fromWave <= wave);
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let hp = 0, dmg = 0, bounty = 0;
  for (const p of pool) {
    const c = INVADER_CONFIGS[p.type];
    hp += (c.hp / total) * p.weight; dmg += (c.damage / total) * p.weight; bounty += (c.bountyCoins / total) * p.weight;
  }
  return { hp, dmg, bounty };
}

/** Wave strength, mirroring InvasionManager.spawnSingleInvader. */
function waveStats(wave, enemyMult) {
  const count = ECON.invasion.baseEnemies + ECON.invasion.enemiesPerWave * (wave - 1);
  const a = avgInvader(wave);
  const climax = [25, 50, 75, 100].includes(wave);
  const boss = wave % 5 === 0 || climax;
  const hpMul = (1 + (wave - 1) * 0.05) * enemyMult;
  const unitHp = (a.hp + (wave - 1) * 18) * hpMul;
  const unitDmg = a.dmg * (1 + (wave - 1) * 0.035) * enemyMult;
  const bossHp = boss ? (INVADER_CONFIGS.HIGH_PRIEST.hp + (wave - 1) * 18) * hpMul * (climax ? 4.5 : 2.5) : 0;
  const totalHp = unitHp * (boss ? count - 1 : count) + bossHp;
  const bounty = a.bounty * (1 + (wave - 1) * 0.04) * (boss ? count - 1 : count) + (boss ? 95 * (climax ? 8 : 3.5) : 0);
  const portalHp = (DEF.portal.hp + DEF.portal.hpPerWave * (wave - 1)) * enemyMult;
  return { count, unitHp, unitDmg, totalHp, bounty, portalHp, boss, climax };
}

/** Effective single-target DPS of a tower (volleys, chains and summons counted as extra hits). */
function towerDps(id, level) {
  const s = defense.towerStats(id, level);
  const hits = Math.max(1, s.volley || 0) * Math.max(1, s.chains ? Math.min(3, s.chains) : 1) * Math.max(1, s.perSummon || 1);
  return (s.damage * hits) / Math.max(0.8, s.cooldown) + (s.burnDps || 0) * 0.5;
}

/**
 * Tenant DPS: 13 crews x 5 tenants, DefenderSystem's 16 dmg per 0.9 s swing, scaled by the
 * Tenant Retaliation research (+25%/level, assumed one level per 5 waves). Only about half the
 * crews reach a given fight, so uptime is 0.5.
 */
function tenantDps(wave) {
  const research = 1 + Math.floor(wave / 5) * 0.25;
  return 13 * 5 * (16 / 0.9) * research * 0.5;
}

/** Assumed tower level at a wave: one level per 15 waves, capped. */
const towerLevelAt = (wave) => Math.min(DEF.towerMaxLevel, 1 + Math.floor(wave / 15));

// ── 3. Report ─────────────────────────────────────────────────────────────
const only = process.argv[2];
const diffs = Object.keys(DIFFICULTIES).filter((d) => !only || d === only.toUpperCase());
const out = [];
const p = (s = '') => out.push(s);

p('# Balance simulation report');
p();
p(`Wave cycle modelled as ${ECON.invasion.countdownSeconds}s countdown + ${FIGHT_SECONDS}s fight = ${WAVE_SECONDS}s.`);
p('Income is measured from the real tenant AI (900 s headless run), plus landmark yields.');
p();
p('## Measured income per minute');
p();
p('| Resource | Core 4 (Wood, Quarry, Mine, Port) | All 13 establishments |');
p('|---|---:|---:|');
for (const k of new Set([...Object.keys(incomeCore), ...Object.keys(incomeAll)])) {
  p(`| ${k} | ${fmt(incomeCore[k] ?? 0)} | ${fmt(incomeAll[k] ?? 0)} |`);
}
p();

// Opening: can the start stockpile pay for castle + spire + the four core establishments?
const opening = [economy.CASTLE_CONSTRUCTION_COST, economy.SPIRE_CONSTRUCTION_COST, ...CORE.map((id) => economy.RESOURCE_BUILDING_CONFIG[id].costs[0])];
const openingTotal = {};
for (const c of opening) for (const [k, v] of Object.entries(c)) openingTotal[k] = (openingTotal[k] ?? 0) + v;

p('## Opening: castle + Crystal Spire + core 4 establishments');
p();
p(`Total cost: ${costStr(openingTotal)}`);
p();
p('| Difficulty | Start stockpile | Shortfall | Shortfall in coins (market buy) |');
p('|---|---|---|---:|');
for (const d of diffs) {
  const mult = DIFFICULTIES[d].startingSupplies ?? 1;
  const start = Object.fromEntries(Object.entries(INITIAL_RESOURCES).map(([k, v]) => [k, Math.round(v * mult)]));
  const short = {};
  let coinsNeeded = 0;
  for (const [k, need] of Object.entries(openingTotal)) {
    const gap = need - (start[k] ?? 0);
    if (gap > 0) {
      short[k] = gap;
      coinsNeeded += k === 'coins' ? gap : gap * (economy.RESOURCE_PRICES[k]?.buy ?? 0);
    }
  }
  p(`| ${d} | ${costStr(start)} | ${costStr(short) || 'none'} | ${fmt(coinsNeeded)} |`);
}
p();

for (const d of diffs) {
  const cfg = DIFFICULTIES[d];
  p(`## ${d}: waves vs defenses`);
  p();
  p(`Every establishment stands, towers at the scheduled level. "Clear time" = wave HP / (tower + tenant DPS), portals excluded. Defenses keep up while clear time < arrival time (${SPAWN_SECONDS}s per invader + ${CLEANUP_SECONDS}s).`);
  p();
  p('| Wave | Enemies | Wave HP | Hit dmg | Tower Lv | Tower DPS | Tenant DPS | Clear time (s) | Bounty |');
  p('|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  const flags = [];
  for (const wave of [1, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 90, 100]) {
    const w = waveStats(wave, cfg.enemyMultiplier);
    const lvl = towerLevelAt(wave);
    const dps = layout.BUILDING_IDS.concat(['SPIRE']).filter((id) => DEF.towers[id]).reduce((s, id) => s + towerDps(id, lvl), 0);
    const tdps = tenantDps(wave);
    const clear = w.totalHp / (dps + tdps);
    const bounty = w.bounty * (cfg.bountyMultiplier ?? 1);
    p(`| ${wave}${w.climax ? ' ★' : w.boss ? ' ☆' : ''} | ${w.count} | ${fmt(w.totalHp)} | ${fmt(w.unitDmg)} | ${lvl} | ${fmt(dps)} | ${fmt(tdps)} | ${fmt(clear)} | ${fmt(bounty)} |`);
    // Invaders arrive one by one, so defenses keep up when they clear the wave before it finishes arriving
    const budget = w.count * SPAWN_SECONDS + CLEANUP_SECONDS;
    if (clear > budget) flags.push(`wave ${wave}: clear time ${fmt(clear)}s exceeds the ${fmt(budget)}s it takes the wave to arrive`);
  }
  p();
  p('☆ boss wave, ★ realm climax boss.');
  if (flags.length) {
    p();
    p('**Pressure points:**');
    for (const f of flags) p(`- ${f}`);
  }
  p();
}

// Upgrade costs vs income: waves of income for the scarcest resource in each cost (no coin conversion)
p('## Upgrade cost in waves of income (bottleneck resource)');
p();
p('Each cell: max over the cost resources of (amount needed / income per wave). Coins income = measured coins + average wave bounty around wave 20 (NORMAL).');
p();
const perWave = Object.fromEntries(Object.entries(incomeAll).map(([k, v]) => [k, v * (WAVE_SECONDS / 60)]));
perWave.coins = (perWave.coins ?? 0) + waveStats(20, 1).bounty;
const wavesFor = (c) => Math.max(0, ...Object.entries(c).filter(([, v]) => v).map(([k, v]) => v / Math.max(0.01, perWave[k] ?? 0)));
p('| Upgrade | Lv2 | Lv3 | Lv4 | Lv5 | Lv10 |');
p('|---|---:|---:|---:|---:|---:|');
const row = (name, costAt) => p(`| ${name} | ${[1, 2, 3, 4, 9].map((l) => { const c = costAt(l); return c ? fmt(wavesFor(c)) : '—'; }).join(' | ')} |`);
row('Castle wall', (l) => defense.castleUpgradeCost('wallLevel', l));
row('Aegis shield', (l) => defense.castleUpgradeCost('shieldLevel', l));
row('Wood Grove tower', (l) => defense.towerUpgradeCost('WOOD', l));
row('Crystal Spire tower', (l) => defense.towerUpgradeCost('SPIRE', l));
row('Research (Slime heal)', (l) => economy.techUpgradeCost('slimeAttackHeal', l));
row('Slime evolution', (l) => (l < ECON.slimeEvolution.maxLevel ? economy.slimeEvolutionCost(l) : null));
p();

const report = out.join('\n');
console.log(report);
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync(path.join('reports', 'balance-report.md'), report + '\n');
