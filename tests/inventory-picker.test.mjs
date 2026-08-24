import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const inventory = readFileSync(join(root, 'src/views/inventory.js'), 'utf8');
const init = readFileSync(join(root, 'src/app-init.js'), 'utf8');
const css = readFileSync(join(root, 'src/styles.css'), 'utf8');

describe('inventory add-stock picker', () => {
  it('exposes accessible category tabs for the repeated stocking workflow', () => {
    assert.match(html, /id="qp-cats"[^>]*role="tablist"/);
    for (const category of ['Medical', 'Ammunition', 'Drugs', 'Food & Drink']) {
      assert.match(inventory, new RegExp(`value: '${category}'`));
    }
    assert.match(inventory, /role="tab"/);
    assert.match(inventory, /role="option"/);
  });

  it('shows the focused materials set without an arbitrary large-screen cap', () => {
    assert.match(inventory, /QP_CATEGORY === 'Materials' \? scored\.length/);
    assert.match(css, /@media \(min-width: 1181px\)[\s\S]*\.qp-grid\s*\{[^}]*max-height:\s*none[\s\S]*overflow-y:\s*visible/s);
    assert.match(css, /@media \(min-width: 1181px\)[\s\S]*\.inventory-layout\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/s);
    assert.match(css, /\.qp-grid\s*\{[\s\S]*align-items:\s*start[\s\S]*align-content:\s*start/s);
  });

  it('preserves the viewport and focus while selecting or adding stock', () => {
    assert.match(inventory, /function inventoryViewportSnapshot\(\)/);
    assert.match(inventory, /function preserveInventoryViewport\(work\)/);
    assert.match(init, /markQuickPickerSelection\(btn\.dataset\.qpItem\)/);
    assert.match(init, /focus\(\{ preventScroll: true \}\)/);
    assert.match(init, /restoreInventoryViewport\(viewport\)/);
    assert.match(css, /\.qp-grid\s*\{[\s\S]*overflow-anchor:\s*none/s);
  });

  it('keeps rapid stock entry together and visible above the catalog', () => {
    assert.match(html, /class="inventory-rapid-entry"[^>]*aria-label="Rapid stock entry"/);
    assert.match(html, /inventory-rapid-entry[\s\S]*inventory-add-fields[\s\S]*inventory-picker/s);
    assert.match(html, /Enter a quantity and press Add to keep stocking this zone/i);
    assert.match(css, /\.inventory-rapid-entry\s*\{[\s\S]*position:\s*sticky/s);
  });
});
