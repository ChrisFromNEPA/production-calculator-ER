// Retired public surfaces must not remain in the shipped shell.
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const root = join(import.meta.dirname, '..');
const read = file => readFileSync(join(root, file), 'utf8');

describe('retired public surfaces', () => {
  it('removes retired tabs and their navigation labels', () => {
    const html = read('index.html');
    for (const label of ['Requests', 'Weapons', 'Analytics', 'All Items', 'Client RE', 'Factions', 'Knowledge Base', 'Help Fix Data']) {
      assert.doesNotMatch(html, new RegExp(label));
    }
  });

  it('removes the complete Models area from public navigation and startup', () => {
    const html = read('index.html');
    const core = read('src/app-core.js');
    const init = read('src/app-init.js');
    const sw = read('sw.js');

    assert.doesNotMatch(html, /data-(?:nav-)?view="models"/);
    assert.doesNotMatch(html, /id="view-models"/);
    assert.doesNotMatch(html, /src="src\/views\/(?:models|character)\.js/);
    assert.doesNotMatch(core, /operations:\s*Object\.freeze\(\[[^\]]*['"]models['"]/);
    assert.doesNotMatch(init, /DIRECT_HASH_ROUTES[^\n]*['"]models['"]/);
    assert.doesNotMatch(init, /wireModelsEvents|wireCharacterStudioEvents|initModelsView/);
    assert.doesNotMatch(sw, /\.\/src\/views\/(?:models|character)\.js/);
  });
});
