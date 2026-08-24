// tests/gear-tooltip-stacking.test.mjs — hover tooltip layering regression
// Bug: the body-level .item-tooltip was z-index 300 while .gear-picker-overlay
// is z-index 10000, so the quick-stats hover card painted BEHIND the open gear
// picker modal. Contract: the tooltip must stack above the picker overlay while
// staying body-level, non-interactive, and viewport-bounded.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src', 'styles.css'), 'utf8');
const gear = readFileSync(join(root, 'src', 'views', 'gear.js'), 'utf8');
const init = readFileSync(join(root, 'src', 'app-init.js'), 'utf8');

describe('item tooltip stacks above the gear picker overlay', () => {
  it('tooltip z-index exceeds the picker overlay z-index', () => {
    const overlay = css.match(/\.gear-picker-overlay\s*\{[^}]*z-index:\s*(\d+)/s);
    const tooltip = css.match(/\.item-tooltip\s*\{[^}]*z-index:\s*(\d+)/s);
    assert.ok(overlay, 'expected a .gear-picker-overlay z-index rule');
    assert.ok(tooltip, 'expected an .item-tooltip z-index rule');
    assert.ok(Number(tooltip[1]) > Number(overlay[1]),
      `tooltip z-index ${tooltip[1]} must exceed picker overlay z-index ${overlay[1]}`);
  });

  it('tooltip stays non-interactive so it never steals picker focus/hover', () => {
    const rule = css.match(/\.item-tooltip\s*\{[^}]*\}/s);
    assert.ok(rule, 'expected an .item-tooltip rule');
    assert.match(rule[0], /pointer-events:\s*none/);
  });

  it('tooltip is still appended at body level by the gear picker', () => {
    assert.match(gear, /document\.body\.appendChild\(tooltipEl\)/);
  });

  it('tooltip positioning is still clamped to the viewport', () => {
    assert.match(gear, /window\.innerWidth\s*-\s*tooltipEl\.offsetWidth/);
    assert.match(gear, /window\.innerHeight\s*-\s*tooltipEl\.offsetHeight/);
    assert.match(init, /window\.innerWidth\s*-\s*tooltipEl\.offsetWidth/);
    assert.match(init, /window\.innerHeight\s*-\s*tooltipEl\.offsetHeight/);
  });
});
