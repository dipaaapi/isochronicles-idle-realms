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
const worker = { container: { ...IsometricHelper.gridToScreen(5, 5), setDepth() {} } };
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
for (const id of ['WOOD', 'QUARRY', 'MINE', 'PORT']) {
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
const progressionKeys = Object.keys(initial).filter(key =>
  typeof initial[key] !== 'function' && !preferences.has(key) && key !== 'lastSavedTimestamp');
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
console.log('Full realm reset checks passed.');

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
Object.assign(worker.container, IsometricHelper.gridToScreen(5, 5));
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
const turretManager = new InvasionManager({ add: { graphics: display } }, { findPath: () => null });
turretManager.invaders = [{ isDead: false, container: IsometricHelper.gridToScreen(5, 5) }];
turretManager.fireTurretBeam = () => {};
let turretDamage = 0;
turretManager.damageInvader = (_, damage) => { turretDamage = damage; };
turretManager.handleTurretAttacks(1000);
assert.equal(turretDamage, 40, 'first turret level gains 25% damage');
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
