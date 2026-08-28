// Every public tab must have a route, view, and safe lifecycle hook.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const core = readFileSync(join(root, 'src', 'app-core.js'), 'utf8');
const player = readFileSync(join(root, 'src', 'views', 'player.js'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const pages = readFileSync(join(root, 'scripts', 'build-pages.mjs'), 'utf8');

const routes = ['calc','inventory','gear','colonies','battle','models','drugs','patch-changes','community'];

describe('all public tab contract', () => {
  it('has exactly one view section for every canonical route', () => {
    for (const route of routes) {
      const sections = html.match(new RegExp(`<section\\s+id="view-${route}"`, 'g')) || [];
      assert.equal(sections.length, 1, `view-${route}`);
    }
  });

  it('has a canonical navigation entry and lifecycle wiring for every route', () => {
    for (const route of routes) {
      assert.match(html, new RegExp(`data-view="${route}"|data-nav-view="${route}"`), route);
      assert.match(core, new RegExp(`['"]${route}['"]`), `manifest ${route}`);
    }
    const init = readFileSync(join(root, 'src', 'app-init.js'), 'utf8');
    assert.match(init, /DOMContentLoaded/);
    assert.match(init, /wireModelsEvents/);
    assert.match(init, /wireCharacterStudioEvents/);
  });

  it('keeps route fallback and Pages asset handling public/local-first', () => {
    assert.match(core, /CMG_NAV_GROUPS/);
    assert.match(core, /setView\(/);
    assert.match(core, /VIEW_HOOKS/);
    assert.match(player, /loadPlanFromHash/);
    assert.match(player, /location\.hash/);
    assert.match(pages, /dist|copy/i);
    assert.doesNotMatch(core, /fetch\(['"]https?:\/\/.*cloudflare/i);
    assert.match(sw, /CACHE|cache/i);
  });
});
