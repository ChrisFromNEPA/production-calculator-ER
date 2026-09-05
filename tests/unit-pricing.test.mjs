// tests/unit-pricing.test.mjs — per-unit pricing table (renderPerUnitPricing)
// ============================================================================
// Regression guard for the per-unit pricing panel added to the plan stats
// (2026-08-10): one row per final item the plan produces, with sticker
// UC/unit (estPathCost, shipped app.js code) and net CMG/unit (netPathCost,
// shipped engine code) on the path the plan actually chose. Guards that the
// shipped app-core renderer agrees with the shipped estimators, that unpriced
// items render n/a instead of inventing numbers, and that the panel stays
// empty when there is nothing priced or nothing to produce.
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

// ---- minimal browser stubs (same shape as harness.mjs) ----
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
// engine.js reads window.OBTAIN_SITE, app-core reads the bare global — mirror both.
globalThis.OBTAIN_SITE = {};
window.OBTAIN_SITE = globalThis.OBTAIN_SITE;

// ---- Load order matches the browser: data → costs → store → engine → app-core ----
require(join(siteDir, 'src', 'game_data.js'));
require(join(siteDir, 'src', 'costs.js'));
require(join(siteDir, 'src', 'store.js'));
const engine = require(join(siteDir, 'src', 'engine.js'));

// app-core.js is a classic script; require() keeps its top-level functions
// script-scoped, so run it in the shared context the way the browser does.
vm.runInThisContext(readFileSync(join(siteDir, 'src', 'app-core.js'), 'utf8'), { filename: 'app-core.js' });

// estPathCost / estUnitCost live in app.js (loaded after app-core in the
// browser). Extract the shipped functions, same technique as path-cost.test.mjs.
const appSrc = readFileSync(join(siteDir, 'src', 'app.js'), 'utf8');
function extractFn(name) {
  const re = new RegExp('function ' + name + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}', 'm');
  const m = appSrc.match(re);
  assert.ok(m, `could not extract ${name} from app.js`);
  return m[0];
}
// Indirect eval → functions land on the global scope (module scope is strict).
(0, eval)(extractFn('estUnitCost'));
(0, eval)(extractFn('estPathCost'));

// Mirrors for the globals the extracted functions reference (app-core already
// declared DATA / RECIPES_BY_OUTPUT / costFor in the shared context; these
// fallbacks only matter if that declaration ever changes shape).
globalThis.DATA = globalThis.DATA || window.GAME_DATA;
globalThis.RECIPES_BY_OUTPUT = globalThis.RECIPES_BY_OUTPUT || engine.RECIPES_BY_OUTPUT;

const { compute } = engine;
// app-core installs explicit faction/ownership hooks at load. A fresh public
// profile is unaffiliated and does not invent colony holdings, so the default
// regression below expects gross cost and net faction cost to match.

// Strip thousands separators so number assertions are locale-independent.
const flat = s => String(s).replace(/,/g, '');
// Extract a table row's cells (tags stripped) for the item named in the row.
function rowTds(html, name) {
  const tr = html.split('<tr>').find(r => r.toLowerCase().includes(name.toLowerCase()));
  assert.ok(tr, `row for "${name}" should exist`);
  return [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
}

describe('per-unit pricing table (shipped app-core renderer)', () => {
  it('single-final plan: table rows EXACTLY match the hero strip figures', () => {
    // The 2026-08-10 regression: the table quoted listed-price estimates
    // while the hero quoted drift-discounted actuals, so a 300-medkit run
    // showed 121.68 in the table and 120.75 in the hero. With actual-cost
    // attribution the single-final table MUST equal grand/produced and
    // (grand − rebate)/produced — the very numbers the hero prints.
    const res = compute([{ item: 'Linner PP7', qty: 2 }], {}, {}, null, 'Paris', null);
    const cost = planCost(res.plan);
    const produced = res.plan.steps.filter(s => s.type === 'manufacture' && s.produced > 0)
      .reduce((s, x) => s + x.produced, 0);
    assert.ok(produced > 0, 'plan should produce finals');
    const html = renderPerUnitPricing(res.plan);
    assert.ok(html.includes('unit-panel'), 'panel should render for a produced final');
    assert.ok(html.includes('Cost/unit') && html.includes('Net faction cost/unit'),
      'table headers should match the hero vocabulary');
    assert.ok(html.toLowerCase().includes('linner pp7'), 'row should name the final item');

    const tds = rowTds(html, 'linner pp7');
    const unit = parseFloat(flat(tds[4]));
    const guild = parseFloat(flat(tds[5]));
    assert.ok(Math.abs(unit - cost.grand / produced) < 0.01,
      `Cost/unit (${unit}) should equal hero Cost/unit (${cost.grand / produced})`);
    assert.ok(Math.abs(guild - (cost.grand - cost.rebate) / produced) < 0.01,
      `Net faction cost/unit (${guild}) should equal hero figure (${(cost.grand - cost.rebate) / produced})`);
    // Single-final plan: no average note (nothing to average over).
    const stats = renderPlanStats(res.plan);
    assert.ok(!stats.includes('avg of'), 'single-final hero should not claim an average');
  });

  it('combined plan: rows sum exactly to the Investment and net faction cost totals', () => {
    const res = compute([{ item: 'Linner PP7', qty: 2 }, { item: 'Emergency MediKit', qty: 5 }],
      {}, {}, null, 'Paris', null);
    const cost = planCost(res.plan);
    const html = renderPerUnitPricing(res.plan);
    const low = html.toLowerCase();
    assert.ok(low.includes('linner pp7') && low.includes('emergency medikit'), 'both finals present');

    const pp7 = rowTds(html, 'linner pp7');
    const mk = rowTds(html, 'emergency medikit');
    // made is td index 2 (may carry a "+N" surplus badge), unit cols 4 and 5.
    const made = r => parseInt(flat(r[2]), 10);
    const sumTotal = parseFloat(flat(pp7[4])) * made(pp7) + parseFloat(flat(mk[4])) * made(mk);
    const sumGuild = parseFloat(flat(pp7[5])) * made(pp7) + parseFloat(flat(mk[5])) * made(mk);
    assert.ok(Math.abs(sumTotal - cost.grand) < 0.5,
      `Cost/unit rows should sum to Investment (${sumTotal} vs ${cost.grand})`);
    assert.ok(Math.abs(sumGuild - (cost.grand - cost.rebate)) < 0.5,
      `Guild rows should sum to net faction cost (${sumGuild} vs ${cost.grand - cost.rebate})`);
    // Full plan stats should embed the panel and the hero together.
    const stats = renderPlanStats(res.plan);
    assert.ok(stats.includes('unit-panel'), 'renderPlanStats should include the panel');
    assert.ok(stats.includes('cost-hero'), 'renderPlanStats should include the hero');
    assert.ok(stats.includes('avg of 2 items'), 'multi-final hero should flag the plan-wide average');
    assert.ok(stats.includes('avg per slot-batch'), 'breakdown should include avg per slot-batch');
  });

  it('unpriced items render n/a, never a number', () => {
    const plan = {
      steps: [{ item: 'Linner PP7', type: 'manufacture', produced: 4, batches: 4, outQty: 1, altIndex: 0, surplus: 0 },
              { item: 'Definitely Not A Real Item', type: 'manufacture', produced: 2, batches: 2, outQty: 1, altIndex: null, surplus: 0 }],
    };
    const html = renderPerUnitPricing(plan);
    assert.ok(html.toLowerCase().includes('linner pp7') && html.toLowerCase().includes('definitely not a real item'));
    const fakeRow = html.split('<tr>').find(r => r.toLowerCase().includes('definitely not a real item'));
    assert.ok(fakeRow.includes('n/a'), 'unpriced item should show n/a');
    assert.doesNotMatch(fakeRow, /≈ [\d]/, 'unpriced item must not show a number');
  });

  it('returns empty when nothing is produced or nothing is priced', () => {
    assert.equal(renderPerUnitPricing({ steps: [] }), '');
    assert.equal(renderPerUnitPricing({ steps: [{ item: 'X', type: 'refine', produced: 5, batches: 5, outQty: 1 }] }), '');
    const allUnpriced = { steps: [{ item: 'Nope', type: 'manufacture', produced: 3, batches: 3, outQty: 1, altIndex: null, surplus: 0 }] };
    assert.equal(renderPerUnitPricing(allUnpriced), '');
  });

  it('requested quantity belongs to the computed plan, not a previous calculation or pending tray', () => {
    assert.equal(planRequestedQty('Linner PP7'), null);
    globalThis.CALC_TRAY = [{ item: 'Emergency MediKit', qty: 99 }];
    try {
      for (const qty of [10, 20]) {
        const { plan } = compute([{ item: 'Emergency MediKit', qty }], {}, {}, null, 'Paris', null);
        assert.equal(planRequestedQty('Emergency MediKit', plan), qty);
        const cells = rowTds(renderPerUnitPricing(plan), 'Emergency Medikit');
        assert.equal(cells[1], String(qty));
        assert.match(cells[2], qty === 10 ? /^12/ : /^21/);
      }
      const { plan } = compute([{ item: 'Emergency MediKit', qty: 4 }, { item: 'Emergency MediKit', qty: 6 }], {}, {}, null, 'Paris', null);
      assert.equal(planRequestedQty('Emergency MediKit', plan), 10);
      assert.equal(planRequestedQty('something else', plan), null);
    } finally {
      delete globalThis.CALC_TRAY;
    }
  });

  it('hero strip shows Investment, Cost/unit and Net-to-guild/unit prominently', () => {
    const res = compute([{ item: 'Linner PP7', qty: 2 }, { item: 'Emergency MediKit', qty: 5 }],
      {}, {}, null, 'Paris', null);
    const cost = planCost(res.plan);
    const produced = res.plan.steps.filter(s => s.type === 'manufacture' && s.produced > 0)
      .reduce((s, x) => s + x.produced, 0);
    assert.ok(produced > 0, 'plan should produce finals');
    const html = renderPlanStats(res.plan);
    assert.ok(html.includes('cost-hero'), 'hero strip should render');
    assert.ok(html.includes('>Investment<') && html.includes('>Cost / unit<') && html.includes('>Net faction cost / unit<'),
      'all three headline labels present');
    const f = flat(html);
    assert.ok(f.includes(flat(fmtUC(cost.grand))), `investment ${cost.grand} should appear big`);
    assert.ok(f.includes(flat(fmtUC(cost.grand / produced))), `cost/unit ${cost.grand / produced} should appear`);
    assert.ok(f.includes(flat(fmtUC((cost.grand - cost.rebate) / produced))), 'net/unit should appear');
    assert.equal(cost.rebate, 0, 'fresh unaffiliated profile must not invent a faction rebate');
    const netUnit = (cost.grand - cost.rebate) / produced;
    assert.equal(netUnit, cost.grand / produced, 'unaffiliated net faction cost equals player spend');
  });

  it('flags queued finals fully covered by owned stock', () => {
    globalThis.CALC_TRAY = [{ item: 'Linner PP7', qty: 1 }, { item: 'Emergency MediKit', qty: 1 }];
    try {
      const plan = {
        steps: [{ item: 'Linner PP7', type: 'manufacture', produced: 4, batches: 4, outQty: 1, altIndex: 0, surplus: 0 }],
      };
      const html = renderPerUnitPricing(plan);
      assert.ok(html.includes('1 queued item fully covered by owned stock'),
        `covered-stock note should appear:\n${html}`);
    } finally {
      delete globalThis.CALC_TRAY;
    }
  });
});
