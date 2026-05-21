'use strict';

const { goals: Goals } = require('mineflayer-pathfinder');

function isDangerous(block) {
  if (!block) return false;
  return block.name.includes('lava') || block.name.includes('fire') || block.name.includes('campfire');
}

async function tick(controller) {
  const bot = controller.bot;
  const pos = bot.entity.position;

  const offsets = [[0,-1,0],[0,0,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]];
  for (const [dx, dy, dz] of offsets) {
    if (!isDangerous(bot.blockAt(pos.offset(dx, dy, dz)))) continue;

    bot.emit('companion:log', '[SAFETY] Lava/fire detected! Escaping!');
    try { bot.pvp.stop(); } catch {}
    bot.pathfinder.setGoal(new Goals.GoalNear(pos.x + 5, pos.y, pos.z + 5, 1), false);
    return true;
  }

  return false;
}

function install() {}

module.exports = { tick, install };
