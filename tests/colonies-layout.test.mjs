import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = fs.readFileSync(`${root}/index.html`, 'utf8');
const app = fs.readFileSync(`${root}/src/app.js`, 'utf8');
const styles = fs.readFileSync(`${root}/src/styles.css`, 'utf8');

test('Colonies workspace layout contract', async (t) => {
  await t.test('provides a player-first colony workspace hierarchy', () => {
    assert.match(html, /id="colonies-overview"/);
    assert.match(html, /id="colonies-toolbar"/);
    assert.match(html, /id="colonies-production"/);
    assert.match(html, /id="colonies-reference"/);
    assert.match(html, /id="colonies-world-data"/);
    assert.match(html, /id="colonies-slot-guide"/);
    assert.match(app, /renderColonyOverview/);
    assert.match(app, /renderColonyCard/);
    assert.match(app, /renderReferenceCard/);
  });

  await t.test('renders readable owner, tax, resource, and edit contracts', () => {
    assert.match(app, /owner-chip/);
    assert.match(app, /Tax/);
    assert.match(app, /Mines here/);
    assert.match(app, /Edit world state/);
    assert.match(app, /Global Dominion/);
    assert.match(app, /data-colony-edit/);
  });

  await t.test('keeps filtering, persistence, and Global Dominion labeling wired', () => {
    assert.match(app, /col-filter/);
    assert.match(app, /colonyOwnerIds\(r\.colony\)/);
    assert.match(app, /global-dominion|Global Dominion/);
    assert.doesNotMatch(app, /value="joint"/);
    assert.match(app, /COLONY_OWNER\[c\] = \[owner\]/);
    assert.match(app, /syncShared\('taxes'/);
    assert.match(app, /col-search/);
    assert.match(app, /mines\[r\.colony\]/);
  });

  await t.test('defines responsive and accessible Colonies styles', () => {
    assert.match(styles, /\.colonies-shell/);
    assert.match(styles, /\.colonies-grid/);
    assert.match(styles, /\.colonies-card/);
    assert.match(styles, /\.colonies-card:focus-within/);
    assert.match(styles, /prefers-reduced-motion/);
    assert.match(styles, /@media[^\{]*max-width:\s*640px/);
  });
});
