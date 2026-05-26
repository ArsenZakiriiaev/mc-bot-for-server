'use strict';

const States = {
  IDLE:    'IDLE',
  FOLLOW:  'FOLLOW',
  COMBAT:  'COMBAT',
  DIG:     'DIG',     // kept for backward compat; prefer MINE
  MINE:    'MINE',
  EXPLORE: 'EXPLORE',
  GOTO:    'GOTO',
};

module.exports = States;
