import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(root, 'data', 'game_data.json'), 'utf8'));

describe('ER-X ammunition data', () => {
  it('defines four ER-X Rubber Rounds from two rubber and two chemicals', () => {
    const recipe = data.recipes.find(r => r.output?.item === 'ER-X Rubber Rounds');
    assert.ok(recipe, 'ER-X Rubber Rounds recipe should exist');
    assert.deepEqual(recipe.output, {
      item: 'ER-X Rubber Rounds',
      quantity: 4,
      category: 'Ammunition',
    });
    assert.deepEqual(recipe.inputs, [
      { item: 'rubber', quantity: 2 },
      { item: 'chemicals', quantity: 2 },
    ]);
    assert.equal(recipe.process, 'manufacture');
  });

  it('ships a dedicated icon for ER-X Rubber Rounds', () => {
    assert.ok(existsSync(join(root, 'icons', 'er-x rubber rounds.png')));
  });
});
