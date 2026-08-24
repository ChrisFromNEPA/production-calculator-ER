// Colony world-state contract: ownership is explicit, neutral, and portable.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const core = readFileSync(join(root, 'src/app-core.js'), 'utf8');
const app = readFileSync(join(root, 'src/app.js'), 'utf8');
const styles = readFileSync(join(root, 'src/styles.css'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const registry = JSON.parse(readFileSync(join(root, 'data/factions.json'), 'utf8'));

describe('neutral colony world state', () => {
  it('uses a versioned storage key and seeds the authoritative default world', () => {
    assert.match(core, /er_colony_world_v2/);
    assert.match(core, /cmg_colony_tax_v1/);
    assert.match(core, /DEFAULT_COLONY_OWNER/);
    assert.match(core, /['"]Brooklyn['"]:\s*\['FDC'\]/);
    assert.match(core, /['"]DSS Yukon['"]:\s*\['FDC'\]/);
    assert.match(core, /['"]Pax Prime['"]:\s*\['EC'\]/);
    assert.match(core, /['"]NYC Manhattan['"]:\s*\['GOM'\]/);
    assert.match(core, /['"]Necar's Field['"]:\s*\['BOS'\]/);
    assert.match(core, /['"]Andromeda City['"]:\s*\['CMG'\]/);
    assert.match(core, /['"]Ceres Delta['"]:\s*\['VI'\]/);
    assert.match(core, /['"]Training Grounds['"]:\s*\['FDC'\]/);
  });

  it('offers one actual owner plus an explicit Global Dominion explanation', () => {
    assert.match(app, /window\.ER_FACTIONS\?\.selectable/);
    assert.match(app, /Owner not set/);
    assert.match(app, /Global Dominion/);
    assert.doesNotMatch(app, /data-colony-owner.*type="checkbox"/);
  });

  it('constrains the owner editor to its colony card at every grid width', () => {
    assert.match(styles, /\.colony-editor\s*\{/);
    assert.match(styles, /\.owner-check\s*\{/);
    assert.match(styles, /\.colonies-grid\s*\{[^}]*minmax\(0,\s*1fr\)/s);
  });

  it('keeps one-owner changes separate from tax changes', () => {
    assert.match(app, /COLONY_OWNER\[c\] = \[owner\]/);
    assert.doesNotMatch(app, /COLONY_TAX\[c\] = 0/);
    assert.match(app, /data-ct-tax/);
    assert.match(app, /data-colony-owner/);
    assert.match(app, /data-colony-clear/);
    assert.match(app, /type="radio"/);
  });

  it('labels local world state and provides portability controls', () => {
    assert.match(html, /stored locally|local snapshot|local world/i);
    assert.match(html, /colony-world-export|Export.*colony|Export.*world/i);
    assert.match(html, /colony-world-import|Import.*colony|Import.*world/i);
    assert.match(html, /colony-world-reset|Reset.*colony|Reset.*world/i);
  });
});
