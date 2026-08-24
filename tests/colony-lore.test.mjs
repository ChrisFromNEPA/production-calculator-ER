// Canonical screenshot-derived colony lore and runtime wiring.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = join(import.meta.dirname, '..');
const data = JSON.parse(readFileSync(join(root, 'data/game_data.json'), 'utf8'));
const runtime = readFileSync(join(root, 'src/game_data.js'), 'utf8');
const app = readFileSync(join(root, 'src/app.js'), 'utf8');
const docs = readFileSync(join(root, 'docs/colony-lore.md'), 'utf8');

const EXPECTED_NAMES = [
  'Pax Prime', 'Necars Field', 'Ceres Delta', 'Pegasi 51', 'Keplers Dome',
  'Andromeda City', "Demorgan's Castle", 'DSS Yukon', 'Training Grounds',
  'Paris', 'Berlin', "Bookers Valley", 'Titan Station', 'Aurelia',
  'NYC - Brooklyn', 'NYC - Ground Zero', 'NYC - Manhattan', 'Tokyo',
];

test('canonical colony lore covers every supplied in-game panel', async (t) => {
  await t.test('has one stable record for each of the 18 supplied colonies', () => {
    assert.ok(Array.isArray(data.colony_lore), 'data/game_data.json must expose colony_lore');
    assert.equal(data.colony_lore.length, EXPECTED_NAMES.length);
    assert.deepEqual(data.colony_lore.map(entry => entry.name), EXPECTED_NAMES);
    assert.equal(new Set(data.colony_lore.map(entry => entry.id)).size, data.colony_lore.length);
  });

  await t.test('preserves screenshot uncertainty instead of inventing numeric values', () => {
    for (const entry of data.colony_lore) {
      assert.equal(typeof entry.description, 'string');
      assert.ok(entry.description.length > 40, `${entry.name} needs its in-game description`);
      assert.equal(Number.isInteger(entry.resource_icon_count), true, `${entry.name} icon count`);
      assert.equal(entry.resources_labeled, false, `${entry.name} resource labels must remain unknown`);
      assert.equal(entry.security.numeric, null, `${entry.name} must not invent a security number`);
      assert.match(entry.security.visual, /no numeric value shown/i);
    }
  });

  await t.test('keeps the generated runtime mirror and provenance documentation in sync', () => {
    assert.match(runtime, /"colony_lore"/);
    assert.match(docs, /data\/game_data\.json/);
    assert.match(docs, /18/);
    assert.match(docs, /resource_icon_count/);
    assert.match(docs, /security\.numeric/);
  });
});

test('Colonies rendering consumes canonical lore records', () => {
  assert.match(app, /DATA\.colony_lore/);
  assert.match(app, /renderColonyLore/);
  assert.match(app, /security\.visual/);
  assert.match(app, /resource_icon_count/);
});
