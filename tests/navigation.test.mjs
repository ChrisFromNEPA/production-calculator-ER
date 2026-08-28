// tests/navigation.test.mjs — grouped navigation contract
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const appCore = readFileSync(join(root, 'src', 'app-core.js'), 'utf8');
const appInit = readFileSync(join(root, 'src', 'app-init.js'), 'utf8');
const shellCss = readFileSync(join(root, 'src', 'styles', 'shell.css'), 'utf8');

const views = [...html.matchAll(/<section\s+id="view-([^"]+)"/g)].map(m => m[1]);
const groupedMarkup = html.match(/<div class="nav-v2-groups">([\s\S]*?)<div id="mobile-nav-v2"/)[1];
const groupedViews = [...groupedMarkup.matchAll(/data-nav-view="([^"]+)"/g)].map(m => m[1]);

const expectedGroups = {
  workflows: ['calc', 'inventory', 'gear', 'patch-changes'],
  operations: ['colonies', 'battle', 'models'],
  reference: ['drugs'],
  culture: ['community'],
};
const expectedViews = Object.values(expectedGroups).flat();

describe('grouped navigation shell', () => {
  it('keeps one grouped navigation entry for every existing view', () => {
    assert.equal(new Set(views).size, views.length);
    assert.deepEqual([...groupedViews].sort(), [...expectedViews].sort());
    assert.equal(new Set(groupedViews).size, groupedViews.length);
  });

  it('contains accessible desktop groups, mobile actions, and a drawer hook', () => {
    assert.match(html, /id="nav-v2"/);
    for (const group of Object.keys(expectedGroups)) {
      assert.match(html, new RegExp(`data-nav-group="${group}"`));
    }
    assert.match(html, /id="mobile-nav-v2"/);
    assert.match(html, /id="nav-v2-drawer"/);
    assert.match(html, /aria-label="Mobile navigation"/);
    assert.match(html, /data-nav-toggle="drawer"[^>]*aria-expanded="false"[^>]*aria-controls="nav-v2-drawer"/);
    assert.match(html, /role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="nav-v2-drawer-title"/);
  });

  it('routes grouped navigation through the existing view lifecycle', () => {
    assert.match(appInit, /nav-v2/);
    assert.match(appInit, /setView\([^)]*navView/);
    assert.match(appInit, /closeNavV2Drawer\(true\)/);
    assert.match(appInit, /navV2DrawerToggle\?\.focus\(\)/);
    assert.match(appCore, /CMG_NAV_GROUPS/);

  });

  it('keeps the new navigation opt-in and preserves touch-sized controls', () => {
    assert.match(shellCss, /data-cmg-layout-v2="on"/);
    assert.match(shellCss, /min-height:\s*var\(--component-touch-target\)/);
    assert.match(shellCss, /@media \(max-width: 767px\)/);
    assert.match(shellCss, /\.nav-bar > #legacy-nav,\s*\n\s*\.nav-bar > \.nav-more \{ display: none; \}/);
    assert.match(shellCss, /\.nav-bar > #nav-v2 \{ display: block; \}/);
    assert.match(shellCss, /\.theme-bar\s*\{[^}]*overflow-x:\s*auto/s);
  });
});
