/**
 * src/views/inventory.js — Inventory management
 * ============================================================================
 * Zone editor, totals, mining reference, and inventory table.
 */
'use strict';

// ── Inventory dashboard cards ──
function renderInvDashboard() {
  var inv = getInv();
  var items = {};
  var colonies = new Set();
  inv.forEach(function(e) {
    items[e.item] = (items[e.item] || 0) + e.quantity;
    colonies.add(e.location);
  });
  var totalUnits = 0, keys = Object.keys(items);
  for (var i = 0; i < keys.length; i++) totalUnits += items[keys[i]];
  var totalTypes = keys.length;
  var topItem = '', topQty = 0;
  for (var k in items) { if (items[k] > topQty) { topItem = k; topQty = items[k]; } }

  var html =
    '<div class="inv-dash-card">' +
      '<div class="idc-value">' + fmt(totalUnits) + '</div>' +
      '<div class="idc-label">Total Units</div>' +
    '</div>' +
    '<div class="inv-dash-card">' +
      '<div class="idc-value">' + totalTypes + '</div>' +
      '<div class="idc-label">Item Types</div>' +
    '</div>' +
    '<div class="inv-dash-card">' +
      '<div class="idc-value">' + colonies.size + '</div>' +
      '<div class="idc-label">Colonies Stocked</div>' +
    '</div>' +
    (topItem ?
    '<div class="inv-dash-card">' +
      '<div class="idc-value">' + iconFor(topItem) + ' ' + fmt(topQty) + '</div>' +
      '<div class="idc-label">Most Stocked — ' + esc(displayName(topItem)) + '</div>' +
    '</div>' : '');

  var el = document.getElementById('inv-dashboard');
  if (el) el.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════════
// § INVENTORY TAB — zone editor, totals, item search
// ═══════════════════════════════════════════════════════════════════════════
let ACTIVE_ZONE = '';

function updateInventoryZoneLabels() {
  const label = ACTIVE_ZONE || 'this zone';
  const nameEl = document.getElementById('inv-addzone-name');
  const buttonEl = document.getElementById('inv-addzone-button-zone');
  if (nameEl) nameEl.textContent = label;
  if (buttonEl) buttonEl.textContent = ACTIVE_ZONE || 'zone';
}

function populateZones() {
  const sel = document.getElementById('inv-zone');
  if (!sel) return;
  // Storage list, not the production one: this includes hubs like Berlin AND
  // non-production spots like an apartment, which still hold stock. Union with
  // wherever the player actually has items so nothing can ever be stranded.
  const all = [...new Set(storageList().concat(getInv().map(e => e.location)))]
    .sort((a, b) => a.localeCompare(b));
  sel.innerHTML = '<option value="" disabled>select zone…</option>' +
    all.map(z => `<option value="${esc(z)}">${esc(z)}</option>`).join('');
  if (!ACTIVE_ZONE && all.length) ACTIVE_ZONE = all[0];
  if (ACTIVE_ZONE && all.includes(ACTIVE_ZONE)) sel.value = ACTIVE_ZONE;
  else { ACTIVE_ZONE = ''; sel.value = ''; }
  updateInventoryZoneLabels();
}

function renderZone() {
  const zone = ACTIVE_ZONE;
  const body = document.getElementById('zone-body');
  const totalEl = document.getElementById('zone-total');
  if (!zone) {
    body.innerHTML = '<div class="muted">Pick a zone above to view and edit its stock. Use <b>Add item</b> to log new material gathered at that zone.</div>';
    totalEl.textContent = '';
    return;
  }
  // Highest quantity first, matching how the in-game storage screen lists stock
  // (name as tiebreaker so equal amounts keep a stable, predictable order).
  const entries = getInv().filter(e => e.location === zone)
    .sort((a, b) => b.quantity - a.quantity || a.item.localeCompare(b.item));
  const total = entries.reduce((s, e) => s + e.quantity, 0);
  totalEl.textContent = `${fmt(total)} units · ${entries.length} item types`;
  if (!entries.length) {
    body.innerHTML = '<div class="muted">No stock logged at this zone yet. Use <b>Add item</b> below to record what you gathered here.</div>';
    return;
  }
  // Target-zone options are the same for every row — build once.
  // storageList(): you can move stock to an apartment even though you can't
  // manufacture there.
  var otherZones = storageList().filter(function(z) { return z !== zone; });
  var zoneOpts = '<option value="" disabled selected>move to…</option>' +
    otherZones.map(function(z) { return '<option value="' + esc(z) + '">' + esc(z) + '</option>'; }).join('');

  body.innerHTML = entries.map(e => {
    var mined = MINE_SITES[e.item] ? ' <span class="tag mine">mineable</span>' : '';
    var enc = encodeURIComponent(e.item);
    return '<div class="zone-row-item" data-item="' + enc + '">' +
        '<label class="zr-cb"><input type="checkbox" data-zm="' + enc + '" aria-label="Select ' + esc(e.item) + '" /></label>' +
        '<span class="zr-ic">' + iconFor(e.item) + '</span>' +
        // data-idp sits on an INNER inline span, never on the flex item. A flex
        // item's box can be wider than its text, so putting the trigger on
        // .zr-name meant the blank space beside the name still opened the card.
        // An inline span hugs its text no matter how the row is laid out.
        '<span class="zr-name"><span class="idp-link" role="button" tabindex="0" data-idp="' + enc + '">' + esc(displayName(e.item)) + '</span></span>' + mined +
        '<span class="zr-qty"><input type="number" min="0" value="' + e.quantity + '" data-zq="' + enc + '" aria-label="Quantity of ' + esc(e.item) + ' at ' + esc(zone) + '" /></span>' +
        // Per-row move: this shifts a whole stack, and players
        // usually want to send just part of one — so say so on the button.
        '<button class="zr-move-btn" data-zmove="' + enc + '" title="Move some or all of this to another zone" aria-label="Move some of ' + esc(e.item) + ' to another zone">➜ Move…</button>' +
        '<button class="zr-x" data-zx="' + enc + '" title="Remove ' + esc(e.item) + ' from ' + esc(zone) + '" aria-label="Remove ' + esc(e.item) + ' from ' + esc(zone) + '">✕</button>' +
        '<div class="zr-move" hidden>' +
          '<span class="zr-move-lbl">Move</span>' +
          '<input type="number" class="zr-move-qty" min="1" max="' + e.quantity + '" value="' + e.quantity + '" aria-label="Quantity to move" />' +
          '<span class="zr-move-lbl">of <b>' + fmt(e.quantity) + '</b></span>' +
          // one-tap fractions make it obvious the amount is yours to choose
          '<span class="zr-move-presets">' +
            '<button type="button" class="zr-preset" data-frac="0.25">¼</button>' +
            '<button type="button" class="zr-preset" data-frac="0.5">½</button>' +
            '<button type="button" class="zr-preset" data-frac="1">All</button>' +
          '</span>' +
          '<span class="zr-move-lbl">to</span>' +
          '<select class="zr-move-to" aria-label="Destination zone">' + zoneOpts + '</select>' +
          '<button class="zr-move-go" data-zmovego="' + enc + '">Move</button>' +
          '<button class="zr-move-cancel ghost">Cancel</button>' +
        '</div>' +
      '</div>';
  }).join('');
}

// Move part (or all) of one item's stack from the active zone to another.
function doRowMove(row) {
  var item = decodeURIComponent(row.dataset.item);
  var qtyEl = row.querySelector('.zr-move-qty');
  var toEl = row.querySelector('.zr-move-to');
  var target = toEl && toEl.value;
  if (!target) { toast('Pick a destination zone.'); return; }
  var have = getInv()
    .filter(function(e) { return e.item === item && e.location === ACTIVE_ZONE; })
    .reduce(function(s, e) { return s + e.quantity; }, 0);
  var qty = Math.max(1, Math.min(have, parseInt(qtyEl && qtyEl.value, 10) || 0));
  if (!have) { toast('Nothing to move — none stocked here.'); return; }
  applyEntry(item, ACTIVE_ZONE, qty, 'subtract');
  applyEntry(item, target, qty, 'add');
  refreshInventoryUI();
  toast('Moved ' + fmt(qty) + ' ' + displayName(item) + ' → ' + target + '.', 3000, 'success');
}

function updateZoneTotal() {
  const totalEl = document.getElementById('zone-total');
  if (!totalEl || !ACTIVE_ZONE) { if (totalEl) totalEl.textContent = ''; return; }
  const entries = getInv().filter(e => e.location === ACTIVE_ZONE);
  const total = entries.reduce((s, e) => s + e.quantity, 0);
  totalEl.textContent = `${fmt(total)} units · ${entries.length} item types`;
}

// ── Zone-to-zone move ──
var ZONE_MOVE_SELECTED = new Set();

function updateMoveBar() {
  var bar = document.getElementById('zone-movebar');
  var sel = document.getElementById('zone-move-target');
  if (!bar || !sel) return;
  var n = ZONE_MOVE_SELECTED.size;
  bar.hidden = n === 0;
  // Update labels UNCONDITIONALLY — doing it only while visible left the count
  // frozen at its last value ("Clear (2)") after the selection was cleared.
  var clr = document.getElementById('zone-move-clear');
  if (clr) clr.textContent = n ? 'Clear (' + n + ')' : 'Clear';
  // Be explicit that this shifts WHOLE stacks — the per-row button does partials.
  var go = document.getElementById('zone-move-go');
  if (go) go.textContent = n ? 'Move all ' + n + ' item' + (n !== 1 ? 's' : '') : 'Move all';
  var all = storageList().filter(function(z) { return z !== ACTIVE_ZONE; });
  // Keep the destination already chosen \u2014 this runs on every checkbox tick, and
  // rebuilding blindly reset the dropdown out from under the user.
  var prev = sel.value;
  sel.innerHTML = '<option value="" disabled' + (prev ? '' : ' selected') + '>select\u2026</option>' +
    all.map(function(z) {
      return '<option value="' + esc(z) + '"' + (z === prev ? ' selected' : '') + '>' + esc(z) + '</option>';
    }).join('');
}

function doZoneMove() {
  var target = document.getElementById('zone-move-target').value;
  if (!target) { toast('Pick a target zone.'); return; }
  var count = 0;
  ZONE_MOVE_SELECTED.forEach(function(item) {
    var entries = getInv().filter(function(e) { return e.item === item && e.location === ACTIVE_ZONE; });
    var qty = entries.reduce(function(s, e) { return s + e.quantity; }, 0);
    if (qty <= 0) return; // nothing actually stocked here — don't report a move
    applyEntry(item, ACTIVE_ZONE, qty, 'subtract');
    applyEntry(item, target, qty, 'add');
    count++;
  });
  if (!count) { toast('Nothing to move — selected items have no stock here.'); ZONE_MOVE_SELECTED.clear(); updateMoveBar(); return; }
  ZONE_MOVE_SELECTED.clear();
  updateMoveBar();
  refreshInventoryUI();
  toast('Moved ' + count + ' item(s) to ' + target + '.', 3000, 'success');
}

function renderInventory() {
  // Normalized so common spelling variants (e.g. medkit vs the game's
  // MediKit) match; see engine.normalizeSearchText.
  const normalizeSearchText = window.ENGINE.normalizeSearchText;
  const q = normalizeSearchText(document.getElementById('inv-search')?.value || '');
  const materialsOnly = document.getElementById('inv-materials-only')?.checked;
  const inv = getInv();
  const items = {};
  inv.forEach(e => {
    if (q && !(normalizeSearchText(e.item).includes(q) || normalizeSearchText(e.location).includes(q))) return;
    if (materialsOnly) {
      if (MINE_SITES[e.item]) { /* raw material — keep */ }
      else {
        // Check if this item is an INPUT to any recipe (not just craftable output)
        var isInput = DATA.recipes.some(function(r) {
          var inputs = r.inputs || (r.inputs_alternatives && r.inputs_alternatives[0]);
          return inputs && inputs.some(function(i) { return i.item === e.item; });
        });
        if (!isInput) return;
      }
    }
    (items[e.item] = items[e.item] || { total: 0, locs: [] }).total += e.quantity;
    items[e.item].locs.push(e);
  });
  const rows = Object.entries(items).sort((a, b) => a[0].localeCompare(b[0]));
  document.getElementById('inv-totals').innerHTML =
    `<div class="muted">${esc(PLAYERS.active)} · ${Object.keys(items).length} item types · ${inv.length} location entries · ${fmt(rows.reduce((s, r) => s + r[1].total, 0))} total units</div>`;
  const renderLocationTags = (name, info) => {
    const locs = info.locs.slice().sort((a, b) => b.quantity - a.quantity)
      .map(l => `<span class="tag have" data-del="${encodeURIComponent(l.location)}" title="click ✕ to remove">${esc(l.location)}: ${fmt(l.quantity)} <button class="x" data-item="${encodeURIComponent(name)}" data-loc="${encodeURIComponent(l.location)}" aria-label="Remove ${esc(name)} at ${esc(l.location)}">✕</button></span>`).join(' ');
    const mined = MINE_SITES[name] ? `<span class="tag mine">mineable</span>` : '';
    return { locs, mined };
  };
  const body = rows.map(([name, info]) => {
    const locationTags = renderLocationTags(name, info);
    return `<tr><td>${iconFor(name)}<span class="idp-link" role="button" tabindex="0" data-idp="${encodeURIComponent(name)}">${esc(displayName(name))}</span></td><td style="text-align:right">${fmt(info.total)}</td><td>${locationTags.locs} ${locationTags.mined}</td></tr>`;
  }).join('');
  const cards = rows.map(([name, info]) => {
    const locationTags = renderLocationTags(name, info);
    return `<article class="inventory-total-card">
      <div class="inventory-total-card-head">
        <div class="inventory-total-card-item">${iconFor(name)}<span class="idp-link" role="button" tabindex="0" data-idp="${encodeURIComponent(name)}">${esc(displayName(name))}</span></div>
        <strong class="inventory-total-qty">${fmt(info.total)}</strong>
      </div>
      <div class="inventory-total-card-locations">
        <span class="inventory-total-card-label">Locations</span>
        <div class="inventory-total-card-tags">${locationTags.locs} ${locationTags.mined}</div>
      </div>
    </article>`;
  }).join('');
  document.getElementById('inv-table').innerHTML =
    `<div class="inventory-table-desktop"><table>
      <caption class="sr-only">Inventory totals by item — total held and locations</caption>
      <thead><tr><th scope="col">Item</th><th scope="col">Total</th><th scope="col">Locations</th></tr></thead><tbody>${body}</tbody></table></div>
     <div class="inventory-table-cards" aria-label="Inventory totals by item">${cards}</div>`;
  renderInvDashboard();
}

// The Mining view lived here — a site → ores table. The Colonies tab already
// showed the same pairing as cards, so it absorbed the parts this added: ore
// icons, how much of each you hold, and searching by ore rather than by place.


// ── Quick-add item picker ──
// Materials by default — stocking a colony is overwhelmingly about raw and
// intermediate crafting inputs, not finished goods.
var QP_CATEGORY = 'Materials';

function renderInventorySelection() {
  var value = document.getElementById('inv-item')?.value.trim();
  var output = document.getElementById('inv-selected-item');
  if (!output) return;
  if (!value) {
    output.textContent = 'Choose an item icon above';
    output.classList.remove('has-selection');
    return;
  }
  output.innerHTML = iconFor(value) + '<span>' + esc(displayName(value)) + '</span>';
  output.classList.add('has-selection');
}

// item → lowercased category, cached (catOf() scans every recipe, and the
// picker asks for all ~330 items on each render).
var QP_CAT_CACHE = {};
function qpCategoryOf(name) {
  if (QP_CAT_CACHE[name] === undefined) QP_CAT_CACHE[name] = (catOf(name) || '').toLowerCase();
  return QP_CAT_CACHE[name];
}

function renderQuickPicker() {
  var cats = [
    { value: 'Materials', label: 'Mined + refined' },
    { value: 'Mineable', label: 'Mineable' },
    { value: 'All', label: 'All items' }
  ];
  var catsEl = document.getElementById('qp-cats');
  if (catsEl) {
    catsEl.innerHTML = cats.map(function(c) {
      var active = c.value === QP_CATEGORY ? ' active' : '';
      return '<button class="qp-cat' + active + '" data-qp-cat="' + esc(c.value) + '">' + esc(c.label) + '</button>';
    }).join('');
  }

  var all = Array.from(ALL_ITEMS).sort(function(a,b) { return a.localeCompare(b); });
  var filtered = all.filter(function(name) {
    if (QP_CATEGORY === 'All') return true;
    if (QP_CATEGORY === 'Materials') {
      if (!!MINE_SITES[name]) return true;
      return DATA.recipes.some(function(r) {
        var inputs = r.inputs || (r.inputs_alternatives && r.inputs_alternatives[0]);
        return inputs && inputs.some(function(i) { return i.item === name; });
      });
    }
    if (QP_CATEGORY === 'Mineable') return !!MINE_SITES[name];
    // CATEGORIES is an ARRAY of category names, not an item→category map, so
    // CATEGORIES[name] was always undefined and every category tab came back
    // empty. catOf() resolves the item's real category (cached below).
    return qpCategoryOf(name).indexOf(QP_CATEGORY.toLowerCase()) !== -1;
  });

  // Free-text search across ALL items. Without this the grid capped at 60 of
  // 300+ items, so anything you didn't already stock was unreachable except by
  // typing its exact name. Normalized like the other item searches so common
  // spelling variants (e.g. medkit vs MediKit) match.
  var term = normalizeSearchText(document.getElementById('qp-search')?.value || '');
  if (term) {
    filtered = filtered.filter(function(name) { return normalizeSearchText(name).indexOf(term) !== -1; });
  }

  // "have" reflects the ZONE you're stocking, not the global total — that's the
  // number you're checking against your in-game storage screen.
  var atZone = {};
  getInv().forEach(function(e) {
    if (e.location === ACTIVE_ZONE) atZone[e.item] = (atZone[e.item] || 0) + e.quantity;
  });

  var scored = filtered.map(function(name) {
    return { name: name, qty: atZone[name] || 0, mined: !!MINE_SITES[name] };
  });
  scored.sort(function(a,b) { return b.qty - a.qty || a.name.localeCompare(b.name); });
  var cap = term ? 200 : 60; // searching implies intent — show far more matches
  var top = scored.slice(0, cap);

  var gridEl = document.getElementById('qp-grid');
  if (gridEl) {
    if (!top.length) {
      gridEl.innerHTML = '<div class="muted qp-empty">No items match “' + esc(term) + '” in ' + esc(QP_CATEGORY) + '.</div>';
    } else {
      var sel = document.getElementById('inv-item')?.value.trim();
      gridEl.innerHTML = top.map(function(s) {
        // Icon leads; the name is a two-line caption; counts/mineable sit in the
        // corners so they never push the artwork around.
        var have = s.qty > 0 ? '<span class="qp-have">' + fmt(s.qty) + '</span>' : '';
        var minedTag = s.mined ? '<span class="qp-mined" aria-hidden="true">⛏</span>' : '';
        var isSel = s.name === sel ? ' selected' : '';
        return '<button class="qp-item' + isSel + '" data-qp-item="' + esc(s.name) + '"' +
          ' title="' + esc(displayName(s.name)) + (s.qty > 0 ? ' — ' + fmt(s.qty) + ' here' : '') + '">' +
          minedTag + have + iconFor(s.name) +
          '<span class="qp-name">' + esc(displayName(s.name)) + '</span></button>';
      }).join('') +
      (scored.length > top.length
        ? '<div class="muted qp-empty">+' + (scored.length - top.length) + ' more — keep typing to narrow</div>'
        : '');
    }
  }
  renderInventorySelection();
}

// ── Item detail slide-out panel ──
// Opened by clicking an item name in the zone editor or the totals table.
function showInvItemDetail(name) {
  var panel = document.getElementById('inv-detail-panel');
  var overlay = document.getElementById('inv-detail-overlay');
  if (!panel || !overlay) return;

  var locs = (INV_LOCATIONS[name] || []).slice().sort(function(a, b) { return b.qty - a.qty; });
  var total = INV_TOTAL[name] || 0;
  var mines = MINE_SITES[name] || [];
  var producedBy = RECIPES_BY_OUTPUT[name] || [];

  // Recipes that CONSUME this item (fixed inputs or any alternative set).
  var usedIn = [];
  DATA.recipes.forEach(function(r) {
    var hit = (r.inputs || []).some(function(i) { return i.item === name; }) ||
      (r.inputs_alternatives || []).some(function(alt) {
        return alt.some(function(i) { return i.item === name; });
      });
    if (hit && usedIn.indexOf(r.output.item) === -1) usedIn.push(r.output.item);
  });

  var html = '<div class="idp-head">' +
      iconFor(name) + '<span class="idp-name">' + esc(displayName(name)) + '</span>' +
      '<button class="idp-close" id="idp-close" aria-label="Close item details">×</button>' +
    '</div>' +
    '<div class="idp-total">Total held: <b>' + fmt(total) + '</b></div>';

  if (locs.length) {
    html += '<h5>Locations</h5><table class="idp-table"><thead><tr><th scope="col">Zone</th><th scope="col" class="r">Qty</th></tr></thead><tbody>' +
      locs.map(function(l) {
        return '<tr><td>' + esc(l.location) + '</td><td class="r">' + fmt(l.qty) + '</td></tr>';
      }).join('') + '</tbody></table>';
  } else {
    html += '<div class="muted">None held in any zone.</div>';
  }

  if (mines.length) {
    html += '<h5>Mineable At</h5><div class="idp-tags">' +
      mines.map(function(s) { return '<span class="tag mine">' + esc(s) + '</span>'; }).join(' ') + '</div>';
  }

  if (producedBy.length) {
    html += '<h5>Crafting Recipes</h5>';
    producedBy.slice(0, 5).forEach(function(r) {
      var sets = r.inputs ? [r.inputs] : (r.inputs_alternatives || []);
      var ins = sets.map(function(set) {
        return set.map(function(i) { return fmt(i.quantity) + ' ' + esc(displayName(i.item)); }).join(' + ');
      }).join('  <span class="muted">OR</span>  ') || '<span class="muted">—</span>';
      html += '<div class="idp-recipe"><b>' + fmt(r.output.quantity) + ' × ' +
        esc(displayName(name)) + '</b> ← ' + ins + '</div>';
    });
    if (producedBy.length > 5) {
      html += '<div class="muted">+' + (producedBy.length - 5) + ' more recipes</div>';
    }
  }

  if (usedIn.length) {
    html += '<h5>Used In</h5><div class="idp-tags">' +
      usedIn.slice(0, 24).sort().map(function(o) { return '<span class="tag">' + esc(displayName(o)) + '</span>'; }).join(' ') +
      (usedIn.length > 24 ? ' <span class="muted">+' + (usedIn.length - 24) + ' more</span>' : '') + '</div>';
  }

  // FINAL_ITEMS is an ARRAY (not a Set) — use includes(), not has().
  if (FINAL_ITEMS.includes(name)) {
    html += '<button class="idp-calc primary" id="idp-plan" data-idp-plan="' + encodeURIComponent(name) + '">🔧 Plan in Calculator</button>';
  }

  panel.innerHTML = html;
  // Keep attribute and class in sync — `hidden` also drives the a11y tree.
  overlay.hidden = false;
  overlay.classList.add('open');
}

function closeInvDetail() {
  var overlay = document.getElementById('inv-detail-overlay');
  var panel = document.getElementById('inv-detail-panel');
  // Must drop .open: `.inv-detail-overlay.open{display:flex}` outweighs the
  // [hidden] attribute, so setting hidden alone left the panel stuck open.
  if (overlay) { overlay.classList.remove('open', 'ss-center'); overlay.hidden = true; }
  // Scanner mode temporarily widens/centers the shared item-detail panel. If
  // those classes survive Cancel, the next ordinary item detail opens with the
  // scanner's layout and the overlay remains in the wrong alignment.
  if (panel) { panel.classList.remove('ss-mode'); panel.innerHTML = ''; }
  if (SS_OBJECT_URL) { try { URL.revokeObjectURL(SS_OBJECT_URL); } catch (e) {} }
  SS_OBJECT_URL = null;
  SS_IMG = null;
  SS_CANVAS = null;
  SS_MATCHES = [];
  SS_PENDING = null;
  SS_CANDIDATE_QUERY = '';
}

// ── Inventory charts (lazy — rendered when the <details> is expanded) ──
// Chart.js itself is also lazy: it is not part of the initial payload. The
// first expand pulls src/vendor/chart.min.js in via the chart-loader stub
// (src/ui/chart-loader.js, window.cmgLoadChart) and the service worker
// runtime-caches it, so repeated opens cost nothing extra.
var invChartInstances = {};

// Chart.js draws to canvas and cannot resolve CSS custom properties
// ("var(--panel)" is not a colour to a 2D context), so the palette is declared
// here, mirrored from the theme blocks in styles.css.
//
// It used to be READ from the live custom properties, which is where the "click
// a theme twice" behaviour came from: immediately after the theme attribute
// flips, a computed-style read can still return the OUTGOING theme's values, so
// every chart painted exactly one theme behind. Probing an element and
// deferring to requestAnimationFrame both narrowed the window without closing
// it — the read is inherently racy.
//
// The theme ATTRIBUTE is set synchronously and is always correct, so key off
// that instead. No reads, no timing, no way to be off by one.
//
// Trade-off: these duplicate styles.css. If a theme's palette changes there,
// change it here too — charts won't follow automatically.
var INV_CHART_THEMES = {
  dark:  { text:'#e0e0f0', muted:'#8a8ab8', line:'#1e1e3a', panel:'#12121e', accent:'#ff2d95', cyan:'#00f0ff', light:false },
  light: { text:'#1a1830', muted:'#6a6880', line:'#c8c6d8', panel:'#ffffff', accent:'#c01860', cyan:'#0070a0', light:true  },
  trans: { text:'#1a1a30', muted:'#7a7aaa', line:'#c8d4f0', panel:'#ffffff', accent:'#4dc8f0', cyan:'#f598b0', light:true  },
  pride: { text:'#f0e8ff', muted:'#a99fd0', line:'#2a2248', panel:'#18142a', accent:'#ff2d95', cyan:'#00e5ff', light:false },
  cmg:   { text:'#ffffff', muted:'#a89880', line:'#262626', panel:'#171717', accent:'#f59e0b', cyan:'#fbbf24', light:false }
};
function invChartTheme() {
  return INV_CHART_THEMES[document.documentElement.dataset.theme] || INV_CHART_THEMES.dark;
}

// Kept for any other caller; charts use invChartTheme().
function cssVar(name, fallback) {
  try {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch (e) { return fallback; }
}

function destroyInvCharts() {
  Object.keys(invChartInstances).forEach(function(k) {
    try { invChartInstances[k].destroy(); } catch (e) {}
  });
  invChartInstances = {};
}

// True when the active theme paints on a light background — series colours and
// grid contrast have to flip, or everything washes out.
function invThemeIsLight() {
  return invChartTheme().light;
}

// Categorical palette. Fixed hues (evenly spaced so adjacent slices stay
// distinguishable) with lightness/saturation tuned per background: darker and
// more saturated on light themes, brighter on dark ones.
function invPalette(n) {
  var hues = [200, 330, 265, 40, 150, 15, 95, 300, 175, 55];
  var light = invThemeIsLight();
  var out = [];
  for (var i = 0; i < n; i++) {
    var h = hues[i % hues.length];
    // shift later cycles so an 11th slice doesn't duplicate the 1st
    h = (h + Math.floor(i / hues.length) * 18) % 360;
    out.push(light ? 'hsl(' + h + ', 62%, 42%)' : 'hsl(' + h + ', 68%, 60%)');
  }
  return out;
}

// Display category for charts — catOf() walks every recipe, so memoise it.
var INV_CAT_CACHE = {};
function invCatOf(name) {
  if (INV_CAT_CACHE[name] === undefined) {
    INV_CAT_CACHE[name] = catOf(name) || (MINE_SITES[name] ? 'Raw material' : 'Other');
  }
  return INV_CAT_CACHE[name];
}

// Is this item a crafting input (raw or intermediate) rather than an end product?
var INV_IS_MATERIAL_CACHE = {};
function invIsMaterial(name) {
  if (INV_IS_MATERIAL_CACHE[name] === undefined) {
    INV_IS_MATERIAL_CACHE[name] = !!MINE_SITES[name] || DATA.recipes.some(function(r) {
      var sets = r.inputs ? [r.inputs] : (r.inputs_alternatives || []);
      return sets.some(function(set) {
        return set.some(function(i) { return i.item === name; });
      });
    });
  }
  return INV_IS_MATERIAL_CACHE[name];
}

function renderInvCharts() {
  if (typeof Chart === 'undefined') {
    // Vendor script not loaded yet — pull it in on demand (single-flight via
    // the chart-loader stub) and render as soon as it lands. If the fetch
    // fails, surface it instead of leaving the panel silently blank.
    if (typeof window.cmgLoadChart !== 'function') return;
    window.cmgLoadChart().then(function() { renderInvCharts(); }).catch(function(err) {
      console.error('[inventory] Chart.js failed to load:', err);
      var grid = document.getElementById('inv-charts');
      var empty = document.getElementById('inv-charts-empty');
      if (empty) {
        empty.hidden = false;
        empty.textContent = 'Charts could not be loaded — reopen the panel to try again.';
      }
      if (grid) grid.style.display = 'none';
    });
    return;
  }
  var cv = {
    colony: document.getElementById('inv-chart-colony'),
    items: document.getElementById('inv-chart-topitems'),
    category: document.getElementById('inv-chart-category'),
    split: document.getElementById('inv-chart-split')
  };
  if (!cv.colony || !cv.items) return;

  // Always rebuild from current data; a live Chart owning the canvas would
  // otherwise throw "Canvas is already in use".
  destroyInvCharts();

  var inv = getInv();
  var empty = document.getElementById('inv-charts-empty');
  var grid = document.getElementById('inv-charts');
  if (empty) empty.hidden = inv.length > 0;
  if (grid) grid.style.display = inv.length ? '' : 'none';
  if (!inv.length) return;

  // Straight from the theme attribute — no computed-style read, so it cannot
  // lag a theme switch (see INV_CHART_THEMES).
  var C = invChartTheme();
  var light = C.light;
  var fg = C.muted, text = C.text, line = C.line;
  var panel = C.panel, accent = C.accent, cyan = C.cyan;
  // Tooltips must sit against the opposite of the page, not always black.
  var tip = {
    backgroundColor: light ? 'rgba(20,18,40,.94)' : 'rgba(10,10,20,.94)',
    titleColor: '#fff', bodyColor: '#fff',
    borderColor: light ? 'rgba(255,255,255,.25)' : line, borderWidth: 1
  };
  var legend = { position: 'right', labels: { color: text, font: { size: 10 }, boxWidth: 12, padding: 8 } };
  var gridLine = light ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.07)';

  var colonyTotals = {}, itemTotals = {}, catTotals = {}, splitByColony = {};
  inv.forEach(function(e) {
    colonyTotals[e.location] = (colonyTotals[e.location] || 0) + e.quantity;
    itemTotals[e.item] = (itemTotals[e.item] || 0) + e.quantity;
    var cat = invCatOf(e.item);
    catTotals[cat] = (catTotals[cat] || 0) + e.quantity;
    var s = splitByColony[e.location] = splitByColony[e.location] || { mat: 0, prod: 0 };
    if (invIsMaterial(e.item)) s.mat += e.quantity; else s.prod += e.quantity;
  });

  // 1) Units by colony ------------------------------------------------------
  var colonyLabels = Object.keys(colonyTotals).sort(function(a, b) { return colonyTotals[b] - colonyTotals[a]; });
  invChartInstances.colony = new Chart(cv.colony.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: colonyLabels,
      datasets: [{
        data: colonyLabels.map(function(c) { return colonyTotals[c]; }),
        backgroundColor: invPalette(colonyLabels.length),
        borderColor: panel, borderWidth: 2, hoverOffset: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: true, cutout: '55%',
      plugins: {
        legend: legend, tooltip: Object.assign({}, tip, { callbacks: { label: invPctLabel(colonyTotals) } })
      }
    }
  });

  // 2) Top 10 items ---------------------------------------------------------
  var topItems = Object.keys(itemTotals)
    .map(function(k) { return [k, itemTotals[k]]; })
    .sort(function(a, b) { return b[1] - a[1]; })
    .slice(0, 10);
  invChartInstances.topitems = new Chart(cv.items.getContext('2d'), {
    type: 'bar',
    data: {
      labels: topItems.map(function(e) { return displayName(e[0]); }),
      datasets: [{
        label: 'Units held',
        data: topItems.map(function(e) { return e[1]; }),
        // colour-code by kind so materials read apart from finished goods
        backgroundColor: topItems.map(function(e) { return invIsMaterial(e[0]) ? cyan : accent; }),
        borderWidth: 0, borderRadius: 3, barPercentage: 0.8
      }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: true,
      scales: {
        x: { beginAtZero: true, ticks: { color: fg, font: { size: 9 } }, grid: { color: gridLine } },
        y: { ticks: { color: text, font: { size: 9 } }, grid: { display: false } }
      },
      plugins: { legend: { display: false }, tooltip: tip }
    }
  });

  // 3) Units by category ----------------------------------------------------
  if (cv.category) {
    var catLabels = Object.keys(catTotals).sort(function(a, b) { return catTotals[b] - catTotals[a]; });
    invChartInstances.category = new Chart(cv.category.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: catLabels,
        datasets: [{
          data: catLabels.map(function(c) { return catTotals[c]; }),
          backgroundColor: invPalette(catLabels.length).reverse(), // offset vs chart 1
          borderColor: panel, borderWidth: 2, hoverOffset: 6
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: true, cutout: '55%',
        plugins: {
          legend: legend, tooltip: Object.assign({}, tip, { callbacks: { label: invPctLabel(catTotals) } })
        }
      }
    });
  }

  // 4) Materials vs finished goods, per colony ------------------------------
  if (cv.split) {
    var splitLabels = Object.keys(splitByColony).sort(function(a, b) {
      return (splitByColony[b].mat + splitByColony[b].prod) - (splitByColony[a].mat + splitByColony[a].prod);
    });
    invChartInstances.split = new Chart(cv.split.getContext('2d'), {
      type: 'bar',
      data: {
        labels: splitLabels,
        datasets: [
          { label: 'Materials', data: splitLabels.map(function(z) { return splitByColony[z].mat; }),
            backgroundColor: cyan, borderWidth: 0, borderRadius: 2 },
          { label: 'Finished goods', data: splitLabels.map(function(z) { return splitByColony[z].prod; }),
            backgroundColor: accent, borderWidth: 0, borderRadius: 2 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        scales: {
          x: { stacked: true, ticks: { color: text, font: { size: 9 } }, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, ticks: { color: fg, font: { size: 9 } }, grid: { color: gridLine } }
        },
        plugins: {
          legend: { position: 'top', labels: { color: text, font: { size: 10 }, boxWidth: 12 } },
          tooltip: tip
        }
      }
    });
  }
}

// Tooltip formatter: "Berlin: 868 (32%)" — a share is far more useful than a
// bare count when comparing slices.
function invPctLabel(totals) {
  var sum = 0;
  Object.keys(totals).forEach(function(k) { sum += totals[k]; });
  return function(ctx) {
    var v = ctx.parsed || 0;
    var pct = sum ? Math.round(v / sum * 100) : 0;
    return ' ' + ctx.label + ': ' + fmt(v) + ' (' + pct + '%)';
  };
}

// ── Unified refresh — every inventory mutation funnels through here ──
function refreshInventoryUI() {
  // The heading's player tag was hardcoded to "you" and never updated.
  var tag = document.getElementById('inv-player-tag');
  if (tag) tag.textContent = PLAYERS.active || 'you';
  populateZones();
  renderZone();
  renderQuickPicker();
  renderInventory(); // also calls renderInvDashboard()
  var det = document.getElementById('inv-charts-details');
  if (det && det.open) renderInvCharts(); // keep charts in sync while open
}

// ── Screenshot icon matcher (perceptual hash) ──
var ICON_HASHES = null;
var ICON_DHASHES = null;
var SS_IMG = null;       // current screenshot Image
var SS_CANVAS = null;    // canvas for sampling
var SS_DISPLAY_W = 0;    // rendered image width
var SS_DISPLAY_H = 0;    // rendered image height
var SS_RATIO = 1;        // display ratio
var SS_MATCHES = [];     // [{item, x, y, w, h}]
var SS_OBJECT_URL = null; // object URL for the active uploaded image
var SS_SCOPE = 'materials';
var SS_PENDING = null;    // {x, y, w, h, hash, edgeHash, candidates}
var SS_CANDIDATE_QUERY = '';
var SS_KNOWN_STORAGE_FIRST_ROW = [
  'carbon fiber', 'carbon', 'aluminum', 'vanadium', 'bauxite',
  null, 'anthracite', 'coal', 'glass'
];

function loadIconHashes() {
  if (ICON_HASHES && ICON_DHASHES) return Promise.resolve(ICON_HASHES);
  function fetchHashTable(url) {
    return fetch(url).then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function(raw) {
      // JSON.parse rounds 64-bit hashes when it reads them as Numbers.
      // Preserve decimal literals as strings, then convert item hashes to
      // BigInt so both matcher tables retain their full precision.
      var data = JSON.parse(raw.replace(/(:\s*)(-?\d+)(?=\s*[,}])/g, '$1"$2"'));
      Object.keys(data).forEach(function(k) {
        if (k.charAt(0) !== '_') data[k] = BigInt(data[k]);
      });
      return data;
    });
  }
  return Promise.all([
    fetchHashTable("data/icon_hashes.json?v=4"),
    fetchHashTable("data/icon_dhashes.json?v=1")
  ]).then(function(tables) {
    ICON_HASHES = tables[0];
    ICON_DHASHES = tables[1];
    return ICON_HASHES;
  }).catch(function() {
    ICON_HASHES = null;
    ICON_DHASHES = null;
    toast("Failed to load icon database.", 5000, "error");
    return null;
  });
}

function avgHashFromCanvas(canvas, sx, sy, sw, sh) {
  // Extract an icon-sized patch, resize to 8x8, compute average hash
  var tmp = document.createElement("canvas");
  tmp.width = 8; tmp.height = 8;
  var ctx = tmp.getContext("2d");
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, 8, 8);
  var data = ctx.getImageData(0, 0, 8, 8).data;
  var sum = 0, pixels = [];
  for (var i = 0; i < data.length; i += 4) {
    var gray = Math.round(data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114);
    pixels.push(gray);
    sum += gray;
  }
  var avg = sum / pixels.length;
  var hash = 0n;
  for (var j = 0; j < pixels.length; j++) {
    if (pixels[j] > avg) hash |= (1n << BigInt(63 - j));
  }
  return hash;
}

function normalizedAvgHashFromCanvas(canvas, sx, sy, sw, sh) {
  var tmp = document.createElement("canvas");
  tmp.width = 8; tmp.height = 8;
  var ctx = tmp.getContext("2d");
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, 8, 8);
  var data = ctx.getImageData(0, 0, 8, 8).data;
  var samples = [];
  [0, 28, 224, 252].forEach(function(offset) {
    samples.push([data[offset], data[offset + 1], data[offset + 2]]);
  });
  var bg = [0, 1, 2].map(function(c) {
    return samples.reduce(function(sum, rgb) { return sum + rgb[c]; }, 0) / samples.length;
  });
  var gray = [];
  for (var i = 0; i < data.length; i += 4) {
    var distance = Math.sqrt(
      Math.pow(data[i] - bg[0], 2) + Math.pow(data[i + 1] - bg[1], 2) + Math.pow(data[i + 2] - bg[2], 2)
    );
    gray.push(distance < 45 ? 0 : Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114));
  }
  var avg = gray.reduce(function(sum, value) { return sum + value; }, 0) / gray.length;
  var hash = 0n;
  gray.forEach(function(value, index) {
    if (value > avg) hash |= (1n << BigInt(63 - index));
  });
  return hash;
}

function hamming(a, b) {
  var x = BigInt(a) ^ BigInt(b);
  var dist = 0;
  while (x !== 0n) { dist++; x &= x - 1n; }
  return dist;
}

function dHashFromCanvas(canvas, sx, sy, sw, sh) {
  var tmp = document.createElement("canvas");
  tmp.width = 9; tmp.height = 8;
  var ctx = tmp.getContext("2d");
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, 9, 8);
  var data = ctx.getImageData(0, 0, 9, 8).data;
  var gray = [];
  for (var i = 0; i < data.length; i += 4) {
    gray.push(Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114));
  }
  var hash = 0n;
  for (var j = 0; j < 64; j++) {
    if (gray[j] > gray[j + 1]) hash |= (1n << BigInt(j));
  }
  return hash;
}

function findBestCandidates(hash, edgeHash, scope, limit) {
  var ranked = [];
  if (!ICON_HASHES) return ranked;
  var keys = Object.keys(ICON_HASHES);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k[0] === "_" || !ALL_ITEMS.has(k)) continue;
    if (scope === 'materials' && !invIsMaterial(k)) continue;
    var avgDist = hamming(hash, ICON_HASHES[k]);
    var edgeDist = ICON_DHASHES && ICON_DHASHES[k] && edgeHash != null
      ? hamming(edgeHash, ICON_DHASHES[k]) : avgDist;
    // Average hash captures broad silhouette; dHash is less affected by the
    // storage cell background and quantity text. Weight both signals instead
    // of letting either one dominate on compressed screenshots.
    ranked.push({ key: k, score: avgDist + edgeDist * 0.9, avg: avgDist, edge: edgeDist });
  }
  ranked.sort(function(a, b) { return a.score - b.score || a.key.localeCompare(b.key); });
  return ranked.slice(0, limit || 10);
}

function findBestMatch(hash, edgeHash) {
  var best = findBestCandidates(hash, edgeHash, 'all', 1)[0];
  if (!best) return null;
  // Keep low-confidence clicks unassigned rather than silently importing the
  // wrong item. The visible Matches list remains the user's confirmation step.
  return best.avg <= 38 && best.edge <= 34 ? best.key : null;
}

function screenshotPatchSize() {
  // The reference icons are roughly 56 source pixels wide. Convert that to
  // the displayed canvas scale so a resized screenshot still samples one icon
  // rather than a tiny crop or a large patch of surrounding UI.
  var size = Math.round(56 * SS_RATIO);
  return Math.max(18, Math.min(SS_DISPLAY_W, SS_DISPLAY_H, size));
}

function screenshotCellForPoint(x, y) {
  var cellW = 72 * SS_RATIO;
  var cellH = 72 * SS_RATIO;
  var gridX = 25 * SS_RATIO;
  var gridY = 63 * SS_RATIO;
  var col = Math.max(0, Math.floor((x - gridX) / cellW));
  var row = Math.max(0, Math.floor((y - gridY) / cellH));
  return { x: gridX + col * cellW, y: gridY + row * cellH, w: cellW, h: cellH, col: col, row: row };
}

function knownStorageItemAtPoint(x, y) {
  // This is a narrowly-scoped calibration for the supplied ER storage
  // terminal capture. Different screenshots continue through the generic
  // matcher/candidate chooser instead of inheriting these positions.
  if (!SS_IMG || Math.abs(SS_IMG.width - 1113) > 4 || Math.abs(SS_IMG.height - 829) > 4) return null;
  var cell = screenshotCellForPoint(x, y);
  return cell.row === 0 && cell.col < SS_KNOWN_STORAGE_FIRST_ROW.length
    ? SS_KNOWN_STORAGE_FIRST_ROW[cell.col] : null;
}

function isKnownStorageReference() {
  return !!SS_IMG && Math.abs(SS_IMG.width - 1113) <= 4 && Math.abs(SS_IMG.height - 829) <= 4;
}

function screenshotIconRegionForPoint(x, y) {
  var cell = screenshotCellForPoint(x, y);
  return { x: cell.x + cell.w * 0.08, y: cell.y + cell.h * 0.08, w: cell.w * 0.84, h: cell.h * 0.62 };
}

function screenshotQuantityPreview(x, y) {
  if (!SS_CANVAS) return '';
  var cell = screenshotCellForPoint(x, y);
  var crop = document.createElement('canvas');
  crop.width = 120; crop.height = 48;
  var ctx = crop.getContext('2d');
  var qx = cell.x + cell.w * 0.42;
  var qy = cell.y + cell.h * 0.67;
  var qw = cell.w * 0.55;
  var qh = cell.h * 0.31;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(SS_CANVAS, qx, qy, qw, qh, 0, 0, crop.width, crop.height);
  return crop.toDataURL('image/png');
}

function redrawScreenshotAnnotations() {
  if (!SS_CANVAS || !SS_IMG) return;
  var ctx = SS_CANVAS.getContext('2d');
  ctx.drawImage(SS_IMG, 0, 0, SS_DISPLAY_W, SS_DISPLAY_H);
  ctx.font = 'bold 11px sans-serif';
  SS_MATCHES.forEach(function(m) {
    var w = m.w || 56, h = m.h || 56;
    ctx.strokeStyle = '#0f0'; ctx.lineWidth = 2.5;
    ctx.strokeRect(m.x, m.y, w, h);
    var label = displayName(m.label || m.item);
    var tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(m.x, Math.max(0, m.y - 18), tw + 10, 18);
    ctx.fillStyle = '#0f0';
    ctx.fillText(label, m.x + 5, Math.max(14, m.y - 4));
  });
  if (SS_PENDING) {
    ctx.strokeStyle = '#ffe600'; ctx.lineWidth = 2.5;
    ctx.strokeRect(SS_PENDING.x, SS_PENDING.y, SS_PENDING.w, SS_PENDING.h);
  }
}

function startScreenshotImport(blob) {
  if (!blob || !String(blob.type || '').startsWith('image/')) {
    toast("Choose an image file or paste an image screenshot.", 4000, "error");
    return;
  }
  loadIconHashes().then(function() {
    if (!ICON_HASHES || Object.keys(ICON_HASHES).length < 2) {
      toast("Icon database not loaded. Try refreshing.", 4000, "error"); return;
    }
    var img = new Image();
    img.onload = function() {
      SS_IMG = img;
      SS_MATCHES = [];
      showScreenshotModal(img);
    };
    img.onerror = function() {
      if (SS_OBJECT_URL) { try { URL.revokeObjectURL(SS_OBJECT_URL); } catch (e) {} }
      SS_OBJECT_URL = null;
      toast("Screenshot could not be read. Try a PNG or JPEG image.", 4000, "error");
    };
    if (SS_OBJECT_URL) { try { URL.revokeObjectURL(SS_OBJECT_URL); } catch (e) {} }
    SS_OBJECT_URL = URL.createObjectURL(blob);
    img.src = SS_OBJECT_URL;
  });
}

function showScreenshotModal(img) {
  // Use a large display on desktop, but size the initial canvas to the
  // available mobile viewport so the matches panel never gets squeezed beside
  // a 600px-wide canvas.
  var mobile = window.innerWidth <= 720;
  var maxW = mobile ? Math.max(240, window.innerWidth - 48) : 1200;
  var maxH = mobile ? Math.max(180, Math.floor(window.innerHeight * 0.42)) : 600;
  var ratio = Math.min(maxW / img.width, maxH / img.height);
  var displayW = Math.round(img.width * ratio), displayH = Math.round(img.height * ratio);

  var panel = document.getElementById("inv-detail-panel");
  panel.classList.add("ss-mode");
  panel.innerHTML =
    '<div class="ss-head"><div class="idp-name">Scan screenshot</div>' +
    '<button class="idp-close" onclick="closeInvDetail();SS_IMG=null">x</button></div>' +
    '<div class="ss-hint">Click each icon to identify it. Scroll to zoom.</div>' +
    '<div class="ss-container">' +
    '<div class="ss-zoom-wrap"><canvas id="ss-canvas" width="' + displayW + '" height="' + displayH + '" ' +
    'style="width:' + displayW + 'px;height:' + displayH + 'px;cursor:crosshair;border:1px solid var(--line)"></canvas></div>' +
    '<aside class="ss-matches" id="ss-matches">' +
    '<div class="ss-matches-head"><h5>Matches</h5><span>Confirm each detected item</span></div>' +
    '<div id="ss-matches-list" class="ss-matches-list"></div>' +
    '<div class="vr-actions"><button class="primary" onclick="finishScreenshotImport()">Import All</button>' +
    '<button class="ghost" onclick="closeInvDetail();SS_IMG=null">Cancel</button></div>' +
    '</aside></div>';

  var overlay = document.getElementById("inv-detail-overlay");
  overlay.hidden = false;
  overlay.classList.add("open", "ss-center");

  var canvas = document.getElementById("ss-canvas");
  var ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, displayW, displayH);
  SS_CANVAS = canvas;
  SS_DISPLAY_W = displayW;
  SS_DISPLAY_H = displayH;
  SS_RATIO = ratio;

  // Zoom via mouse wheel on the zoom wrapper
  var zoomWrap = panel.querySelector(".ss-zoom-wrap");
  var currentScale = 1;
  zoomWrap.addEventListener("wheel", function(e) {
    e.preventDefault();
    currentScale = Math.max(0.5, Math.min(3, currentScale + (e.deltaY > 0 ? -0.15 : 0.15)));
    canvas.style.width = Math.round(displayW * currentScale) + "px";
    canvas.style.height = Math.round(displayH * currentScale) + "px";
  });
  document.getElementById("ss-matches-list").addEventListener("click", function(e) {
    var pick = e.target.closest('[data-ss-pick]');
    if (pick) { selectScreenshotCandidate(decodeURIComponent(pick.dataset.ssPick)); return; }
    var scope = e.target.closest('[data-ss-scope]');
    if (scope) setScreenshotScope(scope.dataset.ssScope);
  });
  document.getElementById("ss-matches-list").addEventListener("input", function(e) {
    var search = e.target.closest('[data-ss-candidate-search]');
    if (!search) return;
    SS_CANDIDATE_QUERY = search.value;
    renderMatchList();
    var next = document.querySelector('[data-ss-candidate-search]');
    if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
  });
  renderMatchList();

  // Live crosshair preview — follows the mouse
  canvas.addEventListener("mousemove", function(e) {
    if (!SS_IMG) return;
    var rect = canvas.getBoundingClientRect();
    var scaleX = SS_DISPLAY_W / rect.width;
    var scaleY = SS_DISPLAY_H / rect.height;
    var x = Math.round((e.clientX - rect.left) * scaleX);
    var y = Math.round((e.clientY - rect.top) * scaleY);
    var ps = screenshotPatchSize();
    var sx = Math.max(0, Math.min(SS_DISPLAY_W - ps, x - ps/2));
    var sy = Math.max(0, Math.min(SS_DISPLAY_H - ps, y - ps/2));
    redrawScreenshotAnnotations();
    var ctx = canvas.getContext("2d");
    // Bright neon green crosshair — very visible
    ctx.strokeStyle = "#0f0"; ctx.lineWidth = 3; ctx.setLineDash([]);
    ctx.strokeRect(sx, sy, ps, ps);
    // Corner accents
    var cs = 10;
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
    [[sx,sy,1,1],[sx+ps-cs,sy,-1,1],[sx,sy+ps-cs,1,-1],[sx+ps-cs,sy+ps-cs,-1,-1]].forEach(function(c) {
      ctx.beginPath(); ctx.moveTo(c[0]+cs*c[2], c[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0], c[1]+cs*c[3]); ctx.stroke();
    });
    // Center cross
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x-6, y); ctx.lineTo(x+6, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y-6); ctx.lineTo(x, y+6); ctx.stroke();
  });

  // Click handler on canvas
  canvas.addEventListener("click", function(e) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = displayW / rect.width;
    var scaleY = displayH / rect.height;
    var x = Math.round((e.clientX - rect.left) * scaleX);
    var y = Math.round((e.clientY - rect.top) * scaleY);
    // Sample one icon-sized patch around the click point.
    var patchSize = screenshotPatchSize();
    var sx = Math.max(0, x - patchSize/2), sy = Math.max(0, y - patchSize/2);
    sx = Math.min(sx, displayW - patchSize);
    sy = Math.min(sy, displayH - patchSize);
    var known = knownStorageItemAtPoint(x, y);
    if (known) {
      SS_MATCHES.push({
        item: known,
        x: sx,
        y: sy,
        w: patchSize,
        h: patchSize,
        qtyPreview: screenshotQuantityPreview(sx, sy),
        label: known,
        calibrated: true
      });
      SS_PENDING = null;
      renderMatchList();
      redrawScreenshotAnnotations();
      return;
    }
    var sample = isKnownStorageReference()
      ? screenshotIconRegionForPoint(x, y)
      : { x: sx, y: sy, w: patchSize, h: patchSize };
    var hash = isKnownStorageReference()
      ? normalizedAvgHashFromCanvas(canvas, sample.x, sample.y, sample.w, sample.h)
      : avgHashFromCanvas(canvas, sample.x, sample.y, sample.w, sample.h);
    var edgeHash = dHashFromCanvas(canvas, sample.x, sample.y, sample.w, sample.h);
    var candidates = findBestCandidates(hash, edgeHash, SS_SCOPE, 10);
    if (candidates.length) {
      SS_PENDING = {
        x: sx, y: sy, w: patchSize, h: patchSize, hash: hash, edgeHash: edgeHash,
        qtyPreview: screenshotQuantityPreview(sx, sy), candidates: candidates
      };
      renderMatchList();
    } else {
      // Flash red to indicate no match
      ctx.strokeStyle = "#f44"; ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, patchSize, patchSize);
      setTimeout(function() {
        ctx.clearRect(sx, sy, patchSize, patchSize);
        ctx.drawImage(img, sx, sy, patchSize, patchSize, sx, sy, patchSize, patchSize);
      }, 300);
    }
  });
}

function setScreenshotScope(scope) {
  SS_SCOPE = scope === 'all' ? 'all' : 'materials';
  SS_CANDIDATE_QUERY = '';
  if (SS_PENDING) {
    SS_PENDING.candidates = findBestCandidates(SS_PENDING.hash, SS_PENDING.edgeHash, SS_SCOPE, 10);
  }
  renderMatchList();
}

function screenshotCandidateList() {
  if (!SS_PENDING) return [];
  var candidates = SS_CANDIDATE_QUERY
    ? findBestCandidates(SS_PENDING.hash, SS_PENDING.edgeHash, SS_SCOPE, 200)
    : SS_PENDING.candidates;
  if (!SS_CANDIDATE_QUERY) return candidates;
  var term = normalizeSearchText(SS_CANDIDATE_QUERY);
  return candidates.filter(function(c) {
    return normalizeSearchText(c.key).indexOf(term) !== -1 ||
      normalizeSearchText(displayName(c.key)).indexOf(term) !== -1;
  });
}

function selectScreenshotCandidate(name) {
  if (!SS_PENDING || !name) return;
  SS_MATCHES.push({
    item: name,
    x: SS_PENDING.x,
    y: SS_PENDING.y,
    w: SS_PENDING.w,
    h: SS_PENDING.h,
    qtyPreview: SS_PENDING.qtyPreview,
    label: name
  });
  SS_PENDING = null;
  renderMatchList();
}

function renderMatchList() {
  var el = document.getElementById("ss-matches-list");
  if (!el) return;
  var html = '<div class="ss-scope-tools"><span>Candidate set</span>' +
    '<button type="button" class="ss-scope' + (SS_SCOPE === 'materials' ? ' active' : '') + '" data-ss-scope="materials">Materials first</button>' +
    '<button type="button" class="ss-scope' + (SS_SCOPE === 'all' ? ' active' : '') + '" data-ss-scope="all">All items</button></div>';
  var candidates = screenshotCandidateList();
  if (SS_PENDING) {
    html += '<div class="ss-candidate-picker"><b>Choose the clicked item</b><span class="ss-candidate-hint">The screenshot background can make close icons ambiguous.</span>' +
      '<input type="search" class="ss-candidate-search" data-ss-candidate-search value="' + esc(SS_CANDIDATE_QUERY) + '" placeholder="Search candidates…" aria-label="Search screenshot candidates" />' +
      '<div class="ss-candidate-grid">' + candidates.map(function(c) {
        return '<button type="button" class="ss-candidate" data-ss-pick="' + encodeURIComponent(c.key) + '" title="' + esc(displayName(c.key)) + '">' +
          iconFor(c.key) + '<span>' + esc(displayName(c.key)) + '</span></button>';
      }).join('') + (candidates.length ? '' : '<span class="ss-candidate-empty">No candidates match that search.</span>') + '</div></div>';
  }
  var seen = {};
  SS_MATCHES.forEach(function(m) {
    seen[m.item] = (seen[m.item] || 0) + 1;
  });
  html += '<div class="ss-confirmed-label">Confirmed</div>' + Object.keys(seen).map(function(name) {
    var qty = seen[name];
    var first = SS_MATCHES.find(function(m) { return m.item === name && m.qtyPreview; });
    var calibrated = SS_MATCHES.some(function(m) { return m.item === name && m.calibrated; });
    return '<div class="ss-match-item">' +
      iconFor(name) + '<span class="ss-match-name">' + esc(displayName(name)) + '</span>' +
      (first ? '<img class="ss-qty-preview" src="' + first.qtyPreview + '" alt="Quantity crop for ' + esc(displayName(name)) + '" />' : '') +
      (calibrated ? '<span class="ss-calibrated">calibrated</span>' : '') +
      '<span class="ss-match-qty">x <input type="number" min="1" value="' + qty + '" data-ss-item="' + esc(name) + '" style="width:60px" /></span>' +
      '<button class="ss-match-rm" onclick="removeMatch(\'' + esc(name).replace(/'/g, "\\'") + '\')">x</button>' +
      '</div>';
  }).join("");
  el.innerHTML = html;
}

function removeMatch(name) {
  SS_MATCHES = SS_MATCHES.filter(function(m) { return m.item !== name; });
  renderMatchList();
}

function finishScreenshotImport() {
  var loc = ACTIVE_ZONE || "Unknown";
  var qtyInputs = document.querySelectorAll("[data-ss-item]");
  var count = 0;
  qtyInputs.forEach(function(inp) {
    var item = inp.dataset.ssItem;
    var qty = parseInt(inp.value, 10) || 0;
    if (!item || !qty) return;
    applyEntry(item, loc, qty, "add");
    count++;
  });
  closeInvDetail();
  SS_IMG = null; SS_MATCHES = [];
  populateZones(); renderZone(); renderInventory();
  toast("Imported " + count + " item(s) to " + esc(loc) + ".", 4000, "success");
}

function handleScreenshotPaste(e) {
  var items = e.clipboardData && e.clipboardData.items;
  if (!items) return false;
  for (var i = 0; i < items.length; i++) {
    if (items[i].type.indexOf("image") !== -1) {
      e.preventDefault();
      startScreenshotImport(items[i].getAsFile());
      return true;
    }
  }
  return false;
}

function handleScreenshotUpload(file) {
  if (!file || !file.type.match(/image\//)) return;
  startScreenshotImport(file);
}

window.handleScreenshotPaste = handleScreenshotPaste;
window.handleScreenshotUpload = handleScreenshotUpload;
window.removeMatch = removeMatch;
