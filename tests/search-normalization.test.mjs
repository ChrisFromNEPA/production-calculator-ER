// tests/search-normalization.test.mjs — item search normalization regression guard
// P1: "medkit" must find the MediKit items even though the game data spells them
// "MediKit", the picker placeholder must come from the live final-item count
// instead of a hardcoded number, and an empty picker result must explain itself.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import mod from './harness.mjs';

const root = join(import.meta.dirname, '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const appCore = readFileSync(join(root, 'src', 'app-core.js'), 'utf8');
const gear = readFileSync(join(root, 'src', 'views', 'gear.js'), 'utf8');
const inventory = readFileSync(join(root, 'src', 'views', 'inventory.js'), 'utf8');

const MEDKIT_ITEMS = ['Battle MediKit', 'Emergency MediKit', 'Small MediKit', 'Standard MediKit'];

function searchItems(q) {
  const nq = mod.normalizeSearchText(q);
  if (!nq) return [];
  return mod.FINAL_ITEMS.filter(name => mod.normalizeSearchText(name).includes(nq));
}

describe('item search normalization', () => {
  it('normalizes every common MediKit spelling to one searchable key', () => {
    for (const variant of ['medkit', 'medikit', 'MediKit', 'med kit', 'medi kit', 'Medi Kit']) {
      assert.equal(mod.normalizeSearchText(variant), 'medkit', variant);
    }
    assert.equal(mod.normalizeSearchText('Small MediKit'), 'smallmedkit');
    assert.equal(mod.normalizeSearchText(''), '');
  });

  it('finds every MediKit item for medkit, medikit, and spaced queries', () => {
    for (const q of ['medkit', 'medikit', 'med kit', 'medi kit']) {
      const hits = searchItems(q);
      for (const item of MEDKIT_ITEMS) {
        assert.ok(hits.includes(item), `${q} should match ${item}`);
      }
    }
  });

  it('does not broaden matching to unrelated items and keeps plain search intact', () => {
    const hits = searchItems('medkit');
    assert.ok(!hits.includes('CryoTech Medigun CM1'), 'medkit must not match Medigun');
    assert.ok(searchItems('medigun').includes('CryoTech Medigun CM1'));
    assert.ok(searchItems('linner').includes('Linner PP7'));
  });

  it('wires normalization into the calculator picker search', () => {
    const render = appCore.match(/function renderPicker\(\)[\s\S]*?\n}/)[0];
    assert.match(render, /normalizeSearchText\(name\)/);
    assert.doesNotMatch(render, /name\.toLowerCase\(\)\.includes\(q\)/);
  });

  it('wires normalization into the gear picker search', () => {
    assert.match(gear, /normalizeSearchText/);
    assert.doesNotMatch(gear, /name\.toLowerCase\(\)\.includes\(searchQ\)/);
  });

  it('wires normalization into the inventory item search', () => {
    assert.match(inventory, /normalizeSearchText/);
    assert.doesNotMatch(inventory, /e\.item\.toLowerCase\(\)\.includes\(q\)/);
    assert.match(inventory, /normalizeSearchText\(document\.getElementById\('qp-search'\)/);
  });

  it('keeps the picker placeholder concise so it does not clip', () => {
    assert.doesNotMatch(html, /placeholder="Search \d+ final items/);
    const init = appCore.match(/function initPickerFilters\(\)[\s\S]*?\n}/)[0];
    assert.match(init, /picker-search/);
    assert.match(init, /search\.placeholder\s*=\s*['"]Search final items…['"]/);
    assert.doesNotMatch(init, /FINAL_ITEMS\.length/);
  });

  it('explains an empty picker result instead of a bare message', () => {
    assert.match(appCore, /No items match/);
    assert.match(appCore, /Try a shorter term/);
  });
});
