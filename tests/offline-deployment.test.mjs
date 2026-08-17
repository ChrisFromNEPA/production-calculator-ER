// tests/offline-deployment.test.mjs — shell/cache/deployment contract
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const r3fLoader = readFileSync(join(root, 'src/ui/r3f-loader.js'), 'utf8');
const legacyLoader = readFileSync(join(root, 'src/ui/legacy-3d-loader.js'), 'utf8');
const chartLoader = readFileSync(join(root, 'src/ui/chart-loader.js'), 'utf8');
const modelsView = readFileSync(join(root, 'src/views/models.js'), 'utf8');

// The lazy-loading mechanism: these tiny loader stubs are the ONLY 3D/chart
// files allowed in the install-time SHELL precache. They gate the on-demand
// fetch of the heavy payloads below.
const SHELL_LAZY_LOADERS = [
  './src/ui/r3f-loader.js',
  './src/ui/legacy-3d-loader.js',
  './src/ui/chart-loader.js',
];

// Optional 3D/chart payloads. These must NEVER be install-precached; they are
// fetched lazily at runtime and cached by the network-first fetch handler.
const OPTIONAL_3D_CHART_ASSETS = [
  './src/generated/er-3d-workbench.js',
  './src/vendor/chart.min.js',
  './src/vendor/three/three.min.js',
  './src/vendor/three/OrbitControls.js',
  './src/vendor/three/GLTFLoader.js',
  './models/models_manifest.json',
];

describe('offline and deployment verification', () => {
  it('precaches only the shell and lazy-loader stubs, never optional 3D/chart payloads', () => {
    assert.match(sw, /const CACHE = 'er-v\d+\.\d+\.\d+'/);
    // The loader stubs stay in the shell so lazy loading can start.
    for (const path of SHELL_LAZY_LOADERS) {
      assert.ok(sw.includes(path), `${path} must stay precached`);
    }
    // Every optional 3D/chart asset must be absent from the install precache.
    for (const path of OPTIONAL_3D_CHART_ASSETS) {
      assert.ok(!sw.includes(path), `${path} must not be precached`);
    }
    // Raw model files are never precached either.
    assert.doesNotMatch(sw, /models\/.*\.glb/);
  });

  it('preserves runtime lazy loading for the optional 3D/chart assets', () => {
    // The loaders still point at the lazy payloads…
    assert.match(r3fLoader, /src\/generated\/er-3d-workbench\.js/);
    assert.match(legacyLoader, /src\/vendor\/three\/three\.min\.js/);
    assert.match(legacyLoader, /src\/vendor\/three\/OrbitControls\.js/);
    assert.match(legacyLoader, /src\/vendor\/three\/GLTFLoader\.js/);
    assert.match(chartLoader, /src\/vendor\/chart\.min\.js/);
    assert.match(modelsView, /fetch\('models\/models_manifest\.json'\)/);
    // …and the fetch handler still runtime-caches what it serves.
    assert.match(sw, /cache\.put\(e\.request, clone\)/);
  });

  it('keeps the page entry references versioned and the generated bundle lazy', () => {
    assert.doesNotMatch(html, /src="src\/generated\/er-3d-workbench\.js\?v=1"/);
    assert.match(html, /src="src\/ui\/r3f-loader\.js\?v=2"/);
    assert.match(html, /src="src\/ui\/legacy-3d-loader\.js\?v=1"/);
    assert.match(html, /src="src\/ui\/chart-loader\.js\?v=1"/);
    // Chart.js itself must never be part of the page entry — only its loader.
    assert.doesNotMatch(html, /src="src\/vendor\/chart\.min\.js/);
  });
});
