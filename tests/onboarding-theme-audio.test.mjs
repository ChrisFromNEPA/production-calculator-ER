import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const core = readFileSync(join(root, 'src/app-core.js'), 'utf8');
const init = readFileSync(join(root, 'src/app-init.js'), 'utf8');
const app = readFileSync(join(root, 'src/app.js'), 'utf8');
const player = readFileSync(join(root, 'src/views/player.js'), 'utf8');
const css = readFileSync(join(root, 'src/styles.css'), 'utf8') + readFileSync(join(root, 'src/styles/ux-release.css'), 'utf8');

describe('first-run calculator experience', () => {
  it('puts setup before the workbench and exposes the three-step workflow', () => {
    const first = html.indexOf('id="first-run"');
    const workbench = html.indexOf('class="calc-workbench"');
    assert.ok(first > 0 && first < workbench, 'first-run setup must precede the calculator workbench');
    assert.match(html, /id="onboarding-name"/);
    assert.match(html, /id="onboarding-faction"/);
    assert.match(html, /id="onboarding-create"/);
    assert.match(html, /class="calc-steps"/);
    assert.match(html, /Choose an item[\s\S]*Set quantity and colony[\s\S]*Calculate your plan/);
    assert.match(player, /const profileReady = hasCompletePlayerProfile\(\)/);
    assert.match(player, /firstRun\) firstRun\.hidden\s*=\s*profileReady/);
    assert.match(player, /workbench\) workbench\.hidden\s*=\s*!profileReady/);
    assert.match(player, /playerbar\) playerbar\.hidden\s*=\s*!profileReady/);
  });

  it('shows the rich single-plan stats and focuses successful results', () => {
    assert.match(app, /const statsHtml = renderPlanStats\(plan\)/);
    assert.match(core, /class="plan-top"/);
    assert.match(core, /renderPerUnitPricing\(plan\)/);
    assert.match(app, /How this run flows/);
    assert.match(app, /out\.scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
    assert.match(app, /out\.focus\(\{ preventScroll: true \}\)/);
  });
});

describe('theme and settings system', () => {
  it('uses a compact settings surface and offers every faction palette', () => {
    assert.match(html, /class="settings-menu"/);
    assert.match(html, /<summary[^>]*>[^<]*Settings/);
    for (const theme of ['bos', 'cmg', 'ec', 'fdc', 'gom', 'led', 'motb', 'vi']) {
      assert.match(html, new RegExp(`value="${theme}"`));
      assert.match(css, new RegExp(`\\[data-theme="${theme}"\\]`));
    }
    assert.match(core, /const VALID_THEMES/);
    assert.match(core, /let pref = 'auto'/);
  });

  it('keeps Rainbow restrained and motion-safe', () => {
    assert.match(css, /PRIDE THEME REFINEMENT/);
    assert.match(css, /\[data-theme="pride"\] \.pick-card\s*\{[^}]*background(?:-color)?:\s*var\(--panel2\)/s);
    assert.match(css, /\[data-theme="pride"\] button\s*\{[^}]*background(?:-color)?:\s*var\(--panel\)/s);
    assert.match(css, /\[data-theme="pride"\] \*\s*\{[^}]*animation:\s*none/s);
  });
  it('makes text-size adjustment easy to drag, tap, and operate by keyboard', () => {
    assert.match(html, /id="size-decrease"/);
    assert.match(html, /id="size-increase"/);
    assert.match(html, /<output[^>]*id="size-label"/);
    assert.match(init, /size-decrease/);
    assert.match(init, /size-increase/);
    assert.match(core, /function adjustFontScale\(delta\)/);
    assert.match(css, /\.size-slider input\[type="range"\][\s\S]*width:\s*clamp\(/s);
    assert.match(css, /\.size-slider input\[type="range"\][\s\S]*height:\s*2rem/s);
    assert.match(css, /::-webkit-slider-thumb[\s\S]*width:\s*22px/s);
  });
});

describe('intentional sound behavior', () => {
  it('supports off, cues, and voices and defaults to off', () => {
    assert.match(html, /id="sound-mode"/);
    for (const mode of ['off', 'cues', 'voices']) assert.match(html, new RegExp(`value="${mode}"`));
    assert.match(core, /const SOUND_MODE_KEY/);
    assert.match(core, /let SOUND_MODE = 'off'/);
    assert.match(core, /function playUICue/);
    assert.match(core, /function setSoundMode/);
  });

  it('assigns all surviving tabs and invokes sound after a real view change', () => {
    for (const tab of ['calc', 'inventory', 'gear', 'colonies', 'drugs', 'battle', 'models', 'community']) {
      assert.match(core, new RegExp(`\\b${tab}:`));
    }
    assert.match(core, /if \(prev && prev !== v\) playTerminalAudio\(v\)/);
    assert.match(init, /sound-mode/);
  });
});
