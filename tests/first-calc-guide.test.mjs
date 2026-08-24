// tests/first-calc-guide.test.mjs — P4 guided first-calculation experience
// ============================================================================
// Regression guard for the P4 onboarding slice. The calculator must:
//   * offer a dismissible guide panel (empty-state path) that walks a player
//     through choosing an item, setting quantity/colony/inventory inputs,
//     calculating, and reading the result,
//   * provide a SAFE sample-plan path that loads a real final item and runs
//     the normal calculation WITHOUT touching user data (no applyPlan, no
//     inventory mutation, no player creation, no saved plans),
//   * stay non-intrusive for returning users: hidden once dismissed, once a
//     calculation has been run on the device, or when no player exists,
//   * be accessible (labelled region, keyboard-operable buttons) and
//     responsive (single column on small screens).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const player = readFileSync(join(root, 'src/views/player.js'), 'utf8');
const app = readFileSync(join(root, 'src/app.js'), 'utf8');
const init = readFileSync(join(root, 'src/app-init.js'), 'utf8');
const css = readFileSync(join(root, 'src/styles/ux-release.css'), 'utf8');

describe('guided first-calculation panel', () => {
  it('ships a labelled, dismissible guide panel above the workbench', () => {
    const firstRun = html.indexOf('id="first-run"');
    const guide = html.indexOf('id="calc-guide"');
    const workbench = html.indexOf('class="calc-workbench"');
    assert.ok(guide > 0 && guide < workbench, 'calc-guide must sit between first-run and the workbench');
    assert.ok(firstRun < guide, 'first-run stays above the guide');
    assert.match(html, /id="calc-guide"[^>]*aria-labelledby="calc-guide-title"/);
    assert.match(html, /id="calc-guide-title"/);
    assert.match(html, /id="calc-guide-dismiss"[^>]*aria-label="[^"]*hide/i);
    assert.match(html, /id="calc-guide-sample"/);
  });

  it('walks through the four guided steps with matching copy', () => {
    const guideBlock = html.slice(html.indexOf('id="calc-guide"'), html.indexOf('id="calc-guide"') + 2600);
    assert.match(guideBlock, /Choose an item|choose an item/i);
    assert.match(guideBlock, /[Qq]uantity/);
    assert.match(guideBlock, /[Cc]olony/);
    assert.match(guideBlock, /[Ii]nventory/);
    assert.match(guideBlock, /[Cc]alculate/);
    assert.match(guideBlock, /[Rr]esult/);
  });

  it('stays hidden until a complete player profile exists and the user has not finished onboarding', () => {
    // Same visibility discipline as first-run: hidden while the profile gate is
    // active, when the user dismissed it, or when the device already has calculations (RECENT).
    assert.match(player, /getElementById\('calc-guide'\)/);
    assert.match(player, /const profileReady = hasCompletePlayerProfile\(\)/);
    assert.match(player, /firstRun\) firstRun\.hidden\s*=\s*profileReady/);
    assert.match(player, /guide\) guide\.hidden\s*=\s*!profileReady/);
    assert.match(player, /isCalcGuideDismissed\(\)/);
    assert.match(player, /RECENT\.length\s*>\s*0/);
  });

  it('persists dismissal in localStorage so returning users are not nagged', () => {
    assert.match(player, /er_calc_guide_dismissed_v1|er_calc_guide_v1|CALC_GUIDE_KEY/);
    assert.match(player, /localStorage\.setItem\([^)]*GUIDE_KEY[^)]*\)/);
    assert.match(player, /localStorage\.getItem\([^)]*GUIDE_KEY[^)]*\)/);
  });

  it('dismiss button hides the guide and returns focus to the item search', () => {
    assert.match(init, /calc-guide-dismiss/);
    assert.match(init, /dismissCalcGuide\(\)|dismissGuide\(\)/);
    assert.match(init, /picker-search/);
  });
});

describe('safe sample-plan path', () => {
  it('loads a real final item and runs the normal calculator without applying it', () => {
    assert.match(app, /function loadSamplePlan|function trySamplePlan/);
    const fnBlock = app.match(/function loadSamplePlan[\s\S]*?\n}/)?.[0] || app.match(/function trySamplePlan[\s\S]*?\n}/)?.[0];
    assert.ok(fnBlock, 'sample-plan loader must exist');
    assert.match(fnBlock, /runCalculator/);
    assert.doesNotMatch(fnBlock, /applyPlan/);
    assert.doesNotMatch(fnBlock, /snapshotInv/);
    assert.doesNotMatch(fnBlock, /setInv/);
    assert.doesNotMatch(fnBlock, /PLAYERS\.players\[/);
  });

  it('hides and persists the guide after a normal successful calculation without stealing result focus', () => {
    assert.match(app, /pushRecent\(item, qty\);[\s\S]*dismissCalcGuide\(\{ focus: false \}\)/);
    assert.match(player, /function dismissCalcGuide\(\{ focus = true \} = \{\}\)/);
    assert.match(player, /if \(focus\) document\.getElementById\('picker-search'\)\?\.focus\(\)/);
  });

  it('sample runs out of the recent list (no phantom user history)', () => {
    // runCalculator keeps its existing signature; the sample sets a transient
    // SAMPLE_RUN marker that is consumed by the next successful render, so
    // the same runCalculator() path is used with identical semantics.
    assert.match(app, /var SAMPLE_RUN = false/);
    assert.match(app, /function runCalculator\(\)/);
    assert.match(app, /if \(SAMPLE_RUN\)/);
    assert.match(app, /SAMPLE_RUN = true;/);
    assert.match(app, /SAMPLE_RUN = false;/);
  });

  it('sample item is a real final item with a computable plan', () => {
    const require = createRequire(import.meta.url);
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
    };
    globalThis.schedulePushInv = function () {};
    globalThis.refreshAll = function () {};
    globalThis.OBTAIN_SITE = {};
    window.OBTAIN_SITE = globalThis.OBTAIN_SITE;
    require(join(root, 'src', 'game_data.js'));
    require(join(root, 'src', 'store.js'));
    const engine = require(join(root, 'src', 'engine.js'));

    // Pull the sample item name out of the loader source.
    const fnBlock = app.match(/function loadSamplePlan[\s\S]*?\n}/)?.[0] || app.match(/function trySamplePlan[\s\S]*?\n}/)?.[0];
    const nameMatch = fnBlock.match(/item\s*=\s*'([^']+)'|item:\s*'([^']+)'|'([^']+)'/);
    assert.ok(nameMatch, 'sample loader must name the item');
    const sampleItem = nameMatch[1] || nameMatch[2] || nameMatch[3];
    assert.ok(engine.FINAL_ITEMS.includes(sampleItem), `"${sampleItem}" must be a final item`);
    const plan = engine.compute(sampleItem, 10, engine.ALTERNATIVE_CHOICES, null, null, 'Berlin', { prod: 0, mine: 0, trans: 0 });
    assert.ok(plan && plan.plan && plan.plan.steps.length > 0, 'sample item must produce a computable plan');
  });
});

describe('guide styling', () => {
  it('hides the guide while [hidden] is set', () => {
    assert.match(css, /\.calc-guide\[hidden\]\s*\{[^}]*display:\s*none/);
  });

  it('is responsive — single column on small screens', () => {
    assert.match(css, /@media \(max-width: 760px\)/);
    const mobile = css.slice(css.indexOf('@media (max-width: 760px)'));
    assert.match(mobile, /\.calc-guide\s*\{[^}]*grid-template-columns:\s*1fr/);
  });
});
