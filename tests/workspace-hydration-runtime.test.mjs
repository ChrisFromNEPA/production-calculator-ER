import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const source = readFileSync(join(import.meta.dirname, '..', 'src', 'app.js'), 'utf8');
const match = source.match(/function hydrateCalculatorWorkspace\(\) \{[\s\S]*?\n\}\nwindow\.CMG_HYDRATE_CALCULATOR/);
assert.ok(match);

describe('workspace calculator hydration runtime', () => {
  it('hydrates tray, saved plans, paths, progress, and checklist state immediately', () => {
    const data = {
      cmg_tray_v1: JSON.stringify([{ item: 'iron', qty: 2 }]),
      er_saved_plans_v1: JSON.stringify([{ name: 'saved' }]),
      cmg_paths_v1: JSON.stringify({ carbon: 1 }),
      cmg_produce_done_v1: JSON.stringify({ iron: true }),
      cmg_production_progress_v1: JSON.stringify({ iron: 100 }),
      cmg_mining_progress_v1: JSON.stringify({ coal: 50 }),
      cmg_transfers_done_v1: JSON.stringify({ 'iron|Berlin': true }),
      cmg_obtained_done_v1: JSON.stringify({ coal: true }),
      cmg_transport_source_v1: JSON.stringify({ iron: 'Paris' }),
      cmg_plan_sig_v1: 'multi|Berlin|iron:2',
    };
    const context = {
      localStorage: { getItem(key) { return data[key] ?? null; } },
      PRODUCE_DONE: {}, PRODUCTION_PROGRESS: {}, MINING_PROGRESS: {},
      TRANSFERS_DONE: {}, OBTAINED_DONE: {}, TRANSPORT_SOURCE: {},
      ALTERNATIVE_CHOICES: { old: 9 }, CALC_TRAY: [], SAVED_PLANS: [], LAST_PLAN_SIG: '',
      renderTray() { context.renderedTray = true; }, renderSavedPlans() { context.renderedPlans = true; },
      syncApplyPlanReadiness() { context.synced = true; },
    };
    vm.createContext(context);
    vm.runInContext(`${match[0].replace(/\nwindow\.CMG_HYDRATE_CALCULATOR[\s\S]*/, '')}\nthis.hydrate = hydrateCalculatorWorkspace;`, context);
    context.hydrate();
    assert.equal(JSON.stringify(context.CALC_TRAY), JSON.stringify([{ item: 'iron', qty: 2 }]));
    assert.equal(JSON.stringify(context.SAVED_PLANS), JSON.stringify([{ name: 'saved' }]));
    assert.equal(JSON.stringify(context.ALTERNATIVE_CHOICES), JSON.stringify({ carbon: 1 }));
    assert.equal(context.PRODUCTION_PROGRESS.iron, 100);
    assert.equal(context.TRANSFERS_DONE['iron|Berlin'], true);
    assert.equal(context.TRANSPORT_SOURCE.iron, 'Paris');
    assert.equal(context.renderedTray, true);
    assert.equal(context.synced, true);
  });
});
