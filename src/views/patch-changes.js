/*
 * Proposed patch explainer — preview only.
 *
 * This file deliberately does not modify BALANCE_STATS or GAME_DATA. It applies
 * the supplied next-patch notes to a copy at render time so the live Gear and
 * Calculator remain on the current snapshot until the patch is confirmed.
 *
 * Tab structure:
 *   1. Build goals      — "what do you want your build to do?" ranked gear per goal
 *   2. Summary cards    — the patch narrative at a glance
 *   3. Build planner    — pick slots, compare current vs proposed totals
 *   4. Gear explorer    — every item, as exact-stat profiles or as change cards
 *   5. Protection guide — published stat mapping reference
 */
'use strict';
(function installPatchChanges(window, document) {
  const STAT_LABELS = {
    agility: 'Agility', bioregen: 'Bio Regen', healthregen: 'Health Regen',
    staminaregen: 'Stamina Regen', addictiontreatment: 'Addiction Treatment',
    bioenergydrain: 'Bio Energy Drain', auraregen: 'Aura Regen', auradamage: 'Aura Damage',
    healthdrain: 'Health Drain', staminadrain: 'Stamina Drain', defense_rating: 'Defense',
    block_rating: 'Block', weaponrecoil: 'Weapon Recoil', health: 'Health', stamina: 'Stamina', aura: 'Aura',
    armor: 'Armor', shielding: 'Shielding', endurance: 'Endurance',
    reflection: 'Reflection', resistance: 'Resistance',
  };
  const STAT_ORDER = ['armor', 'shielding', 'endurance', 'resistance', 'reflection', 'agility', 'bioregen', 'healthregen', 'staminaregen', 'addictiontreatment'];
  const ARMOR_SUFFIXES = ['Helmet', 'Shoulder Pads', 'Arm Pads', 'Torso Armor', 'Leg Pads'];
  const PROTECTION_MAPPING = [
    ['Armor', 'Ballistic', 'FDC'], ['Shielding', 'Energy', 'VI'],
    ['Endurance', 'Stamina', 'CMG'], ['Resistance', 'Bio', 'EC'],
    ['Reflection', 'Aura', 'BoS'],
  ];
  const PATCH_GROUPS = [
    { id: 'pythica-heavy', label: 'Pythica heavy battle', match: /^Pythica (Sustained Battle|Durable Battle) /, delta: { armor: -9, shielding: -10, agility: 0.3 } },
    { id: 'nanotech-heavy', label: 'NanoTech heavy', match: /^NanoTech (Voltaic|Cognizant|Voltac Assault) /, delta: { armor: -9, shielding: -9, agility: 0.3 } },
    { id: 'infensus-heavy', label: 'Infensus Heavy', match: /^Infensus Heavy /, delta: { armor: -10, shielding: -9, agility: 0.3 } },
    { id: 'light-armor-nerf', label: 'Heavy armor defense tradeoff', match: /^(Locans (Defense|Stabilized)|Detox Combat|Firstborn Powered|Legionnaire Powered|PreMet (Collision|Impact)|Aramid (Basic|Altered|Modified)|Leech|Justicar Powered) /, delta: { armor: -10, shielding: -10, agility: 0.3 } },
    { id: 'hypobaric-metabolic', label: 'Hypobaric / Metabolic sustain', match: /^(Hypobaric|Metabolic) /, delta: { armor: -5, shielding: -5, endurance: -5, resistance: -5, reflection: -7, agility: -0.1, staminaregen: -0.1, addictiontreatment: -0.01, healthregen: 0.05 } },
    { id: 'pythica-gloves', label: 'Pythica gloves', match: /^Pythica (Special Operations|Mobile Infantry|S1|Sustained) Gloves \((Male|Female)\)$/, delta: { armor: -6 } },
    { id: 'infensus-gloves', label: 'Infensus gloves', match: /^Infensus (Minimist|Shock|X1 Assault|Heavy) Gloves \((Male|Female)\)$/, delta: { shielding: -6 } },
    { id: 'xenotech-shoulder', label: 'XenoTech Expeditionary shoulder stats removed', match: /^XenoTech Expeditionary Shoulder Pads$/, remove: ['agility', 'bioregen', 'armor', 'shielding', 'endurance', 'reflection', 'resistance'] },
    { id: 'resistance-amp', label: 'Resistance Amp implant', match: /^Resistance Amp$/, delta: { healthregen: -0.5, armor: 25, shielding: 25 } },
  ];
  /* Build goals: the practical question "what should this gear do for me?".
   * `weight` turns a stat block into one comparable goal score. */
  const GOALS = [
    { id: 'armor', icon: '🛡️', label: 'Armor protection', blurb: 'Soak ballistic and energy hits', formula: 'Armor + Shielding', stats: ['Armor', 'Shielding'], weight: { armor: 1, shielding: 1 } },
    { id: 'stamina', icon: '⚡', label: 'Stamina sustain', blurb: 'Sprint and swing longer', formula: 'Endurance + (Stamina Regen × 20)', stats: ['Endurance', 'Stamina Regen'], weight: { endurance: 1, staminaregen: 20 } },
    { id: 'hp-regen', icon: '❤️', label: 'Health regen', blurb: 'Heal between fights without meds', formula: 'Health Regen × 40', stats: ['Health Regen'], weight: { healthregen: 40 } },
    { id: 'bio-regen', icon: '🧬', label: 'Bio regen', blurb: 'Push the Bio Regen breakpoint', formula: 'Bio Regen × 40', stats: ['Bio Regen'], weight: { bioregen: 40 } },
    { id: 'mobility', icon: '🏃', label: 'Mobility', blurb: 'Keep Agility positive for fast movement', formula: 'Agility × 10', stats: ['Agility'], weight: { agility: 10 } },
  ];

  const state = { goal: null, tab: 'profiles' };
  let profileRenderTimer = null;
  let explorerRenderTimer = null;
  const IMPLANT_SLOTS = Object.freeze({
    'Shoulder Lamp': 'Shoulder Pads',
    'Stamina Amplification': 'Chest / implant slot',
    'Shield Implant': 'Chest / implant slot',
    'Resistance Amp': 'Leg / implant slot',
  });
  const DATA_INDEX = { items: null, recipes: null, value: null };

  function cloneStats(stats) { return Object.assign({}, stats || {}); }
  function findPatchGroup(name) { return PATCH_GROUPS.find(group => group.match.test(name)); }
  function applyPatch(item) {
    const current = cloneStats(item.stats);
    const proposed = cloneStats(current);
    const group = findPatchGroup(item.name);
    if (!group) return { item, current, proposed, group: null, changes: [] };
    if (group.remove) group.remove.forEach(key => { proposed[key] = 0; });
    Object.entries(group.delta || {}).forEach(([key, value]) => { proposed[key] = (Number(proposed[key]) || 0) + value; });
    const keys = new Set([...Object.keys(current), ...Object.keys(proposed)]);
    const changes = [...keys].filter(key => Number(current[key] || 0) !== Number(proposed[key] || 0))
      .map(key => ({ key, before: Number(current[key] || 0), after: Number(proposed[key] || 0), delta: Number(proposed[key] || 0) - Number(current[key] || 0) }))
      .sort((a, b) => statOrderIndex(a.key) - statOrderIndex(b.key) || a.key.localeCompare(b.key));
    return { item, current, proposed, group, changes };
  }

  function statOrderIndex(key) { const at = STAT_ORDER.indexOf(key); return at < 0 ? 99 : at; }
  /* Only items a player can actually produce right now belong on this tab.
   * Recipe names sometimes differ from balance-sheet names (gender suffixes,
   * "Minimist" vs "Minimalist"), so reuse the recipe alias lookup. */
  function isCraftableItem(name, recipes) { return !!recipeFor(name, recipes); }
  function normalizeName(name) { return String(name || '').toLowerCase().replace(/\s*\((male|female)\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  const RECIPE_INDEX = new WeakMap();
  function recipeIndex(recipes) {
    if (RECIPE_INDEX.has(recipes)) return RECIPE_INDEX.get(recipes);
    const index = new Map();
    (recipes || []).forEach(recipe => {
      const key = normalizeName(recipe.output?.item);
      if (key && !index.has(key)) index.set(key, recipe);
    });
    RECIPE_INDEX.set(recipes, index);
    return index;
  }
  function recipeFor(name, recipes) {
    const aliases = { 'infensus minimist gloves': 'infensus minimalist gloves', 'pythica sustained gloves': 'pythica sustained battle gloves' };
    const normalized = aliases[normalizeName(name)] || normalizeName(name);
    const source = Array.isArray(recipes) ? recipes : (window.GAME_DATA?.recipes || []);
    return recipeIndex(source).get(normalized) || null;
  }
  function categoryFor(record, recipes) {
    const recipe = recipeFor(record.item.name, recipes);
    if (recipe) return recipe.output?.category || 'Other';
    const name = record.item.name.toLowerCase();
    if (/helmet|shoulder|torso|arm pads|leg pads|gloves/.test(name)) return 'Armor';
    if (/implant| amp\b/.test(name)) return 'Implants & Electronics';
    return 'Other';
  }
  function allItems(items) { return (items || window.BALANCE_STATS?.items || []).map(item => applyPatch(item)); }
  function allGearRecords(items) {
    if (items == null) return dataIndex().records;
    const recipes = window.GAME_DATA?.recipes || [];
    return allItems(items).map(record => ({ ...record, category: categoryFor(record, recipes) }));
  }
  function dataIndex() {
    const items = window.BALANCE_STATS?.items || [];
    const recipes = window.GAME_DATA?.recipes || [];
    if (DATA_INDEX.value && DATA_INDEX.items === items && DATA_INDEX.recipes === recipes) return DATA_INDEX.value;
    const records = allItems(items).map(record => ({ ...record, category: categoryFor(record, recipes) }));
    const craftableRecords = records.filter(record => isCraftableItem(record.item.name, recipes));
    const scopedRecords = craftableRecords.filter(record => record.category === 'Armor' || record.category === 'Implants & Electronics');
    const scopedEntries = scopedRecords.map(record => ({ record, meta: recordMeta(record, recipes) }));
    const value = {
      items, recipes, records, craftableRecords, scopedRecords,
      itemByName: new Map(items.map(item => [item.name, item])),
      profileKeys: profileKeys(scopedRecords),
      profileGroups: null,
      scopedEntries,
      candidateCache: new Map(),
    };
    DATA_INDEX.items = items;
    DATA_INDEX.recipes = recipes;
    DATA_INDEX.value = value;
    return value;
  }
  function armorFamily(name) {
    const families = window.ARMOR_CLASSES?.families || [];
    const hit = families.slice().sort((a, b) => b.prefix.length - a.prefix.length).find(f => name.indexOf(f.prefix) === 0);
    return hit || null;
  }
  function formatNumber(value) { return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100); }
  function signed(value) { return `${value > 0 ? '+' : ''}${formatNumber(value)}`; }
  function statLabel(key) { return STAT_LABELS[key] || key; }
  function escText(value) { return typeof window.esc === 'function' ? window.esc(String(value)) : String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function renderGearIcon(name) {
    if (!name) return '';
    // Balance names carry (Male)/(Female) suffixes; icon assets don't.
    const iconKey = name.replace(/\s*\((Male|Female)\)\s*$/, '');
    const icon = typeof window.ENGINE?.iconFor === 'function'
      ? window.ENGINE.iconFor(iconKey)
      : `<span class="icon icon-missing"><span class="icon-badge">${escText(String(iconKey).replace(/[^a-zA-Z]/g, '').charAt(0).toUpperCase() || '?')}</span></span>`;
    return `<span class="patch-item-icon" title="${escText(name)}" aria-hidden="true">${icon}</span>`;
  }

  function changedRecords() { return allItems().filter(record => record.changes.length); }
  function recordMeta(record, recipes) {
    const family = armorFamily(record.item.name);
    const recipe = recipeFor(record.item.name, recipes);
    const category = record.category || categoryFor(record, recipes);
    const type = recipe?._armor_type;
    const slotNames = { Helmet: 'Helmet', ShoulderPads: 'Shoulder Pads', ArmPads: 'Arm Pads', Torso: 'Torso / chest slot', TorsoArmor: 'Torso / chest slot', LegPads: 'Leg / implant slot' };
    return {
      family: family?.prefix || (category === 'Implants & Electronics' ? 'Implant' : 'Other'),
      faction: recipe?._faction || family?.faction || (category === 'Implants & Electronics' ? 'Universal' : '—'),
      weight: family?.weight || (category === 'Armor' ? 'Unclassified' : '—'),
      slot: IMPLANT_SLOTS[record.item.name] || slotNames[type] || ARMOR_SUFFIXES.find(suffix => record.item.name.endsWith(suffix)) || (record.item.name.includes('Gloves') ? 'Gloves' : 'Implant'),
      category,
    };
  }
  function profileKeys(records) {
    if (!records) return dataIndex().profileKeys;
    const keys = new Set();
    records.forEach(record => Object.keys(record.current).forEach(key => keys.add(key)));
    return [...keys].sort((a, b) => statOrderIndex(a) - statOrderIndex(b) || a.localeCompare(b));
  }
  function profileSignature(record, keys) { return (keys || profileKeys([record])).map(key => `${key}:${Number(record.current[key] || 0)}`).join('|'); }
  function groupByExactStats(records) {
    const keys = profileKeys(records);
    const groups = new Map();
    records.forEach(record => {
      const key = profileSignature(record, keys);
      if (!groups.has(key)) groups.set(key, { record, records: [], metas: [] });
      const group = groups.get(key); group.records.push(record); group.metas.push(recordMeta(record));
    });
    return [...groups.values()];
  }
  function profileTradeoffs(stats) {
    const s = stats || {};
    const pros = [];
    const cons = [];
    const defense = (Number(s.armor) || 0) + (Number(s.shielding) || 0) + (Number(s.endurance) || 0);
    if (defense >= 180) pros.push('strong ballistic + energy wall');
    else if (defense > 0 && defense < 120) cons.push('lower raw protection');
    if ((Number(s.agility) || 0) > 1) pros.push('fast movement');
    else if ((Number(s.agility) || 0) < 0) cons.push('slower movement');
    if ((Number(s.healthregen) || 0) > 0) pros.push('health regen');
    if ((Number(s.bioregen) || 0) > 0) pros.push('bio regen');
    if ((Number(s.staminaregen) || 0) > 0) pros.push('stamina regen');
    if ((Number(s.resistance) || 0) >= 100) pros.push('high bio resistance');
    if ((Number(s.reflection) || 0) >= 75) pros.push('aura reflection');
    if ((Number(s.healthdrain) || 0) > 0 || (Number(s.staminadrain) || 0) > 0 || (Number(s.bioenergydrain) || 0) > 0) cons.push('drains resources while worn');
    return { pros: pros.length ? pros : ['specialist profile'], cons };
  }
  function goalScore(stats, goal) {
    const source = stats || {};
    return Object.entries(goal.weight).reduce((sum, [key, weight]) => sum + (Number(source[key]) || 0) * weight, 0);
  }
  function goalDelta(record, goal) { return goalScore(record.proposed, goal) - goalScore(record.current, goal); }
  function comparisonText(current, proposed) {
    const before = formatNumber(Number(current) || 0);
    const after = formatNumber(Number(proposed) || 0);
    return before === after ? `Current ${before} · Proposed ${after} · Unchanged` : `Current ${before} → Proposed ${after}`;
  }

  function renderProfileChips(stats, compare) {
    return profileKeys().filter(key => stats[key] !== undefined && Number(stats[key]) !== 0).map(key => {
      const value = Number(stats[key]);
      const was = compare ? Number(compare[key] || 0) : null;
      const changed = was !== null && was !== value;
      const delta = changed ? `<em class="patch-delta-chip ${value > was ? 'is-up' : 'is-down'}">${signed(value - was)}</em>` : '';
      return `<span class="patch-chip"><b>${escText(statLabel(key))}</b> ${signed(value)}${delta}</span>`;
    }).join('') || '<span class="patch-chip patch-chip-empty">no recorded stats</span>';
  }

  function renderMetaChips(metaGroups) {
    const chips = [];
    if (metaGroups.factions.length) chips.push(`<span class="patch-chip">${escText(metaGroups.factions.join(' / '))}</span>`);
    if (metaGroups.weights.length) chips.push(`<span class="patch-chip">${escText(metaGroups.weights.join(' / '))}</span>`);
    if (metaGroups.slots.length) chips.push(`<span class="patch-chip">${escText(metaGroups.slots.join(', '))}</span>`);
    return chips.join('');
  }

  function filteredProfiles() {
    const q = String(document.getElementById('patch-search')?.value || '').trim().toLowerCase();
    const faction = document.getElementById('patch-faction')?.value || '';
    const weight = document.getElementById('patch-weight')?.value || '';
    const category = document.getElementById('patch-category')?.value || '';
    const index = dataIndex();
    const noFilters = !q && !faction && !weight && !category;
    const records = noFilters
      ? index.scopedRecords
      : index.craftableRecords.filter(record => {
        if (category === 'Other') return record.category === 'Other';
        if (category && record.category !== category) return false;
        return record.category === 'Armor' || record.category === 'Implants & Electronics';
      });
    const groups = noFilters
      ? (index.profileGroups || (index.profileGroups = groupByExactStats(index.scopedRecords)))
      : groupByExactStats(records);
    return groups.map(group => {
      const metas = group.metas;
      const text = `${group.record.item.name} ${metas.map(meta => `${meta.family} ${meta.faction} ${meta.weight} ${meta.slot}`).join(' ')}`.toLowerCase();
      const factions = [...new Set(metas.map(meta => meta.faction))].sort();
      const weights = [...new Set(metas.map(meta => meta.weight))].sort();
      // The armor patch only touches armor and implants; keep other gear out
      // unless the user explicitly asks for it via the category filter.
      const inScope = metas.some(meta => meta.category === 'Armor' || meta.category === 'Implants & Electronics') || category === 'Other';
      if (!inScope || (q && !text.includes(q)) || (category && !metas.some(meta => meta.category === category)) || (faction && !factions.includes(faction)) || (weight && !weights.includes(weight))) return null;
      return { ...group, factions, weights, slots: [...new Set(metas.map(meta => meta.slot))].sort() };
    }).filter(Boolean);
  }

  function renderProfiles() {
    const list = document.getElementById('patch-group-list');
    if (!list) return 0;
    const groups = filteredProfiles();
    const goal = GOALS.find(candidate => candidate.id === state.goal) || null;
    if (goal) {
      groups.forEach(group => { group.score = goalScore(group.record.proposed, goal); group.scoreNow = goalScore(group.record.current, goal); });
      groups.sort((a, b) => b.score - a.score || a.record.item.name.localeCompare(b.record.item.name));
    } else {
      groups.sort((a, b) => (b.records.length - a.records.length) || a.record.item.name.localeCompare(b.record.item.name));
    }
    const topScore = goal ? Math.max(...groups.map(group => group.score), 1) : 0;
    list.innerHTML = groups.map(group => {
      const changedSample = group.records.find(record => record.changes.length);
      const proposed = changedSample?.proposed || group.record.current;
      const tradeoffs = profileTradeoffs(group.record.current);
      const patchLabels = [...new Set(group.records.flatMap(record => record.group ? [record.group.label] : []))];
      const goalBar = goal ? `<div class="patch-goalbar" title="${escText(goal.label)} score (after patch)"><span class="patch-goalbar-track"><i style="width:${Math.max(4, Math.round((group.score / topScore) * 100))}%"></i></span><span class="patch-goalbar-num">${escText(comparisonText(group.scoreNow, group.score))}</span></div>` : '';
      return `<article class="patch-profile-card${goal ? ' has-goal' : ''}">
        <div class="patch-profile-head">
          <div><h4>${escText([...new Set(group.metas.map(meta => meta.family))].sort().join(' / '))}</h4>
          <div class="patch-chiprow">${renderMetaChips(group)}</div></div>
          <strong>${group.records.length} item${group.records.length === 1 ? '' : 's'}</strong>
        </div>
        ${goalBar}
        <div class="patch-profile-stats">
          <div><small>Gear 1.9 · current</small><div class="patch-chiprow">${renderProfileChips(group.record.current)}</div></div>
          <div><small>Gear 1.10 · proposed</small><div class="patch-chiprow">${renderProfileChips(proposed, group.record.current)}</div></div>
        </div>
        <div class="patch-pros-cons">
          <span class="patch-pros"><b>Good for</b> ${escText(tradeoffs.pros.join(', '))}</span>
          <span class="patch-cons"><b>Tradeoffs</b> ${escText(tradeoffs.cons.length ? tradeoffs.cons.join(', ') : 'none in listed stats')}</span>
        </div>
        ${patchLabels.length ? `<p class="patch-profile-change"><b>Patch:</b> ${escText(patchLabels.join('; '))}</p>` : ''}
        <details><summary>Items in this profile (${group.records.length})</summary>
          <p class="patch-profile-items">${group.records.slice().sort((a, b) => a.item.name.localeCompare(b.item.name)).map(record => renderGearIcon(record.item.name) + escText(record.item.name)).join(' · ')}</p>
        </details>
      </article>`;
    }).join('') || '<p class="patch-empty">No armor profiles match these filters.</p>';
    return groups.length;
  }

  function scheduleProfileRender() {
    if (profileRenderTimer !== null) {
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(profileRenderTimer);
      else window.clearTimeout(profileRenderTimer);
    }
    const render = () => { profileRenderTimer = null; renderProfiles(); };
    profileRenderTimer = typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(render, { timeout: 250 })
      : window.setTimeout(render, 0);
  }

  function scheduleExplorerRender() {
    if (explorerRenderTimer !== null) {
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(explorerRenderTimer);
      else window.clearTimeout(explorerRenderTimer);
    }
    const render = () => { explorerRenderTimer = null; renderExplorer(); };
    explorerRenderTimer = typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(render, { timeout: 250 })
      : window.setTimeout(render, 0);
  }

  function renderChangeCards() {
    const list = document.getElementById('patch-changes-list');
    if (!list) return 0;
    const q = String(document.getElementById('patch-search')?.value || '').trim().toLowerCase();
    const faction = document.getElementById('patch-faction')?.value || '';
    const weight = document.getElementById('patch-weight')?.value || '';
    const category = document.getElementById('patch-category')?.value || '';
    const numeric = document.getElementById('patch-numeric-only')?.checked;
    const recipes = window.GAME_DATA?.recipes || [];
    const records = changedRecords().filter(record => isCraftableItem(record.item.name, recipes)).filter(record => {
      const meta = recordMeta(record);
      const text = `${record.item.name} ${meta.family} ${meta.faction} ${meta.weight} ${meta.slot} ${record.group?.label || ''}`.toLowerCase();
      return (!q || text.includes(q)) && (!category || meta.category === category) && (!faction || meta.faction === faction) && (!weight || meta.weight === weight) && (!numeric || record.changes.some(change => ['armor', 'shielding', 'endurance', 'resistance', 'reflection'].includes(change.key)));
    }).sort((a, b) => a.item.name.localeCompare(b.item.name));
    list.innerHTML = records.map(record => {
      const meta = recordMeta(record);
      const changes = `<div class="patch-delta-head"><span>Stat</span><span>Gear 1.9</span><span></span><span>Gear 1.10</span><span>Delta</span></div>` + record.changes.map(change => `<div class="patch-delta"><span>${escText(statLabel(change.key))}</span><span>${formatNumber(change.before)}</span><span class="patch-arrow">→</span><b>${formatNumber(change.after)}</b><strong class="${change.delta > 0 ? 'is-up' : 'is-down'}">${signed(change.delta)}</strong></div>`).join('');
      return `<article class="patch-card">
        <div class="patch-card-head"><div><h4>${renderGearIcon(record.item.name)}${escText(record.item.name)}</h4>
        <p>${escText(meta.family)} · ${escText(meta.faction)} · ${escText(meta.weight)} · ${escText(meta.slot)}</p></div>
        <span class="patch-badge">${escText(record.group?.label || 'Changed')}</span></div>
        <div class="patch-deltas">${changes}</div>
      </article>`;
    }).join('') || '<p class="patch-empty">No patch changes match these filters.</p>';
    return records.length;
  }

  function renderGoalDetail() {
    const target = document.getElementById('patch-goal-detail');
    if (!target) return;
    const goal = GOALS.find(candidate => candidate.id === state.goal);
    if (!goal) { target.innerHTML = ''; target.hidden = true; return; }
    target.hidden = false;
    const index = dataIndex();
    /* Rank craftable armor + implants per real occupied slot so one goal
     * never returns six variations of the same slot. */
    const ranked = [];
    const slotOrder = ['Helmet', 'Shoulder Pads', 'Arm Pads', 'Torso / chest slot', 'Gloves', 'Leg / implant slot'];
    const candidateEntries = index.scopedEntries
      .map(entry => ({ ...entry, score: goalScore(entry.record.proposed, goal), scoreNow: goalScore(entry.record.current, goal), delta: goalDelta(entry.record, goal) }))
      .filter(entry => slotOrder.includes(entry.meta.slot));
    slotOrder.forEach(slot => {
      const slotEntries = candidateEntries
        .filter(entry => entry.meta.slot === slot && (Math.abs(entry.score) > 0 || Math.abs(entry.delta) > 0))
        .sort((a, b) => b.score - a.score || b.delta - a.delta);
      if (slotEntries[0]) ranked.push(slotEntries[0]);
    });
    ranked.sort((a, b) => b.score - a.score);
    const topScore = Math.max(...ranked.map(entry => entry.score), 1);
    const patchImpact = ranked.filter(entry => entry.delta !== 0);
    const impactNote = patchImpact.length
      ? `The patch changes this goal for ${patchImpact.length} of the top pieces: ${patchImpact.slice(0, 3).map(entry => `${escText(entry.record.item.name)} (${signed(entry.delta)})`).join(', ')}${patchImpact.length > 3 ? '…' : ''}.`
      : 'The patch does not change this goal for the current top pieces.';
    target.innerHTML = `<div class="patch-goal-brief">
        <p class="patch-goal-lead">${goal.icon} <b>${escText(goal.label)}</b> — ${escText(goal.blurb)}. Comparison score: <b>${escText(goal.formula)}</b>. This is a ranking aid, not an in-game percentage. The list shows the best craftable option in each occupied slot.</p>
        <p class="patch-goal-impact">${impactNote}</p>
        <p class="patch-goal-note">Best piece per slot, craftable right now.</p>
      </div>
      <div class="patch-ranking">${ranked.map((entry, index) => `<div class="patch-ranking-row">          <span class="patch-rank">${index + 1}</span>
          <span class="patch-ranking-name">${renderGearIcon(entry.record.item.name)}${escText(entry.record.item.name)}<small>${escText(entry.meta.faction)} · ${escText(entry.meta.slot)}</small></span>
          <span class="patch-goalbar" title="${escText(goal.label)} score after patch"><span class="patch-goalbar-track"><i style="width:${Math.max(4, Math.round((entry.score / topScore) * 100))}%"></i></span><span class="patch-goalbar-num">${escText(comparisonText(entry.scoreNow, entry.score))}</span></span>
          ${entry.delta !== 0 ? `<em class="patch-delta-chip ${entry.delta > 0 ? 'is-up' : 'is-down'}">${signed(entry.delta)} patch</em>` : ''}
        </div>`).join('')}</div>`;
  }

  function renderGoals() {
    const wrap = document.getElementById('patch-goals');
    if (!wrap) return;
    wrap.innerHTML = GOALS.map(goal => `<button type="button" class="patch-goal${state.goal === goal.id ? ' is-active' : ''}" data-patch-goal="${goal.id}" aria-pressed="${state.goal === goal.id}">
        <span class="patch-goal-icon" aria-hidden="true">${goal.icon}</span>
        <b>${escText(goal.label)}</b>
        <span>${escText(goal.blurb)}</span>
        <small class="patch-goal-formula">${escText(goal.formula)}</small>
        <span class="patch-goal-stats">${goal.stats.map(stat => `<span class="patch-chip">${escText(stat)}</span>`).join('')}</span>
      </button>`).join('');
    wrap.querySelectorAll('[data-patch-goal]').forEach(button => button.addEventListener('click', () => {
      state.goal = state.goal === button.dataset.patchGoal ? null : button.dataset.patchGoal;
      renderGoals();
      renderGoalDetail();
      // The ranking above is the immediate interaction. Profile cards are
      // below the fold and can rebuild during idle time without blocking the
      // clicked goal's response.
      scheduleProfileRender();
    }));
  }

  const defaultBuild = {
    Helmet: 'Aramid Basic Helmet',
    'Shoulder Pads': 'Aramid Modified Shoulder Pads',
    'Arm Pads': 'Pythica Sustained Battle Arm Pads',
    'Chest / implant slot': 'Stamina Amplification',
    Gloves: 'Pythica Sustained Gloves (Male)',
    'Leg / implant slot': 'Pythica Sustained Battle Leg Pads',
    'Booster / food 1': '',
    'Booster / food 2': '',
    Medikit: '',
  };
  let build = Object.assign({}, defaultBuild);

  function buildCandidates(slot) {
    const index = dataIndex();
    if (!index.candidateCache.has(slot)) index.candidateCache.set(slot, buildCandidatesFromData(slot, index.craftableRecords, index.recipes, true));
    return index.candidateCache.get(slot);
  }
  function buildCandidatesFromData(slot, records, recipes, alreadyCraftable = false) {
    const sourceRecords = records.map(record => record.item ? record : applyPatch(record))
      // Only craftable items belong in a build the player can actually assemble.
      .filter(record => alreadyCraftable || isCraftableItem(record.item.name, recipes));
    if (slot === 'Booster / food 1' || slot === 'Booster / food 2') {
      return sourceRecords.filter(record => ['Drugs', 'Food & Drink'].includes(categoryFor(record, recipes)) && !/medigun/i.test(record.item.name)).map(record => record.item.name).sort();
    }
    if (slot === 'Medikit') {
      // Medical guns occupy a gun slot; only healing consumables belong here.
      return sourceRecords.filter(record => /medikit|biocell/i.test(record.item.name) && !/medigun/i.test(record.item.name)).map(record => record.item.name).sort();
    }
    if (slot === 'Chest / implant slot') {
      return sourceRecords.filter(record => {
        const meta = recordMeta({ ...record, category: categoryFor(record, recipes) }, recipes);
        return meta.slot === 'Torso / chest slot' || meta.slot === 'Chest / implant slot';
      }).map(record => record.item.name).sort();
    }
    if (slot === 'Leg / implant slot') {
      return sourceRecords.filter(record => {
        const meta = recordMeta({ ...record, category: categoryFor(record, recipes) }, recipes);
        return meta.slot === 'Leg / implant slot';
      }).map(record => record.item.name).sort();
    }
    return sourceRecords.filter(record => recordMeta({ ...record, category: categoryFor(record, recipes) }, recipes).slot === slot && categoryFor(record, recipes) === 'Armor')
      .map(record => record.item.name).sort();
  }

  function buildTotal(names, proposed) {
    const total = {};
    const itemByName = dataIndex().itemByName;
    names.forEach(name => {
      const source = itemByName.get(name);
      const record = applyPatch({ name, stats: source?.stats || {} });
      const stats = proposed ? record.proposed : record.current;
      Object.entries(stats).forEach(([key, value]) => { if (typeof value === 'number') total[key] = (total[key] || 0) + value; });
    });
    return total;
  }

  function renderBuild() {
    const root = document.getElementById('patch-build');
    if (!root) return;
    const names = Object.values(build);
    const before = buildTotal(names, false);
    const after = buildTotal(names, true);
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(key => before[key] || after[key])
      .sort((a, b) => statOrderIndex(a) - statOrderIndex(b) || a.localeCompare(b));
    const goalChips = GOALS.map(goal => {
      const now = goalScore(before, goal);
      const next = goalScore(after, goal);
      const delta = next - now;
      return `<span class="patch-chip patch-goalchip" title="${escText(goal.label)} — ${escText(goal.formula)}"><span aria-hidden="true">${goal.icon}</span> ${escText(goal.label)} <small class="patch-goalchip-formula">(${escText(goal.formula)})</small> <b>${escText(comparisonText(now, next))}</b>${delta !== 0 ? `<em class="patch-delta-chip ${delta > 0 ? 'is-up' : 'is-down'}">${signed(delta)} patch</em>` : ''}</span>`;
    }).join('');
    const rows = keys.map(key => {
      const delta = (after[key] || 0) - (before[key] || 0);
      return `<div class="patch-build-row${delta !== 0 ? ' is-changed' : ''}"><span>${escText(statLabel(key))}</span><b>${formatNumber(before[key] || 0)}</b><span class="patch-arrow">→</span><b>${formatNumber(after[key] || 0)}</b><strong class="${delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : ''}">${delta !== 0 ? signed(delta) : '—'}</strong></div>`;
    }).join('');
    const bio = after.bioregen || 0;
    root.innerHTML = `<div class="patch-build-slots">${Object.entries(build).map(([slot, selected]) => {
      const options = `<option value="">None</option>${buildCandidates(slot).map(name => `<option value="${escText(name)}" ${name === selected ? 'selected' : ''}>${escText(name)}</option>`).join('')}`;
      const label = slot === 'Medikit' ? 'Medikit (healing item)' : slot;
      return `<label><span>${renderGearIcon(selected)}${escText(label)}</span><select data-patch-slot="${escText(slot)}" aria-label="${escText(label)} build item">${options}</select></label>`;
    }).join('')}</div>
    <div class="patch-build-goals" aria-label="Build goal summary">${goalChips}</div>
    <p class="patch-callout"><strong>Recorded Bio Regen total:</strong> ${formatNumber(bio)} from this build’s selected equipment. Chest is one choice — torso armor, Stamina Amplification, or Shield Implant — and the leg slot is one choice — leg armor or Resistance Amp. These choices are mutually exclusive and this total is not a claim about the game’s undocumented conversion formula.</p>
    <div class="patch-build-head"><span>Stat</span><span>Gear 1.9</span><span></span><span>Gear 1.10</span><span>Patch delta</span></div>
    <div class="patch-build-table">${rows}</div>`;
    root.querySelectorAll('[data-patch-slot]').forEach(select => select.addEventListener('change', event => { build[event.target.dataset.patchSlot] = event.target.value; renderBuild(); }));
  }

  function renderExplorer(renderItems = true) {
    const profilesList = document.getElementById('patch-group-list');
    const changesList = document.getElementById('patch-changes-list');
    const count = document.getElementById('patch-count');
    const isProfiles = state.tab === 'profiles';
    if (profilesList) profilesList.hidden = !isProfiles;
    if (changesList) changesList.hidden = isProfiles;
    document.querySelectorAll('[data-patch-tab]').forEach(button => {
      const active = button.dataset.patchTab === state.tab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    if (!renderItems) {
      if (count) count.textContent = 'Loading gear profiles…';
      return;
    }
    const total = isProfiles ? renderProfiles() : renderChangeCards();
    if (count) {
      count.textContent = isProfiles
        ? `${total} stat profile${total === 1 ? '' : 's'} shown`
        : `${total} changed item${total === 1 ? '' : 's'}`;
    }
  }

  function initPatchChanges() {
    const root = document.getElementById('view-patch-changes');
    if (!root || root.dataset.ready) return;
    root.dataset.ready = 'true';
    const factions = [...new Set(changedRecords().filter(record => isCraftableItem(record.item.name, window.GAME_DATA?.recipes || [])).map(recordMeta).map(meta => meta.faction).filter(value => value !== '—'))].sort();
    const factionSelect = document.getElementById('patch-faction');
    if (factionSelect) factionSelect.innerHTML += factions.map(faction => `<option value="${escText(faction)}">${escText(faction)}</option>`).join('');
    root.querySelectorAll('#patch-search, #patch-category, #patch-faction, #patch-weight, #patch-numeric-only').forEach(control => control.addEventListener('input', renderExplorer));
    root.querySelectorAll('#patch-search, #patch-category, #patch-faction, #patch-weight').forEach(control => control.addEventListener('change', renderExplorer));
    root.querySelectorAll('[data-patch-tab]').forEach(button => button.addEventListener('click', () => { state.tab = button.dataset.patchTab; renderExplorer(); }));
    renderGoals();
    renderGoalDetail();
    renderBuild();
    renderExplorer(false);
    scheduleExplorerRender();
  }

  window.PATCH_CHANGES = { PATCH_GROUPS, GOALS, applyPatch, changedRecords, recordMeta, comparisonText, dataIndex, initPatchChanges, protectionMapping: PROTECTION_MAPPING, allGearRecords, groupByExactStats, renderGearIcon, buildCandidates: (slot, items, recipes) => buildCandidatesFromData(slot, items || allGearRecords(), recipes || window.GAME_DATA?.recipes || []) };
  window.initPatchChanges = initPatchChanges;
})(window, document);
