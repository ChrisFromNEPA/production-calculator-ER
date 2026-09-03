/**
 * tests/harness.mjs — lightweight harness for engine tests
 * ============================================================================
 * Loads store.js + engine.js directly, provides minimal browser stubs.
 * Eliminates the THIRD copy of applyPlan that previously existed here.
 * Single source of truth: store.js for player data, engine.js for compute.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const siteDir = join(__dirname, '..');

// ---- Stub browser globals ----
globalThis.window = {
  matchMedia() { return { matches: false, addEventListener() {} }; },
  location: { pathname: '/', hash: '' },
  history: { replaceState() {} },
  navigator: { clipboard: { writeText() { return Promise.resolve(); } } },
  btoa: btoa, atob: atob,
};
globalThis.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] || null; },
  setItem(k, v) { this._data[k] = v; },
  removeItem(k) { delete this._data[k]; },
};
globalThis.document = {
  getElementById() { return null; },
  querySelectorAll() { return []; },
  createElement(tag) {
    return {
      tagName: tag, classList: { add(){}, remove(){}, toggle(){}, contains(){} },
      addEventListener(){}, setAttribute(){}, getAttribute(){return null},
      appendChild(c){return c}, querySelector(){return null}, closest(){return null},
      style:{}, dataset:{}, innerHTML:'', textContent:'', value:'', checked:false,
      hidden:false, click(){}, focus(){}
    };
  },
  addEventListener() {},
  querySelector() { return null; },
  body: { appendChild(c){return c}, querySelector(){return null} },
};
// schedulePushInv stub — store.js guards against this not being defined
globalThis.schedulePushInv = function() {};
// refreshAll stub — app.js undo wrapper needs this
globalThis.refreshAll = function() {};

// ---- Load game data → store → engine (order matters) ----
require(join(siteDir, 'src', 'game_data.js'));
require(join(siteDir, 'src', 'store.js'));       // window.STORE (engine depends on it)
const engine = require(join(siteDir, 'src', 'engine.js'));  // window.ENGINE

// ---- Shared production Apply implementation ----
require(join(siteDir, 'src', 'apply-plan.js'));
const applyPlan = window.APPLY_PRODUCTION_PLAN;

// ---- Test helpers ----
function setTestInv(t, l) {
  window.STORE.INV_TOTAL = t;
  window.STORE.INV_LOCATIONS = l || {};
}
function setPlayerInv(arr) {
  window.STORE.PLAYERS.players = window.STORE.PLAYERS.players || {};
  window.STORE.PLAYERS.players['T'] = arr;
  window.STORE.PLAYERS.active = 'T';
  window.STORE.recomputeInv();
}
function getPlayerInv() {
  return window.STORE.PLAYERS.players['T'] || [];
}
function reset() {
  window.STORE.INV_TOTAL = {};
  window.STORE.INV_LOCATIONS = {};
  window.STORE.PLAYERS.players = {};
  window.STORE.PLAYERS.active = '';
  localStorage._data = {};
}

export default {
  ...engine,
  STORE: window.STORE,
  applyPlan, setTestInv, setPlayerInv, getPlayerInv, reset,
};
