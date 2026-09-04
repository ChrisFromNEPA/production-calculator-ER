import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const core = readFileSync(join(root, 'src/app-core.js'), 'utf8');
const css = readFileSync(join(root, 'src/styles.css'), 'utf8');
const flowCss = css.slice(css.indexOf('/* recipe-flow internal layout'), css.indexOf('.flow-batches', css.indexOf('/* recipe-flow internal layout')));

describe('refinement card input-to-output connector', () => {
  it('keeps one semantic connector between the input stack and output card', () => {
    assert.match(core, /<div class="flow-inputs">\$\{inputChips\}<\/div>[\s\S]*?<span class="flow-arrow big">➜<\/span>[\s\S]*?<div class="flow-output">/);
  });

  it('uses a grid so the connector cannot wrap beside an input row', () => {
    assert.match(flowCss, /\.recipe-flow\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0, 1fr\)\s*;/s);
    assert.match(flowCss, /\.flow-arrow\.big\s*\{[^}]*transform:\s*rotate\(90deg\)[^}]*justify-self:\s*center/s);
    assert.match(flowCss, /\.flow-output\s*\{[^}]*width:\s*100%/s);
  });

  it('gives desktop output cards a compact two-row grid with flexible names', () => {
    const outputCss = flowCss.slice(flowCss.indexOf('.flow-chip.output {'), flowCss.indexOf('@media (max-width: 820px)'));
    assert.match(outputCss, /\.flow-chip\.output\s*\{[^}]*display:\s*grid/s);
    assert.match(outputCss, /grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/s);
    assert.match(outputCss, /grid-template-areas:[^;]*"process process process"[^;]*"icon name quantity"/s);
    assert.match(outputCss, /\.flow-chip\.output\s*>\s*\.flow-name\s*\{[^}]*grid-area:\s*name/s);
    assert.match(outputCss, /\.flow-chip\.output\s*>\s*\.flow-qty\s*\{[^}]*grid-area:\s*quantity/s);
  });

  it('gives repeated refinement cards a full-width output-name row', () => {
    const outputCss = flowCss.slice(flowCss.indexOf('.flow-chip.output {'), flowCss.indexOf('@media (max-width: 820px)'));
    assert.match(outputCss, /\.colony-work-refine-card \.flow-chip\.output\s*\{[^}]*grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)/s);
    assert.match(outputCss, /\.colony-work-refine-card \.flow-chip\.output\s*\{[^}]*grid-template-areas:[^;]*"process process"[^;]*"icon quantity"[^;]*"name name"/s);
  });

  it('turns the connector downward on narrow cards', () => {
    assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*\.recipe-flow\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
    assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*\.flow-arrow\.big\s*\{[^}]*transform:\s*rotate\(90deg\)/s);
  });
});
