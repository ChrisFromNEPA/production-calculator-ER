import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import colonyWork from '../src/colony-work.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const { buildColonyWorkQueue, currentColonyObjective, workActionId } = colonyWork;
const root = join(import.meta.dirname, '..');
const appSource = readFileSync(join(root, 'src/app.js'), 'utf8');
const coreSource = readFileSync(join(root, 'src/app-core.js'), 'utf8');
const cssSource = readFileSync(join(root, 'src/styles.css'), 'utf8');

describe('current colony objective', () => {
  it('advances in semantic work order and never reselects completed cargo', () => {
    const queue = buildColonyWorkQueue({
      refineDestination: 'DMC', destination: 'Paris',
      acquire: { carbon: { qty: 4, from: ['DMC'], preferred: 'DMC' } },
      refine: [{ item: 'foam', batches: 1, location: 'DMC' }],
      finalTransport: { foam: 1 },
      manufacture: [{ item: 'final item', batches: 1, location: 'Paris' }],
    }, {});
    const manufacture = [{ item: 'final item', batches: 1, location: 'Paris' }];
    const first = currentColonyObjective(queue, manufacture, {});
    assert.equal(first.kind, 'mine');
    const complete = { [workActionId(first.action)]: true };
    const second = currentColonyObjective(queue, manufacture, complete);
    assert.equal(second.kind, 'refine');
    complete[workActionId(second.action)] = true;
    const third = currentColonyObjective(queue, manufacture, complete);
    assert.equal(third.kind, 'move-batch');
    complete[workActionId(third.action)] = true;
    assert.equal(currentColonyObjective(queue, manufacture, complete).kind, 'manufacture');
  });

  it('marks one semantic objective with accessible state and recedes completed cards', () => {
    assert.match(appSource, /currentColonyObjective\(/);
    assert.match(coreSource, /data-current-objective/);
    assert.match(coreSource, /aria-current="step"/);
    assert.match(coreSource, /function stepCard\(s, isFinal\)/);
    assert.match(cssSource, /\.current-objective/);
    assert.match(cssSource, /prefers-reduced-motion:\s*reduce[\s\S]*current-objective/);
  });

  it('advances the rendered objective immediately after checklist completion', () => {
    assert.match(appSource, /function advanceColonyObjective\(container\)/);
    for (const handler of ['toggleObtainCheck', 'toggleTransferCheck', 'toggleProduceCheck']) {
      const body = appSource.match(new RegExp(`function ${handler}\\([\\s\\S]*?\\n\\}`))?.[0] || '';
      assert.match(body, /advanceColonyObjective\(container\)/, `${handler} should advance objective state`);
    }
  });
});
