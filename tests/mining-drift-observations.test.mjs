// tests/mining-drift-observations.test.mjs — calibrated mining drift model
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const root = join(import.meta.dirname, '..');
const core = readFileSync(join(root, 'src', 'app-core.js'), 'utf8');
const costs = JSON.parse(readFileSync(join(root, 'data', 'costs.json'), 'utf8'));
const observations = JSON.parse(readFileSync(join(root, 'docs', 'mining-drift-observations.json'), 'utf8'));

const sandbox = {
  window: {},
  localStorage: { getItem() { return null; }, setItem() {} },
};
vm.createContext(sandbox);
vm.runInContext(`let COLONY_TAX = {};
${core.slice(core.indexOf('const MAX_LEVEL ='), core.indexOf('// Colony income is split'))}
globalThis.driftTest = {
  set(e, c) { ENERGY_LEVEL = clampEnergy(e); COOLING_LEVEL = clampCooling(c); },
  run(base, count, rate = 0) {
    COLONY_TAX = rate ? { site: rate } : {};
    return runCost(base, 'site', count);
  },
  cycles(base, count, rate = 0) {
    COLONY_TAX = rate ? { site: rate } : {};
    const params = driftParams(base, 'site');
    return Array.from({ length: count }, (_, i) => cycleCost(params, i));
  },
  params(base, rate = 0) {
    COLONY_TAX = rate ? { site: rate } : {};
    return driftParams(base, 'site');
  },
};`, sandbox);

const test = sandbox.driftTest;
const sum = values => values.reduce((total, value) => total + value, 0);
const completeTraces = Object.entries(observations.traces).filter(([, trace]) => trace.complete);

// The UI uses 5/0 as energy level 5 with cooling switched off.
describe('calibrated mining drift model', () => {
  it('keeps named summary prices aligned with canonical batch fees', () => {
    assert.equal(observations.bioplasma.base_price, costs.items.bioplasma[0].uc);
    assert.equal(observations.emergency_medikits.base_price, costs.items['Emergency MediKit'][0].uc);
  });

  it('keeps every supplied trace structurally complete and totaled', () => {
    for (const [id, trace] of Object.entries(observations.traces)) {
      assert.equal(trace.costs.length, trace.cycles, `${id} should declare every observed cycle`);
      assert.equal(sum(trace.costs), trace.total, `${id} should declare its observed total`);
    }
  });

  it('matches every complete supplied trace at every individual cycle', () => {
    for (const [id, trace] of completeTraces) {
      test.set(trace.energy, trace.cooling);
      assert.deepEqual(
        Array.from(test.cycles(trace.base_price, trace.costs.length)),
        trace.costs,
        `${id} should match every observed cycle`,
      );
      assert.equal(
        test.run(trace.base_price, trace.costs.length),
        sum(trace.costs),
        `${id} should match its observed total`,
      );
    }
  });

  it('keeps the observed two-unit phase-2 offset and 1/360 drift', () => {
    test.set(5, 0);
    const params = test.params(57);
    assert.equal(params.effStart, 64);
    assert.equal(params.delay, 8);
    assert.equal(params.ep2Start, 62);
    assert.equal(test.run(57, 100), 5452);
  });

  it('resets drift at each 100-run batch boundary', () => {
    test.set(5, 0);
    assert.equal(test.run(93, 200), 8494 * 2);
  });

  it('uses the model for an unmeasured base rather than interpolating observations', () => {
    test.set(5, 0);
    const params = test.params(66);
    const expected = Array.from({ length: 100 }, (_, n) => {
      const eff = n <= params.delay
        ? params.effStart
        : params.ep2Start * (1 - (n - params.delay) / 360);
      return Math.max(0, Math.trunc(eff));
    }).reduce((total, cost) => total + cost, 0);
    assert.equal(test.run(66, 100), expected);
  });

  it('allows cooling to be switched off while retaining the 1–20 active range', () => {
    test.set(5, 0);
    assert.equal(test.params(57).raw, 64.5);
    test.set(5, 20);
    assert.equal(test.params(57).raw, 84.5);
  });

  it('does not apply a tax to the calibrated zero-tax behavior', () => {
    test.set(5, 0);
    assert.equal(test.params(93, 10).tax, Math.floor(0.01 * (93 + 7.5) * 10));
    assert.notEqual(test.run(93, 100, 10), 8494);
  });

  it('records the complete organic 15/20 trace', () => {
    const trace = observations.traces.organic_material_15_20;
    assert.equal(trace.cycles, 100);
    assert.equal(trace.complete, true);
  });
});
