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

// Run the actual Ent construction routine, without a renderer.
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
assert.equal(state().castleBuilt, true, 'Ent automatically completes the castle');
{
  const { INITIAL_RESOURCES } = load('src/state/store/initialState.ts');
  const { CASTLE_CONSTRUCTION_COST } = load('src/state/economy.ts');
  assert.equal(state().resources.wood, INITIAL_RESOURCES.wood - CASTLE_CONSTRUCTION_COST.wood, 'castle supplies are deducted once');
}
const spireSite = nextConstruction(state());
assert.equal(spireSite.id, 'SPIRE', 'the Ent raises the Crystal Spire right after the castle');
Object.assign(worker.container, IsometricHelper.gridToScreen(spireSite.x, spireSite.y));
manager.updateConstruction(worker, state(), 4, 65);
assert.equal(state().spireBuilt, true, 'Ent completes the Crystal Spire');
{
  const { INITIAL_RESOURCES } = load('src/state/store/initialState.ts');
  const { CASTLE_CONSTRUCTION_COST, SPIRE_CONSTRUCTION_COST } = load('src/state/economy.ts');
  assert.equal(state().resources.wood, INITIAL_RESOURCES.wood - CASTLE_CONSTRUCTION_COST.wood - SPIRE_CONSTRUCTION_COST.wood, 'spire supplies are deducted once');
}
assert.equal(manager.updateConstruction(worker, state(), 4, 65), false, 'the Ent builds only the castle and spire');

// Next the Ent summons every General (free founding summon); each General builds its own establishment.
const { updateGeneralSummoning } = load('src/game/workers/treant.ts');
const { updateGeneralConstruction } = load('src/game/workers/generalConstruction.ts');
const { nextGeneralToSummon } = load('src/state/constructionProgress.ts');
const { crewGeneralOf } = load('src/state/establishmentCrews.ts');
manager.nexusGridPos = { x: 10, y: 10 };
Object.assign(worker.container, IsometricHelper.gridToScreen(10, 10));
const order = ['WOOD', 'QUARRY', 'MINE', 'PORT', 'CAVE', 'KENNEL', 'PERCH', 'TRENCH', 'CRYPT', 'FOUNDRY', 'PAVILION', 'VOIDGATE', 'OSSUARY'];
const general = (id) => {
  const unit = state().roster.find((u) => u.unitClass === crewGeneralOf(id));
  const spot = load('src/state/buildingLayout.ts').BUILDING_SITES[id].workSpot;
  return { id: unit.id, name: unit.name, unitClass: unit.unitClass, container: { ...IsometricHelper.gridToScreen(spot.x, spot.y), setDepth() {} } };
};
const savedResources = { ...state().resources };
for (const [i, id] of order.entries()) {
  const next = nextGeneralToSummon(state());
  assert.equal(next.buildingId, id, 'Generals are summoned in construction order');
  assert.equal(updateGeneralSummoning(manager, worker, state(), 3, 65), true);
  assert.ok(state().roster.some((u) => u.unitClass === crewGeneralOf(id)), `${id} General summoned before its home stands`);
  assert.equal(state().resourceBuildings[id].level, 0, 'the Ent does not build establishments');
  assert.equal(nextGeneralToSummon(state()), undefined, 'Ent waits until the newest General builds its home');
  const g = general(id);
  if (i === 0) {
    store.setState({ resources: { ...state().resources, wood: 0, coins: 0 } });
    updateGeneralConstruction(manager, g, state(), 20, 65);
    assert.equal(state().resourceBuildings.WOOD.level, 0, 'General waits for supplies');
    store.setState({ resources: Object.fromEntries(Object.keys(savedResources).map(k => [k, 10000])) });
  }
  assert.equal(updateGeneralConstruction(manager, g, state(), 4, 65), true);
  assert.equal(state().resourceBuildings[id].level, 1, `${id} built by its General`);
  assert.equal(updateGeneralConstruction(manager, g, state(), 4, 65), false, 'General resumes duties once home stands');
}
assert.equal(updateGeneralSummoning(manager, worker, state(), 3, 65), false, 'Ent moves on once all Generals stand');
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
const rosterBefore = state().roster.length;
state().resolveCastleBreach();
assert.equal(state().roster.length, rosterBefore, 'breach keeps the roster');
assert.equal(state().roster.find(u => u.unitClass === 'AQUA_SLIME').slimeEvolutionLevel, 3, 'breach keeps the Support Slime evolution');
assert.equal(state().lootedResources.metal, 5000, 'breach loot report covers every resource');
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
store.setState({ day: 87, year: 3, platformPhase: 4, skillRanks: { MINION_MIGHT: 1 }, invasion: { ...initial.invasion, waveNumber: 100, isActive: true } });
state().performRegression();
assert.equal(state().day, 1);
assert.equal(state().year, 1);
assert.equal(state().platformPhase, 1);
assert.equal(state().invasion.waveNumber, 1);
assert.equal(state().invasion.isActive, false);
assert.equal(state().skillPoints, 0, 'regression no longer grants skill points');
assert.deepEqual({ ...state().skillRanks }, {}, 'skills are refunded on regression');
assert.equal(state().castleBuilt, false);
assert.equal(state().defense.castleHp, 0);
assert.equal(state().defense.castleMaxHp, 600);
assert.equal(state().regressionHistory[0].dayReached, 87);
state().summonUnit('TREANT', 'BUILD', true);
Object.assign(worker.container, IsometricHelper.gridToScreen(nextConstruction(state()).x, nextConstruction(state()).y));
manager.updateConstruction(worker, state(), 4, 65);
assert.equal(state().defense.castleHp, 600, 'Ent rebuild applies permanent regression HP');
near(teamBonuses(state()).attack, 1.05, 'regression tier boosts minion attack');
near(teamBonuses({ regressionCount: 0 }).attack, 1);

// Skill points come from clearing wave sets
assert.equal(earnedSkillPoints(4), 0);
assert.equal(earnedSkillPoints(5), 2);
assert.equal(earnedSkillPoints(250), 40, 'rewards stop at wave 100');
assert.equal(state().learnSkill('MINION_MIGHT'), false, 'no points before the first wave set');
store.setState({ invasion: { ...state().invasion, invasionsRepelled: 4, waveNumber: 5, isActive: true } });
state().resolveInvasionVictory(0);
assert.equal(state().skillPoints, 2, 'clearing wave 5 grants 2 points');
assert.equal(state().learnSkill('MINION_HASTE'), false, 'prerequisites must be enforced');
assert.equal(state().learnSkill('MINION_MIGHT'), true);
assert.equal(state().learnSkill('MINION_MIGHT'), true, 'skills have ranks');
assert.equal(state().skillRanks.MINION_MIGHT, 2);
assert.equal(state().learnSkill('CASTLE_ARMOR'), false, 'cannot spend unavailable points');
assert.equal(state().skillPoints, 0);
near(teamBonuses(state()).attack, 1 + 0.16 + 0.05);
state().resetSkills();
assert.equal(state().skillPoints, 2, 'free respec refunds every point');
assert.equal(state().learnSkill('CASTLE_ARMOR'), true);
assert.equal(state().learnSkill('CASTLE_ARMOR'), true);
store.setState({ castleBuilt: true, defense: { ...state().defense, castleHp: 800, shieldHp: 0 } });
state().damageCastle(100);
assert.equal(state().defense.castleHp, 710, 'two ranks of armor reduce castle damage by 10%');
store.setState({ invasion: { ...state().invasion, invasionsRepelled: 19, waveNumber: 20, isActive: true } });
state().resolveInvasionVictory(0);
assert.equal(state().skillPoints, 6, '20 waves cleared = 8 points, 2 spent');
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
assert.equal(state().skillPoints, 3, "8 earned, 5 spent");
assert.equal(state().regressionCount, 1);
assert.equal(normalizeSkillProgress({ regressionCount: 3, unlockedSkills: ['MINION_MIGHT'] }).skillPoints, 0, 'old regression points are not carried over');
assert.equal(normalizeSkillProgress({ skillRanks: { MINION_MIGHT: 3 }, invasion: { invasionsRepelled: 5 } }).skillPoints, 2, 'overspent saves are refunded');
assert.equal(normalizeSkillProgress({ skillRanks: { MINION_HASTE: 1, bogus: 2 }, invasion: { invasionsRepelled: 10 } }).skillPoints, 4);
state().resetRegressionProgress('RESET REGRESSIONS');
assert.equal(state().defense.castleMaxHp, 500);
near(teamBonuses({ regressionCount: state().regressionCount }).attack, 1);
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

// Establishment crews: one General per establishment, tenants share its kind, gather/expedition yields are real resources
{
  const crews = load('src/state/establishmentCrews.ts');
  const { UNIT_CLASSES } = load('src/data/units.ts');
  const { BUILDING_IDS } = load('src/state/buildingLayout.ts');
  const { generalOf } = load('src/state/store/rosterSlice.ts');
  const resourceKeys = new Set(Object.keys(state().resources));
  const generals = new Set();
  for (const id of BUILDING_IDS) {
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
  assert.equal(fighters.length, BUILDING_IDS.length, 'one fighter General per establishment');
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
  const structures = { getTowers: () => towers, getCastleTarget: () => null };
  const invasion = { getInvaders: () => [], damageInvader() {} };
  const nav = { steer: (_a, _x, _y, tx, ty) => ({ x: tx, y: ty }), pushOut: (x, y) => ({ x, y }), isSolidTile: () => false };
  const sys = new DefenderSystem(scene, { add() {} }, structures, invasion, nav);

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
    assert.equal(crew.length, 5, `${id} raises five tenants`);
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

// Scouts: random humans and mecha drop coins, supplies and sometimes real equipment
{
  const scouts = load('src/state/scoutLoot.ts');
  const { CRAFTABLE_ITEMS } = load('src/types/game.ts');
  const ids = new Set(CRAFTABLE_ITEMS.map((i) => i.id));
  const cfg = JSON.parse(fs.readFileSync('src/data/scoutLoot.json', 'utf8'));
  for (const kind of ['HUMAN', 'MECHA']) {
    for (const id of cfg.drops[kind].itemPool) assert.ok(ids.has(id), `${kind} scouts drop a real item (${id})`);
    for (const r of cfg.drops[kind].resources) assert.ok(r.key in state().resources, `${r.key} is a resource`);
    const drop = scouts.rollScoutDrops(kind, 40, () => 0.01);
    assert.ok(drop.coinPiles.reduce((a, b) => a + b, 0) > 0 && drop.resources.length > 0 && drop.itemId, `${kind} scouts drop coins, supplies and items`);
  }
  assert.ok(scouts.SCOUTS.some((s) => s.kind === 'MECHA') && scouts.SCOUTS.some((s) => s.kind === 'HUMAN'));
  const before = state().inventory.length;
  assert.ok(state().grantEquipmentDrop(cfg.drops.MECHA.itemPool[0]));
  assert.equal(state().inventory.length, before + 1, 'dropped equipment lands in the inventory');
  assert.equal(state().grantEquipmentDrop('nope'), null);
  console.log('Scout drop checks passed.');
}
