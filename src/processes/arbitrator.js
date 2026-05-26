'use strict';

/**
 * Picks the highest-priority active process from the list.
 * Returns null if none are active.
 */
function pick(processes) {
  let best = null;
  for (const p of processes) {
    if (!p.isActive()) continue;
    if (!best || p.priority > best.priority) best = p;
  }
  return best;
}

module.exports = { pick };
