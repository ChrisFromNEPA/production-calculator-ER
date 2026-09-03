'use strict';
// src/engine.js — pure engine (no DOM dependencies, no player store)
// Provides window.ENGINE and CommonJS exports for testing.
(function() {
const DATA = window.GAME_DATA;
const ICON_FALLBACKS = new Set((DATA.icon_fallbacks || []).map(item => String(item).toLowerCase()));

// ---- derived indexes ---------------------------------------------------
const ALL_ITEMS = new Set();
DATA.inventory.forEach(e => ALL_ITEMS.add(e.item));
DATA.mining_sites.forEach(s => s.yields.forEach(y => ALL_ITEMS.add(y)));
DATA.recipes.forEach(r => {
  ALL_ITEMS.add(r.output.item);
  (r.inputs || []).forEach(i => ALL_ITEMS.add(i.item));
  (r.inputs_alternatives || []).forEach(alt => alt.forEach(i => ALL_ITEMS.add(i.item)));
});

const RECIPE_INPUTS = new Set();
DATA.recipes.forEach(r => {
  (r.inputs || []).forEach(i => RECIPE_INPUTS.add(i.item));
  (r.inputs_alternatives || []).forEach(alt => alt.forEach(i => RECIPE_INPUTS.add(i.item)));
});
// FINAL_ITEMS = produced items that no other recipe consumes as an input.
// Auto-detected via RECIPE_INPUTS — items consumed by any recipe are intermediates.
// (Former manual NON_FINAL_ITEMS blocklist removed 2026-07-24 — all 7 entries were
// already caught by the auto-detection, verified via game_data.json recipe scan.)
const _producedItems = new Set();
DATA.recipes.forEach(r => _producedItems.add(r.output.item));
const FINAL_ITEMS = [..._producedItems]
  .filter(it => !RECIPE_INPUTS.has(it))
  .sort();
// Categories derived from recipe output.category (added to game_data.json).
const CATEGORIES = [...new Set(DATA.recipes
  .filter(r => FINAL_ITEMS.includes(r.output.item) && r.output.category)
  .map(r => r.output.category))].sort();

// Item-type short labels for compact badges
const ITEM_TYPE_LABELS = {
  'Medical': 'Medkit', 'Ammunition': 'Ammo', 'Weapons': 'Weapon',
  'Food & Drink': 'Food', 'Implants & Electronics': 'Implant',
  'Alien Materials': 'Alien', 'Other': 'Misc'
};
function itemTypeLabel(item) {
  const cat = catOf(item);
  return ITEM_TYPE_LABELS[cat] || cat || 'Item';
}

// Player's chosen refinement/production paths, keyed by item name.
// Persisted to localStorage so choices survive refresh.
const ALTERNATIVE_CHOICES = {};

// ---- HTML sanitizer (prevents injection from user data / imported JSON) ----
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ---- Display name: normalize item names for consistent title-case rendering ----
// Game data has mixed casing (e.g. 'Emergency MediKit', 'Chemical Substances').
// This title-cases each word while preserving acronyms and hyphenated segments.
function displayName(item) {
  if (!item) return '';
  return item.replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// ---- Search text normalization ----------------------------------------------
// The game data spells the healing kits "MediKit" ("Small MediKit", …) while
// players overwhelmingly type "medkit" — and sometimes "med kit" or "medi kit".
// Normalize BOTH the query and the candidate before substring matching:
// lowercase, drop apostrophes and punctuation/spaces, then fold known spelling
// variants. A small alias table (not a dictionary) so future aliases are one
// line each and every search surface shares the same behavior.
const SEARCH_ALIASES = [
  [/medikit/g, 'medkit'],   // MediKit/medikit → medkit
];
function normalizeSearchText(s) {
  let t = String(s || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '');
  for (const [re, rep] of SEARCH_ALIASES) t = t.replace(re, rep);
  return t;
}

// ---- Number formatting ----
function fmt(n) { return Number(n).toLocaleString(); }

// recipe(s) that produce a given item
const RECIPES_BY_OUTPUT = {};
DATA.recipes.forEach((r, idx) => {
  (RECIPES_BY_OUTPUT[r.output.item] = RECIPES_BY_OUTPUT[r.output.item] || []).push({ ...r, _idx: idx });
});

const MINED = new Set();
DATA.mining_sites.forEach(s => s.yields.forEach(y => MINED.add(y)));

const LOCATIONS = [...new Set([
  ...DATA.mining_sites.map(s => s.location),
  ...DATA.inventory.map(e => e.location),
])].sort((a, b) => a.localeCompare(b));

// ---- Player store bridge to window.STORE (src/store.js) ----
// Engine reads inventory totals via Proxy getters that always delegate to the
// live STORE object. recomputeInv() in store.js replaces INV_TOTAL with a new
// object on every mutation, so stale references would break compute().
// Proxy avoids this: every property access, assignment, and enumeration hits
// the current STORE object, never a stale snapshot.
const INV_TOTAL = new Proxy({}, {
  get(_, prop) { return window.STORE.INV_TOTAL[prop]; },
  set(_, prop, val) { window.STORE.INV_TOTAL[prop] = val; return true; },
  ownKeys() { return Reflect.ownKeys(window.STORE.INV_TOTAL); },
  getOwnPropertyDescriptor(_, prop) {
    return Object.getOwnPropertyDescriptor(window.STORE.INV_TOTAL, prop);
  },
  has(_, prop) { return prop in window.STORE.INV_TOTAL; },
  deleteProperty(_, prop) { return delete window.STORE.INV_TOTAL[prop]; }
});

const INV_LOCATIONS = new Proxy({}, {
  get(_, prop) { return window.STORE.INV_LOCATIONS[prop]; },
  set(_, prop, val) { window.STORE.INV_LOCATIONS[prop] = val; return true; },
  ownKeys() { return Reflect.ownKeys(window.STORE.INV_LOCATIONS); },
  getOwnPropertyDescriptor(_, prop) {
    return Object.getOwnPropertyDescriptor(window.STORE.INV_LOCATIONS, prop);
  },
  has(_, prop) { return prop in window.STORE.INV_LOCATIONS; }
});

// ---- mine sites ----
const MINE_SITES = {};
DATA.mining_sites.forEach(s => s.yields.forEach(y => {
  (MINE_SITES[y] = MINE_SITES[y] || []).push(s.location);
}));

// Choose the default mine for a missing raw material using the player's current
// faction economics. Explicit OBTAIN_SITE pins always win; this only supplies
// the initial preference shown by the Obtain section.
function defaultObtainSite(item, sites) {
  const available = (sites || []).slice();
  if (!available.length) return null;
  const pinned = typeof window.OBTAIN_SITE === 'object' && window.OBTAIN_SITE
    ? window.OBTAIN_SITE[item] : null;
  if (pinned && available.includes(pinned)) return pinned;
  const unit = materialPrice(item);
  if (unit == null) return available[0];
  const scored = available.map((site, index) => ({
    site,
    index,
    cost: unit * colonyFactor(site) * (1 + (typeof window.ENGINE_COLONY_TAX_FOR === 'function'
      ? Math.max(0, Number(window.ENGINE_COLONY_TAX_FOR(site)) || 0) : 0)),
  }));
  scored.sort((a, b) => a.cost - b.cost || a.index - b.index);
  return scored[0].site;
}

const CRAFTABLE = new Set(Object.keys(RECIPES_BY_OUTPUT));

// ---- icons ----
function iconFor(item) {
  const letter = item.replace(/[^a-zA-Z]/g, '').charAt(0).toUpperCase() || '?';
  if (ICON_FALLBACKS.has(String(item).toLowerCase())) {
    return `<span class="icon icon-missing"><span class="icon-badge" aria-label="Icon unavailable">${esc(letter)}</span></span>`;
  }
  const path = 'icons/' + encodeURIComponent(item.toLowerCase()) + '.png';
  return `<span class="icon"><img src="${esc(path)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('icon-missing');this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${esc(letter)}',className:'icon-badge'}))"></span>`;
}

// ---- Item detail popup (modal) ----
function showItemDetail(item) {
  const old = document.querySelector('.item-popup-overlay');
  if (old) old.remove();

  // Remember the trigger so closing the popup can return focus to it.
  const lastFocused = document.activeElement;

  const overlay = document.createElement('div');
  overlay.className = 'item-popup-overlay';

  const have = INV_TOTAL[item] || 0;
  const recipes = RECIPES_BY_OUTPUT[item] || [];
  const mineSites = MINE_SITES[item] || [];
  const isCraftable = CRAFTABLE.has(item);
  const isRaw = MINED.has(item);

  const consumers = [];
  DATA.recipes.forEach(r => {
    const allIns = (r.inputs || []).concat((r.inputs_alternatives || []).flat());
    if (allIns.some(i => i.item === item)) consumers.push(r.output.item);
  });

  let producedBy = '';
  if (isCraftable) {
    const r = recipes[0];
    const ins = r.inputs || (r.inputs_alternatives ? r.inputs_alternatives[0] : []);
    producedBy = '<div class="ip-section"><div class="ip-label">Produced by</div><div class="ip-recipe">' +
      ins.map(i => '<span class="ip-chip">' + iconFor(i.item) + esc(displayName(i.item)) + ' <b>×' + fmt(i.quantity) + '</b></span>').join(' <span class="ip-plus">+</span> ') +
      '</div><div class="ip-batch">' + r.output.quantity + ' per batch · ' + esc(r.process) + '</div></div>';
  }

  let statsHtml = '';
  const stats = recipes.length ? recipes[0].output.stats : null;
  if (stats) {
    const badges = [];
    if (stats.duration_sec) badges.push('<span class="stat-badge">⏱ ' + stats.duration_sec + 's</span>');
    if (stats.healing_hps) badges.push('<span class="stat-badge">❤ ' + stats.healing_hps + '/s</span>');
    if (stats.protection_reduction_pct) badges.push('<span class="stat-badge">🛡 ' + stats.protection_reduction_pct + '%</span>');
    if (stats.cooldown_sec) badges.push('<span class="stat-badge">🔄 ' + stats.cooldown_sec + 's</span>');
    if (stats.bio_regen) badges.push('<span class="stat-badge">🧪 ' + stats.bio_regen + '/s</span>');
    if (stats.stamina_regen) badges.push('<span class="stat-badge">⚡ ' + stats.stamina_regen + '/s</span>');
    if (stats.agility) badges.push('<span class="stat-badge">🏃 ' + stats.agility + '</span>');
    if (stats.aura_regen) badges.push('<span class="stat-badge">✨ ' + stats.aura_regen + '/s</span>');
    if (stats.health_regen) badges.push('<span class="stat-badge">💚 ' + stats.health_regen + '/s</span>');
    if (badges.length) statsHtml = '<div class="ip-section"><div class="ip-label">Stats</div><div class="ip-stats">' + badges.join(' ') + '</div></div>';
  }

  let drugInfoHtml = '';
  const drugRef = (DATA.drugs || []).find(d => d.name === item);
  if (drugRef) {
    const eff = [];
    if (drugRef.positive) eff.push('<span class="ip-drug-pos">' + esc(drugRef.positive) + '</span>');
    if (drugRef.negative) eff.push('<span class="ip-drug-neg">' + esc(drugRef.negative) + '</span>');
    drugInfoHtml = '<div class="ip-section"><div class="ip-label">Drug Production</div>' +
      '<div class="ip-drug-meta"><span class="ip-drug-k">Code</span> <code>' + esc(String(drugRef.code)) + '</code>' +
      ' <span class="ip-drug-k">Power</span> <span class="tag tier-' + esc(String(drugRef.tier || '').toLowerCase()) + '">' + esc(drugRef.tier) + '</span></div>' +
      (eff.length ? '<div class="ip-drug-eff">' + eff.join('') + '</div>' : '') +
      '<div class="ip-drug-cost"><span>Processing <b>' + fmt(drugRef.processing_cost) + '</b></span>' +
      '<span>ChemSub <b>' + fmt(drugRef.chemsub_cost) + '</b></span>' +
      '<span class="ip-drug-total">Total <b>' + fmt(drugRef.total_uc) + ' UC</b></span></div></div>';
  }

  overlay.innerHTML = '<div class="item-popup" role="dialog" aria-modal="true" aria-label="Item details for ' + esc(displayName(item)) + '">' +
    '<button class="ip-close" aria-label="Close">&times;</button>' +
    '<div class="ip-header"><span class="ip-icon">' + iconFor(item) + '</span><div><h2>' + esc(displayName(item)) + '</h2>' +
    '<div class="ip-tags">' +
    (isRaw ? '<span class="tag mine">raw material</span>' : '') +
    (isCraftable ? '<span class="tag have">' + recipes[0].process + '</span>' : '') +
    '<span class="tag">held ' + fmt(have) + '</span></div></div></div>' +
    statsHtml + drugInfoHtml + producedBy +
    (consumers.length ? '<div class="ip-section"><div class="ip-label">Used in (' + consumers.length + ')</div><div class="ip-grid">' +
      consumers.map(c => '<button class="ip-link" data-ip-item="' + encodeURIComponent(c) + '">' + iconFor(c) + esc(displayName(c)) + '</button>').join('') + '</div></div>' : '') +
    (mineSites.length ? '<div class="ip-section"><div class="ip-label">Mineable at (' + mineSites.length + ')</div><div class="ip-grid">' +
      mineSites.map(s => '<span class="tag mine">' + esc(s) + '</span>').join(' ') + '</div></div>' : '') +
    (have > 0 ? '<div class="ip-section"><div class="ip-label">Your inventory</div><div class="ip-inv">' +
      (INV_LOCATIONS[item] || []).map(l => '<span class="tag have">' + esc(l.location) + ': ' + fmt(l.qty) + '</span>').join(' ') + '</div></div>' : '') +
    (FINAL_ITEMS.includes(item) ? '<div class="ip-section"><button class="ip-calc primary" data-ip-calc="' + encodeURIComponent(item) + '">Calculate ' + esc(displayName(item)) + '</button></div>' : '') +
    '</div>';

  // Every close path funnels through closePopup: it tears down the overlay,
  // drops the keyboard handler, and hands focus back to whatever opened it.
  function closePopup() {
    overlay.remove();
    document.removeEventListener('keydown', onPopupKey);
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }

  overlay.addEventListener('click', e => { if (e.target === overlay) closePopup(); });
  overlay.querySelector('.ip-close').addEventListener('click', closePopup);

  // Keyboard contract: Escape closes the modal; Tab is trapped inside it so
  // focus cannot leak out to the page behind the overlay.
  function onPopupKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); closePopup(); return; }
    if (e.key === 'Tab') {
      const focusables = Array.from(overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter(el => el.offsetParent !== null || el === document.activeElement);
      if (!focusables.length) { e.preventDefault(); return; }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === overlay)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
  }
  document.addEventListener('keydown', onPopupKey);

  overlay.querySelectorAll('[data-ip-item]').forEach(btn => {
    btn.addEventListener('click', () => { const name = decodeURIComponent(btn.dataset.ipItem); closePopup(); showItemDetail(name); });
  });

  const calcBtn = overlay.querySelector('[data-ip-calc]');
  if (calcBtn) calcBtn.addEventListener('click', () => {
    const name = decodeURIComponent(calcBtn.dataset.ipCalc);
    document.getElementById('calc-item').value = name;
    document.querySelector('.tab[data-view="calc"]').click();
    closePopup(); runCalculator();
  });
  document.body.appendChild(overlay);
  // Focus-in: move focus into the dialog. The close control is its first tab
  // stop, so it is the safest initial target for both mouse and keyboard.
  const closeBtn = overlay.querySelector('.ip-close');
  if (closeBtn && typeof closeBtn.focus === 'function') closeBtn.focus();
  requestAnimationFrame(() => overlay.classList.add('show'));
}

// Global click-to-inspect: clicking any item icon/name in flow chips, tray,
// picker cards, or inventory opens the detail popup.
document.addEventListener('click', e => {
  if (e.target.closest('.item-popup-overlay') || e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
  // Dragging out a text selection ends in a click; a plain click leaves the
  // selection collapsed. A non-collapsed one means the user was selecting (say,
  // a quantity they meant to overtype), so don't hijack it with the popup.
  const sel = window.getSelection && window.getSelection();
  if (sel && !sel.isCollapsed && sel.toString().trim()) return;
  // NOTE: .zone-row-item is deliberately absent. Whole-row triggering meant any
  // click in an inventory row's empty space opened this modal — including the
  // gap beside the quantity box, and the moment a drag-select of that number
  // released outside the field. Those rows have their own affordance: the item
  // name is an explicit link that opens the inventory detail panel, which is
  // the right card for that tab. Two different cards for one row was also just
  // confusing.
  const chip = e.target.closest('.flow-chip, .tray-chip, .pick-card, .ic-body');
  if (!chip) return;
  // .zr-name intentionally dropped alongside .zone-row-item above.
  const nameEl = chip.querySelector('.flow-name, .tray-nm, .pick-name, .ic-name');
  if (!nameEl) return;
  let itemName = null;
  if (chip.classList.contains('pick-card') && chip.dataset.item) {
    itemName = decodeURIComponent(chip.dataset.item);
  } else {
    const displayText = nameEl.textContent.trim();
    for (const it of ALL_ITEMS) { if (displayName(it) === displayText) { itemName = it; break; } }
  }
  if (itemName) showItemDetail(itemName);
});

function scoreAlternative(alt, totalNeed, outQty) {
  const batches = totalNeed > 0 ? Math.ceil(totalNeed / outQty) : 1;
  let score = 0;
  let totalGap = 0;
  alt.forEach(inp => {
    const have = INV_TOTAL[inp.item] || 0;
    const need = inp.quantity * batches;
    if (have >= need) {
      score += 2;
    } else if (MINED.has(inp.item)) {
      score += 0.5;
    }
    totalGap += Math.max(0, need - have);
  });
  score -= totalGap * 0.5;
  score -= alt.length * 0.1;
  return score;
}

// ---- cost-aware alternative scoring (faction net) -----------------------------
// The heuristic above ignores UC price entirely, so the old picker chose the
// first-listed path (mineral oil) for carbon even though coal is cheaper at
// sticker AND mined on our own Andromeda colony. When price data is available
// (window.COSTS, loaded before this file) these helpers price each path at its
// faction net cost — the per-batch processing fee at the destination plus the
// raw materials at their mine site, each reduced by the faction rebate where
// Colony ownership is read lazily through window hooks that app-core.js
// installs; with no hook installed (test harness, standalone) the factor is 1,
// i.e. the estimate degrades to plain sticker price.
function colonyFactor(loc) {
  const owned = (typeof window.ENGINE_COLONY_OWNED === 'function') && window.ENGINE_COLONY_OWNED(loc);
  if (!owned) return 1;
  const rebate = typeof window.ENGINE_COLONY_REBATE_FOR === 'function'
    ? Number(window.ENGINE_COLONY_REBATE_FOR(loc)) || 0
    : (typeof window.ENGINE_COLONY_REBATE === 'number' ? window.ENGINE_COLONY_REBATE : 0);
  // Never let a malformed policy turn a price negative or create a rebate
  // greater than the entire spend. Public policy metadata is fail-closed.
  const safeRebate = Math.max(0, Math.min(1, rebate));
  return 1 - safeRebate;
}
function batchFee(item, altIndex) {
  const table = window.COSTS && window.COSTS.items;
  if (!table) return null;
  const paths = table[item];
  if (!paths) return null;
  return paths[altIndex == null ? 0 : altIndex] || null;
}
function materialPrice(item) {
  const m = window.COSTS && window.COSTS.materials;
  if (!m) return null;
  const v = m[item];
  return typeof v === 'number' ? v : null;
}
// NET cost to the active faction of ONE UNIT of `item` produced via the alternative path at
// `altIndex`: the path's per-batch fee (rebated at the destination) plus its
// inputs priced at their own cheapest net unit cost, divided by the batch
// yield. Returns null when any link in the chain is unpriced — never invents
// a number (same strictness as costFor).
function netPathCost(item, altIndex, dest, memo, depth) {
  depth = depth || 0;
  if (depth > 10) return null;
  const fee = batchFee(item, altIndex);
  if (!fee || fee.uc == null || !fee.y) return null;
  const recs = RECIPES_BY_OUTPUT[item];
  if (!recs || !recs.length) return null;
  const r = DATA.recipes[recs[0]._idx];
  const alt = r.inputs_alternatives ? r.inputs_alternatives[altIndex] : (altIndex === 0 ? r.inputs : null);
  if (!alt) return null;
  let total = fee.uc * colonyFactor(dest);
  for (const inp of alt) {
    const u = netUnitCost(inp.item, dest, memo, depth + 1);
    if (u == null) return null;
    total += u * inp.quantity;
  }
  return total / fee.y;
}
// NET cost to the active faction of ONE UNIT of `item`, choosing its cheapest priced path
// (raw materials price straight at their mine site, rebated when we own it).
function netUnitCost(item, dest, memo, depth) {
  depth = depth || 0;
  if (depth > 10) return null;
  if (Object.prototype.hasOwnProperty.call(memo, item)) return memo[item];
  const raw = materialPrice(item);
  if (raw != null) {
    // Mine site: the player's pinned choice (app.js's OBTAIN_SITE, a global
    // var) when it's one this material can be mined at, else the first listed
    // — the same rule obtainSiteFor uses when the plan is costed. The rebate
    // therefore tracks the site the plan will actually bill.
    const sites = MINE_SITES[item] || [];
    const site = defaultObtainSite(item, sites);
    return memo[item] = raw * colonyFactor(site);
  }
  const recs = RECIPES_BY_OUTPUT[item];
  if (!recs || !recs.length) return memo[item] = null;
  const r = DATA.recipes[recs[0]._idx];
  const alts = r.inputs_alternatives || (r.inputs ? [r.inputs] : null);
  if (!alts) return memo[item] = null;
  let best = null;
  alts.forEach((alt, i) => {
    const c = netPathCost(item, i, dest, memo, depth + 1);
    if (c != null && (best == null || c < best)) best = c;
  });
  return memo[item] = best;
}
// Pick the best alternative index for a recipe (honouring an explicit choice).
// Cost-aware when every path is priced: cheapest faction NET cost wins. If any
// path is unpriced the whole recipe falls back to the stock-coverage heuristic
// (never compare a priced path against an unpriced one).
function pickAlternativeIndex(recipe, chosen, totalNeed, dest) {
  const alts = recipe.inputs_alternatives;
  if (chosen != null && chosen >= 0 && chosen < alts.length) return chosen;
  const outQty = recipe.output.quantity;
  if (window.COSTS && window.COSTS.items) {
    const memo = {};
    const costs = alts.map((alt, i) => netPathCost(recipe.output.item, i, dest || DESTINATION, memo, 0));
    if (costs.every(c => c != null)) {
      let best = 0;
      for (let i = 1; i < costs.length; i++) if (costs[i] < costs[best]) best = i;
      return best;
    }
  }
  let best = 0, bestScore = -Infinity;
  alts.forEach((alt, i) => { const sc = scoreAlternative(alt, totalNeed, outQty); if (sc > bestScore) { bestScore = sc; best = i; } });
  return best;
}
function concreteInputs(recipe, chosen, totalNeed, dest) {
  if (recipe.inputs) return recipe.inputs;
  return recipe.inputs_alternatives[pickAlternativeIndex(recipe, chosen, totalNeed, dest)];
}

let DESTINATION = 'Berlin';

// item → colony the player chose to move that item FROM. Set by the UI; the
// allocator honours it when that colony actually holds stock, then falls back
// to its normal ranking. Kept as engine state rather than a compute() argument
// because compute()'s signature already juggles two call shapes.
let TRANSPORT_SOURCE = {};

function compute(itemOrItems, qtyOrChosen, chosenOpt, extLedger, extInvLoc, dest, refineDest) {
  // normalize args — two call shapes:
  //   compute(item, qty, chosen, extLedger, extInvLoc, dest, refineDest)
  //   compute(items[], chosen, extLedger, extInvLoc, dest, refineDest)
  let items;
  let chosen;
  if (typeof itemOrItems === 'string') {
    items = [{ item: itemOrItems, qty: qtyOrChosen }];
    chosen = chosenOpt || {};
  } else {
    items = itemOrItems;
    chosen = qtyOrChosen || {};
    refineDest = arguments.length >= 6 ? dest : undefined;
    dest = extInvLoc;
    extInvLoc = extLedger;
    extLedger = chosenOpt;
  }
  dest = dest || DESTINATION;
  refineDest = refineDest || dest;

  // use external ledger or build one from current inventory
  const ledger = extLedger || {};
  if (!extLedger) {
    for (const k in INV_TOTAL) ledger[k] = (ledger[k] || 0) + INV_TOTAL[k];
  }
  const invLoc = extInvLoc || INV_LOCATIONS;

  const transport = {};
  const acquire = {};
  const steps = [];
  const surplus = {};
  const visited = new Set();   // for cycle detection
  const inStack = new Set();   // DFS recursion stack

  // Colonies this plan already draws from. Pulling another material from one of
  // them costs no additional trip, so they rank above untouched colonies.
  const visitedColonies = new Set();
  const consumerKinds = {}; // item → Set<'refine'|'manufacture'>

  function transportTargetFor(item) {
    const kinds = consumerKinds[item];
    return kinds && kinds.has('refine') ? refineDest : dest;
  }

  // ---- allocOwned: deduct from ledger, record transport ----
  // Source choice is ranked, not just "biggest pile first":
  //   0. the refinement destination itself — already there, so it needs no trip at all and
  //      produces NO transport row (previously `dest` was accepted by compute()
  //      and then never used, so plans told you to move Berlin -> Berlin)
  //   1. a colony the player explicitly picked for this item
  //   2. a colony this plan already visits — reuses an existing trip
  //   3. otherwise the largest pile, which splits the stack the fewest times
  function allocOwned(it, qty) {
    const avail = ledger[it] || 0;
    const fromOwn = Math.min(qty, avail);
    if (fromOwn <= 0) return 0;
    ledger[it] = avail - fromOwn;

    const pref = TRANSPORT_SOURCE[it];
    const target = transportTargetFor(it);
    const rank = l => {
      if (l.location === target) return 0;
      if (pref && l.location === pref) return 1;
      if (visitedColonies.has(l.location)) return 2;
      return 3;
    };
    const locs = (invLoc[it] || []).slice()
      .sort((a, b) => rank(a) - rank(b) || b.qty - a.qty);

    let remaining = fromOwn;
    locs.forEach(l => {
      if (remaining <= 0) return;
      const take = Math.min(remaining, l.qty);
      if (take <= 0) return;
      remaining -= take;
      // Stock sitting at the destination is consumed in place — never a move.
      if (l.location === target) return;
      transport[it] = transport[it] || { qty: 0, from: [], fromQty: {} };
      transport[it].to = target;
      transport[it].qty += take;
      if (!transport[it].from.includes(l.location)) transport[it].from.push(l.location);
      transport[it].fromQty[l.location] = (transport[it].fromQty[l.location] || 0) + take;
      visitedColonies.add(l.location);
    });
    return fromOwn;
  }

  // ---- Step 1: Build processing order via DFS post-order ----
  const order = [];  // items in post-order (children before parents)
  const consumers = {};  // item → [{item, qty}] — who needs this and how much

  function dfs(it) {
    if (visited.has(it)) return;
    if (inStack.has(it)) throw new Error('Cycle detected: ' + it);
    inStack.add(it);
    if (CRAFTABLE.has(it)) {
      // Walk the union of ALL alternative paths, not just the currently
      // preferred one: the demand phase re-picks alternatives with the real
      // quantities, and every possible input must already be in the order.
      const recipe = RECIPES_BY_OUTPUT[it][0];
      const inputSets = recipe.inputs ? [recipe.inputs] : recipe.inputs_alternatives;
      const seen = new Set();
      inputSets.forEach(set => set.forEach(inp => {
        if (!seen.has(inp.item)) { seen.add(inp.item); dfs(inp.item); }
      }));
    }
    inStack.delete(it);
    visited.add(it);
    order.push(it);
  }

  // DFS from each final item
  for (const {item} of items) dfs(item);

  // ---- Step 2: Accumulate demands bottom-up (consumers → producers) ----
  // pendingDemand tracks how much each item's consumers have requested
  const pendingDemand = {};
  for (const {item, qty} of items) {
    pendingDemand[item] = (pendingDemand[item] || 0) + qty;
  }

  // Quantities the player explicitly ASKED FOR. These must be produced, not
  // quietly satisfied from stock: "make me 300 medkits" means 300 more, and
  // when you already held 300+ the old behaviour cancelled the whole demand and
  // returned a plan with no production steps at all.
  // Owned stock of the same item is still used for any OTHER demand on it (as
  // an input to another item in the tray) — only the requested amount is
  // reserved for production.
  const requestedQty = {};
  for (const {item, qty} of items) {
    requestedQty[item] = (requestedQty[item] || 0) + qty;
  }

  // Process in reverse order (finals first in the DFS post-order means
  // the order array has children first. Reverse it to get consumers first.)
  const processOrder = order.slice().reverse();  // consumers before producers

  for (const it of processOrder) {
    const demand = pendingDemand[it] || 0;
    if (demand <= 0) continue;

    // Hold back the explicitly requested amount — only demand ABOVE it may be
    // covered by stock already on hand.
    const allocatable = Math.max(0, demand - (requestedQty[it] || 0));

    if (!CRAFTABLE.has(it)) {
      // raw item: allocate from owned, rest goes to acquire
      const fromOwn = allocOwned(it, allocatable);
      let need = demand - fromOwn;
      if (need > 0) {
        // A mining discount is economic context, never a material-yield modifier.
        // Production still consumes the full recipe quantity.
        const sites = MINE_SITES[it] || [];
        acquire[it] = acquire[it] || { qty: 0, from: [] };
        acquire[it].to = transportTargetFor(it);
        acquire[it].qty += need;
        sites.forEach(s => { if (!acquire[it].from.includes(s)) acquire[it].from.push(s); });
        acquire[it].preferred = defaultObtainSite(it, sites);
      }
      continue;
    }

    // craftable
    const recipe = RECIPES_BY_OUTPUT[it][0];
    const fromOwn = allocOwned(it, allocatable);
    const needToProduce = demand - fromOwn;

    if (needToProduce > 0) {
      const outQty = recipe.output.quantity;
      const batches = Math.ceil(needToProduce / outQty);
      const produced = batches * outQty;
      const extra = produced - needToProduce;

      if (extra > 0) {
        ledger[it] = (ledger[it] || 0) + extra;
        surplus[it] = extra;
      }

      // Resolve inputs and propagate demand to children. Alternative-path
      // economics follow the colony where this step will actually run.
      const isFinal = items.some(x => x.item === it);
      const stepLocation = isFinal ? dest : refineDest;
      const altIndex = recipe.inputs ? null : pickAlternativeIndex(recipe, chosen[it], demand, stepLocation);
      const inputs = recipe.inputs || recipe.inputs_alternatives[altIndex];
      const resolvedInputs = [];
      const consumerKind = isFinal ? 'manufacture' : 'refine';
      inputs.forEach(inp => {
        if (!consumerKinds[inp.item]) consumerKinds[inp.item] = new Set();
        consumerKinds[inp.item].add(consumerKind);
        const need = inp.quantity * batches;
        pendingDemand[inp.item] = (pendingDemand[inp.item] || 0) + need;
        resolvedInputs.push({ item: inp.item, qty: need });
      });

      steps.push({
        item: it, batches, produced, outQty,
        process: recipe.process,
        location: stepLocation,
        inputs: resolvedInputs.map(i => ({
          item: i.item,
          need: i.qty,
          fromOwn: 0,
          stillNeed: i.qty
        })),
        resolvedInputs,  // for applyPlan — single source of truth
        altIndex,        // which alternative path was actually used (null = fixed recipe)
        surplus: extra,
        type: isFinal ? 'manufacture' : 'refine'
      });
    }
  }

  // Steps were pushed in consumption order (finals first). Reverse to
  // build order (raws first) for correct display and applyPlan flow.
  steps.reverse();

  // Separate refine from manufacture for backward compat rendering
  const refine = steps.filter(s => s.type === 'refine');
  const manufacture = steps.filter(s => s.type === 'manufacture');
  const finalTransport = {};
  if (refineDest !== dest) {
    const refinedOutputs = new Set(refine.map(step => step.item));
    manufacture.forEach(step => (step.resolvedInputs || []).forEach(inp => {
      const kinds = consumerKinds[inp.item];
      const alsoRefined = kinds && kinds.has('refine') && kinds.has('manufacture');
      if (!refinedOutputs.has(inp.item) && !alsoRefined) return;
      finalTransport[inp.item] = (finalTransport[inp.item] || 0) + inp.qty;
    }));
  }

  return {
    plan: {
      transport, acquire, refine, manufacture, steps, surplus,
      destination: dest,
      refineDestination: refineDest,
      finalTransport,
    },
    ledger
  };
}

// =========================================================================
// APPLY PLAN — applies the ledger against the player's actual inventory.
// Consumes inputs correctly: transports owned stock to destination, deducts
// consumed materials, adds produced finals. Raw acquisition is NOT applied
// (the player mines those manually).
// =========================================================================

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = {
    compute, DESTINATION, RECIPES_BY_OUTPUT, CRAFTABLE, MINED, MINE_SITES,
    FINAL_ITEMS, ALL_ITEMS, CATEGORIES, ALTERNATIVE_CHOICES, LOCATIONS,
    pickAlternativeIndex, scoreAlternative, concreteInputs,
    netPathCost, netUnitCost, colonyFactor,
    esc, displayName, normalizeSearchText, fmt, iconFor, itemTypeLabel, showItemDetail,
    /** Proxy that delegates every property access to window.STORE.INV_TOTAL */
    get INV_TOTAL() { return INV_TOTAL; },
    set INV_TOTAL(v) { window.STORE.INV_TOTAL = v; },
    get INV_LOCATIONS() { return INV_LOCATIONS; },
    set INV_LOCATIONS(v) { window.STORE.INV_LOCATIONS = v; },
  };
}
window.ENGINE = {
  compute, DESTINATION, RECIPES_BY_OUTPUT, CRAFTABLE, MINED, MINE_SITES,
  FINAL_ITEMS, ALL_ITEMS, CATEGORIES, ALTERNATIVE_CHOICES, LOCATIONS,
  pickAlternativeIndex, scoreAlternative, concreteInputs,
  netPathCost, netUnitCost, colonyFactor,
  esc, displayName, normalizeSearchText, fmt, iconFor, itemTypeLabel, showItemDetail,
  /** item → preferred source colony for transport (live, set by the UI) */
  get TRANSPORT_SOURCE() { return TRANSPORT_SOURCE; },
  set TRANSPORT_SOURCE(v) { TRANSPORT_SOURCE = v || {}; },
  /** Proxy that delegates every property access to window.STORE.INV_TOTAL */
  get INV_TOTAL() { return INV_TOTAL; },
  set INV_TOTAL(v) { window.STORE.INV_TOTAL = v; },
  get INV_LOCATIONS() { return INV_LOCATIONS; },
  set INV_LOCATIONS(v) { window.STORE.INV_LOCATIONS = v; },
};
})();
