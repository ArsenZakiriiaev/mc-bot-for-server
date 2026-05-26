'use strict';

const { KIND } = require('./chunkCache');

// Map a block name to the cache kind used to find it.
function kindFor(blockName) {
  const n = blockName.toLowerCase();
  if (n.endsWith('_log') || n === 'bamboo_block') return KIND.LOG;
  if (n.endsWith('_ore') || n === 'ancient_debris') return KIND.ORE;
  if (n === 'lava') return KIND.LAVA;
  if (n === 'water') return KIND.WATER;
  if (n === 'cactus' || n === 'magma_block' || n === 'sweet_berry_bush' || n === 'powder_snow') return KIND.AVOID;
  return KIND.SOLID;
}

/**
 * Find positions of a named block type.
 *
 * Strategy:
 *   1. bot.findBlocks() for loaded chunks up to maxDistance.
 *   2. Fall back to the chunk cache (avoids "wander forever" when chunks unload).
 *
 * Returns an array of Vec3-like {x, y, z} objects sorted nearest-first.
 */
function find(cache, bot, blockName, opts = {}) {
  const maxDistance = opts.maxDistance ?? 64;
  const count = opts.count ?? 16;
  const scanRadius = opts.scanRadius ?? 256;

  // 1) Live loaded-chunk scan (fast, exact)
  const live = bot.findBlocks({
    matching: block => block?.name === blockName,
    maxDistance,
    count,
  });
  if (live.length > 0) return live;

  // 2) Cache scan — works even after chunks unload
  const kind = kindFor(blockName);
  if (kind === KIND.AIR) return [];

  const candidates = cache.find(kind, bot.entity.position, scanRadius);

  // For generic SOLID kind, we can't verify block identity from the cache;
  // filter to a reasonable count and let the caller navigate then verify.
  return candidates.slice(0, count);
}

module.exports = { find, kindFor };
