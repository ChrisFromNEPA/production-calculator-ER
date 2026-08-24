// tests/decision-support.test.mjs — P4 decision summary + colony what-if comparison
// ============================================================================
// Regression guard for the P4 decision-support slice (2026-08-14):
//
//   decisionSummary(plan)  — a player-readable tradeoff summary of the plan's
//     existing calculation outputs: up-front investment, cost/unit,
//     net faction cost per unit, cheapest refinement path and speed. It must reuse
//     ONLY numbers planCost/netPathCost already compute — the headline figures
//     must match the hero strip exactly, never a second cheaper estimate.
//     Unavailable metrics (craft durations, unpriced paths) are labelled
//     honestly — no invented rankings, no invented numbers.
//
//   colonyCompareRows(spec) / renderColonyCompare(spec) — a what-if workflow:
//     the SAME plan recomputed at every production colony with the engine's
//     existing colony/path machinery (compute + planCost), so tax, ownership,
//     mine sites and transport all follow the destination. The current
//     destination is marked "here"; ★ cheapest goes only to a unique cheapest
//     fully-priced colony; unpriced rows show n/a, never a number.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteDir = join(__dirname, '..');
const require = createRequire(import.meta.url);

// ---- minimal browser stubs (same shape as harness.mjs / show-the-math) ----
globalThis.window = {
  matchMedia() { return { matches: false, addEventListener() {} }; },
  location: { pathname: '/', hash: '' }, history: { replaceState() {} },
  navigator: { clipboard: { writeText() { return Promise.resolve(); } } },
  btoa, atob,
};
globalThis.localStorage = { _data: {}, getItem(k) { return this._data[k] || null; }, setItem(k, v) { this._data[k] = v; }, removeItem(k) { delete this._data[k]; } };
globalThis.document = {
  getElementById() { return null; }, querySelectorAll() { return []; },
  createElement(tag) { return { tagName: tag, classList: { add(){}, remove(){}, toggle(){}, contains(){} }, addEventListener(){}, setAttribute(){}, getAttribute(){ return null; }, appendChild(c){ return c; }, querySelector(){ return null; }, closest(){ return null; }, style:{}, dataset:{}, innerHTML:'', textContent:'', value:'', checked:false, hidden:false, click(){}, focus(){} }; },
  addEventListener() {}, querySelector() { return null; }, body: { appendChild(c){ return c; }, querySelector(){ return null; } },
  documentElement: { dataset: {}, setAttribute() {} },
};
globalThis.schedulePushInv = function () {};
globalThis.refreshAll = function () {};
globalThis.OBTAIN_SITE = {};
window.OBTAIN_SITE = globalThis.OBTAIN_SITE;

// ---- Load order matches the browser: data → costs → store → engine → app-core ----
require(join(siteDir, 'src', 'game_data.js'));
require(join(siteDir, 'src', 'costs.js'));
require(join(siteDir, 'src', 'store.js'));
require(join(siteDir, 'src', 'factions.js'));
const engine = require(join(siteDir, 'src', 'engine.js'));
vm.runInThisContext(readFileSync(join(siteDir, 'src', 'app-core.js'), 'utf8'), { filename: 'app-core.js' });

const appSrc = readFileSync(join(siteDir, 'src', 'app.js'), 'utf8');

const { compute } = engine;
const GAME_DATA = window.GAME_DATA;

// Strip thousands separators and any leading sign/space so number assertions
// are locale-independent ('+ 5,548 UC' → 5548, '− 123.4 UC' → 123.4).
const flat = s => String(s).replace(/,/g, '');
const num = s => parseFloat(flat(s).replace(/^[^\d.-]*/, ''));
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Value of a decision-summary line by its exact label.
function decisionVal(html, label) {
  const re = new RegExp('<span class="decision-line-label">' + escapeRe(label) + '</span>[\\s\\S]*?<span class="decision-line-val">([^<]*)</span>');
  const m = html.match(re);
  assert.ok(m, `expected a decision line labelled "${label}"`);
  return m[1].trim();
}
function produced(plan) {
  return plan.steps.filter(s => s.type === 'manufacture' && s.produced > 0)
    .reduce((s, x) => s + x.produced, 0);
}
// The exact input description of the alternative path the engine used.
function usedPathDesc(item, altIndex) {
  const r = GAME_DATA.recipes[engine.RECIPES_BY_OUTPUT[item][0]._idx];
  return r.inputs_alternatives[altIndex].map(x => fmt(x.quantity) + ' ' + x.item).join(' + ');
}
const PLAN_SPEC = {
  items: [{ item: 'Emergency MediKit', qty: 300 }],
  chosen: {}, ledger: {}, invLoc: null,
  discounts: { prod: 0, mine: 0, trans: 0 }, dest: 'Berlin',
};

describe('decision summary (shipped app-core renderer)', () => {
  it('renders an accessible native disclosure with the tradeoff lines', () => {
    const res = compute([{ item: 'Linner PP7', qty: 2 }], {}, {}, null, 'Berlin', null);
    const html = decisionSummary(res.plan);
    assert.match(html, /<details class="decision-summary" data-decision-summary>/);
    assert.match(html, /<summary>Decision summary/);
    const lines = html.match(/class="decision-line"/g) || [];
    assert.ok(lines.length >= 5, `expected investment/cost/guild/path/speed lines, got ${lines.length}`);
    assert.match(html, /Up-front investment/);
    assert.match(html, /Cost per unit/);
    assert.match(html, /Net faction cost per unit/);
    assert.match(html, /Speed/);
  });

  it('does not inject the removed decision panel into production results', () => {
    assert.doesNotMatch(appSrc.slice(appSrc.indexOf('function renderPlan('), appSrc.indexOf('function runCalculator(')), /decisionSummary\(/);
    assert.doesNotMatch(appSrc.slice(appSrc.indexOf('function runMultiPlan('), appSrc.indexOf('// ── Saved production plans')), /decisionSummary\(/);
  });

  it('Investment / Cost per unit / Net faction cost per unit match planCost exactly', () => {
    const res = compute([{ item: 'Linner PP7', qty: 2 }], {}, {}, null, 'Berlin', null);
    const cost = planCost(res.plan);
    const made = produced(res.plan);
    assert.ok(cost.grand > 0 && made > 0, 'plan should be priced and produce finals');
    const html = decisionSummary(res.plan);
    assert.equal(num(decisionVal(html, 'Up-front investment')), Math.round(cost.grand * 100) / 100,
      'Investment must be exactly planCost.grand');
    assert.ok(Math.abs(num(decisionVal(html, 'Cost per unit')) - cost.grand / made) < 0.01,
      'Cost/unit should equal Investment ÷ units');
    assert.ok(Math.abs(num(decisionVal(html, 'Net faction cost per unit')) - (cost.grand - cost.rebate) / made) < 0.01,
      'Net faction cost/unit should equal (Investment − rebate) ÷ units');
    // The hero strip prints the same figures — the summary must never diverge.
    const stats = renderPlanStats(res.plan);
    assert.ok(flat(stats).includes(flat(fmtUC(cost.grand))), 'hero Investment should equal planCost.grand');
  });

  it('cheapest-path lines name the used path and mark the cheapest priced path', () => {
    const res = compute([{ item: 'Linner PP7', qty: 2 }], {}, {}, null, 'Berlin', null);
    const html = decisionSummary(res.plan);
    // Every step that has alternative input sets gets a cheapest-path line.
    const altSteps = res.plan.steps.filter(s => {
      const recs = engine.RECIPES_BY_OUTPUT[s.item];
      const r = GAME_DATA.recipes[recs[0]._idx];
      return r.inputs_alternatives && r.inputs_alternatives.length > 1;
    });
    assert.ok(altSteps.length >= 2, 'plan should contain alternative-path steps');
    altSteps.forEach(s => {
      const label = 'Cheapest refinement path · ' + displayName(s.item);
      const val = decisionVal(html, label);
      // The value names the input set the engine actually used.
      assert.ok(flat(val).includes(flat(usedPathDesc(s.item, s.altIndex))),
        `line for ${s.item} should name the used path inputs`);
    });
    // The engine picks the cheapest priced path; its own netPathCost is the
    // ground truth the ★ must agree with.
    const costs = GAME_DATA.recipes[engine.RECIPES_BY_OUTPUT['Linner PP7'][0]._idx]
      .inputs_alternatives.map((a, i) => engine.netPathCost('Linner PP7', i, 'Berlin', {}, 0));
    assert.ok(costs.every(c => c != null), 'Linner PP7 paths should be priced');
    const best = costs.indexOf(Math.min(...costs));
    assert.equal(best, res.plan.steps.find(s => s.item === 'Linner PP7').altIndex,
      'engine should have chosen the cheapest path');
    assert.match(html, /★ cheapest priced path/);
  });

  it('speed line reports slot runs and honestly labels the no-craft-time limitation', () => {
    const res = compute([{ item: 'Emergency MediKit', qty: 300 }], {}, {}, null, 'Berlin', null);
    const cost = planCost(res.plan);
    const html = decisionSummary(res.plan);
    assert.ok(cost.runs > 0 && cost.batches > 0, 'plan should have runs');
    assert.ok(flat(html).includes(flat(String(cost.runs)) + ' slot run'),
      `speed line should report ${cost.runs} slot runs`);
    assert.ok(flat(html).includes(flat(String(cost.batches)) + ' slot-batch'),
      `speed line should report ${cost.batches} slot-batches`);
    assert.match(html, /no craft durations|publishes no craft|wall-clock/i,
      'must honestly label that the game publishes no craft times');
  });

  it('stays honest with unpriced items: partial note, no invented numbers', () => {
    const plan = {
      steps: [{
        item: 'Definitely Not A Real Item', type: 'manufacture', produced: 4, batches: 4,
        outQty: 1, altIndex: null, surplus: 0, inputs: [], resolvedInputs: [],
      }],
      acquire: {}, transport: {}, surplus: {},
    };
    const html = decisionSummary(plan);
    assert.match(html, /no price in the cost data|partial/i);
    assert.match(html, /no alternative paths/);
    assert.doesNotMatch(html, /★ cheapest priced path/,
      'unpriced plan must not claim a cheapest path');
  });

  it('empty plan renders without crashing and says nothing runs', () => {
    const html = decisionSummary({ steps: [], acquire: {}, transport: {}, surplus: {} });
    assert.match(html, /<details class="decision-summary"/);
    assert.match(html, /no alternative paths/);
    assert.match(html, /0 slot run/);
  });
});

describe('colony what-if comparison (shipped app-core renderer)', () => {
  it('returns one row per production colony with figures from the engine planCost', () => {
    const rows = colonyCompareRows(PLAN_SPEC);
    assert.equal(rows.length, 7, `one row per final-production colony (got ${rows.length})`);
    rows.forEach(r => {
      // Recomputed independently with the same inputs: every figure must be
      // exactly what the engine's planCost reports at that destination.
      const res = compute(PLAN_SPEC.items, PLAN_SPEC.chosen, {}, null, r.colony, PLAN_SPEC.discounts);
      const cost = planCost(res.plan, r.colony);
      if (cost.anyUnknown) {
        assert.equal(r.investment, null, 'unknown plan must not invent investment');
        assert.equal(r.perUnit, null, 'unknown plan must not invent per-unit cost');
        assert.equal(r.netFactionUnit, null, 'unknown plan must not invent net faction cost');
      } else {
        const made = produced(res.plan);
        assert.ok(Math.abs(r.investment - cost.grand) < 0.01, `${r.colony} investment must equal planCost.grand`);
        assert.ok(Math.abs(r.perUnit - cost.grand / made) < 0.01, `${r.colony} per-unit must equal grand ÷ produced`);
        assert.ok(Math.abs(r.netFactionUnit - (cost.grand - cost.rebate) / made) < 0.01, `${r.colony} guild/unit must equal (grand − rebate) ÷ produced`);
      }
      assert.equal(typeof r.tax, 'number');
      assert.equal(r.here, r.colony === 'Berlin');
    });
  });

  it('marks the current destination and only awards ★ to a unique cheapest priced colony', () => {
    // Default world: no taxes, no ownership — every colony costs the same, so
    // there is NO unique cheapest and no ★ may be shown.
    const rows = colonyCompareRows(PLAN_SPEC);
    const here = rows.find(r => r.here);
    assert.ok(here, 'current destination row should exist');
    assert.equal(here.colony, 'Berlin');
    assert.equal(here.delta, null, 'the here row has no delta');
    assert.ok(!rows.some(r => r.cheapest),
      'no unique cheapest in a flat world — ★ must not be invented');
    // Priced rows must all be fully priced in this plan.
    assert.ok(rows.every(r => r.netFactionUnit != null), 'medkit plan should be priced everywhere');
  });

  it('here row matches the on-screen plan even when the shared ledger was consumed', () => {
    // compute() MUTATES the ledger it is handed (owned stock is deducted as
    // the plan is built). renderPlan hands the comparison its own untouched
    // copy of the starting inventory; this test simulates both: compute with
    // a consumed ledger, then compare from the FULL ledger, and require that
    // the here row equals the plan that was actually computed from full stock.
    const fullLedger = { chemicals: 400, textiles: 600, bioplasma: 300, glass: 300 };
    const invLoc = {
      chemicals: [{ location: 'Manhattan', qty: 400 }],
      textiles: [{ location: 'Berlin', qty: 600 }],
      bioplasma: [{ location: 'Paris', qty: 300 }],
      glass: [{ location: 'Berlin', qty: 300 }],
    };
    const discounts = { prod: 0, mine: 0, trans: 0 };
    const consumedLedger = Object.assign({}, fullLedger);
    const res = compute([{ item: 'Emergency MediKit', qty: 300 }], {}, consumedLedger, invLoc, 'Berlin', discounts);
    assert.notDeepEqual(consumedLedger, fullLedger, 'compute should consume owned stock (sanity)');
    const cost = planCost(res.plan, 'Berlin');
    const rows = colonyCompareRows({
      items: [{ item: 'Emergency MediKit', qty: 300 }], chosen: {},
      ledger: fullLedger, invLoc, discounts, dest: 'Berlin',
    });
    const here = rows.find(r => r.here);
    assert.ok(here, 'here row should exist');
    assert.ok(Math.abs(here.investment - cost.grand) < 0.01,
      `here row (${here.investment}) must equal the on-screen plan (${cost.grand}) — full stock, not the consumed ledger`);
    const made = produced(res.plan);
    assert.ok(Math.abs(here.netFactionUnit - (cost.grand - cost.rebate) / made) < 0.01,
      'here guild/unit must match the on-screen plan too');
  });

  it('under a seeded taxed-owned world, Berlin is cheapest to the guild and deltas are shown', () => {
    // Berlin taxed 25% and owned by CMG; the active faction is CMG, so the 85%
    // owner return lands in guild funds. The 25% tax raises Berlin's per-unit
    // cost ABOVE untaxed colonies, but the return drops its net faction cost BELOW
    // them — the exact tradeoff the what-if exists to surface.
    window.STORE.PLAYERS.players = { T: [] };
    window.STORE.PLAYERS.profiles = { T: { faction: 'CMG' } };
    window.STORE.PLAYERS.active = 'T';
    window.STORE.recomputeInv();
    COLONY_OWNER = { Berlin: ['CMG'] };
    COLONY_TAX = { Berlin: 25 };
    refreshEngineFactionContext();
    try {
      const rows = colonyCompareRows({ ...PLAN_SPEC, dest: 'Berlin' });
      const here = rows.find(r => r.here);
      assert.equal(here.colony, 'Berlin');
      assert.equal(here.tax, 25);
      assert.ok(here.owned, 'CMG should own Berlin in the seeded world');
      const others = rows.filter(r => !r.here);
      assert.ok(others.length > 0);
      // Berlin's per-unit (taxed) is above an untaxed colony…
      assert.ok(here.perUnit > others[0].perUnit,
        `taxed Berlin per-unit (${here.perUnit}) should exceed an untaxed colony (${others[0].perUnit})`);
      // …but its net faction cost is below them, so it is the unique cheapest.
      assert.ok(here.netFactionUnit < others[0].netFactionUnit,
        `owned Berlin guild/unit (${here.netFactionUnit}) should beat an unowned colony (${others[0].netFactionUnit})`);
      assert.equal(here.cheapest, true, 'Berlin must carry the ★ as unique cheapest');
      assert.ok(!others.some(r => r.cheapest), 'no other colony may carry the ★');
      // Delta is against the here row, signed by direction.
      others.forEach(r => {
        assert.equal(typeof r.delta, 'number');
        assert.ok(Math.abs(r.delta - (r.netFactionUnit - here.netFactionUnit)) < 0.001,
          `delta for ${r.colony} should be guild/unit minus here`);
        assert.ok(r.delta > 0, `every other colony is more expensive to the guild (+${r.delta})`);
      });
    } finally {
      COLONY_OWNER = cloneDefaultColonyOwners();
      COLONY_TAX = {};
      refreshEngineFactionContext();
      window.STORE.PLAYERS.active = '';
      window.STORE.recomputeInv();
    }
  });

  it('renders an accessible table in a responsive wrapper with a Plan here button per row', () => {
    const html = renderColonyCompare(PLAN_SPEC);
    assert.match(html, /<details class="colony-compare" data-colony-compare>/);
    assert.match(html, /<summary>Compare colonies/);
    assert.match(html, /<table/);
    assert.match(html, /<caption class="sr-only"/);
    assert.match(html, /scope="col"/);
    assert.match(html, /unit-scroll/, 'table must sit in the shared responsive scroll wrapper');
    assert.match(html, /data-whatif-plan="/, 'every non-here colony gets a Plan here action');
    assert.match(html, /Net faction cost\/unit/);
  });

  it('does not inject the removed colony comparison into production results', () => {
    assert.doesNotMatch(appSrc.slice(appSrc.indexOf('function renderPlan('), appSrc.indexOf('function runCalculator(')), /renderColonyCompare\(/);
    assert.doesNotMatch(appSrc.slice(appSrc.indexOf('function runMultiPlan('), appSrc.indexOf('// ── Saved production plans')), /renderColonyCompare\(/);
  });

  it('unpriced items: n/a cells, no invented numbers', () => {
    const spec = {
      items: [{ item: 'Definitely Not A Real Item', qty: 4 }],
      chosen: {}, ledger: {}, invLoc: null,
      discounts: { prod: 0, mine: 0, trans: 0 }, dest: 'Berlin',
    };
    const rows = colonyCompareRows(spec);
    assert.ok(rows.length > 0, 'rows are still returned per colony');
    rows.forEach(r => {
      assert.equal(r.investment, null);
      assert.equal(r.perUnit, null);
      assert.equal(r.netFactionUnit, null);
    });
    const html = renderColonyCompare(spec);
    assert.match(html, /n\/a/);
    assert.match(html, /price data|unpriced|ranked|unavailable/i);
    assert.doesNotMatch(html, /cc-star/, 'no row may carry the ★ marker without priced data');
  });

  it('empty spec renders nothing and does not crash', () => {
    assert.deepEqual(colonyCompareRows({ items: [], dest: 'Berlin' }), []);
    assert.equal(renderColonyCompare({ items: [], dest: 'Berlin' }), '');
  });
});
