/**
 * src/store.js — Shared player & inventory store
 * ============================================================================
 * Single source of truth for all player data, inventory management, undo,
 * and import/export. Eliminates the duplication that previously existed
 * across engine.js, app.js, and the test harness.
 *
 * Exports: window.STORE
 * Synchronises with: window.ENGINE.INV_TOTAL / window.ENGINE.INV_LOCATIONS
 *
 * Load order: must be loaded AFTER game_data.js (window.GAME_DATA)
 *             and BEFORE engine.js (window.ENGINE) and app.js.
 */
'use strict';
(function() {

// ---- localStorage keys ----
const LS_KEY = 'cmg_players_v1';
const PATHS_KEY = 'cmg_paths_v1';
const PLAYER_SCHEMA_VERSION = 2;
const DEFAULT_FACTION = 'UNAFFILIATED';
const WORKSPACE_SCHEMA_VERSION = 2;
const WORKSPACE_SUPPORTED_SCHEMA_VERSIONS = [1, WORKSPACE_SCHEMA_VERSION];
const WORKSPACE_TYPE = 'empire-rising-workspace';
const WORKSPACE_KEYS = [
  'cmg_players_v1', 'cmg_paths_v1', 'er_colony_world_v2', 'cmg_colony_tax_v1',
  'cmg_destination', 'cmg_refine_destination', 'cmg_obtain_site_v1', 'cmg_transport_source_v1',
  'cmg_slot_levels_v1', 'cmg_toggles_', 'cmg_boosters_', 'cmg_medikit_',
  'cmg_medikit_toggle', 'cmg_gearsets_migrated_v1', 'cmg_inv_migrated_v1',
  'cmg_auto_collapsed_v1', 'cmg_collapsed_sections_v1', 'cmg_produce_done_v1',
  'cmg_production_progress_v1', 'cmg_mining_progress_v1', 'cmg_transfers_done_v1', 'cmg_obtained_done_v1', 'cmg_plan_applied_v1',
  'cmg_muted_v1',
];
const WORKSPACE_RAW_KEYS = [
  'cmg_destination', 'cmg_refine_destination', 'cmg_medikit_', 'cmg_medikit_toggle',
  'cmg_gearsets_migrated_v1', 'cmg_inv_migrated_v1',
];

function normalizeFaction(value) {
  try {
    if (typeof window.normalizeFactionId === 'function') return window.normalizeFactionId(value);
  } catch (e) {}
  const id = String(value == null ? '' : value).trim().toUpperCase();
  return id || DEFAULT_FACTION;
}

function normalizePlayerState(state) {
  const source = state && typeof state === 'object' ? state : {};
  const players = source.players && typeof source.players === 'object' ? source.players : {};
  const profiles = source.profiles && typeof source.profiles === 'object' ? source.profiles : {};
  const migratedProfiles = {};
  const normalizedPlayers = {};
  Object.keys(players).forEach(name => {
    const profile = profiles[name] && typeof profiles[name] === 'object' ? profiles[name] : {};
    normalizedPlayers[name] = Array.isArray(players[name]) ? players[name] : [];
    migratedProfiles[name] = { faction: normalizeFaction(profile.faction) };
  });
  return {
    ...source,
    schema_version: PLAYER_SCHEMA_VERSION,
    active: typeof source.active === 'string' ? source.active : '',
    players: normalizedPlayers,
    profiles: migratedProfiles,
  };
}

// ---- Player registry ----
function loadPlayers() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return normalizePlayerState(JSON.parse(raw));
  } catch (e) { /* corrupt storage — start fresh */ }
  return { schema_version: PLAYER_SCHEMA_VERSION, active: '', players: {}, profiles: {} };
}

/** Write directly to localStorage only (no push sync). */
function savePlayersLocal(store) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch (e) {}
}

/**
 * Persist to localStorage. The public build intentionally has no shared
 * network store; explicit export/import is the portability boundary.
 * This is the main save path used by all inventory mutations.
 */
function savePlayers(store) {
  savePlayersLocal(store);
  // No remote inventory push in the public offline-first build.
}

/** Active player registry. Mutated by setInv, importPlayer, etc. */
let PLAYERS = loadPlayers();

/**
 * One-time location spelling fixes.
 *
 * The game data carried the same colony under several spellings
 * ("NECAR's Field" / "Necars Field" / "Necar's Field"), so a player's saved
 * stock could sit under any of them and show up as duplicate zones. The data
 * files are now normalised; this rewrites anything already in localStorage to
 * match, merging quantities where a player held the same item under both
 * spellings.
 */
const LOCATION_ALIASES = {
  "NECAR's Field": "Necar's Field",
  "Necars Field": "Necar's Field"
};

/**
 * Keep the active-player pointer valid when players arrive from a shared
 * inventory or an older local export. The selector otherwise falls back to
 * displaying its first option while the rest of the app still has no active
 * player, which makes the UI and the data operations disagree.
 */
function ensureActivePlayer() {
  if (PLAYERS.active && PLAYERS.players[PLAYERS.active]) return PLAYERS.active;
  const next = Object.keys(PLAYERS.players || {}).sort((a, b) => a.localeCompare(b))[0] || '';
  if (PLAYERS.active !== next) {
    PLAYERS.active = next;
    savePlayersLocal(PLAYERS);
  }
  return next;
}

function getActiveFaction() {
  const name = PLAYERS.active;
  return normalizeFaction(PLAYERS.profiles?.[name]?.faction);
}

function setPlayerFaction(name, faction) {
  if (!name || !PLAYERS.players[name]) return false;
  PLAYERS.profiles = PLAYERS.profiles || {};
  PLAYERS.profiles[name] = { ...(PLAYERS.profiles[name] || {}), faction: normalizeFaction(faction) };
  savePlayers(PLAYERS);
  return true;
}

// A profile is ready for app navigation only after the player has supplied a
// name and selected a real faction. Legacy/neutral profiles stay readable so
// their inventory can be repaired through onboarding, but they do not unlock
// the workbench or other tabs.
function isProfileComplete(name, faction) {
  const playerName = String(name == null ? '' : name).trim();
  return !!playerName && normalizeFaction(faction) !== DEFAULT_FACTION;
}

function migrateLocationNames(store) {
  let changed = false;
  Object.keys(store.players || {}).forEach(function(name) {
    const inv = store.players[name];
    if (!Array.isArray(inv)) return;
    const merged = [];
    inv.forEach(function(e) {
      const canonical = LOCATION_ALIASES[e.location];
      if (canonical) { e.location = canonical; changed = true; }
      // fold duplicates created by the rename into a single entry
      const hit = merged.find(function(m) { return m.item === e.item && m.location === e.location; });
      if (hit) { hit.quantity += e.quantity; changed = true; }
      else merged.push(e);
    });
    store.players[name] = merged;
  });
  return changed;
}

if (migrateLocationNames(PLAYERS)) savePlayersLocal(PLAYERS);
ensureActivePlayer();

// ---- Inventory accessors ----

function getInv() {
  return PLAYERS.players[PLAYERS.active] || [];
}

function setInv(arr) {
  PLAYERS.players[PLAYERS.active] = arr;
  savePlayers(PLAYERS);
}

/**
 * Aggregated inventory: item → total quantity across all locations.
 * This is the hot path for compute() and scoreAlternative() — kept in sync
 * with window.ENGINE so the engine reads the live totals.
 */
let INV_TOTAL = {};

/**
 * Per-item location breakdown: item → [{location, qty}, ...].
 * Used by transport allocation in compute() and item detail popups.
 */
let INV_LOCATIONS = {};

/**
 * Rebuild aggregations from the canonical per-player entry list.
 * Call after any mutation to the active player's inventory.
 * Synchronises window.ENGINE mirrors so compute() and showItemDetail()
 * always see live data.
 */
function recomputeInv() {
  INV_TOTAL = {};
  INV_LOCATIONS = {};
  getInv().forEach(e => {
    INV_TOTAL[e.item] = (INV_TOTAL[e.item] || 0) + e.quantity;
    (INV_LOCATIONS[e.item] = INV_LOCATIONS[e.item] || []).push({
      location: e.location, qty: e.quantity
    });
  });
  // Keep engine mirrors in sync — compute() and scoreAlternative() read these
  if (window.ENGINE) {
    window.ENGINE.INV_TOTAL = INV_TOTAL;
    window.ENGINE.INV_LOCATIONS = INV_LOCATIONS;
  }
}

// Initial recompute on load
recomputeInv();

// ---- CRUD operations ----

/**
 * Apply an inventory delta: add, subtract, or set a quantity at a location.
 * @param {string}  item     Item name
 * @param {string}  location Colony/zone name
 * @param {number}  qty      Quantity
 * @param {string}  mode     'add' | 'subtract' | 'set'
 */
function applyEntry(item, location, qty, mode) {
  const inv = getInv().slice();
  const i = inv.findIndex(e => e.item === item && e.location === location);
  if (mode === 'set') {
    if (i >= 0) inv[i].quantity = qty;
    else inv.push({ item, location, quantity: qty });
  } else if (mode === 'add') {
    if (i >= 0) inv[i].quantity += qty;
    else inv.push({ item, location, quantity: qty });
  } else { // subtract
    if (i >= 0) {
      inv[i].quantity -= qty;
      if (inv[i].quantity <= 0) inv.splice(i, 1);
    }
  }
  setInv(inv);
  recomputeInv();

}

function deleteEntry(item, location) {
  setInv(getInv().filter(e => !(e.item === item && e.location === location)));
  recomputeInv();
}

// ---- Import / Export ----

/** Validate an imported inventory array. Rejects malformed data. */
function validateImport(arr) {
  if (!Array.isArray(arr)) return 'Import must be a JSON array of entries.';
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (!e || typeof e !== 'object') return `Entry ${i}: must be an object.`;
    if (typeof e.item !== 'string' || !e.item.trim()) return `Entry ${i}: missing or invalid "item" name.`;
    if (typeof e.location !== 'string' || !e.location.trim()) return `Entry ${i}: missing or invalid "location".`;
    if (typeof e.quantity !== 'number' || !Number.isFinite(e.quantity) || e.quantity < 0) {
      return `Entry ${i} ("${e.item}"): quantity must be a non-negative number, got ${e.quantity}.`;
    }
    // Sanity cap: prevent localStorage overflow from absurd quantities
    if (e.quantity > 100_000_000) return `Entry ${i} ("${e.item}"): quantity ${e.quantity} exceeds maximum (100M).`;
  }
  return null; // valid
}

/**
 * Import a player from an array of inventory entries.
 * @param {string} name  Player name
 * @param {Array}  arr   Inventory entries [{item, location, quantity}, ...]
 * @throws {Error} if validation fails
 */
function importPlayer(name, arr) {
  const err = validateImport(arr);
  if (err) throw new Error('Invalid import: ' + err);
  PLAYERS.players[name] = arr.map(e => {
    const loc = String(e.location).trim();
    return {
      item: String(e.item).trim(),
      // normalise on the way in, or an old export would reintroduce the
      // duplicate colony spellings this migration just cleaned up
      location: LOCATION_ALIASES[loc] || loc,
      quantity: Math.floor(e.quantity)
    };
  });
  PLAYERS.profiles = PLAYERS.profiles || {};
  PLAYERS.profiles[name] = { ...(PLAYERS.profiles[name] || {}), faction: normalizeFaction(PLAYERS.profiles[name]?.faction) };
  migrateLocationNames(PLAYERS); // fold any duplicates the rename created
  PLAYERS.active = name;
  savePlayers(PLAYERS);
  recomputeInv();
}

function exportPlayer() {
  return {
    schema_version: PLAYER_SCHEMA_VERSION,
    player: PLAYERS.active,
    faction: getActiveFaction(),
    inventory: getInv().map(e => ({ item: e.item, location: e.location, quantity: e.quantity }))
  };
}

function workspaceKeyAllowed(key) {
  return WORKSPACE_KEYS.some(prefix => key === prefix || key.startsWith(prefix));
}

function workspaceKeyIsRaw(key) {
  return WORKSPACE_RAW_KEYS.some(prefix => key === prefix || key.startsWith(prefix));
}

function validateWorkspace(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || snapshot.type !== WORKSPACE_TYPE ||
      !WORKSPACE_SUPPORTED_SCHEMA_VERSIONS.includes(snapshot.schema_version)) {
    return 'Invalid workspace snapshot: unsupported type or schema version.';
  }
  if (!snapshot.storage || typeof snapshot.storage !== 'object' || Array.isArray(snapshot.storage)) {
    return 'Invalid workspace snapshot: storage must be an object.';
  }
  for (const [key, value] of Object.entries(snapshot.storage)) {
    if (!workspaceKeyAllowed(key) || typeof value !== 'string' || value.length > 5_000_000) {
      return `Invalid workspace snapshot: unsupported or oversized storage key "${key}".`;
    }
    if (workspaceKeyIsRaw(key)) continue;
    try { JSON.parse(value); } catch (e) { return `Invalid workspace snapshot: key "${key}" is not valid JSON.`; }
  }
  if (snapshot.storage[LS_KEY] !== undefined) {
    try { normalizePlayerState(JSON.parse(snapshot.storage[LS_KEY])); }
    catch (e) { return `Invalid workspace snapshot: key "${LS_KEY}" is not valid player JSON.`; }
  }
  return null;
}

function migrateWorkspace(snapshot) {
  const error = validateWorkspace(snapshot);
  if (error) throw new Error(error);
  return { type: WORKSPACE_TYPE, schema_version: WORKSPACE_SCHEMA_VERSION, storage: { ...snapshot.storage } };
}

function readAllowedStorage() {
  const storage = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && workspaceKeyAllowed(key)) storage[key] = localStorage.getItem(key);
  }
  return storage;
}

function exportWorkspace() {
  const storage = readAllowedStorage();
  storage[LS_KEY] = JSON.stringify(PLAYERS);
  return { type: WORKSPACE_TYPE, schema_version: WORKSPACE_SCHEMA_VERSION, storage };
}

function restoreAllowedStorage(previous, next) {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys) {
    if (next[key] === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, next[key]);
  }
}

function importWorkspace(snapshot) {
  const migrated = migrateWorkspace(snapshot);
  const previous = readAllowedStorage();
  try {
    restoreAllowedStorage(previous, migrated.storage);
  } catch (cause) {
    try {
      // Re-read the partially written allowed state so rollback also removes
      // keys introduced before the failure.
      restoreAllowedStorage(readAllowedStorage(), previous);
    }
    catch (rollbackError) {
      throw new Error(`Workspace import failed and rollback failed: ${rollbackError.message}`);
    }
    throw new Error(`Workspace import failed; changes rolled back: ${cause.message}`);
  }
  const nextPlayers = migrated.storage[LS_KEY] ? normalizePlayerState(JSON.parse(migrated.storage[LS_KEY])) : loadPlayers();
  // Keep the object identity stable: app-core and view modules retain a reference
  // to S.PLAYERS, so replacing the object would leave them rendering stale state
  // after a valid workspace import.
  Object.keys(PLAYERS).forEach(key => { if (!(key in nextPlayers)) delete PLAYERS[key]; });
  Object.assign(PLAYERS, nextPlayers);
  ensureActivePlayer();
  recomputeInv();
  return exportWorkspace();
}

// ---- Undo support ----

let _undoSnapshot = null;

/** Snapshot the current inventory before applying a plan — call before compute(). */
function snapshotInv() {
  _undoSnapshot = getInv().map(e => ({ item: e.item, location: e.location, quantity: e.quantity }));
}

function undoInv() {
  if (!_undoSnapshot) return false;
  setInv(_undoSnapshot);
  recomputeInv();
  _undoSnapshot = null;
  return true;
}

// ---- Public API (window.STORE) ----

const STORE = {
  // State
  get PLAYERS() { return PLAYERS; },
  get LS_KEY() { return LS_KEY; },
  get PATHS_KEY() { return PATHS_KEY; },

  // Core CRUD
  loadPlayers,
  savePlayers,
  savePlayersLocal,
  getInv,
  setInv,
  recomputeInv,
  applyEntry,
  deleteEntry,
  migrateLocationNames,
  ensureActivePlayer,
  getActiveFaction,
  setPlayerFaction,
  isProfileComplete,

  // Aggregations (read by engine)
  get INV_TOTAL() { return INV_TOTAL; },
  set INV_TOTAL(v) { INV_TOTAL = v; },
  get INV_LOCATIONS() { return INV_LOCATIONS; },
  set INV_LOCATIONS(v) { INV_LOCATIONS = v; },

  // Import / Export
  importPlayer,
  exportPlayer,
  validateImport,
  exportWorkspace,
  importWorkspace,
  validateWorkspace,

  // Undo
  snapshotInv,
  undoInv,
};

// Export
window.STORE = STORE;

// Also attach to module.exports for test harness (Node.js require)
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = STORE;
}

})();
