// tests/booster-slot-normalization.test.mjs — shared booster slots storage
// contract. Every path that reads a player's BOOSTERS from localStorage must
// normalize to EXACTLY two safe string slots: valid order preserved, duplicates
// removed deterministically (first occurrence wins), null/objects/numbers
// dropped, extra entries truncated, malformed JSON reset to empty. Keyed per
// player — one player's slots can never leak into another's.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const root = join(import.meta.dirname, '..');
const core = readFileSync(join(root, 'src', 'app-core.js'), 'utf8');

// Extract normalizeBoosterSlots + loadBoosters from app-core.js and run them
// in a sandbox with stubbed storage. Fails loudly (RED) when the normalizer
// does not exist yet.
const FN_RES = [
  /function\s+normalizeBoosterSlots\s*\([^)]*\)\s*\{[\s\S]*?\n\}/,
  /function\s+loadBoosters\s*\([^)]*\)\s*\{[\s\S]*?\n\}/,
];
const srcs = FN_RES.map(re => core.match(re));
assert.ok(srcs[0], 'app-core.js must define normalizeBoosterSlots()');
assert.ok(srcs[1], 'app-core.js must define loadBoosters()');

function makeLoader(storage, active) {
  const sandbox = {
    localStorage: storage,
    PLAYERS: { active },
    JSON,
    normalizeBoosterSlots: undefined,
    loadBoosters: undefined,
  };
  vm.createContext(sandbox);
  vm.runInContext(srcs[0][0], sandbox);
  vm.runInContext(srcs[1][0], sandbox);
  return sandbox;
}

// vm cross-realm arrays fail assert.deepEqual on prototype identity — copy
// the result back into this realm before comparing.
function plain(arr) { return Array.isArray(arr) ? Array.from(arr) : arr; }

function load(storage, active) {
  return plain(makeLoader(storage, active).loadBoosters());
}

const store = () => ({ _d: {}, getItem(k) { return k in this._d ? this._d[k] : null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } });

describe('normalizeBoosterSlots', () => {
  it('always returns exactly two string slots', () => {
    assert.deepEqual(normalize(undefined), ['', '']);
    assert.deepEqual(normalize(null), ['', '']);
    assert.deepEqual(normalize('not an array'), ['', '']);
    assert.deepEqual(normalize([]), ['', '']);
    assert.deepEqual(normalize(['A']), ['A', '']);
    assert.deepEqual(normalize(['A', 'B', 'C']), ['A', 'B']);
  });

  it('coerces entries to strings and drops null / object / number junk', () => {
    assert.deepEqual(normalize([null, 5]), ['', '']);
    assert.deepEqual(normalize([{ item: 'X' }, ['Y']]), ['', '']);
    assert.deepEqual(normalize([123, true]), ['', '']);
    assert.deepEqual(normalize([42]), ['', '']);
  });

  it('trims whitespace and drops empty strings', () => {
    assert.deepEqual(normalize(['  ', '\t']), ['', '']);
    assert.deepEqual(normalize(['  A  ']), ['A', '']);
  });

  it('removes duplicates deterministically, keeping the first occurrence', () => {
    assert.deepEqual(normalize(['A', 'A']), ['A', '']);
    assert.deepEqual(normalize(['A', 'B', 'A']), ['A', 'B']);
    assert.deepEqual(normalize(['A', 'A', 'B']), ['A', 'B']);
    assert.deepEqual(normalize(['A', 'B', 'B', 'A']), ['A', 'B']);
  });

  it('caps runaway input defensively', () => {
    const big = Array.from({ length: 500 }, (_, i) => 'Item ' + i);
    const out = normalize(big);
    assert.equal(out.length, 2);
    assert.deepEqual(out, ['Item 0', 'Item 1']);
  });
});

function normalize(raw) {
  const sandbox = { normalizeBoosterSlots: undefined };
  vm.createContext(sandbox);
  vm.runInContext(srcs[0][0], sandbox);
  return plain(sandbox.normalizeBoosterSlots(raw));
}

describe('loadBoosters per-player isolation and repair', () => {
  beforeEach(() => {});

  it('loads a valid two-slot pair unchanged', () => {
    const s = store();
    s._d['cmg_boosters_alice'] = JSON.stringify(['Beer', 'Stim']);
    assert.deepEqual(load(s, 'alice'), ['Beer', 'Stim']);
  });

  it('normalizes a malformed saved value (duplicate) and repairs storage', () => {
    const s = store();
    s._d['cmg_boosters_alice'] = JSON.stringify(['Beer', 'Beer']);
    assert.deepEqual(load(s, 'alice'), ['Beer', '']);
    assert.equal(s._d['cmg_boosters_alice'], JSON.stringify(['Beer', '']));
  });

  it('resets corrupted JSON to two empty slots and repairs storage', () => {
    const s = store();
    s._d['cmg_boosters_alice'] = '{oops';
    assert.deepEqual(load(s, 'alice'), ['', '']);
    assert.equal(s._d['cmg_boosters_alice'], JSON.stringify(['', '']));
  });

  it('reads a different key per player', () => {
    const s = store();
    s._d['cmg_boosters_alice'] = JSON.stringify(['Beer', '']);
    s._d['cmg_boosters_bob'] = JSON.stringify(['Stim', 'Cake']);
    assert.deepEqual(load(s, 'alice'), ['Beer', '']);
    assert.deepEqual(load(s, 'bob'), ['Stim', 'Cake']);
  });

  it('a null stored value yields two empty slots without writing junk', () => {
    const s = store();
    assert.deepEqual(load(s, 'nobody'), ['', '']);
  });
});

describe('picker occupancy and other-slot exclusion contract', () => {
  const gear = readFileSync(join(root, 'src', 'views', 'gear.js'), 'utf8');

  it('defines an occupancy helper for the shared slots', () => {
    assert.ok(/function\s+boosterSlotOccupancy\s*\(/.test(gear), 'gear.js must define boosterSlotOccupancy()');
  });

  it('occupancy reads only the two shared slots and is 0–2', () => {
    const sandbox = { BOOSTERS: ['Beer', 'Cake'], boosterSlotOccupancy: undefined };
    vm.createContext(sandbox);
    const fn = gear.match(/function\s+boosterSlotOccupancy\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
    vm.runInContext(fn[0], sandbox);
    assert.equal(sandbox.boosterSlotOccupancy(), 2);
    sandbox.BOOSTERS = ['', 'Cake'];
    assert.equal(sandbox.boosterSlotOccupancy(), 1);
    sandbox.BOOSTERS = ['', ''];
    assert.equal(sandbox.boosterSlotOccupancy(), 0);
  });

  it('picker disables the item already equipped in the other shared slot', () => {
    assert.match(gear, /boosterOtherSlotItem/);
    assert.match(gear, /aria-disabled="true"/);
  });

  it('picker exposes occupancy as 1/2 or 2/2 in the title', () => {
    assert.match(gear, /Shared slots: \$\{occupancy\}\/2/);
  });

  it('comparison resolves the equipped baseline by slot type', () => {
    assert.match(gear, /var equipped = equippedNameForSlot\(slotName, slotType\);/);
    assert.doesNotMatch(gear, /var equipped = GEAR\[slotName\];/);
  });

  it('comparison exposes a readable before/after summary and unsupported perk label', () => {
    assert.match(gear, /Before → After/);
    assert.match(gear, /perk formula unsupported/i);
  });

  it('keyboard navigation skips aria-disabled options', () => {
    const match = gear.match(/function\s+gearPickerNavigableOptions\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
    assert.ok(match, 'gear.js must define gearPickerNavigableOptions()');
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(match[0], sandbox);
    const options = [
      { getAttribute: () => null },
      { getAttribute: name => name === 'aria-disabled' ? 'true' : null },
      { getAttribute: () => null },
    ];
    assert.deepEqual(Array.from(sandbox.gearPickerNavigableOptions(options)), [options[0], options[2]]);
  });

  it('keyboard navigation never focuses or activates a disabled option', () => {
    const helper = gear.match(/function\s+gearPickerNavigableOptions\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
    const mover = gear.match(/function\s+moveGearPickerActive\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
    assert.ok(helper, 'gear.js must define gearPickerNavigableOptions()');
    assert.ok(mover, 'gear.js must define moveGearPickerActive()');
    const focused = [];
    const option = (id, disabled = false) => ({
      id,
      tabIndex: -1,
      getAttribute: name => name === 'aria-disabled' && disabled ? 'true' : null,
      focus: () => focused.push(id),
    });
    const options = [option('first'), option('duplicate', true), option('last')];
    const listbox = {
      querySelectorAll: () => options,
      setAttribute: (name, value) => { listbox[name] = value; },
    };
    const sandbox = {
      gearPickerActiveIndex: 0,
      document: { getElementById: () => listbox },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${helper[0]}\n${mover[0]}`, sandbox);

    sandbox.moveGearPickerActive('ArrowDown');
    assert.equal(sandbox.gearPickerActiveIndex, 2);
    assert.equal(listbox['aria-activedescendant'], 'last');
    assert.deepEqual(focused, ['last']);
    assert.equal(options[1].tabIndex, -1);

    sandbox.moveGearPickerActive('ArrowUp');
    assert.equal(sandbox.gearPickerActiveIndex, 0);
    assert.equal(listbox['aria-activedescendant'], 'first');
    assert.deepEqual(focused, ['last', 'first']);
    assert.equal(options[1].tabIndex, -1);
  });
});

function indexHtml() {
  return readFileSync(join(root, 'index.html'), 'utf8');
}
