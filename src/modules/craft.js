'use strict';

const { goals: Goals } = require('mineflayer-pathfinder');

const ITEM_ALIASES = {
  stick: 'stick', sticks: 'stick',
  planks: 'oak_planks', wood_planks: 'oak_planks',
  oak_planks: 'oak_planks', spruce_planks: 'spruce_planks',
  birch_planks: 'birch_planks',
  torch: 'torch', torches: 'torch',
  chest: 'chest',
  crafting_table: 'crafting_table', workbench: 'crafting_table',
  furnace: 'furnace',
  wooden_pickaxe: 'wooden_pickaxe', wood_pickaxe: 'wooden_pickaxe',
  stone_pickaxe: 'stone_pickaxe',
  iron_pickaxe: 'iron_pickaxe',
  diamond_pickaxe: 'diamond_pickaxe',
  wooden_sword: 'wooden_sword', wood_sword: 'wooden_sword',
  stone_sword: 'stone_sword',
  iron_sword: 'iron_sword',
  diamond_sword: 'diamond_sword',
  wooden_axe: 'wooden_axe', wood_axe: 'wooden_axe',
  stone_axe: 'stone_axe',
  iron_axe: 'iron_axe',
  diamond_axe: 'diamond_axe',
  wooden_shovel: 'wooden_shovel',
  stone_shovel: 'stone_shovel',
  iron_shovel: 'iron_shovel',
  diamond_shovel: 'diamond_shovel',
  bowl: 'bowl',
  ladder: 'ladder',
  sign: 'oak_sign',
  boat: 'oak_boat',
};

function resolveItem(name) {
  const n = name.trim().toLowerCase().replace(/\s+/g, '_');
  return ITEM_ALIASES[n] || n;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Craft `count` of `itemName`. Returns a status string.
 * Navigates to a crafting table if one is needed and nearby.
 */
async function craftItem(controller, itemName, count = 1) {
  const { bot, pathing } = controller;
  const resolvedName = resolveItem(itemName);

  const itemEntry = bot.registry.itemsByName[resolvedName];
  if (!itemEntry) {
    return `Unknown item: ${resolvedName}`;
  }

  const itemId = itemEntry.id;
  count = Math.max(1, Math.min(count, 64));

  // Try without crafting table first (2x2 recipes)
  const handRecipes = bot.recipesFor(itemId, null, 1, null);
  const tableRecipes = bot.recipesFor(itemId, null, 1, true);

  if (!handRecipes.length && !tableRecipes.length) {
    return `No recipe found for ${resolvedName}.`;
  }

  // Check if we can craft in hand
  if (handRecipes.length) {
    try {
      await bot.craft(handRecipes[0], count, null);
      bot.emit('companion:log', `[CRAFT] Crafted ${count}x ${resolvedName} (hand)`);
      return `Crafted ${count}x ${resolvedName}.`;
    } catch (err) {
      if (!tableRecipes.length) {
        return `Can't craft ${resolvedName}: ${err.message}`;
      }
      // Fall through to try with crafting table
    }
  }

  if (!tableRecipes.length) {
    return `Can't craft ${resolvedName} without a crafting table.`;
  }

  // Find crafting table
  const tableBlock = bot.findBlock({
    matching: bot.registry.blocksByName['crafting_table']?.id,
    maxDistance: 32,
  });

  if (!tableBlock) {
    return `No crafting table nearby. Place one within 32 blocks first.`;
  }

  // Navigate to crafting table
  const goal = new Goals.GoalGetToBlock(tableBlock.position.x, tableBlock.position.y, tableBlock.position.z);
  pathing.setGoal(goal);

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (goal.isEnd(bot.entity.position.floored())) break;
    await sleep(200);
  }

  pathing.clearGoal();

  if (!goal.isEnd(bot.entity.position.floored())) {
    return `Couldn't reach crafting table in time.`;
  }

  // Verify table is still there
  const freshTable = bot.blockAt(tableBlock.position);
  if (!freshTable || freshTable.name !== 'crafting_table') {
    return `Crafting table disappeared.`;
  }

  try {
    await bot.craft(tableRecipes[0], count, freshTable);
    bot.emit('companion:log', `[CRAFT] Crafted ${count}x ${resolvedName} (table)`);
    return `Crafted ${count}x ${resolvedName}.`;
  } catch (err) {
    bot.emit('companion:log', `[CRAFT] Failed: ${err.message}`);
    return `Craft failed: ${err.message}`;
  }
}

module.exports = { craftItem, resolveItem };
