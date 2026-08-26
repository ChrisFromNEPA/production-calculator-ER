import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const app = readFileSync(join(root, 'src/app.js'), 'utf8');
const core = readFileSync(join(root, 'src/app-core.js'), 'utf8');
const css = readFileSync(join(root, 'src/styles.css'), 'utf8') + readFileSync(join(root, 'src/styles/ux-release.css'), 'utf8');

describe('calculator UX improvements', () => {
  it('explains local profile setup and faction impact before the calculator starts', () => {
    assert.match(html, /Set up a local player profile/);
    assert.match(html, /Your profile stays in this browser/i);
    assert.match(html, /does not lock recipes/i);
    assert.match(html, /Continue to calculator/);
  });

  it('validates quantity instead of coercing invalid input into a valid plan', () => {
    assert.match(html, /id="calc-qty"[^>]*min="1"[^>]*step="1"/);
    assert.match(html, /id="calc-qty-error"[^>]*role="alert"/);
    assert.match(app, /quantity must be a whole number of at least 1/i);
    assert.match(app, /setAttribute\('aria-invalid', 'true'\)/);
    assert.match(app, /calculation-error/);
  });

  it('uses complete plain-language result and route summaries', () => {
    assert.match(app, /This production run makes[^<]*<b>.*displayName\(item\)/s);
    assert.match(app, /function renderRouteSummary\(/);
    assert.match(app, /<b>Refine<\/b> intermediates at/);
    assert.match(app, /<b>Manufacture<\/b> the final item at/);
    assert.match(app, /<b>Move<\/b> completed intermediates to/);
  });

  it('uses the shared rich stats presentation without repeating the destination header', () => {
    assert.match(app, /const statsHtml = renderPlanStats\(plan\)/);
    assert.match(core, /class="plan-top"/);
    assert.match(core, /class="cost-panel/);
    assert.match(core, /renderPerUnitPricing\(plan\)/);
    assert.match(app, /Route cards show exact moves and quantities/i);
    assert.doesNotMatch(app, /<h3>\$\{fmt\(qty\)\} × \$\{esc\(displayName\(item\)\)\} at \$\{esc\(DESTINATION\)\}<\/h3>/);
  });

  it('styles the route summary and visible metric explanations for readable scanning', () => {
    assert.match(css, /\.route-summary/);
    assert.match(css, /\.cost-panel/);
    assert.match(css, /\.calculation-error/);
  });

  it('keeps plan statistics in the result without a separate execution summary', () => {
    assert.doesNotMatch(html, /calc-execution-summary|Current execution summary|calc-execution-next/);
    assert.doesNotMatch(app, /syncCalcExecutionSummary|calc-execution/);
    assert.doesNotMatch(core, /syncCalcExecutionSummary|calc-execution/);
    assert.doesNotMatch(css, /calc-execution-summary/);
    assert.match(core, /production actions/);
    assert.match(core, /refine.*manufacture/s);
  });

  it('keeps stale summary panels out of the rendered production result', () => {
    const singleRender = app.slice(app.indexOf('function renderPlan('), app.indexOf('function runCalculator('));
    const combinedRender = app.slice(app.indexOf('function runMultiPlan('), app.indexOf('// ── Saved production plans'));
    for (const render of [singleRender, combinedRender]) {
      assert.doesNotMatch(render, /renderRouteSummary\(/);
      assert.doesNotMatch(render, /showTheMathPanel\(/);
      assert.doesNotMatch(render, /decisionSummary\(/);
      assert.doesNotMatch(render, /renderColonyCompare\(/);
    }
  });

  it('keeps the combined planner inventory-location ledger intact', () => {
    const combinedRender = app.slice(app.indexOf('function runMultiPlan('), app.indexOf('// ── Saved production plans'));
    assert.match(combinedRender, /const invLoc = \{\};/);
    assert.match(combinedRender, /compute\(CALC_TRAY, ALTERNATIVE_CHOICES, ledger, invLoc/);
  });
});
