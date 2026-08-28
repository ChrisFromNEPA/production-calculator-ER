/* Targeted calculator feedback. This observes rendered values, not React state. */
'use strict';

(function installCMGValueTransition(window) {
  const previous = new Map();
  const timers = new WeakMap();
  // .cost-hero-value replaced .cost-panel-total when the cost panel gained its
  // hero strip; observing both keeps older extensions and themes working.
  const SELECTORS = ['.cost-panel-total', '.cost-hero-value', '.kpi-value', '.mat-row', '.step-card'];

  function markChanged(container) {
    if (!container) return;
    SELECTORS.forEach(selector => {
      [...container.querySelectorAll(selector)].forEach((node, index) => {
        const key = `${container.id || 'calc'}:${selector}:${index}`;
        const value = node.textContent.trim();
        const old = previous.get(key);
        previous.set(key, value);
        if (old === undefined || old === value) return;
        node.classList.remove('cmg-value-changed');
        void node.offsetWidth;
        node.classList.add('cmg-value-changed');
        clearTimeout(timers.get(node));
        timers.set(node, window.setTimeout(() => node.classList.remove('cmg-value-changed'), 420));
      });
    });
  }

  function announce({ item, quantity, result }) {
    const live = document.getElementById('calc-live-summary');
    if (!live) return;
    // The headline figure lives in the cost-hero strip (.cost-panel-total is
    // the legacy shape); fall back to the KPI strip so the announcement always
    // carries the number instead of a permanent "still being calculated".
    const total = result?.querySelector('.cost-hero-value')?.textContent.trim()
      || result?.querySelector('.cost-panel-total')?.textContent.trim();
    const status = total ? `Total ${total}.` : 'Cost details are still being calculated.';
    live.textContent = `${item || 'Production plan'}, quantity ${quantity || 1}. ${status}`;
  }

  window.CMG_VALUE_TRANSITION = Object.freeze({ markChanged, announce });
})(window);
