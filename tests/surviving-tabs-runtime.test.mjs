// Regression contract for surviving public-tab runtime dependencies.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = file => readFileSync(join(root, file), 'utf8');
const html = read('index.html');
const sw = read('sw.js');
const reference = read('src/views/reference.js');
const styles = read('src/styles.css');

describe('surviving tab runtime dependencies', () => {
  it('ships the renderer module required by Drugs and Battle Nodes', () => {
    assert.match(reference, /function renderDrugs\(/);
    assert.match(reference, /function renderBattleNodes\(/);
    assert.match(html, /<script src="src\/views\/reference\.js\?v=\d+"><\/script>/);
    assert.match(sw, /\.\/src\/views\/reference\.js/);
  });

  it('precaches the Gear 1.9 and Gear 1.10 view modules', () => {
    assert.match(html, /<script src="src\/views\/patch-changes\.js\?v=\d+"><\/script>/);
    assert.match(sw, /\.\/src\/views\/gear\.js/);
    assert.match(sw, /\.\/src\/views\/patch-changes\.js/);
  });

  it('does not expose an empty More navigation control', () => {
    const menu = html.match(/<nav id="nav-more-menu"[\s\S]*?<\/nav>/)?.[0] || '';
    const hasEntries = /class="tab"/.test(menu);
    if (!hasEntries) {
      assert.doesNotMatch(html, /class="nav-more"/);
      assert.doesNotMatch(html, /class="nav-more-btn"/);
    }
  });

  it('bumps the offline shell whenever runtime dependencies change', () => {
    assert.doesNotMatch(sw, /const CACHE = 'er-v0\.1\.0'/);
  });

  it('retains the visual layout for Models, Character Studio, and Item Catalog', () => {
    assert.match(styles, /\.models-layout\s*\{/);
    assert.match(styles, /\.models-viewer\s*\{[^}]*min-height:\s*480px/s);
    assert.match(styles, /\.studio-layout\s*\{/);
    assert.match(styles, /\.icons-grid\s*\{/);
    assert.match(styles, /\.icon-card img\s*\{/);
  });
});
