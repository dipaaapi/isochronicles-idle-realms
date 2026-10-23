const assert = require('node:assert/strict');
let savesNow = 0;
let runEnded = false;
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
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8').replace(/import.meta.env.BASE_URL/g, "'/'"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    exports, console, localStorage: { getItem: () => null, setItem() {} },
    require(name) {
      if (name === 'phaser') return { default: { Math: { Clamp: (n, min, max) => Math.max(min, Math.min(max, n)) }, Geom: { Point: class { constructor(x, y) { this.x = x; this.y = y; } } }, BlendModes: { ADD: 1 } } };
      if (name === 'zustand/middleware') return { persist: (fn) => fn, createJSONStorage() {} };
      if (name.includes('soundFx')) return { soundFx: new Proxy({}, { get: () => () => {} }) };
      if (name.includes('storageAdapter')) {
        const kv = new Map();
        return {
          createThrottledStorage: () => undefined, SAVE_KEY: 'test',
          saveNow: async () => { savesNow++; }, endRunSave: async () => { runEnded = true; }, resumeRealmSaves: () => { runEnded = false; },
          localForageStorage: { getItem: async (k) => kv.get(k) ?? null, setItem: async (k, v) => { kv.set(k, v); }, removeItem: async (k) => { kv.delete(k); } },
        };
      }
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
const { WorkerManager } = load('src/game/WorkerManager.ts');
const { IsometricHelper } = load('src/game/IsometricHelper.ts');
const { nextConstruction } = load('src/state/constructionProgress.ts');
const state = () => store.getState();
const nodesBefore = state().dynamicResourceNodes;
state().replenishResourceNode('WOOD', { x: 8, y: 8, qualityMultiplier: 2 });
assert.equal(state().dynamicResourceNodes, nodesBefore, 'unbuilt sites cannot be enriched');
store.setState({ resources: Object.fromEntries(Object.keys(state().resources).map(k => [k, 10000])) });
assert.equal(state().summonUnit('MINOTAUR'), false);
assert.equal(state().summonUnit('MINOTAUR', 'STONE', true), false, 'free summons also wait');
assert.equal(state().summonUnit('TREANT', 'BUILD', true), true, 'builder must remain available');
assert.equal(state().buildCastle(), true);
for (const id of ['WOOD', 'QUARRY', 'MINE']) assert.equal(state().upgradeResourceBuilding(id), true);
const countdown = state().invasion.countdown;
assert.equal(state().upgradeResourceBuilding('PORT'), true);
assert.equal(state().summonUnit('MINOTAUR'), true, 'the castle unlocks recruits');
assert.equal(state().summonUnit('GOLEM'), false, 'the Golem waits for its Golem Foundry');
state().tickInvasionCountdown(1);
assert.equal(state().invasion.countdown, countdown - 1);
state().startInvasion();
assert.equal(state().invasion.isActive, true);

// Run the actual Treant construction routine, without a renderer.
state().resetRealm();
state().summonUnit('TREANT', 'BUILD', true);
const manager = Object.create(WorkerManager.prototype);
manager.spawnHarvestBurst = () => {};
manager.spawnFloatingPopup = () => {};
manager.scene = {};
const castleSite = nextConstruction(state());
assert.equal(castleSite.id, 'CASTLE');
const worker = { container: { ...IsometricHelper.gridToScreen(castleSite.x, castleSite.y), setDepth() {} } };
manager.updateConstruction(worker, state(), 3, 65);
assert.equal(state().castleBuilt, false, 'construction takes time');
manager.updateConstruction(worker, state(), 1, 65);
assert.equal(state().castleBuilt, true, 'Treant automatically completes the castle');
{
  const { INITIAL_RESOURCES } = load('src/state/store/initialState.ts');
  const { CASTLE_CONSTRUCTION_COST } = load('src/state/economy.ts');
  assert.equal(state().resources.wood, INITIAL_RESOURCES.wood - CASTLE_CONSTRUCTION_COST.wood, 'castle supplies are deducted once');
}
const spireSite = nextConstruction(state());
assert.equal(spireSite.id, 'SPIRE', 'the Treant raises the Crystal Spire right after the castle');
Object.assign(worker.container, IsometricHelper.gridToScreen(spireSite.x, spireSite.y));
manager.updateConstruction(worker, state(), 4, 65);
assert.equal(state().spireBuilt, true, 'Treant completes the Crystal Spire');
{
  const { INITIAL_RESOURCES } = load('src/state/store/initialState.ts');
  const { CASTLE_CONSTRUCTION_COST, SPIRE_CONSTRUCTION_COST } = load('src/state/economy.ts');
  assert.equal(state().resources.wood, INITIAL_RESOURCES.wood - CASTLE_CONSTRUCTION_COST.wood - SPIRE_CONSTRUCTION_COST.wood, 'spire supplies are deducted once');
}
assert.equal(manager.updateConstruction(worker, state(), 4, 65), false, 'the Treant builds only the castle and spire');

// Next the Treant summons every General (free founding summon); each General builds its own establishment.
const { updateGeneralSummoning } = load('src/game/workers/treant.ts');
const { updateGeneralConstruction } = load('src/game/workers/generalConstruction.ts');
const tenantWorkConfig = require('../src/data/tenantWork.json');
const economyConfig = require('../src/data/economy.json');
const { nextGeneralToSummon } = load('src/state/constructionProgress.ts');
const { crewGeneralOf } = load('src/state/establishmentCrews.ts');
manager.nexusGridPos = { x: 10, y: 10 };
Object.assign(worker.container, IsometricHelper.gridToScreen(10, 10));
const order = ['WOOD', 'QUARRY', 'MINE', 'PORT', 'CAVE', 'KENNEL', 'PERCH', 'TRENCH', 'CRYPT', 'FOUNDRY', 'PAVILION', 'VOIDGATE', 'OSSUARY'];
const general = (id) => {
  const unit = state().roster.find((u) => u.unitClass === crewGeneralOf(id));
  const site = load('src/state/buildingLayout.ts').BUILDING_SITES[id];
  // Water Generals (Merman, Kraken) build from the water beside their establishment
  const spot = ['MERMAN', 'KRAKEN'].includes(unit.unitClass) && site.waterSpot ? site.waterSpot : site.workSpot;
  return { id: unit.id, name: unit.name, unitClass: unit.unitClass, container: { ...IsometricHelper.gridToScreen(spot.x, spot.y), setDepth() {} } };
};
const savedResources = { ...state().resources };
// The Crystal Spire's General comes first; the Ent already raised its home
{
  const next = nextGeneralToSummon(state());
  assert.equal(next.buildingId, 'SPIRE', 'the Crystal Spire General is summoned first');
  assert.equal(updateGeneralSummoning(manager, worker, state(), 3, 65), true);
  assert.ok(state().roster.some((u) => u.unitClass === crewGeneralOf('SPIRE')), 'Spire General summoned');
}
for (const [i, id] of order.entries()) {
  const next = nextGeneralToSummon(state());
  assert.equal(next.buildingId, id, 'Generals are summoned in construction order');
  assert.equal(updateGeneralSummoning(manager, worker, state(), 3, 65), true);
  assert.ok(state().roster.some((u) => u.unitClass === crewGeneralOf(id)), `${id} General summoned before its home stands`);
  assert.equal(state().resourceBuildings[id].level, 0, 'the Treant does not build establishments');
  assert.equal(nextGeneralToSummon(state()), undefined, 'Treant waits until the newest General builds its home');
  const g = general(id);
  if (i === 0) {
    store.setState({ resources: { ...state().resources, wood: 0, stone: 0, coins: 0 } });
    assert.equal(state().workOnConstruction(id), 'waiting', 'tenants wait for supplies');
    assert.equal(state().resourceBuildings[id].buildStep ?? 0, 0, 'an unpaid step does not advance');
    store.setState({ resources: Object.fromEntries(Object.keys(savedResources).map(k => [k, 10000])) });
  }
  // The General only holds the plot; its tenants build, paying the castle step by step
  assert.equal(updateGeneralConstruction(manager, g, state(), 4, 65), true, 'General holds its unbuilt plot');
  assert.equal(state().resourceBuildings[id].level, 0, 'the General does not build');
  const before = { ...state().resources };
  let result;
  let steps = 0;
  do {
    result = state().workOnConstruction(id);
    steps++;
    if (result === 'progress') assert.equal(state().resourceBuildings[id].level, 0, 'still a site mid-build');
  } while (result === 'progress' && steps < 100);
  assert.equal(result, 'built', `${id} built by its tenants`);
  assert.equal(steps, tenantWorkConfig.buildSteps, 'one paid step per buildSteps');
  for (const [key, amount] of Object.entries(economyConfig.resourceBuildings[id].costs[0])) {
    assert.equal(before[key] - state().resources[key], amount, `${id} construction drains exactly its ${key} cost`);
  }
  assert.equal(state().resourceBuildings[id].level, 1, `${id} stands`);
  assert.equal(updateGeneralConstruction(manager, g, state(), 4, 65), false, 'General resumes duties once home stands');
}
assert.equal(updateGeneralSummoning(manager, worker, state(), 3, 65), false, 'Treant moves on once all Generals stand');
console.log('Construction progression checks passed.');
const beforePurchase = { ...state().resources };
for (const amount of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
  assert.equal(state().buyResource('wood', amount), false);
}
assert.equal(state().resources.coins, beforePurchase.coins, 'invalid purchases must not spend coins');
assert.equal(state().buyResource('wood', 3), true);
assert.equal(state().resources.wood, beforePurchase.wood + 3);
assert.equal(state().resources.coins, beforePurchase.coins - 45);
assert.equal(state().buyResource('wood', Math.floor(state().resources.coins / 15) + 1), false);
console.log('Custom purchase quantity checks passed.');

const preferences = new Set(['language', 'isAudioMuted', 'isGoreEnabled', 'showWallpaper', 'targetFps', 'showFpsDebug', 'showTileCoordinates', 'measuredFps', 'musicLibrary', 'musicIndex', 'musicAutoPlay', 'musicLoop']);
const initial = store.getInitialState();
// Every reset rolls a fresh random layout and coastline, so its seed, coast style (and the node spots it moves) differ by design
const rerolled = new Set(['lastSavedTimestamp', 'layoutSeed', 'coastStyle', 'dynamicResourceNodes']);
const progressionKeys = Object.keys(initial).filter(key =>
  typeof initial[key] !== 'function' && !preferences.has(key) && !rerolled.has(key));
const dirtyProgress = Object.fromEntries(progressionKeys.map(key => {
  const value = initial[key];
  return [key, typeof value === 'number' ? 99 : typeof value === 'boolean' ? !value :
    typeof value === 'string' ? 'changed' : Array.isArray(value) ? ['old progress'] : { oldProgress: true }];
}));
store.setState({ ...dirtyProgress, language: 'TL', targetFps: 30, lastSavedTimestamp: 0 });
state().resetRealm();
for (const key of progressionKeys) {
  assert.equal(JSON.stringify(state()[key]), JSON.stringify(initial[key]), `${key} must return to its new-game value`);
}
assert.equal(state().language, 'TL');
assert.equal(state().targetFps, 30);
assert.ok(state().lastSavedTimestamp > 0, 'reset must not award old offline progress');
assert.ok(state().layoutSeed > 0 && state().layoutSeed !== 99, 'reset rolls a new establishment layout');
console.log('Full realm reset checks passed.');

// Dragon's Lair cave: opens on every 5th repelled wave, closes only when the raid is left
{
  const { VOLCANO_SITE, PORTAL_SITES, isWaterTile } = load('src/state/buildingLayout.ts');
  assert.equal(PORTAL_SITES.length, 3, 'three invasion rifts remain');
  assert.ok(!PORTAL_SITES.some((p) => p.id === 'NORTH'), 'the North Rift became the volcano');
  assert.deepEqual(VOLCANO_SITE.tile, { x: 0, y: 0 });
  assert.equal(isWaterTile(1, 1), false, 'the volcano corner is not ocean');
  store.setState({ lairOpen: false, activeLocation: 'DEMON_REALM', invasion: { ...state().invasion, isActive: true, waveNumber: 4 } });
  state().resolveInvasionVictory(0);
  assert.equal(state().lairOpen, false, 'wave 4 keeps the cave sealed');
  assert.equal(state().enterLair(), false, 'a sealed cave cannot be entered');
  store.setState({ invasion: { ...state().invasion, isActive: true } });
  state().resolveInvasionVictory(0);
  assert.equal(state().lairOpen, true, 'repelling wave 5 opens the cave');
  store.setState({ invasion: { ...state().invasion, isActive: true } });
  state().resolveInvasionVictory(0);
  assert.equal(state().lairOpen, true, 'no timer: the cave stays open through later waves');
  store.setState({ invasion: { ...state().invasion, isActive: true } });
  assert.equal(state().enterLair(), false, 'no entry during a wave');
  store.setState({ invasion: { ...state().invasion, isActive: false } });
  assert.equal(state().enterLair(), false, 'no General, no expedition');
  const slime = state().roster.find((u) => u.unitClass !== 'MINOTAUR');
  store.setState({ roster: [
    ...state().roster,
    { id: 'gen_minotaur', name: 'Minotaur 1', unitClass: 'MINOTAUR', assignedTask: 'IDLE', brawlLevel: 3, brawlAttack: 40, brawlHp: 200 },
    { id: 'tenant_x', name: 'Minotaur', unitClass: 'MINOTAUR', assignedTask: 'IDLE' },
  ] });
  const lair = load('src/state/lairExpedition.ts');
  assert.equal(JSON.stringify(lair.lairPartyOf(state().roster).map((u) => u.id)), JSON.stringify(['gen_minotaur']), 'Generals go; Slime, Treant and tenants stay');
  assert.equal(lair.lairFighters(state()).length, 1 + lair.PARTY.minionsPerGeneral, 'each General brings its minions');
  assert.equal(state().enterLair(), true);
  assert.equal(state().activeLocation, 'DRAGONS_LAIR');
  const minotaur = state().roster.find((u) => u.id === 'gen_minotaur');
  assert.equal(minotaur.brawlLevel, 0, 'entry wipes the brawl + for good');
  assert.equal(minotaur.brawlAttack, 0);
  assert.equal(minotaur.brawlHp, 0);
  assert.ok(slime, 'the Slime is still home');
  // Checkpoints and obstacles
  state().reachLairCheckpoint(2);
  state().reachLairCheckpoint(1);
  assert.equal(state().lairProgress.checkpoint, 2, 'checkpoints only move forward');
  state().clearLairObstacle('BRIDGE_A');
  state().clearLairObstacle('ROCKFALL_GALLERY_A');
  assert.equal(JSON.stringify(state().lairProgress.cleared), JSON.stringify(['BRIDGE_A']), 'only bridges and gates stay solved');
  assert.equal(JSON.stringify(lair.normalizeLairProgress({ checkpoint: 99, cleared: ['NOPE', 'GOLEM_GATE', 'GOLEM_GATE'] })), JSON.stringify({ checkpoint: lair.CHECKPOINTS.length - 1, cleared: ['GOLEM_GATE'] }));
  // Route sanity: with every bridge and gate solved, the static route is passable end to end
  const all = [...lair.CLEARABLE];
  const { nextStep } = load('src/game/lair/lairNav.ts');
  let pos = { x: 4, y: 0 };
  for (let i = 0; i < 400 && pos.y < lair.LAIR_CONFIG.route.stopY; i++) {
    const n = nextStep(pos.x, pos.y, 4, lair.LAIR_CONFIG.route.stopY, (x, y) => lair.isStaticBlocked(x, y, all));
    assert.ok(n, `route blocked at ${pos.x},${pos.y}`);
    pos = n;
  }
  assert.equal(lair.blockingRow([]), 32, 'the first broken bridge holds the party');
  assert.equal(lair.blockingRow(all), lair.LAIR_CONFIG.route.stopY);
  // Headless expedition: a fake scene, then simulated time until the party stands at the chamber
  store.setState({
    lairProgress: { checkpoint: 0, cleared: [] },
    // The full party: every General (42 members with minions) must still get through the narrow bridges
    roster: [...state().roster, ...['GOLEM', 'LAVA_GARGOYLE', 'SUCCUBUS', 'MERMAN', 'NECROMANCER', 'KRAKEN', 'DEMON_HOUND', 'HARPY', 'DRYAD', 'EMBER_IMP', 'VOID_WRAITH', 'BONE_KNIGHT', 'PRISM_WARDEN']
      .map((c, i) => ({ id: `gen_${i}`, name: c, unitClass: c, assignedTask: 'IDLE' }))],
  });
  const chain = () => new Proxy(function () {}, { get: (_, k) => (k === 'x' || k === 'y' || k === 'scaleX' ? 0 : chain()), apply: () => chain() });
  const fakeScene = { add: chain(), tweens: chain() };
  const { LairExpedition } = load('src/game/lair/LairExpedition.ts');
  const { useLairHud } = load('src/game/lair/lairHud.ts');
  const expedition = new LairExpedition(fakeScene);
  let simSeconds = 0;
  assert.equal(state().dragon.generation, 1, 'the first opening woke Ignara');
  let chamberAt = 0;
  let lowestHp = Infinity;
  const coinsBefore = state().resources.coins;
  while (state().activeLocation === 'DRAGONS_LAIR' && simSeconds < 3000) {
    expedition.update(100);
    simSeconds += 0.1;
    if (!chamberAt && useLairHud.getState().battle) {
      chamberAt = simSeconds;
      assert.equal(state().lairProgress.checkpoint, lair.regionIndexAt(lair.LAIR_CONFIG.route.stopY - 1), 'every checkpoint on the way is saved');
      assert.equal(JSON.stringify([...state().lairProgress.cleared].sort()), JSON.stringify([...lair.CLEARABLE].sort()), 'bridges repaired, packs beaten and the gate opened');
      assert.ok(state().dragon.maxHp > 0 && state().dragon.hp > 0.9 * state().dragon.maxHp, 'Ignara is sized when her battle starts');
      assert.ok(useLairHud.getState().humans > 0, 'the human expedition arrives');
    }
    if (state().dragon.maxHp > 0) {
      assert.ok(state().dragon.hp <= lowestHp, 'Ignara never heals');
      lowestHp = state().dragon.hp;
    }
  }
  assert.ok(chamberAt > 0, `the party reaches the chamber (front ${useLairHud.getState().frontY.toFixed(1)}, cleared ${state().lairProgress.cleared})`);
  assert.equal(state().activeLocation, 'DEMON_REALM', `Ignara falls and the party returns (her hp ${state().dragon.hp}/${state().dragon.maxHp})`);
  assert.equal(state().dragon.slain, true);
  assert.equal(state().dragonsSlain, 1, 'the kill is recorded in the save');
  assert.equal(state().lairOpen, false, 'her death seals the cave');
  assert.ok(state().resources.coins > coinsBefore, 'the hoard pays out');
  console.log(`  expedition sim: ${lair.lairFighters(state()).length} members, chamber at ${Math.round(chamberAt)}s, Ignara slain at ${Math.round(simSeconds)}s`);
  // The cave reopens on the next 5th wave with a new generation
  store.setState({ invasion: { ...state().invasion, isActive: true, waveNumber: 10 } });
  state().resolveInvasionVictory(0);
  assert.equal(state().lairOpen, true);
  assert.equal(state().dragon.generation, 2, 'a new Ignara claims the lair');
  assert.equal(state().dragon.slain, false);
  state().enterLair();
  state().leaveLair();
  assert.equal(state().activeLocation, 'DEMON_REALM');
  assert.equal(state().lairOpen, false, 'leaving the raid seals the cave');
  assert.equal(state().lairProgress.checkpoint, 0, 'leaving the raid resets its progress');
  // Volcanic magma: flows while Ignara lives, burns units on ACTIVE tiles, cools, and turns flooded shore back to land
  {
    const layout = load('src/state/buildingLayout.ts');
    const { VolcanicMagma } = load('src/game/scene/volcanicMagma.ts');
    let burned = 0;
    const fakeWorker = { hp: 100, container: { active: true, x: 0, y: 0 }, name: 'Golem 1', unitClass: 'GOLEM' };
    const magmaSys = new VolcanicMagma(
      { add: chain() }, { add() {} }, { erupt() {} },
      { hurtWorkerFromRift: (w, n) => { burned += n; }, getInvaders: () => [], damageInvader() {} },
      { getWorkers: () => [fakeWorker] },
      { getDefenders: () => [], hurtFromHazard() {} },
      () => [],
    );
    store.setState({ volcanicMagma: {}, dragon: { generation: 2, hp: 100, maxHp: 100, slain: false }, activeLocation: 'DEMON_REALM' });
    for (let i = 0; i < 2000 && Object.keys(state().volcanicMagma).length === 0; i++) magmaSys.update(100);
    const tiles = Object.keys(state().volcanicMagma);
    assert.ok(tiles.length > 0, 'the volcano spills magma while Ignara lives');
    for (const k of tiles) {
      const [x, y] = k.split(',').map(Number);
      assert.ok(!layout.isProtectedTile(x, y) && !layout.isVolcanoTile(x, y), `magma never covers protected tiles (${k})`);
    }
    // A unit standing on ACTIVE magma burns (time-based)
    const [bx, by] = tiles[0].split(',').map(Number);
    const IsoH = load('src/game/IsometricHelper.ts').IsometricHelper;
    const w = IsoH.gridToScreen(bx, by);
    fakeWorker.container.x = w.x; fakeWorker.container.y = w.y;
    burned = 0;
    for (let i = 0; i < 10; i++) magmaSys.update(100);
    assert.ok(Math.abs(burned - lair.MAGMA_FLOW.dps) < lair.MAGMA_FLOW.dps * 0.15, `a second on magma burns about dps (${burned.toFixed(1)})`);
    // Cooling: flooded shore under the magma becomes land again
    const flooded = tiles[0];
    store.setState({ terrainFlooded: [flooded], terrainFilled: [], terrainReclamation: null });
    state().coolVolcanicMagma(lair.MAGMA_FLOW.activeSeconds + lair.MAGMA_FLOW.crustSeconds + lair.MAGMA_FLOW.basaltSeconds + 1);
    assert.equal(Object.keys(state().volcanicMagma).length, 0, 'every stage cools away');
    assert.ok(state().terrainFilled.includes(flooded) && !state().terrainFlooded.includes(flooded), 'cooled basalt restores flooded land');
    // Slain: no new flows
    store.setState({ volcanicMagma: {}, dragon: { generation: 2, hp: 0, maxHp: 100, slain: true } });
    for (let i = 0; i < 3000; i++) magmaSys.update(100);
    assert.equal(Object.keys(state().volcanicMagma).length, 0, 'no magma once Ignara is slain');
    assert.equal(JSON.stringify(lair.normalizeMagma({ '1,1': { stage: 'ACTIVE', left: 5 }, '99,1': { stage: 'ACTIVE', left: 5 }, '2,2': { stage: 'LAVA' } }, layout.GRID_SIZE)), JSON.stringify({ '1,1': { stage: 'ACTIVE', left: 5 } }), 'saved magma is validated');
    console.log('  volcanic magma: flows, burns, cools and restores land');
  }
  console.log("Dragon's Lair cave checks passed.");
}

// Store refactor regressions: late-game resources, Treant links, breach roster, skill trigger.
state().resetRealm();
store.setState({ resources: { ...state().resources, metal: 5 } });
assert.equal(state().spendResources({ metal: 6 }), false, 'metal cannot go negative');
assert.equal(state().spendResources({ metal: 5 }), true);
assert.equal(state().resources.metal, 0);
store.setState({ resources: Object.fromEntries(Object.keys(state().resources).map(k => [k, 10000])) });
state().summonUnit('TREANT', 'BUILD', true);
state().buildCastle();
state().upgradeResourceBuilding('WOOD');
assert.equal(state().summonUnit('TREANT', 'BUILD', true), false, 'the realm has a single Treant');
assert.equal(state().roster.filter(u => u.unitClass === 'TREANT').length, 1);
assert.equal('entAssignments' in state(), false, 'Treant caretaker links are gone');
const saved = state().exportSave();
assert.equal('entAssignments' in JSON.parse(saved), false);
assert.equal(state().importSave(saved), true);
assert.equal(state().triggerEstablishmentSkill('WOOD', 0), true, 'establishment skills trigger in-browser (no require)');
assert.ok(state().establishmentSkillCooldowns.WOOD.skill1 > 0);
store.setState({ roster: state().roster.map(u => u.unitClass === 'AQUA_SLIME' ? { ...u, slimeEvolutionLevel: 3 } : u) });
// Permadeath: a fallen castle ends the run (Hall of Legacy) and leaves an unsaved, ruined realm
state().beginRun('Test Lord');
const fallenRun = state().runId;
store.setState({ invasion: { ...state().invasion, waveNumber: 42, invasionsRepelled: 41 } });
state().resolveCastleBreach();
assert.ok(runEnded, 'game over deletes the realm save');
assert.equal(state().gameOverRun.runId, fallenRun, 'the fallen run is shown on the Game Over screen');
assert.equal(state().gameOverRun.lord, 'Test Lord');
assert.equal(state().gameOverRun.wavesCleared, 41);
assert.equal(state().castleBuilt, false, 'the realm is gone');
assert.equal(state().invasion.waveNumber, 1);
assert.equal(state().roster.length, 1, 'only the Slime remains');
state().beginRun('Next Lord');
assert.ok(!runEnded, 'a new run saves again');
assert.notEqual(state().runId, fallenRun, 'a new run gets a new id');
assert.equal(state().gameOverRun, null);
state().resetRealm();
// A new realm's Slime must not spend the castle supplies on evolutions (soft-lock)
{
  const { autoSummon } = load('src/game/workers/supportSlime.ts');
  state().resetRealm();
  state().summonUnit('TREANT', 'BUILD', true);
  const ctx = { getWorkers: () => [], spawnHarvestBurst() {}, spawnFloatingPopup() {} };
  const slime = { container: { x: 0, y: 0 }, autoSummonTimer: 0 };
  autoSummon(ctx, slime, 1);
  assert.equal(state().roster.find(u => u.unitClass === 'TREANT').treantEvolutionLevel, 1, 'no auto-evolve before construction');
  assert.equal(state().buildCastle(), true, 'the starting supplies still build the castle');
  state().resetRealm();
}
console.log('Store slice regression checks passed.');

const { InvasionManager } = load('src/game/InvasionManager.ts');
const { INVADER_CONFIGS } = load('src/types/game.ts');
const { normalizeDifficulty, DIFFICULTIES } = load('src/state/difficulty.ts');
assert.equal(normalizeDifficulty(undefined), 'NORMAL', 'old saves use normal difficulty');
assert.equal(normalizeDifficulty('invalid'), 'NORMAL');
const display = (x = 0, y = 0) => ({ x, y, setDepth() {}, add() {}, setSize() {}, setInteractive() {}, on() {} });
const { WAVE_BALANCE } = load('src/state/waveBalance.ts');
for (const difficulty of Object.keys(DIFFICULTIES)) {
  const curve = WAVE_BALANCE.difficulty[difficulty];
  assert.equal(DIFFICULTIES[difficulty].enemyMultiplier, curve.hp, 'intro multiplier mirrors waveBalance.json');
  store.setState({ difficulty, invasion: { ...initial.invasion, isActive: true, totalEnemiesInWave: 6 } });
  const invasionManager = new InvasionManager({ add: { graphics: display, container: display, ellipse: display } }, { findPath: () => null });
  invasionManager.renderInvaderBody = () => {};
  invasionManager.renderHpBar = () => {};
  invasionManager.spawnSingleInvader(1);
  const enemy = invasionManager.getInvaders()[0];
  assert.equal(enemy.maxHp, Math.round(INVADER_CONFIGS[enemy.type].hp * curve.hp));
  assert.equal(enemy.damage, Math.round(INVADER_CONFIGS[enemy.type].damage * curve.damage));
  assert.equal(JSON.parse(state().exportSave()).difficulty, difficulty);
}
state().resetRealm();
assert.equal(state().difficulty, 'NORMAL');
console.log('Difficulty combat, export and reset checks passed.');

const { teamBonuses, normalizeSkillProgress, earnedSkillPoints } = load('src/state/skillTree.ts');
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} expected ${b}, got ${a}`);
// Endless waves: wave 100 is not the end, the biome stays the player's choice
{
  const wb = load('src/state/waveBalance.ts');
  store.setState({ platformPhase: 2, realmChoice: 2, invasion: { ...initial.invasion, waveNumber: 100, invasionsRepelled: 99, isActive: true } });
  state().resolveInvasionVictory(0);
  assert.equal(state().invasion.waveNumber, 101, 'waves continue past 100');
  assert.equal(state().platformPhase, 2, 'waves no longer change the biome');
  assert.ok(savesNow > 0, 'the realm is saved after every wave');
  assert.ok(wb.realmMultiplier(130) > wb.realmMultiplier(100), 'invaders keep hardening after wave 100');
  assert.ok(wb.isClimaxWave(125), 'every 25th wave is a climax');
  assert.ok(wb.scaledEnemyCount(40, 'HARD', 2, 5000) <= 220, 'enemy count is capped');
  near(wb.realmIntensity(10, 4).hp, 1, 'the biome does not change wave strength');
  state().setRealmChoice(3);
  assert.equal(state().platformPhase, 3, 'Settings can switch the biome');
  state().resetRealm();
}

// Skill points come from clearing wave sets
assert.equal(earnedSkillPoints(4), 0);
assert.equal(earnedSkillPoints(5), 3);
assert.equal(earnedSkillPoints(250), 150, 'skill points keep coming (endless waves)');
assert.equal(state().learnSkill('MINION_MIGHT'), false, 'no points before the first wave set');
store.setState({ invasion: { ...state().invasion, invasionsRepelled: 4, waveNumber: 5, isActive: true } });
state().resolveInvasionVictory(0);
assert.equal(state().skillPoints, 3, 'clearing wave 5 grants 3 points');
assert.equal(state().learnSkill('MINION_HASTE'), false, 'prerequisites must be enforced');
assert.equal(state().learnSkill('MINION_MIGHT'), true);
assert.equal(state().learnSkill('MINION_MIGHT'), true, 'skills have ranks');
assert.equal(state().learnSkill('MINION_MIGHT'), true);
assert.equal(state().skillRanks.MINION_MIGHT, 3);
assert.equal(state().learnSkill('CASTLE_ARMOR'), false, 'cannot spend unavailable points');
assert.equal(state().skillPoints, 0);
near(teamBonuses(state()).attack, 1 + 0.24);
state().resetSkills();
assert.equal(state().skillPoints, 3, 'free respec refunds every point');
assert.equal(state().learnSkill('CASTLE_ARMOR'), true);
assert.equal(state().learnSkill('CASTLE_ARMOR'), true);
store.setState({ castleBuilt: true, defense: { ...state().defense, castleHp: 800, shieldHp: 0 } });
state().damageCastle(100);
assert.equal(state().defense.castleHp, 710, 'two ranks of armor reduce castle damage by 10%');
store.setState({ invasion: { ...state().invasion, invasionsRepelled: 19, waveNumber: 20, isActive: true } });
state().resolveInvasionVictory(0);
assert.equal(state().skillPoints, 10, '20 waves cleared = 12 points, 2 spent');
assert.equal(state().learnSkill('CASTLE_TURRETS'), true);
const { towerStats } = load('src/state/defenseStats.ts');
assert.ok(towerStats('QUARRY', 1, teamBonuses(state()).turret).damage > towerStats('QUARRY', 1).damage, 'artillery boosts establishment towers');
assert.equal(state().learnSkill('CASTLE_SIEGECRAFT'), true);
assert.equal(state().learnSkill('CASTLE_BASTION'), true);
store.setState({ defense: { ...state().defense, castleHp: 100 }, invasion: { ...state().invasion, isActive: true } });
state().resolveInvasionVictory(0);
assert.equal(state().defense.castleHp, 100 + Math.round(state().defense.castleMaxHp * 0.1), 'Mending Stones heals the citadel after a wave');
const skillSave = state().exportSave();
state().resetRealm();
assert.equal(state().skillPoints, 0);
assert.equal(Object.keys(state().skillRanks).length, 0);
assert.equal(state().importSave(skillSave), true);
assert.equal(state().skillRanks.CASTLE_ARMOR, 2, 'skill ranks survive export/import');
assert.equal(state().skillPoints, 7, "12 earned, 5 spent");
assert.equal(normalizeSkillProgress({ regressionCount: 3, unlockedSkills: ['MINION_MIGHT'] }).skillPoints, 0, 'old point-tree saves are not carried over');
assert.equal(normalizeSkillProgress({ skillRanks: { MINION_MIGHT: 3, MINION_HASTE: 1 }, invasion: { invasionsRepelled: 5 } }).skillPoints, 3, 'overspent saves are refunded');
assert.equal(normalizeSkillProgress({ skillRanks: { MINION_HASTE: 1, bogus: 2 }, invasion: { invasionsRepelled: 10 } }).skillPoints, 6);
near(teamBonuses({}).attack, 1);
console.log('Endless waves, permadeath, skill tree, combat and save checks passed.');

// ── Establishment towers, citadel beacon, portals and obstacles ─────────────
{
  const defense = load('src/state/defenseStats.ts');
  const layout = load('src/state/buildingLayout.ts');
  const { Navigation } = load('src/game/Navigation.ts');
  const { PathfindingService } = load('src/game/PathfindingService.ts');
  const rich = () => store.setState({ resources: Object.fromEntries(Object.keys(state().resources).map(k => [k, 100000])) });

  state().resetRealm();
  rich();
  state().summonUnit('TREANT', 'BUILD', true);
  assert.equal(state().buildCastle(), true);
  for (const id of layout.BUILDING_IDS) assert.equal(state().upgradeResourceBuilding(id), true);
  for (const id of layout.BUILDING_IDS) {
    const b = state().resourceBuildings[id];
    assert.equal(b.towerLevel, 1, `${id} starts at tower level 1`);
    assert.equal(b.hp, defense.buildingMaxHp(1), `${id} starts at full HP`);
  }

  // Each base establishment has a distinct weapon (landmarks reuse these with their own stats)
  assert.deepEqual(['WOOD', 'QUARRY', 'MINE', 'PORT', 'CAVE'].map((id) => defense.towerStats(id, 1).attack).sort(),
    ['catapult', 'flamethrower', 'iceStorm', 'saplings', 'spikes']);
  assert.equal(defense.towerStats('WOOD', 1).charges, 5, 'the grove summons five times per wave');
  assert.ok(defense.towerStats('MINE', 5).volley > defense.towerStats('MINE', 1).volley, 'higher towers fire more spikes');
  assert.ok(defense.towerStats('QUARRY', 3).cooldown < defense.towerStats('QUARRY', 1).cooldown);

  // Tower upgrades spend secondary resources and raise max HP
  const coalBefore = state().resources.coal;
  assert.equal(state().upgradeTower('MINE'), true);
  assert.equal(state().upgradeTower('MINE'), true);
  assert.equal(state().resourceBuildings.MINE.towerLevel, 3);
  assert.ok(state().resources.coal < coalBefore, 'mine tower level 3 costs coal');
  assert.equal(state().resourceBuildings.MINE.hp, defense.buildingMaxHp(3));
  for (let i = 0; i < 5; i++) state().upgradeTower('MINE');
  assert.equal(state().resourceBuildings.MINE.towerLevel, defense.TOWER_MAX_LEVEL, 'tower levels cap');
  assert.equal(state().upgradeTower('MINE'), false);

  // Wrecking, repairing and wave-end recovery
  assert.equal(state().damageBuilding('QUARRY', 50), false);
  assert.equal(state().resourceBuildings.QUARRY.hp, defense.buildingMaxHp(1) - 50);
  assert.equal(state().damageBuilding('QUARRY', 99999), true, 'the killing blow reports a wreck');
  assert.equal(defense.isBuildingOperational(state().resourceBuildings.QUARRY), false, 'wrecked establishments stop working');
  assert.equal(state().damageBuilding('QUARRY', 10), false, 'a wreck cannot be hit again');
  state().resolveInvasionVictory(0);
  assert.equal(state().resourceBuildings.QUARRY.hp, Math.round(defense.buildingMaxHp(1) * 0.25), 'wrecks recover 25% when a wave ends');
  assert.equal(state().repairBuilding('QUARRY'), true);
  assert.equal(state().resourceBuildings.QUARRY.hp, Math.round(defense.buildingMaxHp(1) * 0.75));
  assert.equal(state().restoreBuildingHp('QUARRY', 99999), defense.buildingMaxHp(1) - Math.round(defense.buildingMaxHp(1) * 0.75));
  assert.equal(state().repairBuilding('QUARRY'), false, 'nothing to repair at full HP');

  // The Crystal Spire is a tower too: it fights, levels up, gets wrecked and repaired
  assert.equal(defense.towerStats('SPIRE', 1).attack, 'aetherArc');
  assert.ok(defense.towerStats('SPIRE', 5).chains > defense.towerStats('SPIRE', 1).chains, 'higher spires chain further');
  assert.equal(state().upgradeTower('SPIRE'), false, 'an unbuilt spire cannot be upgraded');
  assert.equal(state().buildSpire(), true);
  assert.equal(state().spireTower.towerLevel, 1);
  assert.equal(state().spireTower.hp, defense.buildingMaxHp(1), 'a new spire starts at full HP');
  const shardsBefore = state().resources.aetherShards;
  assert.equal(state().upgradeTower('SPIRE'), true);
  assert.equal(state().spireTower.towerLevel, 2);
  assert.ok(state().resources.aetherShards < shardsBefore, 'spire upgrades cost aether');
  assert.equal(state().spireTower.hp, defense.buildingMaxHp(2), 'upgrades raise the spire max HP');
  assert.equal(state().damageBuilding('SPIRE', 99999), true, 'the spire can be wrecked');
  assert.equal(defense.isSpireOperational(state()), false, 'a wrecked spire grows no aether');
  state().resolveInvasionVictory(0);
  assert.equal(state().spireTower.hp, Math.round(defense.buildingMaxHp(2) * 0.25), 'the spire recovers 25% when a wave ends');
  assert.equal(state().repairBuilding('SPIRE'), true);
  assert.equal(defense.isSpireOperational(state()), true);
  const spireSave = JSON.parse(state().exportSave());
  delete spireSave.spireTower;
  assert.equal(state().importSave(JSON.stringify(spireSave)), true);
  assert.equal(state().spireTower.towerLevel, 1, 'old saves get a level 1 spire');
  assert.equal(state().spireTower.hp, defense.buildingMaxHp(1), 'old saves get a full-HP spire');

  // Citadel: no turret any more — the Provoke Beacon grows instead
  const beacon1 = defense.beaconStats(1);
  assert.equal(state().upgradeDefense('beaconLevel'), true);
  assert.equal(state().defense.beaconLevel, 2);
  const beacon2 = defense.beaconStats(2);
  assert.ok(beacon2.radiusTiles > beacon1.radiusTiles && beacon2.interval < beacon1.interval && beacon2.duration > beacon1.duration);
  assert.equal('turretLevel' in state().defense, false);
  assert.ok(defense.castleUpgradeCost('wallLevel', 3).metal > 0, 'later wall levels need metal');
  assert.equal(defense.castleUpgradeCost('wallLevel', 1).metal, undefined);

  // Old saves: turret level becomes the beacon level, the Mystic Cave slot is added
  const oldSave = JSON.parse(state().exportSave());
  oldSave.defense = { ...oldSave.defense, turretLevel: 4 };
  delete oldSave.defense.beaconLevel;
  oldSave.resourceBuildings = { WOOD: { level: 1, unlockedOutputs: ['wood'] }, MINE: { level: 2, unlockedOutputs: ['metal', 'coal'] }, QUARRY: { level: 1, unlockedOutputs: ['stone'] }, PORT: { level: 1, unlockedOutputs: ['water'] } };
  assert.equal(state().importSave(JSON.stringify(oldSave)), true);
  assert.equal(state().defense.beaconLevel, 4);
  assert.equal(state().resourceBuildings.CAVE.level, 0);
  assert.equal(state().resourceBuildings.MINE.towerLevel, 1);
  assert.equal(state().resourceBuildings.MINE.hp, defense.buildingMaxHp(1));

  // Portals scale with the wave and pay a bounty
  assert.ok(defense.portalMaxHp(20) > defense.portalMaxHp(1));
  assert.ok(defense.portalBounty(10).coins > defense.portalBounty(1).coins);

  // Layout: 30×30 platform, citadel at the centre, establishments placed randomly per seed.
  // For many seeds: every footprint is on land, none overlap, work spots are free and reachable.
  const N = layout.GRID_SIZE;
  assert.equal(N, 30, 'the platform is 30×30');
  const castleCenter = layout.rectCenter(layout.CASTLE_FOOTPRINT);
  assert.equal(JSON.stringify(castleCenter), JSON.stringify({ x: N / 2, y: N / 2 }), 'the citadel stands at the centre');
  const { PathfindingService: PF } = { PathfindingService };
  const checkLayout = (seed) => {
    layout.applyLayoutSeed(seed);
    const rects = [layout.CASTLE_FOOTPRINT, layout.SPIRE_FOOTPRINT, ...layout.BUILDING_IDS.map((id) => layout.BUILDING_SITES[id].footprint)];
    const taken = new Set();
    for (const r of rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      assert.ok(layout.isLandTile(x, y), `seed ${seed}: footprints stay on land`);
      assert.ok(!taken.has(`${x},${y}`), `seed ${seed}: footprints overlap at ${x},${y}`);
      taken.add(`${x},${y}`);
    }
    for (const id of layout.BUILDING_IDS) assert.equal(layout.BUILDING_SITES[id].footprint.w * layout.BUILDING_SITES[id].footprint.h, 4);
    const spots = [layout.CASTLE_GATE, layout.SPIRE_WORK_SPOT, ...layout.BUILDING_IDS.map((id) => layout.BUILDING_SITES[id].workSpot), ...layout.PORTAL_SITES.map((p) => p.exit)];
    for (const s of spots) assert.ok(!taken.has(`${s.x},${s.y}`) && (layout.isLandTile(s.x, s.y) || layout.isBridgeTile(s.x, s.y)), `seed ${seed}: work spot ${s.x},${s.y} is walkable land`);
    const pf = new PF();
    const base = Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => (layout.isBridgeTile(x, y) ? 3 : layout.isLandTile(x, y) ? 0 : 1)));
    for (const p of layout.PORTAL_SITES) base[p.tile.y][p.tile.x] = 0;
    const nav = new Navigation(pf, base);
    nav.setSolids([
      { id: 'CASTLE', rect: layout.CASTLE_FOOTPRINT }, { id: 'SPIRE', rect: layout.SPIRE_FOOTPRINT },
      ...layout.BUILDING_IDS.map((id) => ({ id, rect: layout.BUILDING_SITES[id].footprint })),
      ...layout.PORTAL_SITES.map((p) => ({ id: p.id, rect: { ...p.tile, w: 1, h: 1 } })),
    ]);
    const gate = layout.CASTLE_GATE;
    for (const s of spots) {
      // Land units cross the canals only on bridges
      const route = pf.findPath(gate.x, gate.y, s.x, s.y, [0, 3]);
      assert.ok(route, `seed ${seed}: ${s.x},${s.y} is reachable from the gate`);
      assert.ok(route.every((t) => !taken.has(`${t.x},${t.y}`)), 'paths never cross a footprint');
    }
    for (const p of layout.PORTAL_SITES) {
      const route = nav.pathToRect(p.exit, layout.CASTLE_FOOTPRINT, [0, 3]);
      assert.ok(route && route.length > 1, `seed ${seed}: invaders from ${p.id} can reach the citadel walls`);
    }
    for (const r of layout.ROAD_TILES) assert.ok(!taken.has(`${r.x},${r.y}`), 'roads never pave a footprint');
    // Canals: four, each from the ocean to a dock against the citadel wall; water crews' homes touch water
    assert.equal(layout.CANALS.length, 4, 'four canals');
    for (const c of layout.CANALS) {
      assert.ok(c.tiles.every((t) => layout.isCanalTile(t.x, t.y) && !layout.isLandTile(t.x, t.y)), 'canal tiles are water');
      const d = c.dock;
      const f = layout.CASTLE_FOOTPRINT;
      assert.ok((d.x >= f.x - 1 && d.x <= f.x + f.w) && (d.y >= f.y - 1 && d.y <= f.y + f.h), `${c.dir} canal ends at the citadel wall`);
      assert.ok(layout.isBridgeTile(d.x, d.y), `${c.dir} dock carries the ring road as a bridge`);
    }
    for (const id of layout.WATER_ESTABLISHMENTS) assert.ok(layout.BUILDING_SITES[id].waterSpot, `seed ${seed}: ${id} sits against water`);
    return nav;
  };
  const layoutsSeen = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    checkLayout(seed);
    layoutsSeen.add(JSON.stringify(layout.BUILDING_SITES));
  }
  assert.ok(layoutsSeen.size > 250, 'establishment placement varies between realms');
  // Every coastline style keeps the same guarantees (land footprints, reachable spots)
  for (const style of ['NONE', 'CALM', 'WILD']) {
    layout.setCoastStyle(style);
    for (let seed = 1; seed <= 120; seed++) checkLayout(seed);
  }
  layout.setCoastStyle('BAYS');
  layout.applyLayoutSeed(1);
  const coves = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (layout.isCoveTile(x, y)) coves.push(`${x},${y}`);
  assert.ok(coves.length > 10, 'Winding Bays carves coves into the rim');
  layout.applyLayoutSeed(7);
  const first = JSON.stringify(layout.BUILDING_SITES);
  layout.applyLayoutSeed(8);
  layout.applyLayoutSeed(7);
  assert.equal(JSON.stringify(layout.BUILDING_SITES), first, 'a seed always yields the same layout');

  // Node spots / task locations follow the applied layout (shared objects)
  const { TASK_NODE_LOCATIONS } = load('src/types/game.ts');
  assert.equal(JSON.stringify(TASK_NODE_LOCATIONS.STONE), JSON.stringify(layout.BUILDING_SITES.QUARRY.workSpot));

  // The realm's seed survives save export/import and switches the layout
  const nav = checkLayout(state().layoutSeed);
  const saveWithSeed = JSON.parse(state().exportSave());
  saveWithSeed.layoutSeed = 12345;
  assert.equal(state().importSave(JSON.stringify(saveWithSeed)), true);
  assert.equal(state().layoutSeed, 12345);
  assert.equal(layout.getLayoutSeed(), 12345);
  assert.equal(JSON.stringify({ x: state().dynamicResourceNodes.WOOD.x, y: state().dynamicResourceNodes.WOOD.y }), JSON.stringify(layout.BUILDING_SITES.WOOD.workSpot));
  const seedBefore = state().layoutSeed;
  state().resetRealm();
  assert.notEqual(state().layoutSeed, seedBefore, 'a new realm rolls a new layout');
  checkLayout(state().layoutSeed);

  // Navigation: solids push walkers out and block line of sight
  const center = IsometricHelper.gridToScreen(castleCenter.x, castleCenter.y);
  const pushed = nav.pushOut(center.x, center.y);
  const g = Navigation.toGrid(pushed.x, pushed.y);
  assert.ok(!nav.solidAt(g.x, g.y), 'units inside the citadel are pushed out');
  const inside = Navigation.toGrid(center.x, center.y);
  assert.ok(Math.abs(inside.x - castleCenter.x) < 1e-9 && Math.abs(inside.y - castleCenter.y) < 1e-9, 'toGrid inverts gridToScreen');
  const row = layout.CASTLE_FOOTPRINT.y + layout.CASTLE_FOOTPRINT.h - 1;
  const a = IsometricHelper.gridToScreen(layout.CASTLE_FOOTPRINT.x - 2, row);
  const b = IsometricHelper.gridToScreen(layout.CASTLE_FOOTPRINT.x + layout.CASTLE_FOOTPRINT.w + 1, row);
  assert.equal(nav.hasLineOfSight(a.x, a.y, b.x, b.y), false, 'the citadel blocks line of sight');
  console.log('Tower, beacon, portal, save-migration and obstacle checks passed.');
}

// Establishment crews: one General per establishment, tenants share its kind, gather/expedition yields are real resources
{
  const crews = load('src/state/establishmentCrews.ts');
  const { UNIT_CLASSES } = load('src/data/units.ts');
  const { BUILDING_IDS } = load('src/state/buildingLayout.ts');
  const { generalOf } = load('src/state/store/rosterSlice.ts');
  const resourceKeys = new Set(Object.keys(state().resources));
  const generals = new Set();
  for (const id of ['SPIRE', ...BUILDING_IDS]) {
    const crew = crews.ESTABLISHMENT_CREWS[id];
    assert.ok(crew, `${id} has a crew`);
    assert.equal(UNIT_CLASSES[crew.general]?.requiredBuilding, id, `${crew.general} is the General of ${id}`);
    assert.equal(generalOf(id), crew.general, `tenants of ${id} share the General's kind`);
    assert.ok(!generals.has(crew.general), `${crew.general} heads only one establishment`);
    generals.add(crew.general);
    assert.ok(crew.gather.length > 0, `${id} tenants have a gather job`);
    for (const job of [...crew.gather, ...(crew.expedition ? [crew.expedition] : [])]) {
      for (const key of Object.keys(job.yield)) assert.ok(resourceKeys.has(key), `${id} yields a real resource (${key})`);
    }
  }
  const fighters = Object.keys(UNIT_CLASSES).filter((c) => UNIT_CLASSES[c].role === 'FIGHTER');
  assert.equal(fighters.length, BUILDING_IDS.length + 1, 'one fighter General per establishment and the spire');
  assert.ok(Object.values(crews.ESTABLISHMENT_CREWS).some((c) => c.gather.some((g) => g.source === 'OCEAN')), 'someone fishes the ocean');
  assert.ok(Object.values(crews.ESTABLISHMENT_CREWS).some((c) => c.expedition), 'someone raids the human realm');

  // Expeditions stir human vengeance: the next wave brings extra invaders, then it resets
  state().resetRealm();
  const per = crews.CREW_CONFIG.expedition.vengeancePerExtraInvader;
  store.setState({ castleBuilt: true, spireBuilt: true, resourceBuildings: Object.fromEntries(Object.entries(state().resourceBuildings).map(([k, b]) => [k, { ...b, level: 1 }])) });
  const base = load('src/state/economy.ts').enemiesInWave(state().invasion.waveNumber);
  state().stirVengeance(per * 2);
  state().startInvasion();
  assert.equal(state().invasion.totalEnemiesInWave, base + 2, 'raids add avenging invaders');
  assert.equal(state().invasion.vengeance, 0, 'vengeance is spent on the wave');
  assert.equal(state().invasion.vengeanceExtra, 2);

  // Old saves: roster tenants are dropped (tenants live in the world now), Generals stay
  const save = JSON.parse(state().exportSave());
  const data = save.data ?? save;
  data.roster = [
    { id: 'unit_golem_1', name: 'Earth Golem 1', unitClass: 'GOLEM', assignedTask: 'METAL' },
    { id: 'tenant_quarry_1', name: 'Earth Golem Tenant 1', unitClass: 'GOLEM', assignedTask: 'STONE', parentBuildingId: 'QUARRY' },
  ];
  assert.equal(state().importSave(JSON.stringify(save)), true);
  assert.equal(JSON.stringify(state().roster.filter((u) => u.unitClass === 'GOLEM').map((u) => u.id)), '["unit_golem_1"]', 'roster tenants are migrated away');
  console.log('Establishment crew, expedition vengeance and tenant migration checks passed.');
}

// Headless DefenderSystem run: crews spawn as their General's kind, fish in the ocean, raid through the rifts
{
  const { DefenderSystem } = load('src/game/DefenderSystem.ts');
  const layout = load('src/state/buildingLayout.ts');
  const crews = load('src/state/establishmentCrews.ts');
  const isoMod = load('src/game/IsometricHelper.ts');
  const iso = isoMod.IsometricHelper;
  state().resetRealm();
  store.setState({
    castleBuilt: true, spireBuilt: true,
    defense: { ...state().defense, castleHp: state().defense.castleMaxHp },
    resourceBuildings: Object.fromEntries(Object.entries(state().resourceBuildings).map(([k, b]) => [k, { ...b, level: 1 }])),
    // Tenant summons after the first are paid from the castle
    resources: { ...state().resources, coins: 100000 },
  });
  const gfx = () => new Proxy({}, { get: () => () => {} });
  const container = (x, y) => ({ x, y, active: true, visible: true, scale: 1,
    setPosition(nx, ny) { this.x = nx; this.y = ny; return this; }, setVisible(v) { this.visible = v; return this; },
    setScale() { return this; }, add() { return this; }, destroy() { this.active = false; } });
  const scene = { add: { container, ellipse: gfx, graphics: gfx }, tweens: { add() {} }, time: { delayedCall() {} } };
  const towers = layout.BUILDING_IDS.map((id) => {
    const rect = layout.BUILDING_SITES[id].footprint;
    const c = iso.gridToScreen(rect.x + rect.w / 2, rect.y + rect.h / 2);
    return { id, rect, x: c.x, y: c.y };
  });
  const structures = { getTowers: () => towers, getCastleTarget: () => null, getSite: (id) => towers.find((t) => t.id === id), displayName: (id) => id };
  const invasion = { getInvaders: () => [], damageInvader() {} };
  const nav = { steer: (_a, _x, _y, tx, ty) => ({ x: tx, y: ty }), pushOut: (x, y) => ({ x, y }), isSolidTile: () => false };
  const sys = new DefenderSystem(scene, { add() {} }, structures, invasion, nav);
  // Each establishment's General stands at its site (Generals summon the tenants)
  const unitsMod = require('../src/data/establishmentCrews.json');
  const generals = towers.map((t) => ({ name: 'General', unitClass: unitsMod.crews[t.id].general, hp: 1, container: { x: t.x, y: t.y, active: true } }));
  sys.setWorkerProvider(() => generals);

  const metalBefore = state().resources.metal ?? 0;
  const fishBefore = state().resources.fish;
  let sawOcean = false, sawAway = false;
  for (let t = 0; t < 6000; t++) {
    sys.update(100);
    for (const d of sys.defenders) {
      if (d.home === 'PORT' && d.targetNodePos) {
        // Nearest tile centre (screenToGrid floors, but tiles are centred on whole coordinates)
        const g = iso.screenToGrid(d.targetNodePos.x, d.targetNodePos.y + isoMod.TILE_HEIGHT / 2);
        if (!layout.isLandTile(g.x, g.y)) sawOcean = true;
        else assert.fail(`Port tenants wade into the ocean, not onto land (${g.x},${g.y})`);
      }
      if (d.state === 'IN_HUMAN_REALM') {
        sawAway = true;
        assert.equal(d.container.visible, false, 'raiders vanish into the rift');
        assert.ok(!sys.getBlockers().includes(d), 'raiders across the rift cannot be attacked');
      }
    }
  }
  for (const id of layout.BUILDING_IDS) {
    const crew = sys.defenders.filter((d) => d.home === id);
    assert.equal(crew.length, 2, `${id} raises two minions`);
    assert.ok(crew.every((d) => d.unitClass === crews.ESTABLISHMENT_CREWS[id].general), `${id} tenants share their General's kind`);
  }
  assert.ok(!sys.defenders.some((d) => d.home === 'SPIRE'), 'the Crystal Spire is not an establishment crew');
  assert.ok(sawOcean, 'Port tenants fish out in the ocean');
  assert.ok(sawAway, 'some tenants raid the human realm');
  assert.ok(state().resources.fish > fishBefore, 'fish reach the citadel');
  assert.ok((state().resources.metal ?? 0) > metalBefore, 'metal reaches the citadel');
  assert.ok((state().invasion.vengeance ?? 0) > 0, 'raids stir human vengeance');
  console.log('Headless tenant gathering and expedition checks passed.');
}

// Wave balance: stats grow with wave, day and difficulty; tactics and formations stay valid
{
  const balance = load('src/state/waveBalance.ts');
  const tactics = load('src/state/waveTactics.ts');
  const { buildWavePlan } = load('src/game/invaders/wavePlan.ts');
  const knight = INVADER_CONFIGS.HUMAN_KNIGHT;
  const hp = (wave, difficulty, day = 1) => balance.invaderStats(knight, { wave, difficulty, day, year: 1 }).hp;
  for (const d of ['EASY', 'NORMAL', 'HARD']) {
    for (let w = 2; w <= 100; w++) assert.ok(hp(w, d) > hp(w - 1, d), `${d} wave ${w} is tougher than wave ${w - 1}`);
    assert.ok(hp(50, d, 365) > hp(50, d, 1), 'a year-old realm faces tougher invaders');
  }
  assert.equal(hp(50, 'NORMAL', 999), hp(50, 'NORMAL', 365), 'day pressure caps at 365');
  assert.ok(hp(60, 'EASY') < hp(60, 'NORMAL') && hp(60, 'NORMAL') < hp(60, 'HARD'));
  assert.ok(balance.skillPower(100) > balance.skillPower(1), 'skills scale with the wave');

  assert.equal(tactics.rollWaveTactic(1, 'HARD'), 'SKIRMISH', 'the first waves are plain skirmishes');
  const ids = new Set(tactics.WAVE_TACTICS.map((t) => t.id));
  for (const t of tactics.WAVE_TACTICS) {
    assert.ok(t.name.en && t.name.tl && t.desc.en && t.desc.tl, `${t.id} has EN/TL text`);
    if (t.effect) assert.ok(tactics.TACTIC_EFFECTS[t.effect], `${t.id} effect is configured`);
    for (const type of Object.keys(t.bias ?? {})) assert.ok(INVADER_CONFIGS[type], `${t.id} bias names a real invader`);
  }
  for (let w = 3; w <= 100; w++) {
    const id = tactics.rollWaveTactic(w, 'NORMAL', 'SKIRMISH');
    assert.ok(ids.has(id) && id !== 'SKIRMISH' || w < 5, `wave ${w} rolls a known tactic without repeating`);
  }
  for (const t of tactics.WAVE_TACTICS) {
    const plan = buildWavePlan(25, 40, t, 'HARD');
    assert.equal(plan.length, 40, `${t.id} plans the whole wave`);
    assert.equal(plan[plan.length - 1].rank, 'climax', 'the realm climax boss comes last');
    if (t.escort) assert.ok(plan.some((s) => s.escort && s.type === t.escort.type), `${t.id} brings its escort`);
  }
  console.log('Wave balance, tactic and formation checks passed.');
}

// Scouts: random humans and mecha drop coins and supplies (gear was removed)
{
  const scouts = load('src/state/scoutLoot.ts');
  const cfg = JSON.parse(fs.readFileSync('src/data/scoutLoot.json', 'utf8'));
  for (const kind of ['HUMAN', 'MECHA']) {
    for (const r of cfg.drops[kind].resources) assert.ok(r.key in state().resources, `${r.key} is a resource`);
    const drop = scouts.rollScoutDrops(kind, 40, () => 0.01);
    assert.ok(drop.coinPiles.reduce((a, b) => a + b, 0) > 0 && drop.resources.length > 0 && !drop.itemId, `${kind} scouts drop coins and supplies, no gear`);
  }
  assert.ok(scouts.SCOUTS.some((s) => s.kind === 'MECHA') && scouts.SCOUTS.some((s) => s.kind === 'HUMAN'));
  console.log('Scout drop checks passed.');

  // Sea Folk: contamination, mood, group size and a tribute truce
  {
    const sea = load('src/state/seaFolk.ts');
    assert.equal(sea.seaMood(0, 0), 'CALM');
    assert.equal(sea.seaMood(sea.SEA_CONTAMINATION.emergeAt, 0), 'RESTLESS');
    assert.equal(sea.seaMood(sea.SEA_CONTAMINATION.bossAt, 0), 'ENRAGED');
    assert.equal(sea.seaMood(90, 2), 'TRUCE', 'a truce overrides the mood');
    assert.equal(sea.seaGroupSize(10), 0, 'a calm sea sends nobody');
    assert.ok(sea.seaGroupSize(80) >= 5, 'a foul sea sends a big group');
    store.setState({ seaContamination: 60, seaTruceWaves: 0, resources: { ...state().resources, coins: 1e6, water: 1e6, fish: 1e6, wood: 1e6 } });
    assert.equal(state().offerSeaTribute(), true);
    assert.equal(state().seaContamination, 60 - sea.SEA_FOLK.tribute.cleanse, 'tribute cleanses the sea');
    assert.equal(state().seaTruceWaves, sea.SEA_FOLK.tribute.truceWaves);
    state().spendSeaTruceWave();
    assert.equal(state().seaTruceWaves, sea.SEA_FOLK.tribute.truceWaves - 1);
    state().stirSea(500);
    assert.equal(state().seaContamination, sea.SEA_CONTAMINATION.max, 'contamination is capped');
    store.setState({ seaContamination: 0, seaTruceWaves: 0 });
    console.log('Sea Folk checks passed.');
  }

  // Living terrain: dug sand settles, eaten shore floods for good, protected tiles never change
  {
    const lay = load('src/state/buildingLayout.ts');
    store.setState({ terrainFlooded: [], terrainFlooding: [], terrainSand: {}, day: 10 });
    state().digSand(['5,5']);
    assert.equal(state().terrainSand['5,5'], 10, 'dug sand remembers the day');
    store.setState({ day: 10 + 60 });
    state().settleSand();
    assert.equal(state().terrainSand['5,5'], undefined, 'old sand settles back into land');
    state().markFlooding(['6,1', '6,1']);
    assert.equal(JSON.stringify(state().terrainFlooding), '["6,1"]', 'flooding tiles are unique');
    state().floodPending();
    assert.equal(JSON.stringify(state().terrainFlooded), '["6,1"]');
    assert.equal(state().terrainFlooding.length, 0);
    lay.setTerrainEdits(['6,1'], [], []);
    assert.equal(lay.isLandTile(6, 1), false, 'flooded shore is no longer land');
    assert.equal(lay.isWaterTile(6, 1), true, 'flooded shore is water');
    assert.ok(lay.waterRegionOf(6, 1), 'flooded shore belongs to an ocean side');
    const g = lay.CASTLE_GATE;
    assert.equal(lay.isProtectedTile(g.x, g.y), true, 'the castle surroundings are protected');
    lay.setTerrainEdits([], [], []);
    store.setState({ terrainFlooded: [], terrainFlooding: [], terrainSand: {} });
    // The Caterpillar heaves the ground: sea -> sand (land), sand -> land, land -> raised rock gone next day
    store.setState({ day: 20, terrainSand: { '9,9': 3 }, terrainRaised: {}, terrainFilled: [], terrainFlooded: ['6,1'] });
    state().applyCarve({ filled: ['6,1'], toSand: [], toLand: ['9,9'], raised: ['10,10'] });
    assert.equal(state().terrainSand['9,9'], undefined, 'sand becomes land');
    assert.equal(state().terrainSand['6,1'], 20, 'filled sea becomes sand');
    assert.equal(state().terrainFlooded.includes('6,1'), false, 'filled shore is no longer flooded');
    assert.equal(state().terrainRaised['10,10'], 20, 'land becomes raised rock');
    lay.setTerrainEdits([], [], [], ['10,10'], ['6,1']);
    assert.equal(lay.isRaisedTile(10, 10), true);
    assert.equal(lay.isLandTile(6, 1), true, 'filled sea is land');
    store.setState({ day: 21 });
    state().liftRaised();
    assert.equal(Object.keys(state().terrainRaised).length, 0, 'raised rock settles back the next day');
    store.setState({ day: 22, terrainSand: { '6,1': 20 }, terrainFilled: ['6,1'], terrainFlooded: ['7,1'], terrainReclamation: null, terrainReclaimed: [] });
    state().startTerrainReclamation('6,1', '7,1');
    assert.equal(state().terrainReclamation.source, '6,1', 'reclamation persists its finite source');
    state().advanceTerrainReclamation(state().terrainReclamation.requiredWork);
    assert.equal(state().terrainReclamation, null, 'completed reclamation clears the project');
    assert.equal(state().terrainFilled.includes('6,1'), false, 'the transferred source is depleted back to water');
    assert.equal(state().terrainFlooded.includes('6,1'), true);
    assert.equal(state().terrainFilled.includes('7,1'), true, 'the destination water becomes filled sand');
    assert.equal(state().terrainSand['7,1'], 22);
    assert.equal(state().terrainReclaimed.includes('7,1'), true, 'moved fill cannot be mined again as fresh Sand God terrain');
    lay.setTerrainEdits([], [], [], [], []);
    store.setState({ terrainFlooded: [], terrainFlooding: [], terrainSand: {}, terrainRaised: {}, terrainFilled: [], terrainReclamation: null, terrainReclaimed: [] });
    console.log('Terrain checks passed.');
  }
}

// Tenants build: the General summons them at its unbuilt plot, and their work drains the castle step by step
{
  const { DefenderSystem } = load('src/game/DefenderSystem.ts');
  const layout = load('src/state/buildingLayout.ts');
  const iso = load('src/game/IsometricHelper.ts').IsometricHelper;
  const work = require('../src/data/tenantWork.json');
  const crewsJson = require('../src/data/establishmentCrews.json');
  state().resetRealm();
  store.setState({
    castleBuilt: true, spireBuilt: true,
    defense: { ...state().defense, castleHp: state().defense.castleMaxHp },
    resources: { ...state().resources, coins: 0, wood: 0, stone: 0 },
  });
  const gfx = () => new Proxy({}, { get: () => () => {} });
  const container = (x, y) => ({ x, y, active: true, visible: true, scale: 1,
    setPosition(nx, ny) { this.x = nx; this.y = ny; return this; }, setVisible(v) { this.visible = v; return this; },
    setScale() { return this; }, add() { return this; }, destroy() { this.active = false; } });
  const scene = { add: { container, ellipse: gfx, graphics: gfx }, tweens: { add() {} }, time: { delayedCall() {}, now: 0 } };
  const rect = layout.BUILDING_SITES.WOOD.footprint;
  const c = iso.gridToScreen(rect.x + rect.w / 2, rect.y + rect.h / 2);
  const site = { id: 'WOOD', rect, x: c.x, y: c.y };
  const structures = { getTowers: () => [], getCastleTarget: () => null, getSite: (id) => (id === 'WOOD' ? site : undefined), displayName: (id) => id };
  const invasion = { getInvaders: () => [], damageInvader() {} };
  const nav = { steer: (_a, _x, _y, tx, ty) => ({ x: tx, y: ty }), pushOut: (x, y) => ({ x, y }), isSolidTile: () => false };
  const sys = new DefenderSystem(scene, { add() {} }, structures, invasion, nav);
  sys.setWorkerProvider(() => [{ name: 'General', unitClass: crewsJson.crews.WOOD.general, hp: 1, container: { x: c.x, y: c.y, active: true } }]);

  for (let t = 0; t < 600; t++) sys.update(100);
  assert.equal(sys.getLivingTenantsCount('WOOD'), 1, 'only the free first tenant comes while the castle is empty');
  assert.equal(state().resourceBuildings.WOOD.level, 0, 'no supplies, no building');
  assert.equal(sys.getConstructionStatus()[0].phase, 'waiting', 'the site gauge shows it waits for supplies');

  store.setState({ resources: { ...state().resources, coins: 1000, wood: 1000, stone: 1000 } });
  const coinsBefore = state().resources.coins;
  let midway = false;
  for (let t = 0; t < 3000 && state().resourceBuildings.WOOD.level < 1; t++) {
    sys.update(100);
    const step = state().resourceBuildings.WOOD.buildStep ?? 0;
    if (step > 0 && step < work.buildSteps) midway = true;
  }
  assert.ok(midway, 'construction advances in paid steps');
  assert.equal(state().resourceBuildings.WOOD.level, 1, 'tenants finish the Wood Grove');
  assert.ok(sys.getLivingTenantsCount('WOOD') > 1, 'the General keeps summoning tenants once supplies arrive');
  assert.ok(coinsBefore - state().resources.coins > 0, 'summons and construction were paid from the castle');
  console.log('Tenant construction checks passed.');
}

// Brawls: clashes at one spot fill the tension gauge; the winner absorbs the loser's base stats (+1 … +10)
{
  const brawl = load('src/state/brawl.ts');
  const { UNIT_CLASSES } = load('src/types/game.ts');
  const max = brawl.BRAWL_CONFIG.clashesToBrawl;
  assert.equal(brawl.pairKey('b', 'a'), brawl.pairKey('a', 'b'), 'tension is per pair, order-free');
  let t;
  for (let i = 0; i < max; i++) t = brawl.addClash(t, 4, 4);
  assert.equal(t.count, max);
  assert.ok(!brawl.tensionFull(t), `${max} clashes are not enough`);
  t = brawl.addClash(t, 4.5, 4);
  assert.ok(brawl.tensionFull(t), 'more than the limit at the same spot starts a brawl');
  assert.equal(brawl.addClash(t, 15, 15).count, 1, 'a clash elsewhere restarts the gauge there');

  state().resetRealm();
  store.setState({ roster: [
    { id: 'g1', name: 'Golem', unitClass: 'GOLEM', assignedTask: 'WOOD' },
    { id: 'g2', name: 'Harpy', unitClass: 'HARPY', assignedTask: 'WOOD', brawlLevel: 2, brawlAttack: 30, brawlHp: 200 },
  ] });
  for (let i = 0; i <= max; i++) state().recordClash('g1', 'g2', 3, 3);
  assert.ok(brawl.tensionFull(state().brawlTension[brawl.pairKey('g1', 'g2')]));
  state().resolveBrawl('g1', 'g2');
  const [g1, g2] = state().roster;
  assert.equal(g1.brawlLevel, 2, "the winner inherits the loser's full + level");
  assert.equal(g1.brawlAttack, 30, "inherits the loser's full brawl attack bonus");
  assert.equal(g1.brawlHp, 200, "inherits the loser's full brawl HP bonus");
  assert.equal(g2.brawlLevel, 0, 'the loser loses its + levels');
  assert.equal(g2.brawlAttack, 0);
  assert.equal(state().brawlTension[brawl.pairKey('g1', 'g2')], undefined, 'tension resets after the brawl');

  let r = [{ ...g1, brawlLevel: 8 }, { ...g2, brawlLevel: 5, brawlAttack: 10, brawlHp: 20 }];
  r = brawl.applyBrawlResult(r, 'g1', 'g2');
  assert.equal(r[0].brawlLevel, brawl.BRAWL_CONFIG.maxLevel, 'the badge caps at +10');
  const stats = brawl.generalStatsOf(r[0]);
  assert.equal(stats.attack, UNIT_CLASSES.GOLEM.baseAttack + r[0].brawlAttack, 'mirror invaders copy the full General stats');
  assert.equal(brawl.mirrorChance(0), 0, 'no mirrors without a +');
  assert.ok(brawl.mirrorChance(10) > brawl.mirrorChance(1));

  const save = state().exportSave();
  state().resetRealm();
  assert.equal(Object.keys(state().brawlTension).length, 0, 'a new realm has no tension');
  assert.equal(state().importSave(save), true);
  assert.equal(state().roster.find((u) => u.id === 'g1').brawlLevel, 2, 'brawl levels survive export/import');
  console.log('Brawl checks passed.');
}

// Runes: boss drops, slots per target, three-into-one merges, team bonuses, saves and Regression
{
  const runes = load('src/state/runes.ts');
  const { teamBonuses } = load('src/state/skillTree.ts');
  state().resetRealm();
  assert.equal(runes.bossRuneTier(1, false), 1);
  assert.equal(runes.bossRuneTier(26, false), 2, 'later waves carry stronger runes');
  assert.equal(runes.bossRuneTier(100, true), runes.DROP_MAX_TIER, 'the climax boss carries the top drop tier');

  const fury = state().grantRune('FURY', 1);
  assert.ok(fury && state().runes.length === 1, 'a boss rune lands in the vault');
  near(teamBonuses(state()).generalAttack, 1, 'unslotted runes do nothing');
  assert.equal(state().slotRune(fury.id), true);
  assert.equal(state().runeSlots.GENERALS[0], fury.id, 'runes only fit their own target');
  near(teamBonuses(state()).generalAttack, 1 + runes.runeValue(fury), 'a slotted rune boosts its stat');
  assert.equal(state().slotRune(fury.id), false, 'a rune sits in one slot only');

  for (let i = 0; i < runes.MERGE_COUNT; i++) state().grantRune('MUSTER', 1);
  assert.equal(state().mergeRunes('FURY', 1), null, 'slotted runes are not merged');
  const muster = state().mergeRunes('MUSTER', 1);
  assert.equal(muster.tier, 2, 'three runes merge into the next tier');
  assert.equal(state().runes.filter((r) => r.kind === 'MUSTER').length, 1);
  assert.ok(runes.runeValue(muster) > runes.runeValue({ kind: 'MUSTER', tier: 1 }) * 1.5, 'higher tiers escalate');
  state().slotRune(muster.id);
  near(teamBonuses(state()).summonDiscount, runes.runeValue(muster), 'Muster runes discount minion summons');

  const save = state().exportSave();
  state().resetRealm();
  assert.equal(state().runes.length, 0, 'a new realm starts with an empty vault');
  assert.equal(state().importSave(save), true);
  assert.equal(state().runes.length, 2, 'runes survive export/import');
  const bad = runes.normalizeRunes([{ id: 'x', kind: 'NOPE', tier: 1 }, { id: 'y', kind: 'FURY', tier: 999 }], { CASTLE: ['y'], GENERALS: ['y'] });
  assert.equal(bad.runes.length, 1);
  assert.equal(bad.runes[0].tier, runes.MAX_TIER, 'saved and merged rune tiers cap at 100');
  assert.equal(bad.runeSlots.CASTLE[0], null, 'a rune cannot sit in another target');
  assert.equal(bad.runeSlots.GENERALS[0], 'y');
  console.log('Rune checks passed.');
}

// Save boundary: manual import and persisted hydration share the same limits and normalization.
{
  const { persistOptions } = load('src/state/store/persistence.ts');
  const hostile = JSON.parse(state().exportSave());
  hostile.resources.wood = 'not-a-number';
  hostile.roster = Array.from({ length: 1000 }, (_, i) => ({
    id: `hostile-${i}`,
    name: 'x'.repeat(500),
    unitClass: i % 2 ? 'DRYAD' : 'UNKNOWN',
    assignedTask: 'NOPE',
    hp: 1e300,
  }));
  hostile.terrainFlooded = ['0,0', '0,0', '-1,0', '99,99'];
  hostile.buildingPositions = { WOOD: { x: -1, y: 999 }, UNKNOWN: { x: 1, y: 1 } };
  hostile.__proto__ = { polluted: true };

  const hydrated = persistOptions.merge(hostile, state());
  assert.equal(state().importSave(JSON.stringify(hostile)), true);
  assert.equal(state().resources.wood, 0);
  assert.equal(hydrated.resources.wood, state().resources.wood, 'hydration and manual import sanitize resources identically');
  assert.equal(hydrated.roster.length, state().roster.length, 'hydration and manual import share roster limits');
  assert.ok(state().roster.length <= 65, 'the bounded input cannot spawn hundreds of units');
  assert.deepEqual([...state().terrainFlooded], ['0,0'], 'terrain is deduplicated and grid-bounded');
  assert.equal({}.polluted, undefined);
  const originalConsoleError = console.error;
  console.error = () => {};
  assert.equal(state().importSave('{"resources":[]}'), false, 'malformed required resources are rejected');
  console.error = originalConsoleError;
  console.log('Save import and hydration hardening checks passed.');
}
