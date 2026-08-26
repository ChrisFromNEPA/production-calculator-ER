// tests/production-progress.test.mjs — player-facing batch progress tracking
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const siteDir = join(fileURLToPath(new URL('..', import.meta.url)));
const appSrc = readFileSync(join(siteDir, 'src', 'app.js'), 'utf8');
const coreSrc = readFileSync(join(siteDir, 'src', 'app-core.js'), 'utf8');
const initSrc = readFileSync(join(siteDir, 'src', 'app-init.js'), 'utf8');
const stylesSrc = readFileSync(join(siteDir, 'src', 'styles.css'), 'utf8');

function extractFunction(name) {
  const match = appSrc.match(new RegExp(
    `function ${name}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`
  ));
  assert.ok(match, `expected ${name} in src/app.js`);
  return match[0];
}

const nextProductionProgress = vm.runInNewContext(`(${extractFunction('nextProductionProgress')})`);

describe('production batch progress tracker', () => {
  it('makes the planned batch count a primary visual number', () => {
    assert.match(coreSrc, /class="flow-batches batch-emphasis"/);
    assert.match(stylesSrc, /\.flow-batches\.batch-emphasis\s*\{[\s\S]*?font-size:\s*1rem/);
    assert.match(stylesSrc, /\.flow-batches\.batch-emphasis\s*\{[\s\S]*?font-weight:\s*800/);
  });

  it('records 100, 100, 100, then the final 60 for a 360-batch step', () => {
    let completed = 0;
    const remaining = [];
    for (let i = 0; i < 4; i += 1) {
      const state = nextProductionProgress(completed, 360, 100);
      completed = state.completed;
      remaining.push(state.remaining);
    }

    assert.deepEqual(remaining, [260, 160, 60, 0]);
    assert.equal(completed, 360);
  });

  it('never advances past the planned batch total', () => {
    const state = nextProductionProgress(350, 360, 100);
    assert.equal(state.completed, 360);
    assert.equal(state.remaining, 0);
    assert.equal(state.advanced, 10);
  });

  it('checks the production box and exposes a compact completed step', () => {
    assert.match(appSrc, /checkbox\.checked = true/);
    assert.match(appSrc, /toggleProduceCheck\(checkbox, container\)/);
    assert.match(appSrc, /progress-complete/);
    assert.match(coreSrc, /progress-complete/);
  });

  it('collapses a recipe card when its checklist checkbox is checked and restores it when unchecked', () => {
    const start = appSrc.indexOf('function toggleProduceCheck(');
    const end = appSrc.indexOf('window.toggleProduceCheck', start);
    const toggleSrc = appSrc.slice(start, end);
    assert.match(toggleSrc, /card\.classList\.add\('progress-complete'\)/);
    assert.match(toggleSrc, /card\.classList\.remove\('progress-complete'\)/);
    assert.match(stylesSrc, /\.recipe-card\.progress-complete \.recipe-flow\s*\{\s*display:\s*none/);
  });

  it('synchronizes checkbox completion with the recipe batch progress total', () => {
    const start = appSrc.indexOf('function toggleProduceCheck(');
    const end = appSrc.indexOf('window.toggleProduceCheck', start);
    const toggleSrc = appSrc.slice(start, end);
    assert.match(toggleSrc, /PRODUCTION_PROGRESS\[.*\]\s*=\s*total/);
    assert.match(toggleSrc, /delete PRODUCTION_PROGRESS\[/);
    assert.match(toggleSrc, /updateProductionProgressCard\(card/);
  });

  it('compacts completed mining and moving rows without removing their item chip', () => {
    assert.match(appSrc, /flow-card move' \+ \(done \? ' done' : ''\)/);
    assert.match(appSrc, /flow-card get' \+ \(done \? ' done' : ''\)/);
    assert.match(stylesSrc, /\.flow-card\.move\.done[^}]*\.split-note/);
    assert.match(stylesSrc, /\.flow-card\.get\.done[^}]*\.flow-need/);
    assert.match(stylesSrc, /\.flow-card\.done \.flow-chip/);
  });

  it('adds mining batch progress with a clamped final haul and reset control', () => {
    assert.match(appSrc, /cmg_mining_progress_v1/);
    assert.match(appSrc, /MINING_PROGRESS/);
    assert.match(appSrc, /data-mine-total=/);
    assert.match(appSrc, /nextProductionProgress\(miningProgressFor\(item, target\), target, requested\)/);
    assert.match(appSrc, /resetMiningProgress/);
    assert.match(appSrc, /mine-progress/);
    assert.match(initSrc, /mine-progress-reset/);
  });

  it('records mining progress without changing inventory or plan totals', () => {
    const start = appSrc.indexOf('function logMined(');
    const end = appSrc.indexOf('// Build a numbered, collapsible section.', start);
    const logMinedSrc = appSrc.slice(start, end);
    assert.doesNotMatch(logMinedSrc, /applyEntry\(item, DESTINATION/);
    assert.doesNotMatch(logMinedSrc, /getInv\(\)/);
    assert.match(logMinedSrc, /MINING_PROGRESS\[item\] = state\.completed/);
    assert.match(appSrc, /var actions = complete \? '' :/);
  });

  it('keeps mining targets stable when progress rerenders without inventory changes', () => {
    assert.match(appSrc, /var mineTotal = Math\.max\(0, Number\(info\.qty\) \|\| 0\)/);
    assert.match(appSrc, /var total = need > 0 \? need : 0/);
    assert.match(appSrc, /renderMiningProgress\(t\.item, mineTotal, mineDone, mineRemaining\)/);
  });

  it('preserves the viewport when mining progress rerenders', () => {
    assert.match(appSrc, /rerunPlanForContainer\(container, \{ preserveChecklist: true, preserveViewport: true \}\)/);
    assert.match(appSrc, /function rerunActivePlan\(options\)[\s\S]*preserveViewport/);
    assert.match(appSrc, /if \(!options\.preserveViewport\) \{[\s\S]*out\.scrollIntoView/);
  });

  it('restores bottom mining controls for materials marked for later', () => {
    assert.match(appSrc, /var actions = complete \? '' :/);
    assert.match(appSrc, /var fullQty = MINE_BATCH;/);
    assert.match(appSrc, /var midQty = 50;/);
    assert.match(appSrc, /var smallQty = 25;/);
    assert.match(appSrc, /var recorded = Math\.max\(0, Number\(MINING_PROGRESS\[item\]\) \|\| 0\)/);
    assert.match(appSrc, /MINING_PROGRESS\[item\] = recorded \+ requested/);
    assert.match(appSrc, /data-mining-reset/);
    assert.doesNotMatch(appSrc, /var actions = complete \|\| !total \? ''/);
  });

  it('makes the bottom full mining pull easy to hit', () => {
    assert.match(stylesSrc, /\.mine-log\.full \{[\s\S]*min-width: 4\.5rem/);
    assert.match(stylesSrc, /\.mine-log\.full \{[\s\S]*min-height: 2\.75rem/);
  });

  it('uses deliberate mining-row columns and narrow-screen wrapping', () => {
    assert.match(stylesSrc, /\.mine-row \{\n  display: grid;[\s\S]*grid-template-columns:/);
    assert.match(stylesSrc, /\.mine-row-item \{[\s\S]*min-width: 0/);
    assert.match(stylesSrc, /\.mine-row-name \{[\s\S]*overflow-wrap: anywhere/);
    assert.match(stylesSrc, /@media \(max-width: 900px\) \{[\s\S]*\.mine-acts \{[\s\S]*grid-column: 1 \/ -1/);
    assert.match(stylesSrc, /@media \(max-width: 560px\) \{[\s\S]*\.mine-acts \{[\s\S]*display: grid/);
  });

  it('keeps the primary mining controls inside narrow calculator panels', () => {
    assert.match(stylesSrc, /grid-template-columns: minmax\(0, 1\.25fr\) minmax\(0, 0\.9fr\) minmax\(4\.5rem, auto\) minmax\(0, 1\.6fr\)/);
    assert.match(stylesSrc, /@media \(max-width: 900px\) \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\) auto/);
  });

  it('resets checklist and batch progress on an explicit fresh calculation', () => {
    assert.match(appSrc, /function resetChecklistForCalculation\(\)/);
    assert.match(appSrc, /function runCalculator\(\)[\s\S]*resetChecklistForCalculation\(\)/);
    assert.match(appSrc, /function runMultiPlan\(options\)[\s\S]*resetChecklistForCalculation\(\)/);
    assert.match(appSrc, /function activePlanContainer\(\)/);
    assert.match(appSrc, /function rerunPlanForContainer\(container, options\)/);
  });

  it('adds a record-batch action directly to mineable Obtain-step rows', () => {
    assert.match(appSrc, /function renderAcquireSection\(plan\)[\s\S]*Record ' \+/);
    assert.match(appSrc, /data-mine-total=/);
    assert.match(appSrc, /mine-log obtain-batch/);
    assert.match(appSrc, /obtain-batch progress-run/);
    assert.match(appSrc, /mineBatchQty === mineRemaining/);
    assert.match(initSrc, /closest\('\.mine-log'\)/);
  });

  it('renders controls and wires them for both single and combined plans', () => {
    assert.match(coreSrc, /production-progress/);
    assert.match(coreSrc, /data-progress-item=/);
    assert.match(coreSrc, /data-progress-run/);
    assert.match(initSrc, /progress-run/);
    assert.match(initSrc, /progress-reset/);
  });
});
