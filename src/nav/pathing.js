'use strict';

const { goals: Goals } = require('mineflayer-pathfinder');

const SEGMENT_MAX_MS = 30_000;     // hard cap per segment before giving up
const LOOKAHEAD_DIST = 20;         // blocks from segment end → start pre-planning

class Pathing {
  constructor(bot, cfg) {
    this.bot = bot;
    this.cfg = cfg;
    this._movements = null;
    this._lastPos = null;
    this._lastMovedAt = Date.now();
    this._failures = 0;
    this._goal = null;

    // Segmented-goto state
    this._gotoActive = false;
    this._gotoGoal = null;
  }

  setMovements(movements) {
    this._movements = movements;
  }

  // ── Simple goal (Phase 1) ────────────────────────────────────────────────

  setGoal(goal, options = {}) {
    if (this._goal === goal) return;
    this._cancelGoto();
    this._goal = goal;
    this._failures = 0;
    this._lastMovedAt = Date.now();
    this.bot.pathfinder.setGoal(goal, options.dynamic === true);
  }

  clearGoal() {
    this._cancelGoto();
    this._goal = null;
    this._failures = 0;
    this.bot.pathfinder.setGoal(null);
  }

  // ── Segmented long-distance navigation (Phase 2) ─────────────────────────

  /**
   * Navigate to `goal` using short A* segments spliced together.
   * Returns a promise that resolves when the goal is reached or gives up.
   */
  async goto(goal) {
    this._cancelGoto();
    this._gotoActive = true;
    this._gotoGoal = goal;
    this._failures = 0;

    this.bot.emit('companion:log', '[NAV] Starting segmented goto');

    while (this._gotoActive) {
      const pos = this.bot.entity.position;
      if (goal.isEnd(pos.floored())) break;

      const result = this._planSegment(goal);

      if (result.status === 'noPath') {
        this.bot.emit('companion:log', '[NAV] No path found to goal');
        break;
      }

      if (!result.path || result.path.length === 0) {
        this.bot.emit('companion:log', `[NAV] Empty path (${result.status}), giving up`);
        break;
      }

      const reached = await this._executeSegment(result.path, goal);
      if (!reached && this._gotoActive) {
        this._failures++;
        if (this._failures > this.cfg.replanMaxAttempts) {
          this.bot.emit('companion:log', '[NAV] Too many segment failures, giving up');
          break;
        }
        this.bot.emit('companion:log', `[NAV] Segment failed, replanning (${this._failures})`);
        await new Promise(r => setTimeout(r, 300));
      }
    }

    this.bot.pathfinder.setGoal(null);
    this._gotoActive = false;
    this._gotoGoal = null;
    this._goal = null;
  }

  _cancelGoto() {
    this._gotoActive = false;
    this._gotoGoal = null;
  }

  _planSegment(goal) {
    if (!this._movements) {
      // Fall back to synchronous setGoal if movements not set yet
      return { status: 'noPath', path: [] };
    }
    return this.bot.pathfinder.getPathTo(this._movements, goal, this.cfg.primaryTimeoutMs);
  }

  /**
   * Execute one path segment. Drives the pathfinder to the segment's end
   * position, pre-plans the next segment when close to the end.
   * Returns true if we should continue (segment end reached or goal reached).
   */
  async _executeSegment(path, finalGoal) {
    const endNode = path[path.length - 1];
    const endGoal = new Goals.GoalNear(endNode.x, endNode.y, endNode.z, 1);

    // Use the low-level pathfinder to actually walk this path
    this.bot.pathfinder.setGoal(endGoal, false);
    this._goal = endGoal;
    this._lastMovedAt = Date.now();

    const deadline = Date.now() + SEGMENT_MAX_MS;
    let lookaheadDone = false;
    let nextResult = null;

    while (Date.now() < deadline) {
      if (!this._gotoActive) return false;

      const pos = this.bot.entity.position;

      if (finalGoal.isEnd(pos.floored())) return true;

      const distToSegEnd = pos.distanceTo(endNode);

      // Pre-plan the next segment while still walking this one
      if (!lookaheadDone && distToSegEnd < LOOKAHEAD_DIST) {
        lookaheadDone = true;
        setImmediate(() => {
          if (this._gotoActive) nextResult = this._planSegment(finalGoal);
        });
      }

      // Segment complete
      if (endGoal.isEnd(pos.floored()) || (!this.bot.pathfinder.isMoving() && distToSegEnd < 3)) {
        this._failures = 0;
        // If we already pre-planned, splice the next segment immediately
        if (nextResult && nextResult.path?.length > 0) {
          await this._executeSegment(nextResult.path, finalGoal);
          return true;
        }
        return true;
      }

      // Stuck detection for segments
      if (Date.now() - this._lastMovedAt > this.cfg.stuckTimeoutMs) {
        this.bot.emit('companion:log', '[NAV] Stuck during segment');
        this.bot.pathfinder.setGoal(null);
        return false;
      }

      await new Promise(r => setTimeout(r, 200));
    }

    this.bot.pathfinder.setGoal(null);
    return false;
  }

  // ── Tick (stuck detection for setGoal paths) ─────────────────────────────

  tick() {
    // Skip stuck detection while a goto() is managing its own execution
    if (this._gotoActive) return;
    if (!this.bot.pathfinder?.isMoving()) return;

    const pos = this.bot.entity.position;
    if (this._lastPos && pos.distanceTo(this._lastPos) > 0.05) {
      this._lastMovedAt = Date.now();
    }
    this._lastPos = pos.clone();

    if (Date.now() - this._lastMovedAt > this.cfg.stuckTimeoutMs) {
      this._onStuck();
    }
  }

  _onStuck() {
    this._lastMovedAt = Date.now();
    this._failures++;

    if (this._failures > this.cfg.replanMaxAttempts) {
      this.bot.emit('companion:log', '[NAV] Giving up on goal after repeated stuck events');
      this.bot.pathfinder.setGoal(null);
      this._goal = null;
      return;
    }

    this.bot.emit('companion:log', `[NAV] Stuck — replanning (attempt ${this._failures})`);
    this.bot.pathfinder.setGoal(null);
    const goal = this._goal;
    setTimeout(() => {
      if (this._goal === goal) {
        this.bot.pathfinder.setGoal(goal);
      }
    }, 200);
  }
}

module.exports = Pathing;
