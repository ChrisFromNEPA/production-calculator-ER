// Player profile migration and faction persistence tests.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(import.meta.dirname, '..');

globalThis.window = {
  normalizeFactionId(value) {
    const v = String(value || '').trim().toUpperCase();
    return ['CMG', 'BOS', 'EC', 'FDC', 'GOM', 'LED', 'MOTB', 'VI'].includes(v) ? v : 'UNAFFILIATED';
  },
  ENGINE: {},
};
globalThis.localStorage = {
  data: {},
  getItem(key) { return this.data[key] ?? null; },
  setItem(key, value) { this.data[key] = String(value); },
  removeItem(key) { delete this.data[key]; },
};
require(join(root, 'src', 'store.js'));
const STORE = window.STORE;

function reset() {
  localStorage.data = {};
  STORE.PLAYERS.active = '';
  STORE.PLAYERS.players = {};
  STORE.PLAYERS.profiles = {};
}

beforeEach(reset);

describe('faction-aware local player profiles', () => {
  it('migrates legacy arrays without changing inventory or assigning CMG', () => {
    localStorage.setItem('cmg_players_v1', JSON.stringify({
      active: 'Miner',
      players: { Miner: [{ item: 'coal', location: 'Andromeda', quantity: 4 }] },
    }));
    const fresh = STORE.loadPlayers();
    assert.equal(fresh.schema_version, 2);
    assert.deepEqual(fresh.players.Miner, [{ item: 'coal', location: 'Andromeda', quantity: 4 }]);
    assert.equal(fresh.profiles.Miner.faction, 'UNAFFILIATED');
  });

  it('repairs malformed persisted player inventories instead of crashing', () => {
    localStorage.setItem('cmg_players_v1', JSON.stringify({
      active: 'Broken',
      players: { Broken: { corrupt: true }, Empty: null, Valid: [{ item: 'coal', location: 'A', quantity: 2 }] },
    }));
    const fresh = STORE.loadPlayers();
    assert.deepEqual(fresh.players.Broken, []);
    assert.deepEqual(fresh.players.Empty, []);
    assert.deepEqual(fresh.players.Valid, [{ item: 'coal', location: 'A', quantity: 2 }]);
  });

  it('persists and retrieves the active player faction', () => {
    STORE.PLAYERS.players = { Miner: [] };
    STORE.PLAYERS.profiles = { Miner: { faction: 'UNAFFILIATED' } };
    STORE.PLAYERS.active = 'Miner';
    assert.equal(STORE.setPlayerFaction('Miner', 'EC'), true);
    assert.equal(STORE.getActiveFaction(), 'EC');
    assert.equal(JSON.parse(localStorage.getItem('cmg_players_v1')).profiles.Miner.faction, 'EC');
  });

  it('maps invalid and legacy faction names to unaffiliated', () => {
    STORE.PLAYERS.players = { Miner: [] };
    STORE.PLAYERS.profiles = { Miner: { faction: 'not-a-faction' } };
    STORE.PLAYERS.active = 'Miner';
    assert.equal(STORE.getActiveFaction(), 'UNAFFILIATED');
  });

  it('only treats a named player with an actual faction as complete', () => {
    assert.equal(STORE.isProfileComplete('Miner', 'EC'), true);
    assert.equal(STORE.isProfileComplete('Miner', 'UNAFFILIATED'), false);
    assert.equal(STORE.isProfileComplete('', 'EC'), false);
    assert.equal(STORE.isProfileComplete('Miner', 'not-a-faction'), false);
  });

  it('exports faction metadata without changing inventory', () => {
    STORE.PLAYERS.players = { Miner: [{ item: 'coal', location: 'Andromeda', quantity: 4 }] };
    STORE.PLAYERS.profiles = { Miner: { faction: 'BOS' } };
    STORE.PLAYERS.active = 'Miner';
    assert.deepEqual(STORE.exportPlayer(), {
      schema_version: 2,
      player: 'Miner',
      faction: 'BOS',
      inventory: [{ item: 'coal', location: 'Andromeda', quantity: 4 }],
    });
  });
});
