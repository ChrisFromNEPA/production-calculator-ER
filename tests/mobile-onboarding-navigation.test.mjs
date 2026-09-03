// Mobile onboarding navigation contracts.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src', 'styles', 'shell.css'), 'utf8');
const uxCss = readFileSync(join(root, 'src', 'styles', 'ux-release.css'), 'utf8');

describe('mobile onboarding navigation', () => {
  it('reserves space for the fixed mobile navigation below onboarding content', () => {
    assert.match(css, /@media\s*\(max-width:\s*767px\)[\s\S]*?body\s*\{[^}]*padding-bottom:\s*calc\([^}]*safe-area-inset-bottom/s);
    assert.match(css, /\.mobile-nav-v2\s*\{[\s\S]*?grid-template-columns:\s*repeat\(5,\s*1fr\)/s);
    assert.match(css, /body\.profile-gated \.mobile-nav-v2\s*\{[^}]*position:\s*static/s);
  });

  it('keeps disabled navigation labels readable while onboarding is required', () => {
    const disabledRule = uxCss.match(/body\.profile-gated \.nav-bar \[data-view\]:disabled,[\s\S]*?body\.profile-gated \.nav-more-btn:disabled\s*\{([^}]*)\}/)?.[1];
    assert.ok(disabledRule, 'profile-gated navigation controls have a shared disabled rule');
    assert.match(disabledRule, /opacity:\s*1\b/);
    assert.match(disabledRule, /color:\s*var\(--text\)/);
    assert.doesNotMatch(disabledRule, /opacity:\s*\.42\b/);
  });
});
