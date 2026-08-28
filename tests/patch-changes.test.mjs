import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const source = readFileSync(join(root, 'src', 'views', 'patch-changes.js'), 'utf8');

function api() {
  const window = { BALANCE_STATS: { items: [] }, ARMOR_CLASSES: { families: [] }, GAME_DATA: { recipes: [] } };
  const context = vm.createContext({ window, document: {} });
  vm.runInContext(source, context);
  return window.PATCH_CHANGES;
}

describe('proposed patch changes tab', () => {
  it('has a navigable view, all navigation variants, and a loaded view script', () => {
    assert.match(html, /id="view-patch-changes"/);
    assert.match(html, /data-view="patch-changes"/);
    assert.match(html, /data-nav-view="patch-changes"/);
    assert.match(html, /src="src\/views\/patch-changes\.js\?v=7"/);
    assert.match(html, /id="patch-group-list"/);
    assert.match(html, /id="patch-build"/);
    assert.match(readFileSync(join(root, 'src', 'app-init.js'), 'utf8'), /patch-changes/);
    assert.match(readFileSync(join(root, 'src', 'app-init.js'), 'utf8'), /initPatchChanges/);
  });

  it('applies the Pythica heavy armor delta without mutating current stats', () => {
    const { applyPatch } = api();
    const stats = { armor: 107, shielding: 95, agility: -1.8, bioregen: 0 };
    const record = applyPatch({ name: 'Pythica Sustained Battle Helmet', stats });
    assert.equal(JSON.stringify(record.changes.map(c => [c.key, c.before, c.after])), JSON.stringify([
      ['armor', 107, 98], ['shielding', 95, 85], ['agility', -1.8, -1.5],
    ]));
    assert.deepEqual(stats, { armor: 107, shielding: 95, agility: -1.8, bioregen: 0 });
    const glove = applyPatch({ name: 'Pythica Sustained Gloves (Male)', stats: { armor: 48, shielding: 30 } });
    assert.equal(glove.proposed.armor, 42);
  });

  it('applies sustain-family changes and Resistance Amp changes', () => {
    const { applyPatch } = api();
    const sustain = applyPatch({ name: 'Hypobaric Leg Pads', stats: { agility: 2.1, armor: 15, shielding: 15, endurance: 15, resistance: 15, reflection: 15, staminaregen: .5, addictiontreatment: .04, healthregen: .2 } });
    assert.equal(sustain.proposed.healthregen, .25);
    assert.equal(sustain.proposed.armor, 10);
    assert.equal(sustain.proposed.reflection, 8);
    assert.equal(sustain.proposed.agility, 2);
    const amp = applyPatch({ name: 'Resistance Amp', stats: { healthregen: 2.5 } });
    assert.equal(amp.proposed.healthregen, 2);
    assert.equal(amp.proposed.armor, 25);
    assert.equal(amp.proposed.shielding, 25);
  });

  it('removes the proposed XenoTech shoulder stat block while retaining the item', () => {
    const { applyPatch } = api();
    const record = applyPatch({ name: 'XenoTech Expeditionary Shoulder Pads', stats: { agility: -1.8, bioregen: .5, armor: 95, shielding: 95, endurance: 75, reflection: 60, resistance: 150 } });
    assert.equal(record.item.name, 'XenoTech Expeditionary Shoulder Pads');
    assert.ok(record.changes.every(change => change.after === 0));
    assert.equal(record.proposed.bioregen, 0);
  });

  it('leaves unrelated items unchanged', () => {
    const { applyPatch } = api();
    const record = applyPatch({ name: 'Pythica Special Operations Helmet', stats: { armor: 75, agility: 1 } });
    assert.equal(record.changes.length, 0);
    assert.equal(JSON.stringify(record.proposed), JSON.stringify({ armor: 75, agility: 1 }));
  });

  it('classifies the published protection mapping explicitly', () => {
    const { protectionMapping } = api();
    assert.equal(JSON.stringify(protectionMapping), JSON.stringify([
      ['Armor', 'Ballistic', 'FDC'],
      ['Shielding', 'Energy', 'VI'],
      ['Endurance', 'Stamina', 'CMG'],
      ['Resistance', 'Bio', 'EC'],
      ['Reflection', 'Aura', 'BoS'],
    ]));
  });

  it('includes every armor and implant and groups only exact stat profiles', () => {
    const { allGearRecords, groupByExactStats } = api();
    const items = [
      { name: 'EC Helmet', stats: { armor: 10, shielding: 20 } },
      { name: 'Other Helmet', stats: { shielding: 20, armor: 10 } },
      { name: 'Shield Implant', stats: { armor: 10, shielding: 20 } },
      { name: 'Food', stats: { health: 50 } },
    ];
    const window = globalThis;
    assert.equal(allGearRecords(items).length, 4);
    const groups = groupByExactStats(allGearRecords(items));
    assert.equal(groups.length, 2);
    assert.equal(groups.find(group => group.records.length === 3).records.length, 3);
  });

  it('offers all armor in a slot and all implants, not only EC or Pythica', () => {
    const { buildCandidates } = api();
    const items = [
      { name: 'Locans Patrol Helmet', stats: {} },
      { name: 'Aramid Basic Helmet', stats: {} },
      { name: 'Scanner Implant', stats: {} },
      { name: 'Stamina Amplification', stats: {} },
    ];
    const recipes = items.map(item => ({ output: { item: item.name, category: item.name.includes('Implant') || item.name.includes('Amplification') ? 'Implants & Electronics' : 'Armor', stats: item.stats }, _armor_type: item.name.includes('Helmet') ? 'Helmet' : undefined }));
    assert.deepEqual(buildCandidates('Helmet', items, recipes), ['Aramid Basic Helmet', 'Locans Patrol Helmet']);
    assert.deepEqual(buildCandidates('Leg / implant slot', items, recipes), ['Scanner Implant', 'Stamina Amplification']);
    const consumables = [
      { name: 'Combat Booster', stats: {} }, { name: 'Standard Medikit', stats: {} }, { name: 'CryoTech Medigun CM2', stats: {} },
    ];
    const consumableRecipes = consumables.map(item => ({ output: { item: item.name, category: item.name.includes('Medikit') ? 'Medical' : 'Drugs', stats: item.stats } }));
    assert.deepEqual(buildCandidates('Booster / food 1', consumables, consumableRecipes), ['Combat Booster']);
    assert.deepEqual(buildCandidates('Medikit', consumables, consumableRecipes), ['Standard Medikit']);
  });

  it('uses the shared item icon renderer for gear summaries', () => {
    const { renderGearIcon } = api();
    assert.match(renderGearIcon('Aramid Basic Helmet'), /Aramid Basic Helmet/);
  });
});
