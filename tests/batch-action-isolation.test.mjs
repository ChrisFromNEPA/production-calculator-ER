// tests/batch-action-isolation.test.mjs — calculator batch-action contracts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const app = readFileSync(join(root, 'src', 'app.js'), 'utf8');
const core = readFileSync(join(root, 'src', 'app-core.js'), 'utf8');
const init = readFileSync(join(root, 'src', 'app-init.js'), 'utf8');
const css = readFileSync(join(root, 'src', 'styles.css'), 'utf8');
const player = readFileSync(join(root, 'src', 'views', 'player.js'), 'utf8');

function bodyOf(name, endMarker) {
  const start = app.indexOf(`function ${name}(`);
  const end = app.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `could not isolate ${name}`);
  return app.slice(start, end);
}

describe('batch action isolation', () => {
  it('removes the separate current-execution summary section', () => {
    assert.doesNotMatch(html, /calc-execution-summary|Current execution summary|calc-execution-next/);
    assert.doesNotMatch(app, /syncCalcExecutionSummary|calc-execution/);
    assert.doesNotMatch(core, /syncCalcExecutionSummary|calc-execution/);
    assert.doesNotMatch(css, /calc-execution-summary/);
    assert.doesNotMatch(player, /syncCalcExecutionSummary|calc-execution/);
  });

  it('reruns the calculation represented by the clicked result container', () => {
    assert.match(app, /function planContainerForElement\(element\)/);
    assert.match(app, /function rerunPlanForContainer\(container, options\)/);
    for (const name of ['logMined', 'recordProductionProgress', 'toggleObtainCheck', 'toggleTransferCheck', 'toggleProduceCheck']) {
      const end = name === 'logMined' ? 'function planSection' : name === 'recordProductionProgress' ? 'function resetProductionProgress' : name === 'toggleObtainCheck' ? 'function pickObtainSite' : name === 'toggleTransferCheck' ? 'function markMoveBatchComplete' : 'window.toggleProduceCheck';
      assert.match(bodyOf(name, end), /planContainerForElement|rerunPlanForContainer/);
    }
    assert.doesNotMatch(bodyOf('logMined', 'function planSection'), /if \(CALC_TRAY\.length\) runMultiPlan/);
    assert.doesNotMatch(bodyOf('pickTransportSource', 'function toggleTransferCheck'), /if \(CALC_TRAY\.length\) runMultiPlan/);
  });

  it('keeps path controls tied to the result container, not tray presence alone', () => {
    assert.match(app, /function enginePathChoices\(container\)/);
    assert.match(app, /LAST_PLANS\[container\.id\]/);
    assert.match(app, /var container = planContainerForElement\(box\)/);
    assert.match(app, /enginePathChoices\(container\)/);
    assert.match(app, /container && container\.id === 'calc-multi'/);
  });

  it('applies the ignore-inventory option to combined plans', () => {
    const multi = app.slice(app.indexOf('function runMultiPlan('), app.indexOf('// ── Saved production plans'));
    assert.match(html, /id="calc-scratch"/);
    assert.match(html, /single-item or combined plans/i);
    assert.match(multi, /calc-scratch/);
    assert.match(multi, /STORE\.INV_TOTAL = \{\}/);
    assert.match(multi, /STORE\.INV_LOCATIONS = \{\}/);
  });

  it('uses Same location as an accessible on/off toggle', () => {
    assert.match(html, /id="calc-combined-dest"[^>]*aria-pressed="false"/);
    assert.doesNotMatch(html, /<select[^>]*id="calc-combined-dest"/);
    assert.match(core, /function setCombinedDestination\(\)/);
    assert.match(core, /setAttribute\('aria-pressed'/);
    assert.match(init, /calc-combined-dest[\s\S]*addEventListener\('click'/);
  });

  it('gives Mine and Refine the same batch-progress contract', () => {
    assert.match(app, /class="batch-progress[^" ]* mine-progress/);
    assert.match(core, /class="batch-progress[^" ]* production-progress/);
    assert.match(app, /data-progress-kind="mine"/);
    assert.match(core, /data-progress-kind="produce"/);
    assert.match(app, /data-progress-item=/);
    assert.match(core, /data-progress-item=/);
    assert.match(app, /class="[^"]*batch-progress-reset[^"]*"/);
    assert.match(core, /class="[^"]*batch-progress-reset[^"]*"/);
  });

  it('contains long card content without clipping labels or action controls', () => {
    assert.match(css, /\.flow-card\s*\{[\s\S]*min-width:\s*0/);
    assert.match(css, /\.flow-card-body\s*\{[\s\S]*min-width:\s*0/);
    assert.match(css, /\.flow-name\s*\{[\s\S]*overflow-wrap:\s*anywhere/);
    assert.match(css, /\.flow-qty\s*\{[\s\S]*white-space:\s*nowrap/);
    assert.match(css, /\.batch-progress\s*\{[\s\S]*min-width:\s*0/);
    assert.match(css, /\.batch-progress-actions\s*\{[\s\S]*flex-wrap:\s*wrap/);
    assert.match(css, /\.mine-acts\s*\{[\s\S]*flex-wrap:\s*wrap/);
  });
});
