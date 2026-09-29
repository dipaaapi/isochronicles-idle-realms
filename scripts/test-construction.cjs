const assert = require('node:assert/strict');
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
    exports, console, localStorage: { getItem: () => null, setItem() {} },
    require(name) {
      if (name === 'phaser') return { default: { Math: { Clamp: (n, min, max) => Math.max(min, Math.min(max, n)) } } };
      if (name === 'zustand/middleware') return { persist: (fn) => fn, createJSONStorage() {} };
      if (name.includes('soundFx')) return { soundFx: new Proxy({}, { get: () => () => {} }) };
      if (name.includes('storageAdapter')) return {};
      if (name.includes('activityLog')) return new Proxy({}, { get: () => () => undefined });
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
assert.equal(state().summonUnit('GOLEM'), false);
assert.equal(state().summonUnit('GOLEM', 'AETHER', true), false, 'free summons also wait');
assert.equal(state().summonUnit('TREANT', 'BUILD', true), true, 'builder must remain available');
assert.equal(state().buildCastle(), true);
for (const id of ['WOOD', 'QUARRY', 'MINE']) assert.equal(state().upgradeResourceBuilding(id), true);
const countdown = state().invasion.countdown;
state().tickInvasionCountdown(200);
state().startInvasion();
assert.equal(state().invasion.isActive, false, 'waves wait for every building');
assert.equal(state().invasion.countdown, countdown);
assert.equal(state().summonUnit('GOLEM'), false, 'one missing building still locks recruits');
assert.equal(state().upgradeResourceBuilding('PORT'), true);
assert.equal(state().summonUnit('GOLEM'), true, 'construction unlocks recruits');
state().tickInvasionCountdown(1);
assert.equal(state().invasion.countdown, countdown - 1);
state().startInvasion();
assert.equal(state().invasion.isActive, true);

// Run the actual Ent construction routine, without a renderer.
state().resetRealm();
state().summonUnit('TREANT', 'BUILD', true);
const manager = Object.create(WorkerManager.prototype);
manager.spawnHarvestBurst = () => {};
manager.spawnFloatingPopup = () => {};
const castleSite = nextConstruction(state());
assert.equal(castleSite.id, 'CASTLE');
const worker = { container: { ...IsometricHelper.gridToScreen(castleSite.x, castleSite.y), setDepth() {} } };
manager.updateConstruction(worker, state(), 3, 65);
assert.equal(state().castleBuilt, false, 'construction takes time');
manager.updateConstruction(worker, state(), 1, 65);
assert.equal(state().castleBuilt, true, 'Ent automatically completes the castle');
assert.equal(state().resources.wood, 30, 'castle supplies are deducted once');
store.setState({ resources: { ...state().resources, wood: 0 } });
Object.assign(worker.container, IsometricHelper.gridToScreen(8, 8));
manager.updateConstruction(worker, state(), 20, 65);
assert.equal(state().resourceBuildings.WOOD.level, 0, 'Ent waits for supplies');
store.setState({ resources: Object.fromEntries(Object.keys(state().resources).map(k => [k, 10000])) });
for (const id of ['WOOD', 'QUARRY', 'MINE', 'PORT', 'CAVE']) {
  const site = nextConstruction(state());
  assert.equal(site.id, id);
  Object.assign(worker.container, IsometricHelper.gridToScreen(site.x, site.y));
  manager.updateConstruction(worker, state(), 4, 65);
  assert.equal(state().resourceBuildings[id].level, 1);
}
assert.equal(manager.updateConstruction(worker, state(), 4, 65), false, 'normal duties resume after construction');
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

const preferences = new Set(['language', 'isAudioMuted', 'isGoreEnabled', 'targetFps', 'showFpsDebug', 'showTileCoordinates', 'measuredFps']);
const initial = store.getInitialState();
// Every reset rolls a fresh random layout, so its seed (and the node spots it moves) differ by design
const rerolled = new Set(['lastSavedTimestamp', 'layoutSeed', 'dynamicResourceNodes']);
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

// Store refactor regressions: late-game resources, Ent links, breach roster, skill trigger.
state().resetRealm();
store.setState({ resources: { ...state().resources, metal: 5 } });
assert.equal(state().spendResources({ metal: 6 }), false, 'metal cannot go negative');
assert.equal(state().spendResources({ metal: 5 }), true);
assert.equal(state().resources.metal, 0);
store.setState({ resources: Object.fromEntries(Object.keys(state().resources).map(k => [k, 10000])) });
state().summonUnit('TREANT', 'BUILD', true);
state().buildCastle();
state().upgradeResourceBuilding('WOOD');
assert.equal(state().summonUnit('TREANT', 'BUILD', true), false, 'the realm has a single Ent');
assert.equal(state().roster.filter(u => u.unitClass === 'TREANT').length, 1);
assert.equal('entAssignments' in state(), false, 'Ent caretaker links are gone');
const saved = state().exportSave();
assert.equal('entAssignments' in JSON.parse(saved), false);
assert.equal(state().importSave(saved), true);
assert.equal(state().triggerEstablishmentSkill('WOOD', 0), true, 'establishment skills trigger in-browser (no require)');
assert.ok(state().establishmentSkillCooldowns.WOOD.skill1 > 0);
store.setState({ roster: state().roster.map(u => u.unitClass === 'AQUA_SLIME' ? { ...u, slimeEvolutionLevel: 3 } : u) });
state().resolveCastleBreach();
assert.equal(state().roster.length, 1);
assert.equal(state().roster[0].slimeEvolutionLevel, 3, 'breach keeps the Support Slime evolution');
assert.equal(state().lootedResources.metal, 5000, 'breach loot report covers every resource');
state().resetRealm();
console.log('Store slice regression checks passed.');

const { InvasionManager } = load('src/game/InvasionManager.ts');
const { INVADER_CONFIGS } = load('src/types/game.ts');
const { normalizeDifficulty } = load('src/state/difficulty.ts');
assert.equal(normalizeDifficulty(undefined), 'NORMAL', 'old saves use normal difficulty');
assert.equal(normalizeDifficulty('invalid'), 'NORMAL');
const display = (x = 0, y = 0) => ({ x, y, setDepth() {}, add() {}, setSize() {}, setInteractive() {}, on() {} });
for (const [difficulty, multiplier] of [['EASY', 0.7], ['NORMAL', 1], ['HARD', 1.4]]) {
  store.setState({ difficulty, invasion: { ...initial.invasion, isActive: true, totalEnemiesInWave: 6 } });
  const invasionManager = new InvasionManager({ add: { graphics: display, container: display, ellipse: display } }, { findPath: () => null });
  invasionManager.renderInvaderBody = () => {};
  invasionManager.renderHpBar = () => {};
  invasionManager.spawnSingleInvader(1);
  const enemy = invasionManager.getInvaders()[0];
  assert.equal(enemy.maxHp, Math.round(INVADER_CONFIGS[enemy.type].hp * multiplier));
  assert.equal(enemy.damage, Math.round(INVADER_CONFIGS[enemy.type].damage * multiplier));
  assert.equal(JSON.parse(state().exportSave()).difficulty, difficulty);
}
state().resetRealm();
assert.equal(state().difficulty, 'NORMAL');
console.log('Difficulty combat, export and reset checks passed.');

const { skillBonuses, normalizeSkillProgress } = load('src/state/skillTree.ts');
store.setState({ day: 87, year: 3, platformPhase: 4, invasion: { ...initial.invasion, waveNumber: 100, isActive: true } });
state().performRegression();
assert.equal(state().day, 1);
assert.equal(state().year, 1);
assert.equal(state().platformPhase, 1);
assert.equal(state().invasion.waveNumber, 1);
assert.equal(state().invasion.isActive, false);
assert.equal(state().skillPoints, 1);
assert.equal(state().castleBuilt, false);
assert.equal(state().defense.castleHp, 0);
assert.equal(state().defense.castleMaxHp, 600);
assert.equal(state().regressionHistory[0].dayReached, 87);
state().summonUnit('TREANT', 'BUILD', true);
Object.assign(worker.container, IsometricHelper.gridToScreen(nextConstruction(state()).x, nextConstruction(state()).y));
manager.updateConstruction(worker, state(), 4, 65);
assert.equal(state().defense.castleHp, 600, 'Ent rebuild applies permanent regression HP');
assert.equal(state().unlockSkill('MINION_HASTE'), false, 'prerequisites must be enforced');
assert.equal(state().unlockSkill('MINION_MIGHT'), true);
assert.equal(state().unlockSkill('MINION_MIGHT'), false, 'cannot buy the same skill twice');
assert.equal(state().unlockSkill('CASTLE_ARMOR'), false, 'cannot spend unavailable points');
assert.equal(state().skillPoints, 0);
assert.equal(skillBonuses(state().unlockedSkills).attack, 1.2);
state().performRegression();
assert.equal(state().defense.castleMaxHp, 700);
assert.equal(state().skillPoints, 1);
assert.equal(state().unlockedSkills.includes('MINION_MIGHT'), true);
assert.equal(state().unlockSkill('MINION_HASTE'), true);
assert.equal(skillBonuses(state().unlockedSkills).speed, 1.15);
state().performRegression();
assert.equal(state().unlockSkill('CASTLE_ARMOR'), true);
store.setState({ castleBuilt: true, defense: { ...state().defense, castleHp: 800, shieldHp: 0 } });
state().damageCastle(100);
assert.equal(state().defense.castleHp, 710, 'armor reduces incoming castle damage by 10%');
state().performRegression();
assert.equal(state().unlockSkill('CASTLE_TURRETS'), true);
const { towerStats } = load('src/state/defenseStats.ts');
assert.equal(towerStats('QUARRY', 1, skillBonuses(state().unlockedSkills).turret).damage, 43, 'the old turret skill now boosts establishment towers by 25%');
state().performRegression();
assert.equal(state().unlockSkill('RESOURCE_GROVES'), true);
state().performRegression();
assert.equal(state().unlockSkill('RESOURCE_ABUNDANCE'), true);
assert.equal(skillBonuses(state().unlockedSkills).harvest * skillBonuses(state().unlockedSkills).foundations, 1.5);
const skillSave = state().exportSave();
state().resetRealm();
assert.equal(state().skillPoints, 0);
assert.equal(state().unlockedSkills.length, 0);
assert.equal(state().importSave(skillSave), true);
assert.equal(state().unlockedSkills.length, 6, 'all unlocked skills survive export/import');
assert.equal(state().regressionCount, 6);
assert.equal(state().defense.castleMaxHp, 1100);
assert.equal(normalizeSkillProgress({ regressionCount: 3 }).skillPoints, 3, 'old regressions receive unspent points');
assert.equal(normalizeSkillProgress({ regressionCount: 3, unlockedSkills: ['MINION_HASTE', 'bogus'] }).unlockedSkills.length, 0);
state().resetRegressionProgress('RESET REGRESSIONS');
assert.equal(state().unlockedSkills.length, 0);
assert.equal(state().defense.castleMaxHp, 500);
console.log('Regression rewards, rebuilding, skill tree, combat and save checks passed.');

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

  // Each establishment has a distinct weapon
  assert.deepEqual(layout.BUILDING_IDS.map((id) => defense.towerStats(id, 1).attack).sort(),
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

  // Layout: 20×20 platform, citadel at the centre, establishments placed randomly per seed.
  // For many seeds: every footprint is on land, none overlap, work spots are free and reachable.
  const N = layout.GRID_SIZE;
  assert.equal(N, 20, 'the platform is 20×20');
  const castleCenter = layout.rectCenter(layout.CASTLE_FOOTPRINT);
  assert.equal(JSON.stringify(castleCenter), JSON.stringify({ x: 10, y: 10 }), 'the citadel stands at the centre');
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
    for (const s of spots) assert.ok(!taken.has(`${s.x},${s.y}`) && layout.isLandTile(s.x, s.y), `seed ${seed}: work spot ${s.x},${s.y} is walkable land`);
    const pf = new PF();
    const base = Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => (layout.isLandTile(x, y) ? 0 : 1)));
    for (const p of layout.PORTAL_SITES) base[p.tile.y][p.tile.x] = 0;
    const nav = new Navigation(pf, base);
    nav.setSolids([
      { id: 'CASTLE', rect: layout.CASTLE_FOOTPRINT }, { id: 'SPIRE', rect: layout.SPIRE_FOOTPRINT },
      ...layout.BUILDING_IDS.map((id) => ({ id, rect: layout.BUILDING_SITES[id].footprint })),
      ...layout.PORTAL_SITES.map((p) => ({ id: p.id, rect: { ...p.tile, w: 1, h: 1 } })),
    ]);
    const gate = layout.CASTLE_GATE;
    for (const s of spots) {
      const route = pf.findPath(gate.x, gate.y, s.x, s.y, [0]);
      assert.ok(route, `seed ${seed}: ${s.x},${s.y} is reachable from the gate`);
      assert.ok(route.every((t) => !taken.has(`${t.x},${t.y}`)), 'paths never cross a footprint');
    }
    for (const p of layout.PORTAL_SITES) {
      const route = nav.pathToRect(p.exit, layout.CASTLE_FOOTPRINT, [0]);
      assert.ok(route && route.length > 1, `seed ${seed}: invaders from ${p.id} can reach the citadel walls`);
    }
    for (const r of layout.ROAD_TILES) assert.ok(!taken.has(`${r.x},${r.y}`), 'roads never pave a footprint');
    return nav;
  };
  const layoutsSeen = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    checkLayout(seed);
    layoutsSeen.add(JSON.stringify(layout.BUILDING_SITES));
  }
  assert.ok(layoutsSeen.size > 250, 'establishment placement varies between realms');
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
  state().performRegression();
  assert.notEqual(state().layoutSeed, seedBefore, 'regression rolls a new layout');
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
