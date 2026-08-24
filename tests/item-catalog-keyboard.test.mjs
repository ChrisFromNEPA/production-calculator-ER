// tests/item-catalog-keyboard.test.mjs — keyboard contract for the Models item catalog
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const models = readFileSync(join(root, 'src', 'views', 'models.js'), 'utf8');
const css = readFileSync(join(root, 'src', 'styles.css'), 'utf8');

describe('item catalog keyboard access', () => {
  it('renders item cards as keyboard-operable buttons', () => {
    assert.match(models, /data-icon-file=.*role="button"/);
    assert.match(models, /tabindex="0"/);
    assert.match(models, /aria-pressed=.*pressed/);
  });

  it('activates the focused item card with Enter or Space', () => {
    assert.match(models, /icons-grid[\s\S]*addEventListener\('keydown'/);
    assert.match(models, /e\.key !== 'Enter' && e\.key !== ' '/);
    assert.match(models, /renderIconDetail\(entry\)/);
  });

  it('keeps keyboard focus visibly identifiable', () => {
    assert.match(css, /\.icon-card:focus-visible\s*\{/);
  });
});
