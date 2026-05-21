'use strict';

const fs = require('fs');
const path = require('path');
const mineflayer = require('mineflayer');
const { pathfinder } = require('mineflayer-pathfinder');
const pvp = require('mineflayer-pvp').plugin;
const toolPlugin = require('mineflayer-tool').plugin;

const Controller = require('./core/controller');

const REGISTERED_FLAG = path.join(__dirname, '..', '.registered');

const HOST = process.env.MC_HOST || '127.0.0.1';
const PORT = parseInt(process.env.MC_PORT || '25565', 10);
const USERNAME = process.env.MC_USERNAME || 'WolfBot';
const VERSION = process.env.MC_VERSION || '1.20.1';
const OWNER = process.env.OWNER || null;

console.log(`[INIT] Connecting to ${HOST}:${PORT} as ${USERNAME} (v${VERSION})`);

const bot = mineflayer.createBot({ host: HOST, port: PORT, username: USERNAME, version: VERSION, auth: 'offline' });

bot.loadPlugin(pathfinder);
bot.loadPlugin(pvp);
bot.loadPlugin(toolPlugin);

bot.once('spawn', () => {
  console.log('[SPAWN] Bot spawned. Initializing controller...');

  const alreadyRegistered = fs.existsSync(REGISTERED_FLAG);

  setTimeout(() => {
    if (alreadyRegistered) {
      bot.chat('/login bot1234');
      console.log('[AUTH] Sent /login');
    } else {
      bot.chat('/register bot1234 bot1234');
      console.log('[AUTH] Sent /register');
      fs.writeFileSync(REGISTERED_FLAG, '1');
    }
  }, 1000);

  const controller = new Controller(bot);
  if (OWNER) {
    controller.owner = OWNER;
    console.log(`[OWNER] Set owner to: ${OWNER}`);
  }
});

bot.on('kicked', reason => console.log(`[KICKED] ${reason}`));
bot.on('error', err => console.error(`[ERROR] ${err.message}`));
bot.on('end', () => console.log('[END] Connection ended'));
