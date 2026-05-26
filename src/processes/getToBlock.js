'use strict';

const { goals: Goals } = require('mineflayer-pathfinder');
const Process = require('./_base');

class GetToBlockProcess extends Process {
  constructor(controller) {
    super(controller);
    this._active  = false;
    this._goal    = null;
    this._running = false;
  }

  get name()     { return 'getToBlock'; }
  get priority() { return 25; }
  isActive()     { return this._active; }

  start(x, y, z) {
    this._goal   = new Goals.GoalNear(x, y, z, 2);
    this._active = true;
    this._running = false;
    this.controller.bot.emit('companion:log',
      `[GOTO] Navigating to (${x}, ${y}, ${z})`);
  }

  cancel(reason = '') {
    this._active  = false;
    this._running = false;
    this._goal    = null;
    this.controller.pathing._cancelGoto?.();
    this.controller.pathing.clearGoal();
    this.controller.bot.emit('companion:log', `[GOTO] Cancelled (${reason})`);
  }

  async tick() {
    if (this._running || !this._goal) return;
    this._running = true;

    try {
      await this.controller.pathing.goto(this._goal);
      this.controller.bot.chat('Arrived.');
      this.controller.bot.emit('companion:log', '[GOTO] Reached destination');
    } catch (err) {
      this.controller.bot.emit('companion:log', `[GOTO] Error: ${err.message}`);
      this.controller.bot.chat('Could not reach destination.');
    } finally {
      this._active  = false;
      this._running = false;
      this._goal    = null;
    }
  }
}

module.exports = GetToBlockProcess;
