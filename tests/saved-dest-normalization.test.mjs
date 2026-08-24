// tests/saved-dest-normalization.test.mjs — correction task t_db1c1893.
// Independent review of candidate ef7bd0a found three gaps:
//   R1. loadSavedPlan (src/app.js) assigns p.dest / savedRefineDest to the
//       destination globals WITHOUT validating them against the final-
//       production / refinement allowlists. A legacy saved plan can
//       reintroduce Apartment (or any rejected location) as DESTINATION.
//   R2. loadDestination (src/app-core.js) normalizes legacy values in
//       memory but never persists the repaired state back to localStorage,
//       so every reload re-runs the repair.
//   R3. The what-if "Plan here" handler (src/app-init.js) mutates
//       DESTINATION without mirroring it into window.ENGINE.DESTINATION
//       or resyncing the combined "Same location" selector.
// These tests exercise the real code in a VM — no mocks of the functions
// under test, only a fake DOM/storage boundary.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const core = readFileSync(join(root, 'src', 'app-core.js'), 'utf8');
const init = readFileSync(join(root, 'src', 'app-init.js'), 'utf8');
const app = readFileSync(join(root, 'src', 'app.js'), 'utf8');

const finalDestinations = [
  "Kepler's Dome", 'Brooklyn', 'Ground Zero', 'Manhattan', 'Paris', 'Berlin', 'Tokyo',
];

function makeSelect(id) {
  const sel = {
    id, value: '', options: [],
    _children: [],
    appendChild(o) { this._children.push(o); this.options.push(o); },
    set innerHTML(v) { this._children = []; this.options = []; },
    get innerHTML() { return ''; },
  };
  return sel;
}

// Runs the real app-core.js destination machinery plus the real loadSavedPlan
// extracted from src/app.js, sharing one VM context (and therefore the same
// module-scope DESTINATION / REFINE_DESTINATION lexical bindings).
function loadRuntime(localStorageData, savedPlans) {
  const elements = {
    'calc-dest': makeSelect('calc-dest'),
    'calc-refine-dest': makeSelect('calc-refine-dest'),
    'calc-combined-dest': makeSelect('calc-combined-dest'),
    'calc-item': { value: '' },
    'calc-qty': { value: '1' },
  };
  const storage = {
    data: { ...localStorageData },
    getItem(k) { return this.data[k] ?? null; },
    setItem(k, v) { this.data[k] = String(v); },
  };
  const sandbox = {
    window: {
      ENGINE: {
        DESTINATION: 'Berlin', esc: x => String(x), fmt: x => String(x), displayName: x => x,
        iconFor: () => '', RECIPES_BY_OUTPUT: {}, ALL_ITEMS: new Set(), CATEGORIES: {},
      },
      GAME_DATA: { mining_sites: [], inventory: [{ location: 'apartment' }] },
      STORE: { PLAYERS: { active: '', players: {}, profiles: {} }, INV_TOTAL: {}, INV_LOCATIONS: {}, getInv: () => [] },
    },
    localStorage: storage,
    document: {
      getElementById(id) { return elements[id] ?? null; },
      createElement(tag) { return { tagName: tag, value: '', textContent: '' }; },
      querySelectorAll() { return []; },
      querySelector() { return null; },
      documentElement: { dataset: {}, style: {} },
    },
    console,
    toast: () => {},
    CALC_TRAY: [],
    LAST_SINGLE: null,
    saveTray: () => {},
    renderTray: () => {},
    runMultiPlan: () => {},
    runCalculator: () => {},
    saveSavedPlans: () => {},
    renderSavedPlans: () => {},
    prompt: () => null,
  };
  sandbox.globalThis = sandbox;
  sandbox.window.window = sandbox.window;
  const ctx = vm.createContext(sandbox);
  // app-core.js declares the destination globals + helpers and calls
  // loadDestination() itself at module scope.
  vm.runInContext(core, ctx, { filename: 'app-core.js' });

  // Extract the real loadSavedPlan body from app.js and run it inside the
  // same context so it shares app-core's destination bindings.
  const m = app.match(/function loadSavedPlan\(id\) \{[\s\S]*?\n\}/);
  assert.ok(m, 'loadSavedPlan must exist in src/app.js');
  vm.runInContext(`
    var SAVED_PLANS = ${JSON.stringify(savedPlans)};
    ${m[0]}
    this.loadSavedPlan = loadSavedPlan;
    this.__readDest = () => [DESTINATION, REFINE_DESTINATION, REFINE_DESTINATION_EXPLICIT];
  `, ctx, { filename: 'app.js#loadSavedPlan' });
  const rt = { elements, storage, sandbox };
  rt.dest = () => vm.runInContext('this.__readDest()', ctx)[0];
  rt.refine = () => vm.runInContext('this.__readDest()', ctx)[1];
  return rt;
}

describe('R1: loadSavedPlan validates saved destinations (review finding)', () => {
  it('rejects an Apartment saved dest and falls back safely, persisting the repair', () => {
    const rt = loadRuntime(
      { cmg_destination: 'Berlin', cmg_refine_destination: 'Berlin' },
      [{ id: 'p1', kind: 'single', item: 'x', qty: 1, dest: 'apartment', refineDest: 'apartment', name: 'legacy' }]
    );
    rt.sandbox.loadSavedPlan('p1');
    assert.ok(finalDestinations.includes(rt.dest()),
      `DESTINATION must land on a final-production location, got ${rt.dest()}`);
    assert.notEqual(rt.elements['calc-dest'].value, 'apartment');
    assert.notEqual(rt.elements['calc-refine-dest'].value, 'apartment');
    // the repaired state is persisted, not only repaired in memory
    assert.notEqual(rt.storage.data['cmg_destination'], 'apartment');
    assert.notEqual(rt.storage.data['cmg_refine_destination'], 'apartment');
  });

  it('falls back safely when the saved refine dest is not a valid refinement location', () => {
    const rt = loadRuntime(
      { cmg_destination: 'Berlin', cmg_refine_destination: 'Berlin' },
      [{ id: 'p2', kind: 'single', item: 'x', qty: 1, dest: 'Paris', refineDest: 'Nonsense Moon', name: 'broken' }]
    );
    rt.sandbox.loadSavedPlan('p2');
    assert.equal(rt.dest(), 'Paris');
    // invalid refine falls back to the (validated) destination, never to the raw saved value
    assert.notEqual(rt.refine(), 'Nonsense Moon');
    assert.notEqual(rt.elements['calc-refine-dest'].value, 'Nonsense Moon');
    assert.notEqual(rt.storage.data['cmg_refine_destination'], 'Nonsense Moon');
  });

  it('keeps valid saved destinations untouched', () => {
    const rt = loadRuntime(
      { cmg_destination: 'Berlin', cmg_refine_destination: 'Berlin' },
      [{ id: 'p3', kind: 'single', item: 'x', qty: 1, dest: 'Tokyo', refineDest: "DeMorgan's Castle", name: 'good' }]
    );
    rt.sandbox.loadSavedPlan('p3');
    assert.equal(rt.dest(), 'Tokyo');
    assert.equal(rt.refine(), "DeMorgan's Castle");
    assert.equal(rt.storage.data['cmg_refine_destination'], "DeMorgan's Castle");
  });
});

describe('R2: loadDestination persists normalized legacy values (review finding)', () => {
  it('writes the repaired destination back to localStorage', () => {
    const rt = loadRuntime({ cmg_destination: 'apartment', cmg_refine_destination: 'apartment' }, []);
    assert.notEqual(rt.storage.data['cmg_destination'], 'apartment');
    assert.notEqual(rt.storage.data['cmg_refine_destination'], 'apartment');
    assert.ok(finalDestinations.includes(rt.storage.data['cmg_destination']),
      `persisted production destination must be a final-production location, got ${rt.storage.data['cmg_destination']}`);
  });
});

describe('R3: what-if Plan here keeps selectors and engine in sync (review finding)', () => {
  it('mirrors DESTINATION into window.ENGINE.DESTINATION and resyncs the combined selector', () => {
    const handler = init.slice(init.indexOf('[data-whatif-plan]'), init.indexOf('[data-whatif-plan]') + 700);
    assert.match(handler, /window\.ENGINE\.DESTINATION\s*=\s*colony/);
    assert.match(handler, /syncCombinedSelector/);
  });
});

describe('R4: saved-plan rendering normalizes and persists every record', () => {
  it('requires normalization before rendering and persistence', () => {
    assert.match(app, /function normalizeSavedPlans\(\)/);
    assert.match(app, /normalizeSavedPlans\(\);\n  const panel/);
    assert.match(app, /saveSavedPlans\(\);/);
    assert.match(app, /validFinalProduction\(p\.dest\)/);
    assert.match(app, /validRefinement\(p\.refineDest\)/);
    assert.doesNotMatch(app.match(/function renderSavedPlans\(\) \{[\s\S]*?\n\}/)[0], /p\.dest \|\| ''/);
  });
});

describe('R5: malformed what-if colonies are rejected before mutation', () => {
  it('validates the decoded colony before changing destination state', () => {
    const handler = init.slice(init.indexOf('let colony'), init.indexOf('let colony') + 800);
    assert.match(handler, /validFinalProduction\(colony\)/);
    assert.match(handler, /return/);
  });
});
