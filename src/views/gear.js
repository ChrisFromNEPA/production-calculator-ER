/**
 * src/views/gear.js — Gear textures + local data
 * ============================================================================
 * DTX armor texture lookup, local requests, gear library, inventory, and
 * colony settings. The public build deliberately has no remote sync dependency.
 */
'use strict';

// § GEAR TEXTURE LOOKUP — maps item names to DTX armor textures
// ═══════════════════════════════════════════════════════════════════════════

/** Slot name → DTX texture slot ID */
const SLOT_TO_TEX = {
  Helmet: 'Helmet', ShoulderPads: 'ShoulderPads', TorsoArmor: 'TorsoArmour',
  ArmPads: 'ArmPads', LegPads: 'LegPads',
};

/** Detect faction from item name or use default */
function detectFaction(itemName) {
  const upper = (itemName || '').toUpperCase();
  if (upper.includes('BOS') || upper.includes('BROTHERHOOD')) return 'BOS';
  if (upper.includes('CMG')) return 'CMG';
  if (upper.includes('ECLIPSE') || upper.includes('EC ')) return 'EC';
  if (upper.includes('FDC')) return 'FDC';
  if (upper.includes('GOM')) return 'GOM';
  if (upper.includes('LED')) return 'LED';
  if (upper.includes('MOB')) return 'MOB';
  if (upper.includes('VTX') || upper.includes('VORTEX')) return 'VTX';
  return 'CMG'; // default faction
}

/** Detect armor tier from item name keywords */
function detectTier(itemName) {
  var n = (itemName || '').toLowerCase();
  if (/basic|tier 1|mk.?1|t1/i.test(n)) return 1;
  if (/modified|tier 2|mk.?2|t2/i.test(n)) return 2;
  if (/advanced|tier 3|mk.?3|t3|tremor/i.test(n)) return 3;
  if (/altered|tier 4|mk.?4|t4/i.test(n)) return 4;
  if (/powered|tier 5|mk.?5|t5/i.test(n)) return 5;
  if (/tactical|tier 6|mk.?6|t6|spec|ops/i.test(n)) return 6;
  if (/elite|tier 7|mk.?7|t7|prototype/i.test(n)) return 7;
  return 4; // default mid-tier
}

/** Get DTX armor texture path for an equipped item */
function getArmorTexture(itemName, slotName) {
  if (!itemName) return null;
  var texSlot = SLOT_TO_TEX[slotName];
  if (!texSlot) return null;
  var faction = detectFaction(itemName);
  var tier = detectTier(itemName);
  // Try with detected tier, fall back to tier 4
  var paths = [
    'gear_textures/' + faction + '/' + texSlot + '.png',
    'gear_textures/CMG/' + texSlot + '.png',
  ];
  return paths[0]; // return primary path (browser handles 404 via onerror)
}

function renderGear() {
  document.querySelectorAll('.gear-slot').forEach(slot => {
    const slotName = slot.dataset.slot;
    const slotType = slot.dataset.slotType || 'armor';
    let itemName; let isActive = true;
    if (slotType === 'armor') { itemName = GEAR[slotName]; }
    else if (slotType === 'booster') { itemName = BOOSTERS[parseInt(slotName.split('-')[1])]; isActive = BOOSTER_ACTIVE[parseInt(slotName.split('-')[1])] !== false; }
    else if (slotType === 'medikit') { itemName = MEDIKIT; isActive = MEDIKIT_ACTIVE; }
    const icon = slot.querySelector('.gear-slot-icon');
    if (itemName) {
      slot.classList.add('equipped');
      if (!isActive) slot.classList.add('inactive'); else slot.classList.remove('inactive');
      icon.innerHTML = iconFor(itemName);
      let nameEl = slot.querySelector('.gear-slot-name');
      if (!nameEl) { nameEl = document.createElement('div'); nameEl.className = 'gear-slot-name'; slot.appendChild(nameEl); }
      nameEl.textContent = itemName;
      let statEl = slot.querySelector('.gear-slot-stats');
      if (!statEl) { statEl = document.createElement('div'); statEl.className = 'gear-slot-stats'; }
      const recipe = DATA.recipes.find(r => r.output.item === itemName);
      // Armor-slot implants check GEAR_ACTIVE, regular armor is always active
      if (slotType === 'armor' && recipe && recipe.output.category === 'Implants & Electronics') {
        isActive = GEAR_ACTIVE[slotName] !== false;
      }
      if (recipe?.output?.stats) {
        var hiddenStats = ['durationseconds','medkitcooldown','protectionreduction','addiction','illegal'];
        statEl.innerHTML = Object.entries(recipe.output.stats).filter(function(e){return hiddenStats.indexOf(e[0])===-1;}).map(function(e) {
          var k = e[0], v = e[1];
          var label = (STAT_LABELS && STAT_LABELS[k]) ? STAT_LABELS[k] : k.substring(0,4);
          return '<span class="gear-slot-stat">' + label + ' <b class="gss-val">' + (v > 0 ? '+' : '') + v + '</b></span>';
        }).join('');
        if (statEl.parentNode !== slot) slot.appendChild(statEl);
      } else { statEl.remove(); }
      // Toggle for implants, boosters, medikit
      var showToggle = (slotType === 'medikit' || slotType === 'booster');
      if (slotType === 'armor' && recipe && recipe.output.category === 'Implants & Electronics') showToggle = true;
      if (showToggle) {
        var toggleControl = slot.querySelector('.gear-toggle-control');
        var toggleEl = slot.querySelector('.gear-toggle');
        var toggleText;
        if (!toggleControl) {
          toggleControl = document.createElement('label');
          toggleControl.className = 'gear-toggle-control';
          toggleEl = document.createElement('input');
          toggleEl.type = 'checkbox';
          toggleEl.className = 'gear-toggle';
          toggleText = document.createElement('span');
          toggleText.className = 'gear-toggle-text';
          toggleControl.appendChild(toggleEl);
          toggleControl.appendChild(toggleText);
          slot.appendChild(toggleControl);
        } else {
          toggleText = toggleControl.querySelector('.gear-toggle-text');
        }
        var toggleDescription = gearToggleDescription(slotType);
        toggleControl.title = toggleDescription + '. Checked = included; unchecked = excluded.';
        toggleEl.setAttribute('aria-label', toggleDescription);
        if (!toggleEl._gearToggleWired) {
          toggleEl.addEventListener('click',function(e){e.stopPropagation();});
          toggleEl._gearToggleWired = true;
        }
        toggleEl.checked = isActive;
        var updateToggleCopy = function() {
          toggleText.textContent = toggleEl.checked ? 'Included' : 'Excluded';
          toggleControl.classList.toggle('is-off', !toggleEl.checked);
        };
        toggleEl.onchange = function() {
          if (slotType === 'armor') { GEAR_ACTIVE[slotName] = toggleEl.checked; }
          else if (slotType === 'booster') { BOOSTER_ACTIVE[parseInt(slotName.split('-')[1])] = toggleEl.checked; }
          else { MEDIKIT_ACTIVE = toggleEl.checked; }
          saveToggles();
          renderGearStats(); renderGearCost(); slot.classList.toggle('inactive', !toggleEl.checked);
          updateToggleCopy();
        };
        updateToggleCopy();
      }
    } else {
      slot.classList.remove('equipped', 'inactive');
      icon.innerHTML = '<span class="gear-slot-placeholder">+</span>';
      ['gear-slot-name','gear-slot-stats','gear-toggle-control','gear-toggle'].forEach(function(c){var el=slot.querySelector('.'+c);if(el)el.remove();});
    }
  });
  renderGearStats();
  renderGearCost();
  renderGearDest();
  wireGearDest();
}

const GEAR_EFFECT_PAIRS = [
  { label: 'Health', regen: ['healthregen', 'health_regen'], drain: ['healthdrain', 'health_drain'], detail: 'Health gained minus health lost.' },
  { label: 'Bio Energy', regen: ['bioregen', 'bio_regen'], drain: ['bioenergydrain', 'biodrain', 'bio_drain'], detail: 'Positive net gains bio energy; negative net consumes it.' },
  { label: 'Stamina', regen: ['staminaregen', 'stamina_regen'], drain: ['staminadrain', 'stamina_drain'], detail: 'Stamina gained minus stamina lost.' },
  { label: 'Aura', regen: ['auraregen', 'aura_regen'], drain: ['auradrain', 'aura_drain'], detail: 'Aura gained minus aura lost.' },
];
const GEAR_DRAIN_KEYS = new Set(GEAR_EFFECT_PAIRS.flatMap(function(pair) { return pair.drain; }));

function gearEffectAmount(stats, keys) {
  return keys.reduce(function(total, key) {
    var value = Number(stats[key]);
    return total + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);
}

function gearEffectValue(value) {
  var rounded = Math.round(value * 10) / 10;
  return (rounded > 0 ? '+' : '') + rounded;
}

function renderGearEffectSummary(stats) {
  var rows = GEAR_EFFECT_PAIRS.map(function(pair) {
    var regen = gearEffectAmount(stats, pair.regen);
    var drain = gearEffectAmount(stats, pair.drain);
    return { pair: pair, regen: regen, drain: drain, net: regen - drain };
  }).filter(function(row) { return row.regen !== 0 || row.drain !== 0; });
  if (!rows.length) return '';

  var html = '<div class="gear-effect-head"><span>Recovery &amp; upkeep</span><span class="gear-effect-formula">Net = Regen − Drain</span></div>';
  html += '<p class="gear-effect-note">Regen adds to the character resource. Drain subtracts from it. The net value shows what the loadout is doing overall.</p>';
  rows.forEach(function(row) {
    var netClass = row.net > 0 ? 'is-positive' : (row.net < 0 ? 'is-negative' : 'is-balanced');
    var netMeaning = row.net > 0 ? 'gaining' : (row.net < 0 ? 'losing' : 'balanced');
    html += '<div class="gear-effect-row">';
    html += '<div><div class="gear-effect-name">' + row.pair.label + '</div><div class="gear-effect-detail">' + row.pair.detail + ' Currently ' + netMeaning + '.</div></div>';
    html += '<div class="gear-effect-values">';
    html += '<span class="gear-effect-regen">Regen ' + gearEffectValue(row.regen) + '</span>';
    html += '<span class="gear-effect-drain">Drain −' + gearEffectValue(row.drain).replace('+', '') + '</span>';
    html += '<span class="gear-effect-net ' + netClass + '">Net ' + gearEffectValue(row.net) + '</span>';
    html += '</div></div>';
  });
  return html;
}

function renderGearStats() {
  const grid = document.getElementById('gear-stat-grid');
  if (!grid) return;
  const effectSummary = document.getElementById('gear-effect-summary');
  const stats = computeGearStats();
  if (effectSummary) effectSummary.innerHTML = renderGearEffectSummary(stats);
  var skipStat = {durationseconds:1,medkitcooldown:1,protectionreduction:1};
  
  // Compute protection reduction from active medikit
  var protRed = 0;
  if (MEDIKIT && MEDIKIT_ACTIVE) {
    var mr = DATA.recipes.find(function(r){return r.output.item === MEDIKIT;});
    protRed = mr?.output?.stats?.protectionreduction || 0;
  }
  var protMult = (1 - protRed / 100); // e.g. 0.8 for 20% reduction
  var protKeys = ['armor','shielding','endurance','resistance','reflection'];
  
  const entries = Object.entries(stats).filter(function(e){return e[1]!==0&&!skipStat[e[0]];});
  if (!entries.length) {
    grid.innerHTML = '<div class="muted" style="font-size:0.75rem;grid-column:1/-1">Equip armor to see stats</div>';
    return;
  }
  
  var html = '';
  if (protRed > 0) {
    html += '<div class="gear-stat-notice">Medikit: -' + Math.round(protRed) + '% protection</div>';
  }
  
  entries.forEach(function(e) {
    var k = e[0], v = e[1];
    var label = STAT_LABELS[k] || k;
    var affected = protRed > 0 && protKeys.indexOf(k) !== -1;
    var displayV = affected ? v * protMult : v;
    // A drain is a cost, so show it as a negative value instead of a misleading positive bonus.
    var shownV = GEAR_DRAIN_KEYS.has(k) ? -Math.abs(displayV) : displayV;
    var cls = shownV < 0 ? 'stat-val bad' : 'stat-val';
    if (affected) cls += ' prot-nerfed';
    var badge = affected ? ' <span class="prot-badge">×' + Math.round(protMult*100) + '%</span>' : '';
    var tip = STAT_DEFS[k] ? ' title="' + esc(STAT_DEFS[k]) + '"' : '';
    html += '<div class="gear-stat-item"' + tip + '><div class="' + cls + '">' + (shownV>0?'+':'') + Math.round(shownV*10)/10 + badge + '</div><div class="stat-label">' + label + '</div></div>';
  });
  
  grid.innerHTML = html;
}

// Full recipe-tree cost to craft one of each equipped piece — the same plan
// machinery the calculator uses (compute → planCost → costBreakdown), so
// taxes, mine sites, slot levels and the session drift all apply, and the
// CMG faction rebate comes out exactly as it does on the Calculator tab.
const GEAR_PLAN_CACHE = {};
function computeGearPlan() {
  const sig = JSON.stringify(GEAR) + '|' + unitCostSignature();
  if (GEAR_PLAN_CACHE._sig === sig) return GEAR_PLAN_CACHE.plan;
  // Equipped armor pieces only (implants, boosters, medikits are skipped).
  const pieces = Object.values(GEAR).filter(itemName => {
    if (!itemName) return false;
    const recipe = DATA.recipes.find(r => r.output.item === itemName);
    return recipe && recipe.output.category !== 'Implants & Electronics' && recipe.output.category !== 'Drugs' && recipe.output.category !== 'Medical';
  });
  // One tray compute for the whole set — the SAME call the Calculator's
  // multi-item tray makes (compute(items[], chosen, ledger, invLoc, dest,
  // discounts)). Sharing the ledger aggregates demand across the pieces, so
  // the set's batches, total and CMG rebate match the Calculator exactly —
  // summing per-piece plans over-counts surplus batches and can even pick
  // different mine sites, which is why the panel used to disagree with Craft Set.
  const plan = { steps: [], acquire: {}, refine: [], manufacture: [], transport: {}, surplus: {}, _pieces: pieces.length };
  if (pieces.length) {
    try {
      const res = compute(pieces.map(item => ({ item, qty: 1 })), ALTERNATIVE_CHOICES, {}, null, DESTINATION, null);
      Object.assign(plan, res.plan);
    } catch (e) { /* cycle or bad recipe — leave the empty plan */ }
  }
  plan._pieces = pieces.length;
  GEAR_PLAN_CACHE._sig = sig;
  GEAR_PLAN_CACHE.plan = plan;
  return plan;
}

function renderGearCost() {
  const grid = document.getElementById('gear-cost-grid');
  if (!grid) return;
  const plan = computeGearPlan();
  const entries = Object.entries(plan.acquire || {}).sort((a, b) => (b[1].qty || 0) - (a[1].qty || 0));
  if (!plan._pieces) {
    grid.innerHTML = '<div class="muted" style="font-size:0.75rem;grid-column:1/-1">Equip armor to see recipe cost</div>';
    return;
  }
  const matHtml = entries.map(([item, info]) => {
    const qty = info.qty || 0;
    const have = INV_TOTAL[item] || 0;
    const cls = have < qty ? 'stat-val bad' : 'stat-val';
    return `<div class="gear-stat-item" title="${esc(displayName(item))} — need ${fmt(qty)}, have ${fmt(have)}"><div class="${cls}">${fmt(qty)}</div><div class="stat-label">${esc(displayName(item))}</div></div>`;
  }).join('');
  const cost = planCost(plan);
  const head = `<div class="gear-cost-head">Crafting <b>${plan._pieces}</b> equipped piece${plan._pieces === 1 ? '' : 's'} from scratch at ${esc(DESTINATION)}</div>`;
  const unknownNote = cost.anyUnknown
    ? '<div class="gear-cost-unknown">Some recipes or materials have no price data yet — the breakdown covers only the priced parts.</div>' : '';
  grid.innerHTML = matHtml + `<div class="gear-cost-breakdown">${head}${costBreakdown(cost, plan)}${unknownNote}</div>`;
}

// Production-colony strip: the destination decides the colony tax AND the CMG
// faction rebate, so the gear page surfaces it right next to the cost it changes.
function renderGearDest() {
  const sel = document.getElementById('gear-dest');
  const status = document.getElementById('gear-dest-status');
  if (!sel || !status) return;
  if (!sel.options.length) {
    FINAL_PRODUCTION_LOCATIONS.forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      sel.appendChild(o);
    });
  }
  if (sel.value !== DESTINATION) sel.value = DESTINATION;

  const own = colonyOwnerIds(DESTINATION);
  const rate = typeof COLONY_TAX[DESTINATION] === 'number' ? COLONY_TAX[DESTINATION] : 0;
  const factions = (DATA._reference && DATA._reference.factions) || {};
  const ownerName = own.length ? own.map(id => factions[id] || id).join(' + ') : 'owner not set';
  const activeFaction = activeFactionId();
  const activeFactionName = window.factionById?.(activeFaction)?.name || activeFaction;
  const ownedByActive = own.includes(activeFaction) && activeFactionReturnRate() > 0;
  const taxTxt = rate > 0 ? rate + '% tax' : '0% tax';

  let forfeit = 0;
  try {
    const cost = planCost(computeGearPlan());
    if (!ownedByActive && cost && cost.total > 0.005) forfeit = cost.total * activeFactionReturnRate();
  } catch (e) { /* unpriced set — show the plain warning */ }

  const ours = Object.entries(COLONY_OWNER)
    .filter(([, f]) => f === activeFaction).map(([c]) => c).sort();

  status.innerHTML = ownedByActive
    ? `<div class="gear-dest-ok">✔ <b>${esc(DESTINATION)}</b> · ${esc(ownerName)} · ${taxTxt} — configured ${Math.round(activeFactionReturnRate() * 100)}% ${esc(activeFactionName)} return.</div>`
    : `<div class="gear-dest-warn">⚠ <b>${esc(DESTINATION)}</b> · ${esc(ownerName)} · ${taxTxt} — no configured ${esc(activeFactionName)} return for this colony.` +
      (forfeit > 0.005 ? ` Producing this set here misses ~<b>${fmtUC(forfeit)} UC</b> in potential faction return.` : '') +
      (ours.length ? ` Switch to ${ours.map(c => esc(c)).join(' or ')} to use configured ${esc(activeFactionName)} return.` : '') +
      '</div>';
}

function wireGearDest() {
  const sel = document.getElementById('gear-dest');
  if (!sel || sel._wired) return;
  sel._wired = true;
  sel.onchange = () => {
    DESTINATION = sel.value;
    saveDestination();
    // Keep the Calculator's destination dropdown in sync.
    const cd = document.getElementById('calc-dest');
    if (cd) cd.value = sel.value;
    renderGearDest();
    renderGearCost();
  };
}

// § GEAR PICKER — modal focus management
// ═══════════════════════════════════════════════════════════════════════════
// The picker is a modal dialog: opening it saves the slot that triggered it,
// focus moves into the search field, Tab is trapped inside the overlay, Escape
// closes it, and every close path returns focus to the triggering slot.
// The option list is a single-select listbox: options carry role="option",
// exactly one has a roving tabindex="0", and arrow keys move the active option
// via aria-activedescendant (APG listbox pattern).
let gearPickerTrigger = null;
let gearPickerActiveIndex = 0;

// Equipped item for a gear slot, resolved by slot type. The picker marks the
// equipped option aria-selected and seeds the roving tabindex from this, so
// armor (GEAR[slotName]), medikit (MEDIKIT) and boosters (BOOSTERS[slot
// index]) must all resolve to the real equipped piece.
function boosterSlotOccupancy() {
  return BOOSTERS.slice(0, 2).filter(item => typeof item === 'string' && item.trim()).length;
}

function boosterOtherSlotItem(slotName) {
  if (!/^booster-[01]$/.test(slotName)) return '';
  const otherIndex = parseInt(slotName.split('-')[1], 10) === 0 ? 1 : 0;
  return typeof BOOSTERS[otherIndex] === 'string' ? BOOSTERS[otherIndex] : '';
}

function equippedNameForSlot(slotName, slotType) {
  if (slotType === 'medikit') return MEDIKIT;
  if (slotType === 'booster') return BOOSTERS[parseInt(slotName.split('-')[1])];
  return GEAR[slotName];
}

// Drugs and food consume the same two shared booster slots. Keep the
// category contract in one helper so the picker and its regression tests agree.
function gearPickerCategories(slotType, slotCat) {
  return slotType === 'booster' ? ['Drugs', 'Food & Drink'] : [slotCat];
}

function gearToggleDescription(slotType) {
  if (slotType === 'booster') return 'Include this booster / food in loadout stats';
  if (slotType === 'medikit') return 'Include this medikit in loadout stats';
  return 'Include this gear in loadout stats';
}

function gearArmorGuidanceHtml(item, slotName, recipe) {
  if (!recipe || recipe.output?.category !== 'Armor') return '';
  const family = typeof armorClassOf === 'function' ? armorClassOf(item) : null;
  const weight = family?.weight || 'not classified';
  const faction = recipe._faction || family?.faction || 'not listed';
  const set = family?.prefix || 'set family not listed';
  return '<div class="tt-guidance"><b>Armor guidance</b>: ' +
    esc(weight) + ' weight · ' + esc(faction) + ' faction · ' + esc(slotName) + ' slot · set ' + esc(set) +
    '. Perk formula unsupported — only canonical recipe stats are compared.</div>';
}

// Close the picker and hand focus back to whatever slot opened it.
function closeGearPicker() {
  const overlay = document.getElementById('gear-picker-overlay');
  if (overlay) overlay.hidden = true;
  document.removeEventListener('keydown', onGearPickerKey);
  const trigger = gearPickerTrigger;
  gearPickerTrigger = null;
  if (trigger && typeof trigger.focus === 'function') trigger.focus();
}

// Move the highlighted option (roving tabindex + aria-activedescendant).
function gearPickerNavigableOptions(options) {
  return options.filter(el => el.getAttribute('aria-disabled') !== 'true');
}

function moveGearPickerActive(key) {
  const listbox = document.getElementById('gear-picker-items');
  const options = Array.from(listbox.querySelectorAll('.gear-picker-item'));
  const navigable = gearPickerNavigableOptions(options);
  if (!navigable.length) return;
  let index = navigable.indexOf(options[gearPickerActiveIndex]);
  if (index < 0) index = key === 'ArrowUp' || key === 'End' ? navigable.length - 1 : 0;
  if (key === 'ArrowDown') index = Math.min(index + 1, navigable.length - 1);
  else if (key === 'ArrowUp') index = Math.max(index - 1, 0);
  else if (key === 'Home') index = 0;
  else if (key === 'End') index = navigable.length - 1;
  const active = navigable[index];
  gearPickerActiveIndex = options.indexOf(active);
  options.forEach(el => { el.tabIndex = el === active ? 0 : -1; });
  listbox.setAttribute('aria-activedescendant', active.id);
  active.focus();
}

// Keyboard contract for the picker modal. The item detail popup, when open
// above the picker, owns the keyboard instead.
function onGearPickerKey(e) {
  if (document.querySelector('.item-popup-overlay')) return;
  const overlay = document.getElementById('gear-picker-overlay');
  if (!overlay || overlay.hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); closeGearPicker(); return; }
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
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    moveGearPickerActive(e.key);
  }
}

function showGearPicker(slotName, armorType) {
  const overlay = document.getElementById('gear-picker-overlay');
  const title = document.getElementById('gear-picker-title');
  const body = document.getElementById('gear-picker-items');
  const factionSel = document.getElementById('gear-picker-faction');
  if (!overlay || !body) return;

  // The slot that opened the picker is where focus must return on close.
  gearPickerTrigger = document.querySelector('[data-slot="' + slotName + '"]') || document.activeElement;

  const slotType = (document.querySelector('[data-slot="' + slotName + '"]')?.dataset?.slotType) || 'armor';
  const slotCat = document.querySelector('[data-slot="' + slotName + '"]')?.dataset?.category || 'Armor';
  // Implants & Electronics live in specific armour slots rather than a share of
  // every armour list. Classic FoM slot table agrees: Resistance Amp - Legs,
  // Stamina Amp - Torso, Shield Implant - Torso. Shoulder Lamp rides on the
  // shoulder, Resistance Amp on the legs, Stamina Amplification on the chest.
  const IMPLANT_SLOTS = {
    ShoulderPads: ['Shoulder Lamp'],
    LegPads: ['Resistance Amp'],
    TorsoArmor: ['Stamina Amplification'],
  };
  let items;
  if (slotType === 'armor') {
    items = [...new Set([
      ...armorItemsByType(armorType),
      ...(IMPLANT_SLOTS[slotName] || []).filter(name => ALL_ITEMS.has(name)),
    ])];
  } else {
    // Filter by category for implants/boosters/medikit. Boosters intentionally
    // span Drugs and Food & Drink because both consume the same two slots.
    const categories = gearPickerCategories(slotType, slotCat);
    items = DATA.recipes.filter(r => categories.includes(r.output.category) && ALL_ITEMS.has(r.output.item)).map(r => r.output.item);
  }
  if (!items.length) { items = []; } // guard
  const occupancy = slotType === 'booster' ? boosterSlotOccupancy() : 0;
  title.textContent = slotType === 'booster'
    ? `Select ${slotName.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())} · Shared slots: ${occupancy}/2`
    : `Select ${slotName.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}`;

  const factionOf = name => {
    const recipe = DATA.recipes.find(r => r.output.item === name);
    return recipe ? recipe._faction || '' : '';
  };

  if (factionSel) {
    const factions = [...new Set(items.map(factionOf).filter(Boolean))].sort();
    factionSel.innerHTML = '<option value="">All factions</option>' +
      factions.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('');
    factionSel.value = '';
  }

  function renderItemList(factionFilter) {
    // Anything not live in the game is dropped outright — offering a piece
    // nobody can obtain is worse than leaving a gap in the list.
    let filtered = items.filter(name => !armorNotInGame(name));
    if (factionFilter) filtered = filtered.filter(name => factionOf(name) === factionFilter);
    // An armour slot also offers implants, which have no weight class and never
    // will. They must not be swept up as "unclassified" — that reads as missing
    // data about armour when it is simply a different kind of item.
    const isArmor = name => (DATA.recipes.find(r => r.output.item === name) || {}).output?.category === 'Armor';
    const weightFilter = document.getElementById('gear-picker-weight')?.value || '';
    if (weightFilter === '?') filtered = filtered.filter(name => isArmor(name) && !armorWeightOf(name));
    else if (weightFilter) filtered = filtered.filter(name => armorWeightOf(name) === weightFilter);
    // Search filter — normalized so common spelling variants (e.g. medkit vs
    // the game's MediKit) match; see engine.normalizeSearchText.
    const normalizeSearchText = window.ENGINE.normalizeSearchText;
    const searchQ = normalizeSearchText(document.getElementById('gear-picker-search')?.value || '');
    if (searchQ) filtered = filtered.filter(name => normalizeSearchText(name).includes(searchQ));

    // Cost every candidate once, then sort. Priced from scratch at the current
    // destination so taxes, mine sites, slot levels and drift all count.
    const costs = {};
    filtered.forEach(name => { costs[name] = unitCost(name); });
    const cheapestNet = Math.min(...filtered.map(n => costs[n].net == null ? Infinity : costs[n].net));

    const sortBy = document.getElementById('gear-picker-sort')?.value;
    if (sortBy === 'net' || sortBy === 'total') {
      filtered.sort((a, b) => {
        const va = costs[a][sortBy], vb = costs[b][sortBy];
        if (va == null && vb == null) return a.localeCompare(b);
        if (va == null) return 1;            // unpriced sinks, never leads
        if (vb == null) return -1;
        return va - vb || a.localeCompare(b);
      });
    } else if (sortBy && sortBy !== 'name') {
      filtered.sort((a,b) => {
        const ra = DATA.recipes.find(r => r.output.item === a);
        const rb = DATA.recipes.find(r => r.output.item === b);
        return (rb?.output?.stats?.[sortBy]||0) - (ra?.output?.stats?.[sortBy]||0);
      });
    } else if (sortBy === 'name') {
      filtered.sort((a,b) => a.localeCompare(b));
    }
    const otherBoosterItem = boosterOtherSlotItem(slotName);
    const equippedForList = equippedNameForSlot(slotName, slotType);
    body.innerHTML = filtered.map(name => {
      const c = costs[name];
      const w = armorWeightOf(name);
      const best = c.net != null && c.net === cheapestNet && filtered.length > 1;

      // Every figure here is PER PIECE. A run makes three, and quoting the run
      // total beside one piece's name read as that piece's price.
      // Label above the figure, not below it — read top to bottom you get
      // "costs CMG / 1,218" rather than a number whose meaning arrives late.
      let costHtml;
      if (c.total == null) {
        costHtml = '<div class="gpi-cost unknown">no price</div>';
      } else {
        const sub = c.rebate > 0.005
          ? `pay ${fmtUC(c.total)} · ${fmtUC(c.rebate)} back`
          : `nothing back at ${esc(DESTINATION)}`;
        const run = c.perRun > 1
          ? `<span class="gpi-cost-run">${fmtUC(c.runNet)} per run of ${c.perRun}</span>` : '';
        costHtml = `<div class="gpi-cost${best ? ' best' : ''}">
             <span class="gpi-cost-lbl">costs ${esc(window.factionById?.(activeFactionId())?.name || activeFactionId())} · each</span>
             <span class="gpi-net">${fmtUC(c.rebate > 0.005 ? c.net : c.total)}${c.unknown ? '+' : ''}</span>
             <span class="gpi-cost-sub">${sub}</span>
             ${run}
           </div>`;
      }

      const cls = w ? `<span class="gpi-w gpi-w-${w.toLowerCase()}">${w}</span>`
                    : (!isArmor(name) ? '<span class="gpi-w gpi-w-unknown">implant</span>'
                    : (armorClassNA(name) ? '<span class="gpi-w gpi-w-unknown">no class</span>'
                                          : '<span class="gpi-w gpi-w-unknown">unclassified</span>'));
      // Cost sentence moved out of a native title (browser text tooltip that
      // stacked over the custom one) into the hover tooltip as data-cost-tip.
      const costTip = c.total != null
        ? (c.perRun > 1
            ? `A run at ${esc(DESTINATION)} makes ${c.perRun} and costs ${fmtUC(c.runTotal)} UC, so ${fmtUC(c.total)} per piece`
            : `Making one at ${esc(DESTINATION)} costs ${fmtUC(c.total)} UC`)
          + (c.rebate > 0
              ? `. ${fmtUC(c.rebate)} per piece returns to ${window.factionById?.(activeFactionId())?.name || activeFactionId()} funds, leaving the faction down ${fmtUC(c.net)} each`
              : `, and none returns to ${window.factionById?.(activeFactionId())?.name || activeFactionId()} funds because ${esc(DESTINATION)} is not owned by the active faction`)
          + '.'
        : '';
      const disabled = slotType === 'booster' && otherBoosterItem && name === otherBoosterItem && name !== equippedForList;
      const disabledAttrs = disabled ? ' aria-disabled="true" data-slot-disabled="true"' : '';
      return `<div class="gear-picker-item${best ? ' gpi-best' : ''}${disabled ? ' is-disabled' : ''}" data-item="${encodeURIComponent(name)}"${disabledAttrs}${
          costTip ? ` data-cost-tip="${esc(costTip)}"` : ''}>
        <div class="gpi-icon">${iconFor(name)}</div>
        <div class="gpi-main"><div class="gpi-name">${esc(displayName(name))}</div>
          <div class="gpi-faction">${esc(factionOf(name))} · ${cls}${
            best ? ' <span class="gpi-tag">cheapest</span>' : ''}</div></div>
        ${costHtml}
      </div>`;
    }).join('') || '<div class="muted" style="padding:1rem">No items found for this slot/faction/weight.</div>';

    // Listbox semantics: options carry role/id; the currently equipped piece
    // is aria-selected. Exactly one option keeps the roving tabindex, so Tab
    // enters the list once and arrow keys move between options.
    const optionEls = Array.from(body.querySelectorAll('.gear-picker-item'));
    // Equipped piece resolved per slot type — armor from GEAR[slotName],
    // medikit from MEDIKIT, booster from BOOSTERS[slot index]. Reading only
    // GEAR[slotName] left medikit/booster options never aria-selected.
    const equippedName = equippedNameForSlot(slotName, slotType);
    let activeFound = false;
    optionEls.forEach((el, i) => {
      el.setAttribute('role', 'option');
      el.setAttribute('id', 'gear-picker-opt-' + i);
      const selected = decodeURIComponent(el.dataset.item) === equippedName;
      const disabled = el.getAttribute('aria-disabled') === 'true';
      el.setAttribute('aria-selected', selected ? 'true' : 'false');
      if (selected) { gearPickerActiveIndex = i; activeFound = true; }
      el.tabIndex = disabled ? -1 : (i === gearPickerActiveIndex ? 0 : -1);
    });
    const navigableOptions = gearPickerNavigableOptions(optionEls);
    if (!navigableOptions.length) {
      gearPickerActiveIndex = -1;
    } else if (!activeFound || gearPickerActiveIndex >= optionEls.length || optionEls[gearPickerActiveIndex]?.getAttribute('aria-disabled') === 'true') {
      gearPickerActiveIndex = optionEls.indexOf(navigableOptions[0]);
    }
    optionEls.forEach((el, i) => { el.tabIndex = el.getAttribute('aria-disabled') === 'true' ? -1 : (i === gearPickerActiveIndex ? 0 : -1); });
    if (optionEls.length) {
      if (gearPickerActiveIndex >= 0) body.setAttribute('aria-activedescendant', optionEls[gearPickerActiveIndex].id);
      else body.removeAttribute('aria-activedescendant');
      optionEls.forEach(el => {
        el.addEventListener('click', () => selectItem(el));
        el.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectItem(el); }
        });
      });
    }
  }

  // Equip the picked item and close the modal. Keyboard users reach this via
  // Enter/Space on a focused option; mouse users via click.
  function selectItem(el) {
    if (el.getAttribute('aria-disabled') === 'true') return;
    const item = decodeURIComponent(el.dataset.item);
    const slotEl = document.querySelector('[data-slot="' + slotName + '"]');
    const st = slotEl?.dataset?.slotType || 'armor';
    if (st === 'armor') { GEAR[slotName] = item; saveGear(GEAR); }
    else if (st === 'booster') { BOOSTERS[parseInt(slotName.split('-')[1])] = item; saveBoosters(); }
    else if (st === 'medikit') { MEDIKIT = item; saveMedikit(); }
    renderGear(); renderGearSets();
    closeGearPicker();
  }

  renderItemList('');
  // Assigned rather than addEventListener: this function runs again every time
  // the picker opens, and listeners were stacking up one re-render per open.
  const rerun = () => renderItemList(factionSel?.value || '');
  if (factionSel) factionSel.onchange = rerun;
  const weightSel = document.getElementById('gear-picker-weight');
  if (weightSel) weightSel.onchange = rerun;
  const searchEl = document.getElementById('gear-picker-search');
  if (searchEl) searchEl.oninput = rerun;
  const sortEl = document.getElementById('gear-picker-sort');
  if (sortEl) sortEl.onchange = rerun;

  // Tooltip on gear picker items — shows diff vs equipped + cost + materials
  body.addEventListener('mouseover', e => {
    const el = e.target.closest('.gear-picker-item');
    if (!el || !el.dataset.item) return;
    const item = decodeURIComponent(el.dataset.item);
    const recipe = DATA.recipes.find(r => r.output.item === item);
    const newStats = recipe?.output?.stats;
    const costTip = el.dataset.costTip || '';
    if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
    if (!newStats && !costTip) return;
    var oldStats = {};
    var equipped = equippedNameForSlot(slotName, slotType);
    if (equipped) {
      var eqRecipe = DATA.recipes.find(function(r){return r.output.item === equipped;});
      if (eqRecipe?.output?.stats) oldStats = eqRecipe.output.stats;
    }
    var allKeys = newStats ? Object.keys(Object.assign({}, oldStats, newStats)) : [];
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'item-tooltip';
    var html = '<div class="tt-name">' + esc(item) + '</div>';
    if (equipped) {
      html += '<div class="tt-equipped">vs ' + esc(equipped) + '</div>';
      html += '<div class="tt-summary">Before → After</div>';
    }
    allKeys.forEach(function(k) {
      var nv = newStats[k] != null ? newStats[k] : 0;
      var ov = oldStats[k] != null ? oldStats[k] : 0;
      var diff = nv - ov;
      var label = STAT_LABELS[k] || k.substring(0,4);
      var nvStr = (nv > 0 ? '+' : '') + nv;
      if (equipped && diff !== 0) {
        var arrow = diff > 0 ? '▲' : '▼';
        var sign = diff > 0 ? '+' : '';
        var cls = diff > 0 ? 'tt-gain' : 'tt-loss';
        html += '<div class="tt-stat"><span class="tt-label">' + label + '</span><span class="tt-old">' + (ov>0?'+':'') + ov + '</span><span class="tt-arrow">→</span><span class="tt-new">' + nvStr + '</span><span class="' + cls + '">' + arrow + sign + diff + '</span></div>';
      } else {
        html += '<div class="tt-stat"><span class="tt-label">' + label + '</span><span class="tt-new">' + nvStr + '</span></div>';
      }
    });
    html += gearArmorGuidanceHtml(item, slotName, recipe);
    if (costTip) html += '<div class="tt-cost">' + costTip + '</div>';
    html += tooltipMaterialsHtml(item);
    tooltipEl.innerHTML = html;
    document.body.appendChild(tooltipEl);
    var rect = el.getBoundingClientRect();
    tooltipEl.style.left = Math.min(rect.right + 6, window.innerWidth - tooltipEl.offsetWidth - 8) + 'px';
    tooltipEl.style.top = Math.min(rect.top, window.innerHeight - tooltipEl.offsetHeight - 8) + 'px';
  });
  body.addEventListener('mouseleave', () => {
    if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
  });

  overlay.hidden = false;
  // Focus-in: move focus into the modal's primary control (the search field).
  // The keyboard contract (Escape/trap/arrows) is installed for as long as the
  // picker stays open; closeGearPicker removes it.
  document.removeEventListener('keydown', onGearPickerKey);
  document.addEventListener('keydown', onGearPickerKey);
  const searchFocus = document.getElementById('gear-picker-search');
  if (searchFocus && typeof searchFocus.focus === 'function') searchFocus.focus();
}

function renderGearSets() {
  const list = document.getElementById('gear-sets-list');
  if (!list) return;
  if (!SHARED_GEAR.length) {
    list.innerHTML = '<div class="gear-sets-head">All-Faction Gear Library</div><div class="gear-library-sub">Shared gear sets from every game faction.</div><div class="muted" style="font-size:0.6875rem;padding:0.25rem 0">No shared sets yet — equip armor and Save Gear Set to publish one.</div>';
    return;
  }
  const me = PLAYERS.active || 'anonymous';
  const sorted = SHARED_GEAR.slice().sort((a, b) =>
    gearSetScore(b) - gearSetScore(a) || (b.created_at || 0) - (a.created_at || 0));
  list.innerHTML = '<div class="gear-sets-head">All-Faction Gear Library</div><div class="gear-library-sub">Shared gear sets from every game faction.</div>' + sorted.map(s => {
    const count = Object.keys(s.gear || {}).length;
    const score = gearSetScore(s);
    const myVote = (s.votes || {})[me] || 0;
    return `<div class="gear-set-item">
      <div class="gs-votes">
        <button data-gear-vote="${s.id}" data-dir="1" class="gs-vote up ${myVote === 1 ? 'active' : ''}" title="Upvote">▲</button>
        <span class="gs-score ${score > 0 ? 'pos' : score < 0 ? 'neg' : ''}">${score}</span>
        <button data-gear-vote="${s.id}" data-dir="-1" class="gs-vote down ${myVote === -1 ? 'active' : ''}" title="Downvote">▼</button>
      </div>
      <div class="gs-info">
        <span class="set-name">${esc(s.name)}</span>
        <span class="set-meta">${count} pieces · by ${esc(s.owner || '?')}</span>
        ${(function(){
          var totals = {};
          Object.keys(s.gear||{}).forEach(function(slot) {
            var r = DATA.recipes.find(function(rr){return rr.output.item === s.gear[slot];});
            if (r && r.output && r.output.stats && r.output.category === 'Armor') {
              Object.entries(r.output.stats).forEach(function(e) {
                var k = e[0], v = e[1];
                if (typeof v === 'number') totals[k] = (totals[k]||0) + v;
              });
            }
          });
          var keys = ['armor','shielding','endurance','resistance','reflection','agility'];
          var parts = [];
          keys.forEach(function(k) {
            if (totals[k] != null && totals[k] !== 0) {
              var label = (STAT_LABELS[k]||k.substring(0,3));
              parts.push('<span class="gs-stat">' + label + ' <b>' + (totals[k]>0?'+':'') + Math.round(totals[k]*10)/10 + '</b></span>');
            }
          });
          return parts.length ? '<div class="gs-stats">' + parts.join('') + '</div>' : '';
        })()}
      </div>
      <div class="gs-actions">
        <button data-gear-load="${s.id}" class="ghost">Load</button>
        <button data-gear-del="${s.id}" class="ghost" style="color:var(--bad)" title="Delete this local preset">×</button>
      </div>
    </div>`;
  }).join('');
  const findSet = id => SHARED_GEAR.find(s => s.id === id);
  list.querySelectorAll('[data-gear-load]').forEach(b => {
    b.addEventListener('click', () => {
      const s = findSet(b.dataset.gearLoad);
      if (s) { GEAR = { ...s.gear }; saveGear(GEAR); renderGear(); toast(`Loaded gear set "${s.name}".`); }
    });
  });
  list.querySelectorAll('[data-gear-del]').forEach(b => {
    b.addEventListener('click', () => {
      const s = findSet(b.dataset.gearDel);
      if (!s) return;
      SHARED_GEAR = SHARED_GEAR.filter(x => x.id !== s.id);
      renderGearSets();
      syncShared('gear', [{ op: 'delete', id: s.id }]);
      toast(`Deleted "${s.name}" from local presets.`);
    });
  });
  list.querySelectorAll('[data-gear-vote]').forEach(b => {
    b.addEventListener('click', () => {
      const s = findSet(b.dataset.gearVote);
      if (!s) return;
      const dir = parseInt(b.dataset.dir, 10);
      const cur = (s.votes || {})[me] || 0;
      const next = cur === dir ? 0 : dir; // clicking your own vote clears it
      s.votes = s.votes || {};
      if (next === 0) delete s.votes[me]; else s.votes[me] = next;
      renderGearSets();
      syncShared('gear', [{ op: 'vote', id: s.id, voter: me, dir: next }]);
    });
  });
}


// § COMBAT STATS BROWSER — ER Balance Sheet (window.BALANCE_STATS)
// ═══════════════════════════════════════════════════════════════════════
// Renders every item from the live balance sheet (data/balance_stats.json →
// src/balance_stats.js) with its stat block, cross-linked to the recipe list
// where a recipe exists. Reference-only items (Skeleton/Jack-o'-lantern sets,
// mining tools, Turret, grenades, autoinjectors, non-craftable weapons) are
// shown with a "reference" badge.

let BALANCE_ITEMS = [];   // enriched {name, stats, category, recipe}
let BALANCE_CATS = [];

/** Normalized name for balance→recipe matching (mirrors update_balance_stats.py). */
function balNorm(s) {
  return String(s || '').toLowerCase()
    .replace(/\s*\((male|female)\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()
    .replace(/med\s?ikit/g, 'medkit');
}
const BAL_ALIASES = {
  // Sheet's own typos; recipes carry the published sheet's canonical names.
  'infensus minimist gloves': 'infensus minimalist gloves',
  'pythica sustained gloves': 'pythica sustained battle gloves',
};
function balResolve(n) {
  return BAL_ALIASES[n] || n;
}

/** Find the recipe whose output matches a balance-sheet item name. */
function balRecipe(name) {
  const c = balResolve(balNorm(name));
  return DATA.recipes.find(rr => balNorm(rr.output.item) === c) || null;
}

/** Classify a balance item into a browser category (recipe category wins). */
function balCategory(name, recipe) {
  if (recipe) return recipe.output.category || 'Other';
  const n = name.toLowerCase();
  if (/medikit|autoinjector|biocell|medigun/.test(n)) return 'Medical';
  if (/mining tool/.test(n)) return 'Tools';
  if (/grenade|explosive/.test(n)) return 'Explosive';
  if (/implant| amp\b/.test(n)) return 'Implants & Electronics';
  if (/helmet|shoulder|torso|arm pads|leg pads|gloves/.test(n)) return 'Armor';
  if (/(water|burger|cola|sushi|orange|brew|cheese|drink)/.test(n)) return 'Food & Drink';
  const drugs = ['cannabinol','nitrate','dexedrine','biphetamin','neurotonin','polycodeine','methedrine','euthemal','oxazoline','opiatech','phencyclidine','mdma','amphetamine','benzedrine','desoxyn','ritalin','dopamine','cocaboline','anabolica','meth'];
  if (drugs.some(d => n.includes(d))) return 'Drugs';
  if (/(rifle|pistol|gun|turret|emp|mg6|tar7|pp7|doa|barracuda|enervon|domin|inflex|streamline|rgi|hr420|techtronic|linner|salvotec|gakk|frostbite|candy|survival|protector|fgz|6x6)/.test(n)) return 'Weapons';
  return 'Other';
}

/** Build the enriched item list once (data is static per load). */
function initBalanceBrowser() {
  const grid = document.getElementById('gear-balance-grid');
  if (!grid) return;
  if (!window.BALANCE_STATS || !Array.isArray(BALANCE_STATS.items)) {
    grid.innerHTML = '<div class="ui-empty">Combat-stat data could not be loaded. Reload once online.</div>';
    const count = document.getElementById('gear-balance-count');
    if (count) count.textContent = 'Data unavailable';
    return;
  }
  if (BALANCE_ITEMS.length) { renderBalanceBrowser(); return; }
  const meta = document.getElementById('gear-balance-meta');
  if (meta) meta.textContent = `${BALANCE_STATS.items.length} items · fetched ${BALANCE_STATS._meta.fetched} · ER Balance Sheet snapshot`;
  BALANCE_ITEMS = BALANCE_STATS.items.map(it => {
    const recipe = balRecipe(it.name);
    return {
      name: it.name,
      stats: it.stats || {},
      category: balCategory(it.name, recipe),
      recipe: recipe ? recipe.output.item : null,
    };
  });
  BALANCE_CATS = [...new Set(BALANCE_ITEMS.map(i => i.category))].sort();
  const catSel = document.getElementById('balance-cat');
  if (catSel) {
    catSel.innerHTML = '<option value="">All categories</option>' +
      BALANCE_CATS.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  }
  const wire = el => el && el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', renderBalanceBrowser);
  wire(document.getElementById('balance-search'));
  wire(document.getElementById('balance-cat'));
  wire(document.getElementById('balance-sort'));
  renderBalanceBrowser();
}

/** Render the filtered/sorted grid. */
function renderBalanceBrowser() {
  const grid = document.getElementById('gear-balance-grid');
  if (!grid) return;
  const q = (document.getElementById('balance-search')?.value || '').toLowerCase();
  const cat = document.getElementById('balance-cat')?.value || '';
  const sort = document.getElementById('balance-sort')?.value || 'name';
  let items = BALANCE_ITEMS.filter(i =>
    (!q || i.name.toLowerCase().includes(q)) &&
    (!cat || i.category === cat));
  const count = document.getElementById('gear-balance-count');
  if (count) count.textContent = `${items.length} of ${BALANCE_ITEMS.length} items`;
  if (sort === 'name') items.sort((a, b) => a.name.localeCompare(b.name));
  else items.sort((a, b) => (b.stats[sort] || -999) - (a.stats[sort] || -999) || a.name.localeCompare(b.name));
  if (!items.length) {
    grid.innerHTML = '<div class="muted" style="grid-column:1/-1;padding:1rem">No items match.</div>';
    return;
  }
  grid.innerHTML = items.map(i => {
    const statChips = Object.entries(i.stats)
      .filter(([k]) => k !== 'classification')
      .map(([k, v]) => {
        const label = STAT_LABELS[k] || k;
        return `<span class="gbs-chip" title="${esc(STAT_DEFS[k] || '')}"><b>${esc(label)}</b> ${v > 0 ? '+' : ''}${v}</span>`;
      }).join('');
    const badge = i.recipe
      ? `<span class="gbs-badge craftable" title="Craftable — see recipe">craftable</span>`
      : `<span class="gbs-badge reference" title="In the balance sheet but no crafting recipe in-game">reference</span>`;
    return `<div class="gbs-item">
      <div class="gbs-name">${esc(i.name)} ${badge}</div>
      <div class="gbs-cat">${esc(i.category)}</div>
      <div class="gbs-stats">${statChips || '<span class="muted">no stats</span>'}</div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// § LOCAL DATA — gear sets, inventory, and colony settings
// ═══════════════════════════════════════════════════════════════════════════

const LOCAL_SHARED_KEY = 'er_calculator_shared_v1';
let SHARED_GEAR = [];   // [{id, name, gear:{slot:item}, owner, created_at, votes:{player:±1}}]
let SHARED_INV = {};    // local browser snapshot: {playerName: entries[]}
let SYNC_SAVING = false;
const SYNC_PENDING = { gear: [], inventory: [], taxes: [] };
let TAXES_SEEDED = false;

function localId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function storageStatus(msg) {
  const el = document.getElementById('gear-sync-status');
  if (el) el.textContent = msg;
}

// Adopt remote inventories: other players' data always wins; the active
// player's data is only adopted when we have no local edit waiting to push.
// Players present in the previous shared snapshot but now gone were removed
// by another workspace participant — drop them locally too so deletions propagate.
function adoptRemoteInventory(remote) {
  if (!remote || typeof remote !== 'object') return;
  const prev = SHARED_INV;
  SHARED_INV = remote;
  let changed = false;
  Object.keys(prev).forEach(name => {
    if (name in remote || !(name in PLAYERS.players)) return;
    if (name === PLAYERS.active && (INV_PUSH_TIMER || SYNC_PENDING.inventory.length)) return;
    delete PLAYERS.players[name];
    if (PLAYERS.active === name) PLAYERS.active = Object.keys(PLAYERS.players)[0] || '';
    changed = true;
  });
  Object.entries(remote).forEach(([name, entries]) => {
    if (!Array.isArray(entries)) return;
    if (name === PLAYERS.active && (INV_PUSH_TIMER || SYNC_PENDING.inventory.length)) return;
    if (JSON.stringify(PLAYERS.players[name] || null) !== JSON.stringify(entries)) {
      PLAYERS.players[name] = entries.map(e => ({ ...e }));
      changed = true;
    }
  });
  // Fold legacy location spellings before they land in local storage.
  if (window.STORE && window.STORE.migrateLocationNames &&
      window.STORE.migrateLocationNames(PLAYERS)) changed = true;
  // A remote inventory can be the first source of players in a fresh browser.
  // Select one explicitly; otherwise the native <select> displays its first
  // option while PLAYERS.active remains empty.
  if (!PLAYERS.active && Object.keys(PLAYERS.players).length &&
      window.STORE && window.STORE.ensureActivePlayer) {
    window.STORE.ensureActivePlayer();
    changed = true;
  }
  if (changed) {
    savePlayersLocal(PLAYERS);
    recomputeInv();
    // A remote player can change the active application context, not just the
    // inventory table. Use the common refresh path so the selector, footer,
    // destinations, picker, and calculator empty state stay consistent.
    refreshAll();
  }
}

// One-time upload of local players that don't exist in the shared store yet.
// Once-per-browser (localStorage flag), NOT once-per-session: re-running every
// boot resurrected players that had been deliberately removed from the shared
// store by any client that still held a stale local copy. New players created
// after this point are pushed by the savePlayers() hook instead.
function migrateLocalInventory(remote) {
  try {
    if (localStorage.getItem('cmg_inv_migrated_v1')) return;
    localStorage.setItem('cmg_inv_migrated_v1', '1');
  } catch (e) { return; }
  const ops = [];
  Object.entries(PLAYERS.players).forEach(([name, entries]) => {
    if (!(name in remote) && Array.isArray(entries)) ops.push({ op: 'setplayer', name, entries });
  });
  if (ops.length) syncShared('inventory', ops);
}

async function loadShared() {
  if (SYNC_SAVING) return;
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_SHARED_KEY) || '{}');
    SHARED_GEAR = Array.isArray(saved.gear) ? saved.gear : [];
    const localInventory = saved.inventory && typeof saved.inventory === 'object' ? saved.inventory : {};
    adoptRemoteInventory(localInventory);
    SHARED_INV = localInventory;
    if (saved.taxes && typeof saved.taxes === 'object') adoptRemoteColonies(saved.taxes);
    renderGearSets();
    storageStatus('Local · ' + new Date().toLocaleTimeString());
  } catch (e) {
    storageStatus('Local storage unavailable');
  }
}

function localColoniesSnapshot() {
  const out = {};
  if (typeof colonyList === 'function') {
    colonyList().forEach(colony => {
      out[colony] = { rate: COLONY_TAX[colony] || 0, owner: colonyOwnerIds(colony) };
    });
  }
  return out;
}

function applyLocalColonyOp(op) {
  if (!op || !op.colony) return;
  const remote = { [op.colony]: { rate: op.rate, owner: op.owner } };
  adoptRemoteColonies(remote);
}

function persistShared() {
  try {
    localStorage.setItem(LOCAL_SHARED_KEY, JSON.stringify({
      gear: SHARED_GEAR,
      inventory: SHARED_INV,
      taxes: localColoniesSnapshot(),
    }));
  } catch (e) {
    storageStatus('Local storage full');
  }
}

// Apply operations locally. The same data model remains available offline;
// optional server synchronization can be added later without changing UI code.
function syncShared(file, ops) {
  if (!ops.length) return;
  if (file === 'gear') {
    for (const op of ops) {
      if (op.op === 'delete') SHARED_GEAR = SHARED_GEAR.filter(s => s.id !== op.id);
      if (op.op === 'upsert') {
        const i = SHARED_GEAR.findIndex(s => s.id === op.set?.id);
        if (i >= 0) SHARED_GEAR[i] = op.set; else SHARED_GEAR.push(op.set);
      }
      if (op.op === 'vote') {
        const set = SHARED_GEAR.find(s => s.id === op.id);
        if (set) { set.votes = set.votes || {}; if (op.dir) set.votes[op.voter] = op.dir; else delete set.votes[op.voter]; }
      }
    }
    renderGearSets();
  } else if (file === 'inventory') {
    for (const op of ops) {
      if (op.op === 'setplayer') SHARED_INV[op.name] = op.entries;
      if (op.op === 'delplayer') delete SHARED_INV[op.name];
    }
  } else if (file === 'taxes') {
    for (const op of ops) if (op.colony) applyLocalColonyOp(op);
  }
  persistShared();
  storageStatus('Saved locally · ' + new Date().toLocaleTimeString());
}

// Debounced push of the active player's inventory after local edits.
let INV_PUSH_TIMER = null;
function schedulePushInv() {
  const name = PLAYERS.active;
  if (!name) return;
  if (INV_PUSH_TIMER) clearTimeout(INV_PUSH_TIMER);
  INV_PUSH_TIMER = setTimeout(() => {
    INV_PUSH_TIMER = null;
    // Read the CAPTURED player's entries, not the currently-active player's:
    // switching players inside the debounce window used to push player B's
    // inventory under player A's name (cross-player data corruption).
    if (!(name in PLAYERS.players)) return; // removed while pending
    const entries = (PLAYERS.players[name] || []).map(e => ({ ...e }));
    // Skip the push when nothing differs from the shared store (e.g. player switch).
    if (JSON.stringify(SHARED_INV[name] || null) === JSON.stringify(entries)) return;
    SHARED_INV[name] = entries;
    syncShared('inventory', [{ op: 'setplayer', name, entries }]);
  }, 1200);
}

// Names for local gear owners: local players plus anyone seen in the
// shared requests (so participant names propagate across browsers).
function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 604800) return Math.floor(s / 86400) + 'd ago';
  return new Date(ts).toLocaleDateString();
}
