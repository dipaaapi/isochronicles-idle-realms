const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const mod = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/state/saveValidation.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: mod, require });

const { MAX_SAVE_FILE_BYTES, isSaveFileSizeAllowed, sanitizeSavePayload } = mod;

assert.equal(isSaveFileSizeAllowed({ size: 0 }), false);
assert.equal(isSaveFileSizeAllowed({ size: MAX_SAVE_FILE_BYTES }), true);
assert.equal(isSaveFileSizeAllowed({ size: MAX_SAVE_FILE_BYTES + 1 }), false);

assert.equal(sanitizeSavePayload(null), null);
assert.equal(sanitizeSavePayload([], true), null);
assert.equal(sanitizeSavePayload({ realmName: 'missing resources' }, true), null);

const hostile = JSON.parse(`{
  "resources":{"wood":10,"constructor":{"polluted":true}},
  "realmName":"Safe Realm",
  "unknownTopLevel":"drop me",
  "__proto__":{"polluted":true},
  "roster":${JSON.stringify(Array.from({ length: 1000 }, (_, i) => ({ id: `unit-${i}`, unitClass: 'DRYAD' })))},
  "terrainFlooded":${JSON.stringify(Array.from({ length: 1000 }, (_, i) => `${i % 20},${Math.floor(i / 20)}`))},
  "day":1e999
}`);
const clean = sanitizeSavePayload(hostile, true);
assert.ok(clean);
assert.equal(Object.getPrototypeOf(clean), null);
assert.equal(Object.prototype.hasOwnProperty.call(clean, 'unknownTopLevel'), false);
assert.equal(Object.prototype.hasOwnProperty.call(clean, '__proto__'), false);
assert.equal(Object.prototype.hasOwnProperty.call(clean.resources, 'constructor'), false);
assert.equal(clean.roster.length, 128, 'roster is bounded before gameplay code sees it');
assert.equal(clean.terrainFlooded.length, 400, 'terrain arrays are bounded to the grid area');
assert.equal(Object.prototype.hasOwnProperty.call(clean, 'day'), false, 'non-finite numbers are dropped');
assert.equal({}.polluted, undefined);

const deeplyNested = { resources: {}, upgrades: {} };
let cursor = deeplyNested.upgrades;
for (let i = 0; i < 20; i += 1) cursor = cursor.next = {};
const bounded = sanitizeSavePayload(deeplyNested, true);
assert.ok(bounded && bounded.upgrades, 'deep input is bounded without rejecting the whole save');

const located = sanitizeSavePayload({ resources: {}, activeLocation: 'DRAGONS_LAIR' }, true);
assert.equal(located.activeLocation, 'DRAGONS_LAIR', 'the active location survives export/import');

console.log('save import boundary: size, shape, collection and prototype checks — ok');
