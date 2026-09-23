const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const state = {
  lootBundles: 0,
  grantRandomLoot() { this.lootBundles++; },
  invasion: { isActive: false }, defense: { castleHp: 100 },
  weather: 'CLEAR', autoSettings: {},
  tickInvasionCountdown() {}, setEnemiesRemaining() {},
};
const exportsObject = {};
const source = ts.transpileModule(fs.readFileSync('src/game/InvasionManager.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
vm.runInNewContext(source, {
  exports: exportsObject,
  require(name) {
    if (name.includes('soundFx')) return { soundFx: { playExplosion() {} } };
    if (name.includes('useGameStore')) return { useGameStore: { getState: () => state } };
    if (name.includes('IsometricHelper')) return { IsometricHelper: {
      gridToScreen: (x, y) => ({ x: x * 32, y: y * 16 }),
      screenToGrid: (x, y) => ({ x: x / 32, y: y / 16 }), getDepth: () => 0,
    } };
    return {};
  },
});
const { InvasionManager } = exportsObject;
function display(x = 0, y = 0) {
  return { x, y, active: true, setSize() {}, setDepth() {}, add() {},
    setInteractive() {}, on() {}, destroy() { this.active = false; } };
}
const manager = new InvasionManager({ add: {
  graphics: () => display(), container: display, ellipse: () => display(),
} }, { findPath: () => null });
manager.renderInvaderBody = () => {};
manager.handleTurretAttacks = () => {};
manager.spawnSingleScout();
const scout = manager.getInvaders()[0];
assert.equal(scout.currentPath.length, 2, 'unreachable scout routes must have a fallback');
assert.notDeepEqual(scout.currentPath[0], scout.currentPath[1], 'scouts must exit at a different corner');
manager.update(16); // Consume the starting path node.
const start = { x: scout.container.x, y: scout.container.y };
manager.update(100);
assert.equal(manager.getInvaders().length, 1, 'peacetime must preserve scouts');
assert.ok(Math.hypot(scout.container.x - start.x, scout.container.y - start.y) > 5,
  'scouts must visibly move in screen pixels');

manager.handleActiveIncursion = () => {};
state.invasion.isActive = true;
manager.update(16);
manager.totalEnemiesToSpawn = 6;
state.invasion.isActive = false;
manager.update(16);
assert.equal(manager.getInvaders().length, 0, 'closed waves must still clean up enemies');
assert.equal(manager.totalEnemiesToSpawn, 0, 'closed waves must reset spawning');
manager.spawnSingleScout();
manager.update(16);
assert.equal(manager.getInvaders().length, 1, 'scouts after a wave must survive');
manager.spawnFloatingPopup = () => {};
const defeatedScout = manager.getInvaders()[0];
manager.eliminateInvader(defeatedScout);
assert.equal(state.lootBundles, 1, 'defeated peacetime scouts must award building supplies');
manager.eliminateInvader(defeatedScout);
assert.equal(state.lootBundles, 1, 'a scout must only award loot once');
manager.spawnSingleScout();
state.invasion.isActive = true;
manager.eliminateInvader(manager.getInvaders()[0]);
assert.equal(state.lootBundles, 2, 'scouts defeated during waves must also award supplies');
console.log('Invasion regression checks passed.');

state.invasion.isActive = false;
manager.spawnSingleScout();
const tappedScout = manager.getInvaders().find(i => !i.isDead);
tappedScout.hp = 1000;
manager.tapInvader(tappedScout);
assert.equal(tappedScout.isDead, true, 'peacetime scouts die instantly regardless of health');
assert.equal(state.lootBundles, 3);
manager.tapInvader(tappedScout);
assert.equal(state.lootBundles, 3, 'repeat taps cannot duplicate loot');
let normalHits = 0;
manager.strikeInvaderWithLightning = (enemy) => { normalHits++; enemy.hp -= 35; };
state.invasion.isActive = true;
const waveEnemy = { isDead: false, hp: 100, isScout: false };
manager.tapInvader(waveEnemy);
assert.equal(waveEnemy.hp, 65, 'wave taps must use normal damage');
manager.spawnSingleScout();
const waveScout = manager.getInvaders().find(i => !i.isDead);
waveScout.hp = 100;
manager.tapInvader(waveScout);
assert.equal(waveScout.hp, 65, 'scouts present during waves also use normal damage');
assert.equal(normalHits, 2);
console.log('Scout instant-kill and wave tap checks passed.');
