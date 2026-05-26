'use strict';

const { Movements } = require('mineflayer-pathfinder');
const Move = require('mineflayer-pathfinder/lib/move');
const cfg = require('./config');
const { hazardPenalty } = require('./safety');

/**
 * Subclass of mineflayer-pathfinder Movements that:
 *   - Exposes key properties as live getters that read from the shared cfg
 *     object, so !settings changes take effect on the next A* call without
 *     rebuilding the Movements instance.
 *   - Overrides getMoveParkourForward to apply jumpPenalty, making the
 *     planner prefer ground paths over parkour when both are available.
 */
class ExtendedMovements extends Movements {
  constructor(bot) {
    super(bot);
    // Remove the instance properties set by super() that we want to redirect
    // to cfg getters.  After deletion, prototype getters become visible.
    delete this.canDig;
    delete this.allowParkour;
    delete this.allowSprinting;
    delete this.canPlaceBlocks;
    delete this.maxDropDown;
    delete this.placeCost;
    delete this.digCost;
  }

  // Live config getters — no rebuild needed when cfg is mutated by !settings
  get canDig()         { return cfg.allowBreak; }
  set canDig(_)        {}
  get allowParkour()   { return cfg.allowParkour; }
  set allowParkour(_)  {}
  get allowSprinting() { return cfg.allowSprint; }
  set allowSprinting(_){}
  get canPlaceBlocks() { return cfg.allowPlace; }
  set canPlaceBlocks(_){}
  get maxDropDown()    { return cfg.maxFallHeightNoWater; }
  set maxDropDown(_)   {}
  get placeCost()      { return cfg.placeCost; }
  set placeCost(_)     {}
  get digCost()        { return cfg.breakCostMultiplier; }
  set digCost(_)       {}

  /**
   * Override to add jumpPenalty on top of the base cost so the planner
   * prefers non-parkour paths when they exist and allows parkour when
   * there is no alternative.
   */
  getMoveParkourForward(node, dir, neighbors) {
    const before = neighbors.length;
    super.getMoveParkourForward(node, dir, neighbors);
    for (let i = before; i < neighbors.length; i++) {
      const m = neighbors[i];
      // Wrap in a new Move so the cost field is not mutated on a shared object.
      neighbors[i] = new Move(
        m.x, m.y, m.z,
        m.remainingBlocks,
        m.cost + cfg.jumpPenalty,
        m.toBreak, m.toPlace, m.parkour
      );
    }
  }
}

function build(bot, mcData) {
  const m = new ExtendedMovements(bot);

  // Static configuration that IS baked at build time.
  // Dynamic properties (canDig, allowParkour, etc.) come from live getters.
  m.allow1by1towers = true;
  m.infiniteLiquidDropdownDistance = false;

  m.blocksToAvoid = new Set(
    cfg.avoidBlocks
      .map(n => mcData.blocksByName[n]?.id)
      .filter(id => id != null)
  );

  for (const name of cfg.scaffoldBlocks) {
    const id = bot.registry.itemsByName[name]?.id;
    if (id != null) m.scafoldingBlocks.push(id);
  }

  m.exclusionAreasStep  = [(block) => hazardPenalty(bot, block.position, 'step')];
  m.exclusionAreasBreak = [(block) => hazardPenalty(bot, block.position, 'break')];
  m.exclusionAreasPlace = [(block) => hazardPenalty(bot, block.position, 'place')];

  return m;
}

module.exports = { build, ExtendedMovements };
