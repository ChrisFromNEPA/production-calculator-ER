(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CMG_COLONY_WORK = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const ACTION_ORDER = {
    mine: 10,
    'move-owned': 20,
    'move-mined': 30,
    refine: 40,
    'move-refined': 50,
  };

  function buildColonyWorkQueue(plan, mineSites) {
    plan = plan || {};
    mineSites = mineSites || {};
    const refineDestination = plan.refineDestination || plan.destination || '';
    const productionDestination = plan.destination || refineDestination;
    const groups = new Map();

    function groupFor(colony) {
      if (!colony) return null;
      if (!groups.has(colony)) groups.set(colony, { colony, actions: [] });
      return groups.get(colony);
    }

    function add(colony, action) {
      const group = groupFor(colony);
      if (group) group.actions.push({ ...action, colony });
    }

    // A mining visit includes both the mine action and the raw-material haul
    // when the chosen mine is not the refinement colony.
    Object.entries(plan.acquire || {}).forEach(([item, info]) => {
      info = info || {};
      const sites = Array.isArray(info.from) ? info.from : [];
      const chosen = mineSites[item] && sites.includes(mineSites[item])
        ? mineSites[item]
        : (info.preferred || sites[0] || '');
      if (!chosen) return;
      const target = info.to || refineDestination;
      add(chosen, { kind: 'mine', item, qty: info.qty || 0, site: chosen, sites });
      if (chosen !== target) {
        add(chosen, {
          kind: 'move-mined', item, qty: info.qty || 0,
          from: chosen, to: target,
        });
      }
    });

    // Owned stock moves to the refinement colony. Keep each source colony in
    // the same visit group as its mining work, if it has any.
    Object.entries(plan.transport || {}).forEach(([item, info]) => {
      info = info || {};
      (info.from || []).forEach(source => {
        const qty = (info.fromQty && info.fromQty[source]) || 0;
        if (!qty) return;
        add(source, {
          kind: 'move-owned', item, qty, from: source,
          to: info.to || refineDestination,
        });
      });
    });

    // Refinement happens at the selected refinement colony. A refined output
    // can leave as soon as its last downstream refinement consumer is done;
    // unrelated refinement work should not hold it at the colony.
    const refineSteps = plan.refine || [];
    const producerIndex = {};
    const lastConsumerIndex = {};
    refineSteps.forEach((step, index) => {
      producerIndex[step.item] = index;
      (step.resolvedInputs || step.inputs || []).forEach(input => {
        lastConsumerIndex[input.item] = index;
      });
    });
    const readyToShip = {};
    Object.keys(plan.finalTransport || {}).forEach(item => {
      const producedAt = producerIndex[item] == null ? -1 : producerIndex[item];
      const consumedAt = lastConsumerIndex[item] == null ? -1 : lastConsumerIndex[item];
      readyToShip[item] = Math.max(producedAt, consumedAt);
      if (readyToShip[item] < 0) readyToShip[item] = Math.max(0, refineSteps.length - 1);
    });

    refineSteps.forEach((step, index) => {
      const colony = step.location || refineDestination;
      add(colony, {
        kind: 'refine', item: step.item, qty: step.produced || 0,
        batches: step.batches || 0, location: colony, step,
        order: 100 + index * 2,
      });
      if (refineDestination === productionDestination) return;
      Object.entries(plan.finalTransport || {}).forEach(([item, qty]) => {
        if (!qty || readyToShip[item] !== index) return;
        add(refineDestination, {
          kind: 'move-refined', item, qty,
          from: refineDestination, to: productionDestination,
          order: 101 + index * 2,
        });
      });
    });

    if (!refineSteps.length && refineDestination !== productionDestination) {
      Object.entries(plan.finalTransport || {}).forEach(([item, qty]) => {
        if (!qty) return;
        add(refineDestination, {
          kind: 'move-refined', item, qty,
          from: refineDestination, to: productionDestination, order: 100,
        });
      });
    }

    return Array.from(groups.values())
      .map(group => {
        const ordered = group.actions.slice().sort((a, b) =>
          (a.order == null ? (ACTION_ORDER[a.kind] || 999) : a.order) -
          (b.order == null ? (ACTION_ORDER[b.kind] || 999) : b.order) ||
          String(a.item).localeCompare(String(b.item))
        );
        const moves = ordered.filter(action => action.kind.indexOf('move') === 0);
        if (!moves.length) return { colony: group.colony, actions: ordered };
        const nonMoves = ordered.filter(action => action.kind.indexOf('move') !== 0);
        const lastNonMoveOrder = nonMoves.reduce((max, action) =>
          Math.max(max, action.order == null ? (ACTION_ORDER[action.kind] || 999) : action.order), 0);
        return {
          colony: group.colony,
          actions: nonMoves.concat([{
            kind: 'move-batch',
            from: group.colony,
            items: moves.map(action => ({
              kind: action.kind,
              item: action.item,
              qty: action.qty,
              from: action.from,
              to: action.to,
            })),
            order: lastNonMoveOrder + 1,
          }]),
        };
      })
      // Refinement consumes everything gathered or moved by the other visits.
      // Keep that colony last so the itinerary can be followed top-to-bottom.
      .sort((a, b) => {
        const aRefines = a.colony === refineDestination ? 1 : 0;
        const bRefines = b.colony === refineDestination ? 1 : 0;
        return aRefines - bRefines;
      });
  }

  function workActionId(action) {
    action = action || {};
    if (action.kind === 'manufacture') return 'manufacture|' + action.item;
    if (action.kind === 'move-batch') {
      return 'move-batch|' + (action.from || action.colony || '') + '|' + (action.items || []).map(item =>
        [item.kind, item.item, item.from, item.to].join('|')).join(';');
    }
    return [action.kind || 'action', action.item || '', action.from || '', action.to || '', action.colony || ''].join('|');
  }

  function currentColonyObjective(queue, manufacture, completed) {
    completed = completed || {};
    const actions = [];
    (queue || []).forEach(group => (group.actions || []).forEach(action => actions.push(action)));
    (manufacture || []).forEach(action => actions.push({ ...action, kind: 'manufacture' }));
    const action = actions.find(candidate => !completed[workActionId(candidate)]);
    return action ? { action, kind: action.kind, id: workActionId(action) } : null;
  }

  return { buildColonyWorkQueue, currentColonyObjective, workActionId };
});
