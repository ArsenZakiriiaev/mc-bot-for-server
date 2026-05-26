'use strict';

// Per-block classification stored as one byte per block.
const KIND = {
  AIR:   0,
  SOLID: 1,
  WATER: 2,
  LAVA:  3,
  AVOID: 4,
  LOG:   5,
  ORE:   6,
  OTHER: 7,
};

const LOG_NAMES = new Set([
  'oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log',
  'dark_oak_log', 'mangrove_log', 'cherry_log', 'bamboo_block',
  'stripped_oak_log', 'stripped_spruce_log', 'stripped_birch_log',
  'stripped_jungle_log', 'stripped_acacia_log', 'stripped_dark_oak_log',
  'stripped_mangrove_log', 'stripped_cherry_log',
]);

const ORE_SUFFIX = '_ore';
const ORE_NAMES = new Set([
  'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'emerald_ore',
  'lapis_ore', 'redstone_ore', 'copper_ore', 'nether_quartz_ore',
  'nether_gold_ore', 'ancient_debris',
  'deepslate_coal_ore', 'deepslate_iron_ore', 'deepslate_gold_ore',
  'deepslate_diamond_ore', 'deepslate_emerald_ore', 'deepslate_lapis_ore',
  'deepslate_redstone_ore', 'deepslate_copper_ore',
]);

const AVOID_NAMES = new Set([
  'cactus', 'magma_block', 'sweet_berry_bush', 'powder_snow',
]);

function classifyName(name) {
  if (!name || name === 'air' || name === 'cave_air' || name === 'void_air') return KIND.AIR;
  if (name === 'water') return KIND.WATER;
  if (name === 'lava') return KIND.LAVA;
  if (LOG_NAMES.has(name)) return KIND.LOG;
  if (ORE_NAMES.has(name) || name.endsWith(ORE_SUFFIX)) return KIND.ORE;
  if (AVOID_NAMES.has(name)) return KIND.AVOID;
  return KIND.SOLID;
}

function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

class ChunkCache {
  constructor(bot, maxChunks) {
    this.bot = bot;
    this.maxChunks = maxChunks || 1024;
    this._chunks = new Map(); // key -> Uint8Array
    this._lru = [];           // ordered keys, newest last
    this._minY = null;
    this._height = null;

    bot.on('chunkColumnLoad', (pos) => this._onChunkLoad(pos));
    bot.on('blockUpdate', (oldBlock, newBlock) => {
      if (newBlock) this._updateBlock(newBlock.position, newBlock.name);
    });
  }

  _worldDims() {
    if (this._minY !== null) return { minY: this._minY, height: this._height };
    // Prefer live game info; fall back to 1.18+ defaults
    const minY = this.bot.game?.minY ?? -64;
    const height = this.bot.game?.height ?? 384;
    this._minY = minY;
    this._height = height;
    return { minY, height };
  }

  _idx(localX, y, localZ) {
    const { minY, height } = this._worldDims();
    const ly = y - minY;
    if (ly < 0 || ly >= height) return -1;
    return (localX * 16 + localZ) * height + ly;
  }

  async _snapshot(cx, cz) {
    const key = chunkKey(cx, cz);
    const { minY, height } = this._worldDims();
    const arr = new Uint8Array(16 * 16 * height);
    const ox = cx * 16;
    const oz = cz * 16;

    // Scan in slices of 32 y-levels to avoid blocking the event loop.
    for (let ys = minY; ys < minY + height; ys += 32) {
      const yEnd = Math.min(ys + 32, minY + height);
      for (let y = ys; y < yEnd; y++) {
        for (let lx = 0; lx < 16; lx++) {
          for (let lz = 0; lz < 16; lz++) {
            const block = this.bot.blockAt({ x: ox + lx, y, z: oz + lz });
            const i = (lx * 16 + lz) * height + (y - minY);
            arr[i] = classifyName(block?.name);
          }
        }
      }
      await new Promise(r => setImmediate(r));
    }

    this._store(key, arr);
  }

  _store(key, arr) {
    if (this._chunks.has(key)) {
      this._chunks.set(key, arr);
      return;
    }
    if (this._lru.length >= this.maxChunks) {
      const evict = this._lru.shift();
      this._chunks.delete(evict);
    }
    this._chunks.set(key, arr);
    this._lru.push(key);
  }

  _onChunkLoad(pos) {
    const cx = Math.floor(pos.x / 16);
    const cz = Math.floor(pos.z / 16);
    this._snapshot(cx, cz).catch(() => {});
  }

  _updateBlock(pos, name) {
    const cx = Math.floor(pos.x / 16);
    const cz = Math.floor(pos.z / 16);
    const key = chunkKey(cx, cz);
    const arr = this._chunks.get(key);
    if (!arr) return;
    const lx = ((pos.x % 16) + 16) % 16;
    const lz = ((pos.z % 16) + 16) % 16;
    const { minY, height } = this._worldDims();
    const i = (lx * 16 + lz) * height + (pos.y - minY);
    if (i >= 0 && i < arr.length) arr[i] = classifyName(name);
  }

  classify(pos) {
    const cx = Math.floor(pos.x / 16);
    const cz = Math.floor(pos.z / 16);
    const arr = this._chunks.get(chunkKey(cx, cz));
    if (!arr) return null;
    const lx = ((pos.x % 16) + 16) % 16;
    const lz = ((pos.z % 16) + 16) % 16;
    const { minY, height } = this._worldDims();
    const i = (lx * 16 + lz) * height + (pos.y - minY);
    if (i < 0 || i >= arr.length) return null;
    return arr[i];
  }

  // Find all positions of the given kind within `radius` blocks of `near`.
  // Returns Vec3-like objects {x, y, z}.
  find(kind, near, radius) {
    const { minY, height } = this._worldDims();
    const results = [];
    const rChunk = Math.ceil(radius / 16) + 1;
    const cx0 = Math.floor(near.x / 16);
    const cz0 = Math.floor(near.z / 16);
    const r2 = radius * radius;

    for (let dcx = -rChunk; dcx <= rChunk; dcx++) {
      for (let dcz = -rChunk; dcz <= rChunk; dcz++) {
        const cx = cx0 + dcx;
        const cz = cz0 + dcz;
        const arr = this._chunks.get(chunkKey(cx, cz));
        if (!arr) continue;
        const ox = cx * 16;
        const oz = cz * 16;

        for (let lx = 0; lx < 16; lx++) {
          for (let lz = 0; lz < 16; lz++) {
            const bx = ox + lx;
            const bz = oz + lz;
            const dx = bx - near.x;
            const dz = bz - near.z;
            if (dx * dx + dz * dz > r2) continue;

            const base = (lx * 16 + lz) * height;
            for (let ly = 0; ly < height; ly++) {
              if (arr[base + ly] !== kind) continue;
              const by = minY + ly;
              const dy = by - near.y;
              if (dx * dx + dy * dy + dz * dz > r2) continue;
              results.push({ x: bx, y: by, z: bz });
            }
          }
        }
      }
    }

    // Sort by distance to near
    results.sort((a, b) => {
      const da = (a.x - near.x) ** 2 + (a.y - near.y) ** 2 + (a.z - near.z) ** 2;
      const db = (b.x - near.x) ** 2 + (b.y - near.y) ** 2 + (b.z - near.z) ** 2;
      return da - db;
    });

    return results;
  }
}

ChunkCache.KIND = KIND;
module.exports = ChunkCache;
