'use strict';

const { goals: Goals } = require('mineflayer-pathfinder');
const Process = require('./_base');
const { dist } = require('../utils');

const FOLLOW_DIST = 2;   // stop this many blocks from owner
const START_DIST  = 4;   // start pathfinding beyond this

class FollowProcess extends Process {
  constructor(controller) {
    super(controller);
    this._active = false;
  }

  get name()     { return 'follow'; }
  get priority() { return 40; }
  isActive()     { return this._active; }

  start() {
    this._active = true;
    this.controller.bot.emit('companion:log', '[FOLLOW] Started');
  }

  cancel(reason = '') {
    this._active = false;
    this.controller.pathing.clearGoal();
    this.controller.bot.emit('companion:log', `[FOLLOW] Stopped (${reason})`);
  }

  async tick() {
    const { bot, pathing } = this.controller;
    const owner = this.controller.getOwnerEntity();

    if (!owner) {
      bot.emit('companion:log', '[FOLLOW] Owner not visible');
      return;
    }

    const d = dist(bot.entity.position, owner.position);

    if (d > START_DIST) {
      pathing.setGoal(new Goals.GoalFollow(owner, FOLLOW_DIST), { dynamic: true });
    } else {
      pathing.clearGoal();
      try { bot.lookAt(owner.position.offset(0, 1.6, 0), true); } catch {}
    }
  }
}

module.exports = FollowProcess;
