'use strict';

const States = require('../core/states');
const { dist } = require('../utils');

const FORBIDDEN_ENTITIES = new Set([
  'item', 'experience_orb', 'xp_orb', 'armor_stand', 'marker', 'interaction',
  'area_effect_cloud', 'falling_block', 'leash_knot', 'painting',
  'item_frame', 'glow_item_frame', 'end_crystal', 'arrow', 'spectral_arrow',
  'trident', 'egg', 'snowball', 'ender_pearl', 'fireball', 'small_fireball',
  'wither_skull', 'dragon_fireball', 'fishing_bobber', 'boat', 'minecart',
  'chest_minecart', 'furnace_minecart', 'tnt_minecart', 'hopper_minecart',
  'spawner_minecart', 'command_block_minecart'
]);

const ARMOR_SLOTS = { head: 5, torso: 6, legs: 7, feet: 8 };

function getEnchantments(item) {
  try {
    const ench = item?.nbt?.value?.Enchantments?.value?.value;
    if (!Array.isArray(ench)) return [];
    return ench
      .map(e => ({ id: e?.id?.value, lvl: Number(e?.lvl?.value ?? 0) }))
      .filter(x => x.id && Number.isFinite(x.lvl));
  } catch {
    return [];
  }
}

function armorEnchBonus(item) {
  let s = 0;
  for (const { id, lvl } of getEnchantments(item)) {
    const k = String(id);
    if (k.includes('protection')) s += 2 * lvl;
    else if (k.includes('blast_protection') || k.includes('fire_protection') || k.includes('projectile_protection')) s += lvl;
    else if (k.includes('thorns') || k.includes('unbreaking')) s += 0.5 * lvl;
    else if (k.includes('mending')) s += 2;
  }
  return s;
}

function swordEnchBonus(item) {
  let s = 0;
  for (const { id, lvl } of getEnchantments(item)) {
    const k = String(id);
    if (k.includes('sharpness')) s += 2 * lvl;
    else if (k.includes('smite')) s += lvl;
    else if (k.includes('fire_aspect') || k.includes('sweeping')) s += lvl;
    else if (k.includes('knockback') || k.includes('unbreaking') || k.includes('bane_of_arthropods')) s += 0.5 * lvl;
    else if (k.includes('mending')) s += 2;
  }
  return s;
}

function materialScore(name) {
  if (!name) return 0;
  if (name.startsWith('netherite_')) return 600;
  if (name.startsWith('diamond_')) return 500;
  if (name.startsWith('iron_')) return 400;
  if (name.startsWith('chainmail_')) return 300;
  if (name.startsWith('golden_')) return 250;
  if (name.startsWith('leather_')) return 200;
  if (name === 'turtle_helmet') return 380;
  return 0;
}

function armorSlotForItem(name) {
  if (!name) return null;
  if (name === 'turtle_helmet' || name.endsWith('_helmet')) return 'head';
  if (name.endsWith('_chestplate') || name === 'elytra') return 'torso';
  if (name.endsWith('_leggings')) return 'legs';
  if (name.endsWith('_boots')) return 'feet';
  return null;
}

function isSword(name) {
  return typeof name === 'string' && name.endsWith('_sword');
}

function scoreArmor(item) {
  let s = materialScore(item?.name);
  if (item?.name === 'elytra') s -= 1000;
  return s + armorEnchBonus(item);
}

function scoreSword(item) {
  return materialScore(item?.name) + swordEnchBonus(item);
}

function getEquippedArmor(bot, dest) {
  const idx = ARMOR_SLOTS[dest];
  return typeof idx === 'number' ? (bot.inventory?.slots?.[idx] || null) : null;
}

function isValidTarget(entity, controller) {
  if (!entity?.isValid || !entity.position) return false;
  if (entity === controller.bot.entity) return false;
  if (entity.type === 'player' && entity.username === controller.owner) return false;
  if (FORBIDDEN_ENTITIES.has(entity.name)) return false;
  if (entity.health !== undefined && entity.health <= 0) return false;
  return entity.type === 'mob' || entity.type === 'player' || entity.type === 'hostile' || entity.type === 'animal';
}

async function ensureCombatLoadout(controller) {
  const bot = controller.bot;
  const now = Date.now();
  controller._combatGearAt = controller._combatGearAt || 0;
  if (now - controller._combatGearAt < 1200) return;
  controller._combatGearAt = now;

  const inv = bot.inventory.items();

  const swords = inv.filter(it => isSword(it.name));
  if (swords.length > 0) {
    swords.sort((a, b) => scoreSword(b) - scoreSword(a));
    const best = swords[0];
    const held = bot.heldItem;
    if (!held || held.name !== best.name || scoreSword(best) > (isSword(held.name) ? scoreSword(held) : -Infinity) + 0.01) {
      try {
        await bot.equip(best, 'hand');
        bot.emit('companion:log', `[GEAR] Equipped sword: ${best.name}`);
      } catch (e) {
        bot.emit('companion:log', `[GEAR] Failed to equip sword: ${e?.message || e}`);
      }
    }
  }

  const bySlot = { head: [], torso: [], legs: [], feet: [] };
  for (const it of inv) {
    const slot = armorSlotForItem(it.name);
    if (slot) bySlot[slot].push(it);
  }

  for (const dest of ['head', 'torso', 'legs', 'feet']) {
    const list = bySlot[dest];
    if (!list.length) continue;
    list.sort((a, b) => scoreArmor(b) - scoreArmor(a));
    const best = list[0];
    const equipped = getEquippedArmor(bot, dest);
    if (!equipped || best.name !== equipped.name || scoreArmor(best) > scoreArmor(equipped) + 0.01) {
      try {
        await bot.equip(best, dest);
        bot.emit('companion:log', `[GEAR] Equipped ${dest}: ${best.name}`);
      } catch (e) {
        bot.emit('companion:log', `[GEAR] Failed to equip ${dest}: ${e?.message || e}`);
      }
    }
  }

  const totems = inv.filter(it => it.name === 'totem_of_undying');
  if (totems.length > 0 && bot.inventory.slots[45]?.name !== 'totem_of_undying') {
    try {
      await bot.equip(totems[0], 'off-hand');
      bot.emit('companion:log', '[GEAR] Equipped totem in offhand');
    } catch (e) {
      bot.emit('companion:log', `[GEAR] Failed to equip totem: ${e?.message || e}`);
    }
  }
}

function startCombat(controller, target, reason = '') {
  if (!isValidTarget(target, controller)) {
    controller.bot.emit('companion:log', `[COMBAT] Rejected invalid target (${target?.name || 'null'})`);
    return;
  }
  if (controller.sm?.state === States.COMBAT && controller.combatTarget === target) return;

  controller.bot.emit('companion:log', `[COMBAT] Starting combat vs ${target.name || target.username} (${reason})`);
  controller.combatTarget = target;
  controller.sm.setState(States.COMBAT, reason);
}

function findNearestAttacker(controller, victim) {
  if (!victim?.position) return null;
  let best = null;
  let bestDist = Infinity;
  for (const id in controller.bot.entities) {
    const e = controller.bot.entities[id];
    if (!isValidTarget(e, controller)) continue;
    const d = dist(victim.position, e.position);
    if (d <= 8 && d < bestDist) { best = e; bestDist = d; }
  }
  return best;
}

async function combatTick(controller) {
  const bot = controller.bot;
  const owner = controller.getOwnerEntity();

  if (!owner) {
    controller.sm.setState(States.IDLE, 'no owner');
    controller.combatTarget = null;
    try { bot.pvp.stop(); } catch {}
    return;
  }

  const target = controller.combatTarget;
  if (!isValidTarget(target, controller)) {
    try { bot.pvp.stop(); } catch {}
    controller.combatTarget = null;
    controller.sm.setState(States.FOLLOW, 'target invalid');
    return;
  }

  if (dist(owner.position, target.position) > 30) {
    try { bot.pvp.stop(); } catch {}
    controller.combatTarget = null;
    controller.sm.setState(States.FOLLOW, 'target too far');
    return;
  }

  await ensureCombatLoadout(controller);

  if (bot.pvp.target !== target) {
    try {
      bot.pvp.attack(target);
    } catch (err) {
      bot.emit('companion:log', `[COMBAT] PvP attack failed: ${err.message}`);
      controller.combatTarget = null;
      controller.sm.setState(States.FOLLOW, 'pvp error');
    }
  }
}

function startAttackByName(controller, name) {
  const bot = controller.bot;
  let target = null;
  for (const id in bot.entities) {
    const e = bot.entities[id];
    if (!e?.isValid) continue;
    if ((e.type === 'player' && e.username === name) || e.name === name) { target = e; break; }
  }
  if (!target) {
    bot.chat(`Can't find entity '${name}' nearby.`);
    return;
  }
  startCombat(controller, target, 'manual attack');
  bot.chat(`Attacking ${name}.`);
}

function install(controller) {
  const bot = controller.bot;
  controller._hurtAt = 0;

  bot.on('entityHurt', (entity) => {
    if (!controller.owner) return;
    const owner = controller.getOwnerEntity();
    if (!owner) return;

    const now = Date.now();
    if (now - controller._hurtAt < 200) return;
    controller._hurtAt = now;

    if (entity === owner || entity === bot.entity) {
      const attacker = findNearestAttacker(controller, entity);
      if (attacker) startCombat(controller, attacker, entity === owner ? 'owner hurt' : 'bot hurt');
      return;
    }

    if (dist(owner.position, entity.position) < 5 && isValidTarget(entity, controller)) {
      startCombat(controller, entity, 'owner attacking');
    }
  });

  bot.on('entitySwingArm', (entity) => {
    if (!controller.owner || entity.username !== controller.owner) return;
    for (const id in bot.entities) {
      const target = bot.entities[id];
      if (!isValidTarget(target, controller)) continue;
      if (dist(entity.position, target.position) < 4) { startCombat(controller, target, 'owner swing arm'); break; }
    }
  });

  bot.on('entityEffect', (entity, effect) => {
    if (entity !== bot.entity || effect.id !== 28) return;
    bot.emit('companion:log', '[GEAR] Totem used! Replacing...');
    setTimeout(async () => {
      const totems = bot.inventory.items().filter(it => it.name === 'totem_of_undying');
      if (totems.length > 0) {
        try {
          await bot.equip(totems[0], 'off-hand');
          bot.emit('companion:log', '[GEAR] Totem replaced');
        } catch (e) {
          bot.emit('companion:log', `[GEAR] Failed to replace totem: ${e?.message || e}`);
        }
      } else {
        bot.emit('companion:log', '[GEAR] No more totems in inventory!');
      }
    }, 500);
  });
}

module.exports = { install, combatTick, startAttackByName, startCombat };
