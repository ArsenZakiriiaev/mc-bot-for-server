'use strict';

const { Vec3 } = require('vec3');

const PLACEABLE_BLOCKS = new Set([
  'dirt', 'cobblestone', 'stone', 'netherrack', 'sand', 'gravel',
  'oak_planks', 'spruce_planks', 'birch_planks', 'jungle_planks',
  'acacia_planks', 'dark_oak_planks', 'mangrove_planks', 'cherry_planks',
  'bamboo_planks'
]);

function pickBuildingBlock(bot) {
  return bot.inventory.items().find(item => PLACEABLE_BLOCKS.has(item.name)) || null;
}

async function tryPlaceUnder(bot) {
  const underPos = bot.entity.position.offset(0, -1, 0).floored();
  const under = bot.blockAt(underPos);
  if (under?.boundingBox === 'block') return false;

  const placeItem = pickBuildingBlock(bot);
  if (!placeItem) {
    bot.emit('companion:log', '[BUILD] No suitable block in inventory to place under self');
    return false;
  }

  const candidates = [
    { ref: underPos.offset(1, 0, 0), face: new Vec3(-1, 0, 0) },
    { ref: underPos.offset(-1, 0, 0), face: new Vec3(1, 0, 0) },
    { ref: underPos.offset(0, 0, 1), face: new Vec3(0, 0, -1) },
    { ref: underPos.offset(0, 0, -1), face: new Vec3(0, 0, 1) },
    { ref: underPos.offset(0, -1, 0), face: new Vec3(0, 1, 0) }
  ];

  for (const { ref, face } of candidates) {
    const refBlock = bot.blockAt(ref);
    if (refBlock?.boundingBox !== 'block') continue;

    try {
      await bot.equip(placeItem, 'hand');
      await bot.placeBlock(refBlock, face);
    } catch (err) {
      const msg = String(err?.message || err);
      // mineflayer sometimes throws on blockUpdate timeout even when placement succeeded
      if (!msg.includes('blockUpdate') && !msg.includes('timeout')) continue;
    }

    if (bot.blockAt(underPos)?.boundingBox === 'block') {
      bot.emit('companion:log', '[BUILD] Placed block under self');
      return true;
    }
  }

  bot.emit('companion:log', '[BUILD] All placement attempts failed');
  return false;
}

module.exports = { tryPlaceUnder };
