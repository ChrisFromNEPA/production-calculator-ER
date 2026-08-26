import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const app = readFileSync(join(root, 'src/app.js'), 'utf8');
const init = readFileSync(join(root, 'src/app-init.js'), 'utf8');
const core = readFileSync(join(root, 'src/app-core.js'), 'utf8');
const css = readFileSync(join(root, 'src/styles.css'), 'utf8');
const singleRender = app.slice(app.indexOf('function renderPlan('), app.indexOf('function runCalculator('));

describe('single production plan experience', () => {
  it('updates a single-plan batch card in place without rerunning or scrolling the plan', () => {
    const start = app.indexOf('function recordProductionProgress(');
    const end = app.indexOf('// ── Plan identity', start);
    const fn = app.slice(start, end);
    assert.doesNotMatch(fn, /runCalculator\(|runMultiPlan\(|rerunActivePlan\(/);
    assert.match(fn, /updateProductionProgressCard\(card/);
    const handler = init.slice(init.indexOf('// Player-facing production progress'), init.indexOf('// Path-choice dropdowns'));
    assert.match(handler, /stopPropagation\(\)/);
    assert.match(handler, /recordProductionProgress\(run, e\.currentTarget\)/);
  });

  it('gives single plans the same visual hierarchy as combined plans', () => {
    assert.match(app, /class="plan-summary single-head"/);
    assert.match(app, /single-head-kicker/);
    assert.match(app, /Production plan/);
    assert.match(singleRender, /const statsHtml = renderPlanStats\(plan\);/);
    assert.match(singleRender, /\$\{statsHtml\}/);
    assert.ok(singleRender.indexOf('${statsHtml}') < singleRender.indexOf('<div id="calc-paths"'));
    assert.match(css, /\.single-head\s*\{/);
    assert.match(css, /\.single-head-route/);
  });

  it('keeps colony-work output synchronized with mine-site choices', () => {
    assert.doesNotMatch(app, /routeSummary\.outerHTML\s*=\s*renderRouteSummary\(plan\)/);
    assert.match(app, /action\.kind\s*===\s*'mine'/);
    assert.match(app, /action\.items\.some\(function \(move\)/);
    assert.doesNotMatch(app, /group\.colony !== REFINE_DESTINATION && group\.actions\.some\(function \(action\)/);
  });

  it('keeps default refinement tied to production while explicit choices persist', () => {
    assert.match(core, /function getRefineDestination\(explicit\)/);
    assert.match(core, /if \(explicit\) REFINE_DESTINATION_EXPLICIT = true/);
    assert.match(init, /getRefineDestination\(true\)/);
    assert.match(app, /getRefineDestination\(\); \/\/ sync from input/);
  });

  it('cache-busts the changed player renderer', () => {
    assert.match(html, /src\/views\/player\.js\?v=6/);
  });
});
