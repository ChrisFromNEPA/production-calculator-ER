// Served layout baseline contract.
// This deliberately uses only Node's built-in test/fetch APIs so the existing
// zero-dependency project can verify its served shell before Playwright is
// introduced. Interactive view traversal is recorded in docs/design/ux-baseline.md.
//
// Run against a served build: `npm run check` (builds, serves dist/ via
// scripts/check-baseline.mjs, then runs this spec) or, with the site already
// served, `BASELINE_URL=http://127.0.0.1:4173 node --test tests/browser/layout-baseline.spec.mjs`.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const baseUrl = (process.env.BASELINE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`);
  assert.equal(response.ok, true, `${path} returned HTTP ${response.status}`);
  return { response, body: await response.text() };
}

function unique(values) {
  return [...new Set(values)];
}

// Live 9-view topology. The app was consolidated from the 16 legacy panels
// captured in docs/design/ux-baseline.md to these primary views.
const EXPECTED_VIEWS = [
  'calc', 'inventory', 'gear', 'drugs', 'patch-changes', 'battle', 'models', 'community', 'colonies',
].sort();

describe('served layout baseline', () => {
  it('serves every declared view and its referenced shell assets', async () => {
    const { body: html } = await get('/');
    const views = unique([...html.matchAll(/<section\s+id="view-([^"]+)"/g)].map(m => m[1])).sort();
    const tabs = unique([...html.matchAll(/data-view="([^"]+)"/g)].map(m => m[1])).sort();

    assert.deepEqual(views, EXPECTED_VIEWS, `expected the live ${EXPECTED_VIEWS.length}-view topology, found ${views.length}`);
    assert.deepEqual(tabs, views, 'navigation and panels must stay in sync');

    const assets = unique([
      ...[...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map(m => m[1]),
      ...[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]),
    ]).filter(asset => !/^(?:https?:)?\/\//.test(asset));

    for (const asset of assets) {
      await get(`/${asset.split('?')[0].replace(/^\//, '')}`);
    }
  });

  it('keeps the legacy two-view WebGL baseline explicit for migration tracking', async () => {
    const { body: models } = await get('/src/views/models.js');
    const { body: character } = await get('/src/views/character.js');
    for (const source of [models, character]) {
      assert.match(source, /new THREE\.WebGLRenderer/);
      assert.match(source, /requestAnimationFrame/);
      assert.match(source, /preserveDrawingBuffer\s*:\s*true/);
    }
  });
});
