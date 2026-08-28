import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = file => readFileSync(join(root, file), 'utf8');
const html = read('index.html');
const css = read('src/styles/ux-release.css');
const buildPages = read('scripts/build-pages.mjs');
const readme = read('README.md');
const authors = read('AUTHORS.md');
const license = read('LICENSE');
const pkg = JSON.parse(read('package.json'));
const sw = read('sw.js');
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const REPOSITORY_URL = 'https://github.com/ChrisFromNEPA/production-calculator-ER';
const PAGES_URL = 'https://chrisfromnepa.github.io/production-calculator-ER/';
const SCREENSHOT_URL = `${PAGES_URL}docs/assets/calculator-sample.png`;

describe('employer-facing public presentation', () => {
  it('introduces the calculator and links back to its source', () => {
    assert.match(html, /<section id="project-intro" class="public-notice project-intro" aria-labelledby="project-intro-title">/);
    assert.match(html, /<h2 id="project-intro-title">Turn a target item into a practical production plan\.<\/h2>/);
    assert.match(html, new RegExp(`<a class="project-intro-link"[^>]*href="${escapeRegExp(REPOSITORY_URL)}"`));
    assert.match(html, /View source on GitHub/);
  });

  it('ships accurate browser and social metadata for the Pages application', () => {
    assert.match(html, /<meta name="description" content="Plan materials, refining steps, colonies, and local cost assumptions for Empire Rising production in a browser-local workspace\." \/>/);
    assert.match(html, /<meta property="og:type" content="website" \/>/);
    assert.match(html, /<meta property="og:title" content="Empire Rising Production Calculator" \/>/);
    assert.match(html, new RegExp(`<meta property="og:url" content="${escapeRegExp(PAGES_URL)}" \/>`));
    assert.match(html, new RegExp(`<meta property="og:image" content="${escapeRegExp(SCREENSHOT_URL)}" \/>`));
    assert.match(html, /<meta property="og:image:alt" content="Fictional sample production plan for an Emergency Medikit" \/>/);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image" \/>/);
    assert.match(html, new RegExp(`<meta name="twitter:image" content="${escapeRegExp(SCREENSHOT_URL)}" \/>`));
    assert.match(html, /<link rel="icon" type="image\/svg\+xml" sizes="any" href="favicon\.svg" \/>/);
  });

  it('keeps the portfolio screenshot in the Pages artifact and the service-worker version current', () => {
    assert.equal(existsSync(join(root, 'docs/assets/calculator-sample.png')), true);
    assert.match(buildPages, /docs\/assets\/calculator-sample\.png/);
    assert.match(sw, /const CACHE = 'er-v0\.2\.40'/);
  });

  it('keeps the project intro bounded and usable at mobile widths', () => {
    assert.match(css, /\.project-intro\s*\{[\s\S]*?max-width:\s*1100px[\s\S]*?display:\s*flex/s);
    assert.match(css, /\.project-intro-link\s*\{[\s\S]*?min-height:\s*44px/s);
    assert.match(css, /@media \(max-width: 760px\)\s*\{[\s\S]*?\.project-intro\s*\{[\s\S]*?flex-direction:\s*column/s);
  });

  it('front-loads verified portfolio information without unsupported claims', () => {
    for (const heading of [
      '## Why it exists',
      '## Engineering highlights',
      '## Architecture and data flow',
      '## Install and run',
      '## Usage',
      '## Privacy and data storage',
      '## Known limitations and roadmap',
      '## License and asset notice',
    ]) assert.match(readme, new RegExp(`^${heading}$`, 'm'));
    assert.match(readme, /releases\/tag\/v1\.3\.0/);
    assert.match(readme, /docs\/assets\/calculator-sample\.png/);
    assert.match(readme, /npm run check/);
    assert.match(readme, /npm run test:browser-ux/);
    assert.doesNotMatch(readme, /user adoption|performance guarantee/i);
  });

  it('uses only the authorized public identity in current-tree attribution', () => {
    assert.equal(pkg.author, 'ChrisFromNEPA and community contributors');
    assert.match(authors, /ChrisFromNEPA/);
    assert.match(license, /Copyright \(c\) 2026 ChrisFromNEPA and community contributors/);
  });
});
