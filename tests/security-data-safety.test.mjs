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

  it('guards Apply with readiness, a plan-time inventory snapshot, and a fresh recalculation', () => {
    assert.match(app, /data-ready-to-apply/);
    assert.match(app, /data-inventory-snapshot/);
    assert.match(init, /btn\.dataset\.readyToApply !== 'true'/g);
    assert.match(init, /PLAN_INVENTORY_GUARD\.isCurrent\(btn\.dataset\.inventorySnapshot/);
    assert.match(init, /compute\(item, qty/);
    assert.match(init, /applyPlan\(result\)/);
  });
});
