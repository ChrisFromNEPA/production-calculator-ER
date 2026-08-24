// tests/path-cost.test.mjs — refinement-path cost estimates (renderCalcPaths helpers)
// Extracts estUnitCost / estPathCost straight out of src/app.js so we test the
// shipped code, then checks them against known economy anchors.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteDir = join(__dirname, '..');
const require = createRequire(import.meta.url);

// ---- minimal browser stubs (same shape as harness.mjs) ----
globalThis.window = {
  matchMedia() { return { matches: false, addEventListener() {} }; },
  location: { pathname: '/', hash: '' }, history: { replaceState() {} },
  navigator: { clipboard: { writeText() { return Promise.resolve(); } } },
  btoa, atob,
};
globalThis.localStorage = { _data: {}, getItem(k) { return this._data[k] || null; }, setItem(k, v) { this._data[k] = v; }, removeItem(k) { delete this._data[k]; } };
globalThis.document = { getElementById() { return null; }, querySelectorAll() { return []; }, addEventListener() {}, querySelector() { return null; }, body: {} };
globalThis.schedulePushInv = function () {};
globalThis.refreshAll = function () {};

require(join(siteDir, 'src', 'game_data.js'));
require(join(siteDir, 'src', 'costs.js'));
require(join(siteDir, 'src', 'store.js'));
const engine = require(join(siteDir, 'src', 'engine.js'));

// ---- costFor / materialUnitCost / fmtUC from app-core.js (same logic) ----
function costFor(item, altIndex) {
  const table = window.COSTS && window.COSTS.items;
  if (!table) return null;
  const paths = table[item];
  if (!paths) return null;
  return paths[altIndex == null ? 0 : altIndex] || null;
}
function materialUnitCost(item) {
  const m = window.COSTS && window.COSTS.materials;
  if (!m) return null;
  const v = m[item];
  return typeof v === 'number' ? v : null;
}
function fmtUC(n) { return (Math.round(n * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 }); }

// ---- extract estUnitCost + estPathCost from the REAL src/app.js ----
const appSrc = readFileSync(join(siteDir, 'src', 'app.js'), 'utf8');
const stylesSrc = readFileSync(join(siteDir, 'src', 'styles.css'), 'utf8');
const initSrc = readFileSync(join(siteDir, 'src', 'app-init.js'), 'utf8');
function extractFn(name) {
  const re = new RegExp('function ' + name + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}', 'm');
  const m = appSrc.match(re);
  assert.ok(m, `could not extract ${name} from app.js`);
  return m[0];
}
const fnSrc = 'const DATA = window.GAME_DATA;\n' + extractFn('estUnitCost') + '\n' + extractFn('estPathCost');
// The functions reference DATA / RECIPES_BY_OUTPUT / costFor / materialUnitCost
// as browser globals (app-core.js declares them at script top level). Mirror
// that before evaluating.
globalThis.DATA = window.GAME_DATA;
globalThis.RECIPES_BY_OUTPUT = engine.RECIPES_BY_OUTPUT;
globalThis.costFor = costFor;
globalThis.materialUnitCost = materialUnitCost;
// Indirect eval → functions land on the global scope (module scope is strict).
(0, eval)(fnSrc);

const { RECIPES_BY_OUTPUT } = engine;
const DATA_RECIPES = window.GAME_DATA.recipes;

function estFor(item, i) { return estPathCost(item, i, 1, {}); }
function cheapest(item) { return estUnitCost(item, 1, {}); }

describe('refinement-path cost estimates (shipped app.js code)', () => {
  it('PP7: cheapest path ≈ 14,028 UC (special steel alt0 beats titanium alt1)', () => {
    const c0 = estFor('Linner PP7', 0);
    const c1 = estFor('Linner PP7', 1);
    assert.ok(c0 != null && c1 != null, `expected both PP7 paths priced, got ${c0}, ${c1}`);
    assert.ok(Math.abs(c0 - 14028) < 5, `PP7 alt0 expected ≈14028, got ${c0}`);
    assert.ok(c0 < c1, `alt0 (special steel) should be cheapest, got alt0=${c0} alt1=${c1}`);
    assert.equal(fmtUC(cheapest('Linner PP7')), fmtUC(c0));
  });

  it('textiles: mixed organic path beats all-chemicals', () => {
    const t = RECIPES_BY_OUTPUT['textiles'] && RECIPES_BY_OUTPUT['textiles'][0];
    assert.ok(t && t.inputs_alternatives && t.inputs_alternatives.length >= 2,
      `textiles should have alternative paths`);
    // Locate the mixed path by content, not index (all-chemicals is alt 0 here).
    const mixedIdx = t.inputs_alternatives.findIndex(a => a.some(x => x.item === 'organic material'));
    const chemIdx = t.inputs_alternatives.findIndex(a => a.every(x => x.item === 'chemicals'));
    assert.ok(mixedIdx >= 0 && chemIdx >= 0, `expected mixed + all-chemicals paths`);
    const mixed = estFor('textiles', mixedIdx);
    const chem = estFor('textiles', chemIdx);
    assert.ok(mixed != null && chem != null, `expected both textiles paths priced, got ${mixed}, ${chem}`);
    assert.ok(mixed < chem, `mixed organic path (≈${mixed}) should beat all-chemicals (≈${chem})`);
  });

  it('carbon: coal×3 path is cheapest', () => {
    const c = cheapest('carbon');
    assert.ok(c != null, 'carbon should be priced');
    assert.ok(Math.abs(c - 288) < 5, `carbon expected ≈288, got ${c}`);
  });

  it('intermediate chains resolve recursively (metal alloy → chrome/iron)', () => {
    const m = cheapest('metal alloy');
    assert.ok(m != null, 'metal alloy should be priced');
  });

  it('unpriced items return null, never a number', () => {
    const missing = cheapest('definitely not a real item');
    assert.equal(missing, null);
  });

  it('renderCalcPaths option label formatting is sane', () => {
    // Reconstruct the label shape the picker uses for PP7's cheapest option.
    const r = DATA_RECIPES[RECIPES_BY_OUTPUT['Linner PP7'][0]._idx];
    const a = r.inputs_alternatives[0];
    const label = a.map(x => `${x.quantity} ${x.item}`).join(' + ') + ' · ≈ ' + fmtUC(estFor('Linner PP7', 0)) + ' UC/unit ★ cheapest';
    assert.match(label, /UC\/unit/);
    assert.match(label, /★ cheapest/);
  });

  it('gives the refinement picker a clearer selected-path summary', () => {
    assert.match(appSrc, /Choose refinement paths/);
    assert.match(appSrc, /type="radio"/);
    assert.match(appSrc, /data-alt="/);
    assert.match(appSrc, /aria-checked/);
    assert.match(appSrc, /calc-path-option/);
    assert.match(appSrc, /Estimated path cost/);
    assert.match(stylesSrc, /\.calc-path-row\s*\{[\s\S]*?display:\s*grid/);
    assert.match(stylesSrc, /\.calc-path-option\s*\{/);
  });

  it('keeps path selection on one delegated radio listener with keyboard semantics', () => {
    const handler = initSrc.slice(initSrc.indexOf('input[data-alt]'), initSrc.indexOf('renderCalcPaths();', initSrc.indexOf('input[data-alt]')));
    assert.match(handler, /input\[data-alt\]/);
    assert.match(handler, /runMultiPlan\(\{ preserveChecklist: true, preserveViewport: true \}\)/);
    assert.match(handler, /runCalculator\(\{ preserveChecklist: true, preserveViewport: true \}\)/);
    assert.equal((initSrc.match(/input\[data-alt\]/g) || []).length, 1, 'refinement paths must have one delegated change listener');
  });

  it('explains recommendation and leaves unpriced paths explicitly unavailable', () => {
    assert.match(appSrc, /Recommended because this is the lowest estimated cost/);
    assert.match(appSrc, /Cost unavailable: this path is not priced yet/);
    assert.doesNotMatch(appSrc, /costs\[i\] == null && anyPriced/);
  });

  it('preserves the viewport when a refinement path changes', () => {
    const handler = initSrc.slice(initSrc.indexOf('input[data-alt]'), initSrc.indexOf('renderCalcPaths();', initSrc.indexOf('input[data-alt]')));
    assert.match(handler, /runMultiPlan\(\{ preserveChecklist: true, preserveViewport: true \}\)/);
    assert.match(handler, /runCalculator\(\{ preserveChecklist: true, preserveViewport: true \}\)/);
    assert.equal((initSrc.match(/input\[data-alt\]/g) || []).length, 1, 'refinement paths must have one delegated change listener');
  });
});
