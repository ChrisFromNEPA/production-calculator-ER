/**
 * src/app-core.js — Shared infrastructure
 * ============================================================================
 * Global state, engine aliases, player management, colony config, discount engine.
 * Loaded BEFORE app.js and all view files. All declarations are top-level.
 *
 * Provides: DATA, tooltipEl, engine aliases (esc, fmt, displayName, iconFor, …),
 *           PLAYERS, DESTINATION, REFINE_DESTINATION, INV_TOTAL, INV_LOCATIONS, getDiscounts,
 *           applyPlan, renderItemOptions, refreshAll, populateDestinations
 */
'use strict';

// Shared tooltip element (used by picker grid + gear slots + gear picker modal)
let tooltipEl = null;

// Production-materials block for hover tooltips: the recipe's direct inputs
// (per batch), or '' when the item isn't produced by a recipe (raw material).
function tooltipMaterialsHtml(item) {
  const recs = RECIPES_BY_OUTPUT[item];
  if (!recs || !recs.length) return '';
  const r = recs[0];
  const sets = r.inputs ? [r.inputs] : (r.inputs_alternatives || []);
  if (!sets.length) return '';
  const row = s => s.map(i =>
    '<span class="tt-mat">' + iconFor(i.item) +
    '<span class="tt-mat-name">' + esc(displayName(i.item)) + '</span>' +
    '<b class="tt-mat-qty">×' + fmt(i.quantity) + '</b></span>'
  ).join('<span class="tt-plus">+</span>');
  // Multiple production paths: render each path as its own block with a
  // visible "or" divider between blocks, so alternatives don't blur into
  // one long + chain. Single path = plain row (no divider).
  const multi = sets.length > 1;
  const lines = sets.map((s, i) => {
    const path = '<span class="tt-path">' + row(s) + '</span>';
    if (!multi) return path;
    return (i ? '<span class="tt-or-divider">or</span>' : '') + path;
  }).join('');
  const batch = r.output.quantity
    ? '<div class="tt-batch">' + fmt(r.output.quantity) + ' per batch · ' + esc(r.process || '') + '</div>'
    : '';
  return '<div class="tt-mats">' +
    '<div class="tt-mats-label">Materials</div>' +
    '<div class="tt-mats-row' + (multi ? ' tt-mats-multi' : '') + '">' + lines + '</div>' + batch + '</div>';
}

// ═══════════════════════════════════════════════════════════════════════════
// § IMPORTS — engine & data aliases
// ═══════════════════════════════════════════════════════════════════════════
const {
  compute, RECIPES_BY_OUTPUT, CRAFTABLE, MINED, MINE_SITES,
  FINAL_ITEMS, ALL_ITEMS, CATEGORIES, ALTERNATIVE_CHOICES, LOCATIONS,
  pickAlternativeIndex, scoreAlternative, concreteInputs,
  esc, displayName, normalizeSearchText, fmt, iconFor, itemTypeLabel, showItemDetail,
} = window.ENGINE;
// Global declarations — engine.js and store.js use IIFEs, so these MUST be declared here
const DATA = window.GAME_DATA;
let DESTINATION = window.ENGINE.DESTINATION;
let REFINE_DESTINATION = DESTINATION;
let REFINE_DESTINATION_EXPLICIT = false;


// ═══════════════════════════════════════════════════════════════════════════
// § STORE BRIDGE — delegates to src/store.js
// ═══════════════════════════════════════════════════════════════════════════
const S = window.STORE;
const { loadPlayers, savePlayersLocal, getInv, setInv, recomputeInv,
        applyEntry, deleteEntry, importPlayer, exportPlayer,
        snapshotInv, undoInv: _storeUndoInv } = S;

/**
 * Undo wrapper: STORE handles the data rollback, app refreshes the UI.
 * This replaces the duplicated undoInv() that previously lived in every file.
 */
function undoInvWrapper() {
  const ok = _storeUndoInv();
  if (ok) refreshAll();
  return ok;
}
const undoInv = undoInvWrapper;

// PLAYERS is a stable object reference (only properties mutate).
let PLAYERS = S.PLAYERS;
const savePlayers = S.savePlayers;

// ---- Required first-run profile gate --------------------------------------
// Keep the settings menu usable for theme, text-size, and other accessibility
// adjustments, but do not let an unprofiled visitor browse or mutate the
// calculator. The guard lives here so clicks, grouped navigation, and direct
// hash routes all share the same policy.
function hasCompletePlayerProfile() {
  const name = String(PLAYERS?.active || '').trim();
  const faction = S.getActiveFaction ? S.getActiveFaction() : '';
  return !!(S.isProfileComplete && S.isProfileComplete(name, faction));
}

function syncProfileGateState() {
  const locked = !hasCompletePlayerProfile();
  const root = document.documentElement;
  root.dataset.profileGate = locked ? 'required' : 'ready';
  document.body?.classList.toggle('profile-gated', locked);
  document.querySelectorAll('[data-view], [data-nav-view], [data-nav-toggle="drawer"], .nav-more-btn').forEach(button => {
    const route = button.dataset.view || button.dataset.navView;
    const navigationButton = route || button.classList.contains('nav-more-btn') || button.dataset.navToggle === 'drawer';
    if (!navigationButton) return;
    const allowed = !locked || route === 'calc';
    button.disabled = !allowed;
    button.setAttribute('aria-disabled', String(!allowed));
  });
  const notice = document.getElementById('profile-gate-notice');
  if (notice) notice.hidden = !locked;
  return !locked;
}

window.hasCompletePlayerProfile = hasCompletePlayerProfile;
window.syncProfileGateState = syncProfileGateState;

/**
 * Live inventory aggregations — Proxy delegates every property access
 * to STORE's current object. Since recomputeInv() replaces the STORE
 * object with a fresh {} on every mutation, caching a reference would
 * be stale. Proxy avoids this: every read/write/enumeration hits the
 * live STORE object.
 */
const INV_TOTAL = new Proxy({}, {
  get(_, prop) { return S.INV_TOTAL[prop]; },
  set(_, prop, val) { S.INV_TOTAL[prop] = val; return true; },
  ownKeys() { return Reflect.ownKeys(S.INV_TOTAL); },
  getOwnPropertyDescriptor(_, prop) { return Object.getOwnPropertyDescriptor(S.INV_TOTAL, prop); },
  has(_, prop) { return prop in S.INV_TOTAL; },
  deleteProperty(_, prop) { return delete S.INV_TOTAL[prop]; }
});

const INV_LOCATIONS = new Proxy({}, {
  get(_, prop) { return S.INV_LOCATIONS[prop]; },
  set(_, prop, val) { S.INV_LOCATIONS[prop] = val; return true; },
  ownKeys() { return Reflect.ownKeys(S.INV_LOCATIONS); },
  getOwnPropertyDescriptor(_, prop) { return Object.getOwnPropertyDescriptor(S.INV_LOCATIONS, prop); },
  has(_, prop) { return prop in S.INV_LOCATIONS; }
});

// Read discount values from the UI panel
function getDiscounts() {
  const prod = Math.max(0, Math.min(100, parseInt(document.getElementById('disc-prod')?.value, 10) || 0));
  const mine = Math.max(0, Math.min(100, parseInt(document.getElementById('disc-mine')?.value, 10) || 0));
  const trans = Math.max(0, Math.min(100, parseInt(document.getElementById('disc-trans')?.value, 10) || 0));
  return { prod: prod / 100, mine: mine / 100, trans: trans / 100 };
}

// ═══════════════════════════════════════════════════════════════════════════
// § DESTINATION — configurable production colony
// ═══════════════════════════════════════════════════════════════════════════
// Every place a name can come from, before any filtering.
const OWNERSHIP_LOCATIONS = Object.freeze([
  'Brooklyn', 'Ground Zero', 'Training Grounds', "DeMorgan's Castle", 'DSS Yukon',
  'Pax Prime', 'Pegasi 51', "Kepler's Dome", 'Titan Station', 'NYC Manhattan',
  'Aurelia', "Necar's Field", 'Berlin', 'Paris', 'Ceres Delta', 'Andromeda City', 'Tokyo',
]);
function allKnownLocations() {
  return [...new Set([
    'Berlin',  // always available — a production hub, not a mining site
    ...DATA.mining_sites.map(s => s.location),
    ...DATA.inventory.map(e => e.location),
    ...getInv().map(e => e.location),
    ...OWNERSHIP_LOCATIONS
  ])].sort((a, b) => a.localeCompare(b));
}

// Final production destinations are intentionally narrower than mining and
// refinement locations. Keep the game's Manhattan spelling here; ownership
// data uses NYC Manhattan and colonyOwnerIds() resolves that alias.
const FINAL_PRODUCTION_LOCATIONS = Object.freeze([
  "Kepler's Dome", 'Brooklyn', 'Ground Zero', 'Manhattan', 'Paris', 'Berlin', 'Tokyo',
]);

function colonyList() {
  return FINAL_PRODUCTION_LOCATIONS.slice();
}

// STORAGE locations — anywhere stock can sit, which is a wider set than the
// production one. An apartment can't manufacture but is perfectly good storage,
// so it belongs in the inventory zone picker and every "move to" dropdown;
// sharing colonyList() for those wrongly hid it. Only genuine non-places (an
// activity like the xenomorph hunt) are excluded.
function storageList() {
  const skip = new Set(['xenomorph hunt (capped on kills)']);
  return allKnownLocations().filter(c => !skip.has(c.toLowerCase()));
}

// One shared definition of which values each destination may hold. Every
// entry point — selector population, saved-state load, saved-plan load and
// the what-if handler — validates through these helpers, so a rejected
// legacy location can never re-enter through a side door.
function refinementLocationList() {
  const skip = new Set(['nyc manhattan', 'xenomorph hunt (capped on kills)', 'apartment']);
  return allKnownLocations().filter(c => !skip.has(c.toLowerCase()));
}
function validFinalProduction(loc) {
  return !!loc && colonyList().includes(loc);
}
function validRefinement(loc) {
  return !!loc && refinementLocationList().includes(loc);
}

function populateDestinations() {
  const sel = document.getElementById('calc-dest');
  let colonies = colonyList();
  if (sel) {
    sel.innerHTML = '';
    colonies.forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      sel.appendChild(o);
    });
  }
  // Select saved destination or default to Berlin
  const target = DESTINATION && colonies.includes(DESTINATION) ? DESTINATION : 'Berlin';
  if (sel && colonies.includes(target)) sel.value = target;
  DESTINATION = target;

  // Refinement may happen at any known colony except the NYC Manhattan alias
  // (the game's Manhattan spelling) and non-place activities like the
  // xenomorph hunt. Apartments are storage, never refinement colonies.
  const refineSel = document.getElementById('calc-refine-dest');
  const refinementLocations = refinementLocationList();
  if (refineSel) {
    refineSel.innerHTML = '';
    refinementLocations.forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      refineSel.appendChild(o);
    });
    const refineTarget = REFINE_DESTINATION && refinementLocations.includes(REFINE_DESTINATION)
      ? REFINE_DESTINATION : target;
    refineSel.value = refineTarget;
    REFINE_DESTINATION = refineTarget;
  } else {
    REFINE_DESTINATION = REFINE_DESTINATION && refinementLocations.includes(REFINE_DESTINATION)
      ? REFINE_DESTINATION : target;
  }

  // Combined convenience selector: same option list as production (FINAL_
  // PRODUCTION_LOCATIONS), plus an empty placeholder meaning "split / not
  // combined". Choosing a colony here sets both destinations together.
  const combinedSel = document.getElementById('calc-combined-dest');
  if (combinedSel) {
    combinedSel.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = ''; placeholder.textContent = 'Different colonies…';
    combinedSel.appendChild(placeholder);
    colonyList().forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      combinedSel.appendChild(o);
    });
    combinedSel.value = (REFINE_DESTINATION && REFINE_DESTINATION === DESTINATION) ? DESTINATION : '';
  }
}
function getDestination() {
  const el = document.getElementById('calc-dest');
  if (el && el.value) DESTINATION = el.value;
  if (!REFINE_DESTINATION_EXPLICIT) {
    REFINE_DESTINATION = DESTINATION;
    const refineEl = document.getElementById('calc-refine-dest');
    if (refineEl) refineEl.value = REFINE_DESTINATION;
    syncCombinedSelector();
  }
  saveDestination();
  // The tax summary quotes the destination's rate, so it has to follow it.
  if (typeof updateColonyTaxNote === 'function') updateColonyTaxNote();
  return DESTINATION;
}
function getRefineDestination(explicit) {
  const el = document.getElementById('calc-refine-dest');
  if (el && el.value) REFINE_DESTINATION = el.value;
  if (explicit) REFINE_DESTINATION_EXPLICIT = true;
  syncCombinedSelector();
  saveDestination();
  return REFINE_DESTINATION;
}
// Combined ("same location") mode: setting the convenience selector sets both
// destinations together. Selecting an explicit colony below or above returns
// to expert split mode; the split values stay exactly as last set.
function setCombinedDestination() {
  const el = document.getElementById('calc-combined-dest');
  if (!el || !el.value) return;
  DESTINATION = el.value;
  REFINE_DESTINATION = el.value;
  window.ENGINE.DESTINATION = DESTINATION;
  const destSel = document.getElementById('calc-dest');
  if (destSel) destSel.value = DESTINATION;
  const refineSel = document.getElementById('calc-refine-dest');
  if (refineSel) refineSel.value = REFINE_DESTINATION;
  // The combined choice is an explicit refinement choice: keep it sticky so a
  // later production change does not silently overwrite it.
  REFINE_DESTINATION_EXPLICIT = true;
  if (typeof updateColonyTaxNote === 'function') updateColonyTaxNote();
  saveDestination();
}
function exitCombinedMode() {
  // Leaving combined mode just re-enters expert split mode with the current
  // values; nothing is overwritten. The convenience selector resets to the
  // placeholder unless the two colonies happen to be equal.
  syncCombinedSelector();
}
function syncCombinedSelector() {
  const el = document.getElementById('calc-combined-dest');
  if (el) el.value = (REFINE_DESTINATION && REFINE_DESTINATION === DESTINATION) ? DESTINATION : '';
}
// Saved-state migration: legacy saves may contain destinations that are no
// longer valid (e.g. apartment), and pre-refinement saves have no refine
// value at all. Normalize both on load, using the same shared allowlists as
// the selectors, and persist whatever was repaired so the next load is clean.
function normalizeSavedDestinations() {
  let repaired = false;
  if (DESTINATION && !validFinalProduction(DESTINATION)) {
    DESTINATION = 'Berlin';
    window.ENGINE.DESTINATION = DESTINATION;
    repaired = true;
  }
  if (REFINE_DESTINATION && !validRefinement(REFINE_DESTINATION)) {
    REFINE_DESTINATION = DESTINATION;
    REFINE_DESTINATION_EXPLICIT = false;
    repaired = true;
  }
  if (repaired) saveDestination();
}
function loadDestination() {
  const skip = new Set(['apartment', 'xenomorph hunt (capped on kills)']);
  // A legacy stored value that is rejected must be rewritten in storage, not
  // merely ignored in memory — otherwise every reload re-runs the repair.
  let storedInvalid = false;
  try {
    const v = localStorage.getItem('cmg_destination');
    const r = localStorage.getItem('cmg_refine_destination');
    if (v && !skip.has(v.toLowerCase())) DESTINATION = v;
    else if (v) storedInvalid = true;
    if (r && !skip.has(r.toLowerCase())) {
      REFINE_DESTINATION = r;
      REFINE_DESTINATION_EXPLICIT = true;
    } else {
      if (r) storedInvalid = true;
      REFINE_DESTINATION = DESTINATION;
      REFINE_DESTINATION_EXPLICIT = false;
    }
  } catch(e) {}
  normalizeSavedDestinations();
  if (storedInvalid) saveDestination();
  populateDestinations();
}
function saveDestination() {
  try { localStorage.setItem('cmg_destination', DESTINATION); } catch(e) {}
  try { localStorage.setItem('cmg_refine_destination', REFINE_DESTINATION); } catch(e) {}
}
loadDestination();

function applyPlan(res, dest) {
  const finalDest = dest || res.plan.destination || DESTINATION;
  const refineDest = res.plan.refineDestination || finalDest;
  const inv = getInv().slice();
  const log = [];

  // helper: deduct qty of item at location, return actual amount taken
  function deductAt(item, location, qty) {
    const idx = inv.findIndex(e => e.item === item && e.location === location);
    if (idx < 0) return 0;
    const take = Math.min(qty, inv[idx].quantity);
    inv[idx].quantity -= take;
    if (inv[idx].quantity <= 0) inv.splice(idx, 1);
    return take;
  }

  // helper: add qty of item at location
  function addAt(item, location, qty) {
    const idx = inv.findIndex(e => e.item === item && e.location === location);
    if (idx >= 0) inv[idx].quantity += qty;
    else inv.push({ item, location, quantity: qty });
  }

  function availableAt(item, location) {
    return inv.filter(e => e.item === item && e.location === location)
      .reduce((sum, e) => sum + e.quantity, 0);
  }

  // 1) Transport: deduct from source colonies, add to destination
  Object.entries(res.plan.transport).forEach(([item, info]) => {
    let need = info.qty;
    const target = info.to || refineDest;
    info.from.forEach(loc => {
      if (need <= 0) return;
      const take = deductAt(item, loc, need);
      need -= take;
    });
    addAt(item, target, info.qty);
    log.push(`Moved ${fmt(info.qty)} ${esc(item)} → ${esc(target)}`);
  });

  // 2) Process steps in build order (raws first, finals last).
  // The engine now returns steps in correct build order.
  let previousLocation = refineDest;
  res.plan.steps.forEach(step => {
    const location = step.location || finalDest;
    const inputs = step.resolvedInputs || [];

    // Refinements happen at refineDest, then the intermediate outputs and any
    // direct inputs travel to the final production colony before manufacture.
    const transferSource = location === refineDest ? previousLocation : refineDest;
    if (transferSource !== location) {
      inputs.forEach(inp => {
        const needAtSource = Math.max(0, inp.qty - availableAt(inp.item, location));
        const moved = deductAt(inp.item, transferSource, needAtSource);
        if (moved > 0) addAt(inp.item, location, moved);
      });
    }

    // Add the produced output
    addAt(step.item, location, step.produced);
    log.push(`${step.type === 'manufacture' ? 'Manufactured' : 'Refined'} ${fmt(step.produced)} ${esc(step.item)} at ${esc(location)}`);

    // Deduct inputs using resolvedInputs (respects the chosen refinement path)
    inputs.forEach(inp => {
      const taken = deductAt(inp.item, location, inp.qty);
      const shortfall = inp.qty - taken;
      if (shortfall > 0) {
        log.push(`⚠ assumed mined: ${fmt(shortfall)}× ${esc(inp.item)} (not at ${esc(location)})`);
      }
    });
    previousLocation = location;
  });

  setInv(inv);
  recomputeInv();
  refreshAll();
  return log;
}

// =========================================================================
// RENDERING
// =========================================================================
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }

function renderItemOptions() {
  const dl = document.getElementById('item-list');
  if (!dl) return;
  FINAL_ITEMS.forEach(name => {
    const o = document.createElement('option'); o.value = name; dl.appendChild(o);
  });
}

// ---- Visual final-item picker ----
function initPickerFilters() {
  const sel = document.getElementById('picker-cat');
  if (!sel) return;
  CATEGORIES.forEach(c => {
    const o = document.createElement('option'); o.value = c; o.textContent = c;
    sel.appendChild(o);
  });
  // The placeholder count must track the live item catalog, not a stale
  // hardcoded number (the catalog grows as recipes are added).
  const search = document.getElementById('picker-search');
  if (search) search.placeholder = `Search ${FINAL_ITEMS.length} final items…`;
}

function catOf(item) {
  for (const r of DATA.recipes) {
    if (r.output.item === item && r.output.category) return r.output.category;
  }
  return '';
}

// Category → short CSS class name for color-coding
const CAT_COLORS = {
  'Medical': 'cat-medical', 'Ammunition': 'cat-ammo', 'Weapons': 'cat-weapons',
  'Food & Drink': 'cat-food', 'Implants & Electronics': 'cat-implants',
  'Alien Materials': 'cat-alien', 'Armor': 'cat-armor', 'Other': 'cat-other'
};
function catClass(item) { return CAT_COLORS[catOf(item)] || 'cat-other'; }

// ---- Mine-site color palette (deterministic per site) ----
const SITE_COLORS = ['#00f0ff','#ff2d95','#8b2cf5','#f59e0b','#22c55e','#3b82f6','#ef4444','#ec4899','#14b8a6','#f97316'];
function siteColor(site) {
  let h = 0;
  for (let i = 0; i < site.length; i++) h = ((h << 5) - h + site.charCodeAt(i)) | 0;
  return SITE_COLORS[Math.abs(h) % SITE_COLORS.length];
}

function renderPicker() {
  const q = normalizeSearchText(document.getElementById('picker-search').value);
  const cat = document.getElementById('picker-cat').value;
  const matches = FINAL_ITEMS.filter(name => {
    if (cat && catOf(name) !== cat) return false;
    if (q && !normalizeSearchText(name).includes(q)) return false;
    return true;
  });
  const grid = document.getElementById('picker-grid');
  if (!grid) return;
  grid.innerHTML = matches.map(name => {
    const have = INV_TOTAL[name] || 0;
    const cat = catOf(name);
    const typeLabel = itemTypeLabel(name);
    return `<button class="pick-card" data-item="${encodeURIComponent(name)}" data-category="${esc(cat)}" aria-label="Calculate ${esc(displayName(name))} (${esc(cat)})">
        <span class="pick-icon">${iconFor(name)}</span>
        <span class="pick-name">${esc(displayName(name))}</span>
        <span class="pick-type">${esc(typeLabel)}</span>
        <span class="pick-have${have > 0 ? ' have' : ''}" aria-label="${have > 0 ? fmt(have) + ' owned' : 'none owned'}">${have > 0 ? fmt(have) : '—'}</span>
      </button>`;
  }).join('') || `<div class="muted" style="padding:20px;text-align:center">No items match${q ? ' for “' + esc(document.getElementById('picker-search').value.trim()) + '”' : ''}. Try a shorter term, another spelling, or clear the category filter.</div>`;
  document.getElementById('picker-count').textContent = `${matches.length} final items`;
}

// ---- Step card (recipe-flow visual) ----
// ── Production costs ───────────────────────────────────────────────────────
// window.COSTS (src/costs.js) holds the UC cost of ONE BATCH per refinement
// path. Coverage is partial — 255 of the app's craftable items so far — so
// every caller has to cope with null rather than assume a number.
//
// Deliberately strict: if the path a step actually used has no price, this
// returns null instead of falling back to path 0. Quoting another path's price
// as if it were this one would be worse than admitting it's unknown.
function costFor(item, altIndex) {
  const table = window.COSTS && window.COSTS.items;
  if (!table) return null;
  const paths = table[item];
  if (!paths) return null;
  return paths[altIndex == null ? 0 : altIndex] || null;
}

// ── Colony tax & faction ownership ─────────────────────────────────────────
// Every price in costs.json was sampled at 0% tax, so a colony's rate is a
// surcharge on top of it. Ownership and return policy are local world-state
// inputs; a fresh browser does not invent ownership for any faction.
const DEFAULT_RETURN_RATE = 0.85;
const GLOBAL_DOMINION_RATE = 0.15;
// Authoritative starting world state. Each colony has one actual owner.
// LED and FDC cooperate as Global Dominion, but the alliance is not a second
// owner and does not create a second owner return.
const DEFAULT_COLONY_OWNER = Object.freeze({
  'Brooklyn': ['FDC'],
  'Ground Zero': ['LED'],
  'Training Grounds': ['FDC'],
  "DeMorgan's Castle": ['LED'],
  'DSS Yukon': ['FDC'],
  'Pax Prime': ['EC'],
  'Pegasi 51': ['EC'],
  "Kepler's Dome": ['EC'],
  'Titan Station': ['EC'],
  'NYC Manhattan': ['GOM'],
  'Aurelia': ['GOM'],
  "Necar's Field": ['BOS'],
  'Berlin': ['BOS'],
  'Paris': ['CMG'],
  'Ceres Delta': ['VI'],
  'Andromeda City': ['CMG'],
  'Tokyo': ['VI'],
});
function cloneDefaultColonyOwners() {
  return Object.fromEntries(Object.entries(DEFAULT_COLONY_OWNER).map(([c, owner]) => [c, [...owner]]));
}
let COLONY_OWNER = cloneDefaultColonyOwners();   // location → faction IDs
let COLONY_TAX = {};     // location → tax percent charged there

(function loadColonySettings() {
  try {
    const raw = JSON.parse(localStorage.getItem('er_colony_world_v2') || localStorage.getItem('cmg_colony_tax_v1'));
    if (raw) {
      const storedOwners = Object.fromEntries(Object.entries(raw.owner || {}).flatMap(([colony, value]) => {
        const owners = normalizeColonyWorldOwner(value, colony);
        return owners.length ? [[colony, owners]] : [];
      }));
      COLONY_OWNER = raw.defaults_initialized
        ? storedOwners
        : { ...cloneDefaultColonyOwners(), ...storedOwners };
      COLONY_TAX = raw.tax || {};
    }
  } catch (e) { COLONY_OWNER = cloneDefaultColonyOwners(); COLONY_TAX = {}; }
})();

function activeFactionId() {
  return S.getActiveFaction ? S.getActiveFaction() : 'UNAFFILIATED';
}
function factionReturnRate(id) {
  const f = window.factionById ? window.factionById(id) : null;
  return f && typeof f.return_rate === 'number' ? f.return_rate : 0;
}
function activeFactionReturnRate() { return factionReturnRate(activeFactionId()); }
function saveColonySettings() {
  try { localStorage.setItem('er_colony_world_v2', JSON.stringify({ schema_version: 2, defaults_initialized: true, owner: COLONY_OWNER, tax: COLONY_TAX })); } catch (e) {}
}
function normalizeColonyWorldOwner(value, colony) {
  const values = Array.isArray(value) ? value : [value];
  // v2 snapshots stored arrays while the editor allowed joint holdings. Keep
  // one valid entry as the actual owner, preserving the canonical legacy map
  // where known and otherwise retaining the first valid entry deterministically.
  const valid = values.map(v => String(v || '').trim().toUpperCase())
    .filter(id => window.factionById?.(id));
  if (!valid.length) return [];
  const legacyGlobalDominionOwner = {
    Brooklyn: 'FDC',
    'Ground Zero': 'LED',
    'Training Grounds': 'FDC',
    "DeMorgan's Castle": 'LED',
  };
  const owner = valid.length > 1 && legacyGlobalDominionOwner[colony]
    ? legacyGlobalDominionOwner[colony]
    : valid[0];
  return [owner];
}
function colonyOwnerIds(colony) {
  const value = COLONY_OWNER[colony];
  if (value) return Array.isArray(value) ? value.slice(0, 1) : [value];
  const aliases = {
    'Training Center': 'Training Grounds',
    Yukon: 'DSS Yukon',
    Manhattan: 'NYC Manhattan',
    Andromeda: 'Andromeda City',
  };
  const aliasValue = COLONY_OWNER[aliases[colony]];
  return Array.isArray(aliasValue) ? aliasValue.slice(0, 1) : (aliasValue ? [aliasValue] : []);
}
function canonicalColonyName(colony) {
  const aliases = {
    'Training Center': 'Training Grounds',
    Yukon: 'DSS Yukon',
    Manhattan: 'NYC Manhattan',
    Andromeda: 'Andromeda City',
  };
  return aliases[colony] || colony;
}
function exportColonyWorld() {
  return {
    schema_version: 2,
    defaults_initialized: true,
    type: 'empire-rising-colony-world',
    owner: { ...COLONY_OWNER },
    tax: { ...COLONY_TAX },
    exported_at: new Date().toISOString(),
  };
}
function importColonyWorld(payload) {
  if (!payload || typeof payload !== 'object' || payload.type !== 'empire-rising-colony-world' || payload.schema_version !== 2) {
    throw new Error('Invalid colony world snapshot');
  }
  const owner = {};
  const tax = {};
  Object.entries(payload.owner || {}).forEach(([colony, faction]) => {
    const id = normalizeColonyWorldOwner(faction, String(colony));
    if (id.length) owner[canonicalColonyName(String(colony))] = id;
  });
  Object.entries(payload.tax || {}).forEach(([colony, rate]) => {
    if (Number.isFinite(rate) && rate >= 0 && rate <= 500) tax[String(colony)] = Math.floor(rate);
  });
  COLONY_OWNER = owner;
  COLONY_TAX = tax;
  saveColonySettings();
  refreshEngineFactionContext();
  if (typeof renderColonyTax === 'function') renderColonyTax();
  return exportColonyWorld();
}
function resetColonyWorld() {
  COLONY_OWNER = cloneDefaultColonyOwners();
  COLONY_TAX = {};
  saveColonySettings();
  refreshEngineFactionContext();
  if (typeof renderColonyTax === 'function') renderColonyTax();
  return exportColonyWorld();
}
function taxRateFor(loc) {
  const p = COLONY_TAX[loc];
  return typeof p === 'number' && p > 0 ? p / 100 : 0;
}
function isOwnColony(loc) {
  const owners = colonyOwnerIds(loc);
  return owners.includes(activeFactionId()) && activeFactionReturnRate() > 0;
}
function refreshEngineFactionContext() {
  window.ENGINE_COLONY_OWNED = isOwnColony;
  window.ENGINE_COLONY_REBATE_FOR = () => activeFactionReturnRate();
  window.ENGINE_COLONY_TAX_FOR = loc => taxRateFor(loc);
  // Compatibility for older extensions that only know the numeric hook.
  window.ENGINE_COLONY_REBATE = activeFactionReturnRate();
}
refreshEngineFactionContext();
// ── Shared across the guild ────────────────────────────────────────────────
// Unlike a chosen mine site or a ticked checkbox, a colony's tax and its owner
// are facts about the world, identical for everyone. Left per-device they had
// to be re-entered by every member, and when a colony changed hands everybody
// else's costs went quietly wrong. So they sync through the same Worker the
// inventory uses, keyed per colony: two people editing different colonies never
// collide, and the same colony is last-write-wins.
function colonyOp(colony) {
  return { op: 'setcolony', colony: colony,
           rate: (typeof COLONY_TAX[colony] === 'number' ? COLONY_TAX[colony] : 0),
           owner: COLONY_OWNER[colony] || [] };
}

// Take the shared copy as authoritative. Returns true if anything moved, so the
// caller only re-renders when it needs to.
function adoptRemoteColonies(remote) {
  if (!remote || typeof remote !== 'object') return false;
  let changed = false;
  Object.keys(remote).forEach(c => {
    const r = remote[c];
    if (!r || typeof r !== 'object') return;
    if (typeof r.rate === 'number' && COLONY_TAX[c] !== r.rate) { COLONY_TAX[c] = r.rate; changed = true; }
    const owner = normalizeColonyWorldOwner(r.owner, c);
    const have = colonyOwnerIds(c);
    if (JSON.stringify(have) !== JSON.stringify(owner)) {
      if (owner.length) COLONY_OWNER[c] = owner; else delete COLONY_OWNER[c];
      changed = true;
    }
  });
  if (changed) {
    saveColonySettings();
    if (typeof renderColonyTax === 'function') renderColonyTax();
    // a plan on screen was costed with the old rates
    if (typeof rerunActivePlan === 'function') rerunActivePlan();
  }
  return changed;
}

// First run against an empty shared file: publish what we have so the guild
// starts from something rather than every member seeding separately.
function seedRemoteColonies() {
  const ops = [];
  colonyList().forEach(c => {
    const rate = typeof COLONY_TAX[c] === 'number' ? COLONY_TAX[c] : 0;
    const owner = COLONY_OWNER[c] || '';
    if (rate || owner) ops.push(colonyOp(c));
  });
  return ops;
}

// ── Energy & cooling ───────────────────────────────────────────────────────
// The in-game panel shows both dials as 0%–100% over 22 notches, and the client
// (costs/calc.txt) does raw += energy * 0.01*30 + cooling * 0.01*20. That 0.01
// is a percent→fraction conversion, so those variables hold the PERCENTAGE, not
// the notch index: full energy adds 30 UC and full cooling 20, for 50 UC a batch
// at max. A flat amount either way, so it dominates a cheap material and barely
// registers on a gun.
// Both in-game dials have twenty one-based levels. A slot cannot be run at
// zero energy, and cooling uses the same level scale rather than an on/off
// exception.
const MAX_LEVEL = 20;
const MIN_ENERGY = 1, MIN_COOLING = 1;
const ENERGY_UC_AT_FULL = 30;
const COOLING_UC_AT_FULL = 20;
// The recommended starting point is five clicks below maximum. Explicit saved
// values still win; missing or malformed fields fall back to these defaults.
const DEFAULT_ENERGY = 15, DEFAULT_COOLING = 15;
let ENERGY_LEVEL = DEFAULT_ENERGY, COOLING_LEVEL = DEFAULT_COOLING;  // notch index; percent is derived

function levelPercent(level) { return level * 100 / MAX_LEVEL; }
// What the two dials add to every batch, at the current settings.
function slotUpkeep() {
  return levelPercent(ENERGY_LEVEL) * 0.01 * ENERGY_UC_AT_FULL +
         levelPercent(COOLING_LEVEL) * 0.01 * COOLING_UC_AT_FULL;
}

(function loadSlotLevels() {
  try {
    const raw = JSON.parse(localStorage.getItem('cmg_slot_levels_v1'));
    if (raw) {
      ENERGY_LEVEL = clampEnergy(raw.energy);
      COOLING_LEVEL = clampCooling(raw.cooling);
    }
  } catch (e) {}
})();
function clampLevel(v, lo, fallback) {
  const n = parseInt(v, 10);
  return Math.max(lo, Math.min(MAX_LEVEL, isNaN(n) ? fallback : n));
}
function clampEnergy(v)  { return clampLevel(v, MIN_ENERGY, DEFAULT_ENERGY); }
function clampCooling(v) { return clampLevel(v, MIN_COOLING, DEFAULT_COOLING); }
function saveSlotLevels() {
  try {
    localStorage.setItem('cmg_slot_levels_v1',
      JSON.stringify({ energy: ENERGY_LEVEL, cooling: COOLING_LEVEL }));
  } catch (e) {}
}

// The cost of ONE batch/unit at a colony, following the client's own order of
// operations. A plain "+tax%" gets this wrong, because a rate ABOVE 10% first
// DISCOUNTS the raw cost — raw -= (rate-10) * raw * 0.25/90 — and tax is then
// charged on the discounted figure. A 50% colony therefore costs about 1.33×,
// not 1.5×, and even 100% only reaches ~1.50×.
//
// Not modelled: the client drifts the cost DOWN over a long session, and
// calc.txt says that drift accumulates "based on heat/effectiveness". Heat is
// not set by the energy dial — it climbs while the slot runs, dragging
// effectiveness down with it, and that is what slows production. (Effectiveness
// is the BAR on the panel; the "100%" printed beside it is the top of the
// scale, not the reading.) So a long hot run is slower but cheaper per unit,
// and what these figures quote is the price of a cold start. Modelling it would
// need the tick count within a session, which the planner cannot know, and
// quoting the drifted price would understate a short run.
// ── Session drift ──────────────────────────────────────────────────────────
// The client lowers the price as a slot keeps running. calc.txt described it;
// a plastic run at Paris on 5 bars confirmed it to the unit — 411, 407, 406,
// 405 … 370 over 31 readings, every one reproduced by this arithmetic.
//
// So a run's cost is NOT unit price x count — but neither is it one long taper.
// A slot takes 100 at a time and the drift resets with each new batch, so the
// saving is capped at whatever a full 100 earns and then repeats.
function driftParams(base, loc) {
  let raw = base + slotUpkeep();
  const rate = (typeof COLONY_TAX[loc] === 'number' ? COLONY_TAX[loc] : 0);
  if (rate > 10) raw -= (rate - 10) * (raw * 0.25 / 90);
  const tax = Math.floor(0.01 * raw * rate);
  const effStart = Math.round(raw);
  const period = 360 / effStart;
  const delay = Math.round(period * period / 4.05);
  // whether the phase-2 step drops one cost unit or two
  const d0  = effStart + Math.floor(0.01 * effStart * rate);
  const dm1 = (effStart - 1) + Math.floor(0.01 * (effStart - 1) * rate);
  return { raw, tax, effStart, delay, ep2Start: effStart - ((d0 - dm1) === 1 ? 2 : 1) };
}

// A slot takes at most 100 RUNS at a time, and the drift resets when the next
// batch starts — so the discount is capped at whatever 100 runs earn.
//
// Runs, not output units, and the difference is easy to get wrong: a medkit
// recipe yields 3, so 300 medkits is 100 runs — one batch, no reset. Whereas
// chemicals yield 1, so the 300 needed for those medkits is 300 runs and does
// split into three. Everything below counts s.batches, which the engine already
// reports as runs.
const MAX_BATCH = 100;

// Cost of one batch of `n` (n <= MAX_BATCH) from a cold start.
function batchCost(p, n) {
  let total = 0;
  for (let i = 0; i < n; i++) {
    const eff = i <= p.delay ? p.effStart : p.ep2Start * (1 - (i - p.delay) / 360);
    // Floor at zero: the linear drift would go negative eventually, which is
    // further than calc.txt models — and the 100 cap means it never gets there.
    total += Math.max(0, Math.trunc(eff)) + p.tax;
  }
  return total;
}

// Cost of `count` items, split into batches of MAX_BATCH.
function runCost(base, loc, count) {
  count = Math.max(0, Math.floor(count || 0));
  if (!count) return 0;
  const p = driftParams(base, loc);
  const whole = Math.floor(count / MAX_BATCH);
  const rest = count % MAX_BATCH;
  return whole * batchCost(p, MAX_BATCH) + (rest ? batchCost(p, rest) : 0);
}

// Colony income is split from mining/production spend BEFORE tax: 85% to the
// colony owner and 15% to the Global Dominion. Tax remains a separate charge.
function preTaxRunCost(base, loc, count) {
  count = Math.max(0, Math.floor(count || 0));
  if (!count) return 0;
  const p = driftParams(base, loc);
  return runCost(base, loc, count) - (p.tax * count);
}

function colonyUnitCost(base, loc) {
  let raw = base + slotUpkeep();
  const rate = (typeof COLONY_TAX[loc] === 'number' ? COLONY_TAX[loc] : 0);
  if (rate > 10) raw -= (rate - 10) * (raw * 0.25 / 90);
  // The two halves round differently, and it matters. The displayed cost is
  // Math.Round(raw) — confirmed against a chem sub at 5 bars of energy, which
  // bills 43 where truncation would have said 42 — while the tax is (int) of
  // the unrounded raw, i.e. truncated.
  const tax = Math.floor(0.01 * raw * rate);
  return { raw, tax, total: Math.round(raw) + tax };
}

// Where a raw material actually gets mined: the site the player pinned, else
// the first one it is available at. Tax follows the mine, not the destination —
// that is the whole point of being able to pick a cheaper site.
function obtainSiteFor(item, info) {
  const from = (info && info.from) || [];
  // OBTAIN_SITE is a var in app.js, so this is safe even before that file runs.
  const picked = typeof OBTAIN_SITE !== 'undefined' && OBTAIN_SITE ? OBTAIN_SITE[item] : null;
  if (picked && from.indexOf(picked) !== -1) return picked;
  if (info?.preferred && from.indexOf(info.preferred) !== -1) return info.preferred;
  return from.length ? from[0] : null;
}

// Cost of a whole production step (batch price × batches), or null if unknown.
// Refining and producing are billed by the colony the plan runs at, and each
// batch is billed separately — so the per-batch rounding happens per batch.
function stepCost(s) {
  const c = costFor(s.item, s.altIndex);
  if (!c || !s.batches) return null;
  return runCost(c.uc, s.location || DESTINATION, s.batches);
}

// Per-UNIT cost of a raw material you have to go and obtain. Separate from the
// batch fees above, and additive: the game bills processing and materials
// apart, which its own drug data shows plainly — an Amyl Nitrate batch consumes
// 1 Chemical Substances and lists processing_cost 56.25 AND chemsub_cost 35.5.
function materialUnitCost(item) {
  const m = window.COSTS && window.COSTS.materials;
  if (!m) return null;
  const v = m[item];
  return typeof v === 'number' ? v : null;
}

// What the materials in the Obtain step will cost to acquire. Each material is
// taxed at ITS OWN mine site, which may not be where the plan is produced.
function acquireCost(plan) {
  // three running totals, because they answer different questions:
  //   base  — the listed price, flat
  //   cold  — what it would cost with tax and upkeep but no drift
  //   total — what it actually costs, drift included
  // Reporting only "total minus base" produced a NEGATIVE "slot upkeep" line on
  // long runs, where the drift saving outweighs the surcharge.
  let base = 0, cold = 0, total = 0, unknown = 0, known = 0, ownSpend = 0, preTaxSpend = 0, taxPart = 0;
  Object.entries(plan.acquire || {}).forEach(([item, info]) => {
    const unit = materialUnitCost(item);
    if (unit == null) { unknown++; return; }
    known++;
    const site = obtainSiteFor(item, info);
    const qty = info.qty || 0;
    // Mining drifts the same way production does — a long dig gets cheaper per
    // unit as the slot warms up.
    const t = runCost(unit, site, qty);
    base += unit * qty;
    cold += colonyUnitCost(unit, site).total * qty;
    total += t;
    taxPart += driftParams(unit, site).tax * qty;
    const preTax = preTaxRunCost(unit, site, qty);
    preTaxSpend += preTax;
    if (site && isOwnColony(site)) ownSpend += preTax;
  });
  // surcharge = what the colony adds (tax + slot upkeep), always measured
  // against the cold price so it stays a surcharge. drift = what the run saves
  // by not paying that cold price on every unit. Two separate lines, because on
  // a long run the second outweighs the first.
  return { base, cold, total, surcharge: cold - base, drift: cold - total,
           taxPart, unknown, known, ownSpend, preTaxSpend };
}

// Total cost of a plan: processing fees + materials to acquire. Reported apart
// so a plan can show a real number for one while the other is still unpriced.
// `dest` is the production colony the plan ran at (fee tax/upkeep follow it,
// and so does the owner-return eligibility). Existing callers pass nothing and
// get the current DESTINATION — the what-if colony comparison passes the
// candidate colony so the SAME plan can be priced somewhere else.
function planCost(plan, dest) {
  const loc = dest || DESTINATION;
  let feeBase = 0, feeCold = 0, total = 0, unknown = 0, feeTax = 0, feePreTax = 0, feeOwnSpend = 0;
  (plan.steps || []).forEach(s => {
    const c = costFor(s.item, s.altIndex);
    if (!c || !s.batches) { unknown++; return; }
    const stepLoc = s.location || loc;
    feeBase += c.uc * s.batches;
    feeCold += colonyUnitCost(c.uc, stepLoc).total * s.batches;
    total += runCost(c.uc, stepLoc, s.batches);
    const preTax = preTaxRunCost(c.uc, stepLoc, s.batches);
    feePreTax += preTax;
    if (isOwnColony(stepLoc)) feeOwnSpend += preTax;
    feeTax += driftParams(c.uc, stepLoc).tax * s.batches;
  });
  const mat = acquireCost(plan);
  // Spend that earns the faction cut: each processing fee follows its step's
  // colony, while materials are charged at whichever site each one is mined on.
  const ownerEligibleSpend = feeOwnSpend + mat.ownSpend;
  const preTaxSpend = feePreTax + mat.preTaxSpend;
  const globalDominion = preTaxSpend * GLOBAL_DOMINION_RATE;
  const grand = total + mat.total;
  const base = feeBase + mat.base;
  const tax = feeTax + mat.taxPart;
  const surcharge = (feeCold - feeBase) + mat.surcharge;

  // How many 100-run batches the plan actually takes, and how many runs — the
  // drift resets on each, so this is what shapes the saving.
  let runs = 0, batches = 0;
  (plan.steps || []).forEach(s => {
    if (!s.batches) return;
    runs += s.batches;
    batches += Math.ceil(s.batches / MAX_BATCH);
  });
  Object.values(plan.acquire || {}).forEach(i => {
    const q = i.qty || 0;
    if (!q) return;
    runs += q;
    batches += Math.ceil(q / MAX_BATCH);
  });

  return {
    total, unknown, known: (plan.steps || []).length - unknown,
    materials: mat.total, materialsUnknown: mat.unknown, materialsKnown: mat.known,
    grand, base,
    surcharge,
    upkeep: surcharge - tax,   // slot upkeep alone, tax stripped out
    tax,
    drift: (feeCold - total) + mat.drift,
    rebate: ownerEligibleSpend * activeFactionReturnRate(),
    ownSpend: ownerEligibleSpend,
    ownerEligibleSpend,
    preTaxSpend,
    globalDominion,
    fdcDominionShare: globalDominion / 2,
    ledDominionShare: globalDominion / 2,
    faction: activeFactionId(),
    returnRate: activeFactionReturnRate(),
    runs, batches,
    anyUnknown: unknown > 0 || mat.unknown > 0
  };
}

// Percentage of a reference figure, blank when the reference is zero.
function pctOf(part, whole) {
  if (!whole) return '';
  return (part / whole * 100).toFixed(1) + '%';
}

// ── Armour weight class ────────────────────────────────────────────────────
// Longest prefix wins, so "Pythica S1" cannot claim "Pythica S2" and the bare
// "PreMet Helmet" cannot be shadowed by "PreMet Buffer".
const ARMOR_FAMILIES = ((window.ARMOR_CLASSES && window.ARMOR_CLASSES.families) || [])
  .slice().sort((a, b) => b.prefix.length - a.prefix.length);

function armorClassOf(item) {
  for (let i = 0; i < ARMOR_FAMILIES.length; i++) {
    if (item.indexOf(ARMOR_FAMILIES[i].prefix) === 0) return ARMOR_FAMILIES[i];
  }
  return null;
}
function armorWeightOf(item) {
  const f = armorClassOf(item);
  return f ? f.weight : null;
}

function _prefixHit(item, list) {
  for (let i = 0; i < list.length; i++) if (item.indexOf(list[i]) === 0) return true;
  return false;
}
const _AC = window.ARMOR_CLASSES || {};
// Not live in the game — never offer it.
function armorNotInGame(item) {
  return _prefixHit(item, (_AC.not_in_game && _AC.not_in_game.prefixes) || []);
}
// Light/heavy genuinely does not apply, as opposed to nobody having told us yet.
function armorClassNA(item) {
  return _prefixHit(item, (_AC.no_class && _AC.no_class.prefixes) || []);
}

// ── What one of something really costs ─────────────────────────────────────
// Plans it from scratch at the current destination, so taxes, mine sites, slot
// levels and the session drift all apply — the same machinery the calculator
// uses, not a second cheaper estimate that could disagree with it.
//
// "net" is what the guild is actually out of pocket: total minus the share that
// returns to faction funds. On a CMG colony that is the number worth comparing,
// because the cheapest piece to buy is often not the cheapest piece to own.
const UNIT_COST_CACHE = {};
function unitCostSignature() {
  return DESTINATION + '|' + REFINE_DESTINATION + '|' + ENERGY_LEVEL + '|' + COOLING_LEVEL + '|' +
         JSON.stringify(COLONY_TAX) + '|' + JSON.stringify(COLONY_OWNER) + '|' +
         JSON.stringify(ALTERNATIVE_CHOICES);
}
function unitCost(item) {
  const sig = unitCostSignature();
  if (UNIT_COST_CACHE._sig !== sig) { for (const k in UNIT_COST_CACHE) delete UNIT_COST_CACHE[k]; UNIT_COST_CACHE._sig = sig; }
  if (UNIT_COST_CACHE[item]) return UNIT_COST_CACHE[item];
  let out;
  try {
    // {} for the ledger = plan from scratch. Comparing pieces has to ignore what
    // happens to be in the locker, or whichever one you already hold "wins".
    const res = compute(item, 1, ALTERNATIVE_CHOICES, {}, null, DESTINATION, null, REFINE_DESTINATION);
    const c = planCost(res.plan);
    // A run cannot be split. Asking for one helmet still runs a batch of three
    // and bills for all three, so the raw plan cost is per RUN. Divide by what
    // the run actually makes — people think in pieces, and a per-run figure
    // beside a single piece's name reads as that piece's price.
    const step = (res.plan.steps || []).find(s => s.item === item);
    const made = Math.max(1, (step && step.produced) || 1);
    const runNet = c.grand - c.rebate;
    out = {
      total: c.grand / made, rebate: c.rebate / made, net: runNet / made,
      runTotal: c.grand, runNet: runNet, perRun: made,
      unknown: c.anyUnknown
    };
  } catch (e) {
    out = { total: null, rebate: 0, net: null, runTotal: null, runNet: null, perRun: 1, unknown: true };
  }
  UNIT_COST_CACHE[item] = out;
  return out;
}

// UC values carry cents; show them only when they exist.
function fmtUC(n) {
  return (Math.round(n * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function stepCard(s, isFinal) {
  const isCurrent = arguments[2] === true;
  const r = DATA.recipes[RECIPES_BY_OUTPUT[s.item][0]._idx];
  let pathNote = '';
  if (r.inputs_alternatives) {
    // The path CONTROL now lives in the top "Refinement paths" panel (it changes
    // upstream material needs, so it belongs above the results). Here we just
    // document which path this step used.
    const chosen = s.altIndex != null ? s.altIndex
      : (ALTERNATIVE_CHOICES[s.item] != null ? ALTERNATIVE_CHOICES[s.item] : 0);
    const chosenDesc = (r.inputs_alternatives[chosen] || r.inputs_alternatives[0])
      .map(x => fmt(x.quantity) + ' ' + esc(x.item)).join(' + ');
    pathNote = `<div class="pathpick pathpick-static">Path: ${chosenDesc} <span class="pathpick-hint">— change at top</span></div>`;
  }
  const inputChips = s.inputs.map(i => {
    const cls = 'need'; // simplified: all inputs are needed (owned already consumed)
    return `<div class="flow-chip input ${cls}">${iconFor(i.item)}<span class="flow-name">${esc(displayName(i.item))}</span><span class="flow-qty">${fmt(i.need)}</span></div>`;
  }).join('<span class="flow-plus">+</span>');

  const surplusNote = s.surplus > 0 ? `<span class="surplus-badge" title="${fmt(s.surplus)} extra will be available after this step">+${fmt(s.surplus)} surplus</span>` : '';
  const mathNote = `<span class="step-math">need ${fmt(s.produced - (s.surplus||0))} → ${fmt(s.batches)} batch${s.batches>1?'es':''} of ${fmt(s.outQty)} → ${fmt(s.produced)}${s.surplus>0?' (+'+fmt(s.surplus)+' extra)':''}</span>`;
  const sc = stepCost(s);
  const batchC = costFor(s.item, s.altIndex);
  const costNote = sc != null
    ? `<div class="step-cost"><b>${fmtUC(sc)} UC</b><span class="step-cost-sub">${fmt(s.batches)} × ${fmtUC(batchC.uc)}</span></div>`
    : `<div class="step-cost unknown" title="This recipe path has no price in the cost data yet">cost unknown</div>`;
  const progressTotal = Math.max(0, Number(s.batches) || 0);
  const progressDone = typeof productionProgressFor === 'function'
    ? productionProgressFor(s.item, progressTotal) : 0;
  const progressRemaining = Math.max(0, progressTotal - progressDone);
  const progressComplete = progressTotal > 0 && progressRemaining === 0 && !!PRODUCE_DONE[encodeURIComponent(s.item)];
  const progressChunk = typeof PRODUCTION_PROGRESS_CHUNK === 'number'
    ? PRODUCTION_PROGRESS_CHUNK : 100;
  const progressNext = Math.min(progressChunk, progressRemaining);
  const progressLabel = progressRemaining === 0
    ? 'All batches recorded'
    : 'Record ' + (progressNext === progressRemaining ? 'final ' : 'next ') +
      fmt(progressNext) + ' batch' + (progressNext === 1 ? '' : 'es');
  const progressHtml = `<div class="production-progress${progressComplete ? ' complete' : ''}">
        <div class="production-progress-head"><span class="production-progress-title">Batch progress</span><span class="production-progress-count" data-progress-count>${fmt(progressDone)} / ${fmt(progressTotal)} batches complete</span><span class="production-progress-remaining" data-progress-remaining>${fmt(progressRemaining)} remaining</span></div>
        <div class="production-progress-track" role="progressbar" aria-label="${esc(displayName(s.item))} batch progress" aria-valuemin="0" aria-valuemax="${progressTotal}" aria-valuenow="${progressDone}"><span class="production-progress-fill" data-progress-fill style="width:${progressTotal ? Math.round(progressDone / progressTotal * 100) : 0}%"></span></div>
        <div class="production-progress-actions">
          <button type="button" class="progress-run" data-progress-run data-progress-item="${encodeURIComponent(s.item)}" data-progress-total="${progressTotal}" data-progress-chunk="${progressChunk}"${progressRemaining === 0 ? ' disabled' : ''}>${progressLabel}</button>
          <button type="button" class="ghost progress-reset" data-progress-reset="${encodeURIComponent(s.item)}" data-progress-total="${progressTotal}"${progressDone === 0 ? ' hidden' : ''}>Reset</button>
        </div>
        <span class="production-progress-note">Local tracker only — the plan totals above stay unchanged.</span>
      </div>`;

  return `<div class="recipe-card ${s.process}${isFinal ? ' compact-manufacture' : ''}${PRODUCE_DONE[encodeURIComponent(s.item)] ? ' done' : ''}${progressComplete ? ' progress-complete' : ''}${isCurrent ? ' current-objective' : ''}" data-current-objective="${isCurrent ? 'true' : 'false'}"${isCurrent ? ' aria-current="step"' : ''}>
      <div class="rc-cb-row">
        <label class="transport-check">
          <input type="checkbox" data-produce-key="${encodeURIComponent(s.item)}" onclick="toggleProduceCheck(this)"${PRODUCE_DONE[encodeURIComponent(s.item)] ? ' checked' : ''} />
          <span class="checkmark"></span>
        </label>
        <span class="rc-cb-label">${esc(displayName(s.item))}</span>
      </div>
      ${pathNote}
      <div class="recipe-flow">
        <div class="flow-inputs">${inputChips}</div>
        <span class="flow-arrow big">➜</span>
        <div class="flow-output">
          <div class="flow-chip output"><span class="proc ${s.process}">${esc(s.process)}</span>${iconFor(s.item)}<span class="flow-name">${esc(displayName(s.item))}</span><span class="flow-qty made">${fmt(s.produced)}</span></div>
          <div class="flow-batches batch-emphasis">${fmt(s.batches)} batch${s.batches > 1 ? 'es' : ''}${surplusNote}</div>
          <div class="step-math">${mathNote}</div>
          ${costNote}
        </div>
      </div>
      ${progressHtml}
    </div>`;
}

// ---- Material requirements dashboard (CSS bar chart) ----
function renderMaterialDashboard(plan) {
  const acq = Object.entries(plan.acquire).sort((a, b) => a[0].localeCompare(b[0]));
  if (!acq.length) return '';

  const totalNeed = acq.reduce((s, [, info]) => s + (info.qty || 0), 0);
  const maxNeed = Math.max(1, ...acq.map(([, info]) => info.qty || 0));
  const rows = acq.map(([name, info]) => {
    const have = INV_TOTAL[name] || 0;
    const need = info.qty || 0;
    const label = displayName(name); // consistent casing (matches the rest of the UI)
    // bar length compares magnitudes across materials; owned segment shows
    // how much of the total demand (have + need) is already covered
    const pct = Math.min(100, Math.max(2, Math.round((need / maxNeed) * 100))) || 2;
    const ownedPct = have > 0 ? Math.round((have / (have + need)) * 100) : 0;

    return `<div class="mat-row">
      <span class="mat-label" title="${esc(label)}">${iconFor(name)}<span class="mat-name">${esc(label)}</span></span>
      <span class="mat-bar-track">
        <span class="mat-bar-fill${have > 0 ? ' has-owned' : ''}" style="width:${pct}%"></span>
        ${ownedPct > 0 ? `<span class="mat-bar-owned" style="width:${Math.min(100, ownedPct)}%" title="${fmt(have)} owned"></span>` : ''}
      </span>
      <span class="mat-numbers">${have > 0 ? `<b>${fmt(have)}</b> / ` : ''}${fmt(need)}</span>
    </div>`;
  }).join('');

  return `<div class="dashboard">
    <div class="dashboard-header">
      <span class="dashboard-title">⚡ Materials Required</span>
      <span class="dashboard-total"><b>${fmt(totalNeed)}</b> total units to acquire</span>
    </div>
    ${rows}
  </div>`;
}

// ---- Cost breakdown: how the listed price becomes the total ----
// The card used to state the total and three loose adjustments, which left the
// obvious question unanswered — what were those adjustments applied TO. This
// shows the arithmetic as a running sum that ends on the headline figure, with
// each line's share of the base beside it.
function costBreakdown(cost, plan) {
  const rows = [];
  const line = (label, val, pct, cls, title) =>
    `<div class="cb-row${cls ? ' ' + cls : ''}"${title ? ` title="${title}"` : ''}>` +
      `<span class="cb-label">${label}</span>` +
      `<span class="cb-val">${val}</span>` +
      `<span class="cb-pct">${pct || ''}</span>` +
    '</div>';

  rows.push(line('listed price', fmtUC(cost.base), '', 'cb-base',
    'The catalogue price of every batch and material, before the colony touches it.'));

  if (cost.upkeep > 0.005) {
    rows.push(line(`slot upkeep · ⚡${ENERGY_LEVEL} energy ❄${COOLING_LEVEL} cooling`,
      '+ ' + fmtUC(cost.upkeep), pctOf(cost.upkeep, cost.base), 'cb-add',
      `${fmtUC(slotUpkeep())} UC per run across ${fmt(cost.runs)} runs. Flat per run, so it weighs most on cheap materials.`));
  }
  if (cost.tax > 0.005) {
    rows.push(line('colony tax', '+ ' + fmtUC(cost.tax), pctOf(cost.tax, cost.base), 'cb-add',
      'Charged by whoever owns the colony. Above 10% it discounts the base first, so the effective rate is lower than the headline.'));
  }
  if (cost.drift > 0.005) {
    rows.push(line(`session drift · ${fmt(cost.batches)} batch${cost.batches === 1 ? '' : 'es'}`,
      '− ' + fmtUC(cost.drift), pctOf(cost.drift, cost.base), 'cb-sub',
      `A slot gets cheaper the longer it runs, resetting every ${MAX_BATCH} runs. ${fmt(cost.runs)} runs across ${fmt(cost.batches)} batch${cost.batches === 1 ? '' : 'es'}.`));
  }
  rows.push(line('total', fmtUC(cost.grand), pctOf(cost.grand, cost.base), 'cb-total',
    'What actually leaves your account.'));
  if (cost.batches > 0 && cost.grand > 0) {
    rows.push(line(`avg per slot-batch · ${fmt(cost.batches)} batch${cost.batches === 1 ? '' : 'es'}`,
      '≈ ' + fmtUC(cost.grand / cost.batches), '', 'cb-unit',
      `${fmtUC(cost.grand)} UC across ${fmt(cost.batches)} slot-batches (drift resets every ${MAX_BATCH} runs) — roughly what one slot run bills at a time.`));
  }

  // per-unit, when the plan has a single headline product
  const finals = (plan.steps || []).filter(s => FINAL_ITEMS.includes(s.item));
  if (finals.length === 1 && finals[0].produced > 0 && !cost.anyUnknown) {
    rows.push(line(`per ${esc(displayName(finals[0].item))}`,
      fmtUC(cost.grand / finals[0].produced), fmt(finals[0].produced) + ' made', 'cb-unit',
      'Total plan cost ÷ units made — every fee, tax and drift saving included. The hero strip above shows this bigger, plus the owner-return net per unit.'));
  }

  if (cost.rebate > 0.005) {
    const factionName = window.factionById?.(cost.faction)?.name || cost.faction;
    const returnPct = Math.round(cost.returnRate * 100);
    rows.push(line(`↩ back to ${esc(factionName)} funds`, fmtUC(cost.rebate), pctOf(cost.rebate, cost.grand), 'cb-back',
      `${returnPct}% of the ${fmtUC(cost.ownSpend)} UC pre-tax mining/production spend on colonies owned by ${esc(factionName)}. Tax is excluded. You still pay the full total — this returns to faction funds, not to you.`));
    rows.push(line('Net faction cost', fmtUC(cost.grand - cost.rebate), pctOf(cost.grand - cost.rebate, cost.grand), 'cb-net',
      'Total minus the configured return to faction funds.'));
  }

  if (cost.globalDominion > 0.005) {
    rows.push(line('Global Dominion share', fmtUC(cost.globalDominion), pctOf(cost.globalDominion, cost.preTaxSpend), 'cb-dominion',
      `15% of pre-tax mining/production spend. Assumed 50/50 allocation: FDC ${fmtUC(cost.fdcDominionShare)} / LED ${fmtUC(cost.ledDominionShare)}. The FDC/LED split is an explicit planning assumption.`));
  }

  return `<div class="cost-breakdown">${rows.join('')}</div>`;
}

// ---- Per-unit pricing table: what ONE unit of each final actually costs ----
// One row per final the plan produces (manufacture steps with produced > 0).
// The numbers come from the PLAN's own ledger — perItemPlanCosts() — not the
// ⚙ path picker's listed-price estimates: every billed processing fee (with
// colony tax, slot upkeep and session drift applied) and every acquired
// material is distributed down the recipe chain to the finals that consume
// it, in proportion to their input demand. Because that distribution is
// exhaustive, the rows add up EXACTLY to the hero strip's Investment and
// net faction cost totals — the table and the headline can never disagree
// (they used to: the table quoted listed fees while the hero quoted the
// drift-discounted actuals, and long runs like 300 medkits diverged).
//   Cost/unit         — this item's share of the plan's real spend, ÷ units
//   Net faction cost/unit — same, minus the faction rebate share on colonies
//                        we own (Cost/unit − 85% of the owned-colony share)
function planRequestedQty(item) {
  try {
    if (typeof CALC_TRAY !== 'undefined' && CALC_TRAY && CALC_TRAY.length) {
      const t = CALC_TRAY.find(x => x.item === item);
      if (t && t.qty) return t.qty;
    }
    if (typeof LAST_SINGLE !== 'undefined' && LAST_SINGLE && LAST_SINGLE.item === item && LAST_SINGLE.qty) {
      return LAST_SINGLE.qty;
    }
  } catch (e) {}
  return null;
}

// Per-item ACTUAL cost attribution from the plan ledger.
// For every step in the plan, the billed fee (runCost: tax, upkeep, drift
// applied, exactly as planCost computes it) plus every acquired material's
// billed cost is split among the steps that consume it, in proportion to
// their input demand (resolvedInputs qty — the plan's single source of
// truth for what each step really consumed). Walking finals' chains down
// yields {total, owned} per final where `owned` is the share spent on
// colonies owned by the active faction (the return base). Invariants, by construction:
//   Σ finals.total        == planCost(plan).grand
//   Σ finals.owned        == planCost(plan).ownSpend
//   Σ (total − rebate×owned) == grand − rebate  (the net faction cost total)
function perItemPlanCosts(plan) {
  // Total input demand per item across all steps (each step's resolvedInputs
  // qty is already per-batch × batches — the full amount that step consumed).
  const demand = {};
  (plan.steps || []).forEach(s => {
    (s.resolvedInputs || s.inputs || []).forEach(inp => {
      demand[inp.item] = (demand[inp.item] || 0) + inp.qty;
    });
  });

  // Billed fee per crafted step (actual, drift-discounted) and its inputs.
  const stepFee = {};
  (plan.steps || []).forEach(s => {
    const c = costFor(s.item, s.altIndex);
    if (!c || !s.batches) return;
    const stepLoc = s.location || DESTINATION;
    const t = runCost(c.uc, stepLoc, s.batches);
    stepFee[s.item] = {
      total: t,
      owned: isOwnColony(stepLoc) ? t : 0,
      inputs: s.resolvedInputs || s.inputs || [],
    };
  });

  // Billed cost per acquired material at its own mine site.
  const rawCost = {};
  Object.entries(plan.acquire || {}).forEach(([item, info]) => {
    const unit = materialUnitCost(item);
    if (unit == null) return;
    const site = obtainSiteFor(item, info);
    const qty = info.qty || 0;
    const t = runCost(unit, site, qty);
    rawCost[item] = { total: t, owned: site && isOwnColony(site) ? t : 0 };
  });

  // costOf(item) = full billed cost of everything that item consumed:
  // its own step fee plus its share of each input's cost. Raws price
  // directly; items with no step and no raw entry were covered by owned
  // stock — the plan never billed them, so they cost 0.
  const memo = {};
  function costOf(item, depth) {
    if (depth > 20) return { total: 0, owned: 0 };
    if (Object.prototype.hasOwnProperty.call(memo, item)) return memo[item];
    const raw = rawCost[item];
    if (raw) return memo[item] = { total: raw.total, owned: raw.owned };
    const st = stepFee[item];
    if (!st) return memo[item] = { total: 0, owned: 0 };
    let total = st.total, owned = st.owned;
    st.inputs.forEach(inp => {
      const d = demand[inp.item];
      if (!d) return;
      const share = inp.qty / d;
      const c = costOf(inp.item, depth + 1);
      total += share * c.total;
      owned += share * c.owned;
    });
    return memo[item] = { total, owned };
  }

  const out = {};
  (plan.steps || []).forEach(s => {
    if (s.type !== 'manufacture' || !s.produced) return;
    out[s.item] = costOf(s.item, 0);
  });
  return out;
}

function renderPerUnitPricing(plan) {
  const finals = (plan.steps || []).filter(s => s.type === 'manufacture' && s.produced > 0);
  if (!finals.length) return '';

  const perItem = perItemPlanCosts(plan);
  const rebatePct = Math.round(activeFactionReturnRate() * 100);
  const factionName = window.factionById?.(activeFactionId())?.name || activeFactionId();
  let anyPriced = false;
  const rows = finals.map(s => {
    const pc = perItem[s.item];
    const total = pc ? pc.total : 0;
    const owned = pc ? pc.owned : 0;
    if (total > 0) anyPriced = true;

    const unit = total / s.produced;
    const netFactionUnit = (total - activeFactionReturnRate() * owned) / s.produced;
    const req = planRequestedQty(s.item);
    const tip = 'One unit of ' + esc(displayName(s.item)) + '\'s share of the plan\'s actual costs — its processing fees (colony tax, slot upkeep and session drift included) plus its materials, allocated down the recipe chain. Rows add up to the Investment and faction cost totals above. Faction figure nets out the ' + rebatePct + '% configured return on colonies owned by ' + factionName + '.';

    return `<tr>
      <td class="up-item" title="${tip}">${iconFor(s.item)}<span>${esc(displayName(s.item))}</span></td>
      <td class="up-num">${req != null ? fmt(req) : '—'}</td>
      <td class="up-num">${fmt(s.produced)}${s.surplus > 0 ? ` <span class="surplus-badge" title="${fmt(s.surplus)} extra from batch rounding">+${fmt(s.surplus)}</span>` : ''}</td>
      <td class="up-num">${fmt(s.batches)}</td>
      <td class="up-num">${total > 0 ? fmtUC(unit) : '<span class="up-na">n/a</span>'}</td>
      <td class="up-num up-net">${total > 0 ? fmtUC(netFactionUnit) : '<span class="up-na">n/a</span>'}</td>
    </tr>`;
  });
  if (!anyPriced) return '';

  // Queued finals the plan did not need to produce (owned stock covered them)
  // — worth telling the user: they cost 0.
  const made = new Set(finals.map(s => s.item));
  let covered = [];
  try {
    if (typeof CALC_TRAY !== 'undefined' && CALC_TRAY && CALC_TRAY.length) {
      covered = CALC_TRAY.map(t => t.item).filter(i => !made.has(i));
    }
  } catch (e) {}

  return `<div class="unit-panel">
    <div class="cost-panel-head">
      <span class="cost-panel-title">Per-unit pricing</span>
      <span class="unit-head-note">one row per item this plan produces</span>
    </div>
    <div class="unit-scroll">
      <table class="unit-table">
        <caption class="sr-only">Per-unit pricing — one row per item this plan produces</caption>
        <thead><tr>
          <th scope="col" class="up-item">Item</th>
          <th scope="col" class="up-num">Req</th>
          <th scope="col" class="up-num">Made</th>
          <th scope="col" class="up-num">Batches</th>
          <th scope="col" class="up-num">Cost/unit</th>
          <th scope="col" class="up-num">Net faction cost/unit</th>
        </tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>
    <div class="unit-note">Per-unit = this item's share of the plan's actual costs — processing fees with colony tax, slot upkeep and session drift included, plus materials — allocated by recipe demand, so rows add up to the Investment and Net faction cost totals above.${covered.length
      ? ` ${covered.length} queued item${covered.length > 1 ? 's' : ''} fully covered by owned stock — nothing to produce.` : ''} Prices are a snapshot — verify live in-game.</div>
  </div>`;
}

// ---- Headline figures: what matters most when planning a run ----
// Three numbers, biggest first: the upfront investment, the cost per unit
// produced, and what each unit really costs the active faction after the faction
// rebate comes back. The rest of the cost panel is the arithmetic behind
// them. "Units produced" counts the plan's manufacture output (surplus from
// batch rounding included).
function costHero(cost, totalProduced, gaps, finalCount) {
  const net = cost.grand - cost.rebate;
  const factionName = window.factionById?.(cost.faction || activeFactionId())?.name || cost.faction || activeFactionId();
  const unknownNote = cost.anyUnknown
    ? ' · ' + gaps.join(' + ') + ' unpriced'
    : '';
  const avgNote = finalCount > 1 ? `avg of ${finalCount} items · ` : '';
  return `<div class="cost-hero">
    <div class="cost-hero-block cost-hero-invest" title="What actually leaves your account up front — processing fees + materials, colony tax and slot upkeep included${unknownNote}.">
      <span class="cost-hero-label">Investment</span>
      <span class="cost-hero-value">${fmtUC(cost.grand)}${cost.anyUnknown ? ' <span class="cost-panel-unknown">+</span>' : ''}</span>
      <span class="cost-hero-sub">fees + materials · tax &amp; drift in${unknownNote}</span>
    </div>
    <div class="cost-hero-block" title="Total plan cost ÷ units produced (batch surplus included). With more than one item in the plan this is the average across them, weighted by units made.">
      <span class="cost-hero-label">Cost / unit</span>
      <span class="cost-hero-value">${totalProduced > 0 ? fmtUC(cost.grand / totalProduced) : '—'}</span>
      <span class="cost-hero-sub">${avgNote}${totalProduced > 0 ? fmt(totalProduced) + ' units made' : 'nothing produced'}</span>
    </div>
    <div class="cost-hero-block cost-hero-net" title="${Math.round(activeFactionReturnRate() * 100)}% of eligible spend at colonies owned by ${esc(factionName)} returns to faction funds — this is the cost to that faction. With more than one item in the plan this is the average across them, weighted by units made.">
      <span class="cost-hero-label">Net faction cost / unit</span>
      <span class="cost-hero-value">${totalProduced > 0 ? fmtUC(net / totalProduced) : '—'}</span>
      <span class="cost-hero-sub">${avgNote}${activeFactionReturnRate() > 0 ? `after ${Math.round(activeFactionReturnRate() * 100)}% return` : 'no configured faction return'}</span>
    </div>
  </div>`;
}

// ---- Plan stats summary: KPI strip + cost panel ----
// The old design put every number in one stretched flex row; the cost card
// carried the whole breakdown so the four one-line cards grew to its height
// and sat mostly empty. Now the four counts are compact KPI tiles and the
// cost breakdown gets a full-width panel of its own.
function renderPlanStats(plan) {
  const totalAcquire = Object.values(plan.acquire).reduce((s, i) => s + i.qty, 0);
  const rawCount = Object.keys(plan.acquire).length;
  const refineCount = plan.refine.length;
  const mfgCount = plan.manufacture.length;
  const surplusTotal = Object.values(plan.surplus).reduce((s, v) => s + v, 0);
  const cost = planCost(plan);

  const tiles = [
    { cls: 'acq', icon: '⛏', val: fmt(totalAcquire), label: 'units to acquire' },
    { cls: 'mat', icon: '⚗', val: fmt(rawCount), label: 'raw materials' },
    { cls: 'stp', icon: '⚙', val: fmt(refineCount + mfgCount), label: 'production steps' }
  ];
  if (surplusTotal > 0) tiles.push({ cls: 'spl', icon: '＋', val: '+' + fmt(surplusTotal), label: 'batch surplus' });

  const kpiHtml = `<div class="kpi-strip">${tiles.map((t, i) =>
    `<div class="kpi-tile kpi-${t.cls} stagger-${i}">
      <span class="kpi-icon">${t.icon}</span>
      <span class="kpi-value">${t.val}</span>
      <span class="kpi-label">${t.label}</span>
    </div>`).join('')}</div>`;

  // Only claim a complete figure when nothing is missing — a partial sum reads
  // as the full cost and would understate the run. The breakdown line makes it
  // clear the number is fees + materials, which are billed separately.
  const gaps = [];
  if (cost.unknown) gaps.push(`${cost.unknown} step${cost.unknown > 1 ? 's' : ''}`);
  if (cost.materialsUnknown) gaps.push(`${cost.materialsUnknown} material${cost.materialsUnknown > 1 ? 's' : ''}`);
  if (cost.known === 0 && cost.materialsKnown === 0) return kpiHtml;

  const feesPct = pctOf(cost.total, cost.grand);
  const matsPct = pctOf(cost.materials, cost.grand);
  const splitBar = (cost.total > 0 || cost.materials > 0) ? `
    <div class="cost-split">
      <span class="cost-split-bar">
        <span class="cost-split-seg fees" style="width:${Math.max(2, parseFloat(feesPct))}%"></span>
        <span class="cost-split-seg mats" style="width:${Math.max(2, parseFloat(matsPct))}%"></span>
      </span>
      <span class="cost-split-legend">
        <span>${fmtUC(cost.total)} fees (${feesPct})</span>
        <span>${fmtUC(cost.materials)} materials (${matsPct})</span>
      </span>
    </div>` : '';

  // Headline figures are per-unit of what the plan actually produces
  // (manufacture output, batch surplus included). With multiple finals the
  // figures are plan-wide averages — the hero sub-labels say so.
  const finals = (plan.steps || []).filter(s => s.type === 'manufacture' && s.produced > 0);
  const totalProduced = finals.reduce((s, x) => s + x.produced, 0);
  const finalCount = finals.length;

  const costPanel = `
    <div class="cost-panel stagger-4">
      ${costHero(cost, totalProduced, gaps, finalCount)}
      ${splitBar}
      ${costBreakdown(cost, plan)}
    </div>`;

  return `<div class="plan-top">${kpiHtml}${costPanel}${renderPerUnitPricing(plan)}</div>`;
}

// ── Show the math: player-readable walkthrough of the plan's arithmetic ──
// The cost panel states the numbers; this disclosure spells out how each one
// is derived, in plain language, using ONLY the values the plan and planCost
// already computed — no new fields, no changed semantics. It is a native
// <details>/<summary> disclosure so keyboard and screen-reader users get the
// same path as everyone else. Covers recipe time (slot runs, which is how the
// game measures duration — it publishes no wall-clock time), material totals,
// fees & tax, colony/transport adjustments, and the three headline figures.
function showTheMathPanel(plan) {
  const cost = planCost(plan);
  const steps = (plan && plan.steps) || [];
  const acquire = Object.entries((plan && plan.acquire) || {});
  const transport = Object.entries((plan && plan.transport) || {});
  const finals = steps.filter(s => s.type === 'manufacture' && s.produced > 0);
  const totalProduced = finals.reduce((s, x) => s + x.produced, 0);
  const finalCount = finals.length;
  const factionName = window.factionById?.(cost.faction || activeFactionId())?.name || cost.faction || activeFactionId();
  const returnPct = Math.round(cost.returnRate * 100);
  const unknownNote = cost.anyUnknown
    ? '<div class="show-math-unknown">Some recipe paths or materials have no price in the cost data yet, so the figures below cover only what is priced — they are partial.</div>'
    : '';

  const line = (label, value, note) =>
    `<div class="show-math-line"><span class="show-math-line-label">${label}</span>` +
    (note ? `<span class="show-math-line-note">${note}</span>` : '') +
    `<span class="show-math-line-val">${value}</span></div>`;

  // ---- 1) Recipe time — how long the slots run ----
  let timeRows = '';
  steps.forEach(s => {
    if (!s.batches) return;
    const need = s.produced - (s.surplus || 0);
    timeRows += `<div class="show-math-step"><span class="show-math-step-name">${esc(displayName(s.item))}</span>` +
      `<span class="show-math-step-math">need ${fmt(need)} → ${fmt(s.batches)} run${s.batches > 1 ? 's' : ''} of ${fmt(s.outQty)} → ${fmt(s.produced)} made${s.surplus > 0 ? ' (+' + fmt(s.surplus) + ' surplus)' : ''}</span></div>`;
  });
  acquire.forEach(([item, info]) => {
    if (!(info.qty > 0)) return;
    timeRows += `<div class="show-math-step"><span class="show-math-step-name">${esc(displayName(item))}</span>` +
      `<span class="show-math-step-math">mine ${fmt(info.qty)} run${info.qty > 1 ? 's' : ''}</span></div>`;
  });

  // ---- 2) Material totals ----
  const totalAcquire = acquire.reduce((s, [, info]) => s + (info.qty || 0), 0);
  let matRows = '';
  acquire.forEach(([item, info]) => {
    const qty = info.qty || 0;
    const unit = materialUnitCost(item);
    const site = obtainSiteFor(item, info);
    if (unit == null) {
      matRows += line(esc(displayName(item)), fmt(qty) + ' unit' + (qty === 1 ? '' : 's'), 'no price data yet — billed cost unknown');
      return;
    }
    const billed = runCost(unit, site, qty);
    matRows += line(esc(displayName(item)), fmt(qty) + ' × ' + fmtUC(unit) + ' → ' + fmtUC(billed) + ' UC',
      'mined at ' + esc(site || 'an unknown site') + ' — tax and drift applied');
  });

  // ---- 3) Fees & tax ----
  let feeRows = '';
  steps.forEach(s => {
    const c = costFor(s.item, s.altIndex);
    if (!c || !s.batches) return;
    const billed = stepCost(s);
    feeRows += line(esc(displayName(s.item)), fmt(s.batches) + ' × ' + fmtUC(c.uc) + ' → ' + fmtUC(billed) + ' UC',
      'per-run fee billed at ' + esc(s.location || DESTINATION) + ' — tax, slot upkeep and drift applied');
  });
  if (cost.upkeep > 0.005) {
    feeRows += line('slot upkeep', '+ ' + fmtUC(cost.upkeep) + ' UC', '⚡' + ENERGY_LEVEL + ' energy · ❄' + COOLING_LEVEL + ' cooling, per run');
  }
  if (cost.tax > 0.005) {
    feeRows += line('colony tax', '+ ' + fmtUC(cost.tax) + ' UC', 'charged at each processing colony');
  }
  if (cost.drift > 0.005) {
    feeRows += line('session drift', '− ' + fmtUC(cost.drift) + ' UC', 'long-run discount across ' + fmt(cost.batches) + ' slot-batch' + (cost.batches === 1 ? '' : 'es'));
  }

  // ---- 4) Colony & transport adjustments ----
  let adjRows = '';
  transport.forEach(([item, info]) => {
    (info.from || []).forEach(col => {
      const qty = (info.fromQty && info.fromQty[col]) || 0;
      if (!qty) return;
      adjRows += line(esc(displayName(item)), 'move ' + fmt(qty) + ' → ' + esc(info.to || REFINE_DESTINATION || DESTINATION), 'from ' + esc(col));
    });
  });
  Object.entries((plan && plan.finalTransport) || {}).forEach(([item, qty]) => {
    adjRows += line(esc(displayName(item)), 'move ' + fmt(qty) + ' → ' + esc(plan.destination || DESTINATION),
      'from ' + esc(plan.refineDestination || REFINE_DESTINATION || DESTINATION) + ' after refinement');
  });
  if (cost.rebate > 0.005) {
    adjRows += line('faction return', fmtUC(cost.rebate) + ' UC back to ' + esc(factionName),
      returnPct + '% of the ' + fmtUC(cost.ownSpend) + ' UC pre-tax spend on colonies owned by ' + esc(factionName));
  }
  if (cost.globalDominion > 0.005) {
    adjRows += line('Global Dominion share', fmtUC(cost.globalDominion) + ' UC',
      '15% of the ' + fmtUC(cost.preTaxSpend) + ' UC pre-tax spend · FDC ' + fmtUC(cost.fdcDominionShare) + ' / LED ' + fmtUC(cost.ledDominionShare));
  }

  // ---- 5–7) Headline figures ----
  const invRow = line('Investment', fmtUC(cost.grand) + ' UC',
    'fees ' + fmtUC(cost.total) + ' + materials ' + fmtUC(cost.materials));
  let unitRow = '';
  if (totalProduced > 0) {
    unitRow = line('Cost per unit', fmtUC(cost.grand / totalProduced) + ' UC',
      'Investment ÷ ' + fmt(totalProduced) + ' unit' + (totalProduced === 1 ? '' : 's') +
      (finalCount > 1 ? ' (' + finalCount + ' items, weighted by units made)' : ''));
  }
  let factionRow = '';
  if (totalProduced > 0) {
    const net = cost.grand - cost.rebate;
    factionRow = line('Net faction cost per unit', fmtUC(net / totalProduced) + ' UC',
      returnPct > 0
        ? '(' + fmtUC(cost.grand) + ' − ' + fmtUC(cost.rebate) + ' rebate) ÷ ' + fmt(totalProduced) + ' unit' + (totalProduced === 1 ? '' : 's')
        : 'same as cost per unit — no faction return configured');
  }

  return `<details class="show-math" data-show-math>
    <summary>Show the math</summary>
    <div class="show-math-body">
      ${unknownNote}
      <section class="show-math-section">
        <h4 class="show-math-title">Recipe time — how long the slots run</h4>
        <p class="show-math-summary">${fmt(cost.runs)} run${cost.runs === 1 ? '' : 's'} across ${fmt(cost.batches)} slot-batch${cost.batches === 1 ? '' : 'es'}. One run is one batch at a slot; the long-run discount resets every ${MAX_BATCH} runs. The game does not publish wall-clock durations, so this is measured in slot runs.</p>
        ${timeRows || '<p class="muted">No production runs in this plan.</p>'}
      </section>
      <section class="show-math-section">
        <h4 class="show-math-title">Material totals</h4>
        <p class="show-math-summary">${fmt(totalAcquire)} unit${totalAcquire === 1 ? '' : 's'} to obtain across ${acquire.length} material${acquire.length === 1 ? '' : 's'}, billed at each material's own mine site — tax follows the mine, not the destination.</p>
        ${matRows || '<p class="muted">No materials to obtain — owned stock covers the plan.</p>'}
      </section>
      <section class="show-math-section">
        <h4 class="show-math-title">Fees and tax</h4>
        <p class="show-math-summary">Refinement fees are billed per run at ${esc(plan.refineDestination || REFINE_DESTINATION || DESTINATION)} and final manufacturing at ${esc(plan.destination || DESTINATION)}, with colony tax, slot upkeep and the long-run drift discount applied per batch.</p>
        ${feeRows || '<p class="muted">No priced processing fees in this plan.</p>'}
      </section>
      <section class="show-math-section">
        <h4 class="show-math-title">Colony and transport adjustments</h4>
        ${adjRows || '<p class="muted">No colony or transport adjustments apply to this plan.</p>'}
      </section>
      <section class="show-math-section show-math-headlines">
        <h4 class="show-math-title">Headline figures</h4>
        ${invRow}
        ${unitRow}
        ${factionRow}
      </section>
      <p class="show-math-foot muted">Figures match the cost panel. Prices are bundled snapshots; verify live in-game.</p>
    </div>
  </details>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// DECISION SUMMARY — player-readable tradeoffs from the plan's own numbers
// ═══════════════════════════════════════════════════════════════════════════
// The cost panel states figures; this disclosure turns them into the choices
// they imply, using ONLY values planCost/netPathCost already compute — no new
// fields, no changed semantics, no invented rankings:
//   * up-front investment, cost/unit and net faction cost per unit are exactly the
//     hero strip's numbers (they must never diverge),
//   * the cheapest refinement path is the same netPathCost estimate the ⚙ path
//     picker shows, so the ★ here can never contradict the ★ there,
//   * speed is labelled honestly: the game publishes no craft durations, so
//     slot runs are the only honest measure — and unavailable metrics are
//     called out instead of guessed.
function decisionSummary(plan) {
  const cost = planCost(plan);
  const steps = (plan && plan.steps) || [];
  const finals = steps.filter(s => s.type === 'manufacture' && s.produced > 0);
  const produced = finals.reduce((s, x) => s + x.produced, 0);
  const finalCount = finals.length;
  const factionName = window.factionById?.(cost.faction || activeFactionId())?.name || cost.faction || activeFactionId();
  const returnPct = Math.round(cost.returnRate * 100);
  const unknownNote = cost.anyUnknown
    ? '<div class="decision-unknown">Some recipe paths or materials have no price in the cost data yet, so the figures below cover only what is priced — they are partial.</div>'
    : '';
  const line = (label, value, note) =>
    `<div class="decision-line"><span class="decision-line-label">${label}</span>` +
    (note ? `<span class="decision-line-note">${note}</span>` : '') +
    `<span class="decision-line-val">${value}</span></div>`;

  let rows = '';
  rows += line('Up-front investment', fmtUC(cost.grand) + ' UC',
    'fees ' + fmtUC(cost.total) + ' + materials ' + fmtUC(cost.materials) + ' — what leaves your account today');
  if (produced > 0) {
    rows += line('Cost per unit', fmtUC(cost.grand / produced) + ' UC',
      'Investment ÷ ' + fmt(produced) + ' unit' + (produced === 1 ? '' : 's') +
      (finalCount > 1 ? ' (' + finalCount + ' items, weighted by units made)' : ''));
    const net = cost.grand - cost.rebate;
    rows += line('Net faction cost per unit', fmtUC(net / produced) + ' UC',
      returnPct > 0
        ? 'after the ' + returnPct + '% return to ' + esc(factionName) + ' funds — what the faction is really out of pocket'
        : 'no configured faction return — same as cost per unit');
  }

  // Cheapest refinement path: one line per step whose recipe has alternative
  // input sets. The estimate is the same netPathCost the ⚙ path picker uses,
  // so the ★ can never disagree with the picker's.
  const altSteps = steps.filter(s => {
    const recs = RECIPES_BY_OUTPUT[s.item];
    if (!recs || !recs.length) return false;
    const r = DATA.recipes[recs[0]._idx];
    return !!(r.inputs_alternatives && r.inputs_alternatives.length > 1);
  });
  if (altSteps.length) {
    altSteps.forEach(s => {
      const recs = RECIPES_BY_OUTPUT[s.item];
      const r = DATA.recipes[recs[0]._idx];
      const used = s.altIndex != null ? s.altIndex
        : (ALTERNATIVE_CHOICES[s.item] != null ? ALTERNATIVE_CHOICES[s.item] : 0);
      const usedDesc = (r.inputs_alternatives[used] || r.inputs_alternatives[0] || [])
        .map(x => fmt(x.quantity) + ' ' + esc(x.item)).join(' + ');
      const costs = r.inputs_alternatives.map((a, i) =>
        window.ENGINE.netPathCost ? window.ENGINE.netPathCost(s.item, i, s.location || REFINE_DESTINATION || DESTINATION, {}, 0) : null);
      const priced = costs.some(c => c != null);
      let note;
      if (priced) {
        let best = 0;
        for (let i = 1; i < costs.length; i++) {
          if (costs[i] != null && (costs[best] == null || costs[i] < costs[best])) best = i;
        }
        const usedCost = costs[used];
        if (usedCost != null && used === best) {
          note = '≈ ' + fmtUC(costs[best]) + ' UC/unit · ★ cheapest priced path — the plan uses it';
        } else if (usedCost != null) {
          note = '≈ ' + fmtUC(costs[best]) + ' UC/unit · the cheapest priced path is another one';
        } else {
          note = '≈ ' + fmtUC(costs[best]) + ' UC/unit cheapest — the path this plan uses has no price data yet';
        }
      } else {
        note = 'no price data for any path — cheapest not ranked';
      }
      rows += line('Cheapest refinement path · ' + esc(displayName(s.item)), usedDesc, note);
    });
  } else {
    rows += line('Cheapest refinement path', '—', 'no alternative paths in this plan — the recipe set is fixed');
  }

  rows += line('Speed', fmt(cost.runs) + ' slot run' + (cost.runs === 1 ? '' : 's') + ' · ' +
    fmt(cost.batches) + ' slot-batch' + (cost.batches === 1 ? '' : 'es'),
    'No wall-clock craft time is published; fewer slot runs means a shorter run.');

  return `<details class="decision-summary" data-decision-summary>
    <summary>Decision summary</summary>
    <div class="decision-summary-body">
      ${unknownNote}
      ${rows}
      <p class="decision-foot muted">Same calculation as the cost panel. Prices are bundled snapshots; verify live in-game.</p>
    </div>
  </details>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// COLONY WHAT-IF — the same plan recomputed at every production colony
// ═══════════════════════════════════════════════════════════════════════════
// A lightweight "what if this ran elsewhere?" comparison. Each candidate
// destination is fed through the ENGINE'S OWN compute()/planCost() with the
// plan's real inputs (stock, chosen paths, discounts) — only the destination
// changes, so colony tax, ownership rebates, mine sites and transport all
// follow the candidate exactly as the calculator would price it. Nothing is
// ranked that the data cannot back: rows with unpriced items show n/a, and
// ★ cheapest is awarded only to a UNIQUE cheapest fully-priced colony.
// spec = { items: [{item, qty}], chosen, ledger, invLoc, discounts, dest, refineDest }
function colonyCompareRows(spec) {
  const dest = (spec && spec.dest) || DESTINATION;
  const refineDest = (spec && spec.refineDest) || REFINE_DESTINATION || dest;
  const items = (spec && spec.items) || [];
  if (!items.length) return [];
  const chosen = (spec && spec.chosen) || {};
  const ledger = (spec && spec.ledger) || {};
  const invLoc = (spec && spec.invLoc) || null;
  const discounts = (spec && spec.discounts) || { prod: 0, mine: 0, trans: 0 };

  const computed = colonyList().map(colony => {
    let res, cost;
    try {
      res = compute(items, chosen, Object.assign({}, ledger), invLoc, colony, discounts, refineDest);
      cost = planCost(res.plan, colony);
    } catch (e) {
      return {
        colony, tax: typeof COLONY_TAX[colony] === 'number' ? COLONY_TAX[colony] : 0,
        owners: colonyOwnerIds(colony), owned: isOwnColony(colony),
        investment: null, perUnit: null, netFactionUnit: null,
        unknown: true, produced: 0, runs: 0, batches: 0, here: colony === dest,
      };
    }
    const finals = (res.plan.steps || []).filter(s => s.type === 'manufacture' && s.produced > 0);
    const made = finals.reduce((s, x) => s + x.produced, 0);
    const priced = !cost.anyUnknown && made > 0;
    return {
      colony, tax: typeof COLONY_TAX[colony] === 'number' ? COLONY_TAX[colony] : 0,
      owners: colonyOwnerIds(colony), owned: isOwnColony(colony),
      investment: priced ? cost.grand : null,
      perUnit: priced ? cost.grand / made : null,
      netFactionUnit: priced ? (cost.grand - cost.rebate) / made : null,
      unknown: cost.anyUnknown, produced: made,
      runs: cost.runs, batches: cost.batches, here: colony === dest,
    };
  });

  // Delta vs the current destination, and the ★: a unique cheapest among the
  // fully priced rows. A flat world (all equal) or a tied minimum gets NO ★ —
  // claiming a cheapest that isn't one would be an invented ranking.
  const hereRow = computed.find(r => r.here);
  const hereFaction = hereRow && hereRow.netFactionUnit != null ? hereRow.netFactionUnit : null;
  computed.forEach(r => {
    // A delta against itself is meaningless — the here row's cell shows —.
    r.delta = r.here ? null : (r.netFactionUnit != null && hereFaction != null ? r.netFactionUnit - hereFaction : null);
    r.cheapest = false;
  });
  const pricedRows = computed.filter(r => r.netFactionUnit != null);
  if (pricedRows.length >= 2) {
    const distinct = [...new Set(pricedRows.map(r => r.netFactionUnit))].sort((a, b) => a - b);
    if (distinct.length >= 2) {
      const minVal = distinct[0];
      const minRows = pricedRows.filter(r => r.netFactionUnit === minVal);
      if (minRows.length === 1) minRows[0].cheapest = true;
    }
  }

  // Current destination first, then priced rows cheapest-first, then unpriced
  // rows alphabetically — a sort of derived numbers, never a made-up ranking.
  const order = r => r.here ? 0 : (r.netFactionUnit != null ? 1 : 2);
  computed.sort((a, b) =>
    order(a) - order(b) ||
    (a.netFactionUnit != null && b.netFactionUnit != null ? a.netFactionUnit - b.netFactionUnit : a.colony.localeCompare(b.colony)));
  return computed;
}

function renderColonyCompare(spec) {
  const rows = colonyCompareRows(spec);
  if (!rows.length) return '';
  const anyPriced = rows.some(r => r.netFactionUnit != null);
  const pricedCount = rows.filter(r => r.netFactionUnit != null).length;

  const ownerLabel = ids => ids.length
    ? ids.map(id => esc(window.factionById?.(id)?.name || id)).join(' + ')
    : '<span class="cc-na">—</span>';
  const rowHtml = rows.map(r => {
    const deltaCell = r.delta != null && Math.abs(r.delta) > 0.0001
      ? `<span class="cc-delta ${r.delta < 0 ? 'better' : 'worse'}">${r.delta < 0 ? '−' : '+'}${fmtUC(Math.abs(r.delta))}</span>`
      : (r.here ? '<span class="cc-na">—</span>' : '<span class="cc-na">same</span>');
    return `<tr${r.here ? ' class="cc-here"' : ''}>
      <td class="cc-colony">${r.here ? '<span class="cc-here-tag">here</span> ' : ''}${esc(r.colony)}${r.cheapest ? ' <span class="cc-star" title="Cheapest net faction cost per unit">★</span>' : ''}</td>
      <td class="cc-num">${r.tax}%</td>
      <td class="cc-owner">${ownerLabel(r.owners)}</td>
      <td class="cc-num">${r.investment != null ? fmtUC(r.investment) : '<span class="cc-na">n/a</span>'}</td>
      <td class="cc-num">${r.perUnit != null ? fmtUC(r.perUnit) : '<span class="cc-na">n/a</span>'}</td>
      <td class="cc-num cc-faction">${r.netFactionUnit != null ? fmtUC(r.netFactionUnit) : '<span class="cc-na">n/a</span>'}</td>
      <td class="cc-num">${deltaCell}</td>
      <td class="cc-action">${r.here ? '' : `<button type="button" class="ghost cc-plan" data-whatif-plan="${encodeURIComponent(r.colony)}">Plan here</button>`}</td>
    </tr>`;
  }).join('');

  const gapNote = anyPriced && pricedCount < rows.length
    ? ' <span class="cc-gap">Some colonies are not fully priced (n/a) — cheapest is ranked among priced ones only.</span>'
    : '';
  const noPriceNote = !anyPriced
    ? '<div class="cc-noprice">Price data is unavailable for this plan — the cheapest colony cannot be ranked.</div>'
    : '';

  return `<details class="colony-compare" data-colony-compare>
    <summary>Compare colonies — what if this ran elsewhere?</summary>
    <div class="colony-compare-body">
      <p class="colony-compare-intro muted">Same stock and paths; only the production colony changes. Tax, ownership, mines, and transport are recalculated.</p>
      ${noPriceNote}
      <div class="unit-scroll">
        <table class="unit-table colony-compare-table">
          <caption class="sr-only">Colony comparison — investment, cost per unit and net faction cost per unit at each production colony</caption>
          <thead><tr>
            <th scope="col">Colony</th>
            <th scope="col" class="cc-num">Tax</th>
            <th scope="col">Owner</th>
            <th scope="col" class="cc-num">Investment</th>
            <th scope="col" class="cc-num">Cost/unit</th>
            <th scope="col" class="cc-num">Net faction cost/unit</th>
            <th scope="col" class="cc-num">vs here</th>
            <th scope="col"><span class="sr-only">Action</span></th>
          </tr></thead>
          <tbody>${rowHtml}</tbody>
        </table>
      </div>
      <p class="unit-note">★ = cheapest net faction cost per unit among fully priced colonies · “here” is your current production colony · vs here is net faction cost/unit minus this colony's · Plan here re-runs the whole plan at that colony (transport, mine sites, tax and the owner return all follow). Prices are a snapshot — verify live in-game.${gapNote}</p>
    </div>
  </details>`;
}



// ---- Progressive feature flags ----
// Staged UI changes stay opt-in until their parity and rollout checks pass.
const CMG_FEATURE_FLAG_DEFAULTS = Object.freeze({
  layout_v2: false,
  motion_v2: false,
  r3f_v1: false,
});
const CMG_FEATURE_FLAG_STORAGE = 'cmg_feature_flags_v1';

function readCMGFeatureFlags(storage) {
  const flags = { ...CMG_FEATURE_FLAG_DEFAULTS };
  try {
    const raw = (storage || window.localStorage).getItem(CMG_FEATURE_FLAG_STORAGE);
    if (!raw) return flags;
    const saved = JSON.parse(raw);
    Object.keys(flags).forEach(name => {
      if (typeof saved?.[name] === 'boolean') flags[name] = saved[name];
    });
  } catch (e) {}
  return flags;
}

function reflectCMGFeatureFlags(flags) {
  const root = document.documentElement;
  root.dataset.cmgLayoutV2 = flags.layout_v2 ? 'on' : 'off';
  root.dataset.cmgMotionV2 = flags.motion_v2 ? 'on' : 'off';
  root.dataset.cmgR3fV1 = flags.r3f_v1 ? 'on' : 'off';
  window.CMG_FEATURE_FLAGS = Object.freeze({ ...flags });
  return window.CMG_FEATURE_FLAGS;
}

function persistCMGFeatureFlags(flags) {
  try { window.localStorage.setItem(CMG_FEATURE_FLAG_STORAGE, JSON.stringify(flags)); } catch (e) {}
}

function setCMGFeatureFlag(name, enabled) {
  if (!Object.prototype.hasOwnProperty.call(CMG_FEATURE_FLAG_DEFAULTS, name) || typeof enabled !== 'boolean') return false;
  const flags = { ...readCMGFeatureFlags(), [name]: enabled };
  persistCMGFeatureFlags(flags);
  reflectCMGFeatureFlags(flags);
  return true;
}

const CMG_FEATURE_FLAGS = reflectCMGFeatureFlags(readCMGFeatureFlags());
window.setCMGFeatureFlag = setCMGFeatureFlag;

// ---- Navigation manifest ----
const CMG_NAV_GROUPS = Object.freeze({
  workflows: Object.freeze(['calc', 'inventory', 'gear']),
  operations: Object.freeze(['colonies', 'battle', 'models']),
  reference: Object.freeze(['drugs']),
  culture: Object.freeze(['community']),
});
window.CMG_NAV_GROUPS = CMG_NAV_GROUPS;

// ---- Tabs ----
function setView(v) {
  if (!hasCompletePlayerProfile() && v !== 'calc') {
    setView._pendingProfileView = v;
    v = 'calc';
    syncProfileGateState();
    if (typeof toast === 'function') toast('Finish your player name and faction before opening another tab.', 3500);
  }
  const prev = setView._prev;
  const applyView = () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
    document.querySelectorAll('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
    document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.view === v)));


    // Run registered hooks
    VIEW_HOOKS.forEach(function(h) {
      if (prev && h.leave) h.leave(prev);
      if (h.enter) h.enter(v);
      if (h.once && h._fired) return;
      if (h.view === v || h.views && h.views.indexOf(v) !== -1) {
        if (h.once) h._fired = true;
        if (h.fn) h.fn();
      }
    });
    setView._prev = v;
    if (typeof window.syncCMGNavV2 === 'function') window.syncCMGNavV2(v);
    if (prev && prev !== v) playTerminalAudio(v);
  };

  const from = prev && document.getElementById('view-' + prev);
  const to = document.getElementById('view-' + v);
  const useMotion = window.CMG_FEATURE_FLAGS?.motion_v2 &&
    typeof window.runCMGViewTransition === 'function' && prev !== v;
  if (useMotion) window.runCMGViewTransition(applyView, { from, to });
  else applyView();
}
setView._prev = null;
setView._pendingProfileView = null;

// Hook registry — call registerViewHook({view, fn, once, enter, leave, views})
var VIEW_HOOKS = [];
function registerViewHook(opts) { VIEW_HOOKS.push(opts); }


// ═══════════════════════════════════════════════════════════════════════════
// § THEME — semantic accessibility, identity, and faction palettes
// ═══════════════════════════════════════════════════════════════════════════
const THEME_KEY = 'cmg_theme';
const SIZE_KEY = 'cmg_size';
const VALID_THEMES = new Set(['auto', 'dark', 'light', 'trans', 'pride', 'bos', 'cmg', 'ec', 'fdc', 'gom', 'led', 'motb', 'vi']);

function resolveTheme(pref) {
  if (pref === 'auto') return window.matchMedia('(prefers-color-scheme:light)').matches ? 'light' : 'dark';
  return VALID_THEMES.has(pref) ? pref : 'dark';
}
function applyTheme(pref) {
  pref = VALID_THEMES.has(pref) ? pref : 'auto';
  const resolved = resolveTheme(pref);
  document.documentElement.dataset.theme = resolved;
  try { localStorage.setItem(THEME_KEY, pref); } catch (e) {}
  const select = document.getElementById('theme-select');
  if (select) select.value = pref;
  document.querySelectorAll('.theme-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === (pref || 'dark'));
  });
  // Chart.js bakes colours into the canvas at draw time, so a theme switch
  // would otherwise leave the charts in the previous palette. Safe to repaint
  // synchronously: the charts read their palette from the theme attribute set
  // just above, not from computed styles, so there is nothing to wait for.
  if (typeof renderInvCharts === 'function') {
    const d = document.getElementById('inv-charts-details');
    if (d && d.open) renderInvCharts();
  }
}

// Continuous font-size slider (replaces old A/A+/A++ buttons)
function baseFontPixels(width) {
  const w = Number(width) || 0;
  if (w >= 3200) return 22; // 4K CSS viewport
  if (w >= 2200) return 20; // 2K CSS viewport
  return 19; // 1080p and smaller desktop viewports
}
function applyFontScale(pct) {
  const BASE_PX = baseFontPixels(window.innerWidth); // 100% adapts to effective display size
  const slider = document.getElementById('size-range');
  const min = slider ? parseFloat(slider.min) : 75;
  const max = slider ? parseFloat(slider.max) : 150;
  const n = Math.max(min, Math.min(max, parseFloat(pct) || 100));
  document.documentElement.style.fontSize = (BASE_PX * n / 100) + 'px';
  try { localStorage.setItem(SIZE_KEY, n); } catch (e) {}
  const label = document.getElementById('size-label');
  if (label) label.textContent = n + '%';
  if (slider) {
    if (parseInt(slider.value, 10) !== n) slider.value = n;
    slider.setAttribute('aria-valuetext', n + '%');
  }
  const decrease = document.getElementById('size-decrease');
  const increase = document.getElementById('size-increase');
  if (decrease) decrease.disabled = n <= min;
  if (increase) increase.disabled = n >= max;
}

function adjustFontScale(delta) {
  const slider = document.getElementById('size-range');
  const step = slider ? parseFloat(slider.step) || 5 : 5;
  const current = slider ? parseFloat(slider.value) || 100 : 100;
  applyFontScale(current + (Number(delta) || 0) * step);
}

function initTheme() {
  let pref = 'auto';
  try { const v = localStorage.getItem(THEME_KEY); if (v) pref = v; } catch (e) {}
  applyTheme(pref);
  let pct = '100';
  try { const v = localStorage.getItem(SIZE_KEY); if (v) pct = v; } catch (e) {}
  applyFontScale(pct);
  window.matchMedia('(prefers-color-scheme:light)').addEventListener('change', () => {
    let cur = 'auto';
    try { cur = localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) {}
    if (cur === 'auto') applyTheme('auto');
  });
}

// ═══════════════════════════════════════════════════════════════════════
// GEAR LOADOUT — armor paperdoll, stats, set save/load
// ═══════════════════════════════════════════════════════════════════════

function gearKey() { return 'cmg_gear_' + (PLAYERS.active || 'default'); }

function loadGear() {
  try { return JSON.parse(localStorage.getItem(gearKey())) || {}; } catch(e) { return {}; }
}
function saveGear(gear) {
  try { localStorage.setItem(gearKey(), JSON.stringify(gear)); } catch(e) {}
}

let GEAR = {}; let BOOSTERS = ["", ""]; let MEDIKIT = null; let GEAR_ACTIVE = {}; let BOOSTER_ACTIVE = [true, true]; let MEDIKIT_ACTIVE = true;

function refreshGear() {
  GEAR = loadGear(); BOOSTERS = loadBoosters(); MEDIKIT = loadMedikit(); loadAllToggles();
  
  renderGear(); renderGearSets();
}


// Shared booster/food slots storage contract: every player's BOOSTERS is
// exactly two string slots. The two slots are shared between drugs and food,
// so storage can arrive from older builds, imports, or hand-edited exports as
// null / objects / duplicates / wrong length. Normalization is the boundary:
// order preserved, duplicates dropped keeping the first occurrence, junk
// dropped, trimmed, capped at two.
function normalizeBoosterSlots(raw) {
  const out = [];
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length && out.length < 2; i++) {
      const v = raw[i];
      if (typeof v !== 'string') continue; // null / number / object / etc. are junk
      const name = v.trim();
      if (!name || out.indexOf(name) !== -1) continue;
      out.push(name);
    }
  }
  while (out.length < 2) out.push('');
  return out;
}

function loadBoosters() {
  let slots = ['', ''];
  try {
    const r = localStorage.getItem('cmg_boosters_' + PLAYERS.active);
    slots = r ? normalizeBoosterSlots(JSON.parse(r)) : ['', ''];
  } catch (e) { slots = ['', '']; }
  // Repair in place so a malformed value does not survive round-trips.
  const canon = JSON.stringify(slots);
  try { if (localStorage.getItem('cmg_boosters_' + PLAYERS.active) !== canon) localStorage.setItem('cmg_boosters_' + PLAYERS.active, canon); } catch (e) {}
  return slots;
}
function saveBoosters(){BOOSTERS = normalizeBoosterSlots(BOOSTERS);localStorage.setItem('cmg_boosters_'+PLAYERS.active,JSON.stringify(BOOSTERS));}
function loadMedikit(){MEDIKIT=localStorage.getItem('cmg_medikit_'+PLAYERS.active)||null;try{var r=localStorage.getItem('cmg_medikit_toggle_'+PLAYERS.active);MEDIKIT_ACTIVE=r!=='false';}catch(e){MEDIKIT_ACTIVE=true;}}
function loadAllToggles(){try{var r=localStorage.getItem('cmg_toggles_'+PLAYERS.active);if(r){var d=JSON.parse(r);GEAR_ACTIVE=d.gear||{};BOOSTER_ACTIVE=d.boosters||[true,true];MEDIKIT_ACTIVE=d.medikit!==false;}}catch(e){}}
function saveToggles(){localStorage.setItem('cmg_toggles_'+PLAYERS.active,JSON.stringify({gear:GEAR_ACTIVE,boosters:BOOSTER_ACTIVE,medikit:MEDIKIT_ACTIVE}));}
function saveMedikit(){if(MEDIKIT)localStorage.setItem('cmg_medikit_'+PLAYERS.active,MEDIKIT);else localStorage.removeItem('cmg_medikit_'+PLAYERS.active);}


function migrateLocalGearSets() {
  try {
    if (localStorage.getItem('cmg_gearsets_migrated_v1')) return;
    const ops = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('cmg_gear_sets_')) continue;
      const owner = key.slice('cmg_gear_sets_'.length) || 'unknown';
      let sets = {};
      try { sets = JSON.parse(localStorage.getItem(key)) || {}; } catch (e) {}
      Object.entries(sets).forEach(([name, gear]) => {
        if (!gear || typeof gear !== 'object') return;
        const exists = SHARED_GEAR.some(s => s.name === name && s.owner === owner);
        if (!exists) ops.push({ op: 'upsert', set: { id: localId(), name, gear, owner, created_at: Date.now(), votes: {} } });
      });
    }
    localStorage.setItem('cmg_gearsets_migrated_v1', '1');
    if (ops.length) { syncShared('gear', ops); toast(`Saved ${ops.length} local gear preset(s).`); }
  } catch (e) {}
}

function gearSetScore(s) {
  return Object.values(s.votes || {}).reduce((a, v) => a + (v === 1 ? 1 : v === -1 ? -1 : 0), 0);
}

// Armor items filtered by armorType from our data
function armorItemsByType(armorType) {
  return DATA.recipes
    .filter(r => r.output.category === 'Armor' && r._armor_type === armorType)
    .map(r => r.output.item)
    .sort();
}

// Compute aggregate stats from equipped gear
function computeGearStats() {
  const stats = {};
  function add(s) { Object.entries(s).forEach(function(e){var k=e[0],v=e[1];if(typeof v==='number')stats[k]=(stats[k]||0)+v;}); }
  Object.entries(GEAR).forEach(function(e){var k=e[0],item=e[1];var r=DATA.recipes.find(function(rr){return rr.output.item===item;});if(!r?.output?.stats)return;if(r.output.category==='Implants & Electronics'&&GEAR_ACTIVE[k]===false)return;add(r.output.stats);});
  BOOSTERS.forEach(function(item,i){if(!item||BOOSTER_ACTIVE[i]===false)return;var r=DATA.recipes.find(function(rr){return rr.output.item===item;});if(r?.output?.stats)add(r.output.stats);});
  if (MEDIKIT && MEDIKIT_ACTIVE) { var r=DATA.recipes.find(function(rr){return rr.output.item===MEDIKIT;});if(r?.output?.stats)add(r.output.stats); }
  return stats;
}

const STAT_LABELS = {
  armor: 'Armor', shielding: 'Shielding', endurance: 'Endurance',
  resistance: 'Resistance', reflection: 'Reflection', agility: 'Agility',
  defense_rating: 'Defense', block_rating: 'Block', weapon_recoil: 'Recoil',
  health_regen: 'HP Regen', bio_regen: 'Bio Regen', aura_regen: 'Aura Regen',
  stamina_regen: 'Stam Regen', health_drain: 'HP Drain', bio_drain: 'Bio Drain',
  crit_offense: 'Crit',
  // 1.7 spreadsheet keys (no underscore)
  weaponrecoil: 'Recoil', healthregen: 'HP Regen', bioregen: 'Bio Regen',
  auraregen: 'Aura Regen', staminaregen: 'Stam Regen', healthdrain: 'HP Drain',
  biodrain: 'Bio Drain', bioenergydrain: 'Bio Drain', staminadrain: 'Stam Drn',
  ballisticdamage: 'Ballistic', biodamage: 'Bio Dmg', xenodamage: 'Xeno Dmg',
  energydamage: 'Energy', destruction: 'Destruct', staminadamage: 'Stam Dmg',
  auradamage: 'Aura Dmg', protectionreduction: 'Prot Red',
  durationseconds: 'Duration', medkitcooldown: 'CD',
  defenserating: 'Defense', blockrating: 'Block', critoffenserating: 'Crit',
  health: 'Health', stamina: 'Stamina', aura: 'Aura',
  addiction: 'Addiction', addictiontreatment: 'Addiction Tx', illegal: 'Illegal',
  classification: 'Class',
};

// Official stat definitions (in-game attribute help text, verified 2026-08-08).
// Shown as tooltips on the Gear tab stat grid. Keys mirror STAT_LABELS (both
// underscore and 1.7-spreadsheet forms).
const STAT_DEFS = {
  armor: 'Sum of protection from all equipped items against ballistic damage.',
  shielding: 'Sum of protection from all equipped items against energy damage.',
  endurance: "Protection against stamina damage.",
  resistance: 'Protection against bio damage.',
  reflection: 'Protection against aura damage.',
  agility: 'How fast your character can run.',
  weapon_recoil: 'Weapon recoil changes the ease of aiming your weapon while moving.',
  weaponrecoil: 'Weapon recoil changes the ease of aiming your weapon while moving.',
  health_regen: 'Increases health by repairing the body via medkits, injectors, illegal substances — or even death.',
  healthregen: 'Increases health by repairing the body via medkits, injectors, illegal substances — or even death.',
  stamina_regen: 'Increases stamina regeneration via medkits, injectors, illegal substances, or certain equipment; also boosted while resting.',
  staminaregen: 'Increases stamina regeneration via medkits, injectors, illegal substances, or certain equipment; also boosted while resting.',
  bio_regen: 'Increases the body\'s bio energy level via bio cells, injectors, or illegal substances.',
  bioregen: 'Increases the body\'s bio energy level via bio cells, injectors, or illegal substances.',
  aura_regen: 'Increases the regeneration of aura via various foods or illegal substances.',
  auraregen: 'Increases the regeneration of aura via various foods or illegal substances.',
  health_drain: 'Health reduction caused by equipment or booster effects.',
  healthdrain: 'Health reduction caused by equipment or booster effects.',
  bio_drain: 'Bio energy reduction caused by equipment or booster effects.',
  biodrain: 'Bio energy reduction caused by equipment or booster effects.',
  bioenergydrain: 'Bio energy reduction caused by equipment or booster effects.',
  staminadrain: 'Stamina reduction caused by equipment or booster effects.',
  crit_offense: 'Increases the chance to land a critical attack (attack with increased damage).',
  critoffenserating: 'Increases the chance to land a critical attack (attack with increased damage).',
  defense_rating: 'Increases the chance of reducing all damage types of an attack.',
  defenserating: 'Increases the chance of reducing all damage types of an attack.',
  block_rating: 'Increases the chance of blocking an individual attack entirely.',
  blockrating: 'Increases the chance of blocking an individual attack entirely.',
  protectionreduction: 'Percentage reduction of all protection statistics. Changes are immediately reflected in the attribute sheet.',
  medkitcooldown: 'How long you must wait in between using healing items.',
  durationseconds: 'How long the effect lasts.',
  ballisticdamage: 'Ballistic damage dealt by this item.',
  energydamage: 'Energy damage dealt by this item.',
  biodamage: 'Bio damage dealt by this item.',
  staminadamage: 'Stamina damage dealt by this item.',
  auradamage: 'Aura damage dealt by this item.',
  xenodamage: 'Xeno damage dealt by this item.',
  destruction: 'Destruction damage dealt by this item.',
  health: 'Body health pool.',
  stamina: 'Stamina pool — drained by sprinting and abilities.',
  aura: 'Aura pool — drained by aura abilities.',
  addiction: 'Addiction chance or severity from this item.',
  addictiontreatment: 'Addiction treatment effect from this item.',
  illegal: 'Illegal-use classification or penalty value from this item.',
  classification: 'Published item classification value.',
};

// ═══════════════════════════════════════════════════════════════════════════

// ── Global audio singleton ──
// § GLOBAL AUDIO — single audio instance prevents overlapping sounds
// ═══════════════════════════════════════════════════════════════════════════

let _globalAudio = null;
function playAudio(src, vol) {
  if (_globalAudio) { _globalAudio.pause(); _globalAudio = null; }
  if (!src) return;
  try {
    _globalAudio = new Audio(src);
    _globalAudio.volume = typeof vol === 'number' ? vol : 0.3;
    _globalAudio.play().catch(function(){});
  } catch(e) {}
}
function stopAudio() {
  if (_globalAudio) { _globalAudio.pause(); _globalAudio = null; }
}
// Expose for onclick handlers (they run in global scope)
window.playAudio = playAudio;
window.stopAudio = stopAudio;

// ═══════════════════════════════════════════════════════════════════════════
// § TERMINAL AUDIO — play voice lines on tab switches
// ═══════════════════════════════════════════════════════════════════════════

const TERMINAL_AUDIO = {
  calc: 'voice_extracted/ProductionTerminal.ogg',
  inventory: 'voice_extracted/StorageAccess.ogg',
  gear: 'voice_extracted/ProductionTerminal.ogg',
  colonies: 'voice_extracted/MiningTerminal.ogg',
  drugs: 'voice_extracted/MedicalService.ogg',
  battle: 'voice_extracted/SecurityPad.ogg',
  models: 'voice_extracted/ApartmentEntry.ogg',
  community: 'voice_extracted/MarketTerminal.ogg',
};
const SOUND_MODE_KEY = 'er_sound_mode_v1';
let SOUND_MODE = 'off';
try { SOUND_MODE = localStorage.getItem(SOUND_MODE_KEY) || 'off'; } catch (e) {}
if (!['off', 'cues', 'voices'].includes(SOUND_MODE)) SOUND_MODE = 'off';

function playUICue(tab) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = playUICue._ctx || (playUICue._ctx = new Ctx());
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    const order = Object.keys(TERMINAL_AUDIO).indexOf(tab);
    osc.frequency.value = 280 + Math.max(0, order) * 28;
    gain.gain.setValueAtTime(0.025, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.07);
    osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.075);
  } catch (e) {}
}
function setSoundMode(mode) {
  SOUND_MODE = ['off', 'cues', 'voices'].includes(mode) ? mode : 'off';
  try { localStorage.setItem(SOUND_MODE_KEY, SOUND_MODE); } catch (e) {}
  if (SOUND_MODE === 'off') {
    stopAudio();
    try { stopComms(); } catch (e) {}
  }
  renderMuteButton();
}
function isMuted() { return SOUND_MODE === 'off'; }
function setMuted(on) { setSoundMode(on ? 'off' : 'cues'); }
function toggleMuted() { setSoundMode(SOUND_MODE === 'off' ? 'cues' : 'off'); }

function renderMuteButton() {
  const b = document.getElementById('mute-btn');
  if (!b) return;
  const off = SOUND_MODE === 'off';
  b.textContent = off ? '🔇 Sounds off' : (SOUND_MODE === 'voices' ? '🗣 Terminal voices' : '🔉 UI cues');
  b.classList.toggle('active', off);
  b.setAttribute('aria-pressed', off ? 'true' : 'false');
  b.title = off ? 'Sounds are off' : 'Click to turn sounds off';
  const select = document.getElementById('sound-mode');
  if (select) select.value = SOUND_MODE;
}
window.toggleMuted = toggleMuted;
window.setSoundMode = setSoundMode;

function playTerminalAudio(tab) {
  // Always stop comms when leaving the tab
  if (tab !== 'comms') {
    try { stopComms(); } catch(e) {}
  }
  if (SOUND_MODE === 'off') return;
  if (SOUND_MODE === 'cues') { playUICue(tab); return; }
  var src = TERMINAL_AUDIO[tab];
  if (src) playAudio(src, 0.3);
}

