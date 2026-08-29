// tests/gear-layout.test.mjs — keep loadout cards and stats readable
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const css = readFileSync(join(root, 'src/styles.css'), 'utf8');
const survivingReferenceCss = readFileSync(join(root, 'src/styles/surviving-reference.css'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');

describe('Gear loadout layout readability', () => {
  it('uses an intentional two-column layout with a stacked fallback', () => {
    assert.match(css, /\.gear-layout\s*\{[^}]*display:\s*grid/s);
    assert.match(css, /\.gear-layout\s*\{[^}]*grid-template-columns:\s*minmax\(/s);
    assert.match(css, /@media\s*\(max-width:\s*1100px\)[\s\S]*\.gear-layout\s*\{[^}]*grid-template-columns:\s*1fr/s);
  });

  it('lets item cards grow and keeps their content readable', () => {
    assert.match(css, /\.gear-slot\s*\{[^}]*width:\s*auto/s);
    assert.match(css, /\.gear-slot-name\s*\{[^}]*font-size:\s*0\.7/s);
    assert.match(css, /\.gear-slot-icon,\s*\.gear-slot-icon img\s*\{[^}]*width:\s*48px[^}]*height:\s*48px/s);
    assert.match(css, /\.gear-stat-panel\s*\{[^}]*min-width:\s*0/s);
  });

  it('uses matching top panels for Armor Loadout and Loadout Stats', () => {
    assert.match(html, /class="[^"]*\bgear-loadout-panel\b[^"]*"[\s\S]*<h4[^>]*>Armor Loadout<\/h4>/);
    assert.match(html, /class="[^"]*\bgear-stat-panel\b[^"]*" id="gear-stats"[\s\S]*<h4>Loadout Stats<\/h4>/);
    assert.match(css, /\.gear-loadout-panel\s*,\s*\.gear-stat-panel/);
    assert.match(css, /\.gear-loadout-panel\s+\.gear-title/);
  });

  it('does not make the stats sidebar sticky over the lower library row', () => {
    assert.doesNotMatch(css, /\.gear-sidebar\s*\{[^}]*position:\s*sticky/s);
  });

  it('keeps the main stat panel and guide adjacent to the loadout', () => {
    assert.match(html, /class="gear-sidebar"[\s\S]*id="gear-stats"/);
    assert.match(html, /id="gear-toggle-guide"/);
    assert.match(css, /\.gear-sidebar\s*\{[^}]*min-width:\s*0/s);
  });

  it('reflows the Protection guide into readable rows on narrow screens', () => {
    assert.match(survivingReferenceCss, /@media\s*\(max-width:\s*480px\)[\s\S]*\.patch-protection-grid\s*>\s*div\s*\{[^}]*min-width:\s*0/s);
    assert.match(survivingReferenceCss, /@media\s*\(max-width:\s*480px\)[\s\S]*\.patch-protection-head\s*\{[^}]*display:\s*none/s);
    assert.match(survivingReferenceCss, /@media\s*\(max-width:\s*480px\)[\s\S]*\.patch-protection-row\s*\{[^}]*display:\s*block/s);
    assert.match(html, /class="patch-protection-row"[\s\S]*<span>Armor<\/span>[\s\S]*<span>Ballistic<\/span>[\s\S]*<span>FDC<\/span>/);
  });
});
