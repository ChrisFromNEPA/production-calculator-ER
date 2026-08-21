import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const css = readFileSync(join(root, 'src/styles/ux-release.css'), 'utf8');
const shell = readFileSync(join(root, 'src/styles/shell.css'), 'utf8');
const reference = readFileSync(join(root, 'src/views/reference.js'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const init = readFileSync(join(root, 'src/app-init.js'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

describe('settings, ER branding, and Drugs reference surface', () => {
  it('raises the complete header stacking context when Settings is open', () => {
    assert.match(css, /header:has\(\.settings-menu\[open\]\)\s*\{[^}]*z-index:\s*\d+/s);
    assert.match(css, /\.settings-panel, \.player-actions-menu\s*\{[^}]*z-index:\s*\d+/s);
    assert.match(shell, /\.nav-bar\s*\{[^}]*z-index:\s*100/s);
  });

  it('ships an accessible improved ER logo mark', () => {
    assert.match(html, /class="crest-logo er-mark"[^>]*role="img"/);
    assert.match(html, /class="crest-logo er-mark"[\s\S]*?<svg[\s\S]*?aria-hidden="true"/);
    assert.match(css, /\.er-mark\s*\{[\s\S]*?background:/s);
  });

  it('dismisses Settings when focus moves outside or to another action', () => {
    assert.match(init, /const closeSettings = \(\) => settingsMenu\?\.removeAttribute\('open'\)/);
    assert.match(init, /settingsMenu\?\.open && !e\.target\.closest\('\.settings-menu'\)/);
    assert.match(init, /if \(e\.key === 'Escape'\) closeSettings\(\)/);
    assert.match(init, /moreBtn\.addEventListener\('click',[\s\S]*?removeAttribute\('open'\)/);
    assert.match(init, /const button = e\.target\.closest\('\[data-nav-view\]'\);[\s\S]*?removeAttribute\('open'\)/);
  });

  it('renders Drugs effects from live stats with explicit adverse polarity', () => {
    assert.match(reference, /const DRUG_ADVERSE_POSITIVE_STATS\s*=\s*new Set/);
    assert.match(reference, /DRUG_ADVERSE_POSITIVE_STATS\.has\(k\)/);
    assert.match(reference, /staminadrain/);
    assert.match(reference, /protectionreduction/);
    assert.match(reference, /window\.BALANCE_STATS\?\.items\?\.find\(it => it\.name === name\)/);
    assert.match(reference, /<th scope="col">Positive<\/th><th scope="col">Negative<\/th><th scope="col" class="r">Duration<\/th>/);
  });

  it('does not expose the stale ChemSub or derived total columns on Drugs', () => {
    assert.doesNotMatch(html, /max production cost per drug|ChemSub priced at maxed Pegasi 51/);
    assert.doesNotMatch(reference, /<th[^>]*>ChemSub<\/th>/);
    assert.doesNotMatch(reference, /fmt\(d\.chemsub_cost\)/);
    assert.doesNotMatch(reference, /fmt\(d\.total_uc\).*UC/);
  });

  it('bumps the offline shell for the runtime change', () => {
    assert.match(sw, /const CACHE\s*=\s*['"]er-v0\.2\.33['"]/);
  });
});
