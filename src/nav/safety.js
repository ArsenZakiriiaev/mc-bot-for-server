'use strict';

const LAVA_RADIUS = 2;
const LAVA_PENALTY = 8;
const FIRE_PENALTY = 4;
const CACTUS_PENALTY = 4;

function hazardPenalty(bot, pos, action) {
  let p = 0;
  for (let dx = -LAVA_RADIUS; dx <= LAVA_RADIUS; dx++) {
    for (let dz = -LAVA_RADIUS; dz <= LAVA_RADIUS; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        const b = bot.blockAt(pos.offset(dx, dy, dz));
        if (!b) continue;
        if (b.name.includes('lava')) {
          const d = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
          p += LAVA_PENALTY * (1 - d / (LAVA_RADIUS + 1));
        }
        if (b.name === 'fire' || b.name === 'magma_block') p += FIRE_PENALTY;
        if (b.name === 'cactus') p += CACTUS_PENALTY;
      }
    }
  }
  return p;
}

function isHardForbidden(bot, pos, action) {
  const b = bot.blockAt(pos);
  if (!b) return false;
  if (b.name === 'lava') return true;
  if (b.name === 'fire' && action === 'step') return true;
  return false;
}

module.exports = { hazardPenalty, isHardForbidden };
