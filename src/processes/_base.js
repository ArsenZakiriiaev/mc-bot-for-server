'use strict';

class Process {
  constructor(controller) {
    this.controller = controller;
  }

  get name()     { throw new Error(`${this.constructor.name} must implement name`); }
  get priority() { return 0; }
  isActive()     { return false; }
  async tick()   {}
  cancel(reason) {}
}

module.exports = Process;
