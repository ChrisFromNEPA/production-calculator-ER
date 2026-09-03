// tests/chart-lazy-loading.test.mjs — Chart.js must stay out of the initial
// payload and load only when the Inventory charts are first needed.
//
// P2 slice: the app previously shipped `<script src="src/vendor/chart.min.js"
// defer>` in every page load (~200 KB raw / ~60 KB gzip) even though the only
// consumer is the Inventory "📊 Inventory Charts" <details> panel. Chart.js is
// now fetched on demand by a tiny loader stub (src/ui/chart-loader.js), the
// and runtime-cached by the service worker.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const loaderPath = join(root, 'src', 'ui', 'chart-loader.js');
const chartLoader = existsSync(loaderPath) ? readFileSync(loaderPath, 'utf8') : '';
const inventory = readFileSync(join(root, 'src', 'views', 'inventory.js'), 'utf8');

describe('lazy Chart.js loading', () => {
  it('does not eagerly load Chart.js in the page entry', () => {
    assert.doesNotMatch(html, /src="src\/vendor\/chart\.min\.js/);
  });

  it('loads the versioned chart-loader stub in the page entry', () => {
    assert.match(html, /src="src\/ui\/chart-loader\.js\?v=1"/);
  });

  it('precaches the loader stub but never the Chart.js payload', () => {
    assert.ok(sw.includes('./src/ui/chart-loader.js'), 'loader stub must stay in the SHELL precache');
    assert.ok(!sw.includes('./src/vendor/chart.min.js'), 'Chart.js payload must not be precached');
  });

  it('injects the versioned Chart.js payload on demand', () => {
    assert.match(chartLoader, /src\/vendor\/chart\.min\.js\?v=1/);
    assert.match(chartLoader, /createElement\('script'\)/);
    assert.match(chartLoader, /window\.cmgLoadChart/);
  });

  it('renders inventory charts by triggering the lazy loader when Chart is missing', () => {
    // The render guard must now pull in the payload instead of silently
    // returning, otherwise opening the charts panel would stay blank forever.
    assert.match(inventory, /typeof Chart === 'undefined'/);
    assert.match(inventory, /window\.cmgLoadChart/);
  });
});
