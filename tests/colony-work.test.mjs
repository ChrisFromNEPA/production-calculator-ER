import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import colonyWork from '../src/colony-work.js';

const { buildColonyWorkQueue } = colonyWork;
const root = join(import.meta.dirname, '..');
const appSource = readFileSync(join(root, 'src', 'app.js'), 'utf8');
const htmlSource = readFileSync(join(root, 'index.html'), 'utf8');
const cssSource = readFileSync(join(root, 'src', 'styles.css'), 'utf8');
const initSource = readFileSync(join(root, 'src', 'app-init.js'), 'utf8');

describe('combined per-colony work queue', () => {
  it('is the single calculator logistics section for both plan shapes', () => {
    assert.match(appSource, /renderColonyWorkSection\(plan\)/);
    assert.match(appSource, /planSection\('colony-work', 1, 'Visit, mine, move & refine by colony'/);
    assert.match(appSource, /stepCard\(action\.step \|\| action/);
    assert.match(htmlSource, /src="src\/colony-work\.js\?v=1"/);
    assert.doesNotMatch(appSource, /planSection\('move', 1/);
    assert.doesNotMatch(appSource, /planSection\('obtain', 2/);
    assert.doesNotMatch(appSource, /planSection\('refine'/);
  });

  it('makes the remaining all-cargo move the dominant next action', () => {
    assert.match(appSource, /flow-card move move-batch-action colony-work-action/);
    assert.match(appSource, /Move all cargo from/);
    assert.match(cssSource, /\.flow-card\.move-batch-action\.current-objective:not\(\.done\)[\s\S]*?font-size:\s*1rem/);
    assert.match(cssSource, /\.flow-card\.move-batch-action\.current-objective:not\(\.done\)[\s\S]*?border:\s*2px/);
    assert.doesNotMatch(cssSource, /\.flow-card\.move-batch-action:not\(\.done\)\s*\{/);
  });

  it('provides a direct action button for the grouped cargo move', () => {
    assert.match(appSource, /class="move-all-cargo-btn/);
    assert.match(appSource, /data-move-all-cargo/);
    assert.match(appSource, /data-move-label="' \+ esc\('Move all cargo from/);
    assert.match(initSource, /move-all-cargo-btn/);
    assert.match(initSource, /markMoveBatchComplete/);
    assert.match(appSource, /var batchOrigin = action\.from \|\| action\.colony \|\| group\.colony/);
  });

  it('keeps completed grouped cargo cards in a readable vertical layout', () => {
    assert.match(cssSource, /\.flow-card\.move-batch-action\.done \.flow-card-body\s*\{[\s\S]*?display:\s*block/);
  });

  it('groups mining, owned-stock moves, refinement, and final moves by visit colony', () => {
    const plan = {
      refineDestination: 'DMC',
      destination: 'Paris',
      acquire: {
        carbon: { qty: 4, from: ['DMC'], preferred: 'DMC' },
        iron: { qty: 3, from: ['Andromeda'], preferred: 'Andromeda' },
      },
      transport: {
        textiles: { qty: 2, from: ['Andromeda'], fromQty: { Andromeda: 2 }, to: 'DMC' },
      },
      refine: [{ item: 'titanium syntactic foam', batches: 1, produced: 2, location: 'DMC' }],
      manufacture: [{ item: 'final item', batches: 1, produced: 1, location: 'Paris' }],
      finalTransport: { 'titanium syntactic foam': 2 },
    };

    const queue = buildColonyWorkQueue(plan, {});
    assert.deepEqual(queue.map(group => group.colony), ['Andromeda', 'DMC']);

    const andromeda = queue.find(group => group.colony === 'Andromeda');
    assert.deepEqual(andromeda.actions.map(action => action.kind), ['mine', 'move-batch']);
    assert.deepEqual(andromeda.actions[1].items.map(item => item.kind), ['move-owned', 'move-mined']);
    assert.deepEqual(andromeda.actions[1].items.map(item => item.item), ['textiles', 'iron']);
    assert.equal(andromeda.actions[1].items[1].to, 'DMC');

    const dmc = queue.find(group => group.colony === 'DMC');
    assert.deepEqual(dmc.actions.map(action => action.kind), ['mine', 'refine', 'move-batch']);
    assert.equal(dmc.actions[1].item, 'titanium syntactic foam');
    assert.equal(dmc.actions[2].items[0].to, 'Paris');
  });

  it('does not add a mined-material move when the mine and refinement colonies match', () => {
    const plan = {
      refineDestination: 'DMC',
      destination: 'DMC',
      acquire: { carbon: { qty: 4, from: ['DMC'], preferred: 'DMC' } },
      transport: {},
      refine: [],
      manufacture: [],
      finalTransport: {},
    };
    const queue = buildColonyWorkQueue(plan, {});
    assert.deepEqual(queue[0].actions.map(action => action.kind), ['mine']);
  });

  it('ships an intermediate after its last refinement dependency, not after every refinement', () => {
    const plan = {
      refineDestination: 'DMC',
      destination: 'Paris',
      acquire: {},
      transport: {},
      refine: [
        { item: 'aluminum', batches: 1, produced: 3, location: 'DMC', resolvedInputs: [] },
        { item: 'bioplasma', batches: 1, produced: 2, location: 'DMC', resolvedInputs: [{ item: 'aluminum', qty: 2 }] },
        { item: 'chemicals', batches: 1, produced: 4, location: 'DMC', resolvedInputs: [] },
      ],
      manufacture: [],
      finalTransport: { aluminum: 1, bioplasma: 2, chemicals: 4 },
    };

    const queue = buildColonyWorkQueue(plan, {});
    assert.deepEqual(queue[0].actions.map(action => action.kind + ':' + (action.item || '')), [
      'refine:aluminum',
      'refine:bioplasma',
      'refine:chemicals',
      'move-batch:',
    ]);
    assert.deepEqual(queue[0].actions[3].items.map(item => item.item), ['aluminum', 'bioplasma', 'chemicals']);
  });
});
