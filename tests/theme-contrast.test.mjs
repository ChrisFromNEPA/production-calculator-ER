import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const css = readFileSync(join(import.meta.dirname, '..', 'src', 'styles.css'), 'utf8');
const semanticTextTokens = ['text', 'muted', 'accent', 'accent-bright', 'accent-dim', 'cyan', 'cyan-dim', 'purple', 'purple-dim', 'warn', 'bad', 'good', 'surplus'];
const surfaces = ['bg', 'bg2', 'panel', 'panel2'];

function themeTokens(theme) {
  const match = css.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `${theme} theme block is missing`);
  return Object.fromEntries([...match[1].matchAll(/--([\w-]+)\s*:\s*(#[0-9a-f]{6})/gi)].map(([, key, value]) => [key, value]));
}

function rgb(hex) {
  return [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

function luminance(hex) {
  const channels = rgb(hex).map(value => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a, b) {
  const [bright, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (bright + 0.05) / (dark + 0.05);
}

for (const theme of ['light', 'trans']) {
  test(`${theme} semantic text colors meet WCAG AA on every theme surface`, () => {
    const tokens = themeTokens(theme);
    const failures = [];
    for (const text of semanticTextTokens) {
      assert.ok(tokens[text], `${theme} is missing --${text}`);
      for (const surface of surfaces) {
        assert.ok(tokens[surface], `${theme} is missing --${surface}`);
        const ratio = contrast(tokens[text], tokens[surface]);
        if (ratio < 4.5) failures.push({ text, surface, foreground: tokens[text], background: tokens[surface], ratio: Number(ratio.toFixed(2)) });
      }
    }
    assert.deepEqual(failures, []);
  });
}
