'use strict';

function dist(a, b) {
  if (!a || !b) return Infinity;
  return a.distanceTo(b);
}

module.exports = { dist };
