import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mod from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { compute, setPlayerInv, reset } = mod;

before(() => require(join(root, 'src', 'costs.js')));
after(() => reset());

function installFactionWorld({ faction, owners, taxes = {} }) {
  window.ENGINE_COLONY_OWNED = site => owners[site]?.includes(faction) || false;
  window.ENGINE_COLONY_REBATE_FOR = () => 0.85;
  window.COLONY_TAX = taxes;
}

describe('faction-aware missing-material colony defaults', () => {
  it('defaults each missing raw material to the cheapest eligible mine for the active faction', () => {
    installFactionWorld({
      faction: 'CMG',
      owners: { Andromeda: ['CMG'], Paris: ['CMG'], Brooklyn: ['FDC'] },
    });
    setPlayerInv([]);
    const result = compute('carbon', 1, {}, {}, {}, 'Paris', { prod: 0, mine: 0, trans: 0 });
    assert.equal(result.plan.acquire.coal.preferred, 'Andromeda');
  });

  it('keeps an explicit obtain-site choice instead of replacing it with the default', () => {
    installFactionWorld({
      faction: 'CMG',
      owners: { Andromeda: ['CMG'], Paris: ['CMG'], Brooklyn: ['FDC'] },
    });
    window.OBTAIN_SITE = { coal: "DeMorgan's Castle" };
    setPlayerInv([]);
    const result = compute('carbon', 1, {}, {}, {}, 'Paris', { prod: 0, mine: 0, trans: 0 });
    assert.equal(result.plan.acquire.coal.preferred, "DeMorgan's Castle");
  });
});
