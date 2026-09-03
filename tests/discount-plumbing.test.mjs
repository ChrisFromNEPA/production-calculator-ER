import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import mod from './harness.mjs';

const root = join(import.meta.dirname, '..');

describe('supported calculation API', () => {
  it('does not expose production, mining, or transport discount inputs', () => {
    assert.equal(mod.compute.length, 7, 'compute accepts item, quantity, choices, ledger, locations, destination, and refinement destination');

    const engine = readFileSync(join(root, 'src/engine.js'), 'utf8');
    const core = readFileSync(join(root, 'src/app-core.js'), 'utf8');
    const init = readFileSync(join(root, 'src/app-init.js'), 'utf8');
    const app = readFileSync(join(root, 'src/app.js'), 'utf8');
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const css = readFileSync(join(root, 'src/styles.css'), 'utf8');

    for (const [name, source] of Object.entries({ engine, core, init, app, html, css })) {
      assert.doesNotMatch(source, /getDiscounts|disc-(?:prod|mine|trans)|discount-panel/, `${name} still claims unsupported discount plumbing`);
    }
  });
});
