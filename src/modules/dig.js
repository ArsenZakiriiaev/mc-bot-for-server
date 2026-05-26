'use strict';

const { goals: Goals } = require('mineflayer-pathfinder');
const States = require('../core/states');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getBestTool(bot, block) {
  const handTime = block.digTime(null);
  let bestTool = null;
  let bestTime = handTime;

  for (const item of bot.inventory.items()) {
    const t = block.digTime(item);
    if (t < bestTime) {
      bestTime = t;
      bestTool = item;
    }
  }

  return bestTool;
}

function findNearestBlock(bot, name, maxDistance) {
  const results = bot.findBlocks({
    matching: block => block?.name === name,
    maxDistance,
    count: 1
  });
  return results.length > 0 ? results[0] : null;
}

async function moveTo(bot, goal, timeoutMs) {
  bot.pathfinder.setGoal(goal, false);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (goal.isEnd(bot.entity.position.floored())) return;
    await sleep(200);
  }
  bot.pathfinder.setGoal(null);
  throw new Error('timeout while moving to goal');
}

async function moveNear(bot, pos, range = 1) {
  await moveTo(bot, new Goals.GoalNear(pos.x, pos.y, pos.z, range), 15000);
}

async function moveToBlock(bot, pos) {
  await moveTo(bot, new Goals.GoalGetToBlock(pos.x, pos.y, pos.z), 20000);
}

async function tryDig(bot, block, maxAttempts = 3) {
  for (let i = 1; i <= maxAttempts; i++) {
    const tool = getBestTool(bot, block);
    if (tool) {
      try {
        await bot.equip(tool, 'hand');
      } catch (err) {
        bot.emit('companion:log', `[DIG] Failed to equip tool: ${err.message}`);
      }
    }

    try {
      await bot.dig(block);
      return true;
    } catch (err) {
      bot.emit('companion:log', `[DIG] Dig attempt ${i} failed: ${err.message}`);
      await sleep(250);
    }
  }
  return false;
}

const BLOCK_ALIASES = {
  wood: 'oak_log', log: 'oak_log', logs: 'oak_log',
  oak: 'oak_log', spruce: 'spruce_log', birch: 'birch_log',
  jungle: 'jungle_log', acacia: 'acacia_log', dark_oak: 'dark_oak_log',
  mangrove: 'mangrove_log', cherry: 'cherry_log', bamboo_block: 'bamboo_block',
  grass: 'grass_block', dirt_path: 'dirt_path',
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

function stop(controller, reason = 'stopped') {
  if (controller._digJob) {
    controller._digJob.active = false;
    controller._digJob.reason = reason;
  }
  try { controller.bot.pathfinder.setGoal(null); } catch {}
  try { controller.bot.stopDigging(); } catch {}
}

function start(controller, blockName, opts = {}) {
  const bot = controller.bot;
  const name = String(blockName || '').trim().toLowerCase();

  if (!name) {
    bot.chat('Usage: !dig <block_name>');
    return;
  }

  stop(controller, 'replaced');

  const resolved = resolveBlockName(name);
  if (resolved !== name) {
    bot.emit('companion:log', `[DIG] Alias '${name}' -> '${resolved}'`);
  }

  controller._digJob = {
    id: (controller._digJob?.id || 0) + 1,
    active: true,
    blockName: resolved,
    maxDistance: Number.isFinite(opts.maxDistance) ? opts.maxDistance : 64,
    searchMaxDistance: Number.isFinite(opts.searchMaxDistance) ? opts.searchMaxDistance : 128,
    searchStep: Number.isFinite(opts.searchStep) ? opts.searchStep : 24,
    origin: bot.entity.position.clone(),
    searchIndex: 0,
    reason: null,
    _busy: false
  };

  bot.chat(`OK. Digging '${resolved}' until you say !stop.`);
  bot.emit('companion:log', `[DIG] Started continuous dig: ${resolved}`);
  controller.sm.setState(States.DIG, 'dig start');
}

async function tick(controller) {
  const bot = controller.bot;
  const job = controller._digJob;

  if (!job?.active) {
    const nextState = controller.getOwnerEntity() ? States.FOLLOW : States.IDLE;
    controller.sm.setState(nextState, 'dig done');
    return;
  }

  if (job._busy) return;
  job._busy = true;

  try {
    const { blockName, maxDistance, searchMaxDistance, searchStep, origin } = job;

    let pos = findNearestBlock(bot, blockName, maxDistance);
    if (!pos && searchMaxDistance > maxDistance) {
      pos = findNearestBlock(bot, blockName, searchMaxDistance);
    }

    if (!pos) {
      const i = job.searchIndex++;
      const ring = Math.floor(i / 4) + 1;
      const dir = i % 4;
      const dx = (dir === 0 ? 1 : dir === 2 ? -1 : 0) * ring * searchStep;
      const dz = (dir === 1 ? 1 : dir === 3 ? -1 : 0) * ring * searchStep;
      const target = origin.offset(dx, 0, dz);
      bot.emit('companion:log', `[DIG] No '${blockName}' found. Searching (${target.x.toFixed(0)}, ${target.z.toFixed(0)})`);
      await moveNear(bot, target, 2);
      return;
    }

    const block = bot.blockAt(pos);
    if (!block || block.name !== blockName) return;

    bot.emit('companion:log', `[DIG] Target ${blockName} at (${pos.x}, ${pos.y}, ${pos.z})`);
    await moveToBlock(bot, pos);

    const refreshed = bot.blockAt(pos);
    if (!refreshed || refreshed.name !== blockName) return;

    const ok = await tryDig(bot, refreshed);
    if (!ok) {
      bot.chat(`Failed to dig '${blockName}' here. Trying another...`);
      await sleep(500);
    } else {
      await sleep(150);
    }
  } catch (err) {
    bot.emit('companion:log', `[DIG] Tick failed: ${err.message}`);
    await sleep(300);
  } finally {
    job._busy = false;
  }
}

module.exports = { start, stop, tick };
