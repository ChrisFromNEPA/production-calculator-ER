// tests/offline-deployment.test.mjs — shell/cache/deployment contract
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFileSync(join(root, relative), 'utf8');
const sw = read('sw.js');
const html = read('index.html');
const chartLoader = read('src/ui/chart-loader.js');

describe('offline and deployment verification', () => {
  it('precaches the calculator shell without retired 3D infrastructure', () => {
    assert.match(sw, /const CACHE = 'er-prodcalc-v\d+\.\d+\.\d+-shell'/);
    assert.ok(sw.includes('./src/ui/chart-loader.js'));
    assert.doesNotMatch(sw, /models\/|3D|3d|r3f|three/i);
    assert.doesNotMatch(sw, /src\/generated\//);
    assert.doesNotMatch(sw, /src\/vendor\/three\//);
  });

  it('keeps the surviving chart payload lazy and runtime-cached', () => {
    assert.match(chartLoader, /src\/vendor\/chart\.min\.js/);
    assert.match(sw, /cache\.put\(request, response\)/);
    assert.match(sw, /src\/vendor\//);
  });

  it('keeps page entry references limited to surviving application scripts', () => {
    assert.doesNotMatch(html, /data-cmg-(?:3d|r3f)|r3f-loader|legacy-3d-loader|spatial-emphasis|er-3d-workbench|models_manifest|character_skins/i);
    assert.match(html, /src="src\/ui\/chart-loader\.js\?v=1"/);
    assert.doesNotMatch(html, /src="src\/vendor\/chart\.min\.js/);
  });
});
