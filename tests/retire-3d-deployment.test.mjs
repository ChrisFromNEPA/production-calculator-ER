import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = relative => readFileSync(join(root, relative), 'utf8');

const packageJson = JSON.parse(read('package.json'));
const allowlist = JSON.parse(read('public-files.json'));
const engine = read('src/engine.js');
const html = read('index.html');
const sw = read('sw.js');

 test('retires contextual 3D UI and runtime infrastructure', () => {
  assert.doesNotMatch(engine, /Find 3D model|data-ip-model|loadCMGModelManifest|mountCMGPreview/);
  assert.doesNotMatch(html, /data-cmg-3d-preview|r3f-loader|legacy-3d-loader|spatial-emphasis|data-cmg-r3f-v1/);
  assert.doesNotMatch(sw, /models\/|3D|3d|r3f|three/i);
  for (const relative of [
    'src/3d/entry.jsx',
    'src/generated/er-3d-workbench.js',
    'src/ui/legacy-3d-loader.js',
    'src/ui/r3f-loader.js',
    'src/ui/spatial-emphasis.js',
    'src/views/models.js',
    'src/views/character.js',
    'src/vendor/three/three.min.js',
    'src/vendor/three/OrbitControls.js',
    'src/vendor/three/GLTFLoader.js',
  ]) assert.equal(existsSync(join(root, relative)), false, `retired file remains: ${relative}`);
  for (const pattern of allowlist.runtime) assert.doesNotMatch(pattern, /model|skin/i, `3D allowlist pattern remains: ${pattern}`);
  for (const dependency of ['three', 'react', 'react-dom', '@react-three/fiber', '@react-three/drei']) {
    assert.equal(packageJson.dependencies?.[dependency], undefined, `3D dependency remains: ${dependency}`);
  }
  for (const script of ['build:3d', 'test:3d', 'test:budgets']) {
    assert.equal(packageJson.scripts?.[script], undefined, `3D script remains: ${script}`);
  }
  assert.equal(packageJson.scripts.build, 'node scripts/build-pages.mjs');
  assert.equal(packageJson.scripts['build:pages'], 'node scripts/build-pages.mjs');
});

test('source model archive stays tracked but is absent from Pages allowlist', () => {
  assert.ok(existsSync(join(root, 'models')));
  assert.ok(read('models/1x1_square.glb').length > 0);
  assert.equal(allowlist.runtime.some(pattern => /^models\//i.test(pattern)), false);
  assert.equal(allowlist.runtime.some(pattern => /skin/i.test(pattern)), false);
});

test('Pages budgets are tightened around the post-3D artifact', () => {
  assert.ok(allowlist.budgets.max_bytes <= 32 * 1024 * 1024);
  assert.ok(allowlist.budgets.max_files <= 2000);
});
