// Runtime tests for the public workspace envelope and its storage transaction.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(import.meta.dirname, '..');
globalThis.window = { normalizeFactionId: v => String(v || 'UNAFFILIATED').toUpperCase() };
globalThis.localStorage = {
  _data: {},
  get length() { return Object.keys(this._data).length; },
  key(i) { return Object.keys(this._data)[i] || null; },
  getItem(k) { return this._data[k] ?? null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; },
};
globalThis.document = { getElementById() { return null; }, querySelectorAll() { return []; } };
require(join(root, 'src', 'store.js'));
const S = window.STORE;

beforeEach(() => {
  localStorage._data = {};
  localStorage.failOn = null;
  localStorage.setItem = function(k, v) {
    if (this.failOn === k) {
      this.failOn = null;
      throw new Error(`write failed for ${k}`);
    }
    this._data[k] = String(v);
  };
  S.PLAYERS.active = '';
  S.PLAYERS.players = {};
  S.PLAYERS.profiles = {};
});

describe('workspace snapshot runtime', () => {
  it('round-trips raw localStorage values and player state', () => {
    S.importPlayer('Chris', [{ item: 'coal', location: 'Andromeda', quantity: 84 }]);
    S.setPlayerFaction('Chris', 'CMG');
    localStorage.setItem('er_colony_world_v2', JSON.stringify({ schema_version: 2, owner: { Paris: 'CMG' }, tax: { Paris: 15 } }));
    localStorage.setItem('cmg_destination', 'Paris');
    localStorage.setItem('cmg_refine_destination', "DeMorgan's Castle");

    const snapshot = S.exportWorkspace();
    assert.equal(snapshot.type, 'empire-rising-workspace');
    assert.equal(snapshot.schema_version, 2);
    assert.equal(snapshot.storage.cmg_destination, 'Paris');
    assert.equal(snapshot.storage.cmg_refine_destination, "DeMorgan's Castle");

    localStorage._data = { cmg_destination: 'Berlin' };
    S.importWorkspace(snapshot);
    assert.equal(localStorage.getItem('cmg_destination'), 'Paris');
    assert.equal(localStorage.getItem('cmg_refine_destination'), "DeMorgan's Castle");
    assert.equal(S.PLAYERS.active, 'Chris');
    assert.equal(S.getActiveFaction(), 'CMG');
    assert.deepEqual(S.getInv(), [{ item: 'coal', location: 'Andromeda', quantity: 84 }]);
  });

  it('merges an existing player import by canonical item and location', () => {
    S.importPlayer('Chris', [
      { item: 'coal', location: 'Necars Field', quantity: 4 },
      { item: 'iron', location: 'Berlin', quantity: 2 },
    ]);
    S.importPlayer('Chris', [
      { item: 'coal', location: "NECAR's Field", quantity: 3 },
      { item: 'iron', location: 'Berlin', quantity: 0 },
      { item: 'chrome', location: 'Paris', quantity: 5 },
    ]);
    assert.deepEqual(S.PLAYERS.players.Chris, [
      { item: 'coal', location: "Necar's Field", quantity: 7 },
      { item: 'iron', location: 'Berlin', quantity: 2 },
      { item: 'chrome', location: 'Paris', quantity: 5 },
    ]);
  });

  it('keeps the public player object identity stable across workspace imports', () => {
    S.importPlayer('Imported', []);
    const playersRef = S.PLAYERS;
    const snapshot = S.exportWorkspace();
    S.importWorkspace(snapshot);
    assert.equal(S.PLAYERS, playersRef);
    assert.equal(S.PLAYERS.active, 'Imported');
  });

  it('imports the older supported schema through migration', () => {
    const legacy = {
      type: 'empire-rising-workspace',
      schema_version: 1,
      storage: { cmg_destination: 'Paris' },
    };
    S.importWorkspace(legacy);
    assert.equal(localStorage.getItem('cmg_destination'), 'Paris');
    assert.equal(S.exportWorkspace().schema_version, 2);
  });

  it('replaces all allowed keys and removes stale namespaced keys', () => {
    localStorage.setItem('cmg_destination', 'Berlin');
    localStorage.setItem('cmg_toggles_old_player', '{"dark":true}');
    localStorage.setItem('cmg_obtain_site_v1', 'old-site');
    localStorage.setItem('unrelated_key', 'keep');

    S.importWorkspace({
      type: 'empire-rising-workspace', schema_version: 2,
      storage: { cmg_destination: 'Paris' },
    });

    assert.equal(localStorage.getItem('cmg_destination'), 'Paris');
    assert.equal(localStorage.getItem('cmg_toggles_old_player'), null);
    assert.equal(localStorage.getItem('cmg_obtain_site_v1'), null);
    assert.equal(localStorage.getItem('unrelated_key'), 'keep');
  });

  it('rejects malformed input with zero storage or in-memory mutation', () => {
    localStorage.setItem('cmg_destination', 'Berlin');
    localStorage.setItem('cmg_toggles_old_player', '{"dark":true}');
    const beforeStorage = { ...localStorage._data };
    const beforePlayers = JSON.stringify(S.PLAYERS);

    assert.throws(() => S.importWorkspace({
      type: 'empire-rising-workspace', schema_version: 2,
      storage: { cmg_toggles_old_player: 'not-json' },
    }), /Invalid workspace snapshot/);
    assert.deepEqual(localStorage._data, beforeStorage);
    assert.equal(JSON.stringify(S.PLAYERS), beforePlayers);
  });

  it('rolls back every allowed key, including newly introduced keys, when a write fails', () => {
    localStorage.setItem('cmg_destination', 'Berlin');
    localStorage.setItem('cmg_obtain_site_v1', 'old-site');
    const before = { ...localStorage._data };
    localStorage.failOn = 'cmg_toggles_later';

    assert.throws(() => S.importWorkspace({
      type: 'empire-rising-workspace', schema_version: 2,
      storage: { cmg_destination: 'Paris', cmg_paths_v1: '"new-paths"', cmg_toggles_earlier: '"new-early"', cmg_toggles_later: '"new-late"' },
    }), /failed|rollback/i);
    assert.deepEqual(localStorage._data, before);
  });
});
