// tests/patch-wide-layout.test.mjs — keep Gear 1.10 useful on wide canvases
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const css = readFileSync(join(root, 'src/styles/surviving-reference.css'), 'utf8');
const shell = readFileSync(join(root, 'src/styles.css'), 'utf8');

describe('Gear 1.10 wide-canvas layout', () => {
  it('widens only the active Gear 1.10 content column at 2K and 4K breakpoints', () => {
    assert.match(shell, /@media\s*\(min-width:\s*2000px\)[\s\S]*main:has\(>\s*#view-patch-changes\.active\)[\s\S]*max-width:\s*1800px/s);
    assert.match(shell, /@media\s*\(min-width:\s*3000px\)[\s\S]*main:has\(>\s*#view-patch-changes\.active\)[\s\S]*max-width:\s*2200px/s);
  });

  it('uses three readable columns for Gear 1.10 explorer cards on wide canvases', () => {
    assert.match(css, /@media\s*\(min-width:\s*2000px\)[\s\S]*#view-patch-changes\.active\s+\.patch-group-list\s*,\s*#view-patch-changes\.active\s+\.patch-changes-list\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
    assert.match(css, /#view-patch-changes\.active\s+\.patch-profile-card\s*,\s*#view-patch-changes\.active\s+\.patch-card\s*\{[^}]*max-width:\s*70ch/s);
  });
});
