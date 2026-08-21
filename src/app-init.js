/**
 * src/app-init.js — Application initialisation
 * ============================================================================
 * DOMContentLoaded event wiring for the remaining calculator tabs. Loaded LAST — every view file
 * and app-core.js must be loaded before this so all function references resolve.
 */
'use strict';

const DIRECT_HASH_ROUTES = new Set(['calc', 'inventory', 'gear', 'colonies', 'battle', 'models', 'drugs', 'community']);

function parsePublicHashRoute() {
  const raw = String(location.hash || '').slice(1).split('?')[0].trim().toLowerCase();
  if (DIRECT_HASH_ROUTES.has(raw)) return raw;
  return null;
}

function applyPublicHashRoute() {
  const hash = String(location.hash || '').slice(1);
  const route = parsePublicHashRoute();
  if (route) { setView(route); return true; }
  if (!hash || hash.includes('=') || hash.length > 12) return false;
  setView('calc');
  return true;
}

document.addEventListener('DOMContentLoaded', () => {
  renderItemOptions();
  const edl = document.getElementById('inv-item-list');
  if (edl) ALL_ITEMS.forEach(name => { const o = document.createElement('option'); o.value = name; edl.appendChild(o); });
  initPickerFilters();
  refreshAll();
  renderPicker();
  wireModelsEvents();
  wireCharacterStudioEvents();

  // Tabs
  // Register on each button individually AND as a delegated handler on nav
  document.querySelectorAll('.tab').forEach(t => {
    t.setAttribute('role', 'tab');
    t.addEventListener('click', () => {
      setView(t.dataset.view);
      document.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-selected', 'false'));
      t.setAttribute('aria-selected', 'true');
      syncMoreButton();
    });
  });
  // Delegated fallback — catches clicks on tab button children
  document.querySelector('nav').addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    setView(tab.dataset.view);
    document.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-selected', 'false'));
    tab.setAttribute('aria-selected', 'true');
    syncMoreButton();
  });
  document.querySelector('.tab.active')?.setAttribute('aria-selected', 'true');

  // WAI-ARIA tabs pattern for the default legacy tablist: ArrowLeft/Right and
  // Home/End move roving focus between the visible tabs (activation stays on
  // Enter/Space/click — arrows never navigate, matching the v2 handler).
  const legacyNav = document.getElementById('legacy-nav');
  if (legacyNav) {
    legacyNav.addEventListener('keydown', e => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
      const tabs = [...legacyNav.querySelectorAll('[role="tab"]')].filter(t => !t.closest('[hidden]'));
      const current = tabs.indexOf(document.activeElement);
      if (current < 0) return;
      e.preventDefault();
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 :
        (current + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus();
    });
  }

  // Grouped navigation v2 is opt-in; it delegates to the same setView lifecycle
  // as the legacy tabs so hooks and deep links remain consistent.
  const navV2 = document.getElementById('nav-v2');
  const navV2Drawer = document.getElementById('nav-v2-drawer');
  const navV2DrawerToggle = navV2?.querySelector('[data-nav-toggle="drawer"]');
  function syncNavV2(view) {
    if (!navV2) return;
    navV2.querySelectorAll('[data-nav-view]').forEach(button => {
      const active = button.dataset.navView === view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
      button.tabIndex = active ? 0 : -1;
    });
  }
  function closeNavV2Drawer(restoreFocus = false) {
    if (!navV2Drawer) return;
    navV2Drawer.hidden = true;
    navV2DrawerToggle?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) navV2DrawerToggle?.focus();
  }
  window.syncCMGNavV2 = syncNavV2;
  if (navV2) {
    navV2.querySelectorAll('[data-nav-view]').forEach(button => {
      button.setAttribute('aria-current', 'false');
      button.tabIndex = -1;
    });
    navV2.addEventListener('click', e => {
      const toggle = e.target.closest('[data-nav-toggle]');
      if (toggle) {
        if (toggle.dataset.navToggle === 'drawer') {
          navV2Drawer.hidden = false;
          toggle.setAttribute('aria-expanded', 'true');
          navV2Drawer.querySelector('[data-nav-toggle="close"]')?.focus();
        } else closeNavV2Drawer(true);
        return;
      }
      const button = e.target.closest('[data-nav-view]');
      if (!button) return;
      document.querySelector('.settings-menu')?.removeAttribute('open');
      setView(button.dataset.navView);
      closeNavV2Drawer();
    });
    navV2.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeNavV2Drawer(true); return; }
      if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
      const buttons = [...navV2.querySelectorAll('[data-nav-view]')].filter(b => !b.closest('[hidden]'));
      const current = buttons.indexOf(document.activeElement);
      if (current < 0) return;
      e.preventDefault();
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 :
        (current + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
    });
    syncNavV2(document.querySelector('.view.active')?.id.replace('view-', '') || 'calc');
  }

  // "More ▾" overflow dropdown holding the Reference sections.
  const moreWrap = document.querySelector('.nav-more');
  const moreBtn  = document.querySelector('.nav-more-btn');
  const moreMenu = document.getElementById('nav-more-menu');
  function syncMoreButton() {
    if (!moreBtn || !moreMenu) return;
    // Reflect whichever Reference section is active on the button itself, so
    // the user still sees "you are here" when the active tab is tucked away.
    const activeRef = moreMenu.querySelector('.tab.active');
    moreBtn.classList.toggle('active', !!activeRef);
    const lbl = moreBtn.querySelector('.more-label');
    if (lbl) lbl.textContent = activeRef ? activeRef.textContent.trim() : 'More';
  }
  if (moreBtn && moreMenu) {
    const closeMore = () => { moreMenu.hidden = true; moreBtn.setAttribute('aria-expanded', 'false'); };
    const openMore  = () => { moreMenu.hidden = false; moreBtn.setAttribute('aria-expanded', 'true'); };
    moreBtn.addEventListener('click', e => {
      document.querySelector('.settings-menu')?.removeAttribute('open');
      e.stopPropagation();
      moreMenu.hidden ? openMore() : closeMore();
    });
    moreMenu.addEventListener('click', e => { if (e.target.closest('.tab')) { closeMore(); document.querySelector('.settings-menu')?.removeAttribute('open'); } });
    document.addEventListener('click', e => { if (!moreWrap.contains(e.target)) closeMore(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMore(); });
    syncMoreButton();
  }

  // Auto-overflow: keep the Main tabs on ONE row. Whichever don't fit get moved
  // into the "More" menu (ahead of the Reference sections) rather than making
  // the bar scroll sideways. Re-runs on resize and after web fonts settle.
  const navBar  = document.querySelector('.nav-bar');
  const mainNav = navBar && navBar.querySelector(':scope > nav');
  if (navBar && mainNav && moreMenu) {
    const mainTabs = Array.from(mainNav.children); // the 9 Main tabs, in order
    function fitTabs() {
      mainTabs.forEach(t => mainNav.appendChild(t)); // restore all to the strip
      let guard = 0;
      while (mainNav.scrollWidth > mainNav.clientWidth + 1 &&
             mainNav.children.length > 1 && guard++ < 40) {
        // move the last still-fitting Main tab to the front of the menu
        moreMenu.insertBefore(mainNav.lastElementChild, moreMenu.firstElementChild);
      }
      syncMoreButton();
    }
    fitTabs();
    let raf;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fitTabs);
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTabs);
  }

  // Calculator
  document.getElementById('calc-run').addEventListener('click', runCalculator);
  document.getElementById('calc-qty').addEventListener('keydown', e => { if (e.key === 'Enter') runCalculator(); });
  document.getElementById('calc-qty').addEventListener('input', clearQuantityValidation);
  document.getElementById('calc-dest').addEventListener('change', () => { getDestination(); if (CALC_TRAY.length) runMultiPlan(); });
  document.getElementById('calc-refine-dest').addEventListener('change', () => { getRefineDestination(true); if (CALC_TRAY.length) runMultiPlan(); });
  // Re-plan immediately when "Plan from scratch" is toggled, if a plan is up.
  document.getElementById('calc-scratch')?.addEventListener('change', () => {
    const item = document.getElementById('calc-item').value.trim();
    if (item && ALL_ITEMS.has(item)) runCalculator();
  });
  document.getElementById('calc-add').addEventListener('click', () => addToTray());
  document.getElementById('calc-save')?.addEventListener('click', saveCurrentPlan);
  document.getElementById('calc-runmulti').addEventListener('click', runMultiPlan);
  // Refinement-path pickers live in the controls (above results).
  // calc-item is now readonly — paths refresh at end of runCalculator().
  // Delegated on #calc-result (calc-paths is recreated on every renderPlan).
  document.getElementById('calc-result').addEventListener('change', e => {
    if (!e.target.closest('#calc-paths')) return;
    const sel = e.target.closest('select[data-alt]');
    if (!sel) return;
    ALTERNATIVE_CHOICES[decodeURIComponent(sel.dataset.alt)] = parseInt(sel.value, 10);
    savePaths();
    // Re-plan in place: changing a path should keep the player at the selector
    // instead of jumping back to the top of the workbench.
    if (CALC_TRAY.length) runMultiPlan({ preserveChecklist: true, preserveViewport: true });
    else if (document.querySelector('#calc-result .plan-summary')) runCalculator({ preserveChecklist: true, preserveViewport: true });
  });
  renderCalcPaths();
  // Colonies tab: tax/owner edits, plus its filters.
  document.getElementById('col-grid')?.addEventListener('change', e => {
    const el = e.target.closest('[data-ct-tax], [data-ct-own], [data-colony-owner], [data-colony-clear]');
    if (el) onColonyTaxChange(el);
  });
  document.getElementById('col-search')?.addEventListener('input', () => renderColonies());
  document.getElementById('col-priced-only')?.addEventListener('change', () => renderColonies());
  document.getElementById('col-filter')?.addEventListener('change', () => renderColonies());
  document.getElementById('colony-world-export')?.addEventListener('click', () => {
    downloadJSON(exportColonyWorld(), 'empire-rising-colony-world.json');
    const status = document.getElementById('colony-world-status');
    if (status) status.textContent = 'Exported the local colony world snapshot.';
  });
  document.getElementById('colony-world-reset')?.addEventListener('click', () => {
    if (!window.confirm('Reset local colony ownership and tax settings to the default world?')) return;
    resetColonyWorld();
    const status = document.getElementById('colony-world-status');
    if (status) status.textContent = 'Reset local ownership and tax settings to the default world.';
  });
  document.getElementById('colony-world-import')?.addEventListener('click', () => document.getElementById('colony-world-import-file')?.click());
  document.getElementById('colony-world-import-file')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importColonyWorld(JSON.parse(reader.result));
        const status = document.getElementById('colony-world-status');
        if (status) status.textContent = 'Imported the local colony world snapshot.';
      } catch (err) {
        const status = document.getElementById('colony-world-status');
        if (status) status.textContent = `Import rejected: ${err.message}`;
      } finally { e.target.value = ''; }
    };
    reader.readAsText(file);
  });
  registerViewHook({ view: 'colonies', fn: renderColonies });
  renderColonies();
  // Energy/cooling: 'input' keeps the readout live while dragging, 'change'
  // does the replan once the slider is let go rather than on every pixel.
  ['slot-energy', 'slot-cooling'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const out = document.getElementById(id + '-out');
      if (out) out.textContent = (id === 'slot-energy' ? clampEnergy(el.value) : clampCooling(el.value));
    });
    el.addEventListener('change', () => onSlotLevelChange(el));
  });
  renderSlotLevels();
  document.getElementById('calc-cleartray').addEventListener('click', () => {
    CALC_TRAY = []; saveTray(); renderTray();
    document.getElementById('calc-multi').innerHTML = '';
    updateShareLink();
  });
  document.getElementById('tray-items').addEventListener('input', e => {
    const q = e.target.closest('input[data-tray-q]'); if (!q) return;
    const i = +q.dataset.trayQ; CALC_TRAY[i].qty = Math.max(1, parseInt(q.value, 10) || 1); saveTray();
  });
  document.getElementById('tray-items').addEventListener('click', e => {
    const x = e.target.closest('button[data-tray-x]'); if (!x) return;
    CALC_TRAY.splice(+x.dataset.trayX, 1); saveTray(); renderTray();
  });
  initTheme();
  renderTray();
  renderSavedPlans();
  const themeSelect = document.getElementById('theme-select');
  if (themeSelect) themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));
  const soundMode = document.getElementById('sound-mode');
  if (soundMode) soundMode.addEventListener('change', () => setSoundMode(soundMode.value));
  // theme switcher buttons
  document.querySelectorAll('.theme-btn').forEach(b => {
    b.setAttribute('aria-pressed', b.classList.contains('active') ? 'true' : 'false');
    b.addEventListener('click', () => {
      applyTheme(b.dataset.theme);
      document.querySelectorAll('.theme-btn').forEach(x => x.setAttribute('aria-pressed', x.classList.contains('active') ? 'true' : 'false'));
    });
  });
  // mute button — reflect the saved state, since it persists across sessions
  renderMuteButton();
  // font-size slider
  const sizeSlider = document.getElementById('size-range');
  if (sizeSlider) {
    sizeSlider.addEventListener('input', () => applyFontScale(sizeSlider.value));
  }
  document.getElementById('size-decrease')?.addEventListener('click', () => adjustFontScale(-1));
  document.getElementById('size-increase')?.addEventListener('click', () => adjustFontScale(1));
  // Keep the resolution-aware 100% baseline correct when the browser window
  // moves between display sizes or the user changes its effective viewport.
  window.addEventListener('resize', () => {
    const slider = document.getElementById('size-range');
    applyFontScale(slider?.value || 100);
  });

  // collapsible section titles (delegated)
  document.getElementById('calc-result').addEventListener('click', e => {
    const colonyHead = e.target.closest('.colony-work-toggle');
    if (colonyHead) { toggleColonyWorkGroup(colonyHead); return; }
    const moveBatch = e.target.closest('.move-all-cargo-btn');
    if (moveBatch) { markMoveBatchComplete(moveBatch); return; }
    const cb = e.target.closest('.transfer-cb');
    if (cb) { toggleTransferCheck(cb); return; }
    const ob = e.target.closest('.obtain-cb');
    if (ob) { toggleObtainCheck(ob); return; }
    const pick = e.target.closest('.mine-pick');
    if (pick) { pickObtainSite(pick); return; }
    const src = e.target.closest('.src-pick');
    if (src) { pickTransportSource(src); return; }
    const mineReset = e.target.closest('.mine-progress-reset');
    if (mineReset) { resetMiningProgress(mineReset); return; }
    const mine = e.target.closest('.mine-log');
    if (mine) { logMined(decodeURIComponent(mine.dataset.mine), mine.dataset.qty, mine.dataset.mineTotal); return; }
    const title = e.target.closest('.section-title');
    if (title) { toggleSection(title); return; }
  });
  document.getElementById('calc-multi').addEventListener('click', e => {
    const colonyHead = e.target.closest('.colony-work-toggle');
    if (colonyHead) { toggleColonyWorkGroup(colonyHead); return; }
    const moveBatch = e.target.closest('.move-all-cargo-btn');
    if (moveBatch) { markMoveBatchComplete(moveBatch); return; }
    const cb = e.target.closest('.transfer-cb');
    if (cb) { toggleTransferCheck(cb); return; }
    const ob = e.target.closest('.obtain-cb');
    if (ob) { toggleObtainCheck(ob); return; }
    const pick = e.target.closest('.mine-pick');
    if (pick) { pickObtainSite(pick); return; }
    const src = e.target.closest('.src-pick');
    if (src) { pickTransportSource(src); return; }
    const mineReset = e.target.closest('.mine-progress-reset');
    if (mineReset) { resetMiningProgress(mineReset); return; }
    const mine = e.target.closest('.mine-log');
    if (mine) { logMined(decodeURIComponent(mine.dataset.mine), mine.dataset.qty, mine.dataset.mineTotal); return; }
    const title = e.target.closest('.section-title');
    if (title) { toggleSection(title); return; }
  });
  // Custom mined amount — Enter logs it, so a full row never needs the mouse.
  ['calc-result', 'calc-multi'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      const q = e.target.closest('.mine-qty');
      if (!q || e.key !== 'Enter') return;
      e.preventDefault();
      logMined(decodeURIComponent(q.dataset.mineQty), q.value, q.dataset.mineTotal);
    });
  });
  // Keyboard support for the collapsible section headers (role=button).
  ['calc-result', 'calc-multi'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const colonyHead = e.target.closest('.colony-work-toggle');
      if (colonyHead) { e.preventDefault(); toggleColonyWorkGroup(colonyHead); return; }
      const title = e.target.closest('.section-title');
      if (title) { e.preventDefault(); toggleSection(title); }
    });
  });

  // Picker
  document.getElementById('picker-cat').addEventListener('change', renderPicker);
  document.getElementById('picker-grid').addEventListener('click', e => {
    const card = e.target.closest('.pick-card');
    if (!card) return;
    e.stopPropagation();
    const item = decodeURIComponent(card.dataset.item);
    document.getElementById('calc-item').value = item;
    toast('Item selected. Set quantity and production colony, then press Calculate.', 2600, 'success');
  });
  // Quick-stats tooltip on hover (shared across picker + gear slots)
  document.getElementById('picker-grid').addEventListener('mouseover', e => {
    const card = e.target.closest('.pick-card');
    if (!card) return;
    if (tooltipEl) tooltipEl.remove();
    const item = decodeURIComponent(card.dataset.item);
    const recipe = DATA.recipes.find(r => r.output.item === item);
    if (!recipe?.output?.stats) return;
    const stats = recipe.output.stats;
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'item-tooltip';
    tooltipEl.innerHTML = `<div class="tt-name">${esc(item)}</div>` +
      Object.entries(stats).slice(0, 6).map(([k,v]) =>
        `<div class="tt-stat"><span class="tt-label">${STAT_LABELS[k]||k}</span><span class="tt-val">${v>0?'+':''}${v}</span></div>`
      ).join('') + tooltipMaterialsHtml(item);
    document.body.appendChild(tooltipEl);
    const rect = card.getBoundingClientRect();
    tooltipEl.style.left = Math.min(rect.right + 6, window.innerWidth - tooltipEl.offsetWidth - 8) + 'px';
    tooltipEl.style.top = Math.min(rect.top, window.innerHeight - tooltipEl.offsetHeight - 8) + 'px';
  });
  document.getElementById('picker-grid').addEventListener('mouseleave', () => {
    if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
  }, true);
  // Enter on picker search runs first match
  document.getElementById('picker-search').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const first = document.querySelector('.pick-card');
      if (first) { first.click(); e.preventDefault(); }
    }
  });

  // Search inputs
  ['picker-search', 'inv-search'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      if (id === 'picker-search') renderPicker();
      if (id === 'inv-search') renderInventory();
    });
  });
  document.getElementById('inv-materials-only')?.addEventListener('change', renderInventory);
  // Screenshot import: button click and clipboard paste
  document.getElementById('inv-scan-shot')?.addEventListener('click', function() {
    var input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = function(e) { if (e.target.files[0]) handleScreenshotUpload(e.target.files[0]); };
    input.click();
  });
  document.addEventListener('paste', handleScreenshotPaste);

  document.getElementById('drug-sort').addEventListener('change', renderDrugs);
  document.getElementById('drug-search').addEventListener('input', renderDrugs);
  document.getElementById('bn-search').addEventListener('input', renderBattleNodes);
  initBalanceBrowser();

  // Keep utility popovers singular and dismiss them without trapping the player bar.
  const playerActions = document.querySelector('.player-actions');
  const settingsMenu = document.querySelector('.settings-menu');
  const closeSettings = () => settingsMenu?.removeAttribute('open');
  document.addEventListener('click', e => {
    if (playerActions?.open && !e.target.closest('.player-actions')) playerActions.open = false;
    if (settingsMenu?.open && !e.target.closest('.settings-menu')) closeSettings();
  });
  playerActions?.addEventListener('toggle', () => {
    if (playerActions.open) document.querySelector('.settings-menu')?.removeAttribute('open');
  });
  settingsMenu?.addEventListener('toggle', e => {
    if (e.currentTarget.open && playerActions) playerActions.open = false;
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSettings();
  });

  // apply-plan buttons (event delegation on calc result areas)
  document.getElementById('calc-result').addEventListener('click', e => {
    const btn = e.target.closest('.apply-plan');
    if (!btn || btn.disabled || !btn.dataset.apply) return;
    const item = decodeURIComponent(btn.dataset.apply);
    const qty = parseInt(btn.dataset.qty, 10);
    snapshotInv();
    const result = compute(item, qty, ALTERNATIVE_CHOICES, null, null, DESTINATION, getDiscounts(), REFINE_DESTINATION);
    const log = applyPlan(result);

    // Inventory is updated before the calculator returns to a clean new-plan state.
    resetCalculatorForNewPlan();
    toast(`Plan applied. ${log.length} step(s) executed. Ctrl+Z to undo.`, 3000, 'success');
  });

  // Copy shopping list (single + multi)
  function copyShoppingList() {
    const result = CALC_TRAY.length
      ? compute(CALC_TRAY, ALTERNATIVE_CHOICES, Object.assign({}, INV_TOTAL), null, DESTINATION, getDiscounts(), REFINE_DESTINATION).plan
      : (() => { const item = document.getElementById('calc-item').value.trim();
          const qty = Math.max(1, parseInt(document.getElementById('calc-qty').value,10)||1);
          return compute(item, qty, ALTERNATIVE_CHOICES, null, null, DESTINATION, getDiscounts(), REFINE_DESTINATION).plan; })();
    const lines = [];
    Object.entries(result.transport).forEach(([n,info]) => {
      lines.push(`Move ${fmt(info.qty)} ${displayName(n)} → ${info.to || REFINE_DESTINATION || DESTINATION}`);
    });
    Object.entries(result.acquire).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([n,info]) => {
      const sites = (info.from||[]).join(', ');
      lines.push(`${fmt(info.qty)}× ${displayName(n)}${sites ? ' — ' + sites : ''}`);
    });
    result.steps.forEach(s => {
      lines.push(`Craft ${fmt(s.produced)} ${displayName(s.item)} at ${s.location || DESTINATION} (${s.batches} batch${s.batches>1?'es':''})`);
    });
    navigator.clipboard.writeText(lines.join('\n')).then(() => toast('Shopping list copied!', 3000, 'success'));
  }
  function sharePlanLink() {
    updateShareLink();
    navigator.clipboard.writeText(location.href)
      .then(() => toast('Share link copied — send it to another player.', 3000, 'success'))
      .catch(() => toast('Could not copy — copy the URL from the address bar.', 4000, 'error'));
  }
  ['calc-result', 'calc-multi'].forEach(id => {
    document.getElementById(id).addEventListener('click', e => {
      if (e.target.closest('.copy-list')) copyShoppingList();
      else if (e.target.closest('.share-plan')) sharePlanLink();
    });
  });

  // Recent-calculation chips
  renderRecent();
  document.getElementById('calc-recent')?.addEventListener('click', e => {
    const chip = e.target.closest('.recent-chip');
    if (!chip) return;
    document.getElementById('calc-item').value = decodeURIComponent(chip.dataset.recent);
    document.getElementById('calc-qty').value = Math.max(1, +chip.dataset.qty || 1);
    runCalculator();
  });

  // Apply plan (multi)
  document.getElementById('calc-multi').addEventListener('click', e => {
    const btn = e.target.closest('#apply-multi');
    if (!btn) return;
    btn.textContent = 'Applying…';
    btn.disabled = true;
    snapshotInv();
    // Shared ledger across all tray items
    const ledger = Object.assign({}, INV_TOTAL);
    const invLoc = {};
    for (const k in INV_LOCATIONS) invLoc[k] = INV_LOCATIONS[k].map(l => ({ ...l }));
    const discounts = getDiscounts();
  const result = compute(CALC_TRAY, ALTERNATIVE_CHOICES, ledger, invLoc, DESTINATION, discounts, REFINE_DESTINATION);
    applyPlan(result);

    // Inventory is updated before the combined calculator is cleared for a new tray.
    resetCalculatorForNewPlan();
    toast(`Combined plan applied. Ctrl+Z to undo.`, 3000, 'success');
  });

  // What-if colony comparison: "Plan here" switches the production colony and
  // re-runs the whole plan — same stock and paths, new destination. The
  // comparison table recomputed every candidate with the engine, so switching
  // here must land on exactly the numbers the row showed.
  ['calc-result', 'calc-multi'].forEach(id => {
    document.getElementById(id).addEventListener('click', e => {
      const btn = e.target.closest('[data-whatif-plan]');
      if (!btn) return;
      const colony = decodeURIComponent(btn.dataset.whatifPlan);
      const destSel = document.getElementById('calc-dest');
      if (destSel) destSel.value = colony;
      DESTINATION = colony;
      saveDestination();
      updateColonyTaxNote();
      if (CALC_TRAY.length) runMultiPlan();
      else if (document.querySelector('#calc-result .plan-summary')) runCalculator();
      else toast('Production colony set to ' + colony + '.');
    });
  });


  // Player bar
  document.getElementById('player-select').addEventListener('change', e => {
    PLAYERS.active = e.target.value; savePlayers(PLAYERS); recomputeInv(); refreshAll();

  });
  document.getElementById('player-faction')?.addEventListener('change', e => {
    if (!PLAYERS.active || !S.setPlayerFaction) return;
    S.setPlayerFaction(PLAYERS.active, e.target.value);
    refreshAll();

    toast(`Economic context set to ${e.target.options[e.target.selectedIndex]?.textContent || e.target.value}. Recipes remain available.`);
  });
  document.getElementById('player-new').addEventListener('click', () => {
    // Inline name input instead of browser prompt()
    const existing = document.querySelector('.player-new-input');
    if (existing) existing.remove();
    const bar = document.querySelector('.playerbar');
    const row = document.createElement('span');
    row.className = 'player-new-input';
    row.style.cssText = 'display:inline-flex;gap:4px;align-items:center;margin-left:8px';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.placeholder = 'player name…';
    inp.style.cssText = 'background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:4px;padding:4px 8px;font-size:12px;width:140px';
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const n = inp.value.trim();
        if (!n) { row.remove(); return; }
        if (PLAYERS.players[n]) { toast('That player already exists.'); row.remove(); return; }
        PLAYERS.players[n] = [];
        PLAYERS.profiles = PLAYERS.profiles || {};
        PLAYERS.profiles[n] = { faction: faction.value || 'UNAFFILIATED' };
        PLAYERS.active = n; savePlayers(PLAYERS); recomputeInv(); refreshAll();
        row.remove();
      }
      if (e.key === 'Escape') row.remove();
    });
    const faction = document.createElement('select');
    faction.setAttribute('aria-label', 'New player faction');
    faction.innerHTML = (window.ER_FACTIONS?.selectable || []).map(f =>
      `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('');
    const btn = document.createElement('button');
    btn.textContent = 'Create';
    btn.style.cssText = 'background:linear-gradient(135deg,var(--accent),var(--purple));color:#fff;border:none;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer';
    btn.addEventListener('click', () => { inp.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter'})); });
    row.append(inp, faction, btn);
    bar.appendChild(row);
    inp.focus();
  });
  const onboardingFaction = document.getElementById('onboarding-faction');
  if (onboardingFaction) onboardingFaction.innerHTML = (window.ER_FACTIONS?.selectable || []).map(f =>
    `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('');
  document.getElementById('onboarding-create')?.addEventListener('click', () => {
    const input = document.getElementById('onboarding-name');
    const name = input.value.trim();
    if (!name) { input.focus(); toast('Enter your player name to start.'); return; }
    if (PLAYERS.players[name]) { toast('That player already exists.'); return; }
    PLAYERS.players[name] = [];
    PLAYERS.profiles = PLAYERS.profiles || {};
    PLAYERS.profiles[name] = { faction: onboardingFaction?.value || 'UNAFFILIATED' };
    PLAYERS.active = name; savePlayers(PLAYERS); recomputeInv(); refreshAll();
    document.getElementById('picker-search')?.focus();
    toast(`Welcome, ${name}. Choose an item to plan your first run.`, 4000, 'success');
  });
  document.getElementById('onboarding-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('onboarding-create')?.click();
  });
  document.getElementById('onboarding-import')?.addEventListener('click', () =>
    document.getElementById('workspace-import')?.click());
  // Guided first-calculation (P4): dismiss and sample-plan wiring.
  document.getElementById('calc-guide-dismiss')?.addEventListener('click', () => dismissCalcGuide());
  document.getElementById('calc-guide-sample')?.addEventListener('click', loadSamplePlan);
  // Remove player — two-click confirm; deletes locally only.
  let playerRemoveArmed = null;
  document.getElementById('player-remove')?.addEventListener('click', () => {
    const btn = document.getElementById('player-remove');
    const name = document.getElementById('player-select').value || PLAYERS.active;
    if (!name) { toast('No player selected.'); return; }
    if (playerRemoveArmed !== name) {
      playerRemoveArmed = name;
      btn.textContent = 'Confirm ×';
      toast(`Click again to remove "${name}" from this device.`, 4000);
      setTimeout(() => { playerRemoveArmed = null; btn.textContent = '− Remove'; }, 4000);
      return;
    }
    playerRemoveArmed = null;
    btn.textContent = '− Remove';
    delete PLAYERS.players[name];
    delete SHARED_INV[name];
    if (PLAYERS.active === name) PLAYERS.active = Object.keys(PLAYERS.players)[0] || '';
    savePlayersLocal(PLAYERS);
    recomputeInv(); refreshAll();
    toast(`Removed player "${name}".`, 3000, 'success');
  });
  document.getElementById('player-import').addEventListener('click', () =>
    document.getElementById('player-import-file').click());
  document.getElementById('player-import-file').addEventListener('change', e => {
    if (e.target.files[0]) handleImportFile(e.target.files[0]);
    e.target.value = '';
  });
  const workspaceFile = document.createElement('input');
  workspaceFile.type = 'file'; workspaceFile.accept = 'application/json,.json'; workspaceFile.hidden = true;
  workspaceFile.id = 'workspace-import-file'; document.body.appendChild(workspaceFile);
  document.getElementById('workspace-export')?.addEventListener('click', () => {
    downloadJSON(S.exportWorkspace(), workspaceExportFilename());
    toast('Exported the complete local workspace.', 3000, 'success');
  });
  document.getElementById('workspace-import')?.addEventListener('click', () => workspaceFile.click());
  workspaceFile.addEventListener('change', e => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        S.importWorkspace(JSON.parse(reader.result));
        dismissCalcGuide({ focus: false });
        refreshAll();
        toast('Imported the complete local workspace.', 3000, 'success');
      }
      catch (err) { toast(err.message, 5000, 'error'); }
      finally { e.target.value = ''; }
    };
    reader.readAsText(file);
  });
  document.getElementById('player-export').addEventListener('click', () => {
    downloadJSON(exportPlayer(), 'cmg-' + PLAYERS.active.replace(/\s+/g, '_') + '.json');
  });

  // Inventory editor
  populateZones(); renderQuickPicker();
  // Lazy-load inventory charts on expand
  document.getElementById('inv-charts-details').addEventListener('toggle', function() {
    if (this.open) renderInvCharts();
  });
  // Item detail panel: close on backdrop click, × button, or Escape
  document.getElementById('inv-detail-overlay').addEventListener('click', function(e) {
    if (e.target === this || e.target.closest('#idp-close')) { closeInvDetail(); return; }
    var plan = e.target.closest('[data-idp-plan]');
    if (plan) {
      var item = decodeURIComponent(plan.dataset.idpPlan);
      closeInvDetail();
      document.getElementById('calc-item').value = item;
      setView('calc');
      runCalculator();
    }
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && document.getElementById('inv-detail-overlay').classList.contains('open')) closeInvDetail();
  });
  // Open the detail panel from item names in the zone editor / totals table.
  ['zone-body', 'inv-table'].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', function(e) {
      var link = e.target.closest('[data-idp]');
      if (!link) return;
      // Dragging out a text selection ends in a click. A plain click leaves the
      // selection collapsed, so a non-collapsed one means the user was
      // selecting (e.g. overshooting a quantity) — don't hijack that with the
      // item card.
      var sel = window.getSelection && window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) return;
      showInvItemDetail(decodeURIComponent(link.dataset.idp));
    });
    el.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var link = e.target.closest('[data-idp]');
      if (link) { e.preventDefault(); showInvItemDetail(decodeURIComponent(link.dataset.idp)); }
    });
  });
  // Quick-picker: category tab clicks
  document.getElementById('qp-cats').addEventListener('click', e => {
    var btn = e.target.closest('[data-qp-cat]'); if (!btn) return;
    preserveInventoryViewport(() => {
      QP_CATEGORY = btn.dataset.qpCat;
      renderQuickPicker();
    });
  });
  // Quick-picker: item button clicks → select an item and jump to quantity
  document.getElementById('qp-grid').addEventListener('click', e => {
    var btn = e.target.closest('[data-qp-item]'); if (!btn) return;
    var viewport = inventoryViewportSnapshot();
    document.getElementById('inv-item').value = btn.dataset.qpItem;
    renderInventorySelection();
    // Do not rebuild the grid here: replacing it was the source of the page
    // jump and also discarded the user's internal grid scroll position.
    markQuickPickerSelection(btn.dataset.qpItem);
    const q = document.getElementById('inv-qty');
    q.focus({ preventScroll: true }); q.select(); // type the amount straight away
    restoreInventoryViewport(viewport);
    requestAnimationFrame(() => restoreInventoryViewport(viewport));
  });
  // Quick-picker: free-text search across all items
  document.getElementById('qp-search')?.addEventListener('input', () => preserveInventoryViewport(() => renderQuickPicker()));
  document.getElementById('qp-search')?.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    // Enter with exactly one match selects it and jumps to quantity.
    const only = document.querySelectorAll('#qp-grid [data-qp-item]');
    if (only.length === 1) {
      var viewport = inventoryViewportSnapshot();
      document.getElementById('inv-item').value = only[0].dataset.qpItem;
      renderInventorySelection();
      markQuickPickerSelection(only[0].dataset.qpItem);
      const q = document.getElementById('inv-qty'); q.focus({ preventScroll: true }); q.select();
      restoreInventoryViewport(viewport);
      requestAnimationFrame(() => restoreInventoryViewport(viewport));
    }
  });
  // Enter in the quantity box adds — the picker focuses this field, so without
  // it the fastest path still required reaching for the mouse.
  document.getElementById('inv-qty').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('inv-addzone').click(); }
  });
  // Per-row move: open/close the inline partial-move form
  document.getElementById('zone-body').addEventListener('click', e => {
    const open = e.target.closest('[data-zmove]');
    if (open) {
      const row = open.closest('.zone-row-item');
      const form = row.querySelector('.zr-move');
      // only one row's form open at a time
      document.querySelectorAll('#zone-body .zr-move').forEach(f => { if (f !== form) f.hidden = true; });
      form.hidden = !form.hidden;
      if (!form.hidden) { const qi = form.querySelector('.zr-move-qty'); qi.focus(); qi.select(); }
      return;
    }
    if (e.target.closest('.zr-move-cancel')) {
      e.target.closest('.zr-move').hidden = true; return;
    }
    // ¼ / ½ / All quantity presets
    const preset = e.target.closest('.zr-preset');
    if (preset) {
      const qi = preset.closest('.zr-move').querySelector('.zr-move-qty');
      const max = parseInt(qi.max, 10) || 1;
      qi.value = Math.max(1, Math.floor(max * parseFloat(preset.dataset.frac)));
      qi.focus(); qi.select();
      return;
    }
    const go = e.target.closest('[data-zmovego]');
    if (go) { doRowMove(go.closest('.zone-row-item')); return; }
  });
  document.getElementById('zone-body').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.closest('.zr-move-qty')) {
      e.preventDefault(); doRowMove(e.target.closest('.zone-row-item'));
    }
  });
  document.getElementById('inv-zone').addEventListener('change', e => {
    ACTIVE_ZONE = e.target.value;
    updateInventoryZoneLabels();
    // Selections belong to the zone they were made in — carrying them across
    // would arm the move bar with items the user can no longer see.
    ZONE_MOVE_SELECTED.clear(); updateMoveBar();
    renderZone();
    // The picker's "have" badges are per-zone, so it has to re-render too —
    // without this it kept showing the previously selected colony's stock.
    preserveInventoryViewport(() => renderQuickPicker());
  });
  document.getElementById('inv-addzone').addEventListener('click', () => {
    const viewport = inventoryViewportSnapshot();
    const zone = ACTIVE_ZONE;
    if (!zone) { toast('Pick a zone/colony first.'); return; }
    const typedItem = document.getElementById('inv-item').value.trim() || document.getElementById('qp-search').value.trim();
    const searchKey = normalizeSearchText(typedItem);
    const item = Array.from(ALL_ITEMS).find(name =>
      normalizeSearchText(name) === searchKey || normalizeSearchText(displayName(name)) === searchKey
    ) || typedItem;
    const qty = Math.max(0, parseInt(document.getElementById('inv-qty').value, 10) || 0);
    if (!item) { toast('Pick or type an item first.'); return; }
    if (!ALL_ITEMS.has(item)) { toast(`"${item}" isn't a known item — pick one from the list.`); return; }
    if (qty <= 0) { toast('Enter a quantity above 0.'); return; }
    // Was 'set', which silently REPLACED the stack: gathering 50 more of an
    // item you had 200 of left you with 50. "+ Add" now accumulates; editing a
    // row's number input remains the way to set an exact value.
    const before = getInv()
      .filter(e => e.item === item && e.location === zone)
      .reduce((s, e) => s + e.quantity, 0);
    applyEntry(item, zone, qty, 'add');
    document.getElementById('inv-item').value = '';
    document.getElementById('qp-search').value = '';
    document.getElementById('inv-qty').value = 1;
    ACTIVE_ZONE = zone;
    refreshInventoryUI();
    document.getElementById('inv-zone').value = zone;
    toast(`+${fmt(qty)} ${displayName(item)} at ${zone} (now ${fmt(before + qty)}).`, 2500, 'success');
    // Ready for the next item — stocking a zone is a repetitive task.
    const nextItem = document.getElementById('qp-search');
    nextItem?.focus({ preventScroll: true });
    nextItem?.select();
    restoreInventoryViewport(viewport);
    requestAnimationFrame(() => restoreInventoryViewport(viewport));
  });
  document.getElementById('inv-item').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('inv-addzone').click(); });
  document.getElementById('zone-body').addEventListener('input', e => {
    const q = e.target.closest('input[data-zq]'); if (!q) return;
    const item = decodeURIComponent(q.dataset.zq);
    const zone = ACTIVE_ZONE;
    const v = Math.max(0, parseInt(q.value, 10) || 0);
    applyEntry(item, zone, v, 'set');
    updateZoneTotal(); renderInventory();
  });
  document.getElementById('zone-body').addEventListener('click', e => {
    const x = e.target.closest('button[data-zx]'); if (!x) return;
    if (x) { e.preventDefault(); const item = decodeURIComponent(x.dataset.zx);
    deleteEntry(item, ACTIVE_ZONE);
    ZONE_MOVE_SELECTED.delete(item); updateMoveBar();
    refreshInventoryUI(); }
  });
  // Zone move: checkbox toggle
  document.getElementById('zone-body').addEventListener('change', e => {
    // Quantity committed (Enter, or clicking away) — now it's safe to re-render
    // and re-sort. The live `input` handler can't, since replacing the DOM
    // would destroy the field mid-edit.
    var qEdit = e.target.closest('input[data-zq]');
    if (qEdit) {
      var editedKey = qEdit.dataset.zq;
      renderZone();       // re-sorts by quantity, highest first
      renderQuickPicker(); // its badges are this zone's quantities
      // Put the caret back on the same item so consecutive edits stay quick,
      // even though the row has just moved to a new position in the list.
      var again = Array.prototype.filter.call(
        document.querySelectorAll('#zone-body input[data-zq]'),
        el => el.dataset.zq === editedKey
      )[0];
      if (again) { again.focus(); again.select(); }
      return;
    }
    var cb = e.target.closest('input[data-zm]'); if (!cb) return;
    // data-zm is URL-encoded; store the REAL item name so doZoneMove can match
    // entries (encoded "organic%20material" never equals "organic material").
    var zmItem = decodeURIComponent(cb.dataset.zm);
    if (cb.checked) ZONE_MOVE_SELECTED.add(zmItem);
    else ZONE_MOVE_SELECTED.delete(zmItem);
    updateMoveBar();
  });
  document.getElementById('zone-move-go').addEventListener('click', doZoneMove);
  document.getElementById('zone-move-clear').addEventListener('click', function() {
    ZONE_MOVE_SELECTED.clear(); updateMoveBar();
    document.querySelectorAll('input[data-zm]').forEach(function(cb) { cb.checked = false; });
  });

  // Delete from inventory table
  document.getElementById('inv-table').addEventListener('click', e => {
    const btn = e.target.closest('button.x');
    if (!btn) return;
    const item = decodeURIComponent(btn.dataset.item);
    const loc = decodeURIComponent(btn.dataset.loc);
    deleteEntry(item, loc); renderInventory();
    toast(`Removed ${esc(item)} at ${esc(loc)}.`);
  });

  // Player-facing production progress. This is a local checklist only: it does
  // not alter inventory or the calculated plan totals.
  ['calc-result', 'calc-multi'].forEach(id => {
    document.getElementById(id).addEventListener('click', e => {
      const run = e.target.closest('.progress-run');
      if (run && !run.disabled) { e.preventDefault(); e.stopPropagation(); recordProductionProgress(run); return; }
      const reset = e.target.closest('.progress-reset');
      if (reset) { e.preventDefault(); e.stopPropagation(); resetProductionProgress(reset); }
    });
  });

  // Keyboard shortcuts: Ctrl+Z undo (outside form fields), / to focus search
  const VIEW_SEARCH = { calc: 'picker-search', inventory: 'inv-search', colonies: 'col-search', drugs: 'drug-search', battle: 'bn-search' };
  document.addEventListener('keydown', e => {
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !typing) {
      if (undoInv()) { e.preventDefault(); toast('Undo — inventory restored.', 3000, 'success'); }
    }
    if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const active = document.querySelector('.view.active');
      const id = active && VIEW_SEARCH[active.id.replace('view-', '')];
      const input = id && document.getElementById(id);
      if (input) { e.preventDefault(); input.focus(); input.select(); }
    }
    if (e.key === 'Escape') {
      const overlay = document.getElementById('gear-picker-overlay');
      if (overlay && !overlay.hidden) closeGearPicker();
    }
  });

  // Load shared plan from URL hash, or activate a direct public tab route.
  loadPlanFromHash();
  applyPublicHashRoute();
  window.addEventListener('hashchange', () => {
    if (applyPublicHashRoute()) return;
    loadPlanFromHash();
  });

  // ---- Gear loadout ----
  refreshGear();
  // Slot clicks → picker (right-click to unequip)
  document.querySelectorAll('.gear-slot').forEach(slot => {
    slot.addEventListener('click', (e) => {
      // Don't open picker if clicking the toggle checkbox
      if (e.target.classList.contains('gear-toggle') || e.target.closest?.('.gear-toggle-control')) return;
      var st = slot.dataset.slotType || 'armor';
      showGearPicker(slot.dataset.slot, st === 'armor' ? slot.dataset.armorType : st);
    });
    // Keyboard users reach the same picker with Enter/Space on a focused slot.
    slot.addEventListener('keydown', e => {
      if (e.target !== slot) return; // the toggle checkbox handles its own keys
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        var st = slot.dataset.slotType || 'armor';
        showGearPicker(slot.dataset.slot, st === 'armor' ? slot.dataset.armorType : st);
      }
    });
    slot.addEventListener('contextmenu', e => {
      e.preventDefault();
      var s = slot.dataset.slot;
      var st = slot.dataset.slotType || 'armor';
      if (st === 'armor' && GEAR[s]) { delete GEAR[s]; saveGear(GEAR); }
      else if (st === 'booster') { BOOSTERS[parseInt(s.split('-')[1])] = ''; saveBoosters(); }
      else if (st === 'medikit') { MEDIKIT = null; saveMedikit(); }
      renderGear(); toast('Unequipped.');
    });
    // Tooltip on hover
    slot.addEventListener('mouseenter', () => {
      if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
      const item = GEAR[slot.dataset.slot];
      if (!item) return;
      const recipe = DATA.recipes.find(r => r.output.item === item);
      if (!recipe?.output?.stats) return;
      const stats = recipe.output.stats;
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'item-tooltip';
      tooltipEl.innerHTML = '<div class="tt-name">' + esc(item) + '</div>' +
        Object.entries(stats).slice(0, 8).map(function(e) {
          var k = e[0], v = e[1];
          return '<div class="tt-stat"><span class="tt-label">' + (STAT_LABELS[k]||k) + '</span><span class="tt-val">' + (v>0?'+':'') + v + '</span></div>';
        }).join('') + tooltipMaterialsHtml(item);
      document.body.appendChild(tooltipEl);
      var rect = slot.getBoundingClientRect();
      tooltipEl.style.left = Math.min(rect.right + 6, window.innerWidth - tooltipEl.offsetWidth - 8) + 'px';
      tooltipEl.style.top = Math.min(rect.top, window.innerHeight - tooltipEl.offsetHeight - 8) + 'px';
    });
    slot.addEventListener('mouseleave', () => {
      if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
    });
  });

  // Theme swatches
  document.querySelectorAll('.theme-btn').forEach(btn => {
    const swatch = document.createElement('span');
    swatch.className = 'theme-swatch ' + btn.dataset.theme;
    swatch.setAttribute('aria-hidden', 'true');
    btn.prepend(swatch);
  });

  // Picker close — every path restores focus to the triggering slot.
  document.getElementById('gear-picker-close').addEventListener('click', closeGearPicker);
  document.getElementById('gear-picker-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeGearPicker();
  });
  // Save/Load/Clear/Export/Import gear sets
  document.getElementById('gear-save-set').addEventListener('click', () => {
    if (!Object.keys(GEAR).length) { toast('Equip at least one armor piece first.'); return; }
    // Inline name input instead of browser prompt()
    const existing = document.querySelector('.gear-set-name-input');
    if (existing) existing.remove();
    const bar = document.querySelector('.gear-actions');
    const row = document.createElement('span');
    row.className = 'gear-set-name-input';
    row.style.cssText = 'display:inline-flex;gap:4px;align-items:center;width:100%';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.placeholder = 'set name…';
    inp.style.cssText = 'flex:1;background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:4px;padding:4px 8px;font-size:12px;min-width:0';
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const n = inp.value.trim();
        if (!n) { row.remove(); return; }
        const set = { id: localId(), name: n, gear: { ...GEAR }, owner: PLAYERS.active || 'anonymous', created_at: Date.now(), votes: {} };
        SHARED_GEAR.push(set);
        renderGearSets();
        syncShared('gear', [{ op: 'upsert', set }]);

        toast(`Saved gear preset "${n}" locally.`);
        row.remove();
      }
      if (e.key === 'Escape') row.remove();
    });
    const btn = document.createElement('button');
    btn.textContent = 'Save';
    btn.style.cssText = 'background:linear-gradient(135deg,var(--accent),var(--purple));color:#fff;border:none;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer';
    btn.addEventListener('click', () => { inp.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter'})); });
    row.append(inp, btn);
    bar.appendChild(row);
    inp.focus();
  });
  document.getElementById('gear-clear').addEventListener('click', () => {
    GEAR = {}; saveGear(GEAR); renderGear(); renderGearSets();
    toast('Gear loadout cleared.');
  });
  // Load Set → had NO handler at all (dead button). Sets are loaded from the
  // All-Faction Gear Library's per-set Load button, which sits in the
  // secondary gear row — so point the user at it.
  document.getElementById('gear-load-set').addEventListener('click', () => {
    const list = document.getElementById('gear-sets-list');
    if (!list) return;
    list.scrollIntoView({ behavior: 'smooth', block: 'center' });
    list.classList.add('flash-target');
    setTimeout(() => list.classList.remove('flash-target'), 1200);
    if (!SHARED_GEAR.length) toast('No saved sets yet — equip armor and Save Gear Set first.');
    else toast('Pick a set below and press Load.');
  });
  // Craft Set → add all equipped items to multi-calc tray
  document.getElementById('gear-craft-set').addEventListener('click', () => {
    const items = Object.values(GEAR);
    if (!items.length) { toast('Equip at least one armor piece first.'); return; }
    items.forEach(item => addToTray(item, 1));
    toast(`Added ${items.length} items to plan.`);
    setView('calc');
  });
  document.getElementById('gear-export-set').addEventListener('click', () => {
    downloadJSON({ type: 'er_gear_set', gear: GEAR, shared_sets: SHARED_GEAR }, 'er-gear.json');
    toast('Gear exported.');
  });
  document.getElementById('gear-import-set').addEventListener('click', () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
    inp.addEventListener('change', () => {
      if (!inp.files[0]) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const obj = JSON.parse(reader.result);
          if ((obj.type === 'er_gear_set' || obj.type === 'cmg_gear_set') && obj.gear) {
            GEAR = obj.gear;
            saveGear(GEAR); renderGear();
            // Add imported presets to the local library.
            const owner = PLAYERS.active || 'anonymous';
            const ops = [];
            const importedSets = Array.isArray(obj.shared_sets) ? obj.shared_sets
              : obj.sets ? Object.entries(obj.sets).map(([name, gear]) => ({ name, gear })) : [];
            importedSets.forEach(s => {
              if (!s || !s.gear || !s.name) return;
              if (SHARED_GEAR.some(x => x.name === s.name)) return;
              const set = { id: s.id || localId(), name: s.name, gear: s.gear, owner: s.owner || owner, created_at: s.created_at || Date.now(), votes: s.votes || {} };
              SHARED_GEAR.push(set);
              ops.push({ op: 'upsert', set });
            });
            renderGearSets();
            if (ops.length) syncShared('gear', ops);
            toast(ops.length ? `Gear imported — ${ops.length} local preset(s) added.` : 'Gear imported.');
          } else { toast('Invalid gear file.'); }
        } catch(e) { toast('Failed to parse gear file.'); }
      };
      reader.readAsText(inp.files[0]);
    });
    inp.click();
  });

  // Inventory tab: refresh on enter
  // Inventory tab: refresh on enter (handles player switches)
  registerViewHook({ view: 'inventory', enter: refreshInventoryUI });
  // Models tab: load manifest + init viewer on first visit
  let modelsInit = false;
  registerViewHook({
    view: 'models', once: true,
    fn: function() { if (!modelsInit) { modelsInit = true; initModelsView(); } }
  });
 // ═══════════════════════════════════════════════════════════════════════════
  // moved to src/app-core.js (global audio + terminal audio)
  // ═══════════════════════════════════════════════════════════════════════════
  // moved to src/views/reference.js (part 2)
});
