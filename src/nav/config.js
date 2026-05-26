'use strict';

const e = k => process.env[`NAV_${k}`];
const bool = (k, def) => e(k) !== undefined ? e(k) !== '0' && e(k) !== 'false' : def;
const num = (k, def) => e(k) !== undefined ? Number(e(k)) : def;
const arr = (k, def) => e(k) !== undefined ? e(k).split(',').map(s => s.trim()) : def;

module.exports = {
  // A*
  costHeuristic: num('COST_HEURISTIC', 3.563),
  primaryTimeoutMs: num('PRIMARY_TIMEOUT_MS', 500),
  failureTimeoutMs: num('FAILURE_TIMEOUT_MS', 2000),
  planningTickLookahead: num('PLANNING_TICK_LOOKAHEAD', 150),
  minImprovement: num('MIN_IMPROVEMENT', 0.01),

  // Movements
  allowBreak: bool('ALLOW_BREAK', false),
  allowPlace: bool('ALLOW_PLACE', true),
  allowSprint: bool('ALLOW_SPRINT', true),
  allowParkour: bool('ALLOW_PARKOUR', false),
  allowParkourPlace: bool('ALLOW_PARKOUR_PLACE', false),
  blockReachDistance: num('BLOCK_REACH_DISTANCE', 4.5),

  // Penalties
  jumpPenalty: num('JUMP_PENALTY', 2.0),
  placeCost: num('PLACE_COST', 1.0),
  breakCostMultiplier: num('BREAK_COST_MULTIPLIER', 2.0),
  walkOnWaterPenalty: num('WALK_ON_WATER_PENALTY', 3.0),
  walkAdjacentLavaPenalty: num('WALK_ADJACENT_LAVA_PENALTY', 30.0),

  // Safety
  maxFallHeightNoWater: num('MAX_FALL_HEIGHT_NO_WATER', 3),
  maxFallHeightBucket: num('MAX_FALL_HEIGHT_BUCKET', 20),
  avoidBlocks: arr('AVOID_BLOCKS', ['cactus', 'magma_block', 'sweet_berry_bush', 'powder_snow']),
  scaffoldBlocks: arr('SCAFFOLD_BLOCKS', ['cobblestone', 'dirt', 'cobbled_deepslate', 'netherrack']),

  // Path execution
  stuckTimeoutMs: num('STUCK_TIMEOUT_MS', 1500),
  replanMaxAttempts: num('REPLAN_MAX_ATTEMPTS', 5),

  // Cache
  cacheMaxChunks: num('CACHE_MAX_CHUNKS', 1024),
  cachePersistOnExit: bool('CACHE_PERSIST_ON_EXIT', false),
};
