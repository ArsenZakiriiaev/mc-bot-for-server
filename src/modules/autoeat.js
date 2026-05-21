'use strict';

function install(controller) {
  const bot = controller.bot;
  controller._lastEatAt = 0;

  bot.on('health', async () => {
    const now = Date.now();
    if (now - controller._lastEatAt < 2000) return;
    if (bot.food >= 16 && bot.health >= 16) return;

    controller._lastEatAt = now;

    const foods = bot.inventory.items()
      .filter(item => bot.registry.foodsByName[item.name])
      .sort((a, b) => (bot.registry.foodsByName[b.name]?.foodPoints || 0) - (bot.registry.foodsByName[a.name]?.foodPoints || 0));

    if (!foods.length) {
      bot.emit('companion:log', '[AUTOEAT] No food in inventory!');
      return;
    }

    try {
      bot.emit('companion:log', `[AUTOEAT] Eating ${foods[0].name} (food: ${bot.food}, hp: ${bot.health.toFixed(1)})`);
      await bot.equip(foods[0], 'hand');
      await bot.consume();
    } catch (err) {
      bot.emit('companion:log', `[AUTOEAT] Failed to eat: ${err.message}`);
    }
  });
}

module.exports = { install };
