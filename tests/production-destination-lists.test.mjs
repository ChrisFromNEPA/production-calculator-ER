import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const core = readFileSync(join(root, 'src', 'app-core.js'), 'utf8');
const app = readFileSync(join(root, 'src', 'app.js'), 'utf8');
const gear = readFileSync(join(root, 'src', 'views', 'gear.js'), 'utf8');

const finalDestinations = [
  "Kepler's Dome", 'Brooklyn', 'Ground Zero', 'Manhattan', 'Paris', 'Berlin', 'Tokyo',
];

describe('production destination boundaries', () => {
  it('defines exactly the confirmed final-production destinations', () => {
    assert.match(core, /const FINAL_PRODUCTION_LOCATIONS = Object\.freeze\(\[/);
    const block = core.match(/const FINAL_PRODUCTION_LOCATIONS = Object\.freeze\(\[(.*?)\]\);/s)?.[1] || '';
    const names = [...block.matchAll(/(['"])(.*?)\1/g)].map(m => m[2]);
    assert.deepEqual(names, finalDestinations);
  });

  it('uses final destinations for calculator production and gear choices', () => {
    assert.match(core, /let colonies = colonyList\(\)/);
    assert.match(gear, /FINAL_PRODUCTION_LOCATIONS\.forEach/);
  });

  it('keeps refinement destinations broader than final production', () => {
    assert.match(core, /const refinementLocations = refinementLocationList\(\)/);
    assert.match(core, /refineSel[\s\S]*refinementLocations\.forEach/);
  });

  it('includes ownership-only worlds in the colonies union and counts all Dominion owners', () => {
    assert.match(core, /DEFAULT_COLONY_OWNER/);
    assert.match(core, /Training Grounds/);
    assert.match(core, /DSS Yukon/);
    assert.match(app, /productionRows = allRows\.filter\(r => r\.priced \|\| colonyOwnerIds\(r\.colony\)\.length\)/);
    assert.match(app, /No mine data/);
  });

  it('keeps the overview production metric at the seven final-production rows', () => {
    assert.match(app, /set\('col-metric-production',\s*productionRows\.filter\(r => r\.priced\)\.length\)/);
  });

  it('keeps the Global Dominion overview metric at five actual LED/FDC worlds', () => {
    const owners = core.match(/const DEFAULT_COLONY_OWNER = Object\.freeze\(\{([\s\S]*?)\n\}\);/)?.[1] || '';
    const dominionOwners = [...owners.matchAll(/\[['"](LED|FDC)['"]\]/g)].map(m => m[1]);
    assert.equal(dominionOwners.length, 5);
    assert.match(app, /set\('col-metric-dominion',\s*dominion\)/);
  });

  it('uses Manhattan as the display card while resolving ownership through NYC Manhattan', () => {
    assert.match(app, /FINAL_PRODUCTION_LOCATIONS\.filter\(c => c !== 'NYC Manhattan'\)/);
    assert.match(core, /Manhattan:\s*'NYC Manhattan'/);
    // Refinement excludes the NYC Manhattan alias and apartment storage via a
    // lowercase skip set (t_4454bc38); the set now lives in the shared
    // refinementLocationList() allowlist helper (t_db1c1893) so saved-state
    // and saved-plan loads validate against the identical list. Manhattan
    // itself stays available.
    assert.match(core, /const skip = new Set\(\['nyc manhattan', 'xenomorph hunt \(capped on kills\)', 'apartment'\]\);\n  return allKnownLocations\(\)\.filter/);
    assert.match(core, /refinementLocations = refinementLocationList\(\)/);
  });

  it('renders audio only when a colony has a world asset', () => {
    assert.match(app, /\$\{r\.world \? `<button class="icon-action faction-audio"[\s\S]*?voice_extracted\/\$\{r\.world\}\.ogg/);
  });
});
