'use strict';

const { goals: Goals } = require('mineflayer-pathfinder');
const { dist } = require('../utils');

async function idleTick(controller) {
  const owner = controller.getOwnerEntity();
  if (!owner) return;

  if (dist(controller.bot.entity.position, owner.position) < 6) {
    try {
      controller.bot.lookAt(owner.position.offset(0, 1.6, 0), true);
    } catch {}
  }
}

async function followTick(controller) {
  const bot = controller.bot;
  const owner = controller.getOwnerEntity();

  if (!owner) {
    bot.emit('companion:log', '[FOLLOW] Owner not found!');
    return;
  }

  const d = dist(bot.entity.position, owner.position);

  if (d > 4.0) {
    const currentGoal = bot.pathfinder.goal;
    if (!currentGoal || currentGoal.entity !== owner) {
      bot.pathfinder.setGoal(new Goals.GoalFollow(owner, 2), true);
    }
  } else {
    if (bot.pathfinder.goal) {
      bot.pathfinder.setGoal(null);
    }
    try {
      bot.lookAt(owner.position.offset(0, 1.6, 0), true);
    } catch {}
  }
}

function install() {}

module.exports = { idleTick, followTick, install };
