'use strict';

const { goals: Goals } = require('mineflayer-pathfinder');
const Process = require('./_base');
const scanner = require('../nav/cache/scanner');

const STEP_DIST = 96;          // blocks per exploration step
const STEP_TIMEOUT_MS = 25000; // max time to walk each step before picking new direction
const DIRS = [                 // 8 compass directions
  [1, 0], [1, 1], [0, 1], [-1, 1],
  [-1, 0], [-1, -1], [0, -1], [1, -1],
];

class ExploreProcess extends Process {
  constructor(controller) {
    super(controller);
    this._active    = false;
    this._hint      = null;       // block name to watch for
    this._onFound   = null;       // callback when hint appears
    this._dirIndex  = 0;
    this._stepDue   = 0;
    this._hintWatch = null;
  }

  get name()     { return 'explore'; }
  get priority() { return 10; }
  isActive()     { return this._active; }

  /** Start free exploration (no specific target). */
  start() {
    this._hint    = null;
    this._onFound = null;
    this._active  = true;
    this._stepDue = 0;
    this._stopHintWatcher();
    this.controller.bot.emit('companion:log', '[EXPLORE] Started free exploration');
  }

  /**
   * Explore toward a goal block, calling onFound() once the scanner sees it.
   * Mine process calls this when it can't find the target in loaded/cached chunks.
   */
  startToward(blockName, onFound) {
    this._hint    = blockName;
    this._onFound = onFound || null;
    this._active  = true;
    this._stepDue = 0;
    this._startHintWatcher();
    this.controller.bot.emit('companion:log', `[EXPLORE] Searching for ${blockName}`);
  }

  cancel(reason = '') {
    this._active = false;
    this._stopHintWatcher();
    this.controller.pathing.clearGoal();
    this.controller.bot.emit('companion:log', `[EXPLORE] Stopped (${reason})`);
  }

  async tick() {
    if (Date.now() < this._stepDue && this.controller.bot.pathfinder.isMoving()) return;

    const pos   = this.controller.bot.entity.position;
    const [dx, dz] = DIRS[this._dirIndex % DIRS.length];
    this._dirIndex = (this._dirIndex + 1) % DIRS.length;

    const tx = Math.round(pos.x + dx * STEP_DIST);
    const tz = Math.round(pos.z + dz * STEP_DIST);
    const goal = new Goals.GoalNear(tx, pos.y, tz, 4);

    this.controller.pathing.setGoal(goal);
    this._stepDue = Date.now() + STEP_TIMEOUT_MS;

    this.controller.bot.emit('companion:log',
      `[EXPLORE] Step toward (${tx}, ${tz})`);
  }

  _startHintWatcher() {
    this._stopHintWatcher();
    const handler = () => {
      if (!this._hint || !this._active) return;
      const found = scanner.find(
        this.controller.chunkCache,
        this.controller.bot,
        this._hint,
        { maxDistance: 192, scanRadius: 192, count: 1 }
      );
      if (!found.length) return;
      this.controller.bot.emit('companion:log',
        `[EXPLORE] Found ${this._hint} — handing back to mine`);
      this._active = false;
      this._stopHintWatcher();
      if (this._onFound) this._onFound();
    };
    this._hintWatch = handler;
    this.controller.bot.on('chunkColumnLoad', handler);
  }

  _stopHintWatcher() {
    if (this._hintWatch) {
      this.controller.bot.off('chunkColumnLoad', this._hintWatch);
      this._hintWatch = null;
    }
  }
}

module.exports = ExploreProcess;
