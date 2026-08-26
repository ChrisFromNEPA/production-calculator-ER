import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const core = readFileSync(join(root, 'src/app-core.js'), 'utf8');
const app = readFileSync(join(root, 'src/app.js'), 'utf8');
const data = JSON.parse(readFileSync(join(root, 'data/game_data.json'), 'utf8'));

function slotRuntime(saved = null) {
  const start = core.indexOf('const MAX_LEVEL =');
  const end = core.indexOf('// The cost of ONE batch/unit', start);
  assert.ok(start >= 0 && end > start, 'slot model block must remain discoverable');
  const sandbox = {
    localStorage: {
      getItem() { return saved == null ? null : JSON.stringify(saved); },
      setItem() {},
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(`${core.slice(start, end)}
    globalThis.slotTest = { clampEnergy, clampCooling, slotUpkeep, set(e, c) {
      ENERGY_LEVEL = clampEnergy(e); COOLING_LEVEL = clampCooling(c);
    }, values() { return [ENERGY_LEVEL, COOLING_LEVEL]; } };
  `, sandbox);
  return sandbox.slotTest;
}

describe('shared energy and cooling slot model', () => {
  it('keeps the shared slot guidance aligned with the level model and costs', () => {
    const index = readFileSync(join(root, 'index.html'), 'utf8');
    assert.match(index, /energy in <strong>levels 1[–-]20<\/strong> and cooling to <strong>off or levels 1[–-]20<\/strong>/);
    assert.match(index, /<b>Energy<\/b> runs 1[–-]20 and <b>cooling<\/b> is <b>off<\/b> or runs 1[–-]20/);
    assert.match(index, /recommended default is <strong>15 energy, 15 cooling<\/strong>/);
    assert.match(index, /1\.5 UC<\/b> per energy level and <b>1 UC/);
    assert.match(index, /mining, refinement, and production/);
    assert.doesNotMatch(index, /<b>Energy<\/b> and <b>cooling<\/b> both run 1[–-]20/);
  });

  it('uses levels 1 through 20 and defaults both settings to level 15', () => {
    const slots = slotRuntime();
    assert.equal(JSON.stringify(slots.values()), JSON.stringify([15, 15]));
    assert.equal(slots.clampEnergy(0), 1);
    assert.equal(slots.clampCooling(0), 0);
    assert.equal(slots.clampEnergy(21), 20);
    assert.equal(slots.clampCooling(21), 20);
  });

  it('keeps explicit saved overrides while repairing invalid values', () => {
    const slots = slotRuntime({ energy: 7, cooling: 3 });
    assert.equal(JSON.stringify(slots.values()), JSON.stringify([7, 3]));
    assert.equal(JSON.stringify(slotRuntime({ energy: 0, cooling: 99 }).values()), JSON.stringify([1, 20]));
    assert.equal(JSON.stringify(slotRuntime({ energy: null }).values()), JSON.stringify([15, 15]));
  });

  it('scales slot-batch upkeep one level at a time across the shared model', () => {
    const slots = slotRuntime();
    slots.set(1, 1);
    const floor = slots.slotUpkeep();
    slots.set(2, 2);
    assert.equal(slots.slotUpkeep() - floor, 2.5);
    slots.set(20, 20);
    assert.equal(slots.slotUpkeep(), 50);
  });
});

describe('drug production-plan instruction', () => {
  it('renders a spaced, labeled instruction and preserves canonical string codes', () => {
    const drug = data.drugs.find(d => d.name === 'Benzedrine');
    const leadingZeroDrug = data.drugs.find(d => d.name === 'Dexedrine');
    assert.equal(typeof drug.code, 'string');
    assert.equal(drug.code, '2936');
    assert.equal(typeof leadingZeroDrug.code, 'string');
    assert.equal(leadingZeroDrug.code, '0578');
    const match = app.match(/function drugProductionInstruction\([\s\S]*?\n\}/);
    assert.ok(match, 'app.js must define drugProductionInstruction');
    const sandbox = { esc: value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])) };
    vm.createContext(sandbox);
    vm.runInContext(`${match[0]}; globalThis.renderDrugInstruction = drugProductionInstruction;`, sandbox);
    const rendered = sandbox.renderDrugInstruction(drug);
    assert.match(rendered, /Production code:<\/span>\s*<strong[^>]*>2936<\/strong>/);
    assert.match(rendered, /Power:<\/span>\s*<span[^>]*>Low<\/span>/);
    const leadingZeroRendered = sandbox.renderDrugInstruction(leadingZeroDrug);
    assert.match(leadingZeroRendered, /Production code:<\/span>\s*<strong[^>]*>0578<\/strong>/);
    assert.match(rendered, /prod-code/);
  });
});
