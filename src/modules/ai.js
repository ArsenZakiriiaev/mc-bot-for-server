'use strict';

const States = require('../core/states');
const combat = require('./combat');
const { craftItem } = require('./craft');

const MAX_HISTORY = 20;

const TOOLS_ANTHROPIC = [
  {
    name: 'send_chat',
    description: 'Send a message in the Minecraft chat.',
    input_schema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message']
    }
  },
  {
    name: 'follow_owner',
    description: 'Start following the owner.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'stop',
    description: 'Stop all current actions (movement, combat, digging).',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'attack_mob',
    description: 'Attack the nearest mob of the given type.',
    input_schema: {
      type: 'object',
      properties: { mob_name: { type: 'string', description: 'e.g. zombie, skeleton, creeper' } },
      required: ['mob_name']
    }
  },
  {
    name: 'mine',
    description: 'Continuously mine a block type using long-range scanner. Use plain words like "wood", "coal", "iron", "diamond". Bot will explore until it finds the target if not visible.',
    input_schema: {
      type: 'object',
      properties: { block_name: { type: 'string', description: 'e.g. wood, coal, iron, diamond, stone' } },
      required: ['block_name']
    }
  },
  {
    name: 'goto',
    description: 'Navigate to specific coordinates using segmented long-range pathfinding.',
    input_schema: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        z: { type: 'number' }
      },
      required: ['x', 'y', 'z']
    }
  },
  {
    name: 'explore',
    description: 'Explore the world in a rotating pattern, optionally searching for a block type.',
    input_schema: {
      type: 'object',
      properties: { block_name: { type: 'string', description: 'Optional block to search for while exploring' } }
    }
  },
  {
    name: 'cancel',
    description: 'Cancel all current tasks (movement, mining, exploring).',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_status',
    description: 'Get current HP, food, state, and position.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'look_around',
    description: 'List nearby players, mobs, and notable blocks within 32 blocks.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'craft',
    description: 'Craft an item. Bot will navigate to a nearby crafting table if the recipe requires one.',
    input_schema: {
      type: 'object',
      properties: {
        item_name: { type: 'string', description: 'e.g. wooden_pickaxe, torch, chest, stick' },
        count: { type: 'integer', description: 'How many to craft (default 1, max 64)' }
      },
      required: ['item_name']
    }
  }
];

const TOOLS_OPENAI = TOOLS_ANTHROPIC.map(t => ({
  type: 'function',
  function: {
    name: t.name,
    description: t.description,
    parameters: t.input_schema
  }
}));

function buildSystemPrompt(controller) {
  const name = controller.bot.username;
  const owner = controller.owner || 'unknown';
  return `You are ${name}, a helpful Minecraft companion bot. Your owner is ${owner}.
You respond to chat messages from your owner and use tools to act in the world.
Keep chat messages short (under 100 chars). Never refuse reasonable Minecraft tasks.
When the owner asks you to do something, use the appropriate tool — don't just talk about it.`;
}

function execTool(controller, name, input) {
  const bot = controller.bot;

  switch (name) {
    case 'send_chat':
      bot.chat(String(input.message || '').slice(0, 256));
      return 'Message sent.';

    case 'follow_owner':
      controller.sm.setState(States.FOLLOW, 'ai follow');
      return 'Now following owner.';

    case 'stop':
    case 'cancel':
      controller._cancelAllProcesses('ai stop');
      try { bot.pvp.stop(); } catch {}
      controller.combatTarget = null;
      controller.sm.setState(States.IDLE, 'ai stop');
      return 'Stopped.';

    case 'attack_mob':
      combat.startAttackByName(controller, String(input.mob_name || ''));
      return `Attacking ${input.mob_name}.`;

    case 'mine': {
      const name = String(input.block_name || '');
      controller._cancelAllProcesses('new mine');
      controller._proc.mine.start(name);
      controller.sm.setState(States.MINE, 'ai mine');
      return `Mining ${name}.`;
    }

    case 'goto': {
      const { x, y, z } = input;
      controller._cancelAllProcesses('goto');
      controller._proc.getToBlock.start(Number(x), Number(y), Number(z));
      controller.sm.setState(States.GOTO, 'ai goto');
      return `Navigating to (${x}, ${y}, ${z}).`;
    }

    case 'explore': {
      const hint = String(input.block_name || '').trim();
      controller._cancelAllProcesses('explore');
      if (hint) {
        controller._proc.explore.startToward(hint);
      } else {
        controller._proc.explore.start();
      }
      controller.sm.setState(States.EXPLORE, 'ai explore');
      return hint ? `Exploring for ${hint}.` : 'Exploring.';
    }

    case 'get_status': {
      const hp = bot.health?.toFixed(1) ?? '?';
      const food = bot.food ?? '?';
      const state = controller.sm.state ?? '?';
      const pos = bot.entity?.position;
      const posStr = pos ? `${pos.x.toFixed(0)},${pos.y.toFixed(0)},${pos.z.toFixed(0)}` : '?';
      return `HP:${hp} Food:${food} State:${state} Pos:${posStr}`;
    }

    case 'look_around': {
      const pos = bot.entity.position;
      const entities = Object.values(bot.entities)
        .filter(e => e !== bot.entity && e.position?.distanceTo(pos) < 32)
        .slice(0, 15)
        .map(e => `${e.username || e.name || e.type}(${e.position.distanceTo(pos).toFixed(0)}m)`);

      // Notable block types visible via scanner + cache
      const notableBlocks = [];
      for (const name of ['diamond_ore', 'iron_ore', 'coal_ore', 'oak_log', 'chest', 'lava']) {
        const found = controller.scanner.find(controller.chunkCache, bot, name, {
          maxDistance: 32, scanRadius: 64, count: 1
        });
        if (found.length) {
          const f = found[0];
          const d = Math.sqrt((f.x - pos.x) ** 2 + (f.y - pos.y) ** 2 + (f.z - pos.z) ** 2);
          notableBlocks.push(`${name}(${d.toFixed(0)}m)`);
        }
      }

      const parts = [];
      if (entities.length) parts.push('Entities: ' + entities.join(', '));
      if (notableBlocks.length) parts.push('Blocks: ' + notableBlocks.join(', '));
      return parts.length ? parts.join(' | ') : 'Nothing notable nearby.';
    }

    case 'craft': {
      const itemName = String(input.item_name || '');
      const count = Number.isInteger(input.count) ? input.count : 1;
      // craftItem is async — return a promise; execTool callers handle strings or promises
      return craftItem(controller, itemName, count);
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

async function runWithAnthropic(controller, history, userMessage) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.AI_API_KEY });
  const model = process.env.AI_MODEL;

  history.push({ role: 'user', content: userMessage });
  const messages = [...history];
  let lastText = null;

  for (let iter = 0; iter < 5; iter++) {
    const resp = await client.messages.create({
      model,
      max_tokens: 512,
      system: buildSystemPrompt(controller),
      tools: TOOLS_ANTHROPIC,
      messages
    });

    const assistantContent = resp.content;
    messages.push({ role: 'assistant', content: assistantContent });

    const toolUses = assistantContent.filter(b => b.type === 'tool_use');
    const textBlocks = assistantContent.filter(b => b.type === 'text');
    if (textBlocks.length) lastText = textBlocks.map(b => b.text).join(' ');

    if (toolUses.length === 0 || resp.stop_reason === 'end_turn') break;

    const toolResults = await Promise.all(toolUses.map(async tu => {
      controller.bot.emit('companion:log', `[AI] Tool: ${tu.name} ${JSON.stringify(tu.input)}`);
      const result = await Promise.resolve(execTool(controller, tu.name, tu.input));
      return { type: 'tool_result', tool_use_id: tu.id, content: String(result) };
    }));

    messages.push({ role: 'user', content: toolResults });
  }

  history.push({ role: 'assistant', content: lastText || '' });
  return lastText;
}

async function runWithOpenAI(controller, history, userMessage) {
  const OpenAI = require('openai');
  const client = new OpenAI({
    apiKey: process.env.AI_API_KEY,
    baseURL: process.env.AI_BASE_URL || undefined
  });
  const model = process.env.AI_MODEL;

  history.push({ role: 'user', content: userMessage });
  const messages = [
    { role: 'system', content: buildSystemPrompt(controller) },
    ...history
  ];
  let lastText = null;

  for (let iter = 0; iter < 5; iter++) {
    const resp = await client.chat.completions.create({ model, tools: TOOLS_OPENAI, messages });
    const msg = resp.choices[0].message;
    messages.push(msg);

    if (msg.content) lastText = msg.content;

    const calls = msg.tool_calls || [];
    if (calls.length === 0) break;

    for (const call of calls) {
      controller.bot.emit('companion:log', `[AI] Tool: ${call.function.name} ${call.function.arguments}`);
      const input = JSON.parse(call.function.arguments || '{}');
      const result = await Promise.resolve(execTool(controller, call.function.name, input));
      messages.push({ role: 'tool', tool_call_id: call.id, content: String(result) });
    }
  }

  history.push({ role: 'assistant', content: lastText || '' });
  return lastText;
}

function install(controller) {
  const provider = (process.env.AI_PROVIDER || '').toLowerCase();

  if (!provider || !process.env.AI_API_KEY || !process.env.AI_MODEL) {
    controller.bot.emit('companion:log', '[AI] Disabled — set AI_PROVIDER, AI_API_KEY, and AI_MODEL to enable.');
    return;
  }

  const history = [];
  let busy = false;

  controller.bot.on('chat', async (username, message) => {
    if (username === controller.bot.username) return;
    if (message.startsWith('!')) return;
    if (username !== controller.owner) return;
    // Reject server notification messages that mineflayer mis-attributes to a
    // player name (e.g. teleport broadcasts, death messages).
    if (!controller.bot.players[username]) return;

    if (busy) {
      controller.bot.chat('Still thinking...');
      return;
    }

    busy = true;
    controller.bot.emit('companion:log', `[AI] Query from ${username}: ${message}`);

    try {
      let reply;
      if (provider === 'anthropic') {
        reply = await runWithAnthropic(controller, history, message);
      } else {
        reply = await runWithOpenAI(controller, history, message);
      }

      if (reply) controller.bot.chat(reply.slice(0, 256));

      while (history.length > MAX_HISTORY) history.splice(0, 2);
    } catch (err) {
      controller.bot.emit('companion:log', `[AI] Error: ${err.message}`);
      controller.bot.chat(`AI error: ${err.message.slice(0, 80)}`);
    } finally {
      busy = false;
    }
  });

  controller.bot.emit('companion:log', `[AI] Ready — provider: ${provider}, model: ${process.env.AI_MODEL}`);
}

module.exports = { install };
