'use strict';

const mcDataLoader = require('minecraft-data');

const States = require('./states');
const { StateMachine } = require('./stateMachine');
const combat = require('../modules/combat');
const autoeat = require('../modules/autoeat');
const safety = require('../modules/safety');
const building = require('../modules/building');
const ai = require('../modules/ai');
const navConfig = require('../nav/config');
const navMovements = require('../nav/movements');
const Pathing = require('../nav/pathing');
const ChunkCache = require('../nav/cache/chunkCache');
const scanner = require('../nav/cache/scanner');

const FollowProcess    = require('../processes/follow');
const MineProcess      = require('../processes/mine');
const ExploreProcess   = require('../processes/explore');
const GetToBlockProcess = require('../processes/getToBlock');

const TICK_INTERVAL = 100;

class Controller {
  constructor(bot) {
    this.bot = bot;
    this.owner = null;
    this.combatTarget = null;

    const mcData = mcDataLoader(bot.version);
    const movements = navMovements.build(bot, mcData);
    bot.pathfinder.setMovements(movements);

    this.pathing = new Pathing(bot, navConfig);
    this.pathing.setMovements(movements);
    this.chunkCache = new ChunkCache(bot, navConfig.cacheMaxChunks);
    this.scanner = scanner;

    // Process instances — arbitrator picks from this list each tick
    this.processes = [
      new FollowProcess(this),
      new MineProcess(this),
      new ExploreProcess(this),
      new GetToBlockProcess(this),
    ];

    // Named shortcuts for direct access
    this._proc = {};
    for (const p of this.processes) this._proc[p.name] = p;

    this.sm = new StateMachine(this);

    combat.install(this);
    autoeat.install(this);
    safety.install(this);
    ai.install(this);

    this._setupEvents();
    this._startGameLoop();
  }

  get proc() { return this._proc; }

  _setupEvents() {
    const bot = this.bot;

    bot.on('chat', (username, message) => {
      if (message.startsWith('!')) this._handleCommand(username, message);
    });

    bot.on('kicked', (reason) => {
      bot.emit('companion:log', `[KICKED] ${reason}`);
    });

    bot.on('error', (err) => {
      bot.emit('companion:log', `[ERROR] ${err.message}`);
    });

    bot.on('entityGone', (entity) => {
      if (this.combatTarget !== entity) return;
      bot.emit('companion:log', '[COMBAT] Target disappeared');
      try { bot.pvp.stop(); } catch {}
      this.combatTarget = null;
      this._proc.follow.start();
      this.sm.setState(States.FOLLOW, 'target gone');
    });

    bot.on('entityDead', (entity) => {
      if (this.combatTarget !== entity) return;
      bot.emit('companion:log', '[COMBAT] Target died');
      try { bot.pvp.stop(); } catch {}
      this.combatTarget = null;
      this._proc.follow.start();
      this.sm.setState(States.FOLLOW, 'target dead');
    });

    let _lastPlaceUnder = 0;
    bot.on('physicsTick', async () => {
      if (!bot.pathfinder?.isMoving()) return;

      const now = Date.now();
      if (now - _lastPlaceUnder < 800) return;

      const goal = bot.pathfinder.goal;
      const pos = bot.entity.position;

      let goingUp = false;
      try {
        if (goal && typeof goal.y === 'number') {
          goingUp = goal.y > pos.y + 0.5;
        } else if (goal?.position && typeof goal.position.y === 'number') {
          goingUp = goal.position.y > pos.y + 0.5;
        }
      } catch {}

      if (!goingUp) return;

      const underPos = pos.offset(0, -1, 0).floored();
      let depth = 0;
      let probe = underPos.clone();
      for (let i = 0; i < 4; i++) {
        const b = bot.blockAt(probe);
        if (b && b.boundingBox === 'block') break;
        depth++;
        probe = probe.offset(0, -1, 0);
      }

      if (depth <= 3) return;

      _lastPlaceUnder = now;
      try {
        await building.tryPlaceUnder(bot);
      } catch (err) {
        bot.emit('companion:log', `[BUILD] Error in tryPlaceUnder: ${err.message}`);
      }
    });

    bot.on('companion:log', (msg) => {
      console.log(msg);
    });
  }

  _cancelAllProcesses(reason) {
    for (const p of this.processes) p.cancel(reason);
    this.pathing.clearGoal();
    try { this.bot.stopDigging(); } catch {}
  }

  _handleCommand(username, message) {
    const args = message.trim().split(/\s+/);
    const cmd = args[0].toLowerCase();

    if (!this.owner) this.owner = username;
    if (username !== this.owner && cmd !== '!help') return;

    switch (cmd) {
      case '!help':
        this.bot.chat('Commands: !follow, !stop, !attack <mob>, !mine <block>, !goto <x> <y> <z>, !status, !help');
        break;

      case '!follow':
        this._cancelAllProcesses('follow');
        this._proc.follow.start();
        this.sm.setState(States.FOLLOW, 'manual follow');
        this.bot.chat(`Following ${username}.`);
        break;

      case '!stop':
        this._cancelAllProcesses('manual stop');
        try { this.bot.pvp.stop(); } catch {}
        this.combatTarget = null;
        this.sm.setState(States.IDLE, 'manual stop');
        this.bot.chat('Stopped.');
        break;

      case '!attack':
        if (args.length < 2) { this.bot.chat('Usage: !attack <mob_name>'); break; }
        combat.startAttackByName(this, args[1]);
        break;

      case '!dig':
      case '!mine':
        if (args.length < 2) { this.bot.chat(`Usage: ${cmd} <block_name>`); break; }
        this._cancelAllProcesses('new mine');
        this._proc.mine.start(args[1]);
        this.sm.setState(States.MINE, 'mine start');
        break;

      case '!goto': {
        if (args.length < 4) { this.bot.chat('Usage: !goto <x> <y> <z>'); break; }
        const [x, y, z] = [+args[1], +args[2], +args[3]];
        if ([x, y, z].some(n => !Number.isFinite(n))) { this.bot.chat('Invalid coordinates.'); break; }
        this._cancelAllProcesses('goto');
        this._proc.getToBlock.start(x, y, z);
        this.sm.setState(States.GOTO, 'goto start');
        break;
      }

      case '!status': {
        const hp    = this.bot.health?.toFixed(1) ?? '?';
        const food  = this.bot.food ?? '?';
        const state = this.sm.state;
        const active = this.processes.filter(p => p.isActive()).map(p => p.name).join(',') || 'none';
        this.bot.chat(`HP:${hp} Food:${food} State:${state} Active:${active}`);
        break;
      }
    }
  }

  getOwnerEntity() {
    if (!this.owner) return null;
    return Object.values(this.bot.entities).find(
      e => e.type === 'player' && e.username === this.owner
    ) || null;
  }

  _startGameLoop() {
    this._tickRunning = false;

    setInterval(async () => {
      if (this._tickRunning) return;
      this._tickRunning = true;
      try {
        await this.sm.tick();
        this.pathing.tick();
      } catch (err) {
        this.bot.emit('companion:log', `[TICK ERROR] ${err.message}`);
      } finally {
        this._tickRunning = false;
      }
    }, TICK_INTERVAL);
  }
}

module.exports = Controller;
