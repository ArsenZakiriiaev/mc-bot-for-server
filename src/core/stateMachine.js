'use strict';

const States = require('./states');
const combat = require('../modules/combat');
const follow = require('../modules/follow');
const safety = require('../modules/safety');
const dig = require('../modules/dig');

class StateMachine {
  constructor(controller) {
    this.controller = controller;
    this.state = States.IDLE;
  }

  setState(newState, reason = '') {
    if (this.state === newState) return;
    this.controller.bot.emit('companion:log', `State ${this.state} -> ${newState} (${reason})`);
    this.state = newState;
  }

  async tick() {
    const c = this.controller;

    if (await safety.tick(c)) return;

    switch (this.state) {
      case States.COMBAT: return combat.combatTick(c);
      case States.DIG:    return dig.tick(c);
      case States.FOLLOW: return follow.followTick(c);
      default:            return follow.idleTick(c);
    }
  }
}

module.exports = { StateMachine, States };
