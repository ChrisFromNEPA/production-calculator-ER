// tests/gear-reference-separation.test.mjs — make the two Gear catalog roles explicit
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const css = readFileSync(join(root, 'src', 'styles.css'), 'utf8');

describe('gear picker and reference separation', () => {
  it('explains how empty loadout slots connect to the compatible picker', () => {
    assert.match(html, /Click a loadout slot to choose compatible gear/i);
    assert.match(html, /compatible gear picker/i);
  });

  it('labels the balance-sheet catalog as a secondary reference', () => {
    assert.match(html, /Combat Stats Reference/);
    assert.match(html, /reference list below is for comparison/i);
  });

  it('styles the picker guidance as secondary helper copy', () => {
    assert.match(css, /\.gear-loadout-hint\s*\{/);
  });
});
