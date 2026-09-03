/* Shared production Apply implementation. Loaded after STORE and ENGINE. */
'use strict';
(function () {
  function canonicalInventory(entries) {
    return JSON.stringify((entries || []).map(entry => [
      String(entry.item || ''),
      String(entry.location || ''),
      Number(entry.quantity) || 0,
    ]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  }
  const inventoryGuard = {
    capture(entries) { return encodeURIComponent(canonicalInventory(entries)); },
    isCurrent(token, entries) { return token === this.capture(entries); },
  };

  function applyProductionPlan(res, dest, options) {
    const engine = window.ENGINE;
    const store = window.STORE;
    const scratch = options?.scratch === true;
    const finalDest = dest || res.plan.destination || engine.DESTINATION || 'Berlin';
    const refineDest = res.plan.refineDestination || finalDest;
    const baseline = store.getInv().map(entry => ({ ...entry }));
    // A scratch plan represents separately acquired materials. Execute it in an
    // empty working inventory, then merge only its produced remainder/output
    // into the untouched live baseline.
    const inv = scratch ? [] : baseline.map(entry => ({ ...entry }));
    const log = [];
    const deductAt = (item, location, qty) => {
      const idx = inv.findIndex(e => e.item === item && e.location === location);
      if (idx < 0) return 0;
      const take = Math.min(qty, inv[idx].quantity);
      inv[idx].quantity -= take;
      if (inv[idx].quantity <= 0) inv.splice(idx, 1);
      return take;
    };
    const addAt = (item, location, qty) => {
      if (qty <= 0) return;
      const idx = inv.findIndex(e => e.item === item && e.location === location);
      if (idx >= 0) inv[idx].quantity += qty;
      else inv.push({ item, location, quantity: qty });
    };
    const availableAt = (item, location) => inv
      .filter(e => e.item === item && e.location === location)
      .reduce((sum, e) => sum + e.quantity, 0);

    Object.entries(res.plan.transport || {}).forEach(([item, info]) => {
      let need = info.qty;
      const target = info.to || refineDest;
      (info.from || []).forEach(loc => {
        if (need > 0) need -= deductAt(item, loc, need);
      });
      const moved = info.qty - need;
      addAt(item, target, moved);
      log.push(`Moved ${engine.fmt(moved)} ${engine.esc(item)} → ${engine.esc(target)}`);
    });

    let previousLocation = refineDest;
    (res.plan.steps || []).forEach(step => {
      const location = step.location || finalDest;
      const inputs = step.resolvedInputs || [];
      const transferSource = location === refineDest ? previousLocation : refineDest;
      if (transferSource !== location) inputs.forEach(inp => {
        const needAtSource = Math.max(0, inp.qty - availableAt(inp.item, location));
        const moved = deductAt(inp.item, transferSource, needAtSource);
        addAt(inp.item, location, moved);
      });
      addAt(step.item, location, step.produced);
      log.push(`${step.type === 'manufacture' ? 'Manufactured' : 'Refined'} ${engine.fmt(step.produced)} ${engine.esc(step.item)} at ${engine.esc(location)}`);
      inputs.forEach(inp => {
        const taken = deductAt(inp.item, location, inp.qty);
        if (inp.qty > taken) log.push(`⚠ assumed mined: ${engine.fmt(inp.qty - taken)}× ${engine.esc(inp.item)} (not at ${engine.esc(location)})`);
      });
      previousLocation = location;
    });
    const nextInventory = scratch ? (() => {
      const merged = baseline.map(entry => ({ ...entry }));
      inv.forEach(entry => {
        const existing = merged.find(candidate => candidate.item === entry.item && candidate.location === entry.location);
        if (existing) existing.quantity += entry.quantity;
        else merged.push({ ...entry });
      });
      return merged;
    })() : inv;
    try {
      store.setInv(nextInventory);
      store.recomputeInv();
      if (typeof window.refreshAll === 'function') window.refreshAll();
    } catch (error) {
      // Do not leave a partially committed inventory when persistence or runtime
      // hydration fails. Best-effort rollback is attempted before rethrowing the
      // original failure to the UI boundary.
      try {
        store.setInv(baseline);
        store.recomputeInv();
      } catch { /* preserve the original error */ }
      throw error;
    }
    return log;
  }
  window.APPLY_PRODUCTION_PLAN = applyProductionPlan;
  window.PLAN_INVENTORY_GUARD = inventoryGuard;
})();
