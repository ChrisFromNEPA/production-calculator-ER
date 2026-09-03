import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const core = readFileSync(join(root, 'src', 'app-core.js'), 'utf8');
const init = readFileSync(join(root, 'src', 'app-init.js'), 'utf8');
const css = readFileSync(join(root, 'src', 'styles.css'), 'utf8');
const ux = readFileSync(join(root, 'src', 'styles', 'ux-release.css'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');

describe('responsive typography and content density', () => {
  it('uses a larger resolution-aware 100% baseline', () => {
    assert.match(core, /function baseFontPixels\(width\)/);
    assert.match(core, /if \(w >= 3200\) return 22[\s\S]*if \(w >= 2200\) return 20[\s\S]*return 19/);
    assert.match(core, /const BASE_PX = baseFontPixels\(window\.innerWidth\)/);
    assert.match(init, /addEventListener\(['"]resize['"][\s\S]*applyFontScale/);
  });

  it('uses the available width on large desktop displays', () => {
    assert.match(css, /@media \(min-width: 1800px\)[\s\S]*?main\s*\{[\s\S]*?max-width:\s*1600px/s);
    assert.match(css, /@media \(min-width: 3000px\)[\s\S]*?main\s*\{[\s\S]*?max-width:\s*2200px/s);
    assert.match(css, /@media \(min-width: 2200px\)[\s\S]*?\.gear-picker-modal\s*\{[\s\S]*?max-width:\s*800px/s);
    assert.match(css, /@media \(min-width: 3200px\)[\s\S]*?\.gear-picker-modal\s*\{[\s\S]*?max-width:\s*960px/s);
    assert.match(ux, /@media \(min-width: 1800px\)[\s\S]*?\.first-run, \.calc-guide\s*\{[\s\S]*?max-width:\s*1200px/s);
    assert.match(ux, /@media \(min-width: 3000px\)[\s\S]*?\.first-run, \.calc-guide\s*\{[\s\S]*?max-width:\s*1480px/s);
  });

  it('keeps secondary UI text above the tiny metadata scale', () => {
    assert.match(css, /\.controls label\s*\{[\s\S]*?font-size:\s*0\.78rem/s);
    assert.match(css, /\.hint\s*\{[\s\S]*?font-size:\s*0\.75rem/s);
    assert.match(ux, /\.route-summary-note\s*\{[\s\S]*?font-size:\s*\.7rem/s);
  });

  it('shortens the first-run explanation to the essential workflow', () => {
    assert.match(html, /Your profile stays in this browser/);
    assert.doesNotMatch(html, /Your name and faction are saved only in this browser/);
  });
});