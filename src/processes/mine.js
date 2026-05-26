'use strict';

const { goals: Goals } = require('mineflayer-pathfinder');
const Process = require('./_base');
const scanner = require('../nav/cache/scanner');
const inventory = require('../nav/inventory');
const navConfig = require('../nav/config');

const BLOCK_ALIASES = {
  wood: 'oak_log', log: 'oak_log', logs: 'oak_log',
  oak: 'oak_log', spruce: 'spruce_log', birch: 'birch_log',
  jungle: 'jungle_log', acacia: 'acacia_log', dark_oak: 'dark_oak_log',
  mangrove: 'mangrove_log', cherry: 'cherry_log',
  coal: 'coal_ore', iron: 'iron_ore', gold: 'gold_ore',
  diamond: 'diamond_ore', emerald: 'emerald_ore', lapis: 'lapis_ore',
  redstone: 'redstone_ore', copper: 'copper_ore',
  deepslate_coal: 'deepslate_coal_ore', deepslate_iron: 'deepslate_iron_ore',
  deepslate_gold: 'deepslate_gold_ore', deepslate_diamond: 'deepslate_diamond_ore',
  deepslate_emerald: 'deepslate_emerald_ore',
  sand: 'sand', gravel: 'gravel', clay: 'clay',
  glowstone: 'glowstone', quartz: 'nether_quartz_ore',
  ancient_debris: 'ancient_debris',
};

function resolveBlockName(name) {
  const n = name.trim().toLowerCase();
  return BLOCK_ALIASES[n] || n;
}

function getBestTool(bot, block) {
  const handTime = block.digTime(null);
  let bestTool = null, bestTime = handTime;
  for (const item of bot.inventory.items()) {
    const t = block.digTime(item);
    if (t < bestTime) { bestTime = t; bestTool = item; }
  }
  return bestTool;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class MineProcess extends Process {
  constructor(controller) {
    super(controller);
    this._active  = false;
    this._target  = null;
    this._busy    = false;
  }

  get name()     { return 'mine'; }
  get priority() { return 30; }
  isActive()     { return this._active; }

  start(blockName) {
    const resolved = resolveBlockName(String(blockName || '').trim());
    this._target = resolved;
    this._active = true;
    this._busy   = false;
    this.controller.bot.chat(`OK. Mining '${resolved}' until you say !stop.`);
    this.controller.bot.emit('companion:log', `[MINE] Started: ${resolved}`);
  }

  cancel(reason = '') {
    this._active = false;
    this._busy   = false;
    this._target = null;
    try { this.controller.bot.stopDigging(); } catch {}
    this.controller.pathing.clearGoal();
    this.controller.bot.emit('companion:log', `[MINE] Stopped (${reason})`);
  }

  async tick() {
    if (this._busy) return;
    this._busy = true;
    try {
      await this._step();
    } catch (err) {
      this.controller.bot.emit('companion:log', `[MINE] Tick error: ${err.message}`);
      await sleep(300);
    } finally {
      this._busy = false;
    }
  }

  async _step() {
    const { bot, pathing, chunkCache } = this.controller;
    const blockName = this._target;

    // Scaffold discipline: warn when low, try to equip what we have
    if (navConfig.allowPlace) {
      if (inventory.criticallyLowScaffold(bot, navConfig)) {
        bot.emit('companion:log',
          `[MINE] Scaffold critically low (< ${inventory.SCAFFOLD_CRITICAL}), bridging disabled until restocked`);
      } else if (!inventory.hasScaffold(bot, navConfig)) {
        bot.emit('companion:log',
          `[MINE] Scaffold low (< ${inventory.SCAFFOLD_LOW})`);
      }
      await inventory.ensureScaffoldInHand(bot, navConfig);
    }

    // Find via loaded chunks first, then cache
    const candidates = scanner.find(chunkCache, bot, blockName, {
      maxDistance: 96,
      scanRadius: 256,
      count: 32,
    });

    if (!candidates.length) {
      bot.emit('companion:log', `[MINE] No '${blockName}' visible — handing off to explore`);
      this._active = false;
      this.controller.processes.explore.startToward(blockName, () => {
        if (this._target === blockName) this.start(blockName);
      });
      return;
    }

    const pos = candidates[0];
    const block = bot.blockAt(pos);
    if (!block || block.name !== blockName) return;

    bot.emit('companion:log', `[MINE] Target ${blockName} @ (${pos.x},${pos.y},${pos.z})`);

    // Navigate to within reach
    const goal = new Goals.GoalGetToBlock(pos.x, pos.y, pos.z);
    pathing.setGoal(goal);

    // Wait until adjacent or timeout
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (!this._active) return;
      if (goal.isEnd(bot.entity.position.floored())) break;
      await sleep(200);
    }
    if (!goal.isEnd(bot.entity.position.floored())) return;

    // Verify block still there
    const fresh = bot.blockAt(pos);
    if (!fresh || fresh.name !== blockName) return;

    // Equip best tool
    const tool = getBestTool(bot, fresh);
    if (tool) {
      try { await bot.equip(tool, 'hand'); } catch {}
    }

    // Dig it
    try {
      await bot.dig(fresh);
    } catch (err) {
      bot.emit('companion:log', `[MINE] Dig failed: ${err.message}`);
      await sleep(250);
    }

    await sleep(100);
  }
}

module.exports = MineProcess;
