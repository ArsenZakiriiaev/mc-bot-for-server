'use strict';

const { Movements } = require('mineflayer-pathfinder');
const cfg = require('./config');
const { hazardPenalty } = require('./safety');

function build(bot, mcData) {
  const m = new Movements(bot, mcData);

  m.allowSprinting = cfg.allowSprint;
  m.allowParkour = cfg.allowParkour;
  m.canDig = cfg.allowBreak;
  m.canPlaceBlocks = cfg.allowPlace;
  m.allow1by1towers = true;
  m.maxDropDown = cfg.maxFallHeightNoWater;
  m.infiniteLiquidDropdownDistance = false;

  m.blocksToAvoid = new Set(
    cfg.avoidBlocks.map(n => mcData.blocksByName[n]?.id).filter(Boolean)
  );

  for (const name of cfg.scaffoldBlocks) {
    const id = bot.registry.itemsByName[name]?.id;
    if (id) m.scafoldingBlocks.push(id);
  }

  m.exclusionAreasStep = [(block) => hazardPenalty(bot, block.position, 'step')];
  m.exclusionAreasBreak = [(block) => hazardPenalty(bot, block.position, 'break')];
  m.exclusionAreasPlace = [(block) => hazardPenalty(bot, block.position, 'place')];

  return m;
}

module.exports = { build };
