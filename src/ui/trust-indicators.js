/**
 * src/ui/trust-indicators.js — data freshness, offline, and update indicators
 * ============================================================================
 * Player-trust surface for a local-first snapshot app:
 *
 *   1. DATA FRESHNESS — a compact chip in the footer naming the reference-data
 *      snapshot date. The date is read ONLY from metadata the bundled data
 *      files actually declare (game_data.meta.last_updated,
 *      balance_stats._meta.fetched, costs._generated, armor_classes._source);
 *      if nothing is declared the chip says "snapshot" with no date. We never
 *      invent a date and never claim live sync.
 *
 *   2. OFFLINE STATE — when the browser reports offline, a status chip says
 *      the app is showing the saved (cached) copy. It disappears on 'online'.
 *
 *   3. UPDATE STATE — the service worker registration lives here. When a new
 *      worker installs while an older one still controls the page, a status
 *      chip offers Reload so the player can pull the newest deploy
 *      (the fetch handler is network-first, so a reload applies it).
 *
 * Loaded LAST (after app-init.js). Runs standalone: every DOM lookup is
 * guarded, so it is safe in the Node test harness as well.
 */
'use strict';
(function (root) {
  const w = typeof window !== 'undefined' ? window : root;

  // ---- Data snapshot metadata -------------------------------------------------

  /** Pull a YYYY-MM-DD out of a declared metadata value (or null). */
  function extractDate(value) {
    if (typeof value !== 'string') return null;
    const match = value.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    return match ? match[1] : null;
  }

  /**
   * Collect the freshness fields the bundled data actually declares.
   * Returns { fields: [{date, label}...], latest, sources }.
   */
  function collectDataMeta(gameData, balanceStats, costs, armorClasses) {
    const fields = [];
    const push = (date, label) => {
      if (date) fields.push({ date, label });
    };
    push(extractDate(gameData && gameData.meta && gameData.meta.last_updated), 'game data');
    push(extractDate(balanceStats && balanceStats._meta && balanceStats._meta.fetched), 'combat stats (ER Balance Sheet)');
    push(extractDate(costs && costs._generated), 'cost tables');
    push(extractDate(armorClasses && armorClasses._source), 'armour classes');
    fields.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return {
      fields,
      latest: fields.length ? fields[fields.length - 1].date : null,
      sources: fields.map(f => f.label).join(', '),
    };
  }

  /** Compact footer text; the per-dataset breakdown rides in the title tooltip. */
  function formatDataLabel(meta) {
    if (!meta) meta = collectDataMeta();
    const date = meta.latest ? ' ' + meta.latest : '';
    return 'Reference data snapshot' + date;
  }

  function formatDataDetail(meta) {
    if (!meta || !meta.fields.length) return 'Snapshot data bundled with this app build.';
    return meta.fields.map(f => `${f.label}: ${f.date}`).join(' · ');
  }

  // ---- Offline indicator ------------------------------------------------------

  function shouldShowOffline(navigatorLike) {
    return !!(navigatorLike && navigatorLike.onLine === false);
  }

  function offlineText() {
    return 'Offline — using the saved copy';
  }

  // ---- Update indicator -------------------------------------------------------

  /**
   * Decide what (if anything) the update chip should say.
   * @param {string} state 'installed' | 'activated' (worker.state)
   * @param {object} ctx { hasController, sawUpdate }
   * @returns {{text:string, reload:boolean}|null}
   */
  function updateStatus(state, ctx) {
    const hasController = !!(ctx && ctx.hasController);
    const sawUpdate = !!(ctx && ctx.sawUpdate);
    if (state === 'installed') {
      // A brand-new install (no controller) has nothing stale to reload.
      if (!hasController || !sawUpdate) return null;
      return { text: 'Update available — reload to apply', reload: true };
    }
    if (state === 'activated' && sawUpdate) {
      return { text: 'Update installed — reload to use the latest version', reload: true };
    }
    return null;
  }

  // ---- DOM wiring -------------------------------------------------------------

  function initTrustIndicators() {
    const dataChip = document.getElementById('trust-data');
    const onlineChip = document.getElementById('trust-online');
    const updateChip = document.getElementById('trust-update');
    if (!dataChip || !onlineChip || !updateChip) return;

    const meta = collectDataMeta(w.GAME_DATA, w.BALANCE_STATS, w.COSTS, w.ARMOR_CLASSES);
    dataChip.textContent = formatDataLabel(meta);
    dataChip.title = formatDataDetail(meta);

    function syncOnline() {
      const offline = shouldShowOffline(w.navigator || {});
      onlineChip.textContent = offline ? offlineText() : '';
      onlineChip.hidden = !offline;
    }
    syncOnline();
    if (typeof w.addEventListener === 'function') {
      w.addEventListener('online', syncOnline);
      w.addEventListener('offline', syncOnline);
    }

    let sawUpdate = false;
    let reloadWired = false;
    let registration = null;
    let reloadPending = false;
    let reloadStarted = false;
    const reloadPage = () => {
      if (reloadStarted) return;
      reloadStarted = true;
      if (w.location && typeof w.location.reload === 'function') w.location.reload();
    };
    function showUpdate(spec) {
      if (!spec) return;
      const text = document.getElementById('trust-update-text');
      if (text) text.textContent = spec.text;
      const reload = document.getElementById('trust-update-reload');
      if (reload && !reloadWired) {
        reloadWired = true;
        reload.addEventListener('click', () => {
          const waiting = registration && registration.waiting;
          if (waiting) {
            reloadPending = true;
            reload.disabled = true;
            waiting.postMessage('SKIP_WAITING');
            // Reload promptly even if controllerchange is delayed by an active
            // fetch event; navigating releases the current client so activation
            // can complete instead of leaving the button disabled indefinitely.
            w.setTimeout(reloadPage, 100);
            return;
          }
          reloadPage();
        });
      }
      updateChip.hidden = false;
    }

    if (w.navigator && 'serviceWorker' in w.navigator) {
      w.navigator.serviceWorker.register('sw.js').then(reg => {
        registration = reg;
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            const hasController = !!(w.navigator.serviceWorker.controller);
            if (worker.state === 'installed' && hasController) sawUpdate = true;
            showUpdate(updateStatus(worker.state, { hasController, sawUpdate }));
          });
        });
      }).catch(() => {});
      w.navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (sawUpdate) showUpdate(updateStatus('activated', { hasController: true, sawUpdate: true }));
        if (reloadPending) reloadPage();
      });
    }
  }

  // Auto-start only in a real browser with the footer present; the Node test
  // harness loads this file without those elements.
  if (typeof document !== 'undefined' && document.getElementById) {
    if (document.getElementById('trust-data')) initTrustIndicators();
    else if (typeof document.addEventListener === 'function') {
      document.addEventListener('DOMContentLoaded', initTrustIndicators);
    }
  }

  const TRUST = {
    collectDataMeta,
    formatDataLabel,
    formatDataDetail,
    shouldShowOffline,
    offlineText,
    updateStatus,
    initTrustIndicators,
  };
  w.TRUST = TRUST;
  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = TRUST;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
