'use strict';

const SCAFFOLD_LOW       = 16;  // warn below this
const SCAFFOLD_CRITICAL  =  4;  // interrupt pathing below this

function countScaffold(bot, cfg) {
  return bot.inventory.items()
    .filter(it => cfg.scaffoldBlocks.includes(it.name))
    .reduce((sum, it) => sum + it.count, 0);
}

/** Returns true when scaffold stock is healthy. */
function hasScaffold(bot, cfg) {
  return countScaffold(bot, cfg) >= SCAFFOLD_LOW;
}

/** Returns true when scaffold is so low that bridging paths will fail. */
function criticallyLowScaffold(bot, cfg) {
  return countScaffold(bot, cfg) < SCAFFOLD_CRITICAL;
}

/**
 * Ensure the hotbar contains a scaffold item so the pathfinder's executor
 * can pick it up with getScaffoldingItem().
 * Tries to equip one if the held item is not a scaffold block.
 */
async function ensureScaffoldInHand(bot, cfg) {
  const held = bot.heldItem;
  if (held && cfg.scaffoldBlocks.includes(held.name)) return;

  const item = bot.inventory.items().find(it => cfg.scaffoldBlocks.includes(it.name));
  if (!item) return;

  try {
    await bot.equip(item, 'hand');
  } catch {}
}

module.exports = {
  countScaffold,
  hasScaffold,
  criticallyLowScaffold,
  ensureScaffoldInHand,
  SCAFFOLD_LOW,
  SCAFFOLD_CRITICAL,
};
