'use strict';

const { Movements } = require('mineflayer-pathfinder');
const mcDataLoader = require('minecraft-data');

const States = require('./states');
const { StateMachine } = require('./stateMachine');
const combat = require('../modules/combat');
const follow = require('../modules/follow');
const autoeat = require('../modules/autoeat');
const safety = require('../modules/safety');
const dig = require('../modules/dig');
const building = require('../modules/building');
const ai = require('../modules/ai');

const SCAFFOLD_BLOCKS = [
  'dirt', 'cobblestone', 'stone', 'netherrack', 'sand', 'gravel',
  'oak_planks', 'spruce_planks', 'birch_planks', 'jungle_planks',
  'acacia_planks', 'dark_oak_planks', 'mangrove_planks', 'cherry_planks',
  'bamboo_planks'
];

const TICK_INTERVAL = 100;

class Controller {
  constructor(bot) {
    this.bot = bot;
    this.owner = null;
    this.combatTarget = null;

    const mcData = mcDataLoader(bot.version);
    const movements = new Movements(bot, mcData);
    movements.canDig = false;
    movements.canPlaceBlocks = true;
    movements.allow1by1towers = true;

    try {
      const ids = SCAFFOLD_BLOCKS
        .map(n => bot.registry.itemsByName[n]?.id)
        .filter(Boolean);
      for (const id of ids) movements.scafoldingBlocks.push(id);
    } catch {}

    bot.pathfinder.setMovements(movements);

    this.sm = new StateMachine(this);

    combat.install(this);
    follow.install(this);
    autoeat.install(this);
    safety.install(this);
    ai.install(this);

    this._setupEvents();
    this._startGameLoop();
  }

  _setupEvents() {
    const bot = this.bot;

    bot.on('chat', (username, message) => {
      if (message.startsWith('!')) {
        this._handleCommand(username, message);
      }
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
      this.sm.setState(States.FOLLOW, 'target gone');
    });

    bot.on('entityDead', (entity) => {
      if (this.combatTarget !== entity) return;
      bot.emit('companion:log', '[COMBAT] Target died');
      try { bot.pvp.stop(); } catch {}
      this.combatTarget = null;
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

  _handleCommand(username, message) {
    const args = message.trim().split(/\s+/);
    const cmd = args[0].toLowerCase();

    if (!this.owner) this.owner = username;
    if (username !== this.owner && cmd !== '!help') return;

    switch (cmd) {
      case '!help':
        this.bot.chat('Commands: !follow, !stop, !attack <mob>, !dig <block>, !status, !help');
        break;

      case '!follow':
        this.sm.setState(States.FOLLOW, 'manual follow');
        this.bot.chat(`Following ${username}.`);
        break;

      case '!stop':
        try { dig.stop(this, 'manual stop'); } catch {}
        try { this.bot.pvp.stop(); } catch {}
        this.bot.pathfinder.setGoal(null);
        this.combatTarget = null;
        this.sm.setState(States.IDLE, 'manual stop');
        this.bot.chat('Stopped.');
        break;

      case '!attack':
        if (args.length < 2) { this.bot.chat('Usage: !attack <mob_name>'); break; }
        combat.startAttackByName(this, args[1]);
        break;

      case '!dig':
        if (args.length < 2) { this.bot.chat('Usage: !dig <block_name>'); break; }
        dig.start(this, args[1]);
        break;

      case '!status': {
        const hp = this.bot.health.toFixed(1);
        const food = this.bot.food;
        const state = this.sm.state;
        this.bot.chat(`HP: ${hp}, Food: ${food}, State: ${state}`);
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
      } catch (err) {
        this.bot.emit('companion:log', `[TICK ERROR] ${err.message}`);
      } finally {
        this._tickRunning = false;
      }
    }, TICK_INTERVAL);
  }
}

module.exports = Controller;
