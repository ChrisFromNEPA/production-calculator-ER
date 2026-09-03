import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const root = join(import.meta.dirname, '..');
const init = readFileSync(join(root, 'src/app-init.js'), 'utf8');
const gear = readFileSync(join(root, 'src/views/gear.js'), 'utf8');
const applyModule = readFileSync(join(root, 'src/apply-plan.js'), 'utf8');
const app = readFileSync(join(root, 'src/app.js'), 'utf8');

describe('security and apply data safety', () => {
  it('never uses an imported gear-set id as an HTML attribute value', () => {
    assert.match(init, /id:\s*localId\(\)/);
    assert.doesNotMatch(init, /id:\s*s\.id\s*\|\|\s*localId/);
    assert.match(gear, /data-gear-(?:load|del|vote)="\$\{safeGearSetId\(s\.id\)\}"/);
  });

  it('escapes the malicious imported ID used in rendered gear controls', () => {
    const helper = gear.match(/function safeGearSetId\(id\) \{[\s\S]*?\n\}/)[0];
    const context = { esc: value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') };
    vm.createContext(context);
    vm.runInContext(`${helper}\nthis.safe = safeGearSetId;`, context);
    const escaped = context.safe('" autofocus onfocus="alert(1)');
    assert.doesNotMatch(escaped, /["<>]/);
    assert.match(escaped, /&quot;/);
  });

  it('only transports the amount actually deducted from inventory', () => {
    assert.match(applyModule, /const moved = info\.qty - need/);
    assert.match(applyModule, /if \(qty <= 0\) return/);
    assert.doesNotMatch(applyModule, /addAt\(item, target, info\.qty\)/);
  });

  it('detects inventory changes against the plan-time snapshot', () => {
    const context = {
      window: {
        ENGINE: {},
        STORE: { getInv: () => [], setInv() {}, recomputeInv() {} },
      },
    };
    vm.createContext(context);
    vm.runInContext(applyModule, context);
    const guard = context.window.PLAN_INVENTORY_GUARD;
    const inventory = [
      { item: 'iron', location: 'Berlin', quantity: 2 },
      { item: 'chrome', location: 'Warsaw', quantity: 1 },
    ];
    const token = guard.capture(inventory);
    assert.equal(guard.isCurrent(token, inventory.slice().reverse()), true);
    assert.equal(guard.isCurrent(token, [{ item: 'iron', location: 'Berlin', quantity: 1 }]), false);
  });

  it('applies and copies the exact displayed plan instead of recomputing with different inventory semantics', () => {
    assert.match(app, /data-ready-to-apply/);
    assert.match(app, /data-inventory-snapshot/);
    assert.match(init, /btn\.dataset\.readyToApply !== 'true'/g);
    assert.match(init, /PLAN_INVENTORY_GUARD\.isCurrent\(btn\.dataset\.inventorySnapshot/);
    assert.match(app, /LAST_RESULTS\[targetEl\.id\]/);
    assert.match(app, /LAST_RESULTS\['calc-multi'\]/);
    assert.match(init, /LAST_RESULTS\['calc-result'\]/);
    assert.match(init, /LAST_RESULTS\['calc-multi'\]/);
    assert.match(init, /copyShoppingList[\s\S]*LAST_RESULTS/);
  });

  it('publishes an Apply result only after its plan markup renders successfully', () => {
    const app = readFileSync(join(root, 'src', 'app.js'), 'utf8');
    const start = app.indexOf('function renderPlan(');
    const end = app.indexOf('function runCalculator(', start);
    const renderPlan = app.slice(start, end);
    assert.ok(renderPlan.indexOf('targetEl.innerHTML = `') >= 0);
    assert.ok(renderPlan.indexOf('LAST_RESULTS[targetEl.id] = {') > renderPlan.indexOf('targetEl.innerHTML = `'));

    const multiStart = app.indexOf('function runMultiPlan(');
    const multiEnd = app.indexOf('function saveCurrentPlan(', multiStart);
    const multiPlan = app.slice(multiStart, multiEnd);
    assert.ok(multiPlan.indexOf("LAST_RESULTS['calc-multi'] = { result, scratch }") > multiPlan.indexOf('out.innerHTML = html'));
  });

  it('handles both synchronous and asynchronous clipboard failures', () => {
    const init = readFileSync(join(root, 'src', 'app-init.js'), 'utf8');
    const copy = init.match(/function copyShoppingList\([\s\S]*?\n  \}/)?.[0] || '';
    assert.match(copy, /try\s*\{/);
    assert.match(copy, /Promise\.resolve\([\s\S]*?\.catch\(/);
    const shareStart = init.indexOf('function sharePlanLink(');
    const shareEnd = init.indexOf("['calc-result'", shareStart);
    const share = init.slice(shareStart, shareEnd);
    assert.match(share, /try\s*\{/);
    assert.match(share, /Promise\.resolve\([\s\S]*?\.catch\(/);
  });

  it('clears non-displayed single and combined results on every invalid path', () => {
    assert.match(app, /if \(!FINAL_ITEMS\.includes\(item\)\)[\s\S]*LAST_RESULTS\[targetEl\.id\] = null/);
    assert.match(app, /if \(!item \|\| !ALL_ITEMS\.has\(item\)\)[\s\S]*LAST_RESULTS\['calc-result'\] = null/);
    assert.match(app, /if \(CALC_TRAY\.length === 0\)[\s\S]*LAST_RESULTS\['calc-multi'\] = null/);
    assert.match(app, /Multi-plan compute error:[\s\S]*LAST_PLANS\['calc-multi'\] = null/);
  });

  it('clears plan state before any compute or rendering work can fail', () => {
    const singleStart = app.indexOf('function renderPlan(');
    const singleEnd = app.indexOf('function runCalculator(', singleStart);
    const single = app.slice(singleStart, singleEnd);
    assert.ok(single.indexOf('LAST_RESULTS[targetEl.id] = null') >= 0);
    assert.ok(single.indexOf('LAST_PLANS[targetEl.id] = null') >= 0);
    assert.ok(single.indexOf('LAST_RESULTS[targetEl.id] = null') < single.indexOf('if (!FINAL_ITEMS.includes(item))'));
    assert.ok(single.indexOf('LAST_PLANS[targetEl.id] = null') < single.indexOf('if (!FINAL_ITEMS.includes(item))'));

    const multiStart = app.indexOf('function runMultiPlan(');
    const multiEnd = app.indexOf('function saveCurrentPlan(', multiStart);
    const multi = app.slice(multiStart, multiEnd);
    assert.ok(multi.indexOf("LAST_RESULTS['calc-multi'] = null") >= 0);
    assert.ok(multi.indexOf("LAST_PLANS['calc-multi'] = null") >= 0);
    assert.ok(multi.indexOf("LAST_RESULTS['calc-multi'] = null") < multi.indexOf('if (CALC_TRAY.length === 0)'));
    assert.ok(multi.indexOf("LAST_PLANS['calc-multi'] = null") < multi.indexOf('if (CALC_TRAY.length === 0)'));
  });

  it('scratch Apply preserves existing stock while recording produced output', () => {
    let inventory = [{ item: 'iron', location: 'Berlin', quantity: 5 }];
    const context = {
      window: {
        ENGINE: { DESTINATION: 'Berlin', fmt: String, esc: String },
        STORE: {
          getInv: () => inventory,
          setInv: value => { inventory = value; },
          recomputeInv() {},
        },
      },
    };
    vm.createContext(context);
    vm.runInContext(applyModule, context);
    context.window.APPLY_PRODUCTION_PLAN({ plan: {
      destination: 'Berlin',
      refineDestination: 'Berlin',
      transport: {},
      steps: [{ type: 'manufacture', item: 'widget', produced: 1, location: 'Berlin', resolvedInputs: [{ item: 'iron', qty: 2 }] }],
    } }, undefined, { scratch: true });
    assert.deepEqual(JSON.parse(JSON.stringify(inventory)), [
      { item: 'iron', location: 'Berlin', quantity: 5 },
      { item: 'widget', location: 'Berlin', quantity: 1 },
    ]);
  });

  it('invalidates a displayed combined plan whenever the tray changes', () => {
    assert.match(app, /function invalidateCombinedPlan\(/);
    assert.match(app, /function addToTray[\s\S]*invalidateCombinedPlan\(\)/);
    assert.match(init, /data-tray-q[\s\S]*invalidateCombinedPlan\(\)/);
    assert.match(init, /data-tray-x[\s\S]*invalidateCombinedPlan\(\)/);
  });

  it('rolls inventory back if committing an Apply result fails', () => {
    let inventory = [{ item: 'iron', location: 'Berlin', quantity: 5 }];
    let recomputes = 0;
    const context = {
      window: {
        ENGINE: { DESTINATION: 'Berlin', fmt: String, esc: String },
        STORE: {
          getInv: () => inventory,
          setInv: value => { inventory = value; },
          recomputeInv() { if (recomputes++ === 0) throw new Error('recompute failed'); },
        },
      },
    };
    vm.createContext(context);
    vm.runInContext(applyModule, context);
    assert.throws(() => context.window.APPLY_PRODUCTION_PLAN({ plan: {
      destination: 'Berlin', refineDestination: 'Berlin', transport: {},
      steps: [{ type: 'manufacture', item: 'widget', produced: 1, location: 'Berlin', resolvedInputs: [{ item: 'iron', qty: 2 }] }],
    } }), /recompute failed/);
    assert.deepEqual(JSON.parse(JSON.stringify(inventory)), [{ item: 'iron', location: 'Berlin', quantity: 5 }]);
  });

  it('rolls inventory back if the post-commit UI refresh fails', () => {
    let inventory = [{ item: 'iron', location: 'Berlin', quantity: 5 }];
    const context = {
      window: {
        ENGINE: { DESTINATION: 'Berlin', fmt: String, esc: String },
        STORE: {
          getInv: () => inventory,
          setInv: value => { inventory = value; },
          recomputeInv() {},
        },
        refreshAll() { throw new Error('refresh failed'); },
      },
    };
    vm.createContext(context);
    vm.runInContext(applyModule, context);
    assert.throws(() => context.window.APPLY_PRODUCTION_PLAN({ plan: {
      destination: 'Berlin', refineDestination: 'Berlin', transport: {},
      steps: [{ type: 'manufacture', item: 'widget', produced: 1, location: 'Berlin', resolvedInputs: [{ item: 'iron', qty: 2 }] }],
    } }), /refresh failed/);
    assert.deepEqual(JSON.parse(JSON.stringify(inventory)), [{ item: 'iron', location: 'Berlin', quantity: 5 }]);
  });
});
