// tests/r3f-build.test.mjs — reproducible lazy R3F island contract
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const loader = readFileSync(join(root, 'src', 'ui', 'r3f-loader.js'), 'utf8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

describe('lazy React/R3F build', () => {
  it('has reproducible build and verification scripts with pinned major lines', () => {
    assert.equal(pkg.scripts['build:3d'], 'vite build --config vite.config.mjs');
    assert.equal(pkg.scripts['test:3d'], 'npm run build:3d && node --test tests/r3f-build.test.mjs');
    assert.match(pkg.dependencies.react, /^\^19/);
    assert.match(pkg.dependencies['@react-three/fiber'], /^\^9/);
  });

  it('loads the bridge lazily and preserves the legacy viewer by default', () => {
    assert.match(html, /src="src\/ui\/r3f-loader\.js\?v=2"/);
    assert.match(loader, /src\/generated\/er-3d-workbench\.js/);
    assert.match(html, /data-cmg-r3f-v1="off"/);
    assert.match(readFileSync(join(root, 'src', 'views', 'models.js'), 'utf8'), /r3f_v1/);
  });

  it('produces a non-empty browser bundle exposing the bridge', () => {
    const output = join(root, 'src', 'generated', 'er-3d-workbench.js');
    assert.ok(existsSync(output), 'run npm run build:3d before this assertion');
    assert.ok(statSync(output).size > 10000);
    assert.match(readFileSync(output, 'utf8'), /CMG3D/);
  });
});
