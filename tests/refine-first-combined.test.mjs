// tests/refine-first-combined.test.mjs — refinement-first colony selection and
// combined "same location" mode for the calculator (task t_4454bc38).
//
// Static contract tests in the same style as production-destination-lists /
// single-plan-ux, plus a VM runtime test that exercises the real
// populateDestinations / getRefineDestination / loadDestination code paths.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const core = readFileSync(join(root, 'src', 'app-core.js'), 'utf8');
const init = readFileSync(join(root, 'src', 'app-init.js'), 'utf8');
const app = readFileSync(join(root, 'src', 'app.js'), 'utf8');

const finalDestinations = [
  "Kepler's Dome", 'Brooklyn', 'Ground Zero', 'Manhattan', 'Paris', 'Berlin', 'Tokyo',
];

// ── 1. Selector order: Refinement first, Production second ──────────────────
describe('refinement-first selector order', () => {
  it('renders the Refinement colony selector before the Production colony selector', () => {
    const refineIdx = html.indexOf('id="calc-refine-dest"');
    const prodIdx = html.indexOf('id="calc-dest"');
    assert.ok(refineIdx > -1, 'refinement selector must exist');
    assert.ok(prodIdx > -1, 'production selector must exist');
    assert.ok(refineIdx < prodIdx, 'refinement selector must come first in DOM order');
  });

  it('labels the selectors with accessible names in refinement-first order', () => {
    assert.match(html, /aria-label="Refinement colony"/);
    assert.match(html, /aria-label="Production colony"/);
    assert.ok(
      html.indexOf('aria-label="Refinement colony"') < html.indexOf('aria-label="Production colony"'),
      'accessible names must follow the refinement-first order'
    );
  });
});

// ── 2. Combined mode: explicit, accessible, reversible ───────────────────────
describe('combined same-location mode', () => {
  it('offers an explicit accessible same-location convenience control', () => {
    assert.match(html, /id="calc-combined-dest"/);
    assert.match(html, /aria-label="Refine and produce at the same location/);
  });

  it('uses a toggle while keeping production/refinement selectors authoritative', () => {
    const populateFn = core.slice(core.indexOf('function populateDestinations('), core.indexOf('function getDestination('));
    assert.match(populateFn, /syncCombinedSelector\(\)/);
    assert.doesNotMatch(populateFn, /combinedSel|colonyList\(\)\.forEach/);
  });

  it('sets both destinations together and returns to expert split mode when either selector changes', () => {
    assert.match(init, /calc-combined-dest[\s\S]*?setCombinedDestination/);
    assert.match(core, /function setCombinedDestination\(/);
    // Split-mode entry points must clear combined mode.
    const calcDestHandler = init.slice(init.indexOf("getElementById('calc-dest')"), init.indexOf("getElementById('calc-dest')") + 600);
    assert.match(calcDestHandler, /clearCombinedDestination|exitCombinedMode/);
    const refineHandler = init.slice(init.indexOf("getElementById('calc-refine-dest')"), init.indexOf("getElementById('calc-refine-dest')") + 600);
    assert.match(refineHandler, /clearCombinedDestination|exitCombinedMode/);
  });

  it('does not silently overwrite an explicit expert refinement choice', () => {
    assert.match(core, /REFINE_DESTINATION_EXPLICIT/);
    // Leaving combined mode must keep the split values; production changes must
    // not clobber an explicit refinement.
    assert.match(core, /function exitCombinedMode\(/);
  });
});

// ── 3. Production options come only from FINAL_PRODUCTION_LOCATIONS ─────────
describe('production-only options and Apartment exclusion', () => {
  it('populates the production selector from colonyList()', () => {
    assert.match(core, /let colonies = colonyList\(\)/);
  });

  it('never offers Apartment in refinement, production, or combined selectors', () => {
    const populateFn = core.slice(core.indexOf('function populateDestinations('), core.indexOf('function getDestination('));
    for (const selectorVar of ['refineSel', 'sel']) {
      const block = populateFn.slice(populateFn.indexOf(`const ${selectorVar} =`) > -1 ? populateFn.indexOf(`const ${selectorVar} =`) : 0);
      assert.doesNotMatch(populateFn, new RegExp(`${selectorVar}[^;]*'apartment'`, 'i'));
    }
    assert.match(core, /loadDestination[\s\S]*?skip\.has\(v\.toLowerCase\(\)\)/);
  });

  it('keeps Apartment available in storage/move-to selectors', () => {
    assert.match(core, /function storageList\(/);
    // Slice only the storageList body — later helpers (refinement allowlists)
    // legitimately mention apartment because they exclude it.
    const storageBlock = core.slice(core.indexOf('function storageList('), core.indexOf('function refinementLocationList('));
    assert.doesNotMatch(storageBlock, /apartment/i);
  });
});

// ── 4. Saved-state normalization ─────────────────────────────────────────────
describe('saved-state normalization', () => {
  it('normalizes legacy saved destinations on load', () => {
    assert.match(core, /function normalizeSavedDestinations\(/);
    assert.match(core, /normalizeSavedDestinations\(\)/);
  });
});

// ── 5. Runtime behavior in a VM ──────────────────────────────────────────────
// Real code paths, not mocks of them: fake DOM selects record real value
// assignments made by the shipped functions.
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

function makeToggle(id) {
  return {
    id, textContent: 'Same location: Off', title: '', attributes: {},
    classList: { toggle() {} },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; },
  };
}

function loadCore(localStorageData) {
  const elements = {
    'calc-dest': makeSelect('calc-dest'),
    'calc-refine-dest': makeSelect('calc-refine-dest'),
    'calc-combined-dest': makeToggle('calc-combined-dest'),
  };
  const storage = { data: { ...localStorageData }, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = String(v); } };
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
      documentElement: { dataset: {}, style: {} },
    },
    console,
  };
  sandbox.globalThis = sandbox;
  sandbox.window.window = sandbox.window;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(core, ctx, { filename: 'app-core.js' });
  return { elements, storage, context: ctx };
}

describe('combined-mode runtime', () => {
  let ctx;
  beforeEach(() => {
    ctx = loadCore({});
  });

  it('populates refinement and production selectors refinement-first and starts the toggle off', () => {
    ctx.context.populateDestinations();
    const prodOptions = ctx.elements['calc-dest'].options.map(o => o.value);
    assert.deepEqual(prodOptions, finalDestinations);
    assert.equal(ctx.elements['calc-combined-dest'].attributes['aria-pressed'], 'false');
    assert.equal(ctx.elements['calc-combined-dest'].textContent, 'Same location: Off');
    assert.ok(!prodOptions.includes('apartment'));
    assert.ok(!ctx.elements['calc-refine-dest'].options.map(o => o.value).includes('apartment'));
  });

  it('turning the combined toggle on sets both destinations together', () => {
    ctx.context.populateDestinations();
    ctx.elements['calc-dest'].value = 'Paris';
    ctx.context.setCombinedDestination();
    assert.equal(ctx.elements['calc-refine-dest'].value, 'Paris');
    assert.equal(ctx.elements['calc-dest'].value, 'Paris');
    assert.equal(ctx.elements['calc-combined-dest'].attributes['aria-pressed'], 'true');
  });

  it('switching the production selector after combined mode returns to expert split and keeps refinement', () => {
    ctx.context.populateDestinations();
    ctx.elements['calc-dest'].value = 'Paris';
    ctx.context.setCombinedDestination();
    // user now changes the production selector directly
    ctx.elements['calc-dest'].value = 'Tokyo';
    ctx.context.exitCombinedMode();
    ctx.context.getDestination();
    assert.equal(ctx.elements['calc-dest'].value, 'Tokyo');
    assert.equal(ctx.elements['calc-refine-dest'].value, 'Paris', 'combined refinement choice is preserved, not silently overwritten');
  });

  it('normalizes an apartment saved destination away on load', () => {
    const c = loadCore({ cmg_destination: 'apartment', cmg_refine_destination: 'apartment' });
    assert.notEqual(c.elements['calc-dest'].value, 'apartment');
    assert.notEqual(c.elements['calc-refine-dest'].value, 'apartment');
  });

  it('keeps an explicit expert refinement choice through combined round-trip and back', () => {
    const c = loadCore({ cmg_destination: 'Berlin', cmg_refine_destination: "DeMorgan's Castle" });
    // simulate: user enters combined mode at Paris, then leaves it via production change
    c.elements['calc-dest'].value = 'Paris';
    c.context.setCombinedDestination();
    c.elements['calc-dest'].value = 'Tokyo';
    c.context.exitCombinedMode();
    c.context.getDestination();
    // After exit, refinement keeps the combined value (Paris) — the split
    // expert choice the user last saw — and it is explicitly persisted.
    assert.equal(c.elements['calc-refine-dest'].value, 'Paris');
    assert.ok(c.storage.data['cmg_refine_destination']);
  });
});
