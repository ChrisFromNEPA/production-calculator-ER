// tests/accessibility-motion-gates.test.mjs — reduced-motion and semantic gates
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const motion = readFileSync(join(root, 'src', 'ui', 'motion.js'), 'utf8');
const value = readFileSync(join(root, 'src', 'ui', 'value-transition.js'), 'utf8');
const css = readFileSync(join(root, 'src', 'styles', 'components.css'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const engine = readFileSync(join(root, 'src', 'engine.js'), 'utf8');

describe('accessibility and motion gates', () => {
  it('short-circuits view motion under prefers-reduced-motion', () => {
    assert.match(motion, /prefersReducedMotion/);
    assert.match(motion, /update\(\);\s*cleanup/);
    assert.match(css, /prefers-reduced-motion: reduce/);
  });

  it('keeps value feedback targeted and keyboard-readable', () => {
    assert.match(value, /cmg-value-changed/);
    assert.match(value, /calc-live-summary/);
    assert.match(html, /aria-live="polite" aria-atomic="true"/);
  });

  it('keeps the remaining optional item-preview scene labeled and failure-safe', () => {
    assert.match(engine, /aria-label="3D item preview"/);
    assert.match(readFileSync(join(root, 'src', '3d', 'entry.jsx'), 'utf8'), /role="status"/);
  });
});
