'use strict';

const States = require('./states');
const combat = require('../modules/combat');
const safety = require('../modules/safety');
const arbitrator = require('../processes/arbitrator');

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

    // Combat is still reactive and takes priority over all processes.
    if (this.state === States.COMBAT) return combat.combatTick(c);

    // All other behaviour goes through the process arbitrator.
    const process = arbitrator.pick(c.processes);
    if (process) await process.tick();
  }
}

module.exports = { StateMachine, States };
